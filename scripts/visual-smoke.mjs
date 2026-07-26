#!/usr/bin/env node

import { writeFile } from "node:fs/promises";

const debuggingUrl = process.env.CHROME_DEBUG_URL ?? "http://127.0.0.1:9222";
const appUrl = process.env.APP_URL ?? "http://localhost:3000";

const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
const targets = await fetch(`${debuggingUrl}/json/list`).then((response) => response.json());
const target = targets.find((entry) => entry.type === "page");

if (!target?.webSocketDebuggerUrl) {
  throw new Error("No debuggable Chrome page was found.");
}

const socket = new WebSocket(target.webSocketDebuggerUrl);
const pending = new Map();
const eventWaiters = new Map();
const browserErrors = [];
let requestId = 0;

socket.addEventListener("message", (message) => {
  const payload = JSON.parse(message.data);

  if (payload.id) {
    const request = pending.get(payload.id);
    if (!request) return;
    pending.delete(payload.id);
    if (payload.error) request.reject(new Error(payload.error.message));
    else request.resolve(payload.result);
    return;
  }

  if (payload.method === "Runtime.exceptionThrown") {
    browserErrors.push(payload.params.exceptionDetails.text);
  }

  const waiters = eventWaiters.get(payload.method);
  if (waiters?.length) {
    eventWaiters.delete(payload.method);
    for (const resolve of waiters) resolve(payload.params);
  }
});

await new Promise((resolve, reject) => {
  socket.addEventListener("open", resolve, { once: true });
  socket.addEventListener("error", reject, { once: true });
});

function send(method, params = {}) {
  const id = ++requestId;
  socket.send(JSON.stringify({ id, method, params }));
  return new Promise((resolve, reject) => pending.set(id, { resolve, reject }));
}

function once(method) {
  return new Promise((resolve) => {
    const waiters = eventWaiters.get(method) ?? [];
    waiters.push(resolve);
    eventWaiters.set(method, waiters);
  });
}

async function evaluate(expression) {
  const result = await send("Runtime.evaluate", {
    expression,
    awaitPromise: true,
    returnByValue: true,
  });
  if (result.exceptionDetails) {
    throw new Error(result.exceptionDetails.exception?.description ?? result.exceptionDetails.text);
  }
  return result.result.value;
}

async function navigate(url) {
  const loaded = once("Page.loadEventFired");
  await send("Page.navigate", { url });
  await loaded;
  await evaluate("document.fonts.ready.then(() => true)");
  await delay(1_000);
}

async function screenshot(path) {
  const result = await send("Page.captureScreenshot", {
    format: "png",
    fromSurface: true,
    captureBeyondViewport: false,
  });
  await writeFile(path, Buffer.from(result.data, "base64"));
}

async function waitFor(expression, timeout = 30_000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeout) {
    if (await evaluate(expression)) return;
    await delay(200);
  }
  throw new Error(`Timed out waiting for: ${expression}`);
}

await send("Page.enable");
await send("Runtime.enable");
await send("Emulation.setDeviceMetricsOverride", {
  width: 1440,
  height: 1000,
  deviceScaleFactor: 1,
  mobile: false,
});

await navigate(appUrl);
await evaluate("localStorage.clear(); true");
await navigate(appUrl);
await evaluate(`(() => {
  document.querySelector('[data-arcade-mode="mixed"]')?.click();
  document.querySelector('[data-skill-level="open"]')?.click();
  return true;
})()`);
await delay(350);
await screenshot("/tmp/queue-arcade-lobby.png");

const lobby = await evaluate(`({
  title: document.title,
  heading: document.querySelector("h1")?.innerText,
  font: getComputedStyle(document.body).fontFamily,
  startButton: Boolean(document.querySelector('[data-testid="start-arcade"]')),
  arcadeModes: document.querySelectorAll("[data-arcade-mode]").length,
  skillLevels: document.querySelectorAll("[data-skill-level]").length,
  horizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth
})`);

const lobbyLayout = await evaluate(`({
  headingTop: document.querySelector("h1")?.getBoundingClientRect().top,
  startTop: document.querySelector('[data-testid="start-arcade"]')?.getBoundingClientRect().top,
  settingsTop: document.querySelector('[data-testid="mode-settings"]')?.getBoundingClientRect().top,
  settingsHeight: document.querySelector('[data-testid="mode-settings"]')?.getBoundingClientRect().height,
  previewTop: document.querySelector('[data-testid="mode-preview"]')?.getBoundingClientRect().top,
  previewHeight: document.querySelector('[data-testid="mode-preview"]')?.getBoundingClientRect().height
})`);

const brandAlignment = await evaluate(`(() => {
  const brand = document.querySelector('a[aria-label="Queue Arcade home"]');
  const mark = brand?.firstElementChild?.getBoundingClientRect();
  const copy = brand?.lastElementChild?.getBoundingClientRect();
  return {
    markCenter: mark ? mark.top + mark.height / 2 : 0,
    copyCenter: copy ? copy.top + copy.height / 2 : 0
  };
})()`);

await evaluate(`(() => {
  document.querySelector('[data-arcade-mode="trivia"]')?.click();
  return true;
})()`);
await delay(350);
const triviaLobbyLayout = await evaluate(`({
  headingTop: document.querySelector("h1")?.getBoundingClientRect().top,
  startTop: document.querySelector('[data-testid="start-arcade"]')?.getBoundingClientRect().top,
  settingsTop: document.querySelector('[data-testid="mode-settings"]')?.getBoundingClientRect().top,
  settingsHeight: document.querySelector('[data-testid="mode-settings"]')?.getBoundingClientRect().height,
  previewTop: document.querySelector('[data-testid="mode-preview"]')?.getBoundingClientRect().top,
  previewHeight: document.querySelector('[data-testid="mode-preview"]')?.getBoundingClientRect().height
})`);
await screenshot("/tmp/queue-arcade-trivia-lobby.png");

await evaluate(`(() => {
  document.querySelector('[data-skill-level="veteran"]')?.click();
  return true;
})()`);
await delay(250);
await evaluate(`document.querySelector('[data-testid="start-arcade"]')?.click()`);
await waitFor(`(() => {
  const main = document.querySelector("main");
  const timer = Number(document.querySelector('[data-testid="round-timer"]')?.textContent);
  return main?.dataset.phase === "answering" && timer >= 3;
})()`);
const veteranRound = await evaluate(`({
  warmUpVisible: document.body.innerText.includes("Warm-up"),
  veteranSession: document.body.innerText.includes("Veteran"),
  answerCount: document.querySelectorAll('[data-testid="arcade-answer"]').length
})`);
await evaluate(`document.querySelector('[data-testid="end-session"]')?.click()`);
await delay(250);

await navigate(appUrl);
await evaluate(`(() => {
  document.querySelector('[data-arcade-mode="shopkeeper"]')?.click();
  document.querySelector('[data-skill-level="open"]')?.click();
  return true;
})()`);
await delay(350);
await screenshot("/tmp/queue-arcade-shopkeeper-preview.png");
await evaluate(`(() => {
  document.querySelector('[data-testid="start-arcade"]')?.click();
  return true;
})()`);
await waitFor(`(() => {
  const main = document.querySelector("main");
  const timer = Number(document.querySelector('[data-testid="round-timer"]')?.textContent);
  return main?.dataset.phase === "answering" && timer >= 4;
})()`);
await screenshot("/tmp/queue-arcade-shopkeeper.png");

const shopkeeper = await evaluate(`({
  prompt: document.querySelector("h2")?.innerText,
  modeVisible: document.body.innerText.toLowerCase().includes("shopkeeper rush"),
  answers: [...document.querySelectorAll('[data-testid="arcade-answer"]')].map((button) => button.innerText),
  answerImages: document.querySelectorAll('[data-testid="arcade-answer"] img').length,
  answerImagesLoaded: [...document.querySelectorAll('[data-testid="arcade-answer"] img')]
    .every((image) => image.complete && image.naturalWidth > 0),
  horizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth
})`);

await evaluate(`(() => {
  document.querySelector('[data-testid="arcade-answer"]')?.click();
  return true;
})()`);
await waitFor(`document.querySelector("main")?.dataset.phase === "reveal"`);
await screenshot("/tmp/queue-arcade-reveal.png");

const reveal = await evaluate(`({
  result: [...document.querySelectorAll("span")].find((entry) =>
    ["Correct", "Not quite", "Time expired"].includes(entry.textContent.trim())
  )?.textContent,
  percentages: [...document.querySelectorAll("button")]
    .filter((button) => /%/.test(button.innerText))
    .map((button) => button.innerText),
  internalSourceLabel: document.body.innerText.includes("OpenDota constants"),
  redundantAdvanceCopy: document.body.innerText.includes("Public room advances for everyone"),
  nextButton: [...document.querySelectorAll("button")].some((button) => button.textContent.includes("Next round"))
})`);

const revealedRound = await evaluate(`document.querySelector("main")?.dataset.roundId`);
await waitFor(`(() => {
  const main = document.querySelector("main");
  return main?.dataset.phase === "answering" && main?.dataset.roundId !== ${JSON.stringify(revealedRound)};
})()`);
const autoAdvanced = await evaluate(`({
  round: document.querySelector("main")?.dataset.roundId,
  answering: Boolean(document.querySelector('[data-testid="arcade-answer"]:not([disabled])')),
  endless: document.body.innerText.includes("Endless synchronized rounds")
})`);

await evaluate(`(() => {
  document.querySelector('[data-testid="end-session"]')?.click();
  return true;
})()`);
await delay(700);
await screenshot("/tmp/queue-arcade-summary.png");

const summary = await evaluate(`({
  heading: document.querySelector("h1")?.innerText,
  scoreVisible: document.body.innerText.toLowerCase().includes("final score"),
  playAgain: [...document.querySelectorAll("button")].some((button) =>
    button.textContent.includes("Play again")
  )
})`);

await navigate(appUrl);
await evaluate(`(() => {
  document.querySelector('[data-arcade-mode="spell-link"]')?.click();
  document.querySelector('[data-skill-level="veteran"]')?.click();
  return true;
})()`);
await delay(350);
await evaluate(`(() => {
  document.querySelector('[data-testid="start-arcade"]')?.click();
  return true;
})()`);
await waitFor(`(() => {
  const main = document.querySelector("main");
  const timer = Number(document.querySelector('[data-testid="round-timer"]')?.textContent);
  const artwork = document.querySelector('[data-testid="question-artwork"]');
  return main?.dataset.phase === "answering" && timer >= 10 && artwork?.dataset.artworkState === "loaded";
})()`);
await screenshot("/tmp/queue-arcade-spell-link.png");

const spellLink = await evaluate(`({
  modeVisible: document.body.innerText.toLowerCase().includes("spell link"),
  clueOneVisible: document.body.innerText.includes("Ability icon revealed"),
  heroAnswers: document.querySelectorAll('[data-testid="arcade-answer"] img').length,
  heroImagesLoaded: [...document.querySelectorAll('[data-testid="arcade-answer"] img')]
    .every((image) => image.complete && image.naturalWidth > 0),
  questionArtworkLoaded:
    document.querySelector('[data-testid="question-artwork"]')?.dataset.artworkState === "loaded",
  questionArtworkFallback:
    document.querySelector('[data-testid="question-artwork"]')?.dataset.artworkState === "fallback",
  answerCount: document.querySelectorAll('[data-testid="arcade-answer"]').length,
  difficulty: document.querySelector('[data-testid="round-difficulty"]')?.textContent.trim(),
  contentDifficulty: Number(document.querySelector('[data-testid="round-difficulty"]')?.dataset.contentDifficulty),
  horizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth
})`);

const spellLayoutOne = await evaluate(`({
  promptTop: document.querySelector('[data-testid="round-prompt"]')?.getBoundingClientRect().top,
  promptLeft: document.querySelector('[data-testid="round-prompt"]')?.getBoundingClientRect().left,
  promptWidth: document.querySelector('[data-testid="round-prompt"]')?.getBoundingClientRect().width,
  promptHeight: document.querySelector('[data-testid="round-prompt"]')?.getBoundingClientRect().height,
  answersTop: document.querySelector('[data-testid="answer-grid"]')?.getBoundingClientRect().top
})`);

await waitFor(
  `document.querySelector("main")?.dataset.phase === "answering" &&
    !document.querySelector('[data-testid="spell-clue-2"]')?.innerText.includes("unlock")`,
  8_000,
);
const spellClue = await evaluate(`({
  clueTwoUnlocked: !document.querySelector('[data-testid="spell-clue-2"]')?.innerText.includes("unlock"),
  clueTwoText: document.querySelector('[data-testid="spell-clue-2"]')?.innerText,
  clueCounter: [...document.querySelectorAll("span")].find((entry) =>
    entry.textContent.trim().startsWith("Clue 2")
  )?.textContent
})`);
const spellLayoutTwo = await evaluate(`({
  promptTop: document.querySelector('[data-testid="round-prompt"]')?.getBoundingClientRect().top,
  promptLeft: document.querySelector('[data-testid="round-prompt"]')?.getBoundingClientRect().left,
  promptWidth: document.querySelector('[data-testid="round-prompt"]')?.getBoundingClientRect().width,
  promptHeight: document.querySelector('[data-testid="round-prompt"]')?.getBoundingClientRect().height,
  answersTop: document.querySelector('[data-testid="answer-grid"]')?.getBoundingClientRect().top
})`);
await waitFor(
  `document.querySelector("main")?.dataset.phase === "answering" &&
    !document.querySelector('[data-testid="spell-clue-3"]')?.innerText.includes("unlock")`,
  8_000,
);
const spellFinalClue = await evaluate(`document.querySelector('[data-testid="spell-clue-3"]')?.innerText`);
const spellLayoutThree = await evaluate(`({
  promptTop: document.querySelector('[data-testid="round-prompt"]')?.getBoundingClientRect().top,
  promptLeft: document.querySelector('[data-testid="round-prompt"]')?.getBoundingClientRect().left,
  promptWidth: document.querySelector('[data-testid="round-prompt"]')?.getBoundingClientRect().width,
  promptHeight: document.querySelector('[data-testid="round-prompt"]')?.getBoundingClientRect().height,
  answersTop: document.querySelector('[data-testid="answer-grid"]')?.getBoundingClientRect().top
})`);
await screenshot("/tmp/queue-arcade-spell-link-final-clue.png");

await navigate(appUrl);
await evaluate(`(() => {
  document.querySelector('[data-arcade-mode="fogged-vision"]')?.click();
  document.querySelector('[data-skill-level="open"]')?.click();
  return true;
})()`);
await delay(350);
await evaluate(`document.querySelector('[data-testid="start-arcade"]')?.click()`);
await waitFor(`(() => {
  const main = document.querySelector("main");
  const prompt = document.querySelector('[data-testid="round-prompt"]');
  const artwork = document.querySelector('[data-testid="question-artwork"]');
  const timer = Number(document.querySelector('[data-testid="round-timer"]')?.textContent);
  return main?.dataset.phase === "answering" &&
    main?.dataset.questionKind === "fogged-hero" &&
    prompt?.dataset.fogStage === "1" &&
    timer >= 10 &&
    artwork?.dataset.artworkState === "loaded";
})()`);
const fogLayoutOne = await evaluate(`({
  promptTop: document.querySelector('[data-testid="round-prompt"]')?.getBoundingClientRect().top,
  promptLeft: document.querySelector('[data-testid="round-prompt"]')?.getBoundingClientRect().left,
  promptWidth: document.querySelector('[data-testid="round-prompt"]')?.getBoundingClientRect().width,
  promptHeight: document.querySelector('[data-testid="round-prompt"]')?.getBoundingClientRect().height,
  answersTop: document.querySelector('[data-testid="answer-grid"]')?.getBoundingClientRect().top
})`);
await screenshot("/tmp/queue-arcade-fog-stage-1.png");
await waitFor(`document.querySelector('[data-testid="round-prompt"]')?.dataset.fogStage === "2"`, 8_000);
const fogLayoutTwo = await evaluate(`({
  promptTop: document.querySelector('[data-testid="round-prompt"]')?.getBoundingClientRect().top,
  promptLeft: document.querySelector('[data-testid="round-prompt"]')?.getBoundingClientRect().left,
  promptWidth: document.querySelector('[data-testid="round-prompt"]')?.getBoundingClientRect().width,
  promptHeight: document.querySelector('[data-testid="round-prompt"]')?.getBoundingClientRect().height,
  answersTop: document.querySelector('[data-testid="answer-grid"]')?.getBoundingClientRect().top
})`);
await waitFor(`document.querySelector('[data-testid="round-prompt"]')?.dataset.fogStage === "3"`, 8_000);
await delay(800);
const fogLayoutThree = await evaluate(`({
  promptTop: document.querySelector('[data-testid="round-prompt"]')?.getBoundingClientRect().top,
  promptLeft: document.querySelector('[data-testid="round-prompt"]')?.getBoundingClientRect().left,
  promptWidth: document.querySelector('[data-testid="round-prompt"]')?.getBoundingClientRect().width,
  promptHeight: document.querySelector('[data-testid="round-prompt"]')?.getBoundingClientRect().height,
  answersTop: document.querySelector('[data-testid="answer-grid"]')?.getBoundingClientRect().top
})`);
const foggedVision = await evaluate(`({
  answerCount: document.querySelectorAll('[data-testid="arcade-answer"]').length,
  answerImages: document.querySelectorAll('[data-testid="arcade-answer"] img').length,
  artworkLoaded: document.querySelector('[data-testid="question-artwork"]')?.dataset.artworkState === "loaded",
  horizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth
})`);
await screenshot("/tmp/queue-arcade-fog-stage-3.png");

const fogRound = await evaluate(`document.querySelector("main")?.dataset.roundId`);
await waitFor(
  `(() => {
    const main = document.querySelector("main");
    const prompt = document.querySelector('[data-testid="round-prompt"]');
    const artwork = document.querySelector('[data-testid="question-artwork"]');
    const timer = Number(document.querySelector('[data-testid="round-timer"]')?.textContent);
    return main?.dataset.phase === "answering" &&
      main?.dataset.roundId !== ${JSON.stringify(fogRound)} &&
      main?.dataset.questionKind === "fogged-hero" &&
      prompt?.dataset.fogStage === "1" &&
      timer >= 10 &&
      artwork?.dataset.artworkState === "loaded";
  })()`,
  30_000,
);
const fogNextRound = await evaluate(`(() => {
  const image = document.querySelector('[data-testid="question-artwork"] img');
  const style = image ? getComputedStyle(image) : null;
  return {
    round: document.querySelector("main")?.dataset.roundId,
    stage: document.querySelector('[data-testid="round-prompt"]')?.dataset.fogStage,
    filter: style?.filter,
    transitionDuration: style?.transitionDuration
  };
})()`);
await screenshot("/tmp/queue-arcade-fog-next-round.png");

await navigate(appUrl);
await evaluate(`(() => {
  document.querySelector('button[aria-label="Mute game sounds"]')?.click();
  document.querySelector('[data-arcade-mode="echo-hunt"]')?.click();
  document.querySelector('[data-skill-level="open"]')?.click();
  return true;
})()`);
await delay(350);
await evaluate(`document.querySelector('[data-testid="start-arcade"]')?.click()`);
await waitFor(`(() => {
  const main = document.querySelector("main");
  const timer = Number(document.querySelector('[data-testid="round-timer"]')?.textContent);
  const audio = document.querySelector("audio");
  return main?.dataset.phase === "answering" &&
    main?.dataset.questionKind === "hero-voice" &&
    timer >= 4 &&
    audio?.readyState >= 2;
})()`);
const echoHunt = await evaluate(`({
  answerCount: document.querySelectorAll('[data-testid="arcade-answer"]').length,
  answerImages: document.querySelectorAll('[data-testid="arcade-answer"] img').length,
  answerImagesLoaded: [...document.querySelectorAll('[data-testid="arcade-answer"] img')]
    .every((image) => image.complete && image.naturalWidth > 0),
  audioReady: document.querySelector("audio")?.readyState >= 2,
  audioSource: document.querySelector("audio")?.currentSrc,
  replayButton: Boolean(document.querySelector('[data-testid="voice-line-play"]')),
  playerState: document.querySelector('[data-testid="echo-player"]')?.dataset.voiceState,
  horizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth
})`);
await screenshot("/tmp/queue-arcade-echo-hunt.png");

await navigate(appUrl);
await evaluate(`(() => {
  document.querySelector('[data-arcade-mode="quote-hunt"]')?.click();
  document.querySelector('[data-skill-level="open"]')?.click();
  return true;
})()`);
await delay(350);
await evaluate(`document.querySelector('[data-testid="start-arcade"]')?.click()`);
await waitFor(`(() => {
  const main = document.querySelector("main");
  const timer = Number(document.querySelector('[data-testid="round-timer"]')?.textContent);
  const answers = [...document.querySelectorAll('[data-testid="arcade-answer"] img')];
  return main?.dataset.phase === "answering" &&
    main?.dataset.questionKind === "hero-quote" &&
    timer >= 4 &&
    answers.length === 4 &&
    answers.every((image) => image.complete && image.naturalWidth > 0);
})()`);
const quoteHunt = await evaluate(`({
  text: document.querySelector('[data-testid="hero-quote"] blockquote')?.innerText,
  answerCount: document.querySelectorAll('[data-testid="arcade-answer"]').length,
  answerImages: document.querySelectorAll('[data-testid="arcade-answer"] img').length,
  answerImagesLoaded: [...document.querySelectorAll('[data-testid="arcade-answer"] img')]
    .every((image) => image.complete && image.naturalWidth > 0),
  hasAudio: Boolean(document.querySelector("audio")),
  horizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth
})`);
await screenshot("/tmp/queue-arcade-quote-hunt.png");

await send("Emulation.setDeviceMetricsOverride", {
  width: 390,
  height: 844,
  deviceScaleFactor: 1,
  mobile: true,
});
await navigate(appUrl);
await screenshot("/tmp/queue-arcade-mobile.png");

const mobile = await evaluate(`({
  viewport: [innerWidth, innerHeight],
  horizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
  headingVisible: Boolean(document.querySelector("h1")?.getBoundingClientRect().height)
})`);

await evaluate(`(() => {
  document.querySelector('[data-testid="start-arcade"]')?.click();
  return true;
})()`);
await waitFor(`document.querySelector("main")?.dataset.phase === "answering"`);

const mobileQuestion = await evaluate(`({
  horizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
  answerCount: document.querySelectorAll('[data-testid="arcade-answer"]').length
})`);
await evaluate(`(() => {
  document.querySelector('[data-testid="arcade-answer"]')?.scrollIntoView({ block: "center" });
  return true;
})()`);
await delay(300);
await screenshot("/tmp/queue-arcade-mobile-question.png");

socket.close();

const failures = [];
const layoutDelta = (left, right) =>
  Object.keys(left).reduce((largest, key) => Math.max(largest, Math.abs((left[key] ?? 0) - (right[key] ?? 0))), 0);
if (!lobby.title.includes("Queue Arcade")) failures.push("The Queue Arcade metadata title is missing.");
if (!lobby.startButton || lobby.arcadeModes !== 7 || lobby.skillLevels !== 3) {
  failures.push("The arcade lobby controls are incomplete.");
}
if (lobby.horizontalOverflow) failures.push("The desktop lobby overflows horizontally.");
if (Math.abs(brandAlignment.markCenter - brandAlignment.copyCenter) > 0.5) {
  failures.push("The header logo and brand copy are not vertically aligned.");
}
if (layoutDelta(lobbyLayout, triviaLobbyLayout) > 1) {
  failures.push("Selecting Queue Trivia shifts the lobby layout.");
}
if (veteranRound.warmUpVisible || !veteranRound.veteranSession || veteranRound.answerCount !== 4) {
  failures.push("The Veteran challenge does not produce a valid higher-difficulty trivia round.");
}
if (!shopkeeper.modeVisible || shopkeeper.answers.length !== 4) failures.push("Shopkeeper Rush did not start.");
if (shopkeeper.answerImages !== 4 || !shopkeeper.answerImagesLoaded) {
  failures.push("Shopkeeper Rush item artwork did not load.");
}
if (
  !reveal.result ||
  reveal.percentages.length !== 4 ||
  reveal.internalSourceLabel ||
  reveal.redundantAdvanceCopy ||
  reveal.nextButton
) {
  failures.push("The crowd reveal is incomplete.");
}
if (!autoAdvanced.answering || !autoAdvanced.endless || autoAdvanced.round === revealedRound) {
  failures.push("Rounds do not advance automatically in the endless session.");
}
if (!summary.scoreVisible || !summary.playAgain) failures.push("The session report is incomplete.");
if (
  !spellLink.modeVisible ||
  !spellLink.clueOneVisible ||
  spellLink.answerCount !== 4 ||
  spellLink.difficulty !== "Veteran" ||
  spellLink.contentDifficulty < 2
) {
  failures.push("Spell Link did not start.");
}
if (
  spellLink.heroAnswers !== 4 ||
  !spellLink.heroImagesLoaded ||
  !spellLink.questionArtworkLoaded ||
  spellLink.questionArtworkFallback ||
  !spellClue.clueTwoUnlocked
) {
  failures.push("Spell Link artwork or progressive clues failed.");
}
if (!spellFinalClue || /belongs to/i.test(spellFinalClue)) {
  failures.push("Spell Link did not render an answer-safe final clue.");
}
if (layoutDelta(spellLayoutOne, spellLayoutTwo) > 1 || layoutDelta(spellLayoutOne, spellLayoutThree) > 1) {
  failures.push("Unlocking Spell Link clues shifts the round layout.");
}
if (
  !foggedVision.artworkLoaded ||
  foggedVision.answerCount !== 4 ||
  foggedVision.answerImages !== 0 ||
  layoutDelta(fogLayoutOne, fogLayoutTwo) > 1 ||
  layoutDelta(fogLayoutOne, fogLayoutThree) > 1
) {
  failures.push("Fogged Vision artwork, answers, or fixed-stage layout failed.");
}
if (
  fogNextRound.round === fogRound ||
  fogNextRound.stage !== "1" ||
  !fogNextRound.filter?.includes("blur(17px)") ||
  fogNextRound.transitionDuration !== "0s"
) {
  failures.push("Fogged Vision briefly reveals the next round before applying fog.");
}
if (
  echoHunt.answerCount !== 4 ||
  echoHunt.answerImages !== 4 ||
  !echoHunt.answerImagesLoaded ||
  !echoHunt.audioReady ||
  !echoHunt.audioSource?.includes("dotabase.dillerm.io") ||
  !echoHunt.replayButton
) {
  failures.push("Echo Hunt audio or hero choices failed.");
}
if (
  (quoteHunt.text?.length ?? 0) < 28 ||
  (quoteHunt.text?.match(/[a-z]+(?:['’-][a-z]+)*/gi)?.length ?? 0) < 5 ||
  quoteHunt.answerCount !== 4 ||
  quoteHunt.answerImages !== 4 ||
  !quoteHunt.answerImagesLoaded ||
  quoteHunt.hasAudio
) {
  failures.push("Quote Hunt line or hero choices failed.");
}
if (
  spellLink.horizontalOverflow ||
  foggedVision.horizontalOverflow ||
  echoHunt.horizontalOverflow ||
  quoteHunt.horizontalOverflow ||
  mobile.horizontalOverflow ||
  mobileQuestion.horizontalOverflow
) {
  failures.push("An arcade screen overflows horizontally.");
}
if (mobileQuestion.answerCount !== 4) failures.push("The mobile round is missing answers.");
if (browserErrors.length) failures.push(`Browser exceptions: ${browserErrors.join(", ")}`);

console.log(
  JSON.stringify(
    {
      lobby,
      lobbyLayout,
      triviaLobbyLayout,
      brandAlignment,
      veteranRound,
      shopkeeper,
      reveal,
      revealedRound,
      autoAdvanced,
      summary,
      spellLink,
      spellClue,
      spellFinalClue,
      spellLayoutOne,
      spellLayoutTwo,
      spellLayoutThree,
      foggedVision,
      fogLayoutOne,
      fogLayoutTwo,
      fogLayoutThree,
      fogRound,
      fogNextRound,
      echoHunt,
      quoteHunt,
      mobile,
      mobileQuestion,
      browserErrors,
    },
    null,
    2,
  ),
);

if (failures.length) {
  throw new Error(failures.join("\n"));
}

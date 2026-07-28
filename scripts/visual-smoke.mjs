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
const revealBoundsBeforeReport = await evaluate(`(() => {
  const panel = document.querySelector('[data-testid="report-question"]')?.closest('[aria-live="polite"]');
  const bounds = panel?.getBoundingClientRect();
  return bounds ? { x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height } : null;
})()`);
await evaluate(`document.querySelector('[data-testid="report-question"]')?.click()`);
await waitFor(`document.querySelectorAll('[data-testid="report-reason"]').length === 4`);
const reportMenu = await evaluate(`(() => {
  const panel = document.querySelector('[data-testid="report-question"]')?.closest('[aria-live="polite"]');
  const panelBounds = panel?.getBoundingClientRect();
  const buttons = [...document.querySelectorAll('[data-testid="report-reason"]')];
  const menuBounds = buttons[0]?.parentElement?.getBoundingClientRect();
  return {
    reasons: buttons.map((button) => button.dataset.reportReason),
    panelBounds: panelBounds
      ? { x: panelBounds.x, y: panelBounds.y, width: panelBounds.width, height: panelBounds.height }
      : null,
    menuFits: menuBounds ? menuBounds.left >= 0 && menuBounds.right <= innerWidth : false,
    horizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth
  };
})()`);
await screenshot("/tmp/queue-arcade-report-menu.png");
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
await waitFor(
  `document.querySelectorAll('[data-testid="report-carryover"] [data-testid="report-reason"]').length === 4`,
);
const reportCarryover = await evaluate(`(() => {
  const carryover = document.querySelector('[data-testid="report-carryover"]');
  const bounds = carryover?.getBoundingClientRect();
  return {
    visible: Boolean(carryover),
    phase: document.querySelector("main")?.dataset.phase,
    prompt: carryover?.querySelector("strong")?.textContent.trim(),
    answerVisible: carryover?.innerText.includes("Answer"),
    reasons: carryover?.querySelectorAll('[data-testid="report-reason"]').length,
    fits: bounds
      ? bounds.left >= 0 && bounds.right <= innerWidth && bounds.top >= 0 && bounds.bottom <= innerHeight
      : false,
    horizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth
  };
})()`);
await screenshot("/tmp/queue-arcade-report-carryover.png");
await evaluate(`document.querySelector('[data-testid="report-carryover"] [data-report-reason="ambiguous"]')?.click()`);
await waitFor(`Boolean(document.querySelector('[data-testid="report-confirmation"]'))`);
const reportResult = await evaluate(`({
  label: document.querySelector('[data-testid="report-confirmation"]')?.textContent.trim(),
  menuClosed: document.querySelectorAll('[data-testid="report-reason"]').length === 0,
  carryoverClosed: !document.querySelector('[data-testid="report-carryover"]'),
  answering: document.querySelector("main")?.dataset.phase === "answering",
  horizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth
})`);
await screenshot("/tmp/queue-arcade-report-confirmation.png");
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
const fogTierFilters = await evaluate(`(() => {
  const prompt = document.querySelector('[data-testid="round-prompt"]');
  const image = document.querySelector('[data-testid="question-artwork"] img');
  if (!prompt || !image) return {};

  const originalSkill = prompt.dataset.skillLevel;
  const filters = {};
  for (const skill of ["learning", "open", "veteran"]) {
    prompt.dataset.skillLevel = skill;
    filters[skill] = getComputedStyle(image).filter;
  }
  prompt.dataset.skillLevel = originalSkill;
  return filters;
})()`);
const fogClarityOne = await evaluate(`(() => {
  const image = document.querySelector('[data-testid="question-artwork"] img');
  return {
    skill: document.querySelector('[data-testid="round-prompt"]')?.dataset.skillLevel,
    filter: image ? getComputedStyle(image).filter : "",
    transform: image ? getComputedStyle(image).transform : ""
  };
})()`);
await screenshot("/tmp/queue-arcade-fog-stage-1.png");
await waitFor(`document.querySelector('[data-testid="round-prompt"]')?.dataset.fogStage === "2"`, 8_000);
await delay(800);
const fogLayoutTwo = await evaluate(`({
  promptTop: document.querySelector('[data-testid="round-prompt"]')?.getBoundingClientRect().top,
  promptLeft: document.querySelector('[data-testid="round-prompt"]')?.getBoundingClientRect().left,
  promptWidth: document.querySelector('[data-testid="round-prompt"]')?.getBoundingClientRect().width,
  promptHeight: document.querySelector('[data-testid="round-prompt"]')?.getBoundingClientRect().height,
  answersTop: document.querySelector('[data-testid="answer-grid"]')?.getBoundingClientRect().top
})`);
const fogClarityTwo = await evaluate(`(() => {
  const image = document.querySelector('[data-testid="question-artwork"] img');
  return {
    filter: image ? getComputedStyle(image).filter : "",
    transform: image ? getComputedStyle(image).transform : ""
  };
})()`);
await screenshot("/tmp/queue-arcade-fog-stage-2.png");
await waitFor(`document.querySelector('[data-testid="round-prompt"]')?.dataset.fogStage === "3"`, 8_000);
await delay(800);
const fogLayoutThree = await evaluate(`({
  promptTop: document.querySelector('[data-testid="round-prompt"]')?.getBoundingClientRect().top,
  promptLeft: document.querySelector('[data-testid="round-prompt"]')?.getBoundingClientRect().left,
  promptWidth: document.querySelector('[data-testid="round-prompt"]')?.getBoundingClientRect().width,
  promptHeight: document.querySelector('[data-testid="round-prompt"]')?.getBoundingClientRect().height,
  answersTop: document.querySelector('[data-testid="answer-grid"]')?.getBoundingClientRect().top
})`);
const fogClarityThree = await evaluate(`(() => {
  const image = document.querySelector('[data-testid="question-artwork"] img');
  return {
    filter: image ? getComputedStyle(image).filter : "",
    transform: image ? getComputedStyle(image).transform : ""
  };
})()`);
const fogFinalTierFilters = await evaluate(`(() => {
  const prompt = document.querySelector('[data-testid="round-prompt"]');
  const image = document.querySelector('[data-testid="question-artwork"] img');
  if (!prompt || !image) return {};

  const originalSkill = prompt.dataset.skillLevel;
  const originalTransition = image.style.transition;
  image.style.transition = "none";
  const filters = {};
  for (const skill of ["learning", "open", "veteran"]) {
    prompt.dataset.skillLevel = skill;
    filters[skill] = getComputedStyle(image).filter;
  }
  prompt.dataset.skillLevel = originalSkill;
  getComputedStyle(image).filter;
  image.style.transition = originalTransition;
  return filters;
})()`);
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

await navigate(appUrl);
await evaluate(`(() => {
  document.querySelector('[data-arcade-mode="counterplay"]')?.click();
  document.querySelector('[data-skill-level="veteran"]')?.click();
  return true;
})()`);
await delay(350);
const counterplayPreview = await evaluate(`({
  active: Boolean(document.querySelector('[data-arcade-mode="counterplay"][aria-pressed="true"]')),
  prompt: document.querySelector('[data-testid="mode-preview"] h2')?.innerText,
  timer: document.querySelector('[data-testid="mode-preview"] [class*="previewHeader"] strong')?.innerText,
  answers: document.querySelectorAll('[data-testid="mode-preview"] [class*="previewAnswers"] > div').length,
  artworkLoaded: [...document.querySelectorAll('[data-testid="mode-preview"] img')]
    .some((image) => image.complete && image.naturalWidth > 0)
})`);
await screenshot("/tmp/queue-arcade-counterplay-preview.png");
await evaluate(`document.querySelector('[data-testid="start-arcade"]')?.click()`);
await waitFor(`(() => {
  const main = document.querySelector("main");
  const timer = Number(document.querySelector('[data-testid="round-timer"]')?.textContent);
  const artwork = document.querySelector('[data-testid="question-artwork"]');
  const prompt = document.querySelector('[data-testid="round-prompt"]');
  const answerImages = [...document.querySelectorAll('[data-testid="arcade-answer"] img')];
  const isScenario = prompt?.dataset.counterplayFormat === "interaction-scenario";
  const toolArtworks = [...document.querySelectorAll('[data-testid="counterplay-tool-artwork"]')];
  const expectedAnswerImages = isScenario ? 0 : 4;
  return main?.dataset.phase === "answering" &&
    main?.dataset.questionKind?.startsWith("counterplay-") &&
    timer >= 4 &&
    artwork?.dataset.artworkState === "loaded" &&
    answerImages.length === expectedAnswerImages &&
    answerImages.every((image) => image.complete && image.naturalWidth > 0) &&
    (!isScenario ||
      (toolArtworks.length >= 1 &&
        toolArtworks.every((toolArtwork) => toolArtwork.dataset.artworkState === "loaded")));
})()`);
const counterplay = await evaluate(`(() => {
  const prompt = document.querySelector('[data-testid="round-prompt"]');
  return {
    game: document.querySelector('[data-testid="public-room"]')?.dataset.roundGame,
    kind: document.querySelector("main")?.dataset.questionKind,
    family: prompt?.dataset.counterplayFamily,
    format: prompt?.dataset.counterplayFormat,
    prompt: prompt?.querySelector("h2")?.innerText,
    promptWords: prompt?.querySelector("h2")?.innerText?.trim().split(/\\s+/).length,
    tool: prompt?.querySelector('[data-testid="counterplay-tool-label"]')?.innerText,
    note: prompt?.querySelector('[class*="questionCopy"] small')?.innerText,
    diagram: Boolean(prompt?.querySelector('[data-testid="counterplay-scenario-diagram"]')),
    toolArtworks: prompt?.querySelectorAll('[data-testid="counterplay-tool-artwork"]').length,
    toolArtworksLoaded: [...(prompt?.querySelectorAll('[data-testid="counterplay-tool-artwork"]') ?? [])]
      .every((artwork) => artwork.dataset.artworkState === "loaded"),
    difficulty: Number(document.querySelector('[data-testid="round-difficulty"]')?.dataset.contentDifficulty),
    answerCount: document.querySelectorAll('[data-testid="arcade-answer"]').length,
    answerImages: document.querySelectorAll('[data-testid="arcade-answer"] img').length,
    horizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth
  };
})()`);
await screenshot("/tmp/queue-arcade-counterplay.png");
await evaluate(`document.querySelector('[data-testid="arcade-answer"]')?.click()`);
await waitFor(`document.querySelector("main")?.dataset.phase === "reveal"`);
const counterplayReveal = await evaluate(`({
  correctAnswers: document.querySelectorAll('[data-testid="arcade-answer"][class*="answerCorrect"]').length,
  explanation: document.querySelector('[aria-live="polite"] p')?.innerText,
  sourceLabelVisible:
    document.body.innerText.includes("OpenDota game constants") ||
    document.body.innerText.includes("Dota 2 Wiki · Spell"),
  horizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth
})`);
await screenshot("/tmp/queue-arcade-counterplay-reveal.png");

async function inspectMapSenseVariant() {
  return evaluate(`(() => {
    const board = document.querySelector('[data-testid="map-sense-board"]');
    const crop = document.querySelector('[data-testid="map-terrain-crop"]');
    const cropImage = crop?.querySelector("img");
    const mechanic = document.querySelector(
      '[data-testid="map-camp-block-card"], [data-testid="map-stack-route-card"], [data-testid="map-tp-in-card"]'
    );
    const visual = crop ?? mechanic;
    const bounds = board?.getBoundingClientRect();
    const visualBounds = visual?.getBoundingClientRect();
    return {
      roundId: document.querySelector("main")?.dataset.roundId,
      kind: document.querySelector("main")?.dataset.questionKind,
      choiceKind: board?.dataset.choiceKind,
      game: document.querySelector('[data-testid="public-room"]')?.dataset.roundGame,
      difficulty: Number(document.querySelector('[data-testid="round-difficulty"]')?.dataset.contentDifficulty),
      prompt: document.querySelector('[data-testid="map-sense-round"] h2')?.textContent?.trim(),
      readGraceVisible: document.querySelector('[data-testid="map-sense-round"]')?.textContent?.includes("3s read grace"),
      cropVisible: Boolean(crop),
      cropTreatment: crop?.dataset.treatment,
      cropLoaded: Boolean(cropImage?.complete && cropImage?.naturalWidth > 0),
      cropFilter: cropImage ? getComputedStyle(cropImage).filter : null,
      mechanicVisible: Boolean(mechanic),
      mechanicKind: mechanic?.dataset.kind,
      choiceOptions: document.querySelectorAll('[data-testid="map-choice-option"]').length,
      choiceAnswers: document.querySelectorAll('[data-testid="map-choice-answer"]').length,
      campMarker: Boolean(document.querySelector('[data-testid="map-camp-marker"]')),
      fightMarker: Boolean(document.querySelector('[data-testid="map-fight-marker"]')),
      spawnBox: Boolean(document.querySelector('[data-testid="map-spawn-box"]')),
      routeLines: document.querySelectorAll('[class*="mapRouteLines"] line').length,
      answerCount: document.querySelectorAll('[data-testid="arcade-answer"]').length,
      locked: board?.dataset.mapState === "locked",
      referenceVisible: Boolean(document.querySelector('[data-testid="map-reference-pin"]')),
      boardFits: bounds ? bounds.left >= 0 && bounds.right <= innerWidth : false,
      square: bounds ? Math.abs(bounds.width - bounds.height) < 1 : false,
      visualFits: visualBounds ? visualBounds.left >= 0 && visualBounds.right <= innerWidth : false,
      imageLoaded: [...(board?.querySelectorAll("img") ?? [])]
        .every((image) => image.complete && image.naturalWidth > 0),
      horizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth
    };
  })()`);
}

async function lockCurrentMapRound() {
  const kind = await evaluate(`document.querySelector("main")?.dataset.questionKind`);
  if (kind === "map-crop") {
    const mapBounds = await evaluate(`(() => {
      const bounds = document.querySelector('[data-testid="map-sense-board"]')?.getBoundingClientRect();
      return bounds ? { x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height } : null;
    })()`);
    if (!mapBounds) throw new Error("The Terrain Match board is missing.");
    const x = mapBounds.x + mapBounds.width * 0.46;
    const y = mapBounds.y + mapBounds.height * 0.54;
    await send("Input.dispatchMouseEvent", { type: "mousePressed", x, y, button: "left", clickCount: 1 });
    await send("Input.dispatchMouseEvent", { type: "mouseReleased", x, y, button: "left", clickCount: 1 });
    await waitFor(`Boolean(document.querySelector('[data-testid="map-player-pin"]'))`);
  } else {
    await evaluate(`document.querySelector('[data-testid="map-choice-answer"]')?.click()`);
  }
  await waitFor(`document.querySelector('[data-testid="map-sense-board"]')?.dataset.mapState === "locked"`);
}

async function inspectMapSenseReveal() {
  return evaluate(`({
    kind: document.querySelector("main")?.dataset.questionKind,
    targetVisible: Boolean(document.querySelector('[data-testid="map-target-pin"]')),
    playerVisible: Boolean(document.querySelector('[data-testid="map-player-pin"]')),
    heatmapVisible: Boolean(document.querySelector('[data-testid="map-heatmap"]')),
    crowdDots: document.querySelectorAll('[data-testid="map-heatmap"] circle').length,
    spawnBox: Boolean(document.querySelector('[data-testid="map-spawn-box"]')),
    routeLines: document.querySelectorAll('[class*="mapRouteLines"] line').length,
    correctMarkers: document.querySelectorAll('[data-testid="map-choice-option"][data-state="correct"]').length,
    correctAnswers: document.querySelectorAll('[data-testid="map-choice-answer"][data-state="correct"]').length,
    markerPercentages: document.querySelectorAll('[data-testid="map-choice-option"] em').length,
    resultVisible: Boolean(document.querySelector('[aria-live="polite"]')),
    horizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth
  })`);
}

await navigate(appUrl);
await evaluate(`(() => {
  document.querySelector('[data-arcade-mode="map-sense"]')?.click();
  document.querySelector('[data-skill-level="veteran"]')?.click();
  return true;
})()`);
await delay(350);
const mapPreview = await evaluate(`({
  visible: Boolean(document.querySelector('[data-arcade-mode="map-sense"][aria-pressed="true"]')),
  imageLoaded: [...document.querySelectorAll('[data-testid="mode-preview"] img')]
    .some((image) => image.complete && image.naturalWidth > 0),
  bands: document.querySelectorAll('[data-testid="mode-preview"] [class*="previewAnswers"] > div').length
})`);
await screenshot("/tmp/queue-arcade-map-sense-preview.png");
await evaluate(`document.querySelector('[data-testid="start-arcade"]')?.click()`);
await waitFor(`(() => {
  const main = document.querySelector("main");
  const timer = Number(document.querySelector('[data-testid="round-timer"]')?.textContent);
  const image = document.querySelector('[data-testid="map-sense-board"] img');
  return main?.dataset.phase === "answering" &&
    main?.dataset.questionKind?.startsWith("map-") &&
    timer >= 4 &&
    image?.complete &&
    image?.naturalWidth > 0;
})()`);

const mapSenseKinds = ["map-crop", "map-camp-block", "map-stack-route", "map-tp-in"];
const mapVariants = [];
const mapReveals = [];
let previousMapRound = null;
for (let attempt = 0; attempt < mapSenseKinds.length * 2; attempt += 1) {
  if (previousMapRound) {
    await waitFor(
      `(() => {
        const main = document.querySelector("main");
        return main?.dataset.phase === "answering" &&
          main?.dataset.roundId !== ${JSON.stringify(previousMapRound)} &&
          ${JSON.stringify(mapSenseKinds)}.includes(main?.dataset.questionKind);
      })()`,
      30_000,
    );
  }
  await lockCurrentMapRound();
  const variant = await inspectMapSenseVariant();
  mapVariants.push(variant);
  previousMapRound = variant.roundId;
  await screenshot(`/tmp/queue-arcade-map-sense-${variant.kind}.png`);
  await waitFor(`document.querySelector("main")?.dataset.phase === "reveal"`, 20_000);
  const reveal = await inspectMapSenseReveal();
  mapReveals.push(reveal);
  await screenshot(`/tmp/queue-arcade-map-sense-${variant.kind}-reveal.png`);
  if (mapSenseKinds.every((kind) => mapVariants.some((candidate) => candidate.kind === kind))) break;
}
const mapSenseAnswering = mapVariants[0];
const mapSenseReveal = mapReveals[0];

await send("Emulation.setDeviceMetricsOverride", {
  width: 390,
  height: 844,
  deviceScaleFactor: 1,
  mobile: true,
});
await navigate(appUrl);
await evaluate(`(() => {
  document.querySelector('[data-arcade-mode="map-sense"]')?.click();
  document.querySelector('[data-skill-level="veteran"]')?.click();
  return true;
})()`);
await delay(250);
await screenshot("/tmp/queue-arcade-mobile.png");

const mobile = await evaluate(`({
  viewport: [innerWidth, innerHeight],
  horizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
  headingVisible: Boolean(document.querySelector("h1")?.getBoundingClientRect().height)
})`);

await evaluate(`document.querySelector('[data-testid="start-arcade"]')?.click()`);
await waitFor(`(() => {
  const main = document.querySelector("main");
  return main?.dataset.phase === "answering" &&
    ${JSON.stringify(mapSenseKinds)}.includes(main?.dataset.questionKind);
})()`);
const mobileMap = await inspectMapSenseVariant();
await evaluate(`document.querySelector(
  '[data-testid="map-terrain-crop"], [data-testid="map-camp-block-card"], [data-testid="map-stack-route-card"], [data-testid="map-tp-in-card"]'
)?.scrollIntoView({ block: "center" })`);
await delay(300);
await screenshot("/tmp/queue-arcade-mobile-map-sense.png");

await navigate(appUrl);
await evaluate(`(() => {
  document.querySelector('[data-arcade-mode="trivia"]')?.click();
  document.querySelector('[data-skill-level="open"]')?.click();
  return true;
})()`);
await delay(250);
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

await send("Emulation.setDeviceMetricsOverride", {
  width: 1440,
  height: 1000,
  deviceScaleFactor: 1,
  mobile: false,
});
await navigate(`${appUrl}/calibration`);
await waitFor(`document.querySelectorAll('[data-testid="calibration-row"]').length > 0`);
const calibrationDesktop = await evaluate(`(() => {
  const rows = [...document.querySelectorAll('[data-testid="calibration-row"]')];
  const firstQuestion = rows[0]?.querySelector('[role="cell"] strong');
  return {
    dashboard: Boolean(document.querySelector('[data-testid="calibration-dashboard"]')),
    stats: document.querySelectorAll('section[aria-label="Calibration overview"] article').length,
    filters: document.querySelectorAll('[role="group"][aria-label="Calibration filter"] button').length,
    rows: rows.length,
    reportedRows: document.querySelectorAll('[data-calibration-status="reported"]').length,
    guardrail: document.body.innerText.includes("20 answers before difficulty signals"),
    aggregateOnly: document.body.innerText.includes("Aggregates only"),
    questionFontSize: firstQuestion ? parseFloat(getComputedStyle(firstQuestion).fontSize) : 0,
    horizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth
  };
})()`);
await screenshot("/tmp/queue-arcade-calibration.png");

await send("Emulation.setDeviceMetricsOverride", {
  width: 390,
  height: 844,
  deviceScaleFactor: 1,
  mobile: true,
});
await navigate(`${appUrl}/calibration`);
await waitFor(`document.querySelectorAll('[data-testid="calibration-row"]').length > 0`);
const calibrationMobile = await evaluate(`(() => {
  const row = document.querySelector('[data-testid="calibration-row"]');
  const bounds = row?.getBoundingClientRect();
  const question = row?.querySelector('[role="cell"] strong');
  return {
    rows: document.querySelectorAll('[data-testid="calibration-row"]').length,
    filters: document.querySelectorAll('[role="group"][aria-label="Calibration filter"] button').length,
    rowFits: bounds ? bounds.left >= 0 && bounds.right <= innerWidth : false,
    questionFontSize: question ? parseFloat(getComputedStyle(question).fontSize) : 0,
    horizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth
  };
})()`);
await screenshot("/tmp/queue-arcade-calibration-mobile.png");

socket.close();

const failures = [];
const layoutDelta = (left, right) =>
  Object.keys(left).reduce((largest, key) => Math.max(largest, Math.abs((left[key] ?? 0) - (right[key] ?? 0))), 0);
const requiredMapKinds = mapSenseKinds;
const mapVariantKinds = new Set(mapVariants.map((variant) => variant.kind));
const validMapVariant = (variant) => {
  const common =
    requiredMapKinds.includes(variant.kind) &&
    variant.game === "map-sense" &&
    variant.difficulty === 3 &&
    variant.answerCount === 0 &&
    (variant.prompt?.split(/\s+/).length ?? 99) <= 4 &&
    !variant.readGraceVisible &&
    variant.locked &&
    variant.boardFits &&
    variant.square &&
    variant.visualFits &&
    variant.imageLoaded &&
    !variant.horizontalOverflow;
  if (!common) return false;
  if (variant.kind === "map-crop") {
    return (
      variant.cropVisible &&
      variant.cropLoaded &&
      variant.cropTreatment === "mono" &&
      variant.cropFilter?.includes("grayscale") &&
      !variant.mechanicVisible &&
      variant.choiceOptions === 0 &&
      variant.choiceAnswers === 0 &&
      !variant.campMarker &&
      !variant.fightMarker &&
      !variant.spawnBox &&
      variant.routeLines === 0
    );
  }
  const expectedChoiceKind = {
    "map-camp-block": "camp-block",
    "map-stack-route": "stack-route",
    "map-tp-in": "tp-in",
  }[variant.kind];
  const commonChoice =
    variant.mechanicVisible &&
    variant.mechanicKind === expectedChoiceKind &&
    variant.choiceKind === expectedChoiceKind &&
    variant.choiceOptions === 4 &&
    variant.choiceAnswers === 4 &&
    !variant.cropVisible &&
    !variant.spawnBox;
  if (variant.kind === "map-camp-block") {
    return commonChoice && variant.campMarker && !variant.fightMarker && variant.routeLines === 0;
  }
  if (variant.kind === "map-stack-route") {
    return commonChoice && variant.campMarker && !variant.fightMarker && variant.routeLines === 4;
  }
  return commonChoice && !variant.campMarker && variant.fightMarker && variant.routeLines === 0;
};
const validMapReveal = (reveal) => {
  const common = requiredMapKinds.includes(reveal.kind) && reveal.resultVisible && !reveal.horizontalOverflow;
  if (!common) return false;
  if (reveal.kind === "map-crop") {
    return (
      reveal.targetVisible &&
      reveal.playerVisible &&
      reveal.heatmapVisible &&
      reveal.crowdDots >= 2 &&
      !reveal.spawnBox &&
      reveal.correctMarkers === 0 &&
      reveal.correctAnswers === 0
    );
  }
  const commonChoice =
    !reveal.targetVisible &&
    !reveal.playerVisible &&
    !reveal.heatmapVisible &&
    reveal.correctMarkers === 1 &&
    reveal.correctAnswers === 1 &&
    reveal.markerPercentages === 4;
  if (reveal.kind === "map-camp-block") {
    return commonChoice && reveal.spawnBox && reveal.routeLines === 0;
  }
  if (reveal.kind === "map-stack-route") {
    return commonChoice && reveal.spawnBox && reveal.routeLines === 4;
  }
  return commonChoice && !reveal.spawnBox && reveal.routeLines === 0;
};
if (!lobby.title.includes("Queue Arcade")) failures.push("The Queue Arcade metadata title is missing.");
if (!lobby.startButton || lobby.arcadeModes !== 9 || lobby.skillLevels !== 3) {
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
if (
  !revealBoundsBeforeReport ||
  !reportMenu.panelBounds ||
  layoutDelta(revealBoundsBeforeReport, reportMenu.panelBounds) > 1 ||
  reportMenu.reasons.join(",") !== "incorrect,outdated,ambiguous,unclear" ||
  !reportMenu.menuFits ||
  !reportCarryover.visible ||
  reportCarryover.phase !== "answering" ||
  !reportCarryover.prompt ||
  !reportCarryover.answerVisible ||
  reportCarryover.reasons !== 4 ||
  !reportCarryover.fits ||
  !reportResult.label?.includes("Ambiguous") ||
  !reportResult.menuClosed ||
  !reportResult.carryoverClosed ||
  !reportResult.answering
) {
  failures.push("The report flow shifts, disappears during round rollover, or fails to confirm.");
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
  fogClarityOne.skill !== "open" ||
  !fogClarityOne.filter.includes("blur(17px)") ||
  !fogClarityTwo.filter.includes("blur(10px)") ||
  !fogClarityThree.filter.includes("blur(6px)") ||
  !fogTierFilters.learning?.includes("blur(13px)") ||
  !fogTierFilters.open?.includes("blur(17px)") ||
  !fogTierFilters.veteran?.includes("blur(21px)") ||
  !fogFinalTierFilters.learning?.includes("blur(4px)") ||
  !fogFinalTierFilters.open?.includes("blur(6px)") ||
  !fogFinalTierFilters.veteran?.includes("blur(8px)")
) {
  failures.push("Fogged Vision challenge levels do not produce the intended progressive clarity curve.");
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
  !counterplayPreview.active ||
  !counterplayPreview.prompt ||
  counterplayPreview.timer !== "00:15" ||
  counterplayPreview.answers !== 4 ||
  !counterplayPreview.artworkLoaded
) {
  failures.push("Counterplay lobby preview is incomplete.");
}
if (
  counterplay.game !== "counterplay" ||
  !counterplay.kind?.startsWith("counterplay-") ||
  !counterplay.family ||
  !counterplay.format ||
  !counterplay.prompt ||
  counterplay.promptWords > 5 ||
  !counterplay.tool ||
  (counterplay.format === "interaction-scenario" ? Boolean(counterplay.note) : !counterplay.note) ||
  (counterplay.format === "interaction-scenario"
    ? !counterplay.diagram || counterplay.toolArtworks < 1 || !counterplay.toolArtworksLoaded
    : counterplay.diagram || counterplay.toolArtworks !== 0) ||
  counterplay.difficulty < 2 ||
  counterplay.answerCount !== 4 ||
  counterplay.answerImages !== (counterplay.format === "interaction-scenario" ? 0 : 4) ||
  counterplay.horizontalOverflow ||
  counterplayReveal.correctAnswers !== 1 ||
  !counterplayReveal.explanation ||
  counterplayReveal.sourceLabelVisible ||
  counterplayReveal.horizontalOverflow
) {
  failures.push("Counterplay mechanic round or reveal is incomplete.");
}
if (!mapPreview.visible || !mapPreview.imageLoaded || mapPreview.bands !== 4) {
  failures.push("Map Sense lobby preview is incomplete.");
}
if (
  requiredMapKinds.some((kind) => !mapVariantKinds.has(kind)) ||
  mapVariants.some((variant) => !validMapVariant(variant)) ||
  mapReveals.some((reveal) => !validMapReveal(reveal))
) {
  failures.push("Veteran Map Sense did not rotate cleanly through all four Dota-native rounds and reveals.");
}
if (
  spellLink.horizontalOverflow ||
  foggedVision.horizontalOverflow ||
  echoHunt.horizontalOverflow ||
  quoteHunt.horizontalOverflow ||
  counterplay.horizontalOverflow ||
  counterplayReveal.horizontalOverflow ||
  mapVariants.some((variant) => variant.horizontalOverflow) ||
  mapReveals.some((reveal) => reveal.horizontalOverflow) ||
  reportMenu.horizontalOverflow ||
  reportCarryover.horizontalOverflow ||
  reportResult.horizontalOverflow ||
  mobile.horizontalOverflow ||
  mobileMap.horizontalOverflow ||
  mobileQuestion.horizontalOverflow ||
  calibrationDesktop.horizontalOverflow ||
  calibrationMobile.horizontalOverflow
) {
  failures.push("An arcade screen overflows horizontally.");
}
if (mobileQuestion.answerCount !== 4) failures.push("The mobile round is missing answers.");
if (
  !requiredMapKinds.includes(mobileMap.kind) ||
  !mobileMap.boardFits ||
  !mobileMap.square ||
  !mobileMap.visualFits ||
  (mobileMap.kind === "map-crop" && !mobileMap.cropVisible) ||
  (mobileMap.kind !== "map-crop" &&
    (!mobileMap.mechanicVisible || mobileMap.choiceOptions !== 4 || mobileMap.choiceAnswers !== 4))
) {
  failures.push("The mobile Veteran Map Sense puzzle does not fit the viewport.");
}
if (
  !calibrationDesktop.dashboard ||
  calibrationDesktop.stats !== 4 ||
  calibrationDesktop.filters !== 5 ||
  calibrationDesktop.rows < 1 ||
  calibrationDesktop.reportedRows < 1 ||
  !calibrationDesktop.guardrail ||
  !calibrationDesktop.aggregateOnly ||
  calibrationDesktop.questionFontSize < 14
) {
  failures.push("The desktop calibration lab is incomplete, unreadable, or missing its guardrails.");
}
if (
  calibrationMobile.rows < 1 ||
  calibrationMobile.filters !== 5 ||
  !calibrationMobile.rowFits ||
  calibrationMobile.questionFontSize < 14
) {
  failures.push("The mobile calibration lab does not fit or keep its question text readable.");
}
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
      revealBoundsBeforeReport,
      reportMenu,
      reportCarryover,
      reportResult,
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
      fogTierFilters,
      fogClarityOne,
      fogClarityTwo,
      fogClarityThree,
      fogFinalTierFilters,
      fogRound,
      fogNextRound,
      echoHunt,
      quoteHunt,
      counterplayPreview,
      counterplay,
      counterplayReveal,
      mapPreview,
      mapSenseAnswering,
      mapVariants,
      mapSenseReveal,
      mapReveals,
      mobile,
      mobileMap,
      mobileQuestion,
      calibrationDesktop,
      calibrationMobile,
      browserErrors,
    },
    null,
    2,
  ),
);

if (failures.length) {
  throw new Error(failures.join("\n"));
}

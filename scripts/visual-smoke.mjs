#!/usr/bin/env node

import { writeFile } from "node:fs/promises";

const debuggingUrl = process.env.CHROME_DEBUG_URL ?? "http://127.0.0.1:9222";
const appUrl = process.env.APP_URL ?? "http://localhost:3000";

function testToneWavBase64(durationSeconds = 2, sampleRate = 8_000) {
  const sampleCount = Math.round(durationSeconds * sampleRate);
  const dataLength = sampleCount * 2;
  const wav = Buffer.alloc(44 + dataLength);
  wav.write("RIFF", 0);
  wav.writeUInt32LE(36 + dataLength, 4);
  wav.write("WAVE", 8);
  wav.write("fmt ", 12);
  wav.writeUInt32LE(16, 16);
  wav.writeUInt16LE(1, 20);
  wav.writeUInt16LE(1, 22);
  wav.writeUInt32LE(sampleRate, 24);
  wav.writeUInt32LE(sampleRate * 2, 28);
  wav.writeUInt16LE(2, 32);
  wav.writeUInt16LE(16, 34);
  wav.write("data", 36);
  wav.writeUInt32LE(dataLength, 40);
  for (let sample = 0; sample < sampleCount; sample += 1) {
    wav.writeInt16LE(Math.round(Math.sin((sample / sampleRate) * Math.PI * 2 * 440) * 512), 44 + sample * 2);
  }
  return wav.toString("base64");
}

const echoTestAudioBase64 = testToneWavBase64();
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
let echoAudioFixtureEnabled = false;
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

  if (payload.method === "Fetch.requestPaused") {
    const request = echoAudioFixtureEnabled
      ? send("Fetch.fulfillRequest", {
          requestId: payload.params.requestId,
          responseCode: 200,
          responsePhrase: "OK",
          responseHeaders: [
            { name: "Content-Type", value: "audio/wav" },
            { name: "Cache-Control", value: "no-store" },
            { name: "Access-Control-Allow-Origin", value: "*" },
          ],
          body: echoTestAudioBase64,
        })
      : send("Fetch.continueRequest", { requestId: payload.params.requestId });
    void request.catch((error) => browserErrors.push(`Audio fixture interception failed: ${error.message}`));
    return;
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

async function trustedClick(selector) {
  const center = await evaluate(`(() => {
    const bounds = document.querySelector(${JSON.stringify(selector)})?.getBoundingClientRect();
    return bounds ? { x: bounds.left + bounds.width / 2, y: bounds.top + bounds.height / 2 } : null;
  })()`);
  if (!center) throw new Error(`Could not click missing element: ${selector}`);
  await send("Input.dispatchMouseEvent", {
    type: "mousePressed",
    x: center.x,
    y: center.y,
    button: "left",
    clickCount: 1,
  });
  await send("Input.dispatchMouseEvent", {
    type: "mouseReleased",
    x: center.x,
    y: center.y,
    button: "left",
    clickCount: 1,
  });
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
  arcadeModeLinks: [...document.querySelectorAll("[data-arcade-mode]")]
    .filter((element) => element.tagName === "A" && element.getAttribute("href"))
    .length,
  levelControls: document.querySelectorAll('[data-skill-level], [aria-label="Challenge level"]').length,
  volumeControl: Boolean(document.querySelector('[data-testid="game-volume"]')),
  volumeValue: document.querySelector('[data-testid="game-volume"]')?.value,
  volumeLabel: document.querySelector('[data-testid="game-volume"]')?.nextElementSibling?.textContent,
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
const triviaLobby = await evaluate(`({
  selectedLabel: document.querySelector('[data-arcade-mode="trivia"][aria-current="page"] strong')?.textContent,
  selectedUrl: location.pathname + location.search,
  categoryControls: document.querySelectorAll('[role="group"][aria-label="Question pool"] button').length,
  rule: document.querySelector('[data-testid="mode-settings"] p')?.textContent
})`);
await screenshot("/tmp/queue-arcade-trivia-lobby.png");

await evaluate(`document.querySelector('[data-testid="start-arcade"]')?.click()`);
await waitFor(`(() => {
  const main = document.querySelector("main");
  const timer = Number(document.querySelector('[data-testid="round-timer"]')?.textContent);
  return main?.dataset.phase === "answering" && timer >= 3;
})()`);
const sharedPoolRound = await evaluate(`({
  difficultyLabelVisible: Boolean(document.querySelector('[data-testid="round-difficulty"]')),
  contentDifficulty: Number(document.querySelector('[data-testid="public-room"]')?.dataset.contentDifficulty),
  roomId: document.querySelector("main")?.dataset.roomId,
  answerCount: document.querySelectorAll('[data-testid="arcade-answer"]').length
})`);
await evaluate(`document.querySelector('[data-testid="end-session"]')?.click()`);
await delay(250);

await navigate(appUrl);
await evaluate(`(() => {
  document.querySelector('[data-arcade-mode="shopkeeper"]')?.click();
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
  oldComponentCheckVisible: document.body.innerText.toLowerCase().includes("component check"),
  format: document.querySelector('[data-shopkeeper-format]')?.dataset.shopkeeperFormat,
  targetItemVisible: document.body.innerText.toLowerCase().includes("target item"),
  promptItemCount: document.querySelectorAll('[data-testid="shopkeeper-prompt-items"] img').length,
  recipeChoiceCount: document.querySelectorAll('[data-testid="shopkeeper-recipe-choice"]').length,
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
  return main?.dataset.phase === "answering" &&
    timer >= 10 &&
    Boolean(document.querySelector('[data-testid="spell-artwork-locked"]')) &&
    !document.querySelector('[data-testid="spell-ability-artwork"]');
})()`);
await screenshot("/tmp/queue-arcade-spell-link.png");

const spellLink = await evaluate(`({
  modeVisible: document.body.innerText.toLowerCase().includes("spell link"),
  clueOneText: document.querySelector('[data-testid="spell-clue-1"]')?.innerText,
  heroAnswers: document.querySelectorAll('[data-testid="arcade-answer"] img').length,
  heroImagesLoaded: [...document.querySelectorAll('[data-testid="arcade-answer"] img')]
    .every((image) => image.complete && image.naturalWidth > 0),
  questionArtworkHidden:
    Boolean(document.querySelector('[data-testid="spell-artwork-locked"]')) &&
    !document.querySelector('[data-testid="spell-ability-artwork"]'),
  answerCount: document.querySelectorAll('[data-testid="arcade-answer"]').length,
  difficultyLabelVisible: Boolean(document.querySelector('[data-testid="round-difficulty"]')),
  contentDifficulty: Number(document.querySelector('[data-testid="public-room"]')?.dataset.contentDifficulty),
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
  artworkStillHidden:
    Boolean(document.querySelector('[data-testid="spell-artwork-locked"]')) &&
    !document.querySelector('[data-testid="spell-ability-artwork"]'),
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
    !document.querySelector('[data-testid="spell-clue-3"]')?.innerText.includes("unlock") &&
    document.querySelector('[data-testid="spell-ability-artwork"]')?.dataset.artworkState === "loaded"`,
  8_000,
);
const spellFinalClue = await evaluate(`({
  text: document.querySelector('[data-testid="spell-clue-3"]')?.innerText,
  artworkLoaded:
    document.querySelector('[data-testid="spell-ability-artwork"]')?.dataset.artworkState === "loaded",
  lockedArtworkGone: !document.querySelector('[data-testid="spell-artwork-locked"]')
})`);
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
const fogClarityOne = await evaluate(`(() => {
  const image = document.querySelector('[data-testid="question-artwork"] img');
  return {
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
  return true;
})()`);
echoAudioFixtureEnabled = true;
await send("Fetch.enable", {
  patterns: [{ urlPattern: "https://dotabase.dillerm.io/vpk/sounds/vo/*", requestStage: "Request" }],
});
await delay(350);
await evaluate(`document.querySelector('[data-testid="start-arcade"]')?.click()`);
let freshEchoRound = false;
for (let attempt = 0; attempt < 3; attempt += 1) {
  await waitFor(`(() => {
    const main = document.querySelector("main");
    return main?.dataset.phase === "answering" && main?.dataset.questionKind === "hero-voice";
  })()`);
  await delay(800);
  freshEchoRound = await evaluate(`(() => {
    const prompt = document.querySelector('[data-testid="round-prompt"]');
    const timer = Number(document.querySelector('[data-testid="round-timer"]')?.textContent);
    const audio = document.querySelector("audio");
    return prompt?.dataset.echoStage === "1" && timer >= 13 && Boolean(audio);
  })()`);
  if (freshEchoRound) break;
  await waitFor(`document.querySelector("main")?.dataset.phase === "reveal"`);
  await waitFor(`document.querySelector("main")?.dataset.phase === "answering"`);
}
if (!freshEchoRound) throw new Error("Could not synchronize onto a fresh Echo Hunt round.");
await waitFor(`(() => {
  const audio = document.querySelector('[data-testid="round-audio-clip"]');
  return audio?.readyState >= 2 &&
    Number(audio.duration) >= 1.9 &&
    document.querySelector('[data-testid="echo-player"]')?.dataset.audioState === "ready";
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
  revealStage: Number(document.querySelector('[data-testid="echo-player"]')?.dataset.revealStage),
  revealMeter: document.querySelectorAll('[class*="soundRevealMeterActive"]').length,
  horizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth
})`);
const echoStageOne = await evaluate(`(() => {
  const audio = document.querySelector('[data-testid="round-audio-clip"]');
  return {
    stage: Number(document.querySelector('[data-testid="echo-player"]')?.dataset.revealStage),
    playCount: Number(document.querySelector('[data-testid="echo-player"]')?.dataset.playCount),
    duration: audio?.duration,
    cutDurations: [Number(audio?.dataset.cutDuration)],
    revealMeter: document.querySelectorAll('[class*="soundRevealMeterActive"]').length
  };
})()`);
await screenshot("/tmp/queue-arcade-echo-hunt.png");
await waitFor(
  `(() => {
    const player = document.querySelector('[data-testid="echo-player"]');
    return player?.dataset.revealStage === "2" && player?.dataset.audioState === "ready";
  })()`,
  8_000,
);
const echoStageTwo = await evaluate(`(() => {
  const audio = document.querySelector('[data-testid="round-audio-clip"]');
  return {
    stage: Number(document.querySelector('[data-testid="echo-player"]')?.dataset.revealStage),
    playCount: Number(document.querySelector('[data-testid="echo-player"]')?.dataset.playCount),
    duration: audio?.duration,
    cutDurations: [Number(audio?.dataset.cutDuration)],
    revealMeter: document.querySelectorAll('[class*="soundRevealMeterActive"]').length
  };
})()`);
await waitFor(
  `(() => {
    const player = document.querySelector('[data-testid="echo-player"]');
    return player?.dataset.revealStage === "3" && player?.dataset.audioState === "ready";
  })()`,
  8_000,
);
const echoStageThree = await evaluate(`(() => {
  const audio = document.querySelector('[data-testid="round-audio-clip"]');
  return {
    stage: Number(document.querySelector('[data-testid="echo-player"]')?.dataset.revealStage),
    playCount: Number(document.querySelector('[data-testid="echo-player"]')?.dataset.playCount),
    duration: audio?.duration,
    cutDurations: [Number(audio?.dataset.cutDuration)],
    revealMeter: document.querySelectorAll('[class*="soundRevealMeterActive"]').length
  };
})()`);
echoAudioFixtureEnabled = false;
await send("Fetch.disable");

await navigate(appUrl);
await evaluate(`(() => {
  const volume = document.querySelector('[data-testid="game-volume"]');
  const valueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
  if (!volume || !valueSetter) return false;
  valueSetter.call(volume, "35");
  volume.dispatchEvent(new Event("input", { bubbles: true }));
  volume.dispatchEvent(new Event("change", { bubbles: true }));
  return true;
})()`);
await waitFor(`(() => {
  const settings = JSON.parse(localStorage.getItem("queue-arcade:settings:v2") ?? "{}");
  return document.querySelector('[data-testid="game-volume"]')?.value === "35" &&
    document.querySelector('[data-testid="game-volume"]')?.nextElementSibling?.textContent === "35%" &&
    settings.gameVolume === 0.35;
})()`);
const volumeAfterAdjustment = await evaluate(`({
  value: document.querySelector('[data-testid="game-volume"]')?.value,
  label: document.querySelector('[data-testid="game-volume"]')?.nextElementSibling?.textContent,
  soundEnabled: Boolean(document.querySelector('button[aria-label="Mute game sounds"]'))
})`);
await evaluate(`(() => {
  document.querySelector('button[aria-label="Enable game sounds"]')?.click();
  document.querySelector('[data-arcade-mode="soundcheck"]')?.click();
  return true;
})()`);
await delay(350);
await trustedClick('[data-testid="start-arcade"]');
let soundSequenceFound = false;
for (let attempt = 0; attempt < 8; attempt += 1) {
  await waitFor(`(() => {
    const main = document.querySelector("main");
    return main?.dataset.phase === "answering" &&
      main?.dataset.questionKind?.startsWith("soundcheck-");
  })()`);
  const isSoundSequence = await evaluate(`(() => {
    const prompt = document.querySelector('[data-testid="round-prompt"]');
    return prompt?.dataset.soundcheckFormat === "sequence";
  })()`);
  if (isSoundSequence) {
    const sequenceRoundId = await evaluate(`document.querySelector("main")?.dataset.roundId`);
    while (
      !soundSequenceFound &&
      (await evaluate(`(() => {
        const main = document.querySelector("main");
        return main?.dataset.roundId === ${JSON.stringify(sequenceRoundId)} &&
          main?.dataset.phase === "answering" &&
          document.querySelector('[data-testid="round-prompt"]')?.dataset.soundcheckStage === "1";
      })()`))
    ) {
      soundSequenceFound = await evaluate(`(() => {
        const timer = Number(document.querySelector('[data-testid="round-timer"]')?.textContent);
        const audio = [...document.querySelectorAll('[data-testid="round-audio-clip"]')];
        const answers = [...document.querySelectorAll('[data-testid="arcade-answer"] img')];
        return timer >= 10 &&
          audio.length === 2 &&
          audio.every((clip) => clip.readyState >= 2) &&
          answers.length === 8 &&
          answers.every((image) => image.complete && image.naturalWidth > 0);
      })()`);
      if (!soundSequenceFound) await delay(200);
    }
  }
  if (soundSequenceFound) break;
  await waitFor(`document.querySelector("main")?.dataset.phase === "reveal"`);
  await waitFor(`document.querySelector("main")?.dataset.phase === "answering"`);
}
if (!soundSequenceFound) throw new Error("A playable Soundcheck sequence was not scheduled in the shared pool.");
await waitFor(`(() => {
  const main = document.querySelector("main");
  const timer = Number(document.querySelector('[data-testid="round-timer"]')?.textContent);
  const audio = [...document.querySelectorAll('[data-testid="round-audio-clip"]')];
  const answers = [...document.querySelectorAll('[data-testid="arcade-answer"] img')];
  return main?.dataset.phase === "answering" &&
    main?.dataset.questionKind?.startsWith("soundcheck-") &&
    document.querySelector('[data-testid="round-prompt"]')?.dataset.soundcheckStage === "1" &&
    timer >= 9 &&
    Number(document.querySelector('[data-testid="soundcheck-player"]')?.dataset.playCount) === 1 &&
    document.querySelector('[data-testid="soundcheck-player"]')?.dataset.audioState === "ready" &&
    audio.length === 2 &&
    audio.every((clip) => clip.readyState >= 2) &&
    answers.length === 8 &&
    answers.every((image) => image.complete && image.naturalWidth > 0);
})()`);
const soundcheckInitial = await evaluate(`(() => {
  const main = document.querySelector("main");
  const prompt = document.querySelector('[data-testid="round-prompt"]');
  const player = document.querySelector('[data-testid="soundcheck-player"]');
  const room = document.querySelector('[data-testid="public-room"]');
  const audio = [...document.querySelectorAll('[data-testid="round-audio-clip"]')];
  return {
    game: document.querySelector('[data-testid="public-room"]')?.dataset.roundGame,
    kind: main?.dataset.questionKind,
    family: prompt?.dataset.soundcheckFamily,
    format: prompt?.dataset.soundcheckFormat,
    scope: prompt?.dataset.soundcheckScope,
    difficulty: Number(room?.dataset.contentDifficulty),
    revealStage: Number(prompt?.dataset.soundcheckStage),
    revealMeter: document.querySelectorAll('[class*="soundRevealMeterActive"]').length,
    prompt: prompt?.querySelector("h2")?.textContent,
    answerCount: document.querySelectorAll('[data-testid="arcade-answer"]').length,
    answerImages: document.querySelectorAll('[data-testid="arcade-answer"] img').length,
    pairChoices: document.querySelectorAll('[data-testid="sound-sequence-choice"]').length,
    pairLabels: [...document.querySelectorAll('[data-testid="arcade-answer"]')].map((answer) =>
      answer.getAttribute("aria-label")
    ),
    answerImagesLoaded: [...document.querySelectorAll('[data-testid="arcade-answer"] img')]
      .every((image) => image.complete && image.naturalWidth > 0),
    audioReady: audio.length === 2 && audio.every((clip) => clip.readyState >= 2),
    audioSources: audio.map((clip) => clip.currentSrc),
    audioDurations: audio.map((clip) => clip.duration),
    cutDurations: audio.map((clip) => Number(clip.dataset.cutDuration)),
    audioVolumes: audio.map((clip) => clip.volume),
    clipCount: Number(player?.dataset.clipCount),
    replayButton: Boolean(document.querySelector('[data-testid="soundcheck-play"]')),
    autoplayIndicator: Boolean(document.querySelector('[data-testid="soundcheck-autoplay"]')),
    playCount: Number(player?.dataset.playCount),
    soundEnabled: Boolean(document.querySelector('button[aria-label="Mute game sounds"]')),
    volumeValue: document.querySelector('[data-testid="game-volume"]')?.value,
    horizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth
  };
})()`);
await waitFor(
  `(() => {
    const player = document.querySelector('[data-testid="soundcheck-player"]');
    return Number(player?.dataset.playCount) === 1 &&
      player?.dataset.revealStage === "1" &&
      player?.dataset.audioState === "ready";
  })()`,
  5_000,
);
const soundcheckStageOne = await evaluate(`(() => {
  const audio = [...document.querySelectorAll('[data-testid="round-audio-clip"]')];
  return {
    stage: Number(document.querySelector('[data-testid="soundcheck-player"]')?.dataset.revealStage),
    playCount: Number(document.querySelector('[data-testid="soundcheck-player"]')?.dataset.playCount),
    cutDurations: audio.map((clip) => Number(clip.dataset.cutDuration)),
    playedDurations: audio.map((clip) => clip.currentTime),
    revealMeter: document.querySelectorAll('[class*="soundRevealMeterActive"]').length
  };
})()`);
await evaluate(`document.querySelector('[data-testid="arcade-answer"]')?.click()`);
await waitFor(`document.querySelectorAll('[data-testid="arcade-answer"][disabled]').length === 4`);
const soundcheckLockedAnswer = await evaluate(`({
  locked: document.querySelectorAll('[data-testid="arcade-answer"][disabled]').length === 4,
  playCount: Number(document.querySelector('[data-testid="soundcheck-player"]')?.dataset.playCount)
})`);
await waitFor(
  `(() => {
    const player = document.querySelector('[data-testid="soundcheck-player"]');
    return player?.dataset.revealStage === "2" &&
      Number(player?.dataset.playCount) === 2 &&
      player?.dataset.audioState === "ready";
  })()`,
  8_000,
);
const soundcheckStageTwo = await evaluate(`(() => {
  const audio = [...document.querySelectorAll('[data-testid="round-audio-clip"]')];
  return {
    stage: Number(document.querySelector('[data-testid="soundcheck-player"]')?.dataset.revealStage),
    playCount: Number(document.querySelector('[data-testid="soundcheck-player"]')?.dataset.playCount),
    cutDurations: audio.map((clip) => Number(clip.dataset.cutDuration)),
    playedDurations: audio.map((clip) => clip.currentTime),
    revealMeter: document.querySelectorAll('[class*="soundRevealMeterActive"]').length
  };
})()`);
await waitFor(
  `(() => {
    const player = document.querySelector('[data-testid="soundcheck-player"]');
    return player?.dataset.revealStage === "3" &&
      Number(player?.dataset.playCount) === 3 &&
      player?.dataset.audioState === "ready";
  })()`,
  8_000,
);
const soundcheckStageThree = await evaluate(`(() => {
  const audio = [...document.querySelectorAll('[data-testid="round-audio-clip"]')];
  return {
    stage: Number(document.querySelector('[data-testid="soundcheck-player"]')?.dataset.revealStage),
    playCount: Number(document.querySelector('[data-testid="soundcheck-player"]')?.dataset.playCount),
    cutDurations: audio.map((clip) => Number(clip.dataset.cutDuration)),
    playedDurations: audio.map((clip) => clip.currentTime),
    revealMeter: document.querySelectorAll('[class*="soundRevealMeterActive"]').length,
    audioState: document.querySelector('[data-testid="soundcheck-player"]')?.dataset.audioState
  };
})()`);
await screenshot("/tmp/queue-arcade-soundcheck.png");
await send("Emulation.setDeviceMetricsOverride", {
  width: 390,
  height: 844,
  deviceScaleFactor: 1,
  mobile: true,
});
await delay(300);
const mobileSoundcheck = await evaluate(`(() => {
  const answers = [...document.querySelectorAll('[data-testid="arcade-answer"]')];
  const player = document.querySelector('[data-testid="soundcheck-player"]')?.getBoundingClientRect();
  return {
    answerCount: answers.length,
    pairChoices: document.querySelectorAll('[data-testid="sound-sequence-choice"]').length,
    pairImages: document.querySelectorAll('[data-testid="sound-sequence-choice"] img').length,
    answersFit: answers.every((answer) => {
      const bounds = answer.getBoundingClientRect();
      return bounds.left >= 0 && bounds.right <= innerWidth;
    }),
    playerFits: player ? player.left >= 0 && player.right <= innerWidth : false,
    horizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth
  };
})()`);
await screenshot("/tmp/queue-arcade-soundcheck-mobile.png");
await send("Emulation.setDeviceMetricsOverride", {
  width: 1440,
  height: 1000,
  deviceScaleFactor: 1,
  mobile: false,
});

await navigate(appUrl);
const persistedVolume = await evaluate(`({
  value: document.querySelector('[data-testid="game-volume"]')?.value,
  label: document.querySelector('[data-testid="game-volume"]')?.nextElementSibling?.textContent,
  stored: JSON.parse(localStorage.getItem("queue-arcade:settings:v2") ?? "{}").gameVolume
})`);
await evaluate(`(() => {
  document.querySelector('[data-arcade-mode="quote-hunt"]')?.click();
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
  eyebrow: document.querySelector('[data-testid="round-prompt"] [class*="questionCopy"] span')?.textContent,
  heading: document.querySelector('[data-testid="round-prompt"] [class*="questionCopy"] h2')?.textContent,
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
  return true;
})()`);
await delay(350);
const counterplayPreview = await evaluate(`({
  active: Boolean(document.querySelector('[data-arcade-mode="counterplay"][aria-current="page"]')),
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
    difficulty: Number(document.querySelector('[data-testid="public-room"]')?.dataset.contentDifficulty),
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

await navigate(`${appUrl}/?mode=map-sense`);
await delay(350);
const retiredMapSense = await evaluate(`({
  cardVisible: Boolean(document.querySelector('[data-arcade-mode="map-sense"]')),
  mixedSelected: Boolean(document.querySelector('[data-arcade-mode="mixed"][aria-current="page"]')),
  mapCopyVisible: document.body.innerText.includes("Map Sense")
})`);
await screenshot("/tmp/queue-arcade-retired-map-sense.png");

await send("Emulation.setDeviceMetricsOverride", {
  width: 390,
  height: 844,
  deviceScaleFactor: 1,
  mobile: true,
});
await navigate(appUrl);
await delay(250);
await screenshot("/tmp/queue-arcade-mobile.png");

const mobile = await evaluate(`({
  viewport: [innerWidth, innerHeight],
  horizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
  headingVisible: Boolean(document.querySelector("h1")?.getBoundingClientRect().height),
  volumeControl: Boolean(document.querySelector('[data-testid="game-volume"]')),
  volumeValue: document.querySelector('[data-testid="game-volume"]')?.value
})`);

await navigate(appUrl);
await evaluate(`(() => {
  document.querySelector('[data-arcade-mode="trivia"]')?.click();
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
const playbackMatchesCut = (stage) =>
  stage.cutDurations.length === stage.playedDurations.length &&
  stage.cutDurations.every((cut, index) => Math.abs(cut - stage.playedDurations[index]) <= 0.25);
const playbackReachedEnd = (stage, durations) =>
  stage.playedDurations.length === durations.length &&
  stage.playedDurations.every((played, index) => Math.abs(played - durations[index]) <= 0.25);
const cutsIncrease = (earlier, later) =>
  earlier.length === later.length && earlier.every((cut, index) => cut < later[index]);
if (!lobby.title.includes("Queue Arcade")) failures.push("The Queue Arcade metadata title is missing.");
if (
  !lobby.startButton ||
  lobby.arcadeModes !== 9 ||
  lobby.arcadeModeLinks !== 9 ||
  lobby.levelControls !== 0 ||
  !lobby.volumeControl ||
  lobby.volumeValue !== "70" ||
  lobby.volumeLabel !== "70%"
) {
  failures.push("The arcade lobby controls are incomplete.");
}
if (lobby.horizontalOverflow) failures.push("The desktop lobby overflows horizontally.");
if (Math.abs(brandAlignment.markCenter - brandAlignment.copyCenter) > 0.5) {
  failures.push("The header logo and brand copy are not vertically aligned.");
}
if (layoutDelta(lobbyLayout, triviaLobbyLayout) > 1) {
  failures.push("Selecting Classic Trivia shifts the lobby layout.");
}
if (
  triviaLobby.selectedLabel !== "Classic Trivia" ||
  triviaLobby.selectedUrl !== "/?mode=trivia" ||
  triviaLobby.categoryControls !== 0 ||
  !triviaLobby.rule?.includes("One shared pool")
) {
  failures.push("Classic Trivia still exposes category silos or has unclear lobby framing.");
}
if (
  sharedPoolRound.difficultyLabelVisible ||
  sharedPoolRound.contentDifficulty < 1 ||
  sharedPoolRound.contentDifficulty > 3 ||
  /:(?:open|learning|veteran)$/.test(sharedPoolRound.roomId ?? "") ||
  sharedPoolRound.answerCount !== 4
) {
  failures.push("The shared trivia pool still exposes or encodes a player-facing level.");
}
if (
  !shopkeeper.modeVisible ||
  shopkeeper.oldComponentCheckVisible ||
  !["build-result", "real-recipe", "shared-part", "upgrade-path"].includes(shopkeeper.format) ||
  (shopkeeper.format === "real-recipe"
    ? !shopkeeper.targetItemVisible || shopkeeper.recipeChoiceCount !== 4
    : shopkeeper.promptItemCount < 1) ||
  /which component belongs|finish the recipe/i.test(shopkeeper.prompt ?? "") ||
  shopkeeper.answers.length !== 4
) {
  failures.push("Shopkeeper Rush did not render one of its four recipe formats clearly.");
}
if (shopkeeper.answerImages < 4 || !shopkeeper.answerImagesLoaded) {
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
  !spellLink.clueOneText ||
  /no additional mechanical clue|belongs to/i.test(spellLink.clueOneText) ||
  spellLink.answerCount !== 4 ||
  spellLink.difficultyLabelVisible ||
  spellLink.contentDifficulty < 1 ||
  spellLink.contentDifficulty > 3
) {
  failures.push("Spell Link did not start.");
}
if (
  spellLink.heroAnswers !== 4 ||
  !spellLink.heroImagesLoaded ||
  !spellLink.questionArtworkHidden ||
  !spellClue.clueTwoUnlocked ||
  !spellClue.artworkStillHidden
) {
  failures.push("Spell Link artwork or progressive clues failed.");
}
if (
  !spellFinalClue.text?.includes("Ability icon revealed") ||
  !spellFinalClue.artworkLoaded ||
  !spellFinalClue.lockedArtworkGone
) {
  failures.push("Spell Link did not preserve description → name → icon reveal order.");
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
  !fogClarityOne.filter.includes("blur(17px)") ||
  !fogClarityTwo.filter.includes("blur(10px)") ||
  !fogClarityThree.filter.includes("blur(6px)")
) {
  failures.push("Fogged Vision does not preserve the intended shared progressive clarity curve.");
}
if (
  echoHunt.answerCount !== 4 ||
  echoHunt.answerImages !== 4 ||
  !echoHunt.answerImagesLoaded ||
  !echoHunt.audioReady ||
  !echoHunt.audioSource?.includes("dotabase.dillerm.io") ||
  !echoHunt.replayButton ||
  echoHunt.revealStage !== 1 ||
  echoHunt.revealMeter !== 1 ||
  echoHunt.playerState !== "ready" ||
  echoStageOne.stage !== 1 ||
  echoStageOne.playCount !== 0 ||
  echoStageOne.revealMeter !== 1 ||
  !Number.isFinite(echoStageOne.duration) ||
  echoStageOne.cutDurations[0] <= 0 ||
  echoStageOne.cutDurations[0] > 0.32 ||
  echoStageOne.cutDurations[0] >= echoStageOne.duration ||
  echoStageTwo.stage !== 2 ||
  echoStageTwo.playCount !== 0 ||
  echoStageTwo.revealMeter !== 2 ||
  echoStageTwo.cutDurations[0] > 0.75 ||
  echoStageTwo.cutDurations[0] >= echoStageTwo.duration ||
  !cutsIncrease(echoStageOne.cutDurations, echoStageTwo.cutDurations) ||
  echoStageThree.stage !== 3 ||
  echoStageThree.playCount !== 0 ||
  echoStageThree.revealMeter !== 3 ||
  Math.abs(echoStageThree.cutDurations[0] - echoStageThree.duration) > 0.01 ||
  !cutsIncrease(echoStageTwo.cutDurations, echoStageThree.cutDurations)
) {
  failures.push("Echo Hunt progressive cut contract, mute safety, or hero choices failed.");
}
if (
  soundcheckInitial.game !== "soundcheck" ||
  !soundcheckInitial.kind?.startsWith("soundcheck-") ||
  !["ability", "item"].includes(soundcheckInitial.family) ||
  soundcheckInitial.kind !== `soundcheck-${soundcheckInitial.family}` ||
  soundcheckInitial.format !== "sequence" ||
  soundcheckInitial.scope !== "ordered-pair" ||
  soundcheckInitial.difficulty !== 3 ||
  soundcheckInitial.revealStage !== 1 ||
  soundcheckInitial.revealMeter !== 1 ||
  soundcheckInitial.prompt !== "Match both sounds." ||
  soundcheckInitial.answerCount !== 4 ||
  soundcheckInitial.answerImages !== 8 ||
  soundcheckInitial.pairChoices !== 4 ||
  soundcheckInitial.pairLabels.some((label) => !label?.includes(" → ")) ||
  !soundcheckInitial.answerImagesLoaded ||
  !soundcheckInitial.audioReady ||
  soundcheckInitial.audioSources.length !== 2 ||
  soundcheckInitial.audioSources.some(
    (source) => !source?.includes("dotabase.dillerm.io/vpk/sounds/") || !source.endsWith(".wav"),
  ) ||
  soundcheckInitial.audioDurations.some((duration) => !Number.isFinite(duration) || duration <= 0) ||
  soundcheckInitial.cutDurations.some(
    (cut, index) => !Number.isFinite(cut) || cut <= 0 || cut >= soundcheckInitial.audioDurations[index],
  ) ||
  soundcheckInitial.audioVolumes.some((volume) => typeof volume !== "number" || Math.abs(volume - 0.35) > 0.001) ||
  soundcheckInitial.clipCount !== 2 ||
  soundcheckInitial.replayButton ||
  !soundcheckInitial.autoplayIndicator ||
  soundcheckInitial.playCount !== 1 ||
  !soundcheckInitial.soundEnabled ||
  soundcheckInitial.volumeValue !== "35" ||
  soundcheckInitial.horizontalOverflow ||
  soundcheckStageOne.stage !== 1 ||
  soundcheckStageOne.playCount !== 1 ||
  soundcheckStageOne.revealMeter !== 1 ||
  !playbackMatchesCut(soundcheckStageOne) ||
  !soundcheckLockedAnswer.locked ||
  soundcheckLockedAnswer.playCount !== 1 ||
  soundcheckStageTwo.stage !== 2 ||
  soundcheckStageTwo.playCount !== 2 ||
  soundcheckStageTwo.revealMeter !== 2 ||
  !cutsIncrease(soundcheckStageOne.cutDurations, soundcheckStageTwo.cutDurations) ||
  !playbackMatchesCut(soundcheckStageTwo) ||
  soundcheckStageThree.stage !== 3 ||
  soundcheckStageThree.playCount !== 3 ||
  soundcheckStageThree.revealMeter !== 3 ||
  soundcheckStageThree.audioState !== "ready" ||
  !cutsIncrease(soundcheckStageTwo.cutDurations, soundcheckStageThree.cutDurations) ||
  !playbackReachedEnd(soundcheckStageThree, soundcheckInitial.audioDurations) ||
  mobileSoundcheck.answerCount !== 4 ||
  mobileSoundcheck.pairChoices !== 4 ||
  mobileSoundcheck.pairImages !== 8 ||
  !mobileSoundcheck.answersFit ||
  !mobileSoundcheck.playerFits ||
  mobileSoundcheck.horizontalOverflow ||
  volumeAfterAdjustment.value !== "35" ||
  volumeAfterAdjustment.label !== "35%" ||
  !volumeAfterAdjustment.soundEnabled ||
  persistedVolume.value !== "35" ||
  persistedVolume.label !== "35%" ||
  persistedVolume.stored !== 0.35
) {
  failures.push("Soundcheck progressive cuts, sequence playback, volume persistence, or mute safety failed.");
}
if (
  (quoteHunt.text?.length ?? 0) < 28 ||
  (quoteHunt.text?.match(/[a-z]+(?:['’-][a-z]+)*/gi)?.length ?? 0) < 5 ||
  quoteHunt.eyebrow !== "Quote Hunt" ||
  quoteHunt.heading !== "Who said it?" ||
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
  counterplay.difficulty < 1 ||
  counterplay.difficulty > 3 ||
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
if (retiredMapSense.cardVisible || !retiredMapSense.mixedSelected || retiredMapSense.mapCopyVisible) {
  failures.push("The retired Map Sense mode is still discoverable or its old deep link does not fall back safely.");
}
if (
  spellLink.horizontalOverflow ||
  foggedVision.horizontalOverflow ||
  echoHunt.horizontalOverflow ||
  quoteHunt.horizontalOverflow ||
  counterplay.horizontalOverflow ||
  counterplayReveal.horizontalOverflow ||
  reportMenu.horizontalOverflow ||
  reportCarryover.horizontalOverflow ||
  reportResult.horizontalOverflow ||
  mobile.horizontalOverflow ||
  !mobile.volumeControl ||
  mobile.volumeValue !== "35" ||
  mobileQuestion.horizontalOverflow ||
  calibrationDesktop.horizontalOverflow ||
  calibrationMobile.horizontalOverflow
) {
  failures.push("An arcade screen overflows horizontally.");
}
if (mobileQuestion.answerCount !== 4) failures.push("The mobile round is missing answers.");
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
      triviaLobby,
      brandAlignment,
      sharedPoolRound,
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
      fogClarityOne,
      fogClarityTwo,
      fogClarityThree,
      fogRound,
      fogNextRound,
      echoHunt,
      echoStageOne,
      echoStageTwo,
      echoStageThree,
      volumeAfterAdjustment,
      soundcheckInitial,
      soundcheckLockedAnswer,
      soundcheckStageOne,
      soundcheckStageTwo,
      soundcheckStageThree,
      mobileSoundcheck,
      persistedVolume,
      quoteHunt,
      counterplayPreview,
      counterplay,
      counterplayReveal,
      retiredMapSense,
      mobile,
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

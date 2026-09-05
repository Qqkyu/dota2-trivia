#!/usr/bin/env node

/**
 * Live sound loop. Owns a muted Chrome so speakers stay quiet.
 * Recreated 2026-08-18: earlier checks used a leftover unmuted tab,
 * JS .click() (not a user gesture), and one happy-path round. That
 * could not catch a missed lock, a rejected play(), or a hidden tab.
 *
 * One command: pnpm check:sounds
 * Fail if lock or result play() is missing, rejects, or does not advance.
 */

import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";

const appUrl = process.env.APP_URL ?? "http://localhost:3000";
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function freePort() {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : 0;
      server.close((error) => (error ? reject(error) : resolve(port)));
    });
    server.on("error", reject);
  });
}

async function waitJson(url, timeout = 15_000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeout) {
    try {
      const response = await fetch(url);
      if (response.ok) return await response.json();
    } catch {
      // Chrome is still binding the port.
    }
    await delay(100);
  }
  throw new Error(`Chrome debug HTTP did not open at ${url}`);
}

function attachCdp(webSocketDebuggerUrl) {
  const socket = new WebSocket(webSocketDebuggerUrl);
  const pending = new Map();
  const eventWaiters = new Map();
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
    const waiters = eventWaiters.get(payload.method);
    if (waiters?.length) {
      eventWaiters.delete(payload.method);
      for (const resolve of waiters) resolve(payload.params);
    }
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

  async function waitFor(expression, timeout = 30_000) {
    const startedAt = Date.now();
    while (Date.now() - startedAt < timeout) {
      if (await evaluate(expression)) return;
      await delay(150);
    }
    throw new Error(`Timed out waiting for: ${expression}`);
  }

  return {
    socket,
    send,
    once,
    evaluate,
    waitFor,
    ready: new Promise((resolve, reject) => {
      socket.addEventListener("open", resolve, { once: true });
      socket.addEventListener("error", reject, { once: true });
    }),
  };
}

const HOOK = `(() => {
  window.__soundLog = [];
  window.__audios = [];
  const NativeAudio = window.Audio;
  const nativePlay = HTMLMediaElement.prototype.play;
  const nativePause = HTMLMediaElement.prototype.pause;
  const stamp = (extra) => ({
    at: Date.now(),
    hidden: Boolean(document.hidden),
    visibility: document.visibilityState,
    ...extra,
  });
  window.Audio = function (...args) {
    const audio = new NativeAudio(...args);
    window.__audios.push(audio);
    window.__soundLog.push(stamp({ type: "construct", src: String(args[0] ?? "") }));
    return audio;
  };
  window.Audio.prototype = NativeAudio.prototype;
  HTMLMediaElement.prototype.play = function () {
    const src = this.currentSrc || this.src;
    window.__soundLog.push(
      stamp({ type: "play", src, volume: this.volume, readyState: this.readyState, paused: this.paused }),
    );
    return nativePlay.apply(this, arguments).then(() => {
      window.__soundLog.push(stamp({ type: "play-ok", src, volume: this.volume, currentTime: this.currentTime }));
    }).catch((error) => {
      window.__soundLog.push(stamp({ type: "play-fail", src, volume: this.volume, error: String(error), name: error?.name }));
      throw error;
    });
  };
  HTMLMediaElement.prototype.pause = function () {
    const src = this.currentSrc || this.src;
    if (src) {
      window.__soundLog.push(stamp({ type: "pause", src, currentTime: this.currentTime }));
    }
    return nativePause.apply(this, arguments);
  };
  window.__clipState = (needle) => {
    const audio = window.__audios.find((entry) => String(entry.currentSrc || entry.src).includes(needle));
    if (!audio) return null;
    return {
      src: audio.currentSrc || audio.src,
      paused: audio.paused,
      currentTime: audio.currentTime,
      volume: audio.volume,
      readyState: audio.readyState,
      ended: audio.ended,
      hidden: Boolean(document.hidden),
      visibility: document.visibilityState,
    };
  };
})()`;

const port = await freePort();
const userDataDir = await mkdtemp(join(tmpdir(), "queue-arcade-sounds-"));
const chrome = spawn(
  "google-chrome",
  [
    "--headless=new",
    "--mute-audio",
    `--remote-debugging-port=${port}`,
    "--remote-allow-origins=*",
    `--user-data-dir=${userDataDir}`,
    "--no-first-run",
    "--disable-gpu",
    "--autoplay-policy=no-user-gesture-required",
    "--window-size=1280,900",
    "about:blank",
  ],
  { stdio: "ignore" },
);

const errors = [];
let page = null;
let browser = null;

async function cleanup() {
  try {
    await page?.send("Page.navigate", { url: "about:blank" });
  } catch {
    // already gone
  }
  try {
    page?.socket.close();
  } catch {
    // already gone
  }
  try {
    browser?.socket.close();
  } catch {
    // already gone
  }
  chrome.kill("SIGKILL");
  await rm(userDataDir, { recursive: true, force: true }).catch(() => undefined);
}

function classify(src) {
  const value = String(src);
  if (value.includes("button_click")) return "lock";
  if (value.includes("magic_immune")) return "wrong";
  if (value.includes("coins")) return "correct";
  if (value.includes("find_match") || value.includes("select_md")) return "start";
  return "other";
}

function ofKind(log, type, kind) {
  return log.filter((entry) => entry.type === type && classify(entry.src) === kind);
}

function unresolvedFails(log, kind) {
  const oks = ofKind(log, "play-ok", kind);
  return ofKind(log, "play-fail", kind).filter((fail) => !oks.some((ok) => ok.at >= fail.at));
}

async function waitKind(kind, timeout = 2_500) {
  return waitKinds([kind], timeout);
}

async function waitKinds(kinds, timeout = 2_500) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeout) {
    const log = await page.evaluate(`window.__soundLog`);
    if (kinds.some((kind) => ofKind(log, "play-ok", kind).length >= 1)) return log;
    await delay(50);
  }
  return page.evaluate(`window.__soundLog`);
}

async function clickSelector(selector, index = 0) {
  const box = await page.evaluate(`(() => {
    const node = document.querySelectorAll(${JSON.stringify(selector)})[${index}];
    if (!node) return null;
    const rect = node.getBoundingClientRect();
    if (rect.width < 2 || rect.height < 2) return null;
    return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
  })()`);
  if (!box) throw new Error(`No clickable node for ${selector}[${index}]`);
  await page.send("Input.dispatchMouseEvent", {
    type: "mousePressed",
    x: box.x,
    y: box.y,
    button: "left",
    clickCount: 1,
  });
  await page.send("Input.dispatchMouseEvent", {
    type: "mouseReleased",
    x: box.x,
    y: box.y,
    button: "left",
    clickCount: 1,
  });
  return box;
}

async function snapshotBoard() {
  return page.evaluate(`({
    phase: document.querySelector("main")?.dataset.phase ?? "",
    choice: document.querySelectorAll('[data-testid="arcade-answer"]:not([disabled])').length,
    yearLock: Boolean(document.querySelector('[data-testid="flashback-year-lock"]')),
    yearSlider: Boolean(document.querySelector('[data-testid="flashback-year-slider"]')),
    order: document.querySelectorAll('[data-testid="flashback-order-card"]').length,
    hero: document.querySelectorAll('[data-testid="hero-picker-hero"]').length,
    shop: document.querySelectorAll('[data-testid="shopkeeper-store-item"]').length,
    value: document.querySelectorAll('[data-testid="value-order-card"]').length,
    map: Boolean(document.querySelector('[data-testid="map-choice-option"], [data-testid="map-sense-board"]')),
    hidden: Boolean(document.hidden),
    visibility: document.visibilityState,
  })`);
}

async function releaseYearSlider() {
  const box = await page.evaluate(`(() => {
    const slider = document.querySelector('[data-testid="flashback-year-slider"]');
    if (!slider) return null;
    const rect = slider.getBoundingClientRect();
    return {
      x: rect.x + rect.width * 0.2,
      y: rect.y + rect.height / 2,
      disabled: slider.disabled,
    };
  })()`);
  if (!box || box.disabled) return null;
  await page.send("Input.dispatchMouseEvent", {
    type: "mousePressed",
    x: box.x,
    y: box.y,
    button: "left",
    clickCount: 1,
  });
  await page.send("Input.dispatchMouseEvent", {
    type: "mouseReleased",
    x: box.x,
    y: box.y,
    button: "left",
    clickCount: 1,
  });
  return box;
}

async function lockCurrentAnswer() {
  const board = await snapshotBoard();
  if (board.choice) {
    await clickSelector('[data-testid="arcade-answer"]', Math.max(0, board.choice - 1));
    return { ...board, action: "choice" };
  }
  if (board.yearSlider && board.yearLock) {
    // Moving the thumb only sets the year. The Lock button commits it.
    const released = await releaseYearSlider();
    await clickSelector('[data-testid="flashback-year-lock"]');
    return { ...board, action: "year-lock", released: Boolean(released) };
  }
  if (board.order) {
    for (let index = 0; index < board.order; index += 1) {
      await clickSelector('[data-testid="flashback-order-card"]', index);
      await delay(80);
    }
    return { ...board, action: "order" };
  }
  if (board.hero) {
    await clickSelector('[data-testid="hero-picker-hero"]');
    return { ...board, action: "hero" };
  }
  if (board.shop) {
    await clickSelector('[data-testid="shopkeeper-store-item"]');
    return { ...board, action: "shop" };
  }
  if (board.value) {
    await clickSelector('[data-testid="value-order-card"]');
    return { ...board, action: "value" };
  }
  if (board.map) {
    const selector = (await page.evaluate(`Boolean(document.querySelector('[data-testid="map-choice-option"]'))`))
      ? '[data-testid="map-choice-option"]'
      : '[data-testid="map-sense-board"]';
    await clickSelector(selector);
    return { ...board, action: "map" };
  }
  throw new Error(`No answer control in phase ${board.phase}`);
}

async function waitAnswering() {
  await page.waitFor(
    `location.pathname === "/play" && ["answering","reveal","waiting"].includes(document.querySelector("main")?.dataset.phase)`,
    40_000,
  );
  if (await page.evaluate(`document.querySelector("main")?.dataset.phase === "reveal"`)) {
    await page.waitFor(`document.querySelector("main")?.dataset.phase === "answering"`, 25_000);
  }
  if (await page.evaluate(`document.querySelector("main")?.dataset.phase === "waiting"`)) {
    await page.waitFor(`document.querySelector("main")?.dataset.phase === "answering"`, 25_000);
  }
  await page.waitFor(`document.querySelector("main")?.dataset.phase === "answering"`, 25_000);
}

try {
  const health = await fetch(`${appUrl}/play`);
  if (!health.ok) throw new Error(`App is not serving /play (${health.status}). Start pnpm dev.`);

  await waitJson(`http://127.0.0.1:${port}/json/version`);
  const version = await waitJson(`http://127.0.0.1:${port}/json/version`);
  browser = attachCdp(version.webSocketDebuggerUrl);
  await browser.ready;

  const created = await browser.send("Target.createTarget", { url: "about:blank" });
  const targets = await waitJson(`http://127.0.0.1:${port}/json/list`);
  const target =
    targets.find((entry) => entry.id === created.targetId) ??
    targets.find((entry) => entry.type === "page" && entry.webSocketDebuggerUrl);
  if (!target?.webSocketDebuggerUrl) throw new Error("Chrome opened without a debuggable page.");

  page = attachCdp(target.webSocketDebuggerUrl);
  await page.ready;
  await page.send("Page.enable");
  await page.send("Runtime.enable");
  await page.send("Page.addScriptToEvaluateOnNewDocument", { source: HOOK });

  const loaded = page.once("Page.loadEventFired");
  await page.send("Page.navigate", { url: `${appUrl}/play` });
  await loaded;
  await page.waitFor(`document.querySelector("main")?.dataset.clientReady === "true"`, 20_000);

  if (await page.evaluate(`Boolean(document.querySelector('[data-testid="start-arcade"]'))`)) {
    await clickSelector('[data-testid="start-arcade"]');
  }
  await waitAnswering();

  const volume = await page.evaluate(`Number(document.querySelector('[data-testid="game-volume"]')?.value)`);
  if (!(volume >= 60)) {
    errors.push(`Game volume is ${volume}%. Recreated inaudible lock/wrong at 10% default.`);
  }

  await page.evaluate(`window.__soundLog = []`);
  const focusedBoard = await lockCurrentAnswer();
  const focusedLockLog = await waitKind("lock");
  const afterFocusedLock = {
    log: focusedLockLog,
    lock: await page.evaluate(`window.__clipState("button_click")`),
  };
  const focusedLockPlays = ofKind(afterFocusedLock.log, "play-ok", "lock");
  const focusedLockFails = unresolvedFails(afterFocusedLock.log, "lock");
  const focusedLockCalls = ofKind(afterFocusedLock.log, "play", "lock");

  if (focusedLockFails.length) {
    errors.push(`Focused lock play() rejected: ${JSON.stringify(focusedLockFails)}`);
  }
  if (focusedLockPlays.length < 1) {
    errors.push(
      `Focused lock cue did not play. action=${focusedBoard.action} calls=${focusedLockCalls.length} state=${JSON.stringify(afterFocusedLock.lock)}`,
    );
  } else if (focusedLockPlays.some((entry) => entry.volume < 0.4)) {
    errors.push(`Focused lock cue was too quiet: ${JSON.stringify(focusedLockPlays)}`);
  }

  await page.waitFor(`document.querySelector("main")?.dataset.phase === "reveal"`, 20_000);
  const focusedRevealLog = await waitKinds(["wrong", "correct"]);
  const afterFocusedReveal = {
    log: focusedRevealLog,
    wrong: await page.evaluate(`window.__clipState("magic_immune")`),
    correct: await page.evaluate(`window.__clipState("coins")`),
    hidden: await page.evaluate(`Boolean(document.hidden)`),
  };
  const focusedWrongOk = ofKind(afterFocusedReveal.log, "play-ok", "wrong");
  const focusedCorrectOk = ofKind(afterFocusedReveal.log, "play-ok", "correct");
  const focusedResultFails = [
    ...unresolvedFails(afterFocusedReveal.log, "wrong"),
    ...unresolvedFails(afterFocusedReveal.log, "correct"),
  ];
  if (focusedResultFails.length) {
    errors.push(`Focused result play() rejected: ${JSON.stringify(focusedResultFails)}`);
  }
  if (focusedWrongOk.length + focusedCorrectOk.length < 1) {
    errors.push(`Focused reveal played neither wrong nor correct. log=${JSON.stringify(afterFocusedReveal.log)}`);
  }
  if (focusedWrongOk.length > 1 || focusedCorrectOk.length > 1) {
    errors.push(
      `Focused result cue played more than once: wrong=${focusedWrongOk.length} correct=${focusedCorrectOk.length}`,
    );
  }

  await page.waitFor(`document.querySelector("main")?.dataset.phase === "answering"`, 25_000);
  await page.evaluate(`window.__soundLog = []`);
  const hiddenBoard = await lockCurrentAnswer();
  await delay(250);

  const background = await browser.send("Target.createTarget", { url: "about:blank" });
  await browser.send("Target.activateTarget", { targetId: background.targetId });
  await delay(200);
  const hiddenAfterSwitch = await page.evaluate(
    `({ hidden: Boolean(document.hidden), visibility: document.visibilityState })`,
  );

  await page.waitFor(`document.querySelector("main")?.dataset.phase === "reveal"`, 20_000);
  const hiddenRevealLog = await waitKinds(["wrong", "correct"], 3_000);
  const afterHiddenReveal = {
    log: hiddenRevealLog,
    wrong: await page.evaluate(`window.__clipState("magic_immune")`),
    correct: await page.evaluate(`window.__clipState("coins")`),
    lock: await page.evaluate(`window.__clipState("button_click")`),
    hidden: await page.evaluate(`Boolean(document.hidden)`),
    visibility: await page.evaluate(`document.visibilityState`),
  };
  const hiddenLockOk = ofKind(afterHiddenReveal.log, "play-ok", "lock");
  const hiddenLockFail = unresolvedFails(afterHiddenReveal.log, "lock");
  const hiddenWrongOk = ofKind(afterHiddenReveal.log, "play-ok", "wrong");
  const hiddenCorrectOk = ofKind(afterHiddenReveal.log, "play-ok", "correct");
  const hiddenResultFails = [
    ...unresolvedFails(afterHiddenReveal.log, "wrong"),
    ...unresolvedFails(afterHiddenReveal.log, "correct"),
  ];
  const hiddenResultCalls = [
    ...ofKind(afterHiddenReveal.log, "play", "wrong"),
    ...ofKind(afterHiddenReveal.log, "play", "correct"),
  ];

  if (hiddenLockFail.length) {
    errors.push(`Hidden-round lock play() rejected: ${JSON.stringify(hiddenLockFail)}`);
  }
  if (hiddenLockOk.length < 1) {
    errors.push(`Hidden-round lock cue did not play. action=${hiddenBoard.action}`);
  }
  if (!hiddenAfterSwitch.hidden && hiddenAfterSwitch.visibility !== "hidden") {
    errors.push(`Could not background the play tab: ${JSON.stringify(hiddenAfterSwitch)}`);
  }
  if (hiddenResultFails.length) {
    errors.push(`Hidden-tab result play() rejected: ${JSON.stringify(hiddenResultFails)}`);
  }
  if (hiddenWrongOk.length + hiddenCorrectOk.length < 1) {
    errors.push(
      `Hidden-tab reveal played neither wrong nor correct. calls=${hiddenResultCalls.length} wrong=${JSON.stringify(afterHiddenReveal.wrong)} correct=${JSON.stringify(afterHiddenReveal.correct)} log=${JSON.stringify(afterHiddenReveal.log)}`,
    );
  }
  const hiddenPlayedClip = hiddenCorrectOk.length ? afterHiddenReveal.correct : afterHiddenReveal.wrong;
  if (
    hiddenWrongOk.length + hiddenCorrectOk.length < 1 &&
    hiddenPlayedClip &&
    hiddenPlayedClip.paused &&
    !hiddenPlayedClip.ended
  ) {
    errors.push(`Hidden-tab result play() did not keep the clip running: ${JSON.stringify(hiddenPlayedClip)}`);
  }

  await browser.send("Target.activateTarget", { targetId: created.targetId });
  await delay(100);
  await page.evaluate(`window.dispatchEvent(new Event("focus"));`);
  await delay(500);
  const afterReturn = await page.evaluate(`({
    log: window.__soundLog,
    hidden: Boolean(document.hidden),
    visibility: document.visibilityState,
    wrong: window.__clipState("magic_immune"),
    correct: window.__clipState("coins"),
  })`);
  const visibleResultOk = afterReturn.log.filter(
    (entry) =>
      entry.type === "play-ok" &&
      (classify(entry.src) === "wrong" || classify(entry.src) === "correct") &&
      entry.hidden === false,
  );
  const hiddenResultOkCount = hiddenWrongOk.length + hiddenCorrectOk.length;
  if (afterReturn.hidden) {
    errors.push(`Play tab stayed hidden after focus return: ${JSON.stringify(afterReturn)}`);
  } else if (hiddenResultOkCount >= 1 && visibleResultOk.length >= 1) {
    errors.push("Result cue played again after the tab came back, even though it already played in the background.");
  } else if (hiddenResultOkCount < 1 && visibleResultOk.length < 1) {
    errors.push(`Result cue never played in the background or after return. log=${JSON.stringify(afterReturn.log)}`);
  }

  const report = {
    volume,
    focusedBoard,
    hiddenBoard,
    hiddenAfterSwitch,
    focusedLock: afterFocusedLock.lock,
    focusedWrong: afterFocusedReveal.wrong,
    focusedCorrect: afterFocusedReveal.correct,
    hiddenLock: afterHiddenReveal.lock,
    hiddenWrong: afterHiddenReveal.wrong,
    hiddenCorrect: afterHiddenReveal.correct,
    focusedLockOk: focusedLockPlays.length,
    focusedResultOk: focusedWrongOk.length + focusedCorrectOk.length,
    hiddenLockOk: hiddenLockOk.length,
    hiddenResultOk: hiddenWrongOk.length + hiddenCorrectOk.length,
    errors,
  };

  if (errors.length) {
    console.error(JSON.stringify(report, null, 2));
    throw new Error(errors.join("\n"));
  }

  console.log(
    `Feedback sounds hold: volume ${volume}%, focused ${focusedBoard.action} lock+result, hidden ${hiddenBoard.action} lock+result.`,
  );
} finally {
  await cleanup();
}

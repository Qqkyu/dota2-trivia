#!/usr/bin/env node

/**
 * Live check: lock and wrong cues must actually play at an audible volume.
 * Recreated 2026-08-18: DEFAULT_GAME_VOLUME 0.1 made lock play at 0.08
 * (inaudible click) and wrong play at 0.10 (hollow / "cave" magic_immune).
 */

const debuggingUrl = process.env.CHROME_DEBUG_URL ?? "http://127.0.0.1:9223";
const appUrl = process.env.APP_URL ?? "http://localhost:3000";

const targets = await fetch(`${debuggingUrl}/json/list`).then((response) => response.json());
const target = targets.find((entry) => entry.type === "page");
if (!target?.webSocketDebuggerUrl) {
  throw new Error("No debuggable Chrome page. Start Chrome with --remote-debugging-port=9223.");
}

const socket = new WebSocket(target.webSocketDebuggerUrl);
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
  const result = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
  if (result.exceptionDetails) {
    throw new Error(result.exceptionDetails.exception?.description ?? result.exceptionDetails.text);
  }
  return result.result.value;
}

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

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
await send("Page.addScriptToEvaluateOnNewDocument", {
  source: `(() => {
    window.__soundLog = [];
    const NativeAudio = window.Audio;
    const nativePlay = HTMLMediaElement.prototype.play;
    window.Audio = function(...args) {
      const audio = new NativeAudio(...args);
      window.__soundLog.push({ type: "construct", src: String(args[0] ?? "") });
      return audio;
    };
    window.Audio.prototype = NativeAudio.prototype;
    HTMLMediaElement.prototype.play = function() {
      const src = this.currentSrc || this.src;
      const volume = this.volume;
      window.__soundLog.push({ type: "play", src, volume, readyState: this.readyState });
      return nativePlay.apply(this, arguments).then(() => {
        window.__soundLog.push({ type: "play-ok", src, volume });
      }).catch((error) => {
        window.__soundLog.push({ type: "play-fail", src, volume, error: String(error) });
        throw error;
      });
    };
  })()`,
});

const loaded = once("Page.loadEventFired");
await send("Page.navigate", { url: `${appUrl}/play` });
await loaded;
await waitFor(`document.querySelector("main")?.dataset.clientReady === "true"`, 20_000);
if (await evaluate(`Boolean(document.querySelector('[data-testid="start-arcade"]'))`)) {
  await evaluate(`document.querySelector('[data-testid="start-arcade"]')?.click()`);
}
await waitFor(
  `location.pathname === "/play" && (document.querySelector("main")?.dataset.phase === "answering" || document.querySelector("main")?.dataset.phase === "reveal")`,
  40_000,
);
if (await evaluate(`document.querySelector("main")?.dataset.phase === "reveal"`)) {
  await waitFor(`document.querySelector("main")?.dataset.phase === "answering"`, 20_000);
}

const volume = await evaluate(`Number(document.querySelector('[data-testid="game-volume"]')?.value)`);
await evaluate(`(
  document.querySelector('[data-testid="arcade-answer"]') ||
  document.querySelector('[data-testid="flashback-year-lock"]') ||
  document.querySelector('[data-testid="flashback-order-card"]')
)?.click()`);
if (await evaluate(`Boolean(document.querySelector('[data-testid="flashback-year-lock"]'))`)) {
  await evaluate(`document.querySelector('[data-testid="flashback-year-lock"]')?.click()`);
}
await delay(400);
const afterLock = await evaluate(`window.__soundLog`);
await waitFor(`document.querySelector("main")?.dataset.phase === "reveal"`, 20_000);
await delay(400);
const afterReveal = await evaluate(`window.__soundLog`);

const lockPlays = afterLock.filter((entry) => entry.type === "play-ok" && String(entry.src).includes("button_click"));
const wrongPlays = afterReveal.filter((entry) => entry.type === "play-ok" && String(entry.src).includes("magic_immune"));
const coinPlays = afterReveal.filter((entry) => entry.type === "play-ok" && String(entry.src).includes("coins"));
const failures = afterReveal.filter((entry) => entry.type === "play-fail");
const errors = [];

if (!(volume >= 60)) {
  errors.push(`Game volume is ${volume}%. Recreated inaudible lock/wrong at 10% default.`);
}
if (lockPlays.length < 1 || lockPlays.some((entry) => entry.volume < 0.4)) {
  errors.push(`Lock click was missing or too quiet: ${JSON.stringify(lockPlays)}`);
}
if (wrongPlays.length + coinPlays.length < 1) {
  errors.push("Reveal played neither wrong nor correct feedback.");
}
if (wrongPlays.some((entry) => entry.volume < 0.4)) {
  errors.push(`Wrong cue played at cave volume: ${JSON.stringify(wrongPlays)}`);
}
if (failures.length) {
  errors.push(`play() rejected: ${JSON.stringify(failures)}`);
}

if (errors.length) {
  console.error(JSON.stringify({ volume, afterReveal, errors }, null, 2));
  throw new Error(errors.join("\n"));
}

console.log(
  `Feedback sounds audible: volume ${volume}%, lock ${lockPlays[0].volume}, result ${
    (wrongPlays[0] ?? coinPlays[0]).volume
  }.`,
);
socket.close();

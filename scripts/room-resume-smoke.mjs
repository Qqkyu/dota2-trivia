#!/usr/bin/env node

const debuggingUrl = process.env.CHROME_DEBUG_URL ?? "http://127.0.0.1:9222";
const appUrl = process.env.APP_URL ?? process.env.ARCADE_APP_URL ?? "http://localhost:3000";
const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
const targets = await fetch(`${debuggingUrl}/json/list`).then((response) => response.json());
const target = targets.find((entry) => entry.type === "page");

if (!target?.webSocketDebuggerUrl) throw new Error("No debuggable Chrome page was found.");

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
  if (!waiters?.length) return;
  eventWaiters.delete(payload.method);
  for (const resolve of waiters) resolve(payload.params);
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

async function waitFor(expression, timeout = 30_000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeout) {
    if (await evaluate(expression)) return;
    await delay(100);
  }
  throw new Error(`Timed out waiting for: ${expression}`);
}

await send("Page.enable");
await send("Runtime.enable");
await send("Page.addScriptToEvaluateOnNewDocument", {
  source: `(() => {
    const originalFetch = window.fetch.bind(window);
    window.__queueArcadeResumeSmoke = { armed: false, hung: 0, aborted: 0 };

    Object.defineProperty(HTMLMediaElement.prototype, "play", {
      configurable: true,
      value() { return Promise.resolve(); }
    });

    window.fetch = (...args) => {
      const input = args[0];
      const init = args[1];
      const requestUrl = typeof input === "string" || input instanceof URL ? String(input) : input?.url;
      const requestPath = requestUrl ? new URL(requestUrl, location.href).pathname : "";
      const state = window.__queueArcadeResumeSmoke;
      const shouldHang = state?.armed && state.hung === 0 && requestPath === "/api/rounds" &&
        document.querySelector("main")?.dataset.phase === "reveal";
      if (!shouldHang) return originalFetch(...args);

      state.hung += 1;
      const signal = init?.signal ?? input?.signal;
      return new Promise((resolve, reject) => {
        const abort = () => {
          state.aborted += 1;
          reject(new DOMException("Deliberately stalled room poll aborted", "AbortError"));
        };
        if (signal?.aborted) abort();
        else signal?.addEventListener("abort", abort, { once: true });
      });
    };
  })();`,
});

const loaded = once("Page.loadEventFired");
await send("Page.navigate", { url: new URL("/play", appUrl).href });
await loaded;
await waitFor(
  `document.querySelector("main")?.dataset.clientReady === "true" &&
    document.querySelector("main")?.dataset.phase === "answering"`,
  35_000,
);

await evaluate(`window.__queueArcadeResumeSmoke.armed = true`);
await waitFor(`document.querySelector("main")?.dataset.phase === "reveal"`, 20_000);
await waitFor(`window.__queueArcadeResumeSmoke.hung === 1`, 5_000);
const stalledRoundId = await evaluate(`document.querySelector("main")?.dataset.roundId`);

await waitFor(
  `window.__queueArcadeResumeSmoke.aborted === 1 &&
    document.querySelector("main")?.dataset.roundId !== ${JSON.stringify(stalledRoundId)} &&
    document.querySelector("main")?.dataset.phase === "answering"`,
  20_000,
);

const result = await evaluate(`({
  ...window.__queueArcadeResumeSmoke,
  phase: document.querySelector("main")?.dataset.phase,
  roundId: document.querySelector("main")?.dataset.roundId,
  timer: Number(document.querySelector('[data-testid="round-timer"]')?.textContent)
})`);

if (
  result.hung !== 1 ||
  result.aborted !== 1 ||
  result.roundId === stalledRoundId ||
  result.phase !== "answering" ||
  result.timer <= 0
) {
  throw new Error(`The public room did not recover from a deliberately stalled AFK poll: ${JSON.stringify(result)}`);
}

const beforeLifecycleFreeze = await evaluate(`({
  phase: document.querySelector("main")?.dataset.phase,
  roundId: document.querySelector("main")?.dataset.roundId,
  timer: Number(document.querySelector('[data-testid="round-timer"]')?.textContent)
})`);
const frozenFor = Math.max(9_000, (beforeLifecycleFreeze.timer + 8) * 1_000);
await send("Page.setWebLifecycleState", { state: "frozen" });
await delay(frozenFor);
await send("Page.setWebLifecycleState", { state: "active" });
await waitFor(
  `document.querySelector("main")?.dataset.roundId !== ${JSON.stringify(beforeLifecycleFreeze.roundId)} &&
    Number(document.querySelector('[data-testid="round-timer"]')?.textContent) > 0`,
  10_000,
);
const afterLifecycleResume = await evaluate(`({
  phase: document.querySelector("main")?.dataset.phase,
  roundId: document.querySelector("main")?.dataset.roundId,
  timer: Number(document.querySelector('[data-testid="round-timer"]')?.textContent)
})`);
socket.close();

if (afterLifecycleResume.roundId === beforeLifecycleFreeze.roundId || afterLifecycleResume.timer <= 0) {
  throw new Error(
    `The public room did not recover after Chrome resumed a frozen page: ${JSON.stringify(afterLifecycleResume)}`,
  );
}

console.log(
  JSON.stringify(
    {
      stalledRoundId,
      recoveredRoundId: result.roundId,
      stalledRequestsAborted: result.aborted,
      lifecycleFrozenForMs: frozenFor,
      lifecycleRecoveredRoundId: afterLifecycleResume.roundId,
      recoveredWithoutInput: true,
    },
    null,
    2,
  ),
);

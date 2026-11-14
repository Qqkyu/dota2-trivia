#!/usr/bin/env node
/**
 * A party the server no longer knows (it restarted, for example for a deploy) must not
 * freeze the tab. In the waiting room and mid-game, the tab returns to the party screen,
 * says the party ended, stops polling the dead code, and nothing moves while it shows.
 */
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdtemp } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { stopChrome } from "./lib/stop-chrome.mjs";

const appUrl = (process.env.APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const ENDED = "The server restarted, so this party ended.";

function freePort() {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
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
      // Chrome is still binding.
    }
    await delay(100);
  }
  throw new Error(`Chrome debug HTTP did not open at ${url}`);
}

function attachCdp(webSocketDebuggerUrl, onEvent = () => undefined) {
  const socket = new WebSocket(webSocketDebuggerUrl);
  const pending = new Map();
  let requestId = 0;
  socket.addEventListener("message", (message) => {
    const payload = JSON.parse(message.data);
    if (payload.method) onEvent(payload);
    if (!payload.id) return;
    const request = pending.get(payload.id);
    if (!request) return;
    pending.delete(payload.id);
    if (payload.error) request.reject(new Error(payload.error.message));
    else request.resolve(payload.result);
  });
  const ready = new Promise((resolve) => socket.addEventListener("open", resolve, { once: true }));
  function send(method, params = {}) {
    const id = ++requestId;
    socket.send(JSON.stringify({ id, method, params }));
    return new Promise((resolve, reject) => pending.set(id, { resolve, reject }));
  }
  async function evaluate(expression) {
    const result = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
    if (result.exceptionDetails) {
      throw new Error(result.exceptionDetails.exception?.description ?? result.exceptionDetails.text);
    }
    return result.result.value;
  }
  async function waitFor(expression, timeout = 20_000) {
    const startedAt = Date.now();
    while (Date.now() - startedAt < timeout) {
      if (await evaluate(`Boolean(${expression})`).catch(() => false)) return Date.now();
      await delay(100);
    }
    const state = await evaluate(STATE).catch(() => null);
    throw new Error(`Timed out waiting for: ${expression}\nLast party state: ${JSON.stringify(state)}`);
  }
  return { socket, ready, send, evaluate, waitFor };
}

async function post(path, body) {
  const response = await fetch(`${appUrl}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: new URL(appUrl).origin },
    body: JSON.stringify(body),
  });
  return { status: response.status, body: await response.json().catch(() => null) };
}

const STATE = `(() => {
  const setup = document.querySelector('[data-testid="private-room-setup"]');
  const notice = document.querySelector('[data-testid="private-room-error"]');
  const doors = document.querySelector('[data-testid="private-room-choose-create"]')?.getBoundingClientRect();
  return {
    path: setup?.dataset.path ?? null,
    notice: notice?.textContent?.trim() ?? null,
    doors: doors ? [Math.round(doors.x), Math.round(doors.y), Math.round(doors.width), Math.round(doors.height)] : null,
    url: location.pathname + location.search,
    phase: document.querySelector("main")?.dataset.phase ?? null,
  };
})()`;

const port = await freePort();
const userDataDir = await mkdtemp(join(tmpdir(), "queue-arcade-ended-"));
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
    "--window-size=1400,1000",
    "about:blank",
  ],
  { stdio: "ignore" },
);

let page = null;
let browser = null;
const requests = [];

async function expectEnded(label, code, hostId, otherIds) {
  for (const playerId of otherIds) await post("/api/private-rooms/leave", { code, playerId });
  const left = await post("/api/private-rooms/leave", { code, playerId: hostId });
  if (left.status !== 200) throw new Error(`${label}: could not end the party (${left.status}).`);
  const endedAt = Date.now();
  const shownAt = await page.waitFor(
    `(() => { const s = ${STATE}; return s.path === "choose" && (s.notice ?? "").startsWith(${JSON.stringify(ENDED)}); })()`,
    8_000,
  );
  const first = await page.evaluate(STATE);
  await delay(2_000);
  const settled = await page.evaluate(STATE);
  await delay(2_000);
  const deadPolls = requests.filter(
    (request) => request.at > shownAt + 500 && request.url.includes("/api/") && request.url.includes(code),
  );
  if (first.url !== "/party") throw new Error(`${label}: the ended party left the URL at ${first.url}.`);
  if (first.phase !== "lobby") throw new Error(`${label}: the arcade stayed in phase ${first.phase}.`);
  if (JSON.stringify(first.doors) !== JSON.stringify(settled.doors)) {
    throw new Error(`${label}: the party doors moved while the notice showed (${first.doors} → ${settled.doors}).`);
  }
  if (deadPolls.length) {
    throw new Error(`${label}: the tab kept polling the ended party (${deadPolls.length}× ${deadPolls[0].url}).`);
  }
  return shownAt - endedAt;
}

try {
  const version = await waitJson(`http://127.0.0.1:${port}/json/version`);
  browser = attachCdp(version.webSocketDebuggerUrl);
  await browser.ready;
  const created = await browser.send("Target.createTarget", { url: "about:blank" });
  const listed = await fetch(`http://127.0.0.1:${port}/json/list`).then((response) => response.json());
  page = attachCdp(listed.find((entry) => entry.id === created.targetId).webSocketDebuggerUrl, (event) => {
    if (event.method === "Network.requestWillBeSent") requests.push({ at: Date.now(), url: event.params.request.url });
  });
  await page.ready;
  await page.send("Page.enable");
  await page.send("Runtime.enable");
  await page.send("Network.enable");
  const hostId = `ended-host-${randomUUID()}`;
  await page.send("Page.addScriptToEvaluateOnNewDocument", {
    source: `sessionStorage.setItem("queue-arcade:player:v2:tab", ${JSON.stringify(hostId)});`,
  });

  // 1. The waiting room: the party was never started.
  const waitCode = `W${Date.now().toString(36).slice(-6).toUpperCase()}`;
  const waitParty = await post("/api/private-rooms", {
    playerId: hostId,
    code: waitCode,
    name: "Host",
    games: ["trivia"],
  });
  if (waitParty.status !== 200) throw new Error(`waiting room: could not create the party (${waitParty.status}).`);
  await page.send("Page.navigate", { url: `${appUrl}/play?room=${waitCode}` });
  await page.waitFor(`document.querySelector('[data-testid="private-room-wait"]')`, 20_000);
  const waitMs = await expectEnded("waiting room", waitCode, hostId, []);

  // 2. Mid-game, with a second player.
  const playCode = `P${Date.now().toString(36).slice(-6).toUpperCase()}`;
  const guestId = `ended-guest-${randomUUID()}`;
  const playParty = await post("/api/private-rooms", {
    playerId: hostId,
    code: playCode,
    name: "Host",
    games: ["trivia"],
  });
  if (playParty.status !== 200) throw new Error(`mid-game: could not create the party (${playParty.status}).`);
  const joined = await post("/api/private-rooms", { action: "join", code: playCode, playerId: guestId, name: "Guest" });
  if (joined.status !== 200) throw new Error(`mid-game: the guest could not join (${joined.status}).`);
  const started = await post("/api/private-rooms/start", { playerId: hostId, code: playCode });
  if (started.status !== 200) throw new Error(`mid-game: could not start the party (${started.status}).`);
  await page.send("Page.navigate", { url: `${appUrl}/play?room=${playCode}` });
  await page.waitFor(
    `document.querySelector('[data-testid="private-room-play-dock"]') && ["answering","reveal"].includes(document.querySelector("main")?.dataset.phase)`,
    30_000,
  );
  const playMs = await expectEnded("mid-game", playCode, hostId, [guestId]);

  // 3. Acting on the party screen dismisses the notice for good.
  await page.evaluate(`document.querySelector('[data-testid="private-room-choose-create"]').click()`);
  await page.waitFor(`document.querySelector('[data-testid="private-room-setup"]')?.dataset.path === "create"`);
  await page.evaluate(`document.querySelector('[data-testid="private-room-leave"]').click()`);
  await page.waitFor(`document.querySelector('[data-testid="private-room-setup"]')?.dataset.path === "choose"`);
  const afterBack = await page.evaluate(STATE);
  if (afterBack.notice)
    throw new Error(`The party-ended notice came back after Create → Back ("${afterBack.notice}").`);

  console.log(
    `Validated party-ended handling: waiting room ${(waitMs / 1000).toFixed(1)}s, mid-game ${(playMs / 1000).toFixed(1)}s to the notice, no polling of the dead code, no layout move, dismissed on action.`,
  );
} finally {
  for (const client of [page, browser]) {
    try {
      client?.socket.close();
    } catch {
      // gone
    }
  }
  await stopChrome(chrome, userDataDir);
}

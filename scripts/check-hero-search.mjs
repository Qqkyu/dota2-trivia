#!/usr/bin/env node

/**
 * Quote Hunt party: typing filters the hero grid, and Enter picks the hero
 * only when exactly one hero is left.
 */

import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdtemp, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { stopChrome } from "./lib/stop-chrome.mjs";

const appUrl = (process.env.APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const json = { "Content-Type": "application/json", Origin: new URL(appUrl).origin };

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
      // Chrome is still binding.
    }
    await delay(100);
  }
  throw new Error(`Chrome debug HTTP did not open at ${url}`);
}

function attachCdp(webSocketDebuggerUrl) {
  const socket = new WebSocket(webSocketDebuggerUrl);
  const pending = new Map();
  let requestId = 0;
  socket.addEventListener("message", (message) => {
    const payload = JSON.parse(message.data);
    if (!payload.id) return;
    const request = pending.get(payload.id);
    if (!request) return;
    pending.delete(payload.id);
    if (payload.error) request.reject(new Error(payload.error.message));
    else request.resolve(payload.result);
  });
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
      if (await evaluate(expression)) return;
      await delay(150);
    }
    throw new Error(`Timed out waiting for: ${expression}`);
  }
  return {
    socket,
    send,
    evaluate,
    waitFor,
    ready: new Promise((resolve, reject) => {
      socket.addEventListener("open", resolve, { once: true });
      socket.addEventListener("error", reject, { once: true });
    }),
  };
}

async function post(path, body) {
  const response = await fetch(`${appUrl}${path}`, { method: "POST", headers: json, body: JSON.stringify(body) });
  return { status: response.status, body: await response.json().catch(() => null) };
}

const port = await freePort();
const userDataDir = await mkdtemp(join(tmpdir(), "queue-arcade-hero-search-"));
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
    "--window-size=1400,1200",
    "about:blank",
  ],
  { stdio: "ignore" },
);

let page = null;
let browser = null;

async function cleanup() {
  try {
    page?.socket.close();
  } catch {
    // gone
  }
  try {
    browser?.socket.close();
  } catch {
    // gone
  }
  await stopChrome(chrome, userDataDir);
}

async function pressKey(key, code = key.length === 1 ? `Key${key.toUpperCase()}` : key) {
  const base = {
    key,
    code,
    ...(key.length === 1 ? { text: key } : { windowsVirtualKeyCode: key === "Enter" ? 13 : 27 }),
  };
  await page.send("Input.dispatchKeyEvent", { type: "keyDown", ...base });
  await page.send("Input.dispatchKeyEvent", { type: "keyUp", ...base });
}

async function typeText(text) {
  for (const character of text) await pressKey(character);
  await delay(120);
}

const pickerState = `(() => {
  const picker = document.querySelector('[data-testid="hero-picker"]');
  const heroes = [...document.querySelectorAll('[data-testid="hero-picker-hero"]')];
  return {
    locked: picker?.dataset.locked,
    searching: picker?.dataset.searching,
    query: document.querySelector('[data-testid="hero-search"]')?.dataset.query ?? "",
    matches: heroes.filter((hero) => hero.dataset.searchMatch === "true").length,
    selected: heroes.find((hero) => hero.dataset.state === "selected")?.dataset.heroKey ?? null,
    correctName: heroes.find((hero) => hero.dataset.state === "correct")?.getAttribute("aria-label") ?? null,
    status: document.querySelector('[data-testid="hero-picker-status"]')?.textContent?.replace(/\\s+/g, " ").trim() ?? "",
    height: Math.round(picker?.getBoundingClientRect().height ?? 0),
    top: Math.round(picker?.getBoundingClientRect().top ?? 0),
    phase: document.querySelector("main")?.dataset.phase,
  };
})()`;

async function shot(name) {
  if (!process.env.SHOT_DIR) return;
  const { data } = await page.send("Page.captureScreenshot", { format: "png" });
  await writeFile(join(process.env.SHOT_DIR, name), Buffer.from(data, "base64"));
}

const hostId = `hero-search-host-${randomUUID()}`;
try {
  const version = await waitJson(`http://127.0.0.1:${port}/json/version`);
  browser = attachCdp(version.webSocketDebuggerUrl);
  await browser.ready;
  const created = await browser.send("Target.createTarget", { url: "about:blank" });
  const listed = await fetch(`http://127.0.0.1:${port}/json/list`).then((response) => response.json());
  page = attachCdp(listed.find((entry) => entry.id === created.targetId).webSocketDebuggerUrl);
  await page.ready;
  await page.send("Page.enable");
  await page.send("Runtime.enable");

  const code = `H${Date.now().toString(36).slice(-5).toUpperCase()}`;
  const createdParty = await post("/api/private-rooms", {
    playerId: hostId,
    code,
    name: "Hero",
    games: ["quote-hunt"],
  });
  if (createdParty.status !== 200) throw new Error(`Could not create a party (${createdParty.status}).`);
  const started = await post("/api/private-rooms/start", { playerId: hostId, code });
  if (started.status !== 200) throw new Error(`Could not start the party (${started.status}).`);

  await page.send("Page.navigate", { url: `${appUrl}/play?room=${code}` });
  await page.waitFor(`document.querySelector("main")?.dataset.clientReady === "true"`);
  await page.waitFor(
    `document.querySelector("main")?.dataset.phase === "answering" && document.querySelectorAll('[data-testid="hero-picker-hero"]').length > 100 && Number(document.querySelector('[data-testid="round-timer"]')?.textContent) >= 8`,
    40_000,
  );
  await delay(300);
  const idle = await page.evaluate(pickerState);
  if (!/^\d+ heroes$/i.test(idle.status)) {
    throw new Error(`Hero status line did not show the hero count: ${JSON.stringify(idle)}`);
  }

  // Many matches: Enter must not pick.
  await typeText("s");
  await pressKey("Enter");
  await delay(200);
  const many = await page.evaluate(pickerState);
  if (many.locked !== "false" || many.matches < 2 || many.selected) {
    throw new Error(`Enter picked a hero with ${many.matches} matches: ${JSON.stringify(many)}`);
  }
  await pressKey("Escape");
  await delay(120);
  const cleared = await page.evaluate(pickerState);
  if (cleared.query !== "" || cleared.searching !== "false") {
    throw new Error(`Escape did not clear the hero search: ${JSON.stringify(cleared)}`);
  }

  // One match: Enter picks it.
  await typeText("anti");
  const single = await page.evaluate(pickerState);
  if (single.matches !== 1 || single.locked !== "false") {
    throw new Error(`"anti" did not leave exactly one hero: ${JSON.stringify(single)}`);
  }
  await pressKey("Enter");
  await page.waitFor(`document.querySelector('[data-testid="hero-picker"]')?.dataset.locked === "true"`, 5_000);
  const picked = await page.evaluate(pickerState);
  if (picked.selected !== "npc_dota_hero_antimage" || picked.query !== "") {
    throw new Error(`Enter did not pick Anti-Mage: ${JSON.stringify(picked)}`);
  }
  if (picked.status !== "Locked: Anti-Mage") throw new Error(`Lock status is wrong: ${JSON.stringify(picked)}`);
  await shot("hero-locked.png");

  // Reveal names the correct hero beside the grid without moving the grid.
  await page.waitFor(`document.querySelector("main")?.dataset.phase === "reveal"`, 25_000);
  await delay(400);
  const reveal = await page.evaluate(pickerState);
  await shot("hero-reveal.png");
  if (!reveal.correctName || !reveal.status.startsWith(`Answer: ${reveal.correctName}`)) {
    throw new Error(`Reveal did not name the correct hero: ${JSON.stringify(reveal)}`);
  }
  if (reveal.correctName !== "Anti-Mage" && !reveal.status.endsWith("You picked Anti-Mage")) {
    throw new Error(`Reveal did not name the wrong pick: ${JSON.stringify(reveal)}`);
  }
  if (reveal.height !== picked.height || reveal.top !== picked.top) {
    throw new Error(`Hero grid moved on reveal: ${JSON.stringify({ picked, reveal })}`);
  }
  console.log(
    `Validated hero grid search and reveal: Enter picks the only match, reveal names ${reveal.correctName} in place.`,
  );
} finally {
  await cleanup();
}

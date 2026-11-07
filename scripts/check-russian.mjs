#!/usr/bin/env node

/**
 * Plays one party round per format in a browser set to Russian, then opens every page, and
 * fails on anything a Russian player should not see: a raw message key, an English sentence,
 * or a page that scrolls sideways. Hero, item and ability names stay in English on purpose.
 */

import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { mkdtemp } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { LIVE_ROUND_GAMES } from "../src/lib/arcade-games.mjs";
import { stopChrome } from "./lib/stop-chrome.mjs";

const appUrl = (process.env.APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const json = { "Content-Type": "application/json", Origin: new URL(appUrl).origin };

const units = JSON.parse(readFileSync("src/data/i18n/ru.units.json", "utf8"));
const NAME_PATTERN = new RegExp(
  [...units.names]
    .sort((a, b) => b.length - a.length)
    .map((name) => name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    .join("|"),
  "gi",
);

// English words that only appear in sentences. A name can hold one, so names go first.
const ENGLISH = /\b(?:the|and|with|which|what|this|that|your|from|before|after|hero|heroes|item|round|answer)\b/i;
const RAW_KEY = /\b(?:round|lobby|wait|session|party|profile|privacy|calibration|shell|meta)\.[a-z]+[A-Za-z.]*/;

function englishLeft(text) {
  // Some labels are uppercase by CSS, so names are compared without case.
  const rest = text.replace(NAME_PATTERN, " ");
  return rest
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => ENGLISH.test(line) && !/[а-яё]{3}/i.test(line))
    .filter((line) => !/^(?:The International|The Underhollow|Queue Arcade|Dota 2)/.test(line));
}

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

async function waitJson(url) {
  for (let tries = 0; tries < 150; tries += 1) {
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
    const request = pending.get(payload.id);
    if (!request) return;
    pending.delete(payload.id);
    if (payload.error) request.reject(new Error(payload.error.message));
    else request.resolve(payload.result);
  });
  const send = (method, params = {}) => {
    const id = ++requestId;
    socket.send(JSON.stringify({ id, method, params }));
    return new Promise((resolve, reject) => pending.set(id, { resolve, reject }));
  };
  const evaluate = async (expression) => {
    const result = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
    if (result.exceptionDetails) {
      throw new Error(result.exceptionDetails.exception?.description ?? result.exceptionDetails.text);
    }
    return result.result.value;
  };
  const waitFor = async (expression, timeout = 25_000) => {
    const startedAt = Date.now();
    while (Date.now() - startedAt < timeout) {
      if (await evaluate(expression)) return;
      await delay(150);
    }
    throw new Error(`Timed out waiting for: ${expression}`);
  };
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

const post = async (path, body) => {
  const response = await fetch(`${appUrl}${path}`, { method: "POST", headers: json, body: JSON.stringify(body) });
  return response.status;
};

const port = await freePort();
const userDataDir = await mkdtemp(join(tmpdir(), "queue-arcade-russian-"));
const chrome = spawn(
  "google-chrome",
  [
    "--headless=new",
    "--mute-audio",
    "--accept-lang=ru",
    `--remote-debugging-port=${port}`,
    "--remote-allow-origins=*",
    `--user-data-dir=${userDataDir}`,
    "--no-first-run",
    "--disable-gpu",
    "--window-size=1400,900",
    "about:blank",
  ],
  { stdio: "ignore" },
);

let page = null;
const hostId = randomUUID();
const problems = [];

function inspect(where, text, overflow) {
  if (!/[а-яё]{3}/i.test(text)) problems.push(`${where}: no Russian text at all`);
  const key = RAW_KEY.exec(text);
  if (key) problems.push(`${where}: raw message key ${key[0]}`);
  for (const line of englishLeft(text).slice(0, 3)) problems.push(`${where}: English line: ${line.slice(0, 90)}`);
  if (overflow > 2) problems.push(`${where}: the page scrolls sideways by ${overflow}px`);
}

const snapshot = `({ text: document.body.innerText, overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth, lang: document.documentElement.lang })`;

try {
  const version = await waitJson(`http://127.0.0.1:${port}/json/version`);
  const browser = attachCdp(version.webSocketDebuggerUrl);
  await browser.ready;
  const created = await browser.send("Target.createTarget", { url: "about:blank" });
  const listed = await fetch(`http://127.0.0.1:${port}/json/list`).then((response) => response.json());
  page = attachCdp(listed.find((entry) => entry.id === created.targetId).webSocketDebuggerUrl);
  await page.ready;
  await page.send("Page.enable");
  await page.send("Runtime.enable");
  await page.send("Page.addScriptToEvaluateOnNewDocument", {
    source: `sessionStorage.setItem("queue-arcade:player:v2:tab", ${JSON.stringify(hostId)});`,
  });

  for (const path of ["/", "/party", "/profile", "/privacy", "/calibration"]) {
    await page.send("Page.navigate", { url: `${appUrl}${path}` });
    await page.waitFor(`document.readyState === "complete" && document.body.innerText.length > 80`);
    await delay(500);
    const seen = await page.evaluate(snapshot);
    if (seen.lang !== "ru") problems.push(`${path}: <html lang> is ${seen.lang}`);
    inspect(path, seen.text, seen.overflow);
  }

  for (const game of LIVE_ROUND_GAMES) {
    const code = `R${Date.now().toString(36).slice(-5).toUpperCase()}`;
    if ((await post("/api/private-rooms", { playerId: hostId, code, name: "Тест", games: [game] })) !== 200) {
      throw new Error(`${game}: could not create a party.`);
    }
    if ((await post("/api/private-rooms/start", { playerId: hostId, code })) !== 200) {
      throw new Error(`${game}: could not start the party.`);
    }
    await page.send("Page.navigate", { url: `${appUrl}/play?room=${code}` });
    await page.waitFor(`document.querySelector("main")?.dataset.clientReady === "true"`);
    await page.waitFor(
      `document.querySelector("main")?.dataset.phase === "answering" && document.querySelector('[data-testid="public-room"]')?.dataset.roundGame === ${JSON.stringify(game)}`,
      40_000,
    );
    await delay(400);
    const answering = await page.evaluate(snapshot);
    inspect(`${game} answering`, answering.text, answering.overflow);
    await page.waitFor(`document.querySelector("main")?.dataset.phase === "reveal"`, 25_000);
    await delay(400);
    const reveal = await page.evaluate(snapshot);
    inspect(`${game} reveal`, reveal.text, reveal.overflow);
    await post("/api/private-rooms/leave", { playerId: hostId, code });
  }
} finally {
  try {
    page?.socket.close();
  } catch {
    // gone
  }
  await stopChrome(chrome, userDataDir);
}

if (problems.length) {
  console.error(problems.join("\n"));
  process.exit(1);
}
console.log(`Validated Russian on 5 pages and ${LIVE_ROUND_GAMES.length} round types, in play and at the reveal.`);
process.exit(0);

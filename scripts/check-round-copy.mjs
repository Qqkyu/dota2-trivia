#!/usr/bin/env node

/**
 * Plays one party round per live format in headless Chrome and checks what a
 * player actually sees: one patch label, no narration, a live score line, the
 * format's own controls, and a full reveal. Replaces the old source-string
 * copy validator with a behaviour check.
 */

import { spawn } from "node:child_process";
import { firstPartyRequests } from "./lib/first-party-requests.mjs";
import { randomUUID } from "node:crypto";
import { mkdtemp } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { LIVE_ROUND_GAMES } from "../src/lib/arcade-games.mjs";
import { stopChrome } from "./lib/stop-chrome.mjs";

const appUrl = (process.env.APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
const requests = firstPartyRequests(appUrl);
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const json = { "Content-Type": "application/json", Origin: new URL(appUrl).origin };
const FORBIDDEN_COPY = [
  /later clues cost/i,
  /clues unlock with time/i,
  /trust the silhouette/i,
  /no talents or upgrades unless stated/i,
  /a mechanical clue will appear/i,
];

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
const userDataDir = await mkdtemp(join(tmpdir(), "queue-arcade-copy-"));
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
    "--window-size=1400,1600",
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

const hostId = `copy-host-${randomUUID()}`;
const patchLabel = await fetch(`${appUrl}/api/health`)
  .then((response) => response.json())
  .then((health) => health.content?.version?.match(/^(\d+\.\d+[a-z]?)/)?.[1] ?? "");
if (!patchLabel) throw new Error("Could not read the live patch from /api/health.");

const seen = [];
const activeParties = new Set();
try {
  const version = await waitJson(`http://127.0.0.1:${port}/json/version`);
  browser = attachCdp(version.webSocketDebuggerUrl);
  await browser.ready;
  const created = await browser.send("Target.createTarget", { url: "about:blank" });
  const listed = await fetch(`http://127.0.0.1:${port}/json/list`).then((response) => response.json());
  page = attachCdp(listed.find((entry) => entry.id === created.targetId).webSocketDebuggerUrl, requests.onEvent);
  await page.ready;
  await page.send("Page.enable");
  await page.send("Runtime.enable");
  await page.send("Network.enable");
  await page.send("Page.addScriptToEvaluateOnNewDocument", {
    source: `sessionStorage.setItem("queue-arcade:player:v2:tab", ${JSON.stringify(hostId)});`,
  });

  for (const game of LIVE_ROUND_GAMES) {
    const code = `C${Date.now().toString(36).slice(-5).toUpperCase()}`;
    const createdParty = await post("/api/private-rooms", { playerId: hostId, code, name: "Copy", games: [game] });
    if (createdParty.status !== 200) throw new Error(`${game}: could not create a party (${createdParty.status}).`);
    activeParties.add(code);
    const started = await post("/api/private-rooms/start", { playerId: hostId, code });
    if (started.status !== 200) throw new Error(`${game}: could not start the party (${started.status}).`);

    await page.send("Page.navigate", { url: `${appUrl}/play?room=${code}` });
    await page.waitFor(`document.querySelector("main")?.dataset.clientReady === "true"`);
    // A party never shows the public "wait for the next full question" screen.
    await page.waitFor(
      `document.querySelector('[data-testid="public-room"]')?.dataset.roundGame === ${JSON.stringify(game)} || Boolean(document.querySelector('[data-testid="round-entry-wait"]'))`,
      40_000,
    );
    if (await page.evaluate(`Boolean(document.querySelector('[data-testid="round-entry-wait"]'))`)) {
      throw new Error(`${game}: a party start showed the public entry-wait screen.`);
    }
    // Make sure we look at a round with answering time left.
    await page.waitFor(
      `document.querySelector("main")?.dataset.phase === "answering" && Number(document.querySelector('[data-testid="round-timer"]')?.textContent) >= 6`,
      30_000,
    );
    await delay(300);

    const answering = await page.evaluate(`(() => {
      const room = document.querySelector('[data-testid="public-room"]');
      const text = room?.innerText ?? "";
      const q = (selector) => room?.querySelectorAll(selector).length ?? 0;
      const helper = [...(room?.querySelectorAll("div") ?? [])].find((node) => / gold now/.test(node.textContent ?? ""));
      return {
        game: room?.dataset.roundGame,
        patchMentions: (document.body.innerText.match(new RegExp(${JSON.stringify(patchLabel.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))}, "gi")) ?? []).length,
        text,
        helper: helper?.innerText ?? "",
        h1: document.querySelectorAll("h1").length,
        answers: q('[data-testid="arcade-answer"]'),
        heroes: q('[data-testid="hero-picker-hero"]'),
        shopItems: q('[data-testid="shopkeeper-store-item"]'),
        orderCards: q('[data-testid="value-order-card"]'),
        flashbackOrder: q('[data-testid="flashback-order-card"]'),
        yearSlider: q('[data-testid="flashback-year-slider"]'),
        spellClue: document.querySelector('[data-testid="spell-clue-description"]')?.textContent?.length ?? 0,
        spellClueTwoLocked: / at \\d+s/i.test(document.querySelector('[data-testid="spell-clue-2"]')?.textContent ?? ""),
        aghanimClue: document.querySelector('[data-testid="aghanim-clue-1"]')?.textContent?.trim().length ?? 0,
        quote: document.querySelector('[data-testid="hero-quote"] blockquote')?.textContent?.trim().length ?? 0,
        audioState: document.querySelector('[data-testid="echo-player"], [data-testid="soundcheck-player"]')?.dataset.audioState ?? null,
        fogStage: document.querySelector('[data-fog-stage]')?.dataset.fogStage ?? null,
        dock: Boolean(document.querySelector('[data-testid="private-room-play-dock"]')),
      };
    })()`);
    if (answering.game !== game) throw new Error(`${game}: the party served ${answering.game}.`);
    if (answering.patchMentions !== 1) {
      throw new Error(
        `${game}: the patch label appears ${answering.patchMentions} times; only the header may show it.`,
      );
    }
    const narration = FORBIDDEN_COPY.find((pattern) => pattern.test(answering.text));
    if (narration) throw new Error(`${game}: redundant narration returned to the round (${narration}).`);
    if (!/Answer worth \d+ gold now/.test(answering.helper)) {
      throw new Error(`${game}: the live score line is missing (${JSON.stringify(answering.helper)}).`);
    }
    if (answering.answers > 0 && !/A–D or 1–4/.test(answering.helper)) {
      throw new Error(`${game}: four-choice rounds must mention the A–D / 1–4 keys.`);
    }
    if (answering.h1 !== 1) throw new Error(`${game}: expected one h1, found ${answering.h1}.`);
    if (!answering.dock) throw new Error(`${game}: the party ranking dock is missing during play.`);

    const controls = {
      trivia: answering.answers === 4,
      shopkeeper: answering.answers === 4 || answering.shopItems > 100,
      "spell-link": answering.heroes >= 120 && answering.spellClue >= 16 && answering.spellClueTwoLocked,
      "fogged-vision": answering.heroes >= 120 && answering.fogStage !== null,
      "echo-hunt": answering.heroes >= 120 && answering.audioState !== null,
      soundcheck: (answering.answers === 4 || answering.shopItems > 100) && answering.audioState !== null,
      "quote-hunt": answering.heroes >= 120 && answering.quote >= 10,
      "aghanim-lab": answering.heroes >= 120 && answering.aghanimClue >= 10,
      "order-up": answering.orderCards === 4,
      flashback: answering.answers === 4 || answering.flashbackOrder === 4 || answering.yearSlider === 1,
    };
    if (!controls[game])
      throw new Error(`${game}: the round did not show its own controls (${JSON.stringify(answering)}).`);

    await page.evaluate(`(() => {
      const pick = (selector) => {
        const node = document.querySelector(selector);
        if (node && !node.disabled) {
          node.click();
          return true;
        }
        return false;
      };
      if (pick('[data-testid="arcade-answer"]') || pick('[data-testid="hero-picker-hero"]') || pick('[data-testid="shopkeeper-store-item"]')) return;
      for (let index = 0; index < 4; index += 1) {
        const card = document.querySelectorAll('[data-testid="value-order-card"], [data-testid="flashback-order-card"]')[index];
        if (card) card.click();
      }
      document.querySelector('[data-testid="flashback-year-lock"]')?.click();
    })()`);

    await page.waitFor(`document.querySelector("main")?.dataset.phase === "reveal"`, 25_000);
    await delay(400);
    const reveal = await page.evaluate(`(() => {
      const room = document.querySelector('[data-testid="public-room"]');
      const text = room?.innerText ?? "";
      return {
        text,
        panel: Boolean(document.querySelector('[data-testid="reveal-panel"]')),
        report: Boolean(document.querySelector('[data-testid="report-question"]')),
        answered: Number(document.querySelector('[data-testid="crowd-split"]')?.dataset.total ?? 0),
        roomSplit: Boolean(document.querySelector('[data-testid="crowd-card"] [data-testid="crowd-split-row"]')),
        scoreSummary: Boolean(document.querySelector('[data-testid="crowd-card"] [data-testid="crowd-score-summary"]')),
        explanation: document.querySelector('[data-testid="reveal-explanation"]')?.textContent?.trim().length ?? 0,
        callout: document.querySelector('[data-testid="reveal-callout"]')?.textContent ?? "",
        patchMentions: (document.body.innerText.match(new RegExp(${JSON.stringify(patchLabel.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))}, "gi")) ?? []).length,
      };
    })()`);
    if (!reveal.panel || !reveal.report) {
      throw new Error(`${game}: reveal is missing its panel or report control (${JSON.stringify(reveal)}).`);
    }
    // A recipe round needs several picks, so this script's one click can leave no answer locked.
    if (reveal.answered > 0 && (!reveal.roomSplit || !reveal.scoreSummary)) {
      throw new Error(`${game}: the room split card is missing from the side rail at the reveal.`);
    }
    if (game !== "order-up" && reveal.explanation < 8) throw new Error(`${game}: reveal has no explanation.`);
    if (!/Correct|Incorrect|Time expired|Blood|Spree|Dominating|Kill|Unstoppable|Sick|Godlike/i.test(reveal.callout)) {
      throw new Error(`${game}: reveal callout is missing (${JSON.stringify(reveal.callout)}).`);
    }
    if (reveal.patchMentions !== 1) throw new Error(`${game}: the reveal repeats the patch label.`);
    const revealNarration = FORBIDDEN_COPY.find((pattern) => pattern.test(reveal.text));
    if (revealNarration) throw new Error(`${game}: redundant narration returned to the reveal (${revealNarration}).`);

    seen.push(game);
    const left = await post("/api/private-rooms/leave", { playerId: hostId, code });
    if (left.status !== 200) throw new Error(`${game}: could not leave the test party (${left.status}).`);
    activeParties.delete(code);
  }

  const requestCount = requests.assert("round copy");
  console.log(
    `Validated round copy, controls, and reveals for ${seen.length} formats: ${seen.join(", ")}. All ${requestCount} requests stayed on this site.`,
  );
} finally {
  await cleanup();
  await Promise.allSettled(
    [...activeParties].map((code) => post("/api/private-rooms/leave", { playerId: hostId, code })),
  );
}

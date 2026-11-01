#!/usr/bin/env node

/**
 * Clicks public play: lobby → answer → reveal.
 */

import { spawn } from "node:child_process";
import { mkdtemp } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { stopChrome } from "./lib/stop-chrome.mjs";

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

const port = await freePort();
const userDataDir = await mkdtemp(join(tmpdir(), "queue-arcade-public-"));
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

try {
  const version = await waitJson(`http://127.0.0.1:${port}/json/version`);
  browser = attachCdp(version.webSocketDebuggerUrl);
  await browser.ready;
  const created = await browser.send("Target.createTarget", { url: "about:blank" });
  const listed = await fetch(`http://127.0.0.1:${port}/json/list`).then((response) => response.json());
  const target = listed.find((entry) => entry.id === created.targetId);
  page = attachCdp(target.webSocketDebuggerUrl);
  await page.ready;
  await page.send("Page.enable");
  await page.send("Runtime.enable");
  await page.send("Page.navigate", { url: `${appUrl}/` });
  await page.waitFor(`document.querySelector("main")?.dataset.clientReady === "true"`);
  await page.waitFor(`Boolean(document.querySelector('[data-testid="start-arcade"]'))`);
  const volume = await page.evaluate(`(() => {
    const slider = document.querySelector('[data-testid="game-volume"]');
    if (!slider) return null;
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
    setter.call(slider, "50");
    slider.dispatchEvent(new Event("input", { bubbles: true }));
    return slider.value;
  })()`);
  if (volume !== "50") throw new Error(`Volume slider did not move (${JSON.stringify(volume)}).`);

  const startBox = await page.evaluate(`(() => {
    const node = document.querySelector('[data-testid="start-arcade"]');
    if (!node) return null;
    const rect = node.getBoundingClientRect();
    return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
  })()`);
  if (!startBox) throw new Error("Play is missing.");
  await page.send("Input.dispatchMouseEvent", {
    type: "mousePressed",
    x: startBox.x,
    y: startBox.y,
    button: "left",
    clickCount: 1,
  });
  await page.send("Input.dispatchMouseEvent", {
    type: "mouseReleased",
    x: startBox.x,
    y: startBox.y,
    button: "left",
    clickCount: 1,
  });

  await page.waitFor(
    `["answering","waiting","reveal"].includes(document.querySelector("main")?.dataset.phase ?? "") || Boolean(document.querySelector('[data-testid="round-entry-wait"]'))`,
    15_000,
  );
  const waitState = await page.evaluate(`(() => {
    const wait = document.querySelector('[data-testid="round-entry-wait"]');
    if (!wait) return { kind: "none" };
    const text = wait.textContent ?? "";
    return {
      kind: "wait",
      tips: Boolean(document.querySelector('[data-testid="entry-wait-tips"]')),
      joining: /joining/i.test(text),
    };
  })()`);
  if (waitState.kind === "wait" && !waitState.tips && !waitState.joining) {
    throw new Error("Entry wait has neither tips nor Joining.");
  }
  await page.waitFor(`document.querySelector("main")?.dataset.phase === "answering"`, 45_000);
  await page.evaluate(`(() => {
    const tips = document.querySelector('[data-testid="entry-wait-tips"]');
    const search = document.querySelector('[data-testid="shopkeeper-search-field"], [data-testid="shopkeeper-search"] input');
    if (search instanceof HTMLInputElement) {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
      setter.call(search, "blink");
      search.dispatchEvent(new Event("input", { bubbles: true }));
    }
    window.__waitTips = Boolean(tips);
    window.__shopSearch = Boolean(search);
  })()`);

  const answer = await page.evaluate(`(() => {
    const selectors = [
      '[data-testid="arcade-answer"]:not([disabled])',
      '[data-testid="hero-picker-hero"]',
      '[data-testid="shopkeeper-store-item"]',
      '[data-testid="map-choice-option"]',
      '[data-testid="value-order-card"]',
      '[data-testid="flashback-order-card"]',
    ];
    for (const selector of selectors) {
      const node = document.querySelector(selector);
      if (!node) continue;
      const rect = node.getBoundingClientRect();
      if (rect.width < 2 || rect.height < 2) continue;
      return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2, kind: selector };
    }
    const board = document.querySelector('[data-testid="flashback-year-slider"]');
    if (board) {
      const rect = board.getBoundingClientRect();
      return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2, kind: "board" };
    }
    return { kind: "none", game: document.querySelector("main")?.dataset.questionKind ?? "" };
  })()`);
  if (!answer || answer.kind === "none") {
    throw new Error(`No answer control on the live round (${JSON.stringify(answer)}).`);
  }
  await page.send("Input.dispatchMouseEvent", {
    type: "mousePressed",
    x: answer.x,
    y: answer.y,
    button: "left",
    clickCount: 1,
  });
  await page.send("Input.dispatchMouseEvent", {
    type: "mouseReleased",
    x: answer.x,
    y: answer.y,
    button: "left",
    clickCount: 1,
  });

  await page.waitFor(`document.querySelector("main")?.dataset.phase === "reveal"`, 25_000);
  const reveal = await page.evaluate(`({
    phase: document.querySelector("main")?.dataset.phase ?? "",
    split: Boolean(document.querySelector('[data-testid="crowd-split"]')),
    prompt: Boolean(document.querySelector('[data-testid="round-prompt"]')),
  })`);
  if (reveal.phase !== "reveal") {
    throw new Error(`Did not reach reveal (${JSON.stringify(reveal)}).`);
  }
  if (!reveal.prompt) {
    throw new Error("Reveal has no round prompt.");
  }

  await page.waitFor(`Boolean(document.querySelector('[data-testid="report-question"]'))`, 8_000);
  const reportBtn = await page.evaluate(`(() => {
    const node = document.querySelector('[data-testid="report-question"]');
    if (!node) return null;
    const rect = node.getBoundingClientRect();
    return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
  })()`);
  if (!reportBtn) throw new Error("Reveal has no report control.");
  await page.send("Input.dispatchMouseEvent", {
    type: "mousePressed",
    x: reportBtn.x,
    y: reportBtn.y,
    button: "left",
    clickCount: 1,
  });
  await page.send("Input.dispatchMouseEvent", {
    type: "mouseReleased",
    x: reportBtn.x,
    y: reportBtn.y,
    button: "left",
    clickCount: 1,
  });
  await page.waitFor(`Boolean(document.querySelector('[data-testid="report-reason"]'))`, 5_000);
  const reason = await page.evaluate(`(() => {
    const node = document.querySelector('[data-testid="report-reason"]');
    if (!node) return null;
    const rect = node.getBoundingClientRect();
    return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
  })()`);
  if (!reason) throw new Error("Report reasons did not open.");
  await page.send("Input.dispatchMouseEvent", {
    type: "mousePressed",
    x: reason.x,
    y: reason.y,
    button: "left",
    clickCount: 1,
  });
  await page.send("Input.dispatchMouseEvent", {
    type: "mouseReleased",
    x: reason.x,
    y: reason.y,
    button: "left",
    clickCount: 1,
  });
  await page.waitFor(`Boolean(document.querySelector('[data-testid="report-confirmation"]'))`, 8_000);

  console.log(`Validated public play lobby → answer → reveal (${answer.kind}).`);
} finally {
  await cleanup();
}

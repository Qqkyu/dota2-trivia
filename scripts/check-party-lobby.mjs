#!/usr/bin/env node

/**
 * Clicks through the party wait lobby the way a host does.
 */

import { spawn } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
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
const userDataDir = await mkdtemp(join(tmpdir(), "queue-arcade-lobby-"));
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
  chrome.kill("SIGKILL");
  await rm(userDataDir, { recursive: true, force: true }).catch(() => undefined);
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
  await page.send("Page.navigate", { url: `${appUrl}/party` });
  await page.waitFor(`document.querySelector("main")?.dataset.clientReady === "true"`);
  await page.waitFor(`Boolean(document.querySelector('[data-testid="private-room-setup"]'))`);

  const fill = async (testid, value) => {
    await page.evaluate(`(() => {
      const input = document.querySelector('[data-testid="${testid}"]');
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
      setter.call(input, ${JSON.stringify(value)});
      input.dispatchEvent(new Event("input", { bubbles: true }));
    })()`);
  };
  const clickTestId = async (testid) => {
    const box = await page.evaluate(`(() => {
      const node = document.querySelector('[data-testid="${testid}"]');
      if (!node) return null;
      const rect = node.getBoundingClientRect();
      return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
    })()`);
    if (!box) throw new Error(`${testid} is missing.`);
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
  };

  const partyCode = `L${Date.now().toString(36).slice(-5).toUpperCase()}`;
  await fill("private-room-join-code", partyCode);
  await clickTestId("private-room-enter");
  await page.waitFor(`Boolean(document.querySelector('[data-testid="private-room-wait"]'))`);
  await delay(300);

  const seed = await page.evaluate(`document.querySelector('[data-testid="private-room-name"]')?.value ?? ""`);
  if (!seed.trim()) throw new Error("Wait lobby did not show an auto name.");

  await fill("private-room-name", "");
  await delay(1200);
  const cleared = await page.evaluate(`document.querySelector('[data-testid="private-room-name"]')?.value ?? "missing"`);
  if (cleared !== "") {
    throw new Error(`Clearing the name snapped back to ${JSON.stringify(cleared)}.`);
  }

  await fill("private-room-name", "Alex");
  await delay(1200);
  const renamed = await page.evaluate(`document.querySelector('[data-testid="private-room-name"]')?.value ?? ""`);
  if (renamed !== "Alex") {
    throw new Error(`Typed Alex, got ${JSON.stringify(renamed)} after the poll.`);
  }

  const scoreOnWait = await page.evaluate(
    `[...document.querySelectorAll('[data-testid="private-room-players"] em')].map((node) => node.textContent)`,
  );
  if (scoreOnWait.includes("0")) throw new Error("Wait lobby shows a 0 score before the party starts.");

  const beforeCopy = await page.evaluate(`(() => {
    const button = [...document.querySelectorAll("button")].find((node) => /copy link/i.test(node.textContent ?? ""));
    if (!button) return null;
    const rect = button.getBoundingClientRect();
    return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2, w: Math.round(rect.width) };
  })()`);
  if (!beforeCopy) throw new Error("Copy link is missing.");
  await page.send("Input.dispatchMouseEvent", {
    type: "mousePressed",
    x: beforeCopy.x,
    y: beforeCopy.y,
    button: "left",
    clickCount: 1,
  });
  await page.send("Input.dispatchMouseEvent", {
    type: "mouseReleased",
    x: beforeCopy.x,
    y: beforeCopy.y,
    button: "left",
    clickCount: 1,
  });
  await delay(120);
  const afterCopy = await page.evaluate(`(() => {
    const button = [...document.querySelectorAll("button")].find((node) => /copy link/i.test(node.textContent ?? ""));
    if (!button) return null;
    return {
      w: Math.round(button.getBoundingClientRect().width),
      check: Boolean(document.querySelector('[data-testid="private-room-copied"]')),
    };
  })()`);
  if (!afterCopy?.check) throw new Error("Copy link did not swap to a checkmark.");
  if (afterCopy.w !== beforeCopy.w) {
    throw new Error(`Copy link changed width from ${beforeCopy.w} to ${afterCopy.w}.`);
  }

  const chatAlign = await page.evaluate(`(() => {
    const button = document.querySelector('[data-testid="private-room-chat-toggle"]');
    if (!button) return null;
    const range = document.createRange();
    range.selectNodeContents(button);
    const text = range.getBoundingClientRect();
    const box = button.getBoundingClientRect();
    return {
      label: button.textContent?.trim() ?? "",
      dx: Math.abs((text.left + text.right) / 2 - (box.left + box.right) / 2),
      dy: Math.abs((text.top + text.bottom) / 2 - (box.top + box.bottom) / 2),
    };
  })()`);
  if (!chatAlign || chatAlign.dx > 3 || chatAlign.dy > 3) {
    throw new Error(`Chat toggle text is misaligned (${JSON.stringify(chatAlign)}).`);
  }
  await clickTestId("private-room-chat-toggle");
  await delay(80);
  const hidden = await page.evaluate(`!document.querySelector('[data-testid="private-room-chat"]')`);
  if (!hidden) throw new Error("Chat did not hide.");

  const joinApiGuest = async (playerId, name = "") => {
    const query = new URL(`${appUrl}/api/private-rooms`);
    query.searchParams.set("code", partyCode);
    query.searchParams.set("playerId", playerId);
    if (name) query.searchParams.set("name", name);
    const response = await fetch(query);
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error ?? "Guest join failed.");
    return payload.privateRoom?.players ?? [];
  };

  await joinApiGuest(crypto.randomUUID());
  await joinApiGuest(crypto.randomUUID());
  await delay(1500);
  const roster = await page.evaluate(`(() => {
    const rows = [...document.querySelectorAll('[data-testid="private-room-players"] li')];
    return rows.map((row) => row.querySelector("input")?.value || row.querySelector("strong")?.textContent || "");
  })()`);
  if (roster.length !== 3) {
    throw new Error(`Host plus two guests should be 3 players, got ${roster.length} (${roster.join(", ")}).`);
  }
  if (new Set(roster.map((name) => name.toLowerCase())).size !== 3) {
    throw new Error(`Guests shared a nickname (${roster.join(", ")}).`);
  }
  if (roster.some((name) => !name.trim())) {
    throw new Error(`A player has a blank nickname (${roster.join(", ")}).`);
  }

  await joinApiGuest(crypto.randomUUID().slice(0, 8) + "steal01", "Alex");
  await delay(1500);
  const afterSteal = await page.evaluate(`(() => {
    const rows = [...document.querySelectorAll('[data-testid="private-room-players"] li')];
    return rows.map((row) => row.querySelector("input")?.value || row.querySelector("strong")?.textContent || "");
  })()`);
  if (afterSteal.filter((name) => name.toLowerCase() === "alex").length !== 1) {
    throw new Error(`A guest stole the host nickname (${afterSteal.join(", ")}).`);
  }

  const shots = await page.send("Page.captureScreenshot", { format: "png" });
  await writeFile("/tmp/party-lobby.png", Buffer.from(shots.data, "base64"));
  console.log(
    `Validated party lobby names, uniqueness, and 3 tabs for ${partyCode} (${roster.join(", ")}).`,
  );
} finally {
  await cleanup();
}

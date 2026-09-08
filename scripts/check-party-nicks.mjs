#!/usr/bin/env node

/**
 * Two Chrome profiles: a nick change must show on the other screen.
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

async function openChrome() {
  const port = await freePort();
  const userDataDir = await mkdtemp(join(tmpdir(), "queue-arcade-nicks-"));
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
  const version = await waitJson(`http://127.0.0.1:${port}/json/version`);
  const browser = attachCdp(version.webSocketDebuggerUrl);
  await browser.ready;
  const created = await browser.send("Target.createTarget", { url: "about:blank" });
  const listed = await fetch(`http://127.0.0.1:${port}/json/list`).then((response) => response.json());
  const target = listed.find((entry) => entry.id === created.targetId);
  const page = attachCdp(target.webSocketDebuggerUrl);
  await page.ready;
  await page.send("Page.enable");
  await page.send("Runtime.enable");
  return {
    page,
    async close() {
      try {
        page.socket.close();
      } catch {
        // gone
      }
      try {
        browser.socket.close();
      } catch {
        // gone
      }
      chrome.kill("SIGKILL");
      await rm(userDataDir, { recursive: true, force: true }).catch(() => undefined);
    },
  };
}

async function clickTestId(session, testid) {
  const box = await session.page.evaluate(`(() => {
    const node = document.querySelector('[data-testid="${testid}"]');
    if (!node) return null;
    const rect = node.getBoundingClientRect();
    return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
  })()`);
  if (!box) throw new Error(`${testid} is missing.`);
  await session.page.send("Input.dispatchMouseEvent", {
    type: "mousePressed",
    x: box.x,
    y: box.y,
    button: "left",
    clickCount: 1,
  });
  await session.page.send("Input.dispatchMouseEvent", {
    type: "mouseReleased",
    x: box.x,
    y: box.y,
    button: "left",
    clickCount: 1,
  });
}

async function fill(session, testid, value) {
  await session.page.evaluate(`(() => {
    const input = document.querySelector('[data-testid="${testid}"]');
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
    setter.call(input, ${JSON.stringify(value)});
    input.dispatchEvent(new Event("input", { bubbles: true }));
  })()`);
}

async function commitName(session, value) {
  await clickTestId(session, "private-room-name");
  await delay(80);
  await fill(session, "private-room-name", value);
  const away = await session.page.evaluate(`(() => {
    const node = document.querySelector('[data-testid="private-room-code"]');
    if (!node) return null;
    const rect = node.getBoundingClientRect();
    return { x: rect.x + Math.min(12, rect.width / 2), y: rect.y + rect.height / 2 };
  })()`);
  if (!away) throw new Error("Party code is missing.");
  await session.page.send("Input.dispatchMouseEvent", {
    type: "mousePressed",
    x: away.x,
    y: away.y,
    button: "left",
    clickCount: 1,
  });
  await session.page.send("Input.dispatchMouseEvent", {
    type: "mouseReleased",
    x: away.x,
    y: away.y,
    button: "left",
    clickCount: 1,
  });
  await delay(600);
}

const partyCode = `N${Date.now().toString(36).slice(-5).toUpperCase()}`;
let host = null;
let guest = null;

try {
  host = await openChrome();
  await host.page.send("Page.navigate", { url: `${appUrl}/party` });
  await host.page.waitFor(`document.querySelector("main")?.dataset.clientReady === "true"`);
  await host.page.waitFor(`Boolean(document.querySelector('[data-testid="private-room-setup"]'))`);
  await clickTestId(host, "private-room-choose-create");
  await host.page.waitFor(`document.querySelector('[data-testid="private-room-setup"]')?.dataset.path === "create"`);
  await fill(host, "private-room-join-code", partyCode);
  await clickTestId(host, "private-room-create");
  await host.page.waitFor(`Boolean(document.querySelector('[data-testid="private-room-wait"]'))`);
  await commitName(host, "Alex");

  guest = await openChrome();
  await guest.page.send("Page.navigate", { url: `${appUrl}/party` });
  await guest.page.waitFor(`document.querySelector("main")?.dataset.clientReady === "true"`);
  await guest.page.waitFor(`Boolean(document.querySelector('[data-testid="private-room-setup"]'))`);
  await clickTestId(guest, "private-room-choose-join");
  await guest.page.waitFor(`document.querySelector('[data-testid="private-room-setup"]')?.dataset.path === "join"`);
  await fill(guest, "private-room-join-code", partyCode);
  await clickTestId(guest, "private-room-join");
  await guest.page.waitFor(`Boolean(document.querySelector('[data-testid="private-room-wait"]'))`);
  await guest.page.waitFor(
    `[...document.querySelectorAll('[data-testid="private-room-players"] strong')].some((node) => node.textContent === "Alex")`,
    5_000,
  );

  await commitName(host, "Loda");
  await guest.page.waitFor(
    `[...document.querySelectorAll('[data-testid="private-room-players"] strong')].some((node) => node.textContent === "Loda")`,
    5_000,
  );
  console.log(`Validated nick sync across two Chrome profiles for ${partyCode}.`);
} finally {
  await host?.close();
  await guest?.close();
}

#!/usr/bin/env node

/**
 * Shopkeeper-only party: Search Items must filter the store, and Enter picks
 * the item only when exactly one is left.
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

const port = await freePort();
const userDataDir = await mkdtemp(join(tmpdir(), "queue-arcade-shop-"));
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
  await page.evaluate(`document.querySelector('[data-testid="private-room-choose-create"]')?.click()`);
  await page.waitFor(`document.querySelector('[data-testid="private-room-setup"]')?.dataset.path === "create"`);

  await page.evaluate(`(() => {
    for (const card of document.querySelectorAll('[data-on="true"]')) card.click();
    document.querySelector('[data-testid="format-preview-stage-shopkeeper"]')?.closest("button")?.click();
  })()`);
  const partyCode = `S${Date.now().toString(36).slice(-5).toUpperCase()}`;
  await page.evaluate(`(() => {
    const input = document.querySelector('[data-testid="private-room-join-code"]');
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
    setter.call(input, ${JSON.stringify(partyCode)});
    input.dispatchEvent(new Event("input", { bubbles: true }));
  })()`);

  const createBox = await page.evaluate(`(() => {
    const node = document.querySelector('[data-testid="private-room-create"]');
    const rect = node.getBoundingClientRect();
    return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
  })()`);
  await page.send("Input.dispatchMouseEvent", {
    type: "mousePressed",
    x: createBox.x,
    y: createBox.y,
    button: "left",
    clickCount: 1,
  });
  await page.send("Input.dispatchMouseEvent", {
    type: "mouseReleased",
    x: createBox.x,
    y: createBox.y,
    button: "left",
    clickCount: 1,
  });
  await page.waitFor(`Boolean(document.querySelector('[data-testid="private-room-wait"]'))`);
  await page.evaluate(`document.querySelector('[data-testid="private-room-start"]')?.click()`);
  await page.waitFor(
    `Boolean(document.querySelector('[data-testid="shopkeeper-search"], [data-testid="shopkeeper-search-field"]'))`,
    12_000,
  );

  await page.send("Emulation.setDeviceMetricsOverride", {
    width: 420,
    height: 800,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await delay(250);
  const phoneShop = await page.evaluate(`(() => {
    const store = document.querySelector('[data-testid="shopkeeper-store"]');
    const item = document.querySelector('[data-testid="shopkeeper-store-item"]');
    const prompt = document.querySelector('[data-testid="round-prompt"]');
    if (!store || !item) return { ok: false };
    const storeBox = store.getBoundingClientRect();
    const itemBox = item.getBoundingClientRect();
    const promptBox = prompt?.getBoundingClientRect();
    return {
      ok: true,
      storeH: Math.round(storeBox.height),
      itemInView: itemBox.bottom > 0 && itemBox.top < window.innerHeight,
      overlapPrompt: Boolean(
        promptBox &&
          storeBox.left < promptBox.right &&
          storeBox.right > promptBox.left &&
          storeBox.top < promptBox.bottom &&
          storeBox.bottom > promptBox.top,
      ),
    };
  })()`);
  if (!phoneShop.ok || phoneShop.storeH < 80 || !phoneShop.itemInView || phoneShop.overlapPrompt) {
    throw new Error(`Shopkeeper is unusable at 420px (${JSON.stringify(phoneShop)}).`);
  }
  await page.send("Emulation.clearDeviceMetricsOverride");
  await delay(150);

  const before = await page.evaluate(`document.querySelectorAll('[data-testid="shopkeeper-store-item"]').length`);
  await page.evaluate(`(() => {
    const search = document.querySelector('[data-testid="shopkeeper-search"], [data-testid="shopkeeper-search-field"]');
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
    setter.call(search, "blink");
    search.dispatchEvent(new Event("input", { bubbles: true }));
  })()`);
  await delay(200);
  const after = await page.evaluate(`document.querySelectorAll('[data-testid="shopkeeper-store-item"]').length`);
  if (!(before > after) || after < 1) {
    throw new Error(`Shop search did not filter items (${before} → ${after}).`);
  }

  const setSearch = async (value) => {
    await page.evaluate(`(() => {
      const search = document.querySelector('[data-testid="shopkeeper-search-field"]');
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
      setter.call(search, ${JSON.stringify(value)});
      search.dispatchEvent(new Event("input", { bubbles: true }));
      search.focus();
    })()`);
    await delay(150);
  };
  const pressEnter = async () => {
    const key = { key: "Enter", code: "Enter", windowsVirtualKeyCode: 13 };
    await page.send("Input.dispatchKeyEvent", { type: "keyDown", ...key });
    await page.send("Input.dispatchKeyEvent", { type: "keyUp", ...key });
    await delay(200);
  };
  const storeState = `(() => {
    const store = document.querySelector('[data-testid="shopkeeper-store"]');
    const slots = [...document.querySelectorAll('[data-testid="shopkeeper-recipe-slot"]:not([data-empty="true"])')];
    return {
      locked: store?.dataset.locked,
      query: document.querySelector('[data-testid="shopkeeper-search-field"]')?.value ?? "",
      items: document.querySelectorAll('[data-testid="shopkeeper-store-item"]').length,
      filledSlots: slots.length,
      recipe: Boolean(document.querySelector('[data-testid="shopkeeper-recipe-builder"]')),
    };
  })()`;

  // Several matches: Enter must not pick anything.
  await pressEnter();
  const many = await page.evaluate(storeState);
  if (many.locked !== "false" || many.filledSlots !== 0 || many.query !== "blink") {
    throw new Error(`Enter picked an item with ${many.items} matches: ${JSON.stringify(many)}`);
  }

  // One match: Enter picks it (locks the store, or fills a recipe slot).
  await setSearch("blink dagger");
  const single = await page.evaluate(storeState);
  if (single.items !== 1) throw new Error(`"blink dagger" did not leave one item: ${JSON.stringify(single)}`);
  await pressEnter();
  const picked = await page.evaluate(storeState);
  const pickedOk = picked.query === "" && (picked.recipe ? picked.filledSlots === 1 : picked.locked === "true");
  if (!pickedOk) throw new Error(`Enter did not pick the only item: ${JSON.stringify(picked)}`);
  console.log(`Validated Shopkeeper search (${before} → ${after} items) and Enter picks the only match.`);
} finally {
  await cleanup();
}

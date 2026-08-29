#!/usr/bin/env node

/**
 * Opens the party picker and fails if a format preview is clipped.
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

const MEASURE_STAGES = `(() =>
  [...document.querySelectorAll('[data-testid^="format-preview-stage-"]')].map((stage) => {
    const box = stage.getBoundingClientRect();
    return {
      id: stage.getAttribute("data-testid"),
      w: Math.round(box.width),
      h: Math.round(box.height),
    };
  })
)()`;

const port = await freePort();
const userDataDir = await mkdtemp(join(tmpdir(), "queue-arcade-party-"));
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
    "--window-size=1400,1800",
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
  await page.send("Page.navigate", { url: `${appUrl}/profile?recordsPreview=short` });
  await page.waitFor(`Boolean(document.querySelector('[data-testid^="format-preview-stage-"]'))`);
  const profileShots = await page.send("Page.captureScreenshot", { format: "png" });
  await writeFile("/tmp/profile-previews.png", Buffer.from(profileShots.data, "base64"));
  const profileStages = await page.evaluate(MEASURE_STAGES);
  const profileHeight = profileStages[0]?.h;
  if (!profileHeight) throw new Error("Profile has no format preview stages.");

  await page.send("Page.navigate", { url: appUrl });
  await page.waitFor(`document.querySelector("main")?.dataset.clientReady === "true"`);
  await page.waitFor(`Boolean(document.querySelector('[data-testid="private-room-open"]'))`);
  const box = await page.evaluate(`(() => {
    const node = document.querySelector('[data-testid="private-room-open"]');
    if (!node) return null;
    const rect = node.getBoundingClientRect();
    return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2, w: rect.width, h: rect.height };
  })()`);
  if (!box || box.w < 2) throw new Error("Play with friends is not clickable.");
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
  await page.waitFor(`Boolean(document.querySelector('[data-testid="private-room-setup"]'))`);
  await delay(400);
  const shots = await page.send("Page.captureScreenshot", { format: "png" });
  await writeFile("/tmp/party-previews.png", Buffer.from(shots.data, "base64"));
  const partyStages = await page.evaluate(MEASURE_STAGES);
  if (!partyStages.length) throw new Error("Party setup rendered no format preview stages.");
  const profileWidth = profileStages[0]?.w;
  const mismatched = partyStages.filter(
    (stage) => Math.abs(stage.h - profileHeight) > 2 || Math.abs(stage.w - profileWidth) > 8,
  );
  if (mismatched.length) {
    console.error(
      mismatched
        .map(
          (stage) =>
            `${stage.id} is ${stage.w}x${stage.h}; profile previews are ${profileWidth}x${profileHeight}.`,
        )
        .join("\n"),
    );
    process.exitCode = 1;
  } else {
    const controls = await page.evaluate(`(() => ({
      create: Boolean(document.querySelector('[data-testid="private-room-create"]')),
      join: Boolean(document.querySelector('[data-testid="private-room-join"]')),
      code: Boolean(document.querySelector('[data-testid="private-room-join-code"]')),
      selected: document.querySelectorAll('[data-on="true"]').length,
    }))()`);
    if (!controls.create || !controls.join || !controls.code) {
      console.error("Party setup is missing create, join, or the code field.");
      process.exitCode = 1;
    } else {
      const firstCard = await page.evaluate(`(() => {
        const node = document.querySelector('[data-testid="format-preview-stage-trivia"]')?.closest("button");
        if (!node) return null;
        const rect = node.getBoundingClientRect();
        return { x: rect.x + rect.width / 2, y: rect.y + 24 };
      })()`);
      if (!firstCard) throw new Error("Classic Trivia party card is missing.");
      await page.send("Input.dispatchMouseEvent", {
        type: "mousePressed",
        x: firstCard.x,
        y: firstCard.y,
        button: "left",
        clickCount: 1,
      });
      await page.send("Input.dispatchMouseEvent", {
        type: "mouseReleased",
        x: firstCard.x,
        y: firstCard.y,
        button: "left",
        clickCount: 1,
      });
      await delay(200);
      const afterToggle = await page.evaluate(
        `document.querySelector('[data-testid="format-preview-stage-trivia"]')?.closest("button")?.getAttribute("data-on")`,
      );
      if (afterToggle !== "false") {
        console.error(`Classic Trivia stayed selected after click (data-on=${afterToggle}).`);
        process.exitCode = 1;
      } else {
        console.log(
          `Validated ${partyStages.length} party previews match the ${profileWidth}x${profileHeight} profile crop. ${controls.selected} games selected.`,
        );
      }
    }
  }
} finally {
  await cleanup();
}

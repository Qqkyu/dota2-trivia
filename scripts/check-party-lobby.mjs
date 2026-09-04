#!/usr/bin/env node

/**
 * Clicks through the party wait lobby the way a host does.
 */

import { spawn } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PRIVATE_ROOM_NAME_NOTICE_MS } from "../src/lib/private-rooms.mjs";

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
  const focusName = async () => {
    await clickTestId("private-room-name");
    await delay(80);
  };
  const commitName = async (value) => {
    await focusName();
    await fill("private-room-name", value);
    await blurName();
  };
  const blurName = async () => {
    const away = await page.evaluate(`(() => {
      const node = document.querySelector('[data-testid="private-room-code"]');
      if (!node) return null;
      const rect = node.getBoundingClientRect();
      return { x: rect.x + Math.min(12, rect.width / 2), y: rect.y + rect.height / 2 };
    })()`);
    if (!away) throw new Error("Party code is missing.");
    await page.send("Input.dispatchMouseEvent", {
      type: "mousePressed",
      x: away.x,
      y: away.y,
      button: "left",
      clickCount: 1,
    });
    await page.send("Input.dispatchMouseEvent", {
      type: "mouseReleased",
      x: away.x,
      y: away.y,
      button: "left",
      clickCount: 1,
    });
    await delay(600);
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
  await fill("private-room-join-code", "NOPE99");
  await clickTestId("private-room-join");
  await delay(400);
  const missingJoin = await page.evaluate(`(() => ({
    setup: Boolean(document.querySelector('[data-testid="private-room-setup"]')),
    wait: Boolean(document.querySelector('[data-testid="private-room-wait"]')),
    error: document.querySelector('[data-testid="private-room-error"]')?.textContent?.trim() ?? "",
  }))()`);
  if (!missingJoin.setup || missingJoin.wait) {
    throw new Error(`Join created a party (${JSON.stringify(missingJoin)}).`);
  }
  if (missingJoin.error !== "No party with that code.") {
    throw new Error(`Join of a missing code did not fail (${JSON.stringify(missingJoin)}).`);
  }

  await fill("private-room-join-code", partyCode);
  await clickTestId("private-room-create");
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

  await fill("private-room-name", "A");
  await delay(1200);
  const prefix = await page.evaluate(`document.querySelector('[data-testid="private-room-name"]')?.value ?? ""`);
  if (prefix !== "A") {
    throw new Error(`Typing A was eaten by the uniqueness check (${JSON.stringify(prefix)}).`);
  }
  await commitName("Alex");

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
    const face = button.querySelector('[data-show="true"]');
    const icon = button.querySelector('[data-testid="private-room-chat-icon"], svg');
    return {
      label: face?.textContent?.trim() ?? "",
      icon: Boolean(icon),
    };
  })()`);
  if (!chatAlign?.icon) {
    throw new Error(`Chat toggle has no icon (${JSON.stringify(chatAlign)}).`);
  }
  if (!chatAlign.label) {
    throw new Error("Chat toggle has no label.");
  }
  const chatLook = await page.evaluate(`(() => {
    const button = document.querySelector('[data-testid="private-room-chat-toggle"]');
    if (!button) return null;
    const style = getComputedStyle(button);
    const box = button.getBoundingClientRect();
    const parent = button.parentElement?.getBoundingClientRect();
    return {
      border: Number.parseFloat(style.borderTopWidth),
      width: Math.round(box.width),
      parent: parent ? Math.round(parent.width) : 0,
    };
  })()`);
  if (!chatLook || chatLook.border < 1) {
    throw new Error(`Hide chat does not look like a button (${JSON.stringify(chatLook)}).`);
  }
  if (chatLook.parent > 0 && chatLook.width >= chatLook.parent - 4) {
    throw new Error("Hide chat is a full-width bar, not a button.");
  }
  await clickTestId("private-room-chat-toggle");
  await delay(80);
  const afterHide = await page.evaluate(`(() => {
    const button = document.querySelector('[data-testid="private-room-chat-toggle"]');
    return {
      hidden: !document.querySelector('[data-testid="private-room-chat"]'),
      width: button ? Math.round(button.getBoundingClientRect().width) : 0,
    };
  })()`);
  if (!afterHide.hidden) throw new Error("Chat did not hide.");
  if (afterHide.width !== chatLook.width) {
    throw new Error(`Hide chat changed width from ${chatLook.width} to ${afterHide.width}.`);
  }

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

  const guestA = crypto.randomUUID();
  await joinApiGuest(guestA);
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

  await joinApiGuest(guestA, "Alex");
  await delay(1500);
  const afterSteal = await page.evaluate(`(() => {
    const rows = [...document.querySelectorAll('[data-testid="private-room-players"] li')];
    return rows.map((row) => row.querySelector("input")?.value || row.querySelector("strong")?.textContent || "");
  })()`);
  if (afterSteal.filter((name) => name.toLowerCase() === "alex").length !== 1) {
    throw new Error(`A guest stole the host nickname (${afterSteal.join(", ")}).`);
  }

  const otherSession = await joinApiGuest(crypto.randomUUID());
  if (!otherSession.some((player) => player.name === "Alex")) {
    throw new Error(
      `Other session still has the old nick (${otherSession.map((player) => player.name).join(", ")}).`,
    );
  }

  const guestNick = afterSteal.find((name) => name && name.toLowerCase() !== "alex");
  if (!guestNick) throw new Error("Need a guest nick to test taken names.");
  const layoutBefore = await page.evaluate(`(() => {
    const input = document.querySelector('[data-testid="private-room-name"]');
    const pen = document.querySelector('[data-testid="private-room-name-pen"]');
    const row = input?.closest("li");
    if (!input || !pen || !row) return null;
    return {
      value: input.value,
      nameY: Math.round(input.getBoundingClientRect().y),
      penY: Math.round(pen.getBoundingClientRect().y),
      rowH: Math.round(row.getBoundingClientRect().height),
    };
  })()`);
  if (!layoutBefore) throw new Error("Could not measure the name row.");
  await commitName(guestNick);
  const taken = await page.evaluate(`(() => {
    const input = document.querySelector('[data-testid="private-room-name"]');
    const pen = document.querySelector('[data-testid="private-room-name-pen"]');
    const row = input?.closest("li");
    const nameError = document.querySelector('[data-testid="private-room-name-error"]');
    const startError = document.querySelector('[data-testid="private-room-error"]');
    const nameBox = input?.getBoundingClientRect();
    const errBox = nameError?.getBoundingClientRect();
    return {
      value: input?.value ?? "",
      text: nameError?.textContent?.trim() ?? "",
      underStart: startError?.textContent?.trim() ?? "",
      invalid: input?.getAttribute("data-invalid") === "true" || input?.getAttribute("aria-invalid") === "true",
      nameY: input ? Math.round(input.getBoundingClientRect().y) : null,
      penY: pen ? Math.round(pen.getBoundingClientRect().y) : null,
      rowH: row ? Math.round(row.getBoundingClientRect().height) : null,
      gap: nameBox && errBox ? errBox.top - nameBox.bottom : null,
    };
  })()`);
  if (taken.text !== "That name is taken.") {
    throw new Error(`Missing name-taken error (${JSON.stringify(taken)}).`);
  }
  if (taken.underStart === "That name is taken.") {
    throw new Error("Name-taken error is under Start.");
  }
  if (taken.invalid) {
    throw new Error("Reverted nick still has a red error line.");
  }
  if (taken.value !== layoutBefore.value) {
    throw new Error(`Taken nick stayed in the field (${taken.value}), so other screens would disagree.`);
  }
  if (taken.nameY !== layoutBefore.nameY || taken.penY !== layoutBefore.penY || taken.rowH !== layoutBefore.rowH) {
    throw new Error(`Name row moved when the error appeared (${JSON.stringify({ layoutBefore, taken })}).`);
  }
  await delay(PRIVATE_ROOM_NAME_NOTICE_MS + 200);
  const noticeGone = await page.evaluate(`!document.querySelector('[data-testid="private-room-name-error"]')`);
  if (!noticeGone) throw new Error("Name-taken error stayed on screen.");

  await commitName("Alex");

  await clickTestId("private-room-start");
  await page.waitFor(`Boolean(document.querySelector('[data-testid="private-room-countdown"]'))`);
  const count = await page.evaluate(
    `document.querySelector('[data-testid="private-room-countdown"]')?.textContent?.trim() ?? ""`,
  );
  if (!["3", "2", "1"].includes(count)) {
    throw new Error(`Start countdown was ${JSON.stringify(count)}, expected 3, 2, or 1.`);
  }
  const startingLabel = await page.evaluate(
    `[...document.querySelectorAll("button")].some((node) => /starting/i.test(node.textContent ?? ""))`,
  );
  if (startingLabel) throw new Error("Start still shows a Starting label.");

  await clickTestId("private-room-leave");
  await page.waitFor(`Boolean(document.querySelector('[data-testid="private-room-open"]'))`);
  await clickTestId("private-room-open");
  await page.waitFor(`Boolean(document.querySelector('[data-testid="private-room-setup"]'))`);
  const reopenedWait = await page.evaluate(`Boolean(document.querySelector('[data-testid="private-room-wait"]'))`);
  if (reopenedWait) throw new Error("Leave then Play with friends reopened the old party.");

  await fill("private-room-join-code", partyCode);
  await clickTestId("private-room-create");
  await delay(400);
  const takenCode = await page.evaluate(`(() => ({
    setup: Boolean(document.querySelector('[data-testid="private-room-setup"]')),
    wait: Boolean(document.querySelector('[data-testid="private-room-wait"]')),
    error: document.querySelector('[data-testid="private-room-error"]')?.textContent?.trim() ?? "",
  }))()`);
  if (!takenCode.setup || takenCode.wait) {
    throw new Error(`Create joined an existing party (${JSON.stringify(takenCode)}).`);
  }
  if (takenCode.error !== "That code is taken.") {
    throw new Error(`Create did not say the code is taken (${JSON.stringify(takenCode)}).`);
  }
  const peekOnce = await fetch(`${appUrl}/api/private-rooms?code=${encodeURIComponent(partyCode)}&peek=1`);
  const peekAgain = await fetch(`${appUrl}/api/private-rooms?code=${encodeURIComponent(partyCode)}&peek=1`);
  const peekPlayers = (await peekOnce.json()).privateRoom?.players ?? [];
  const peekPlayersAgain = (await peekAgain.json()).privateRoom?.players ?? [];
  if (!peekOnce.ok || peekPlayers.length !== peekPlayersAgain.length) {
    throw new Error("Peeking at a party added a player.");
  }
  await clickTestId("private-room-join");
  await page.waitFor(`Boolean(document.querySelector('[data-testid="private-room-wait"]'))`);

  const shots = await page.send("Page.captureScreenshot", { format: "png" });
  await writeFile("/tmp/party-lobby.png", Buffer.from(shots.data, "base64"));
  console.log(
    `Validated party lobby names, uniqueness, and 3 tabs for ${partyCode} (${roster.join(", ")}).`,
  );
} finally {
  await cleanup();
}

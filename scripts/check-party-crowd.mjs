#!/usr/bin/env node

/**
 * Party layout on big and small screens. 1 / 20 / 50 / 100 seats must not
 * overlap. The 101st join must fail.
 */

import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PRIVATE_ROOM_PLAYER_MAX } from "../src/lib/private-rooms.mjs";

const appUrl = (process.env.APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
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

const VIEWPORTS = [
  { name: "1080p", width: 1920, height: 1080 },
  { name: "desktop", width: 1400, height: 900 },
  { name: "laptop", width: 1280, height: 720 },
  { name: "small", width: 1024, height: 700 },
  { name: "narrow", width: 900, height: 720 },
  { name: "short", width: 1280, height: 640 },
];

const port = await freePort();
const userDataDir = await mkdtemp(join(tmpdir(), "queue-arcade-crowd-"));
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
    "--window-size=1920,1080",
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
  await page.waitFor(`Boolean(document.querySelector('[data-testid="private-room-choose-create"]'))`);

  const clickTestId = async (testid) => {
    const box = await page.evaluate(`(() => {
      const node = document.querySelector('[data-testid="${testid}"]');
      if (!node) return null;
      node.scrollIntoView({ block: "center" });
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

  const fill = async (testid, value) => {
    await page.evaluate(`(() => {
      const input = document.querySelector('[data-testid="${testid}"]');
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
      setter.call(input, ${JSON.stringify(value)});
      input.dispatchEvent(new Event("input", { bubbles: true }));
    })()`);
  };

  async function setViewport(viewport) {
    const { windowId } = await browser.send("Browser.getWindowForTarget", { targetId: created.targetId });
    await browser.send("Browser.setWindowBounds", {
      windowId,
      bounds: {
        left: 0,
        top: 0,
        width: viewport.width,
        height: viewport.height,
        windowState: "normal",
      },
    });
    await page.send("Emulation.setDeviceMetricsOverride", {
      width: viewport.width,
      height: viewport.height,
      deviceScaleFactor: 1,
      mobile: false,
    });
    await delay(250);
    const size = await page.evaluate(`({ w: window.innerWidth, h: window.innerHeight })`);
    if (Math.abs(size.w - viewport.width) > 48 || Math.abs(size.h - viewport.height) > 96) {
      throw new Error(
        `Viewport ${viewport.name} is ${size.w}x${size.h}, wanted ${viewport.width}x${viewport.height}. The test was not using the real window size.`,
      );
    }
  }

  async function measureCreate(viewport) {
    await setViewport(viewport);
    const layout = await page.evaluate(`(() => {
      const setup = document.querySelector('[data-testid="private-room-setup"]');
      const create = document.querySelector('[data-testid="private-room-create"]');
      const games = document.querySelector('[aria-label="Games"]');
      const main = document.querySelector("main");
      if (!setup || !create || !games || !main) return { missing: true };
      const createBox = create.getBoundingClientRect();
      const belowFold = createBox.bottom > window.innerHeight + 4;
      const scrollRoot = setup.scrollHeight > setup.clientHeight + 8 ? setup : main.scrollHeight > main.clientHeight + 8 ? main : document.scrollingElement;
      const canScroll = Boolean(scrollRoot && scrollRoot.scrollHeight > scrollRoot.clientHeight + 8);
      if (belowFold && canScroll) {
        create.scrollIntoView({ block: "end" });
      }
      const after = create.getBoundingClientRect();
      return {
        missing: false,
        innerH: window.innerHeight,
        belowFold,
        canScroll,
        createInView: after.top >= 0 && after.bottom <= window.innerHeight + 4,
        setupOverflow: setup.scrollHeight - setup.clientHeight,
        mainOverflow: main.scrollHeight - main.clientHeight,
      };
    })()`);
    const label = `create @ ${viewport.name}`;
    if (layout.missing) throw new Error(`${label}: Create party screen is missing.`);
    if (layout.belowFold && !layout.canScroll) {
      throw new Error(`${label}: Create is below the fold and the page cannot scroll.`);
    }
    if (!layout.createInView) {
      throw new Error(`${label}: Create button is still off screen after scroll.`);
    }
  }

  const partyCode = `C${Date.now().toString(36).slice(-5).toUpperCase()}`;
  await clickTestId("private-room-choose-create");
  await page.waitFor(`document.querySelector('[data-testid="private-room-setup"]')?.dataset.path === "create"`);
  for (const viewport of VIEWPORTS) await measureCreate(viewport);
  await setViewport(VIEWPORTS[1]);
  await fill("private-room-join-code", partyCode);
  await delay(80);
  await page.evaluate(`document.querySelector('[data-testid="private-room-create"]')?.scrollIntoView({ block: "center" })`);
  await clickTestId("private-room-create");
  await page.waitFor(`Boolean(document.querySelector('[data-testid="private-room-wait"]'))`);
  await page.waitFor(`Boolean(document.querySelector('[data-testid="private-room-start"]'))`);

  async function joinGuests(from, to) {
    for (let index = from; index < to; index += 1) {
      const query = new URL(`${appUrl}/api/private-rooms`);
      query.searchParams.set("code", partyCode);
      query.searchParams.set("playerId", `crowd-${index}-${randomUUID()}`);
      query.searchParams.set("name", index === 1 ? "W".repeat(24) : `P${String(index).padStart(3, "0")}`);
      const response = await fetch(query);
      if (!response.ok) {
        throw new Error(`Guest ${index} could not join (${response.status}).`);
      }
    }
  }

  async function measureLobby(expected, viewport) {
    await setViewport(viewport);
    await page.waitFor(
      `document.querySelectorAll('[data-testid="private-room-players"] li').length === ${expected}`,
      8_000,
    );
    const layout = await page.evaluate(`(() => {
      const overlap = (a, b) =>
        Boolean(a && b && a.left < b.right - 1 && a.right > b.left + 1 && a.top < b.bottom - 1 && a.bottom > b.top + 1);
      const boxOf = (node) => (node ? node.getBoundingClientRect() : null);
      const inView = (box) =>
        Boolean(
          box &&
            box.top >= -1 &&
            box.bottom <= window.innerHeight + 1 &&
            box.left >= -1 &&
            box.right <= window.innerWidth + 1,
        );
      const scroll = document.querySelector('[data-testid="private-room-players-scroll"]');
      const list = document.querySelector('[data-testid="private-room-players"]');
      const start = document.querySelector('[data-testid="private-room-start"]');
      const chat = document.querySelector('[data-testid="private-room-chat"]');
      const toggle = document.querySelector('[data-testid="private-room-chat-toggle"]');
      const input = document.querySelector('[data-testid="private-room-chat-input"]');
      const header = document.querySelector("header");
      const footer = document.querySelector("footer");
      const rows = [...(list?.querySelectorAll("li") ?? [])];
      const listBox = boxOf(scroll);
      const startBox = boxOf(start);
      const chatBox = boxOf(chat);
      const toggleBox = boxOf(toggle);
      const inputBox = boxOf(input);
      const hits = [];
      if (overlap(listBox, startBox)) hits.push("list/start");
      if (overlap(listBox, chatBox)) hits.push("list/chat");
      if (overlap(startBox, chatBox)) hits.push("start/chat");
      if (overlap(startBox, toggleBox)) hits.push("start/toggle");
      if (overlap(inputBox, toggleBox)) hits.push("input/toggle");
      if (overlap(startBox, boxOf(header))) hits.push("start/header");
      if (footer && getComputedStyle(footer).display !== "none") {
        if (overlap(startBox, boxOf(footer))) hits.push("start/footer");
        if (overlap(chatBox, boxOf(footer))) hits.push("chat/footer");
        if (overlap(toggleBox, boxOf(footer))) hits.push("toggle/footer");
      }
      const visibleRows = rows.filter((row) => {
        const box = row.getBoundingClientRect();
        return listBox && box.bottom > listBox.top + 2 && box.top < listBox.bottom - 2 && box.height > 8;
      }).length;
      return {
        count: document.querySelector('[data-testid="private-room-player-count"]')?.textContent?.trim() ?? "",
        rows: rows.length,
        visibleRows,
        listH: listBox ? Math.round(listBox.height) : 0,
        pageOverflowX: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
        startInView: inView(startBox),
        chatInView: inView(toggleBox),
        inputInView: inView(inputBox),
        listInView: inView(listBox) && (listBox?.height ?? 0) >= 48,
        stacked:
          Boolean(listBox && startBox && chatBox && toggleBox && inputBox) &&
          startBox.top + 1 >= listBox.bottom &&
          chatBox.top + 1 >= startBox.bottom &&
          toggleBox.top + 1 >= chatBox.bottom &&
          toggleBox.top + 1 >= inputBox.bottom,
        listScrolls: Boolean(scroll) && listBox && listBox.height >= 48 && scroll.scrollHeight > listBox.height + 1,
        rowOverflow: rows.some((row) => row.scrollWidth > (scroll?.clientWidth ?? 0) + 2),
        hits,
      };
    })()`);
    const label = `${expected} players @ ${viewport.name}`;
    if (layout.rows !== expected) {
      throw new Error(`${label}: lobby has ${layout.rows} rows.`);
    }
    if (layout.count !== `${expected}/${PRIVATE_ROOM_PLAYER_MAX}`) {
      throw new Error(`${label}: count was ${JSON.stringify(layout.count)}.`);
    }
    if (layout.pageOverflowX) throw new Error(`${label}: page overflows sideways.`);
    if (!layout.startInView) throw new Error(`${label}: Start is off screen.`);
    if (!layout.chatInView) throw new Error(`${label}: Chat is off screen.`);
    if (!layout.inputInView) throw new Error(`${label}: Chat input is off screen.`);
    if (!layout.listInView) throw new Error(`${label}: Player list is missing or too short (${layout.listH}px).`);
    if (layout.visibleRows < 1) throw new Error(`${label}: no player row is visible.`);
    if (!layout.stacked) throw new Error(`${label}: list, Start, chat, and Hide chat are not stacked.`);
    if (layout.hits.length) throw new Error(`${label}: overlap ${layout.hits.join(", ")}.`);
    if (expected >= 20 && !layout.listScrolls) throw new Error(`${label}: player list does not scroll.`);
    if (layout.rowOverflow) throw new Error(`${label}: a player row is cut off.`);
  }

  async function measureAllLobbies(expected) {
    for (const viewport of VIEWPORTS) await measureLobby(expected, viewport);
  }

  await measureAllLobbies(1);
  await joinGuests(1, 20);
  await measureAllLobbies(20);
  await joinGuests(20, 50);
  await measureAllLobbies(50);
  await joinGuests(50, PRIVATE_ROOM_PLAYER_MAX);
  await measureAllLobbies(PRIVATE_ROOM_PLAYER_MAX);

  const extra = await fetch(
    `${appUrl}/api/private-rooms?code=${encodeURIComponent(partyCode)}&playerId=${encodeURIComponent(`crowd-late-${randomUUID()}`)}&name=Nope`,
  );
  const extraBody = await extra.json().catch(() => null);
  if (extra.status !== 409 || extraBody?.error !== "This party is full.") {
    throw new Error(`101st join was ${extra.status} ${JSON.stringify(extraBody)}.`);
  }
  await delay(1200);
  const stillFull = await page.evaluate(`document.querySelectorAll('[data-testid="private-room-players"] li').length`);
  if (stillFull !== PRIVATE_ROOM_PLAYER_MAX) {
    throw new Error(`Full party grew to ${stillFull} after a blocked join.`);
  }

  await setViewport(VIEWPORTS[1]);
  await clickTestId("private-room-start");
  await page.waitFor(`Boolean(document.querySelector('[data-testid="private-room-ranking"]'))`, 12_000);
  await page.waitFor(
    `document.querySelectorAll('[data-testid="private-room-ranking"] li').length === ${PRIVATE_ROOM_PLAYER_MAX}`,
    8_000,
  );

  async function measurePlay(viewport) {
    await setViewport(viewport);
    await page.waitFor(
      `document.querySelectorAll('[data-testid="private-room-ranking"] li').length === ${PRIVATE_ROOM_PLAYER_MAX}`,
      8_000,
    );
    await page.evaluate(
      `document.querySelector('[data-testid="private-room-play-dock"]')?.scrollIntoView({ block: "nearest" })`,
    );
    const play = await page.evaluate(`(() => {
    const overlap = (a, b) =>
      Boolean(a && b && a.left < b.right - 1 && a.right > b.left + 1 && a.top < b.bottom - 1 && a.bottom > b.top + 1);
    const boxOf = (node) => (node ? node.getBoundingClientRect() : null);
    const dock = document.querySelector('[data-testid="private-room-play-dock"]');
    const ranking = document.querySelector('[data-testid="private-room-ranking"]');
    const chat = document.querySelector('[data-testid="private-room-chat-toggle"]');
    const header = document.querySelector("header");
    const volume = document.querySelector('[data-testid="game-volume"]');
    const timer = document.querySelector('[data-testid="round-timer"]');
    const answers = [...document.querySelectorAll('[data-testid="arcade-answer"]')];
    const sideRail = document.querySelector('[aria-label="Your session"]');
    if (!dock || !ranking || !chat) return null;
    const box = dock.getBoundingClientRect();
    const rankBox = ranking.getBoundingClientRect();
    const rows = [...ranking.querySelectorAll("li")];
    const hits = [];
    if (overlap(box, boxOf(header))) hits.push("header");
    if (overlap(box, boxOf(volume))) hits.push("volume");
    if (overlap(box, boxOf(timer))) hits.push("timer");
    if (answers.some((node) => overlap(box, node.getBoundingClientRect()))) hits.push("answers");
    if (sideRail && getComputedStyle(sideRail).visibility !== "hidden" && overlap(box, boxOf(sideRail))) {
      hits.push("streak-rail");
    }
    return {
      rows: rows.length,
      inView:
        box.top >= -1 &&
        box.bottom <= window.innerHeight + 1 &&
        box.left >= -1 &&
        box.right <= window.innerWidth + 1,
      belowHeader: header ? box.top + 1 >= header.getBoundingClientRect().bottom : false,
      rankScrolls: ranking.scrollHeight > ranking.clientHeight + 1,
      chatUnder: chat.getBoundingClientRect().top + 1 >= rankBox.bottom,
      rowOverflow: rows.some((row) => row.scrollWidth > ranking.clientWidth + 2),
      pageOverflowX: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
      hits,
    };
  })()`);
    if (!play) throw new Error(`Play dock is missing after Start @ ${viewport.name}.`);
    if (play.rows !== PRIVATE_ROOM_PLAYER_MAX) {
      throw new Error(`Ranking has ${play.rows} rows @ ${viewport.name}.`);
    }
    if (!play.inView) throw new Error(`Play dock is cut off @ ${viewport.name}.`);
    if (!play.belowHeader) throw new Error(`Play dock covers the header @ ${viewport.name}.`);
    if (play.hits.length) throw new Error(`Play dock overlaps ${play.hits.join(", ")} @ ${viewport.name}.`);
    if (!play.rankScrolls) throw new Error(`Ranking does not scroll @ ${viewport.name}.`);
    if (!play.chatUnder) throw new Error(`Chat is not under the ranking @ ${viewport.name}.`);
    if (play.rowOverflow) throw new Error(`A ranking row is cut off @ ${viewport.name}.`);
    if (play.pageOverflowX) throw new Error(`Play overflows sideways @ ${viewport.name}.`);
  }

  for (const viewport of VIEWPORTS) await measurePlay(viewport);

  console.log(
    `Validated party UI at 1, 20, 50, and ${PRIVATE_ROOM_PLAYER_MAX} players on ${VIEWPORTS.map((item) => item.name).join(", ")}. The 101st join is blocked.`,
  );
} finally {
  await cleanup();
}

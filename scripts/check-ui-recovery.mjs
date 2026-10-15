#!/usr/bin/env node

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { soundBrowser, click, delay } from "./lib/feedback-browser.mjs";
import { publicQuestionForRound } from "../src/lib/public-question.mjs";

const appUrl = (process.env.APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
const generated = JSON.parse(await readFile(new URL("../src/data/questions.generated.json", import.meta.url)));
const raw = generated.find((question) => question.kind === "mana-cost");
const now = Date.now();
const fixture = publicQuestionForRound(
  raw,
  {
    id: "recovery-round",
    game: "trivia",
    phase: "answering",
    answerDeadline: now + 15_000,
    answerDuration: 15_000,
  },
  now,
);
const browser = await soundBrowser();
const failures = [];
async function check(name, run) {
  try {
    await run();
    console.log(`PASS ${name}`);
  } catch (error) {
    failures.push(`${name}: ${error.message}`);
    console.error(`FAIL ${name}: ${error.message}`);
  }
}
async function fill(page, selector, value) {
  await page.evaluate(`(() => {
    const input = document.querySelector(${JSON.stringify(selector)});
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(input, ${JSON.stringify(value)});
    input.dispatchEvent(new Event("input", { bubbles: true }));
  })()`);
}
async function setup(path = "/play?room=RECOVERY") {
  const { page } = await browser.newPage();
  await page.send("Page.addScriptToEvaluateOnNewDocument", {
    source: `(() => {
    const question = ${JSON.stringify(fixture)};
    const state = window.__recovery = {
      waiting: true, calls: [], pending: null,
      messages: Array.from({ length: 40 }, (_, index) => ({ id: "m" + index, name: "Alice", text: "Message " + index, at: Date.now() }))
    };
    const response = (payload, status = 200) => new Response(JSON.stringify(payload), { status, headers: { "Content-Type": "application/json" } });
    const payload = () => ({ waiting: state.waiting, countdownMs: 0, nameTaken: false,
      privateRoom: { code: "RECOVERY", games: ["trivia"], formats: [], startedAt: state.waiting ? null : Date.now() - 1000, isHost: true,
        players: [{ name: "Tester", host: true, self: true, score: 0, away: false }], messages: state.messages }, presence: { activePlayers: 1 } });
    const originalFetch = window.fetch.bind(window);
    window.fetch = async (input, init = {}) => {
      const url = new URL(typeof input === "string" ? input : input.url, location.href);
      const body = init.body ? JSON.parse(init.body) : {};
      state.calls.push({ path: url.pathname, method: init.method || "GET", action: body.action });
      if (url.pathname === "/api/private-rooms/messages") {
        const snapshot = payload();
        return new Promise(resolve => { state.pending = (fail) => resolve(fail ? response({ error: "Chat delivery failed. Try again." }, 503) : response(snapshot)); });
      }
      if (url.pathname === "/api/private-rooms/start") { state.waiting = false; return response(payload()); }
      if (url.pathname === "/api/private-rooms") {
        const code = body.code || url.searchParams.get("code");
        return code === "EXPIRED" ? response({ error: "Unknown private room." }, 404) : response(payload());
      }
      if (url.pathname === "/api/rounds") {
        const now = Date.now();
        return response({ serverNow: now, room: { id: "recovery-room", gameId: "dota2", contentVersion: "recovery", mode: "mixed", filter: "Mixed" },
          round: { id: "recovery-round", number: 1, game: "trivia", phase: "answering", startedAt: now, answerDeadline: now + 15_000, revealDeadline: now + 22_000, answerDuration: 15_000 },
          questionRevision: "recovery-answering", question, presence: { activePlayers: 1 }, crowd: { counts: [0,0,0,0], total: 0, keyCounts: [], scoreSummary: null }, playerVote: null, playerReport: null, previousResults: [] });
      }
      if (url.pathname === "/api/me") return response({ authenticated: false });
      if (url.pathname.startsWith("/api/")) return response({ ok: true });
      return originalFetch(input, init);
    };
  })();`,
  });
  await page.send("Page.navigate", { url: appUrl + path });
  await page.waitFor(`document.querySelector('main')?.dataset.clientReady === "true"`);
  return page;
}
try {
  await check("expired invitation keeps its recovery form open", async () => {
    const page = await setup("/play?room=EXPIRED");
    await page.waitFor(`!!document.querySelector('[data-testid="private-room-choose-join"]')`);
    await click(page, '[data-testid="private-room-choose-join"]');
    await delay(1300);
    assert.equal(
      await page.evaluate(`document.querySelector('[data-testid="private-room-setup"]')?.dataset.path`),
      "join",
    );
  });
  const page = await setup();
  await page.waitFor(`!!document.querySelector('[data-testid="private-room-start"]')`);
  await check("short party lobby keeps chat and its error slot inside the panel", async () => {
    await page.send("Emulation.setDeviceMetricsOverride", {
      width: 1280,
      height: 640,
      deviceScaleFactor: 1,
      mobile: false,
    });
    const layout = await page.evaluate(`(() => {
      const lobby = document.querySelector('[data-testid="private-room-wait"] > div').getBoundingClientRect();
      const toggle = document.querySelector('[data-testid="private-room-chat-toggle"]').getBoundingClientRect();
      const chat = document.querySelector('[data-testid="private-room-chat"]').getBoundingClientRect();
      const error = document.querySelector('[data-testid="private-room-chat-error"]').getBoundingClientRect();
      return { limit: Math.min(lobby.bottom, innerHeight), toggleBottom: toggle.bottom, errorBottom: error.bottom, chatBottom: chat.bottom };
    })()`);
    assert.ok(layout.toggleBottom <= layout.limit + 1, `Chat toggle clips at ${JSON.stringify(layout)}`);
    assert.ok(layout.errorBottom <= layout.chatBottom, "Chat delivery errors must fit inside the panel");
    await page.send("Emulation.setDeviceMetricsOverride", {
      width: 1400,
      height: 1000,
      deviceScaleFactor: 1,
      mobile: false,
    });
  });
  await check("new capped chat messages stay visible at the bottom", async () => {
    assert.equal(
      await page.evaluate(`document.querySelector('[data-testid="private-room-chat"] > div').getAttribute("role")`),
      "log",
    );
    await page.evaluate(
      `window.__recovery.messages = [...window.__recovery.messages.slice(1), { id: "m40", name: "Alice", text: "A long message that wraps onto more than one line and stays visible in the log.", at: Date.now() }]`,
    );
    await delay(1300);
    const gap = await page.evaluate(
      `(() => { const node = document.querySelector('[data-testid="private-room-chat"] > div'); return node.scrollHeight - node.clientHeight - node.scrollTop; })()`,
    );
    assert.ok(gap <= 2, `Newest message is ${gap}px below the visible log`);
  });
  await check("reading older messages does not jump to the bottom", async () => {
    await page.evaluate(`document.querySelector('[data-testid="private-room-chat"] > div').scrollTop = 0`);
    await delay(50);
    await page.evaluate(
      `window.__recovery.messages = [...window.__recovery.messages.slice(1), { id: "m41", name: "Alice", text: "One more message", at: Date.now() }]`,
    );
    await delay(1300);
    assert.ok(await page.evaluate(`document.querySelector('[data-testid="private-room-chat"] > div').scrollTop < 50`));
  });
  await check("failed chat preserves a newer draft and shows an error", async () => {
    await fill(page, '[data-testid="private-room-chat-input"]', "first message");
    await click(page, '[data-testid="private-room-chat-send"]');
    await page.waitFor(`!!window.__recovery.pending`);
    await fill(page, '[data-testid="private-room-chat-input"]', "new draft typed during request");
    await page.evaluate(`window.__recovery.pending(true)`);
    await delay(100);
    assert.equal(
      await page.evaluate(`document.querySelector('[data-testid="private-room-chat-input"]').value`),
      "new draft typed during request",
    );
    assert.ok(
      await page.evaluate(
        `document.querySelector('[data-testid="private-room-chat-error"]')?.textContent.includes("Chat delivery failed")`,
      ),
    );
  });
  await check("a delayed lobby chat reply cannot reset active play", async () => {
    await fill(page, '[data-testid="private-room-chat-input"]', "delayed reply");
    await click(page, '[data-testid="private-room-chat-send"]');
    await click(page, '[data-testid="private-room-start"]');
    await page.waitFor(`document.querySelector('main')?.dataset.phase === "answering"`);
    await page.evaluate(`window.__recovery.pending(false)`);
    await delay(100);
    assert.equal(await page.evaluate(`document.querySelector('main')?.dataset.phase`), "answering");
  });
  await check("active-play chat failures are visible and do not move the dock", async () => {
    await page.waitFor(`!!document.querySelector('[data-testid="private-room-play-dock"]')`);
    const before = await page.evaluate(
      `document.querySelector('[data-testid="private-room-play-dock"]').getBoundingClientRect().height`,
    );
    await fill(page, '[data-testid="private-room-chat-input"]', "retry this message");
    await click(page, '[data-testid="private-room-chat-send"]');
    await page.evaluate(`window.__recovery.pending(true)`);
    await delay(100);
    assert.ok(
      await page.evaluate(
        `document.querySelector('[data-testid="private-room-chat-error"]')?.textContent.includes("Chat delivery failed")`,
      ),
    );
    assert.equal(
      await page.evaluate(
        `document.querySelector('[data-testid="private-room-play-dock"]').getBoundingClientRect().height`,
      ),
      before,
    );
    assert.equal(
      await page.evaluate(`document.querySelector('[data-testid="private-room-chat-input"]').value`),
      "retry this message",
    );
  });
  await check("party membership uses explicit POST actions", async () => {
    await delay(1100);
    const calls = await page.evaluate(`window.__recovery.calls.filter(call => call.path === "/api/private-rooms")`);
    assert.ok(calls.some((call) => call.action === "join" && call.method === "POST"));
    assert.ok(calls.some((call) => call.action === "touch" && call.method === "POST"));
  });
  await check("calibration can reach records beyond the first 80", async () => {
    await page.send("Page.navigate", { url: appUrl + "/calibration" });
    await page.waitFor(`document.querySelectorAll('[data-testid="calibration-row"]').length > 0`);
    await page.waitFor(
      `Object.keys(document.querySelector('[data-testid="calibration-next-page"]') ?? {}).some(key => key.startsWith("__reactProps"))`,
    );
    const first = await page.evaluate(`document.querySelector('[data-testid="calibration-row"]').textContent`);
    await click(page, '[data-testid="calibration-next-page"]');
    await page.waitFor(
      `document.querySelector('[data-testid="calibration-row"]').textContent !== ${JSON.stringify(first)}`,
    );
    assert.notEqual(
      await page.evaluate(`document.querySelector('[data-testid="calibration-row"]').textContent`),
      first,
    );
    await click(page, '[data-testid="calibration-previous-page"]');
    await page.waitFor(
      `document.querySelector('[data-testid="calibration-row"]').textContent === ${JSON.stringify(first)}`,
    );
    assert.equal(await page.evaluate(`document.querySelector('[data-testid="calibration-row"]').textContent`), first);
  });
  await check("calibration search and filters reset pagination", async () => {
    await click(page, '[data-testid="calibration-next-page"]');
    await page.waitFor(`!document.querySelector('[data-testid="calibration-previous-page"]').disabled`);
    await fill(page, 'input[aria-label="Search calibration questions"]', "no-matching-recovery-question");
    await page.waitFor(`document.querySelectorAll('[data-testid="calibration-row"]').length === 0`);
    assert.equal(
      await page.evaluate(`document.querySelector('[data-testid="calibration-previous-page"]').disabled`),
      true,
    );
    assert.equal(await page.evaluate(`document.querySelector('[data-testid="calibration-next-page"]').disabled`), true);
    await fill(page, 'input[aria-label="Search calibration questions"]', "");
    await page.waitFor(`document.querySelectorAll('[data-testid="calibration-row"]').length === 80`);
    await click(page, '[data-testid="calibration-next-page"]');
    await page.waitFor(`!document.querySelector('[data-testid="calibration-previous-page"]').disabled`);
    await click(page, '[aria-label="Calibration filter"] button', 1);
    await page.waitFor(`document.querySelector('[data-testid="calibration-previous-page"]').disabled`);
  });
  assert.deepEqual(failures, [], failures.join("\n"));
  console.log(
    "Validated party recovery, chat delivery and scrolling, stale replies, POST membership, and calibration pages.",
  );
} finally {
  await browser.close();
}

#!/usr/bin/env node

/**
 * Queue Daily: the lobby leads with the daily, a player opens clues, answers all six
 * rounds, gets one result per round, and ends with a spoiler-free share text and a
 * day streak that survive a reload. The server counts the finish without linking visits.
 */

import { spawn } from "node:child_process";
import { mkdtemp, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { CHROME_BINARY } from "./lib/chrome-binary.mjs";
import { stopChrome } from "./lib/stop-chrome.mjs";

const appUrl = (process.env.APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const SLOTS = ["fogged-vision", "soundcheck", "echo-hunt", "quote-hunt", "flashback", "estimate"];

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
const userDataDir = await mkdtemp(join(tmpdir(), "queue-arcade-daily-"));
const chrome = spawn(
  CHROME_BINARY,
  [
    "--headless=new",
    "--mute-audio",
    "--autoplay-policy=no-user-gesture-required",
    `--remote-debugging-port=${port}`,
    "--remote-allow-origins=*",
    `--user-data-dir=${userDataDir}`,
    "--no-first-run",
    "--disable-gpu",
    "--window-size=1400,1100",
    "about:blank",
  ],
  { stdio: "ignore" },
);

let page = null;

async function shot(name) {
  if (!process.env.SHOT_DIR || !page) return;
  const { data } = await page.send("Page.captureScreenshot", { format: "png" });
  await writeFile(join(process.env.SHOT_DIR, name), Buffer.from(data, "base64"));
}

async function open(path) {
  await page.send("Page.navigate", { url: `${appUrl}${path}` });
  await page.waitFor(`document.readyState === "complete"`);
}

const click = (selector) =>
  page.evaluate(`(() => {
    const element = document.querySelector(${JSON.stringify(selector)});
    if (!element) throw new Error("Missing " + ${JSON.stringify(selector)});
    element.click();
    return true;
  })()`);

const state = () =>
  page.evaluate(`(() => {
    const daily = document.querySelector('[data-testid="daily"]');
    return {
      state: daily?.dataset.state ?? null,
      slot: Number(daily?.dataset.slot ?? -1),
      game: document.querySelector('[data-testid="daily-round"]')?.dataset.game ?? null,
      worth: document.querySelector('[data-testid="daily-worth"]')?.textContent ?? "",
      overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
    };
  })()`);

async function answerCurrent(game) {
  if (game === "estimate") {
    await page.evaluate(`(() => {
      const input = document.querySelector('[data-testid="daily-estimate-range"]');
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set;
      setter.call(input, input.max);
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.dispatchEvent(new Event("change", { bubbles: true }));
      return true;
    })()`);
    await click('[data-testid="daily-estimate-lock"]');
    return;
  }
  const mode = await page.evaluate(`(() => {
    if (document.querySelector('[data-testid="hero-picker-hero"]')) return "hero";
    if (document.querySelector('[data-testid="shopkeeper-store-item"]')) return "item";
    if (document.querySelector('[data-testid="flashback-year-lock"]')) return "year";
    if (document.querySelector('[data-testid="flashback-order-card"]')) return "order";
    if (document.querySelector('[data-testid="daily-choice"]')) return "choice";
    return "none";
  })()`);
  if (mode === "hero") await click('[data-testid="hero-picker-hero"]');
  else if (mode === "item") await click('[data-testid="shopkeeper-store-item"]');
  else if (mode === "year") await click('[data-testid="flashback-year-lock"]');
  else if (mode === "choice") await click('[data-testid="daily-choice"]');
  else if (mode === "order") {
    for (let index = 0; index < 4; index += 1) {
      await page.evaluate(
        `document.querySelectorAll('[data-testid="flashback-order-card"]:not([disabled])')[0]?.click()`,
      );
      await delay(120);
    }
  } else throw new Error(`Round ${game} showed no answer control.`);
}

try {
  const targets = await waitJson(`http://127.0.0.1:${port}/json/list`);
  const target = targets.find((entry) => entry.type === "page");
  page = attachCdp(target.webSocketDebuggerUrl);
  await page.ready;
  await page.send("Page.enable");
  await page.send("Runtime.enable");

  // The lobby leads with the daily.
  await open("/");
  await page.waitFor(`Boolean(document.querySelector('[data-testid="daily-start"]'))`);
  const lobby = await page.evaluate(`(() => {
    const daily = document.querySelector('[data-testid="daily-start"]');
    const live = document.querySelector('[data-testid="start-arcade"]');
    return {
      href: daily.getAttribute("href"),
      text: daily.textContent,
      first: Boolean(live) && Boolean(daily.compareDocumentPosition(live) & Node.DOCUMENT_POSITION_FOLLOWING),
    };
  })()`);
  if (lobby.href !== "/daily" || !/daily/i.test(lobby.text) || !lobby.first) {
    throw new Error(`The lobby does not lead with the daily: ${JSON.stringify(lobby)}`);
  }

  await click('[data-testid="daily-start"]');
  await page.waitFor(`document.querySelector('[data-testid="daily"]')?.dataset.state === "answering"`);
  await page.waitFor(`Boolean(document.querySelector('[data-testid="daily-round"]'))`);
  const intro = await page.evaluate(`Boolean(document.querySelector('[data-testid="daily-intro"]'))`);
  if (!intro) throw new Error("The first round does not explain the daily.");
  await shot("daily-round-1.png");

  // Round 1: a clue costs a point, and the fog image follows the opened stage.
  const before = await page.evaluate(
    `document.querySelector('[data-testid="daily-fog-image"]')?.getAttribute("src") ?? ""`,
  );
  if (!before.includes("stage=1") || !(await state()).worth.includes("3")) {
    throw new Error(`Round 1 did not start at the first clue for 3 points: ${before}`);
  }
  const imageStatus = await page.evaluate(`fetch(${JSON.stringify(before)}).then((response) => response.status)`);
  if (imageStatus !== 200) throw new Error(`The daily fog image answered ${imageStatus}.`);
  await click('[data-testid="daily-open-clue"]');
  await page.waitFor(
    `(document.querySelector('[data-testid="daily-fog-image"]')?.getAttribute("src") ?? "").includes("stage=2")`,
  );
  if (!(await state()).worth.includes("2")) throw new Error("Opening a clue did not lower the round to 2 points.");

  const verdicts = [];
  for (let slot = 0; slot < SLOTS.length; slot += 1) {
    await page.waitFor(
      `document.querySelector('[data-testid="daily"]')?.dataset.slot === "${slot}" && Boolean(document.querySelector('[data-testid="daily-round"]'))`,
    );
    const current = await state();
    if (current.game !== SLOTS[slot]) throw new Error(`Round ${slot + 1} is ${current.game}, not ${SLOTS[slot]}.`);
    if (current.overflow) throw new Error(`Round ${slot + 1} overflows the page width.`);
    if (SLOTS[slot] === "quote-hunt") {
      await click('[data-testid="daily-open-clue"]');
      await page.waitFor(`document.querySelectorAll('[data-testid="daily-hints"] li').length === 1`);
      await click('[data-testid="daily-open-clue"]');
      await page.waitFor(`document.querySelectorAll('[data-testid="daily-hints"] li').length === 2`);
      if (await page.evaluate(`Boolean(document.querySelector('[data-testid="daily-open-clue"]'))`)) {
        throw new Error("Quote Hunt offered a fourth clue.");
      }
    }
    if (SLOTS[slot] === "soundcheck" || SLOTS[slot] === "echo-hunt") {
      const audio = await page.evaluate(`(async () => {
        const button = document.querySelector('[data-testid="daily-play-sound"]');
        return { button: Boolean(button) };
      })()`);
      if (!audio.button) throw new Error(`${SLOTS[slot]} has no play button.`);
      await click('[data-testid="daily-play-sound"]');
    }
    await answerCurrent(SLOTS[slot]);
    await page.waitFor(`document.querySelector('[data-testid="daily"]')?.dataset.state === "reveal"`);
    const verdict = await page.evaluate(
      `Number(document.querySelector('[data-testid="daily-verdict"]')?.dataset.points ?? -1)`,
    );
    const allowed = slot === 0 ? [0, 2] : slot === 3 ? [0, 1] : [0, 1, 2, 3];
    if (!allowed.includes(verdict)) throw new Error(`Round ${slot + 1} scored ${verdict}, outside ${allowed}.`);
    if (SLOTS[slot] === "estimate") {
      const answer = await page.evaluate(
        `document.querySelector('[data-testid="daily-estimate-answer"]')?.textContent ?? ""`,
      );
      if (!/\d/.test(answer)) throw new Error(`The estimate reveal shows no answer: ${answer}`);
    }
    verdicts.push(verdict);
    if (slot === 0) await shot("daily-reveal-1.png");
    await click('[data-testid="daily-next-round"]');
  }

  await page.waitFor(`document.querySelector('[data-testid="daily"]')?.dataset.state === "finished"`);
  await page.waitFor(
    `/\\d/.test(document.querySelector('[data-testid="daily-crowd"]')?.textContent ?? "") || /nobody|никто/i.test(document.querySelector('[data-testid="daily-crowd"]')?.textContent ?? "")`,
  );
  await shot("daily-finished.png");
  const finished = await page.evaluate(`(() => ({
    share: document.querySelector('[data-testid="daily-share-text"]')?.textContent ?? "",
    streak: document.querySelector('[data-testid="daily-streak"]')?.textContent ?? "",
    marks: [...document.querySelectorAll('[data-testid="daily-result-grid"] li')].map((item) => Number(item.dataset.points)),
    overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
  }))()`);
  const total = verdicts.reduce((sum, value) => sum + value, 0);
  const marks = verdicts.map((value) => ["⬛", "🟧", "🟨", "🟩"][value]).join("");
  const shareMatch = new RegExp(`^Queue Daily #(\\d+) ${total}/18\\n${marks}\\nhttps?://\\S+/daily$`);
  if (!shareMatch.test(finished.share)) throw new Error(`Share text is wrong: ${JSON.stringify(finished.share)}`);
  if (JSON.stringify(finished.marks) !== JSON.stringify(verdicts)) throw new Error("The result grid lost a round.");
  if (!/^1\b/.test(finished.streak)) throw new Error(`A first daily should start a 1-day streak: ${finished.streak}`);
  if (finished.overflow) throw new Error("The end screen overflows the page width.");
  const day = Number(shareMatch.exec(finished.share)[1]);

  // The server counted one finish, as counts only.
  const summary = await fetch(`${appUrl}/api/daily/summary?day=${day}&total=${total}`).then((response) =>
    response.json(),
  );
  if (!(summary.summary?.players >= 1)) throw new Error(`The finish was not counted: ${JSON.stringify(summary)}`);

  // A reload keeps the result, and the lobby shows today's score.
  await open("/daily");
  await page.waitFor(`document.querySelector('[data-testid="daily"]')?.dataset.state === "finished"`);
  const reloaded = await page.evaluate(`document.querySelector('[data-testid="daily-share-text"]')?.textContent ?? ""`);
  if (reloaded !== finished.share) throw new Error("The finished daily changed after a reload.");
  await open("/");
  await page.waitFor(`/${total}/.test(document.querySelector('[data-testid="daily-start"]')?.textContent ?? "")`);

  // The end screen fits a phone.
  await page.send("Emulation.setDeviceMetricsOverride", {
    width: 360,
    height: 780,
    deviceScaleFactor: 2,
    mobile: true,
  });
  await open("/daily");
  await page.waitFor(`document.querySelector('[data-testid="daily"]')?.dataset.state === "finished"`);
  await shot("daily-finished-phone.png");
  if (await page.evaluate(`document.documentElement.scrollWidth > document.documentElement.clientWidth`)) {
    throw new Error("The daily end screen overflows a 360 px phone.");
  }

  console.log(
    `Validated Queue Daily #${day}: six rounds, clue costs, reveals, share text, streak, reload and phone width.`,
  );
} catch (error) {
  await shot("daily-failure.png").catch(() => undefined);
  throw error;
} finally {
  try {
    page?.socket.close();
  } catch {
    // gone
  }
  await stopChrome(chrome, userDataDir);
}

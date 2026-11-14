#!/usr/bin/env node

/**
 * Play layouts at 420px and 1400px. Fails when prompt text is cut, boards
 * overlap, the page overflows sideways, or a phone prompt is mostly empty.
 */

import { spawn } from "node:child_process";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { flashbackYearAnswerKey } from "../src/lib/flashback.mjs";
import { publicQuestionForRound } from "../src/lib/public-question.mjs";
import { valueOrderAnswerKey } from "../src/lib/value-order.mjs";
import { stopChrome } from "./lib/stop-chrome.mjs";

const appUrl = (process.env.APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const dataFile = (name) => path.join(process.cwd(), "src", "data", name);

const VIEWPORTS = [
  { name: "phone", width: 420, height: 800 },
  { name: "desktop", width: 1400, height: 900 },
  // Players are on PCs, and many windows are not maximized.
  { name: "laptop", width: 1366, height: 768 },
  { name: "small-laptop", width: 1280, height: 720 },
  { name: "half-window", width: 1000, height: 800 },
];

function pick(list, predicate, label) {
  const found = Array.isArray(list) ? list.find(predicate) : null;
  if (!found) throw new Error(`Missing layout fixture: ${label}`);
  return found;
}

function publicize(raw, game, extras = {}) {
  const now = Date.now();
  const question = publicQuestionForRound(
    raw,
    {
      id: "layout-placeholder",
      phase: "answering",
      game,
      answerDeadline: now + 9_000,
      answerDuration: 15_000,
    },
    now,
  );
  return { ...question, reveal: null, ...extras };
}

const [generated, shopkeeper, aghanim, soundcheck, valueOrder, flashback] = await Promise.all(
  [
    "questions.generated.json",
    "shopkeeper-questions.json",
    "aghanim-questions.json",
    "soundcheck-questions.json",
    "value-order-questions.json",
    "flashback-questions.json",
  ].map(async (file) => JSON.parse(await readFile(dataFile(file), "utf8"))),
);

const fixtures = {
  "classic-ability": {
    game: "trivia",
    waitFor: '[data-testid="answer-grid"]',
    question: publicize(
      pick(generated, (q) => q.kind === "mana-cost", "mana-cost"),
      "trivia",
    ),
  },
  "classic-hero": {
    game: "trivia",
    waitFor: '[data-testid="answer-grid"]',
    question: publicize(
      pick(generated, (q) => q.kind === "hero-move-speed", "hero-move-speed"),
      "trivia",
    ),
  },
  "classic-item": {
    game: "trivia",
    waitFor: '[data-testid="answer-grid"]',
    question: publicize(
      pick(generated, (q) => q.kind === "item-cost", "item-cost"),
      "trivia",
    ),
  },
  "shop-recipe": {
    game: "shopkeeper",
    waitFor: '[data-testid="shopkeeper-store"]',
    question: publicize(
      pick(shopkeeper, (q) => q.id === "shopkeeper-recipe:bloodstone", "bloodstone"),
      "shopkeeper",
    ),
  },
  "shop-build": {
    game: "shopkeeper",
    waitFor: '[data-testid="shopkeeper-store"]',
    question: publicize(
      pick(shopkeeper, (q) => q.kind === "shopkeeper-build-result", "shopkeeper-build-result"),
      "shopkeeper",
    ),
  },
  "shop-path": {
    game: "shopkeeper",
    waitFor: '[data-testid="shopkeeper-store"]',
    question: publicize(
      pick(shopkeeper, (q) => q.kind === "shopkeeper-upgrade-path", "shopkeeper-upgrade-path"),
      "shopkeeper",
    ),
  },
  "spell-link": {
    game: "spell-link",
    waitFor: '[data-testid="spell-clue-list"]',
    question: publicize(
      pick(generated, (q) => q.id === "ability-owner:mirana_arrow", "Sacred Arrow"),
      "spell-link",
      { clueStage: 2, eyebrow: "Sacred Arrow" },
    ),
  },
  "fogged-vision": {
    game: "fogged-vision",
    waitFor: '[data-testid="hero-picker"]',
    question: publicize(
      pick(generated, (q) => q.kind === "fogged-hero", "fogged-hero"),
      "fogged-vision",
    ),
  },
  "echo-hunt": {
    game: "echo-hunt",
    waitFor: '[data-testid="hero-picker"]',
    question: publicize(
      pick(generated, (q) => q.kind === "hero-voice", "hero-voice"),
      "echo-hunt",
    ),
  },
  "quote-hunt": {
    game: "quote-hunt",
    waitFor: '[data-testid="hero-quote"]',
    question: publicize(
      pick(generated, (q) => q.kind === "hero-quote", "hero-quote"),
      "quote-hunt",
    ),
  },
  aghanim: {
    game: "aghanim-lab",
    waitFor: '[data-testid="aghanim-clue-1"]',
    question: publicize(
      pick(aghanim, (q) => q.kind === "aghanim-upgrade", "aghanim-upgrade"),
      "aghanim-lab",
    ),
  },
  soundcheck: {
    game: "soundcheck",
    waitFor: '[data-testid="soundcheck-player"]',
    question: publicize(
      pick(soundcheck, (q) => q.kind === "soundcheck-ability", "soundcheck-ability"),
      "soundcheck",
    ),
  },
  "value-order": {
    game: "order-up",
    waitFor: '[data-testid="value-order-board"]',
    question: publicize(
      pick(valueOrder, (q) => q.kind === "value-order-item", "value-order-item"),
      "order-up",
    ),
  },
  "flashback-year": {
    game: "flashback",
    waitFor: '[data-testid="flashback-year-board"]',
    question: publicize(
      pick(flashback, (q) => q.kind === "flashback-year", "flashback-year"),
      "flashback",
    ),
  },
  "flashback-choice": {
    game: "flashback",
    waitFor: '[data-testid="answer-grid"]',
    question: publicize(
      pick(flashback, (q) => q.kind === "flashback-choice", "flashback-choice"),
      "flashback",
    ),
  },
  "shop-bet": {
    id: "layout:round:900002",
    game: "quote-hunt",
    waitFor: '[data-testid="hero-picker"]',
    question: publicize(
      pick(generated, (q) => q.kind === "hero-quote", "hero-quote"),
      "quote-hunt",
    ),
  },
  "flashback-order": {
    game: "flashback",
    waitFor: '[data-testid="flashback-order-board"]',
    question: publicize(
      pick(flashback, (q) => q.kind === "flashback-order", "flashback-order"),
      "flashback",
    ),
  },
};

function revealQuestion(raw, game) {
  const now = Date.now();
  return publicQuestionForRound(
    raw,
    { id: "layout-placeholder", phase: "reveal", game, answerDeadline: now - 1_000, answerDuration: 15_000 },
    now,
  );
}

function orderReveal(raw, correctOrder, game) {
  const [a, b, c, d] = correctOrder;
  return {
    game,
    question: revealQuestion(raw, game),
    keyCounts: [
      { answerKey: valueOrderAnswerKey([d, c, b, a]), count: 3 },
      { answerKey: valueOrderAnswerKey(correctOrder), count: 2 },
      { answerKey: valueOrderAnswerKey([b, a, d, c]), count: 1 },
    ],
  };
}

const flashbackOrderRaw = pick(flashback, (q) => q.kind === "flashback-order", "flashback-order");
const flashbackYearRaw = pick(flashback, (q) => q.flashback?.family === "year", "flashback-year");
const valueOrderRaw = pick(valueOrder, (q) => q.valueOrder?.correctOrder?.length === 4, "value-order");
const flashbackYear = revealQuestion(flashbackYearRaw, "flashback").reveal.correctAnswerKey;

const classicRevealRaw = pick(generated, (q) => q.kind === "item-cost", "item-cost");
const quoteRevealRaw = pick(generated, (q) => q.kind === "hero-quote", "hero-quote");
const quoteReveal = revealQuestion(quoteRevealRaw, "quote-hunt");

const shopQuestion = (id) => ({ ...revealQuestion(quoteRevealRaw, "quote-hunt"), id });

const revealFixtures = {
  "shop-earn": {
    id: "layout:round:900001",
    game: "quote-hunt",
    question: shopQuestion("layout:round:900001"),
    vote: quoteReveal.reveal.correctAnswerKey,
    points: 500,
    keyCounts: [{ answerKey: quoteReveal.reveal.correctAnswerKey, count: 1 }],
  },
  "shop-miss": {
    id: "layout:round:900003",
    game: "quote-hunt",
    question: shopQuestion("layout:round:900003"),
    vote: "npc_dota_hero_axe",
    keyCounts: [{ answerKey: "npc_dota_hero_axe", count: 1 }],
  },
  classic: {
    game: "trivia",
    question: revealQuestion(classicRevealRaw, "trivia"),
    counts: [3, 2, 1, 0],
    keyCounts: [],
    rows: 4,
  },
  quote: {
    game: "quote-hunt",
    question: quoteReveal,
    keyCounts: [
      { answerKey: "npc_dota_hero_axe", count: 3 },
      { answerKey: quoteReveal.reveal.correctAnswerKey, count: 2 },
    ],
  },
  "flashback-order": orderReveal(flashbackOrderRaw, flashbackOrderRaw.flashback.correctOrder, "flashback"),
  "value-order": orderReveal(valueOrderRaw, valueOrderRaw.valueOrder.correctOrder, "order-up"),
  "flashback-year": {
    game: "flashback",
    question: revealQuestion(flashbackYearRaw, "flashback"),
    keyCounts: [
      { answerKey: flashbackYearAnswerKey(flashbackYearRaw.flashback.correctYear - 2), count: 3 },
      { answerKey: flashbackYear, count: 2 },
    ],
  },
};

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

const INSPECT_SOURCE = `(() => {
  function box(el) {
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { t: r.top, l: r.left, b: r.bottom, r: r.right, w: r.width, h: r.height };
  }
  function overlap(a, b) {
    return a.l < b.r - 2 && a.r > b.l + 2 && a.t < b.b - 2 && a.b > b.t + 2;
  }
  function clippedByHidden(el) {
    if (!el) return null;
    const r = el.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) return "zero-size";
    let p = el.parentElement;
    while (p && p !== document.documentElement) {
      const cs = getComputedStyle(p);
      if (/(hidden|clip)/.test(cs.overflowX) || /(hidden|clip)/.test(cs.overflowY)) {
        const pr = p.getBoundingClientRect();
        const xCut = /(hidden|clip)/.test(cs.overflowX) && (r.left < pr.left - 2 || r.right > pr.right + 2);
        const yCut = /(hidden|clip)/.test(cs.overflowY) && (r.top < pr.top - 2 || r.bottom > pr.bottom + 2);
        if (xCut || yCut) {
          const name = el.dataset?.testid || el.tagName;
          const parent = p.dataset?.testid || p.className?.toString?.().slice(0, 48) || p.tagName;
          return name + " clipped by " + parent;
        }
      }
      p = p.parentElement;
    }
    return null;
  }
  /** Clipped with no way to reach it. A box that scrolls can hold more than it shows. */
  function unreachable(el) {
    const r = el.getBoundingClientRect();
    let p = el.parentElement;
    while (p && p !== document.documentElement) {
      const cs = getComputedStyle(p);
      if (/(auto|scroll)/.test(cs.overflowX) && p.scrollWidth > p.clientWidth) return clippedByHidden(p);
      if (/(hidden|clip)/.test(cs.overflowX)) {
        const pr = p.getBoundingClientRect();
        if (r.left < pr.left - 2 || r.right > pr.right + 2) return clippedByHidden(el);
      }
      p = p.parentElement;
    }
    return r.right > window.innerWidth + 2 ? (el.dataset?.testid || el.tagName) + " off screen" : null;
  }
  function textCut(el) {
    if (!el) return false;
    if (el.scrollWidth > el.clientWidth + 3) return true;
    const range = document.createRange();
    range.selectNodeContents(el);
    const rects = [...range.getClientRects()].filter((r) => r.width > 1 && r.height > 1);
    const own = el.getBoundingClientRect();
    return rects.some((r) => r.right > own.right + 3 || r.left < own.left - 3 || r.right > window.innerWidth + 3);
  }
  window.__queueArcadeInspectLayout = function inspectLayout(phone) {
    const issues = [];
    // Every choice must be on screen, or inside a box that really scrolls.
    for (const choice of document.querySelectorAll(
      '[data-testid="shopkeeper-store-item"], [data-testid="hero-picker-hero"], [data-testid="arcade-answer"], [data-testid="value-order-card"], [data-testid="flashback-order-card"]',
    )) {
      const cut = unreachable(choice);
      if (cut) {
        issues.push(cut);
        break;
      }
    }
    const rail = document.querySelector('[data-testid="score-grid"]')?.getBoundingClientRect();
    if (rail && rail.right > window.innerWidth + 2) issues.push("side rail runs off screen");
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    if (document.documentElement.scrollWidth > vw + 2) {
      issues.push("page overflow-x " + document.documentElement.scrollWidth + " > " + vw);
    }
    const prompt = document.querySelector('[data-testid="round-prompt"]');
    const h2 = prompt?.querySelector("h2");
    if (h2) {
      if (textCut(h2)) issues.push("h2 text cut: " + JSON.stringify(h2.textContent));
      const clip = clippedByHidden(h2);
      if (clip) issues.push(clip);
      const hb = h2.getBoundingClientRect();
      if (hb.right > vw + 2) issues.push("h2 paints past viewport");
    }
    function emptySpace(el, slack) {
      if (!el) return null;
      const r = el.getBoundingClientRect();
      const kids = [...el.children];
      if (!kids.length) return r.height > slack ? r.height : null;
      const content = kids.reduce((sum, child) => sum + child.getBoundingClientRect().height, 0);
      const cs = getComputedStyle(el);
      const pad = (parseFloat(cs.paddingTop) || 0) + (parseFloat(cs.paddingBottom) || 0);
      const gap = parseFloat(cs.rowGap || cs.gap) || 0;
      const expected = content + pad + gap * Math.max(0, kids.length - 1);
      return r.height > expected + slack && r.height > 180 ? Math.round(r.height) + "/" + Math.round(expected) : null;
    }
    if (phone && prompt) {
      const wasted = emptySpace(prompt, 72);
      if (wasted) issues.push("prompt empty space " + wasted);
      const copy = h2?.parentElement;
      if (copy && copy !== prompt) {
        const copyWaste = emptySpace(copy, 64);
        if (copyWaste) issues.push("question copy empty space " + copyWaste);
        const basis = getComputedStyle(copy).flexBasis;
        if (basis.endsWith("px") && parseFloat(basis) > 280) {
          issues.push("question copy flex-basis " + basis + " on a phone");
        }
      }
    }
    const clueBoxes = [
      ...document.querySelectorAll('[data-testid="spell-clue-list"] > div'),
      document.querySelector('[data-testid="aghanim-clue-1"]'),
      document.querySelector('[data-testid="aghanim-clue-2"]'),
      document.querySelector('[data-testid="aghanim-clue-3"]'),
    ].filter(Boolean);
    const promptBox = box(prompt);
    for (const clue of clueBoxes) {
      const clip = clippedByHidden(clue);
      if (clip) issues.push(clip);
      const cb = box(clue);
      if (promptBox && cb && (cb.r > promptBox.r + 3 || cb.l < promptBox.l - 3)) {
        issues.push((clue.dataset.testid || "clue") + " hangs out of the prompt");
      }
      if (phone && textCut(clue.querySelector("span"))) {
        issues.push((clue.dataset.testid || "clue") + " text cut");
      }
    }
    const store = document.querySelector('[data-testid="shopkeeper-store"]');
    const picker = document.querySelector('[data-testid="hero-picker"]');
    const answers = document.querySelector('[data-testid="answer-grid"]');
    const yearBoard = document.querySelector('[data-testid="flashback-year-board"]');
    const orderBoard = document.querySelector('[data-testid="value-order-board"], [data-testid="flashback-order-board"]');
    const header = document.querySelector("header");
    const regions = [
      ["prompt", prompt],
      ["store", store],
      ["picker", picker],
      ["answers", answers],
      ["year", yearBoard],
      ["order", orderBoard],
    ].filter((entry) => entry[1]);
    for (let i = 0; i < regions.length; i += 1) {
      for (let j = i + 1; j < regions.length; j += 1) {
        const a = box(regions[i][1]);
        const b = box(regions[j][1]);
        if (a && b && overlap(a, b)) issues.push(regions[i][0] + " overlaps " + regions[j][0]);
      }
    }
    const headerBox = box(header);
    const promptOnly = box(prompt);
    if (headerBox && promptOnly && overlap(headerBox, promptOnly)) issues.push("header overlaps prompt");
    if (store) {
      const storeBox = box(store);
      if (!storeBox || storeBox.h < 80) issues.push("shop store height " + Math.round(storeBox?.h ?? 0));
      const clip = clippedByHidden(store);
      if (clip) issues.push(clip);
      const item = document.querySelector('[data-testid="shopkeeper-store-item"]');
      if (!item) issues.push("shop has no items");
      const search = document.querySelector('[data-testid="shopkeeper-search-field"]');
      if (!search) issues.push("shop search missing");
      const searchShell = search?.closest("label");
      if (phone && searchShell && searchShell.getBoundingClientRect().height > 48) {
        issues.push("shop search box height " + Math.round(searchShell.getBoundingClientRect().height));
      }
    }
    if (picker) {
      const pickerBox = box(picker);
      if (!pickerBox || pickerBox.h < 48) issues.push("hero picker height " + Math.round(pickerBox?.h ?? 0));
      const clip = clippedByHidden(picker);
      if (clip) issues.push(clip);
      const hero = document.querySelector('[data-testid="hero-picker-hero"]');
      if (!hero) issues.push("hero picker has no heroes");
      if (phone && hero) {
        const portrait = hero.getBoundingClientRect().width;
        if (portrait > 52) issues.push("hero portrait too wide on phone " + Math.round(portrait));
      }
    }
    const helper = document.querySelector('[data-testid="answer-helper"]');
    if (!helper) issues.push("answer helper missing");
    else {
      const helperText = (helper.textContent ?? "").replace(/\s+/g, " ").trim();
      if (textCut(helper)) issues.push("answer helper text cut: " + JSON.stringify(helperText.slice(0, 90)));
      const helperClip = clippedByHidden(helper);
      if (helperClip) issues.push(helperClip);
      if (phone) {
        const helperBox = box(helper);
        const scoreBox = box(document.querySelector('[data-testid="score-grid"]'));
        if (helperBox && scoreBox && overlap(helperBox, scoreBox)) issues.push("answer helper overlaps GOLD");
      }
    }
    if (answers) {
      const buttons = [...answers.querySelectorAll('[data-testid="arcade-answer"]')];
      if (buttons.length !== 4) issues.push("answer count " + buttons.length);
      for (const button of buttons) {
        const clip = clippedByHidden(button);
        if (clip) issues.push(clip);
        const label = [...button.querySelectorAll("span")].find((span) => {
          const text = span.textContent?.trim() ?? "";
          return text && !/^[A-D]$/.test(text);
        });
        if (label && textCut(label)) issues.push("answer text cut: " + JSON.stringify(label.textContent));
      }
    }
    if (yearBoard) {
      const clip = clippedByHidden(yearBoard);
      if (clip) issues.push(clip);
      if (!document.querySelector('[data-testid="flashback-year-slider"]')) issues.push("year slider missing");
    }
    if (orderBoard) {
      const clip = clippedByHidden(orderBoard);
      if (clip) issues.push(clip);
      if (phone) {
        for (const label of orderBoard.querySelectorAll("strong, small, em")) {
          if (label.textContent?.trim() && textCut(label)) {
            issues.push("order label cut: " + JSON.stringify(label.textContent));
          }
        }
      }
    }
    return {
      issues,
      inner: vw + "x" + vh,
      promptH: prompt ? Math.round(prompt.getBoundingClientRect().height) : 0,
      h2: h2?.textContent ?? "",
    };
  };
  window.__queueArcadeInspectHelperReachability = async function inspectHelperReachability() {
    const issues = [];
    const helper = document.querySelector('[data-testid="answer-helper"]');
    const prompt = document.querySelector('[data-testid="round-prompt"]');
    if (!helper || !prompt) return ["helper or prompt missing during scroll check"];
    const initialScroll = { left: scrollX, top: scrollY };
    const promptText = prompt.textContent;
    const nextFrame = () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    try {
      helper.scrollIntoView({ block: "center", inline: "nearest", behavior: "instant" });
      await nextFrame();
      const helperBox = box(helper);
      if (helperBox.t < 0 || helperBox.b > innerHeight + 2 || helperBox.l < 0 || helperBox.r > innerWidth + 2) {
        issues.push("answer helper is not fully reachable after scrolling");
      }
      const clip = clippedByHidden(helper);
      if (clip) issues.push(clip);
      const center = document.elementFromPoint(helperBox.l + helperBox.w / 2, helperBox.t + helperBox.h / 2);
      if (!helper.contains(center)) issues.push("answer helper is covered after scrolling");
      const timerBox = box(document.querySelector('[data-testid="round-timer"]'));
      if (!timerBox || timerBox.t < 0 || timerBox.b > innerHeight) issues.push("round timer is off screen at answer helper");
      if (prompt.textContent !== promptText) issues.push("prompt changed during scrolling");
    } finally {
      window.scrollTo({ ...initialScroll, behavior: "instant" });
      await nextFrame();
    }
    const heading = prompt.querySelector("h2");
    const restored = box(heading);
    if (!restored || restored.t < 0 || restored.b > innerHeight) issues.push("prompt is not visible after restoring scroll");
    if (heading && (textCut(heading) || clippedByHidden(heading))) issues.push("prompt is clipped after restoring scroll");
    return issues;
  };
  window.__queueArcadeInspectWait = function inspectWait() {
    const issues = [];
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const tip = document.querySelector('[data-testid="entry-wait-tip"]');
    const copy = tip?.querySelector("p");
    const stage = document.querySelector('[data-testid="entry-wait-stage"]');
    if (!tip || !copy) issues.push("wait tip missing");
    else {
      const text = (copy.textContent ?? "").replace(/\s+/g, " ").trim();
      if (textCut(copy)) issues.push("wait tip text cut: " + JSON.stringify(text));
      const clip = clippedByHidden(copy);
      if (clip) issues.push(clip);
      const cb = copy.getBoundingClientRect();
      if (cb.right > vw + 2 || cb.bottom > vh + 2) issues.push("wait tip paints off screen");
    }
    if (tip?.dataset.tip === "keys") {
      const prompt = document.querySelector('[data-testid="entry-wait-choice-prompt"] h2');
      if (prompt && textCut(prompt)) {
        issues.push("wait prompt cut: " + JSON.stringify(prompt.textContent));
      }
      const stageBox = box(stage);
      const answers = [...document.querySelectorAll('[data-testid="entry-wait-keys-demo"] [data-testid="practice-answer"]')];
      if (answers.length !== 4) issues.push("wait A-D demo has " + answers.length + " answers");
      for (const answer of answers) {
        const key = answer.querySelector("span");
        const ab = answer.getBoundingClientRect();
        if (ab.height < 8 || ab.width < 8) issues.push("wait A-D answer collapsed");
        if (stageBox && (ab.bottom > stageBox.b + 2 || ab.top < stageBox.t - 2)) {
          issues.push("wait A-D answer clipped: " + JSON.stringify((answer.textContent ?? "").trim().slice(0, 24)));
        }
        if (key && textCut(key)) issues.push("wait A-D key cut: " + JSON.stringify(key.textContent));
      }
    }
    if (tip?.dataset.tip === "shop") {
      const search = document.querySelector('[data-testid="entry-wait-shop-demo"] [data-testid="shopkeeper-search-field"]');
      if (!search) issues.push("wait shop search missing");
      else {
        const sb = search.getBoundingClientRect();
        const stageBox = box(stage);
        if (stageBox && (sb.bottom > stageBox.b + 2 || sb.top < stageBox.t - 2 || sb.height < 8)) {
          issues.push("wait shop search clipped");
        }
      }
    }
    return { issues, tip: tip?.dataset.tip ?? "", copy: (copy?.textContent ?? "").trim() };
  };
  window.__queueArcadeInspectPage = function inspectPage() {
    const issues = [];
    const vw = window.innerWidth;
    if (document.documentElement.scrollWidth > vw + 2) {
      issues.push("page overflow-x " + document.documentElement.scrollWidth + " > " + vw);
    }
    const heading = document.querySelector("h1");
    const headingBox = heading?.getBoundingClientRect();
    const hiddenHeading =
      !heading ||
      !headingBox ||
      headingBox.height < 8 ||
      headingBox.width < 8 ||
      /sr-only/.test(heading.className);
    if (!hiddenHeading) {
      if (heading.scrollWidth > heading.clientWidth + 3) issues.push("h1 text cut");
      const clip = clippedByHidden(heading);
      if (clip) issues.push(clip);
    }
    return { issues, inner: vw + "x" + window.innerHeight };
  };
})();`;

const port = await freePort();
const userDataDir = await mkdtemp(path.join(tmpdir(), "queue-arcade-layout-"));
const chrome = spawn(
  "google-chrome",
  [
    "--headless=new",
    ...(process.env.CHECK_LOCALE ? [`--accept-lang=${process.env.CHECK_LOCALE}`] : []),
    "--mute-audio",
    `--remote-debugging-port=${port}`,
    "--remote-allow-origins=*",
    `--user-data-dir=${userDataDir}`,
    "--no-first-run",
    "--disable-gpu",
    "--force-device-scale-factor=1",
    "--window-size=1400,900",
    "about:blank",
  ],
  { stdio: "ignore" },
);

let page = null;
let browser = null;
let created = null;

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
  created = await browser.send("Target.createTarget", { url: "about:blank" });
  const listed = await fetch(`http://127.0.0.1:${port}/json/list`).then((response) => response.json());
  const target = listed.find((entry) => entry.id === created.targetId);
  page = attachCdp(target.webSocketDebuggerUrl);
  await page.ready;
  await page.send("Page.enable");
  await page.send("Runtime.enable");
  await page.send("Page.addScriptToEvaluateOnNewDocument", {
    source: `(() => {
      const fixtures = ${JSON.stringify(fixtures)};
      const revealFixtures = ${JSON.stringify(revealFixtures)};
      const originalFetch = window.fetch.bind(window);
      window.__queueArcadeLayout = { kind: null, served: 0, wait: false };
      Object.defineProperty(HTMLMediaElement.prototype, "play", {
        configurable: true,
        value() { return Promise.resolve(); }
      });
      window.fetch = async (...args) => {
        const input = args[0];
        const init = args[1];
        const requestUrl = typeof input === "string" || input instanceof URL ? String(input) : input.url;
        const requestMethod = String(init?.method ?? input?.method ?? "GET").toUpperCase();
        const requestPath = requestUrl ? new URL(requestUrl, location.href).pathname : "";
        if (requestPath === "/api/round-audio") {
          return new Response("", { status: 200, headers: { "Cache-Control": "no-store" } });
        }
        const response = await originalFetch(...args);
        const state = window.__queueArcadeLayout;
        if ((!state?.kind && !state?.wait) || requestPath !== "/api/rounds") return response;
        try {
          const payload = await response.clone().json();
          if (!payload?.round || !payload?.room) return response;
          const now = Date.now();
          if (state.wait) {
            payload.serverNow = now;
            payload.round = {
              ...payload.round,
              id: "layout-wait",
              phase: "reveal",
              game: "trivia",
              startedAt: now - 20_000,
              answerDeadline: now - 5_000,
              revealDeadline: now + 60_000,
              answerDuration: 15_000
            };
            payload.question = null;
            payload.questionRevision = "layout-wait";
            payload.playerVote = null;
            payload.playerReport = null;
            return new Response(JSON.stringify(payload), {
              status: 200,
              headers: { "Content-Type": "application/json", "Cache-Control": "no-store" }
            });
          }
          if (state.served === 0) {
            state.served = 1;
            payload.serverNow = now;
            payload.round = {
              ...payload.round,
              id: "layout-gate",
              phase: "reveal",
              game: "trivia",
              startedAt: now - 20_000,
              answerDeadline: now - 5_000,
              revealDeadline: now + 180,
              answerDuration: 15_000
            };
            payload.question = null;
            payload.questionRevision = "layout-gate";
            payload.playerVote = null;
            payload.playerReport = null;
            return new Response(JSON.stringify(payload), {
              status: 200,
              headers: { "Content-Type": "application/json", "Cache-Control": "no-store" }
            });
          }
          const revealFixture = revealFixtures[state.revealKind];
          if (revealFixture) {
            const revealId = revealFixture.id ?? "layout-reveal-" + state.revealKind;
            const total = revealFixture.counts
              ? revealFixture.counts.reduce((sum, count) => sum + count, 0)
              : revealFixture.keyCounts.reduce((sum, entry) => sum + entry.count, 0);
            payload.serverNow = now;
            payload.round = {
              ...payload.round,
              id: revealId,
              phase: "reveal",
              game: revealFixture.game,
              startedAt: now - 20_000,
              answerDeadline: now - 1_000,
              revealDeadline: now + 60_000,
              answerDuration: 15_000
            };
            payload.questionRevision = revealId + ":reveal";
            payload.question = { ...revealFixture.question, id: revealId, game: revealFixture.game };
            payload.playerVote = {
              answerIndex: 0,
              ...(revealFixture.counts ? {} : { answerKey: revealFixture.vote ?? revealFixture.keyCounts[0].answerKey }),
              submittedAt: now - 2_000
            };
            payload.playerReport = null;
            payload.crowd = {
              counts: revealFixture.counts ?? [total, 0, 0, 0],
              total,
              positions: [],
              keyCounts: revealFixture.keyCounts,
              scoreSummary: { correctCount: 1, average: 120, best: 200, playerPoints: revealFixture.points ?? 0 }
            };
            return new Response(JSON.stringify(payload), {
              status: 200,
              headers: { "Content-Type": "application/json", "Cache-Control": "no-store" }
            });
          }
          const fixture = fixtures[state.kind];
          if (!fixture) return response;
          const roundId = fixture.id ?? "layout-" + state.kind;
          payload.serverNow = now;
          payload.round = {
            ...payload.round,
            id: roundId,
            phase: "answering",
            game: fixture.game,
            startedAt: now - 1_000,
            answerDeadline: now + 25_000,
            revealDeadline: now + 32_000,
            answerDuration: 15_000
          };
          payload.questionRevision = roundId + ":answering";
          payload.question = { ...fixture.question, id: roundId, game: fixture.game, reveal: null };
          payload.playerVote = null;
          payload.playerReport = null;
          payload.crowd = payload.crowd ?? { counts: [0, 0, 0, 0], total: 0, positions: [], keyCounts: [], scoreSummary: null };
          return new Response(JSON.stringify(payload), {
            status: 200,
            headers: { "Content-Type": "application/json", "Cache-Control": "no-store" }
          });
        } catch {
          return response;
        }
      };
    })();
    ${INSPECT_SOURCE}`,
  });

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
      throw new Error(`Viewport ${viewport.name} is ${size.w}x${size.h}, wanted ${viewport.width}x${viewport.height}.`);
    }
  }

  async function screenshot(name) {
    const result = await page.send("Page.captureScreenshot", {
      format: "png",
      fromSurface: true,
      captureBeyondViewport: false,
    });
    await writeFile(`/tmp/queue-arcade-layout-${name}.png`, Buffer.from(result.data, "base64"));
  }

  async function ready() {
    await page.waitFor(
      `document.querySelector("main")?.dataset.clientReady === "true" && document.querySelector("main")?.dataset.accountReady === "true"`,
    );
  }

  async function go(url) {
    await page.send("Page.navigate", { url });
    await page.waitFor(`document.readyState === "complete"`);
    await ready();
  }

  const failures = [];

  async function inspectPage(label) {
    const result = await page.evaluate(`window.__queueArcadeInspectPage()`);
    if (result.issues.length) {
      failures.push(`${label}: ${result.issues.join("; ")}`);
    }
  }

  async function inspectPlay(kind, viewportName) {
    const result = await page.evaluate(
      `window.__queueArcadeInspectLayout(${viewportName === "phone" ? "true" : "false"})`,
    );
    if (viewportName === "phone") {
      result.issues.push(...(await page.evaluate(`window.__queueArcadeInspectHelperReachability()`)));
    }
    await screenshot(`${viewportName}-${kind}`);
    if (result.issues.length) {
      failures.push(`${viewportName}/${kind}: ${result.issues.join("; ")}`);
    }
  }

  async function showFixture(kind) {
    const waitFor = fixtures[kind].waitFor;
    await page.evaluate(`(() => {
      window.__queueArcadeLayout.kind = ${JSON.stringify(kind)};
      window.dispatchEvent(new Event("focus"));
      return true;
    })()`);
    await page.waitFor(
      `document.querySelector("main")?.dataset.phase === "answering" &&
        document.querySelector("main")?.dataset.roundId === ${JSON.stringify("layout-" + kind)} &&
        Boolean(document.querySelector(${JSON.stringify(waitFor)}))`,
      16_000,
    );
    await delay(280);
  }

  /** A wrong pick leads the table, so every row has to name its answer from the round's own cards. */
  async function inspectReveal(kind, viewportName) {
    const { shopTop, timerLeft } = await page.evaluate(`({
      shopTop: document.querySelector('[data-testid="gold-shop"]')?.getBoundingClientRect().top ?? 0,
      timerLeft: document.querySelector('[role="timer"]')?.getBoundingClientRect().left ?? 0,
    })`);
    await page.evaluate(`(() => {
      window.__queueArcadeLayout.revealKind = ${JSON.stringify(kind)};
      window.dispatchEvent(new Event("focus"));
      return true;
    })()`);
    await page.waitFor(
      `document.querySelector("main")?.dataset.phase === "reveal" &&
        document.querySelector("main")?.dataset.roundId === ${JSON.stringify("layout-reveal-" + kind)} &&
        Boolean(document.querySelector('[data-testid="crowd-split-row"]'))`,
      16_000,
    );
    await delay(650);
    const issues = await page.evaluate(`(() => {
      const issues = [];
      const rows = [...document.querySelectorAll('[data-testid="crowd-split-row"]')];
      if (rows.length !== ${revealFixtures[kind].rows ?? revealFixtures[kind].keyCounts.length}) issues.push("table has " + rows.length + " rows");
      for (const row of rows) {
        const marker = row.querySelector("i");
        const box = marker?.getBoundingClientRect();
        if (/Unknown pick|Неизвестный/.test(row.getAttribute("aria-label") ?? "")) issues.push("row with an unknown pick");
        if (marker?.textContent.trim() === "?") issues.push("row with a ? marker");
        const art = [...(marker?.querySelectorAll("img") ?? [])];
        if (${kind.endsWith("-order")} && art.length !== 4) issues.push("order row shows " + art.length + " cards");
        for (const image of art) {
          const r = image.getBoundingClientRect();
          if (r.left < box.left || r.right > box.right + 0.5 || r.top < box.top || r.bottom > box.bottom + 0.5) {
            issues.push("order card clipped by its marker");
          }
        }
        if (row.getBoundingClientRect().right > window.innerWidth + 2) issues.push("row runs off screen");
      }
      if (new Set(rows.map((row) => Math.round(row.getBoundingClientRect().height))).size > 1) issues.push("rows differ in height");
      for (const card of document.querySelectorAll('[data-testid="flashback-order-board"] li')) {
        const art = card.querySelector("img")?.getBoundingClientRect();
        const text = card.querySelector("span")?.getBoundingClientRect();
        if (art && text && art.right > text.left) issues.push("order card art covers its text");
      }
      // The Room split card is the one place for the count and split in the public room.
      const board = [...document.querySelectorAll('[data-testid="arcade-answer"], [data-testid="hero-picker-hero"]')];
      if (board.some((choice) => /%/.test(choice.textContent))) issues.push("the answers repeat the split");
      if (document.querySelector('[data-testid="crowd-summary"]')) issues.push("the reveal sentence repeats the split");
      if (document.querySelector('[data-testid="room-card-answers"]')?.textContent.trim()) {
        issues.push("the Room card repeats the count");
      }
      const split = document.querySelector('[data-testid="crowd-card"]');
      if (document.querySelectorAll('[data-testid="crowd-card"]').length !== 1) issues.push("the public split has multiple homes");
      if (document.querySelector('[data-testid="room-card"]')) issues.push("the old presence card remains beside the reveal split");
      const shop = document.querySelector('[data-testid="gold-shop"]')?.getBoundingClientRect();
      if (window.innerWidth > 920) {
        if (shop && Math.abs(shop.top - ${shopTop}) > 1) issues.push("interactive shop controls move at reveal");
        const summary = document.querySelector('[data-testid="crowd-score-summary"]')?.getBoundingClientRect();
        if (summary && summary.bottom > window.innerHeight + 1) issues.push("crowd score summary is below the desktop fold");
      } else if (split) {
        const score = document.querySelector('[data-testid="score-grid"]')?.getBoundingClientRect();
        const box = split.getBoundingClientRect();
        if ((score && box.top > score.top + 1) || (shop && box.top > shop.top + 1)) issues.push("the narrow split follows lower-priority controls");
      }
      const timer = document.querySelector('[role="timer"]')?.getBoundingClientRect();
      if (timer && Math.abs(timer.left - ${timerLeft}) > 1) issues.push("the clock moves at the reveal");
      return [...new Set(issues)];
    })()`);
    await screenshot(`${viewportName}-reveal-${kind}`);
    if (issues.length) failures.push(`${viewportName}/reveal-${kind}: ${issues.join("; ")}`);
  }

  /** Earn gold, buy both items in the next round, miss the one after: Aegis keeps the streak, the bet is lost. */
  async function checkShop() {
    // Runs inside a round, after the reveal checks: a player who joins mid-round waits for the next one.
    const shopState = `(() => {
      const shop = document.querySelector('[data-testid="gold-shop"]')?.getBoundingClientRect();
      const item = (id) => document.querySelector('[data-testid="shop-' + id + '"]');
      return {
        gold: document.querySelector('[data-testid="score-grid"] strong')?.textContent,
        streak: document.querySelectorAll('[data-testid="score-grid"] strong')[1]?.textContent,
        box: shop ? [Math.round(shop.top), Math.round(shop.height)] : null,
        aegis: [item("aegis")?.dataset.state, item("aegis")?.disabled, item("aegis")?.querySelector("small")?.textContent],
        rune: [item("rune")?.dataset.state, item("rune")?.disabled, item("rune")?.querySelector("small")?.textContent],
      };
    })()`;
    const showReveal = async (kind) => {
      await page.evaluate(`(() => {
        window.__queueArcadeLayout.revealKind = ${JSON.stringify(kind)};
        window.dispatchEvent(new Event("focus"));
        return true;
      })()`);
      await page.waitFor(
        `document.querySelector("main")?.dataset.phase === "reveal" && document.querySelector("main")?.dataset.roundId === ${JSON.stringify(revealFixtures[kind].id)}`,
        16_000,
      );
      await delay(500);
      return page.evaluate(shopState);
    };
    const issues = [];
    const earned = await showReveal("shop-earn");
    if (earned.gold !== "500" || earned.aegis[1] || earned.rune[1])
      issues.push("after earning 500: " + JSON.stringify(earned));
    await page.evaluate(`(() => {
      window.__queueArcadeLayout.revealKind = null;
      window.__queueArcadeLayout.kind = "shop-bet";
      window.dispatchEvent(new Event("focus"));
      return true;
    })()`);
    await page.waitFor(
      `document.querySelector("main")?.dataset.phase === "answering" && document.querySelector("main")?.dataset.roundId === ${JSON.stringify(fixtures["shop-bet"].id)}`,
      16_000,
    );
    await page.evaluate(`document.querySelector('[data-testid="shop-rune"]').click()`);
    await page.evaluate(`document.querySelector('[data-testid="shop-aegis"]').click()`);
    await delay(300);
    const bought = await page.evaluate(shopState);
    if (bought.gold !== "0" || bought.aegis[0] !== "active" || bought.rune[0] !== "active") {
      issues.push("after buying both: " + JSON.stringify(bought));
    }
    const missed = await showReveal("shop-miss");
    if (missed.gold !== "0" || missed.streak !== "1" || missed.aegis[0] !== "outcome" || missed.rune[2] !== "−200") {
      issues.push("after a miss: " + JSON.stringify(missed));
    }
    if (JSON.stringify(missed.box) !== JSON.stringify(earned.box)) issues.push("the shop moved between phases");
    await screenshot("desktop-shop");
    if (issues.length) failures.push(`shop: ${issues.join("; ")}`);
    else
      console.log(`Shop ok: earned ${earned.gold}, bought both, a miss kept streak ${missed.streak} and lost the bet.`);
  }

  for (const viewport of VIEWPORTS) {
    await setViewport(viewport);
    await go(appUrl);
    await page.evaluate(`(() => {
      localStorage.setItem("queue-arcade:settings:v3", JSON.stringify({ soundEnabled: false, gameVolume: 0.7 }));
      return true;
    })()`);
    await inspectPage(`${viewport.name}/lobby`);
    await screenshot(`${viewport.name}-lobby`);

    await go(`${appUrl}/party`);
    await page.waitFor(`Boolean(document.querySelector('[data-testid="private-room-setup"]'))`);
    const partyButtons = await page.evaluate(`({
      create: Boolean(document.querySelector('[data-testid="private-room-choose-create"]')),
      join: Boolean(document.querySelector('[data-testid="private-room-choose-join"]'))
    })`);
    if (!partyButtons.create || !partyButtons.join) {
      failures.push(`${viewport.name}/party: missing Create/Join`);
    }
    await inspectPage(`${viewport.name}/party`);
    await screenshot(`${viewport.name}-party`);

    if (viewport.name === "phone") {
      await go(appUrl);
      await page.evaluate(`(() => {
        window.__queueArcadeLayout.kind = null;
        window.__queueArcadeLayout.wait = true;
        window.__queueArcadeLayout.served = 0;
        return true;
      })()`);
      await page.evaluate(`document.querySelector('[data-testid="start-arcade"]')?.click()`);
      await page.waitFor(`Boolean(document.querySelector('[data-testid="entry-wait-tip"]'))`, 16_000);
      await delay(280);
      const seenTips = new Set();
      for (let step = 0; step < 3; step += 1) {
        const waitResult = await page.evaluate(`window.__queueArcadeInspectWait()`);
        await screenshot(`${viewport.name}-wait-${waitResult.tip || step}`);
        if (waitResult.issues.length) {
          failures.push(`${viewport.name}/wait/${waitResult.tip}: ${waitResult.issues.join("; ")}`);
        }
        seenTips.add(waitResult.tip);
        if (step < 2) {
          await page.evaluate(`document.querySelector('[data-testid="entry-wait-next-tip"]')?.click()`);
          await page.waitFor(
            `document.querySelector('[data-testid="entry-wait-tip"]')?.dataset.tip && document.querySelector('[data-testid="entry-wait-tip"]')?.dataset.tip !== ${JSON.stringify(waitResult.tip)}`,
          );
          await delay(200);
        }
      }
      if (!seenTips.has("keys")) failures.push(`${viewport.name}/wait: A-D keys tip never shown`);
      await page.evaluate(`window.__queueArcadeLayout.wait = false`);
    }

    await go(appUrl);
    await page.evaluate(`(() => {
      window.__queueArcadeLayout.kind = "spell-link";
      window.__queueArcadeLayout.served = 0;
      return true;
    })()`);
    await page.evaluate(`document.querySelector('[data-testid="start-arcade"]')?.click()`);
    await showFixture("spell-link");
    await inspectPlay("spell-link", viewport.name);

    for (const kind of Object.keys(fixtures)) {
      if (kind === "spell-link" || fixtures[kind].id) continue;
      await showFixture(kind);
      await inspectPlay(kind, viewport.name);
    }

    for (const kind of Object.keys(revealFixtures)) {
      if (!revealFixtures[kind].id) await inspectReveal(kind, viewport.name);
    }
    if (viewport.name === "desktop") await checkShop();
  }

  if (failures.length) {
    throw new Error(`Layout failed:\\n- ${failures.join("\\n- ")}`);
  }
  console.log(
    `Layout ok: ${Object.values(fixtures).filter((fixture) => !fixture.id).length} play formats at ${VIEWPORTS.map((view) => view.width).join(" and ")}px.`,
  );
} finally {
  await cleanup();
}

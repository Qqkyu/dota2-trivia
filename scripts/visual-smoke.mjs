#!/usr/bin/env node

import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { MIN_INITIAL_ANSWER_TIME_MS } from "../src/lib/arcade-entry.mjs";
import { valueOrderAnswerKey } from "../src/lib/value-order.mjs";

const debuggingUrl = process.env.CHROME_DEBUG_URL ?? "http://127.0.0.1:9222";
const appUrl = process.env.APP_URL ?? process.env.ARCADE_APP_URL ?? "http://localhost:3000";
const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
const [heroPickerCatalog, shopkeeperCatalog, valueOrderCatalog] = await Promise.all(
  ["hero-picker.json", "shopkeeper-catalog.json", "value-order-questions.json"].map(async (file) =>
    JSON.parse(await readFile(path.join(process.cwd(), "src", "data", file), "utf8")),
  ),
);
const heroStressEntries = heroPickerCatalog.groups
  .flatMap((group) => group.heroes)
  .map((hero) => ({ answerKey: hero.key, count: 1 }));
const itemStressItems = shopkeeperCatalog.groups.flatMap((group) => group.items);
const itemStressEntries = itemStressItems.map((item) => ({ answerKey: item.key, count: 1 }));
const orderStressQuestion = valueOrderCatalog.find((question) => question.valueOrder?.family === "hero-move-speed");
if (!orderStressQuestion) throw new Error("Missing hero movement-speed Order Up fixture.");
const orderStressCards = orderStressQuestion.valueOrder.cards;

function permutations(values) {
  if (values.length <= 1) return [values];
  return values.flatMap((value, index) =>
    permutations(values.filter((_, candidateIndex) => candidateIndex !== index)).map((rest) => [value, ...rest]),
  );
}

const correctOrderStressKeys = orderStressQuestion.valueOrder.correctOrder;
const correctOrderStressAnswer = valueOrderAnswerKey(correctOrderStressKeys);
const orderStressEntries = permutations(orderStressCards.map((card) => card.key))
  .map((keys) => valueOrderAnswerKey(keys))
  .filter((answerKey) => answerKey && answerKey !== correctOrderStressAnswer)
  .concat(correctOrderStressAnswer)
  .map((answerKey) => ({ answerKey, count: 1 }));
const crowdStressFixtures = {
  heroes: {
    game: "quote-hunt",
    question: {
      kind: "hero-quote",
      category: "Heroes",
      eyebrow: "Crowd split stress",
      prompt: "Who said it?",
      detail: "Every hero received one vote in this visual fixture.",
      answerMode: "hero-grid",
    },
    entries: heroStressEntries,
  },
  items: {
    game: "shopkeeper",
    question: {
      kind: "shopkeeper-build-result",
      category: "Recipes",
      eyebrow: "Crowd split stress",
      prompt: "What do these components build?",
      answerMode: "item-grid",
      shopkeeper: {
        format: "build-result",
        promptItems: itemStressItems.slice(0, 3).map((item) => ({
          key: item.key,
          name: item.name,
          image: item.image,
          count: 1,
        })),
      },
    },
    entries: itemStressEntries,
  },
  orders: {
    game: "order-up",
    question: {
      kind: orderStressQuestion.kind,
      category: orderStressQuestion.category,
      eyebrow: orderStressQuestion.eyebrow,
      prompt: orderStressQuestion.prompt,
      answerMode: "value-order",
      valueOrder: {
        family: orderStressQuestion.valueOrder.family,
        direction: "ascending",
        cards: orderStressCards,
      },
    },
    entries: orderStressEntries,
    reveal: {
      orderValues: orderStressQuestion.valueOrder.values.map(({ key, label }) => ({ key, label })),
    },
  },
  classic: {
    game: "trivia",
    question: {
      kind: "item-cost",
      category: "Items",
      eyebrow: "Pipe of Insight",
      prompt: "How much does Pipe of Insight cost?",
      answers: ["3,250 gold", "3,275 gold", "3,725 gold", "4,000 gold"],
    },
    entries: ["a", "b", "c", "d"].map((answerKey) => ({ answerKey, count: 1 })),
  },
  spell: {
    game: "spell-link",
    question: {
      kind: "spell-owner",
      category: "Abilities",
      eyebrow: "Ensnare",
      prompt: "Which hero owns this ability?",
      hint: "Interrupts the target and traps them in place, preventing movement or blinking. Can target units affected by Song of the caster.",
      answerMode: "hero-grid",
    },
    entries: heroStressEntries.slice(0, 4),
  },
  aghanim: {
    game: "aghanim-lab",
    question: {
      kind: "aghanim-upgrade",
      category: "Abilities",
      eyebrow: "Upgrade effect",
      prompt: "Whose upgrade is this?",
      answerMode: "hero-grid",
      aghanim: {
        effect:
          "After using a mobility spell, the next attack burns extra maximum mana and temporarily prevents mana gain.",
      },
    },
    entries: heroStressEntries.slice(0, 4),
  },
};
const targets = await fetch(`${debuggingUrl}/json/list`).then((response) => response.json());
const target = targets.find((entry) => entry.type === "page");

if (!target?.webSocketDebuggerUrl) {
  throw new Error("No debuggable Chrome page was found.");
}

const socket = new WebSocket(target.webSocketDebuggerUrl);
const pending = new Map();
const eventWaiters = new Map();
const browserErrors = [];
let requestId = 0;

socket.addEventListener("message", (message) => {
  const payload = JSON.parse(message.data);

  if (payload.id) {
    const request = pending.get(payload.id);
    if (!request) return;
    pending.delete(payload.id);
    if (payload.error) request.reject(new Error(payload.error.message));
    else request.resolve(payload.result);
    return;
  }

  if (payload.method === "Runtime.exceptionThrown") {
    browserErrors.push(payload.params.exceptionDetails.text);
  }

  const waiters = eventWaiters.get(payload.method);
  if (waiters?.length) {
    eventWaiters.delete(payload.method);
    for (const resolve of waiters) resolve(payload.params);
  }
});

await new Promise((resolve, reject) => {
  socket.addEventListener("open", resolve, { once: true });
  socket.addEventListener("error", reject, { once: true });
});

function send(method, params = {}) {
  const id = ++requestId;
  socket.send(JSON.stringify({ id, method, params }));
  return new Promise((resolve, reject) => pending.set(id, { resolve, reject }));
}

function once(method) {
  return new Promise((resolve) => {
    const waiters = eventWaiters.get(method) ?? [];
    waiters.push(resolve);
    eventWaiters.set(method, waiters);
  });
}

async function evaluate(expression) {
  const result = await send("Runtime.evaluate", {
    expression,
    awaitPromise: true,
    returnByValue: true,
  });
  if (result.exceptionDetails) {
    throw new Error(result.exceptionDetails.exception?.description ?? result.exceptionDetails.text);
  }
  return result.result.value;
}

async function navigate(url) {
  const loaded = once("Page.loadEventFired");
  await send("Page.navigate", { url });
  await loaded;
  await evaluate("document.fonts.ready.then(() => true)");
  await delay(500);
}

async function screenshot(path) {
  const result = await send("Page.captureScreenshot", {
    format: "png",
    fromSurface: true,
    captureBeyondViewport: false,
  });
  await writeFile(path, Buffer.from(result.data, "base64"));
}

async function waitFor(expression, timeout = 30_000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeout) {
    if (await evaluate(expression)) return;
    await delay(200);
  }
  throw new Error(`Timed out waiting for: ${expression}`);
}

async function runCrowdStress(kind, expectedTotal) {
  await evaluate(`(() => {
    window.__queueArcadeCrowdStress = { kind: ${JSON.stringify(kind)}, phase: "answering" };
    window.__queueArcadeOrderSubmittedKey = null;
    window.__queueArcadeOrderAutoSubmitRequests = 0;
  })()`);
  await waitFor(
    `(() => {
    const main = document.querySelector("main");
    const expectedPicker = ${JSON.stringify(kind)} === "heroes"
      ? "hero-picker"
      : ${JSON.stringify(kind)} === "orders"
        ? "value-order-board"
        : "shopkeeper-store";
    return main?.dataset.phase === "answering" &&
      main?.dataset.roundId === "visual-crowd-stress-${kind}" &&
      Boolean(document.querySelector('[data-testid="' + expectedPicker + '"]')) &&
      !document.querySelector('[data-testid="crowd-split"]') &&
      !document.querySelector('[data-testid="crowd-card"]');
  })()`,
    12_000,
  );
  const hiddenBeforeReveal = await evaluate(
    `!document.querySelector('[data-testid="crowd-split"]') && !document.querySelector('[data-testid="crowd-card"]')`,
  );
  const promptContextHiddenBeforeReveal = await evaluate(
    `!document.querySelector('[data-testid="round-prompt"] [class*="questionCopy"] > span')`,
  );
  let orderAutoSubmit = null;

  if (kind === "orders") {
    const lockButtonAbsent = await evaluate(
      `![...document.querySelectorAll("button")].some((button) => button.textContent.includes("Lock order"))`,
    );
    for (let cardIndex = 0; cardIndex < 4; cardIndex += 1) {
      await evaluate(`document.querySelectorAll('[data-testid="value-order-card"]')[${cardIndex}]?.click()`);
      await waitFor(
        `document.querySelectorAll('[data-testid="value-order-card"][data-selected="true"]').length === ${cardIndex + 1}`,
      );
    }
    await waitFor(
      `document.querySelector('[data-testid="value-order-board"]')?.dataset.locked === "true" &&
        window.__queueArcadeOrderAutoSubmitRequests === 1`,
    );
    orderAutoSubmit = await evaluate(`({
      locked: document.querySelector('[data-testid="value-order-board"]')?.dataset.locked === "true",
      requests: window.__queueArcadeOrderAutoSubmitRequests,
      hasSubmittedKey: typeof window.__queueArcadeOrderSubmittedKey === "string",
      lockButtonAbsent: ${lockButtonAbsent}
    })`);
  }

  await evaluate(`window.__queueArcadeCrowdStress.phase = "reveal"`);
  await waitFor(
    `(() => {
    const split = document.querySelector('[data-testid="crowd-split"]');
    return document.querySelector("main")?.dataset.phase === "reveal" &&
      split?.dataset.splitKind === "open-grid" &&
      Number(split?.dataset.total) === ${expectedTotal};
  })()`,
    12_000,
  );
  await delay(650);
  await screenshot(`/tmp/queue-arcade-crowd-${kind}.png`);

  return evaluate(`(() => {
    const card = document.querySelector('[data-testid="crowd-card"]');
    const split = document.querySelector('[data-testid="crowd-split"]');
    const rows = [...document.querySelectorAll('[data-testid="crowd-split-row"]')];
    const score = document.querySelector('[data-testid="crowd-score-summary"]');
    const other = rows.find((row) => row.textContent.includes("Other picks"));
    const cardBounds = card?.getBoundingClientRect();
    const rowBounds = rows.map((row) => row.getBoundingClientRect());
    return {
      kind: split?.dataset.splitKind,
      hiddenBeforeReveal: ${hiddenBeforeReveal},
      promptContextHiddenBeforeReveal: ${promptContextHiddenBeforeReveal},
      total: Number(split?.dataset.total),
      rowCount: rows.length,
      namedRows: rows.filter((row) => !row.textContent.includes("Other picks")).length,
      countTotal: rows.reduce((sum, row) => sum + Number(row.dataset.count), 0),
      otherCount: Number(other?.dataset.count),
      otherPercentage: Number(other?.dataset.percentage),
      correctRows: rows.filter((row) => row.dataset.correct === "true").length,
      selectedRows: rows.filter((row) => row.dataset.selected === "true").length,
      labelsVisible: rows.every((row) => (row.querySelector("strong")?.getBoundingClientRect().width ?? 0) > 0),
      rowsInsideCard: Boolean(cardBounds) && rowBounds.every((bounds) =>
        bounds.left >= cardBounds.left && bounds.right <= cardBounds.right && bounds.bottom <= cardBounds.bottom
      ),
      scoreVisible: Boolean(score) && score.querySelectorAll("span").length === 3 &&
        score.textContent.includes("Correct avg") && score.textContent.includes("Best"),
      scoreInsideCard: Boolean(cardBounds && score) && score.getBoundingClientRect().bottom <= cardBounds.bottom,
      cardHeight: cardBounds?.height,
      cardInsideViewport: Boolean(cardBounds && cardBounds.bottom <= window.innerHeight),
      clipped: Boolean(card && (card.scrollWidth > card.clientWidth || card.scrollHeight > card.clientHeight)),
      horizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
      orderSequences: document.querySelectorAll('[data-testid="value-order-sequence"]').length,
      orderValueLabels: document.querySelectorAll('[data-testid="value-order-sequence"] [data-card-kind] em').length,
      explanationVisible: Boolean(document.querySelector('[data-testid="reveal-explanation"]')),
      orderAutoSubmit: ${JSON.stringify(orderAutoSubmit)},
      catalogResults: ${JSON.stringify(kind)} === "heroes"
        ? [...document.querySelectorAll('[data-testid="hero-picker-hero"]')].filter((entry) => /%/.test(entry.innerText)).length
        : ${JSON.stringify(kind)} === "items"
          ? [...document.querySelectorAll('[data-testid="shopkeeper-store-item"]')].filter((entry) => /%/.test(entry.innerText)).length
          : null,
      catalogVisible: ${JSON.stringify(kind)} === "heroes"
        ? document.querySelectorAll('[data-testid="hero-picker-hero"]').length
        : ${JSON.stringify(kind)} === "items"
          ? document.querySelectorAll('[data-testid="shopkeeper-store-item"]').length
          : null
    };
  })()`);
}

async function runClassicChromeStress() {
  await evaluate(`window.__queueArcadeCrowdStress = { kind: "classic", phase: "answering" }`);
  await evaluate(`window.dispatchEvent(new Event("focus")); true`);
  await waitFor(
    `document.querySelector("main")?.dataset.phase === "answering" &&
      document.querySelector("main")?.dataset.roundId === "visual-crowd-stress-classic"`,
    12_000,
  );
  return evaluate(`({
    promptContextVisible: Boolean(
      document.querySelector('[data-testid="round-prompt"] [class*="questionCopy"] > span')
    ),
    crowdCardVisible: Boolean(document.querySelector('[data-testid="crowd-card"]')),
    roomCardVisible: Boolean(document.querySelector('[class*="queueCard"]'))
  })`);
}

async function runSpellLayoutStress() {
  await evaluate(`window.__queueArcadeCrowdStress = { kind: "spell", phase: "answering" }`);
  await evaluate(`window.dispatchEvent(new Event("focus")); true`);
  await waitFor(
    `document.querySelector("main")?.dataset.phase === "answering" &&
      document.querySelector("main")?.dataset.roundId === "visual-crowd-stress-spell" &&
      Boolean(document.querySelector('[data-testid="spell-clue-list"]'))`,
    12_000,
  );
  await delay(300);
  await screenshot("/tmp/queue-arcade-spell-layout.png");

  return evaluate(`(() => {
    const prompt = document.querySelector('[data-testid="round-prompt"]');
    const clues = document.querySelector('[data-testid="spell-clue-list"]');
    const picker = document.querySelector('[data-testid="hero-picker"]');
    const promptBounds = prompt?.getBoundingClientRect();
    const clueBounds = clues?.getBoundingClientRect();
    const pickerBounds = picker?.getBoundingClientRect();
    return {
      visible: Boolean(clueBounds?.width && clueBounds?.height),
      fullyVisible: Boolean(
        promptBounds &&
          clueBounds &&
          clueBounds.top >= promptBounds.top &&
          clueBounds.bottom <= promptBounds.bottom
      ),
      bottomInset: promptBounds && clueBounds ? promptBounds.bottom - clueBounds.bottom : -1,
      pickerGap: pickerBounds && clueBounds ? pickerBounds.top - clueBounds.bottom : -1,
      horizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth
    };
  })()`);
}

async function runAghanimLayoutStress() {
  await evaluate(`window.__queueArcadeCrowdStress = { kind: "aghanim", phase: "answering" }`);
  await evaluate(`window.dispatchEvent(new Event("focus")); true`);
  await waitFor(
    `document.querySelector("main")?.dataset.phase === "answering" &&
      document.querySelector("main")?.dataset.roundId === "visual-crowd-stress-aghanim" &&
      Boolean(document.querySelector('[data-testid="aghanim-clue-1"]'))`,
    12_000,
  );
  await delay(300);
  await screenshot("/tmp/queue-arcade-aghanim-layout.png");

  return evaluate(`(() => {
    const prompt = document.querySelector('[data-testid="round-prompt"]');
    const picker = document.querySelector('[data-testid="hero-picker"]');
    const artwork = document.querySelector('[data-testid="aghanim-artwork"]');
    const promptBounds = prompt?.getBoundingClientRect();
    const pickerBounds = picker?.getBoundingClientRect();
    return {
      clueCards: [1, 2, 3].filter((stage) =>
        document.querySelector('[data-testid="aghanim-clue-' + stage + '"]')
      ).length,
      firstClueVisible: Boolean(document.querySelector('[data-testid="aghanim-clue-1"] strong')),
      laterCluesLocked:
        document.querySelector('[data-testid="aghanim-clue-2"] span')?.textContent === "Upgrade details" &&
        document.querySelector('[data-testid="aghanim-clue-3"] span')?.textContent === "Ability name",
      artworkVisible: Boolean(artwork?.getBoundingClientRect().width),
      heroItems: document.querySelectorAll('[data-testid="hero-picker-hero"]').length,
      pickerGap: pickerBounds && promptBounds ? pickerBounds.top - promptBounds.bottom : -1,
      promptInsideViewport: Boolean(promptBounds && promptBounds.bottom <= window.innerHeight),
      horizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth
    };
  })()`);
}

async function waitForRevealEntryWindow() {
  const roomUrl = new URL("/api/rounds", appUrl);
  roomUrl.search = new URLSearchParams({
    gameId: "dota2",
    mode: "mixed",
    filter: "Mixed",
    playerId: `visual-entry-${Date.now()}`,
  });

  for (let attempt = 0; attempt < 4; attempt += 1) {
    const snapshot = await fetch(roomUrl, { cache: "no-store" }).then((response) => response.json());
    const revealRemaining = snapshot.round.revealDeadline - snapshot.serverNow;
    if (snapshot.round.phase === "reveal" && revealRemaining >= 2_000) return;

    const wait =
      snapshot.round.phase === "answering"
        ? snapshot.round.answerDeadline - snapshot.serverNow + 150
        : snapshot.round.revealDeadline - snapshot.serverNow + 150;
    await delay(Math.max(150, wait));
  }

  throw new Error("Could not reach a reveal window for the first-entry smoke test.");
}

await send("Page.enable");
await send("Runtime.enable");
await send("Page.addScriptToEvaluateOnNewDocument", {
  source: `(() => {
    const fixtures = ${JSON.stringify(crowdStressFixtures)};
    const originalFetch = window.fetch.bind(window);
    window.__queueArcadeCrowdStress = null;
    window.__queueArcadeAudioPrewarmRequests = 0;
    window.__queueArcadeOrderSubmittedKey = null;
    window.__queueArcadeOrderAutoSubmitRequests = 0;

    Object.defineProperty(HTMLMediaElement.prototype, "play", {
      configurable: true,
      value() { return Promise.resolve(); }
    });

    window.fetch = async (...args) => {
      const input = args[0];
      const init = args[1];
      const requestUrl = typeof input === "string" || input instanceof URL ? String(input) : input?.url;
      const requestMethod = String(init?.method ?? input?.method ?? "GET").toUpperCase();
      const requestPath = requestUrl ? new URL(requestUrl, location.href).pathname : "";
      if (requestPath === "/api/round-audio" && requestMethod === "HEAD") {
        window.__queueArcadeAudioPrewarmRequests += 1;
      }

      const state = window.__queueArcadeCrowdStress;
      if (state?.kind === "orders" && requestPath === "/api/votes" && requestMethod === "POST") {
        const body = JSON.parse(String(init?.body ?? "{}"));
        window.__queueArcadeOrderSubmittedKey = body.answerKey;
        window.__queueArcadeOrderAutoSubmitRequests += 1;
        return new Response(JSON.stringify({
          accepted: true,
          counts: [0, 0, 0, 0],
          total: 1,
          positions: [],
          keyCounts: [],
          scoreSummary: null,
          playerVote: {
            answerIndex: 0,
            answerKey: body.answerKey,
            submittedAt: Date.now()
          }
        }), {
          status: 200,
          headers: { "Content-Type": "application/json", "Cache-Control": "no-store" }
        });
      }

      const response = await originalFetch(...args);
      if (!state || requestPath !== "/api/rounds") return response;

      try {
        const fixture = fixtures[state.kind];
        if (!fixture) return response;
        const payload = await response.clone().json();
        if (!payload?.round || !payload?.room) return response;

        const now = Date.now();
        const reveal = state.phase === "reveal";
        const total = fixture.entries.length;
        const correctKey = fixture.entries.at(-1).answerKey;
        const selectedKey = state.kind === "orders" && window.__queueArcadeOrderSubmittedKey
          ? window.__queueArcadeOrderSubmittedKey
          : fixture.entries.at(-2).answerKey;
        const roundId = "visual-crowd-stress-" + state.kind;
        payload.serverNow = now;
        payload.round = {
          ...payload.round,
          id: roundId,
          phase: reveal ? "reveal" : "answering",
          game: fixture.game,
          startedAt: now - 3_000,
          answerDeadline: reveal ? now - 1_000 : now + 12_000,
          revealDeadline: now + 6_000,
          answerDuration: 15_000
        };
        payload.questionRevision = roundId + ":" + state.phase;
        payload.question = {
          id: roundId,
          game: fixture.game,
          ...fixture.question,
          difficulty: 3,
          answers: fixture.question.answers ?? ["", "", "", ""],
          patch: "visual-test",
          clueStage: reveal ? 3 : 1,
          reveal: reveal ? {
            correctIndex: 0,
            correctAnswerKey: correctKey,
            explanation: "Full-catalog crowd split visual fixture.",
            ...(fixture.reveal ?? {})
          } : null
        };
        payload.presence = { activePlayers: total };
        payload.crowd = {
          counts: reveal ? [total, 0, 0, 0] : [0, 0, 0, 0],
          total,
          positions: [],
          keyCounts: reveal ? fixture.entries : [],
          scoreSummary: reveal ? {
            correctCount: Math.ceil(total / 3),
            average: 164,
            best: 218,
            playerPoints: 0
          } : null
        };
        payload.playerVote = state.kind === "orders" && !reveal && !window.__queueArcadeOrderSubmittedKey
          ? null
          : {
              answerIndex: 0,
              ...(fixture.question.answerMode ? { answerKey: selectedKey } : {}),
              submittedAt: now - 1_000
            };
        payload.playerReport = null;

        return new Response(JSON.stringify(payload), {
          status: response.status,
          statusText: response.statusText,
          headers: { "Content-Type": "application/json", "Cache-Control": "no-store" }
        });
      } catch {
        return response;
      }
    };
  })();`,
});
await send("Emulation.setDeviceMetricsOverride", {
  width: 1440,
  height: 1000,
  deviceScaleFactor: 1,
  mobile: false,
});

await navigate(appUrl);
await evaluate(`(() => {
  localStorage.clear();
  return true;
})()`);
await navigate(appUrl);
await waitFor(
  `document.querySelector("main")?.dataset.clientReady === "true" && document.querySelector("main")?.dataset.accountReady === "true"`,
);
const defaultVolume = await evaluate(`document.querySelector('[data-testid="game-volume"]')?.value`);
await evaluate(`(() => {
  localStorage.clear();
  localStorage.setItem("queue-arcade:settings:v2", JSON.stringify({ soundEnabled: false, gameVolume: 0.7 }));
  return true;
})()`);
await navigate(appUrl);
await waitFor(
  `document.querySelector("main")?.dataset.clientReady === "true" && document.querySelector("main")?.dataset.accountReady === "true"`,
);
const migratedVolume = await evaluate(`document.querySelector('[data-testid="game-volume"]')?.value`);
await evaluate(`(() => {
  localStorage.setItem("queue-arcade:settings:v3", JSON.stringify({ soundEnabled: false, gameVolume: 0.7 }));
  return true;
})()`);
await navigate(appUrl);
await waitFor(
  `document.querySelector("main")?.dataset.clientReady === "true" && document.querySelector("main")?.dataset.accountReady === "true"`,
);
await screenshot("/tmp/queue-arcade-lobby.png");

const lobby = await evaluate(`(() => {
  const brand = document.querySelector('a[aria-label="Queue Arcade home"]');
  const mark = brand?.firstElementChild?.getBoundingClientRect();
  const copy = brand?.lastElementChild?.getBoundingClientRect();
  return {
    title: document.title,
    heading: document.querySelector("h1")?.innerText,
    startButtons: document.querySelectorAll('[data-testid="start-arcade"]').length,
    shareButtons: document.querySelectorAll('[data-testid="share-arcade"]').length,
    canonical: document.querySelector('link[rel="canonical"]')?.href,
    openGraphImage: document.querySelector('meta[property="og:image"]')?.content,
    modeCards: document.querySelectorAll("[data-arcade-mode]").length,
    roundFamilies: document.querySelectorAll("[data-round-family]").length,
    roundMix: document.querySelector('[data-testid="round-mix"]')?.innerText,
    copy: document.querySelector("main")?.innerText,
    muted: Boolean(document.querySelector('button[aria-label="Enable game sounds"]')),
    volume: document.querySelector('[data-testid="game-volume"]')?.value,
    steamButtons: document.querySelectorAll('[data-testid="steam-sign-in"]').length,
    steamButton: (() => {
      const button = document.querySelector('[data-testid="steam-sign-in"]');
      const bounds = button?.getBoundingClientRect();
      return bounds ? {
        width: bounds.width,
        height: bounds.height,
        markPath: button.querySelector('[data-brand-icon="steam"] path')?.getAttribute("d"),
        label: button.textContent?.trim()
      } : null;
    })(),
    accountSlot: (() => {
      const bounds = document.querySelector('[data-testid="account-action-slot"]')?.getBoundingClientRect();
      return bounds ? { width: bounds.width, height: bounds.height } : null;
    })(),
    markCenter: mark ? mark.top + mark.height / 2 : 0,
    copyCenter: copy ? copy.top + copy.height / 2 : 0,
    brandLeft: document.querySelector('[data-testid="site-home"]')?.getBoundingClientRect().left ?? null,
    headerLeft: document.querySelector("header")?.getBoundingClientRect().left ?? null,
    horizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth
  };
})()`);

await navigate(`${appUrl}/profile`);
await waitFor(`document.querySelector('[data-testid="profile-page"]')?.dataset.authenticated === "false"`);
const profile = await evaluate(`({
  title: document.title,
  heading: document.querySelector("h1")?.innerText,
  steamButtons: document.querySelectorAll('[data-testid="steam-sign-in"]').length,
  steamButton: (() => {
    const button = document.querySelector('[data-testid="steam-sign-in"]');
    const bounds = button?.getBoundingClientRect();
    return bounds ? {
      width: bounds.width,
      height: bounds.height,
      markPath: button.querySelector('[data-brand-icon="steam"] path')?.getAttribute("d"),
      label: button.textContent?.trim()
    } : null;
  })(),
  anonymousPlay: document.body.innerText.includes("Anonymous play stays available"),
  brandLeft: document.querySelector('[data-testid="site-home"]')?.getBoundingClientRect().left ?? null,
  headerLeft: document.querySelector("header")?.getBoundingClientRect().left ?? null,
  horizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth
})`);
await screenshot("/tmp/queue-arcade-profile-guest.png");
const profileChrome = await evaluate(`(() => {
  const home = document.querySelector('[data-testid="site-home"]');
  return {
    homeHref: home?.getAttribute("href") ?? "",
    homeTag: home?.tagName ?? "",
    privacyHref: document.querySelector('[data-testid="site-nav-privacy"]')?.getAttribute("href") ?? "",
    calibrationHref: document.querySelector('[data-testid="site-nav-calibration"]')?.getAttribute("href") ?? "",
  };
})()`);
await evaluate(`document.querySelector('[data-testid="site-nav-privacy"]')?.click()`);
await waitFor(`location.pathname === "/privacy"`);
const privacyFromProfile = await evaluate(`({
  url: location.pathname,
  heading: document.querySelector("h1")?.innerText ?? "",
  profileHref: document.querySelector('[data-testid="site-nav-profile"]')?.getAttribute("href") ?? "",
})`);
await evaluate(`document.querySelector('[data-testid="site-nav-profile"]')?.click()`);
await waitFor(`location.pathname === "/profile" && Boolean(document.querySelector('[data-testid="profile-page"]'))`);
const profileFromPrivacy = await evaluate(`({
  url: location.pathname,
  profile: Boolean(document.querySelector('[data-testid="profile-page"]')),
})`);
await evaluate(`document.querySelector('[data-testid="site-nav-privacy"]')?.click()`);
await waitFor(`location.pathname === "/privacy"`);
await evaluate(`document.querySelector('[data-testid="site-home"]')?.click()`);
await waitFor(
  `location.pathname === "/" && document.querySelector('[data-testid="start-arcade"]') && document.querySelector("main")?.dataset.clientReady === "true"`,
);
const privacyHomeLanded = await evaluate(`({
  url: location.pathname + location.search,
  lobby: Boolean(document.querySelector('[data-testid="start-arcade"]')),
})`);

async function measureProfileRecords(size) {
  await navigate(`${appUrl}/profile?recordsPreview=${size}`);
  await waitFor(
    `document.querySelector('[data-testid="profile-records-preview"]')?.dataset.size === ${JSON.stringify(size)}`,
  );
  const layout = await evaluate(`(() => {
    const records = document.querySelector('[data-testid="profile-records"]');
    const rows = [...document.querySelectorAll('[data-testid^="format-mastery-"]')];
    const classic = document.querySelector('[data-testid="format-mastery-trivia"]');
    const spell = document.querySelector('[data-testid="format-mastery-spell-link"]');
    const fogged = document.querySelector('[data-testid="format-mastery-fogged-vision"]');
    return {
      rows: rows.length,
      recentLog: Boolean(document.body.innerText.toLowerCase().includes("recent answers")),
      compareLabel: Boolean(
        document.querySelector('[data-testid="profile-records"]') &&
          /you/i.test(document.querySelector('[data-testid="format-mastery-trivia"]')?.innerText ?? "") &&
          /crowd/i.test(document.querySelector('[data-testid="format-mastery-trivia"]')?.innerText ?? ""),
      ),
      firstClue: document.body.innerText.includes("First clue"),
      laterClues:
        document.body.innerText.includes("Second clue") && document.body.innerText.includes("Third clue"),
      spellClues: document.querySelector('[data-testid="format-mastery-spell-link"]')?.dataset.clues ?? "",
      played: document.body.innerText.includes("played"),
      classicYou: classic?.dataset.you ?? "",
      classicRoom: classic?.dataset.room ?? "",
      spellEarly: spell?.dataset.early ?? "",
      foggedYou: fogged?.dataset.you ?? "",
      recordsHeight: records?.getBoundingClientRect().height ?? 0,
      horizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
    };
  })()`);
  const preview = await evaluate(`(() => {
    const read = (game) => document.querySelector('[data-testid="format-preview-' + game + '"]')?.textContent ?? "";
    const stage = document.querySelector('[data-testid="format-preview-stage-trivia"]');
    const neighbor = document.querySelector('[data-testid="format-mastery-shopkeeper"]');
    const stageBox = stage?.getBoundingClientRect();
    const shopTray = document.querySelector('[data-testid="format-preview-shopkeeper"] [data-item-count]');
    const shopTops = [...(shopTray?.querySelectorAll("img") ?? [])].map((img) => img.getBoundingClientRect().top);
    const aghanimImage = document.querySelector('[data-testid="format-preview-aghanim-lab"] img');
    return {
      trivia: read("trivia"),
      fog: read("fogged-vision"),
      order: read("order-up"),
      aghanim: read("aghanim-lab"),
      spell: read("spell-link"),
      shopHorizontal: shopTops.length >= 2 && Math.max(...shopTops) - Math.min(...shopTops) < 8,
      aghanimArt: aghanimImage?.getAttribute("src") ?? "",
      stageHeight: stageBox?.height ?? 0,
      neighborTop: neighbor?.getBoundingClientRect().top ?? 0,
      hoverPoint: stageBox ? { x: stageBox.left + 36, y: stageBox.top + 16 } : null,
    };
  })()`);
  if (preview.hoverPoint) {
    await send("Input.dispatchMouseEvent", { type: "mouseMoved", ...preview.hoverPoint });
  }
  await delay(160);
  const afterHover = await evaluate(`(() => {
    const stage = document.querySelector('[data-testid="format-preview-stage-trivia"]');
    const neighbor = document.querySelector('[data-testid="format-mastery-shopkeeper"]');
    return {
      stageHeight: stage?.getBoundingClientRect().height ?? 0,
      neighborTop: neighbor?.getBoundingClientRect().top ?? 0,
    };
  })()`);
  await screenshot(`/tmp/queue-arcade-profile-records-${size}.png`);
  await send("Input.dispatchMouseEvent", { type: "mouseMoved", x: 2, y: 2 });
  return {
    size,
    ...layout,
    preview: {
      prompt: preview.trivia.includes("Pipe of Insight"),
      answers: preview.trivia.includes("3,725 gold") || preview.trivia.includes("4,000 gold"),
      fogPrompt: preview.fog.includes("Which hero is hiding in the fog?"),
      fogLookCue: preview.fog.includes("A portrait in fog"),
      spellPrompt: preview.spell.includes("Which hero owns this ability?"),
      orderPrompt: preview.order.includes("Order these items"),
      orderCards: preview.order.includes("Ring of Health"),
      aghanimPrompt: preview.aghanim.includes("Whose upgrade is this?"),
      aghanimArt: /ultimate_scepter|aghanims_shard/.test(preview.aghanimArt),
      shopHorizontal: preview.shopHorizontal,
      stageHeight: preview.stageHeight,
      hoverShift: Math.abs(afterHover.stageHeight - preview.stageHeight),
      neighborShift: Math.abs(afterHover.neighborTop - preview.neighborTop),
    },
  };
}

const profileRecordsShort = await measureProfileRecords("short");
const profileRecordsLong = await measureProfileRecords("long");

await navigate(`${appUrl}/privacy`);
const privacy = await evaluate(`({
  title: document.title,
  heading: document.querySelector("h1")?.innerText,
  optionalSteam: document.body.innerText.includes("Connecting Steam is optional"),
  deletion: document.body.innerText.includes("Delete profile"),
  diagnostics: document.body.innerText.includes("Error text, stack traces, URL queries, and player identifiers are not sent"),
  alphaAnalytics: document.body.innerText.includes("Alpha visit summaries expire after 30 days"),
  retiredSessionRating: !document.body.innerText.includes("session rating"),
  horizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth
})`);
await screenshot("/tmp/queue-arcade-privacy.png");

await navigate(`${appUrl}/ops`);
const opsGuest = await evaluate(`({
  access: document.querySelector('[data-testid="ops-gate"]')?.dataset.access,
  steamButtons: document.querySelectorAll('[data-testid="steam-sign-in"]').length,
  horizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth
})`);
await screenshot("/tmp/queue-arcade-ops-guest.png");

await navigate(`${appUrl}/?mode=fogged-vision`);
await waitFor(
  `document.querySelector("main")?.dataset.clientReady === "true" && document.querySelector("main")?.dataset.accountReady === "true"`,
);
const legacyLink = await evaluate(`({
  url: location.pathname + location.search,
  modeCards: document.querySelectorAll("[data-arcade-mode]").length,
  startButtons: document.querySelectorAll('[data-testid="start-arcade"]').length
})`);

await navigate(appUrl);
await waitFor(
  `document.querySelector("main")?.dataset.clientReady === "true" && document.querySelector("main")?.dataset.accountReady === "true"`,
);
await waitForRevealEntryWindow();
await evaluate(`document.querySelector('[data-testid="start-arcade"]')?.click()`);
await waitFor(`document.querySelector("main")?.dataset.phase === "waiting"`);
const entryWait = await evaluate(`({
  phase: document.querySelector("main")?.dataset.phase,
  roomId: document.querySelector("main")?.dataset.roomId,
  heading: document.querySelector('[data-testid="round-entry-wait"] h1')?.innerText,
  countdown: Number(document.querySelector('[data-testid="entry-wait-timer"]')?.textContent?.split(":").at(-1)),
  horizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth
})`);
await screenshot("/tmp/queue-arcade-entry-wait.png");
await waitFor(`(() => {
  const main = document.querySelector("main");
  const timer = Number(document.querySelector('[data-testid="round-timer"]')?.textContent);
  return main?.dataset.phase === "answering" && timer >= 5;
})()`);
await screenshot("/tmp/queue-arcade-public-round.png");

const answering = await evaluate(`({
  url: location.pathname + location.search,
  phase: document.querySelector("main")?.dataset.phase,
  roomId: document.querySelector("main")?.dataset.roomId,
  roundId: document.querySelector("main")?.dataset.roundId,
  timer: Number(document.querySelector('[data-testid="round-timer"]')?.textContent),
  game: document.querySelector('[data-testid="public-room"]')?.dataset.roundGame,
  answers: document.querySelectorAll('[data-testid="arcade-answer"]').length,
  openShop: Boolean(document.querySelector('[data-testid="shopkeeper-store"]')),
  recipeBuilder: Boolean(document.querySelector('[data-testid="shopkeeper-recipe-builder"]')),
  recipeSize: Number(document.querySelector('[data-testid="shopkeeper-recipe-builder"]')?.dataset.recipeSize ?? 0),
  shopItems: document.querySelectorAll('[data-testid="shopkeeper-store-item"]').length,
  heroPicker: Boolean(document.querySelector('[data-testid="hero-picker"]')),
  valueOrder: Boolean(document.querySelector('[data-testid="value-order-board"]')),
  valueOrderCards: document.querySelectorAll('[data-testid="value-order-card"]').length,
  heroSearch: Boolean(document.querySelector('[data-testid="hero-search"]')),
  heroItems: document.querySelectorAll('[data-testid="hero-picker-hero"]').length,
  heroGroups: [...document.querySelectorAll('[data-testid="hero-picker"] [data-attribute]')].map((group) => ({
    attribute: group.dataset.attribute,
    count: Number(group.dataset.heroCount)
  })),
  difficultyControls: document.querySelectorAll('[data-skill-level], [aria-label="Challenge level"]').length,
  tipCards: document.querySelectorAll('[class*="tipCard"]').length,
  crowdSplitVisible: Boolean(document.querySelector('[data-testid="crowd-split"]')),
  crowdCardVisible: Boolean(document.querySelector('[data-testid="crowd-card"]')),
  publicRoomVisible: Boolean(document.querySelector('[data-testid="public-room"]')),
  roomPresenceVisible: Boolean(document.querySelector('[data-testid="room-presence"]')),
  roomElapsedVisible: Boolean(document.querySelector('[class*="queueStatus"] > strong')),
  promptContext: document.querySelector('[data-testid="round-prompt"] [class*="questionCopy"] > span')?.textContent,
  promptText: document.querySelector('[data-testid="round-prompt"] [class*="questionCopy"] > h2')?.textContent,
  horizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth
})`);

let shopTooltip = null;
let shopSearchCleared = null;
if (answering.openShop) {
  const shopHoverPoint = await evaluate(`(() => {
    const store = document.querySelector('[data-testid="shopkeeper-store"]');
    const groups = store?.querySelector('[data-shop-section]');
    const item = store?.querySelector('[data-testid="shopkeeper-store-item"]');
    const measure = (element) => element ? ({
      clientWidth: element.clientWidth,
      clientHeight: element.clientHeight,
      scrollWidth: element.scrollWidth,
      scrollHeight: element.scrollHeight,
      scrollLeft: element.scrollLeft,
      scrollTop: element.scrollTop
    }) : null;
    window.__queueArcadeShopBeforeTooltip = { store: measure(store), groups: measure(groups) };
    const bounds = item?.getBoundingClientRect();
    return bounds ? { x: bounds.left + bounds.width / 2, y: bounds.top + bounds.height / 2 } : null;
  })()`);
  if (shopHoverPoint) {
    await send("Input.dispatchMouseEvent", { type: "mouseMoved", ...shopHoverPoint });
  }
  await waitFor(`Boolean(document.querySelector('[data-testid="shopkeeper-item-tooltip"]'))`);
  shopTooltip = await evaluate(`(() => {
    const store = document.querySelector('[data-testid="shopkeeper-store"]');
    const groups = store?.querySelector('[data-shop-section]');
    const tooltip = document.querySelector('[data-testid="shopkeeper-item-tooltip"]');
    const bounds = tooltip?.getBoundingClientRect();
    const measure = (element) => element ? ({
      clientWidth: element.clientWidth,
      clientHeight: element.clientHeight,
      scrollWidth: element.scrollWidth,
      scrollHeight: element.scrollHeight,
      scrollLeft: element.scrollLeft,
      scrollTop: element.scrollTop
    }) : null;
    const after = { store: measure(store), groups: measure(groups) };
    return {
      visible: Boolean(bounds?.width && bounds?.height),
      stable: JSON.stringify(window.__queueArcadeShopBeforeTooltip) === JSON.stringify(after),
      insideViewport: Boolean(
        bounds && bounds.left >= 0 && bounds.top >= 0 &&
        bounds.right <= window.innerWidth && bounds.bottom <= window.innerHeight
      )
    };
  })()`);
  await send("Input.dispatchMouseEvent", { type: "mouseMoved", x: 2, y: 2 });
  await waitFor(`!document.querySelector('[data-testid="shopkeeper-item-tooltip"]')`);

  await evaluate(`(() => {
    const input = document.querySelector('[data-testid="shopkeeper-search"]');
    const item = document.querySelector('[data-testid="shopkeeper-store-item"]');
    const name = item?.getAttribute("aria-label")?.split(",")[0] ?? "";
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
    setter?.call(input, name);
    input?.dispatchEvent(new Event("input", { bubbles: true }));
  })()`);
  await waitFor(`Boolean(document.querySelector('[data-testid="shopkeeper-search"]')?.value)`);
  await evaluate(`document.querySelector('[data-testid="shopkeeper-store-item"]')?.click()`);
  await waitFor(`document.querySelector('[data-testid="shopkeeper-search"]')?.value === ""`);
  shopSearchCleared = await evaluate(`document.querySelector('[data-testid="shopkeeper-search"]')?.value === ""`);

  if (answering.recipeBuilder) {
    await waitFor(
      `Number(document.querySelector('[data-testid="shopkeeper-recipe-builder"]')?.dataset.selectionCount) === 1`,
    );
    for (let slot = 1; slot < answering.recipeSize; slot += 1) {
      await evaluate(`document.querySelector('[data-testid="shopkeeper-store-item"]:not(:disabled)')?.click()`);
      await waitFor(
        `Number(document.querySelector('[data-testid="shopkeeper-recipe-builder"]')?.dataset.selectionCount) === ${slot + 1}`,
      );
    }
    await evaluate(`document.querySelector('[data-testid="shopkeeper-recipe-build"]')?.click()`);
  }
}

let heroSearch = null;
if (answering.heroPicker) {
  await evaluate(`(() => {
    window.__queueArcadeHeroPositions = [...document.querySelectorAll('[data-testid="hero-picker-hero"]')]
      .map((hero) => {
        const bounds = hero.getBoundingClientRect();
        return [hero.dataset.heroKey, bounds.x, bounds.y];
      });
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "z", bubbles: true }));
  })()`);
  await waitFor(`document.querySelector('[data-testid="hero-search"]')?.value === "z"`);
  await waitFor(`[
    ...document.querySelectorAll('[data-testid="hero-picker-hero"][data-search-match="false"]')
  ].some((hero) => Number(getComputedStyle(hero).opacity) < 0.2)`);
  heroSearch = await evaluate(`(() => {
    const heroes = [...document.querySelectorAll('[data-testid="hero-picker-hero"]')];
    const positions = heroes.map((hero) => {
      const bounds = hero.getBoundingClientRect();
      return [hero.dataset.heroKey, bounds.x, bounds.y];
    });
    return {
      value: document.querySelector('[data-testid="hero-search"]')?.value,
      matches: heroes.filter((hero) => hero.dataset.searchMatch === "true").length,
      dimmed: heroes.filter((hero) => hero.dataset.searchMatch === "false" && Number(getComputedStyle(hero).opacity) < 0.2).length,
      fixed: JSON.stringify(window.__queueArcadeHeroPositions) === JSON.stringify(positions)
    };
  })()`);
  await evaluate(`document.querySelector('[data-testid="hero-search-clear"]')?.click()`);
  await waitFor(`document.querySelector('[data-testid="hero-search"]')?.value === ""`);
}

if (!answering.openShop) {
  if (answering.valueOrder) {
    for (let cardIndex = 0; cardIndex < 4; cardIndex += 1) {
      await evaluate(`document.querySelectorAll('[data-testid="value-order-card"]')[${cardIndex}]?.click()`);
      await waitFor(
        `document.querySelectorAll('[data-testid="value-order-card"][data-selected="true"]').length === ${cardIndex + 1}`,
      );
    }
  } else {
    await evaluate(`(
      document.querySelector('[data-testid="hero-picker-hero"]') ??
      document.querySelector('[data-testid="arcade-answer"]')
    )?.click()`);
  }
}
await waitFor(`Boolean(
  document.querySelector('[data-testid="shopkeeper-store"][data-locked="true"]') ??
  document.querySelector('[data-testid="hero-picker-hero"][aria-pressed="true"]') ??
  document.querySelector('[data-testid="value-order-board"][data-locked="true"]') ??
  document.querySelector('[data-testid="arcade-answer"][aria-pressed="true"]')
)`);
await waitFor(`document.querySelector("main")?.dataset.phase === "reveal"`, 20_000);
await screenshot("/tmp/queue-arcade-public-reveal.png");

const revealBoundsBeforeReport = await evaluate(`(() => {
  const panel = document.querySelector('[data-testid="report-question"]')?.closest('[aria-live="polite"]');
  const bounds = panel?.getBoundingClientRect();
  return bounds ? { x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height } : null;
})()`);
await evaluate(`document.querySelector('[data-testid="report-question"]')?.click()`);
await waitFor(`document.querySelectorAll('[data-testid="report-reason"]').length === 4`);
const reveal = await evaluate(`(() => {
  const panel = document.querySelector('[data-testid="report-question"]')?.closest('[aria-live="polite"]');
  const bounds = panel?.getBoundingClientRect();
  return {
    result:
      document.querySelector('[data-testid="reveal-callout"]')?.textContent?.trim() ??
      [...document.querySelectorAll("span")].find((entry) =>
        ["Correct", "Denied", "Time expired", "First Blood", "Killing Spree", "Rampage", "Godlike"].includes(
          entry.textContent.trim(),
        ),
      )?.textContent,
    percentages: [...document.querySelectorAll('[data-testid="arcade-answer"]')]
      .filter((button) => /%/.test(button.innerText)).length,
    shopPercentages: [...document.querySelectorAll('[data-testid="shopkeeper-store-item"]')]
      .filter((button) => /%/.test(button.innerText)).length,
    heroPercentages: [...document.querySelectorAll('[data-testid="hero-picker-hero"]')]
      .filter((button) => /%/.test(button.innerText)).length,
    heroCorrect: document.querySelectorAll('[data-testid="hero-picker-hero"][data-state="correct"]').length,
    orderSequences: document.querySelectorAll('[data-testid="value-order-sequence"]').length,
    orderValueLabels: document.querySelectorAll('[data-testid="value-order-sequence"] em').length,
    crowdSplit: (() => {
      const split = document.querySelector('[data-testid="crowd-split"]');
      const rows = [...document.querySelectorAll('[data-testid="crowd-split-row"]')];
      return {
        visible: Boolean(split),
        kind: split?.dataset.splitKind,
        total: Number(split?.dataset.total),
        rows: rows.length,
        countTotal: rows.reduce((sum, row) => sum + Number(row.dataset.count), 0),
        correctRows: rows.filter((row) => row.dataset.correct === "true").length,
        selectedRows: rows.filter((row) => row.dataset.selected === "true").length,
      };
    })(),
    recipeReveal: Boolean(document.querySelector('[data-testid="shopkeeper-recipe-reveal-tray"]')),
    openShopReveal: Boolean(document.querySelector('[data-testid="shopkeeper-open-reveal"]')),
    reportReasons: document.querySelectorAll('[data-testid="report-reason"]').length,
    reportBounds: bounds ? { x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height } : null,
    nextButton: [...document.querySelectorAll("button")].some((button) => button.textContent.includes("Next round")),
    internalSourceLabel: document.body.innerText.includes("OpenDota constants"),
    audioPrewarmRequests: Number(window.__queueArcadeAudioPrewarmRequests ?? 0)
  };
})()`);
await evaluate(`document.querySelector('[data-testid="report-question"]')?.click()`);

const revealedRound = answering.roundId;
await waitFor(
  `document.querySelector("main")?.dataset.phase === "answering" && document.querySelector("main")?.dataset.roundId !== ${JSON.stringify(revealedRound)}`,
  12_000,
);
const autoAdvanced = await evaluate(`({
  phase: document.querySelector("main")?.dataset.phase,
  roundId: document.querySelector("main")?.dataset.roundId,
  roomId: document.querySelector("main")?.dataset.roomId
})`);
await evaluate(`document.querySelector('[data-testid="view-summary"]')?.click()`);
await waitFor(`document.querySelector("main")?.dataset.phase === "summary"`);
const summary = await evaluate(`({
  heading: document.querySelector("h1")?.innerText,
  scoreVisible: document.body.textContent?.includes("Final gold"),
  playAgain: [...document.querySelectorAll("button")].some((button) => button.textContent.includes("Play again")),
  backLabel: [...document.querySelectorAll("button")].some((button) => button.textContent.includes("Back to arcade")),
  feedbackOptions: document.querySelectorAll('[data-testid="session-feedback-option"]').length,
  shareActions: document.querySelectorAll('[data-testid="share-arcade"]').length
})`);
await screenshot("/tmp/queue-arcade-summary.png");

await evaluate(`history.back(); true`);
await waitFor(`location.pathname === "/" && document.querySelector("main")?.dataset.phase === "lobby"`);
const historyBack = await evaluate(`({
  url: location.pathname + location.search,
  lobby: document.querySelector("main")?.dataset.phase === "lobby"
})`);
await evaluate(`history.forward(); true`);
await waitFor(`location.pathname === "/play" && document.querySelector("main")?.dataset.phase === "answering"`, 12_000);
const historyForward = await evaluate(`({
  url: location.pathname + location.search,
  answering: document.querySelector("main")?.dataset.phase === "answering",
  roomId: document.querySelector("main")?.dataset.roomId
})`);

await navigate(`${appUrl}/play`);
await waitFor(`document.querySelector("main")?.dataset.clientReady === "true"`);
await waitFor(`location.pathname === "/play" && document.querySelector("main")?.dataset.phase === "answering"`);
const directPlay = await evaluate(`({
  url: location.pathname + location.search,
  answering: document.querySelector("main")?.dataset.phase === "answering",
  roomId: document.querySelector("main")?.dataset.roomId
})`);

const heroCrowdStress = await runCrowdStress("heroes", heroStressEntries.length);
const itemCrowdStress = await runCrowdStress("items", itemStressEntries.length);
const orderCrowdStress = await runCrowdStress("orders", orderStressEntries.length);
const spellLayoutStress = await runSpellLayoutStress();
const aghanimLayoutStress = await runAghanimLayoutStress();
const classicChromeStress = await runClassicChromeStress();
await evaluate(`window.__queueArcadeCrowdStress = null`);

await send("Emulation.setDeviceMetricsOverride", {
  width: 390,
  height: 844,
  deviceScaleFactor: 1,
  mobile: true,
});
await navigate(appUrl);
await waitFor(
  `document.querySelector("main")?.dataset.clientReady === "true" && document.querySelector("main")?.dataset.accountReady === "true"`,
);
const mobile = await evaluate(`({
  headingVisible: Boolean(document.querySelector("h1")?.getBoundingClientRect().height),
  startButton: Boolean(document.querySelector('[data-testid="start-arcade"]')),
  roundFamilies: document.querySelectorAll("[data-round-family]").length,
  steamButtons: document.querySelectorAll('[data-testid="steam-sign-in"]').length,
  accountSlotWidth: document.querySelector('[data-testid="account-action-slot"]')?.getBoundingClientRect().width,
  startButtonWidth: document.querySelector('[data-testid="start-arcade"]')?.getBoundingClientRect().width,
  horizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth
})`);
await screenshot("/tmp/queue-arcade-mobile.png");

await navigate(`${appUrl}/calibration`);
await waitFor(`document.querySelectorAll('[data-testid="calibration-row"]').length > 0`);
const calibration = await evaluate(`({
  rows: document.querySelectorAll('[data-testid="calibration-row"]').length,
  horizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth
})`);
await screenshot("/tmp/queue-arcade-calibration-mobile.png");

socket.close();

const failures = [];
const sameBounds =
  revealBoundsBeforeReport &&
  reveal.reportBounds &&
  Object.keys(revealBoundsBeforeReport).every(
    (key) => Math.abs(revealBoundsBeforeReport[key] - reveal.reportBounds[key]) <= 1,
  );
if (!lobby.title.includes("Queue Arcade") || !lobby.heading?.includes("side quests")) {
  failures.push("Queue Arcade lobby metadata or heading is missing.");
}
if (
  lobby.startButtons !== 1 ||
  defaultVolume !== "10" ||
  migratedVolume !== "10" ||
  lobby.shareButtons !== 0 ||
  lobby.canonical !== `${new URL(appUrl).origin}/` ||
  !lobby.openGraphImage?.includes("opengraph-image") ||
  lobby.modeCards !== 0 ||
  lobby.roundFamilies !== 9 ||
  !lobby.roundMix?.includes("Classic Trivia") ||
  !lobby.copy?.toLowerCase().includes("twelve round formats") ||
  lobby.copy?.toLowerCase().includes("choose your side quest") ||
  !lobby.muted ||
  lobby.volume !== "70"
) {
  failures.push("The one-room lobby still exposes modes or lost its compact round mix.");
}
if (
  Math.abs(lobby.markCenter - lobby.copyCenter) > 0.5 ||
  lobby.horizontalOverflow ||
  lobby.steamButtons !== 1 ||
  !lobby.steamButton?.markPath?.startsWith("M11.979 0C5.678") ||
  lobby.steamButton?.label !== "Sign in with Steam" ||
  (lobby.steamButton?.width ?? 999) > 160 ||
  Math.abs((lobby.steamButton?.height ?? 0) - 38) > 0.5 ||
  Math.abs((lobby.accountSlot?.width ?? 0) - 180) > 0.5 ||
  Math.abs((lobby.accountSlot?.height ?? 0) - 52) > 0.5
) {
  failures.push("The desktop lobby alignment or overflow regressed.");
}
if (
  !profile.title.includes("Profile") ||
  !profile.heading?.includes("Keep your streak") ||
  profile.steamButtons !== 1 ||
  !profile.steamButton?.markPath?.startsWith("M11.979 0C5.678") ||
  profile.steamButton?.label !== "Sign in with Steam" ||
  (profile.steamButton?.width ?? 999) > 160 ||
  Math.abs((profile.steamButton?.height ?? 0) - 38) > 0.5 ||
  !profile.anonymousPlay ||
  profile.horizontalOverflow
) {
  failures.push("The optional guest profile entry point is incomplete or overflows.");
}
if (
  typeof lobby.brandLeft !== "number" ||
  typeof profile.brandLeft !== "number" ||
  Math.abs(lobby.brandLeft - profile.brandLeft) > 1 ||
  typeof lobby.headerLeft !== "number" ||
  typeof profile.headerLeft !== "number" ||
  Math.abs(lobby.headerLeft - profile.headerLeft) > 1
) {
  failures.push("The header shifts horizontally between the lobby and profile.");
}
if (
  profileChrome.homeTag !== "A" ||
  profileChrome.homeHref !== "/" ||
  profileChrome.privacyHref !== "/privacy" ||
  profileChrome.calibrationHref !== "/calibration" ||
  privacyFromProfile.url !== "/privacy" ||
  !privacyFromProfile.heading?.includes("without fog") ||
  privacyFromProfile.profileHref !== "/profile" ||
  profileFromPrivacy.url !== "/profile" ||
  !profileFromPrivacy.profile ||
  privacyHomeLanded.url !== "/" ||
  !privacyHomeLanded.lobby
) {
  failures.push("Profile and privacy no longer share home and footer navigation.");
}
if (
  profileRecordsShort.rows !== 9 ||
  profileRecordsShort.recentLog ||
  !profileRecordsShort.compareLabel ||
  !profileRecordsShort.firstClue ||
  !profileRecordsShort.laterClues ||
  !profileRecordsShort.played ||
  profileRecordsShort.classicYou !== "63" ||
  profileRecordsShort.classicRoom !== "" ||
  profileRecordsShort.spellEarly !== "2/3" ||
  profileRecordsShort.spellClues !== "2/3,1/1,1/1" ||
  profileRecordsShort.horizontalOverflow ||
  profileRecordsLong.rows !== 9 ||
  profileRecordsLong.recentLog ||
  profileRecordsLong.classicYou !== "63" ||
  profileRecordsLong.classicRoom !== "45" ||
  profileRecordsLong.foggedYou !== "" ||
  profileRecordsLong.horizontalOverflow ||
  !profileRecordsLong.preview?.prompt ||
  profileRecordsLong.preview?.answers ||
  !profileRecordsLong.preview?.fogPrompt ||
  profileRecordsLong.preview?.fogLookCue ||
  !profileRecordsLong.preview?.spellPrompt ||
  !profileRecordsLong.preview?.orderPrompt ||
  profileRecordsLong.preview?.orderCards ||
  !profileRecordsLong.preview?.aghanimPrompt ||
  !profileRecordsLong.preview?.aghanimArt ||
  !profileRecordsLong.preview?.shopHorizontal ||
  (profileRecordsLong.preview?.stageHeight ?? 0) < 120 ||
  (profileRecordsLong.preview?.stageHeight ?? 0) > 140 ||
  (profileRecordsLong.preview?.hoverShift ?? 9) > 1 ||
  (profileRecordsLong.preview?.neighborShift ?? 9) > 1
) {
  failures.push("Profile format mastery no longer compares you to the crowd without a recent-answer log.");
}
if (
  !privacy.title.includes("Privacy") ||
  !privacy.heading?.includes("without fog") ||
  !privacy.optionalSteam ||
  !privacy.deletion ||
  !privacy.diagnostics ||
  !privacy.alphaAnalytics ||
  !privacy.retiredSessionRating ||
  privacy.horizontalOverflow
) {
  failures.push("The account privacy and deletion explanation is incomplete or overflows.");
}
if (opsGuest.access !== "signed-out" || opsGuest.steamButtons !== 1 || opsGuest.horizontalOverflow) {
  failures.push("The private alpha dashboard does not present a safe guest gate.");
}
if (legacyLink.url !== "/" || legacyLink.modeCards !== 0 || legacyLink.startButtons !== 1) {
  failures.push("A legacy mode deep link did not return to the canonical public arcade.");
}
if (
  entryWait.phase !== "waiting" ||
  !entryWait.roomId?.endsWith(":public") ||
  entryWait.heading !== "Next round" ||
  !Number.isFinite(entryWait.countdown) ||
  entryWait.countdown < 1 ||
  entryWait.horizontalOverflow
) {
  failures.push("A late first entry no longer waits cleanly for the next synchronized round.");
}
if (
  answering.url !== "/play" ||
  answering.phase !== "answering" ||
  !answering.roomId?.endsWith(":public") ||
  ![
    "trivia",
    "shopkeeper",
    "spell-link",
    "fogged-vision",
    "echo-hunt",
    "soundcheck",
    "quote-hunt",
    "aghanim-lab",
    "order-up",
  ].includes(answering.game) ||
  (answering.openShop
    ? answering.answers !== 0 || answering.shopItems < 70 || answering.heroPicker
    : answering.heroPicker
      ? answering.answers !== 0 ||
        !answering.heroSearch ||
        answering.heroItems !== 127 ||
        JSON.stringify(answering.heroGroups) !==
          JSON.stringify([
            { attribute: "strength", count: 36 },
            { attribute: "agility", count: 35 },
            { attribute: "intelligence", count: 34 },
            { attribute: "universal", count: 22 },
          ])
      : answering.valueOrder
        ? answering.answers !== 0 || answering.valueOrderCards !== 4
        : answering.answers !== 4) ||
  answering.difficultyControls !== 0 ||
  answering.tipCards !== 0 ||
  answering.crowdSplitVisible ||
  answering.crowdCardVisible ||
  !answering.publicRoomVisible ||
  answering.roomPresenceVisible ||
  answering.roomElapsedVisible ||
  (answering.game === "shopkeeper" && Boolean(answering.promptContext)) ||
  (answering.game === "trivia" &&
    Boolean(
      answering.promptContext &&
        answering.promptText?.toLocaleLowerCase().includes(answering.promptContext.toLocaleLowerCase()),
    )) ||
  answering.timer < MIN_INITIAL_ANSWER_TIME_MS / 1_000 - 2 ||
  answering.horizontalOverflow ||
  (answering.openShop &&
    (!shopTooltip?.visible || !shopTooltip.stable || !shopTooltip.insideViewport || !shopSearchCleared))
) {
  failures.push("The synchronized public round is incomplete or still exposes a player queue choice.");
}
if (
  answering.heroPicker &&
  (!heroSearch || heroSearch.value !== "z" || heroSearch.matches < 1 || heroSearch.dimmed < 1 || !heroSearch.fixed)
) {
  failures.push("Type-to-search no longer dims heroes in place without rearranging the Dota grid.");
}
if (
  !reveal.result ||
  !reveal.crowdSplit.visible ||
  reveal.crowdSplit.rows < 1 ||
  reveal.crowdSplit.countTotal !== reveal.crowdSplit.total ||
  reveal.crowdSplit.correctRows !== 1 ||
  reveal.crowdSplit.selectedRows !== 1 ||
  (answering.openShop
    ? answering.recipeBuilder
      ? !reveal.openShopReveal || !reveal.recipeReveal || reveal.shopPercentages !== 0
      : !reveal.openShopReveal || reveal.shopPercentages < 1 || reveal.recipeReveal
    : answering.heroPicker
      ? reveal.heroPercentages < 1 || reveal.heroCorrect !== 1 || reveal.openShopReveal
      : answering.valueOrder
        ? reveal.orderSequences < 1 || reveal.orderValueLabels !== 4 || reveal.openShopReveal
        : reveal.percentages !== 4 || reveal.openShopReveal) ||
  reveal.reportReasons !== 4 ||
  reveal.audioPrewarmRequests < 1 ||
  !sameBounds ||
  reveal.nextButton ||
  reveal.internalSourceLabel
) {
  failures.push("The shared reveal or no-shift report menu regressed.");
}
if (
  autoAdvanced.phase !== "answering" ||
  autoAdvanced.roundId === answering.roundId ||
  autoAdvanced.roomId !== answering.roomId
) {
  failures.push("The public room did not advance automatically in place.");
}
if (
  !summary.heading ||
  !summary.scoreVisible ||
  !summary.playAgain ||
  !summary.backLabel ||
  summary.feedbackOptions !== 0 ||
  summary.shareActions !== 0
) {
  failures.push("The session report no longer completes the one-room journey.");
}
if (
  historyBack.url !== "/" ||
  !historyBack.lobby ||
  historyForward.url !== "/play" ||
  !historyForward.answering ||
  !historyForward.roomId?.endsWith(":public")
) {
  failures.push("Browser Back or Forward no longer moves between the lobby and live arcade URLs.");
}
if (directPlay.url !== "/play" || !directPlay.answering || !directPlay.roomId?.endsWith(":public")) {
  failures.push("Loading /play directly no longer joins the public arcade.");
}
for (const [label, result, expectedTotal] of [
  ["hero", heroCrowdStress, heroStressEntries.length],
  ["item", itemCrowdStress, itemStressEntries.length],
  ["order", orderCrowdStress, orderStressEntries.length],
]) {
  if (
    result.kind !== "open-grid" ||
    !result.hiddenBeforeReveal ||
    (label === "item" && !result.promptContextHiddenBeforeReveal) ||
    result.total !== expectedTotal ||
    result.rowCount !== 5 ||
    result.namedRows !== 4 ||
    result.countTotal !== expectedTotal ||
    result.otherCount !== expectedTotal - 4 ||
    result.otherPercentage !== Math.round(((expectedTotal - 4) / expectedTotal) * 100) ||
    result.correctRows !== 1 ||
    result.selectedRows !== 1 ||
    !result.labelsVisible ||
    !result.rowsInsideCard ||
    !result.scoreVisible ||
    !result.scoreInsideCard ||
    (result.cardHeight ?? Infinity) > 420 ||
    !result.cardInsideViewport ||
    result.clipped ||
    result.horizontalOverflow ||
    result.catalogResults !== result.catalogVisible ||
    (label === "order" &&
      (result.orderSequences !== 2 ||
        result.orderValueLabels !== 4 ||
        result.explanationVisible ||
        !result.orderAutoSubmit?.locked ||
        result.orderAutoSubmit.requests !== 1 ||
        !result.orderAutoSubmit.hasSubmittedKey ||
        !result.orderAutoSubmit.lockButtonAbsent))
  ) {
    failures.push(`The all-${label} crowd result is unbounded, clipped, incomplete, or leaked before reveal.`);
  }
}
if (
  classicChromeStress.promptContextVisible ||
  classicChromeStress.crowdCardVisible ||
  classicChromeStress.roomCardVisible
) {
  failures.push("Classic Trivia restored redundant prompt or live-room chrome during the answering phase.");
}
if (
  !spellLayoutStress.visible ||
  !spellLayoutStress.fullyVisible ||
  spellLayoutStress.bottomInset < 5 ||
  spellLayoutStress.pickerGap < 6 ||
  spellLayoutStress.horizontalOverflow
) {
  failures.push("The Spell Link clues are clipped or crowded by the hero picker.");
}
if (
  aghanimLayoutStress.clueCards !== 3 ||
  !aghanimLayoutStress.firstClueVisible ||
  !aghanimLayoutStress.laterCluesLocked ||
  !aghanimLayoutStress.artworkVisible ||
  aghanimLayoutStress.heroItems !== 127 ||
  aghanimLayoutStress.pickerGap < 0 ||
  !aghanimLayoutStress.promptInsideViewport ||
  aghanimLayoutStress.horizontalOverflow
) {
  failures.push("Aghanim's Lab is missing a staged clue, hero, or stable desktop layout.");
}
if (
  !mobile.headingVisible ||
  !mobile.startButton ||
  mobile.roundFamilies !== 9 ||
  mobile.steamButtons !== 1 ||
  Math.abs((mobile.accountSlotWidth ?? 0) - (mobile.startButtonWidth ?? 0)) > 1 ||
  mobile.horizontalOverflow
) {
  failures.push("The mobile public lobby does not fit or lost its round mix.");
}
if (calibration.rows < 1 || calibration.horizontalOverflow) {
  failures.push("The mobile calibration lab is empty or overflows.");
}
if (browserErrors.length) failures.push(`Browser errors: ${browserErrors.join("; ")}`);

if (failures.length) {
  console.error(
    JSON.stringify(
      {
        lobby,
        profile,
        profileChrome,
        privacyFromProfile,
        profileFromPrivacy,
        privacyHomeLanded,
        profileRecordsShort,
        profileRecordsLong,
        privacy,
        opsGuest,
        legacyLink,
        entryWait,
        answering,
        shopTooltip,
        heroSearch,
        reveal,
        autoAdvanced,
        summary,
        historyBack,
        historyForward,
        directPlay,
        heroCrowdStress,
        itemCrowdStress,
        orderCrowdStress,
        spellLayoutStress,
        aghanimLayoutStress,
        classicChromeStress,
        mobile,
        calibration,
      },
      null,
      2,
    ),
  );
  throw new Error(failures.join("\n"));
}

console.log(
  JSON.stringify(
    {
      onePublicRoom: true,
      legacyModeRedirect: true,
      roundFamilies: lobby.roundFamilies,
      synchronizedReveal: true,
      fairFirstEntry: true,
      stableShopTooltip: answering.openShop ? shopTooltip?.stable : "not-current-round",
      automaticAdvance: true,
      browserHistory: [historyBack.url, historyForward.url],
      directPlay: directPlay.url,
      fullCatalogCrowdSplits: {
        heroes: `${heroCrowdStress.namedRows} named + Other (${heroCrowdStress.total} votes)`,
        items: `${itemCrowdStress.namedRows} named + Other (${itemCrowdStress.total} votes)`,
        orders: `${orderCrowdStress.namedRows} named + Other (${orderCrowdStress.total} votes)`,
      },
      spellLinkClueClearance: `${Math.round(spellLayoutStress.pickerGap)}px`,
      aghanimLabLayout: "3 staged clues + 127-hero picker",
      mediaPlaybackDisabled: true,
      optionalSteamProfile: true,
      privacyControls: true,
      sharePreview: true,
      freshVolume: `${defaultVolume}%`,
      migratedOldDefault: `${migratedVolume}%`,
      leanSessionSummary: true,
      privateOpsGate: true,
      mobileFits: true,
      screenshots: [
        "/tmp/queue-arcade-lobby.png",
        "/tmp/queue-arcade-profile-guest.png",
        "/tmp/queue-arcade-profile-records-short.png",
        "/tmp/queue-arcade-profile-records-long.png",
        "/tmp/queue-arcade-privacy.png",
        "/tmp/queue-arcade-ops-guest.png",
        "/tmp/queue-arcade-entry-wait.png",
        "/tmp/queue-arcade-public-round.png",
        "/tmp/queue-arcade-public-reveal.png",
        "/tmp/queue-arcade-summary.png",
        "/tmp/queue-arcade-crowd-heroes.png",
        "/tmp/queue-arcade-crowd-items.png",
        "/tmp/queue-arcade-crowd-orders.png",
        "/tmp/queue-arcade-spell-layout.png",
        "/tmp/queue-arcade-aghanim-layout.png",
        "/tmp/queue-arcade-mobile.png",
        "/tmp/queue-arcade-calibration-mobile.png",
      ],
    },
    null,
    2,
  ),
);

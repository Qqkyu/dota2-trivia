#!/usr/bin/env node

import { writeFile } from "node:fs/promises";

const debuggingUrl = process.env.CHROME_DEBUG_URL ?? "http://127.0.0.1:9222";
const appUrl = process.env.APP_URL ?? "http://localhost:3000";

const newestHeroes = {
  family: "order",
  cards: [
    {
      key: "kez",
      name: "Kez",
      context: "Katana",
      image: "https://cdn.cloudflare.steamstatic.com/apps/dota2/images/dota_react/heroes/kez.png",
    },
    {
      key: "largo",
      name: "Largo",
      context: "Bard",
      image: "https://cdn.cloudflare.steamstatic.com/apps/dota2/images/dota_react/heroes/largo.png",
    },
    {
      key: "muerta",
      name: "Muerta",
      context: "The Veil",
      image: "https://cdn.cloudflare.steamstatic.com/apps/dota2/images/dota_react/heroes/muerta.png",
    },
    {
      key: "ringmaster",
      name: "Ringmaster",
      context: "Circus",
      image: "https://cdn.cloudflare.steamstatic.com/apps/dota2/images/dota_react/heroes/ringmaster.png",
    },
  ],
};

const fixtures = {
  order: {
    game: "flashback",
    question: {
      kind: "flashback-choice",
      category: "History",
      eyebrow: "The newest four",
      prompt: "Put these heroes in the order they were added.",
      answers: ["", "", "", ""],
      answerMode: "flashback-order",
      flashback: newestHeroes,
      image: {
        src: "https://cdn.steamstatic.com/apps/dota2/images/dota_react/global/dota2_logo_symbol.png",
        alt: "Dota 2",
        kind: "item",
      },
    },
    reveal: {
      correctIndex: 0,
      correctAnswerKey: "order-v1:muerta,ringmaster,kez,largo",
      explanation: "Muerta, Ringmaster, Kez, then Largo.",
      orderValues: newestHeroes.cards.map((card) => ({ key: card.key, label: card.context })),
    },
  },
  year: {
    game: "flashback",
    question: {
      kind: "flashback-choice",
      category: "History",
      eyebrow: "The year",
      prompt: "What year did The International first run?",
      answers: ["", "", "", ""],
      answerMode: "flashback-year",
      flashback: { family: "year", yearMin: 2009, yearMax: new Date().getFullYear() },
      image: { src: "/arcade/flashback/ti1-gamescom.jpg", alt: "The International at Gamescom", kind: "hero" },
    },
    reveal: {
      correctIndex: 1,
      correctAnswerKey: "year-v1:2011",
      explanation: "TI1 was at Gamescom in 2011.",
    },
  },
  photo: {
    game: "flashback",
    question: {
      kind: "flashback-choice",
      category: "Esports",
      eyebrow: "KeyArena 2017",
      prompt: "Who won The International 2017 at KeyArena?",
      answers: ["Newbee", "Team Liquid", "LGD Gaming", "Virtus.pro"],
      flashback: { family: "choice" },
      image: { src: "/arcade/flashback/ti5-keyarena.jpg", alt: "The International at KeyArena", kind: "hero" },
    },
    reveal: {
      correctIndex: 1,
      explanation: "Liquid swept Newbee 3-0.",
      media: {
        src: "/arcade/flashback/winners/ti7-liquid.jpg",
        alt: "Team Liquid lift the Aegis",
        caption: "Team Liquid · TI7",
        kind: "photo",
      },
    },
  },
};

const targets = await fetch(`${debuggingUrl}/json/list`).then((response) => response.json());
const target = targets.find((entry) => entry.type === "page");
if (!target?.webSocketDebuggerUrl) throw new Error("No Chrome page.");

const socket = new WebSocket(target.webSocketDebuggerUrl);
const pending = new Map();
const eventWaiters = new Map();
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

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function waitFor(expression, timeout = 20_000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeout) {
    if (await evaluate(expression)) return;
    await delay(200);
  }
  throw new Error(`Timed out waiting for: ${expression}`);
}

async function screenshot(path) {
  const result = await send("Page.captureScreenshot", {
    format: "png",
    fromSurface: true,
    captureBeyondViewport: false,
  });
  await writeFile(path, Buffer.from(result.data, "base64"));
}

await send("Page.enable");
await send("Runtime.enable");
await send("Emulation.setDeviceMetricsOverride", {
  width: 1440,
  height: 1000,
  deviceScaleFactor: 1,
  mobile: false,
});

const loaded = once("Page.loadEventFired");
await send("Page.addScriptToEvaluateOnNewDocument", {
  source: `(() => {
    const fixtures = ${JSON.stringify(fixtures)};
    const originalFetch = window.fetch.bind(window);
    window.__flashbackVisual = null;
    Object.defineProperty(HTMLMediaElement.prototype, "play", {
      configurable: true,
      value() { return Promise.resolve(); }
    });
    window.fetch = async (...args) => {
      const response = await originalFetch(...args);
      const state = window.__flashbackVisual;
      const input = args[0];
      const requestUrl = typeof input === "string" || input instanceof URL ? String(input) : input?.url;
      const requestPath = requestUrl ? new URL(requestUrl, location.href).pathname : "";
      if (!state || requestPath !== "/api/rounds") return response;
      const fixture = fixtures[state.kind];
      if (!fixture) return response;
      const payload = await response.clone().json();
      if (!payload?.round || !payload?.room) return response;
      const now = Date.now();
      const reveal = state.phase === "reveal";
      payload.serverNow = now;
      payload.round = {
        ...payload.round,
        id: "visual-flashback-" + state.kind + (reveal ? "-reveal" : ""),
        phase: reveal ? "reveal" : "answering",
        game: "flashback",
        startedAt: now - 3_000,
        answerDeadline: reveal ? now - 1_000 : now + 12_000,
        revealDeadline: now + 6_000,
        answerDuration: 15_000
      };
      payload.questionRevision = "visual-flashback-" + state.kind + ":" + state.phase + ":" + now;
      payload.question = {
        id: "visual-flashback-" + state.kind + (reveal ? "-reveal" : ""),
        game: "flashback",
        difficulty: 2,
        clueStage: 1,
        ...fixture.question,
        reveal: reveal ? fixture.reveal : null
      };
      payload.presence = { activePlayers: 4 };
      payload.crowd = {
        counts: reveal ? [0, 3, 1, 0] : [0, 0, 0, 0],
        total: 4,
        positions: [],
        keyCounts: [],
        scoreSummary: reveal ? { correctCount: 3, average: 140, best: 180, playerPoints: 160 } : null
      };
      payload.playerVote = state.kind === "order"
        ? (reveal || state.locked
          ? { answerIndex: 0, answerKey: "order-v1:kez,largo,muerta,ringmaster", submittedAt: now - 1_000 }
          : null)
        : state.kind === "year"
          ? (reveal || state.locked
            ? { answerIndex: 1, answerKey: "year-v1:2011", submittedAt: now - 1_000 }
            : null)
          : { answerIndex: 1, submittedAt: now - 1_000 };
      payload.playerReport = null;
      return new Response(JSON.stringify(payload), {
        status: 200,
        headers: { "Content-Type": "application/json", "Cache-Control": "no-store" }
      });
    };
  })()`,
});
await send("Page.navigate", { url: `${appUrl}/play` });
await loaded;
await waitFor(`document.querySelector("main")?.dataset.clientReady === "true"`, 20_000);
const startButton = await evaluate(`Boolean(document.querySelector('[data-testid="start-arcade"]'))`);
if (startButton) {
  await evaluate(`document.querySelector('[data-testid="start-arcade"]')?.click()`);
}
await waitFor(
  `location.pathname === "/play" && (document.querySelector("main")?.dataset.phase === "answering" || document.querySelector("main")?.dataset.phase === "reveal")`,
  40_000,
);
await delay(300);

async function apply(kind, phase, extra = {}) {
  await evaluate(`(() => {
    window.__flashbackVisual = ${JSON.stringify({ kind, phase, ...extra })};
    window.dispatchEvent(new Event("focus"));
    return true;
  })()`);
  await delay(200);
  await evaluate(`window.dispatchEvent(new Event("focus")); true`);
}

await apply("order", "answering");
await waitFor(
  `document.querySelector("main")?.dataset.roundId === "visual-flashback-order" && document.querySelectorAll('[data-testid="flashback-order-card"]').length === 4`,
);
const orderBefore = await evaluate(`(() => {
  const cards = [...document.querySelectorAll('[data-testid="flashback-order-card"]')].map((card) => {
    const box = card.getBoundingClientRect();
    const name = card.querySelector("strong");
    const context = card.querySelector("small");
    const art = card.querySelector("img");
    const nameBox = name?.getBoundingClientRect();
    const contextBox = context?.getBoundingClientRect();
    const artBox = art?.getBoundingClientRect();
    const nameStyle = name ? getComputedStyle(name) : null;
    return {
      text: name?.textContent ?? "",
      context: context?.textContent ?? "",
      font: nameStyle?.fontFamily ?? "",
      fontSize: nameStyle ? Number.parseFloat(nameStyle.fontSize) : 0,
      x: Math.round(box.x),
      y: Math.round(box.y),
      w: Math.round(box.width),
      h: Math.round(box.height),
      artW: Math.round(artBox?.width ?? 0),
      artH: Math.round(artBox?.height ?? 0),
      nameBottom: Math.round(nameBox?.bottom ?? 0),
      contextTop: Math.round(contextBox?.top ?? 0),
      nameOverlapsArt: Boolean(
        nameBox && artBox && nameBox.top < artBox.bottom - 4 && nameBox.bottom > artBox.top + 4,
      ),
    };
  });
  return {
    cards,
    extraMarks: document.querySelectorAll('[data-testid="flashback-order-card"] em').length,
    overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
  };
})()`);
await screenshot("/tmp/flashback-order-answering.png");

await evaluate(`document.querySelectorAll('[data-testid="flashback-order-card"]')[0]?.click()`);
await waitFor(`document.querySelectorAll('[data-testid="flashback-order-card"][data-selected="true"]').length === 1`);
const orderAfterPick = await evaluate(`(() => {
  const cards = [...document.querySelectorAll('[data-testid="flashback-order-card"]')].map((card) => {
    const box = card.getBoundingClientRect();
    return { x: Math.round(box.x), y: Math.round(box.y), w: Math.round(box.width), h: Math.round(box.height) };
  });
  return cards;
})()`);
await screenshot("/tmp/flashback-order-picked.png");

await apply("order", "reveal", { locked: true });
await waitFor(
  `document.querySelector("main")?.dataset.phase === "reveal" && Boolean(document.querySelector('[data-testid="flashback-order-sequence"]'))`,
);
const orderReveal = await evaluate(`(() => {
  const rows = [...document.querySelectorAll('[data-testid="flashback-order-sequence"] li')].map((row) => {
    const name = row.querySelector("strong");
    const context = row.querySelector("small");
    const index = row.querySelector("i");
    const nameBox = name?.getBoundingClientRect();
    const contextBox = context?.getBoundingClientRect();
    const indexBox = index?.getBoundingClientRect();
    return {
      name: name?.textContent ?? "",
      context: context?.textContent ?? "",
      clipped: Boolean(name && name.scrollWidth > name.clientWidth + 1),
      contextUnderIndex: Boolean(
        contextBox && indexBox && contextBox.top > indexBox.bottom - 2 && contextBox.left < indexBox.right,
      ),
      fontSize: name ? Number.parseFloat(getComputedStyle(name).fontSize) : 0,
    };
  });
  const yours = [...document.querySelectorAll('[data-testid="flashback-order-board"] [data-yours="true"] strong')].map(
    (node) => node.textContent,
  );
  const stage = document.querySelector('[class*="gameStage"]') ?? document.querySelector("main");
  const panel = document.querySelector('[data-testid="reveal-panel"]');
  const stageBox = stage?.getBoundingClientRect();
  const panelBox = panel?.getBoundingClientRect();
  return {
    rows,
    yours,
    panelVisible: Boolean(
      panelBox && stageBox && panelBox.bottom <= stageBox.bottom + 1 && panelBox.top >= stageBox.top - 1,
    ),
  };
})()`);
await screenshot("/tmp/flashback-order-reveal.png");

await apply("year", "answering");
await waitFor(
  `document.querySelector("main")?.dataset.roundId === "visual-flashback-year" && Boolean(document.querySelector('[data-testid="flashback-year-slider"]'))`,
);
const yearBefore = await evaluate(`(() => {
  const slider = document.querySelector('[data-testid="flashback-year-slider"]');
  const board = document.querySelector('[data-testid="flashback-year-board"]');
  const box = board?.getBoundingClientRect();
  return {
    min: slider?.min,
    max: slider?.max,
    currentYear: String(new Date().getFullYear()),
    height: Math.round(box?.height ?? 0),
    answers: document.querySelectorAll('[data-testid="arcade-answer"]').length,
    ticks: document.querySelectorAll('[data-testid="flashback-year-tick"]').length,
    helper: document.body.innerText.includes("Set the year, then Lock"),
    lock: Boolean(document.querySelector('[data-testid="flashback-year-lock"]')),
  };
})()`);
await evaluate(`(() => {
  const slider = document.querySelector('[data-testid="flashback-year-slider"]');
  if (!slider) return false;
  slider.value = "2011";
  slider.dispatchEvent(new Event("input", { bubbles: true }));
  return true;
})()`);
const yearAfterSlide = await evaluate(`({
  locked: document.querySelector('[data-testid="flashback-year-board"]')?.dataset.locked,
  readout: document.querySelector('[data-testid="flashback-year-readout"]')?.textContent,
})`);
await evaluate(`(() => {
  document.querySelector('[data-testid="flashback-year-lock"]')?.click();
  if (window.__flashbackVisual) window.__flashbackVisual.locked = true;
  window.dispatchEvent(new Event("focus"));
  return true;
})()`);
await waitFor(`document.querySelector('[data-testid="flashback-year-board"]')?.dataset.locked === "true"`);
const yearAfterPick = await evaluate(`(() => {
  const board = document.querySelector('[data-testid="flashback-year-board"]');
  const slider = document.querySelector('[data-testid="flashback-year-slider"]');
  return {
    locked: board?.dataset.locked,
    readout: document.querySelector('[data-testid="flashback-year-readout"]')?.textContent,
    value: slider?.value,
    height: Math.round(board?.getBoundingClientRect().height ?? 0),
  };
})()`);
await screenshot("/tmp/flashback-year-answering.png");

await apply("year", "reveal");
await waitFor(
  `document.querySelector("main")?.dataset.phase === "reveal" && document.querySelector('[data-testid="flashback-year-board"]')?.dataset.correctYear === "2011"`,
);
const yearReveal = await evaluate(`(() => {
  const board = document.querySelector('[data-testid="flashback-year-board"]');
  return {
    readout: document.querySelector('[data-testid="flashback-year-readout"]')?.textContent,
    correctYear: board?.dataset.correctYear,
    height: Math.round(board?.getBoundingClientRect().height ?? 0),
    panelVisible: Boolean(document.querySelector('[data-testid="reveal-panel"]')),
  };
})()`);
await screenshot("/tmp/flashback-year-reveal.png");

await apply("photo", "answering");
await waitFor(
  `document.querySelector("main")?.dataset.roundId === "visual-flashback-photo" && document.querySelector("main")?.dataset.phase === "answering"`,
);
const photoAnswering = await evaluate(`({
  strip: Boolean(document.querySelector('[data-testid="flashback-reveal-media"]')),
  leak: document.body.innerHTML.includes("ti7-liquid"),
  art: document.querySelector('[data-testid="question-artwork"] img')?.currentSrc ?? "",
})`);
await screenshot("/tmp/flashback-photo-answering.png");

const artBefore = await evaluate(`(() => {
  const art = document.querySelector('[data-testid="question-artwork"]');
  const box = art?.getBoundingClientRect();
  return { w: Math.round(box?.width ?? 0), h: Math.round(box?.height ?? 0), x: Math.round(box?.x ?? 0), y: Math.round(box?.y ?? 0) };
})()`);

await apply("photo", "reveal");
await waitFor(
  `document.querySelector("main")?.dataset.phase === "reveal" && document.querySelector('[data-testid="round-prompt"]')?.dataset.revealPhoto === "true"`,
);
await delay(400);
const photoReveal = await evaluate(`(() => {
  const art = document.querySelector('[data-testid="question-artwork"]');
  const img = art?.querySelector("img");
  const box = art?.getBoundingClientRect();
  return {
    strip: Boolean(document.querySelector('[data-testid="flashback-reveal-media"]')),
    src: img?.currentSrc || img?.src || "",
    alt: img?.alt || "",
    w: Math.round(box?.width ?? 0),
    h: Math.round(box?.height ?? 0),
    x: Math.round(box?.x ?? 0),
    y: Math.round(box?.y ?? 0),
  };
})()`);
await screenshot("/tmp/flashback-photo-reveal.png");

await send("Emulation.setDeviceMetricsOverride", {
  width: 390,
  height: 844,
  deviceScaleFactor: 1,
  mobile: true,
});
await delay(300);
const photoMobile = await evaluate(`(() => {
  const art = document.querySelector('[data-testid="question-artwork"]');
  const box = art?.getBoundingClientRect();
  return {
    w: Math.round(box?.width ?? 0),
    h: Math.round(box?.height ?? 0),
    overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
  };
})()`);
await screenshot("/tmp/flashback-photo-reveal-mobile.png");

const failures = [];
if (orderBefore.cards.length !== 4) failures.push("missing order cards");
if (orderBefore.extraMarks > 0) failures.push("order cards still print a second index");
if (orderBefore.overflow) failures.push("order answering overflows");
for (const card of orderBefore.cards) {
  if (card.h !== 132) failures.push(`${card.text} height ${card.h}`);
  if (card.artW < 70 || card.artH < 70) failures.push(`${card.text} art ${card.artW}x${card.artH}`);
  if (card.fontSize < 13 || card.fontSize > 16) failures.push(`${card.text} font ${card.fontSize}`);
  if (card.nameOverlapsArt) failures.push(`${card.text} name overlaps art`);
  if (card.context && card.contextTop < card.nameBottom) failures.push(`${card.text} context overlaps name`);
  if (!card.font.toLowerCase().includes("geist")) failures.push(`${card.text} font ${card.font}`);
}
if (
  orderAfterPick.some(
    (card, index) =>
      card.x !== orderBefore.cards[index].x ||
      card.y !== orderBefore.cards[index].y ||
      card.w !== orderBefore.cards[index].w ||
      card.h !== orderBefore.cards[index].h,
  )
) {
  failures.push("order cards jumped after pick");
}
if (JSON.stringify(orderReveal.rows.map((row) => row.name)) !== JSON.stringify(["Muerta", "Ringmaster", "Kez", "Largo"])) {
  failures.push(`order reveal names ${orderReveal.rows.map((row) => row.name).join(",")}`);
}
if (orderReveal.rows.some((row) => row.clipped || row.contextUnderIndex || row.fontSize < 13)) {
  failures.push("order reveal names are clipped or stacked under the index");
}
if (orderReveal.yours.some((name) => name.includes("…") || name.endsWith("..."))) {
  failures.push(`order yours names clipped ${orderReveal.yours.join(",")}`);
}
if (orderReveal.panelVisible === false) failures.push("order reveal result bar is clipped");
if (yearBefore.min !== "2009" || yearBefore.max !== yearBefore.currentYear || yearBefore.ticks !== 0) {
  failures.push(`year slider ${yearBefore.min}-${yearBefore.max} ticks ${yearBefore.ticks}`);
}
if (yearBefore.answers !== 0 || !yearBefore.helper || !yearBefore.lock) {
  failures.push("year slider still uses A-D answers");
}
if (yearBefore.height < 186) failures.push(`year board short ${yearBefore.height}`);
if (yearAfterSlide.locked === "true") failures.push("year slider locked as soon as the thumb moved");
if (yearAfterPick.locked !== "true" || yearAfterPick.readout !== "2011" || yearAfterPick.value !== "2011") {
  failures.push(`year pick ${yearAfterPick.readout} locked ${yearAfterPick.locked}`);
}
if (yearAfterPick.height !== yearBefore.height) failures.push("year board jumped after pick");
if (yearReveal.correctYear !== "2011" || yearReveal.readout !== "2011" || !yearReveal.panelVisible) {
  failures.push("year reveal did not keep 2011");
}
if (photoAnswering.strip || photoAnswering.leak) failures.push("winner photo leaked while answering");
if (photoReveal.strip) failures.push("winner photo still uses the small strip");
if (!photoReveal.src.includes("ti7-liquid") || !photoReveal.alt.includes("Team Liquid")) {
  failures.push("winner photo did not fill the question art");
}
if (
  photoReveal.w !== artBefore.w ||
  photoReveal.h !== artBefore.h ||
  photoReveal.x !== artBefore.x ||
  photoReveal.y !== artBefore.y
) {
  failures.push("question art moved when the winner photo appeared");
}
if (photoReveal.w !== 248 || photoReveal.h !== 148) failures.push(`photo art ${photoReveal.w}x${photoReveal.h}`);
if (photoMobile.overflow) failures.push("mobile photo overflow");

console.log(
  JSON.stringify(
    { orderBefore, orderAfterPick, orderReveal, yearBefore, yearAfterSlide, yearAfterPick, yearReveal, photoAnswering, artBefore, photoReveal, photoMobile, failures },
    null,
    2,
  ),
);
if (failures.length) process.exit(1);
socket.close();

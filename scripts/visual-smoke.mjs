#!/usr/bin/env node

import { writeFile } from "node:fs/promises";
import { MIN_INITIAL_ANSWER_TIME_MS } from "../src/lib/arcade-entry.mjs";

const debuggingUrl = process.env.CHROME_DEBUG_URL ?? "http://127.0.0.1:9222";
const appUrl = process.env.APP_URL ?? process.env.ARCADE_APP_URL ?? "http://localhost:3000";
const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
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
    Object.defineProperty(HTMLMediaElement.prototype, "play", {
      configurable: true,
      value() { return Promise.resolve(); }
    });
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
  horizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth
})`);
await screenshot("/tmp/queue-arcade-profile-guest.png");

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
  heroSearch: Boolean(document.querySelector('[data-testid="hero-search"]')),
  heroItems: document.querySelectorAll('[data-testid="hero-picker-hero"]').length,
  heroGroups: [...document.querySelectorAll('[data-testid="hero-picker"] [data-attribute]')].map((group) => ({
    attribute: group.dataset.attribute,
    count: Number(group.dataset.heroCount)
  })),
  difficultyControls: document.querySelectorAll('[data-skill-level], [aria-label="Challenge level"]').length,
  tipCards: document.querySelectorAll('[class*="tipCard"]').length,
  publicRoomVisible: Boolean(document.querySelector('[data-testid="public-room"]')),
  presence: document.querySelector('[data-testid="room-presence"]')?.innerText,
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
  await evaluate(`(
    document.querySelector('[data-testid="hero-picker-hero"]') ??
    document.querySelector('[data-testid="arcade-answer"]')
  )?.click()`);
}
await waitFor(`Boolean(
  document.querySelector('[data-testid="shopkeeper-store"][data-locked="true"]') ??
  document.querySelector('[data-testid="hero-picker-hero"][aria-pressed="true"]') ??
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
    result: [...document.querySelectorAll("span")].find((entry) =>
      ["Correct", "Not quite", "Time expired"].includes(entry.textContent.trim())
    )?.textContent,
    percentages: [...document.querySelectorAll('[data-testid="arcade-answer"]')]
      .filter((button) => /%/.test(button.innerText)).length,
    shopPercentages: [...document.querySelectorAll('[data-testid="shopkeeper-store-item"]')]
      .filter((button) => /%/.test(button.innerText)).length,
    heroPercentages: [...document.querySelectorAll('[data-testid="hero-picker-hero"]')]
      .filter((button) => /%/.test(button.innerText)).length,
    heroCorrect: document.querySelectorAll('[data-testid="hero-picker-hero"][data-state="correct"]').length,
    heroCrowd: Boolean(document.querySelector('[data-testid="hero-crowd-picks"]')),
    recipeCrowd: Boolean(document.querySelector('[data-testid="shopkeeper-recipe-crowd-picks"]')),
    recipeReveal: Boolean(document.querySelector('[data-testid="shopkeeper-recipe-reveal-tray"]')),
    openShopReveal: Boolean(document.querySelector('[data-testid="shopkeeper-open-reveal"]')),
    reportReasons: document.querySelectorAll('[data-testid="report-reason"]').length,
    reportBounds: bounds ? { x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height } : null,
    nextButton: [...document.querySelectorAll("button")].some((button) => button.textContent.includes("Next round")),
    internalSourceLabel: document.body.innerText.includes("OpenDota constants")
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
  scoreVisible: document.body.textContent?.includes("Final score"),
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
  lobby.roundFamilies !== 7 ||
  !lobby.roundMix?.includes("Classic Trivia") ||
  !lobby.copy?.toLowerCase().includes("ten round formats") ||
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
  !["trivia", "shopkeeper", "spell-link", "fogged-vision", "echo-hunt", "soundcheck", "quote-hunt"].includes(
    answering.game,
  ) ||
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
      : answering.answers !== 4) ||
  answering.difficultyControls !== 0 ||
  answering.tipCards !== 0 ||
  !answering.publicRoomVisible ||
  !/player/.test(answering.presence ?? "") ||
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
  (answering.openShop
    ? answering.recipeBuilder
      ? !reveal.openShopReveal || !reveal.recipeReveal || !reveal.recipeCrowd || reveal.shopPercentages !== 0
      : !reveal.openShopReveal || reveal.shopPercentages < 1 || reveal.recipeReveal || reveal.recipeCrowd
    : answering.heroPicker
      ? reveal.heroPercentages < 1 || reveal.heroCorrect !== 1 || !reveal.heroCrowd || reveal.openShopReveal
      : reveal.percentages !== 4 || reveal.openShopReveal) ||
  reveal.reportReasons !== 4 ||
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
if (
  !mobile.headingVisible ||
  !mobile.startButton ||
  mobile.roundFamilies !== 7 ||
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
        "/tmp/queue-arcade-privacy.png",
        "/tmp/queue-arcade-ops-guest.png",
        "/tmp/queue-arcade-entry-wait.png",
        "/tmp/queue-arcade-public-round.png",
        "/tmp/queue-arcade-public-reveal.png",
        "/tmp/queue-arcade-summary.png",
        "/tmp/queue-arcade-mobile.png",
        "/tmp/queue-arcade-calibration-mobile.png",
      ],
    },
    null,
    2,
  ),
);

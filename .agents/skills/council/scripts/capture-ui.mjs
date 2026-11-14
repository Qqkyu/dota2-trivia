import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { publicQuestionForRound } from "../../../../src/lib/public-question.mjs";

const require = createRequire(path.join(process.cwd(), "package.json"));
const { chromium } = require("playwright");
const ts = require("typescript");
// Run the app's actual locale overlay without duplicating its translation rules.
const localeModule = { exports: {} };
const russianQuestions = JSON.parse(await readFile("src/data/i18n/questions.ru.json", "utf8"));
const localeCode = ts.transpileModule(await readFile("src/lib/question-locale.ts", "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, esModuleInterop: true },
}).outputText;
new Function("require", "module", "exports", localeCode)(
  (specifier) => {
    if (specifier === "@/data/i18n/questions.ru.json") return russianQuestions;
    throw new Error(`Unexpected locale-helper import: ${specifier}`);
  },
  localeModule,
  localeModule.exports,
);
const { localizeQuestion } = localeModule.exports;
const app = process.env.APP_URL ?? "http://127.0.0.1:3120";
const output = process.env.COUNCIL_SHOTS;
if (!output) throw new Error("Set COUNCIL_SHOTS to a task-local evidence directory.");
await mkdir(output, { recursive: true });
const load = async (name) => JSON.parse(await readFile(`src/data/${name}.json`, "utf8"));
const [general, shop, aghanim, sound, order, flash] = await Promise.all(
  [
    "questions.generated",
    "shopkeeper-questions",
    "aghanim-questions",
    "soundcheck-questions",
    "value-order-questions",
    "flashback-questions",
  ].map(load),
);
const definitions = [
  ["classic", "trivia", general, "mana-cost"],
  ["shop", "shopkeeper", shop, "shopkeeper-build-result"],
  ["recipe", "shopkeeper", shop, "shopkeeper-real-recipe"],
  ["spell", "spell-link", general, "spell-owner"],
  ["fog", "fogged-vision", general, "fogged-hero"],
  ["echo", "echo-hunt", general, "hero-voice"],
  ["quote", "quote-hunt", general, "hero-quote"],
  ["aghanim", "aghanim-lab", aghanim, "aghanim-upgrade"],
  ["sound", "soundcheck", sound, "soundcheck-ability"],
  ["order", "order-up", order, "value-order-item"],
  ["flashback", "flashback", flash, "flashback-year"],
];
const fixtures = Object.fromEntries(
  definitions.map(([name, game, rows, kind]) => {
    const raw = rows.find((question) => question.kind === kind);
    if (!raw) throw new Error(`Missing fixture ${name}`);
    return [name, { raw, game }];
  }),
);
fixtures["spell-long"] = {
  raw: general
    .filter((question) => question.kind === "spell-owner")
    .sort((a, b) => (b.hint?.length ?? 0) - (a.hint?.length ?? 0))[0],
  game: "spell-link",
};
fixtures["aghanim-long"] = {
  raw: aghanim.toSorted((a, b) => (b.aghanim?.effect.length ?? 0) - (a.aghanim?.effect.length ?? 0))[0],
  game: "aghanim-lab",
};
const sizes = (process.env.COUNCIL_SIZES ?? "1440x900,1280x720,390x844")
  .split(",")
  .map((size) => size.split("x").map(Number));
const locales = (process.env.COUNCIL_LOCALES ?? "en,ru").split(",");
const chosen = process.env.COUNCIL_SCENES?.split(",");
const scenes = [
  { name: "home", route: "/" },
  { name: "party", route: "/party" },
  { name: "party-create", route: "/party", action: "create" },
  { name: "party-join", route: "/party", action: "join" },
  { name: "party-lobby", route: "/play?room=REVIEW", party: true },
  { name: "profile", route: "/profile" },
  { name: "privacy", route: "/privacy" },
  { name: "waiting", route: "/play", wait: true },
  { name: "waiting-offline", route: "/play", wait: true, offline: true },
  ...Object.keys(fixtures).map((kind) => ({ name: `${kind}-answering`, route: "/play", kind, phase: "answering" })),
  ...Object.keys(fixtures).map((kind) => ({
    name: `${kind}-reveal`,
    route: "/play",
    kind,
    phase: "reveal",
    outcome: "correct",
  })),
  { name: "classic-wrong", route: "/play", kind: "classic", phase: "reveal", outcome: "wrong" },
  { name: "classic-missed", route: "/play", kind: "classic", phase: "reveal", outcome: "missed" },
  { name: "fog-locked", route: "/play", kind: "fog", phase: "answering", outcome: "correct", locked: true },
];
const browser = await chromium.launch({
  executablePath: process.env.CHROME_BIN ?? "/usr/bin/google-chrome",
  headless: true,
});
const records = [];
const audioCache = new Map();
const artCache = new Map();
async function fulfill(route, payload) {
  try {
    return await route.fulfill(payload);
  } catch (error) {
    // Cancelled preloads are no longer needed by the rendered scene.
    if (/Route is already handled|Target.*closed|Request context disposed/i.test(error.message)) return;
    throw error;
  }
}
const response = (route, value, status = 200) =>
  fulfill(route, { status, contentType: "application/json", body: JSON.stringify(value) });

function snapshot(state, scene, locale) {
  const now = Date.now();
  const { raw: sourceQuestion, game } = fixtures[scene.kind ?? "classic"];
  const raw = localizeQuestion(sourceQuestion, locale);
  const gate = state.gate || scene.wait;
  state.gate = false;
  const id = gate ? "council-entry-gate" : `council-${scene.kind ?? "classic"}`;
  const phase = gate ? "reveal" : state.phase;
  const round = {
    id,
    number: 42,
    game,
    phase,
    startedAt: now - 1000,
    answerDeadline: phase === "reveal" ? now - 100 : now + 14000,
    revealDeadline: now + (scene.wait ? 10000 : gate ? 50 : phase === "reveal" ? 8000 : 22000),
    answerDuration: 15000,
  };
  const question = gate ? null : publicQuestionForRound(raw, round, now);
  // The mocked ID has no server media entry. Only review fixtures use raw art.
  if (question?.image?.src?.startsWith("/api/round-image")) question.image.src = raw.image.src;
  const reveal = publicQuestionForRound(raw, { ...round, phase: "reveal" }, now).reveal;
  const correctIndex = reveal.correctIndex ?? 0;
  const correctKey = reveal.correctAnswerKey;
  let wrongKey =
    game === "shopkeeper"
      ? correctKey === "blink"
        ? "boots"
        : "blink"
      : correctKey === "npc_dota_hero_axe"
        ? "npc_dota_hero_lina"
        : "npc_dota_hero_axe";
  if (correctKey?.startsWith("order-v1:"))
    wrongKey = "order-v1:" + correctKey.slice("order-v1:".length).split(",").reverse().join(",");
  if (correctKey?.startsWith("recipe-v1:")) {
    const parts = correctKey.slice("recipe-v1:".length).split("+");
    parts[0] = parts[0] === "boots" ? "blink" : "boots";
    wrongKey = "recipe-v1:" + parts.sort().join("+");
  }
  if (correctKey?.startsWith("year-v1:")) wrongKey = "year-v1:" + (Number(correctKey.slice("year-v1:".length)) + 1);
  const voted = Boolean(!gate && scene.outcome && scene.outcome !== "missed" && (phase === "reveal" || scene.locked));
  const playerVote = voted
    ? {
        answerIndex: scene.outcome === "wrong" ? (correctIndex + 1) % 4 : correctIndex,
        ...(correctKey ? { answerKey: scene.outcome === "wrong" ? wrongKey : correctKey } : {}),
        submittedAt: now - 2000,
      }
    : null;
  const counts = [0, 0, 0, 0];
  if (phase === "reveal" && !correctKey) {
    counts[correctIndex] = 3;
    counts[(correctIndex + 1) % 4] = 9;
  }
  return {
    serverNow: now,
    room: { id: "council-public", gameId: "dota2", contentVersion: "review-fixture", mode: "mixed", filter: "Mixed" },
    round,
    questionRevision: `${id}:${phase}`,
    question,
    presence: { activePlayers: 12 },
    crowd: {
      counts,
      total: phase === "reveal" ? 12 : 7,
      keyCounts:
        phase === "reveal" && correctKey
          ? [
              { answerKey: correctKey, count: 3 },
              { answerKey: wrongKey, count: 9 },
            ]
          : [],
      scoreSummary:
        phase === "reveal"
          ? {
              correctCount: 3,
              average: 340,
              best: 400,
              playerPoints: scene.outcome === "correct" ? 400 : scene.outcome === "wrong" ? 0 : null,
            }
          : null,
    },
    playerVote,
    playerReport: null,
    previousResults: [],
  };
}

async function capture(page, filename) {
  await page.evaluate(() => document.fonts.ready);
  await page.evaluate(() =>
    Promise.all(
      [...document.images].map((image) =>
        image.complete
          ? Promise.resolve()
          : new Promise((resolve) => {
              image.addEventListener("load", resolve, { once: true });
              image.addEventListener("error", resolve, { once: true });
              setTimeout(resolve, 5000);
            }),
      ),
    ),
  );
  await page.waitForTimeout(100);
  await page.screenshot({ path: path.join(output, filename), animations: "disabled" });
  const geometry = await page.evaluate(() => ({
    width: innerWidth,
    height: innerHeight,
    scrollWidth: document.documentElement.scrollWidth,
    scrollHeight: document.documentElement.scrollHeight,
    phase: document.querySelector("main")?.dataset.phase,
    brokenImages: [...document.images]
      .filter((image) => image.complete && !image.naturalWidth)
      .map((image) => image.alt),
  }));
  records.push({ filename, ...geometry });
  if (geometry.scrollHeight > geometry.height + 60) {
    await page.screenshot({
      path: path.join(output, filename.replace(".png", "-full.png")),
      fullPage: true,
      animations: "disabled",
    });
    await page.evaluate(() => scrollTo(0, document.documentElement.scrollHeight));
    await page.screenshot({ path: path.join(output, filename.replace(".png", "-end.png")), animations: "disabled" });
  }
}

try {
  for (const locale of locales)
    for (const [width, height] of sizes)
      for (const scene of scenes) {
        if (chosen && !chosen.includes(scene.name)) continue;
        const context = await browser.newContext({
          viewport: { width, height },
          locale: locale === "ru" ? "ru-RU" : "en-US",
          reducedMotion: "reduce",
        });
        const page = await context.newPage();
        const state = { phase: "answering", gate: Boolean(scene.kind), offline: false };
        await page.addInitScript(() =>
          localStorage.setItem("queue-arcade:settings:v4", JSON.stringify({ soundEnabled: false, gameVolume: 0.7 })),
        );
        await page.route("**/api/**", async (route) => {
          const url = new URL(route.request().url());
          if (url.pathname.startsWith("/api/art/")) {
            // New isolated contexts do not share Chrome's normal image cache.
            if (!artCache.has(url.href)) {
              artCache.set(
                url.href,
                (async () => {
                  const fetched = await fetch(url.href, { signal: AbortSignal.timeout(20000) });
                  if (!fetched.ok) throw new Error(`Review artwork returned ${fetched.status}: ${url.pathname}`);
                  return {
                    status: 200,
                    contentType: fetched.headers.get("content-type"),
                    body: Buffer.from(await fetched.arrayBuffer()),
                  };
                })(),
              );
            }
            return fulfill(route, await artCache.get(url.href));
          }
          if (url.pathname === "/api/me") return response(route, { authenticated: false });
          if (url.pathname === "/api/rounds")
            return state.offline
              ? route.abort("internetdisconnected")
              : response(route, snapshot(state, scene, locale));
          if (url.pathname === "/api/presence") {
            const now = Date.now();
            return response(route, {
              activePlayers: 12,
              serverNow: now,
              round: {
                number: 42,
                game: "fogged-vision",
                phase: "answering",
                answerDeadline: now + 14000,
                revealDeadline: now + 22000,
                answerDuration: 15000,
                nextGame: "trivia",
              },
            });
          }
          if (url.pathname === "/api/private-rooms")
            return response(route, {
              waiting: true,
              countdownMs: 0,
              privateRoom: {
                code: "REVIEW",
                games: ["trivia", "fogged-vision", "shopkeeper"],
                formats: [],
                startedAt: null,
                isHost: true,
                players: ["You", "Ember", "Luna", "Puck", "Rubick", "Mirana"].map((name, index) => ({
                  name,
                  host: index === 0,
                  self: index === 0,
                  away: false,
                  score: 0,
                })),
                messages: [{ id: "hello", name: "Luna", text: "Ready when you are.", at: Date.now() }],
              },
              presence: { activePlayers: 6 },
            });
          if (url.pathname === "/api/round-audio") {
            const source = fixtures[scene.kind]?.raw.audio?.src;
            if (!source) return fulfill(route, { status: 204 });
            if (!audioCache.has(source)) {
              const upstream = await fetch(source, { signal: AbortSignal.timeout(15000) });
              if (!upstream.ok) throw new Error(`Review audio source returned ${upstream.status}`);
              audioCache.set(source, Buffer.from(await upstream.arrayBuffer()));
            }
            return fulfill(route, {
              status: 200,
              contentType: source.endsWith(".wav") ? "audio/wav" : "audio/mpeg",
              body: audioCache.get(source),
            });
          }
          return response(route, { ok: true });
        });
        try {
          await page.goto(app + scene.route, { waitUntil: "load", timeout: 45000 });
          await page.waitForSelector('main[data-client-ready="true"], main:not([data-client-ready])');
          if (scene.action) await page.locator(`[data-testid="private-room-choose-${scene.action}"]`).click();
          if (scene.party) await page.waitForSelector('[data-testid="private-room-wait"]');
          if (scene.wait) {
            await page.waitForSelector('main[data-phase="waiting"]');
            if (scene.offline) {
              state.offline = true;
              await page.evaluate(() => window.dispatchEvent(new Event("focus")));
              await page.waitForTimeout(4500);
            }
          }
          if (scene.kind) {
            await page.waitForSelector('main[data-phase="answering"]', { timeout: 20000 });
            if (scene.phase === "reveal") {
              state.phase = "reveal";
              await page.evaluate(() => window.dispatchEvent(new Event("focus")));
              await page.waitForSelector('main[data-phase="reveal"]', { timeout: 15000 });
              await page.waitForTimeout(6000);
            }
            if (["sound", "echo"].includes(scene.kind)) {
              await page.waitForFunction(
                () => [...document.querySelectorAll("audio")].some((audio) => audio.readyState >= 1 || audio.error),
                { timeout: 20000 },
              );
              await page.waitForTimeout(250);
            }
          }
          await page.evaluate(() => scrollTo(0, 0));
          await capture(page, `${locale}-${width}x${height}-${scene.name}.png`);
          console.log(`${locale} ${width}x${height} ${scene.name}`);
        } catch (error) {
          await page.screenshot({ path: path.join(output, `${locale}-${width}x${height}-${scene.name}-error.png`) });
          await writeFile(
            path.join(output, "error.json"),
            JSON.stringify({ scene, message: error.message, text: await page.locator("body").innerText() }, null, 2),
          );
          throw error;
        } finally {
          await page.unrouteAll({ behavior: "ignoreErrors" });
          await context.close();
        }
      }
} finally {
  await browser.close();
}
let prior = [];
try {
  prior = JSON.parse(await readFile(path.join(output, "capture.json"), "utf8")).records;
} catch {
  /* First capture set. */
}
const updated = new Set(records.map((record) => record.filename));
await writeFile(
  path.join(output, "capture.json"),
  JSON.stringify(
    {
      app,
      fixtureNotes:
        "Synthetic 12-player room and sample votes. Muted sound and reduced motion for static capture. Audio fixtures load their real full source asset for static layout, not the server's staged cuts. Mock fog images use raw art; media secrecy is checked separately. Timers show representative 14-second answering and 8-second reveal states. Profile is anonymous.",
      fixtures: Object.fromEntries(Object.entries(fixtures).map(([name, value]) => [name, value.raw.id])),
      records: [...prior.filter((record) => !updated.has(record.filename)), ...records],
    },
    null,
    2,
  ),
);
console.log(`Captured ${records.length} scenes.`);

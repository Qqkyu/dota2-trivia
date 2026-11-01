/**
 * Fill a private party with labeled test bots ("Bot 1", "Bot 2", ...).
 *
 *   node scripts/party-bots.mjs --code=ABCD --bots=5 [--minutes=30] [--url=https://queuearcade.com]
 *
 * Create the party in the browser first, run this, then press Start as the host.
 * Each bot joins, stays present, and answers about 85% of rounds with a random
 * answer at a random time. Ctrl-C (or the time limit) makes every bot leave.
 *
 * Private parties only: party votes never count toward the public room, question
 * calibration, profiles or alpha sessions. All bots share this machine's address,
 * so the server's per-address limits stay in force.
 */
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { smokeVoteAnswer } from "./smoke-fixtures.mjs";

const MAX_BOTS = 20;
const MAX_MINUTES = 120;
const POLL_MS = 1_000;
const TOUCH_MS = 5_000;
const SKIP_CHANCE = 0.15;

function option(name, fallback) {
  const prefix = `--${name}=`;
  const raw = process.argv.slice(2).find((arg) => arg.startsWith(prefix));
  return raw === undefined ? fallback : raw.slice(prefix.length);
}

const code = String(option("code", ""))
  .toUpperCase()
  .replace(/[^0-9A-Z]/g, "");
const botCount = Number(option("bots", "4"));
const minutes = Number(option("minutes", "30"));
const appUrl = new URL(option("url", "https://queuearcade.com"));
const local = ["localhost", "127.0.0.1"].includes(appUrl.hostname);

if (code.length < 3 || code.length > 16) throw new Error("Pass the party code: --code=ABCD");
if (!Number.isInteger(botCount) || botCount < 1 || botCount > MAX_BOTS) {
  throw new Error(`--bots must be 1 to ${MAX_BOTS}.`);
}
if (!Number.isFinite(minutes) || minutes <= 0 || minutes > MAX_MINUTES) {
  throw new Error(`--minutes must be above 0 and at most ${MAX_MINUTES}.`);
}
if (appUrl.protocol !== "https:" && !local) throw new Error("Use an https URL, or localhost for local runs.");

const origin = appUrl.origin;
const heroes = JSON.parse(await readFile(new URL("../src/data/hero-picker.json", import.meta.url))).groups.flatMap(
  (group) => group.heroes,
);
const items = JSON.parse(
  await readFile(new URL("../src/data/shopkeeper-catalog.json", import.meta.url)),
).groups.flatMap((group) => group.items);
const KEYED_MODES = new Set([
  "item-grid",
  "item-recipe",
  "hero-grid",
  "flashback-year",
  "value-order",
  "flashback-order",
]);

const stats = { accepted: 0, rejected: 0, skipped: 0, errors: {} };
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const randomBetween = (low, high) => low + Math.random() * Math.max(0, high - low);

async function call(path, { method = "GET", body } = {}) {
  const response = await fetch(new URL(path, origin), {
    method,
    redirect: "error",
    signal: AbortSignal.timeout(10_000),
    headers: { Origin: origin, ...(body ? { "Content-Type": "application/json" } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const payload = await response.json().catch(() => ({}));
  return { status: response.status, payload };
}

function noteError(label, status) {
  const key = `${label} ${status}`;
  stats.errors[key] = (stats.errors[key] ?? 0) + 1;
}

const bots = Array.from({ length: botCount }, (_, index) => ({
  id: `bot-${randomUUID()}`,
  name: `Bot ${index + 1}`,
  voted: new Set(),
  pending: new Set(),
  lastTouch: 0,
}));

let stopping = false;
const deadline = Date.now() + minutes * 60_000;
process.on("SIGINT", () => {
  stopping = true;
});

function answerFor(question) {
  const pick = Math.floor(Math.random() * 1_000);
  return smokeVoteAnswer(question, KEYED_MODES.has(question?.answerMode) ? pick : pick % 4, items, heroes);
}

async function vote(bot, snapshot) {
  const { status, payload } = await call("/api/votes", {
    method: "POST",
    body: {
      gameId: "dota2",
      mode: "mixed",
      filter: "Mixed",
      privateCode: code,
      roundId: snapshot.round.id,
      voterId: bot.id,
      ...answerFor(snapshot.question),
    },
  });
  if (status === 200 && payload.accepted) stats.accepted += 1;
  else {
    stats.rejected += 1;
    noteError("vote", status);
  }
}

async function runBot(bot) {
  const joined = await call("/api/private-rooms", {
    method: "POST",
    body: { action: "join", code, playerId: bot.id, name: bot.name },
  });
  if (joined.status !== 200) {
    throw new Error(`${bot.name} could not join ${code}: ${joined.status} ${joined.payload.error ?? ""}`);
  }
  bot.lastTouch = Date.now();
  while (!stopping && Date.now() < deadline) {
    if (Date.now() - bot.lastTouch >= TOUCH_MS) {
      const touched = await call("/api/private-rooms", {
        method: "POST",
        body: { action: "touch", code, playerId: bot.id },
      });
      if (touched.status === 404) {
        console.log(`Party ${code} closed.`);
        stopping = true;
        break;
      }
      if (touched.status !== 200) noteError("touch", touched.status);
      bot.lastTouch = Date.now();
    }
    const query = new URLSearchParams({
      gameId: "dota2",
      mode: "mixed",
      filter: "Mixed",
      privateCode: code,
      playerId: bot.id,
    });
    const { status, payload } = await call(`/api/rounds?${query}`);
    if (status === 200 && payload.round?.phase === "answering") {
      const { round } = payload;
      if (!bot.voted.has(round.id) && !bot.pending.has(round.id)) {
        bot.pending.add(round.id);
        if (Math.random() < SKIP_CHANCE) {
          stats.skipped += 1;
          bot.voted.add(round.id);
        } else {
          const left = round.answerDeadline - payload.serverNow;
          const wait = randomBetween(1_500, Math.min(11_000, left - 1_200));
          setTimeout(() => {
            bot.voted.add(round.id);
            vote(bot, payload)
              .catch(() => noteError("vote", "network"))
              .finally(() => bot.pending.delete(round.id));
          }, wait);
        }
      }
    } else if (status !== 200 && status !== 409) {
      noteError("rounds", status);
    }
    await delay(POLL_MS + Math.random() * 200);
  }
}

console.log(`${botCount} bot(s) joining party ${code} on ${origin} for up to ${minutes} min. Ctrl-C stops them.`);
const report = setInterval(() => {
  console.log(`answers accepted ${stats.accepted}, skipped ${stats.skipped}, rejected ${stats.rejected}`);
}, 60_000);
const results = await Promise.allSettled(
  bots.map(async (bot, index) => {
    await delay(index * 250);
    return runBot(bot);
  }),
);
clearInterval(report);
stopping = true;
await Promise.allSettled(
  bots.map((bot) => call("/api/private-rooms/leave", { method: "POST", body: { code, playerId: bot.id } })),
);
for (const result of results) if (result.status === "rejected") console.error(result.reason.message);
console.log(
  `Bots left. Answers accepted ${stats.accepted}, skipped ${stats.skipped}, rejected ${stats.rejected}.` +
    (Object.keys(stats.errors).length ? ` Errors: ${JSON.stringify(stats.errors)}` : ""),
);
process.exitCode = results.some((result) => result.status === "rejected") ? 1 : 0;

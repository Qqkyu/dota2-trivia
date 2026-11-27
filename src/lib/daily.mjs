/**
 * Queue Daily: one shared set of rounds for each calendar day. Everyone who plays on the
 * same local date gets the same set, as in Wordle. These helpers hold no catalog data, so
 * the browser may import them.
 */

/** Daily #1 is 27 November 2026, the day the mode was built. */
export const DAILY_EPOCH_UTC = Date.UTC(2026, 10, 27);
const DAY_MS = 86_400_000;

/** The six rounds, in play order. The index is the round's slot. */
export const DAILY_SLOTS = Object.freeze([
  "fogged-vision",
  "soundcheck",
  "echo-hunt",
  "quote-hunt",
  "flashback",
  "estimate",
]);

/** Rounds whose clues the player opens one at a time. Each opened clue costs a point. */
export const DAILY_STAGED_SLOTS = Object.freeze(["fogged-vision", "soundcheck", "echo-hunt", "quote-hunt"]);

export const DAILY_ROUND_MAX_POINTS = 3;
export const DAILY_MAX_POINTS = DAILY_SLOTS.length * DAILY_ROUND_MAX_POINTS;

/** The marks in the share text, by points: miss, 1, 2, 3. */
export const DAILY_RESULT_MARKS = Object.freeze(["⬛", "🟧", "🟨", "🟩"]);

function dailyNumberForUtcDate(year, monthIndex, day) {
  return Math.floor((Date.UTC(year, monthIndex, day) - DAILY_EPOCH_UTC) / DAY_MS) + 1;
}

/** The daily number for a local calendar date. */
export function dailyNumberForDate(date = new Date()) {
  return dailyNumberForUtcDate(date.getFullYear(), date.getMonth(), date.getDate());
}

function dailyNumberAtUtc(milliseconds) {
  const date = new Date(milliseconds);
  return dailyNumberForUtcDate(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
}

/**
 * The dailies some place on Earth is playing now. Time zones run from UTC-12 to UTC+14,
 * so a request may ask for any of them, and nothing later.
 */
export function openDailyNumbers(now = Date.now()) {
  return {
    earliest: Math.max(1, dailyNumberAtUtc(now - 12 * 3_600_000)),
    latest: dailyNumberAtUtc(now + 14 * 3_600_000),
  };
}

export function isOpenDailyNumber(day, now = Date.now()) {
  const { earliest, latest } = openDailyNumbers(now);
  return Number.isInteger(day) && day >= earliest && day <= latest;
}

export function isDailySlot(slot) {
  return Number.isInteger(slot) && slot >= 0 && slot < DAILY_SLOTS.length;
}

export function isDailyStage(stage) {
  return stage === 1 || stage === 2 || stage === 3;
}

/** An opaque round ID. It names the day and slot, never the question. */
export function dailyRoundId(day, slot) {
  return `dota2:daily:${day}:${slot}`;
}

export function parseDailyRoundId(roundId) {
  const match = typeof roundId === "string" ? /^dota2:daily:(\d{1,5}):(\d)$/.exec(roundId) : null;
  if (!match) return null;
  const day = Number(match[1]);
  const slot = Number(match[2]);
  return day >= 1 && isDailySlot(slot) ? { day, slot } : null;
}

/** A right answer after the first clue scores 3, after the second 2, after the third 1. */
export function stagedRoundPoints(correct, stage) {
  return correct && isDailyStage(stage) ? DAILY_ROUND_MAX_POINTS + 1 - stage : 0;
}

/** Flashback years score by closeness: exact 3, one year off 2, up to three years off 1. */
export function flashbackYearPoints(guess, year) {
  if (!Number.isInteger(guess) || !Number.isInteger(year)) return 0;
  const distance = Math.abs(guess - year);
  return distance === 0 ? 3 : distance <= 1 ? 2 : distance <= 3 ? 1 : 0;
}

/**
 * Estimate rounds: the slider range and how close counts. Prices vary over two orders of
 * magnitude, so they score by relative error. Speed and range sit on a narrow scale with
 * fixed steps, so they score by distance.
 */
export const DAILY_ESTIMATE_FAMILIES = Object.freeze({
  "item-price": Object.freeze({ min: 0, max: 7_000, step: 25, unit: "gold", relative: [0.05, 0.15, 0.3] }),
  "hero-move-speed": Object.freeze({ min: 270, max: 340, step: 5, unit: "speed", absolute: [0, 5, 10] }),
  "hero-attack-range": Object.freeze({ min: 100, max: 700, step: 25, unit: "range", absolute: [0, 50, 100] }),
});

export function isDailyEstimateFamily(family) {
  return Object.hasOwn(DAILY_ESTIMATE_FAMILIES, family);
}

export function isEstimateGuessInRange(family, guess) {
  const config = DAILY_ESTIMATE_FAMILIES[family];
  return Boolean(config) && Number.isFinite(guess) && guess >= config.min && guess <= config.max;
}

export function estimatePoints(family, guess, value) {
  const config = DAILY_ESTIMATE_FAMILIES[family];
  if (!config || !Number.isFinite(guess) || !Number.isFinite(value)) return 0;
  const error = Math.abs(guess - value);
  const limits = config.relative ? config.relative.map((share) => share * value) : config.absolute;
  if (error <= limits[0]) return 3;
  if (error <= limits[1]) return 2;
  if (error <= limits[2]) return 1;
  return 0;
}

export function dailyTotal(points) {
  return points.reduce((sum, value) => sum + (Number.isInteger(value) ? value : 0), 0);
}

/** The text a player can paste. It shows marks only, so it spoils nothing. */
export function dailyShareText(day, points, url) {
  const marks = points.map((value) => DAILY_RESULT_MARKS[value] ?? DAILY_RESULT_MARKS[0]).join("");
  return `Queue Daily #${day} ${dailyTotal(points)}/${DAILY_MAX_POINTS}\n${marks}\n${url}`;
}

/** The streak after finishing `day`. Finishing the day after the last one extends it. */
export function nextDailyStreak(previous, day) {
  if (previous && previous.lastDay === day) return previous;
  const streak = previous && previous.lastDay === day - 1 ? previous.streak + 1 : 1;
  return { lastDay: day, streak, best: Math.max(previous?.best ?? 0, streak) };
}

/** The streak to show today: it stays alive until a whole day passes without a daily. */
export function currentDailyStreak(state, today) {
  if (!state || !Number.isInteger(state.lastDay)) return 0;
  return state.lastDay >= today - 1 ? state.streak : 0;
}

export function isDailyPoints(points) {
  return (
    Array.isArray(points) &&
    points.length === DAILY_SLOTS.length &&
    points.every((value) => Number.isInteger(value) && value >= 0 && value <= DAILY_ROUND_MAX_POINTS)
  );
}

/**
 * Counter names stored for each day. They are counts only: no visit, player or answer
 * is stored with them.
 */
export const DAILY_STREAK_BUCKET_MAX = 30;

export function dailyFinishMetrics({ points, playedYesterday, streak }) {
  const bucket = Math.min(Math.max(1, Math.trunc(streak)), DAILY_STREAK_BUCKET_MAX);
  return [
    "finish",
    ...(playedYesterday ? ["finish:yesterday"] : []),
    `streak:${bucket}`,
    `score:${dailyTotal(points)}`,
  ];
}

export function dailyRoundMetrics(slot, points) {
  return [...(slot === 0 ? ["start"] : []), `slot:${slot}:${points}`];
}

/** Today's figures for the end screen, built from the day's counters. */
export function summarizeDailyCounts(counts, ownTotal) {
  const finishes = counts.finish ?? 0;
  let below = 0;
  let total = 0;
  for (let score = 0; score <= DAILY_MAX_POINTS; score += 1) {
    const count = counts[`score:${score}`] ?? 0;
    total += score * count;
    if (Number.isInteger(ownTotal) && score < ownTotal) below += count;
  }
  const slots = DAILY_SLOTS.map((_, slot) => {
    const answered = [0, 1, 2, 3].reduce((sum, points) => sum + (counts[`slot:${slot}:${points}`] ?? 0), 0);
    const scored = answered - (counts[`slot:${slot}:0`] ?? 0);
    return { answered, scoredShare: answered ? scored / answered : null };
  });
  return {
    players: finishes,
    averageTotal: finishes ? total / finishes : null,
    beatShare: finishes && Number.isInteger(ownTotal) ? below / finishes : null,
    slots,
  };
}

import { createHmac } from "node:crypto";
import { deckSeedSecret } from "@/lib/deck-seed.mjs";
import {
  DAILY_ESTIMATE_FAMILIES,
  DAILY_SLOTS,
  DAILY_STAGED_SLOTS,
  dailyRoundId,
  estimatePoints,
  flashbackYearPoints,
  isDailyEstimateFamily,
  isDailyStage,
  isEstimateGuessInRange,
  isOpenDailyNumber,
  parseDailyRoundId,
  stagedRoundPoints,
} from "@/lib/daily.mjs";
import {
  flashbackYearCorrectAnswerKey,
  flashbackYearFromAnswerKey,
  isFlashbackYearAnswerForQuestion,
  isFlashbackYearQuestion,
} from "@/lib/flashback.mjs";
import { GAME_CATALOGS } from "@/lib/game-catalogs";
import { isKeyedAnswerQuestion, isQuestionAnswerCorrect } from "@/lib/keyed-answer";
import { publicQuestionForRound, type PublicArcadeQuestion } from "@/lib/public-question";
import { localizeQuestion } from "@/lib/question-locale";
import { firstPartyArtTree } from "@/lib/steam-art.mjs";
import type { RoundGame, TriviaQuestion } from "@/lib/trivia";
import type { Locale } from "@/i18n/types";

type DailyGame = (typeof DAILY_SLOTS)[number];
type EstimateFamily = keyof typeof DAILY_ESTIMATE_FAMILIES;

interface EstimateSubject {
  id: string;
  sourceQuestionId: string;
  family: EstimateFamily;
  key: string;
  value: number;
  label: string;
}

export interface DailyEstimate {
  family: EstimateFamily;
  unit: string;
  subject: { name: string; context?: string; image: string; kind: string };
  slider: { min: number; max: number; step: number };
  reveal: { value: number; label: string } | null;
}

export interface DailyRoundPayload {
  day: number;
  slot: number;
  game: DailyGame;
  stage: 1 | 2 | 3;
  maxStage: 1 | 3;
  question?: PublicArcadeQuestion;
  estimate?: DailyEstimate;
}

export interface DailyAnswer {
  answerIndex?: number;
  answerKey?: string;
  value?: number;
}

const SLOT_MATCHERS: Record<Exclude<DailyGame, "estimate">, (question: TriviaQuestion) => boolean> = {
  "fogged-vision": (question) => question.kind === "fogged-hero",
  soundcheck: (question) => question.kind === "soundcheck-ability" || question.kind === "soundcheck-item",
  "echo-hunt": (question) => question.kind === "hero-voice",
  "quote-hunt": (question) => question.kind === "hero-quote",
  flashback: (question) => question.kind.startsWith("flashback-"),
};

let cachedPools: { secret: string; pools: Array<Array<TriviaQuestion | EstimateSubject>> } | null = null;

function seededOrder<T extends { id: string }>(items: T[], slot: number, secret: string) {
  const rank = (item: T) =>
    createHmac("sha256", secret).update(`queue-arcade:daily:v1:${slot}:${item.id}`).digest("hex");
  return items
    .map((item) => ({ item, rank: rank(item) }))
    .sort((a, b) => (a.rank < b.rank ? -1 : a.rank > b.rank ? 1 : 0))
    .map((entry) => entry.item);
}

function estimateSubjects(questions: readonly TriviaQuestion[]) {
  const subjects = new Map<string, EstimateSubject>();
  for (const question of questions) {
    const order = question.valueOrder;
    if (!order || !isDailyEstimateFamily(order.family)) continue;
    for (const entry of order.values) {
      const id = `${order.family}:${entry.key}`;
      if (subjects.has(id) || !Number.isFinite(entry.value)) continue;
      subjects.set(id, {
        id,
        sourceQuestionId: question.id,
        family: order.family as EstimateFamily,
        key: entry.key,
        value: entry.value,
        label: entry.label,
      });
    }
  }
  return [...subjects.values()];
}

/**
 * Each slot walks through its own fixed order of the catalog, one question a day, so a
 * question repeats only after the whole pool has been used. The order is seeded with the
 * server secret: the catalog is public, but tomorrow's set must not be.
 */
function dailyPools() {
  const secret = deckSeedSecret();
  if (cachedPools && cachedPools.secret === secret) return cachedPools.pools;
  const questions = GAME_CATALOGS.dota2.questions;
  const pools = DAILY_SLOTS.map((game, slot) => {
    const pool =
      game === "estimate"
        ? estimateSubjects(questions)
        : questions.filter(SLOT_MATCHERS[game as Exclude<DailyGame, "estimate">]);
    if (!pool.length) throw new Error(`The daily has no questions for ${game}.`);
    return seededOrder<TriviaQuestion | EstimateSubject>(pool, slot, secret);
  });
  cachedPools = { secret, pools };
  return pools;
}

export function dailyPoolSizes() {
  return dailyPools().map((pool) => pool.length);
}

function dailyEntry(day: number, slot: number) {
  const pool = dailyPools()[slot];
  return pool[(day - 1) % pool.length];
}

/** The catalog question behind a daily round. Server only: media routes use it. */
export function dailyQuestion(day: number, slot: number): TriviaQuestion | null {
  const entry = dailyEntry(day, slot);
  return DAILY_SLOTS[slot] === "estimate" ? null : (entry as TriviaQuestion);
}

function maxStage(game: DailyGame): 1 | 3 {
  return (DAILY_STAGED_SLOTS as readonly string[]).includes(game) ? 3 : 1;
}

function estimatePayload(subject: EstimateSubject, locale: Locale, revealed: boolean): DailyEstimate {
  const source = GAME_CATALOGS.dota2.questions.find((question) => question.id === subject.sourceQuestionId);
  const localized = source ? localizeQuestion(source, locale) : null;
  const card = (localized ?? source)?.valueOrder?.cards.find((entry) => entry.key === subject.key);
  const localizedLabel = (localized ?? source)?.valueOrder?.values.find((entry) => entry.key === subject.key)?.label;
  const config = DAILY_ESTIMATE_FAMILIES[subject.family];
  return firstPartyArtTree({
    family: subject.family,
    unit: config.unit,
    subject: {
      name: card?.name ?? subject.key,
      ...(card?.context ? { context: card.context } : {}),
      image: card?.image ?? "",
      kind: card?.kind ?? "item",
    },
    slider: { min: config.min, max: config.max, step: config.step },
    reveal: revealed ? { value: subject.value, label: localizedLabel ?? subject.label } : null,
  }) as DailyEstimate;
}

/**
 * The only daily shape that reaches the browser. Recognition rounds go through the same
 * allow-list serializer as the live room. Before the player answers, nothing names the
 * right answer; `revealed` is set only after the answer is checked.
 */
export function dailyRoundPayload(
  day: number,
  slot: number,
  stage: 1 | 2 | 3,
  locale: Locale,
  labels: { hiddenHero: string; spellLink: string },
  revealed: boolean,
  now = Date.now(),
): DailyRoundPayload {
  const game = DAILY_SLOTS[slot] as DailyGame;
  const entry = dailyEntry(day, slot);
  const top = maxStage(game);
  const shownStage = (revealed ? top : Math.min(stage, top)) as 1 | 2 | 3;
  if (game === "estimate") {
    return {
      day,
      slot,
      game,
      stage: 1,
      maxStage: 1,
      estimate: estimatePayload(entry as EstimateSubject, locale, revealed),
    };
  }
  const question = firstPartyArtTree(
    publicQuestionForRound(
      localizeQuestion(entry as TriviaQuestion, locale),
      {
        id: dailyRoundId(day, slot),
        phase: revealed ? "reveal" : "answering",
        game: game as RoundGame,
        answerDeadline: now,
        answerDuration: 1,
        ...(revealed ? {} : { clueStage: shownStage }),
      },
      now,
      labels,
    ),
  ) as PublicArcadeQuestion;
  return { day, slot, game, stage: shownStage, maxStage: top, question };
}

/** Check one answer on the server and score it. Returns null for a malformed answer. */
export function gradeDailyAnswer(
  day: number,
  slot: number,
  stage: 1 | 2 | 3,
  answer: DailyAnswer,
  now = Date.now(),
): { points: number; correct: boolean } | null {
  const game = DAILY_SLOTS[slot] as DailyGame;
  const entry = dailyEntry(day, slot);
  if (game === "estimate") {
    const subject = entry as EstimateSubject;
    if (typeof answer.value !== "number" || !isEstimateGuessInRange(subject.family, answer.value)) return null;
    const points = estimatePoints(subject.family, answer.value, subject.value);
    return { points, correct: points === 3 };
  }
  const question = entry as TriviaQuestion;
  if (isFlashbackYearQuestion(question)) {
    if (!answer.answerKey || !isFlashbackYearAnswerForQuestion(question, answer.answerKey, now)) return null;
    const correctYear = flashbackYearFromAnswerKey(flashbackYearCorrectAnswerKey(question));
    const points = flashbackYearPoints(flashbackYearFromAnswerKey(answer.answerKey), correctYear);
    return { points, correct: points === 3 };
  }
  const keyed = isKeyedAnswerQuestion(question);
  if (keyed && (typeof answer.answerKey !== "string" || answer.answerKey.length > 200)) return null;
  if (!keyed && !(Number.isInteger(answer.answerIndex) && answer.answerIndex! >= 0 && answer.answerIndex! <= 3)) {
    return null;
  }
  const correct = isQuestionAnswerCorrect(question, answer.answerIndex ?? -1, answer.answerKey);
  const points = maxStage(game) === 3 ? stagedRoundPoints(correct, stage) : correct ? 3 : 0;
  return { points, correct };
}

/**
 * The daily round behind a media request, for the image and audio routes. The player
 * chooses the clue stage; an image or clip never names the answer.
 */
export function dailyMediaRound(roundId: string, stageParam: string | null, now = Date.now()) {
  const parsed = parseDailyRoundId(roundId);
  if (!parsed || !isOpenDailyNumber(parsed.day, now)) return null;
  const question = dailyQuestion(parsed.day, parsed.slot);
  if (!question) return null;
  const requested = Number(stageParam ?? "3");
  const stage = (isDailyStage(requested) ? requested : 3) as 1 | 2 | 3;
  return { ...parsed, game: DAILY_SLOTS[parsed.slot] as DailyGame, question, stage };
}

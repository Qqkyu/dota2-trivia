import { valueOrderAnswerKey, valueOrderKeysFromAnswerKey } from "./value-order.mjs";

export const FLASHBACK_FAMILIES = Object.freeze(["year", "choice", "order"]);
export const FLASHBACK_CARD_COUNT = 4;
/** First year in the pool (IceFrog joins Valve). Max is always this calendar year. */
export const FLASHBACK_YEAR_EPOCH = 2009;
export const FLASHBACK_YEAR_ANSWER_PREFIX = "year-v1:";

export function isFlashbackQuestion(question) {
  return typeof question?.kind === "string" && question.kind.startsWith("flashback-");
}

export function isFlashbackOrderQuestion(question) {
  const cards = question?.flashback?.cards;
  const order = question?.flashback?.correctOrder;
  return (
    question?.kind === "flashback-order" &&
    question.flashback?.family === "order" &&
    Array.isArray(cards) &&
    cards.length === FLASHBACK_CARD_COUNT &&
    Array.isArray(order) &&
    order.length === FLASHBACK_CARD_COUNT
  );
}

export function flashbackOrderCorrectAnswerKey(question) {
  return isFlashbackOrderQuestion(question) ? valueOrderAnswerKey(question.flashback.correctOrder) : null;
}

export function isFlashbackOrderAnswerForQuestion(question, answerKey) {
  const submittedKeys = valueOrderKeysFromAnswerKey(answerKey);
  const cardKeys = question?.flashback?.cards?.map((card) => card.key);
  if (!submittedKeys || !Array.isArray(cardKeys) || cardKeys.length !== FLASHBACK_CARD_COUNT) return false;
  const expected = new Set(cardKeys);
  return expected.size === FLASHBACK_CARD_COUNT && submittedKeys.every((key) => expected.has(key));
}

export function flashbackYearMax(now = Date.now()) {
  return new Date(now).getFullYear();
}

export function flashbackYearAnswerKey(year) {
  return Number.isInteger(year) ? `${FLASHBACK_YEAR_ANSWER_PREFIX}${year}` : null;
}

export function flashbackYearFromAnswerKey(answerKey) {
  if (typeof answerKey !== "string" || !answerKey.startsWith(FLASHBACK_YEAR_ANSWER_PREFIX)) return null;
  const year = Number(answerKey.slice(FLASHBACK_YEAR_ANSWER_PREFIX.length));
  return Number.isInteger(year) ? year : null;
}

export function isFlashbackYearAnswerKey(answerKey) {
  return flashbackYearFromAnswerKey(answerKey) !== null;
}

export function isFlashbackYearQuestion(question) {
  return (
    question?.kind === "flashback-year" &&
    question.flashback?.family === "year" &&
    Number.isInteger(question.flashback.correctYear)
  );
}

export function flashbackYearCorrectAnswerKey(question) {
  return isFlashbackYearQuestion(question) ? flashbackYearAnswerKey(question.flashback.correctYear) : null;
}

export function isFlashbackYearAnswerInRange(answerKey, yearMin, yearMax) {
  const year = flashbackYearFromAnswerKey(answerKey);
  return year !== null && Number.isInteger(yearMin) && Number.isInteger(yearMax) && year >= yearMin && year <= yearMax;
}

export function isFlashbackYearAnswerForQuestion(question, answerKey, now = Date.now()) {
  if (!isFlashbackYearQuestion(question)) return false;
  return isFlashbackYearAnswerInRange(answerKey, FLASHBACK_YEAR_EPOCH, flashbackYearMax(now));
}

export function flashbackYearAnswerIndex(question, answerKey, now = Date.now()) {
  if (!isFlashbackYearAnswerForQuestion(question, answerKey, now)) return null;
  if (answerKey === flashbackYearCorrectAnswerKey(question)) return question.correctIndex;
  const wrongIndexes = [0, 1, 2, 3].filter((index) => index !== question.correctIndex);
  let hash = 0;
  for (const character of answerKey) hash = (hash * 31 + character.charCodeAt(0)) >>> 0;
  return wrongIndexes[hash % wrongIndexes.length] ?? null;
}

export function flashbackOrderAnswerIndex(question, answerKey) {
  if (!isFlashbackOrderQuestion(question) || !isFlashbackOrderAnswerForQuestion(question, answerKey)) return null;
  if (answerKey === flashbackOrderCorrectAnswerKey(question)) return question.correctIndex;
  const wrongIndexes = [0, 1, 2, 3].filter((index) => index !== question.correctIndex);
  let hash = 0;
  for (const character of answerKey) hash = (hash * 31 + character.charCodeAt(0)) >>> 0;
  return wrongIndexes[hash % wrongIndexes.length] ?? null;
}

export function isPlayableFlashbackQuestion(question) {
  if (!isFlashbackQuestion(question)) return false;
  if (!question.id || !question.prompt || !question.explanation || !question.source?.url) return false;
  if (!question.image?.src || !question.image?.kind) return false;
  if (!Array.isArray(question.answers) || question.answers.length !== 4) return false;
  if (![0, 1, 2, 3].includes(question.correctIndex)) return false;
  const family = question.flashback?.family;
  if (!FLASHBACK_FAMILIES.includes(family)) return false;
  if (family === "year") {
    return (
      question.kind === "flashback-year" &&
      question.answers.every((answer) => /^\d{4}$/.test(answer)) &&
      question.answers[question.correctIndex] === String(question.flashback.correctYear)
    );
  }
  if (family === "choice") {
    return question.kind === "flashback-choice" && question.answers.every((answer) => String(answer).trim().length > 0);
  }
  return (
    Boolean(flashbackOrderCorrectAnswerKey(question)) &&
    question.flashback.cards.every(
      (card) =>
        typeof card.image === "string" &&
        (card.image.startsWith("https://") || /^\/arcade\/flashback\/originals\/[a-z-]+\.svg$/.test(card.image)),
    )
  );
}

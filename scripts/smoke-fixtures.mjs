import { flashbackYearAnswerKey } from "../src/lib/flashback.mjs";
import { recipeAnswerKeyForItems } from "../src/lib/item-picker.mjs";
import { publicQuestionForRound } from "../src/lib/public-question.mjs";
import { valueOrderAnswerKey } from "../src/lib/value-order.mjs";

export const SMOKE_QUESTION_FILES = [
  "questions.generated.json",
  "shopkeeper-questions.json",
  "soundcheck-questions.json",
  "value-order-questions.json",
  "aghanim-questions.json",
  "flashback-questions.json",
];

export function smokeVoteAnswer(question, index, items, heroes) {
  if (question?.answerMode === "item-grid") {
    return { answerIndex: 0, answerKey: items[index % items.length].key };
  }
  if (question?.answerMode === "item-recipe") {
    return {
      answerIndex: 0,
      answerKey: recipeAnswerKeyForItems(
        items.slice(index, index + question.shopkeeper.recipeSize).map((item) => item.key),
      ),
    };
  }
  if (question?.answerMode === "hero-grid") {
    return { answerIndex: 0, answerKey: heroes[index % heroes.length].key };
  }
  if (question?.answerMode === "flashback-year") {
    return {
      answerIndex: 0,
      answerKey: flashbackYearAnswerKey(
        question.flashback.yearMin + (index % (question.flashback.yearMax - question.flashback.yearMin + 1)),
      ),
    };
  }
  if (question?.answerMode === "value-order" || question?.answerMode === "flashback-order") {
    const cards = question.answerMode === "value-order" ? question.valueOrder.cards : question.flashback.cards;
    const keys = cards.map((card) => card.key);
    const offset = index % keys.length;
    return { answerIndex: 0, answerKey: valueOrderAnswerKey([...keys.slice(offset), ...keys.slice(0, offset)]) };
  }
  return { answerIndex: index };
}

function revealSignature(question) {
  return JSON.stringify([question.kind, question.prompt, question.answers, question.reveal]);
}

export function privateQuestionForReveal(snapshot, questions) {
  if (snapshot.round.phase !== "reveal" || !snapshot.question?.reveal) {
    throw new Error("Private fixture resolution requires a revealed round.");
  }
  const signature = revealSignature(snapshot.question);
  const candidates = questions.filter(
    (question) =>
      question.kind === snapshot.question.kind &&
      question.prompt === snapshot.question.prompt &&
      revealSignature(publicQuestionForRound(question, snapshot.round, snapshot.serverNow)) === signature,
  );
  if (candidates.length !== 1) {
    throw new Error(
      `Could not resolve one private smoke-test question from the public payload (${candidates.length}).`,
    );
  }
  return candidates[0];
}

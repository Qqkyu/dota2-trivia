import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "vitest";
import { isFlashbackOrderAnswerForQuestion, isFlashbackYearAnswerForQuestion } from "../src/lib/flashback.mjs";
import { recipeItemsFromAnswerKey } from "../src/lib/item-picker.mjs";
import { publicQuestionForRound } from "../src/lib/public-question.mjs";
import { isValueOrderAnswerForQuestion } from "../src/lib/value-order.mjs";
import { SMOKE_QUESTION_FILES, privateQuestionForReveal, smokeVoteAnswer } from "../scripts/smoke-fixtures.mjs";

const load = async (name) => JSON.parse(await readFile(new URL(`../src/data/${name}`, import.meta.url), "utf8"));
const pools = await Promise.all(SMOKE_QUESTION_FILES.map(load));
const questions = pools.flat();
const items = (await load("shopkeeper-catalog.json")).groups.flatMap((group) => group.items);
const heroes = (await load("hero-picker.json")).groups.flatMap((group) => group.heroes);
const now = Date.UTC(2026, 9, 6);
const round = {
  id: "fixture-round",
  game: "flashback",
  phase: "answering",
  answerDeadline: now + 15_000,
  answerDuration: 15_000,
};

test("smoke fixtures resolve every question from all six catalogs after reveal", () => {
  assert.equal(pools.length, 6);
  assert.ok(pools.every((pool) => pool.length > 0));
  const revealRound = { ...round, phase: "reveal" };
  for (const question of questions) {
    const snapshot = {
      round: revealRound,
      serverNow: now + 16_000,
      question: publicQuestionForRound(question, revealRound, now + 16_000),
    };
    assert.equal(privateQuestionForReveal(snapshot, questions).id, question.id);
  }
});

test("smoke votes are valid for every public answer format without reading the solution", () => {
  const modes = new Set();
  for (const question of questions) {
    const publicQuestion = publicQuestionForRound(question, round, now);
    const mode = publicQuestion.answerMode ?? "choice";
    modes.add(mode);
    assert.equal(publicQuestion.reveal, null);
    for (const index of [0, 1, 3]) {
      const answer = smokeVoteAnswer(publicQuestion, index, items, heroes);
      if (mode === "flashback-year") assert.ok(isFlashbackYearAnswerForQuestion(question, answer.answerKey, now));
      else if (mode === "flashback-order") assert.ok(isFlashbackOrderAnswerForQuestion(question, answer.answerKey));
      else if (mode === "value-order") assert.ok(isValueOrderAnswerForQuestion(question, answer.answerKey));
      else if (mode === "item-grid") assert.ok(items.some((item) => item.key === answer.answerKey));
      else if (mode === "hero-grid") assert.ok(heroes.some((hero) => hero.key === answer.answerKey));
      else if (mode === "item-recipe") {
        const keys = recipeItemsFromAnswerKey(answer.answerKey);
        assert.equal(keys.length, publicQuestion.shopkeeper.recipeSize);
        assert.ok(keys.every((key) => items.some((item) => item.key === key)));
      } else assert.equal(answer.answerIndex, index);
    }
  }
  assert.deepEqual([...modes].sort(), [
    "choice",
    "flashback-order",
    "flashback-year",
    "hero-grid",
    "item-grid",
    "item-recipe",
    "value-order",
  ]);
});

test("private fixture resolution refuses answering-phase payloads", () => {
  const snapshot = { round, serverNow: now, question: publicQuestionForRound(questions[0], round, now) };
  assert.throws(() => privateQuestionForReveal(snapshot, questions), /requires a revealed round/);
});

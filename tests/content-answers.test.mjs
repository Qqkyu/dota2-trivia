import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { publicQuestionForRound } from "../src/lib/public-question.mjs";
import { shopkeeperQuestionIssues } from "../src/lib/shopkeeper-quality.mjs";
import { questionCalibrationRevision } from "../src/lib/question-revision.mjs";

const readQuestions = (name) => JSON.parse(readFileSync(new URL(`../src/data/${name}.json`, import.meta.url)));
const round = {
  id: "content-answer-check",
  phase: "answering",
  game: "soundcheck",
  answerDeadline: 15_000,
  answerDuration: 15_000,
};

describe("audited answer choices", () => {
  it("keeps audited Shopkeeper rounds with bundled item icons playable", () => {
    const questions = readQuestions("shopkeeper-questions");
    for (const id of ["shopkeeper-recipe:disperser", "shopkeeper-upgrade:phylactery:angels_demise"]) {
      expect(shopkeeperQuestionIssues(questions.find((question) => question.id === id))).toEqual([]);
    }
  });
  it("offers only the reviewed choices when an item sound has another valid shop owner", () => {
    const question = readQuestions("soundcheck-questions").find((entry) => entry.id === "soundcheck-item:force_staff");
    const publicQuestion = publicQuestionForRound(question, round, 1_000);

    expect(publicQuestion.answerMode).toBeUndefined();
    expect(publicQuestion.answers).toEqual(["Glimmer Cape", "Force Staff", "Blink Dagger", "Disperser"]);
    expect(publicQuestion.answers).not.toContain("Hurricane Pike");
    expect(publicQuestion.reveal).toBeNull();
  });

  it("does not merge reviewed-choice accuracy with the former ambiguous full-shop round", () => {
    const questions = readQuestions("soundcheck-questions");
    // Recorded before the answer-mode fix. Old attempts included a valid but rejected Hurricane Pike choice.
    expect(questionCalibrationRevision(questions.find((entry) => entry.id === "soundcheck-item:force_staff"))).not.toBe(
      "q1_Ba2rpgDlOibtIGtht3ubmF",
    );
    expect(questionCalibrationRevision(questions.find((entry) => entry.id === "soundcheck-item:blink"))).not.toBe(
      "q1_pddkjZrHaa-wnJFmc0Mvef",
    );
  });

  it("shows damage conditions before a player orders the cards", () => {
    const questions = readQuestions("value-order-questions");
    const cards = ["07", "12"].flatMap(
      (id) =>
        publicQuestionForRound(
          questions.find((entry) => entry.id === `value-order:ability-damage:${id}`),
          { ...round, game: "orderup" },
          1_000,
        ).valueOrder.cards,
    );
    expect(cards.find((card) => card.key === "earth_spirit_rolling_boulder").context).toContain(
      "base damage; no Strength bonus",
    );
    expect(cards.find((card) => card.key === "dazzle_shadow_wave").context).toContain("damage per healing pulse");
    expect(cards.find((card) => card.key === "snapfire_scatterblast").context).toContain("outside point-blank range");
  });
});

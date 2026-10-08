import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { publicQuestionForRound } from "../src/lib/public-question.mjs";

const questions = JSON.parse(readFileSync(new URL("../src/data/shopkeeper-questions.json", import.meta.url)));
const template = questions.find((question) => question.kind === "shopkeeper-real-recipe");
const round = {
  id: "recipe-public-fixture",
  game: "shopkeeper",
  phase: "answering",
  answerDuration: 15000,
  answerDeadline: 15000,
};

describe("public recipe cost metadata", () => {
  it.each([0, 1000, undefined])("exposes a factual cost of %s without exposing the recipe key", (cost) => {
    const question = { ...template, shopkeeper: { ...template.shopkeeper, recipeCost: cost } };
    const publicQuestion = publicQuestionForRound(question, round, 1000);
    expect(publicQuestion.shopkeeper.recipeCost).toBe(cost);
    expect(publicQuestion.reveal).toBeNull();
    expect(publicQuestion.shopkeeper).not.toHaveProperty("recipeAnswerKeys");
    expect(publicQuestion.shopkeeper).not.toHaveProperty("recipeComponentKeys");
    expect(publicQuestion).not.toHaveProperty("correctAnswerKey");
    expect(publicQuestion.shopkeeper).not.toHaveProperty("resultKey");
  });
  it.each([-1, NaN, 3.5, "0"])("rejects an invalid cost of %s", (recipeCost) => {
    const publicQuestion = publicQuestionForRound(
      { ...template, shopkeeper: { ...template.shopkeeper, recipeCost } },
      round,
      1000,
    );
    expect(publicQuestion.shopkeeper).not.toHaveProperty("recipeCost");
  });
});

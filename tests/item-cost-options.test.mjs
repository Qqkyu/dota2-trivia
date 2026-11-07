import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const questions = JSON.parse(readFileSync("src/data/questions.generated.json", "utf8"));
const list = Array.isArray(questions) ? questions : questions.questions;
const price = (answer) => Number(answer.replace(/\D/g, ""));

describe("item price questions", () => {
  it("offers at least one wrong price close to the real one", () => {
    const giveaways = list
      .filter((question) => question.kind === "item-cost")
      .filter((question) => {
        const right = price(question.answers[question.correctIndex]);
        const wrong = question.answers.filter((_, index) => index !== question.correctIndex).map(price);
        return Math.min(...wrong.map((value) => Math.abs(value - right) / right)) >= 0.5;
      })
      .map((question) => question.prompt);
    expect(giveaways).toEqual([]);
  });
});

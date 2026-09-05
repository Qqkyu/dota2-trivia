import { describe, expect, it } from "vitest";
import aghanimQuestions from "../src/data/aghanim-questions.json" with { type: "json" };
import flashbackQuestions from "../src/data/flashback-questions.json" with { type: "json" };
import generatedQuestions from "../src/data/questions.generated.json" with { type: "json" };
import shopkeeperQuestions from "../src/data/shopkeeper-questions.json" with { type: "json" };
import soundcheckQuestions from "../src/data/soundcheck-questions.json" with { type: "json" };
import valueOrderQuestions from "../src/data/value-order-questions.json" with { type: "json" };
import { questionCalibrationRevision } from "../src/lib/question-revision.mjs";

const questions = [
  ...generatedQuestions,
  ...aghanimQuestions,
  ...shopkeeperQuestions,
  ...soundcheckQuestions,
  ...valueOrderQuestions,
  ...flashbackQuestions,
];
const sample = questions[0];
const baseline = questionCalibrationRevision(sample);

describe("questionCalibrationRevision", () => {
  it("gives every catalog question a unique, well-formed revision", () => {
    const seen = new Map();
    for (const question of questions) {
      const revision = questionCalibrationRevision(question);
      expect(revision).toMatch(/^q1_[A-Za-z0-9_-]{22}$/);
      expect(seen.get(revision) ?? question.id).toBe(question.id);
      seen.set(revision, question.id);
    }
    expect(seen.size).toBe(questions.length);
  });

  it("ignores metadata that players never see", () => {
    expect(
      questionCalibrationRevision({
        ...sample,
        difficulty: sample.difficulty === 1 ? 2 : 1,
        explanation: `${sample.explanation} Editorial clarification.`,
        patch: "future-patch",
        source: { label: "Another audit", url: "https://example.com" },
      }),
    ).toBe(baseline);
  });

  it("changes when an answer or a visible clue changes", () => {
    expect(
      questionCalibrationRevision({
        ...sample,
        answers: sample.answers.map((answer, index) => (index === 0 ? `${answer} changed` : answer)),
      }),
    ).not.toBe(baseline);
    expect(questionCalibrationRevision({ ...sample, eyebrow: `${sample.eyebrow} changed` })).not.toBe(baseline);
  });

  it("ignores Steam asset cache timestamps", () => {
    const question = {
      id: "asset-cache-test",
      kind: "fogged-hero",
      prompt: "Who is this?",
      answers: ["A", "B", "C", "D"],
      correctIndex: 0,
    };
    expect(
      questionCalibrationRevision({
        ...question,
        image: { src: "https://cdn.cloudflare.steamstatic.com/apps/dota2/images/hero.png?t=1" },
      }),
    ).toBe(
      questionCalibrationRevision({
        ...question,
        image: { src: "https://cdn.cloudflare.steamstatic.com/apps/dota2/images/hero.png?t=2" },
      }),
    );
  });
});

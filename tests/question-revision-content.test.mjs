import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { questionCalibrationRevision } from "../src/lib/question-revision.mjs";
import { publicQuestionForRound } from "../src/lib/public-question.mjs";

const readQuestions = (file) => JSON.parse(readFileSync(new URL(`../src/data/${file}.json`, import.meta.url)));
const sound = readQuestions("soundcheck-questions").find(
  (question) => question.id === "soundcheck-ability:skeleton_king_reincarnation",
);
const recipe = readQuestions("shopkeeper-questions").find(
  (question) => question.id === "shopkeeper-recipe:abyssal_blade",
);
const round = {
  id: "content-revision-regression",
  phase: "answering",
  answerDeadline: 15_000,
  answerDuration: 15_000,
};
const revision = questionCalibrationRevision;
const publicQuestion = (question, game) => publicQuestionForRound(question, { ...round, game }, 1_000);

describe("calibration identity for audited content changes", () => {
  it("separates the corrected audible Reincarnation preview from the old silent preview", () => {
    const oldQuestion = structuredClone(sound);
    delete oldQuestion.soundcheck.clips[0].startSeconds;
    expect(sound.soundcheck.clips[0].startSeconds).toBe(0.6);
    expect(oldQuestion.audio).toEqual(sound.audio);
    expect(oldQuestion.soundcheck.clips[0].audioSha256).toBe(sound.soundcheck.clips[0].audioSha256);
    expect(publicQuestion(oldQuestion, "soundcheck").soundcheck.clips[0].duration).toBe(6.183356);
    expect(publicQuestion(sound, "soundcheck").soundcheck.clips[0].duration).toBe(5.583356);
    expect(revision(oldQuestion)).not.toBe(revision(sound));

    const otherOffset = structuredClone(sound);
    otherOffset.soundcheck.clips[0].startSeconds = 0.5;
    expect(revision(otherOffset)).not.toBe(revision(sound));
  });

  it("separates a new recipe-cost clue and later price changes without requiring different components", () => {
    expect(recipe.shopkeeper.recipeCost).toBe(1275);
    const withoutClue = structuredClone(recipe);
    delete withoutClue.shopkeeper.recipeCost;
    expect(publicQuestion(withoutClue, "shopkeeper").shopkeeper.recipeCost).toBeUndefined();
    expect(publicQuestion(recipe, "shopkeeper").shopkeeper.recipeCost).toBe(1275);
    expect(revision(withoutClue)).not.toBe(revision(recipe));

    const changedPrice = structuredClone(recipe);
    changedPrice.shopkeeper.recipeCost = 1300;
    expect(changedPrice.shopkeeper.recipeComponentKeys).toEqual(recipe.shopkeeper.recipeComponentKeys);
    expect(publicQuestion(changedPrice, "shopkeeper").shopkeeper.recipeCost).toBe(1300);
    expect(revision(changedPrice)).not.toBe(revision(recipe));
  });

  it.each([
    ["Soundcheck", sound],
    ["Shopkeeper", recipe],
  ])("keeps %s calibration when only its source review changes", (_name, question) => {
    const reviewed = structuredClone(question);
    reviewed.source = {
      label: "Independent source review",
      url: "https://example.com/review",
      references: [{ label: "Supplementary primary source", url: "https://example.com/source" }],
    };
    reviewed.patch = "reviewed-patch";
    reviewed.reviewedAt = "2030-01-01";
    reviewed.audit = { sourceType: "official-datafeed", reviewedAt: "2030-01-01" };
    if (reviewed.soundcheck) reviewed.soundcheck.audit = { reviewedAt: "2030-01-01", clientBuild: "new-build" };
    if (reviewed.shopkeeper) reviewed.shopkeeper.clientBuild = "new-build";
    expect(revision(reviewed)).toBe(revision(question));
  });
});

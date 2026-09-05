import { describe, expect, it } from "vitest";
import {
  QUESTION_REVIEW_STATES,
  effectiveQuestionReviewStatus,
  invalidReviewerSteamIds,
  isQuestionReviewer,
  isQuestionReviewState,
  reviewerSteamIds,
} from "../src/lib/question-review.mjs";

const reviewer = "76561198000000000";
const otherReviewer = "76561198000000001";
const configured = reviewerSteamIds(`${reviewer}, ${otherReviewer}\n${reviewer}`);
const reviewed = {
  gameId: "dota2",
  questionId: "question-a",
  questionRevision: "revision-a",
  state: "reviewed",
  reportTotalAtReview: 3,
  signalStatusAtReview: "reported",
  updatedAt: 1,
};

describe("reviewer allowlist", () => {
  it("parses, deduplicates, and validates SteamID64 values", () => {
    expect([...QUESTION_REVIEW_STATES]).toEqual(["open", "reviewed", "quarantined"]);
    expect(QUESTION_REVIEW_STATES.every(isQuestionReviewState)).toBe(true);
    expect(isQuestionReviewState("unreviewed")).toBe(false);
    expect(configured).toEqual([reviewer, otherReviewer]);
    expect(invalidReviewerSteamIds(`${reviewer},not-a-steamid,123`)).toEqual(["not-a-steamid", "123"]);
  });

  it("only authorizes listed Steam accounts", () => {
    expect(isQuestionReviewer({ steamId: reviewer }, configured.join(","))).toBe(true);
    expect(isQuestionReviewer({ steamId: "76561198000000002" }, configured.join(","))).toBe(false);
    expect(isQuestionReviewer(null, configured.join(","))).toBe(false);
  });
});

describe("effectiveQuestionReviewStatus", () => {
  it.each([
    [{ review: null, reportTotal: 0, signalStatus: "collecting" }, "unreviewed"],
    [{ review: null, reportTotal: 1, signalStatus: "reported" }, "open"],
    [{ review: reviewed, reportTotal: 3, signalStatus: "reported" }, "reviewed"],
    [{ review: reviewed, reportTotal: 4, signalStatus: "reported" }, "open"],
    [{ review: reviewed, reportTotal: 3, signalStatus: "too-easy" }, "open"],
    [{ review: { ...reviewed, state: "open" }, reportTotal: 3, signalStatus: "reported" }, "open"],
    [{ review: { ...reviewed, state: "quarantined" }, reportTotal: 99, signalStatus: "too-hard" }, "quarantined"],
  ])("resolves %o to %s", (input, expected) => {
    expect(effectiveQuestionReviewStatus(input)).toBe(expected);
  });
});

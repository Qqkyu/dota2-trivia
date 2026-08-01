#!/usr/bin/env node

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

if (
  QUESTION_REVIEW_STATES.join(",") !== "open,reviewed,quarantined" ||
  !QUESTION_REVIEW_STATES.every(isQuestionReviewState) ||
  isQuestionReviewState("unreviewed") ||
  configured.join(",") !== `${reviewer},${otherReviewer}` ||
  invalidReviewerSteamIds(`${reviewer},not-a-steamid,123`).join(",") !== "not-a-steamid,123" ||
  !isQuestionReviewer({ steamId: reviewer }, configured.join(",")) ||
  isQuestionReviewer({ steamId: "76561198000000002" }, configured.join(",")) ||
  isQuestionReviewer(null, configured.join(","))
) {
  throw new Error("Question reviewer configuration or authorization changed unexpectedly.");
}

const cases = [
  [{ review: null, reportTotal: 0, signalStatus: "collecting" }, "unreviewed"],
  [{ review: null, reportTotal: 1, signalStatus: "reported" }, "open"],
  [{ review: reviewed, reportTotal: 3, signalStatus: "reported" }, "reviewed"],
  [{ review: reviewed, reportTotal: 4, signalStatus: "reported" }, "open"],
  [{ review: reviewed, reportTotal: 3, signalStatus: "too-easy" }, "open"],
  [{ review: { ...reviewed, state: "open" }, reportTotal: 3, signalStatus: "reported" }, "open"],
  [{ review: { ...reviewed, state: "quarantined" }, reportTotal: 99, signalStatus: "too-hard" }, "quarantined"],
];

for (const [input, expected] of cases) {
  const actual = effectiveQuestionReviewStatus(input);
  if (actual !== expected) {
    throw new Error(`Question review state expected ${expected}, received ${actual}.`);
  }
}

console.log("Validated protected reviewer IDs and open, reviewed, reopened, and quarantined states.");

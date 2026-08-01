export const QUESTION_REVIEW_STATES = ["open", "reviewed", "quarantined"];

const ATTENTION_SIGNALS = new Set(["reported", "too-easy", "too-hard"]);

export function isQuestionReviewState(value) {
  return QUESTION_REVIEW_STATES.includes(value);
}

export function reviewerSteamIds(value = process.env.ARCADE_REVIEWER_STEAM_IDS ?? "") {
  return [
    ...new Set(
      String(value)
        .split(/[\s,]+/)
        .map((candidate) => candidate.trim())
        .filter(Boolean),
    ),
  ];
}

export function invalidReviewerSteamIds(value = process.env.ARCADE_REVIEWER_STEAM_IDS ?? "") {
  return reviewerSteamIds(value).filter((candidate) => !/^\d{17}$/.test(candidate));
}

export function isQuestionReviewer(user, value = process.env.ARCADE_REVIEWER_STEAM_IDS ?? "") {
  if (!user || typeof user.steamId !== "string") return false;
  return reviewerSteamIds(value).includes(user.steamId);
}

export function effectiveQuestionReviewStatus({ review, reportTotal, signalStatus }) {
  const needsAttention = ATTENTION_SIGNALS.has(signalStatus);
  if (!review) return needsAttention ? "open" : "unreviewed";
  if (review.state === "quarantined" || review.state === "open") return review.state;
  if (review.state !== "reviewed") return needsAttention ? "open" : "unreviewed";
  if (reportTotal > review.reportTotalAtReview) return "open";
  if (needsAttention && signalStatus !== review.signalStatusAtReview) return "open";
  return "reviewed";
}

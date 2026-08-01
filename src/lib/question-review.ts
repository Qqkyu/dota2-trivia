import type { AccountUser } from "@/lib/account-contract";
import type { CalibrationStatus } from "@/lib/calibration";
import {
  effectiveQuestionReviewStatus as effectiveStatus,
  invalidReviewerSteamIds as invalidIds,
  isQuestionReviewer as reviewerCheck,
  isQuestionReviewState as stateCheck,
  reviewerSteamIds as configuredIds,
} from "@/lib/question-review.mjs";

export const QUESTION_REVIEW_STATES = ["open", "reviewed", "quarantined"] as const;
export type QuestionReviewState = (typeof QUESTION_REVIEW_STATES)[number];
export type QuestionReviewStatus = "unreviewed" | QuestionReviewState;

export interface StoredQuestionReview {
  gameId: string;
  questionId: string;
  questionRevision: string;
  state: QuestionReviewState;
  reportTotalAtReview: number;
  signalStatusAtReview: CalibrationStatus;
  updatedAt: number;
}

export function isQuestionReviewState(value: unknown): value is QuestionReviewState {
  return stateCheck(value);
}

export function configuredReviewerSteamIds() {
  return configuredIds() as string[];
}

export function invalidReviewerSteamIds() {
  return invalidIds() as string[];
}

export function isQuestionReviewer(user: Pick<AccountUser, "steamId"> | null | undefined) {
  return reviewerCheck(user);
}

export function effectiveQuestionReviewStatus(input: {
  review: StoredQuestionReview | null;
  reportTotal: number;
  signalStatus: CalibrationStatus;
}): QuestionReviewStatus {
  return effectiveStatus(input) as QuestionReviewStatus;
}

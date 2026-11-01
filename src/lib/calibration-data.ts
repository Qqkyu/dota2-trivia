import { PUBLIC_ARCADE_MODE } from "@/lib/arcade-games.mjs";
import {
  calibrationSignal,
  emptyReportCounts,
  reportTotal,
  type CalibrationSignal,
  type ReportCounts,
} from "@/lib/calibration";
import { hideCalibrationAnswerCounts } from "@/lib/calibration.mjs";
import { DEFAULT_GAME_ID, GAME_CATALOGS, type GameId } from "@/lib/game-catalogs";
import { currentPublicRound } from "@/lib/public-rooms";
import { questionCalibrationRevision } from "@/lib/question-revision.mjs";
import {
  effectiveQuestionReviewStatus,
  type QuestionReviewState,
  type QuestionReviewStatus,
} from "@/lib/question-review";
import { gameForQuestion, type QuestionKind, type RoundGame, type TriviaCategory } from "@/lib/trivia";
import { getQuestionReviews, getQuestionStats } from "@/lib/vote-store";

export interface CalibrationRecord {
  questionId: string;
  questionRevision: string;
  prompt: string;
  eyebrow: string;
  kind: QuestionKind;
  category: TriviaCategory;
  game: RoundGame;
  difficulty: 1 | 2 | 3;
  counts: [number, number, number, number];
  total: number;
  correct: number;
  reports: ReportCounts;
  reportTotal: number;
  signal: CalibrationSignal;
  review: {
    status: QuestionReviewStatus;
    storedState: QuestionReviewState | null;
    updatedAt: number;
  };
  updatedAt: number;
}

export interface CalibrationSnapshot {
  generatedAt: number;
  gameId: GameId;
  gameLabel: string;
  contentVersion: string;
  contentLabel: string;
  totals: {
    questions: number;
    sampled: number;
    answered: number;
    answers: number;
    reports: number;
    attention: number;
    reviewQueue: number;
    reviewed: number;
    quarantined: number;
  };
  records: CalibrationRecord[];
}

function livePublicAnsweringQuestionId(now = Date.now()) {
  const { round } = currentPublicRound({ gameId: DEFAULT_GAME_ID, mode: PUBLIC_ARCADE_MODE, filter: "Mixed" }, now);
  return round.phase === "answering" ? round.questionId : null;
}

export function publicCalibrationSnapshot(
  snapshot: CalibrationSnapshot,
  liveAnsweringQuestionId: string | null = livePublicAnsweringQuestionId(),
): CalibrationSnapshot {
  return {
    ...snapshot,
    records: snapshot.records.map(
      (record) => hideCalibrationAnswerCounts(record, liveAnsweringQuestionId) as CalibrationRecord,
    ),
  };
}

const SHARED_SNAPSHOT_TTL_MS = 30_000;
const sharedSnapshots = ((
  globalThis as typeof globalThis & {
    __queueArcadeCalibrationSnapshots?: Map<GameId, { expiresAt: number; snapshot: Promise<CalibrationSnapshot> }>;
  }
).__queueArcadeCalibrationSnapshots ??= new Map());

/**
 * Public readers share one snapshot for 30 seconds. It is the heaviest public read:
 * every stored total and review across the whole catalog. Reviewers read fresh.
 */
export function getSharedCalibrationSnapshot(gameId: GameId = DEFAULT_GAME_ID, now = Date.now()) {
  const cached = sharedSnapshots.get(gameId);
  if (cached && cached.expiresAt > now) return cached.snapshot;
  const snapshot = getCalibrationSnapshot(gameId);
  sharedSnapshots.set(gameId, { expiresAt: now + SHARED_SNAPSHOT_TTL_MS, snapshot });
  snapshot.catch(() => {
    if (sharedSnapshots.get(gameId)?.snapshot === snapshot) sharedSnapshots.delete(gameId);
  });
  return snapshot;
}

/** A review changed: the next public read builds a new snapshot. */
export function forgetSharedCalibrationSnapshot(gameId: GameId) {
  sharedSnapshots.delete(gameId);
}

export async function getCalibrationSnapshot(gameId: GameId = DEFAULT_GAME_ID): Promise<CalibrationSnapshot> {
  const catalog = GAME_CATALOGS[gameId];
  const questionRevisions = new Map(
    catalog.questions.map((question) => [question.id, questionCalibrationRevision(question)]),
  );
  const [storedStats, storedReviews] = await Promise.all([
    getQuestionStats(gameId, catalog.contentVersion, questionRevisions),
    getQuestionReviews(gameId, questionRevisions),
  ]);
  const statsByQuestion = new Map(storedStats.map((stats) => [stats.questionId, stats]));
  const reviewsByQuestion = new Map(storedReviews.map((review) => [review.questionId, review]));
  const records = catalog.questions.map((question): CalibrationRecord => {
    const stats = statsByQuestion.get(question.id);
    const counts = stats?.counts ?? ([0, 0, 0, 0] as const);
    const total = counts.reduce((sum, count) => sum + count, 0);
    const correct = counts[question.correctIndex];
    const reports = stats?.reports ?? emptyReportCounts();
    const signal = calibrationSignal({
      difficulty: question.difficulty,
      total,
      correct,
      reports,
    });
    const storedReview = reviewsByQuestion.get(question.id) ?? null;

    return {
      questionId: question.id,
      questionRevision: questionCalibrationRevision(question),
      prompt: question.prompt,
      eyebrow: question.eyebrow,
      kind: question.kind,
      category: question.category,
      game: gameForQuestion(question),
      difficulty: question.difficulty,
      counts: [...counts],
      total,
      correct,
      reports: { ...reports },
      reportTotal: reportTotal(reports),
      signal,
      review: {
        status: effectiveQuestionReviewStatus({
          review: storedReview,
          reportTotal: reportTotal(reports),
          signalStatus: signal.status,
        }),
        storedState: storedReview?.state ?? null,
        updatedAt: storedReview?.updatedAt ?? 0,
      },
      updatedAt: stats?.updatedAt ?? 0,
    };
  });

  records.sort(
    (left, right) =>
      Number(right.review.status === "open") - Number(left.review.status === "open") ||
      Number(right.review.status === "quarantined") - Number(left.review.status === "quarantined") ||
      right.signal.priority - left.signal.priority ||
      right.reportTotal - left.reportTotal ||
      right.total - left.total ||
      left.prompt.localeCompare(right.prompt),
  );

  return {
    generatedAt: Date.now(),
    gameId,
    gameLabel: catalog.label,
    contentVersion: catalog.contentVersion,
    contentLabel: catalog.contentLabel,
    totals: {
      questions: records.length,
      sampled: records.filter((record) => record.signal.sampleReady).length,
      answered: records.filter((record) => record.total > 0).length,
      answers: records.reduce((total, record) => total + record.total, 0),
      reports: records.reduce((total, record) => total + record.reportTotal, 0),
      attention: records.filter((record) => ["reported", "too-easy", "too-hard"].includes(record.signal.status)).length,
      reviewQueue: records.filter((record) => record.review.status === "open").length,
      reviewed: records.filter((record) => record.review.status === "reviewed").length,
      quarantined: records.filter((record) => record.review.status === "quarantined").length,
    },
    records,
  };
}

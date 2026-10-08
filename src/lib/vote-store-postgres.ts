import { configuredPostgres, databasePool, databaseTransaction } from "@/lib/database-client";
import { ensureDatabaseSchema } from "@/lib/database-schema.mjs";
export { configuredPostgres } from "@/lib/database-client";
import type { CrowdResult, PlayerVote, ReportResult, VoteResult } from "@/lib/arcade-contract";
import { isReportReason } from "@/lib/calibration";
import type { GameId } from "@/lib/game-catalogs";
import type { StoredQuestionReview } from "@/lib/question-review";
import { roundScoreSummary } from "@/lib/scoring.mjs";
import type {
  QuestionReportInput,
  QuestionReviewInput,
  QuestionStats,
  RoundVoteInput,
  VoteStoreHealth,
} from "@/lib/vote-store";
import { anonymousVoterHash } from "@/lib/voter-hash";

type Numeric = number | string;

interface CountRow {
  count_0: Numeric;
  count_1: Numeric;
  count_2: Numeric;
  count_3: Numeric;
}

interface RoundRow extends CountRow {
  round_id: string;
  room_id: string;
  game_id: string;
  content_version: string;
  question_id: string;
}

interface VoteRow {
  answer_index: Numeric;
  answer_key: string | null;
  submitted_at: Numeric;
  base_points: Numeric;
}

interface ScoreAggregateRow {
  correct_count: Numeric;
  base_points_total: Numeric;
  base_points_best: Numeric;
}

interface KeyCountRow {
  answer_key: string;
  count: Numeric;
}

interface QuestionRow extends CountRow {
  game_id: string;
  question_id: string;
  question_revision: string;
  total: Numeric;
  correct_index: Numeric;
  report_incorrect: Numeric;
  report_outdated: Numeric;
  report_ambiguous: Numeric;
  report_unclear: Numeric;
  updated_at: Numeric;
}

interface QuestionReviewRow {
  game_id: string;
  question_id: string;
  question_revision: string;
  state: StoredQuestionReview["state"];
  report_total_at_review: Numeric;
  signal_status_at_review: StoredQuestionReview["signalStatusAtReview"];
  updated_at: Numeric;
}

function ensureSchema() {
  return ensureDatabaseSchema(databasePool());
}

function countsFrom(row: CountRow | undefined): CrowdResult["counts"] {
  if (!row) return [0, 0, 0, 0];
  return [Number(row.count_0), Number(row.count_1), Number(row.count_2), Number(row.count_3)];
}

function totalFor(counts: CrowdResult["counts"]) {
  return counts.reduce((sum, count) => sum + count, 0);
}

function playerVoteFrom(row: VoteRow | undefined): PlayerVote | null {
  if (!row) return null;
  return {
    answerIndex: Number(row.answer_index),
    submittedAt: Number(row.submitted_at),
    ...(row.answer_key ? { answerKey: row.answer_key } : {}),
  };
}

function keyCountsFrom(rows: KeyCountRow[]): CrowdResult["keyCounts"] {
  return rows.map((row) => ({ answerKey: row.answer_key, count: Number(row.count) }));
}

function reportScope(gameId: GameId, questionId: string, questionRevision: string) {
  return `report:${gameId}:${questionId}:${questionRevision}`;
}

export async function getPostgresVoteStoreHealth(): Promise<VoteStoreHealth> {
  await ensureSchema();
  await configuredPostgres()`SELECT 1 AS healthy`;
  return { backend: "postgres", ok: true };
}

export async function getRoundCrowd(roundId: string, roomId: string, voterId?: string, includeScores = false) {
  await ensureSchema();
  const hash = voterId ? anonymousVoterHash(roomId, voterId) : null;
  const rows = await configuredPostgres()<
    Array<
      CountRow &
        ScoreAggregateRow & {
          answer_index: Numeric | null;
          answer_key: string | null;
          submitted_at: Numeric | null;
          base_points: Numeric | null;
          key_counts: KeyCountRow[];
        }
    >
  >`
    SELECT round.count_0, round.count_1, round.count_2, round.count_3,
      player.answer_index, player.answer_key, player.submitted_at, player.base_points,
      scores.correct_count, scores.base_points_total, scores.base_points_best,
      COALESCE((
        SELECT json_agg(answer_counts ORDER BY answer_counts.count DESC, answer_counts.answer_key ASC)
        FROM (
          SELECT answer_key, COUNT(*) AS count
          FROM queue_arcade_round_votes
          WHERE round_id = round.round_id AND answer_key IS NOT NULL
          GROUP BY answer_key
        ) AS answer_counts
      ), '[]'::json) AS key_counts
    FROM queue_arcade_rounds AS round
    LEFT JOIN queue_arcade_round_votes AS player
      ON player.round_id = round.round_id AND player.voter_hash = ${hash}
    LEFT JOIN LATERAL (
      SELECT COUNT(*) FILTER (WHERE base_points > 0) AS correct_count,
        COALESCE(SUM(base_points), 0) AS base_points_total,
        COALESCE(MAX(base_points), 0) AS base_points_best
      FROM queue_arcade_round_votes
      WHERE round_id = round.round_id AND ${includeScores}
    ) AS scores ON TRUE
    WHERE round.round_id = ${roundId} AND round.room_id = ${roomId}
  `;
  const row = rows[0];
  const counts = countsFrom(row);
  const playerVote =
    row?.answer_index !== null && row?.submitted_at !== null && row ? playerVoteFrom(row as VoteRow) : null;
  return {
    counts,
    total: totalFor(counts),
    keyCounts: keyCountsFrom(row?.key_counts ?? []),
    scoreSummary: includeScores
      ? roundScoreSummary({
          correctCount: Number(row?.correct_count ?? 0),
          total: totalFor(counts),
          basePointsTotal: Number(row?.base_points_total ?? 0),
          basePointsBest: Number(row?.base_points_best ?? 0),
          playerBasePoints: playerVote ? Number(row.base_points) : null,
        })
      : null,
    playerVote,
  };
}

export async function getPlayerQuestionReport(
  gameId: GameId,
  contentVersion: string,
  questionId: string,
  questionRevision: string,
  voterId?: string,
) {
  void contentVersion;
  if (!voterId) return null;
  await ensureSchema();
  const rows = await configuredPostgres()<Array<{ reason: string }>>`
    SELECT reason
    FROM queue_arcade_question_reporters
    WHERE game_id = ${gameId}
      AND question_id = ${questionId}
      AND question_revision = ${questionRevision}
      AND reporter_hash = ${anonymousVoterHash(reportScope(gameId, questionId, questionRevision), voterId)}
    LIMIT 1
  `;
  return isReportReason(rows[0]?.reason) ? rows[0].reason : null;
}

export async function getQuestionStats(
  gameId: GameId,
  contentVersion: string,
  questionRevisions: ReadonlyMap<string, string>,
): Promise<QuestionStats[]> {
  await ensureSchema();
  const rows = await configuredPostgres()<QuestionRow[]>`
    SELECT game_id, question_id, question_revision, count_0, count_1, count_2, count_3,
      total, correct_index, report_incorrect, report_outdated, report_ambiguous, report_unclear, updated_at
    FROM queue_arcade_question_stats
    WHERE game_id = ${gameId}
  `;

  return rows
    .filter((row) => questionRevisions.get(row.question_id) === row.question_revision)
    .map((row) => ({
      gameId,
      contentVersion,
      questionId: row.question_id,
      counts: countsFrom(row),
      total: Number(row.total),
      correctIndex: Number(row.correct_index),
      reports: {
        incorrect: Number(row.report_incorrect),
        outdated: Number(row.report_outdated),
        ambiguous: Number(row.report_ambiguous),
        unclear: Number(row.report_unclear),
      },
      updatedAt: Number(row.updated_at),
    }));
}

function reviewFromRow(row: QuestionReviewRow): StoredQuestionReview {
  return {
    gameId: row.game_id,
    questionId: row.question_id,
    questionRevision: row.question_revision,
    state: row.state,
    reportTotalAtReview: Number(row.report_total_at_review),
    signalStatusAtReview: row.signal_status_at_review,
    updatedAt: Number(row.updated_at),
  };
}

export async function getQuestionReviews(
  gameId: GameId,
  questionRevisions: ReadonlyMap<string, string>,
): Promise<StoredQuestionReview[]> {
  await ensureSchema();
  const rows = await configuredPostgres()<QuestionReviewRow[]>`
    SELECT game_id, question_id, question_revision, state, report_total_at_review,
      signal_status_at_review, updated_at
    FROM queue_arcade_question_reviews
    WHERE game_id = ${gameId}
  `;
  return rows.filter((row) => questionRevisions.get(row.question_id) === row.question_revision).map(reviewFromRow);
}

export async function setQuestionReview(input: QuestionReviewInput): Promise<StoredQuestionReview> {
  await ensureSchema();
  const rows = await configuredPostgres()<QuestionReviewRow[]>`
    INSERT INTO queue_arcade_question_reviews (
      game_id, question_id, question_revision, state, report_total_at_review,
      signal_status_at_review, updated_at
    )
    VALUES (
      ${input.gameId}, ${input.questionId}, ${input.questionRevision}, ${input.state},
      ${input.reportTotalAtReview}, ${input.signalStatusAtReview}, ${input.updatedAt}
    )
    ON CONFLICT (game_id, question_id, question_revision) DO UPDATE SET
      state = EXCLUDED.state,
      report_total_at_review = EXCLUDED.report_total_at_review,
      signal_status_at_review = EXCLUDED.signal_status_at_review,
      updated_at = EXCLUDED.updated_at
    RETURNING game_id, question_id, question_revision, state, report_total_at_review,
      signal_status_at_review, updated_at
  `;
  if (!rows[0]) throw new Error("Question review update did not return a record.");
  return reviewFromRow(rows[0]);
}

export async function recordRoundVote(input: RoundVoteInput): Promise<Omit<VoteResult, "playerIdentity">> {
  await ensureSchema();
  return databaseTransaction(async (transaction) => {
    await transaction`
      INSERT INTO queue_arcade_rounds (
        round_id, room_id, game_id, content_version, question_id, created_at, updated_at
      )
      VALUES (
        ${input.roundId}, ${input.roomId}, ${input.gameId}, ${input.contentVersion},
        ${input.questionId}, ${input.submittedAt}, ${input.submittedAt}
      )
      ON CONFLICT (round_id) DO NOTHING
    `;

    const roundRows = await transaction<RoundRow[]>`
      SELECT round_id, room_id, game_id, content_version, question_id, count_0, count_1, count_2, count_3
      FROM queue_arcade_rounds
      WHERE round_id = ${input.roundId}
      FOR UPDATE
    `;
    const round = roundRows[0];
    if (
      !round ||
      round.room_id !== input.roomId ||
      round.game_id !== input.gameId ||
      round.content_version !== input.contentVersion ||
      round.question_id !== input.questionId
    ) {
      throw new Error("Persistent round identity mismatch.");
    }

    const voterHash = anonymousVoterHash(input.roomId, input.voterId);
    const insertedVotes = await transaction<VoteRow[]>`
      INSERT INTO queue_arcade_round_votes (
        round_id, voter_hash, answer_index, answer_key, submitted_at, base_points
      )
      VALUES (
        ${input.roundId}, ${voterHash}, ${input.answerIndex}, ${input.answerKey ?? null}, ${input.submittedAt},
        ${input.basePoints}
      )
      ON CONFLICT (round_id, voter_hash) DO NOTHING
      RETURNING answer_index, answer_key, submitted_at, base_points
    `;

    if (!insertedVotes.length) {
      const existingVotes = await transaction<VoteRow[]>`
        SELECT answer_index, answer_key, submitted_at, base_points
        FROM queue_arcade_round_votes
        WHERE round_id = ${input.roundId} AND voter_hash = ${voterHash}
        LIMIT 1
      `;
      const counts = countsFrom(round);
      return {
        accepted: false,
        counts,
        total: totalFor(counts),
        keyCounts: [],
        scoreSummary: null,
        playerVote: playerVoteFrom(existingVotes[0]),
      };
    }

    const updatedRounds = await transaction<CountRow[]>`
      UPDATE queue_arcade_rounds
      SET
        count_0 = count_0 + CASE WHEN ${input.answerIndex} = 0 THEN 1 ELSE 0 END,
        count_1 = count_1 + CASE WHEN ${input.answerIndex} = 1 THEN 1 ELSE 0 END,
        count_2 = count_2 + CASE WHEN ${input.answerIndex} = 2 THEN 1 ELSE 0 END,
        count_3 = count_3 + CASE WHEN ${input.answerIndex} = 3 THEN 1 ELSE 0 END,
        updated_at = ${input.submittedAt}
      WHERE round_id = ${input.roundId}
      RETURNING count_0, count_1, count_2, count_3
    `;
    if (input.countTowardCalibration !== false) {
      await transaction`
        INSERT INTO queue_arcade_question_stats (
          game_id, question_id, question_revision, count_0, count_1, count_2, count_3,
          total, correct_index, updated_at
        )
        VALUES (
          ${input.gameId}, ${input.questionId}, ${input.questionRevision},
          ${input.answerIndex === 0 ? 1 : 0}, ${input.answerIndex === 1 ? 1 : 0},
          ${input.answerIndex === 2 ? 1 : 0}, ${input.answerIndex === 3 ? 1 : 0},
          1, ${input.correctIndex}, ${input.submittedAt}
        )
        ON CONFLICT (game_id, question_id, question_revision) DO UPDATE SET
          count_0 = queue_arcade_question_stats.count_0 + EXCLUDED.count_0,
          count_1 = queue_arcade_question_stats.count_1 + EXCLUDED.count_1,
          count_2 = queue_arcade_question_stats.count_2 + EXCLUDED.count_2,
          count_3 = queue_arcade_question_stats.count_3 + EXCLUDED.count_3,
          total = queue_arcade_question_stats.total + 1,
          correct_index = EXCLUDED.correct_index,
          updated_at = EXCLUDED.updated_at
      `;
    }
    const counts = countsFrom(updatedRounds[0]);
    return {
      accepted: true,
      counts,
      total: totalFor(counts),
      keyCounts: [],
      scoreSummary: null,
      playerVote: playerVoteFrom(insertedVotes[0]),
    };
  });
}

export async function recordQuestionReport(input: QuestionReportInput): Promise<ReportResult> {
  await ensureSchema();
  return databaseTransaction(async (transaction) => {
    await transaction`
      INSERT INTO queue_arcade_question_stats (
        game_id, question_id, question_revision, correct_index, updated_at
      )
      VALUES (
        ${input.gameId}, ${input.questionId}, ${input.questionRevision}, ${input.correctIndex}, ${input.submittedAt}
      )
      ON CONFLICT (game_id, question_id, question_revision) DO UPDATE SET
        correct_index = EXCLUDED.correct_index,
        updated_at = EXCLUDED.updated_at
    `;

    const reporterHash = anonymousVoterHash(
      reportScope(input.gameId, input.questionId, input.questionRevision),
      input.voterId,
    );
    const inserted = await transaction<Array<{ reason: string }>>`
      INSERT INTO queue_arcade_question_reporters (
        game_id, question_id, question_revision, reporter_hash, reason, submitted_at
      )
      VALUES (
        ${input.gameId}, ${input.questionId}, ${input.questionRevision},
        ${reporterHash}, ${input.reason}, ${input.submittedAt}
      )
      ON CONFLICT (game_id, question_id, question_revision, reporter_hash) DO NOTHING
      RETURNING reason
    `;

    if (!inserted.length) {
      const existing = await transaction<Array<{ reason: string }>>`
        SELECT reason
        FROM queue_arcade_question_reporters
        WHERE game_id = ${input.gameId}
          AND question_id = ${input.questionId}
          AND question_revision = ${input.questionRevision}
          AND reporter_hash = ${reporterHash}
        LIMIT 1
      `;
      const reason = existing[0]?.reason;
      if (!isReportReason(reason)) throw new Error("Persistent question reporter identity mismatch.");
      return { accepted: false, reason };
    }

    await transaction`
      UPDATE queue_arcade_question_stats
      SET
        report_incorrect = report_incorrect + CASE WHEN ${input.reason} = 'incorrect' THEN 1 ELSE 0 END,
        report_outdated = report_outdated + CASE WHEN ${input.reason} = 'outdated' THEN 1 ELSE 0 END,
        report_ambiguous = report_ambiguous + CASE WHEN ${input.reason} = 'ambiguous' THEN 1 ELSE 0 END,
        report_unclear = report_unclear + CASE WHEN ${input.reason} = 'unclear' THEN 1 ELSE 0 END,
        updated_at = ${input.submittedAt}
      WHERE game_id = ${input.gameId}
        AND question_id = ${input.questionId}
        AND question_revision = ${input.questionRevision}
    `;
    return { accepted: true, reason: input.reason };
  });
}

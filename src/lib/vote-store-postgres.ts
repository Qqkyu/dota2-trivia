import postgres, { type Sql } from "postgres";
import type { CrowdResult, PlayerVote, ReportResult, VoteResult } from "@/lib/arcade-contract";
import { isReportReason } from "@/lib/calibration";
import type { GameId } from "@/lib/game-catalogs";
import { MAP_SENSE_MAX_CROWD_PINS } from "@/lib/map-sense";
import type { MapPosition } from "@/lib/map-types";
import type { StoredQuestionReview } from "@/lib/question-review";
import { roundScoreSummary } from "@/lib/scoring.mjs";
import type {
  QuestionReportInput,
  QuestionReviewInput,
  QuestionStats,
  RoundVoteInput,
  VoteStoreHealth,
} from "@/lib/vote-store";
import { logServerError } from "@/lib/server-diagnostics";
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
  map_x: number | null;
  map_y: number | null;
  base_points: Numeric;
}

interface ScoreAggregateRow {
  correct_count: Numeric;
  base_points_total: Numeric;
  base_points_best: Numeric;
}

interface PositionRow {
  map_x: number;
  map_y: number;
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

const globalPostgres = globalThis as typeof globalThis & {
  __queueArcadePostgres?: Sql;
  __queueArcadePostgresSchema?: Promise<void>;
  __queueArcadePostgresLastPrune?: number;
};

export function configuredPostgres() {
  const connectionString = process.env.DATABASE_URL?.trim();
  if (!connectionString) throw new Error("DATABASE_URL is required for the Postgres vote store.");

  const configuredMax = Number(process.env.DATABASE_POOL_SIZE ?? 5);
  const max = Number.isInteger(configuredMax) && configuredMax > 0 ? configuredMax : 5;
  globalPostgres.__queueArcadePostgres ??= postgres(connectionString, {
    max,
    idle_timeout: 20,
    connect_timeout: 10,
    prepare: false,
  });
  return globalPostgres.__queueArcadePostgres;
}

async function ensureSchema() {
  if (globalPostgres.__queueArcadePostgresSchema) return globalPostgres.__queueArcadePostgresSchema;
  const schemaPromise = (async () => {
    const sql = configuredPostgres();
    await sql.begin(async (transaction) => {
      await transaction`
        CREATE TABLE IF NOT EXISTS queue_arcade_rounds (
          round_id TEXT PRIMARY KEY,
          room_id TEXT NOT NULL,
          game_id TEXT NOT NULL,
          content_version TEXT NOT NULL,
          question_id TEXT NOT NULL,
          count_0 BIGINT NOT NULL DEFAULT 0,
          count_1 BIGINT NOT NULL DEFAULT 0,
          count_2 BIGINT NOT NULL DEFAULT 0,
          count_3 BIGINT NOT NULL DEFAULT 0,
          created_at BIGINT NOT NULL,
          updated_at BIGINT NOT NULL
        )
      `;
      await transaction`
        CREATE TABLE IF NOT EXISTS queue_arcade_round_votes (
          round_id TEXT NOT NULL REFERENCES queue_arcade_rounds(round_id) ON DELETE CASCADE,
          voter_hash TEXT NOT NULL,
          answer_index SMALLINT NOT NULL CHECK (answer_index BETWEEN 0 AND 3),
          answer_key TEXT,
          submitted_at BIGINT NOT NULL,
          map_x DOUBLE PRECISION,
          map_y DOUBLE PRECISION,
          base_points SMALLINT NOT NULL DEFAULT 0 CHECK (base_points BETWEEN 0 AND 1000),
          PRIMARY KEY (round_id, voter_hash)
        )
      `;
      await transaction`
        ALTER TABLE queue_arcade_round_votes
        ADD COLUMN IF NOT EXISTS answer_key TEXT
      `;
      await transaction`
        ALTER TABLE queue_arcade_round_votes
        ADD COLUMN IF NOT EXISTS base_points SMALLINT NOT NULL DEFAULT 0
      `;
      await transaction`
        CREATE INDEX IF NOT EXISTS queue_arcade_rounds_updated_at_idx
        ON queue_arcade_rounds(updated_at)
      `;
      await transaction`
        CREATE TABLE IF NOT EXISTS queue_arcade_question_stats (
          game_id TEXT NOT NULL,
          question_id TEXT NOT NULL,
          question_revision TEXT NOT NULL,
          count_0 BIGINT NOT NULL DEFAULT 0,
          count_1 BIGINT NOT NULL DEFAULT 0,
          count_2 BIGINT NOT NULL DEFAULT 0,
          count_3 BIGINT NOT NULL DEFAULT 0,
          total BIGINT NOT NULL DEFAULT 0,
          correct_index SMALLINT NOT NULL CHECK (correct_index BETWEEN 0 AND 3),
          report_incorrect BIGINT NOT NULL DEFAULT 0,
          report_outdated BIGINT NOT NULL DEFAULT 0,
          report_ambiguous BIGINT NOT NULL DEFAULT 0,
          report_unclear BIGINT NOT NULL DEFAULT 0,
          updated_at BIGINT NOT NULL,
          PRIMARY KEY (game_id, question_id, question_revision)
        )
      `;
      await transaction`
        CREATE TABLE IF NOT EXISTS queue_arcade_question_reporters (
          game_id TEXT NOT NULL,
          question_id TEXT NOT NULL,
          question_revision TEXT NOT NULL,
          reporter_hash TEXT NOT NULL,
          reason TEXT NOT NULL CHECK (reason IN ('incorrect', 'outdated', 'ambiguous', 'unclear')),
          submitted_at BIGINT NOT NULL,
          PRIMARY KEY (game_id, question_id, question_revision, reporter_hash),
          FOREIGN KEY (game_id, question_id, question_revision)
            REFERENCES queue_arcade_question_stats(game_id, question_id, question_revision)
            ON DELETE CASCADE
        )
      `;
      await transaction`
        CREATE TABLE IF NOT EXISTS queue_arcade_question_reviews (
          game_id TEXT NOT NULL,
          question_id TEXT NOT NULL,
          question_revision TEXT NOT NULL,
          state TEXT NOT NULL CHECK (state IN ('open', 'reviewed', 'quarantined')),
          report_total_at_review BIGINT NOT NULL DEFAULT 0,
          signal_status_at_review TEXT NOT NULL,
          updated_at BIGINT NOT NULL,
          PRIMARY KEY (game_id, question_id, question_revision)
        )
      `;
    });
  })();
  globalPostgres.__queueArcadePostgresSchema = schemaPromise.catch((error) => {
    globalPostgres.__queueArcadePostgresSchema = undefined;
    throw error;
  });
  return globalPostgres.__queueArcadePostgresSchema;
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
  const mapPosition =
    typeof row.map_x === "number" && typeof row.map_y === "number" ? { x: row.map_x, y: row.map_y } : undefined;
  return {
    answerIndex: Number(row.answer_index),
    submittedAt: Number(row.submitted_at),
    ...(row.answer_key ? { answerKey: row.answer_key } : {}),
    ...(mapPosition ? { mapPosition } : {}),
  };
}

function positionsFrom(rows: PositionRow[]): MapPosition[] {
  return rows.map((row) => ({ x: row.map_x, y: row.map_y })).reverse();
}

function keyCountsFrom(rows: KeyCountRow[]): CrowdResult["keyCounts"] {
  return rows.map((row) => ({ answerKey: row.answer_key, count: Number(row.count) }));
}

function reportScope(gameId: GameId, questionId: string, questionRevision: string) {
  return `report:${gameId}:${questionId}:${questionRevision}`;
}

async function maybePruneRounds() {
  const now = Date.now();
  if (now - (globalPostgres.__queueArcadePostgresLastPrune ?? 0) < 15 * 60 * 1000) return;

  const configuredHours = Number(process.env.ARCADE_ROUND_RETENTION_HOURS ?? 2);
  const retentionHours = Number.isFinite(configuredHours) && configuredHours > 0 ? configuredHours : 2;
  const expiresBefore = now - retentionHours * 60 * 60 * 1000;
  try {
    await configuredPostgres()`DELETE FROM queue_arcade_rounds WHERE updated_at < ${expiresBefore}`;
    globalPostgres.__queueArcadePostgresLastPrune = now;
  } catch (error) {
    logServerError("rounds.prune", error);
  }
}

export async function getPostgresVoteStoreHealth(): Promise<VoteStoreHealth> {
  await ensureSchema();
  await configuredPostgres()`SELECT 1 AS healthy`;
  return { backend: "postgres", ok: true };
}

export async function getRoundCrowd(roundId: string, roomId: string, voterId?: string, includeScores = false) {
  await ensureSchema();
  const sql = configuredPostgres();
  const [roundRows, voteRows, positionRows, itemCountRows, scoreRows] = await Promise.all([
    sql<RoundRow[]>`
      SELECT round_id, room_id, game_id, content_version, question_id, count_0, count_1, count_2, count_3
      FROM queue_arcade_rounds
      WHERE round_id = ${roundId} AND room_id = ${roomId}
      LIMIT 1
    `,
    voterId
      ? sql<VoteRow[]>`
          SELECT answer_index, answer_key, submitted_at, map_x, map_y, base_points
          FROM queue_arcade_round_votes
          WHERE round_id = ${roundId} AND voter_hash = ${anonymousVoterHash(roomId, voterId)}
          LIMIT 1
        `
      : Promise.resolve([] as VoteRow[]),
    sql<PositionRow[]>`
      SELECT map_x, map_y
      FROM queue_arcade_round_votes
      WHERE round_id = ${roundId} AND map_x IS NOT NULL AND map_y IS NOT NULL
      ORDER BY submitted_at DESC
      LIMIT ${MAP_SENSE_MAX_CROWD_PINS}
    `,
    sql<KeyCountRow[]>`
      SELECT answer_key, COUNT(*) AS count
      FROM queue_arcade_round_votes
      WHERE round_id = ${roundId} AND answer_key IS NOT NULL
      GROUP BY answer_key
      ORDER BY count DESC, answer_key ASC
    `,
    includeScores
      ? sql<ScoreAggregateRow[]>`
          SELECT
            COUNT(*) FILTER (WHERE base_points > 0) AS correct_count,
            COALESCE(SUM(base_points), 0) AS base_points_total,
            COALESCE(MAX(base_points), 0) AS base_points_best
          FROM queue_arcade_round_votes
          WHERE round_id = ${roundId}
        `
      : Promise.resolve([] as ScoreAggregateRow[]),
  ]);
  const counts = countsFrom(roundRows[0]);
  const scoreRow = scoreRows[0];
  return {
    counts,
    total: totalFor(counts),
    positions: positionsFrom(positionRows),
    keyCounts: keyCountsFrom(itemCountRows),
    scoreSummary:
      includeScores && scoreRow
        ? roundScoreSummary({
            correctCount: Number(scoreRow.correct_count),
            total: totalFor(counts),
            basePointsTotal: Number(scoreRow.base_points_total),
            basePointsBest: Number(scoreRow.base_points_best),
            playerBasePoints: voteRows[0] ? Number(voteRows[0].base_points) : null,
          })
        : null,
    playerVote: playerVoteFrom(voteRows[0]),
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

export async function recordRoundVote(input: RoundVoteInput): Promise<VoteResult> {
  await ensureSchema();
  await maybePruneRounds();
  const sql = configuredPostgres();

  return sql.begin(async (transaction) => {
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
        round_id, voter_hash, answer_index, answer_key, submitted_at, map_x, map_y, base_points
      )
      VALUES (
        ${input.roundId}, ${voterHash}, ${input.answerIndex}, ${input.answerKey ?? null}, ${input.submittedAt},
        ${input.mapPosition?.x ?? null}, ${input.mapPosition?.y ?? null}, ${input.basePoints}
      )
      ON CONFLICT (round_id, voter_hash) DO NOTHING
      RETURNING answer_index, answer_key, submitted_at, map_x, map_y, base_points
    `;

    if (!insertedVotes.length) {
      const existingVotes = await transaction<VoteRow[]>`
        SELECT answer_index, answer_key, submitted_at, map_x, map_y, base_points
        FROM queue_arcade_round_votes
        WHERE round_id = ${input.roundId} AND voter_hash = ${voterHash}
        LIMIT 1
      `;
      const positionRows = await transaction<PositionRow[]>`
        SELECT map_x, map_y
        FROM queue_arcade_round_votes
        WHERE round_id = ${input.roundId} AND map_x IS NOT NULL AND map_y IS NOT NULL
        ORDER BY submitted_at DESC
        LIMIT ${MAP_SENSE_MAX_CROWD_PINS}
      `;
      const itemCountRows = await transaction<KeyCountRow[]>`
        SELECT answer_key, COUNT(*) AS count
        FROM queue_arcade_round_votes
        WHERE round_id = ${input.roundId} AND answer_key IS NOT NULL
        GROUP BY answer_key
        ORDER BY count DESC, answer_key ASC
      `;
      const counts = countsFrom(round);
      return {
        accepted: false,
        counts,
        total: totalFor(counts),
        positions: positionsFrom(positionRows),
        keyCounts: keyCountsFrom(itemCountRows),
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
    const positionRows = await transaction<PositionRow[]>`
      SELECT map_x, map_y
      FROM queue_arcade_round_votes
      WHERE round_id = ${input.roundId} AND map_x IS NOT NULL AND map_y IS NOT NULL
      ORDER BY submitted_at DESC
      LIMIT ${MAP_SENSE_MAX_CROWD_PINS}
    `;
    const itemCountRows = await transaction<KeyCountRow[]>`
      SELECT answer_key, COUNT(*) AS count
      FROM queue_arcade_round_votes
      WHERE round_id = ${input.roundId} AND answer_key IS NOT NULL
      GROUP BY answer_key
      ORDER BY count DESC, answer_key ASC
    `;
    const counts = countsFrom(updatedRounds[0]);
    return {
      accepted: true,
      counts,
      total: totalFor(counts),
      positions: positionsFrom(positionRows),
      keyCounts: keyCountsFrom(itemCountRows),
      scoreSummary: null,
      playerVote: playerVoteFrom(insertedVotes[0]),
    };
  });
}

export async function recordQuestionReport(input: QuestionReportInput): Promise<ReportResult> {
  await ensureSchema();
  const sql = configuredPostgres();
  return sql.begin(async (transaction) => {
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

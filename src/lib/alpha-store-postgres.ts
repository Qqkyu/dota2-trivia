import { ALPHA_SESSION_RETENTION_DAYS } from "@/lib/alpha-analytics.mjs";
import type { AlphaIdentity, AlphaStoreHealth, StoredAlphaSession } from "@/lib/alpha-store";
import { configuredPostgres, databasePool, databaseTransaction } from "@/lib/database-client";
import { ensureDatabaseSchema } from "@/lib/database-schema.mjs";
import type { summarizeAlphaSessions } from "@/lib/alpha-analytics.mjs";
import { anonymousVoterHash } from "@/lib/voter-hash";

type Numeric = number | string;

interface AlphaSessionRow {
  session_hash: string;
  visitor_hash: string;
  started_at: Numeric;
  last_seen_at: Numeric;
  finished_at: Numeric | null;
  rounds_answered: Numeric;
  correct_answers: Numeric;
}

function configuredRetentionDays() {
  return ALPHA_SESSION_RETENTION_DAYS;
}

function hashesFor(identity: AlphaIdentity) {
  if ("sessionHash" in identity) return identity;
  return {
    sessionHash: anonymousVoterHash("alpha-session", `${identity.voterId}:${identity.sessionId}`),
    visitorHash: anonymousVoterHash("alpha-visitor", identity.voterId),
  };
}

function storedSession(row: AlphaSessionRow): StoredAlphaSession {
  return {
    sessionHash: row.session_hash,
    visitorHash: row.visitor_hash,
    startedAt: Number(row.started_at),
    lastSeenAt: Number(row.last_seen_at),
    finishedAt: row.finished_at === null ? null : Number(row.finished_at),
    roundsAnswered: Number(row.rounds_answered),
    correctAnswers: Number(row.correct_answers),
  };
}

function ensureSchema() {
  return ensureDatabaseSchema(databasePool());
}

function ownerId(identity: AlphaIdentity) {
  if ("sessionHash" in identity) return identity.userId;
  return identity.voterId.startsWith("account:") ? identity.voterId.slice("account:".length) : null;
}

export async function getPostgresAlphaStoreHealth(): Promise<AlphaStoreHealth> {
  await ensureSchema();
  await configuredPostgres()`SELECT 1 AS healthy`;
  return { backend: "postgres", ok: true, retentionDays: configuredRetentionDays() };
}

export async function recordAlphaSessionStart(identity: AlphaIdentity, at: number) {
  await ensureSchema();
  const { sessionHash, visitorHash } = hashesFor(identity);
  await configuredPostgres()`
    INSERT INTO queue_arcade_alpha_sessions (
      session_hash, visitor_hash, user_id, started_at, last_seen_at, finished_at, rounds_answered, correct_answers
    )
    VALUES (${sessionHash}, ${visitorHash}, ${ownerId(identity)}, ${at}, ${at}, NULL, 0, 0)
    ON CONFLICT (session_hash) DO UPDATE SET
      started_at = LEAST(queue_arcade_alpha_sessions.started_at, EXCLUDED.started_at),
      last_seen_at = GREATEST(queue_arcade_alpha_sessions.last_seen_at, EXCLUDED.last_seen_at)
  `;
}

export async function recordAlphaSessionRound(identity: AlphaIdentity, correct: boolean, at: number, roundId?: string) {
  await ensureSchema();
  return databaseTransaction(async (sql) => {
    const { sessionHash, visitorHash } = hashesFor(identity);
    await sql`
      INSERT INTO queue_arcade_alpha_sessions (
        session_hash, visitor_hash, user_id, started_at, last_seen_at, finished_at, rounds_answered, correct_answers
      )
      VALUES (${sessionHash}, ${visitorHash}, ${ownerId(identity)}, ${at}, ${at}, NULL, 0, 0)
      ON CONFLICT (session_hash) DO NOTHING
    `;
    if (roundId) {
      const inserted = await sql`
        INSERT INTO queue_arcade_alpha_round_events (session_hash, round_id)
        VALUES (${sessionHash}, ${roundId})
        ON CONFLICT DO NOTHING RETURNING round_id
      `;
      if (!inserted.length) return;
    }
    await sql`
      UPDATE queue_arcade_alpha_sessions
      SET last_seen_at = GREATEST(last_seen_at, ${at}),
        rounds_answered = rounds_answered + 1,
        correct_answers = correct_answers + ${Number(correct)}
      WHERE session_hash = ${sessionHash}
    `;
  });
}

export async function recordAlphaSessionFinish(identity: AlphaIdentity, at: number) {
  await ensureSchema();
  const { sessionHash, visitorHash } = hashesFor(identity);
  await configuredPostgres()`
    INSERT INTO queue_arcade_alpha_sessions (
      session_hash, visitor_hash, user_id, started_at, last_seen_at, finished_at, rounds_answered, correct_answers
    )
    VALUES (${sessionHash}, ${visitorHash}, ${ownerId(identity)}, ${at}, ${at}, ${at}, 0, 0)
    ON CONFLICT (session_hash) DO UPDATE SET
      last_seen_at = GREATEST(queue_arcade_alpha_sessions.last_seen_at, EXCLUDED.last_seen_at),
      finished_at = GREATEST(COALESCE(queue_arcade_alpha_sessions.finished_at, 0), EXCLUDED.finished_at)
  `;
}

export async function getAlphaSessionsSince(since: number): Promise<StoredAlphaSession[]> {
  await ensureSchema();
  const rows = await configuredPostgres()<AlphaSessionRow[]>`
    SELECT session_hash, visitor_hash, started_at, last_seen_at, finished_at,
      rounds_answered, correct_answers
    FROM queue_arcade_alpha_sessions
    WHERE started_at >= ${since}
    ORDER BY started_at DESC
  `;
  return rows.map(storedSession);
}

export async function deleteAlphaVisitor(voterId: string) {
  await ensureSchema();
  const visitorHash = anonymousVoterHash("alpha-visitor", voterId);
  const rows = await configuredPostgres()<Array<{ session_hash: string }>>`
    DELETE FROM queue_arcade_alpha_sessions
    WHERE visitor_hash = ${visitorHash}
    RETURNING session_hash
  `;
  return rows.length;
}

export async function getAlphaSummary(now = Date.now()): Promise<ReturnType<typeof summarizeAlphaSessions>> {
  await ensureSchema();
  const since = now - ALPHA_SESSION_RETENTION_DAYS * 86_400_000;
  const dailyStart = new Date(now);
  dailyStart.setUTCHours(0, 0, 0, 0);
  dailyStart.setUTCDate(dailyStart.getUTCDate() - 13);
  interface SummaryRow {
    sessions: Numeric;
    players: Numeric;
    returning_players: Numeric;
    rounds: Numeric;
    correct: Numeric;
    duration: Numeric;
    daily: Array<{ day: Numeric; sessions: Numeric; players: Numeric; rounds: Numeric }>;
  }
  const rows = await configuredPostgres()<SummaryRow[]>`
    WITH eligible AS (
      SELECT * FROM queue_arcade_alpha_sessions
      WHERE started_at >= ${since} AND started_at <= ${now + 60_000}
    ), visitors AS (
      SELECT visitor_hash, COUNT(*) AS visits FROM eligible GROUP BY visitor_hash
    ), days AS (
      SELECT FLOOR(started_at / 86400000.0) * 86400000 AS day,
        COUNT(*) AS sessions, COUNT(DISTINCT visitor_hash) AS players,
        COALESCE(SUM(rounds_answered), 0) AS rounds
      FROM eligible WHERE started_at >= ${dailyStart.getTime()}
      GROUP BY day
    )
    SELECT COUNT(*) AS sessions,
      (SELECT COUNT(*) FROM visitors) AS players,
      (SELECT COUNT(*) FROM visitors WHERE visits > 1) AS returning_players,
      COALESCE(SUM(rounds_answered), 0) AS rounds,
      COALESCE(SUM(correct_answers), 0) AS correct,
      COALESCE(SUM(LEAST(86400000, GREATEST(0,
        GREATEST(last_seen_at, COALESCE(finished_at, started_at)) - started_at))), 0) AS duration,
      COALESCE((SELECT json_agg(days ORDER BY day) FROM days), '[]'::json) AS daily
    FROM eligible
  `;
  const row = rows[0];
  const sessions = Number(row.sessions);
  const players = Number(row.players);
  const returningPlayers = Number(row.returning_players);
  const rounds = Number(row.rounds);
  const correct = Number(row.correct);
  const daily = new Map(row.daily.map((day) => [Number(day.day), day]));
  return {
    windowDays: ALPHA_SESSION_RETENTION_DAYS,
    sessions,
    players,
    returningPlayers,
    returnRate: players ? Math.round((returningPlayers / players) * 100) : 0,
    rounds,
    correct,
    accuracy: rounds ? Math.round((correct / rounds) * 100) : 0,
    roundsPerSession: sessions ? Math.round((rounds / sessions) * 10) / 10 : 0,
    averageMinutes: sessions ? Math.round((Number(row.duration) / sessions / 60000) * 10) / 10 : 0,
    daily: Array.from({ length: 14 }, (_, index) => {
      const timestamp = dailyStart.getTime() + index * 86_400_000;
      const day = daily.get(timestamp);
      return {
        date: new Date(timestamp).toISOString().slice(0, 10),
        sessions: Number(day?.sessions ?? 0),
        players: Number(day?.players ?? 0),
        rounds: Number(day?.rounds ?? 0),
      };
    }),
  };
}

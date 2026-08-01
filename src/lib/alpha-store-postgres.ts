import { ALPHA_SESSION_RETENTION_DAYS, isAlphaFeedback } from "@/lib/alpha-analytics.mjs";
import type { AlphaFeedback, AlphaSessionIdentity, AlphaStoreHealth, StoredAlphaSession } from "@/lib/alpha-store";
import { configuredPostgres } from "@/lib/vote-store-postgres";
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
  feedback: string | null;
}

const globalAlphaPostgres = globalThis as typeof globalThis & {
  __queueArcadeAlphaPostgresSchema?: Promise<void>;
  __queueArcadeAlphaPostgresLastPrune?: number;
};

function configuredRetentionDays() {
  return ALPHA_SESSION_RETENTION_DAYS;
}

function hashesFor(identity: AlphaSessionIdentity) {
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
    feedback: isAlphaFeedback(row.feedback) ? (row.feedback as AlphaFeedback) : null,
  };
}

async function ensureSchema() {
  if (globalAlphaPostgres.__queueArcadeAlphaPostgresSchema) {
    return globalAlphaPostgres.__queueArcadeAlphaPostgresSchema;
  }
  const schemaPromise = (async () => {
    const sql = configuredPostgres();
    await sql.begin(async (transaction) => {
      await transaction`
        CREATE TABLE IF NOT EXISTS queue_arcade_alpha_sessions (
          session_hash TEXT PRIMARY KEY,
          visitor_hash TEXT NOT NULL,
          started_at BIGINT NOT NULL,
          last_seen_at BIGINT NOT NULL,
          finished_at BIGINT,
          rounds_answered BIGINT NOT NULL DEFAULT 0,
          correct_answers BIGINT NOT NULL DEFAULT 0,
          feedback TEXT CHECK (feedback IN ('fun', 'too-easy', 'repetitive', 'confusing'))
        )
      `;
      await transaction`
        CREATE INDEX IF NOT EXISTS queue_arcade_alpha_sessions_started_at_idx
        ON queue_arcade_alpha_sessions(started_at)
      `;
      await transaction`
        CREATE INDEX IF NOT EXISTS queue_arcade_alpha_sessions_visitor_hash_idx
        ON queue_arcade_alpha_sessions(visitor_hash)
      `;
    });
  })();
  globalAlphaPostgres.__queueArcadeAlphaPostgresSchema = schemaPromise.catch((error) => {
    globalAlphaPostgres.__queueArcadeAlphaPostgresSchema = undefined;
    throw error;
  });
  return globalAlphaPostgres.__queueArcadeAlphaPostgresSchema;
}

async function maybePruneSessions() {
  const now = Date.now();
  if (now - (globalAlphaPostgres.__queueArcadeAlphaPostgresLastPrune ?? 0) < 60 * 60 * 1_000) return;
  const expiresBefore = now - configuredRetentionDays() * 24 * 60 * 60 * 1_000;
  await configuredPostgres()`DELETE FROM queue_arcade_alpha_sessions WHERE last_seen_at < ${expiresBefore}`;
  globalAlphaPostgres.__queueArcadeAlphaPostgresLastPrune = now;
}

export async function getPostgresAlphaStoreHealth(): Promise<AlphaStoreHealth> {
  await ensureSchema();
  await maybePruneSessions();
  await configuredPostgres()`SELECT 1 AS healthy`;
  return { backend: "postgres", ok: true, retentionDays: configuredRetentionDays() };
}

export async function recordAlphaSessionStart(identity: AlphaSessionIdentity, at: number) {
  await ensureSchema();
  const { sessionHash, visitorHash } = hashesFor(identity);
  await configuredPostgres()`
    INSERT INTO queue_arcade_alpha_sessions (
      session_hash, visitor_hash, started_at, last_seen_at, finished_at, rounds_answered, correct_answers, feedback
    )
    VALUES (${sessionHash}, ${visitorHash}, ${at}, ${at}, NULL, 0, 0, NULL)
    ON CONFLICT (session_hash) DO UPDATE SET
      started_at = LEAST(queue_arcade_alpha_sessions.started_at, EXCLUDED.started_at),
      last_seen_at = GREATEST(queue_arcade_alpha_sessions.last_seen_at, EXCLUDED.last_seen_at)
  `;
  await maybePruneSessions();
}

export async function recordAlphaSessionRound(identity: AlphaSessionIdentity, correct: boolean, at: number) {
  await ensureSchema();
  const { sessionHash, visitorHash } = hashesFor(identity);
  await configuredPostgres()`
    INSERT INTO queue_arcade_alpha_sessions (
      session_hash, visitor_hash, started_at, last_seen_at, finished_at, rounds_answered, correct_answers, feedback
    )
    VALUES (${sessionHash}, ${visitorHash}, ${at}, ${at}, NULL, 1, ${Number(correct)}, NULL)
    ON CONFLICT (session_hash) DO UPDATE SET
      last_seen_at = GREATEST(queue_arcade_alpha_sessions.last_seen_at, EXCLUDED.last_seen_at),
      rounds_answered = queue_arcade_alpha_sessions.rounds_answered + 1,
      correct_answers = queue_arcade_alpha_sessions.correct_answers + ${Number(correct)}
  `;
  await maybePruneSessions();
}

export async function recordAlphaSessionFinish(identity: AlphaSessionIdentity, at: number) {
  await ensureSchema();
  const { sessionHash, visitorHash } = hashesFor(identity);
  await configuredPostgres()`
    INSERT INTO queue_arcade_alpha_sessions (
      session_hash, visitor_hash, started_at, last_seen_at, finished_at, rounds_answered, correct_answers, feedback
    )
    VALUES (${sessionHash}, ${visitorHash}, ${at}, ${at}, ${at}, 0, 0, NULL)
    ON CONFLICT (session_hash) DO UPDATE SET
      last_seen_at = GREATEST(queue_arcade_alpha_sessions.last_seen_at, EXCLUDED.last_seen_at),
      finished_at = GREATEST(COALESCE(queue_arcade_alpha_sessions.finished_at, 0), EXCLUDED.finished_at)
  `;
  await maybePruneSessions();
}

export async function recordAlphaSessionFeedback(identity: AlphaSessionIdentity, feedback: AlphaFeedback, at: number) {
  await ensureSchema();
  const { sessionHash, visitorHash } = hashesFor(identity);
  await configuredPostgres()`
    INSERT INTO queue_arcade_alpha_sessions (
      session_hash, visitor_hash, started_at, last_seen_at, finished_at, rounds_answered, correct_answers, feedback
    )
    VALUES (${sessionHash}, ${visitorHash}, ${at}, ${at}, NULL, 0, 0, ${feedback})
    ON CONFLICT (session_hash) DO UPDATE SET
      last_seen_at = GREATEST(queue_arcade_alpha_sessions.last_seen_at, EXCLUDED.last_seen_at),
      feedback = EXCLUDED.feedback
  `;
  await maybePruneSessions();
}

export async function getAlphaSessionsSince(since: number): Promise<StoredAlphaSession[]> {
  await ensureSchema();
  const rows = await configuredPostgres()<AlphaSessionRow[]>`
    SELECT session_hash, visitor_hash, started_at, last_seen_at, finished_at,
      rounds_answered, correct_answers, feedback
    FROM queue_arcade_alpha_sessions
    WHERE started_at >= ${since}
    ORDER BY started_at DESC
    LIMIT 50000
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

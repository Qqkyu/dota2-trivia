const MIGRATION_LOCK = 174813177;
const CLEANUP_LOCK = 174813178;
const schemaPromises = new WeakMap();

/** @param {import("postgres").TransactionSql} sql */
async function createInitialSchema(sql) {
  await sql`
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
  await sql`
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
  await sql`ALTER TABLE queue_arcade_round_votes ADD COLUMN IF NOT EXISTS answer_key TEXT`;
  await sql`
    ALTER TABLE queue_arcade_round_votes
    ADD COLUMN IF NOT EXISTS base_points SMALLINT NOT NULL DEFAULT 0
  `;
  await sql`
    CREATE INDEX IF NOT EXISTS queue_arcade_rounds_updated_at_idx
    ON queue_arcade_rounds(updated_at)
  `;
  await sql`
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
  await sql`
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
  await sql`
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
  await sql`
    CREATE TABLE IF NOT EXISTS queue_arcade_users (
      id TEXT PRIMARY KEY,
      created_at BIGINT NOT NULL,
      updated_at BIGINT NOT NULL
    )
  `;
  await sql`
    CREATE TABLE IF NOT EXISTS queue_arcade_user_identities (
      provider TEXT NOT NULL,
      provider_user_id TEXT NOT NULL,
      user_id TEXT NOT NULL REFERENCES queue_arcade_users(id) ON DELETE CASCADE,
      display_name TEXT NOT NULL,
      avatar_url TEXT,
      profile_url TEXT NOT NULL,
      updated_at BIGINT NOT NULL,
      PRIMARY KEY (provider, provider_user_id),
      UNIQUE (user_id, provider)
    )
  `;
  await sql`
    CREATE TABLE IF NOT EXISTS queue_arcade_user_sessions (
      token_hash TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES queue_arcade_users(id) ON DELETE CASCADE,
      created_at BIGINT NOT NULL,
      expires_at BIGINT NOT NULL
    )
  `;
  await sql`
    CREATE INDEX IF NOT EXISTS queue_arcade_user_sessions_expires_at_idx
    ON queue_arcade_user_sessions(expires_at)
  `;
  await sql`
    CREATE TABLE IF NOT EXISTS queue_arcade_player_rounds (
      user_id TEXT NOT NULL REFERENCES queue_arcade_users(id) ON DELETE CASCADE,
      game_id TEXT NOT NULL,
      round_id TEXT NOT NULL,
      round_number BIGINT NOT NULL,
      question_id TEXT NOT NULL,
      question_revision TEXT NOT NULL,
      round_game TEXT NOT NULL,
      round_format TEXT NOT NULL,
      correct BOOLEAN NOT NULL,
      answer_stage SMALLINT CHECK (answer_stage BETWEEN 1 AND 3),
      submitted_at BIGINT NOT NULL,
      PRIMARY KEY (user_id, round_id)
    )
  `;
  await sql`
    CREATE INDEX IF NOT EXISTS queue_arcade_player_rounds_profile_idx
    ON queue_arcade_player_rounds(user_id, game_id, round_number)
  `;
  await sql`
    CREATE TABLE IF NOT EXISTS queue_arcade_alpha_sessions (
      session_hash TEXT PRIMARY KEY,
      visitor_hash TEXT NOT NULL,
      started_at BIGINT NOT NULL,
      last_seen_at BIGINT NOT NULL,
      finished_at BIGINT,
      rounds_answered BIGINT NOT NULL DEFAULT 0,
      correct_answers BIGINT NOT NULL DEFAULT 0
    )
  `;
  await sql`
    CREATE INDEX IF NOT EXISTS queue_arcade_alpha_sessions_started_at_idx
    ON queue_arcade_alpha_sessions(started_at)
  `;
  await sql`
    CREATE INDEX IF NOT EXISTS queue_arcade_alpha_sessions_visitor_hash_idx
    ON queue_arcade_alpha_sessions(visitor_hash)
  `;
}

/** @param {import("postgres").TransactionSql} sql */
async function addRevealTimeAndAlphaOwnership(sql) {
  // Existing results predate reveal filtering and must remain visible.
  await sql`
    ALTER TABLE queue_arcade_player_rounds
    ADD COLUMN reveal_at BIGINT NOT NULL DEFAULT 0
  `;
  await sql`
    ALTER TABLE queue_arcade_alpha_sessions
    ADD COLUMN user_id TEXT REFERENCES queue_arcade_users(id) ON DELETE CASCADE
  `;
  await sql`
    CREATE INDEX queue_arcade_alpha_sessions_user_id_idx
    ON queue_arcade_alpha_sessions(user_id) WHERE user_id IS NOT NULL
  `;
  await sql`
    CREATE INDEX queue_arcade_alpha_sessions_last_seen_at_idx
    ON queue_arcade_alpha_sessions(last_seen_at)
  `;
  await sql`
    CREATE TABLE queue_arcade_alpha_round_events (
      session_hash TEXT NOT NULL REFERENCES queue_arcade_alpha_sessions(session_hash) ON DELETE CASCADE,
      round_id TEXT NOT NULL,
      PRIMARY KEY (session_hash, round_id)
    )
  `;
  await sql`
    CREATE TABLE queue_arcade_steam_nonces (
      nonce_hash TEXT PRIMARY KEY,
      expires_at BIGINT NOT NULL
    )
  `;
  await sql`
    CREATE INDEX queue_arcade_steam_nonces_expires_at_idx
    ON queue_arcade_steam_nonces(expires_at)
  `;
}

const migrations = [
  { version: 1, name: "initial-schema", apply: createInitialSchema },
  { version: 2, name: "result-reveal-and-alpha-ownership", apply: addRevealTimeAndAlphaOwnership },
];

export const DATABASE_SCHEMA_VERSION = migrations.at(-1).version;

function migrationError(code, message, options) {
  return Object.assign(new Error(message, options), { code });
}

function validateMigrationVersions(rows) {
  for (const row of rows) {
    const migration = migrations.find((entry) => entry.version === row.version);
    if (!migration || migration.name !== row.name) {
      throw migrationError(
        "MIGRATION_MISMATCH",
        `Database migration ${row.version} does not match this application version.`,
      );
    }
  }
}

/**
 * Check deployment migrations using only SELECT privileges on the migration ledger.
 * @param {import("postgres").Sql} sql
 * @returns {Promise<void>}
 */
export async function verifyDatabaseSchema(sql) {
  const instruction = "Run node scripts/migrate-db.mjs with the migration role before starting the app.";
  let rows;
  try {
    rows = await sql`SELECT version, name FROM queue_arcade_schema_migrations ORDER BY version`;
  } catch (error) {
    if (error?.code === "42P01") {
      throw migrationError("MIGRATION_REQUIRED", `Database migrations are missing. ${instruction}`, { cause: error });
    }
    throw error;
  }
  validateMigrationVersions(rows);
  const pending = migrations.filter((migration) => !rows.some((row) => row.version === migration.version));
  if (pending.length) {
    throw migrationError(
      "MIGRATION_REQUIRED",
      `Database migrations ${pending.map((migration) => migration.version).join(", ")} are pending. ${instruction}`,
    );
  }
}

/**
 * Apply migrations under one database lock. All changes and ledger entries commit together.
 * The lock must precede table creation, including the migration ledger itself.
 * @param {import("postgres").Sql} sql
 * @returns {Promise<number[]>} Versions applied by this call.
 */
export async function migrateDatabase(sql) {
  return sql.begin(async (transaction) => {
    await transaction`SET LOCAL lock_timeout = '60s'`;
    await transaction`SELECT pg_advisory_xact_lock(${MIGRATION_LOCK})`;
    await transaction`
      CREATE TABLE IF NOT EXISTS queue_arcade_schema_migrations (
        version INTEGER PRIMARY KEY,
        name TEXT NOT NULL,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `;
    const rows = await transaction`SELECT version, name FROM queue_arcade_schema_migrations ORDER BY version`;
    validateMigrationVersions(rows);
    const applied = [];
    for (const migration of migrations) {
      if (rows.some((row) => row.version === migration.version)) continue;
      await migration.apply(transaction);
      await transaction`
        INSERT INTO queue_arcade_schema_migrations (version, name)
        VALUES (${migration.version}, ${migration.name})
      `;
      applied.push(migration.version);
    }
    return applied;
  });
}

/**
 * Share initialization within a process and retry failures on the next request.
 * Production checks the ledger without DDL unless ARCADE_AUTO_MIGRATE=true.
 * Development migrations use a database lock to cover other processes too.
 * @param {import("postgres").Sql} sql
 * @returns {Promise<void>}
 */
export function ensureDatabaseSchema(sql) {
  let promise = schemaPromises.get(sql);
  if (!promise) {
    const autoMigrate = process.env.NODE_ENV !== "production" || process.env.ARCADE_AUTO_MIGRATE === "true";
    promise = (autoMigrate ? migrateDatabase(sql) : verifyDatabaseSchema(sql))
      .then(() => {})
      .catch((error) => {
        schemaPromises.delete(sql);
        throw error;
      });
    schemaPromises.set(sql, promise);
  }
  return promise;
}

function positiveNumber(value, fallback, name) {
  if (value === undefined || value === "") return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) throw new Error(`${name} must be a positive number.`);
  return parsed;
}

/** @param {Record<string, string | undefined>} env */
export function databaseRetention(env = process.env) {
  return {
    roundRetentionHours: positiveNumber(env.ARCADE_ROUND_RETENTION_HOURS, 2, "ARCADE_ROUND_RETENTION_HOURS"),
    alphaRetentionDays: 30,
  };
}

/**
 * Run after migrations. Dry runs use a read-only transaction and do not create tables.
 * Saved player results and aggregate question statistics are not raw session data.
 * @param {import("postgres").Sql} sql
 * @param {{ now?: number; roundRetentionHours?: number; alphaRetentionDays?: number; dryRun?: boolean }} options
 */
export async function cleanupDatabase(sql, options = {}) {
  const defaults = databaseRetention();
  const now = options.now ?? Date.now();
  const roundRetentionHours = positiveNumber(
    options.roundRetentionHours,
    defaults.roundRetentionHours,
    "roundRetentionHours",
  );
  const alphaRetentionDays = positiveNumber(
    options.alphaRetentionDays,
    defaults.alphaRetentionDays,
    "alphaRetentionDays",
  );
  const roundsBefore = Math.floor(now - roundRetentionHours * 60 * 60 * 1_000);
  const alphaBefore = Math.floor(now - alphaRetentionDays * 24 * 60 * 60 * 1_000);
  if (![now, roundsBefore, alphaBefore].every(Number.isSafeInteger) || now < 0) {
    throw new Error("Cleanup timestamps must be safe integer milliseconds.");
  }
  const dryRun = options.dryRun === true;
  return sql.begin(dryRun ? "isolation level repeatable read read only" : "", async (transaction) => {
    if (dryRun) {
      const [counts] = await transaction`
        SELECT
          (SELECT COUNT(*) FROM queue_arcade_rounds WHERE updated_at < ${roundsBefore}) AS rounds,
          (SELECT COUNT(*) FROM queue_arcade_user_sessions WHERE expires_at <= ${now}) AS sessions,
          (SELECT COUNT(*) FROM queue_arcade_alpha_sessions WHERE last_seen_at < ${alphaBefore}) AS alpha_sessions,
          (SELECT COUNT(*) FROM queue_arcade_steam_nonces WHERE expires_at <= ${now}) AS steam_nonces
      `;
      return {
        dryRun,
        rounds: Number(counts.rounds),
        sessions: Number(counts.sessions),
        alphaSessions: Number(counts.alpha_sessions),
        steamNonces: Number(counts.steam_nonces),
      };
    }
    await transaction`SET LOCAL lock_timeout = '60s'`;
    await transaction`SELECT pg_advisory_xact_lock(${CLEANUP_LOCK})`;
    const rounds = await transaction`DELETE FROM queue_arcade_rounds WHERE updated_at < ${roundsBefore}`;
    const sessions = await transaction`DELETE FROM queue_arcade_user_sessions WHERE expires_at <= ${now}`;
    const alphaSessions =
      await transaction`DELETE FROM queue_arcade_alpha_sessions WHERE last_seen_at < ${alphaBefore}`;
    const steamNonces = await transaction`DELETE FROM queue_arcade_steam_nonces WHERE expires_at <= ${now}`;
    return {
      dryRun,
      rounds: rounds.count,
      sessions: sessions.count,
      alphaSessions: alphaSessions.count,
      steamNonces: steamNonces.count,
    };
  });
}

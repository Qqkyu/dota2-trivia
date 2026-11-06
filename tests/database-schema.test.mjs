import { randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import postgres from "postgres";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  cleanupDatabase,
  databaseRetention,
  ensureDatabaseSchema,
  migrateDatabase,
} from "../src/lib/database-schema.mjs";

const execute = promisify(execFile);
const databaseUrl = process.env.TEST_DATABASE_URL;
const hour = 60 * 60 * 1_000;
const day = 24 * hour;
const now = Date.UTC(2026, 9, 6);

describe("database retention configuration", () => {
  it("uses explicit positive retention values and rejects invalid values", () => {
    expect(databaseRetention({})).toEqual({ roundRetentionHours: 2, alphaRetentionDays: 30 });
    expect(databaseRetention({ ARCADE_ROUND_RETENTION_HOURS: "4" })).toEqual({
      roundRetentionHours: 4,
      alphaRetentionDays: 30,
    });
    for (const value of ["0", "-1", "NaN", "Infinity", "invalid", " "]) {
      expect(() => databaseRetention({ ARCADE_ROUND_RETENTION_HOURS: value })).toThrow("positive number");
    }
  });
});

// Set TEST_DATABASE_URL to a disposable database. Every test uses its own schema.
describe.skipIf(!databaseUrl)("PostgreSQL schema and cleanup", () => {
  let admin;
  let sql;
  let schema;

  beforeEach(async () => {
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("ARCADE_AUTO_MIGRATE", "");
    schema = `schema_test_${randomUUID().replaceAll("-", "")}`;
    admin = postgres(databaseUrl, { max: 1, connect_timeout: 5, onnotice: () => {} });
    await admin`CREATE SCHEMA ${admin(schema)}`;
    sql = postgres(databaseUrl, {
      max: 2,
      connect_timeout: 5,
      onnotice: () => {},
      connection: { search_path: schema },
    });
  });

  afterEach(async () => {
    vi.unstubAllEnvs();
    await sql?.end({ timeout: 2 });
    try {
      if (admin && schema) await admin`DROP SCHEMA IF EXISTS ${admin(schema)} CASCADE`;
    } finally {
      await admin?.end({ timeout: 2 });
    }
  });

  it("serializes fresh migrations from independent Node processes", async () => {
    const worker = `
      import postgres from 'postgres';
      import { migrateDatabase } from './src/lib/database-schema.mjs';
      const sql = postgres(process.env.TEST_DATABASE_URL, {
        max: 1, connect_timeout: 5, onnotice: () => {},
        connection: { search_path: process.env.TEST_SCHEMA }
      });
      try { console.log(JSON.stringify(await migrateDatabase(sql))); }
      finally { await sql.end({ timeout: 2 }); }
    `;
    const results = await Promise.all(
      Array.from({ length: 12 }, () =>
        execute(process.execPath, ["--input-type=module", "--eval", worker], {
          env: { ...process.env, TEST_SCHEMA: schema },
          timeout: 30_000,
        }),
      ),
    );
    expect(results.flatMap(({ stdout }) => JSON.parse(stdout))).toEqual([1, 2]);
    const versions = await sql`SELECT version FROM queue_arcade_schema_migrations ORDER BY version`;
    expect(versions.map((row) => row.version)).toEqual([1, 2]);
    expect(await migrateDatabase(sql)).toEqual([]);
  }, 40_000);

  it("preserves legacy results and adds reveal times and alpha ownership", async () => {
    await sql`
      CREATE TABLE queue_arcade_users (
        id TEXT PRIMARY KEY, created_at BIGINT NOT NULL, updated_at BIGINT NOT NULL
      )
    `;
    await sql`
      CREATE TABLE queue_arcade_player_rounds (
        user_id TEXT NOT NULL REFERENCES queue_arcade_users(id) ON DELETE CASCADE,
        game_id TEXT NOT NULL, round_id TEXT NOT NULL, round_number BIGINT NOT NULL,
        question_id TEXT NOT NULL, question_revision TEXT NOT NULL,
        round_game TEXT NOT NULL, round_format TEXT NOT NULL, correct BOOLEAN NOT NULL,
        answer_stage SMALLINT CHECK (answer_stage BETWEEN 1 AND 3), submitted_at BIGINT NOT NULL,
        PRIMARY KEY (user_id, round_id)
      )
    `;
    await sql`
      CREATE TABLE queue_arcade_alpha_sessions (
        session_hash TEXT PRIMARY KEY, visitor_hash TEXT NOT NULL, started_at BIGINT NOT NULL,
        last_seen_at BIGINT NOT NULL, finished_at BIGINT,
        rounds_answered BIGINT NOT NULL DEFAULT 0, correct_answers BIGINT NOT NULL DEFAULT 0
      )
    `;
    await sql`INSERT INTO queue_arcade_users VALUES ('legacy-user', 1, 1)`;
    await sql`
      INSERT INTO queue_arcade_player_rounds VALUES (
        'legacy-user', 'dota2', 'legacy-round', 1, 'question', 'revision', 'dota2', 'classic', TRUE, 1, 2
      )
    `;
    await sql`
      INSERT INTO queue_arcade_alpha_sessions VALUES ('legacy-session', 'legacy-visitor', 1, 2, NULL, 1, 1)
    `;
    expect(await migrateDatabase(sql)).toEqual([1, 2]);
    const [result] = await sql`SELECT correct, reveal_at FROM queue_arcade_player_rounds`;
    expect(result).toEqual({ correct: true, reveal_at: "0" });
    const [session] = await sql`SELECT rounds_answered, user_id FROM queue_arcade_alpha_sessions`;
    expect(session).toEqual({ rounds_answered: "1", user_id: null });
    await sql`
      INSERT INTO queue_arcade_alpha_sessions (session_hash, visitor_hash, started_at, last_seen_at, user_id)
      VALUES ('linked-session', 'linked-visitor', 1, 2, 'legacy-user')
    `;
    await sql`INSERT INTO queue_arcade_alpha_round_events VALUES ('linked-session', 'round')`;
    await expect(
      sql`INSERT INTO queue_arcade_alpha_round_events VALUES ('linked-session', 'round')`,
    ).rejects.toMatchObject({
      code: "23505",
    });
    await sql`DELETE FROM queue_arcade_users WHERE id = 'legacy-user'`;
    expect(await sql`SELECT * FROM queue_arcade_player_rounds`).toHaveLength(0);
    expect(await sql`SELECT * FROM queue_arcade_alpha_round_events`).toHaveLength(0);
    expect(await sql`SELECT session_hash FROM queue_arcade_alpha_sessions`).toEqual([
      { session_hash: "legacy-session" },
    ]);
    await expect(sql`
      INSERT INTO queue_arcade_alpha_sessions (session_hash, visitor_hash, started_at, last_seen_at, user_id)
      VALUES ('deleted-user-session', 'visitor', 1, 2, 'legacy-user')
    `).rejects.toMatchObject({ code: "23503" });
  });

  it("rolls back a failed migration and retries the shared initializer", async () => {
    await sql`CREATE TABLE queue_arcade_alpha_sessions (unrelated_column TEXT)`;
    const first = ensureDatabaseSchema(sql);
    expect(ensureDatabaseSchema(sql)).toBe(first);
    await expect(first).rejects.toMatchObject({ code: "42703" });
    const [state] = await sql`SELECT to_regclass('queue_arcade_schema_migrations') AS ledger`;
    expect(state.ledger).toBeNull();
    await sql`DROP TABLE queue_arcade_alpha_sessions`;
    await ensureDatabaseSchema(sql);
    expect(await migrateDatabase(sql)).toEqual([]);
  });

  it("cleans inactive data without traffic and preserves saved results and question totals", async () => {
    await ensureDatabaseSchema(sql);
    await sql`INSERT INTO queue_arcade_users VALUES ('user', 1, 1)`;
    for (const [roundId, updatedAt] of [
      ["expired", now - 2 * hour - 1],
      ["boundary", now - 2 * hour],
      ["current", now],
    ]) {
      await sql`
        INSERT INTO queue_arcade_rounds (
          round_id, room_id, game_id, content_version, question_id, created_at, updated_at
        ) VALUES (${roundId}, 'room', 'dota2', 'version', 'question', 1, ${updatedAt})
      `;
      await sql`
        INSERT INTO queue_arcade_round_votes (round_id, voter_hash, answer_index, submitted_at)
        VALUES (${roundId}, 'voter', 0, ${updatedAt})
      `;
    }
    await sql`
      INSERT INTO queue_arcade_player_rounds (
        user_id, game_id, round_id, round_number, question_id, question_revision,
        round_game, round_format, correct, submitted_at, reveal_at
      ) VALUES ('user', 'dota2', 'expired', 1, 'question', 'revision', 'dota2', 'classic', TRUE, 1, 2)
    `;
    await sql`
      INSERT INTO queue_arcade_question_stats (
        game_id, question_id, question_revision, total, correct_index, updated_at
      ) VALUES ('dota2', 'question', 'revision', 5, 0, 1)
    `;
    await sql`
      INSERT INTO queue_arcade_user_sessions VALUES
        ('expired', 'user', 1, ${now - 1}), ('boundary', 'user', 1, ${now}), ('current', 'user', 1, ${now + 1})
    `;
    await sql`
      INSERT INTO queue_arcade_alpha_sessions (session_hash, visitor_hash, started_at, last_seen_at) VALUES
        ('expired', 'visitor', 1, ${now - 30 * day - 1}),
        ('boundary', 'visitor', 1, ${now - 30 * day}),
        ('current', 'visitor', 1, ${now})
    `;
    await sql`
      INSERT INTO queue_arcade_alpha_round_events VALUES
        ('expired', 'round'), ('current', 'public:round:7'), ('current', 'r1_hashed')
    `;
    await sql`
      INSERT INTO queue_arcade_question_reporters (
        game_id, question_id, question_revision, reporter_hash, reason, submitted_at
      ) VALUES
        ('dota2', 'question', 'revision', 'old', 'unclear', ${now - 90 * day - 1}),
        ('dota2', 'question', 'revision', 'recent', 'unclear', ${now - 90 * day})
    `;
    await sql`
      INSERT INTO queue_arcade_steam_nonces VALUES ('expired', ${now - 1}), ('boundary', ${now}), ('current', ${now + 1})
    `;
    const options = { now, roundRetentionHours: 2, alphaRetentionDays: 30 };
    const preview = await cleanupDatabase(sql, { ...options, dryRun: true });
    expect(preview).toEqual({ dryRun: true, rounds: 1, sessions: 2, alphaSessions: 1, steamNonces: 2, reporters: 1 });
    expect(await sql`SELECT * FROM queue_arcade_round_votes`).toHaveLength(3);
    expect(await sql`SELECT * FROM queue_arcade_alpha_round_events`).toHaveLength(3);
    expect(await sql`SELECT * FROM queue_arcade_steam_nonces`).toHaveLength(3);
    expect(await cleanupDatabase(sql, options)).toEqual({ ...preview, dryRun: false });
    expect(await sql`SELECT round_id FROM queue_arcade_round_votes ORDER BY round_id`).toEqual([
      { round_id: "boundary" },
      { round_id: "current" },
    ]);
    expect(await sql`SELECT token_hash FROM queue_arcade_user_sessions`).toEqual([{ token_hash: "current" }]);
    expect(await sql`SELECT round_id FROM queue_arcade_alpha_round_events`).toEqual([{ round_id: "r1_hashed" }]);
    expect(await sql`SELECT reporter_hash FROM queue_arcade_question_reporters`).toEqual([{ reporter_hash: "recent" }]);
    expect(await sql`SELECT * FROM queue_arcade_alpha_sessions WHERE visitor_hash <> session_hash`).toEqual([]);
    expect(await sql`SELECT nonce_hash FROM queue_arcade_steam_nonces`).toEqual([{ nonce_hash: "current" }]);
    expect(await sql`SELECT * FROM queue_arcade_alpha_sessions`).toHaveLength(2);
    expect(await sql`SELECT * FROM queue_arcade_player_rounds`).toHaveLength(1);
    expect(await sql`SELECT total FROM queue_arcade_question_stats`).toEqual([{ total: "5" }]);
    expect(await cleanupDatabase(sql, options)).toEqual({
      dryRun: false,
      rounds: 0,
      sessions: 0,
      alphaSessions: 0,
      steamNonces: 0,
      reporters: 0,
    });
  });

  it("does not create tables during a cleanup preview", async () => {
    await expect(cleanupDatabase(sql, { dryRun: true })).rejects.toMatchObject({ code: "42P01" });
    const rows = await sql`
      SELECT tablename FROM pg_tables WHERE schemaname = ${schema}
    `;
    expect(rows).toHaveLength(0);
  });

  it("runs the deploy and cleanup commands against the configured schema", async () => {
    const url = new URL(databaseUrl);
    url.searchParams.set("search_path", schema);
    const env = { ...process.env, DATABASE_URL: url.href };
    const migrated = await execute(process.execPath, ["scripts/migrate-db.mjs"], { env });
    expect(JSON.parse(migrated.stdout)).toEqual({ ok: true, applied: [1, 2], version: 2 });
    const repeated = await execute(process.execPath, ["scripts/migrate-db.mjs"], { env });
    expect(JSON.parse(repeated.stdout)).toEqual({ ok: true, applied: [], version: 2 });
    const preview = await execute(process.execPath, ["scripts/cleanup-db.mjs", "--dry-run"], { env });
    expect(JSON.parse(preview.stdout)).toEqual({
      ok: true,
      dryRun: true,
      rounds: 0,
      sessions: 0,
      alphaSessions: 0,
      steamNonces: 0,
      reporters: 0,
    });
    const cleaned = await execute(process.execPath, ["scripts/cleanup-db.mjs"], { env });
    expect(JSON.parse(cleaned.stdout)).toEqual({
      ok: true,
      dryRun: false,
      rounds: 0,
      sessions: 0,
      alphaSessions: 0,
      steamNonces: 0,
      reporters: 0,
    });
  });

  it("refuses an unrecognized database version", async () => {
    await migrateDatabase(sql);
    await sql`INSERT INTO queue_arcade_schema_migrations (version, name) VALUES (99, 'future-schema')`;
    await expect(migrateDatabase(sql)).rejects.toThrow(
      "Database migration 99 does not match this application version.",
    );
  });

  it("checks production migrations with a runtime role that cannot create tables", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const url = new URL(databaseUrl);
    url.searchParams.set("search_path", schema);
    await execute(process.execPath, ["scripts/migrate-db.mjs"], {
      env: { ...process.env, DATABASE_URL: url.href },
    });
    const role = `runtime_test_${randomUUID().replaceAll("-", "")}`;
    const password = randomUUID().replaceAll("-", "");
    await admin.unsafe(
      `CREATE ROLE "${role}" LOGIN PASSWORD '${password}' NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT`,
    );
    const runtime = postgres(databaseUrl, {
      username: role,
      password,
      max: 1,
      connect_timeout: 5,
      connection: { search_path: schema },
      onnotice: () => {},
    });
    try {
      await admin`GRANT USAGE ON SCHEMA ${admin(schema)} TO ${admin(role)}`;
      await admin`GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA ${admin(schema)} TO ${admin(role)}`;
      await admin`
        REVOKE INSERT, UPDATE, DELETE ON ${admin(schema)}.queue_arcade_schema_migrations FROM ${admin(role)}
      `;
      const [privileges] = await runtime`
        SELECT has_schema_privilege(current_user, current_schema(), 'CREATE') AS can_create
      `;
      expect(privileges.can_create).toBe(false);
      await expect(ensureDatabaseSchema(runtime)).resolves.toBeUndefined();
      await runtime`INSERT INTO queue_arcade_users VALUES ('runtime-user', 1, 1)`;
      await runtime`UPDATE queue_arcade_users SET updated_at = 2 WHERE id = 'runtime-user'`;
      expect(await runtime`SELECT updated_at FROM queue_arcade_users`).toEqual([{ updated_at: "2" }]);
      expect((await runtime`DELETE FROM queue_arcade_users WHERE id = 'runtime-user'`).count).toBe(1);
      await expect(runtime`CREATE TABLE forbidden (id INTEGER)`).rejects.toMatchObject({ code: "42501" });
    } finally {
      await runtime.end({ timeout: 2 });
      await admin`DROP OWNED BY ${admin(role)}`;
      await admin`DROP ROLE ${admin(role)}`;
    }
  });

  it("rejects missing and pending production migrations without changing the database", async () => {
    vi.stubEnv("NODE_ENV", "production");
    await expect(ensureDatabaseSchema(sql)).rejects.toThrow("Run node scripts/migrate-db.mjs");
    expect(await sql`SELECT tablename FROM pg_tables WHERE schemaname = ${schema}`).toHaveLength(0);
    await sql`
      CREATE TABLE queue_arcade_schema_migrations (
        version INTEGER PRIMARY KEY, name TEXT NOT NULL, applied_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `;
    await sql`INSERT INTO queue_arcade_schema_migrations (version, name) VALUES (1, 'initial-schema')`;
    await expect(ensureDatabaseSchema(sql)).rejects.toThrow("Database migrations 2 are pending.");
    expect(await sql`SELECT version FROM queue_arcade_schema_migrations`).toEqual([{ version: 1 }]);
    expect(await sql`SELECT tablename FROM pg_tables WHERE schemaname = ${schema}`).toHaveLength(1);
  });

  it("permits production auto-migration only with the explicit opt-in", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("ARCADE_AUTO_MIGRATE", "1");
    await expect(ensureDatabaseSchema(sql)).rejects.toThrow("Run node scripts/migrate-db.mjs");
    vi.stubEnv("ARCADE_AUTO_MIGRATE", "true");
    await expect(ensureDatabaseSchema(sql)).resolves.toBeUndefined();
    expect(await migrateDatabase(sql)).toEqual([]);
  });
});

import { randomBytes, randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import postgres from "postgres";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { ensureDatabaseSchema, migrateDatabase } from "../src/lib/database-schema.mjs";
import { diagnosticErrorCode } from "../src/lib/diagnostic-error-code.mjs";
import { grantRuntimeDatabasePrivileges } from "../scripts/database-runtime-grants.mjs";
import { sourceStores, resetStoreGlobals } from "./helpers/source-store-loader.mjs";

// Explicit opt-in: this suite creates disposable databases and roles on a local test cluster.
const adminUrl = process.env.LAUNCH_DATABASE_TEST_URL;
const settings = { max: 1, connect_timeout: 5, prepare: false, onnotice: () => {} };
const pools = new Set();
const children = new Set();
const suffix = randomUUID().replaceAll("-", "").slice(0, 16);
const database = `launch_migrations_${suffix}`;
const migrationRole = `launch_migrator_${suffix}`;
const runtimeRole = `launch_runtime_${suffix}`;

function connection(url, username, password, schema) {
  const result = new URL(url);
  result.pathname = `/${database}`;
  if (username) result.username = username;
  if (password) result.password = password;
  if (schema) result.searchParams.set("search_path", schema);
  return result.href;
}

function pool(url, options = {}) {
  const sql = postgres(url, { ...settings, ...options });
  pools.add(sql);
  return sql;
}

function worker(script, env) {
  const child = spawn(process.execPath, [script], {
    env: { ...process.env, ...env },
    stdio: ["ignore", "pipe", "pipe"],
  });
  children.add(child);
  let stdout = "",
    stderr = "";
  child.stdout.on("data", (chunk) => {
    stdout += chunk;
  });
  child.stderr.on("data", (chunk) => {
    stderr += chunk;
  });
  const done = new Promise((resolve, reject) => {
    child.on("error", reject);
    child.on("exit", (code, signal) => {
      children.delete(child);
      resolve({ code, signal, stdout, stderr });
    });
  });
  return { child, done };
}

describe.skipIf(!adminUrl)("launch database migration and runtime privileges", () => {
  let cluster, admin, migrationUrl, runtimeUrl, schema, migrator, runtime;

  beforeAll(async () => {
    const host = new URL(adminUrl).hostname;
    if (!["localhost", "127.0.0.1", "[::1]"].includes(host)) {
      throw new Error("Launch database tests require a disposable loopback PostgreSQL cluster.");
    }
    cluster = postgres(adminUrl, settings);
    const migrationPassword = randomBytes(24).toString("hex");
    const runtimePassword = randomBytes(24).toString("hex");
    await cluster.unsafe(
      `CREATE ROLE "${migrationRole}" LOGIN PASSWORD '${migrationPassword}' NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS`,
    );
    await cluster.unsafe(
      `CREATE ROLE "${runtimeRole}" LOGIN PASSWORD '${runtimePassword}' NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS`,
    );
    await cluster`CREATE DATABASE ${cluster(database)}`;
    admin = pool(connection(adminUrl), { max: 3 });
    await admin`REVOKE CREATE ON SCHEMA public FROM PUBLIC`;
    migrationUrl = connection(adminUrl, migrationRole, migrationPassword);
    runtimeUrl = connection(adminUrl, runtimeRole, runtimePassword);
  });

  beforeEach(async () => {
    resetStoreGlobals();
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("ARCADE_AUTO_MIGRATE", "false");
    vi.stubEnv("ARCADE_AUTH_SECRET", "launch-auth-secret-with-at-least-32-bytes");
    vi.stubEnv("ARCADE_VOTER_SALT", "launch-voter-salt-with-at-least-32-bytes");
    vi.stubEnv("ARCADE_DATA_COUNTRIES", "Poland");
    vi.stubEnv("ARCADE_APP_URL", "http://localhost:3333");
    vi.stubEnv("ARCADE_TRUST_PROXY", "none");
    vi.stubEnv("ARCADE_REVIEWER_STEAM_IDS", "");
    schema = `case_${randomUUID().replaceAll("-", "")}`;
    await admin`CREATE SCHEMA ${admin(schema)} AUTHORIZATION ${admin(migrationRole)}`;
    await admin`GRANT USAGE ON SCHEMA ${admin(schema)} TO ${admin(runtimeRole)}`;
    migrator = pool(connection(migrationUrl, null, null, schema));
    runtime = pool(connection(runtimeUrl, null, null, schema), { max: 5 });
    vi.stubEnv("DATABASE_URL", connection(runtimeUrl, null, null, schema));
    globalThis.__queueArcadePostgres = runtime;
  });

  afterEach(async () => {
    for (const child of children) child.kill("SIGKILL");
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    resetStoreGlobals();
    await Promise.all([migrator?.end({ timeout: 1 }), runtime?.end({ timeout: 1 })]);
    pools.delete(migrator);
    pools.delete(runtime);
    if (admin && schema) await admin`DROP SCHEMA IF EXISTS ${admin(schema)} CASCADE`;
  });

  afterAll(async () => {
    await Promise.all([...pools].map((sql) => sql.end({ timeout: 1 })));
    if (cluster) {
      await cluster`DROP DATABASE IF EXISTS ${cluster(database)} WITH (FORCE)`;
      await cluster`DROP ROLE IF EXISTS ${cluster(runtimeRole)}`;
      await cluster`DROP ROLE IF EXISTS ${cluster(migrationRole)}`;
      await cluster.end({ timeout: 1 });
    }
  });

  async function migrate() {
    const result = await worker("scripts/migrate-db.mjs", {
      DATABASE_URL: connection(migrationUrl, null, null, schema),
    }).done;
    expect(result.code, result.stderr).toBe(0);
    return JSON.parse(result.stdout);
  }

  async function grant() {
    const result = await worker("scripts/grant-runtime-db.mjs", {
      DATABASE_URL: connection(adminUrl),
      ARCADE_DATABASE_RUNTIME_ROLE: runtimeRole,
      ARCADE_DATABASE_SCHEMA: schema,
    }).done;
    expect(result.code, result.stderr).toBe(0);
    return JSON.parse(result.stdout);
  }

  it("serializes eight real migration CLI processes under a separate owner role", async () => {
    const results = await Promise.all(Array.from({ length: 8 }, () => migrate()));
    expect(results.flatMap((result) => result.applied).sort()).toEqual([1, 2]);
    const tables = await admin`SELECT tablename, tableowner FROM pg_tables WHERE schemaname = ${schema}`;
    expect(tables.length).toBe(13);
    expect(tables.every((table) => table.tableowner === migrationRole)).toBe(true);
    expect(await migrate()).toMatchObject({ ok: true, applied: [], version: 2 });
  }, 30_000);

  it("runs migration, grant and cleanup commands at the explicit destination despite hostile PG settings", async () => {
    const hostile = {
      PGHOST: "127.0.0.2",
      PGHOSTADDR: "127.0.0.2",
      PGPORT: "1",
      PGUSER: "wrong-user",
      PGUSERNAME: "wrong-user",
      PGPASSWORD: "wrong-inherited-password",
      PGDATABASE: "wrong-database",
      PGSSL: "require",
      PGTARGETSESSIONATTRS: "standby",
      PGOPTIONS: "-c search_path=wrong_schema",
    };
    const migrated = await worker("scripts/migrate-db.mjs", {
      ...hostile,
      DATABASE_URL: connection(migrationUrl, null, null, schema),
    }).done;
    expect(migrated.code, migrated.stderr).toBe(0);
    expect(JSON.parse(migrated.stdout)).toMatchObject({ ok: true, applied: [1, 2] });
    const granted = await worker("scripts/grant-runtime-db.mjs", {
      ...hostile,
      DATABASE_URL: connection(adminUrl),
      ARCADE_DATABASE_RUNTIME_ROLE: runtimeRole,
      ARCADE_DATABASE_SCHEMA: schema,
    }).done;
    expect(granted.code, granted.stderr).toBe(0);
    expect(JSON.parse(granted.stdout)).toMatchObject({ ok: true, tables: 13 });
    expect(await runtime`SELECT version FROM queue_arcade_schema_migrations ORDER BY version`).toEqual([
      { version: 1 },
      { version: 2 },
    ]);
    const cleaned = await worker("scripts/cleanup-db.mjs", {
      ...hostile,
      DATABASE_URL: connection(runtimeUrl, null, null, schema),
    }).done;
    expect(cleaned.code, cleaned.stderr).toBe(0);
    expect(JSON.parse(cleaned.stdout)).toMatchObject({ ok: true, rounds: 0, sessions: 0, alphaSessions: 0 });
  });

  it("does not take a missing URL password from PGPASSWORD in operator commands", async () => {
    await migrate();
    for (const script of ["scripts/migrate-db.mjs", "scripts/grant-runtime-db.mjs", "scripts/cleanup-db.mjs"]) {
      const supplied = new URL(connection(migrationUrl, null, null, schema));
      const password = decodeURIComponent(supplied.password);
      supplied.password = "";
      if (script.includes("grant")) supplied.searchParams.delete("search_path");
      const result = await worker(script, {
        DATABASE_URL: supplied.href,
        PGPASSWORD: password,
        ARCADE_DATABASE_RUNTIME_ROLE: runtimeRole,
        ARCADE_DATABASE_SCHEMA: schema,
      }).done;
      expect(result.code).not.toBe(0);
      expect(result.stderr).toContain("28P01");
      expect(result.stderr).not.toContain(password);
    }
  });

  it("rejects an owning runtime role or membership in the migration role", async () => {
    await migrate();
    await expect(grantRuntimeDatabasePrivileges(admin, { role: migrationRole, schema })).rejects.toThrow(
      "must not own database objects or belong to another role",
    );
    await admin`GRANT ${admin(migrationRole)} TO ${admin(runtimeRole)}`;
    try {
      await expect(grantRuntimeDatabasePrivileges(admin, { role: runtimeRole, schema })).rejects.toThrow(
        "must not own database objects or belong to another role",
      );
    } finally {
      await admin`REVOKE ${admin(migrationRole)} FROM ${admin(runtimeRole)}`;
    }
    expect(await grant()).toMatchObject({ ok: true, tables: 13 });
  });

  it("uses real account, vote and analytics stores with CRUD while denying all schema changes", async () => {
    await migrate();
    // Deliberately broad initial grants must be removed by the deployment grant command.
    await admin`GRANT ALL ON ALL TABLES IN SCHEMA ${admin(schema)} TO ${admin(runtimeRole)}`;
    await admin`GRANT CREATE ON SCHEMA ${admin(schema)} TO ${admin(runtimeRole)}`;
    await admin`GRANT UPDATE (name), INSERT (version, name) ON ${admin(schema)}.queue_arcade_schema_migrations TO ${admin(runtimeRole)}`;
    await admin`GRANT UPDATE (name) ON ${admin(schema)}.queue_arcade_schema_migrations TO PUBLIC`;
    expect(await grant()).toMatchObject({ ok: true, tables: 13, ledger: "SELECT" });
    await ensureDatabaseSchema(runtime);
    const load = sourceStores();
    const account = load("account-store"),
      vote = load("vote-store"),
      alpha = load("alpha-store");
    const now = Date.now();
    const identity = {
      steamId: "76561198000000001",
      displayName: "Launch test",
      avatarUrl: null,
      profileUrl: "https://steamcommunity.com/profiles/76561198000000001",
      authenticatedAt: now,
    };
    const user = await account.upsertSteamUser(identity);
    await account.createAccountSession({
      userId: user.id,
      tokenHash: "launch-token",
      createdAt: now,
      expiresAt: now + 60_000,
    });
    expect((await account.getUserBySession("launch-token", now)).id).toBe(user.id);
    const voterId = `account:${user.id}`;
    const input = {
      roundId: "launch-round",
      roomId: "launch-room",
      gameId: "dota2",
      contentVersion: "launch",
      questionId: "launch-question",
      questionRevision: "launch-revision",
      correctIndex: 0,
      answerIndex: 0,
      answerKey: "answer",
      basePoints: 200,
      voterId,
      submittedAt: now,
    };
    const result = await vote.recordRoundOutcome(input, {
      account: {
        userId: user.id,
        round: {
          roundId: input.roundId,
          roundNumber: 1,
          gameId: "dota2",
          questionId: input.questionId,
          questionRevision: input.questionRevision,
          roundGame: "trivia",
          roundFormat: "classic-item-prices",
          correct: true,
          answerStage: null,
          submittedAt: now,
          revealAt: now,
        },
      },
      alpha: { key: alpha.alphaSessionKey({ voterId, sessionId: "launch-session" }), correct: true },
    });
    expect(result.accepted).toBe(true);
    expect((await vote.getRoundCrowd(input.roundId, input.roomId)).total).toBe(1);
    expect((await account.getAccountProfile(user.id, "dota2", now)).stats.answered).toBe(1);
    expect((await alpha.getAlphaSessionsSince(now - 1))[0].roundsAnswered).toBe(1);
    expect(await account.consumeSteamLoginNonce("launch-nonce", now + 60_000)).toBe(true);
    expect(await account.consumeSteamLoginNonce("launch-nonce", now + 60_000)).toBe(false);
    await account.updateSteamUser(user.id, { ...identity, displayName: "Updated launch test" });
    await account.deleteAccountData(user.id);
    expect(await account.getUserBySession("launch-token", now)).toBeNull();
    expect(await runtime`SELECT * FROM queue_arcade_alpha_sessions`).toHaveLength(0);
    const denied = [
      "CREATE TABLE forbidden (id integer)",
      "CREATE TEMP TABLE forbidden_temp (id integer)",
      "CREATE SCHEMA forbidden_schema",
      "ALTER TABLE queue_arcade_rounds ADD COLUMN forbidden integer",
      "DROP TABLE queue_arcade_rounds CASCADE",
      "TRUNCATE queue_arcade_rounds CASCADE",
      "DELETE FROM queue_arcade_schema_migrations",
      "UPDATE queue_arcade_schema_migrations SET name = 'forbidden'",
      "INSERT INTO queue_arcade_schema_migrations (version, name) VALUES (99, 'forbidden')",
    ];
    for (const query of denied) await expect(runtime.unsafe(query), query).rejects.toMatchObject({ code: "42501" });
    await expect(migrateDatabase(runtime)).rejects.toMatchObject({ code: "42501" });
    const [rights] =
      await runtime`SELECT has_database_privilege(current_user, current_database(), 'CREATE') AS create_database_objects, has_database_privilege(current_user, current_database(), 'TEMP') AS temporary, has_schema_privilege(current_user, current_schema(), 'CREATE') AS create_schema_objects`;
    expect(rights).toEqual({ create_database_objects: false, temporary: false, create_schema_objects: false });
  }, 30_000);

  it.each(["missing", "pending", "mismatch"])(
    "fails production readiness closed for %s migrations without DDL",
    async (state) => {
      if (state !== "missing") {
        await migrator`CREATE TABLE queue_arcade_schema_migrations (version integer PRIMARY KEY, name text NOT NULL)`;
        await migrator`INSERT INTO queue_arcade_schema_migrations VALUES (${state === "pending" ? 1 : 99}, ${state === "pending" ? "initial-schema" : "future"})`;
        await admin`GRANT SELECT ON ${admin(schema)}.queue_arcade_schema_migrations TO ${admin(runtimeRole)}`;
      }
      let error;
      try {
        await ensureDatabaseSchema(runtime);
      } catch (caught) {
        error = caught;
      }
      expect(error).toBeInstanceOf(Error);
      expect(diagnosticErrorCode(error)).toBe(state === "mismatch" ? "MIGRATION_MISMATCH" : "MIGRATION_REQUIRED");
      vi.spyOn(console, "error").mockImplementation(() => {});
      // Match Next's TypeScript resolution for extensionless imports with .mjs companions.
      const { GET } = sourceStores()("../app/api/health/route");
      const response = await GET(new Request("http://localhost:3333/api/health"));
      expect(response.status).toBe(503);
      expect(await response.json()).toMatchObject({
        status: "unavailable",
        storage: { backend: "postgres", ok: false },
      });
      const tables = await admin`SELECT tablename FROM pg_tables WHERE schemaname = ${schema}`;
      expect(tables).toHaveLength(state === "missing" ? 0 : 1);
      if (state === "missing") {
        await migrate();
        await grant();
        const ready = await GET(new Request("http://localhost:3333/api/health"));
        expect(ready.status, JSON.stringify(console.error.mock.calls)).toBe(200);
        expect((await ready.json()).status).toBe("ready");
      }
    },
    30_000,
  );

  it.each(["SIGKILL", "backend-termination"])(
    "rolls back all migration DDL and ledger changes after %s",
    async (mode) => {
      await migrator`CREATE TABLE queue_arcade_alpha_sessions (session_hash text PRIMARY KEY, visitor_hash text NOT NULL, started_at bigint NOT NULL, last_seen_at bigint NOT NULL, finished_at bigint, rounds_answered bigint NOT NULL DEFAULT 0, correct_answers bigint NOT NULL DEFAULT 0)`;
      await migrator`INSERT INTO queue_arcade_alpha_sessions VALUES ('legacy', 'visitor', 1, 2, NULL, 1, 1)`;
      const blocker = await admin.reserve();
      const migrationConnection = new URL(connection(migrationUrl, null, null, schema));
      migrationConnection.searchParams.set("application_name", schema);
      let process;
      try {
        await blocker`BEGIN`;
        await blocker`LOCK TABLE ${admin(schema)}.queue_arcade_alpha_sessions IN ACCESS EXCLUSIVE MODE`;
        process = worker("scripts/migrate-db.mjs", { DATABASE_URL: migrationConnection.href });
        let backend;
        await vi.waitFor(
          async () => {
            [backend] =
              await admin`SELECT pid, query FROM pg_stat_activity WHERE application_name = ${schema} AND wait_event_type = 'Lock' AND query LIKE '%queue_arcade_alpha_sessions%'`;
            expect(backend).toBeDefined();
          },
          { timeout: 10_000, interval: 20 },
        );
        if (mode === "SIGKILL") process.child.kill("SIGKILL");
        else await admin`SELECT pg_terminate_backend(${backend.pid})`;
        const outcome = await process.done;
        expect(outcome.code).not.toBe(0);
        // PostgreSQL detects a dead client when its blocked statement can resume.
        await blocker`ROLLBACK`;
        await vi.waitFor(
          async () => {
            const rows = await admin`SELECT pid FROM pg_stat_activity WHERE application_name = ${schema}`;
            expect(rows).toHaveLength(0);
          },
          { timeout: 5_000, interval: 20 },
        );
        const tables = await admin`SELECT tablename FROM pg_tables WHERE schemaname = ${schema}`;
        expect(tables).toEqual([{ tablename: "queue_arcade_alpha_sessions" }]);
      } finally {
        process?.child.kill("SIGKILL");
        await blocker`ROLLBACK`;
        blocker.release();
      }
      expect(await migrator`SELECT rounds_answered, correct_answers FROM queue_arcade_alpha_sessions`).toEqual([
        { rounds_answered: "1", correct_answers: "1" },
      ]);
      expect(await migrate()).toMatchObject({ ok: true, applied: [1, 2] });
      expect(await migrator`SELECT version FROM queue_arcade_schema_migrations ORDER BY version`).toEqual([
        { version: 1 },
        { version: 2 },
      ]);
    },
    30_000,
  );
});

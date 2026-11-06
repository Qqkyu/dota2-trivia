import { randomUUID } from "node:crypto";
import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import postgres from "postgres";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { migrateDatabase } from "../src/lib/database-schema.mjs";
import {
  backupDatabase,
  databaseInventory,
  parseDatabaseConnection,
  readBackup,
  restoreDatabase,
} from "../scripts/database-backup.mjs";
import { sourceStores, resetStoreGlobals } from "./helpers/source-store-loader.mjs";

const databaseUrl = process.env.TEST_DATABASE_URL;
const options = { max: 1, prepare: false, connect_timeout: 5, onnotice: () => {} };

describe("backup connection contract", () => {
  it.each([
    "postgres://localhost/db",
    "postgres://user@localhost/",
    "https://user@localhost/db",
    "postgres://user@localhost/db?hostaddr=127.0.0.2",
    "postgres://user@localhost/db?sslmode=prefer",
    "postgres://user@localhost/db?sslmode=disable&sslmode=verify-full",
    "postgres://user@localhost/db?sslrootcert=/unimplemented/custom-ca.pem",
    "postgres://user@localhost/db?connect_timeout=0",
  ])("rejects incomplete or unsupported connection settings: %s", (url) => {
    expect(() => parseDatabaseConnection(url)).toThrow();
  });
  it("uses explicit defaults and decodes URL credentials without reading PG environment", () => {
    const parsed = parseDatabaseConnection("postgres://test%40user:p%3Aa%24%24@127.0.0.1/arcade?sslmode=require");
    expect(parsed).toMatchObject({
      host: "127.0.0.1",
      port: 5432,
      username: "test@user",
      password: "p:a$$",
      database: "arcade",
      ssl: true,
      timeout: 10,
      target: "read-write",
    });
  });
});

describe.skipIf(!databaseUrl)("PostgreSQL snapshot backup and isolated restore", () => {
  let admin, source, target, sourceUrl, targetUrl, directory, databases;
  beforeEach(async () => {
    directory = await mkdtemp(path.join(os.tmpdir(), "queue-backup-test-"));
    admin = postgres(databaseUrl, options);
    databases = ["backup", "restore"].map((kind) => `qa_${kind}_${randomUUID().replaceAll("-", "")}`);
    for (const database of databases) await admin`CREATE DATABASE ${admin(database)}`;
    [sourceUrl, targetUrl] = databases.map((database) => {
      const url = new URL(databaseUrl);
      url.pathname = `/${database}`;
      return url.toString();
    });
    source = postgres(sourceUrl, { ...options, max: 5 });
    target = postgres(targetUrl, options);
    await migrateDatabase(source);
  });
  afterEach(async () => {
    vi.unstubAllEnvs();
    resetStoreGlobals();
    await Promise.all([source?.end({ timeout: 2 }), target?.end({ timeout: 2 })]);
    for (const database of databases ?? []) await admin`DROP DATABASE IF EXISTS ${admin(database)} WITH (FORCE)`;
    await admin?.end({ timeout: 2 });
    await rm(directory, { recursive: true, force: true });
  });

  it("restores every table from the same snapshot while real account votes continue", async () => {
    vi.stubEnv("DATABASE_URL", sourceUrl);
    vi.stubEnv("ARCADE_VOTER_SALT", "backup-fixture-only-private-salt");
    resetStoreGlobals();
    globalThis.__queueArcadePostgres = source;
    const load = sourceStores();
    const account = load("account-store");
    const vote = load("vote-store");
    const alpha = load("alpha-store");
    const now = Date.now();
    const users = await Promise.all(
      Array.from({ length: 12 }, (_, index) =>
        account.upsertSteamUser({
          steamId: String(76561198000000000n + BigInt(index)),
          displayName: `Recovery player ${index}`,
          avatarUrl: null,
          profileUrl: `https://steamcommunity.com/profiles/${index}`,
          authenticatedAt: now,
        }),
      ),
    );
    for (const user of users)
      await account.createAccountSession({
        userId: user.id,
        tokenHash: `session-${user.id}`,
        createdAt: now,
        expiresAt: now + 86_400_000,
      });
    let committed = 0;
    let stop = false;
    async function answer(user, index) {
      const voterId = `account:${user.id}`;
      const roundId = `backup-round-${index}`;
      const correct = index % 4 === 0;
      const result = await vote.recordRoundOutcome(
        {
          roundId,
          roomId: "backup-room",
          gameId: "dota2",
          contentVersion: "backup-test",
          questionId: `question-${index % 10}`,
          questionRevision: "revision-1",
          correctIndex: 0,
          answerIndex: index % 4,
          answerKey: `answer-${index % 4}`,
          basePoints: correct ? 200 : 0,
          voterId,
          submittedAt: now + index,
        },
        {
          account: {
            userId: user.id,
            round: {
              roundId,
              roundNumber: index,
              gameId: "dota2",
              questionId: `question-${index % 10}`,
              questionRevision: "revision-1",
              roundGame: "trivia",
              roundFormat: "classic-item-prices",
              correct,
              answerStage: null,
              submittedAt: now + index,
              revealAt: now + index + 15_800,
            },
          },
          alpha: { key: alpha.alphaSessionKey({ voterId, sessionId: `recovery-session-${voterId}` }), correct },
        },
      );
      if (result.accepted) committed += 1;
    }
    await Promise.all(users.map((user) => answer(user, 0)));
    const initial = committed;
    const writers = users.map(async (user) => {
      for (let index = 1; !stop && index < 200; index += 1) await answer(user, index);
    });
    const outputDirectory = path.join(directory, "snapshot");
    // These destination and connection overrides must not redirect either client.
    vi.stubEnv("PGHOSTADDR", "127.0.0.2");
    vi.stubEnv("PGSERVICE", "a-service-that-does-not-exist");
    vi.stubEnv("PGOPTIONS", "-c search_path=wrong_schema");
    vi.stubEnv("PGSSL", "require");
    vi.stubEnv("PGPORT", "1");
    vi.stubEnv("PGPASSWORD", "wrong-inherited-password");
    let backup;
    try {
      backup = await backupDatabase({ connectionString: sourceUrl, outputDirectory });
    } finally {
      stop = true;
      await Promise.all(writers);
    }
    expect(committed).toBeGreaterThan(initial);
    expect(backup.tables).toBe(13);
    expect((await stat(outputDirectory)).mode & 0o777).toBe(0o700);
    expect((await stat(path.join(outputDirectory, "backup.dump"))).mode & 0o777).toBe(0o600);
    const { manifest } = await readBackup(outputDirectory);
    await target.end(); // The restore guard requires no other clients.
    target = undefined;
    const restored = await restoreDatabase({ connectionString: targetUrl, inputDirectory: outputDirectory });
    expect(restored.verified).toBe(true);
    vi.unstubAllEnvs();
    target = postgres(targetUrl, options);
    const inventory = await target.begin("isolation level repeatable read read only", databaseInventory);
    expect(inventory.tables).toEqual(manifest.tables);
    const [{ votes, profiles, events, stats, sessions }] = await target`
      SELECT (SELECT COUNT(*)::integer FROM queue_arcade_round_votes) AS votes,
        (SELECT COUNT(*)::integer FROM queue_arcade_player_rounds) AS profiles,
        (SELECT COUNT(*)::integer FROM queue_arcade_alpha_round_events) AS events,
        (SELECT SUM(total)::integer FROM queue_arcade_question_stats) AS stats,
        (SELECT SUM(rounds_answered)::integer FROM queue_arcade_alpha_sessions) AS sessions
    `;
    expect(votes).toBeGreaterThanOrEqual(initial);
    expect(votes).toBeLessThan(committed);
    expect([profiles, events, stats, sessions]).toEqual([votes, votes, votes, votes]);
  }, 30_000);

  it("refuses corrupted archives, original sources and nonempty targets before restore", async () => {
    const outputDirectory = path.join(directory, "snapshot");
    await backupDatabase({ connectionString: sourceUrl, outputDirectory });
    await expect(
      restoreDatabase({ connectionString: sourceUrl, inputDirectory: outputDirectory }),
    ).rejects.toMatchObject({ code: "RESTORE_TARGET_IS_SOURCE" });
    await target`CREATE TABLE keep_me (value TEXT)`;
    await target`INSERT INTO keep_me VALUES ('retained')`;
    await target.end();
    target = undefined;
    await expect(
      restoreDatabase({ connectionString: targetUrl, inputDirectory: outputDirectory }),
    ).rejects.toMatchObject({ code: "RESTORE_TARGET_NOT_EMPTY" });
    const dumpPath = path.join(outputDirectory, "backup.dump");
    const bytes = await readFile(dumpPath);
    bytes[bytes.length - 10] ^= 1;
    await writeFile(dumpPath, bytes);
    await expect(
      restoreDatabase({ connectionString: targetUrl, inputDirectory: outputDirectory }),
    ).rejects.toMatchObject({ code: "BACKUP_CHECKSUM_MISMATCH" });
    target = postgres(targetUrl, options);
    expect(await target`SELECT * FROM keep_me`).toEqual([{ value: "retained" }]);
  }, 15_000);

  it("rolls the whole restore back when data loading fails after schema creation", async () => {
    await source.unsafe(
      `CREATE FUNCTION restore_fault() RETURNS boolean LANGUAGE sql AS $$ SELECT current_database() = '${databases[0]}' $$`,
    );
    await source`ALTER TABLE queue_arcade_users ADD CONSTRAINT fixture_restore_failure CHECK (restore_fault())`;
    await source`INSERT INTO queue_arcade_users VALUES ('fault-user', 1, 1)`;
    const outputDirectory = path.join(directory, "fault-snapshot");
    await backupDatabase({ connectionString: sourceUrl, outputDirectory });
    await target.end();
    target = undefined;
    await expect(
      restoreDatabase({ connectionString: targetUrl, inputDirectory: outputDirectory }),
    ).rejects.toMatchObject({ code: "PG_RESTORE_FAILED" });
    target = postgres(targetUrl, options);
    expect(await target`SELECT tablename FROM pg_tables WHERE schemaname = 'public'`).toHaveLength(0);
    expect(
      await target`SELECT proname FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'public'`,
    ).toHaveLength(0);
  }, 15_000);

  it("leaves the target empty when the restore connection is terminated during COPY", async () => {
    await source.unsafe(`CREATE FUNCTION recovery_pause() RETURNS boolean LANGUAGE plpgsql AS $$
      BEGIN
        IF current_database() <> '${databases[0]}' THEN PERFORM pg_sleep(0.02); END IF;
        RETURN true;
      END $$`);
    await source`ALTER TABLE queue_arcade_users ADD CONSTRAINT fixture_restore_pause CHECK (recovery_pause())`;
    await source`INSERT INTO queue_arcade_users SELECT 'interrupted-' || n, 1, 1 FROM generate_series(1, 250) n`;
    const outputDirectory = path.join(directory, "interrupted-snapshot");
    await backupDatabase({ connectionString: sourceUrl, outputDirectory });
    await target.end();
    target = undefined;
    const restoring = restoreDatabase({ connectionString: targetUrl, inputDirectory: outputDirectory }).then(
      () => ({ ok: true }),
      (error) => ({ ok: false, code: error.code }),
    );
    let restorePid;
    await vi.waitFor(
      async () => {
        const rows = await admin`SELECT pid FROM pg_stat_activity WHERE datname = ${databases[1]}
        AND application_name = 'queue-arcade-pg_restore' AND query LIKE 'COPY%'`;
        expect(rows).toHaveLength(1);
        restorePid = rows[0].pid;
      },
      { timeout: 5_000, interval: 10 },
    );
    await admin`SELECT pg_terminate_backend(${restorePid})`;
    expect(await restoring).toEqual({ ok: false, code: "PG_RESTORE_FAILED" });
    target = postgres(targetUrl, options);
    expect(await target`SELECT tablename FROM pg_tables WHERE schemaname = 'public'`).toHaveLength(0);
  }, 15_000);
});

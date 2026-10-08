import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { existsSync, readFileSync, realpathSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import postgres from "postgres";
import { cleanupDatabase, migrateDatabase } from "../src/lib/database-schema.mjs";
import { resetStoreGlobals, sourceStores } from "../tests/helpers/source-store-loader.mjs";

// This audit command never reads DATABASE_URL or an environment file.
const root = "/tmp/queue-arcade-launch-checks/pg-runtime";
const marker = JSON.parse(readFileSync(path.join(root, "cluster.json"), "utf8"));
assert.equal(realpathSync(marker.root), root);
assert.equal(marker.auditOnly, true);
assert.equal(marker.owner, process.getuid());
assert.equal(statSync(path.join(root, "data")).uid, process.getuid());
assert.equal(realpathSync(marker.data), path.join(root, "data"));
assert(Number.isInteger(marker.port) && marker.port > 1024 && marker.port < 65536);
const phase = process.argv[2] ?? "churn";
assert(
  ["churn", "snapshot", "verify", "inflight"].includes(phase),
  "Usage: check-db-runtime.mjs [churn|snapshot|verify|inflight]",
);
const connection = `postgres://${encodeURIComponent(marker.user)}@127.0.0.1:${marker.port}/qa_launch_runtime`;
const admin = postgres(connection, { max: 1, prepare: false, connect_timeout: 5, onnotice: () => {} });
const [server] = await admin`
  SELECT current_database() AS database, current_setting('data_directory') AS data_directory,
    current_setting('server_version') AS version, current_setting('fsync') AS fsync,
    current_setting('synchronous_commit') AS synchronous_commit,
    current_setting('full_page_writes') AS full_page_writes
`;
assert.equal(server.database, "qa_launch_runtime");
assert.equal(realpathSync(server.data_directory), marker.data);
for (const key of ["fsync", "synchronous_commit", "full_page_writes"]) assert.equal(server[key], "on");

const resultPath = path.join(root, "runtime-result.json");
const prior = phase === "churn" ? null : JSON.parse(readFileSync(resultPath, "utf8"));
const schema = prior?.schema ?? `runtime_${randomUUID().replaceAll("-", "")}`;
if (!prior) await admin`CREATE SCHEMA ${admin(schema)}`;
const sql = postgres(connection, {
  max: 20,
  prepare: false,
  connect_timeout: 5,
  onnotice: () => {},
  connection: {
    search_path: schema,
    application_name: schema,
    statement_timeout: phase === "inflight" ? 0 : 15000,
    lock_timeout: 5000,
  },
});
const maintenance = postgres(connection, {
  max: 2,
  prepare: false,
  connect_timeout: 5,
  onnotice: () => {},
  connection: { search_path: schema, application_name: `${schema}_cleanup` },
});
const day = 86400000;
const now = Date.now();
const tables = [
  "queue_arcade_rounds",
  "queue_arcade_round_votes",
  "queue_arcade_question_stats",
  "queue_arcade_users",
  "queue_arcade_user_identities",
  "queue_arcade_user_sessions",
  "queue_arcade_player_rounds",
  "queue_arcade_alpha_sessions",
  "queue_arcade_alpha_round_events",
  "queue_arcade_steam_nonces",
];
async function snapshot() {
  const result = {};
  for (const table of tables) {
    const rows = await sql`SELECT row_to_json(record) AS value FROM ${sql(table)} AS record`;
    const canonical = rows
      .map((row) => JSON.stringify(row.value))
      .sort()
      .join("\n");
    result[table] = { rows: rows.length, sha256: createHash("sha256").update(canonical).digest("hex") };
  }
  return result;
}
function identity(index) {
  return {
    steamId: String(76561198000000000n + BigInt(index)),
    displayName: `Audit player ${index}`,
    avatarUrl: null,
    profileUrl: `https://steamcommunity.com/profiles/${76561198000000000n + BigInt(index)}`,
    authenticatedAt: now,
  };
}
function voteInput(userId, round, submittedAt = now) {
  return {
    roundId: `round-${round}`,
    roomId: "audit-room",
    gameId: "dota2",
    contentVersion: "audit-release",
    questionId: `question-${round}`,
    questionRevision: "audit-revision",
    correctIndex: 0,
    answerIndex: 0,
    answerKey: "audit-answer",
    basePoints: 200,
    voterId: `account:${userId}`,
    submittedAt,
  };
}
function effects(alpha, userId, vote) {
  return {
    account: {
      userId,
      round: {
        roundId: vote.roundId,
        roundNumber: 1,
        gameId: "dota2",
        questionId: vote.questionId,
        questionRevision: vote.questionRevision,
        roundGame: "trivia",
        roundFormat: "classic-item-prices",
        correct: true,
        answerStage: null,
        submittedAt: vote.submittedAt,
        revealAt: vote.submittedAt + 15800,
      },
    },
    alpha: { key: alpha.alphaSessionKey({ voterId: vote.voterId, sessionId: "audit-session" }), correct: true },
  };
}
async function verifyCounts(account, alpha, accepted, deleted) {
  const [{ votes, counters, calibration }] = await sql`
    SELECT (SELECT COUNT(*) FROM queue_arcade_round_votes WHERE round_id LIKE 'round-live-%') AS votes,
      (SELECT COALESCE(SUM(count_0 + count_1 + count_2 + count_3), 0)
        FROM queue_arcade_rounds WHERE round_id LIKE 'round-live-%') AS counters,
      (SELECT COALESCE(SUM(total), 0) FROM queue_arcade_question_stats
        WHERE question_id LIKE 'question-live-%') AS calibration
  `;
  assert.equal(Number(votes), accepted.length);
  assert.equal(Number(counters), accepted.length);
  assert.equal(Number(calibration), accepted.length);
  const unique = new Set(accepted.map(({ userId, roundId }) => `${userId}:${roundId}`));
  assert.equal(unique.size, accepted.length, "Concurrent retries must not apply effects twice");
  const expectedByUser = new Map();
  for (const { userId } of accepted) expectedByUser.set(userId, (expectedByUser.get(userId) ?? 0) + 1);
  for (const [userId, expected] of expectedByUser) {
    if (deleted.has(userId)) continue;
    assert.equal((await account.getAccountProfile(userId, "dota2", now + 20000)).stats.answered, expected);
    const sessions = await sql`SELECT rounds_answered FROM queue_arcade_alpha_sessions WHERE user_id = ${userId}`;
    assert.equal(sessions.length, 1);
    assert.equal(Number(sessions[0].rounds_answered), expected);
  }
  for (const userId of deleted) {
    assert.equal(await account.accountExists(userId), false);
    for (const table of ["queue_arcade_user_identities", "queue_arcade_player_rounds", "queue_arcade_alpha_sessions"]) {
      assert.equal((await sql`SELECT * FROM ${sql(table)} WHERE user_id = ${userId}`).length, 0);
    }
  }
  const [{ orphan_events }] = await sql`
    SELECT COUNT(*) AS orphan_events FROM queue_arcade_alpha_round_events AS event
    LEFT JOIN queue_arcade_alpha_sessions AS session USING (session_hash) WHERE session.session_hash IS NULL
  `;
  assert.equal(Number(orphan_events), 0);
  const summary = await alpha.getAlphaSummary(now + 20000);
  return { accepted: accepted.length, distinctAccepted: unique.size, summary };
}

try {
  if (phase === "inflight") {
    assert.deepEqual(await snapshot(), prior.snapshot);
    process.env.DATABASE_URL = connection;
    process.env.ARCADE_VOTER_SALT = "isolated-launch-audit-salt";
    process.env.NODE_ENV = "production";
    process.env.ARCADE_AUTO_MIGRATE = "false";
    resetStoreGlobals();
    globalThis.__queueArcadePostgres = sql;
    const load = sourceStores();
    const vote = load("vote-store");
    const alpha = load("alpha-store");
    const [user] = await sql`SELECT id FROM queue_arcade_users ORDER BY id LIMIT 1`;
    await sql`CREATE OR REPLACE FUNCTION pause_crash_alpha() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN PERFORM pg_sleep(300); RETURN NEW; END $$`;
    await sql`DROP TRIGGER IF EXISTS pause_crash_alpha ON queue_arcade_alpha_sessions`;
    await sql`CREATE TRIGGER pause_crash_alpha BEFORE INSERT ON queue_arcade_alpha_sessions
      FOR EACH ROW EXECUTE FUNCTION pause_crash_alpha()`;
    const input = voteInput(user.id, "crash-uncommitted");
    try {
      await vote.recordRoundOutcome(input, effects(alpha, user.id, input));
      throw new Error("The in-flight transaction unexpectedly committed before the crash");
    } catch (error) {
      assert(["CONNECTION_CLOSED", "CONNECTION_ENDED", "57P01", "57P02"].includes(error.code), error.message);
      const result = { acknowledged: false, errorCode: error.code, schema };
      writeFileSync(path.join(root, "inflight-result.json"), JSON.stringify(result, null, 2) + "\n");
      console.log(JSON.stringify(result));
    }
    if (process.env.AUDIT_DB_RECOVER_SIGNAL) {
      const signal = path.join(root, "server-recovered.signal");
      assert.equal(process.env.AUDIT_DB_RECOVER_SIGNAL, signal);
      const deadline = Date.now() + 90000;
      while (!existsSync(signal)) {
        assert(Date.now() < deadline, "Server recovery was not signaled before the deadline");
        await new Promise((resolve) => setTimeout(resolve, 25));
      }
      const fresh = voteInput(user.id, "recovery-acknowledged");
      assert.equal((await vote.recordRoundOutcome(fresh, effects(alpha, user.id, fresh))).accepted, true);
      assert.equal((await vote.recordRoundOutcome(fresh, effects(alpha, user.id, fresh))).accepted, false);
      assert.equal((await vote.getRoundCrowd(fresh.roundId, fresh.roomId)).total, 1);
      assert.equal((await sql`SELECT * FROM queue_arcade_player_rounds WHERE round_id = ${fresh.roundId}`).length, 1);
      assert.equal(
        (await sql`SELECT * FROM queue_arcade_alpha_round_events WHERE round_id = ${fresh.roundId}`).length,
        1,
      );
      assert.equal(
        Number(
          (await sql`SELECT total FROM queue_arcade_question_stats WHERE question_id = ${fresh.questionId}`)[0].total,
        ),
        1,
      );
      const result = {
        ok: true,
        samePoolRecovered: true,
        freshVoteAccepted: true,
        retryDeduplicated: true,
        schema,
        snapshot: await snapshot(),
      };
      writeFileSync(path.join(root, "post-recovery-result.json"), JSON.stringify(result, null, 2) + "\n");
      console.log(JSON.stringify(result));
    }
  } else if (phase !== "churn") {
    const actual = await snapshot();
    assert.deepEqual(actual, prior.snapshot, "All acknowledged rows must survive the restart unchanged");
    const verification = { phase, verifiedAt: new Date().toISOString(), schema, server, snapshot: actual };
    writeFileSync(path.join(root, `${phase}-result.json`), JSON.stringify(verification, null, 2) + "\n");
    console.log(JSON.stringify({ ok: true, phase, schema, tables: tables.length, server }));
  } else {
    await migrateDatabase(sql);
    process.env.DATABASE_URL = connection;
    process.env.ARCADE_VOTER_SALT = "isolated-launch-audit-salt";
    process.env.NODE_ENV = "production";
    process.env.ARCADE_AUTO_MIGRATE = "false";
    resetStoreGlobals();
    globalThis.__queueArcadePostgres = sql;
    const load = sourceStores();
    const account = load("account-store");
    const vote = load("vote-store");
    const alpha = load("alpha-store");

    // A failure in the final analytics stage must roll back every preceding write.
    const faultUser = await account.upsertSteamUser(identity(9000));
    await sql`CREATE FUNCTION fail_alpha() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN RAISE EXCEPTION 'launch audit injected analytics failure'; END $$`;
    await sql`CREATE TRIGGER fail_alpha BEFORE INSERT ON queue_arcade_alpha_sessions
      FOR EACH ROW EXECUTE FUNCTION fail_alpha()`;
    const faultVote = voteInput(faultUser.id, "fault");
    await assert.rejects(
      vote.recordRoundOutcome(faultVote, effects(alpha, faultUser.id, faultVote)),
      /injected analytics failure/,
    );
    for (const table of [
      "queue_arcade_rounds",
      "queue_arcade_round_votes",
      "queue_arcade_player_rounds",
      "queue_arcade_question_stats",
      "queue_arcade_alpha_sessions",
    ]) {
      assert.equal((await sql`SELECT * FROM ${sql(table)}`).length, 0, `${table} must roll back`);
    }
    await sql`DROP TRIGGER fail_alpha ON queue_arcade_alpha_sessions`;

    // Use real store writes for old data, then check the exact retention boundaries.
    const old = voteInput(faultUser.id, "expired", now - 31 * day);
    await vote.recordRoundOutcome(old, effects(alpha, faultUser.id, old));
    await sql`INSERT INTO queue_arcade_rounds(round_id, room_id, game_id, content_version, question_id, created_at, updated_at)
      VALUES ('retention-boundary', 'audit-room', 'dota2', 'audit-release', 'boundary', ${now - 7200000}, ${now - 7200000})`;
    await sql`INSERT INTO queue_arcade_alpha_sessions(session_hash, visitor_hash, started_at, last_seen_at)
      VALUES ('alpha-boundary', 'boundary-visitor', ${now - 30 * day}, ${now - 30 * day}),
        ('daily-retained', 'daily-visitor', ${now - day}, ${now - day})`;
    await sql`INSERT INTO queue_arcade_user_sessions(token_hash,user_id,created_at,expires_at)
      VALUES ('expired-session', ${faultUser.id}, ${now - day}, ${now}),
        ('live-session', ${faultUser.id}, ${now}, ${now + day})`;
    await sql`INSERT INTO queue_arcade_steam_nonces(nonce_hash,expires_at)
      VALUES ('expired-nonce', ${now}), ('live-nonce', ${now + day})`;
    const summaryBefore = await alpha.getAlphaSummary(now);
    const retentionPreview = await cleanupDatabase(maintenance, { now, dryRun: true });
    assert.deepEqual(retentionPreview, { dryRun: true, rounds: 1, sessions: 1, alphaSessions: 1, steamNonces: 1 });
    assert.equal((await sql`SELECT * FROM queue_arcade_round_votes`).length, 1, "Dry run must not delete");
    const retention = await cleanupDatabase(maintenance, { now });
    assert.deepEqual(retention, { ...retentionPreview, dryRun: false });
    assert.deepEqual(await alpha.getAlphaSummary(now), summaryBefore, "Cleanup must retain the valid daily summary");
    assert.equal((await sql`SELECT * FROM queue_arcade_round_votes`).length, 0);
    assert.equal((await sql`SELECT * FROM queue_arcade_alpha_round_events`).length, 0);
    assert.equal(Number((await sql`SELECT total FROM queue_arcade_question_stats`)[0].total), 1);
    assert.equal((await account.getAccountProfile(faultUser.id, "dota2", now)).stats.answered, 1);
    assert.equal((await sql`SELECT * FROM queue_arcade_rounds WHERE round_id = 'retention-boundary'`).length, 1);
    assert.equal(
      (await sql`SELECT * FROM queue_arcade_alpha_sessions WHERE session_hash = 'alpha-boundary'`).length,
      1,
    );

    const users = await Promise.all(
      Array.from({ length: 32 }, (_, index) => account.upsertSteamUser(identity(index + 1))),
    );
    const deleted = new Set(users.slice(24).map((user) => user.id));
    const accepted = [];
    const errors = [];
    let expectedDeletedRejections = 0;
    const latency = [];
    const work = [];
    for (let round = 0; round < 24; round++) {
      for (let repeat = 0; repeat < 3; repeat++) {
        for (const user of users) {
          work.push(async () => {
            const input = voteInput(user.id, `live-${round}`);
            try {
              const result = await vote.recordRoundOutcome(input, effects(alpha, user.id, input));
              if (result.accepted) accepted.push({ userId: user.id, roundId: input.roundId });
            } catch (error) {
              if (deleted.has(user.id) && error.message === "Queue Arcade account no longer exists.")
                expectedDeletedRejections++;
              else throw error;
            }
          });
        }
      }
      work.push(() => cleanupDatabase(maintenance, { now }));
      if (round === 8) for (const userId of deleted) work.push(() => account.deleteAccountData(userId));
      if (round % 4 === 0) {
        for (let index = 0; index < 8; index++) work.push(() => account.upsertSteamUser(identity(index + 1)));
      }
    }
    const started = performance.now();
    let index = 0;
    await Promise.all(
      Array.from({ length: 16 }, async () => {
        while (index < work.length) {
          const operation = work[index++];
          const operationStart = performance.now();
          try {
            await operation();
          } catch (error) {
            errors.push({ code: error.code, message: error.message });
          }
          latency.push(performance.now() - operationStart);
        }
      }),
    );
    assert.deepEqual(errors, [], "No deadlocks, timeouts, or partial-write errors are allowed");
    const integrity = await verifyCounts(account, alpha, accepted, deleted);
    assert.equal(accepted.filter(({ userId }) => !deleted.has(userId)).length, 24 * 24);
    for (const userId of deleted) {
      const input = voteInput(userId, "post-delete");
      await assert.rejects(vote.recordRoundOutcome(input, effects(alpha, userId, input)), /no longer exists/);
    }
    const finalCleanup = await cleanupDatabase(maintenance, { now });
    assert.deepEqual(finalCleanup, { dryRun: false, rounds: 0, sessions: 0, alphaSessions: 0, steamNonces: 0 });
    latency.sort((a, b) => a - b);
    const result = {
      ok: true,
      schema,
      observedAt: new Date().toISOString(),
      server,
      retention,
      atomicRollback: true,
      integrity,
      operations: work.length,
      concurrentWorkers: 16,
      elapsedMs: Math.round(performance.now() - started),
      operationLatencyMs: {
        median: latency[Math.floor(latency.length * 0.5)],
        p95: latency[Math.floor(latency.length * 0.95)],
        max: latency.at(-1),
      },
      expectedDeletedRejections,
      errors,
      snapshot: await snapshot(),
    };
    writeFileSync(resultPath, JSON.stringify(result, null, 2) + "\n");
    console.log(JSON.stringify(result));
  }
} finally {
  if (phase === "inflight" && process.env.AUDIT_DB_KEEP_POOL_OPEN === "true") {
    console.log("Leaving pools open for one second to isolate the driver failure from pool.end().");
    await new Promise((resolve) => setTimeout(resolve, 1000));
    process.exit(0);
  }
  resetStoreGlobals();
  await Promise.all([sql.end({ timeout: 3 }), maintenance.end({ timeout: 3 }), admin.end({ timeout: 3 })]);
}

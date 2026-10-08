import { randomUUID } from "node:crypto";
import postgres from "postgres";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { summarizeAlphaSessions } from "../src/lib/alpha-analytics.mjs";
import { sourceStores, resetStoreGlobals } from "./helpers/source-store-loader.mjs";

const databaseUrl = process.env.TEST_DATABASE_URL;
const identity = {
  steamId: "76561198000000001",
  displayName: "Test player",
  avatarUrl: "https://avatars.steamstatic.com/test_full.jpg",
  profileUrl: "https://steamcommunity.com/profiles/76561198000000001",
};
function input(now, voterId = "test-voter", roundId = "test-round") {
  return {
    roundId,
    roomId: "test-room",
    gameId: "dota2",
    contentVersion: "test-release",
    questionId: "test-question",
    questionRevision: "revision-1",
    correctIndex: 0,
    answerIndex: 0,
    answerKey: "answer-a",
    basePoints: 200,
    voterId,
    submittedAt: now,
  };
}
function effects(alpha, vote, userId, revealAt) {
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
        revealAt,
      },
    },
    alpha: { key: alpha.alphaSessionKey({ voterId: vote.voterId, sessionId: "test-session" }), correct: true },
  };
}

describe.skipIf(!databaseUrl)("PostgreSQL store transactions", () => {
  let admin, sql, schema, load, account, vote, alpha;
  beforeEach(async () => {
    resetStoreGlobals();
    vi.stubEnv("DATABASE_URL", databaseUrl);
    vi.stubEnv("ARCADE_VOTER_SALT", "test-only-private-salt");
    schema = `store_test_${randomUUID().replaceAll("-", "")}`;
    admin = postgres(databaseUrl, { max: 1, connect_timeout: 5, onnotice: () => {} });
    await admin`CREATE SCHEMA ${admin(schema)}`;
    sql = postgres(databaseUrl, {
      max: 5,
      connect_timeout: 5,
      onnotice: () => {},
      connection: { search_path: schema, application_name: schema },
    });
    globalThis.__queueArcadePostgres = sql;
    load = sourceStores();
    account = load("account-store");
    vote = load("vote-store");
    alpha = load("alpha-store");
    await vote.getVoteStoreHealth();
  });
  afterEach(async () => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    resetStoreGlobals();
    await sql?.end({ timeout: 2 });
    try {
      if (admin && schema) await admin`DROP SCHEMA IF EXISTS ${admin(schema)} CASCADE`;
    } finally {
      await admin?.end({ timeout: 2 });
    }
  });

  it("rolls back the vote, profile, and calibration if analytics persistence fails", async () => {
    const now = Date.now();
    const user = await account.upsertSteamUser({ ...identity, authenticatedAt: now });
    const voteInput = input(now, `account:${user.id}`);
    await sql`CREATE FUNCTION fail_alpha_insert() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'test storage fault'; END $$`;
    await sql`CREATE TRIGGER fail_alpha BEFORE INSERT ON queue_arcade_alpha_sessions FOR EACH ROW EXECUTE FUNCTION fail_alpha_insert()`;
    await expect(vote.recordRoundOutcome(voteInput, effects(alpha, voteInput, user.id, now + 15_800))).rejects.toThrow(
      "test storage fault",
    );
    expect((await vote.getRoundCrowd(voteInput.roundId, voteInput.roomId)).total).toBe(0);
    expect(await sql`SELECT * FROM queue_arcade_player_rounds`).toHaveLength(0);
    expect(await sql`SELECT * FROM queue_arcade_question_stats`).toHaveLength(0);
    expect(await sql`SELECT * FROM queue_arcade_alpha_sessions`).toHaveLength(0);
    await sql`DROP TRIGGER fail_alpha ON queue_arcade_alpha_sessions`;
    expect((await vote.recordRoundOutcome(voteInput, effects(alpha, voteInput, user.id, now + 15_800))).accepted).toBe(
      true,
    );
    expect((await account.getAccountProfile(user.id, "dota2", now)).stats).toMatchObject({
      answered: 0,
      correct: 0,
      accuracy: 0,
      recentRounds: [],
    });
    expect((await account.getAccountProfile(user.id, "dota2", now + 15_800)).stats).toMatchObject({
      answered: 1,
      correct: 1,
    });
    expect((await alpha.getAlphaSessionsSince(now - 1))[0].roundsAnswered).toBe(1);
    const duplicateResults = await Promise.all(
      Array.from({ length: 25 }, () =>
        vote.recordRoundOutcome(voteInput, effects(alpha, voteInput, user.id, now + 15_800)),
      ),
    );
    expect(duplicateResults.every((result) => !result.accepted)).toBe(true);
    expect((await alpha.getAlphaSessionsSince(now - 1))[0].roundsAnswered).toBe(1);
  });

  it("returns one crowd snapshot during concurrent commits", async () => {
    const now = Date.now();
    const snapshots = [];
    await Promise.all([
      (async () => {
        for (let index = 0; index < 150; index += 1) {
          await vote.recordRoundVote({
            ...input(now, `player-${index}`),
            answerIndex: index % 4,
            answerKey: `answer-${index % 4}`,
            basePoints: index % 4 === 0 ? 200 : 0,
          });
        }
      })(),
      (async () => {
        for (let index = 0; index < 250; index += 1) {
          snapshots.push(await vote.getRoundCrowd("test-round", "test-room", "player-0", true));
        }
      })(),
    ]);
    for (const snapshot of snapshots) {
      expect(snapshot.keyCounts.reduce((sum, entry) => sum + entry.count, 0)).toBe(snapshot.total);
      expect(snapshot.scoreSummary.correctCount).toBe(snapshot.counts[0]);
    }
    expect((await vote.getRoundCrowd("test-round", "another-room", "player-0", true)).total).toBe(0);
  }, 15_000);

  it("includes more than 50,000 sessions and matches the reference summary", async () => {
    const now = Date.now();
    await sql`
      INSERT INTO queue_arcade_alpha_sessions(session_hash, visitor_hash, started_at, last_seen_at, finished_at, rounds_answered, correct_answers)
      SELECT 'session-' || n, 'visitor-' || (n % 20000), ${now}::bigint - n * 1000, ${now}::bigint - n * 1000 + 60000,
        ${now}::bigint - n * 1000 + 60000, 2, 1 FROM generate_series(1, 50001) AS n
    `;
    const summary = await alpha.getAlphaSummary(now);
    const sessions = await alpha.getAlphaSessionsSince(now - 30 * 86_400_000);
    expect(summary.sessions).toBe(50001);
    expect(summary.rounds).toBe(100002);
    expect(summary).toEqual(summarizeAlphaSessions(sessions, { now, windowDays: 30, dailyDays: 14 }));
  }, 15_000);

  it("removes owned analytics and rejects enrichment and writes after deletion", async () => {
    const now = Date.now();
    const user = await account.upsertSteamUser({ ...identity, authenticatedAt: now });
    const alphaIdentity = { voterId: `account:${user.id}`, sessionId: "owned-session" };
    await alpha.recordAlphaSessionStart(alphaIdentity, now);
    await account.deleteAccountData(user.id);
    expect(await account.updateSteamUser(user.id, { ...identity, authenticatedAt: now + 1 })).toBeNull();
    await expect(alpha.recordAlphaSessionStart(alphaIdentity, now + 1)).rejects.toThrow("no longer exists");
    expect(await sql`SELECT * FROM queue_arcade_user_identities`).toHaveLength(0);
    expect(await sql`SELECT * FROM queue_arcade_alpha_sessions`).toHaveLength(0);
  });

  it("finishes account deletion while a Steam login updates the same identity", async () => {
    const now = Date.now();
    const user = await account.upsertSteamUser({ ...identity, authenticatedAt: now });
    await sql`
      CREATE FUNCTION pause_identity_update() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN
        PERFORM pg_advisory_xact_lock(hashtext(TG_TABLE_SCHEMA));
        RETURN NEW;
      END $$
    `;
    await sql`
      CREATE TRIGGER pause_identity BEFORE UPDATE ON queue_arcade_user_identities
      FOR EACH ROW EXECUTE FUNCTION pause_identity_update()
    `;
    const blocker = await sql.reserve();
    const operations = [];
    const track = (operation) =>
      operations.push(
        operation.then(
          () => ({ ok: true }),
          (error) => ({ ok: false, code: error.code, message: error.message }),
        ),
      );
    const waitForBlockedQuery = (pattern) =>
      vi.waitFor(
        async () => {
          const rows = await sql`
            SELECT pid FROM pg_stat_activity
            WHERE datname = current_database() AND usename = current_user
              AND application_name = ${schema}
              AND pid <> pg_backend_pid() AND wait_event_type = 'Lock' AND query LIKE ${pattern}
      `;
          expect(rows.length).toBeGreaterThan(0);
        },
        { timeout: 3_000, interval: 20 },
      );
    let results;
    try {
      await blocker`SELECT pg_advisory_lock(hashtext(${schema}))`;
      track(account.upsertSteamUser({ ...identity, authenticatedAt: now + 1 }));
      await waitForBlockedQuery("%UPDATE queue_arcade_user_identities%");
      track(account.deleteAccountData(user.id));
      await waitForBlockedQuery("%queue_arcade_users%");
    } finally {
      await blocker`SELECT pg_advisory_unlock(hashtext(${schema}))`;
      blocker.release();
      results = await Promise.all(operations);
    }
    expect(results).toEqual([{ ok: true }, { ok: true }]);
    expect(await account.accountExists(user.id)).toBe(false);
    expect(await sql`SELECT * FROM queue_arcade_user_identities`).toHaveLength(0);
  }, 15_000);

  it("consumes a nonce once across concurrent database transactions", async () => {
    const results = await Promise.all(
      Array.from({ length: 25 }, () => account.consumeSteamLoginNonce("nonce-hash", Date.now() + 60_000)),
    );
    expect(results.filter(Boolean)).toHaveLength(1);
  });
});

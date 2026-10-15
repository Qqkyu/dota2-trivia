import { mkdtemp, mkdir, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { sourceStores, resetStoreGlobals } from "./helpers/source-store-loader.mjs";

function voteInput(now, roundId = "test-round") {
  return {
    roundId,
    roomId: "test-room",
    gameId: "dota2",
    contentVersion: "test-release",
    questionId: "test-question",
    questionRevision: "revision-1",
    correctIndex: 0,
    answerIndex: 0,
    basePoints: 200,
    voterId: "guest-test-player",
    submittedAt: now,
  };
}
function personalRound(input, revealAt) {
  return {
    roundId: input.roundId,
    roundNumber: 1,
    gameId: "dota2",
    questionId: input.questionId,
    questionRevision: input.questionRevision,
    roundGame: "trivia",
    roundFormat: "classic-item-prices",
    correct: true,
    answerStage: null,
    submittedAt: input.submittedAt,
    revealAt,
  };
}
const identity = {
  steamId: "76561198000000001",
  displayName: "Test player",
  avatarUrl: "https://avatars.steamstatic.com/test_full.jpg",
  profileUrl: "https://steamcommunity.com/profiles/76561198000000001",
};

describe("file store integrity", () => {
  let directory, load, account, vote, alpha;
  beforeEach(async () => {
    directory = await mkdtemp(path.join(os.tmpdir(), "queue-store-test-"));
    vi.stubEnv("DATABASE_URL", "");
    vi.stubEnv("ARCADE_DATA_FILE", path.join(directory, "votes.json"));
    vi.stubEnv("ARCADE_ACCOUNT_DATA_FILE", path.join(directory, "accounts.json"));
    vi.stubEnv("ARCADE_ALPHA_DATA_FILE", path.join(directory, "alpha.json"));
    vi.stubEnv("ARCADE_VOTER_SALT", "test-only-private-salt");
    resetStoreGlobals();
    load = sourceStores();
    account = load("account-store");
    vote = load("vote-store");
    alpha = load("alpha-store");
  });
  afterEach(async () => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    resetStoreGlobals();
    await rm(directory, { recursive: true, force: true });
  });

  it("keeps cached votes and accounts unchanged when the file write fails", async () => {
    const input = voteInput(Date.now());
    const blockedVote = `${process.env.ARCADE_DATA_FILE}.${process.pid}.tmp`;
    await mkdir(blockedVote);
    await expect(vote.recordRoundVote(input)).rejects.toThrow();
    expect((await vote.getRoundCrowd(input.roundId, input.roomId, input.voterId)).total).toBe(0);
    await rm(blockedVote, { recursive: true });
    expect((await vote.recordRoundVote(input)).accepted).toBe(true);
    const user = await account.upsertSteamUser({ ...identity, authenticatedAt: Date.now() });
    await account.createAccountSession({
      userId: user.id,
      tokenHash: "test-session",
      createdAt: Date.now(),
      expiresAt: Date.now() + 60_000,
    });
    const blockedAccount = `${process.env.ARCADE_ACCOUNT_DATA_FILE}.${process.pid}.tmp`;
    await mkdir(blockedAccount);
    await expect(account.deleteAccountData(user.id)).rejects.toThrow();
    expect((await account.getUserBySession("test-session")).id).toBe(user.id);
    await rm(blockedAccount, { recursive: true });
    await account.deleteAccountData(user.id);
    expect(await account.getUserBySession("test-session")).toBeNull();
  });

  it("recovers committed outcomes after a restart without counting analytics twice", async () => {
    const now = Date.now();
    const user = await account.upsertSteamUser({ ...identity, authenticatedAt: now });
    const input = { ...voteInput(now), voterId: `account:${user.id}` };
    const effects = {
      account: { userId: user.id, round: personalRound(input, now + 15_800) },
      alpha: { key: alpha.alphaSessionKey({ voterId: input.voterId, sessionId: "fixture-session" }), correct: true },
    };
    const blockedAccount = `${process.env.ARCADE_ACCOUNT_DATA_FILE}.${process.pid}.tmp`;
    await mkdir(blockedAccount);
    const result = await vote.recordRoundOutcome(input, effects);
    expect(result.accepted).toBe(true);
    const storedVote = await readFile(process.env.ARCADE_DATA_FILE, "utf8");
    expect(Object.keys(JSON.parse(storedVote).pendingOutcomes)).toHaveLength(1);
    expect(storedVote).not.toContain("fixture-session");
    expect(storedVote).not.toContain("guest-test-player");
    await rm(blockedAccount, { recursive: true });
    resetStoreGlobals();
    load = sourceStores();
    account = load("account-store");
    vote = load("vote-store");
    alpha = load("alpha-store");
    await vote.replayPendingRoundOutcomes();
    await vote.replayPendingRoundOutcomes();
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
    expect((await alpha.getAlphaSessionsSince(now - 1))[0]).toMatchObject({ roundsAnswered: 1, correctAnswers: 1 });
    expect(Object.keys(JSON.parse(await readFile(process.env.ARCADE_DATA_FILE, "utf8")).pendingOutcomes)).toHaveLength(
      0,
    );
  });

  it("does not recreate a deleted account through enrichment or in-flight analytics", async () => {
    const now = Date.now();
    const user = await account.upsertSteamUser({ ...identity, authenticatedAt: now });
    const alphaIdentity = { voterId: `account:${user.id}`, sessionId: "test-owned-session" };
    await alpha.recordAlphaSessionStart(alphaIdentity, now);
    await account.deleteAccountData(user.id);
    expect(
      await account.updateSteamUser(user.id, { ...identity, displayName: "Late name", authenticatedAt: now + 1 }),
    ).toBeNull();
    await expect(alpha.recordAlphaSessionStart(alphaIdentity, now + 1)).rejects.toThrow("no longer exists");
    expect(await alpha.getAlphaSessionsSince(0)).toEqual([]);
    expect(await account.accountExists(user.id)).toBe(false);
  });

  it("does not count an analytics event twice when the outbox acknowledgement fails", async () => {
    const now = Date.now();
    const input = voteInput(now);
    const files = load("atomic-json-file");
    const write = files.writeJsonAtomically;
    files.writeJsonAtomically = async (filePath, state) => {
      if (filePath === process.env.ARCADE_DATA_FILE && Object.keys(state.pendingOutcomes ?? {}).length === 0) {
        throw new Error("Test outbox acknowledgement failure");
      }
      return write(filePath, state);
    };
    await vote.recordRoundOutcome(input, {
      alpha: { key: alpha.alphaSessionKey({ voterId: input.voterId, sessionId: "test-session" }), correct: true },
    });
    expect((await alpha.getAlphaSessionsSince(now - 1))[0].roundsAnswered).toBe(1);
    expect(Object.keys(JSON.parse(await readFile(process.env.ARCADE_DATA_FILE, "utf8")).pendingOutcomes)).toHaveLength(
      1,
    );
    resetStoreGlobals();
    load = sourceStores();
    vote = load("vote-store");
    alpha = load("alpha-store");
    await vote.replayPendingRoundOutcomes();
    expect((await alpha.getAlphaSessionsSince(now - 1))[0].roundsAnswered).toBe(1);
  });

  it("cleans idle stores and preserves personal results", async () => {
    const now = Date.now();
    const clock = vi.spyOn(Date, "now").mockReturnValue(now);
    const user = await account.upsertSteamUser({ ...identity, authenticatedAt: now });
    const input = voteInput(now);
    await vote.recordRoundVote(input);
    await account.recordPlayerRound(user.id, personalRound(input, now));
    await account.createAccountSession({
      userId: user.id,
      tokenHash: "expiring",
      createdAt: now,
      expiresAt: now + 1_000,
    });
    await alpha.recordAlphaSessionStart({ voterId: "test-guest", sessionId: "idle-session" }, now);
    clock.mockReturnValue(now + 31 * 86_400_000);
    await load("store-maintenance").runStoreMaintenance();
    expect((await vote.getRoundCrowd(input.roundId, input.roomId)).total).toBe(0);
    expect(await alpha.getAlphaSessionsSince(0)).toEqual([]);
    expect((await account.getAccountProfile(user.id, "dota2")).stats.answered).toBe(1);
    expect(JSON.parse(await readFile(process.env.ARCADE_ACCOUNT_DATA_FILE, "utf8")).sessions).toEqual({});
  });

  it("accepts a login nonce once across concurrent callers", async () => {
    const results = await Promise.all(
      Array.from({ length: 25 }, () => account.consumeSteamLoginNonce("test-nonce-hash", Date.now() + 60_000)),
    );
    expect(results.filter(Boolean)).toHaveLength(1);
  });

  it("keeps memory consistent with disk if durability confirmation fails after rename", async () => {
    const files = load("atomic-json-file");
    const write = files.writeJsonAtomically;
    files.writeJsonAtomically = async (filePath, state) => {
      await write(filePath, state);
      throw new files.CommittedFileWriteError(new Error("Test directory sync failure"));
    };
    const input = voteInput(Date.now());
    await expect(vote.recordRoundVote(input)).rejects.toThrow("directory could not be synchronized");
    expect((await vote.getRoundCrowd(input.roundId, input.roomId)).total).toBe(1);
    expect(JSON.parse(await readFile(process.env.ARCADE_DATA_FILE, "utf8")).rounds[input.roundId].counts[0]).toBe(1);
    files.writeJsonAtomically = write;
    expect((await vote.recordRoundVote(input)).accepted).toBe(false);
  });
});

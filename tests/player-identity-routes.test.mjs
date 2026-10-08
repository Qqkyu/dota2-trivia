import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ACCOUNT_SESSION_COOKIE, sessionTokenHash } from "../src/lib/steam-auth.mjs";

const fixture = vi.hoisted(() => ({
  session: vi.fn(),
  crowd: vi.fn(),
  record: vi.fn(),
  report: vi.fn(),
  error: vi.fn(),
  question: {
    id: "identity-question",
    kind: "item-cost",
    game: "trivia",
    category: "Items",
    difficulty: 1,
    correctIndex: 0,
    answers: ["A", "B", "C", "D"],
  },
  room: { id: "dota2:identity:public", gameId: "dota2", contentVersion: "identity", mode: "mixed", filter: "Mixed" },
  round: {
    id: "dota2:identity:public:round:0",
    number: 0,
    game: "trivia",
    questionId: "identity-question",
    startedAt: 1_000_000,
    answerDeadline: 1_015_000,
    revealDeadline: 1_022_000,
    answerDuration: 15_000,
    phase: "answering",
  },
}));

vi.mock("../src/lib/account-store", () => ({
  getUserBySession: fixture.session,
  createAccountSession: vi.fn(),
  deleteAccountSession: vi.fn(),
}));
vi.mock("../src/lib/vote-store", () => ({
  getRoundCrowd: fixture.crowd,
  getPlayerQuestionReport: fixture.report,
  recordRoundOutcome: fixture.record,
}));
vi.mock("../src/lib/alpha-store", () => ({ alphaSessionKey: vi.fn() }));
vi.mock("../src/lib/server-diagnostics", () => ({ logServerError: fixture.error }));
vi.mock("../src/lib/game-catalogs", () => ({ GAME_CATALOGS: { dota2: { questions: [fixture.question] } } }));
vi.mock("../src/lib/private-room-rounds", () => ({
  liveRoundForSettings: () => ({ room: fixture.room, round: fixture.round, isolated: false }),
  liveRoundAt: () => null,
}));
vi.mock("../src/lib/public-rooms", () => ({
  parsePublicRoomSettings: () => ({ gameId: "dota2", mode: "mixed", filter: "Mixed" }),
  PUBLIC_VOTE_ACCEPT_GRACE_MS: 800,
}));
vi.mock("../src/lib/public-question", () => ({
  publicQuestionForRound: () => ({ id: fixture.question.id }),
  publicQuestionRevision: () => "identity-revision",
}));
vi.mock("../src/lib/keyed-answer", () => ({
  isKeyedAnswerQuestion: () => false,
  correctAnswerKey: () => null,
  isQuestionAnswerCorrect: (_question, index) => index === 0,
  isValidAnswerKeyForQuestion: () => false,
  keyedAnswerIndex: () => null,
}));

import { GET as readRound } from "../src/app/api/rounds/route.ts";
import { POST as vote } from "../src/app/api/votes/route.ts";

const origin = "https://arcade.example";
const guestId = "guest-player-identity";
const token = "a".repeat(43);
const account = { id: "internal-account-a", steamId: "76561198000000000", displayName: "Account A" };
const crowd = { counts: [0, 0, 0, 0], total: 0, keyCounts: [], scoreSummary: null, playerVote: null };

function request(kind, playerId = guestId, authenticated = false) {
  const url = new URL(`/api/${kind}`, origin);
  const headers = authenticated ? { cookie: `${ACCOUNT_SESSION_COOKIE}=${token}` } : {};
  if (kind === "rounds") {
    if (playerId !== undefined) url.searchParams.set("playerId", playerId);
    return new Request(url, { headers });
  }
  return new Request(url, {
    method: "POST",
    headers: { ...headers, origin, "content-type": "application/json" },
    body: JSON.stringify({ gameId: "dota2", roundId: fixture.round.id, voterId: playerId, answerIndex: 0 }),
  });
}

function deferred() {
  let resolve;
  const promise = new Promise((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

beforeEach(() => {
  vi.spyOn(Date, "now").mockReturnValue(1_005_000);
  vi.stubEnv("ARCADE_APP_URL", origin);
  fixture.session.mockReset().mockResolvedValue(account);
  fixture.crowd.mockReset().mockResolvedValue(crowd);
  fixture.record.mockReset().mockResolvedValue({ ...crowd, accepted: true });
  fixture.report.mockReset().mockResolvedValue(null);
  fixture.error.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe.each([
  ["rounds", readRound],
  ["votes", vote],
])("authoritative identity in %s responses", (kind, handler) => {
  it("binds account results to the cookie session and exposes only the own internal ID", async () => {
    const response = await handler(request(kind, "other-guest-player", true));
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    const body = await response.json();
    expect(body.playerIdentity).toEqual({ kind: "account", id: account.id });
    expect(fixture.session).toHaveBeenCalledWith(sessionTokenHash(token));
    expect(JSON.stringify(body)).not.toContain(account.steamId);
    expect(JSON.stringify(body)).not.toContain(token);
    if (kind === "rounds") {
      expect(fixture.crowd).toHaveBeenCalledWith(fixture.round.id, fixture.room.id, `account:${account.id}`, false);
    } else {
      expect(fixture.record).toHaveBeenCalledWith(
        expect.objectContaining({ voterId: `account:${account.id}` }),
        expect.objectContaining({ account: expect.objectContaining({ userId: account.id }) }),
      );
    }
  });

  it("returns the normalized guest ID when no account cookie exists", async () => {
    const response = await handler(request(kind, ` ${guestId} `));
    expect(response.status).toBe(200);
    expect((await response.json()).playerIdentity).toEqual({ kind: "guest", id: guestId });
    expect(fixture.session).not.toHaveBeenCalled();
    if (kind === "rounds") {
      expect(fixture.crowd).toHaveBeenCalledWith(fixture.round.id, fixture.room.id, guestId, false);
    } else {
      expect(fixture.record).toHaveBeenCalledWith(expect.objectContaining({ voterId: guestId }), {});
    }
  });

  it("treats an expired account cookie as the validated guest identity", async () => {
    fixture.session.mockResolvedValue(null);
    const response = await handler(request(kind, guestId, true));
    expect(response.status).toBe(200);
    expect((await response.json()).playerIdentity).toEqual({ kind: "guest", id: guestId });
  });

  it("rejects a guest attempt to select an account namespace", async () => {
    const response = await handler(request(kind, "account:other-user"));
    expect(response.status).toBe(400);
    expect((await response.json()).playerIdentity).toBeUndefined();
    expect(fixture.crowd).not.toHaveBeenCalled();
    expect(fixture.record).not.toHaveBeenCalled();
  });

  it("keeps a delayed response bound to its original session after another login", async () => {
    const entered = deferred();
    const finish = deferred();
    const storage = kind === "rounds" ? fixture.crowd : fixture.record;
    storage.mockImplementationOnce(async () => {
      entered.resolve();
      await finish.promise;
      return { ...crowd, accepted: true };
    });
    const pending = handler(request(kind, guestId, true));
    await entered.promise;
    fixture.session.mockResolvedValue({ id: "internal-account-b" });
    finish.resolve();
    expect((await (await pending).json()).playerIdentity).toEqual({ kind: "account", id: account.id });
    expect((await (await handler(request(kind, guestId, true))).json()).playerIdentity).toEqual({
      kind: "account",
      id: "internal-account-b",
    });
  });
});

it("labels an anonymous round observer without a guest or account ID as null", async () => {
  const response = await readRound(new Request(`${origin}/api/rounds`));
  expect(response.status).toBe(200);
  expect((await response.json()).playerIdentity).toBeNull();
  expect(fixture.crowd).toHaveBeenCalledWith(fixture.round.id, fixture.room.id, undefined, false);
});

it("cannot select a different account through the vote body", async () => {
  const response = await vote(request("votes", "account:other-user", true));
  expect(response.status).toBe(200);
  expect((await response.json()).playerIdentity).toEqual({ kind: "account", id: account.id });
  expect(fixture.record).toHaveBeenCalledWith(
    expect.objectContaining({ voterId: `account:${account.id}` }),
    expect.anything(),
  );
});

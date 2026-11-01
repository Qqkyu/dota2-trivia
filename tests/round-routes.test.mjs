import { readFileSync } from "node:fs";
import ts from "typescript";
import { afterEach, describe, expect, it, vi } from "vitest";
import * as party from "../src/lib/private-rooms.mjs";
import * as score from "../src/lib/scoring.mjs";
import * as timing from "../src/lib/round-timing.mjs";
import * as recovery from "../src/lib/round-recovery.mjs";
import * as identity from "../src/lib/guest-identity.mjs";
import * as requestBody from "../src/lib/request-body.mjs";

function loadRoute(path, dependencies) {
  const source = ts.transpileModule(readFileSync(new URL(path, import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const loaded = { exports: {} };
  new Function("require", "module", "exports", source)(
    (name) => {
      if (!(name in dependencies)) throw new Error(`Unknown route dependency ${name}`);
      return dependencies[name];
    },
    loaded,
    loaded.exports,
  );
  return loaded.exports;
}

function fixture() {
  const question = {
    id: "test-item-price",
    kind: "item-cost",
    game: "trivia",
    category: "Items",
    difficulty: 1,
    correctIndex: 0,
    answers: ["A", "B", "C", "D"],
  };
  const room = {
    id: `dota2:${"test-version".repeat(15)}:private:SETTLE`,
    gameId: "dota2",
    contentVersion: "test-version",
    mode: "mixed",
    filter: "Mixed",
  };
  const settings = { gameId: "dota2", privateCode: "SETTLE" };
  const startedAt = 1_003_000;
  const roundAt = (number, time) => {
    const start = startedAt + number * 22_000;
    return {
      id: `${room.id}:round:${number}:${startedAt}`,
      number,
      game: "trivia",
      questionId: question.id,
      startedAt: start,
      answerDeadline: start + 15_000,
      revealDeadline: start + 22_000,
      answerDuration: 15_000,
      phase: timing.roundPhaseAt(time, start + 15_000),
    };
  };
  const votes = [];
  const crowd = vi.fn(async (id, _room, playerId) => {
    const roundVotes = votes.filter((vote) => vote.roundId === id);
    const correct = roundVotes.filter((vote) => vote.basePoints > 0);
    const playerVote = roundVotes.find((vote) => vote.voterId === playerId);
    return {
      counts: [correct.length, roundVotes.length - correct.length, 0, 0],
      total: roundVotes.length,
      keyCounts: [],
      playerVote: playerVote ? { answerIndex: playerVote.answerIndex, submittedAt: playerVote.submittedAt } : null,
      scoreSummary: score.roundScoreSummary({
        correctCount: correct.length,
        total: roundVotes.length,
        basePointsTotal: correct.reduce((sum, vote) => sum + vote.basePoints, 0),
        basePointsBest: Math.max(0, ...correct.map((vote) => vote.basePoints)),
        playerBasePoints: playerVote?.basePoints ?? null,
      }),
    };
  });
  let releaseCommit;
  let commitEntered;
  const entered = new Promise((resolve) => {
    commitEntered = resolve;
  });
  const recordVote = async (input) => {
    commitEntered();
    await new Promise((resolve) => {
      releaseCommit = resolve;
    });
    votes.push(input);
    return { accepted: true, ...(await crowd(input.roundId, room.id, input.voterId)) };
  };
  const dependencies = {
    "next/server": {
      NextResponse: {
        json: (body, init) =>
          new Response(JSON.stringify(body), {
            ...init,
            headers: { "Content-Type": "application/json", ...init?.headers },
          }),
      },
    },
    "@/lib/auth-session": { sessionUserForRequest: async () => null },
    "@/lib/api-protection": {
      rateLimitRequest: () => null,
      preflightRateLimit: () => null,
      requestOriginAllowed: () => true,
      readJsonBody: requestBody.readJsonBody,
    },
    "@/lib/guest-identity.mjs": identity,
    "@/lib/request-body.mjs": requestBody,
    "@/lib/arcade-games.mjs": { roundFormatForQuestion: () => "classic-item-prices" },
    "@/lib/game-catalogs": { GAME_CATALOGS: { dota2: { questions: [question] } } },
    "@/lib/keyed-answer": {
      isKeyedAnswerQuestion: () => false,
      isQuestionAnswerCorrect: (_question, index) => index === 0,
      isValidAnswerKeyForQuestion: () => false,
      keyedAnswerIndex: () => null,
      correctAnswerKey: () => null,
    },
    "@/lib/private-room-rounds": {
      liveRoundForSettings: (_settings, time) => ({
        room,
        round: roundAt(Math.max(0, Math.floor((time - startedAt) / 22_000)), time),
        isolated: true,
        record: { startedAt },
      }),
      liveRoundAt: (_settings, number, time) => roundAt(number, time),
    },
    "@/lib/private-rooms.mjs": party,
    "@/lib/public-rooms": {
      parsePublicRoomSettings: () => settings,
      PUBLIC_VOTE_ACCEPT_GRACE_MS: timing.PUBLIC_VOTE_ACCEPT_GRACE_MS,
    },
    "@/lib/question-revision.mjs": { questionCalibrationRevision: () => "revision" },
    "@/lib/scoring.mjs": score,
    "@/lib/round-recovery.mjs": recovery,
    "@/lib/steam-art.mjs": { firstPartyArtTree: (value) => value },
    "@/lib/server-diagnostics": {
      logServerError: (_name, error) => {
        throw error;
      },
    },
    "@/lib/vote-store": {
      recordRoundVote: recordVote,
      recordRoundOutcome: recordVote,
      getRoundCrowd: crowd,
      getPlayerQuestionReport: async () => null,
    },
    "@/lib/vote-submission": { recordVoteSubmission: recordVote },
    "@/lib/alpha-analytics.mjs": { isAlphaSessionId: () => true },
    "@/lib/alpha-store": { recordAlphaSessionRound: async () => {} },
    "@/lib/account-store": { recordPlayerRound: async () => {} },
    "@/lib/player-profile.mjs": { answerStageForRound: () => null },
    "@/lib/crowd-split.mjs": { prioritizedKeyCounts: () => [] },
    "@/lib/public-question": { publicQuestionRevision: () => "public-revision", publicQuestionForRound: () => ({}) },
    "@/lib/room-presence.mjs": { touchRoomPresence: () => 1 },
  };
  const rounds = loadRoute("../src/app/api/rounds/route.ts", dependencies);
  const voteRoute = loadRoute("../src/app/api/votes/route.ts", dependencies);
  party.createPrivateRoom({
    hostId: "test-host",
    gameId: "dota2",
    contentVersion: "test-version",
    code: "SETTLE",
    games: ["trivia"],
    now: 1_000_000,
  });
  party.startPrivateRoom("SETTLE", "test-host", 1_000_000);
  return {
    room,
    roundAt,
    rounds,
    voteRoute,
    votes,
    crowd,
    entered,
    release: () => releaseCommit(),
    read: (pending = "") =>
      rounds.GET(
        new Request(
          `http://test/api/rounds?gameId=dota2&privateCode=SETTLE&playerId=test-host&pendingRoundIds=${encodeURIComponent(pending)}`,
        ),
      ),
  };
}

afterEach(() => {
  vi.restoreAllMocks();
  party.resetPrivateRoomsForTests();
});

describe("accepted private votes across reveal", () => {
  it("requires a roster member before reading private votes", async () => {
    const test = fixture();
    vi.spyOn(Date, "now").mockReturnValue(test.roundAt(1, 0).startedAt + 1_000);
    const response = await test.rounds.GET(
      new Request("http://test/api/rounds?gameId=dota2&privateCode=SETTLE&playerId=stranger-player"),
    );
    expect(response.status).toBe(403);
    expect(test.crowd).not.toHaveBeenCalled();
  });

  it.each([false, true])(
    "recovers a controlled late commit and final multiplier, earlier votes: %s",
    async (withEarlierVotes) => {
      const test = fixture();
      const first = test.roundAt(0, 1_003_000);
      const now = vi.spyOn(Date, "now").mockReturnValue(first.answerDeadline + 700);
      if (withEarlierVotes) {
        for (let index = 0; index < 3; index += 1) {
          const voterId = `earlier-${index}`;
          party.touchPrivateRoom("SETTLE", Date.now(), { playerId: voterId, name: voterId });
          const basePoints = index === 0 ? 150 : 0;
          test.votes.push({
            roundId: first.id,
            voterId,
            basePoints,
            submittedAt: first.answerDeadline - 1_000,
            answerIndex: index === 0 ? 0 : 1,
          });
          party.addPrivateRoomScore("SETTLE", voterId, basePoints, Date.now(), first.id);
        }
      }
      const pending = test.voteRoute.POST(
        new Request("http://test/api/votes", {
          method: "POST",
          headers: { "Content-Type": "application/json", Origin: "http://test" },
          body: JSON.stringify({
            gameId: "dota2",
            privateCode: "SETTLE",
            voterId: "test-host",
            roundId: first.id,
            answerIndex: 0,
          }),
        }),
      );
      await Promise.race([
        test.entered,
        pending.then(async (response) => {
          throw new Error(
            `Vote ended before its controlled commit: ${response.status} ${await response.clone().text()}`,
          );
        }),
      ]);
      now.mockReturnValue(first.answerDeadline + 850);
      expect((await test.read()).status).toBe(200);
      if (withEarlierVotes) expect(party.getPrivateRoom("SETTLE", Date.now()).players[1].score).toBe(300);
      test.release();
      expect(await (await pending).json()).toMatchObject({ accepted: true });
      now.mockReturnValue(first.revealDeadline + 100);
      const response = await (await test.read()).json();
      expect(response.previousResults).toContainEqual({
        roundId: first.id,
        correct: true,
        points: 100,
        game: "trivia",
        category: "Items",
      });
      const players = party.getPrivateRoom("SETTLE", Date.now()).players;
      expect(players[0].score).toBe(100);
      if (withEarlierVotes) expect(players[1].score).toBe(150);
      expect(party.pendingPrivateRoomRoundIds("SETTLE", response.round.id)).toEqual([]);
    },
  );

  it("recovers all 24 long IDs and never queries other-room or future recovery votes", async () => {
    const test = fixture();
    vi.spyOn(Date, "now").mockReturnValue(test.roundAt(30, 0).startedAt + 1_000);
    const ids = Array.from({ length: 24 }, (_, number) => test.roundAt(number, Date.now()).id);
    expect(ids.join(",").length).toBeGreaterThan(4_000);
    expect((await test.read(ids.join(","))).status).toBe(200);
    for (const id of ids) expect(test.crowd.mock.calls.some((call) => call[0] === id)).toBe(true);
    test.crowd.mockClear();
    const forbidden = [test.roundAt(31, Date.now()).id, ids[0].replace("SETTLE", "OTHER"), `${ids[0]}:extra`];
    expect((await test.read(forbidden.join(","))).status).toBe(200);
    expect(test.crowd.mock.calls.map((call) => call[0])).toEqual([
      test.roundAt(30, Date.now()).id,
      test.roundAt(29, Date.now()).id,
    ]);
    expect((await test.read("x".repeat(recovery.RECOVERY_PARAM_MAX + 1))).status).toBe(200);
  });
});

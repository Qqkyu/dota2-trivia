import { NextResponse, type NextRequest } from "next/server";
import { isAlphaSessionId } from "@/lib/alpha-analytics.mjs";
import { alphaSessionKey } from "@/lib/alpha-store";
import { sessionUserForRequest } from "@/lib/auth-session";
import { preflightRateLimit, rateLimitRequest, readJsonBody, requestOriginAllowed } from "@/lib/api-protection";
import { validatedGuestIdentity } from "@/lib/guest-identity.mjs";
import { roundFormatForQuestion } from "@/lib/arcade-games.mjs";
import { GAME_CATALOGS } from "@/lib/game-catalogs";
import {
  isKeyedAnswerQuestion,
  isQuestionAnswerCorrect,
  isValidAnswerKeyForQuestion,
  keyedAnswerIndex,
} from "@/lib/keyed-answer";
import { answerStageForRound } from "@/lib/player-profile.mjs";
import { liveRoundForSettings } from "@/lib/private-room-rounds";
import { addPrivateRoomScore, privateRoomMember } from "@/lib/private-rooms.mjs";
import { parsePublicRoomSettings, PUBLIC_VOTE_ACCEPT_GRACE_MS } from "@/lib/public-rooms";
import { questionCalibrationRevision } from "@/lib/question-revision.mjs";
import { scoreBreakdown } from "@/lib/scoring.mjs";
import { logServerError } from "@/lib/server-diagnostics";
import { recordRoundOutcome, type RoundOutcomeEffects } from "@/lib/vote-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  if (!requestOriginAllowed(request)) {
    return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
  }
  const preflight = preflightRateLimit(request, "votes", 600);
  if (preflight) return preflight;
  const parsed = await readJsonBody(request);
  if ("response" in parsed) return parsed.response;
  const { body } = parsed;

  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Missing vote fields." }, { status: 400 });
  }

  const candidate = body as Record<string, unknown>;
  const settings = parsePublicRoomSettings({
    gameId: candidate.gameId,
    mode: candidate.mode,
    filter: candidate.filter,
    privateCode: candidate.privateCode ?? candidate.room,
  });
  const { roundId, voterId, sessionId } = candidate;
  const answerIndex =
    typeof candidate.answerIndex === "number" &&
    Number.isInteger(candidate.answerIndex) &&
    candidate.answerIndex >= 0 &&
    candidate.answerIndex <= 3
      ? candidate.answerIndex
      : null;
  const answerKey = candidate.answerKey;

  if (
    !settings ||
    typeof roundId !== "string" ||
    typeof voterId !== "string" ||
    voterId.length < 8 ||
    voterId.length > 80 ||
    (sessionId !== undefined && !isAlphaSessionId(sessionId))
  ) {
    return NextResponse.json({ error: "Invalid vote." }, { status: 400 });
  }

  let accountUser: Awaited<ReturnType<typeof sessionUserForRequest>>;
  try {
    accountUser = await sessionUserForRequest(request);
  } catch (error) {
    logServerError("votes.account-session", error);
    return NextResponse.json({ error: "Vote storage unavailable." }, { status: 503 });
  }
  const guestId = validatedGuestIdentity(voterId);
  if (!accountUser && !guestId) return NextResponse.json({ error: "Invalid player." }, { status: 400 });
  const effectiveVoterId = accountUser ? `account:${accountUser.id}` : guestId!;
  const rateLimited = rateLimitRequest(request, "votes", effectiveVoterId, 12, 600);
  if (rateLimited) return rateLimited;

  const submittedAt = Date.now();
  const live = liveRoundForSettings(settings, submittedAt);
  if ("error" in live) {
    return NextResponse.json({ error: "That public round has already moved on." }, { status: 409 });
  }
  const { room, round } = live;
  if (live.isolated && settings.privateCode && !privateRoomMember(settings.privateCode, effectiveVoterId)) {
    return NextResponse.json({ error: "Join the party before answering." }, { status: 403 });
  }
  const question = GAME_CATALOGS[room.gameId].questions.find((candidate) => candidate.id === round.questionId);

  if (!question || round.id !== roundId) {
    return NextResponse.json({ error: "That public round has already moved on." }, { status: 409 });
  }

  const isKeyedAnswer = isKeyedAnswerQuestion(question);
  const resolvedKeyedAnswerIndex =
    isKeyedAnswer && isValidAnswerKeyForQuestion(question, answerKey) ? keyedAnswerIndex(question, answerKey) : null;
  if (
    (isKeyedAnswer && resolvedKeyedAnswerIndex === null) ||
    (!isKeyedAnswer && (answerIndex === null || answerKey !== undefined))
  ) {
    return NextResponse.json({ error: "Invalid answer for this round." }, { status: 400 });
  }

  if (submittedAt >= round.answerDeadline + PUBLIC_VOTE_ACCEPT_GRACE_MS) {
    return NextResponse.json({ error: "Answers are closed for this round." }, { status: 409 });
  }

  try {
    const resolvedAnswerIndex = isKeyedAnswer ? (resolvedKeyedAnswerIndex as number) : (answerIndex as number);
    const resolvedAnswerKey = isKeyedAnswer ? (answerKey as string) : undefined;
    const isCorrect = isQuestionAnswerCorrect(question, resolvedAnswerIndex, resolvedAnswerKey);
    const basePoints = isCorrect
      ? scoreBreakdown(
          { difficulty: question.difficulty, game: round.game },
          Math.max(0, round.answerDeadline - submittedAt),
          round.answerDuration,
        ).rawPoints
      : 0;
    const effects: RoundOutcomeEffects = {};
    if (accountUser && !live.isolated) {
      const roundFormat = roundFormatForQuestion(question);
      if (!roundFormat) throw new Error(`Question ${question.id} has no public round format.`);
      effects.account = {
        userId: accountUser.id,
        round: {
          roundId: round.id,
          roundNumber: round.number,
          gameId: room.gameId,
          questionId: question.id,
          questionRevision: questionCalibrationRevision(question),
          roundGame: round.game,
          roundFormat,
          correct: isCorrect,
          answerStage: answerStageForRound(
            round.game,
            Math.max(0, round.answerDeadline - submittedAt),
            round.answerDuration,
          ),
          submittedAt,
          revealAt: round.answerDeadline + PUBLIC_VOTE_ACCEPT_GRACE_MS,
        },
      };
    }
    if (typeof sessionId === "string") {
      effects.alpha = { key: alphaSessionKey({ sessionId, voterId: effectiveVoterId }), correct: isCorrect };
    }
    const result = await recordRoundOutcome(
      {
        roundId,
        roomId: room.id,
        gameId: room.gameId,
        contentVersion: room.contentVersion,
        questionId: round.questionId,
        questionRevision: questionCalibrationRevision(question),
        correctIndex: question.correctIndex,
        answerIndex: resolvedAnswerIndex,
        answerKey: resolvedAnswerKey,
        basePoints,
        voterId: effectiveVoterId,
        submittedAt,
        countTowardCalibration: !live.isolated,
      },
      effects,
    );

    if (live.isolated && settings.privateCode && result.accepted) {
      addPrivateRoomScore(settings.privateCode, effectiveVoterId, basePoints, submittedAt, roundId);
    }

    const playerVote =
      result.playerVote && isKeyedAnswer ? { ...result.playerVote, answerIndex: 0 } : result.playerVote;

    return NextResponse.json(
      {
        accepted: result.accepted,
        playerIdentity: accountUser ? { kind: "account", id: accountUser.id } : { kind: "guest", id: guestId! },
        counts: [0, 0, 0, 0],
        total: result.total,
        keyCounts: [],
        scoreSummary: null,
        playerVote,
      },
      {
        headers: {
          "Cache-Control": "no-store",
        },
      },
    );
  } catch (error) {
    logServerError("votes.persist", error, {
      roundId: roundId.slice(0, 160),
      questionId: round.questionId.slice(0, 120),
    });
    return NextResponse.json({ error: "Vote storage unavailable." }, { status: 503 });
  }
}

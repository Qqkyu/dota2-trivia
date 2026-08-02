import { NextResponse, type NextRequest } from "next/server";
import Pusher from "pusher";
import { isAlphaSessionId } from "@/lib/alpha-analytics.mjs";
import { recordAlphaSessionRound } from "@/lib/alpha-store";
import { sessionUserForRequest } from "@/lib/auth-session";
import { rateLimitRequest } from "@/lib/api-protection";
import { roundFormatForQuestion } from "@/lib/arcade-games.mjs";
import { recordPlayerRound } from "@/lib/account-store";
import { GAME_CATALOGS } from "@/lib/game-catalogs";
import {
  isKeyedAnswerQuestion,
  isQuestionAnswerCorrect,
  isValidAnswerKeyForQuestion,
  keyedAnswerIndex,
} from "@/lib/keyed-answer";
import { isMapPosition, mapAnswerIndex } from "@/lib/map-sense";
import { answerStageForRound } from "@/lib/player-profile.mjs";
import { currentPublicRound, parsePublicRoomSettings } from "@/lib/public-rooms";
import { questionCalibrationRevision } from "@/lib/question-revision.mjs";
import { logServerError } from "@/lib/server-diagnostics";
import { recordRoundVote } from "@/lib/vote-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function getPusherServer() {
  const appId = process.env.PUSHER_APP_ID;
  const key = process.env.NEXT_PUBLIC_PUSHER_APP_KEY;
  const secret = process.env.PUSHER_APP_SECRET;
  const cluster = process.env.NEXT_PUBLIC_PUSHER_CLUSTER;

  if (!appId || !key || !secret || !cluster) return null;

  return new Pusher({
    appId,
    key,
    secret,
    cluster,
    useTLS: true,
  });
}

export async function POST(request: NextRequest) {
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Missing vote fields." }, { status: 400 });
  }

  const candidate = body as Record<string, unknown>;
  const settings = parsePublicRoomSettings({
    gameId: candidate.gameId,
    mode: candidate.mode,
    filter: candidate.filter,
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
  const effectiveVoterId = accountUser ? `account:${accountUser.id}` : voterId;
  const rateLimited = rateLimitRequest(request, "votes", effectiveVoterId, 12);
  if (rateLimited) return rateLimited;

  const submittedAt = Date.now();
  const { room, round } = currentPublicRound(settings, submittedAt);
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

  const mapPosition = isMapPosition(candidate.mapPosition) ? candidate.mapPosition : undefined;
  const requiresMapPosition = Boolean(question.map && !question.map.choice);
  if (requiresMapPosition && !mapPosition) {
    return NextResponse.json({ error: "Map Sense requires a valid map position." }, { status: 400 });
  }

  if (round.phase !== "answering" || submittedAt >= round.answerDeadline) {
    return NextResponse.json({ error: "Answers are closed for this round." }, { status: 409 });
  }

  try {
    const resolvedAnswerIndex = isKeyedAnswer
      ? (resolvedKeyedAnswerIndex as number)
      : requiresMapPosition && question.map && mapPosition
        ? mapAnswerIndex(question.map, mapPosition)
        : (answerIndex as number);
    const resolvedAnswerKey = isKeyedAnswer ? (answerKey as string) : undefined;
    const result = await recordRoundVote({
      roundId,
      roomId: room.id,
      gameId: room.gameId,
      contentVersion: room.contentVersion,
      questionId: round.questionId,
      questionRevision: questionCalibrationRevision(question),
      correctIndex: question.correctIndex,
      answerIndex: resolvedAnswerIndex,
      answerKey: resolvedAnswerKey,
      mapPosition: requiresMapPosition ? mapPosition : undefined,
      voterId: effectiveVoterId,
      submittedAt,
    });

    if (accountUser && result.playerVote) {
      const roundFormat = roundFormatForQuestion(question);
      if (!roundFormat) throw new Error(`Question ${question.id} has no public round format.`);
      const storedVote = result.playerVote;
      await recordPlayerRound(accountUser.id, {
        roundId: round.id,
        roundNumber: round.number,
        gameId: room.gameId,
        questionId: question.id,
        questionRevision: questionCalibrationRevision(question),
        roundGame: round.game,
        roundFormat,
        correct: isQuestionAnswerCorrect(question, storedVote.answerIndex, storedVote.answerKey),
        answerStage: answerStageForRound(
          round.game,
          Math.max(0, round.answerDeadline - storedVote.submittedAt),
          round.answerDuration,
        ),
        submittedAt: storedVote.submittedAt,
      });
    }

    if (result.accepted && typeof sessionId === "string") {
      try {
        await recordAlphaSessionRound(
          { sessionId, voterId: effectiveVoterId },
          isQuestionAnswerCorrect(question, resolvedAnswerIndex, resolvedAnswerKey),
          submittedAt,
        );
      } catch (error) {
        logServerError("alpha-session.round", error, { roundId: roundId.slice(0, 160) });
      }
    }

    if (result.accepted) {
      const pusher = getPusherServer();
      if (pusher) {
        try {
          await pusher.trigger("queue-arcade", "vote-update", {
            roomId: room.id,
            roundId,
            counts: [0, 0, 0, 0],
            total: result.total,
            positions: [],
            keyCounts: [],
          });
        } catch (error) {
          logServerError("votes.broadcast", error, { roundId: roundId.slice(0, 160) });
        }
      }
    }

    const playerVote =
      result.playerVote && isKeyedAnswer ? { ...result.playerVote, answerIndex: 0 } : result.playerVote;

    return NextResponse.json(
      {
        accepted: result.accepted,
        counts: [0, 0, 0, 0],
        total: result.total,
        positions: [],
        keyCounts: [],
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

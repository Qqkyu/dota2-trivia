import { NextResponse } from "next/server";
import Pusher from "pusher";
import { GAME_CATALOGS } from "@/lib/game-catalogs";
import { isMapPosition, mapAnswerIndex } from "@/lib/map-sense";
import { currentPublicRound, parsePublicRoomSettings } from "@/lib/public-rooms";
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

export async function POST(request: Request) {
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
    skillLevel: candidate.skillLevel,
  });
  const { roundId, questionId, answerIndex, voterId } = candidate;

  if (
    !settings ||
    typeof roundId !== "string" ||
    typeof questionId !== "string" ||
    typeof answerIndex !== "number" ||
    !Number.isInteger(answerIndex) ||
    answerIndex < 0 ||
    answerIndex > 3 ||
    typeof voterId !== "string" ||
    voterId.length < 8 ||
    voterId.length > 80
  ) {
    return NextResponse.json({ error: "Invalid vote." }, { status: 400 });
  }

  const submittedAt = Date.now();
  const { room, round } = currentPublicRound(settings, submittedAt);
  const question = GAME_CATALOGS[room.gameId].questions.find((candidate) => candidate.id === round.questionId);

  if (!question || round.id !== roundId || round.questionId !== questionId) {
    return NextResponse.json({ error: "That public round has already moved on." }, { status: 409 });
  }

  const mapPosition = isMapPosition(candidate.mapPosition) ? candidate.mapPosition : undefined;
  if (question.map && !mapPosition) {
    return NextResponse.json({ error: "Map Sense requires a valid map position." }, { status: 400 });
  }

  if (round.phase !== "answering" || submittedAt >= round.answerDeadline) {
    return NextResponse.json({ error: "Answers are closed for this round." }, { status: 409 });
  }

  try {
    const result = await recordRoundVote({
      roundId,
      roomId: room.id,
      gameId: room.gameId,
      contentVersion: room.contentVersion,
      questionId,
      correctIndex: question.correctIndex,
      answerIndex: question.map && mapPosition ? mapAnswerIndex(question.map, mapPosition) : answerIndex,
      mapPosition: question.map ? mapPosition : undefined,
      voterId,
      submittedAt,
    });

    if (result.accepted) {
      const pusher = getPusherServer();
      if (pusher) {
        try {
          await pusher.trigger("queue-arcade", "vote-update", {
            roomId: room.id,
            roundId,
            questionId,
            counts: [0, 0, 0, 0],
            total: result.total,
            positions: [],
          });
        } catch (error) {
          console.error("Could not broadcast arcade vote.", error);
        }
      }
    }

    return NextResponse.json(
      {
        accepted: result.accepted,
        counts: [0, 0, 0, 0],
        total: result.total,
        positions: [],
        playerVote: result.playerVote,
      },
      {
        headers: {
          "Cache-Control": "no-store",
        },
      },
    );
  } catch (error) {
    console.error("Could not persist the arcade vote.", error);
    return NextResponse.json({ error: "Vote storage unavailable." }, { status: 503 });
  }
}

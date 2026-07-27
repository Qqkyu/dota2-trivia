import { NextResponse } from "next/server";
import { isReportReason } from "@/lib/calibration";
import { GAME_CATALOGS } from "@/lib/game-catalogs";
import { currentPublicRound, parsePublicRoomSettings } from "@/lib/public-rooms";
import { recordQuestionReport } from "@/lib/vote-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Missing report fields." }, { status: 400 });
  }

  const candidate = body as Record<string, unknown>;
  const settings = parsePublicRoomSettings({
    gameId: candidate.gameId,
    mode: candidate.mode,
    filter: candidate.filter,
    skillLevel: candidate.skillLevel,
  });
  const { roundId, questionId, reason, voterId } = candidate;

  if (
    !settings ||
    typeof roundId !== "string" ||
    typeof questionId !== "string" ||
    !isReportReason(reason) ||
    typeof voterId !== "string" ||
    voterId.length < 8 ||
    voterId.length > 80
  ) {
    return NextResponse.json({ error: "Invalid report." }, { status: 400 });
  }

  const submittedAt = Date.now();
  const { room, round } = currentPublicRound(settings, submittedAt);
  const question = GAME_CATALOGS[room.gameId].questions.find((candidate) => candidate.id === round.questionId);

  if (!question || round.id !== roundId || round.questionId !== questionId) {
    return NextResponse.json({ error: "That public round has already moved on." }, { status: 409 });
  }

  if (round.phase !== "reveal" || submittedAt >= round.revealDeadline) {
    return NextResponse.json({ error: "Reports open with the answer reveal." }, { status: 409 });
  }

  try {
    const result = await recordQuestionReport({
      gameId: room.gameId,
      contentVersion: room.contentVersion,
      questionId,
      correctIndex: question.correctIndex,
      reason,
      voterId,
      submittedAt,
    });

    return NextResponse.json(result, {
      headers: {
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error("Could not persist the question report.", error);
    return NextResponse.json({ error: "Report storage unavailable." }, { status: 503 });
  }
}

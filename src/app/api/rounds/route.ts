import { NextResponse } from "next/server";
import type { CrowdResult } from "@/lib/arcade-contract";
import { rateLimitRequest } from "@/lib/api-protection";
import { GAME_CATALOGS } from "@/lib/game-catalogs";
import { currentPublicRound, parsePublicRoomSettings } from "@/lib/public-rooms";
import { questionCalibrationRevision } from "@/lib/question-revision.mjs";
import { getPlayerQuestionReport, getRoundCrowd } from "@/lib/vote-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const HIDDEN_COUNTS: CrowdResult["counts"] = [0, 0, 0, 0];

export async function GET(request: Request) {
  const searchParams = new URL(request.url).searchParams;
  const settings = parsePublicRoomSettings({
    gameId: searchParams.get("gameId"),
    mode: searchParams.get("mode"),
    filter: searchParams.get("filter"),
  });
  const playerId = searchParams.get("playerId") ?? undefined;

  if (!settings) {
    return NextResponse.json({ error: "Invalid public room settings." }, { status: 400 });
  }

  if (playerId && (playerId.length < 8 || playerId.length > 80)) {
    return NextResponse.json({ error: "Invalid player ID." }, { status: 400 });
  }

  const rateLimited = rateLimitRequest(request, "rounds", playerId ?? "anonymous", 180);
  if (rateLimited) return rateLimited;

  try {
    const serverNow = Date.now();
    const { room, round } = currentPublicRound(settings, serverNow);
    const question = GAME_CATALOGS[room.gameId].questions.find((candidate) => candidate.id === round.questionId);
    if (!question) throw new Error(`Public question ${round.questionId} is missing from the active catalog.`);
    const [result, playerReport] = await Promise.all([
      getRoundCrowd(round.id, room.id, playerId),
      getPlayerQuestionReport(
        room.gameId,
        room.contentVersion,
        round.questionId,
        questionCalibrationRevision(question),
        playerId,
      ),
    ]);

    return NextResponse.json(
      {
        serverNow,
        room,
        round,
        crowd: {
          counts: round.phase === "reveal" ? result.counts : HIDDEN_COUNTS,
          total: result.total,
          positions: round.phase === "reveal" ? result.positions : [],
        },
        playerVote: result.playerVote,
        playerReport,
      },
      {
        headers: {
          "Cache-Control": "no-store",
        },
      },
    );
  } catch (error) {
    console.error("Could not read the public arcade room.", error);
    return NextResponse.json({ error: "Public room storage unavailable." }, { status: 503 });
  }
}

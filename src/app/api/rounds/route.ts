import { NextResponse, type NextRequest } from "next/server";
import type { CrowdResult } from "@/lib/arcade-contract";
import { sessionUserForRequest } from "@/lib/auth-session";
import { rateLimitRequest } from "@/lib/api-protection";
import { GAME_CATALOGS } from "@/lib/game-catalogs";
import { currentPublicRound, parsePublicRoomSettings } from "@/lib/public-rooms";
import { questionCalibrationRevision } from "@/lib/question-revision.mjs";
import { touchRoomPresence } from "@/lib/room-presence.mjs";
import { logServerError } from "@/lib/server-diagnostics";
import { getPlayerQuestionReport, getRoundCrowd } from "@/lib/vote-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const HIDDEN_COUNTS: CrowdResult["counts"] = [0, 0, 0, 0];

export async function GET(request: NextRequest) {
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

  try {
    const accountUser = await sessionUserForRequest(request);
    const effectivePlayerId = accountUser ? `account:${accountUser.id}` : playerId;
    const rateLimited = rateLimitRequest(request, "rounds", effectivePlayerId ?? "anonymous", 180);
    if (rateLimited) return rateLimited;
    const serverNow = Date.now();
    const { room, round } = currentPublicRound(settings, serverNow);
    const activePlayers = effectivePlayerId ? touchRoomPresence(room.id, effectivePlayerId, serverNow) : 0;
    const question = GAME_CATALOGS[room.gameId].questions.find((candidate) => candidate.id === round.questionId);
    if (!question) throw new Error(`Public question ${round.questionId} is missing from the active catalog.`);
    const [result, playerReport] = await Promise.all([
      getRoundCrowd(round.id, room.id, effectivePlayerId),
      getPlayerQuestionReport(
        room.gameId,
        room.contentVersion,
        round.questionId,
        questionCalibrationRevision(question),
        effectivePlayerId,
      ),
    ]);

    return NextResponse.json(
      {
        serverNow,
        room,
        round,
        presence: { activePlayers },
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
    logServerError("rounds.read", error);
    return NextResponse.json({ error: "Public room storage unavailable." }, { status: 503 });
  }
}

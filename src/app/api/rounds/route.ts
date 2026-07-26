import { NextResponse } from "next/server";
import type { CrowdResult } from "@/lib/arcade-contract";
import { currentPublicRound, parsePublicRoomSettings } from "@/lib/public-rooms";
import { getRoundCrowd } from "@/lib/vote-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const HIDDEN_COUNTS: CrowdResult["counts"] = [0, 0, 0, 0];

export async function GET(request: Request) {
  const searchParams = new URL(request.url).searchParams;
  const settings = parsePublicRoomSettings({
    gameId: searchParams.get("gameId"),
    mode: searchParams.get("mode"),
    filter: searchParams.get("filter"),
    skillLevel: searchParams.get("skillLevel"),
  });
  const playerId = searchParams.get("playerId") ?? undefined;

  if (!settings) {
    return NextResponse.json({ error: "Invalid public room settings." }, { status: 400 });
  }

  if (playerId && (playerId.length < 8 || playerId.length > 80)) {
    return NextResponse.json({ error: "Invalid player ID." }, { status: 400 });
  }

  try {
    const serverNow = Date.now();
    const { room, round } = currentPublicRound(settings, serverNow);
    const result = await getRoundCrowd(round.id, room.id, playerId);

    return NextResponse.json(
      {
        serverNow,
        room,
        round,
        crowd: {
          counts: round.phase === "reveal" ? result.counts : HIDDEN_COUNTS,
          total: result.total,
        },
        playerVote: result.playerVote,
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

import { NextResponse, type NextRequest } from "next/server";
import { rateLimitRequest } from "@/lib/api-protection";
import { PUBLIC_ARCADE_MODE } from "@/lib/arcade-games.mjs";
import { DEFAULT_GAME_ID } from "@/lib/game-catalogs";
import { liveRoundForSettings } from "@/lib/private-room-rounds";
import { parsePublicRoomSettings, publicRoomFor } from "@/lib/public-rooms";
import { getRoomPresence } from "@/lib/room-presence.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * The lobby's room pulse: who is playing and where the shared clock stands.
 * It never carries a question, an answer, or a round id, so it is safe to poll
 * before a player has joined.
 */
export async function GET(request: NextRequest) {
  const rateLimited = rateLimitRequest(request, "presence", "public-room", 600, 600);
  if (rateLimited) return rateLimited;

  const room = publicRoomFor({ gameId: DEFAULT_GAME_ID, mode: PUBLIC_ARCADE_MODE, filter: "Mixed" });
  const settings = parsePublicRoomSettings({ gameId: DEFAULT_GAME_ID, mode: PUBLIC_ARCADE_MODE, filter: "Mixed" });
  const serverNow = Date.now();
  const live = settings ? liveRoundForSettings(settings, serverNow) : null;
  const round =
    live && !("error" in live)
      ? {
          number: live.round.number,
          game: live.round.game,
          phase: live.round.phase,
          answerDeadline: live.round.answerDeadline,
          revealDeadline: live.round.revealDeadline,
          answerDuration: live.round.answerDuration,
        }
      : null;

  return NextResponse.json(
    { activePlayers: getRoomPresence(room.id), serverNow, round },
    { headers: { "Cache-Control": "no-store" } },
  );
}

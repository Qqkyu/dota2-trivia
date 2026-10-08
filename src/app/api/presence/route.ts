import { NextResponse, type NextRequest } from "next/server";
import { rateLimitRequest } from "@/lib/api-protection";
import { PUBLIC_ARCADE_MODE } from "@/lib/arcade-games.mjs";
import { DEFAULT_GAME_ID } from "@/lib/game-catalogs";
import { publicRoomFor } from "@/lib/public-rooms";
import { getRoomPresence } from "@/lib/room-presence.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const rateLimited = rateLimitRequest(request, "presence", "public-room", 600, 600);
  if (rateLimited) return rateLimited;

  const room = publicRoomFor({ gameId: DEFAULT_GAME_ID, mode: PUBLIC_ARCADE_MODE, filter: "Mixed" });
  return NextResponse.json({ activePlayers: getRoomPresence(room.id) }, { headers: { "Cache-Control": "no-store" } });
}

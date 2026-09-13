import { NextResponse, type NextRequest } from "next/server";
import { rateLimitRequest } from "@/lib/api-protection";
import { DEFAULT_GAME_ID } from "@/lib/game-identity";
import { GAME_CATALOGS } from "@/lib/game-catalogs";
import { privateRoomClientPayload, privateRoomIdentity } from "@/lib/private-room-rounds";
import { createPrivateRoom, getPrivateRoom, normalizePrivateRoomCode, touchPrivateRoom } from "@/lib/private-rooms.mjs";
import { logServerError } from "@/lib/server-diagnostics";
import { touchRoomPresence } from "@/lib/room-presence.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const code = normalizePrivateRoomCode(url.searchParams.get("code"));
  const queryPlayerId = url.searchParams.get("playerId");
  const peek = url.searchParams.get("peek") === "1";
  if (!code) return NextResponse.json({ error: "Unknown private room." }, { status: 404 });

  try {
    if (peek) {
      const rateLimited = rateLimitRequest(request, "private-rooms-peek", code, 60);
      if (rateLimited) return rateLimited;
      const now = Date.now();
      const record = getPrivateRoom(code, now);
      if (!record) return NextResponse.json({ error: "Unknown private room." }, { status: 404 });
      return NextResponse.json(privateRoomClientPayload(record, "", now), {
        headers: { "Cache-Control": "no-store" },
      });
    }
    const identity = await privateRoomIdentity(request, queryPlayerId);
    if (!identity) return NextResponse.json({ error: "Invalid player ID." }, { status: 400 });
    const rateLimited = rateLimitRequest(request, "private-rooms-read", identity.playerId, 120);
    if (rateLimited) return rateLimited;
    const now = Date.now();
    const rawName = new URL(request.url).searchParams.get("name");
    const applyName = typeof rawName === "string" && rawName.trim() !== "";
    const record = touchPrivateRoom(code, now, {
      playerId: identity.playerId,
      name: applyName ? rawName.trim() : identity.name,
      applyName,
    });
    if (!record) return NextResponse.json({ error: "Unknown private room." }, { status: 404 });
    if ("full" in record && record.full) {
      return NextResponse.json({ error: "This party is full." }, { status: 409 });
    }
    touchRoomPresence(record.roomId, identity.playerId, now);
    return NextResponse.json(privateRoomClientPayload(record, identity.playerId, now), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    logServerError("private-rooms.read", error);
    return NextResponse.json({ error: "Private room storage unavailable." }, { status: 503 });
  }
}

export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Missing private-room fields." }, { status: 400 });
  }

  const candidate = body as Record<string, unknown>;
  try {
    const identity = await privateRoomIdentity(request, candidate.playerId);
    if (!identity) return NextResponse.json({ error: "Invalid player ID." }, { status: 400 });
    const rateLimited = rateLimitRequest(request, "private-rooms-create", identity.playerId, 8);
    if (rateLimited) return rateLimited;
    const catalog = GAME_CATALOGS[DEFAULT_GAME_ID];
    const now = Date.now();
    const record = createPrivateRoom({
      hostId: identity.playerId,
      gameId: catalog.id,
      contentVersion: catalog.contentVersion,
      games: candidate.games,
      code: candidate.code,
      name: typeof candidate.name === "string" && candidate.name.trim() ? candidate.name.trim() : identity.name,
      now,
    });
    touchRoomPresence(record.roomId, identity.playerId, now);
    return NextResponse.json(privateRoomClientPayload(record, identity.playerId, now), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not create a private room.";
    if (
      message === "Pick at least one game." ||
      message === "Pick a party code." ||
      message === "That code is taken."
    ) {
      return NextResponse.json({ error: message }, { status: 400 });
    }
    logServerError("private-rooms.create", error);
    return NextResponse.json({ error: "Could not create a private room." }, { status: 400 });
  }
}

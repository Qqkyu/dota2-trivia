import { NextResponse, type NextRequest } from "next/server";
import { rateLimitRequest } from "@/lib/api-protection";
import { privateRoomClientPayload, privateRoomIdentity } from "@/lib/private-room-rounds";
import { rematchPrivateRoom, startPrivateRoom } from "@/lib/private-rooms.mjs";
import { logServerError } from "@/lib/server-diagnostics";
import { touchRoomPresence } from "@/lib/room-presence.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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
    const rateLimited = rateLimitRequest(request, "private-rooms-start", identity.playerId, 20);
    if (rateLimited) return rateLimited;
    const now = Date.now();
    const rematch = candidate.rematch === true;
    const result = rematch
      ? rematchPrivateRoom(candidate.code, identity.playerId, now)
      : startPrivateRoom(candidate.code, identity.playerId, now);
    if (!result.ok && result.reason === "missing") {
      return NextResponse.json({ error: "Unknown private room." }, { status: 404 });
    }
    if (!result.ok && result.reason === "not-started") {
      return NextResponse.json({ error: "The party has not started." }, { status: 409 });
    }
    if (!result.ok && result.reason === "names") {
      return NextResponse.json({ error: "Party names must be unique." }, { status: 409 });
    }
    if (!result.ok || !result.room) {
      return NextResponse.json(
        { error: rematch ? "Only the host can rematch." : "Only the host can start this room." },
        { status: 403 },
      );
    }
    touchRoomPresence(result.room.roomId, identity.playerId, now);
    return NextResponse.json(privateRoomClientPayload(result.room, identity.playerId, now), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    logServerError("private-rooms.start", error);
    return NextResponse.json({ error: "Could not start the private room." }, { status: 503 });
  }
}

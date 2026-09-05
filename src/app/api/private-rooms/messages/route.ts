import { NextResponse, type NextRequest } from "next/server";
import { rateLimitRequest } from "@/lib/api-protection";
import { privateRoomClientPayload, privateRoomIdentity } from "@/lib/private-room-rounds";
import { addPrivateRoomMessage } from "@/lib/private-rooms.mjs";
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
    return NextResponse.json({ error: "Missing chat fields." }, { status: 400 });
  }

  const candidate = body as Record<string, unknown>;
  try {
    const identity = await privateRoomIdentity(request, candidate.playerId);
    if (!identity) return NextResponse.json({ error: "Invalid player ID." }, { status: 400 });
    const rateLimited = rateLimitRequest(request, "private-rooms-chat", identity.playerId, 30);
    if (rateLimited) return rateLimited;
    const now = Date.now();
    const result = addPrivateRoomMessage(candidate.code, {
      playerId: identity.playerId,
      text: candidate.text,
      now,
    });
    if (!result.ok && result.reason === "missing") {
      return NextResponse.json({ error: "Unknown private room." }, { status: 404 });
    }
    if (!result.ok && result.reason === "forbidden") {
      return NextResponse.json({ error: "Join the party before chatting." }, { status: 403 });
    }
    if (!result.ok || !result.room) {
      return NextResponse.json({ error: "Message was empty." }, { status: 400 });
    }
    touchRoomPresence(result.room.roomId, identity.playerId, now);
    return NextResponse.json(privateRoomClientPayload(result.room, identity.playerId, now), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    logServerError("private-rooms.chat", error);
    return NextResponse.json({ error: "Could not send the message." }, { status: 503 });
  }
}

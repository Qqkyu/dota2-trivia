import { NextResponse, type NextRequest } from "next/server";
import { rateLimitRequest } from "@/lib/api-protection";
import { privateRoomClientPayload, privateRoomIdentity } from "@/lib/private-room-rounds";
import { leavePrivateRoom, normalizePrivateRoomCode } from "@/lib/private-rooms.mjs";
import { logServerError } from "@/lib/server-diagnostics";

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
  const code = normalizePrivateRoomCode(typeof candidate.code === "string" ? candidate.code : "");
  try {
    const identity = await privateRoomIdentity(request, candidate.playerId);
    if (!identity) return NextResponse.json({ error: "Invalid player ID." }, { status: 400 });
    const rateLimited = rateLimitRequest(request, "private-rooms-leave", identity.playerId, 40);
    if (rateLimited) return rateLimited;
    const now = Date.now();
    const record = code ? leavePrivateRoom(code, identity.playerId, now) : null;
    if (!record) return NextResponse.json({ error: "Unknown private room." }, { status: 404 });
    return NextResponse.json(privateRoomClientPayload(record, identity.playerId, now), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    logServerError("private-rooms.leave", error);
    return NextResponse.json({ error: "Could not leave the private room." }, { status: 503 });
  }
}

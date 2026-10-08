import { NextResponse, type NextRequest } from "next/server";
import { preflightRateLimit, rateLimitRequest, readJsonBody, requestOriginAllowed } from "@/lib/api-protection";
import { privateRoomClientPayload, privateRoomIdentity } from "@/lib/private-room-rounds";
import { getPrivateRoom, leavePrivateRoom, normalizePrivateRoomCode, privateRoomMember } from "@/lib/private-rooms.mjs";
import { logServerError } from "@/lib/server-diagnostics";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  if (!requestOriginAllowed(request)) {
    return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
  }
  const limited = preflightRateLimit(request, "private-rooms-leave", 200);
  if (limited) return limited;
  const parsed = await readJsonBody(request);
  if ("response" in parsed) return parsed.response;
  const { body } = parsed;
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
    if (!code || !getPrivateRoom(code, now)) {
      return NextResponse.json({ error: "Unknown private room." }, { status: 404 });
    }
    if (!privateRoomMember(code, identity.playerId)) {
      return NextResponse.json({ error: "Join the party first." }, { status: 403 });
    }
    const record = leavePrivateRoom(code, identity.playerId, now);
    if (!record) return NextResponse.json({ left: true }, { headers: { "Cache-Control": "no-store" } });
    return NextResponse.json(privateRoomClientPayload(record, identity.playerId, now), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    logServerError("private-rooms.leave", error);
    return NextResponse.json({ error: "Could not leave the private room." }, { status: 503 });
  }
}

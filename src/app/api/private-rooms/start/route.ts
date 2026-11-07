import { NextResponse, type NextRequest } from "next/server";
import { requestLocale, translatorFor } from "@/i18n/server";
import { preflightRateLimit, rateLimitRequest, readJsonBody, requestOriginAllowed } from "@/lib/api-protection";
import { privateRoomClientPayload, privateRoomIdentity } from "@/lib/private-room-rounds";
import { startPrivateRoom } from "@/lib/private-rooms.mjs";
import { logServerError } from "@/lib/server-diagnostics";
import { touchRoomPresence } from "@/lib/room-presence.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const t = translatorFor(requestLocale(request));
  if (!requestOriginAllowed(request)) {
    return NextResponse.json({ error: t("party.error.origin") }, { status: 403 });
  }
  const limited = preflightRateLimit(request, "private-rooms-start", 100);
  if (limited) return limited;
  const parsed = await readJsonBody(request);
  if ("response" in parsed) return parsed.response;
  const { body } = parsed;
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: t("party.error.fields") }, { status: 400 });
  }

  const candidate = body as Record<string, unknown>;
  try {
    const identity = await privateRoomIdentity(request, candidate.playerId);
    if (!identity) return NextResponse.json({ error: t("party.error.player") }, { status: 400 });
    const rateLimited = rateLimitRequest(request, "private-rooms-start", identity.playerId, 20);
    if (rateLimited) return rateLimited;
    const now = Date.now();
    const result = startPrivateRoom(candidate.code, identity.playerId, now);
    if (!result.ok && result.reason === "missing") {
      return NextResponse.json({ error: t("party.error.unknownRoom") }, { status: 404 });
    }
    if (!result.ok && result.reason === "names") {
      return NextResponse.json({ error: t("party.error.namesUnique") }, { status: 409 });
    }
    if (!result.ok || !result.room) {
      return NextResponse.json({ error: t("party.error.hostOnly") }, { status: 403 });
    }
    touchRoomPresence(result.room.roomId, identity.playerId, now);
    return NextResponse.json(privateRoomClientPayload(result.room, identity.playerId, now), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    logServerError("private-rooms.start", error);
    return NextResponse.json({ error: t("party.error.startRoom") }, { status: 503 });
  }
}

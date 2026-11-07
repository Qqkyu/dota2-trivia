import { NextResponse, type NextRequest } from "next/server";
import { requestLocale, translatorFor } from "@/i18n/server";
import { preflightRateLimit, rateLimitRequest, readJsonBody, requestOriginAllowed } from "@/lib/api-protection";
import { privateRoomClientPayload, privateRoomIdentity } from "@/lib/private-room-rounds";
import { addPrivateRoomMessage } from "@/lib/private-rooms.mjs";
import { logServerError } from "@/lib/server-diagnostics";
import { touchRoomPresence } from "@/lib/room-presence.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const t = translatorFor(requestLocale(request));
  if (!requestOriginAllowed(request)) {
    return NextResponse.json({ error: t("party.error.origin") }, { status: 403 });
  }
  const limited = preflightRateLimit(request, "private-rooms-chat", 150);
  if (limited) return limited;
  const parsed = await readJsonBody(request);
  if ("response" in parsed) return parsed.response;
  const { body } = parsed;
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: t("party.error.chatFields") }, { status: 400 });
  }

  const candidate = body as Record<string, unknown>;
  try {
    const identity = await privateRoomIdentity(request, candidate.playerId);
    if (!identity) return NextResponse.json({ error: t("party.error.player") }, { status: 400 });
    const rateLimited = rateLimitRequest(request, "private-rooms-chat", identity.playerId, 30);
    if (rateLimited) return rateLimited;
    const now = Date.now();
    const result = addPrivateRoomMessage(candidate.code, {
      playerId: identity.playerId,
      text: candidate.text,
      now,
    });
    if (!result.ok && result.reason === "missing") {
      return NextResponse.json({ error: t("party.error.unknownRoom") }, { status: 404 });
    }
    if (!result.ok && result.reason === "forbidden") {
      return NextResponse.json({ error: t("party.error.joinBeforeChat") }, { status: 403 });
    }
    if (!result.ok || !result.room) {
      return NextResponse.json({ error: t("party.error.emptyMessage") }, { status: 400 });
    }
    touchRoomPresence(result.room.roomId, identity.playerId, now);
    return NextResponse.json(privateRoomClientPayload(result.room, identity.playerId, now), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    logServerError("private-rooms.chat", error);
    return NextResponse.json({ error: t("party.error.sendMessage") }, { status: 503 });
  }
}

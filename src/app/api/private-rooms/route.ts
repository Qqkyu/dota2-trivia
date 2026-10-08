import { NextResponse, type NextRequest } from "next/server";
import { preflightRateLimit, rateLimitRequest, readJsonBody, requestOriginAllowed } from "@/lib/api-protection";
import { DEFAULT_GAME_ID } from "@/lib/game-identity";
import { GAME_CATALOGS } from "@/lib/game-catalogs";
import { privateRoomClientPayload, privateRoomIdentity } from "@/lib/private-room-rounds";
import {
  createPrivateRoom,
  getPrivateRoom,
  normalizePrivateRoomCode,
  privateRoomMember,
  touchPrivateRoom,
} from "@/lib/private-rooms.mjs";
import { logServerError } from "@/lib/server-diagnostics";
import { touchRoomPresence } from "@/lib/room-presence.mjs";
import { requestClientAddress } from "@/lib/rate-limit.mjs";
import { anonymousVoterHash } from "@/lib/voter-hash";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const limited = preflightRateLimit(request, "private-rooms-read", 9_000);
  if (limited) return limited;
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
    const rateLimited = rateLimitRequest(request, "private-rooms-read", identity.playerId, 120, 9_000);
    if (rateLimited) return rateLimited;
    const now = Date.now();
    const record = getPrivateRoom(code, now, identity.playerId);
    if (!record) return NextResponse.json({ error: "Unknown private room." }, { status: 404 });
    if (!privateRoomMember(code, identity.playerId)) {
      return NextResponse.json({ error: "Join the party first." }, { status: 403 });
    }
    return NextResponse.json(privateRoomClientPayload(record, identity.playerId, now), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    logServerError("private-rooms.read", error);
    return NextResponse.json({ error: "Private room storage unavailable." }, { status: 503 });
  }
}

export async function POST(request: NextRequest) {
  if (!requestOriginAllowed(request)) {
    return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
  }
  const limited = preflightRateLimit(request, "private-rooms-write", 9_000);
  if (limited) return limited;
  const parsed = await readJsonBody(request);
  if ("response" in parsed) return parsed.response;
  const { body } = parsed;
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Missing private-room fields." }, { status: 400 });
  }

  const candidate = body as Record<string, unknown>;
  const action = candidate.action ?? "create";
  if (typeof action !== "string" || !["create", "join", "touch", "rename"].includes(action)) {
    return NextResponse.json({ error: "Invalid party action." }, { status: 400 });
  }
  try {
    const identity = await privateRoomIdentity(request, candidate.playerId);
    if (!identity) return NextResponse.json({ error: "Invalid player ID." }, { status: 400 });
    const allowance = action === "touch" ? 120 : action === "create" ? 8 : 30;
    const rateLimited = rateLimitRequest(
      request,
      `private-rooms-${action}`,
      identity.playerId,
      allowance,
      action === "touch" ? 9_000 : undefined,
    );
    if (rateLimited) return rateLimited;
    const now = Date.now();
    if (action !== "create") {
      const code = normalizePrivateRoomCode(candidate.code);
      if (!code || !getPrivateRoom(code, now)) {
        return NextResponse.json({ error: "Unknown private room." }, { status: 404 });
      }
      if (action !== "join" && !privateRoomMember(code, identity.playerId)) {
        return NextResponse.json({ error: "Join the party first." }, { status: 403 });
      }
      const name = typeof candidate.name === "string" ? candidate.name.trim() : "";
      if (action === "rename" && !name) {
        return NextResponse.json({ error: "Type a name." }, { status: 400 });
      }
      const record = touchPrivateRoom(code, now, {
        playerId: identity.playerId,
        name: name || identity.name,
        applyName: action === "rename" || (action === "join" && Boolean(name)),
      });
      if (!record) return NextResponse.json({ error: "Unknown private room." }, { status: 404 });
      if ("full" in record && record.full) {
        return NextResponse.json({ error: "This party is full." }, { status: 409 });
      }
      touchRoomPresence(record.roomId, identity.playerId, now);
      return NextResponse.json(privateRoomClientPayload(record, identity.playerId, now), {
        headers: { "Cache-Control": "no-store" },
      });
    }
    const catalog = GAME_CATALOGS[DEFAULT_GAME_ID];
    const record = createPrivateRoom({
      hostId: identity.playerId,
      sourceKey: anonymousVoterHash("private-room-source", requestClientAddress(request)),
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
    if (message === "Private room capacity reached.") {
      return NextResponse.json({ error: "Party capacity reached. Try again later." }, { status: 503 });
    }
    if (
      message === "Too many active parties for this player." ||
      message === "Too many active parties for this connection."
    ) {
      return NextResponse.json(
        { error: `${message} Leave an existing party or try again later.` },
        { status: 429, headers: { "Cache-Control": "no-store" } },
      );
    }
    if (
      message === "Pick at least one game." ||
      message === "Pick a party code." ||
      message === "That code is taken."
    ) {
      return NextResponse.json({ error: message }, { status: 400 });
    }
    logServerError("private-rooms.create", error);
    return NextResponse.json({ error: "Could not update the private room." }, { status: 503 });
  }
}

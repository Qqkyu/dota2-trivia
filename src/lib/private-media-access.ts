import { NextResponse } from "next/server";
import { privateRoomIdentity } from "@/lib/private-room-rounds";
import { privateRoomCodeFromRoundId, privateRoomMember } from "@/lib/private-rooms.mjs";
import { logServerError } from "@/lib/server-diagnostics";

/** Private clues use the same membership boundary as the private round. */
export async function privateMediaAccessResponse(request: Request, roundId: string) {
  const code = privateRoomCodeFromRoundId(roundId);
  if (!code) return null;
  try {
    const identity = await privateRoomIdentity(request, new URL(request.url).searchParams.get("playerId"));
    if (identity && privateRoomMember(code, identity.playerId)) return null;
    return NextResponse.json(
      { error: "Join the party before loading its clues." },
      { status: 403, headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    logServerError("private-media.account-session", error);
    return NextResponse.json(
      { error: "Party membership is unavailable." },
      { status: 503, headers: { "Cache-Control": "no-store", "Retry-After": "2" } },
    );
  }
}

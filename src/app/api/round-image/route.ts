import { type NextRequest, NextResponse } from "next/server";
import { rateLimitRequest, requestPlayerIdentity } from "@/lib/api-protection";
import { GAME_CATALOGS, isGameId } from "@/lib/game-catalogs";
import { liveRoundForSettings } from "@/lib/private-room-rounds";
import { privateRoomCodeFromRoundId } from "@/lib/private-rooms.mjs";
import { privateMediaAccessResponse } from "@/lib/private-media-access";
import { parsePublicRoomSettings } from "@/lib/public-rooms";
import { logServerError } from "@/lib/server-diagnostics";
import { cachedRoundImage } from "@/lib/round-image-cache.mjs";
import { MediaBusyError, waitForMedia } from "@/lib/media-work.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function liveRoundForRoundId(roundId: string) {
  const gameId = roundId.split(":", 1)[0];
  if (!isGameId(gameId)) return null;
  const privateCode = privateRoomCodeFromRoundId(roundId);
  const settings = parsePublicRoomSettings({ gameId, ...(privateCode ? { privateCode } : {}) });
  if (!settings) return null;
  const live = liveRoundForSettings(settings, Date.now());
  if ("error" in live) return null;
  return { room: live.room, round: live.round };
}

function fogStage(round: { answerDeadline: number; answerDuration: number }, now: number) {
  const remaining = Math.max(0, round.answerDeadline - now);
  if (remaining <= round.answerDuration / 3) return 3;
  if (remaining <= (round.answerDuration * 2) / 3) return 2;
  return 1;
}

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const limited = rateLimitRequest(request, "round-image", requestPlayerIdentity(request, searchParams), 60, 1_500);
  if (limited) return limited;

  const roundId = searchParams.get("roundId");
  if (!roundId || roundId.length > 240 || !isGameId(roundId.split(":", 1)[0])) {
    return NextResponse.json({ error: "Invalid round image." }, { status: 400 });
  }
  const denied = await privateMediaAccessResponse(request, roundId);
  if (denied) return denied;

  const live = liveRoundForRoundId(roundId);
  if (!live) return NextResponse.json({ error: "That round is no longer active." }, { status: 409 });
  const { room, round } = live;
  if (round.id !== roundId || round.game !== "fogged-vision" || round.phase !== "answering") {
    return NextResponse.json({ error: "That round is no longer active." }, { status: 409 });
  }

  const question = GAME_CATALOGS[room.gameId].questions.find((candidate) => candidate.id === round.questionId);
  const source = question?.image?.src;
  if (!source) return NextResponse.json({ error: "Round image not found." }, { status: 404 });

  try {
    const stage = fogStage(round, Date.now());
    const cached = await waitForMedia(cachedRoundImage(source, stage), request.signal);
    return new NextResponse(new Uint8Array(cached.bytes), {
      status: 200,
      headers: {
        "Content-Type": cached.contentType,
        "Cache-Control": "private, max-age=8",
        "X-Content-Type-Options": "nosniff",
        "Content-Disposition": 'inline; filename="portrait"',
      },
    });
  } catch (error) {
    logServerError("round-image.proxy", error, { roundId: roundId.slice(0, 160) });
    return NextResponse.json(
      { error: "Round image unavailable." },
      {
        status: error instanceof MediaBusyError ? 503 : 502,
        headers: { "Cache-Control": "no-store", "Retry-After": "2" },
      },
    );
  }
}

import { type NextRequest, NextResponse } from "next/server";
import { GAME_CATALOGS, isGameId } from "@/lib/game-catalogs";
import { cachedAudioResponse, cachedRoundAudio, warmRoundAudio } from "@/lib/round-audio-cache.mjs";
import { currentPublicRound, parsePublicRoomSettings, publicRoundAt } from "@/lib/public-rooms";
import { logServerError } from "@/lib/server-diagnostics";
import type { TriviaQuestion } from "@/lib/trivia";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function copiedAudioHeaders(upstream: Response) {
  const headers = new Headers({
    "Cache-Control": "private, max-age=60",
    "X-Content-Type-Options": "nosniff",
  });
  for (const name of ["accept-ranges", "content-length", "content-range", "content-type"]) {
    const value = upstream.headers.get(name);
    if (value) headers.set(name, value);
  }
  return headers;
}

function audioSources(question: TriviaQuestion | undefined) {
  return question?.audio?.clips ?? (question?.audio?.src ? [question.audio.src] : []);
}

export async function HEAD(request: NextRequest) {
  const searchParams = new URL(request.url).searchParams;
  const roundId = searchParams.get("roundId");
  const gameId = roundId?.split(":", 1)[0];

  if (!roundId || roundId.length > 240 || !isGameId(gameId)) {
    return new Response(null, { status: 400 });
  }

  const settings = parsePublicRoomSettings({ gameId });
  if (!settings) return new Response(null, { status: 400 });

  const { room, round } = currentPublicRound(settings);
  if (round.id !== roundId || round.phase !== "reveal") {
    return new Response(null, { status: 409 });
  }

  const nextRound = publicRoundAt(room, round.number + 1, round.revealDeadline);
  const nextQuestion = GAME_CATALOGS[room.gameId].questions.find((candidate) => candidate.id === nextRound.questionId);
  const sources = audioSources(nextQuestion);

  try {
    await Promise.all(sources.map((source, clip) => warmRoundAudio(nextRound.id, clip, source)));
    return new Response(null, {
      status: 204,
      headers: {
        "Cache-Control": "no-store",
        "X-Queue-Arcade-Audio-Preload": sources.length ? "ready" : "not-needed",
      },
    });
  } catch (error) {
    logServerError("round-audio.preload", error, { roundId: roundId.slice(0, 160) });
    return new Response(null, { status: 502, headers: { "Cache-Control": "no-store" } });
  }
}

export async function GET(request: NextRequest) {
  const searchParams = new URL(request.url).searchParams;
  const roundId = searchParams.get("roundId");
  const clip = Number(searchParams.get("clip") ?? "0");
  const gameId = roundId?.split(":", 1)[0];

  if (!roundId || roundId.length > 240 || !isGameId(gameId) || !Number.isInteger(clip) || clip < 0 || clip > 3) {
    return NextResponse.json({ error: "Invalid round audio." }, { status: 400 });
  }

  const settings = parsePublicRoomSettings({ gameId });
  if (!settings) return NextResponse.json({ error: "Invalid round audio." }, { status: 400 });

  const { room, round } = currentPublicRound(settings);
  if (round.id !== roundId) {
    return NextResponse.json({ error: "That round is no longer active." }, { status: 409 });
  }

  const question = GAME_CATALOGS[room.gameId].questions.find((candidate) => candidate.id === round.questionId);
  const sources = audioSources(question);
  const source = sources[clip];
  if (!source) return NextResponse.json({ error: "Audio clip not found." }, { status: 404 });

  try {
    const range = request.headers.get("range");
    const cached = await cachedRoundAudio(round.id, clip);
    if (cached) return cachedAudioResponse(cached, range);

    const upstream = await fetch(source, {
      headers: range ? { Range: range } : undefined,
      cache: range ? "no-store" : "force-cache",
    });
    if (!upstream.ok || !upstream.body) {
      throw new Error(`Upstream audio returned ${upstream.status}.`);
    }
    return new Response(upstream.body, {
      status: upstream.status,
      headers: copiedAudioHeaders(upstream),
    });
  } catch (error) {
    logServerError("round-audio.proxy", error, { roundId: roundId.slice(0, 160), clip });
    return NextResponse.json({ error: "Round audio unavailable." }, { status: 502 });
  }
}

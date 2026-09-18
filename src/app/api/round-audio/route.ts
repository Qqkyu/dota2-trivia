import { type NextRequest, NextResponse } from "next/server";
import { rateLimitRequest, requestPlayerIdentity } from "@/lib/api-protection";
import { GAME_CATALOGS, isGameId } from "@/lib/game-catalogs";
import { liveRoundAt, liveRoundForSettings } from "@/lib/private-room-rounds";
import { privateRoomCodeFromRoundId } from "@/lib/private-rooms.mjs";
import { cachedAudioResponse, cachedRoundAudio, warmRoundAudio } from "@/lib/round-audio-cache.mjs";
import { echoHuntCutDuration, soundcheckCutDuration, soundcheckRevealStage } from "@/lib/soundcheck.mjs";
import { clueStageAt } from "@/lib/scoring.mjs";
import { parsePublicRoomSettings } from "@/lib/public-rooms";
import { logServerError } from "@/lib/server-diagnostics";
import type { TriviaQuestion } from "@/lib/trivia";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function trimPcmWav(bytes: ArrayBuffer, seconds: number) {
  const buf = Buffer.from(bytes);
  if (buf.length < 44 || buf.toString("ascii", 0, 4) !== "RIFF" || buf.toString("ascii", 8, 12) !== "WAVE") {
    return bytes;
  }
  if (buf.readUInt16LE(20) !== 1) return bytes;
  const sampleRate = buf.readUInt32LE(24);
  const blockAlign = buf.readUInt16LE(32) || 1;
  const keep = Math.min(buf.length - 44, Math.max(blockAlign, Math.ceil(seconds * sampleRate) * blockAlign));
  const out = Buffer.alloc(44 + keep);
  buf.copy(out, 0, 0, 44);
  buf.copy(out, 44, 44, 44 + keep);
  out.writeUInt32LE(36 + keep, 4);
  out.writeUInt32LE(keep, 40);
  return out.buffer.slice(out.byteOffset, out.byteOffset + out.byteLength);
}

function audioSources(question: TriviaQuestion | undefined) {
  return question?.audio?.clips ?? (question?.audio?.src ? [question.audio.src] : []);
}

/**
 * Resolve the live round the audio belongs to. A private-room round ID carries
 * its party code, so the party's own clock and deck are used; otherwise the
 * one public room is used. Returns null when the round cannot be current.
 */
function liveRoundForRoundId(roundId: string) {
  const gameId = roundId.split(":", 1)[0];
  if (!isGameId(gameId)) return null;
  const privateCode = privateRoomCodeFromRoundId(roundId);
  const settings = parsePublicRoomSettings({ gameId, ...(privateCode ? { privateCode } : {}) });
  if (!settings) return null;
  const live = liveRoundForSettings(settings, Date.now());
  if ("error" in live) return null;
  return { settings, room: live.room, round: live.round };
}

export async function HEAD(request: NextRequest) {
  const searchParams = new URL(request.url).searchParams;
  const limited = rateLimitRequest(request, "round-audio", requestPlayerIdentity(request, searchParams), 60);
  if (limited) return limited;
  const roundId = searchParams.get("roundId");

  if (!roundId || roundId.length > 240 || !isGameId(roundId.split(":", 1)[0])) {
    return new Response(null, { status: 400 });
  }

  const live = liveRoundForRoundId(roundId);
  if (!live) return new Response(null, { status: 409 });
  const { settings, room, round } = live;
  if (round.id !== roundId || round.phase !== "reveal") {
    return new Response(null, { status: 409 });
  }

  const nextRound = liveRoundAt(settings, round.number + 1, round.revealDeadline);
  if (!nextRound) {
    return new Response(null, {
      status: 204,
      headers: { "Cache-Control": "no-store", "X-Queue-Arcade-Audio-Preload": "not-needed" },
    });
  }
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
  const limited = rateLimitRequest(request, "round-audio", requestPlayerIdentity(request, searchParams), 60);
  if (limited) return limited;
  const roundId = searchParams.get("roundId");
  const clip = Number(searchParams.get("clip") ?? "0");

  if (
    !roundId ||
    roundId.length > 240 ||
    !isGameId(roundId.split(":", 1)[0]) ||
    !Number.isInteger(clip) ||
    clip < 0 ||
    clip > 3
  ) {
    return NextResponse.json({ error: "Invalid round audio." }, { status: 400 });
  }

  const live = liveRoundForRoundId(roundId);
  if (!live) return NextResponse.json({ error: "That round is no longer active." }, { status: 409 });
  const { room, round } = live;
  if (round.id !== roundId) {
    return NextResponse.json({ error: "That round is no longer active." }, { status: 409 });
  }

  const question = GAME_CATALOGS[room.gameId].questions.find((candidate) => candidate.id === round.questionId);
  const sources = audioSources(question);
  const source = sources[clip];
  if (!source) return NextResponse.json({ error: "Audio clip not found." }, { status: 404 });

  try {
    const range = request.headers.get("range");
    let cached = await cachedRoundAudio(round.id, clip);
    if (!cached) {
      cached = await warmRoundAudio(round.id, clip, source);
    }
    if (round.phase === "answering") {
      const remaining = Math.max(0, round.answerDeadline - Date.now());
      const stage =
        round.game === "soundcheck"
          ? soundcheckRevealStage(remaining, round.answerDuration)
          : clueStageAt(remaining, round.answerDuration);
      const sourceDuration =
        question?.soundcheck?.clips?.[clip]?.duration ??
        (cached.bytes.byteLength > 44 ? (cached.bytes.byteLength - 44) / 88_200 : 5);
      const cutSeconds =
        round.game === "soundcheck"
          ? soundcheckCutDuration(sourceDuration, stage)
          : echoHuntCutDuration(sourceDuration, stage);
      const trimmed = trimPcmWav(cached.bytes, cutSeconds);
      return cachedAudioResponse({ bytes: trimmed, contentType: cached.contentType }, null);
    }
    return cachedAudioResponse(cached, range);
  } catch (error) {
    logServerError("round-audio.proxy", error, { roundId: roundId.slice(0, 160), clip });
    return NextResponse.json({ error: "Round audio unavailable." }, { status: 502 });
  }
}

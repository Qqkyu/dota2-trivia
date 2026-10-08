import { type NextRequest, NextResponse } from "next/server";
import { rateLimitRequest, requestPlayerIdentity } from "@/lib/api-protection";
import { cutAudioWithFfmpeg, trimPcmWav } from "@/lib/cut-round-audio.mjs";
import { GAME_CATALOGS, isGameId } from "@/lib/game-catalogs";
import { liveRoundAt, liveRoundForSettings } from "@/lib/private-room-rounds";
import { privateRoomCodeFromRoundId } from "@/lib/private-rooms.mjs";
import { privateMediaAccessResponse } from "@/lib/private-media-access";
import { cachedAudioCut, cachedAudioResponse, cachedRoundAudio, warmRoundAudio } from "@/lib/round-audio-cache.mjs";
import { MediaBusyError, waitForMedia } from "@/lib/media-work.mjs";
import {
  echoHuntCutDuration,
  echoHuntRevealStage,
  soundcheckCutDuration,
  soundcheckClipTiming,
  soundcheckRevealStage,
} from "@/lib/soundcheck.mjs";
import { clueStageAt } from "@/lib/scoring.mjs";
import { parsePublicRoomSettings } from "@/lib/public-rooms";
import { logServerError } from "@/lib/server-diagnostics";
import type { TriviaQuestion } from "@/lib/trivia";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Answer audio stays private: "Cache-Control": "private, max-age=60"

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
  const limited = rateLimitRequest(request, "round-audio", requestPlayerIdentity(request, searchParams), 60, 3_000);
  if (limited) return limited;
  const roundId = searchParams.get("roundId");

  if (!roundId || roundId.length > 240 || !isGameId(roundId.split(":", 1)[0])) {
    return new Response(null, { status: 400 });
  }
  const denied = await privateMediaAccessResponse(request, roundId);
  if (denied) return denied;

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
    await waitForMedia(
      Promise.all(
        sources.map(async (source, clip) => {
          const audio = await warmRoundAudio(nextRound.id, clip, source);
          const metadata = nextQuestion?.soundcheck?.clips?.[clip];
          if (!metadata) return;
          const { startSeconds, duration } = soundcheckClipTiming(metadata);
          if (startSeconds > 0) {
            await cachedAudioCut(
              source,
              duration,
              audio.contentType,
              async () =>
                trimPcmWav(audio.bytes, duration, startSeconds) ??
                (await cutAudioWithFfmpeg(audio.bytes, duration, audio.contentType, { startSeconds })),
              startSeconds,
            );
          }
        }),
      ),
      request.signal,
    );
    return new Response(null, {
      status: 204,
      headers: {
        "Cache-Control": "no-store",
        "X-Queue-Arcade-Audio-Preload": sources.length ? "ready" : "not-needed",
      },
    });
  } catch (error) {
    logServerError("round-audio.preload", error, { roundId: roundId.slice(0, 160) });
    return new Response(null, {
      status: error instanceof MediaBusyError ? 503 : 502,
      headers: { "Cache-Control": "no-store", "Retry-After": "2" },
    });
  }
}

export async function GET(request: NextRequest) {
  const searchParams = new URL(request.url).searchParams;
  const limited = rateLimitRequest(request, "round-audio", requestPlayerIdentity(request, searchParams), 60, 3_000);
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
  const denied = await privateMediaAccessResponse(request, roundId);
  if (denied) return denied;

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
    let cached = await waitForMedia(cachedRoundAudio(round.id, clip), request.signal);
    if (!cached) {
      cached = await waitForMedia(warmRoundAudio(round.id, clip, source), request.signal);
    }
    const metadata = question?.soundcheck?.clips?.[clip];
    const timing = metadata ? soundcheckClipTiming(metadata) : null;
    let cutSeconds = timing?.startSeconds ? timing.duration : null;
    const startSeconds = timing?.startSeconds ?? 0;
    if (round.phase === "answering") {
      const remaining = Math.max(0, round.answerDeadline - Date.now());
      const stage =
        round.game === "soundcheck"
          ? soundcheckRevealStage(remaining, round.answerDuration)
          : round.game === "echo-hunt"
            ? echoHuntRevealStage(remaining, round.answerDuration)
            : clueStageAt(remaining, round.answerDuration);
      if (stage < 3) {
        const cachedBytes = Buffer.from(cached.bytes);
        const isWav = cachedBytes.length > 44 && cachedBytes.toString("ascii", 0, 4) === "RIFF";
        const sourceDuration = timing?.duration ?? (isWav ? (cachedBytes.length - 44) / 88_200 : 4);
        cutSeconds =
          round.game === "soundcheck"
            ? soundcheckCutDuration(sourceDuration, stage)
            : echoHuntCutDuration(sourceDuration, stage);
      }
    }
    if (cutSeconds !== null) {
      const original = cached;
      const seconds = cutSeconds;
      cached = await waitForMedia(
        cachedAudioCut(
          source,
          seconds,
          original.contentType,
          async () =>
            trimPcmWav(original.bytes, seconds, startSeconds) ??
            (await cutAudioWithFfmpeg(original.bytes, seconds, original.contentType, { startSeconds })),
          startSeconds,
        ),
        request.signal,
      );
    }
    return cachedAudioResponse(cached, round.phase === "answering" ? null : range);
  } catch (error) {
    logServerError("round-audio.proxy", error, { roundId: roundId.slice(0, 160), clip });
    return NextResponse.json(
      { error: "Round audio unavailable." },
      {
        status: error instanceof MediaBusyError ? 503 : 502,
        headers: { "Cache-Control": "no-store", "Retry-After": "2" },
      },
    );
  }
}

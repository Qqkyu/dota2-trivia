import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { createFeedbackPlayer } from "@/lib/feedback-player.mjs";
import { claimAudioTab } from "@/lib/audio-tab.mjs";
import { type PublicArcadeQuestion } from "@/lib/public-question";
import { echoHuntCutDuration, soundcheckCutDuration } from "@/lib/soundcheck.mjs";
import { audioUrlStage, roundAudioSourceKey, waitForAudioCut, waitForAudioGap, waitForMediaEvent } from "./round-audio";
import { audioProbe, keepAliveMode, recordAudioEvent, subscribeKeepAliveMode } from "@/lib/audio-diagnostics.mjs";
import { elementClipVolume } from "@/lib/round-clip-volume.mjs";
import { type GamePhase } from "./shared";

import type { useRoundRefs } from "./use-round-refs";

export function useArcadeAudio({
  refs,
  soundEnabled,
  setSoundEnabled,
  gameVolume,
}: {
  refs: ReturnType<typeof useRoundRefs>;
  soundEnabled: boolean;
  setSoundEnabled: (enabled: boolean) => void;
  gameVolume: number;
}) {
  const { phaseRef, currentQuestionRef, roundIdRef } = refs;
  const [roundAudioState, setRoundAudioState] = useState<"loading" | "ready" | "playing" | "error" | "blocked">(
    "loading",
  );

  const [roundAudioPlayCount, setRoundAudioPlayCount] = useState(0);

  const [roundAudioClipIndex, setRoundAudioClipIndex] = useState(0);

  const [roundAudioDurations, setRoundAudioDurations] = useState<Record<string, number>>({});

  const feedbackPlayerRef = useRef<ReturnType<typeof createFeedbackPlayer> | null>(null);

  const audioTabRef = useRef<ReturnType<typeof claimAudioTab> | null>(null);

  const roundAudioRefs = useRef<Array<HTMLAudioElement | null>>([]);

  const roundAudioAbortRef = useRef<AbortController | null>(null);

  const autoPlayedAudioKeyRef = useRef("");

  const playSound = useCallback(
    (kind: "lock" | "correct" | "wrong" | "start") => {
      if (kind === "lock") audioTabRef.current?.claimFromInput();
      const result = feedbackPlayerRef.current?.play(kind, { enabled: soundEnabled, volume: gameVolume }) as
        | { requested: boolean; started: Promise<boolean>; reason?: string }
        | undefined;
      const event = recordAudioEvent("cue", {
        cue: kind,
        requested: result?.requested ?? false,
        reason: result?.requested ? undefined : (result?.reason ?? "no-player"),
        owner: audioTabRef.current?.isOwner() ?? null,
        volume: gameVolume,
      });
      if (result?.requested) {
        void result.started.then((ok) => recordAudioEvent("cue-started", { cue: kind, ok, request: event.seq }));
      }
    },
    [gameVolume, soundEnabled],
  );

  const playPickSound = useCallback(() => playSound("lock"), [playSound]);

  const stopRoundAudio = useCallback((showReadyState = true) => {
    roundAudioAbortRef.current?.abort();
    roundAudioAbortRef.current = null;
    for (const audio of roundAudioRefs.current) audio?.pause();
    if (showReadyState && phaseRef.current === "answering") setRoundAudioState("ready");
  }, []);

  useEffect(() => {
    const tab = claimAudioTab(() => {
      feedbackPlayerRef.current?.pauseAll();
      stopRoundAudio();
    });
    audioTabRef.current = tab;
    audioProbe.owner = () => tab.isOwner();
    const player = createFeedbackPlayer({ isOwner: tab.isOwner });
    feedbackPlayerRef.current = player;
    return () => {
      player.pauseAll();
      tab.dispose();
      feedbackPlayerRef.current = null;
      audioTabRef.current = null;
    };
  }, [stopRoundAudio]);

  const playRoundAudio = useCallback(
    (enableSound = true, revealStage = 1) => {
      if (!audioTabRef.current?.isOwner()) {
        recordAudioEvent("round-skip", { reason: "other-tab" });
        return;
      }
      stopRoundAudio(false);
      const audios = roundAudioRefs.current.filter((audio): audio is HTMLAudioElement => Boolean(audio));
      if (!audios.length) {
        recordAudioEvent("round-skip", { reason: "no-elements" });
        return;
      }

      const question = currentQuestionRef.current;
      const isSoundcheck = question?.game === "soundcheck";
      const isEchoHunt = question?.game === "echo-hunt";
      const isProgressiveAudio = isSoundcheck || isEchoHunt;
      if (enableSound) setSoundEnabled(true);
      const sourceKey = roundAudioSourceKey(question);
      autoPlayedAudioKeyRef.current = isProgressiveAudio
        ? `${roundIdRef.current}:${revealStage}:${sourceKey}`
        : roundIdRef.current;
      const controller = new AbortController();
      roundAudioAbortRef.current = controller;
      setRoundAudioClipIndex(0);
      setRoundAudioState("loading");
      recordAudioEvent("round", { state: "loading", stage: revealStage, clips: audios.length, game: question?.game });

      void (async () => {
        for (const [clipIndex, audio] of audios.entries()) {
          audio.volume = elementClipVolume(gameVolume, audio);
          audio.currentTime = 0;
          if (audio.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
            const readyResult = await waitForMediaEvent(audio, "canplay", controller.signal);
            if (readyResult !== "complete") {
              recordAudioEvent("round", {
                state: readyResult === "error" ? "error" : "aborted",
                clip: clipIndex,
                at: "canplay",
              });
              if (readyResult === "error") setRoundAudioState("error");
              return;
            }
          }
          if (controller.signal.aborted) return;

          setRoundAudioClipIndex(clipIndex);
          setRoundAudioState("playing");
          audio.addEventListener("playing", () => recordAudioEvent("round-playing", { clip: clipIndex }), {
            once: true,
          });
          try {
            await audio.play();
            recordAudioEvent("round-play", { clip: clipIndex, ok: true, volume: Math.round(audio.volume * 100) / 100 });
          } catch (error) {
            recordAudioEvent("round-play", {
              clip: clipIndex,
              ok: false,
              error: error instanceof DOMException ? error.name : String(error),
              aborted: controller.signal.aborted,
            });
            if (!controller.signal.aborted) {
              setRoundAudioState(
                error instanceof DOMException && error.name === "NotAllowedError" ? "blocked" : "error",
              );
            }
            return;
          }
          if (clipIndex === 0) setRoundAudioPlayCount((count) => count + 1);

          const sourceAlreadyCut = sourceKey.includes("stage=");
          const sourceDuration = isSoundcheck
            ? question?.soundcheck?.clips[clipIndex]?.duration
            : Number.isFinite(audio.duration)
              ? audio.duration
              : 5;
          const clipDuration = sourceAlreadyCut
            ? 0
            : isSoundcheck
              ? soundcheckCutDuration(sourceDuration ?? 0, revealStage)
              : isEchoHunt
                ? echoHuntCutDuration(sourceDuration ?? 0, revealStage)
                : 0;
          const endedResult =
            isProgressiveAudio && clipDuration
              ? await waitForAudioCut(audio, clipDuration * 1_000, controller.signal)
              : await waitForMediaEvent(audio, "ended", controller.signal);
          if (endedResult !== "complete") {
            recordAudioEvent("round", {
              state: endedResult === "error" ? "error" : "aborted",
              clip: clipIndex,
              at: "ended",
            });
            if (endedResult === "error") setRoundAudioState("error");
            return;
          }
          if (clipIndex < audios.length - 1 && !(await waitForAudioGap(controller.signal))) return;
        }

        if (!controller.signal.aborted) {
          roundAudioAbortRef.current = null;
          setRoundAudioState("ready");
        }
      })();
    },
    [gameVolume, stopRoundAudio],
  );

  useEffect(() => {
    const replayHiddenResult = () => {
      if (document.visibilityState === "visible") feedbackPlayerRef.current?.resumeIfNeeded();
    };
    document.addEventListener("visibilitychange", replayHiddenResult);
    window.addEventListener("focus", replayHiddenResult);
    window.addEventListener("pointerdown", replayHiddenResult);
    window.addEventListener("keydown", replayHiddenResult);
    return () => {
      document.removeEventListener("visibilitychange", replayHiddenResult);
      window.removeEventListener("focus", replayHiddenResult);
      window.removeEventListener("pointerdown", replayHiddenResult);
      window.removeEventListener("keydown", replayHiddenResult);
    };
  }, []);

  useEffect(
    () => () => {
      feedbackPlayerRef.current?.pauseAll();
      stopRoundAudio(false);
    },
    [stopRoundAudio],
  );

  return {
    roundAudioState,
    setRoundAudioState,
    roundAudioPlayCount,
    setRoundAudioPlayCount,
    roundAudioClipIndex,
    setRoundAudioClipIndex,
    roundAudioDurations,
    setRoundAudioDurations,
    feedbackPlayerRef,
    roundAudioRefs,
    roundAudioAbortRef,
    autoPlayedAudioKeyRef,
    playSound,
    playPickSound,
    stopRoundAudio,
    playRoundAudio,
  };
}

/**
 * Keeps the audio output open while a round is live. Bluetooth speakers and
 * some USB devices drop their link after a few seconds of silence and swallow
 * the first few hundred milliseconds of the next sound, which is the whole pick
 * click. A running AudioContext rendering digital silence adds nothing to the
 * mix the sound check records; it only stops the device from sleeping between
 * cues. It is not a media element, so the per-voice tap never sees it.
 */
export function useOutputKeepAlive({ phase, soundEnabled }: { phase: GamePhase; soundEnabled: boolean }) {
  const mode = useSyncExternalStore(subscribeKeepAliveMode, keepAliveMode, () => "tone");
  const active = phase !== "lobby" && soundEnabled && mode !== "off";

  useEffect(() => {
    if (!active || typeof window === "undefined") {
      audioProbe.keepAlive = mode === "off" ? "off" : "inactive";
      return;
    }
    const Context =
      window.AudioContext ?? (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Context) return;
    let context: AudioContext | null = null;
    let disposed = false;
    const start = () => {
      if (disposed || document.hidden) return;
      if (!context) {
        context = new Context();
        const created = context;
        audioProbe.keepAlive = `${created.state} (${mode})`;
        recordAudioEvent("keepalive", { state: created.state, mode });
        created.addEventListener("statechange", () => {
          audioProbe.keepAlive = `${created.state} (${mode})`;
          recordAudioEvent("keepalive", { state: created.state, mode });
        });
        // Some Bluetooth speakers idle their amplifier on a silent signal and
        // swallow the next sound's start, so by default the loop carries a 20 Hz
        // sine at -54 dBFS: below what a speaker can reproduce (white noise at
        // this level was an audible hiss), under 0.1% of a cue's energy, and
        // within the floor the native sound check budgets for.
        const silence = context.createBufferSource();
        const buffer = context.createBuffer(1, context.sampleRate, context.sampleRate);
        if (mode === "tone") {
          const samples = buffer.getChannelData(0);
          for (let index = 0; index < samples.length; index += 1) {
            samples[index] = Math.sin((2 * Math.PI * 20 * index) / context.sampleRate) * 0.002;
          }
        }
        silence.buffer = buffer;
        silence.loop = true;
        silence.connect(context.destination);
        silence.start();
      }
      if (context.state !== "running") void context.resume().catch(() => undefined);
    };
    const visibility = () => {
      if (document.hidden) void context?.suspend().catch(() => undefined);
      else start();
    };
    start();
    window.addEventListener("pointerdown", start);
    window.addEventListener("keydown", start);
    document.addEventListener("visibilitychange", visibility);
    return () => {
      disposed = true;
      window.removeEventListener("pointerdown", start);
      window.removeEventListener("keydown", start);
      document.removeEventListener("visibilitychange", visibility);
      void context?.close().catch(() => undefined);
      audioProbe.keepAlive = mode === "off" ? "off" : "closed";
    };
  }, [active, mode]);
}

export function useRoundAutoplay({
  audio,
  phase,
  currentQuestion,
  activeRoundId,
  clueStage,
  isProgressiveAudioRound,
  isSoundcheckRound,
  soundEnabled,
}: {
  audio: ReturnType<typeof useArcadeAudio>;
  phase: GamePhase;
  currentQuestion: PublicArcadeQuestion | null;
  activeRoundId: string;
  clueStage: number;
  isProgressiveAudioRound: boolean;
  isSoundcheckRound: boolean;
  soundEnabled: boolean;
}) {
  const { roundAudioRefs, autoPlayedAudioKeyRef, playRoundAudio, roundAudioState, stopRoundAudio } = audio;
  useOutputKeepAlive({ phase, soundEnabled });

  useEffect(() => {
    if (phase !== "answering") stopRoundAudio(false);
  }, [phase, stopRoundAudio]);

  useEffect(() => {
    const hasRoundAudio = isProgressiveAudioRound;
    const sourceKey = roundAudioSourceKey(currentQuestion);
    const autoplayKey = isProgressiveAudioRound ? `${activeRoundId}:${clueStage}:${sourceKey}` : activeRoundId;
    const srcStage = audioUrlStage(currentQuestion?.audio?.src ?? currentQuestion?.audio?.clips?.[0]);
    if (
      phase !== "answering" ||
      !hasRoundAudio ||
      !currentQuestion?.audio ||
      !soundEnabled ||
      !roundAudioRefs.current.some(Boolean) ||
      (srcStage !== null && srcStage !== clueStage) ||
      autoPlayedAudioKeyRef.current === autoplayKey
    ) {
      return;
    }

    playRoundAudio(false, isProgressiveAudioRound ? clueStage : 1);
  }, [
    activeRoundId,
    clueStage,
    currentQuestion,
    currentQuestion?.audio,
    currentQuestion?.game,
    currentQuestion?.id,
    isProgressiveAudioRound,
    isSoundcheckRound,
    phase,
    playRoundAudio,
    soundEnabled,
  ]);

  useEffect(() => {
    if (phase !== "answering" || roundAudioState !== "blocked") return;
    const retry = () => playRoundAudio(false, isProgressiveAudioRound ? clueStage : 1);
    window.addEventListener("pointerdown", retry, { once: true });
    window.addEventListener("keydown", retry, { once: true });
    return () => {
      window.removeEventListener("pointerdown", retry);
      window.removeEventListener("keydown", retry);
    };
  }, [clueStage, isProgressiveAudioRound, phase, playRoundAudio, roundAudioState]);
}

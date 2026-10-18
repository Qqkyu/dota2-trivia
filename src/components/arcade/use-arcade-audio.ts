import { useCallback, useEffect, useRef, useState } from "react";
import { createFeedbackPlayer } from "@/lib/feedback-player.mjs";
import { claimAudioTab } from "@/lib/audio-tab.mjs";
import { type PublicArcadeQuestion } from "@/lib/public-question";
import { echoHuntCutDuration, soundcheckCutDuration } from "@/lib/soundcheck.mjs";
import { audioUrlStage, roundAudioSourceKey, waitForAudioCut, waitForAudioGap, waitForMediaEvent } from "./round-audio";
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
      feedbackPlayerRef.current?.play(kind, { enabled: soundEnabled, volume: gameVolume });
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
      if (!audioTabRef.current?.isOwner()) return;
      stopRoundAudio(false);
      const audios = roundAudioRefs.current.filter((audio): audio is HTMLAudioElement => Boolean(audio));
      if (!audios.length) return;

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

      void (async () => {
        for (const [clipIndex, audio] of audios.entries()) {
          audio.volume = gameVolume;
          audio.currentTime = 0;
          if (audio.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
            const readyResult = await waitForMediaEvent(audio, "canplay", controller.signal);
            if (readyResult !== "complete") {
              if (readyResult === "error") setRoundAudioState("error");
              return;
            }
          }
          if (controller.signal.aborted) return;

          setRoundAudioClipIndex(clipIndex);
          setRoundAudioState("playing");
          try {
            await audio.play();
          } catch (error) {
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

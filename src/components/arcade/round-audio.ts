import { SOUNDCHECK_SEQUENCE_GAP_SECONDS } from "@/lib/soundcheck.mjs";
import type { PublicArcadeQuestion } from "@/lib/public-question";

export function waitForMediaEvent(
  audio: HTMLAudioElement,
  eventName: "canplay" | "ended",
  signal: AbortSignal,
): Promise<"complete" | "error" | "cancelled"> {
  return new Promise((resolve) => {
    if (signal.aborted) {
      resolve("cancelled");
      return;
    }

    const settle = (result: "complete" | "error" | "cancelled") => {
      audio.removeEventListener(eventName, onComplete);
      audio.removeEventListener("error", onError);
      signal.removeEventListener("abort", onAbort);
      resolve(result);
    };
    const onComplete = () => settle("complete");
    const onError = () => settle("error");
    const onAbort = () => settle("cancelled");

    audio.addEventListener(eventName, onComplete, { once: true });
    audio.addEventListener("error", onError, { once: true });
    signal.addEventListener("abort", onAbort, { once: true });
  });
}

export function waitForAudioGap(signal: AbortSignal): Promise<boolean> {
  return new Promise((resolve) => {
    if (signal.aborted) {
      resolve(false);
      return;
    }

    const timeout = window.setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve(true);
    }, SOUNDCHECK_SEQUENCE_GAP_SECONDS * 1_000);
    const onAbort = () => {
      window.clearTimeout(timeout);
      resolve(false);
    };
    signal.addEventListener("abort", onAbort, { once: true });
  });
}

export function waitForAudioCut(
  audio: HTMLAudioElement,
  durationMs: number,
  signal: AbortSignal,
): Promise<"complete" | "error" | "cancelled"> {
  return new Promise((resolve) => {
    if (signal.aborted) {
      resolve("cancelled");
      return;
    }

    const settle = (result: "complete" | "error" | "cancelled") => {
      window.clearInterval(progressCheck);
      window.clearTimeout(stallTimeout);
      audio.removeEventListener("timeupdate", onProgress);
      audio.removeEventListener("ended", onEnded);
      audio.removeEventListener("error", onError);
      signal.removeEventListener("abort", onAbort);
      resolve(result);
    };
    const cutAt = durationMs / 1_000;
    const onProgress = () => {
      if (audio.currentTime + 0.01 < cutAt) return;
      audio.pause();
      settle("complete");
    };
    const onEnded = () => settle("complete");
    const onError = () => settle("error");
    const onAbort = () => settle("cancelled");
    const progressCheck = window.setInterval(onProgress, 20);
    const stallTimeout = window.setTimeout(() => {
      audio.pause();
      settle("error");
    }, durationMs + 2_000);

    audio.addEventListener("timeupdate", onProgress);
    audio.addEventListener("ended", onEnded, { once: true });
    audio.addEventListener("error", onError, { once: true });
    signal.addEventListener("abort", onAbort, { once: true });
    onProgress();
  });
}

export function roundAudioSourceKey(question: PublicArcadeQuestion | null | undefined) {
  const sources = question?.audio?.clips ?? (question?.audio?.src ? [question.audio.src] : []);
  return sources.join("|");
}

export function audioUrlStage(src: string | undefined) {
  const match = src?.match(/[?&]stage=(\d+)/);
  return match ? Number(match[1]) : null;
}

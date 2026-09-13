import { DOTA_FEEDBACK_SOUNDS, dotaFeedbackSoundForKind } from "./feedback-sounds.mjs";

export const FEEDBACK_SOUND_KINDS = Object.freeze(["lock", "correct", "wrong", "start"]);
const RESULT_KINDS = new Set(["correct", "wrong"]);

/**
 * Each accepted pick/result owns a one-shot voice until it ends. In particular,
 * a reveal must not pause a lock whose asynchronous play() has not started yet.
 * Only the decorative entry cue is superseded by another cue. Mute/exit stop all.
 * Retain unused preload nodes and consume each once; warming just the HTTP cache
 * does not make a newly constructed media element ready to play.
 */
export function createFeedbackPlayer({
  AudioCtor,
  isHidden = () => typeof document !== "undefined" && Boolean(document.hidden),
} = {}) {
  const cache = new Map();
  const live = new Set();
  let created = 0;
  let lastOptions = { enabled: true, volume: 1 };
  let pendingResult = null;

  function resolveAudio() {
    if (AudioCtor) return AudioCtor;
    if (typeof Audio === "undefined") return null;
    return Audio;
  }

  function preload() {
    const Ctor = resolveAudio();
    if (!Ctor) return 0;
    for (const kind of FEEDBACK_SOUND_KINDS) {
      const definition = dotaFeedbackSoundForKind(kind);
      if (!cache.has(kind))
        cache.set(
          kind,
          definition.clips.map((clip) => ({ ...clip, audio: null })),
        );
      for (const clip of cache.get(kind)) {
        if (!clip.audio) {
          clip.audio = new Ctor(clip.src);
          created += 1;
          clip.audio.preload = "auto";
        }
      }
    }
    return created;
  }

  function stopLive(predicate = () => true) {
    for (const entry of live) {
      if (!predicate(entry)) continue;
      entry.release();
      entry.audio.pause();
    }
  }

  function pauseAll() {
    pendingResult = null;
    stopLive();
  }

  function setVolume(volume) {
    lastOptions = { ...lastOptions, volume };
    for (const { audio, gain } of live) {
      audio.volume = Math.min(1, Math.max(0, volume) * gain);
    }
  }

  function skipped(reason) {
    return { requested: false, started: Promise.resolve(false), reason, created };
  }

  function play(kind, { enabled = true, volume = 1 } = {}) {
    lastOptions = { enabled, volume };
    if (!enabled || volume <= 0) return skipped("muted");
    if (!DOTA_FEEDBACK_SOUNDS[kind]) return skipped("unknown");
    if (!resolveAudio()) return skipped("missing");
    preload();
    const clips = cache.get(kind);
    if (!clips?.length) return skipped("missing");

    stopLive((entry) => entry.kind === "start");
    const request = { kind };
    if (RESULT_KINDS.has(kind)) pendingResult = request;
    const starts = [];

    for (const clip of clips) {
      const audio = clip.audio;
      clip.audio = null;
      audio.volume = Math.min(1, volume * clip.gain);
      const entry = { audio, gain: clip.gain, kind, request, release };
      function release() {
        live.delete(entry);
        audio.removeEventListener("ended", release);
        audio.removeEventListener("error", release);
      }
      live.add(entry);
      audio.addEventListener("ended", release);
      audio.addEventListener("error", release);
      let result;
      try {
        result = audio.play();
      } catch (error) {
        result = Promise.reject(error);
      }
      starts.push(
        Promise.resolve(result).then(
          () => {
            const started = audio.ended || (live.has(entry) && !audio.paused);
            if (started && pendingResult === request) pendingResult = null;
            return started;
          },
          () => {
            // A blocked result may be retried on focus/gesture. A later request
            // or mute invalidates it, so an old rejection cannot revive a cue.
            release();
            return false;
          },
        ),
      );
    }

    const started = Promise.all(starts).then((results) => results.every(Boolean));
    return { requested: true, started, kind, clipCount: clips.length, created };
  }

  function resumeIfNeeded() {
    if (!pendingResult || isHidden()) return skipped("idle");
    if ([...live].some((entry) => entry.request === pendingResult && !entry.audio.paused)) {
      return skipped("already-playing");
    }
    return play(pendingResult.kind, lastOptions);
  }

  function clearPending() {
    pendingResult = null;
  }

  return {
    preload,
    play,
    pauseAll,
    setVolume,
    resumeIfNeeded,
    clearPending,
    pendingResult: () => pendingResult?.kind ?? null,
    created: () => created,
    has(kind) {
      return cache.has(kind);
    },
  };
}

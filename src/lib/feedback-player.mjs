import { DOTA_FEEDBACK_SOUNDS, dotaFeedbackSoundForKind } from "./feedback-sounds.mjs";

export const FEEDBACK_SOUND_KINDS = Object.freeze(["lock", "correct", "wrong", "start"]);
const RESULT_KINDS = new Set(["correct", "wrong"]);

/**
 * UI cues use a new HTMLAudioElement every time.
 *
 * Chrome cannot pause() then play() the same node reliably. That path is the
 * cave (two plays 20ms apart) and the silence (the second play is aborted).
 * Preload still warms the HTTP cache with unused nodes. Live nodes are never
 * reused. Start the new cue first, then pause whatever was already playing.
 */
export function createFeedbackPlayer({
  AudioCtor,
  isHidden = () => typeof document !== "undefined" && Boolean(document.hidden),
} = {}) {
  const cache = new Map();
  const live = [];
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
      if (cache.has(kind)) continue;
      const definition = dotaFeedbackSoundForKind(kind);
      if (!definition) continue;
      cache.set(
        kind,
        definition.clips.map((clip) => {
          const warmer = new Ctor(clip.src);
          created += 1;
          warmer.preload = "auto";
          return { src: clip.src, gain: clip.gain };
        }),
      );
    }
    return created;
  }

  function stopLive() {
    const previous = live.splice(0);
    for (const { audio } of previous) {
      try {
        audio.pause();
      } catch {
        // ignore
      }
    }
  }

  function pauseAll() {
    stopLive();
  }

  function setVolume(volume) {
    lastOptions = { ...lastOptions, volume };
    for (const { audio, gain } of live) {
      audio.volume = Math.min(1, Math.max(0, volume) * gain);
    }
  }

  function isAudible() {
    return live.some(({ audio }) => audio.paused === false);
  }

  function play(kind, { enabled = true, volume = 1 } = {}) {
    lastOptions = { enabled, volume };
    if (!enabled || volume <= 0) return { played: false, reason: "muted", created };
    if (!DOTA_FEEDBACK_SOUNDS[kind]) return { played: false, reason: "unknown", created };
    const Ctor = resolveAudio();
    if (!Ctor) return { played: false, reason: "missing", created };
    preload();
    const clips = cache.get(kind);
    if (!clips?.length) return { played: false, reason: "missing", created };

    const previous = live.splice(0);
    pendingResult = RESULT_KINDS.has(kind) ? kind : null;

    for (const clip of clips) {
      const audio = new Ctor(clip.src);
      created += 1;
      audio.volume = Math.min(1, volume * clip.gain);
      live.push({ audio, gain: clip.gain, kind });
      const result = typeof audio.play === "function" ? audio.play() : null;
      if (result && typeof result.then === "function") {
        void result.then(
          () => {
            if (RESULT_KINDS.has(kind) && live.some((entry) => entry.audio === audio && audio.paused === false)) {
              pendingResult = null;
            }
          },
          () => {
            // Fresh node. Do not pause-and-replay it. resumeIfNeeded can mint another.
          },
        );
      } else if (RESULT_KINDS.has(kind) && audio.paused === false) {
        pendingResult = null;
      }
    }

    for (const { audio } of previous) {
      try {
        audio.pause();
      } catch {
        // ignore
      }
    }

    return { played: true, kind, clipCount: clips.length, created };
  }

  function resumeIfNeeded() {
    if (!pendingResult || isHidden()) return { played: false, reason: "idle", created };
    if (isAudible()) return { played: false, reason: "already-playing", created };
    return play(pendingResult, lastOptions);
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
    pendingResult: () => pendingResult,
    created: () => created,
    has(kind) {
      return cache.has(kind);
    },
  };
}

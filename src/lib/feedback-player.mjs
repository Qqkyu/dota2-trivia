import { DOTA_FEEDBACK_SOUNDS, dotaFeedbackSoundForKind } from "./feedback-sounds.mjs";

export const FEEDBACK_SOUND_KINDS = Object.freeze(["lock", "correct", "wrong", "start"]);
const RESULT_KINDS = new Set(["correct", "wrong"]);

export function createFeedbackPlayer({
  AudioCtor,
  isHidden = () => typeof document !== "undefined" && Boolean(document.hidden),
} = {}) {
  const boards = new Map();
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
      if (boards.has(kind)) continue;
      const definition = dotaFeedbackSoundForKind(kind);
      if (!definition) continue;
      boards.set(
        kind,
        definition.clips.map((clip) => {
          const audio = new Ctor(clip.src);
          created += 1;
          audio.preload = "auto";
          return { audio, gain: clip.gain, src: clip.src };
        }),
      );
    }
    return created;
  }

  function resetClip(audio) {
    try {
      audio.pause();
    } catch {
      // ignore
    }
    try {
      if (typeof audio.readyState !== "number" || audio.readyState >= 1) {
        audio.currentTime = 0;
      }
    } catch {
      // Unloaded clips throw if we seek. Never block the next cue.
    }
  }

  function pauseAll() {
    for (const clips of boards.values()) {
      for (const { audio } of clips) resetClip(audio);
    }
  }

  function setVolume(volume) {
    for (const clips of boards.values()) {
      for (const { audio, gain } of clips) {
        audio.volume = Math.min(1, Math.max(0, volume) * gain);
      }
    }
  }

  function isAudible(kind) {
    return Boolean(boards.get(kind)?.some(({ audio }) => audio.paused === false));
  }

  function startClip(audio) {
    if (typeof audio.play !== "function") return Promise.resolve();
    const first = audio.play();
    if (!first || typeof first.catch !== "function") return Promise.resolve();
    return first.catch(() => {
      if (typeof audio.play !== "function") return Promise.reject(new Error("play-failed"));
      return audio.play();
    });
  }

  function play(kind, { enabled = true, volume = 1 } = {}) {
    lastOptions = { enabled, volume };
    if (!enabled || volume <= 0) return { played: false, reason: "muted", created };
    if (!DOTA_FEEDBACK_SOUNDS[kind]) return { played: false, reason: "unknown", created };
    preload();
    const clips = boards.get(kind);
    if (!clips?.length) return { played: false, reason: "missing", created };
    pauseAll();
    pendingResult = RESULT_KINDS.has(kind) ? kind : null;
    const starts = [];
    for (const { audio, gain } of clips) {
      audio.volume = Math.min(1, volume * gain);
      starts.push(startClip(audio));
    }
    void Promise.allSettled(starts).then((results) => {
      if (RESULT_KINDS.has(kind) && results.some((result) => result.status === "fulfilled")) {
        pendingResult = null;
      }
    });
    return { played: true, kind, clipCount: clips.length, created };
  }

  function resumeIfNeeded() {
    if (!pendingResult || isHidden()) return { played: false, reason: "idle", created };
    if (isAudible(pendingResult)) return { played: false, reason: "already-playing", created };
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
      return boards.has(kind);
    },
  };
}

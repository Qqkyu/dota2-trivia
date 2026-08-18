import { DOTA_FEEDBACK_SOUNDS, dotaFeedbackSoundForKind } from "./feedback-sounds.mjs";

export const FEEDBACK_SOUND_KINDS = Object.freeze(["lock", "correct", "wrong", "start"]);

export function createFeedbackPlayer({ AudioCtor } = {}) {
  const boards = new Map();
  let created = 0;

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

  function play(kind, { enabled = true, volume = 1 } = {}) {
    if (!enabled || volume <= 0) return { played: false, reason: "muted", created };
    if (!DOTA_FEEDBACK_SOUNDS[kind]) return { played: false, reason: "unknown", created };
    preload();
    const clips = boards.get(kind);
    if (!clips?.length) return { played: false, reason: "missing", created };
    pauseAll();
    for (const { audio, gain } of clips) {
      audio.volume = Math.min(1, volume * gain);
      if (typeof audio.play === "function") {
        const result = audio.play();
        if (result && typeof result.catch === "function") result.catch(() => undefined);
      }
    }
    return { played: true, kind, clipCount: clips.length, created };
  }

  return {
    preload,
    play,
    pauseAll,
    setVolume,
    created: () => created,
    has(kind) {
      return boards.has(kind);
    },
  };
}

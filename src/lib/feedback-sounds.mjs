export const DOTA_FEEDBACK_SOUNDS = Object.freeze({
  correct: Object.freeze({
    src: "/assets/dota2/sounds/challenge_success.wav",
    source: "sounds/ui/challenge_success.wav",
    durationSeconds: 2.346644,
    sha256: "d2ed6c53d6ce4a0c437ebc8fcde95959bf0284089e56d0c224e17d497a3bdacb",
    gain: 0.22,
  }),
  wrong: Object.freeze({
    src: "/assets/dota2/sounds/magic_immune.wav",
    source: "General.InvalidTarget_Invulnerable",
    durationSeconds: 1.503673,
    sha256: "b4fcca8d22df1e73d70b4bffefec2df17fb45451b82e14f22194a4cf6223dd96",
    gain: 1,
  }),
});

export function answerFeedbackKind(isCorrect) {
  return isCorrect ? "correct" : "wrong";
}

export function dotaFeedbackSoundForKind(kind) {
  return DOTA_FEEDBACK_SOUNDS[kind] ?? null;
}

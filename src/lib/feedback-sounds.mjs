export const DOTA_FEEDBACK_SOUNDS = Object.freeze({
  wrong: Object.freeze({
    src: "/assets/dota2/sounds/magic_immune.wav",
    event: "General.InvalidTarget_Invulnerable",
    durationSeconds: 1.503673,
    sha256: "b4fcca8d22df1e73d70b4bffefec2df17fb45451b82e14f22194a4cf6223dd96",
  }),
});

export function answerFeedbackKind(isCorrect) {
  return isCorrect ? "correct" : "wrong";
}

export function dotaFeedbackSoundForKind(kind) {
  return kind === "wrong" ? DOTA_FEEDBACK_SOUNDS.wrong : null;
}

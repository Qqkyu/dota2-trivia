export const DOTA_FEEDBACK_SOUNDS = Object.freeze({
  lock: Object.freeze({
    event: "ui_generic_button_click",
    clips: Object.freeze([
      Object.freeze({
        // Native media output fades its first few milliseconds. Keep the click's
        // attack intact by placing 20 ms of silence before the original samples.
        src: "/assets/dota2/sounds/panorama_generic_button_click_01_padded.wav",
        source: "sounds/ui/panorama/panorama_generic_button_click_01.wav",
        durationSeconds: 0.539615,
        sha256: "4b0c2a51cf3fc4206855813a1c8253dfaf1e894d638b9da223a7f6884e756eea",
        gain: 0.8,
      }),
    ]),
  }),
  correct: Object.freeze({
    event: "General.Coins",
    clips: Object.freeze([
      Object.freeze({
        src: "/assets/dota2/sounds/coins.wav",
        source: "sounds/ui/coins.vsnd",
        durationSeconds: 1.589909,
        sha256: "f9f3e5565295588e4714adae9c645e149bf5c2191d0e3aa71e9177902c8e88e5",
        gain: 1,
      }),
    ]),
  }),
  wrong: Object.freeze({
    event: "General.InvalidTarget_Invulnerable",
    clips: Object.freeze([
      Object.freeze({
        src: "/assets/dota2/sounds/magic_immune.wav",
        source: "sounds/ui/magic_immune.wav",
        durationSeconds: 1.503673,
        sha256: "b4fcca8d22df1e73d70b4bffefec2df17fb45451b82e14f22194a4cf6223dd96",
        gain: 1,
      }),
    ]),
  }),
  start: Object.freeze({
    event: "ui.matchmaking_find",
    clips: Object.freeze([
      Object.freeze({
        src: "/assets/dota2/sounds/panorama_find_match_find_01.wav",
        source: "sounds/ui/panorama/panorama_find_match_find_01.wav",
        durationSeconds: 1.126893,
        sha256: "cadf33b5f47ca29cbeb37e063a8f5364cd92db4dadd2c8befabfa6fe623fcd33",
        gain: 0.6,
      }),
      Object.freeze({
        src: "/assets/dota2/sounds/panorama_select_md_01.wav",
        source: "sounds/ui/panorama/panorama_select_md_01.wav",
        durationSeconds: 0.234649,
        sha256: "7b39cbbd7e80f9ff671b3c45f4e6d5818dd04e5057ab391faa1929f028cae5ad",
        gain: 1,
      }),
    ]),
  }),
});

export function answerFeedbackKind(isCorrect) {
  return isCorrect ? "correct" : "wrong";
}

export function dotaFeedbackSoundForKind(kind) {
  return DOTA_FEEDBACK_SOUNDS[kind] ?? null;
}

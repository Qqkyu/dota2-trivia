// These items and abilities reuse the same base cue. Upgrades can add another layer,
// but the isolated base WAV cannot distinguish them from the original item.
export const SOUNDCHECK_SHARED_AUDIO_GROUPS = Object.freeze([
  Object.freeze(["force_staff", "hurricane_pike"]),
  Object.freeze(["blink", "arcane_blink", "swift_blink", "overwhelming_blink"]),
  Object.freeze(["diffusal_blade", "disperser"]),
  // Both use Cyclone. The event data exposes one Cyclone cue but no runtime
  // call sites for Wind Waker, so keep its upgrade out of the wrong answers.
  Object.freeze(["cyclone", "wind_waker"]),
  // Urn's tail contains Essence Distiller's cue. Maelstrom's chain jump shares the
  // first 120 ms of Mjollnir's cue, which is the entire first-stage clue.
  Object.freeze(["urn_of_shadows", "essence_distiller"]),
  Object.freeze(["mjollnir", "maelstrom"]),
  Object.freeze(["muerta_dead_shot", "muerta_spectral_slug", "muerta_parting_shot"]),
  Object.freeze(["kez_echo_slash", "kez_falcon_rush"]),
]);

export function soundcheckSharedAudioAlternatives(subject, choices) {
  const group = SOUNDCHECK_SHARED_AUDIO_GROUPS.find((subjects) => subjects.includes(subject));
  return group ? choices.filter((choice) => choice !== subject && group.includes(choice)) : [];
}

export function soundcheckNeedsReviewedChoices(subject) {
  return SOUNDCHECK_SHARED_AUDIO_GROUPS.some((subjects) => subjects.includes(subject));
}

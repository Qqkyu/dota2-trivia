export const SOUNDCHECK_REVEAL_STAGES = 3;
export const SOUNDCHECK_SEQUENCE_GAP_SECONDS = 0.12;

const CUT_PROFILES = [
  { ratio: 0.25, minimum: 0.2, minimumCeilingRatio: 0.42, maximum: 0.75 },
  { ratio: 0.55, minimum: 0.38, minimumCeilingRatio: 0.68, maximum: 1.75 },
  { ratio: 0.78, minimum: 0, minimumCeilingRatio: 0.82, maximum: Number.POSITIVE_INFINITY },
];

/**
 * Returns the playable prefix, in seconds, for one audited Soundcheck clip.
 * Floors keep short effects recognizable; caps keep long effects challenging.
 */
export function soundcheckCutDuration(duration, stage) {
  if (!Number.isFinite(duration) || duration <= 0) return 0;

  const stageIndex = Math.max(0, Math.min(SOUNDCHECK_REVEAL_STAGES - 1, Math.round(stage) - 1));
  const profile = CUT_PROFILES[stageIndex];
  const minimum = Math.min(profile.minimum, duration * profile.minimumCeilingRatio);
  return Math.min(profile.maximum, Math.max(duration * profile.ratio, minimum));
}

export const SOUNDCHECK_REVEAL_STAGES = 3;
export const ECHO_HUNT_REVEAL_STAGES = 3;
export const SOUNDCHECK_SEQUENCE_GAP_SECONDS = 0.12;

const SOUNDCHECK_CUT_PROFILES = [
  { ratio: 0.065, minimum: 0.07, minimumCeilingRatio: 0.13, maximum: 0.16 },
  { ratio: 0.15, minimum: 0.14, minimumCeilingRatio: 0.24, maximum: 0.36 },
  { ratio: 0.28, minimum: 0.24, minimumCeilingRatio: 0.4, maximum: 0.8 },
];

const ECHO_HUNT_CUT_PROFILES = [
  { ratio: 0.09, minimum: 0.12, minimumCeilingRatio: 0.15, maximum: 0.32 },
  { ratio: 0.22, minimum: 0.28, minimumCeilingRatio: 0.32, maximum: 0.75 },
  { ratio: 1, minimum: 0, minimumCeilingRatio: 1, maximum: Number.POSITIVE_INFINITY },
];

function progressiveCutDuration(duration, stage, stages, profiles) {
  if (!Number.isFinite(duration) || duration <= 0) return 0;

  const stageIndex = Math.max(0, Math.min(stages - 1, Math.round(stage) - 1));
  const profile = profiles[stageIndex];
  const minimum = Math.min(profile.minimum, duration * profile.minimumCeilingRatio);
  return Math.min(profile.maximum, Math.max(duration * profile.ratio, minimum));
}

/**
 * Returns the playable prefix, in seconds, for one audited Soundcheck clip.
 * Floors keep very short effects audible; caps stop long sounds becoming giveaways.
 */
export function soundcheckCutDuration(duration, stage) {
  return progressiveCutDuration(duration, stage, SOUNDCHECK_REVEAL_STAGES, SOUNDCHECK_CUT_PROFILES);
}

/**
 * Echo Hunt opens with two deliberately terse fragments. The final stage
 * reveals the complete response so every round remains solvable.
 */
export function echoHuntCutDuration(duration, stage) {
  return progressiveCutDuration(duration, stage, ECHO_HUNT_REVEAL_STAGES, ECHO_HUNT_CUT_PROFILES);
}

export const SOUNDCHECK_REVEAL_STAGES = 3;
export const ECHO_HUNT_REVEAL_STAGES = 3;
export const SOUNDCHECK_SEQUENCE_GAP_SECONDS = 0.12;

const SOUNDCHECK_CUT_PROFILES = [
  { ratio: 0.12, minimum: 0.1, minimumCeilingRatio: 0.2, maximum: 0.32 },
  { ratio: 0.28, minimum: 0.2, minimumCeilingRatio: 0.36, maximum: 0.8 },
  { ratio: 0.48, minimum: 0.34, minimumCeilingRatio: 0.58, maximum: 2.2 },
];

const ECHO_HUNT_CUT_PROFILES = [
  { ratio: 0.2, minimum: 0.18, minimumCeilingRatio: 0.28, maximum: 0.9 },
  { ratio: 0.44, minimum: 0.38, minimumCeilingRatio: 0.52, maximum: 1.8 },
  { ratio: 0.7, minimum: 0.6, minimumCeilingRatio: 0.78, maximum: 3.4 },
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
 * Echo Hunt uses a little more speech than Soundcheck, but never opens with
 * the complete response. Later stages reveal progressively longer phrases.
 */
export function echoHuntCutDuration(duration, stage) {
  return progressiveCutDuration(duration, stage, ECHO_HUNT_REVEAL_STAGES, ECHO_HUNT_CUT_PROFILES);
}

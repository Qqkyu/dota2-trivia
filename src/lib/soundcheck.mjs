export const SOUNDCHECK_REVEAL_STAGES = 3;
export const ECHO_HUNT_REVEAL_STAGES = 3;
export const SOUNDCHECK_SEQUENCE_GAP_SECONDS = 0.12;
export const SOUNDCHECK_FINAL_REVEAL_SECONDS = 7;
export const ECHO_HUNT_FINAL_REVEAL_SECONDS = 7;

const SOUNDCHECK_CUT_PROFILES = [
  { ratio: 0.05, minimum: 0.055, minimumCeilingRatio: 0.1, maximum: 0.12 },
  { ratio: 0.11, minimum: 0.11, minimumCeilingRatio: 0.2, maximum: 0.27 },
  { ratio: 1, minimum: 0, minimumCeilingRatio: 1, maximum: Number.POSITIVE_INFINITY },
];

const ECHO_HUNT_CUT_PROFILES = [
  { ratio: 0.07, minimum: 0.1, minimumCeilingRatio: 0.12, maximum: 0.24 },
  { ratio: 0.17, minimum: 0.22, minimumCeilingRatio: 0.27, maximum: 0.56 },
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
 * The complete final pass needs a little more than one third of a 15-second
 * round so even the longest reviewed two-sound sequence can finish.
 */
function timedAudioRevealStage(timeRemainingMs, roundDurationMs, finalSeconds) {
  if (timeRemainingMs <= finalSeconds * 1_000) return 3;
  if (timeRemainingMs <= (roundDurationMs * 2) / 3) return 2;
  return 1;
}

export function soundcheckRevealStage(timeRemainingMs, roundDurationMs) {
  return timedAudioRevealStage(timeRemainingMs, roundDurationMs, SOUNDCHECK_FINAL_REVEAL_SECONDS);
}

/** The complete Echo line needs the same seven-second window as Soundcheck. */
export function echoHuntRevealStage(timeRemainingMs, roundDurationMs) {
  return timedAudioRevealStage(timeRemainingMs, roundDurationMs, ECHO_HUNT_FINAL_REVEAL_SECONDS);
}

/**
 * Echo Hunt opens with two deliberately terse fragments. The final stage
 * reveals the complete response so every round remains solvable.
 */
export function echoHuntCutDuration(duration, stage) {
  return progressiveCutDuration(duration, stage, ECHO_HUNT_REVEAL_STAGES, ECHO_HUNT_CUT_PROFILES);
}

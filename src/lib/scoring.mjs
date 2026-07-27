export const MAP_READ_GRACE_MS = 3_000;

/**
 * Keeps the full speed value during an optional reading window, then fades it
 * linearly through the remaining round time.
 *
 * @param {number} timeRemaining
 * @param {number} duration
 * @param {number} [grace]
 */
export function speedScoreRatio(timeRemaining, duration, grace = 0) {
  const safeDuration = Math.max(1, duration);
  const safeRemaining = Math.max(0, Math.min(safeDuration, timeRemaining));
  const safeGrace = Math.max(0, Math.min(safeDuration - 1, grace));
  const elapsed = safeDuration - safeRemaining;

  if (elapsed <= safeGrace) return 1;
  return Math.max(0, 1 - (elapsed - safeGrace) / (safeDuration - safeGrace));
}

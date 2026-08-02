export const MAP_READ_GRACE_MS = 3_000;
export const MAX_SPEED_BONUS = 100;
export const SPELL_CLUE_PENALTY = 40;

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

/** @param {number} timeRemaining @param {number} duration */
export function clueStageAt(timeRemaining, duration) {
  if (timeRemaining <= duration / 3) return 3;
  if (timeRemaining <= (duration * 2) / 3) return 2;
  return 1;
}

/**
 * The one scoring formula used by the browser preview and the authoritative
 * vote endpoint. Keep this free of browser and database concerns so both sides
 * cannot silently drift apart.
 *
 * @param {{
 *   difficulty: 1 | 2 | 3,
 *   game?: string,
 *   map?: { target: { x: number, y: number }, tolerance: number, choice?: unknown }
 * }} question
 * @param {number} timeRemaining
 * @param {number} duration
 * @param {{ x: number, y: number } | null | undefined} [selectedMapPosition]
 */
export function scoreBreakdown(question, timeRemaining, duration, selectedMapPosition) {
  const speedRatio = speedScoreRatio(timeRemaining, duration, question.map ? MAP_READ_GRACE_MS : 0);
  const speedBonus = Math.round(speedRatio * MAX_SPEED_BONUS);
  const difficultyBonus = (question.difficulty - 1) * 25;
  const cluePenalty =
    question.game === "spell-link" ? (clueStageAt(timeRemaining, duration) - 1) * SPELL_CLUE_PENALTY : 0;
  const distance =
    question.map && selectedMapPosition
      ? Math.hypot(question.map.target.x - selectedMapPosition.x, question.map.target.y - selectedMapPosition.y)
      : null;
  const precisionBonus =
    question.map && !question.map.choice && distance !== null
      ? Math.round(Math.max(0, 1 - distance / question.map.tolerance) * 100)
      : 0;

  return {
    speedBonus,
    difficultyBonus,
    cluePenalty,
    precisionBonus,
    mapDistance: distance,
    rawPoints: Math.max(25, 100 + speedBonus + difficultyBonus + precisionBonus - cluePenalty),
  };
}

/** @param {number} correctCount @param {number} total */
export function crowdScoreMultiplier(correctCount, total) {
  return correctCount > 0 && total > 0 && correctCount / total < 0.5 ? 2 : 1;
}

/**
 * Turns private base-score aggregates into the only score information that is
 * safe to reveal publicly. Incorrect answers never enter the average.
 *
 * @param {{
 *   correctCount: number,
 *   total: number,
 *   basePointsTotal: number,
 *   basePointsBest: number,
 *   playerBasePoints?: number | null
 * }} aggregate
 */
export function roundScoreSummary(aggregate) {
  const correctCount = Math.max(0, Math.floor(aggregate.correctCount));
  const total = Math.max(correctCount, Math.floor(aggregate.total));
  const multiplier = crowdScoreMultiplier(correctCount, total);
  const playerBasePoints =
    typeof aggregate.playerBasePoints === "number" && Number.isFinite(aggregate.playerBasePoints)
      ? Math.max(0, Math.round(aggregate.playerBasePoints))
      : null;

  return {
    correctCount,
    average: correctCount > 0 ? Math.round((Math.max(0, aggregate.basePointsTotal) * multiplier) / correctCount) : null,
    best: correctCount > 0 ? Math.max(0, Math.round(aggregate.basePointsBest)) * multiplier : null,
    playerPoints: playerBasePoints === null ? null : playerBasePoints * multiplier,
  };
}

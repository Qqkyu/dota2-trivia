export const MIN_INITIAL_ANSWER_TIME_MS = 8_000;
/** Join a new round only if it still has almost the full 15s clock. */
export const FRESH_ROUND_MIN_REMAINING_MS = 13_000;
/** Decide once at entry. Shorter leftovers never open the wait room. */
export const MIN_WAIT_LESSON_MS = 3_000;

export function shouldShowEntryWaitLessons(remainingMs) {
  return Number.isFinite(remainingMs) && remainingMs >= MIN_WAIT_LESSON_MS;
}

/**
 * First entry always skips a round that other players already started.
 * A later snapshot may join only when the next answering window is still fresh.
 *
 * @param {{ phase?: unknown, answerDeadline?: unknown }} round
 * @param {number} serverNow
 * @param {number} [minimumAnswerTime]
 */
export function shouldWaitForNextRoundOnEntry(round, serverNow, minimumAnswerTime = FRESH_ROUND_MIN_REMAINING_MS) {
  if (
    !round ||
    round.phase !== "answering" ||
    typeof round.answerDeadline !== "number" ||
    !Number.isFinite(round.answerDeadline) ||
    !Number.isFinite(serverNow)
  ) {
    return true;
  }

  return round.answerDeadline - serverNow < minimumAnswerTime;
}

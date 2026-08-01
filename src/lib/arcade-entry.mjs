export const MIN_INITIAL_ANSWER_TIME_MS = 8_000;

/**
 * A player entering the shared room should never inherit a nearly finished
 * question. Existing players remain on the global clock; this gate applies
 * only before a visitor's first playable round.
 *
 * @param {{ phase?: unknown, answerDeadline?: unknown }} round
 * @param {number} serverNow
 * @param {number} [minimumAnswerTime]
 */
export function shouldWaitForNextRoundOnEntry(round, serverNow, minimumAnswerTime = MIN_INITIAL_ANSWER_TIME_MS) {
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

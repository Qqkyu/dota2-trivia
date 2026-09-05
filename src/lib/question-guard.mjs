/**
 * Live question text must not be copyable while the clock is running.
 * Lobby and reveal stay selectable so players can still copy scores or reports.
 */
export function shouldBlockQuestionClipboard(phase) {
  return phase === "answering";
}

/** @param {{ preventDefault?: () => void } | null | undefined} event */
export function preventQuestionClipboard(event) {
  event?.preventDefault?.();
}

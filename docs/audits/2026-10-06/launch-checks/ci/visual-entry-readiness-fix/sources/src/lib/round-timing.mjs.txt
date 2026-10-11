/** Covers lock-click → POST latency so a lock sound still counts. */
export const PUBLIC_VOTE_ACCEPT_GRACE_MS = 800;

export function roundPhaseAt(now, answerDeadline, graceMs = PUBLIC_VOTE_ACCEPT_GRACE_MS) {
  return now < answerDeadline + graceMs ? "answering" : "reveal";
}

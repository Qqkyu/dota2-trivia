/**
 * One sentence about the room at reveal. Replaces the sidebar's "0 answers" stack
 * and the lone dash with plain language, and names the crowd-breaker when the
 * majority was wrong.
 *
 * @param {{
 *   total: number,
 *   rightCount: number,
 *   playerAnswered: boolean,
 *   majorityLabel?: string | null,
 *   majorityIsRight?: boolean,
 * }} input
 */
export function crowdSummaryLine({ total, rightCount, playerAnswered, majorityLabel = null, majorityIsRight = true }) {
  const safeTotal = Number.isFinite(total) && total > 0 ? Math.floor(total) : 0;
  if (safeTotal === 0) return "Nobody in the room answered before the deadline.";
  if (safeTotal === 1)
    return playerAnswered ? "You were the only one who answered this round." : "One player answered this round.";
  const share = Math.min(100, Math.max(0, Math.round((Math.max(0, rightCount) / safeTotal) * 100)));
  const base = `${safeTotal.toLocaleString("en-US")} answered · ${share}% got it right`;
  if (!majorityIsRight && majorityLabel) return `${base} · most picked ${majorityLabel}`;
  return base;
}

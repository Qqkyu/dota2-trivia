/**
 * One sentence about the room at reveal, in the same shape whatever the size
 * of the room: the count, the share that got it right, and the wrong majority
 * when there was one. No special wording for a small room; a room of one is
 * reported like a room of a thousand.
 *
 * @param {{
 *   total: number,
 *   rightCount: number,
 *   majorityLabel?: string | null,
 *   majorityIsRight?: boolean,
 * }} input
 * @param {import("../i18n/translator").Translate} t
 * @param {(value: number) => string} number
 */
export function crowdSummaryLine({ total, rightCount, majorityLabel = null, majorityIsRight = true }, t, number) {
  const safeTotal = Number.isFinite(total) && total > 0 ? Math.floor(total) : 0;
  if (safeTotal === 0) return t("round.crowd.noAnswers");
  const share = Math.min(100, Math.max(0, Math.round((Math.max(0, rightCount) / safeTotal) * 100)));
  const vars = { count: safeTotal, total: number(safeTotal), share };
  if (!majorityIsRight && majorityLabel) return t("round.crowd.summaryMajority", { ...vars, label: majorityLabel });
  return t("round.crowd.summary", vars);
}

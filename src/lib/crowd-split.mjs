function safeCount(value) {
  return Number.isInteger(value) && value > 0 ? value : 0;
}

export function crowdPercentage(count, total) {
  if (!Number.isFinite(total) || total <= 0) return 0;
  return Math.min(100, Math.max(0, Math.round((safeCount(count) / total) * 100)));
}

/**
 * Caps the open-grid payload without accidentally dropping a voted-for
 * correct answer or the requesting player's own pick.
 *
 * @param {Array<{answerKey: string, count: number}>} keyCounts
 * @param {Array<string | null | undefined>} requiredKeys
 * @param {number} maxChoices
 */
export function prioritizedKeyCounts(keyCounts, requiredKeys = [], maxChoices = 12) {
  const countByKey = new Map();
  for (const entry of Array.isArray(keyCounts) ? keyCounts : []) {
    if (!entry || typeof entry.answerKey !== "string") continue;
    const count = safeCount(entry.count);
    if (!count) continue;
    countByKey.set(entry.answerKey, (countByKey.get(entry.answerKey) ?? 0) + count);
  }

  const ranked = [...countByKey]
    .map(([answerKey, count]) => ({ answerKey, count }))
    .sort((left, right) => right.count - left.count || left.answerKey.localeCompare(right.answerKey));
  const limit = Math.max(1, Math.floor(maxChoices));
  const required = new Set(requiredKeys.filter((key) => typeof key === "string" && key));
  const visible = ranked.slice(0, limit);

  for (const answerKey of required) {
    if (visible.some((entry) => entry.answerKey === answerKey)) continue;
    const requiredEntry = ranked.find((entry) => entry.answerKey === answerKey);
    if (!requiredEntry) continue;
    if (visible.length < limit) {
      visible.push(requiredEntry);
      continue;
    }

    let replaceIndex = -1;
    for (let index = visible.length - 1; index >= 0; index -= 1) {
      if (!required.has(visible[index].answerKey)) {
        replaceIndex = index;
        break;
      }
    }
    if (replaceIndex >= 0) visible[replaceIndex] = requiredEntry;
  }

  return visible.sort((left, right) => right.count - left.count || left.answerKey.localeCompare(right.answerKey));
}

/**
 * Keeps the most popular open-grid answers visible while always retaining the
 * correct answer and the current player's pick, even when either received no
 * votes. Everything omitted is represented by one honest "other" row.
 *
 * @param {Array<{answerKey: string, count: number}>} keyCounts
 * @param {number} total
 * @param {{correctKey?: string | null, selectedKey?: string | null, maxChoices?: number}} options
 */
export function keyedCrowdSplitRows(keyCounts, total, { correctKey = null, selectedKey = null, maxChoices = 4 } = {}) {
  const countByKey = new Map();
  for (const entry of Array.isArray(keyCounts) ? keyCounts : []) {
    if (!entry || typeof entry.answerKey !== "string") continue;
    const count = safeCount(entry.count);
    if (!count) continue;
    countByKey.set(entry.answerKey, (countByKey.get(entry.answerKey) ?? 0) + count);
  }

  const rankedKeys = [...countByKey]
    .sort(([leftKey, leftCount], [rightKey, rightCount]) => rightCount - leftCount || leftKey.localeCompare(rightKey))
    .map(([answerKey]) => answerKey);
  const requiredKeys = [...new Set([correctKey, selectedKey].filter((key) => typeof key === "string" && key))];
  const visibleKeys = rankedKeys.slice(0, Math.max(1, maxChoices));

  for (const answerKey of requiredKeys) {
    if (visibleKeys.includes(answerKey)) continue;
    if (visibleKeys.length < maxChoices) {
      visibleKeys.push(answerKey);
      continue;
    }
    let replaceIndex = -1;
    for (let index = visibleKeys.length - 1; index >= 0; index -= 1) {
      if (!requiredKeys.includes(visibleKeys[index])) {
        replaceIndex = index;
        break;
      }
    }
    if (replaceIndex >= 0) visibleKeys[replaceIndex] = answerKey;
  }

  const rows = [...new Set(visibleKeys)]
    .map((answerKey) => ({ answerKey, count: countByKey.get(answerKey) ?? 0 }))
    .sort(
      (left, right) =>
        right.count - left.count ||
        Number(right.answerKey === correctKey) - Number(left.answerKey === correctKey) ||
        left.answerKey.localeCompare(right.answerKey),
    );
  const shownCount = rows.reduce((sum, row) => sum + row.count, 0);
  const otherCount = Math.max(0, safeCount(total) - shownCount);

  return {
    rows,
    otherCount,
  };
}

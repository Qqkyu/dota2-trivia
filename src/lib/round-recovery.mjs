export const RECOVERY_ROUND_MAX = 24;
export const RECOVERY_ROUND_ID_MAX = 512;
export const RECOVERY_PARAM_MAX = RECOVERY_ROUND_MAX * (RECOVERY_ROUND_ID_MAX + 1);

/** Ignore invalid recovery metadata without stopping the current round. */
export function recoveryRoundNumbers(value, roomId, currentRoundNumber, privateStartedAt) {
  if (typeof value !== "string" || value.length > RECOVERY_PARAM_MAX) return [];
  const prefix = `${roomId}:round:`;
  const numbers = [];
  for (const raw of value.split(",").slice(0, RECOVERY_ROUND_MAX)) {
    const id = raw.trim();
    if (id.length > RECOVERY_ROUND_ID_MAX || !id.startsWith(prefix)) continue;
    const numberText = id.slice(prefix.length).split(":")[0];
    if (!/^(0|[1-9]\d*)$/.test(numberText)) continue;
    const number = Number(numberText);
    if (!Number.isSafeInteger(number) || number >= currentRoundNumber) continue;
    const expected = `${prefix}${number}${privateStartedAt == null ? "" : `:${privateStartedAt}`}`;
    if (id !== expected) continue;
    numbers.push(number);
  }
  return [...new Set(numbers)];
}

/**
 * One tip at a time, like the Dota pause screen. Visuals use the live boards.
 * `body` is a message key.
 *
 * @type {readonly { id: string, body: import("../i18n/types").MessageKey }[]}
 */
export const ENTRY_WAIT_TIPS = Object.freeze([
  {
    id: "keys",
    body: "wait.tip.keys",
  },
  {
    id: "heroes",
    body: "wait.tip.heroes",
  },
  {
    id: "shop",
    body: "wait.tip.shop",
  },
]);

/** @param {readonly typeof ENTRY_WAIT_TIPS[number][]} [tips] */
export function shuffleEntryWaitTips(tips = ENTRY_WAIT_TIPS, random = Math.random) {
  const next = [...tips];
  for (let index = next.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    const current = next[index];
    const swap = next[swapIndex];
    if (!current || !swap) continue;
    next[index] = swap;
    next[swapIndex] = current;
  }
  return next;
}

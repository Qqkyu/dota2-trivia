export const ENTRY_WAIT_HINT = "Waiting for the next full question.";
/** Official Dota shop field: DOTA_Shop_Search_Field_Default */
export const DOTA_SHOP_SEARCH_PLACEHOLDER = "Search Items";

export const ENTRY_WAIT_TIP_LABEL = "Hint";

/** One tip at a time, like the Dota pause screen. Visuals use the live boards. */
export const ENTRY_WAIT_TIPS = Object.freeze([
  {
    id: "keys",
    body: "Use A–D shortcut to pick an answer",
  },
  {
    id: "heroes",
    body: "Start typing to filter heroes",
  },
  {
    id: "shop",
    body: "Use Search Items to filter",
    mark: "Search Items",
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

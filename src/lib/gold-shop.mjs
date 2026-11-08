/**
 * The gold shop: see docs/design/gold-shop.md.
 *
 * Everything here is derived from the run's round results and the purchases, so a late or
 * corrected result settles the same way every time. Records keep gold earned; the shop only
 * changes the gold a player can spend and the streak.
 */

export const SHOP_ITEMS = Object.freeze({
  aegis: Object.freeze({ price: 300 }),
  rune: Object.freeze({ price: 200, payout: 400 }),
});

export const SHOP_ITEM_IDS = Object.freeze(["aegis", "rune"]);

/** @param {string | null | undefined} roundId */
export function roundNumberFromId(roundId) {
  const match = /:round:(\d+)(?::|$)/.exec(roundId ?? "");
  return match ? Number(match[1]) : null;
}

/**
 * @typedef {{ item: "aegis" | "rune", round: number }} ShopPurchase
 *   `round` is the first round the item covers: the round after the one it was bought in.
 * @typedef {{ id: string, correct: boolean, points: number }} ShopRoundResult
 */

/**
 * @param {ShopRoundResult[]} records the run's results, oldest first
 * @param {ShopPurchase[]} purchases
 */
export function goldShopState(records, purchases) {
  /** @type {Array<ShopPurchase & { usedOn: string | null }>} */
  const shields = purchases
    .filter((purchase) => purchase.item === "aegis")
    .map((purchase) => ({ ...purchase, usedOn: null }));
  /** @type {Array<ShopPurchase & { settledOn: string | null, won: boolean }>} */
  const runes = purchases
    .filter((purchase) => purchase.item === "rune")
    .map((purchase) => ({ ...purchase, settledOn: null, won: false }));
  const spent = purchases.reduce((total, purchase) => total + SHOP_ITEMS[purchase.item].price, 0);
  let earned = 0;
  let winnings = 0;
  let streak = 0;
  for (const record of records) {
    earned += record.points;
    const number = roundNumberFromId(record.id) ?? 0;
    // A rune settles on the first round the player plays after buying it.
    for (const rune of runes) {
      if (rune.settledOn || number < rune.round) continue;
      rune.settledOn = record.id;
      rune.won = record.correct;
      if (record.correct) winnings += SHOP_ITEMS.rune.payout;
    }
    if (record.correct) {
      streak += 1;
      continue;
    }
    // The first miss after buying Aegis uses it, whatever the streak was.
    const shield = shields.find((entry) => !entry.usedOn && number >= entry.round);
    if (shield) shield.usedOn = record.id;
    else streak = 0;
  }
  const lastShield = shields.filter((entry) => entry.usedOn).at(-1);
  const lastRune = runes.filter((entry) => entry.settledOn).at(-1);
  return {
    earned,
    balance: earned - spent + winnings,
    streak,
    aegisReady: shields.some((entry) => !entry.usedOn),
    runeActive: runes.some((entry) => !entry.settledOn),
    aegisUsedOn: lastShield?.usedOn ?? null,
    runeSettled: lastRune ? { roundId: lastRune.settledOn, won: lastRune.won } : null,
  };
}

/**
 * @param {ReturnType<typeof goldShopState>} state
 * @param {"aegis" | "rune"} item
 */
export function canBuyShopItem(state, item) {
  if (item === "aegis" && state.aegisReady) return false;
  if (item === "rune" && state.runeActive) return false;
  return state.balance >= SHOP_ITEMS[item].price;
}

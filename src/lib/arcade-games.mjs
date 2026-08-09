/** The round identities shown inside the one public arcade. */
export const LIVE_ROUND_GAMES = Object.freeze([
  "trivia",
  "shopkeeper",
  "spell-link",
  "fogged-vision",
  "echo-hunt",
  "soundcheck",
  "quote-hunt",
  "order-up",
]);

/** Queue Arcade has one shared public room. Round identities are not separate queues. */
export const PUBLIC_ARCADE_MODE = "mixed";
export const LIVE_ARCADE_MODES = Object.freeze([PUBLIC_ARCADE_MODE]);

/**
 * An eleven-round cadence based on genuinely different question loops rather than
 * old lobby modes. Related Classic and Shopkeeper templates share a slot, so a
 * one-loop challenge can no longer receive the weight of an entire question
 * library. The order deliberately separates rounds from the same family.
 */
export const PUBLIC_ROUND_FORMATS = Object.freeze([
  "classic-ability-values",
  "fogged-vision",
  "shopkeeper-builds",
  "quote-hunt",
  "classic-hero-stats",
  "soundcheck",
  "value-order",
  "shopkeeper-paths",
  "spell-link",
  "classic-item-prices",
  "echo-hunt",
]);

const ROUND_FORMAT_BY_KIND = Object.freeze({
  "mana-cost": "classic-ability-values",
  cooldown: "classic-ability-values",
  "ability-damage": "classic-ability-values",
  "hero-move-speed": "classic-hero-stats",
  "hero-stat-duel": "classic-hero-stats",
  "item-cost": "classic-item-prices",
  "item-price-duel": "classic-item-prices",
  "shopkeeper-build-result": "shopkeeper-builds",
  "shopkeeper-real-recipe": "shopkeeper-builds",
  "shopkeeper-shared-part": "shopkeeper-paths",
  "shopkeeper-upgrade-path": "shopkeeper-paths",
  "spell-owner": "spell-link",
  "fogged-hero": "fogged-vision",
  "hero-voice": "echo-hunt",
  "soundcheck-ability": "soundcheck",
  "soundcheck-item": "soundcheck",
  "hero-quote": "quote-hunt",
  "value-order-item": "value-order",
  "value-order-cooldown": "value-order",
  "value-order-mana": "value-order",
  "value-order-damage": "value-order",
  "value-order-move-speed": "value-order",
  "value-order-attack-range": "value-order",
});

const ROUND_GAME_BY_FORMAT = Object.freeze({
  "classic-ability-values": "trivia",
  "classic-hero-stats": "trivia",
  "classic-item-prices": "trivia",
  "shopkeeper-builds": "shopkeeper",
  "shopkeeper-paths": "shopkeeper",
  "spell-link": "spell-link",
  "fogged-vision": "fogged-vision",
  "echo-hunt": "echo-hunt",
  soundcheck: "soundcheck",
  "quote-hunt": "quote-hunt",
  "value-order": "order-up",
});

/** @param {{ kind?: string } | null | undefined} question */
export function roundFormatForQuestion(question) {
  return ROUND_FORMAT_BY_KIND[question?.kind] ?? null;
}

/** @param {string} format */
export function roundGameForFormat(format) {
  return ROUND_GAME_BY_FORMAT[format] ?? null;
}

/** @param {number} length @param {number} [offset] */
export function publicRoundFormatRotation(length, offset = 0) {
  if (length <= 0) return [];
  const normalizedOffset = Math.max(0, Math.floor(offset));
  return Array.from(
    { length },
    (_, index) => PUBLIC_ROUND_FORMATS[(normalizedOffset + index) % PUBLIC_ROUND_FORMATS.length],
  );
}

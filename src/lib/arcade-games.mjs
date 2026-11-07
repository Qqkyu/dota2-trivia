/** The round identities shown inside the one public arcade. */
export const LIVE_ROUND_GAMES = Object.freeze([
  "trivia",
  "shopkeeper",
  "spell-link",
  "fogged-vision",
  "echo-hunt",
  "soundcheck",
  "quote-hunt",
  "aghanim-lab",
  "order-up",
  "flashback",
]);

/** Message keys for the name of each round identity. */
export const ROUND_GAME_LABEL_KEYS = Object.freeze({
  trivia: "game.trivia.label",
  shopkeeper: "game.shopkeeper.label",
  "spell-link": "game.spellLink.label",
  "fogged-vision": "game.foggedVision.label",
  "echo-hunt": "game.echoHunt.label",
  soundcheck: "game.soundcheck.label",
  "quote-hunt": "game.quoteHunt.label",
  "aghanim-lab": "game.aghanimLab.label",
  "order-up": "game.orderUp.label",
  flashback: "game.flashback.label",
});

/** Message keys for the shorter names in the lobby list. */
export const ROUND_GAME_SHORT_LABEL_KEYS = Object.freeze({
  trivia: "game.trivia.short",
  shopkeeper: "game.shopkeeper.short",
  "spell-link": "game.spellLink.short",
  "fogged-vision": "game.foggedVision.short",
  "echo-hunt": "game.echoHunt.short",
  soundcheck: "game.soundcheck.short",
  "quote-hunt": "game.quoteHunt.short",
  "aghanim-lab": "game.aghanimLab.short",
  "order-up": "game.orderUp.short",
  flashback: "game.flashback.short",
});

/** A few words on what each round asks, for players who have not seen it yet. */
export const ROUND_GAME_HINT_KEYS = Object.freeze({
  trivia: "game.trivia.hint",
  shopkeeper: "game.shopkeeper.hint",
  "spell-link": "game.spellLink.hint",
  "fogged-vision": "game.foggedVision.hint",
  "echo-hunt": "game.echoHunt.hint",
  soundcheck: "game.soundcheck.hint",
  "quote-hunt": "game.quoteHunt.hint",
  "aghanim-lab": "game.aghanimLab.hint",
  "order-up": "game.orderUp.hint",
  flashback: "game.flashback.hint",
});

/** Queue Arcade has one shared public room. Round identities are not separate queues. */
export const PUBLIC_ARCADE_MODE = "mixed";
export const LIVE_ARCADE_MODES = Object.freeze([PUBLIC_ARCADE_MODE]);

/**
 * A thirteen-round cadence based on genuinely different question loops rather than
 * old lobby modes. Related Classic and Shopkeeper templates share a slot, so a
 * one-loop challenge can no longer receive the weight of an entire question
 * library. The order deliberately separates rounds from the same family.
 */
export const PUBLIC_ROUND_FORMATS = Object.freeze([
  "classic-ability-values",
  "fogged-vision",
  "shopkeeper-builds",
  "quote-hunt",
  "aghanim-upgrades",
  "classic-hero-stats",
  "soundcheck",
  "flashback",
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
  "aghanim-upgrade": "aghanim-upgrades",
  "value-order-item": "value-order",
  "value-order-cooldown": "value-order",
  "value-order-mana": "value-order",
  "value-order-damage": "value-order",
  "value-order-move-speed": "value-order",
  "value-order-attack-range": "value-order",
  "flashback-year": "flashback",
  "flashback-choice": "flashback",
  "flashback-order": "flashback",
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
  "aghanim-upgrades": "aghanim-lab",
  "value-order": "order-up",
  flashback: "flashback",
});

/** @param {{ kind?: string } | null | undefined} question */
export function roundFormatForQuestion(question) {
  return ROUND_FORMAT_BY_KIND[question?.kind] ?? null;
}

/** @param {string} format */
export function roundGameForFormat(format) {
  return ROUND_GAME_BY_FORMAT[format] ?? null;
}

export function isPublicRoundFormat(value) {
  return PUBLIC_ROUND_FORMATS.includes(value);
}

export function isLiveRoundGame(value) {
  return LIVE_ROUND_GAMES.includes(value);
}

/** Map ticked round identities onto the 13-format cadence. Empty means the full mix. */
export function formatsForRoundGames(games) {
  const wanted = new Set(Array.isArray(games) ? games : []);
  const formats = PUBLIC_ROUND_FORMATS.filter((format) => wanted.has(ROUND_GAME_BY_FORMAT[format]));
  return formats.length > 0 ? formats : [...PUBLIC_ROUND_FORMATS];
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

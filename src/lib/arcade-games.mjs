/** The selectable round games. Retired experiments deliberately stay outside this catalog. */
export const LIVE_ROUND_GAMES = Object.freeze([
  "trivia",
  "shopkeeper",
  "spell-link",
  "fogged-vision",
  "echo-hunt",
  "soundcheck",
  "quote-hunt",
]);

export const LIVE_ARCADE_MODES = Object.freeze(["mixed", ...LIVE_ROUND_GAMES]);

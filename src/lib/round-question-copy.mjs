/** In-round chrome that is hardcoded in the live arcade, not the format look-cue. */
export const LIVE_ROUND_HEADER_LABELS = Object.freeze({
  trivia: "Classic Trivia",
  shopkeeper: "Shopkeeper Rush",
  "spell-link": "Spell Link",
  "fogged-vision": "Fogged Vision",
  "echo-hunt": "Echo Hunt",
  soundcheck: "Soundcheck",
  "quote-hunt": "Quote Hunt",
  "aghanim-lab": "Aghanim's Lab",
  "order-up": "Order Up",
});

export const LIVE_QUESTION_COPY = Object.freeze({
  "spell-link": {
    eyebrow: "Ability identity",
    prompt: "Which hero owns this ability?",
    clueTwo: "Ability name unlocks at 10s",
    clueThree: "Icon unlocks at 5s",
  },
  "fogged-vision": {
    eyebrow: "Progressive reveal",
    prompt: "Which hero is hiding in the fog?",
  },
  "echo-hunt": {
    eyebrow: "Hero response",
    prompt: "Whose voice is this?",
  },
  soundcheck: {
    ability: "Ability sound",
    item: "Item activation",
    sequence: "Ordered pair",
  },
  "quote-hunt": {
    eyebrow: "Hero quote",
    prompt: "Who said it?",
    cardLabel: "Hero response",
  },
  "aghanim-lab": {
    eyebrow: "Upgrade effect",
    clueTwo: "Upgrade details",
    clueThree: "Ability name",
  },
});

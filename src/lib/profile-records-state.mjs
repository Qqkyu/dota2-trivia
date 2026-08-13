import { compareFormatMastery } from "./round-identity.mjs";

const PIPE_ANSWERS = ["3,250 gold", "3,275 gold", "3,725 gold", "4,000 gold"];
const SAMPLE_HERO = "https://cdn.cloudflare.steamstatic.com/apps/dota2/images/dota_react/heroes/pudge.png";
const SAMPLE_ITEMS = [
  {
    name: "Ring of Health",
    image: "https://cdn.cloudflare.steamstatic.com/apps/dota2/images/dota_react/items/ring_of_health.png",
  },
  {
    name: "Cloak",
    image: "https://cdn.cloudflare.steamstatic.com/apps/dota2/images/dota_react/items/cloak.png",
  },
  {
    name: "Headdress",
    image: "https://cdn.cloudflare.steamstatic.com/apps/dota2/images/dota_react/items/headdress.png",
  },
];

function samplePreview(game, extra = {}) {
  return {
    game,
    kind: null,
    category: null,
    eyebrow: null,
    prompt: null,
    detail: null,
    hint: null,
    answers: null,
    image: null,
    fogged: false,
    shopItems: null,
    shopFormat: null,
    orderCards: null,
    effect: null,
    soundcheckFamily: null,
    soundcheckFormat: null,
    ...extra,
  };
}

const PREVIEWS = {
  trivia: samplePreview("trivia", {
    kind: "item-cost",
    category: "Items",
    eyebrow: "Pipe of Insight",
    prompt: "How much does Pipe of Insight cost?",
    answers: PIPE_ANSWERS,
  }),
  shopkeeper: samplePreview("shopkeeper", {
    category: "Recipes",
    prompt: "What do these components build?",
    shopFormat: "build-result",
    shopItems: SAMPLE_ITEMS,
  }),
  "spell-link": samplePreview("spell-link", {
    category: "Abilities",
    hint: "Interrupts the target and traps them in place, preventing movement or blinking.",
  }),
  "fogged-vision": samplePreview("fogged-vision", {
    category: "Heroes",
    fogged: true,
    image: { src: SAMPLE_HERO, alt: "" },
  }),
  "echo-hunt": samplePreview("echo-hunt", {
    category: "Heroes",
  }),
  soundcheck: samplePreview("soundcheck", {
    category: "Sounds",
    prompt: "Which ability makes this sound?",
    soundcheckFamily: "ability",
    soundcheckFormat: "single",
  }),
  "quote-hunt": samplePreview("quote-hunt", {
    category: "Heroes",
    detail: "The only thing that could ever make me turn on my allies...",
  }),
  "aghanim-lab": samplePreview("aghanim-lab", {
    category: "Abilities",
    prompt: "Whose upgrade is this?",
    effect: "After using a mobility spell, the next attack burns extra maximum mana.",
    upgradeType: "scepter",
    image: {
      src: "https://cdn.cloudflare.steamstatic.com/apps/dota2/images/dota_react/items/ultimate_scepter.png?t=1593393829403",
      alt: "",
    },
  }),
  "order-up": samplePreview("order-up", {
    category: "Items",
    eyebrow: "Item gold",
    prompt: "Order these items from cheapest to most expensive.",
    orderCards: SAMPLE_ITEMS.concat({
      name: "Pipe of Insight",
      image: "https://cdn.cloudflare.steamstatic.com/apps/dota2/images/dota_react/items/pipe.png",
    }),
  }),
};

export const PROFILE_RECORDS_PREVIEW_SIZES = Object.freeze(["short", "long"]);

/** @param {unknown} value */
export function isProfileRecordsPreviewSize(value) {
  return PROFILE_RECORDS_PREVIEW_SIZES.includes(value);
}

const SHARED_PLAYER_FORMATS = [
  {
    format: "classic-ability-values",
    answered: 6,
    correct: 3,
    accuracy: 50,
    firstStageCorrect: 0,
    progressiveAnswered: 0,
  },
  {
    format: "classic-item-prices",
    answered: 2,
    correct: 2,
    accuracy: 100,
    firstStageCorrect: 0,
    progressiveAnswered: 0,
  },
  {
    format: "shopkeeper-builds",
    answered: 4,
    correct: 2,
    accuracy: 50,
    firstStageCorrect: 0,
    progressiveAnswered: 0,
  },
  {
    format: "shopkeeper-paths",
    answered: 3,
    correct: 1,
    accuracy: 33,
    firstStageCorrect: 0,
    progressiveAnswered: 0,
  },
  {
    format: "spell-link",
    answered: 5,
    correct: 4,
    accuracy: 80,
    firstStageCorrect: 2,
    progressiveAnswered: 5,
  },
];

/** @param {"short" | "long"} size */
export function profileRecordsPreview(size) {
  return {
    size,
    formats: compareFormatMastery(
      SHARED_PLAYER_FORMATS,
      size === "long"
        ? [
            { game: "trivia", total: 40, correct: 18 },
            { game: "shopkeeper", total: 20, correct: 14 },
            { game: "spell-link", total: 25, correct: 16 },
            { game: "fogged-vision", total: 12, correct: 5 },
          ]
        : [],
    ).map((row) => ({
      ...row,
      preview: PREVIEWS[row.game] ?? samplePreview(row.game),
    })),
  };
}

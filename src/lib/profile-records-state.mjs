import { compareFormatMastery } from "./round-identity.mjs";

const PIPE_GOLD = ["3,250", "3,275", "3,725", "4,000"];
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

/** @param {(key: any, vars?: Record<string, string | number>) => string} t */
function samplePreviews(t) {
  return {
    trivia: samplePreview("trivia", {
      kind: "item-cost",
      category: t("profile.sample.category.items"),
      eyebrow: "Pipe of Insight",
      prompt: t("profile.sample.trivia.prompt"),
      answers: PIPE_GOLD.map((gold) => t("profile.sample.gold", { gold })),
    }),
    shopkeeper: samplePreview("shopkeeper", {
      category: t("profile.sample.category.recipes"),
      prompt: t("profile.sample.shopkeeper.prompt"),
      shopFormat: "build-result",
      shopItems: SAMPLE_ITEMS,
    }),
    "spell-link": samplePreview("spell-link", {
      category: t("profile.sample.category.abilities"),
      hint: t("profile.sample.spellLink.hint"),
    }),
    "fogged-vision": samplePreview("fogged-vision", {
      category: t("profile.sample.category.heroes"),
      fogged: true,
      image: { src: SAMPLE_HERO, alt: "" },
    }),
    "echo-hunt": samplePreview("echo-hunt", {
      category: t("profile.sample.category.heroes"),
    }),
    soundcheck: samplePreview("soundcheck", {
      category: t("profile.sample.category.sounds"),
      prompt: t("profile.sample.soundcheck.prompt"),
      soundcheckFamily: "ability",
      soundcheckFormat: "single",
    }),
    "quote-hunt": samplePreview("quote-hunt", {
      category: t("profile.sample.category.heroes"),
      detail: t("profile.sample.quote.detail"),
    }),
    "aghanim-lab": samplePreview("aghanim-lab", {
      category: t("profile.sample.category.abilities"),
      prompt: t("profile.sample.aghanim.prompt"),
      effect: t("profile.sample.aghanim.effect"),
      upgradeType: "scepter",
      image: {
        src: "https://cdn.cloudflare.steamstatic.com/apps/dota2/images/dota_react/items/ultimate_scepter.png?t=1593393829403",
        alt: "",
      },
    }),
    "order-up": samplePreview("order-up", {
      category: t("profile.sample.category.items"),
      eyebrow: t("profile.sample.orderUp.eyebrow"),
      prompt: t("profile.sample.orderUp.prompt"),
      orderCards: SAMPLE_ITEMS.concat({
        name: "Pipe of Insight",
        image: "https://cdn.cloudflare.steamstatic.com/apps/dota2/images/dota_react/items/pipe.png",
      }),
    }),
    flashback: samplePreview("flashback", {
      category: t("profile.sample.category.esports"),
      eyebrow: t("profile.sample.flashback.eyebrow"),
      prompt: t("profile.sample.flashback.prompt"),
      answers: ["EHOME", "Natus Vincere", "Invictus Gaming", "Alliance"],
    }),
  };
}

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
    secondStageCorrect: 0,
    thirdStageCorrect: 0,
    firstStageAnswered: 0,
    secondStageAnswered: 0,
    thirdStageAnswered: 0,
    progressiveAnswered: 0,
  },
  {
    format: "classic-item-prices",
    answered: 2,
    correct: 2,
    accuracy: 100,
    firstStageCorrect: 0,
    secondStageCorrect: 0,
    thirdStageCorrect: 0,
    firstStageAnswered: 0,
    secondStageAnswered: 0,
    thirdStageAnswered: 0,
    progressiveAnswered: 0,
  },
  {
    format: "shopkeeper-builds",
    answered: 4,
    correct: 2,
    accuracy: 50,
    firstStageCorrect: 0,
    secondStageCorrect: 0,
    thirdStageCorrect: 0,
    firstStageAnswered: 0,
    secondStageAnswered: 0,
    thirdStageAnswered: 0,
    progressiveAnswered: 0,
  },
  {
    format: "shopkeeper-paths",
    answered: 3,
    correct: 1,
    accuracy: 33,
    firstStageCorrect: 0,
    secondStageCorrect: 0,
    thirdStageCorrect: 0,
    firstStageAnswered: 0,
    secondStageAnswered: 0,
    thirdStageAnswered: 0,
    progressiveAnswered: 0,
  },
  {
    format: "spell-link",
    answered: 5,
    correct: 4,
    accuracy: 80,
    firstStageCorrect: 2,
    secondStageCorrect: 1,
    thirdStageCorrect: 1,
    firstStageAnswered: 3,
    secondStageAnswered: 1,
    thirdStageAnswered: 1,
    progressiveAnswered: 5,
  },
];

/**
 * @param {"short" | "long"} size
 * @param {(key: any, vars?: Record<string, string | number>) => string} [t] Without it, text stays as message keys.
 */
export function profileRecordsPreview(size, t = (key) => key) {
  const previews = samplePreviews(t);
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
      preview: previews[row.game] ?? samplePreview(row.game),
    })),
  };
}

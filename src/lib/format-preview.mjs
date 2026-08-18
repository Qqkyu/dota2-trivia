import { LIVE_ROUND_GAMES, roundFormatForQuestion, roundGameForFormat } from "./arcade-games.mjs";
import shopkeeperCatalog from "../data/shopkeeper-catalog.json" with { type: "json" };

const SHOP_ITEMS_BY_KEY = new Map(shopkeeperCatalog.groups.flatMap((group) => group.items).map((item) => [item.key, item]));

function copyImage(image, alt) {
  if (!image?.src) return null;
  return { src: image.src, alt: alt ?? "" };
}

function aghanimArtwork(question) {
  const upgradeType = question.aghanim?.upgradeType;
  const catalogKey = upgradeType === "scepter" ? "ultimate_scepter" : upgradeType === "shard" ? "aghanims_shard" : null;
  const item = catalogKey ? SHOP_ITEMS_BY_KEY.get(catalogKey) : null;
  if (item?.image) return { src: item.image, alt: "" };
  return copyImage(question.image, "");
}

function publicPreviewForQuestion(question, game) {
  const shopItems = question.shopkeeper?.promptItems?.slice(0, 3).map((item) => ({
    name: item.name,
    image: item.image,
    count: item.count ?? 1,
  }));
  const orderCards = question.valueOrder?.cards?.map((card) => ({
    name: card.name,
    image: card.image,
  }));
  const hideArtwork = game === "echo-hunt" || game === "soundcheck" || game === "spell-link";

  return {
    game,
    kind: question.kind ?? null,
    category: question.category ?? null,
    eyebrow: question.eyebrow ?? null,
    prompt: question.prompt,
    detail: game === "quote-hunt" ? (question.detail ?? null) : null,
    hint: game === "spell-link" ? (question.hint ?? null) : null,
    answers:
      (game === "trivia" ||
        (game === "flashback" && question.kind !== "flashback-order" && question.kind !== "flashback-year")) &&
      Array.isArray(question.answers)
        ? [...question.answers]
        : null,
    image:
      game === "aghanim-lab"
        ? aghanimArtwork(question)
        : hideArtwork
          ? null
          : copyImage(question.image, game === "fogged-vision" ? "" : ""),
    fogged: game === "fogged-vision",
    shopItems: shopItems?.length ? shopItems : null,
    shopFormat: question.shopkeeper?.format ?? null,
    orderCards: orderCards?.length ? orderCards : null,
    effect: game === "aghanim-lab" ? (question.aghanim?.effect ?? null) : null,
    upgradeType: game === "aghanim-lab" ? (question.aghanim?.upgradeType ?? null) : null,
    soundcheckFamily: question.soundcheck?.family ?? null,
    soundcheckFormat: question.soundcheck?.format ?? null,
  };
}

/** @param {{ kind?: string, prompt?: string, image?: { src?: string }, answers?: string[], shopkeeper?: { promptItems?: unknown[] }, valueOrder?: { cards?: unknown[] }, aghanim?: { effect?: string } }[]} questions */
export function formatPreviewsFromQuestions(questions) {
  const chosen = new Map();
  for (const question of questions ?? []) {
    const game = roundGameForFormat(roundFormatForQuestion(question));
    if (!game || chosen.has(game) || !question.prompt) continue;
    chosen.set(game, publicPreviewForQuestion(question, game));
  }
  return Object.fromEntries(LIVE_ROUND_GAMES.map((game) => [game, chosen.get(game) ?? { game, prompt: null }]));
}

/** @param {unknown} preview */
export function formatPreviewLeaksAnswer(preview) {
  if (!preview || typeof preview !== "object") return false;
  const encoded = JSON.stringify(preview);
  return (
    Object.hasOwn(preview, "correctIndex") ||
    Object.hasOwn(preview, "explanation") ||
    Object.hasOwn(preview, "id") ||
    encoded.includes("correctIndex") ||
    encoded.includes("ability-owner:") ||
    encoded.includes("questionId")
  );
}

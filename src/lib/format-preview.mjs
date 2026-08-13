import { LIVE_ROUND_GAMES, roundFormatForQuestion, roundGameForFormat } from "./arcade-games.mjs";

function copyImage(image, alt) {
  if (!image?.src) return null;
  return { src: image.src, alt: alt ?? "" };
}

function publicPreviewForQuestion(question, game) {
  const shopItems = question.shopkeeper?.promptItems?.slice(0, 3).map((item) => ({
    name: item.name,
    image: item.image,
  }));
  const orderCards = question.valueOrder?.cards?.map((card) => ({
    name: card.name,
    image: card.image,
  }));
  const hideArtwork = game === "echo-hunt" || game === "soundcheck" || game === "spell-link";

  return {
    game,
    prompt: question.prompt,
    answers: game === "trivia" && Array.isArray(question.answers) ? [...question.answers] : null,
    image: hideArtwork ? null : copyImage(question.image, game === "fogged-vision" ? "" : ""),
    fogged: game === "fogged-vision",
    shopItems: shopItems?.length ? shopItems : null,
    orderCards: orderCards?.length ? orderCards : null,
    effect: game === "aghanim-lab" ? (question.aghanim?.effect ?? null) : null,
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

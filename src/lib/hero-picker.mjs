export const HERO_PICKER_QUESTION_KINDS = Object.freeze([
  "spell-owner",
  "fogged-hero",
  "hero-voice",
  "hero-quote",
  "aghanim-upgrade",
]);

const HERO_PICKER_KIND_SET = new Set(HERO_PICKER_QUESTION_KINDS);

export function isHeroPickerQuestion(question) {
  return Boolean(question && HERO_PICKER_KIND_SET.has(question.kind));
}

export function heroKeyFromArtwork(src) {
  const slug = typeof src === "string" ? src.match(/\/heroes\/([^/?]+)\.png(?:[?#]|$)/)?.[1] : null;
  return slug ? `npc_dota_hero_${slug}` : null;
}

export function heroCorrectAnswerKey(question) {
  if (!isHeroPickerQuestion(question)) return null;
  const answerArtwork = question.answerImages?.[question.correctIndex];
  const promptArtwork = question.image?.kind === "hero" ? question.image.src : null;
  return heroKeyFromArtwork(answerArtwork ?? promptArtwork);
}

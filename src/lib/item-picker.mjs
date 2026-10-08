import { soundcheckNeedsReviewedChoices } from "./soundcheck-choices.mjs";

const RECIPE_ANSWER_PREFIX = "recipe-v1:";
const MAX_RECIPE_COMPONENTS = 8;

export function recipeAnswerKeyForItems(itemKeys) {
  if (
    !Array.isArray(itemKeys) ||
    itemKeys.length < 1 ||
    itemKeys.length > MAX_RECIPE_COMPONENTS ||
    itemKeys.some((key) => typeof key !== "string" || !/^[a-z0-9_]+$/.test(key))
  ) {
    return null;
  }

  return `${RECIPE_ANSWER_PREFIX}${[...itemKeys].sort().join("+")}`;
}

export function recipeItemsFromAnswerKey(answerKey) {
  if (typeof answerKey !== "string" || !answerKey.startsWith(RECIPE_ANSWER_PREFIX)) return null;
  const itemKeys = answerKey.slice(RECIPE_ANSWER_PREFIX.length).split("+");
  return recipeAnswerKeyForItems(itemKeys) === answerKey ? itemKeys : null;
}

export function isBuildResultItemPickerQuestion(question) {
  return question?.shopkeeper?.format === "build-result" && Boolean(question.shopkeeper.targetItemKey);
}

export function isUpgradePathItemPickerQuestion(question) {
  return question?.shopkeeper?.format === "upgrade-path" && Boolean(question.shopkeeper.targetItemKey);
}

export function isRealRecipeBuilderQuestion(question) {
  return (
    question?.shopkeeper?.format === "real-recipe" &&
    Array.isArray(question.shopkeeper.recipeComponentKeys) &&
    question.shopkeeper.recipeComponentKeys.length > 0
  );
}

export function isSingleItemSoundPickerQuestion(question) {
  return (
    question?.soundcheck?.family === "item" &&
    question.soundcheck.format === "single" &&
    question.soundcheck.clips?.length === 1 &&
    typeof question.soundcheck.clips[0]?.subject === "string" &&
    !soundcheckNeedsReviewedChoices(question.soundcheck.clips[0].subject)
  );
}

export function isItemPickerQuestion(question) {
  return (
    isBuildResultItemPickerQuestion(question) ||
    isUpgradePathItemPickerQuestion(question) ||
    isSingleItemSoundPickerQuestion(question)
  );
}

export function itemPickerCorrectAnswerKey(question) {
  if (isBuildResultItemPickerQuestion(question) || isUpgradePathItemPickerQuestion(question)) {
    return question.shopkeeper.targetItemKey;
  }
  if (isSingleItemSoundPickerQuestion(question)) return question.soundcheck.clips[0].subject;
  return null;
}

export function recipeBuilderCorrectAnswerKey(question) {
  return isRealRecipeBuilderQuestion(question)
    ? recipeAnswerKeyForItems(question.shopkeeper.recipeComponentKeys)
    : null;
}

export function recipeBuilderAnswerIndex(question, answerKey) {
  const itemKeys = recipeItemsFromAnswerKey(answerKey);
  if (
    !isRealRecipeBuilderQuestion(question) ||
    !itemKeys ||
    itemKeys.length !== question.shopkeeper.recipeComponentKeys.length
  ) {
    return null;
  }
  if (answerKey === recipeBuilderCorrectAnswerKey(question)) return question.correctIndex;
  return [0, 1, 2, 3].find((index) => index !== question.correctIndex) ?? null;
}

import type { TriviaQuestion } from "@/lib/trivia";
import { heroAnswerIndex, heroCorrectAnswerKey, isHeroCatalogKey, isHeroPickerQuestion } from "@/lib/hero-picker";
import {
  isItemPickerQuestion,
  isRealRecipeBuilderQuestion,
  isRecipeAnswerKey,
  isShopkeeperCatalogKey,
  itemPickerAnswerIndex,
  itemPickerCorrectAnswerKey,
  recipeBuilderAnswerIndex,
  recipeBuilderCorrectAnswerKey,
  recipeItemsFromAnswerKey,
} from "@/lib/shopkeeper-catalog";

export function isKeyedAnswerQuestion(question: TriviaQuestion) {
  return isItemPickerQuestion(question) || isRealRecipeBuilderQuestion(question) || isHeroPickerQuestion(question);
}

export function isKnownAnswerKey(value: unknown): value is string {
  return isShopkeeperCatalogKey(value) || isRecipeAnswerKey(value) || isHeroCatalogKey(value);
}

export function isValidAnswerKeyForQuestion(question: TriviaQuestion, answerKey: unknown): answerKey is string {
  return isItemPickerQuestion(question)
    ? isShopkeeperCatalogKey(answerKey)
    : isRealRecipeBuilderQuestion(question)
      ? Boolean(
          isRecipeAnswerKey(answerKey) &&
            recipeItemsFromAnswerKey(answerKey)?.length === question.shopkeeper?.recipeComponentKeys?.length,
        )
      : isHeroPickerQuestion(question)
        ? isHeroCatalogKey(answerKey)
        : false;
}

export function keyedAnswerIndex(question: TriviaQuestion, answerKey: string) {
  if (isItemPickerQuestion(question)) return itemPickerAnswerIndex(question, answerKey);
  if (isRealRecipeBuilderQuestion(question)) return recipeBuilderAnswerIndex(question, answerKey);
  if (isHeroPickerQuestion(question)) return heroAnswerIndex(question, answerKey);
  return null;
}

export function correctAnswerKey(question: TriviaQuestion) {
  if (isItemPickerQuestion(question)) return itemPickerCorrectAnswerKey(question);
  if (isRealRecipeBuilderQuestion(question)) return recipeBuilderCorrectAnswerKey(question);
  if (isHeroPickerQuestion(question)) return heroCorrectAnswerKey(question);
  return null;
}

export function isQuestionAnswerCorrect(question: TriviaQuestion, answerIndex: number, answerKey?: string) {
  return isKeyedAnswerQuestion(question)
    ? Boolean(answerKey && answerKey === correctAnswerKey(question))
    : answerIndex === question.correctIndex;
}

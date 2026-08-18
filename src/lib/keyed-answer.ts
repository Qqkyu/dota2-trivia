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
import {
  isValueOrderAnswerForQuestion,
  isValueOrderAnswerKey,
  isValueOrderQuestion,
  valueOrderAnswerIndex,
  valueOrderCorrectAnswerKey,
} from "@/lib/value-order.mjs";
import {
  flashbackOrderAnswerIndex,
  flashbackOrderCorrectAnswerKey,
  flashbackYearAnswerIndex,
  flashbackYearCorrectAnswerKey,
  isFlashbackOrderAnswerForQuestion,
  isFlashbackOrderQuestion,
  isFlashbackYearAnswerForQuestion,
  isFlashbackYearQuestion,
} from "@/lib/flashback.mjs";

export function isKeyedAnswerQuestion(question: TriviaQuestion) {
  return (
    isItemPickerQuestion(question) ||
    isRealRecipeBuilderQuestion(question) ||
    isHeroPickerQuestion(question) ||
    isValueOrderQuestion(question) ||
    isFlashbackOrderQuestion(question) ||
    isFlashbackYearQuestion(question)
  );
}

export function isKnownAnswerKey(value: unknown): value is string {
  return (
    isShopkeeperCatalogKey(value) || isRecipeAnswerKey(value) || isHeroCatalogKey(value) || isValueOrderAnswerKey(value)
  );
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
        : isValueOrderQuestion(question)
          ? isValueOrderAnswerForQuestion(question, answerKey)
          : isFlashbackOrderQuestion(question)
            ? isFlashbackOrderAnswerForQuestion(question, answerKey)
            : isFlashbackYearQuestion(question)
              ? isFlashbackYearAnswerForQuestion(question, answerKey)
              : false;
}

export function keyedAnswerIndex(question: TriviaQuestion, answerKey: string) {
  if (isItemPickerQuestion(question)) return itemPickerAnswerIndex(question, answerKey);
  if (isRealRecipeBuilderQuestion(question)) return recipeBuilderAnswerIndex(question, answerKey);
  if (isHeroPickerQuestion(question)) return heroAnswerIndex(question, answerKey);
  if (isValueOrderQuestion(question)) return valueOrderAnswerIndex(question, answerKey);
  if (isFlashbackOrderQuestion(question)) return flashbackOrderAnswerIndex(question, answerKey);
  if (isFlashbackYearQuestion(question)) return flashbackYearAnswerIndex(question, answerKey);
  return null;
}

export function correctAnswerKey(question: TriviaQuestion) {
  if (isItemPickerQuestion(question)) return itemPickerCorrectAnswerKey(question);
  if (isRealRecipeBuilderQuestion(question)) return recipeBuilderCorrectAnswerKey(question);
  if (isHeroPickerQuestion(question)) return heroCorrectAnswerKey(question);
  if (isValueOrderQuestion(question)) return valueOrderCorrectAnswerKey(question);
  if (isFlashbackOrderQuestion(question)) return flashbackOrderCorrectAnswerKey(question);
  if (isFlashbackYearQuestion(question)) return flashbackYearCorrectAnswerKey(question);
  return null;
}

export function isQuestionAnswerCorrect(question: TriviaQuestion, answerIndex: number, answerKey?: string) {
  return isKeyedAnswerQuestion(question)
    ? Boolean(answerKey && answerKey === correctAnswerKey(question))
    : answerIndex === question.correctIndex;
}

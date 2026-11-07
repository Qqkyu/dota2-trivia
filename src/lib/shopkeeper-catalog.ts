import catalogData from "@/data/shopkeeper-catalog.json";
import type { MessageKey } from "@/i18n/types";
import type { TriviaQuestion } from "@/lib/trivia";
import {
  isBuildResultItemPickerQuestion,
  isItemPickerQuestion as hasItemPickerAnswer,
  isRealRecipeBuilderQuestion as hasRealRecipeBuilderAnswer,
  isUpgradePathItemPickerQuestion,
  itemPickerCorrectAnswerKey as findItemPickerCorrectAnswerKey,
  recipeAnswerKeyForItems as buildRecipeAnswerKey,
  recipeBuilderAnswerIndex as findRecipeBuilderAnswerIndex,
  recipeBuilderCorrectAnswerKey as findRecipeBuilderCorrectAnswerKey,
  recipeItemsFromAnswerKey as parseRecipeAnswerKey,
} from "@/lib/item-picker.mjs";

export interface ShopkeeperCatalogItem {
  key: string;
  name: string;
  image: string;
  cost: number;
}

export interface ShopkeeperCatalogGroup {
  key: string;
  label: string;
  section: "basics" | "upgrades";
  items: ShopkeeperCatalogItem[];
}

export interface ShopkeeperCatalog {
  patch: string;
  clientBuild: string;
  source: string;
  groups: ShopkeeperCatalogGroup[];
}

export const SHOPKEEPER_RECIPE_IMAGE =
  "https://cdn.cloudflare.steamstatic.com/apps/dota2/images/dota_react/items/recipe.png";

/** A group the generator adds later has no message yet, and shows the catalog's English label. */
export const SHOPKEEPER_GROUP_LABEL_KEYS: Partial<Record<string, MessageKey>> = {
  consumables: "round.shop.group.consumables",
  attributes: "round.shop.group.attributes",
  weapons_armor: "round.shop.group.weapons_armor",
  misc: "round.shop.group.misc",
  secretshop: "round.shop.group.secretshop",
  basics: "round.shop.group.basics",
  support: "round.shop.group.support",
  magics: "round.shop.group.magics",
  defense: "round.shop.group.defense",
  weapons: "round.shop.group.weapons",
  artifacts: "round.shop.group.artifacts",
};

export const SHOPKEEPER_CATALOG = catalogData as ShopkeeperCatalog;
export const SHOPKEEPER_CATALOG_ITEMS = SHOPKEEPER_CATALOG.groups.flatMap((group) => group.items);
export const SHOPKEEPER_CATALOG_BY_KEY = new Map(SHOPKEEPER_CATALOG_ITEMS.map((item) => [item.key, item]));

export function isBuildResultQuestion(question: TriviaQuestion) {
  return isBuildResultItemPickerQuestion(question);
}

export function isUpgradePathQuestion(question: TriviaQuestion) {
  return isUpgradePathItemPickerQuestion(question);
}

export function isRealRecipeBuilderQuestion(question: TriviaQuestion) {
  return hasRealRecipeBuilderAnswer(question);
}

export function isItemPickerQuestion(question: TriviaQuestion) {
  return hasItemPickerAnswer(question);
}

export function isShopkeeperCatalogKey(value: unknown): value is string {
  return typeof value === "string" && SHOPKEEPER_CATALOG_BY_KEY.has(value);
}

export function recipeAnswerKeyForItems(itemKeys: string[]) {
  const answerKey = buildRecipeAnswerKey(itemKeys);
  if (!answerKey || itemKeys.some((key) => !isShopkeeperCatalogKey(key))) return null;
  return answerKey;
}

export function recipeItemsFromAnswerKey(answerKey: unknown): string[] | null {
  const itemKeys = parseRecipeAnswerKey(answerKey);
  return itemKeys?.every(isShopkeeperCatalogKey) ? itemKeys : null;
}

export function isRecipeAnswerKey(value: unknown): value is string {
  return recipeItemsFromAnswerKey(value) !== null;
}

export function itemPickerCorrectAnswerKey(question: TriviaQuestion) {
  return findItemPickerCorrectAnswerKey(question) as string | null;
}

export function itemPickerAnswerIndex(question: TriviaQuestion, answerKey: string) {
  if (!isItemPickerQuestion(question) || !isShopkeeperCatalogKey(answerKey)) return null;
  if (answerKey === itemPickerCorrectAnswerKey(question)) return question.correctIndex;
  return [0, 1, 2, 3].find((index) => index !== question.correctIndex) ?? null;
}

export function recipeBuilderCorrectAnswerKey(question: TriviaQuestion) {
  return findRecipeBuilderCorrectAnswerKey(question) as string | null;
}

export function recipeBuilderAnswerIndex(question: TriviaQuestion, answerKey: string) {
  return isRecipeAnswerKey(answerKey) ? findRecipeBuilderAnswerIndex(question, answerKey) : null;
}

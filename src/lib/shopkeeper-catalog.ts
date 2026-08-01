import catalogData from "@/data/shopkeeper-catalog.json";
import type { TriviaQuestion } from "@/lib/trivia";

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

export const SHOPKEEPER_CATALOG = catalogData as ShopkeeperCatalog;
export const SHOPKEEPER_CATALOG_ITEMS = SHOPKEEPER_CATALOG.groups.flatMap((group) => group.items);
export const SHOPKEEPER_CATALOG_BY_KEY = new Map(SHOPKEEPER_CATALOG_ITEMS.map((item) => [item.key, item]));

export function isBuildResultQuestion(question: TriviaQuestion) {
  return question.shopkeeper?.format === "build-result" && Boolean(question.shopkeeper.targetItemKey);
}

export function isShopkeeperCatalogKey(value: unknown): value is string {
  return typeof value === "string" && SHOPKEEPER_CATALOG_BY_KEY.has(value);
}

export function shopkeeperAnswerIndex(question: TriviaQuestion, answerKey: string) {
  if (!isBuildResultQuestion(question) || !isShopkeeperCatalogKey(answerKey)) return null;
  if (answerKey === question.shopkeeper?.targetItemKey) return question.correctIndex;
  return [0, 1, 2, 3].find((index) => index !== question.correctIndex) ?? null;
}

export function isQuestionAnswerCorrect(question: TriviaQuestion, answerIndex: number, answerKey?: string) {
  return isBuildResultQuestion(question)
    ? Boolean(answerKey && answerKey === question.shopkeeper?.targetItemKey)
    : answerIndex === question.correctIndex;
}

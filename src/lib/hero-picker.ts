import catalogData from "@/data/hero-picker.json";
import type { TriviaQuestion } from "@/lib/trivia";
import {
  heroCorrectAnswerKey as findHeroCorrectAnswerKey,
  heroKeyFromArtwork as findHeroKeyFromArtwork,
  isHeroPickerQuestion as hasHeroPickerAnswer,
} from "@/lib/hero-picker.mjs";

export interface HeroPickerHero {
  key: string;
  name: string;
  image: string;
}

export interface HeroPickerGroup {
  key: "strength" | "agility" | "intelligence" | "universal";
  label: string;
  heroes: HeroPickerHero[];
}

export interface HeroPickerCatalog {
  patch: string;
  clientBuild: string;
  source: string;
  columns: number;
  groups: HeroPickerGroup[];
}

export const HERO_PICKER_CATALOG = catalogData as HeroPickerCatalog;
export const HERO_PICKER_HEROES = HERO_PICKER_CATALOG.groups.flatMap((group) => group.heroes);
export const HERO_PICKER_BY_KEY = new Map(HERO_PICKER_HEROES.map((hero) => [hero.key, hero]));

export function heroPickerPortraitSrc(image: string) {
  return image.replace("/dota_react/heroes/", "/dota_react/heroes/icons/");
}

export function preloadHeroPickerPortraits() {
  if (typeof window === "undefined") return;
  const marker = window as Window & { __queueArcadeHeroPreload?: boolean };
  if (marker.__queueArcadeHeroPreload) return;
  marker.__queueArcadeHeroPreload = true;
  for (const hero of HERO_PICKER_HEROES) {
    const img = new Image();
    img.decoding = "async";
    img.src = heroPickerPortraitSrc(hero.image);
  }
}

export function isHeroCatalogKey(value: unknown): value is string {
  return typeof value === "string" && HERO_PICKER_BY_KEY.has(value);
}

export function isHeroPickerQuestion(question: TriviaQuestion) {
  return hasHeroPickerAnswer(question);
}

export function heroKeyFromArtwork(src: string | undefined) {
  return findHeroKeyFromArtwork(src) as string | null;
}

export function heroCorrectAnswerKey(question: TriviaQuestion) {
  return findHeroCorrectAnswerKey(question) as string | null;
}

export function heroAnswerIndex(question: TriviaQuestion, answerKey: string) {
  if (!isHeroPickerQuestion(question) || !isHeroCatalogKey(answerKey)) return null;
  if (answerKey === heroCorrectAnswerKey(question)) return question.correctIndex;
  return [0, 1, 2, 3].find((index) => index !== question.correctIndex) ?? null;
}

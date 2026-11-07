import { en } from "./messages/en";
import type { Translate } from "./translator";
import type { MessageKey } from "./types";

const CATEGORIES = new Set([
  "Abilities",
  "Cooldowns",
  "Damage",
  "Esports",
  "Heroes",
  "History",
  "Items",
  "Mana",
  "Recipes",
]);

/** A catalog category as the player reads it. The demo question's category is already text. */
export function categoryLabel(t: Translate, category: string) {
  return CATEGORIES.has(category) ? t(`category.${category}` as MessageKey) : category;
}

/** A question kind as Calibration Lab shows it. */
export function kindLabel(t: Translate, kind: string) {
  const key = `kind.${kind}`;
  return key in en ? t(key as MessageKey) : kind.replaceAll("-", " ");
}

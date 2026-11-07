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

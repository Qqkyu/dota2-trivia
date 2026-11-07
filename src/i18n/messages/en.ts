import { lobby } from "./lobby";
import { pages } from "./pages";
import { round } from "./round";

/**
 * Every line a player can read. The keys are the contract: `ru.ts` has the same keys, and
 * `tests/i18n.test.mjs` fails on a missing key or a slot that does not match.
 * Plural messages are objects: `{ one: "{count} round", other: "{count} rounds" }`.
 */
export const en = {
  "language.label": "Language",
  "question.hiddenHero": "Hidden hero",
  "question.spellLink": "Spell Link",
  "steam.signIn": "Sign in with Steam",
  "category.Abilities": "Abilities",
  "category.Cooldowns": "Cooldowns",
  "category.Damage": "Damage",
  "category.Esports": "Esports",
  "category.Heroes": "Heroes",
  "category.History": "History",
  "category.Items": "Items",
  "category.Mana": "Mana",
  "category.Recipes": "Recipes",
  ...round,
  ...lobby,
  ...pages,
} as const;

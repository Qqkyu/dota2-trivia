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
  "kind.ability-damage": "ability damage",
  "kind.aghanim-upgrade": "aghanim upgrade",
  "kind.cooldown": "cooldown",
  "kind.flashback-choice": "flashback choice",
  "kind.flashback-order": "flashback order",
  "kind.flashback-year": "flashback year",
  "kind.fogged-hero": "fogged hero",
  "kind.hero-move-speed": "hero move speed",
  "kind.hero-quote": "hero quote",
  "kind.hero-stat-duel": "hero stat duel",
  "kind.hero-voice": "hero voice",
  "kind.item-cost": "item cost",
  "kind.item-price-duel": "item price duel",
  "kind.mana-cost": "mana cost",
  "kind.recipe-component": "recipe component",
  "kind.recipe-upgrade": "recipe upgrade",
  "kind.shopkeeper-build-result": "shopkeeper build result",
  "kind.shopkeeper-real-recipe": "shopkeeper real recipe",
  "kind.shopkeeper-shared-part": "shopkeeper shared part",
  "kind.shopkeeper-upgrade-path": "shopkeeper upgrade path",
  "kind.soundcheck-ability": "soundcheck ability",
  "kind.soundcheck-item": "soundcheck item",
  "kind.spell-owner": "spell owner",
  "kind.value-order-attack-range": "value order attack range",
  "kind.value-order-cooldown": "value order cooldown",
  "kind.value-order-damage": "value order damage",
  "kind.value-order-item": "value order item",
  "kind.value-order-mana": "value order mana",
  "kind.value-order-move-speed": "value order move speed",
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

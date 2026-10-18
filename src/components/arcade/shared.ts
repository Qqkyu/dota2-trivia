import type { CrowdResult } from "@/lib/arcade-contract";
import type { ArcadeMode, RoundGame, ShopkeeperItemReference } from "@/lib/trivia";
import type { ReportReason } from "@/lib/calibration";
import { safeBrowserStorage } from "@/lib/browser-storage.mjs";
import { LIVE_ROUND_GAMES } from "@/lib/arcade-games.mjs";
import { accuracyRate } from "@/lib/dota-flavor.mjs";
import { flashbackYearFromAnswerKey } from "@/lib/flashback.mjs";
import { HERO_PICKER_BY_KEY } from "@/lib/hero-picker";
import { SHOPKEEPER_CATALOG_BY_KEY, recipeItemsFromAnswerKey } from "@/lib/shopkeeper-catalog";
import { valueOrderKeysFromAnswerKey } from "@/lib/value-order.mjs";
import type { PublicArcadeQuestion } from "@/lib/public-question";

export const REVEAL_DURATION_MS = 7_000;
export const ANSWER_DURATION_MS = 15_000;
export const DEFAULT_GAME_VOLUME = 0.7;
export const MIN_GAME_VOLUME = 0.1;
export const LETTERS = ["A", "B", "C", "D"] as const;
export const EMPTY_CROWD: CrowdResult = {
  counts: [0, 0, 0, 0],
  total: 0,
  keyCounts: [],
  scoreSummary: null,
};
export const STORAGE_KEY = "queue-arcade:stats:v2";
export const PLAYER_KEY = "queue-arcade:player:v2";

export function storedPlayerId() {
  if (typeof window === "undefined") return "";
  return safeBrowserStorage("session").getItem(`${PLAYER_KEY}:tab`) ?? "";
}

export function withPlayerId(url: string, playerId = storedPlayerId()) {
  if (!url.startsWith("/api/") || !playerId || url.includes("playerId=")) return url;
  return `${url}${url.includes("?") ? "&" : "?"}playerId=${encodeURIComponent(playerId)}`;
}

export const SETTINGS_KEY = "queue-arcade:settings:v4";
export const PREVIOUS_SETTINGS_KEY = "queue-arcade:settings:v3";
export const LEGACY_STORAGE_KEY = "queue-trivia:stats:v1";
export const LEGACY_SETTINGS_KEY = "queue-trivia:settings:v1";
export const ROUND_GAMES: RoundGame[] = [...LIVE_ROUND_GAMES] as RoundGame[];
export const WAIT_CHOICE_QUESTION: PublicArcadeQuestion = {
  id: "wait-tip-keys",
  game: "trivia",
  kind: "item-cost",
  category: "Items",
  difficulty: 1,
  eyebrow: "Blink Dagger",
  prompt: "How much does Blink Dagger cost?",
  image: {
    src: "https://cdn.cloudflare.steamstatic.com/apps/dota2/images/dota_react/items/blink.png?t=1593393829403",
    alt: "Blink Dagger item icon",
    kind: "item",
  },
  answers: ["2,250 gold", "1,775 gold", "2,600 gold", "2,875 gold"],
  clueStage: 1,
  reveal: null,
};
export const WAIT_HERO_QUESTION: PublicArcadeQuestion = {
  id: "wait-tip-heroes",
  game: "quote-hunt",
  kind: "hero-quote",
  category: "Heroes",
  difficulty: 1,
  eyebrow: "Hero grid",
  prompt: "Type a hero name.",
  answers: ["", "", "", ""],
  answerMode: "hero-grid",
  clueStage: 1,
  reveal: null,
};
export const WAIT_SHOP_QUESTION: PublicArcadeQuestion = {
  id: "wait-tip-shop",
  game: "shopkeeper",
  kind: "shopkeeper-build-result",
  category: "Recipes",
  difficulty: 1,
  eyebrow: "Shop",
  prompt: "Search items.",
  answers: ["", "", "", ""],
  answerMode: "item-grid",
  clueStage: 1,
  reveal: null,
};
export const PREVIEW_QUESTION: PublicArcadeQuestion = {
  id: "preview",
  game: "trivia",
  kind: "cooldown",
  category: "Abilities",
  difficulty: 2,
  eyebrow: "Endless rotation",
  prompt: "The next round could be anything.",
  image: {
    src: "https://cdn.cloudflare.steamstatic.com/apps/dota2/images/dota_react/abilities/lina_dragon_slave.png",
    alt: "Dota ability artwork",
    kind: "ability",
  },
  answers: ["", "", "", ""],
  clueStage: 1,
  reveal: null,
};

export type GamePhase = "lobby" | "waiting" | "answering" | "reveal";

export interface RoundAward {
  points: number;
  majorityBonus: boolean;
  correct: boolean;
  speedBonus: number;
  cluePenalty: number;
}

export interface RoundRecord {
  id: string;
  category: PublicArcadeQuestion["category"];
  game: RoundGame;
  correct: boolean;
  points: number;
}

export interface QuestionReportTarget {
  roundId: string;
  prompt: string;
  answer: string;
  expiresAt: number;
}

export interface QuestionReportNotice {
  reason: ReportReason;
  expiresAt: number;
}

export interface LifetimeStats {
  runs: number;
  answered: number;
  correct: number;
  bestScore: number;
}

export const EMPTY_STATS: LifetimeStats = {
  runs: 0,
  answered: 0,
  correct: 0,
  bestScore: 0,
};

export const MODE_INFO: Record<
  ArcadeMode,
  {
    label: string;
    shortLabel: string;
    eyebrow: string;
    description: string;
    action: string;
  }
> = {
  mixed: {
    label: "Queue Arcade",
    shortLabel: "Public Arcade",
    eyebrow: "One room · Endless",
    description: "Dota facts, recipes, spells, history, TI, fog, voices, sounds, and quotes—one round at a time.",
    action: "Play Dota",
  },
  trivia: {
    label: "Classic Trivia",
    shortLabel: "Classic Trivia",
    eyebrow: "The original",
    description: "Mana, damage, cooldowns, heroes, and items—the classic global-results loop.",
    action: "Enter classic trivia",
  },
  shopkeeper: {
    label: "Shopkeeper Rush",
    shortLabel: "Shopkeeper",
    eyebrow: "Recipe knowledge",
    description: "Build items, spot exact recipes, find shared parts, and trace direct upgrades.",
    action: "Open the secret shop",
  },
  "spell-link": {
    label: "Spell Link",
    shortLabel: "Spell Link",
    eyebrow: "Icon recognition",
    description: "Match an ability to its hero from mechanics, name, and icon.",
    action: "Link some spells",
  },
  "fogged-vision": {
    label: "Fogged Vision",
    shortLabel: "Fogged",
    eyebrow: "Progressive reveal",
    description: "Recognize a hero through heavy fog before the portrait sharpens and the easy points disappear.",
    action: "Enter the fog",
  },
  "echo-hunt": {
    label: "Echo Hunt",
    shortLabel: "Echo",
    eyebrow: "Hero voices",
    description: "Identify a hero response as its opening fragment grows into a longer line.",
    action: "Hunt some echoes",
  },
  soundcheck: {
    label: "Soundcheck",
    shortLabel: "Soundcheck",
    eyebrow: "Audio recognition",
    description: "Identify real effects and item activations as short audio cuts grow longer.",
    action: "Enter soundcheck",
  },
  "quote-hunt": {
    label: "Quote Hunt",
    shortLabel: "Quotes",
    eyebrow: "Hero responses",
    description: "Read a real hero response and identify the speaker from their attitude, diction, and worldview.",
    action: "Read between the lines",
  },
  "aghanim-lab": {
    label: "Aghanim's Lab",
    shortLabel: "Aghanim's Lab",
    eyebrow: "Upgrade knowledge",
    description: "Match current Scepter and Shard effects to their heroes before the ability name appears.",
    action: "Enter the lab",
  },
  "order-up": {
    label: "Order Up",
    shortLabel: "Order Up",
    eyebrow: "Sort the facts",
    description: "Put four audited items or abilities in the right order before the clock runs out.",
    action: "Sort the cards",
  },
  flashback: {
    label: "Flashback",
    shortLabel: "Flashback",
    eyebrow: "History and TI",
    description: "Years, champions, cities, and the old map—nostalgia in 15 seconds.",
    action: "Open the archives",
  },
};

export function gameLabel(game: RoundGame) {
  return MODE_INFO[game].label;
}

export function accuracy(correct: number, answered: number) {
  return accuracyRate(correct, answered);
}

export function shopkeeperReferencesForKeys(itemKeys: string[]): ShopkeeperItemReference[] {
  const references: ShopkeeperItemReference[] = [];
  const referenceByKey = new Map<string, ShopkeeperItemReference>();

  for (const itemKey of itemKeys) {
    const item = SHOPKEEPER_CATALOG_BY_KEY.get(itemKey);
    if (!item) continue;
    const existing = referenceByKey.get(itemKey);
    if (existing) {
      existing.count += 1;
      continue;
    }
    const reference = { key: item.key, name: item.name, image: item.image, count: 1 };
    referenceByKey.set(itemKey, reference);
    references.push(reference);
  }

  return references;
}

export function valueOrderAnswerLabel(question: PublicArcadeQuestion, answerKey: string) {
  const keys = valueOrderKeysFromAnswerKey(answerKey);
  if (!keys || !question.valueOrder) return null;
  const cardByKey = new Map(question.valueOrder.cards.map((card) => [card.key, card]));
  const cards = keys.map((key) => cardByKey.get(key));
  return cards.every(Boolean) ? cards.map((card) => card?.name).join(" → ") : null;
}

export function keyedAnswerLabel(answerKey: string, fallback: string, question?: PublicArcadeQuestion) {
  const year = flashbackYearFromAnswerKey(answerKey);
  if (year !== null) return String(year);
  const recipeItems = recipeItemsFromAnswerKey(answerKey);
  if (recipeItems) {
    return shopkeeperReferencesForKeys(recipeItems)
      .map((item) => `${item.name}${item.count > 1 ? ` ×${item.count}` : ""}`)
      .join(", ");
  }
  if (question) {
    const orderLabel = valueOrderAnswerLabel(question, answerKey);
    if (orderLabel) return orderLabel;
  }
  return SHOPKEEPER_CATALOG_BY_KEY.get(answerKey)?.name ?? HERO_PICKER_BY_KEY.get(answerKey)?.name ?? fallback;
}

export type PublicValueOrderCard = NonNullable<PublicArcadeQuestion["valueOrder"]>["cards"][number];
export const EMPTY_VALUE_ORDER_CARDS: PublicValueOrderCard[] = [];
export const EMPTY_FLASHBACK_ORDER_CARDS: NonNullable<NonNullable<PublicArcadeQuestion["flashback"]>["cards"]> = [];

export function classicQuestionContext(question: PublicArcadeQuestion) {
  if (question.kind !== "ability-detective") return null;
  return question.eyebrow.split("·", 1)[0]?.trim() || null;
}

export function shopkeeperAnswerAction(question: PublicArcadeQuestion) {
  if (question.shopkeeper?.format === "build-result") return "Choose the finished item";
  if (question.shopkeeper?.format === "real-recipe") {
    const cost = question.shopkeeper.recipeCost;
    return cost === 0
      ? "Pick the shop items. No recipe required."
      : typeof cost === "number" && cost > 0
        ? "Pick the shop items. Recipe is included."
        : "Pick the shop items.";
  }
  if (question.shopkeeper?.format === "shared-part") return "Choose the shared component";
  return "Choose the direct upgrade";
}

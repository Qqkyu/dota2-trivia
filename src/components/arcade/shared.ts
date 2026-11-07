import type { CrowdResult } from "@/lib/arcade-contract";
import type { Translate } from "@/i18n/translator";
import type { MessageKey } from "@/i18n/types";
import type { RoundGame, ShopkeeperItemReference } from "@/lib/trivia";
import type { ReportReason } from "@/lib/calibration";
import { safeBrowserStorage } from "@/lib/browser-storage.mjs";
import { LIVE_ROUND_GAMES } from "@/lib/arcade-games.mjs";
import { accuracyRate } from "@/lib/dota-flavor.mjs";
import { flashbackYearFromAnswerKey } from "@/lib/flashback.mjs";
import { HERO_PICKER_BY_KEY } from "@/lib/hero-picker";
import { SHOPKEEPER_CATALOG_BY_KEY, recipeItemsFromAnswerKey } from "@/lib/shopkeeper-catalog";
import { orderCardsForAnswerKey } from "@/lib/value-order.mjs";
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
  // Art is the same for everyone: it never needs the player ID.
  if (!url.startsWith("/api/") || url.startsWith("/api/art/") || !playerId || url.includes("playerId=")) return url;
  return `${url}${url.includes("?") ? "&" : "?"}playerId=${encodeURIComponent(playerId)}`;
}

export const SETTINGS_KEY = "queue-arcade:settings:v4";
export const PREVIOUS_SETTINGS_KEY = "queue-arcade:settings:v3";
export const LEGACY_STORAGE_KEY = "queue-trivia:stats:v1";
export const LEGACY_SETTINGS_KEY = "queue-trivia:settings:v1";
export const ROUND_GAMES: RoundGame[] = [...LIVE_ROUND_GAMES] as RoundGame[];
export function waitChoiceQuestion(t: Translate, number: (value: number) => string): PublicArcadeQuestion {
  const gold = (amount: number) => t("wait.demo.gold", { amount: number(amount) });
  return {
    id: "wait-tip-keys",
    game: "trivia",
    kind: "item-cost",
    category: t("wait.demo.category") as PublicArcadeQuestion["category"],
    difficulty: 1,
    eyebrow: "Blink Dagger",
    prompt: t("wait.demo.prompt"),
    image: {
      src: "https://cdn.cloudflare.steamstatic.com/apps/dota2/images/dota_react/items/blink.png?t=1593393829403",
      alt: t("wait.demo.imageAlt"),
      kind: "item",
    },
    answers: [gold(2_250), gold(1_775), gold(2_600), gold(2_875)],
    clueStage: 1,
    reveal: null,
  };
}
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

/** What the lobby knows about the live room: the clock and the format, never a question. */
export interface LobbyPulse {
  round: {
    number: number;
    game: RoundGame;
    phase: "answering" | "reveal";
    answerDeadline: number;
    revealDeadline: number;
    answerDuration: number;
    nextGame: RoundGame | null;
  } | null;
  /** The server clock when this pulse was produced; rendered as-is until the client ticks. */
  serverNow: number;
  serverOffset: number;
}

/** What the server sends: the page embeds one of these so the first paint has the real clock. */
export interface LobbyPulsePayload {
  activePlayers: number;
  serverNow: number;
  round: LobbyPulse["round"];
}

export function lobbyPulseFromPayload(payload: LobbyPulsePayload): LobbyPulse {
  return {
    round: payload.round,
    serverNow: payload.serverNow,
    serverOffset: payload.serverNow - Date.now(),
  };
}

export function normalizeLobbyPulse(payload: unknown): LobbyPulse | null {
  if (!payload || typeof payload !== "object" || !("serverNow" in payload) || typeof payload.serverNow !== "number") {
    return null;
  }
  const serverNow = payload.serverNow;
  const serverOffset = serverNow - Date.now();
  const round = "round" in payload ? payload.round : null;
  if (!round || typeof round !== "object") return { round: null, serverNow, serverOffset };
  const candidate = round as Record<string, unknown>;
  const numbers = ["number", "answerDeadline", "revealDeadline", "answerDuration"] as const;
  if (
    !numbers.every((key) => typeof candidate[key] === "number" && Number.isFinite(candidate[key])) ||
    (candidate.phase !== "answering" && candidate.phase !== "reveal") ||
    typeof candidate.game !== "string" ||
    !(ROUND_GAMES as readonly string[]).includes(candidate.game)
  ) {
    return { round: null, serverNow, serverOffset };
  }
  return {
    round: {
      number: candidate.number as number,
      game: candidate.game as RoundGame,
      phase: candidate.phase,
      answerDeadline: candidate.answerDeadline as number,
      revealDeadline: candidate.revealDeadline as number,
      answerDuration: candidate.answerDuration as number,
      nextGame:
        typeof candidate.nextGame === "string" && (ROUND_GAMES as readonly string[]).includes(candidate.nextGame)
          ? (candidate.nextGame as RoundGame)
          : null,
    },
    serverNow,
    serverOffset,
  };
}

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
  return (
    orderCardsForAnswerKey(question, answerKey)
      ?.map((card: { name: string }) => card.name)
      .join(" → ") ?? null
  );
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

export function shopkeeperAnswerAction(question: PublicArcadeQuestion): MessageKey {
  if (question.shopkeeper?.format === "build-result") return "shopAction.finishedItem";
  if (question.shopkeeper?.format === "real-recipe") {
    const cost = question.shopkeeper.recipeCost;
    return cost === 0
      ? "shopAction.recipeNotNeeded"
      : typeof cost === "number" && cost > 0
        ? "shopAction.recipeIncluded"
        : "shopAction.pickItems";
  }
  if (question.shopkeeper?.format === "shared-part") return "shopAction.sharedPart";
  return "shopAction.directUpgrade";
}

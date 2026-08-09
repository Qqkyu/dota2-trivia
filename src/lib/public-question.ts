import type {
  CounterplayFamily,
  CounterplayFormat,
  QuestionKind,
  RoundGame,
  ShopkeeperFormat,
  ShopkeeperItemReference,
  TriviaArtworkKind,
  TriviaCategory,
  TriviaQuestion,
  ValueOrderCard,
} from "@/lib/trivia";
import type { MapChallenge } from "@/lib/map-types";
import {
  publicQuestionForRound as buildPublicQuestion,
  publicQuestionRevision as buildPublicQuestionRevision,
} from "@/lib/public-question.mjs";

export interface PublicQuestionReveal {
  correctIndex: number;
  explanation: string;
  correctAnswerKey?: string;
  orderValues?: Array<{ key: string; label: string }>;
}

export interface PublicArcadeQuestion {
  id: string;
  game: RoundGame;
  kind: QuestionKind;
  category: TriviaCategory;
  difficulty: 1 | 2 | 3;
  eyebrow: string;
  prompt: string;
  image?: {
    src: string;
    alt: string;
    kind: TriviaArtworkKind;
  };
  answers: [string, string, string, string];
  answerMode?: "hero-grid" | "item-grid" | "item-recipe" | "value-order";
  answerImages?: [string, string, string, string];
  answerImagePairs?: [[string, string], [string, string], [string, string], [string, string]];
  answerImageKind?: TriviaArtworkKind;
  detail?: string;
  hint?: string;
  quoteHints?: string[];
  audio?: {
    src: string;
    clips?: string[];
  };
  soundcheck?: {
    family: "ability" | "item";
    format: "single" | "sequence";
    choiceScope: "recognizable" | "same-hero" | "active-items" | "ordered-pair";
    clips: Array<{ duration: number }>;
  };
  valueOrder?: {
    family:
      | "item-price"
      | "ability-cooldown"
      | "ability-mana"
      | "ability-damage"
      | "hero-move-speed"
      | "hero-attack-range";
    direction: "ascending";
    cards: ValueOrderCard[];
  };
  shopkeeper?: {
    format?: ShopkeeperFormat;
    promptItems?: ShopkeeperItemReference[];
    recipeSize?: number;
    answerGroups?: [
      ShopkeeperItemReference[],
      ShopkeeperItemReference[],
      ShopkeeperItemReference[],
      ShopkeeperItemReference[],
    ];
  };
  counterplay?: {
    family: CounterplayFamily;
    tool: string;
    format: CounterplayFormat;
    note?: string;
    toolImages?: Array<{
      src: string;
      alt: string;
      label: string;
      kind: "item";
    }>;
  };
  // Map Sense is archived. Keeping the optional render type prevents its UI
  // from becoming a separate migration, while the serializer refuses to send
  // map questions until they have a target-safe contract.
  map?: MapChallenge;
  patch: string;
  clueStage: 1 | 2 | 3;
  reveal: PublicQuestionReveal | null;
}

interface PublicQuestionRound {
  id: string;
  phase: "answering" | "reveal";
  game: RoundGame;
  answerDeadline: number;
  answerDuration: number;
}

export function publicQuestionForRound(
  question: TriviaQuestion,
  round: PublicQuestionRound,
  now: number,
): PublicArcadeQuestion {
  return buildPublicQuestion(question, round, now) as PublicArcadeQuestion;
}

export function publicQuestionRevision(round: PublicQuestionRound, now: number): string {
  return buildPublicQuestionRevision(round, now);
}

export function isPublicBuildResultQuestion(question: PublicArcadeQuestion) {
  return question.answerMode === "item-grid";
}

export function isPublicRecipeBuilderQuestion(question: PublicArcadeQuestion) {
  return question.answerMode === "item-recipe";
}

export function isPublicHeroPickerQuestion(question: PublicArcadeQuestion) {
  return question.answerMode === "hero-grid";
}

export function isPublicValueOrderQuestion(question: PublicArcadeQuestion) {
  return question.answerMode === "value-order";
}

export function isPublicKeyedAnswerQuestion(question: PublicArcadeQuestion) {
  return (
    question.answerMode === "item-grid" ||
    question.answerMode === "item-recipe" ||
    question.answerMode === "hero-grid" ||
    question.answerMode === "value-order"
  );
}

export function publicCorrectIndex(question: PublicArcadeQuestion) {
  return question.reveal?.correctIndex ?? -1;
}

export function isPublicQuestionAnswerCorrect(question: PublicArcadeQuestion, answerIndex: number, answerKey?: string) {
  if (!question.reveal) return false;
  return isPublicKeyedAnswerQuestion(question)
    ? Boolean(answerKey && answerKey === question.reveal.correctAnswerKey)
    : answerIndex === question.reveal.correctIndex;
}

export function isPublicArcadeQuestion(value: unknown): value is PublicArcadeQuestion {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<PublicArcadeQuestion>;
  const reveal = candidate.reveal;
  return Boolean(
    typeof candidate.id === "string" &&
      typeof candidate.game === "string" &&
      typeof candidate.kind === "string" &&
      typeof candidate.category === "string" &&
      (candidate.difficulty === 1 || candidate.difficulty === 2 || candidate.difficulty === 3) &&
      typeof candidate.eyebrow === "string" &&
      typeof candidate.prompt === "string" &&
      Array.isArray(candidate.answers) &&
      candidate.answers.length === 4 &&
      candidate.answers.every((answer) => typeof answer === "string") &&
      (candidate.answerMode === undefined ||
        candidate.answerMode === "hero-grid" ||
        candidate.answerMode === "item-grid" ||
        candidate.answerMode === "item-recipe" ||
        candidate.answerMode === "value-order") &&
      (candidate.answerMode !== "item-recipe" || candidate.shopkeeper?.recipeSize !== undefined) &&
      (candidate.shopkeeper?.recipeSize === undefined ||
        (Number.isInteger(candidate.shopkeeper.recipeSize) &&
          candidate.shopkeeper.recipeSize >= 1 &&
          candidate.shopkeeper.recipeSize <= 8)) &&
      (candidate.answerMode !== "value-order" ||
        (Array.isArray(candidate.valueOrder?.cards) &&
          candidate.valueOrder.cards.length === 4 &&
          new Set(candidate.valueOrder.cards.map((card) => card.key)).size === 4 &&
          candidate.valueOrder.cards.every(
            (card) =>
              typeof card.key === "string" &&
              typeof card.name === "string" &&
              typeof card.image === "string" &&
              (card.kind === "item" || card.kind === "ability" || card.kind === "hero"),
          ))) &&
      (candidate.quoteHints === undefined ||
        (Array.isArray(candidate.quoteHints) &&
          candidate.quoteHints.length <= 2 &&
          candidate.quoteHints.every((hint) => typeof hint === "string" && hint.length > 0))) &&
      (candidate.answerMode !== "value-order" ||
        reveal === null ||
        (typeof reveal?.correctAnswerKey === "string" &&
          Array.isArray(reveal.orderValues) &&
          reveal.orderValues.length === 4 &&
          reveal.orderValues.every(
            (entry) => typeof entry.key === "string" && typeof entry.label === "string" && entry.label.length > 0,
          ))) &&
      typeof candidate.patch === "string" &&
      (candidate.clueStage === 1 || candidate.clueStage === 2 || candidate.clueStage === 3) &&
      (reveal === null ||
        (Boolean(reveal) &&
          typeof reveal?.correctIndex === "number" &&
          Number.isInteger(reveal.correctIndex) &&
          reveal.correctIndex >= 0 &&
          reveal.correctIndex <= 3 &&
          typeof reveal.explanation === "string")),
  );
}

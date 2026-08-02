import generatedQuestions from "@/data/questions.generated.json";
import shopkeeperQuestions from "@/data/shopkeeper-questions.json";
import generatedMeta from "@/data/trivia-meta.generated.json";
import soundcheckQuestions from "@/data/soundcheck-questions.json";
import {
  PUBLIC_ROUND_FORMATS,
  publicRoundFormatOccurrenceCounts,
  publicRoundFormatRotation,
  roundFormatForQuestion,
} from "@/lib/arcade-games.mjs";
import type { MapChallenge } from "@/lib/map-types";
import { isPlayableShopkeeperQuestion } from "@/lib/shopkeeper-quality.mjs";
import { isPlayableClassicTriviaQuestion } from "@/lib/classic-trivia-quality.mjs";
import { varietyShuffle } from "@/lib/variety.mjs";

export const KNOWLEDGE_FILTERS = ["Mixed", "Abilities", "Items", "Heroes"] as const;

export type KnowledgeFilter = (typeof KNOWLEDGE_FILTERS)[number];
export type TriviaCategory =
  | "Abilities"
  | "Cooldowns"
  | "Damage"
  | "Recipes"
  | "Items"
  | "Mana"
  | "Heroes"
  | "Map"
  | "Mechanics";
export type ArcadeMode =
  | "mixed"
  | "trivia"
  | "shopkeeper"
  | "spell-link"
  | "fogged-vision"
  | "echo-hunt"
  | "soundcheck"
  | "quote-hunt"
  | "map-sense"
  | "counterplay";
export type RoundGame = Exclude<ArcadeMode, "mixed">;
export type QuestionKind =
  | "spell-owner"
  | "mana-cost"
  | "cooldown"
  | "ability-damage"
  | "hero-primary-attribute"
  | "hero-move-speed"
  | "item-cost"
  | "recipe-component"
  | "shopkeeper-build-result"
  | "shopkeeper-real-recipe"
  | "shopkeeper-shared-part"
  | "shopkeeper-upgrade-path"
  | "hero-stat-duel"
  | "hero-intruder"
  | "ability-detective"
  | "recipe-upgrade"
  | "item-price-duel"
  | "fogged-hero"
  | "hero-voice"
  | "hero-quote"
  | "soundcheck-ability"
  | "soundcheck-item"
  | "map-location"
  | "map-riddle"
  | "map-mirror"
  | "map-relative"
  | "map-scenario"
  | "map-crop"
  | "map-camp-block"
  | "map-stack-route"
  | "map-tp-in"
  | "counterplay-immunity"
  | "counterplay-basic-dispel"
  | "counterplay-strong-dispel"
  | "counterplay-nullifier"
  | "counterplay-spell-block"
  | "counterplay-spell-reflect";
export type TriviaArtworkKind = "ability" | "hero" | "item";
export type CounterplayFamily =
  | "debuff-immunity"
  | "basic-dispel"
  | "strong-dispel"
  | "offensive-dispel"
  | "spell-block"
  | "spell-reflect";

export type CounterplayFormat = "constant-matchup" | "curated-exception" | "interaction-scenario";
export type ShopkeeperFormat = "build-result" | "real-recipe" | "shared-part" | "upgrade-path";

export interface ShopkeeperItemReference {
  key: string;
  name: string;
  image: string;
  count: number;
}

export interface TriviaQuestion {
  id: string;
  kind: QuestionKind;
  varietyKey?: string;
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
  answerImages?: [string, string, string, string];
  answerImagePairs?: [[string, string], [string, string], [string, string], [string, string]];
  answerImageKind?: TriviaArtworkKind;
  correctIndex: number;
  explanation: string;
  detail?: string;
  hint?: string;
  quoteHints?: [string, string];
  audio?: {
    src: string;
    clips?: string[];
  };
  soundcheck?: {
    family: "ability" | "item";
    format: "single" | "sequence";
    choiceScope: "recognizable" | "same-hero" | "active-items" | "ordered-pair";
    clips: Array<{
      subject: string;
      event: string;
      eventFile: string;
      duration: number;
    }>;
    audit: {
      reviewedAt: string;
      clientBuild: string;
    };
  };
  shopkeeper?: {
    format?: ShopkeeperFormat;
    targetItemKey?: string;
    targetItemKeys?: [string, string];
    sourceItemKey?: string;
    sharedComponentKey?: string;
    componentKey?: string;
    promptItems?: ShopkeeperItemReference[];
    recipeComponentKeys?: string[];
    targetRecipeKeys?: [string[], string[]];
    answerItemKeys?: [string, string, string, string];
    answerRecipeKeys?: [string[], string[], string[], string[]];
    answerIngredientKeys?: [string[], string[], string[], string[]];
    answerGroups?: [
      ShopkeeperItemReference[],
      ShopkeeperItemReference[],
      ShopkeeperItemReference[],
      ShopkeeperItemReference[],
    ];
    answerCosts?: [number, number, number, number];
    clientBuild: string;
  };
  counterplay?: {
    family: CounterplayFamily;
    tool: string;
    outcomes: [boolean, boolean, boolean, boolean];
    format: CounterplayFormat;
    note?: string;
    toolImages?: Array<{
      src: string;
      alt: string;
      label: string;
      kind: "item";
    }>;
    targetedOptions?: [boolean, boolean, boolean, boolean];
    audit: {
      reviewedAt: string;
      clientBuild: string;
      rule: string;
    };
  };
  map?: MapChallenge;
  source: {
    label: string;
    url: string;
  };
  patch: string;
}

export interface TriviaMeta {
  patch: string;
  contentVersion: string;
  snapshotDate: string;
  questionCount: number;
  categoryCounts: Partial<Record<TriviaCategory, number>>;
  kindCounts: Partial<Record<QuestionKind, number>>;
  assetValidation: {
    checkedAt: string;
    verifiedAssetCount: number;
    verifiedAudioCount: number;
    rejectedQuestionIds: string[];
  };
}

export const triviaMeta = generatedMeta as unknown as TriviaMeta;
export const ARCADE_CONTENT_VERSION = `${triviaMeta.contentVersion}-classic-trivia-5-shopkeeper-5-public-arcade-2-soundcheck-9-fogged-vision-3`;
const playableGeneratedQuestions = (generatedQuestions as TriviaQuestion[]).filter(
  (question) =>
    isPlayableClassicTriviaQuestion(question) &&
    (question.kind !== "spell-owner" ||
      ((question.hint?.trim().length ?? 0) >= 18 && !question.hint?.startsWith("No additional mechanical clue"))) &&
    isPlayableShopkeeperQuestion(question),
);
export const triviaQuestions = [
  ...playableGeneratedQuestions,
  ...(shopkeeperQuestions as TriviaQuestion[]).filter(isPlayableShopkeeperQuestion),
  ...(soundcheckQuestions as unknown as TriviaQuestion[]),
];

export interface ArcadeRound extends TriviaQuestion {
  game: RoundGame;
}

function sharedKnowledgeFilter(filter: KnowledgeFilter): KnowledgeFilter {
  void filter;
  return "Mixed";
}

export function createQuestionDeck(seed: string, filter: KnowledgeFilter) {
  const roomFilter = sharedKnowledgeFilter(filter);
  const pool = triviaQuestions.filter((question) => gameForQuestion(question) === "trivia");
  return varietyShuffle(pool, `${seed}:${roomFilter}:${ARCADE_CONTENT_VERSION}`);
}

export function gameForQuestion(question: TriviaQuestion): RoundGame {
  if (question.kind.startsWith("shopkeeper-")) return "shopkeeper";
  if (question.kind === "spell-owner") return "spell-link";
  if (question.kind === "fogged-hero") return "fogged-vision";
  if (question.kind === "hero-voice") return "echo-hunt";
  if (question.kind.startsWith("soundcheck-")) return "soundcheck";
  if (question.kind === "hero-quote") return "quote-hunt";
  if (question.kind.startsWith("map-")) return "map-sense";
  if (question.kind.startsWith("counterplay-")) return "counterplay";
  return "trivia";
}

function shuffledPool(seed: string, game: RoundGame, filter: KnowledgeFilter) {
  const roomFilter = sharedKnowledgeFilter(filter);
  const pool = triviaQuestions.filter((question) => gameForQuestion(question) === game);
  return varietyShuffle(pool, `${seed}:${game}:${roomFilter}:${ARCADE_CONTENT_VERSION}`);
}

export function createArcadeDeck(
  seed: string,
  mode: ArcadeMode,
  filter: KnowledgeFilter,
  length = 10,
  rotationSeed = seed,
  roundOffset = 0,
) {
  if (mode === "mixed") {
    const formats = publicRoundFormatRotation(length, roundOffset);
    const cursors = publicRoundFormatOccurrenceCounts(roundOffset);
    const pools = new Map(
      PUBLIC_ROUND_FORMATS.map((format) => [
        format,
        varietyShuffle(
          triviaQuestions.filter((question) => roundFormatForQuestion(question) === format),
          `${seed}:format:${format}:${sharedKnowledgeFilter(filter)}:${ARCADE_CONTENT_VERSION}`,
        ),
      ]),
    );

    return formats.flatMap((format) => {
      const pool = pools.get(format) ?? [];
      const cursor = cursors.get(format) ?? 0;
      const question = pool.length ? pool[cursor % pool.length] : undefined;
      cursors.set(format, cursor + 1);
      return question ? [{ ...question, game: gameForQuestion(question) }] : [];
    });
  }

  const gamePools = {
    trivia: shuffledPool(seed, "trivia", filter),
    shopkeeper: shuffledPool(seed, "shopkeeper", filter),
    "spell-link": shuffledPool(seed, "spell-link", filter),
    "fogged-vision": shuffledPool(seed, "fogged-vision", filter),
    "echo-hunt": shuffledPool(seed, "echo-hunt", filter),
    soundcheck: shuffledPool(seed, "soundcheck", filter),
    "quote-hunt": shuffledPool(seed, "quote-hunt", filter),
    "map-sense": shuffledPool(seed, "map-sense", filter),
    counterplay: shuffledPool(seed, "counterplay", filter),
  };
  const games = Array.from({ length }, () => mode);
  const cursors: Record<RoundGame, number> = {
    trivia: 0,
    shopkeeper: 0,
    "spell-link": 0,
    "fogged-vision": 0,
    "echo-hunt": 0,
    soundcheck: 0,
    "quote-hunt": 0,
    "map-sense": 0,
    counterplay: 0,
  };
  void rotationSeed;
  cursors[mode] = Math.max(0, roundOffset);

  return games.flatMap((game) => {
    const pool = gamePools[game];
    const question = pool.length ? pool[cursors[game] % pool.length] : undefined;
    cursors[game] += 1;
    return question ? [{ ...question, game }] : [];
  });
}

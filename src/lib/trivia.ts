import generatedQuestions from "@/data/questions.generated.json";
import aghanimQuestions from "@/data/aghanim-questions.json";
import shopkeeperQuestions from "@/data/shopkeeper-questions.json";
import generatedMeta from "@/data/trivia-meta.generated.json";
import soundcheckQuestions from "@/data/soundcheck-questions.json";
import valueOrderQuestions from "@/data/value-order-questions.json";
import flashbackQuestions from "@/data/flashback-questions.json";
import { livePublicRoundFormats, roundFormatForQuestion } from "@/lib/arcade-games.mjs";
import { isPlayableFlashbackQuestion } from "@/lib/flashback.mjs";
import type { MapChallenge } from "@/lib/map-types";
import { isPlayableShopkeeperQuestion } from "@/lib/shopkeeper-quality.mjs";
import { isPlayableClassicTriviaQuestion } from "@/lib/classic-trivia-quality.mjs";
import { createSemanticPublicDeck } from "@/lib/semantic-schedule.mjs";
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
  | "Mechanics"
  | "History"
  | "Esports";
export type ArcadeMode =
  | "mixed"
  | "trivia"
  | "shopkeeper"
  | "spell-link"
  | "fogged-vision"
  | "echo-hunt"
  | "soundcheck"
  | "quote-hunt"
  | "aghanim-lab"
  | "order-up"
  | "flashback"
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
  | "aghanim-upgrade"
  | "soundcheck-ability"
  | "soundcheck-item"
  | "value-order-item"
  | "value-order-cooldown"
  | "value-order-mana"
  | "value-order-damage"
  | "value-order-move-speed"
  | "value-order-attack-range"
  | "flashback-year"
  | "flashback-choice"
  | "flashback-order"
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

export interface ValueOrderCard {
  key: string;
  name: string;
  context?: string;
  image: string;
  kind: "item" | "ability" | "hero";
}

export interface ValueOrderValue {
  key: string;
  value: number;
  label: string;
}

export interface AghanimUpgrade {
  effect: string;
  upgradeType: "scepter" | "shard";
  upgradeMode: "new" | "existing";
  abilityName: string;
  audit: {
    clientAbilityKey: string;
    clientBuild: string;
    reviewedAt: string;
  };
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
      audioSha256: string;
    }>;
    audit: {
      reviewedAt: string;
      clientBuild: string;
    };
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
    cards: [ValueOrderCard, ValueOrderCard, ValueOrderCard, ValueOrderCard];
    values: [ValueOrderValue, ValueOrderValue, ValueOrderValue, ValueOrderValue];
    correctOrder: [string, string, string, string];
    audit: {
      derivedFrom: [string, string, string, string];
      clientBuild: string;
    };
  };
  flashback?: {
    family: "year" | "choice" | "order";
    subject?: string;
    correctYear?: number;
    cards?: Array<{ key: string; name: string; context?: string; image?: string }>;
    correctOrder?: [string, string, string, string];
    revealMedia?: {
      src: string;
      alt: string;
      caption?: string;
      kind?: "photo" | "mark";
    };
  };
  aghanim?: AghanimUpgrade;
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
export const ARCADE_CONTENT_VERSION = `${triviaMeta.contentVersion}-classic-trivia-5-shopkeeper-6-public-arcade-4-soundcheck-10-spell-link-4-fogged-vision-3-global-score-1-order-up-3-aghanim-lab-1-flashback-12`;
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
  ...(valueOrderQuestions as unknown as TriviaQuestion[]),
  ...(aghanimQuestions as unknown as TriviaQuestion[]),
  ...(flashbackQuestions as unknown as TriviaQuestion[]).filter(isPlayableFlashbackQuestion),
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
  if (question.kind === "aghanim-upgrade") return "aghanim-lab";
  if (question.kind.startsWith("value-order-")) return "order-up";
  if (question.kind.startsWith("flashback-")) return "flashback";
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
  formats?: readonly string[],
) {
  if (mode === "mixed") {
    const roomFilter = sharedKnowledgeFilter(filter);
    const roundFormats = Array.isArray(formats) && formats.length > 0 ? formats : livePublicRoundFormats();
    return createSemanticPublicDeck(triviaQuestions, {
      formats: roundFormats,
      getFormat: roundFormatForQuestion,
      seed: `${seed}:semantic-subjects:${roomFilter}:${ARCADE_CONTENT_VERSION}`,
      poolSeedForFormat: (format: string) => `${seed}:format:${format}:${roomFilter}:${ARCADE_CONTENT_VERSION}`,
      length,
      roundOffset,
    }).map((question: TriviaQuestion) => ({ ...question, game: gameForQuestion(question) }));
  }

  const gamePools = {
    trivia: shuffledPool(seed, "trivia", filter),
    shopkeeper: shuffledPool(seed, "shopkeeper", filter),
    "spell-link": shuffledPool(seed, "spell-link", filter),
    "fogged-vision": shuffledPool(seed, "fogged-vision", filter),
    "echo-hunt": shuffledPool(seed, "echo-hunt", filter),
    soundcheck: shuffledPool(seed, "soundcheck", filter),
    "quote-hunt": shuffledPool(seed, "quote-hunt", filter),
    "aghanim-lab": shuffledPool(seed, "aghanim-lab", filter),
    "order-up": shuffledPool(seed, "order-up", filter),
    flashback: shuffledPool(seed, "flashback", filter),
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
    "aghanim-lab": 0,
    "order-up": 0,
    flashback: 0,
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

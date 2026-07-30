import counterplayQuestions from "@/data/counterplay-questions.json";
import generatedQuestions from "@/data/questions.generated.json";
import generatedMeta from "@/data/trivia-meta.generated.json";
import soundcheckQuestions from "@/data/soundcheck-questions.json";
import { mapSenseQuestions } from "@/lib/map-sense";
import type { MapChallenge } from "@/lib/map-types";
import { isPlayableShopkeeperQuestion } from "@/lib/shopkeeper-quality.mjs";
import { fixedCycleOccurrenceCounts, fixedCycleRotation, varietyShuffle } from "@/lib/variety.mjs";

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
    targetItemKey: string;
    componentKey: string;
    recipeComponentKeys: string[];
    answerItemKeys: [string, string, string, string];
    answerCosts: [number, number, number, number];
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
export const ARCADE_CONTENT_VERSION = `${triviaMeta.contentVersion}-map-sense-8-counterplay-4-soundcheck-6`;
const playableGeneratedQuestions = (generatedQuestions as TriviaQuestion[]).filter(
  (question) =>
    (question.kind !== "spell-owner" ||
      ((question.hint?.trim().length ?? 0) >= 18 && !question.hint?.startsWith("No additional mechanical clue"))) &&
    isPlayableShopkeeperQuestion(question),
);
export const triviaQuestions = [
  ...playableGeneratedQuestions,
  ...(mapSenseQuestions as TriviaQuestion[]),
  ...(counterplayQuestions as TriviaQuestion[]),
  ...(soundcheckQuestions as unknown as TriviaQuestion[]),
];

export interface ArcadeRound extends TriviaQuestion {
  game: RoundGame;
}

function belongsToFilter(question: TriviaQuestion, filter: KnowledgeFilter) {
  if (filter === "Mixed") return true;
  if (filter === "Abilities") return ["Abilities", "Cooldowns", "Damage", "Mana"].includes(question.category);
  if (filter === "Items") return ["Items", "Recipes"].includes(question.category);
  return question.category === "Heroes";
}

export function createQuestionDeck(seed: string, filter: KnowledgeFilter) {
  const pool = triviaQuestions.filter(
    (question) => gameForQuestion(question) === "trivia" && belongsToFilter(question, filter),
  );
  return varietyShuffle(pool, `${seed}:${filter}:${ARCADE_CONTENT_VERSION}`);
}

export function gameForQuestion(question: TriviaQuestion): RoundGame {
  if (question.kind === "recipe-component") return "shopkeeper";
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
  const pool = triviaQuestions.filter((question) => {
    if (gameForQuestion(question) !== game) return false;
    return game !== "trivia" || belongsToFilter(question, filter);
  });

  return varietyShuffle(pool, `${seed}:${game}:${filter}:${ARCADE_CONTENT_VERSION}`);
}

export function createArcadeDeck(
  seed: string,
  mode: ArcadeMode,
  filter: KnowledgeFilter,
  length = 10,
  rotationSeed = seed,
  roundOffset = 0,
) {
  const mixedGames = [
    "trivia",
    "shopkeeper",
    "spell-link",
    "fogged-vision",
    "echo-hunt",
    "soundcheck",
    "quote-hunt",
    "map-sense",
    "counterplay",
  ] satisfies RoundGame[];
  const games: RoundGame[] =
    mode === "mixed"
      ? fixedCycleRotation(mixedGames, rotationSeed, length, roundOffset)
      : Array.from({ length }, () => mode);

  const pools = {
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
  if (mode === "mixed") {
    const previousOccurrences = fixedCycleOccurrenceCounts(mixedGames, rotationSeed, roundOffset);
    for (const game of mixedGames) cursors[game] = previousOccurrences.get(game) ?? 0;
  } else {
    cursors[mode] = Math.max(0, roundOffset);
  }

  return games.flatMap((game) => {
    const pool = pools[game];
    const question = pool.length ? pool[cursors[game] % pool.length] : undefined;
    cursors[game] += 1;
    return question ? [{ ...question, game }] : [];
  });
}

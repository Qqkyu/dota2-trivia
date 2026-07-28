import counterplayQuestions from "@/data/counterplay-questions.json";
import generatedQuestions from "@/data/questions.generated.json";
import generatedMeta from "@/data/trivia-meta.generated.json";
import { mapSenseQuestions } from "@/lib/map-sense";
import type { MapChallenge } from "@/lib/map-types";
import { fixedCycleRotation, varietyShuffle } from "@/lib/variety.mjs";

export const KNOWLEDGE_FILTERS = ["Mixed", "Abilities", "Items", "Heroes"] as const;
export const SKILL_LEVELS = ["Open", "Learning", "Veteran"] as const;

export type KnowledgeFilter = (typeof KNOWLEDGE_FILTERS)[number];
export type SkillLevel = (typeof SKILL_LEVELS)[number];
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
  answerImageKind?: TriviaArtworkKind;
  correctIndex: number;
  explanation: string;
  detail?: string;
  hint?: string;
  audio?: {
    src: string;
  };
  counterplay?: {
    family: CounterplayFamily;
    tool: string;
    outcomes: [boolean, boolean, boolean, boolean];
    format: CounterplayFormat;
    note?: string;
    targetedOptions?: [boolean, boolean, boolean, boolean];
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
export const ARCADE_CONTENT_VERSION = `${triviaMeta.contentVersion}-map-sense-7-counterplay-3`;
export const triviaQuestions = [
  ...(generatedQuestions as TriviaQuestion[]),
  ...(mapSenseQuestions as TriviaQuestion[]),
  ...(counterplayQuestions as TriviaQuestion[]),
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
  if (question.kind === "hero-quote") return "quote-hunt";
  if (question.kind.startsWith("map-")) return "map-sense";
  if (question.kind.startsWith("counterplay-")) return "counterplay";
  return "trivia";
}

function belongsToSkillLevel(question: TriviaQuestion, skillLevel: SkillLevel) {
  if (skillLevel === "Learning") return question.difficulty === 1;
  if (skillLevel === "Veteran") return question.difficulty >= 2;
  return true;
}

function shuffledPool(seed: string, game: RoundGame, filter: KnowledgeFilter, skillLevel: SkillLevel) {
  const pool = triviaQuestions.filter((question) => {
    if (gameForQuestion(question) !== game) return false;
    if (game === "trivia") return belongsToFilter(question, filter) && belongsToSkillLevel(question, skillLevel);
    if (game === "spell-link") return belongsToSkillLevel(question, skillLevel);
    if (game === "counterplay") return belongsToSkillLevel(question, skillLevel);
    if (game === "map-sense") {
      if (skillLevel === "Learning") return question.difficulty <= 2;
      if (skillLevel === "Veteran") {
        return (
          ["map-crop", "map-camp-block", "map-stack-route", "map-tp-in"].includes(question.kind) &&
          question.difficulty === 3
        );
      }
    }
    return true;
  });

  return varietyShuffle(pool, `${seed}:${game}:${filter}:${skillLevel}:${ARCADE_CONTENT_VERSION}`);
}

export function createArcadeDeck(
  seed: string,
  mode: ArcadeMode,
  filter: KnowledgeFilter,
  length = 10,
  skillLevel: SkillLevel = "Open",
  rotationSeed = seed,
  roundOffset = 0,
) {
  const mixedGames = [
    "trivia",
    "shopkeeper",
    "spell-link",
    "fogged-vision",
    "echo-hunt",
    "quote-hunt",
    "map-sense",
    "counterplay",
  ] satisfies RoundGame[];
  const games: RoundGame[] =
    mode === "mixed"
      ? fixedCycleRotation(mixedGames, rotationSeed, length, roundOffset)
      : Array.from({ length }, () => mode);

  const pools = {
    trivia: shuffledPool(seed, "trivia", filter, skillLevel),
    shopkeeper: shuffledPool(seed, "shopkeeper", filter, skillLevel),
    "spell-link": shuffledPool(seed, "spell-link", filter, skillLevel),
    "fogged-vision": shuffledPool(seed, "fogged-vision", filter, skillLevel),
    "echo-hunt": shuffledPool(seed, "echo-hunt", filter, skillLevel),
    "quote-hunt": shuffledPool(seed, "quote-hunt", filter, skillLevel),
    "map-sense": shuffledPool(seed, "map-sense", filter, skillLevel),
    counterplay: shuffledPool(seed, "counterplay", filter, skillLevel),
  };
  const cursors: Record<RoundGame, number> = {
    trivia: 0,
    shopkeeper: 0,
    "spell-link": 0,
    "fogged-vision": 0,
    "echo-hunt": 0,
    "quote-hunt": 0,
    "map-sense": 0,
    counterplay: 0,
  };

  return games.flatMap((game) => {
    const question = pools[game][cursors[game]];
    cursors[game] += 1;
    return question ? [{ ...question, game }] : [];
  });
}

export function difficultyLabel(difficulty: TriviaQuestion["difficulty"]) {
  if (difficulty === 1) return "Warm-up";
  if (difficulty === 2) return "Tricky";
  return "Brutal";
}

import generatedQuestions from "@/data/questions.generated.json";
import generatedMeta from "@/data/trivia-meta.generated.json";

export const KNOWLEDGE_FILTERS = ["Mixed", "Abilities", "Items", "Heroes"] as const;
export const SKILL_LEVELS = ["Open", "Learning", "Veteran"] as const;

export type KnowledgeFilter = (typeof KNOWLEDGE_FILTERS)[number];
export type SkillLevel = (typeof SKILL_LEVELS)[number];
export type TriviaCategory = "Abilities" | "Cooldowns" | "Damage" | "Recipes" | "Items" | "Mana" | "Heroes";
export type ArcadeMode = "mixed" | "trivia" | "shopkeeper" | "spell-link";
export type RoundGame = Exclude<ArcadeMode, "mixed">;

export interface TriviaQuestion {
  id: string;
  category: TriviaCategory;
  difficulty: 1 | 2 | 3;
  eyebrow: string;
  prompt: string;
  image: {
    src: string;
    alt: string;
    kind: "ability" | "hero" | "item";
  };
  answers: [string, string, string, string];
  answerImages?: [string, string, string, string];
  correctIndex: number;
  explanation: string;
  hint?: string;
  source: {
    label: string;
    url: string;
  };
  patch: string;
}

export interface TriviaMeta {
  patch: string;
  snapshotDate: string;
  questionCount: number;
  categoryCounts: Record<TriviaCategory, number>;
}

export const triviaQuestions = generatedQuestions as TriviaQuestion[];
export const triviaMeta = generatedMeta as TriviaMeta;

export interface ArcadeRound extends TriviaQuestion {
  game: RoundGame;
}

function hash(input: string) {
  let value = 2166136261;

  for (let index = 0; index < input.length; index += 1) {
    value ^= input.charCodeAt(index);
    value = Math.imul(value, 16777619);
  }

  return value >>> 0;
}

function mulberry32(seed: number) {
  return () => {
    let value = (seed += 0x6d2b79f5);
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function seededShuffle<T>(values: T[], seed: string) {
  const random = mulberry32(hash(seed));
  const shuffled = [...values];

  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const target = Math.floor(random() * (index + 1));
    [shuffled[index], shuffled[target]] = [shuffled[target], shuffled[index]];
  }

  return shuffled;
}

function belongsToFilter(question: TriviaQuestion, filter: KnowledgeFilter) {
  if (filter === "Mixed") return true;
  if (filter === "Abilities") return ["Abilities", "Cooldowns", "Damage", "Mana"].includes(question.category);
  if (filter === "Items") return ["Items", "Recipes"].includes(question.category);
  return question.category === "Heroes";
}

export function createQuestionDeck(seed: string, filter: KnowledgeFilter) {
  const random = mulberry32(hash(`${seed}:${filter}:${triviaMeta.patch}`));
  const pool = triviaQuestions.filter((question) => belongsToFilter(question, filter));

  for (let index = pool.length - 1; index > 0; index -= 1) {
    const target = Math.floor(random() * (index + 1));
    [pool[index], pool[target]] = [pool[target], pool[index]];
  }

  return pool;
}

function roundGame(question: TriviaQuestion): RoundGame {
  if (question.category === "Recipes") return "shopkeeper";
  if (question.id.startsWith("ability-owner:")) return "spell-link";
  return "trivia";
}

function belongsToSkillLevel(question: TriviaQuestion, skillLevel: SkillLevel) {
  if (skillLevel === "Learning") return question.difficulty === 1;
  if (skillLevel === "Veteran") return question.difficulty >= 2;
  return true;
}

function shuffledPool(seed: string, game: RoundGame, filter: KnowledgeFilter, skillLevel: SkillLevel) {
  const random = mulberry32(hash(`${seed}:${game}:${filter}:${skillLevel}:${triviaMeta.patch}`));
  const pool = triviaQuestions.filter((question) => {
    if (roundGame(question) !== game) return false;
    if (game === "trivia") return belongsToFilter(question, filter) && belongsToSkillLevel(question, skillLevel);
    if (game === "spell-link") return belongsToSkillLevel(question, skillLevel);
    return true;
  });

  for (let index = pool.length - 1; index > 0; index -= 1) {
    const target = Math.floor(random() * (index + 1));
    [pool[index], pool[target]] = [pool[target], pool[index]];
  }

  return pool;
}

export function createArcadeDeck(
  seed: string,
  mode: ArcadeMode,
  filter: KnowledgeFilter,
  length = 10,
  skillLevel: SkillLevel = "Open",
) {
  const games: RoundGame[] =
    mode === "mixed"
      ? (() => {
          const rotation: RoundGame[] = [];

          while (rotation.length < length) {
            const cycleIndex = Math.floor(rotation.length / 3);
            const cycle = seededShuffle(
              ["trivia", "shopkeeper", "spell-link"] satisfies RoundGame[],
              `${seed}:cycle:${cycleIndex}`,
            );

            if (rotation.at(-1) === cycle[0]) {
              [cycle[0], cycle[1]] = [cycle[1], cycle[0]];
            }

            rotation.push(...cycle.slice(0, length - rotation.length));
          }

          return rotation;
        })()
      : Array.from({ length }, () => mode);

  const pools = {
    trivia: shuffledPool(seed, "trivia", filter, skillLevel),
    shopkeeper: shuffledPool(seed, "shopkeeper", filter, skillLevel),
    "spell-link": shuffledPool(seed, "spell-link", filter, skillLevel),
  };
  const cursors: Record<RoundGame, number> = {
    trivia: 0,
    shopkeeper: 0,
    "spell-link": 0,
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

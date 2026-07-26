import {
  createArcadeDeck,
  triviaQuestions,
  triviaMeta,
  type ArcadeMode,
  type ArcadeRound,
  type KnowledgeFilter,
  type SkillLevel,
  type TriviaQuestion,
} from "@/lib/trivia";

export const GAME_IDS = ["dota2"] as const;
export type GameId = (typeof GAME_IDS)[number];

export interface GameCatalog {
  id: GameId;
  label: string;
  logoUrl: string;
  contentVersion: string;
  contentLabel: string;
  modes: readonly ArcadeMode[];
  questions: readonly TriviaQuestion[];
  createDeck: (
    seed: string,
    mode: ArcadeMode,
    filter: KnowledgeFilter,
    length: number,
    skillLevel: SkillLevel,
  ) => ArcadeRound[];
}

export const DEFAULT_GAME_ID: GameId = "dota2";

export const GAME_CATALOGS: Record<GameId, GameCatalog> = {
  dota2: {
    id: "dota2",
    label: "Dota 2",
    logoUrl: "https://cdn.steamstatic.com/apps/dota2/images/dota_react/global/dota2_logo_symbol.png",
    contentVersion: triviaMeta.patch,
    contentLabel: `Patch ${triviaMeta.patch}`,
    modes: ["mixed", "trivia", "shopkeeper", "spell-link"],
    questions: triviaQuestions,
    createDeck: createArcadeDeck,
  },
};

export function isGameId(value: unknown): value is GameId {
  return typeof value === "string" && GAME_IDS.includes(value as GameId);
}

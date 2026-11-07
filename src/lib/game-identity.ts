export const GAME_IDS = ["dota2"] as const;

export type GameId = (typeof GAME_IDS)[number];

export const DEFAULT_GAME_ID: GameId = "dota2";

export interface PublicGameInfo {
  id: GameId;
  label: string;
  logoUrl: string;
  contentLabel: string;
  patch: string;
  questionCount: number;
}

export function isGameId(value: unknown): value is GameId {
  return typeof value === "string" && GAME_IDS.includes(value as GameId);
}

import type { ArcadeMode, KnowledgeFilter, RoundGame, SkillLevel } from "@/lib/trivia";
import type { GameId } from "@/lib/game-catalogs";

export interface CrowdResult {
  counts: [number, number, number, number];
  total: number;
}

export interface PlayerVote {
  answerIndex: number;
  submittedAt: number;
}

export interface PublicRoomSettings {
  gameId: GameId;
  mode: ArcadeMode;
  filter: KnowledgeFilter;
  skillLevel: SkillLevel;
}

export interface PublicRoom {
  id: string;
  gameId: GameId;
  contentVersion: string;
  mode: ArcadeMode;
  filter: KnowledgeFilter;
  skillLevel: SkillLevel;
}

export type PublicRoundPhase = "answering" | "reveal";

export interface PublicRound {
  id: string;
  number: number;
  phase: PublicRoundPhase;
  game: RoundGame;
  questionId: string;
  startedAt: number;
  answerDeadline: number;
  revealDeadline: number;
  answerDuration: number;
}

export interface RoomSnapshot {
  serverNow: number;
  room: PublicRoom;
  round: PublicRound;
  crowd: CrowdResult;
  playerVote: PlayerVote | null;
}

export interface VoteResult extends CrowdResult {
  accepted: boolean;
  playerVote: PlayerVote | null;
}

import type { ArcadeMode, KnowledgeFilter, RoundGame } from "@/lib/trivia";
import type { ReportReason } from "@/lib/calibration";
import type { GameId } from "@/lib/game-catalogs";
import type { MapPosition } from "@/lib/map-types";

export interface CrowdResult {
  counts: [number, number, number, number];
  total: number;
  positions: MapPosition[];
  itemCounts: Array<{
    itemKey: string;
    count: number;
  }>;
}

export interface PlayerVote {
  answerIndex: number;
  submittedAt: number;
  answerKey?: string;
  mapPosition?: MapPosition;
}

export interface PublicRoomSettings {
  gameId: GameId;
  mode: ArcadeMode;
  filter: KnowledgeFilter;
}

export interface PublicRoom {
  id: string;
  gameId: GameId;
  contentVersion: string;
  mode: ArcadeMode;
  filter: KnowledgeFilter;
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

export interface RoomPresence {
  activePlayers: number;
}

export interface RoomSnapshot {
  serverNow: number;
  room: PublicRoom;
  round: PublicRound;
  presence: RoomPresence;
  crowd: CrowdResult;
  playerVote: PlayerVote | null;
  playerReport: ReportReason | null;
}

export interface VoteResult extends CrowdResult {
  accepted: boolean;
  playerVote: PlayerVote | null;
}

export interface ReportResult {
  accepted: boolean;
  reason: ReportReason;
}

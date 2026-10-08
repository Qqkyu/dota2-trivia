import type { ArcadeMode, KnowledgeFilter, RoundGame } from "@/lib/trivia";
import type { ReportReason } from "@/lib/calibration";
import type { GameId } from "@/lib/game-identity";
import type { PublicArcadeQuestion } from "@/lib/public-question";

export interface CrowdResult {
  counts: [number, number, number, number];
  total: number;
  keyCounts: Array<{
    answerKey: string;
    count: number;
  }>;
  scoreSummary: CrowdScoreSummary | null;
}

export interface CrowdScoreSummary {
  correctCount: number;
  average: number | null;
  best: number | null;
  playerPoints: number | null;
}

export type PlayerIdentity = { kind: "guest"; id: string } | { kind: "account"; id: string };

export interface PlayerVote {
  answerIndex: number;
  submittedAt: number;
  answerKey?: string;
}

export interface MissedRoundResult {
  game?: RoundGame;
  category?: PublicArcadeQuestion["category"];
  roundId: string;
  correct: boolean;
  points: number;
}

export interface PublicRoomSettings {
  gameId: GameId;
  mode: ArcadeMode;
  filter: KnowledgeFilter;
  privateCode?: string;
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

export type PublicRoundSnapshot = Omit<PublicRound, "questionId">;

export interface RoomPresence {
  activePlayers: number;
}

export interface RoomSnapshot {
  playerIdentity: PlayerIdentity | null;
  serverNow: number;
  room: PublicRoom;
  round: PublicRoundSnapshot;
  questionRevision: string;
  question: PublicArcadeQuestion | null;
  presence: RoomPresence;
  crowd: CrowdResult;
  playerVote: PlayerVote | null;
  playerReport: ReportReason | null;
  previousResults: MissedRoundResult[];
}

export interface VoteResult extends CrowdResult {
  playerIdentity: PlayerIdentity | null;
  accepted: boolean;
  playerVote: PlayerVote | null;
}

export interface ReportResult {
  accepted: boolean;
  reason: ReportReason;
}

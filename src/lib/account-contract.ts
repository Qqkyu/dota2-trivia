import type { GameId } from "@/lib/game-catalogs";
import type { RoundGame } from "@/lib/trivia";

export interface AccountUser {
  id: string;
  steamId: string;
  displayName: string;
  avatarUrl: string | null;
  profileUrl: string;
  createdAt: number;
}

export interface PlayerRoundRecord {
  roundId: string;
  roundNumber: number;
  gameId: GameId;
  questionId: string;
  questionRevision: string;
  roundGame: RoundGame;
  roundFormat: string;
  correct: boolean;
  answerStage: 1 | 2 | 3 | null;
  submittedAt: number;
}

export interface PlayerFormatStats {
  format: string;
  answered: number;
  correct: number;
  accuracy: number;
}

export interface PlayerStats {
  answered: number;
  correct: number;
  accuracy: number;
  currentStreak: number;
  bestStreak: number;
  bestTenCorrect: number | null;
  firstStageCorrect: number;
  progressiveCorrect: number;
  progressiveAnswered: number;
  formats: PlayerFormatStats[];
  recentRounds: PlayerRoundRecord[];
}

export interface AccountProfile {
  user: AccountUser;
  stats: PlayerStats;
}

export type AccountSnapshot =
  | { authenticated: false }
  | {
      authenticated: true;
      profile: AccountProfile;
    };

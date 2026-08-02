import {
  ARCADE_CONTENT_VERSION,
  createArcadeDeck,
  triviaQuestions,
  triviaMeta,
  type ArcadeMode,
  type ArcadeRound,
  type KnowledgeFilter,
  type TriviaQuestion,
} from "@/lib/trivia";
import { LIVE_ARCADE_MODES } from "@/lib/arcade-games.mjs";
import { DEFAULT_GAME_ID, type GameId, type PublicGameInfo } from "@/lib/game-identity";

export { DEFAULT_GAME_ID, GAME_IDS, isGameId, type GameId } from "@/lib/game-identity";

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
    rotationSeed?: string,
    roundOffset?: number,
  ) => ArcadeRound[];
}

export const GAME_CATALOGS: Record<GameId, GameCatalog> = {
  dota2: {
    id: "dota2",
    label: "Dota 2",
    logoUrl: "https://cdn.steamstatic.com/apps/dota2/images/dota_react/global/dota2_logo_symbol.png",
    contentVersion: ARCADE_CONTENT_VERSION,
    contentLabel: `Patch ${triviaMeta.patch}`,
    modes: LIVE_ARCADE_MODES as readonly ArcadeMode[],
    questions: triviaQuestions,
    createDeck: createArcadeDeck,
  },
};

export function publicGameInfo(gameId: GameId = DEFAULT_GAME_ID): PublicGameInfo {
  const catalog = GAME_CATALOGS[gameId];
  return {
    id: catalog.id,
    label: catalog.label,
    logoUrl: catalog.logoUrl,
    contentLabel: catalog.contentLabel,
    questionCount: catalog.questions.length,
  };
}

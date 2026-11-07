import { PUBLIC_ARCADE_MODE } from "@/lib/arcade-games.mjs";
import { DEFAULT_GAME_ID } from "@/lib/game-catalogs";
import { liveRoundAt, liveRoundForSettings } from "@/lib/private-room-rounds";
import { parsePublicRoomSettings, publicRoomFor } from "@/lib/public-rooms";
import { getRoomPresence } from "@/lib/room-presence.mjs";

import type { LobbyPulsePayload } from "@/components/arcade/shared";

/**
 * The lobby's room pulse: who is playing and where the shared clock stands.
 * It never carries a question, an answer, or a round id, so it is safe to send
 * before a player has joined, in the page itself and from /api/presence.
 */
export function lobbyPulseSnapshot(serverNow = Date.now()): LobbyPulsePayload {
  const room = publicRoomFor({ gameId: DEFAULT_GAME_ID, mode: PUBLIC_ARCADE_MODE, filter: "Mixed" });
  const settings = parsePublicRoomSettings({ gameId: DEFAULT_GAME_ID, mode: PUBLIC_ARCADE_MODE, filter: "Mixed" });
  const live = settings ? liveRoundForSettings(settings, serverNow) : null;
  const round =
    settings && live && !("error" in live)
      ? {
          number: live.round.number,
          game: live.round.game,
          phase: live.round.phase,
          answerDeadline: live.round.answerDeadline,
          revealDeadline: live.round.revealDeadline,
          answerDuration: live.round.answerDuration,
          // The schedule is fixed, so the lobby can name the next format before the round turns.
          nextGame: liveRoundAt(settings, live.round.number + 1, serverNow)?.game ?? null,
        }
      : null;
  return { activePlayers: getRoomPresence(room.id), serverNow, round };
}

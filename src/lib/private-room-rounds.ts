import type { PublicRoom, PublicRoomSettings, PublicRound } from "@/lib/arcade-contract";
import { sessionUserForRequest } from "@/lib/auth-session";
import { PUBLIC_ARCADE_MODE } from "@/lib/arcade-games.mjs";
import { GAME_CATALOGS, isGameId } from "@/lib/game-catalogs";
import {
  getPrivateRoom,
  guestDisplayName,
  privateRoomCountdownMs,
  privateRoomWaiting,
  privateRoundTiming,
  touchPrivateRoom,
} from "@/lib/private-rooms.mjs";
import { getRoomPresence } from "@/lib/room-presence.mjs";
import {
  currentPublicRound,
  PUBLIC_ROUND_ANSWER_MS,
  PUBLIC_ROUND_REVEAL_MS,
  PUBLIC_ROOM_BATCH_LENGTH,
  PUBLIC_VOTE_ACCEPT_GRACE_MS,
  publicRoundAt,
} from "@/lib/public-rooms";

export async function privateRoomIdentity(request: Request, bodyPlayerId?: unknown) {
  const accountUser = await sessionUserForRequest(request);
  if (accountUser) return { playerId: `account:${accountUser.id}`, name: accountUser.displayName };
  if (typeof bodyPlayerId === "string" && bodyPlayerId.length >= 8 && bodyPlayerId.length <= 80) {
    return { playerId: bodyPlayerId, name: guestDisplayName(bodyPlayerId) };
  }
  return null;
}

function roomFromRecord(record: NonNullable<ReturnType<typeof getPrivateRoom>>): PublicRoom {
  if (!isGameId(record.gameId)) throw new Error(`Private room ${record.code} has an invalid catalog.`);
  return {
    id: record.roomId,
    gameId: record.gameId,
    contentVersion: record.contentVersion,
    mode: PUBLIC_ARCADE_MODE,
    filter: "Mixed",
  };
}

function questionForPrivateRound(record: NonNullable<ReturnType<typeof getPrivateRoom>>, roundNumber: number) {
  if (!isGameId(record.gameId)) throw new Error(`Private room ${record.code} has an invalid catalog.`);
  const catalog = GAME_CATALOGS[record.gameId];
  const batchNumber = Math.floor(roundNumber / PUBLIC_ROOM_BATCH_LENGTH);
  const index = roundNumber % PUBLIC_ROOM_BATCH_LENGTH;
  const deck = catalog.createDeck(
    `private-room:${record.roomId}:${record.startedAt}:questions`,
    PUBLIC_ARCADE_MODE,
    "Mixed",
    PUBLIC_ROOM_BATCH_LENGTH,
    batchNumber * PUBLIC_ROOM_BATCH_LENGTH,
    record.formats,
  );
  if (!deck.length) throw new Error(`Private room ${record.code} has no eligible questions.`);
  return deck[index % deck.length];
}

export function privateRoundAt(
  record: NonNullable<ReturnType<typeof getPrivateRoom>>,
  roundNumber: number,
  now: number,
): PublicRound {
  if (record.startedAt == null) throw new Error(`Private room ${record.code} has not started.`);
  const question = questionForPrivateRound(record, roundNumber);
  const roundStartedAt = record.startedAt + roundNumber * (PUBLIC_ROUND_ANSWER_MS + PUBLIC_ROUND_REVEAL_MS);
  const answerDeadline = roundStartedAt + PUBLIC_ROUND_ANSWER_MS;
  const revealDeadline = answerDeadline + PUBLIC_ROUND_REVEAL_MS;
  return {
    id: `${record.roomId}:round:${roundNumber}:${record.startedAt}`,
    number: roundNumber,
    phase: now < answerDeadline + PUBLIC_VOTE_ACCEPT_GRACE_MS ? "answering" : "reveal",
    game: question.game,
    questionId: question.id,
    startedAt: roundStartedAt,
    answerDeadline,
    revealDeadline,
    answerDuration: PUBLIC_ROUND_ANSWER_MS,
  };
}

export function privateRoomClientPayload(
  record: NonNullable<ReturnType<typeof getPrivateRoom>>,
  playerId: string,
  now: number,
) {
  return {
    serverNow: now,
    waiting: privateRoomWaiting(record, now),
    countdownMs: privateRoomCountdownMs(record, now),
    privateRoom: {
      code: record.code,
      games: record.games,
      formats: record.formats,
      startedAt: record.startedAt,
      isHost: record.hostId === playerId,
      players: Array.isArray(record.players)
        ? record.players.map((player) => ({
            name: player.name,
            host: Boolean(player.host),
            self: Boolean(player.self) || (player.host && record.hostId === playerId),
            score: Number(player.score) || 0,
            away: Boolean(player.away),
          }))
        : [],
      messages: record.messages,
    },
    room: {
      id: record.roomId,
      gameId: record.gameId,
      contentVersion: record.contentVersion,
    },
    presence: { activePlayers: getRoomPresence(record.roomId, now) },
    nameTaken: Boolean(record.nameTaken),
  };
}

export function currentPrivateRound(code: string, now = Date.now()) {
  const record = touchPrivateRoom(code, now) ?? getPrivateRoom(code, now);
  if (!record) return null;
  const room = roomFromRecord(record);
  if (privateRoomWaiting(record, now)) {
    return { room, round: null as PublicRound | null, waiting: true as const, record };
  }
  const timing = privateRoundTiming(record.startedAt, now, PUBLIC_ROUND_ANSWER_MS, PUBLIC_ROUND_REVEAL_MS);
  return {
    room,
    round: privateRoundAt(record, timing.roundNumber, now),
    waiting: false as const,
    record,
  };
}

export function liveRoundForSettings(settings: PublicRoomSettings, now: number) {
  if (!settings.privateCode) {
    const current = currentPublicRound(settings, now);
    return { ...current, isolated: false as const };
  }
  const current = currentPrivateRound(settings.privateCode, now);
  if (!current) return { error: "missing" as const };
  if (current.waiting || !current.round) return { error: "waiting" as const };
  return { room: current.room, round: current.round, isolated: true as const, record: current.record };
}

export function liveRoundAt(settings: PublicRoomSettings, roundNumber: number, now: number) {
  if (!settings.privateCode) {
    const room = currentPublicRound(settings, now).room;
    return publicRoundAt(room, roundNumber, now);
  }
  const current = currentPrivateRound(settings.privateCode, now);
  if (!current?.record || current.waiting) return null;
  return privateRoundAt(current.record, roundNumber, now);
}

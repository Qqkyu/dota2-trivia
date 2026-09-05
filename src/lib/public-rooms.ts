import { type ArcadeRound, type KnowledgeFilter } from "@/lib/trivia";
import type { PublicRoom, PublicRoomSettings, PublicRound } from "@/lib/arcade-contract";
import { GAME_CATALOGS, isGameId } from "@/lib/game-catalogs";
import { PUBLIC_ARCADE_MODE, roundFormatForQuestion } from "@/lib/arcade-games.mjs";
import { normalizePrivateRoomCode } from "@/lib/private-rooms.mjs";

export const PUBLIC_ROUND_REVEAL_MS = 7_000;
export const PUBLIC_ROOM_BATCH_LENGTH = 24;
export const PUBLIC_ROUND_ANSWER_MS = 15_000;
/** Covers lock-click → POST latency so a lock sound still counts. */
export const PUBLIC_VOTE_ACCEPT_GRACE_MS = 800;

const DEFAULT_ROUND_EPOCH_MS = Date.UTC(2026, 0, 1);

function configuredEpoch() {
  const value = process.env.ARCADE_ROUND_EPOCH;
  if (!value) return DEFAULT_ROUND_EPOCH_MS;

  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : DEFAULT_ROUND_EPOCH_MS;
}

function normalizedFilter(): KnowledgeFilter {
  return "Mixed";
}

export function parsePublicRoomSettings(values: {
  gameId?: unknown;
  mode?: unknown;
  filter?: unknown;
  privateCode?: unknown;
  room?: unknown;
}): PublicRoomSettings | null {
  const { gameId } = values;

  if (!isGameId(gameId)) return null;
  const privateCode = normalizePrivateRoomCode(values.privateCode ?? values.room);

  return {
    gameId,
    mode: PUBLIC_ARCADE_MODE,
    filter: normalizedFilter(),
    ...(privateCode ? { privateCode } : {}),
  };
}

export function publicRoomFor(settings: PublicRoomSettings): PublicRoom {
  const filter = normalizedFilter();
  const catalog = GAME_CATALOGS[settings.gameId];
  return {
    id: [catalog.id, catalog.contentVersion, "public"].join(":"),
    gameId: catalog.id,
    contentVersion: catalog.contentVersion,
    mode: PUBLIC_ARCADE_MODE,
    filter,
  };
}

function rawRoomBatch(room: PublicRoom, batchNumber: number) {
  const seed = `public-room:${room.id}:questions`;
  const deck = GAME_CATALOGS[room.gameId].createDeck(
    seed,
    room.mode,
    room.filter,
    PUBLIC_ROOM_BATCH_LENGTH,
    batchNumber * PUBLIC_ROOM_BATCH_LENGTH,
  );

  if (!deck.length) {
    throw new Error(`Public room ${room.id} has no eligible questions.`);
  }

  return deck;
}

function roomBatch(room: PublicRoom, batchNumber: number) {
  const deck = rawRoomBatch(room, batchNumber);
  if (batchNumber === 0 || deck.length < 2) return deck;

  const previousLast = rawRoomBatch(room, batchNumber - 1).at(-1);
  const first = deck[0];
  const conflicts =
    first.id === previousLast?.id ||
    first.game === previousLast?.game ||
    roundFormatForQuestion(first) === roundFormatForQuestion(previousLast);
  if (!conflicts) return deck;

  const replacementIndex = deck.findIndex(
    (question, index) =>
      index > 0 &&
      index < deck.length - 1 &&
      question.id !== previousLast?.id &&
      question.game !== previousLast?.game &&
      roundFormatForQuestion(question) !== roundFormatForQuestion(previousLast),
  );
  if (replacementIndex < 1) return deck;

  [deck[0], deck[replacementIndex]] = [deck[replacementIndex], deck[0]];
  return deck;
}

export function questionForPublicRound(room: PublicRoom, roundNumber: number): ArcadeRound {
  const batchNumber = Math.floor(roundNumber / PUBLIC_ROOM_BATCH_LENGTH);
  const index = roundNumber % PUBLIC_ROOM_BATCH_LENGTH;
  const deck = roomBatch(room, batchNumber);
  return deck[index % deck.length];
}

export function publicRoundAt(room: PublicRoom, roundNumber: number, now: number): PublicRound {
  const answerDuration = PUBLIC_ROUND_ANSWER_MS;
  const cycleDuration = answerDuration + PUBLIC_ROUND_REVEAL_MS;
  const startedAt = configuredEpoch() + roundNumber * cycleDuration;
  const answerDeadline = startedAt + answerDuration;
  const revealDeadline = answerDeadline + PUBLIC_ROUND_REVEAL_MS;
  const question = questionForPublicRound(room, roundNumber);

  return {
    id: `${room.id}:round:${roundNumber}`,
    number: roundNumber,
    phase: now < answerDeadline ? "answering" : "reveal",
    game: question.game,
    questionId: question.id,
    startedAt,
    answerDeadline,
    revealDeadline,
    answerDuration,
  };
}

export function currentPublicRound(settings: PublicRoomSettings, now = Date.now()) {
  const room = publicRoomFor(settings);
  const cycleDuration = PUBLIC_ROUND_ANSWER_MS + PUBLIC_ROUND_REVEAL_MS;
  const roundNumber = Math.max(0, Math.floor((now - configuredEpoch()) / cycleDuration));

  return {
    room,
    round: publicRoundAt(room, roundNumber, now),
  };
}

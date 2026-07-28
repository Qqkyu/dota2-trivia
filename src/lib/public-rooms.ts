import {
  KNOWLEDGE_FILTERS,
  SKILL_LEVELS,
  type ArcadeMode,
  type ArcadeRound,
  type KnowledgeFilter,
  type SkillLevel,
} from "@/lib/trivia";
import type { PublicRoom, PublicRoomSettings, PublicRound } from "@/lib/arcade-contract";
import { GAME_CATALOGS, isGameId } from "@/lib/game-catalogs";

export const PUBLIC_ROUND_REVEAL_MS = 7_000;
export const PUBLIC_ROOM_BATCH_LENGTH = 24;

const DEFAULT_ROUND_EPOCH_MS = Date.UTC(2026, 0, 1);
const ANSWER_DURATION_MS: Record<SkillLevel, number> = {
  Open: 15_000,
  Learning: 18_000,
  Veteran: 12_000,
};
const COUNTERPLAY_ANSWER_DURATION_MS = 15_000;

function answerDurationFor(room: PublicRoom) {
  const skillDuration = ANSWER_DURATION_MS[room.skillLevel];
  return room.mode === "counterplay" ? Math.max(skillDuration, COUNTERPLAY_ANSWER_DURATION_MS) : skillDuration;
}

function configuredEpoch() {
  const value = process.env.ARCADE_ROUND_EPOCH;
  if (!value) return DEFAULT_ROUND_EPOCH_MS;

  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : DEFAULT_ROUND_EPOCH_MS;
}

function normalizedFilter(mode: ArcadeMode, filter: KnowledgeFilter) {
  return mode === "trivia" ? filter : "Mixed";
}

export function parsePublicRoomSettings(values: {
  gameId?: unknown;
  mode?: unknown;
  filter?: unknown;
  skillLevel?: unknown;
}): PublicRoomSettings | null {
  const { gameId, mode, filter, skillLevel } = values;

  if (!isGameId(gameId)) return null;
  const catalog = GAME_CATALOGS[gameId];

  if (
    typeof mode !== "string" ||
    !catalog.modes.includes(mode as ArcadeMode) ||
    typeof filter !== "string" ||
    !KNOWLEDGE_FILTERS.includes(filter as KnowledgeFilter) ||
    typeof skillLevel !== "string" ||
    !SKILL_LEVELS.includes(skillLevel as SkillLevel)
  ) {
    return null;
  }

  return {
    gameId,
    mode: mode as ArcadeMode,
    filter: normalizedFilter(mode as ArcadeMode, filter as KnowledgeFilter),
    skillLevel: skillLevel as SkillLevel,
  };
}

export function publicRoomFor(settings: PublicRoomSettings): PublicRoom {
  const filter = normalizedFilter(settings.mode, settings.filter);
  const catalog = GAME_CATALOGS[settings.gameId];
  return {
    id: [
      catalog.id,
      catalog.contentVersion,
      settings.mode,
      filter.toLowerCase(),
      settings.skillLevel.toLowerCase(),
    ].join(":"),
    gameId: catalog.id,
    contentVersion: catalog.contentVersion,
    mode: settings.mode,
    filter,
    skillLevel: settings.skillLevel,
  };
}

function rawRoomBatch(room: PublicRoom, batchNumber: number) {
  const seed = `public-room:${room.id}:batch:${batchNumber}`;
  const deck = GAME_CATALOGS[room.gameId].createDeck(
    seed,
    room.mode,
    room.filter,
    PUBLIC_ROOM_BATCH_LENGTH,
    room.skillLevel,
    `public-room:${room.id}:mode-rotation`,
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
    (room.mode === "mixed" && first.game === previousLast?.game) ||
    (room.mode === "trivia" && first.kind === previousLast?.kind) ||
    (room.mode === "map-sense" && first.kind === previousLast?.kind) ||
    (room.mode === "counterplay" && first.kind === previousLast?.kind);
  if (!conflicts) return deck;

  const replacementIndex = deck.findIndex(
    (question, index) =>
      index > 0 &&
      index < deck.length - 1 &&
      question.id !== previousLast?.id &&
      (room.mode !== "mixed" || question.game !== previousLast?.game) &&
      (room.mode !== "trivia" || question.kind !== previousLast?.kind) &&
      (room.mode !== "map-sense" || question.kind !== previousLast?.kind) &&
      (room.mode !== "counterplay" || question.kind !== previousLast?.kind),
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
  const answerDuration = answerDurationFor(room);
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
  const cycleDuration = answerDurationFor(room) + PUBLIC_ROUND_REVEAL_MS;
  const roundNumber = Math.max(0, Math.floor((now - configuredEpoch()) / cycleDuration));

  return {
    room,
    round: publicRoundAt(room, roundNumber, now),
  };
}

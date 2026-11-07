import { isReportReason } from "@/lib/calibration";
import type { RoundGame } from "@/lib/trivia";
import type {
  CrowdResult,
  MissedRoundResult,
  PublicRoomSettings,
  RoomSnapshot,
  VoteResult,
} from "@/lib/arcade-contract";
import { normalizePlayerIdentity } from "@/lib/player-identity";
import { PUBLIC_ARCADE_MODE } from "@/lib/arcade-games.mjs";
import { isFlashbackYearAnswerKey } from "@/lib/flashback.mjs";
import { GAME_IDS } from "@/lib/game-identity";
import { HERO_PICKER_HEROES, isHeroCatalogKey } from "@/lib/hero-picker";
import { isRecipeAnswerKey, isShopkeeperCatalogKey, SHOPKEEPER_CATALOG_ITEMS } from "@/lib/shopkeeper-catalog";
import { isPublicArcadeQuestion, type PublicArcadeQuestion } from "@/lib/public-question";
import { isValueOrderAnswerKey } from "@/lib/value-order.mjs";
import { ROUND_GAMES } from "./shared";

export function normalizeCrowd(value: unknown): CrowdResult | null {
  if (!value || typeof value !== "object" || !("counts" in value) || !("total" in value)) return null;
  const { counts, total } = value;
  const keyCounts =
    "keyCounts" in value && Array.isArray(value.keyCounts)
      ? value.keyCounts
          .filter((entry): entry is { answerKey: string; count: number } =>
            Boolean(
              entry &&
                typeof entry === "object" &&
                "answerKey" in entry &&
                typeof entry.answerKey === "string" &&
                (isShopkeeperCatalogKey(entry.answerKey) ||
                  isRecipeAnswerKey(entry.answerKey) ||
                  isHeroCatalogKey(entry.answerKey) ||
                  isValueOrderAnswerKey(entry.answerKey) ||
                  isFlashbackYearAnswerKey(entry.answerKey)) &&
                "count" in entry &&
                typeof entry.count === "number" &&
                Number.isInteger(entry.count) &&
                entry.count > 0,
            ),
          )
          .slice(0, SHOPKEEPER_CATALOG_ITEMS.length + HERO_PICKER_HEROES.length)
      : [];
  const rawScoreSummary = "scoreSummary" in value ? value.scoreSummary : undefined;
  const scoreSummary =
    rawScoreSummary === null
      ? null
      : rawScoreSummary &&
          typeof rawScoreSummary === "object" &&
          "correctCount" in rawScoreSummary &&
          typeof rawScoreSummary.correctCount === "number" &&
          Number.isInteger(rawScoreSummary.correctCount) &&
          rawScoreSummary.correctCount >= 0 &&
          "average" in rawScoreSummary &&
          (rawScoreSummary.average === null ||
            (typeof rawScoreSummary.average === "number" && Number.isInteger(rawScoreSummary.average))) &&
          "best" in rawScoreSummary &&
          (rawScoreSummary.best === null ||
            (typeof rawScoreSummary.best === "number" && Number.isInteger(rawScoreSummary.best))) &&
          "playerPoints" in rawScoreSummary &&
          (rawScoreSummary.playerPoints === null ||
            (typeof rawScoreSummary.playerPoints === "number" && Number.isInteger(rawScoreSummary.playerPoints)))
        ? {
            correctCount: rawScoreSummary.correctCount,
            average: rawScoreSummary.average,
            best: rawScoreSummary.best,
            playerPoints: rawScoreSummary.playerPoints,
          }
        : undefined;

  if (
    !Array.isArray(counts) ||
    counts.length !== 4 ||
    !counts.every((count) => typeof count === "number" && count >= 0) ||
    typeof total !== "number" ||
    total < 0 ||
    scoreSummary === undefined
  ) {
    return null;
  }

  return {
    counts: [counts[0], counts[1], counts[2], counts[3]],
    total,
    keyCounts,
    scoreSummary,
    community:
      "community" in value &&
      value.community &&
      typeof value.community === "object" &&
      "share" in value.community &&
      typeof value.community.share === "number" &&
      "total" in value.community &&
      typeof value.community.total === "number"
        ? { share: value.community.share, total: value.community.total }
        : null,
  };
}

export function normalizePlayerVote(value: unknown) {
  if (value === null) return null;
  if (!value || typeof value !== "object" || !("answerIndex" in value) || !("submittedAt" in value)) {
    return undefined;
  }

  const { answerIndex, submittedAt } = value;
  const answerKey = "answerKey" in value ? value.answerKey : undefined;
  if (
    typeof answerIndex !== "number" ||
    !Number.isInteger(answerIndex) ||
    answerIndex < 0 ||
    answerIndex > 3 ||
    typeof submittedAt !== "number" ||
    !Number.isFinite(submittedAt) ||
    (answerKey !== undefined &&
      (typeof answerKey !== "string" ||
        (!isShopkeeperCatalogKey(answerKey) &&
          !isRecipeAnswerKey(answerKey) &&
          !isHeroCatalogKey(answerKey) &&
          !isValueOrderAnswerKey(answerKey) &&
          !isFlashbackYearAnswerKey(answerKey))))
  ) {
    return undefined;
  }

  return {
    answerIndex,
    submittedAt,
    ...(answerKey ? { answerKey } : {}),
  };
}

export function normalizePreviousResult(value: unknown): MissedRoundResult | null {
  if (value == null || typeof value !== "object") return null;
  const candidate = value as {
    roundId?: unknown;
    correct?: unknown;
    points?: unknown;
    game?: unknown;
    category?: unknown;
  };
  if (typeof candidate.roundId !== "string" || !candidate.roundId || typeof candidate.correct !== "boolean") {
    return null;
  }
  const points = Math.max(0, Math.round(Number(candidate.points) || 0));
  return {
    roundId: candidate.roundId,
    correct: candidate.correct,
    points,
    ...(typeof candidate.game === "string" && ROUND_GAMES.includes(candidate.game as RoundGame)
      ? { game: candidate.game as RoundGame }
      : {}),
    ...(typeof candidate.category === "string"
      ? { category: candidate.category as PublicArcadeQuestion["category"] }
      : {}),
  };
}

export function normalizePreviousResults(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => normalizePreviousResult(entry))
    .filter((entry): entry is MissedRoundResult => Boolean(entry));
}

export function normalizeRoomSnapshot(value: unknown): RoomSnapshot | null {
  if (
    !value ||
    typeof value !== "object" ||
    !("serverNow" in value) ||
    !("room" in value) ||
    !("round" in value) ||
    !("questionRevision" in value) ||
    !("question" in value) ||
    !("presence" in value) ||
    !("crowd" in value) ||
    !("playerVote" in value) ||
    !("playerReport" in value)
  ) {
    return null;
  }

  const candidate = value as Partial<RoomSnapshot>;
  const room = candidate.room;
  const round = candidate.round;
  const question = candidate.question;
  const presence = candidate.presence;
  const crowd = normalizeCrowd(candidate.crowd);
  const playerVote = normalizePlayerVote(candidate.playerVote);
  const playerReport =
    candidate.playerReport === null
      ? null
      : isReportReason(candidate.playerReport)
        ? candidate.playerReport
        : undefined;

  if (
    typeof candidate.serverNow !== "number" ||
    !room ||
    typeof room.id !== "string" ||
    !GAME_IDS.includes(room.gameId) ||
    typeof room.contentVersion !== "string" ||
    room.mode !== PUBLIC_ARCADE_MODE ||
    room.filter !== "Mixed" ||
    !round ||
    typeof round.id !== "string" ||
    typeof round.number !== "number" ||
    (round.phase !== "answering" && round.phase !== "reveal") ||
    !ROUND_GAMES.includes(round.game) ||
    typeof round.startedAt !== "number" ||
    typeof round.answerDeadline !== "number" ||
    typeof round.revealDeadline !== "number" ||
    typeof round.answerDuration !== "number" ||
    typeof candidate.questionRevision !== "string" ||
    (question !== null && !isPublicArcadeQuestion(question)) ||
    (question !== null && (question.id !== round.id || question.game !== round.game)) ||
    (question !== null && round.phase === "answering" && question.reveal !== null) ||
    (question !== null && round.phase === "reveal" && question.reveal === null) ||
    !presence ||
    typeof presence.activePlayers !== "number" ||
    !Number.isInteger(presence.activePlayers) ||
    presence.activePlayers < 0 ||
    !crowd ||
    playerVote === undefined ||
    playerReport === undefined
  ) {
    return null;
  }

  return {
    playerIdentity: normalizePlayerIdentity(candidate.playerIdentity),
    serverNow: candidate.serverNow,
    room,
    round,
    questionRevision: candidate.questionRevision,
    question,
    presence,
    crowd,
    playerVote,
    playerReport,
    previousResults: normalizePreviousResults(candidate.previousResults),
  };
}

export function normalizeVoteResult(value: unknown): VoteResult | null {
  if (!value || typeof value !== "object" || !("accepted" in value) || !("playerVote" in value)) return null;
  const crowd = normalizeCrowd(value);
  const playerVote = normalizePlayerVote(value.playerVote);
  if (typeof value.accepted !== "boolean" || playerVote === undefined || !crowd) return null;

  return {
    playerIdentity: normalizePlayerIdentity("playerIdentity" in value ? value.playerIdentity : null),
    accepted: value.accepted,
    ...crowd,
    playerVote,
  };
}

export function publicRoomQuery(
  settings: PublicRoomSettings,
  playerId: string,
  questionRevision?: string,
  pendingRoundIds: string[] = [],
) {
  return new URLSearchParams({
    gameId: settings.gameId,
    mode: settings.mode,
    filter: settings.filter,
    playerId,
    ...(settings.privateCode ? { privateCode: settings.privateCode } : {}),
    ...(questionRevision ? { questionRevision } : {}),
    ...(pendingRoundIds.length ? { pendingRoundIds: pendingRoundIds.slice(0, 24).join(",") } : {}),
  });
}

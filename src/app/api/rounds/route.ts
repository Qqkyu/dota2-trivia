import { NextResponse, type NextRequest } from "next/server";
import type { CrowdResult } from "@/lib/arcade-contract";
import { sessionUserForRequest } from "@/lib/auth-session";
import { preflightRateLimit, rateLimitRequest } from "@/lib/api-protection";
import { prioritizedKeyCounts } from "@/lib/crowd-split.mjs";
import { GAME_CATALOGS } from "@/lib/game-catalogs";
import { validatedGuestIdentity } from "@/lib/guest-identity.mjs";
import { liveRoundAt, liveRoundForSettings } from "@/lib/private-room-rounds";
import {
  applyPrivateRoomCrowdBonus,
  pendingPrivateRoomRoundIds,
  privateRoomAwardVersion,
  privateRoomMember,
} from "@/lib/private-rooms.mjs";
import { parsePublicRoomSettings } from "@/lib/public-rooms";
import { crowdScoreMultiplier, missedRoundResult } from "@/lib/scoring.mjs";
import { publicQuestionForRound, publicQuestionRevision } from "@/lib/public-question";
import { questionCalibrationRevision } from "@/lib/question-revision.mjs";
import { correctAnswerKey, isKeyedAnswerQuestion } from "@/lib/keyed-answer";
import { touchRoomPresence } from "@/lib/room-presence.mjs";
import { recoveryRoundNumbers } from "@/lib/round-recovery.mjs";
import { logServerError } from "@/lib/server-diagnostics";
import { getPlayerQuestionReport, getRoundCrowd } from "@/lib/vote-store";
import { firstPartyArtTree } from "@/lib/steam-art.mjs";
import { localizeQuestion } from "@/lib/question-locale";
import { roundTypeAccuracy } from "@/lib/community-stats";
import { requestLocale, translatorFor } from "@/i18n/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const HIDDEN_COUNTS: CrowdResult["counts"] = [0, 0, 0, 0];
const MAX_REVEALED_KEY_CHOICES = 12;

export async function GET(request: NextRequest) {
  const preflight = preflightRateLimit(request, "rounds", 9_000);
  if (preflight) return preflight;
  const locale = requestLocale(request);
  const t = translatorFor(locale);
  const searchParams = new URL(request.url).searchParams;
  const settings = parsePublicRoomSettings({
    gameId: searchParams.get("gameId"),
    mode: searchParams.get("mode"),
    filter: searchParams.get("filter"),
    privateCode: searchParams.get("privateCode") ?? searchParams.get("room"),
  });
  const playerId = searchParams.get("playerId") ?? undefined;
  const knownQuestionRevision = searchParams.get("questionRevision") ?? undefined;
  const pendingRoundParam = searchParams.get("pendingRoundIds") ?? "";

  if (!settings) {
    return NextResponse.json({ error: "Invalid public room settings." }, { status: 400 });
  }

  if (playerId !== undefined && !validatedGuestIdentity(playerId)) {
    return NextResponse.json({ error: "Invalid player ID." }, { status: 400 });
  }
  if (knownQuestionRevision && knownQuestionRevision.length > 240) {
    return NextResponse.json({ error: "Invalid question revision." }, { status: 400 });
  }

  try {
    const accountUser = await sessionUserForRequest(request);
    const effectivePlayerId = accountUser
      ? `account:${accountUser.id}`
      : (validatedGuestIdentity(playerId) ?? undefined);
    const rateLimited = rateLimitRequest(request, "rounds", effectivePlayerId ?? "anonymous", 180, 9_000);
    if (rateLimited) return rateLimited;
    const serverNow = Date.now();
    const live = liveRoundForSettings(settings, serverNow);
    if ("error" in live) {
      const status = live.error === "waiting" ? 409 : 404;
      const error = live.error === "waiting" ? "Private room has not started." : "Unknown private room.";
      return NextResponse.json({ error }, { status, headers: { "Cache-Control": "no-store" } });
    }
    const { room, round } = live;
    if (
      live.isolated &&
      settings.privateCode &&
      (!effectivePlayerId || !privateRoomMember(settings.privateCode, effectivePlayerId))
    ) {
      return NextResponse.json(
        { error: "Join the party before reading rounds." },
        { status: 403, headers: { "Cache-Control": "no-store" } },
      );
    }
    const activePlayers = effectivePlayerId ? touchRoomPresence(room.id, effectivePlayerId, serverNow) : 0;
    const question = GAME_CATALOGS[room.gameId].questions.find((candidate) => candidate.id === round.questionId);
    if (!question) throw new Error(`Public question ${round.questionId} is missing from the active catalog.`);
    const questionRevision = publicQuestionRevision(round, serverNow);
    const publicRound = {
      id: round.id,
      number: round.number,
      phase: round.phase,
      game: round.game,
      startedAt: round.startedAt,
      answerDeadline: round.answerDeadline,
      revealDeadline: round.revealDeadline,
      answerDuration: round.answerDuration,
    };
    const previousRound = round.number > 0 ? liveRoundAt(settings, round.number - 1, serverNow) : null;
    const recoveryNumbers = recoveryRoundNumbers(
      pendingRoundParam,
      room.id,
      round.number,
      live.isolated ? live.record.startedAt : undefined,
    );
    if (previousRound) recoveryNumbers.push(previousRound.number);
    const closedRounds = [...new Set(recoveryNumbers)]
      .map((number) => liveRoundAt(settings, number, serverNow))
      .filter((pastRound) => pastRound !== null);
    const awardVersion = settings.privateCode ? privateRoomAwardVersion(settings.privateCode) : 0;
    const [result, playerReport, previousCrowds] = await Promise.all([
      getRoundCrowd(round.id, room.id, effectivePlayerId, round.phase === "reveal"),
      getPlayerQuestionReport(
        room.gameId,
        room.contentVersion,
        round.questionId,
        questionCalibrationRevision(question),
        effectivePlayerId,
      ),
      effectivePlayerId && closedRounds.length
        ? Promise.all(
            closedRounds.map(async (pastRound) => {
              try {
                const missed = missedRoundResult(
                  pastRound.id,
                  await getRoundCrowd(pastRound.id, room.id, effectivePlayerId, true),
                );
                if (!missed) return null;
                const pastQuestion = GAME_CATALOGS[room.gameId].questions.find(
                  (candidate) => candidate.id === pastRound.questionId,
                );
                return { ...missed, game: pastRound.game, category: pastQuestion?.category };
              } catch {
                return null;
              }
            }),
          )
        : Promise.resolve([]),
    ]);
    const playerVote =
      result.playerVote && isKeyedAnswerQuestion(question)
        ? { ...result.playerVote, answerIndex: 0 }
        : result.playerVote;

    if (live.isolated && settings.privateCode) {
      if (round.phase === "reveal") {
        applyPrivateRoomCrowdBonus(
          settings.privateCode,
          round.id,
          crowdScoreMultiplier(result.scoreSummary?.correctCount ?? 0, result.total),
          serverNow,
          { awardVersion, total: result.total },
        );
      }
      const pendingIds = pendingPrivateRoomRoundIds(settings.privateCode, round.id);
      if (pendingIds.length) {
        const pendingAwardVersion = privateRoomAwardVersion(settings.privateCode);
        const crowds = await Promise.all(
          pendingIds.map(async (pendingRoundId) => {
            try {
              return await getRoundCrowd(pendingRoundId, room.id, undefined, true);
            } catch {
              return null;
            }
          }),
        );
        pendingIds.forEach((pendingRoundId, index) => {
          const crowd = crowds[index];
          if (!crowd) return;
          applyPrivateRoomCrowdBonus(
            settings.privateCode,
            pendingRoundId,
            crowdScoreMultiplier(crowd.scoreSummary?.correctCount ?? 0, crowd.total),
            serverNow,
            { awardVersion: pendingAwardVersion, total: crowd.total },
          );
        });
      }
    }

    return NextResponse.json(
      {
        serverNow,
        playerIdentity: accountUser
          ? { kind: "account", id: accountUser.id }
          : effectivePlayerId
            ? { kind: "guest", id: effectivePlayerId }
            : null,
        room,
        round: publicRound,
        questionRevision,
        question:
          knownQuestionRevision === questionRevision
            ? null
            : firstPartyArtTree(
                publicQuestionForRound(localizeQuestion(question, locale), round, serverNow, {
                  hiddenHero: t("question.hiddenHero"),
                  spellLink: t("question.spellLink"),
                }),
              ),
        presence: { activePlayers },
        crowd: {
          counts: round.phase === "reveal" ? result.counts : HIDDEN_COUNTS,
          total: result.total,
          keyCounts:
            round.phase === "reveal"
              ? prioritizedKeyCounts(
                  result.keyCounts,
                  [correctAnswerKey(question), playerVote?.answerKey],
                  MAX_REVEALED_KEY_CHOICES,
                )
              : [],
          scoreSummary: round.phase === "reveal" ? result.scoreSummary : null,
          community: round.phase === "reveal" ? roundTypeAccuracy(round.game, serverNow) : null,
        },
        playerVote,
        playerReport,
        previousResults: (previousCrowds ?? []).filter(Boolean),
      },
      {
        headers: {
          "Cache-Control": "no-store",
        },
      },
    );
  } catch (error) {
    logServerError("rounds.read", error);
    return NextResponse.json({ error: "Public room storage unavailable." }, { status: 503 });
  }
}

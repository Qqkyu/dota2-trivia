import { NextResponse, type NextRequest } from "next/server";
import type { CrowdResult } from "@/lib/arcade-contract";
import { sessionUserForRequest } from "@/lib/auth-session";
import { rateLimitRequest } from "@/lib/api-protection";
import { prioritizedKeyCounts } from "@/lib/crowd-split.mjs";
import { GAME_CATALOGS } from "@/lib/game-catalogs";
import { liveRoundAt, liveRoundForSettings } from "@/lib/private-room-rounds";
import { applyPrivateRoomCrowdBonus, pendingPrivateRoomRoundIds } from "@/lib/private-rooms.mjs";
import { parsePublicRoomSettings } from "@/lib/public-rooms";
import { crowdScoreMultiplier, missedRoundResult } from "@/lib/scoring.mjs";
import { publicQuestionForRound, publicQuestionRevision } from "@/lib/public-question";
import { questionCalibrationRevision } from "@/lib/question-revision.mjs";
import { correctAnswerKey, isKeyedAnswerQuestion } from "@/lib/keyed-answer";
import { touchRoomPresence } from "@/lib/room-presence.mjs";
import { logServerError } from "@/lib/server-diagnostics";
import { getPlayerQuestionReport, getRoundCrowd } from "@/lib/vote-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const HIDDEN_COUNTS: CrowdResult["counts"] = [0, 0, 0, 0];
const MAX_REVEALED_KEY_CHOICES = 12;

export async function GET(request: NextRequest) {
  const searchParams = new URL(request.url).searchParams;
  const settings = parsePublicRoomSettings({
    gameId: searchParams.get("gameId"),
    mode: searchParams.get("mode"),
    filter: searchParams.get("filter"),
    privateCode: searchParams.get("privateCode") ?? searchParams.get("room"),
  });
  const playerId = searchParams.get("playerId") ?? undefined;
  const knownQuestionRevision = searchParams.get("questionRevision") ?? undefined;

  if (!settings) {
    return NextResponse.json({ error: "Invalid public room settings." }, { status: 400 });
  }

  if (playerId && (playerId.length < 8 || playerId.length > 80)) {
    return NextResponse.json({ error: "Invalid player ID." }, { status: 400 });
  }
  if (knownQuestionRevision && knownQuestionRevision.length > 240) {
    return NextResponse.json({ error: "Invalid question revision." }, { status: 400 });
  }

  try {
    const accountUser = await sessionUserForRequest(request);
    const effectivePlayerId = accountUser ? `account:${accountUser.id}` : playerId;
    const rateLimited = rateLimitRequest(request, "rounds", effectivePlayerId ?? "anonymous", 180);
    if (rateLimited) return rateLimited;
    const serverNow = Date.now();
    const live = liveRoundForSettings(settings, serverNow);
    if ("error" in live) {
      const status = live.error === "waiting" ? 409 : 404;
      const error = live.error === "waiting" ? "Private room has not started." : "Unknown private room.";
      return NextResponse.json({ error }, { status, headers: { "Cache-Control": "no-store" } });
    }
    const { room, round } = live;
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
    const [result, playerReport, previousCrowd] = await Promise.all([
      getRoundCrowd(round.id, room.id, effectivePlayerId, round.phase === "reveal"),
      getPlayerQuestionReport(
        room.gameId,
        room.contentVersion,
        round.questionId,
        questionCalibrationRevision(question),
        effectivePlayerId,
      ),
      previousRound && effectivePlayerId
        ? getRoundCrowd(previousRound.id, room.id, effectivePlayerId, true)
        : Promise.resolve(null),
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
        );
      }
      const pendingIds = pendingPrivateRoomRoundIds(settings.privateCode, round.id);
      if (pendingIds.length) {
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
          );
        });
      }
    }

    return NextResponse.json(
      {
        serverNow,
        room,
        round: publicRound,
        questionRevision,
        question:
          knownQuestionRevision === questionRevision ? null : publicQuestionForRound(question, round, serverNow),
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
        },
        playerVote,
        playerReport,
        previousResult: previousRound ? missedRoundResult(previousRound.id, previousCrowd) : null,
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

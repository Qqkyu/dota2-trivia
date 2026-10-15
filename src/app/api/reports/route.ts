import { NextResponse, type NextRequest } from "next/server";
import { sessionUserForRequest } from "@/lib/auth-session";
import { preflightRateLimit, rateLimitRequest, readJsonBody, requestOriginAllowed } from "@/lib/api-protection";
import { validatedGuestIdentity } from "@/lib/guest-identity.mjs";
import { isReportReason, QUESTION_REPORT_GRACE_MS } from "@/lib/calibration";
import { GAME_CATALOGS } from "@/lib/game-catalogs";
import { liveRoundAt, liveRoundForSettings } from "@/lib/private-room-rounds";
import { privateRoomMember } from "@/lib/private-rooms.mjs";
import { parsePublicRoomSettings } from "@/lib/public-rooms";
import { questionCalibrationRevision } from "@/lib/question-revision.mjs";
import { logServerError } from "@/lib/server-diagnostics";
import { recordQuestionReport } from "@/lib/vote-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  if (!requestOriginAllowed(request)) {
    return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
  }
  const limited = preflightRateLimit(request, "reports", 300);
  if (limited) return limited;
  const parsed = await readJsonBody(request);
  if ("response" in parsed) return parsed.response;
  const { body } = parsed;

  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Missing report fields." }, { status: 400 });
  }

  const candidate = body as Record<string, unknown>;
  const settings = parsePublicRoomSettings({
    gameId: candidate.gameId,
    mode: candidate.mode,
    filter: candidate.filter,
    privateCode: candidate.privateCode ?? candidate.room,
  });
  const { roundId, reason, voterId } = candidate;

  if (
    !settings ||
    typeof roundId !== "string" ||
    !isReportReason(reason) ||
    typeof voterId !== "string" ||
    voterId.length < 8 ||
    voterId.length > 80
  ) {
    return NextResponse.json({ error: "Invalid report." }, { status: 400 });
  }

  let accountUser: Awaited<ReturnType<typeof sessionUserForRequest>>;
  try {
    accountUser = await sessionUserForRequest(request);
  } catch (error) {
    logServerError("reports.account-session", error);
    return NextResponse.json({ error: "Report storage unavailable." }, { status: 503 });
  }
  const effectiveVoterId = accountUser ? `account:${accountUser.id}` : validatedGuestIdentity(voterId);
  if (!effectiveVoterId) return NextResponse.json({ error: "Invalid player ID." }, { status: 400 });
  const rateLimited = rateLimitRequest(request, "reports", effectiveVoterId, 6);
  if (rateLimited) return rateLimited;

  const submittedAt = Date.now();
  const live = liveRoundForSettings(settings, submittedAt);
  if ("error" in live) {
    return NextResponse.json({ error: "That question is no longer reportable." }, { status: 409 });
  }
  if (live.isolated && settings.privateCode && !privateRoomMember(settings.privateCode, effectiveVoterId)) {
    return NextResponse.json({ error: "Join the party before reporting." }, { status: 403 });
  }
  const { room, round: currentRound } = live;
  const currentRevealMatches =
    currentRound.id === roundId && currentRound.phase === "reveal" && submittedAt < currentRound.revealDeadline;
  const previousRound = currentRound.number > 0 ? liveRoundAt(settings, currentRound.number - 1, submittedAt) : null;
  const previousGraceMatches =
    previousRound?.id === roundId && submittedAt < previousRound.revealDeadline + QUESTION_REPORT_GRACE_MS;
  const reportableRound = currentRevealMatches ? currentRound : previousGraceMatches ? previousRound : null;
  const question = reportableRound
    ? GAME_CATALOGS[room.gameId].questions.find((candidate) => candidate.id === reportableRound.questionId)
    : null;

  if (!reportableRound || !question) {
    return NextResponse.json({ error: "That question is no longer reportable." }, { status: 409 });
  }

  try {
    const result = await recordQuestionReport({
      gameId: room.gameId,
      contentVersion: room.contentVersion,
      questionId: reportableRound.questionId,
      questionRevision: questionCalibrationRevision(question),
      correctIndex: question.correctIndex,
      reason,
      voterId: effectiveVoterId,
      submittedAt,
    });

    return NextResponse.json(result, {
      headers: {
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    logServerError("reports.persist", error, { questionId: reportableRound.questionId.slice(0, 120) });
    return NextResponse.json({ error: "Report storage unavailable." }, { status: 503 });
  }
}

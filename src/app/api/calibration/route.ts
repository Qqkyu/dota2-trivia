import { NextResponse, type NextRequest } from "next/server";
import { isSameOriginMutation, sessionUserForRequest } from "@/lib/auth-session";
import { rateLimitRequest } from "@/lib/api-protection";
import { getCalibrationSnapshot, publicCalibrationSnapshot } from "@/lib/calibration-data";
import { DEFAULT_GAME_ID, GAME_CATALOGS, isGameId } from "@/lib/game-catalogs";
import { questionCalibrationRevision } from "@/lib/question-revision.mjs";
import { effectiveQuestionReviewStatus, isQuestionReviewer, isQuestionReviewState } from "@/lib/question-review";
import { logServerError } from "@/lib/server-diagnostics";
import { setQuestionReview } from "@/lib/vote-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const candidate = new URL(request.url).searchParams.get("gameId") ?? DEFAULT_GAME_ID;
  if (!isGameId(candidate)) {
    return NextResponse.json({ error: "Unknown game catalog." }, { status: 400 });
  }

  try {
    const [snapshot, user] = await Promise.all([
      getCalibrationSnapshot(candidate),
      sessionUserForRequest(request).catch(() => null),
    ]);
    return NextResponse.json(isQuestionReviewer(user) ? snapshot : publicCalibrationSnapshot(snapshot), {
      headers: {
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    logServerError("calibration.snapshot", error);
    return NextResponse.json({ error: "Calibration data unavailable." }, { status: 503 });
  }
}

export async function PATCH(request: NextRequest) {
  if (!isSameOriginMutation(request)) {
    return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
  }

  let user: Awaited<ReturnType<typeof sessionUserForRequest>>;
  try {
    user = await sessionUserForRequest(request);
  } catch (error) {
    logServerError("calibration.reviewer-session", error);
    return NextResponse.json({ error: "Review storage unavailable." }, { status: 503 });
  }
  if (!user) return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  if (!isQuestionReviewer(user)) return NextResponse.json({ error: "Reviewer access required." }, { status: 403 });

  const rateLimited = rateLimitRequest(request, "calibration-review", user.id, 40);
  if (rateLimited) return rateLimited;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid review payload." }, { status: 400 });
  }
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid review payload." }, { status: 400 });
  }
  const candidate = body as Record<string, unknown>;
  if (
    !isGameId(candidate.gameId) ||
    typeof candidate.questionId !== "string" ||
    typeof candidate.questionRevision !== "string" ||
    !isQuestionReviewState(candidate.state)
  ) {
    return NextResponse.json({ error: "Invalid review payload." }, { status: 400 });
  }

  const question = GAME_CATALOGS[candidate.gameId].questions.find((entry) => entry.id === candidate.questionId);
  if (!question || questionCalibrationRevision(question) !== candidate.questionRevision) {
    return NextResponse.json({ error: "That question revision is no longer current." }, { status: 409 });
  }

  try {
    const snapshot = await getCalibrationSnapshot(candidate.gameId);
    const record = snapshot.records.find((entry) => entry.questionId === candidate.questionId);
    if (!record) return NextResponse.json({ error: "Question calibration unavailable." }, { status: 404 });
    const stored = await setQuestionReview({
      gameId: candidate.gameId,
      questionId: candidate.questionId,
      questionRevision: candidate.questionRevision,
      state: candidate.state,
      reportTotalAtReview: record.reportTotal,
      signalStatusAtReview: record.signal.status,
      updatedAt: Date.now(),
    });
    return NextResponse.json(
      {
        review: {
          status: effectiveQuestionReviewStatus({
            review: stored,
            reportTotal: record.reportTotal,
            signalStatus: record.signal.status,
          }),
          storedState: stored.state,
          updatedAt: stored.updatedAt,
        },
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    logServerError("calibration.review-update", error, { questionId: candidate.questionId.slice(0, 120) });
    return NextResponse.json({ error: "Review storage unavailable." }, { status: 503 });
  }
}

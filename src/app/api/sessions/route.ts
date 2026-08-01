import { NextResponse, type NextRequest } from "next/server";
import { isAlphaFeedback, isAlphaSessionId } from "@/lib/alpha-analytics.mjs";
import {
  recordAlphaSessionFeedback,
  recordAlphaSessionFinish,
  recordAlphaSessionStart,
  type AlphaFeedback,
} from "@/lib/alpha-store";
import { isSameOriginMutation, sessionUserForRequest } from "@/lib/auth-session";
import { rateLimitRequest } from "@/lib/api-protection";
import { logServerError } from "@/lib/server-diagnostics";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type AlphaSessionAction = "start" | "finish" | "feedback";

function isAlphaSessionAction(value: unknown): value is AlphaSessionAction {
  return value === "start" || value === "finish" || value === "feedback";
}

export async function POST(request: NextRequest) {
  if (!isSameOriginMutation(request)) {
    return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid session payload." }, { status: 400 });
  }
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid session payload." }, { status: 400 });
  }

  const candidate = body as Record<string, unknown>;
  if (
    !isAlphaSessionAction(candidate.action) ||
    !isAlphaSessionId(candidate.sessionId) ||
    typeof candidate.voterId !== "string" ||
    candidate.voterId.length < 8 ||
    candidate.voterId.length > 80 ||
    (candidate.action === "feedback" && !isAlphaFeedback(candidate.feedback))
  ) {
    return NextResponse.json({ error: "Invalid session payload." }, { status: 400 });
  }

  let accountUser: Awaited<ReturnType<typeof sessionUserForRequest>>;
  try {
    accountUser = await sessionUserForRequest(request);
  } catch (error) {
    logServerError("alpha-session.account", error);
    return NextResponse.json({ error: "Session storage unavailable." }, { status: 503 });
  }

  const effectiveVoterId = accountUser ? `account:${accountUser.id}` : candidate.voterId;
  const rateLimited = rateLimitRequest(request, "alpha-session", effectiveVoterId, 30);
  if (rateLimited) return rateLimited;
  const identity = { sessionId: candidate.sessionId as string, voterId: effectiveVoterId };
  const now = Date.now();

  try {
    if (candidate.action === "start") await recordAlphaSessionStart(identity, now);
    if (candidate.action === "finish") await recordAlphaSessionFinish(identity, now);
    if (candidate.action === "feedback") {
      await recordAlphaSessionFeedback(identity, candidate.feedback as AlphaFeedback, now);
    }
    return NextResponse.json(
      {
        accepted: true,
        ...(candidate.action === "feedback" ? { feedback: candidate.feedback } : {}),
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    logServerError("alpha-session.persist", error, { action: candidate.action });
    return NextResponse.json({ error: "Session storage unavailable." }, { status: 503 });
  }
}

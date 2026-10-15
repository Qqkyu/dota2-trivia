import { NextResponse, type NextRequest } from "next/server";
import { isAlphaSessionId } from "@/lib/alpha-analytics.mjs";
import { recordAlphaSessionFinish, recordAlphaSessionStart } from "@/lib/alpha-store";
import { sessionUserForRequest } from "@/lib/auth-session";
import { preflightRateLimit, rateLimitRequest, readJsonBody, requestOriginAllowed } from "@/lib/api-protection";
import { validatedGuestIdentity } from "@/lib/guest-identity.mjs";
import { logServerError } from "@/lib/server-diagnostics";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type AlphaSessionAction = "start" | "finish";

function isAlphaSessionAction(value: unknown): value is AlphaSessionAction {
  return value === "start" || value === "finish";
}

export async function POST(request: NextRequest) {
  if (!requestOriginAllowed(request)) {
    return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
  }

  const limited = preflightRateLimit(request, "alpha-session", 300);
  if (limited) return limited;
  const parsed = await readJsonBody(request);
  if ("response" in parsed) return parsed.response;
  const { body } = parsed;
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid session payload." }, { status: 400 });
  }

  const candidate = body as Record<string, unknown>;
  if (
    !isAlphaSessionAction(candidate.action) ||
    !isAlphaSessionId(candidate.sessionId) ||
    typeof candidate.voterId !== "string" ||
    candidate.voterId.length < 8 ||
    candidate.voterId.length > 80
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

  const effectiveVoterId = accountUser ? `account:${accountUser.id}` : validatedGuestIdentity(candidate.voterId);
  if (!effectiveVoterId) return NextResponse.json({ error: "Invalid player ID." }, { status: 400 });
  const rateLimited = rateLimitRequest(request, "alpha-session", effectiveVoterId, 30);
  if (rateLimited) return rateLimited;
  const identity = { sessionId: candidate.sessionId as string, voterId: effectiveVoterId };
  const now = Date.now();

  try {
    if (candidate.action === "start") await recordAlphaSessionStart(identity, now);
    if (candidate.action === "finish") await recordAlphaSessionFinish(identity, now);
    return NextResponse.json({ accepted: true }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    logServerError("alpha-session.persist", error, { action: candidate.action });
    return NextResponse.json({ error: "Session storage unavailable." }, { status: 503 });
  }
}

import { NextResponse, type NextRequest } from "next/server";
import { clearAccountSessionCookie, configuredApplicationOrigin, revokeAccountSession } from "@/lib/auth-session";
import { preflightRateLimit, requestOriginAllowed } from "@/lib/api-protection";
import { logServerError } from "@/lib/server-diagnostics";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  if (!requestOriginAllowed(request)) {
    return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
  }
  const limited = preflightRateLimit(request, "logout", 150);
  if (limited) return limited;
  try {
    await revokeAccountSession(request);
  } catch (error) {
    logServerError("auth.logout", error);
  }
  const response = NextResponse.redirect(new URL("/", configuredApplicationOrigin(request)), 303);
  clearAccountSessionCookie(response);
  return response;
}

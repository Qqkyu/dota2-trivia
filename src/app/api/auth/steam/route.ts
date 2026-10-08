import { NextResponse, type NextRequest } from "next/server";
import { configuredApplicationOrigin, configuredAuthSecret } from "@/lib/auth-session";
import { rateLimitRequest } from "@/lib/api-protection";
import { logServerError } from "@/lib/server-diagnostics";
import { createSteamState, safeReturnTo, STEAM_STATE_COOKIE, steamLoginUrl } from "@/lib/steam-auth.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const limited = rateLimitRequest(request, "steam-auth-start", "steam", 120, 120);
  if (limited) return limited;

  try {
    const origin = configuredApplicationOrigin(request);
    const state = createSteamState({
      secret: configuredAuthSecret(),
      returnTo: safeReturnTo(request.nextUrl.searchParams.get("returnTo")),
    });
    const response = NextResponse.redirect(steamLoginUrl(origin, state), 302);
    response.cookies.set(STEAM_STATE_COOKIE, state, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/api/auth/steam",
      maxAge: 10 * 60,
    });
    response.headers.set("Cache-Control", "no-store");
    return response;
  } catch (error) {
    logServerError("auth.steam-start", error);
    return NextResponse.json({ error: "Steam sign-in is unavailable." }, { status: 503 });
  }
}

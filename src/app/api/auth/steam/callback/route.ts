import { NextResponse, type NextRequest } from "next/server";
import {
  configuredApplicationOrigin,
  configuredAuthSecret,
  issueAccountSession,
  setAccountSessionCookie,
} from "@/lib/auth-session";
import { rateLimitRequest } from "@/lib/api-protection";
import { upsertSteamUser } from "@/lib/account-store";
import {
  STEAM_OPENID_ENDPOINT,
  STEAM_OPENID_NAMESPACE,
  STEAM_STATE_COOKIE,
  steamIdFromClaimedId,
  steamVerificationBody,
  verifySteamState,
} from "@/lib/steam-auth.mjs";
import { steamIdentityProfile } from "@/lib/steam-profile";
import { logServerError } from "@/lib/server-diagnostics";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function clearState(response: NextResponse) {
  response.cookies.set(STEAM_STATE_COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/api/auth/steam",
    maxAge: 0,
  });
  response.headers.set("Cache-Control", "no-store");
  return response;
}

function failed(origin: string) {
  return clearState(NextResponse.redirect(new URL("/profile?authError=steam", origin), 303));
}

export async function GET(request: NextRequest) {
  const limited = rateLimitRequest(request, "steam-auth-callback", "steam", 20);
  if (limited) return limited;

  let origin: string | null = null;
  try {
    origin = configuredApplicationOrigin(request);
    const stateToken = request.nextUrl.searchParams.get("state");
    const stateCookie = request.cookies.get(STEAM_STATE_COOKIE)?.value;
    const state = verifySteamState(stateToken, { secret: configuredAuthSecret() });
    if (!state || !stateCookie || stateCookie !== stateToken) return failed(origin);

    const expectedReturnTo = new URL("/api/auth/steam/callback", origin);
    expectedReturnTo.searchParams.set("state", stateToken);
    const params = request.nextUrl.searchParams;
    const claimedId = params.get("openid.claimed_id");
    const steamId = steamIdFromClaimedId(claimedId);
    if (
      params.get("openid.ns") !== STEAM_OPENID_NAMESPACE ||
      params.get("openid.mode") !== "id_res" ||
      params.get("openid.op_endpoint") !== STEAM_OPENID_ENDPOINT ||
      params.get("openid.return_to") !== expectedReturnTo.href ||
      params.get("openid.identity") !== claimedId ||
      !steamId
    ) {
      return failed(origin);
    }

    const verification = await fetch(STEAM_OPENID_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: steamVerificationBody(params),
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    });
    const verificationText = await verification.text();
    if (!verification.ok || !/^is_valid:true\s*$/m.test(verificationText)) return failed(origin);

    const identity = await steamIdentityProfile(steamId);
    const user = await upsertSteamUser(identity);
    const session = await issueAccountSession(user.id);
    const response = NextResponse.redirect(new URL(state.returnTo, origin), 303);
    setAccountSessionCookie(response, session.token);
    return clearState(response);
  } catch (error) {
    logServerError("auth.steam-callback", error);
    return origin ? failed(origin) : NextResponse.json({ error: "Steam sign-in is unavailable." }, { status: 503 });
  }
}

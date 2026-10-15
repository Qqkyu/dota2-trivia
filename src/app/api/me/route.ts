import { NextResponse, type NextRequest } from "next/server";
import { clearAccountSessionCookie, sessionUserForRequest } from "@/lib/auth-session";
import { preflightRateLimit, requestOriginAllowed } from "@/lib/api-protection";
import { deleteAccountData, getAccountProfile } from "@/lib/account-store";
import { DEFAULT_GAME_ID } from "@/lib/game-catalogs";
import { logServerError } from "@/lib/server-diagnostics";
import { refreshSteamIdentityIfNeeded } from "@/lib/steam-profile";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const limited = preflightRateLimit(request, "profile-read", 600);
  if (limited) return limited;
  try {
    const user = await sessionUserForRequest(request);
    if (!user) {
      return NextResponse.json({ authenticated: false }, { headers: { "Cache-Control": "no-store" } });
    }
    let resolved = user;
    try {
      resolved = await refreshSteamIdentityIfNeeded(user);
    } catch (error) {
      logServerError("profile.steam-refresh", error);
    }
    const profile = await getAccountProfile(resolved.id, DEFAULT_GAME_ID);
    return NextResponse.json(profile ? { authenticated: true, profile } : { authenticated: false }, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    logServerError("profile.load", error);
    return NextResponse.json({ error: "Profile storage unavailable." }, { status: 503 });
  }
}

export async function DELETE(request: NextRequest) {
  if (!requestOriginAllowed(request)) {
    return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
  }
  const limited = preflightRateLimit(request, "profile-delete", 10);
  if (limited) return limited;
  try {
    const user = await sessionUserForRequest(request);
    if (!user) return NextResponse.json({ error: "Sign in required." }, { status: 401 });
    await deleteAccountData(user.id);
    const response = NextResponse.json({ deleted: true });
    clearAccountSessionCookie(response);
    return response;
  } catch (error) {
    logServerError("profile.delete", error);
    return NextResponse.json({ error: "Profile deletion failed." }, { status: 503 });
  }
}

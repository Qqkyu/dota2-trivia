import { NextResponse, type NextRequest } from "next/server";
import { deleteAlphaVisitor } from "@/lib/alpha-store";
import { clearAccountSessionCookie, isSameOriginMutation, sessionUserForRequest } from "@/lib/auth-session";
import { deleteAccount, getAccountProfile } from "@/lib/account-store";
import { DEFAULT_GAME_ID } from "@/lib/game-catalogs";
import { logServerError } from "@/lib/server-diagnostics";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const user = await sessionUserForRequest(request);
    if (!user) {
      return NextResponse.json({ authenticated: false }, { headers: { "Cache-Control": "no-store" } });
    }
    const profile = await getAccountProfile(user.id, DEFAULT_GAME_ID);
    return NextResponse.json(profile ? { authenticated: true, profile } : { authenticated: false }, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    logServerError("profile.load", error);
    return NextResponse.json({ error: "Profile storage unavailable." }, { status: 503 });
  }
}

export async function DELETE(request: NextRequest) {
  if (!isSameOriginMutation(request)) {
    return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
  }
  try {
    const user = await sessionUserForRequest(request);
    if (!user) return NextResponse.json({ error: "Sign in required." }, { status: 401 });
    await deleteAlphaVisitor(`account:${user.id}`);
    await deleteAccount(user.id);
    const response = NextResponse.json({ deleted: true });
    clearAccountSessionCookie(response);
    return response;
  } catch (error) {
    logServerError("profile.delete", error);
    return NextResponse.json({ error: "Profile deletion failed." }, { status: 503 });
  }
}

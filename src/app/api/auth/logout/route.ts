import { NextResponse, type NextRequest } from "next/server";
import {
  clearAccountSessionCookie,
  configuredApplicationOrigin,
  isSameOriginMutation,
  revokeAccountSession,
} from "@/lib/auth-session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  if (!isSameOriginMutation(request)) {
    return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
  }
  try {
    await revokeAccountSession(request);
  } catch (error) {
    console.error("Could not revoke the Queue Arcade session during sign-out.", error);
  }
  const response = NextResponse.redirect(new URL("/", configuredApplicationOrigin(request)), 303);
  clearAccountSessionCookie(response);
  return response;
}

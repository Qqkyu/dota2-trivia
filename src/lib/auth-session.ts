import { randomBytes } from "node:crypto";
import type { NextResponse } from "next/server";
import { createAccountSession, deleteAccountSession, getUserBySession } from "@/lib/account-store";
import { ACCOUNT_SESSION_COOKIE, ACCOUNT_SESSION_MAX_AGE_SECONDS, sessionTokenHash } from "@/lib/steam-auth.mjs";

export function configuredAuthSecret() {
  const configured = process.env.ARCADE_AUTH_SECRET?.trim();
  if (configured) {
    if (process.env.NODE_ENV === "production" && configured.length < 32) {
      throw new Error("ARCADE_AUTH_SECRET must contain at least 32 characters in production.");
    }
    if (process.env.NODE_ENV === "production" && configured === process.env.ARCADE_VOTER_SALT?.trim()) {
      throw new Error("ARCADE_AUTH_SECRET must be separate from ARCADE_VOTER_SALT.");
    }
    return configured;
  }
  if (process.env.NODE_ENV === "production") throw new Error("ARCADE_AUTH_SECRET is required in production.");
  return "queue-arcade-local-auth-v1";
}

export function configuredApplicationOrigin(request: Request) {
  const configured = process.env.ARCADE_APP_URL?.trim();
  if (!configured && process.env.NODE_ENV === "production") {
    throw new Error("ARCADE_APP_URL is required in production.");
  }
  const parsed = new URL(configured || request.url);
  const localHttp = parsed.protocol === "http:" && ["localhost", "127.0.0.1"].includes(parsed.hostname);
  if (parsed.protocol !== "https:" && !localHttp) throw new Error("Queue Arcade requires an HTTPS application URL.");
  if (configured && (parsed.username || parsed.password || parsed.pathname !== "/" || parsed.search || parsed.hash)) {
    throw new Error("ARCADE_APP_URL must contain only the canonical origin.");
  }
  return parsed.origin;
}

export function configuredDataCountries() {
  const configured = process.env.ARCADE_DATA_COUNTRIES?.trim();
  if (configured) return configured.slice(0, 160);
  if (process.env.NODE_ENV === "production") {
    throw new Error("ARCADE_DATA_COUNTRIES is required in production.");
  }
  return "the local development environment";
}

function cookieValue(request: Request, name: string) {
  const header = request.headers.get("cookie");
  if (!header) return null;
  for (const part of header.split(";")) {
    const [key, ...value] = part.trim().split("=");
    if (key === name) return decodeURIComponent(value.join("="));
  }
  return null;
}

export function sessionTokenForRequest(request: Request) {
  const token = cookieValue(request, ACCOUNT_SESSION_COOKIE);
  return token && /^[A-Za-z0-9_-]{32,128}$/.test(token) ? token : null;
}

export async function sessionUserForRequest(request: Request) {
  const token = sessionTokenForRequest(request);
  return token ? getUserBySession(sessionTokenHash(token)) : null;
}

export async function issueAccountSession(userId: string) {
  const token = randomBytes(32).toString("base64url");
  const createdAt = Date.now();
  const expiresAt = createdAt + ACCOUNT_SESSION_MAX_AGE_SECONDS * 1_000;
  await createAccountSession({ tokenHash: sessionTokenHash(token), userId, createdAt, expiresAt });
  return { token, expiresAt };
}

export async function revokeAccountSession(request: Request) {
  const token = sessionTokenForRequest(request);
  if (token) await deleteAccountSession(sessionTokenHash(token));
}

export function setAccountSessionCookie(response: NextResponse, token: string) {
  response.cookies.set(ACCOUNT_SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: ACCOUNT_SESSION_MAX_AGE_SECONDS,
  });
}

export function clearAccountSessionCookie(response: NextResponse) {
  response.cookies.set(ACCOUNT_SESSION_COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  });
}

export function isSameOriginMutation(request: Request) {
  const expected = configuredApplicationOrigin(request);
  const origin = request.headers.get("origin");
  if (origin) return origin === expected;
  const referer = request.headers.get("referer");
  if (!referer) return false;
  try {
    return new URL(referer).origin === expected;
  } catch {
    return false;
  }
}

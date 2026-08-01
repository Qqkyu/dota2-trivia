import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

export const STEAM_OPENID_ENDPOINT = "https://steamcommunity.com/openid/login";
export const STEAM_OPENID_NAMESPACE = "http://specs.openid.net/auth/2.0";
export const STEAM_OPENID_IDENTIFIER = "http://specs.openid.net/auth/2.0/identifier_select";
export const STEAM_STATE_COOKIE = "queue_arcade_steam_state";
export const ACCOUNT_SESSION_COOKIE = "queue_arcade_session";
export const ACCOUNT_SESSION_MAX_AGE_SECONDS = 30 * 24 * 60 * 60;
const STEAM_STATE_MAX_AGE_MS = 10 * 60 * 1000;

function encode(value) {
  return Buffer.from(value, "utf8").toString("base64url");
}

function decode(value) {
  return Buffer.from(value, "base64url").toString("utf8");
}

function signatureFor(payload, secret) {
  return createHmac("sha256", secret).update(payload).digest("base64url");
}

function signaturesMatch(left, right) {
  const leftBytes = Buffer.from(left);
  const rightBytes = Buffer.from(right);
  return leftBytes.length === rightBytes.length && timingSafeEqual(leftBytes, rightBytes);
}

export function safeReturnTo(value) {
  if (typeof value !== "string" || !value.startsWith("/") || value.startsWith("//")) return "/";
  try {
    const parsed = new URL(value, "https://queue-arcade.invalid");
    if (parsed.origin !== "https://queue-arcade.invalid") return "/";
    if (!["/", "/play", "/profile", "/ops"].includes(parsed.pathname)) return "/";
    return `${parsed.pathname}${parsed.search}`;
  } catch {
    return "/";
  }
}

export function createSteamState({
  secret,
  returnTo = "/",
  now = Date.now(),
  nonce = randomBytes(24).toString("base64url"),
}) {
  const payload = encode(JSON.stringify({ nonce, returnTo: safeReturnTo(returnTo), issuedAt: now }));
  return `${payload}.${signatureFor(payload, secret)}`;
}

export function verifySteamState(token, { secret, now = Date.now() }) {
  if (typeof token !== "string") return null;
  const [payload, signature, extra] = token.split(".");
  if (!payload || !signature || extra || !signaturesMatch(signature, signatureFor(payload, secret))) return null;
  try {
    const parsed = JSON.parse(decode(payload));
    if (
      typeof parsed.nonce !== "string" ||
      parsed.nonce.length < 20 ||
      typeof parsed.issuedAt !== "number" ||
      parsed.issuedAt > now + 30_000 ||
      now - parsed.issuedAt > STEAM_STATE_MAX_AGE_MS
    ) {
      return null;
    }
    return { returnTo: safeReturnTo(parsed.returnTo), issuedAt: parsed.issuedAt };
  } catch {
    return null;
  }
}

export function steamIdFromClaimedId(claimedId) {
  if (typeof claimedId !== "string") return null;
  const match = /^https:\/\/steamcommunity\.com\/openid\/id\/(\d{15,20})$/.exec(claimedId);
  if (!match) return null;
  try {
    const steamId = BigInt(match[1]);
    return steamId > 0n && steamId <= 18_446_744_073_709_551_615n ? match[1] : null;
  } catch {
    return null;
  }
}

export function steamLoginUrl(origin, state) {
  const callback = new URL("/api/auth/steam/callback", origin);
  callback.searchParams.set("state", state);
  const login = new URL(STEAM_OPENID_ENDPOINT);
  login.searchParams.set("openid.ns", STEAM_OPENID_NAMESPACE);
  login.searchParams.set("openid.mode", "checkid_setup");
  login.searchParams.set("openid.return_to", callback.href);
  login.searchParams.set("openid.realm", `${new URL(origin).origin}/`);
  login.searchParams.set("openid.identity", STEAM_OPENID_IDENTIFIER);
  login.searchParams.set("openid.claimed_id", STEAM_OPENID_IDENTIFIER);
  return login;
}

export function steamVerificationBody(searchParams) {
  const body = new URLSearchParams();
  for (const [key, value] of searchParams) {
    if (key.startsWith("openid.")) body.set(key, value);
  }
  body.set("openid.mode", "check_authentication");
  return body;
}

export function sessionTokenHash(token) {
  return createHash("sha256").update(token).digest("base64url");
}

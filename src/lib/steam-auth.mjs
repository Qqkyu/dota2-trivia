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
  if (typeof token !== "string" || token.length > 4_096) return null;
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
  const match = /^https?:\/\/steamcommunity\.com\/openid\/id\/(\d{15,20})$/.exec(claimedId);
  if (!match || match[0] !== claimedId) return null;
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

/** Keep one immutable value for every callback field, including state. */
export function steamCallbackParameters(searchParams) {
  const fields = Object.create(null);
  for (const [key, value] of searchParams) {
    if (key !== "state" && !key.startsWith("openid.")) continue;
    if (Object.hasOwn(fields, key) || key.length > 100 || value.length > 4_096) return null;
    fields[key] = value;
  }
  return Object.freeze(fields);
}

/** Validate the same immutable assertion that will be sent to Steam. */
export function steamAssertionIdentity(fields, expectedReturnTo, now = Date.now()) {
  if (!fields) return null;
  const claimedId = fields["openid.claimed_id"];
  const steamId = steamIdFromClaimedId(claimedId);
  if (
    fields["openid.ns"] !== STEAM_OPENID_NAMESPACE ||
    fields["openid.mode"] !== "id_res" ||
    fields["openid.op_endpoint"] !== STEAM_OPENID_ENDPOINT ||
    fields["openid.return_to"] !== expectedReturnTo ||
    fields["openid.identity"] !== claimedId ||
    !steamId ||
    !fields["openid.sig"] ||
    !fields["openid.assoc_handle"]
  )
    return null;

  const signed = (fields["openid.signed"] ?? "").split(",");
  const required = ["op_endpoint", "claimed_id", "identity", "return_to", "response_nonce", "assoc_handle"];
  if (new Set(signed).size !== signed.length || required.some((key) => !signed.includes(key))) return null;
  const nonce = fields["openid.response_nonce"] ?? "";
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z[\x21-\x7e]{1,200}$/.test(nonce)) return null;
  const issuedAt = Date.parse(nonce.slice(0, 20));
  if (!Number.isFinite(issuedAt) || issuedAt > now + 60_000 || now - issuedAt > STEAM_STATE_MAX_AGE_MS) return null;
  return steamId;
}

export function steamVerificationBody(parameters) {
  const fields = parameters instanceof URLSearchParams ? steamCallbackParameters(parameters) : parameters;
  if (!fields) throw new Error("Duplicate Steam assertion parameters.");
  const body = new URLSearchParams();
  for (const [key, value] of Object.entries(fields)) {
    if (key.startsWith("openid.")) body.set(key, value);
  }
  body.set("openid.mode", "check_authentication");
  return body;
}

export function steamVerificationSucceeded(text) {
  if (typeof text !== "string" || text.length > 4_096) return false;
  const fields = Object.create(null);
  for (const line of text.trim().split(/\r?\n/)) {
    const separator = line.indexOf(":");
    if (separator < 1) return false;
    const key = line.slice(0, separator);
    if (Object.hasOwn(fields, key)) return false;
    fields[key] = line.slice(separator + 1);
  }
  return fields.ns === STEAM_OPENID_NAMESPACE && fields.is_valid === "true";
}

export function accountSessionToken(cookieHeader) {
  if (typeof cookieHeader !== "string") return null;
  for (const part of cookieHeader.split(";")) {
    const [key, ...value] = part.trim().split("=");
    if (key !== ACCOUNT_SESSION_COOKIE) continue;
    try {
      const token = decodeURIComponent(value.join("="));
      return /^[A-Za-z0-9_-]{32,128}$/.test(token) ? token : null;
    } catch {
      return null;
    }
  }
  return null;
}

export function sessionTokenHash(token) {
  return createHash("sha256").update(token).digest("base64url");
}

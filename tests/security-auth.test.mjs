import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import {
  ACCOUNT_SESSION_COOKIE,
  STEAM_OPENID_ENDPOINT,
  STEAM_OPENID_NAMESPACE,
  STEAM_STATE_COOKIE,
  accountSessionToken,
  createSteamState,
  steamIdFromClaimedId,
  steamAssertionIdentity,
  steamCallbackParameters,
  steamVerificationBody,
  steamVerificationSucceeded,
} from "../src/lib/steam-auth.mjs";
import { validatedGuestIdentity } from "../src/lib/guest-identity.mjs";

const stores = vi.hoisted(() => ({ upsert: vi.fn(), createSession: vi.fn(), profile: vi.fn(), consumeNonce: vi.fn() }));
vi.mock("../src/lib/account-store", () => ({
  upsertSteamUser: stores.upsert,
  createAccountSession: stores.createSession,
  deleteAccountSession: vi.fn(),
  getUserBySession: vi.fn(),
  consumeSteamLoginNonce: stores.consumeNonce,
}));
vi.mock("../src/lib/steam-profile", () => ({ steamIdentityProfile: stores.profile }));

import { GET as steamCallback } from "../src/app/api/auth/steam/callback/route.ts";
import { GET as steamStart } from "../src/app/api/auth/steam/route.ts";
import { isSameOriginMutation, sessionTokenForRequest } from "../src/lib/auth-session.ts";

const origin = "https://arcade.example";
const now = Date.parse("2026-10-06T10:00:00Z");
const steamId = "76561198000000000";
const secret = "test-auth-secret-used-only-by-unit-tests";

function assertion() {
  const state = createSteamState({ secret, now, returnTo: "/profile" });
  const returnTo = new URL("/api/auth/steam/callback", origin);
  returnTo.searchParams.set("state", state);
  const params = new URLSearchParams({
    state,
    "openid.ns": STEAM_OPENID_NAMESPACE,
    "openid.mode": "id_res",
    "openid.op_endpoint": STEAM_OPENID_ENDPOINT,
    "openid.return_to": returnTo.href,
    "openid.claimed_id": `https://steamcommunity.com/openid/id/${steamId}`,
    "openid.identity": `https://steamcommunity.com/openid/id/${steamId}`,
    "openid.response_nonce": "2026-10-06T10:00:00Ztest-nonce",
    "openid.assoc_handle": "test-association",
    "openid.signed": "op_endpoint,claimed_id,identity,return_to,response_nonce,assoc_handle",
    "openid.sig": "test-signature",
  });
  return { params, state, returnTo: returnTo.href };
}

function callbackRequest(params, state) {
  return new NextRequest(`${origin}/api/auth/steam/callback?${params}`, {
    headers: { cookie: `${STEAM_STATE_COOKIE}=${encodeURIComponent(state)}` },
  });
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(now);
  vi.stubEnv("NODE_ENV", "test");
  vi.stubEnv("ARCADE_APP_URL", origin);
  vi.stubEnv("ARCADE_AUTH_SECRET", secret);
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(`ns:${STEAM_OPENID_NAMESPACE}\nis_valid:true\n`)),
  );
  stores.profile.mockReset().mockImplementation(async (id) => ({ steamId: id, displayName: "Test player" }));
  stores.upsert
    .mockReset()
    .mockImplementation(async (identity) => ({ ...identity, id: `test-user-${identity.steamId}` }));
  stores.createSession.mockReset().mockResolvedValue(undefined);
  stores.consumeNonce.mockReset().mockResolvedValue(true);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.useRealTimers();
});

describe("Steam assertion identity", () => {
  it("uses the configured HTTPS origin and protected state cookie for login", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const response = await steamStart(
      new NextRequest("https://untrusted.example/api/auth/steam?returnTo=%2Fprofile", {
        headers: { "x-forwarded-host": "untrusted.example", "x-forwarded-proto": "http" },
      }),
    );
    expect(response.status).toBe(302);
    const location = new URL(response.headers.get("location"));
    expect(`${location.origin}${location.pathname}`).toBe(STEAM_OPENID_ENDPOINT);
    expect(location.searchParams.get("openid.realm")).toBe(`${origin}/`);
    expect(new URL(location.searchParams.get("openid.return_to")).origin).toBe(origin);
    const cookie = response.cookies.get(STEAM_STATE_COOKIE);
    expect(cookie).toMatchObject({
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      path: "/api/auth/steam",
      maxAge: 600,
    });
    expect(new URL(location.searchParams.get("openid.return_to")).searchParams.get("state")).toBe(cookie.value);
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  it("sets a protected production account cookie and clears the login state after verification", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const { params, state } = assertion();
    const response = await steamCallback(callbackRequest(params, state));
    expect(response.status).toBe(303);
    expect(response.cookies.get(ACCOUNT_SESSION_COOKIE)).toMatchObject({
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      path: "/",
      maxAge: 30 * 24 * 60 * 60,
    });
    expect(response.cookies.get(STEAM_STATE_COOKIE)).toMatchObject({ maxAge: 0, path: "/api/auth/steam" });
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  it.each(["cancel", "expired-state", "invalid-state-signature"])("rejects %s before provider access", async (kind) => {
    const { params, state } = assertion();
    if (kind === "cancel") params.set("openid.mode", "cancel");
    if (kind === "expired-state") vi.setSystemTime(now + 10 * 60_000 + 1);
    if (kind === "invalid-state-signature") params.set("state", `${state.slice(0, -1)}!`);
    const response = await steamCallback(callbackRequest(params, params.get("state")));
    expect(response.status).toBe(303);
    expect(fetch).not.toHaveBeenCalled();
    expect(stores.upsert).not.toHaveBeenCalled();
    expect(stores.createSession).not.toHaveBeenCalled();
  });

  it.each(["timeout", "http-error", "oversized-response"])("fails closed on provider %s", async (kind) => {
    if (kind === "timeout") fetch.mockRejectedValue(new DOMException("Synthetic timeout", "TimeoutError"));
    if (kind === "http-error") fetch.mockResolvedValue(new Response("provider unavailable", { status: 503 }));
    if (kind === "oversized-response") fetch.mockResolvedValue(new Response("x".repeat(4097)));
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    try {
      const { params, state } = assertion();
      const response = await steamCallback(callbackRequest(params, state));
      expect(response.headers.get("location")).toBe(`${origin}/profile?authError=steam`);
      expect(stores.consumeNonce).not.toHaveBeenCalled();
      expect(stores.upsert).not.toHaveBeenCalled();
      expect(stores.createSession).not.toHaveBeenCalled();
      expect(response.cookies.get(ACCOUNT_SESSION_COOKIE)).toBeUndefined();
      expect(fetch.mock.calls[0][1].signal).toBeInstanceOf(AbortSignal);
    } finally {
      log.mockRestore();
    }
  });

  it.each(["cookie", "return-origin", "return-state"])(
    "rejects a mismatched %s before contacting Steam",
    async (kind) => {
      const { params, state } = assertion();
      let cookieState = state;
      if (kind === "cookie") cookieState = createSteamState({ secret, now, nonce: "different-state-nonce-12345678" });
      if (kind === "return-origin") {
        const returnTo = new URL(params.get("openid.return_to"));
        returnTo.hostname = "other.example";
        params.set("openid.return_to", returnTo.href);
      }
      if (kind === "return-state") {
        const returnTo = new URL(params.get("openid.return_to"));
        returnTo.searchParams.set("state", "different-state");
        params.set("openid.return_to", returnTo.href);
      }
      const response = await steamCallback(callbackRequest(params, cookieState));
      expect(response.headers.get("location")).toBe(`${origin}/profile?authError=steam`);
      expect(fetch).not.toHaveBeenCalled();
      expect(stores.createSession).not.toHaveBeenCalled();
    },
  );

  it.each(["http", "https"])("uses the verified %s identity for the issued account session", async (scheme) => {
    const { params, state } = assertion();
    params.set("openid.claimed_id", `${scheme}://steamcommunity.com/openid/id/${steamId}`);
    params.set("openid.identity", params.get("openid.claimed_id"));
    const response = await steamCallback(callbackRequest(params, state));
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe(`${origin}/profile`);
    const sent = fetch.mock.calls[0][1].body;
    expect(sent.get("openid.claimed_id")).toBe(params.get("openid.claimed_id"));
    expect(sent.get("openid.mode")).toBe("check_authentication");
    expect(stores.profile).toHaveBeenCalledWith(steamId);
    expect(stores.createSession).toHaveBeenCalledWith(expect.objectContaining({ userId: `test-user-${steamId}` }));
    expect(response.cookies.get(ACCOUNT_SESSION_COOKIE)?.value).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(fetch.mock.calls[0][0]).toBe("https://steamcommunity.com/openid/login");
  });

  it.each([
    `https://steamcommunity.com.evil.example/openid/id/${steamId}`,
    `https://evil.example/https://steamcommunity.com/openid/id/${steamId}`,
    `https://steamcommunity.com@evil.example/openid/id/${steamId}`,
    `https://steamcommunity.com:443/openid/id/${steamId}`,
    `http://steamcommunity.com:80/openid/id/${steamId}`,
    `https://steamcommunity.com/openid/id/${steamId}/extra`,
    `https://steamcommunity.com/openid/id/${steamId}?extra=value`,
    `https://steamcommunity.com/openid/id/${steamId}#fragment`,
    `https://steamcommunity.com/openid%2Fid/${steamId}`,
    `https://steamcommunity.com/openid/id/${steamId}\n`,
    `ftp://steamcommunity.com/openid/id/${steamId}`,
  ])("rejects a claimed ID outside the exact documented namespace: %s", (claimedId) => {
    expect(steamIdFromClaimedId(claimedId)).toBeNull();
    const { params, returnTo } = assertion();
    params.set("openid.claimed_id", claimedId);
    params.set("openid.identity", claimedId);
    expect(steamAssertionIdentity(steamCallbackParameters(params), returnTo, now)).toBeNull();
  });

  it.each([
    "state",
    "openid.ns",
    "openid.mode",
    "openid.op_endpoint",
    "openid.return_to",
    "openid.identity",
    "openid.claimed_id",
    "openid.response_nonce",
    "openid.assoc_handle",
    "openid.signed",
    "openid.sig",
  ])("rejects a repeated %s before provider verification or session creation", async (key) => {
    const { params, state } = assertion();
    params.append(key, params.get(key));
    const response = await steamCallback(callbackRequest(params, state));
    expect(response.headers.get("location")).toBe(`${origin}/profile?authError=steam`);
    expect(fetch).not.toHaveBeenCalled();
    expect(stores.upsert).not.toHaveBeenCalled();
    expect(stores.createSession).not.toHaveBeenCalled();
    expect(response.cookies.get(ACCOUNT_SESSION_COOKIE)).toBeUndefined();
  });

  it("rejects conflicting repeated identity values without collapsing them", () => {
    const { params } = assertion();
    params.append("openid.claimed_id", "https://steamcommunity.com/openid/id/76561198000000001");
    expect(steamCallbackParameters(params)).toBeNull();
    expect(() => steamVerificationBody(params)).toThrow(/Duplicate/);
  });

  it("keeps the assertion immutable after parsing", () => {
    const { params, returnTo } = assertion();
    const fields = steamCallbackParameters(params);
    params.set("openid.identity", "changed-after-parsing");
    expect(Object.isFrozen(fields)).toBe(true);
    expect(steamAssertionIdentity(fields, returnTo, now)).toBe(steamId);
    expect(steamVerificationBody(fields).get("openid.identity")).toBe(fields["openid.claimed_id"]);
  });

  it.each(["claimed_id", "identity", "return_to", "op_endpoint", "response_nonce", "assoc_handle"])(
    "requires %s to be signed",
    (field) => {
      const { params, returnTo } = assertion();
      params.set(
        "openid.signed",
        params
          .get("openid.signed")
          .split(",")
          .filter((key) => key !== field)
          .join(","),
      );
      expect(steamAssertionIdentity(steamCallbackParameters(params), returnTo, now)).toBeNull();
    },
  );

  it.each(["invalid", "2026-10-06T09:49:59Zold", "2026-10-06T10:02:00Zfuture"])(
    "rejects an invalid or stale response nonce",
    (nonce) => {
      const { params, returnTo } = assertion();
      params.set("openid.response_nonce", nonce);
      expect(steamAssertionIdentity(steamCallbackParameters(params), returnTo, now)).toBeNull();
    },
  );

  it("rejects an ambiguous or wrong provider verification response", async () => {
    expect(steamVerificationSucceeded(`ns:${STEAM_OPENID_NAMESPACE}\nis_valid:false\nis_valid:true`)).toBe(false);
    expect(steamVerificationSucceeded("is_valid:true")).toBe(false);
    fetch.mockResolvedValue(new Response(`ns:${STEAM_OPENID_NAMESPACE}\nis_valid:false\n`));
    const { params, state } = assertion();
    await steamCallback(callbackRequest(params, state));
    expect(stores.createSession).not.toHaveBeenCalled();
  });

  it("does not issue another session for an already consumed verified assertion", async () => {
    stores.consumeNonce.mockResolvedValue(false);
    const { params, state } = assertion();
    const response = await steamCallback(callbackRequest(params, state));
    expect(fetch).toHaveBeenCalledOnce();
    expect(response.headers.get("location")).toBe(`${origin}/profile?authError=steam`);
    expect(stores.upsert).not.toHaveBeenCalled();
    expect(stores.createSession).not.toHaveBeenCalled();
  });
});

describe("guest and browser identity boundaries", () => {
  it.each([
    "account:known-user",
    "Account:known-user",
    "steam:76561198000000000",
    "session:known-session",
    "user:known-player",
  ])("rejects the reserved guest identity %s", (value) => expect(validatedGuestIdentity(value)).toBeNull());

  it("accepts ordinary guest IDs and rejects invalid input", () => {
    expect(validatedGuestIdentity("guest-player-123")).toBe("guest-player-123");
    expect(validatedGuestIdentity("a09babd1-39cc-4278-9fe2-c5b7366d6768")).not.toBeNull();
    expect(validatedGuestIdentity("account%3Aknown-user")).toBeNull();
    expect(validatedGuestIdentity("short")).toBeNull();
    expect(validatedGuestIdentity({ playerId: "guest-player-123" })).toBeNull();
  });

  it("treats a malformed percent-encoded session cookie as absent", () => {
    expect(accountSessionToken(`${ACCOUNT_SESSION_COOKIE}=%E0%A4%A`)).toBeNull();
    expect(
      sessionTokenForRequest(new Request(origin, { headers: { cookie: `${ACCOUNT_SESSION_COOKIE}=%` } })),
    ).toBeNull();
  });

  it("accepts only the canonical origin or a same-origin referer for mutations", () => {
    expect(isSameOriginMutation(new Request(origin, { headers: { origin } }))).toBe(true);
    expect(isSameOriginMutation(new Request(origin, { headers: { referer: `${origin}/party` } }))).toBe(true);
    expect(
      isSameOriginMutation(new Request(origin, { headers: { origin: "https://other.example", referer: origin } })),
    ).toBe(false);
    expect(isSameOriginMutation(new Request(origin))).toBe(false);
  });
});

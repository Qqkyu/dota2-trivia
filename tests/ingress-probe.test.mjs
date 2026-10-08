import { randomBytes } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  authenticateIngressProbe,
  INGRESS_PROBE_PATH,
  ingressProbeAuthorization,
  ingressProbeProof,
} from "../src/lib/ingress-probe.mjs";
import { GET } from "../src/app/api/health/ingress/route.ts";

const env = {
  ARCADE_APP_URL: "https://arcade.example",
  ARCADE_AUTH_SECRET: "isolated-ingress-test-secret-at-least-32-characters",
  ARCADE_TRUST_PROXY: "none",
};
const now = Date.UTC(2026, 9, 6, 12);
const expiry = now / 1000 + 45;
const nonce = randomBytes(32).toString("base64url");
const authorization = ingressProbeAuthorization(env, nonce, expiry);
function probe(headers = {}, url = env.ARCADE_APP_URL + INGRESS_PROBE_PATH, method = "GET") {
  return new Request(url, { method, headers: { authorization, ...headers } });
}
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(now);
  for (const [key, value] of Object.entries(env)) vi.stubEnv(key, value);
  globalThis.__queueArcadeRateLimits?.clear();
  if (globalThis.__queueArcadeRateLimitExpiry) globalThis.__queueArcadeRateLimitExpiry.nextAt = Infinity;
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.useRealTimers();
});

describe("read-only ingress verification", () => {
  it("accepts only a correctly bound short-lived operator request", () => {
    expect(authenticateIngressProbe(probe(), env, now)).toEqual({ nonce });
    expect(authenticateIngressProbe(probe(), { ...env, ARCADE_AUTH_SECRET: "x".repeat(32) }, now)).toBeNull();
    expect(authenticateIngressProbe(probe(), { ...env, ARCADE_APP_URL: "https://other.example" }, now)).toBeNull();
    expect(authenticateIngressProbe(probe({}, env.ARCADE_APP_URL + "/api/health"), env, now)).toBeNull();
    expect(
      authenticateIngressProbe(probe({}, env.ARCADE_APP_URL + INGRESS_PROBE_PATH + "?extra=1"), env, now),
    ).toBeNull();
    expect(authenticateIngressProbe(probe({}, undefined, "POST"), env, now)).toBeNull();
  });
  it.each([undefined, "", "cf-connecting-ip", "x-real-ip", "x-forwarded-for", "all"])(
    "is unavailable with trust policy %s",
    (mode) => {
      expect(authenticateIngressProbe(probe(), { ...env, ARCADE_TRUST_PROXY: mode }, now)).toBeNull();
    },
  );
  it.each(["", "short", undefined])("rejects missing or short configured secrets", (secret) => {
    expect(authenticateIngressProbe(probe(), { ...env, ARCADE_AUTH_SECRET: secret }, now)).toBeNull();
  });
  it.each([
    "",
    "http://public.example",
    "https://example.com/path",
    "https://user:secret@example.com",
    "https://example.com?q=1",
  ])("rejects invalid origin %s", (origin) => {
    expect(authenticateIngressProbe(probe(), { ...env, ARCADE_APP_URL: origin }, now)).toBeNull();
  });
  it("rejects expired, long-lived, changed and noncanonical tokens", () => {
    expect(authenticateIngressProbe(probe(), env, expiry * 1000)).toBeNull();
    expect(authenticateIngressProbe(probe(), env, now - 16_000)).toBeNull();
    for (const token of [
      "",
      "Bearer " + authorization,
      authorization + "x",
      "x".repeat(200),
      authorization.replace("v1.", "v2."),
      authorization.slice(0, -1),
      authorization.slice(0, -1) + (authorization.endsWith("0") ? "1" : "0"),
    ])
      expect(authenticateIngressProbe(probe({ authorization: token }), env, now)).toBeNull();
    const noncanonical = nonce.slice(0, -1) + "B";
    expect(() => ingressProbeAuthorization(env, noncanonical, expiry)).toThrow();
  });
  it("returns only a nonce-bound proof and never raw request headers or secrets", async () => {
    const response = await GET(probe({ "cf-connecting-ip": "192.0.2.50", "x-real-ip": "198.51.100.1" }));
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    const body = await response.json();
    expect(body).toEqual({ version: 1, nonce, proof: ingressProbeProof(env, nonce, "192.0.2.50") });
    expect(body.proof).not.toBe(ingressProbeProof(env, randomBytes(32).toString("base64url"), "192.0.2.50"));
    expect(body.proof).not.toBe(ingressProbeProof(env, nonce, "198.51.100.1"));
    for (const value of ["192.0.2.50", "198.51.100.1", env.ARCADE_AUTH_SECRET, authorization])
      expect(JSON.stringify(body)).not.toContain(value);
  });
  it("keeps request signatures and response proofs separate", () => {
    const proof = ingressProbeProof(env, nonce, "192.0.2.50");
    expect(
      authenticateIngressProbe(probe({ authorization: `ArcadeIngress v1.${expiry}.${nonce}.${proof}` }), env, now),
    ).toBeNull();
  });
  it("returns the same no-store404 for unauthenticated, disabled, and oversized requests", async () => {
    const unauthenticated = await GET(probe({ authorization: "" }));
    const oversized = await GET(probe({ "cf-connecting-ip": "1".repeat(257) }));
    vi.stubEnv("ARCADE_TRUST_PROXY", "cf-connecting-ip");
    const disabled = await GET(probe());
    for (const response of [unauthenticated, oversized, disabled]) {
      expect(response.status).toBe(404);
      expect(response.headers.get("cache-control")).toBe("no-store");
      expect(await response.json()).toEqual({ error: "Not found" });
    }
  });
  it("uses one bounded operator budget that unauthenticated traffic cannot consume", async () => {
    for (let index = 0; index < 50; index++) expect((await GET(probe({ authorization: "invalid" }))).status).toBe(404);
    for (let index = 0; index < 24; index++)
      expect((await GET(probe({ "cf-connecting-ip": `192.0.2.${index + 1}` }))).status).toBe(200);
    expect((await GET(probe({ "cf-connecting-ip": "192.0.2.90" }))).status).toBe(404);
    expect(globalThis.__queueArcadeRateLimits.size).toBe(1);
  });
});

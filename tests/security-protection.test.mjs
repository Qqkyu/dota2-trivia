import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { admitRateLimitIdentity, consumeRateLimit, requestClientAddress } from "../src/lib/rate-limit.mjs";
import { readJsonBody } from "../src/lib/request-body.mjs";

const { originCheck } = vi.hoisted(() => ({ originCheck: vi.fn() }));
vi.mock("../src/lib/auth-session", () => ({ isSameOriginMutation: originCheck }));

import {
  preflightRateLimit,
  rateLimitRequest,
  requestOriginAllowed,
  requestPlayerIdentity,
} from "../src/lib/api-protection.ts";

function requestFor(playerId = "guest-player", headers = {}) {
  return new Request(`https://arcade.example/api/rounds?playerId=${encodeURIComponent(playerId)}`, { headers });
}

function jsonRequest(body, headers = {}) {
  return new Request("https://arcade.example/api/votes", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body,
    ...(body instanceof ReadableStream ? { duplex: "half" } : {}),
  });
}

beforeEach(() => {
  vi.stubEnv("NODE_ENV", "production");
  vi.stubEnv("ARCADE_TRUST_PROXY", "none");
  originCheck.mockReset().mockReturnValue(true);
  globalThis.__queueArcadeRateLimits.clear();
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.useRealTimers();
});

describe("request source policy", () => {
  it("ignores all forwarding headers unless their policy is enabled", () => {
    const request = requestFor("guest-player", {
      "cf-connecting-ip": "203.0.113.42",
      "x-real-ip": "192.0.2.12",
      "x-forwarded-for": "198.51.100.24",
    });
    expect(requestClientAddress(request)).toBe("unknown");
    expect(requestClientAddress(request, "bad-policy")).toBe("unknown");
    expect(requestClientAddress(request, "cf-connecting-ip")).toBe("203.0.113.42");
    expect(requestClientAddress(request, "x-real-ip")).toBe("192.0.2.12");
    expect(requestClientAddress(request, "x-forwarded-for")).toBe("198.51.100.24");
  });

  it("uses the last forwarded address, ignoring an untrusted prepended address", () => {
    const request = requestFor("guest-player", { "x-forwarded-for": "192.0.2.99, 198.51.100.24" });
    expect(requestClientAddress(request, "x-forwarded-for")).toBe("198.51.100.24");
  });

  it("does not enable trust merely because a Render environment variable exists", () => {
    vi.stubEnv("RENDER", "true");
    expect(requestClientAddress(requestFor("guest-player", { "cf-connecting-ip": "203.0.113.42" }))).toBe("unknown");
  });

  it.each([
    ["192.0.2.12", "192.0.2.12"],
    ["2001:0DB8:0:0:0:0:0:1", "2001:db8::1"],
    ["::ffff:192.0.2.12", "192.0.2.12"],
    ["::ffff:c000:20c", "192.0.2.12"],
  ])("reads only the configured Cloudflare address %s", (input, expected) => {
    const request = requestFor("guest-player", {
      "cf-connecting-ip": input,
      "x-real-ip": "198.51.100.1",
      "x-forwarded-for": "198.51.100.2, 198.51.100.3",
    });
    expect(requestClientAddress(request, "cf-connecting-ip")).toBe(expected);
  });

  it.each([undefined, "", "localhost", "192.0.2.12:5000", "192.0.2.1, 198.51.100.2", "fe80::1%eth0", "[::1]"])(
    "rejects invalid Cloudflare addresses without falling back to spoofable headers: %s",
    (value) => {
      const request = requestFor("guest-player", {
        ...(value === undefined ? {} : { "cf-connecting-ip": value }),
        "x-real-ip": "198.51.100.1",
        "x-forwarded-for": "198.51.100.2",
      });
      expect(requestClientAddress(request, "cf-connecting-ip")).toBe("unknown");
    },
  );

  it("canonicalizes equivalent IPv6 and IPv4-mapped addresses", () => {
    const address = (value) => requestClientAddress(requestFor("guest-player", { "x-real-ip": value }), "x-real-ip");
    expect(address("2001:0DB8:0:0:0:0:0:1")).toBe("2001:db8::1");
    expect(address("2001:db8::1")).toBe("2001:db8::1");
    expect(address("::ffff:192.0.2.12")).toBe("192.0.2.12");
    expect(address("::ffff:c000:20c")).toBe("192.0.2.12");
  });

  it.each(["", "proxy.example", "192.0.2.12:5000", "192.0.2.1, 198.51.100.2", "fe80::1%eth0", "bad-address"])(
    "shares the unknown bucket for invalid x-real-ip %s",
    (value) => {
      expect(requestClientAddress(requestFor("guest-player", { "x-real-ip": value }), "x-real-ip")).toBe("unknown");
    },
  );
});

describe("independent request limits", () => {
  it("blocks guest ID rotation at the IP allowance", () => {
    const scope = randomUUID();
    for (let index = 0; index < 10; index += 1) {
      const request = requestFor(`guest-id-${index}`);
      expect(rateLimitRequest(request, scope, requestPlayerIdentity(request), 2, 10)).toBeNull();
    }
    const blocked = rateLimitRequest(requestFor("guest-another"), scope, "guest-another", 2, 10);
    expect(blocked.status).toBe(429);
    expect(blocked.headers.get("ratelimit-limit")).toBe("10");
    expect(Number(blocked.headers.get("retry-after"))).toBeGreaterThan(0);
  });

  it("keeps a shared pseudoidentity independent between addresses", () => {
    vi.stubEnv("ARCADE_TRUST_PROXY", "x-real-ip");
    const scope = randomUUID();
    for (let index = 1; index <= 2; index += 1) {
      expect(
        rateLimitRequest(requestFor("guest-player", { "x-real-ip": `192.0.2.${index}` }), scope, "public-room", 1),
      ).toBeNull();
    }
    const blocked = rateLimitRequest(requestFor("guest-player", { "x-real-ip": "192.0.2.3" }), scope, "public-room", 1);
    expect(blocked).toBeNull();
    expect(
      rateLimitRequest(requestFor("guest-player", { "x-real-ip": "192.0.2.3" }), scope, "public-room", 1)?.status,
    ).toBe(429);
  });

  it("allows 100 guests behind one NAT to join and vote", () => {
    const joinScope = randomUUID();
    const voteScope = randomUUID();
    for (let index = 0; index < 100; index += 1) {
      const identity = `party-guest-${index}`;
      const request = requestFor(identity);
      expect(rateLimitRequest(request, joinScope, identity, 30)).toBeNull();
      expect(rateLimitRequest(request, voteScope, identity, 12)).toBeNull();
    }
  });

  it("keeps the default address allowance for already-admitted identities", () => {
    const scope = randomUUID();
    for (let index = 0; index < 300; index += 1) {
      expect(rateLimitRequest(requestFor(), scope, `guest-player-${index % 6}`, 60)).toBeNull();
    }
    expect(rateLimitRequest(requestFor(), scope, "guest-player-0", 60)?.status).toBe(429);
  });

  it("allows separate identities behind one NAT within the address allowance", () => {
    const scope = randomUUID();
    expect(rateLimitRequest(requestFor(), scope, "guest-one", 1)).toBeNull();
    expect(rateLimitRequest(requestFor(), scope, "guest-one", 1)?.status).toBe(429);
    expect(rateLimitRequest(requestFor(), scope, "guest-two", 1)).toBeNull();
  });

  it("applies a preflight cap despite ID and untrusted header rotation", () => {
    const scope = randomUUID();
    for (let index = 0; index < 2; index += 1) {
      expect(
        preflightRateLimit(
          requestFor(`guest-${index}`, { "x-real-ip": `192.0.2.${index}`, "x-forwarded-for": `198.51.100.${index}` }),
          scope,
          2,
        ),
      ).toBeNull();
    }
    expect(preflightRateLimit(requestFor("guest-third", { "x-real-ip": "192.0.2.3" }), scope, 2)?.status).toBe(429);
  });

  it("keeps preflight and post-auth counts separate", () => {
    const scope = randomUUID();
    const request = requestFor();
    expect(preflightRateLimit(request, scope, 1)).toBeNull();
    expect(rateLimitRequest(request, scope, "guest-player", 1)).toBeNull();
    expect(preflightRateLimit(request, scope, 1)?.status).toBe(429);
    expect(rateLimitRequest(request, scope, "guest-player", 1)?.status).toBe(429);
  });
});

describe("rate-limit storage capacity", () => {
  it("bounds one address's rotating IDs across scopes without blocking another address", () => {
    vi.stubEnv("ARCADE_TRUST_PROXY", "x-real-ip");
    vi.useFakeTimers();
    const attackRequest = requestFor("guest-player", { "x-real-ip": "203.0.113.90" });
    const scopes = ["rounds", "private-rooms-read", "private-rooms-touch"];
    let allowed = 0;
    for (const scope of scopes) {
      for (let index = 0; index < 9_000; index += 1) {
        if (!rateLimitRequest(attackRequest, scope, `rotated-guest-${index}`, 180, 9_000)) allowed += 1;
      }
    }
    expect(allowed).toBe(150 * scopes.length);
    // One admission record, three IP budgets, and at most 150 IDs per scope.
    expect(globalThis.__queueArcadeRateLimits.size).toBe(1 + scopes.length * 151);
    const otherRequest = requestFor("new-guest-player", { "x-real-ip": "203.0.113.91" });
    expect(rateLimitRequest(otherRequest, "steam-auth-start", "steam", 20)).toBeNull();
    expect(rateLimitRequest(otherRequest, "rounds", "new-guest-player", 180, 9_000)).toBeNull();
  });

  it("reuses admitted identities at the cap and admits new identities after the window", () => {
    const key = randomUUID();
    const now = Date.now();
    for (let index = 0; index < 150; index += 1) {
      expect(admitRateLimitIdentity({ key, identity: `guest-${index}`, now }).allowed).toBe(true);
    }
    expect(admitRateLimitIdentity({ key, identity: "guest-new", now }).allowed).toBe(false);
    expect(admitRateLimitIdentity({ key, identity: "guest-0", now }).allowed).toBe(true);
    expect(admitRateLimitIdentity({ key, identity: "guest-new", now: now + 60_000 }).allowed).toBe(true);
  });

  it("keeps active budgets at capacity and shares expiry across module instances", async () => {
    const scope = randomUUID();
    const now = Date.now() + 120_000;
    expect(consumeRateLimit({ scope, key: "exhausted", limit: 1, now }).allowed).toBe(true);
    vi.resetModules();
    const otherInstance = await import("../src/lib/rate-limit.mjs");
    for (let index = 1; index < 20_000; index += 1) {
      expect(
        otherInstance.consumeRateLimit({ scope, key: `key-${index}`, limit: 1, windowMs: 30_000, now }).allowed,
      ).toBe(true);
    }
    const atCapacity = consumeRateLimit({ scope, key: "new-key", limit: 1, now });
    expect(atCapacity.allowed).toBe(false);
    expect(atCapacity.retryAfterSeconds).toBe(30);
    expect(consumeRateLimit({ scope, key: "exhausted", limit: 1, now }).allowed).toBe(false);
    expect(consumeRateLimit({ scope, key: "new-key", limit: 1, now: now + 30_000 }).allowed).toBe(true);
    expect(consumeRateLimit({ scope, key: "exhausted", limit: 1, now: now + 30_000 }).allowed).toBe(false);
    expect(consumeRateLimit({ scope, key: "exhausted", limit: 1, now: now + 60_000 }).allowed).toBe(true);
  });
});

describe("shared request helpers", () => {
  it("uses validated guest identities, including reserved-prefix rejection", () => {
    expect(requestPlayerIdentity(requestFor("  guest-player  "))).toBe("guest-player");
    for (const value of [
      "account:12345",
      "USER:123456",
      "session:12345",
      "steam:123456",
      "bad id with spaces",
      "short",
    ]) {
      expect(requestPlayerIdentity(requestFor(value))).toBe("anonymous");
    }
  });

  it("fails closed when origin configuration is invalid", () => {
    expect(requestOriginAllowed(requestFor())).toBe(true);
    originCheck.mockReturnValueOnce(false);
    expect(requestOriginAllowed(requestFor())).toBe(false);
    originCheck.mockImplementationOnce(() => {
      throw new Error("Missing canonical origin");
    });
    expect(requestOriginAllowed(requestFor())).toBe(false);
  });
});

describe("bounded JSON request reader", () => {
  it("accepts UTF-8 JSON with a content-type parameter", async () => {
    const body = { playerId: "guest-player", name: "Żuk" };
    expect(
      await readJsonBody(jsonRequest(JSON.stringify(body), { "content-type": "application/json; charset=utf-8" })),
    ).toEqual({ body });
  });

  it("rejects non-JSON content without reading the stream", async () => {
    let pulls = 0;
    const cancel = vi.fn();
    const stream = new ReadableStream(
      {
        pull() {
          pulls += 1;
        },
        cancel,
      },
      { highWaterMark: 0 },
    );
    const result = await readJsonBody(jsonRequest(stream, { "content-type": "text/plain" }));
    expect(result.response.status).toBe(415);
    expect(pulls).toBe(0);
    expect(cancel).toHaveBeenCalledOnce();
  });

  it("rejects an oversized advertised body before reading it", async () => {
    let pulls = 0;
    const cancel = vi.fn();
    const stream = new ReadableStream(
      {
        pull() {
          pulls += 1;
        },
        cancel,
      },
      { highWaterMark: 0 },
    );
    const result = await readJsonBody(jsonRequest(stream, { "content-length": "8193" }));
    expect(result.response.status).toBe(413);
    expect(pulls).toBe(0);
    expect(cancel).toHaveBeenCalledOnce();
  });

  it.each([undefined, "1"])("stops streaming at the byte cap with content-length %s", async (contentLength) => {
    let produced = 0;
    const cancel = vi.fn();
    const stream = new ReadableStream(
      {
        pull(controller) {
          produced += 1;
          controller.enqueue(new Uint8Array(1_024));
        },
        cancel,
      },
      { highWaterMark: 0 },
    );
    const headers = contentLength ? { "content-length": contentLength } : {};
    const result = await readJsonBody(jsonRequest(stream, headers), { maxBytes: 2_048 });
    expect(result.response.status).toBe(413);
    expect(produced).toBe(3);
    expect(cancel).toHaveBeenCalledOnce();
    expect(stream.locked).toBe(false);
  });

  it("measures encoded bytes instead of JavaScript characters", async () => {
    const body = JSON.stringify("ąąą");
    expect(new TextEncoder().encode(body).byteLength).toBe(8);
    expect((await readJsonBody(jsonRequest(body), { maxBytes: 7 })).response.status).toBe(413);
    expect(await readJsonBody(jsonRequest(body), { maxBytes: 8 })).toEqual({ body: "ąąą" });
  });

  it("rejects malformed JSON and malformed UTF-8", async () => {
    expect((await readJsonBody(jsonRequest("{"))).response.status).toBe(400);
    expect((await readJsonBody(jsonRequest(new Uint8Array([34, 255, 34])))).response.status).toBe(400);
  });

  it("cancels a stalled body after the deadline without waiting for its cancel hook", async () => {
    vi.useFakeTimers();
    const cancel = vi.fn(() => new Promise(() => {}));
    const stream = new ReadableStream({ pull: () => new Promise(() => {}), cancel }, { highWaterMark: 0 });
    const result = readJsonBody(jsonRequest(stream), { timeoutMs: 50 });
    await vi.advanceTimersByTimeAsync(50);
    expect((await result).response.status).toBe(408);
    expect(cancel).toHaveBeenCalledOnce();
    expect(stream.locked).toBe(false);
  });

  it("returns a controlled error when the stream fails", async () => {
    const stream = new ReadableStream({
      start(controller) {
        controller.error(new Error("disconnected"));
      },
    });
    expect((await readJsonBody(jsonRequest(stream))).response.status).toBe(400);
  });
});

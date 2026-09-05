import { describe, expect, it } from "vitest";
import { consumeRateLimit, rateLimitDisabled } from "../src/lib/rate-limit.mjs";

describe("consumeRateLimit", () => {
  it("isolates keys, blocks past the limit, and resets after the window", () => {
    const scope = `test-${Date.now()}`;
    const first = consumeRateLimit({ scope, key: "player-a", limit: 2, windowMs: 1_000, now: 10_000 });
    const second = consumeRateLimit({ scope, key: "player-a", limit: 2, windowMs: 1_000, now: 10_100 });
    const blocked = consumeRateLimit({ scope, key: "player-a", limit: 2, windowMs: 1_000, now: 10_200 });
    const independent = consumeRateLimit({ scope, key: "player-b", limit: 2, windowMs: 1_000, now: 10_200 });
    const reset = consumeRateLimit({ scope, key: "player-a", limit: 2, windowMs: 1_000, now: 11_001 });
    expect(first.allowed).toBe(true);
    expect(second.allowed).toBe(true);
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterSeconds).toBe(1);
    expect(independent.allowed).toBe(true);
    expect(reset.allowed).toBe(true);
    expect(reset.remaining).toBe(1);
  });
});

describe("rateLimitDisabled", () => {
  it("only enforces the cap in production", () => {
    expect(rateLimitDisabled("production")).toBe(false);
    expect(rateLimitDisabled("development")).toBe(true);
    expect(rateLimitDisabled("test")).toBe(true);
  });
});

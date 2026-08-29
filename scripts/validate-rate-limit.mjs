#!/usr/bin/env node

import { consumeRateLimit, rateLimitDisabled } from "../src/lib/rate-limit.mjs";

const scope = `validation-${Date.now()}`;
const first = consumeRateLimit({ scope, key: "player-a", limit: 2, windowMs: 1_000, now: 10_000 });
const second = consumeRateLimit({ scope, key: "player-a", limit: 2, windowMs: 1_000, now: 10_100 });
const blocked = consumeRateLimit({ scope, key: "player-a", limit: 2, windowMs: 1_000, now: 10_200 });
const independent = consumeRateLimit({ scope, key: "player-b", limit: 2, windowMs: 1_000, now: 10_200 });
const reset = consumeRateLimit({ scope, key: "player-a", limit: 2, windowMs: 1_000, now: 11_001 });

if (
  !first.allowed ||
  !second.allowed ||
  blocked.allowed ||
  blocked.retryAfterSeconds !== 1 ||
  !independent.allowed ||
  !reset.allowed ||
  reset.remaining !== 1
) {
  throw new Error("The API rate-limit guardrail no longer isolates, blocks, or resets buckets correctly.");
}

if (rateLimitDisabled("production") || !rateLimitDisabled("development") || !rateLimitDisabled("test")) {
  throw new Error("Local and test servers must not trip the production request cap.");
}

console.log("Validated fixed-window API rate-limit guardrails.");

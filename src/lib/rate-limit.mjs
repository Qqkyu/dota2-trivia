const globalRateLimits = globalThis;
const buckets = globalRateLimits.__queueArcadeRateLimits ?? new Map();
globalRateLimits.__queueArcadeRateLimits = buckets;

let lastCleanup = 0;

function cleanupExpired(now) {
  if (now - lastCleanup < 60_000 && buckets.size < 20_000) return;
  lastCleanup = now;
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key);
  }
}

/**
 * Small in-process guardrail for accidental loops and basic abuse. Production
 * deployments should additionally enforce an IP-level limit at their edge.
 *
 * @param {{ scope: string; key: string; limit: number; windowMs?: number; now?: number }} input
 */
export function consumeRateLimit(input) {
  const windowMs = input.windowMs ?? 60_000;
  const now = input.now ?? Date.now();
  const bucketKey = `${input.scope}:${input.key}`;
  cleanupExpired(now);

  while (!buckets.has(bucketKey) && buckets.size >= 20_000) {
    const oldestKey = buckets.keys().next().value;
    if (oldestKey === undefined) break;
    buckets.delete(oldestKey);
  }

  let bucket = buckets.get(bucketKey);
  if (!bucket || bucket.resetAt <= now) {
    bucket = { count: 0, resetAt: now + windowMs };
    buckets.set(bucketKey, bucket);
  }

  bucket.count += 1;
  return {
    allowed: bucket.count <= input.limit,
    limit: input.limit,
    remaining: Math.max(0, input.limit - bucket.count),
    resetAt: bucket.resetAt,
    retryAfterSeconds: Math.max(1, Math.ceil((bucket.resetAt - now) / 1000)),
  };
}

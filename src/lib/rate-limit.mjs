import { isIP } from "node:net";

const globalRateLimits = globalThis;
const buckets = globalRateLimits.__queueArcadeRateLimits ?? new Map();
globalRateLimits.__queueArcadeRateLimits = buckets;
const expiry = globalRateLimits.__queueArcadeRateLimitExpiry ?? { nextAt: Infinity };
globalRateLimits.__queueArcadeRateLimitExpiry = expiry;

const MAX_RATE_LIMIT_BUCKETS = 20_000;
const MAX_IDENTITIES_PER_ADDRESS = 150;
for (const bucket of buckets.values()) expiry.nextAt = Math.min(expiry.nextAt, bucket.resetAt);

function canonicalAddress(value) {
  const address = value?.trim();
  if (!address || address.length > 45 || address.includes("%")) return "unknown";
  const version = isIP(address);
  if (version === 4) return address;
  if (version !== 6) return "unknown";

  const canonical = new URL(`http://[${address}]/`).hostname.slice(1, -1);
  const mapped = /^::ffff:([a-f0-9]{1,4}):([a-f0-9]{1,4})$/.exec(canonical);
  if (!mapped) return canonical;
  const high = Number.parseInt(mapped[1], 16);
  const low = Number.parseInt(mapped[2], 16);
  return `${high >>> 8}.${high & 255}.${low >>> 8}.${low & 255}`;
}

/**
 * Only enable a proxy header when the ingress sets it from the connecting client.
 * For an appended X-Forwarded-For chain, the last address is the nearest peer.
 * A missing, invalid, or untrusted address shares one conservative bucket.
 *
 * @param {Request} request
 * @param {string} [trustProxy]
 */
export function requestClientAddress(request, trustProxy = process.env.ARCADE_TRUST_PROXY ?? "none") {
  if (trustProxy === "cf-connecting-ip") return canonicalAddress(request.headers.get("cf-connecting-ip"));
  if (trustProxy === "x-real-ip") return canonicalAddress(request.headers.get("x-real-ip"));
  if (trustProxy === "x-forwarded-for") {
    const forwarded = request.headers.get("x-forwarded-for");
    return canonicalAddress(forwarded?.slice(forwarded.lastIndexOf(",") + 1));
  }
  return "unknown";
}

function cleanupExpired(now) {
  if (now < expiry.nextAt) return;
  expiry.nextAt = Infinity;
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key);
    else expiry.nextAt = Math.min(expiry.nextAt, bucket.resetAt);
  }
}

/** Local Next and tests should not trip the production request cap. */
export function rateLimitDisabled(env = process.env.NODE_ENV) {
  return env !== "production";
}

/**
 * Bound distinct identities admitted by one address across all route scopes.
 * Store admission in the same bounded map so its memory has no separate growth
 * path. Existing identities keep their budgets when admission is full.
 *
 * @param {{ key: string; identity: string; windowMs?: number; now?: number }} input
 */
export function admitRateLimitIdentity(input) {
  const windowMs = input.windowMs ?? 60_000;
  const now = input.now ?? Date.now();
  const bucketKey = `identity-admission:${input.key}`;
  cleanupExpired(now);

  let bucket = buckets.get(bucketKey);
  if (!bucket) {
    if (buckets.size >= MAX_RATE_LIMIT_BUCKETS) {
      return {
        allowed: false,
        limit: MAX_IDENTITIES_PER_ADDRESS,
        remaining: 0,
        resetAt: expiry.nextAt,
        retryAfterSeconds: Math.max(1, Math.ceil((expiry.nextAt - now) / 1000)),
      };
    }
    bucket = { identities: new Set(), resetAt: now + windowMs };
    buckets.set(bucketKey, bucket);
    expiry.nextAt = Math.min(expiry.nextAt, bucket.resetAt);
  }

  const allowed = bucket.identities.has(input.identity) || bucket.identities.size < MAX_IDENTITIES_PER_ADDRESS;
  if (allowed) bucket.identities.add(input.identity);
  return {
    allowed,
    limit: MAX_IDENTITIES_PER_ADDRESS,
    remaining: Math.max(0, MAX_IDENTITIES_PER_ADDRESS - bucket.identities.size),
    resetAt: bucket.resetAt,
    retryAfterSeconds: Math.max(1, Math.ceil((bucket.resetAt - now) / 1000)),
  };
}

/**
 * In-process limit. Deployments with multiple instances must also enforce
 * shared limits at their ingress or in shared storage.
 *
 * @param {{ scope: string; key: string; limit: number; windowMs?: number; now?: number }} input
 */
export function consumeRateLimit(input) {
  const windowMs = input.windowMs ?? 60_000;
  const now = input.now ?? Date.now();
  const bucketKey = `${input.scope}:${input.key}`;
  cleanupExpired(now);

  if (!buckets.has(bucketKey) && buckets.size >= MAX_RATE_LIMIT_BUCKETS) {
    return {
      allowed: false,
      limit: input.limit,
      remaining: 0,
      resetAt: expiry.nextAt,
      retryAfterSeconds: Math.max(1, Math.ceil((expiry.nextAt - now) / 1000)),
    };
  }

  let bucket = buckets.get(bucketKey);
  if (!bucket || bucket.resetAt <= now) {
    bucket = { count: 0, resetAt: now + windowMs };
    buckets.set(bucketKey, bucket);
    expiry.nextAt = Math.min(expiry.nextAt, bucket.resetAt);
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

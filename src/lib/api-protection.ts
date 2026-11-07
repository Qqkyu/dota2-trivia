import { NextResponse } from "next/server";
import { requestLocale, translatorFor } from "@/i18n/server";
import { isSameOriginMutation } from "./auth-session";
import { validatedGuestIdentity } from "./guest-identity.mjs";
import { admitRateLimitIdentity, consumeRateLimit, rateLimitDisabled, requestClientAddress } from "./rate-limit.mjs";
import { anonymousVoterHash } from "./voter-hash";

export { readJsonBody } from "./request-body.mjs";

// Support a 100-player party behind one NAT. The independent address cap still
// bounds ID rotation. A separate preflight cap protects parsing and auth.
const IP_LIMIT_MULTIPLIER = 5;
const MIN_IP_LIMIT = 300;

export function requestPlayerIdentity(request: Request, searchParams?: URLSearchParams) {
  const raw = searchParams?.get("playerId") ?? new URL(request.url).searchParams.get("playerId");
  return validatedGuestIdentity(raw) ?? "anonymous";
}

export function requestOriginAllowed(request: Request) {
  try {
    return isSameOriginMutation(request);
  } catch {
    return false;
  }
}

function rateLimitResponse(request: Request, result: ReturnType<typeof consumeRateLimit>) {
  if (result.allowed) return null;

  return NextResponse.json(
    { error: translatorFor(requestLocale(request))("api.rateLimited") },
    {
      status: 429,
      headers: {
        "Cache-Control": "no-store",
        "Retry-After": String(result.retryAfterSeconds),
        "RateLimit-Limit": String(result.limit),
        "RateLimit-Remaining": String(result.remaining),
        "RateLimit-Reset": String(Math.ceil(result.resetAt / 1000)),
      },
    },
  );
}

export function preflightRateLimit(request: Request, scope: string, limit: number) {
  if (rateLimitDisabled()) return null;
  const key = anonymousVoterHash(`rate-limit:${scope}:preflight-ip`, requestClientAddress(request));
  return rateLimitResponse(request, consumeRateLimit({ scope: `${scope}:preflight-ip`, key, limit }));
}

export function rateLimitRequest(
  request: Request,
  scope: string,
  identity: string,
  limit: number,
  ipLimit = Math.max(MIN_IP_LIMIT, limit * IP_LIMIT_MULTIPLIER),
) {
  if (rateLimitDisabled()) return null;
  const address = requestClientAddress(request);
  const addressKey = anonymousVoterHash(`rate-limit:${scope}:ip`, address);
  const addressResult = consumeRateLimit({
    scope: `${scope}:ip`,
    key: addressKey,
    limit: ipLimit,
  });
  if (!addressResult.allowed) return rateLimitResponse(request, addressResult);

  // Share admission across scopes so polling routes cannot fill the process-wide
  // bucket map by rotating IDs under their larger per-address request allowance.
  const admission = admitRateLimitIdentity({
    key: anonymousVoterHash("rate-limit:identity-admission:ip", address),
    identity: anonymousVoterHash("rate-limit:identity-admission:identity", identity),
  });
  if (!admission.allowed) return rateLimitResponse(request, admission);

  const identityKey = anonymousVoterHash(`rate-limit:${scope}:identity`, JSON.stringify([address, identity]));
  return rateLimitResponse(request, consumeRateLimit({ scope: `${scope}:identity`, key: identityKey, limit }));
}

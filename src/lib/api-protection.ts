import { NextResponse } from "next/server";
import { consumeRateLimit, rateLimitDisabled } from "@/lib/rate-limit.mjs";
import { anonymousVoterHash } from "@/lib/voter-hash";

function clientAddress(request: Request) {
  const direct = request.headers.get("x-real-ip")?.trim();
  if (direct) return direct.slice(0, 128);
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return (forwarded || "unknown").slice(0, 128);
}

export function rateLimitRequest(request: Request, scope: string, identity: string, limit: number) {
  if (rateLimitDisabled()) return null;
  const key = anonymousVoterHash(`rate-limit:${scope}`, `${clientAddress(request)}:${identity}`);
  const result = consumeRateLimit({ scope, key, limit });
  if (result.allowed) return null;

  return NextResponse.json(
    { error: "Too many requests. Please wait a moment." },
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

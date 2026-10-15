import assert from "node:assert/strict";

// Run --saturate only against the isolated service under review. The check uses
// no cookies, follows no redirects, writes no app data, and makes at most 131 requests.
const args = process.argv.slice(2);
const saturate = args.includes("--saturate");
if (args.length !== (saturate ? 2 : 1))
  throw new Error("Usage: node scripts/check-ingress-trust.mjs HTTPS_ORIGIN [--saturate]");
const target = new URL(args.find((arg) => arg !== "--saturate"));
assert.ok(
  target.protocol === "https:" &&
    !target.username &&
    !target.password &&
    target.pathname === "/" &&
    !target.search &&
    !target.hash,
  "Supply only the isolated app's HTTPS origin.",
);
const url = new URL("/api/auth/steam", target);

async function probe(index) {
  const headers =
    index === undefined
      ? {}
      : {
          "CF-Connecting-IP": `192.0.2.${(index % 250) + 1}`,
          "X-Real-IP": `198.51.100.${(index % 250) + 1}`,
          "X-Forwarded-For": `203.0.113.${(index % 250) + 1}, 192.0.2.${(index % 250) + 1}`,
        };
  const response = await fetch(url, {
    headers,
    redirect: "manual",
    credentials: "omit",
    signal: AbortSignal.timeout(10_000),
  });
  await response.body?.cancel();
  if (response.status === 302) {
    const redirect = new URL(response.headers.get("location"));
    assert.equal(`${redirect.origin}${redirect.pathname}`, "https://steamcommunity.com/openid/login");
  } else {
    assert.equal(response.status, 429, "The service must return its Steam redirect or its own rate-limit response.");
    assert.equal(response.headers.get("ratelimit-limit"), "120");
  }
  return { status: response.status, resetAt: response.headers.get("ratelimit-reset") };
}

if (!saturate) {
  const result = await probe();
  console.log(
    JSON.stringify({
      checkedAt: new Date().toISOString(),
      origin: target.origin,
      mode: "independent-source-control",
      ...result,
    }),
  );
  assert.equal(result.status, 302, "The independent source must retain its own login allowance.");
} else {
  const startedAt = Date.now();
  let allowed = 0;
  let blocked = 0;
  let resetAt;
  for (let index = 0; index < 130; index += 1) {
    assert.ok(Date.now() - startedAt < 50_000, "The probe exceeded one rate-limit window; retry after it resets.");
    const result = await probe(index);
    if (result.status === 302) {
      assert.equal(blocked, 0, "Forged headers must not regain access after the address is blocked.");
      allowed += 1;
    } else {
      blocked += 1;
      resetAt = result.resetAt;
    }
  }
  assert.ok(allowed <= 120 && blocked >= 10, "Rotating forged headers must not create new address allowances.");
  assert.equal(
    (await probe()).status,
    429,
    "A header-free request from the same source must share the blocked allowance.",
  );
  console.log(
    JSON.stringify({
      checkedAt: new Date().toISOString(),
      origin: target.origin,
      mode: "spoofed-headers",
      allowed,
      blocked,
      resetAt,
      independentSourceStillRequired: true,
    }),
  );
}

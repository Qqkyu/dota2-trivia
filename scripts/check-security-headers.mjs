#!/usr/bin/env node
import assert from "node:assert/strict";

const origin = new URL(process.env.APP_URL ?? process.env.ARCADE_APP_URL ?? "http://localhost:3000").origin;
const nonces = new Set();
for (const route of ["/", "/party", "/play", "/profile", "/privacy", "/missing-security-check-page"]) {
  const response = await fetch(`${origin}${route}`, { redirect: "manual" });
  assert.equal(response.status, route.startsWith("/missing-") ? 404 : 200, route);
  assert.equal(response.headers.get("x-frame-options"), "DENY", route);
  assert.equal(response.headers.get("x-content-type-options"), "nosniff", route);
  assert.equal(response.headers.get("referrer-policy"), "strict-origin-when-cross-origin", route);
  assert.equal(response.headers.get("x-powered-by"), null, route);
  const policy = response.headers.get("content-security-policy") ?? "";
  assert(policy.includes("frame-ancestors 'none'") && policy.includes("object-src 'none'"), route);
  const scriptPolicy = policy.split(";").find((part) => part.trim().startsWith("script-src")) ?? "";
  assert(!scriptPolicy.includes("unsafe-inline") && !scriptPolicy.includes("unsafe-eval"), route);
  const nonce = /'nonce-([^']+)'/.exec(scriptPolicy)?.[1];
  assert(nonce && !nonces.has(nonce), `A fresh nonce is required for ${route}`);
  nonces.add(nonce);
  const html = await response.text();
  for (const script of html.matchAll(/<script\b([^>]*)>/g)) {
    assert(script[1].includes(`nonce="${nonce}"`), `Script missing CSP nonce at ${route}`);
  }
  if (!route.startsWith("/missing-")) {
    assert(html.includes(`property="og:url" content="${origin}`), `Wrong runtime Open Graph origin at ${route}`);
    assert(html.includes(`property="og:image" content="${origin}/`), `Wrong runtime image origin at ${route}`);
  }
}
console.log("Production HTML has fresh script nonces, security headers, and runtime social metadata.");

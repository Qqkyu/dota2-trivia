import assert from "node:assert/strict";
import {
  STEAM_OPENID_ENDPOINT,
  STEAM_OPENID_NAMESPACE,
  steamLoginUrl,
  steamVerificationSucceeded,
} from "../src/lib/steam-auth.mjs";

// Public protocol checks only. This script does not load cookies, credentials,
// environment files, account stores, or an authenticated OpenID assertion.
const realm = "https://example.com";
const checkedAt = new Date().toISOString();
const checks = [];

async function readPublicResponse(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    redirect: "manual",
    signal: AbortSignal.timeout(15_000),
    headers: { "User-Agent": "QueueArcade-PublicOpenID-Check/1.0", ...options.headers },
  });
  const reader = response.body?.getReader();
  let bytes = 0;
  const chunks = [];
  if (reader) {
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        bytes += value.byteLength;
        if (bytes > 1_048_576) throw new Error("Steam public response exceeded the 1 MiB check limit.");
        chunks.push(value);
      }
    } finally {
      await reader.cancel().catch(() => undefined);
    }
  }
  return { response, text: Buffer.concat(chunks).toString("utf8") };
}

const discovery = await readPublicResponse("https://steamcommunity.com/openid/");
assert.equal(discovery.response.status, 200, "Steam OpenID discovery must be available over verified TLS.");
assert.ok(
  discovery.text.includes(`<URI>${STEAM_OPENID_ENDPOINT}</URI>`),
  "The discovered endpoint must match the app.",
);
assert.ok(discovery.text.includes(`${STEAM_OPENID_NAMESPACE}/server`), "Steam must advertise OpenID 2.0.");
checks.push({ check: "discovery", status: discovery.response.status, endpointMatches: true });

let loginUrl = steamLoginUrl(realm, "public-connectivity-check");
let login = await readPublicResponse(loginUrl);
let redirects = 0;
while ([301, 302, 303, 307, 308].includes(login.response.status) && redirects < 4) {
  loginUrl = new URL(login.response.headers.get("location"), loginUrl);
  assert.equal(loginUrl.origin, "https://steamcommunity.com", "Login redirects must remain on Steam's HTTPS origin.");
  assert.equal(loginUrl.username + loginUrl.password, "");
  redirects += 1;
  login = await readPublicResponse(loginUrl);
}
assert.equal(login.response.status, 200, "An unauthenticated OpenID request must reach Steam's login page.");
assert.ok(/text\/html/i.test(login.response.headers.get("content-type") ?? ""));
assert.ok(
  /Sign in|Sign Into|Sign In|steamLogin|loginForm|login_btn/i.test(login.text),
  "Steam must offer a login form.",
);
checks.push({ check: "unauthenticated-login-page", status: login.response.status, redirects, loginPage: true });

const invalid = await readPublicResponse(STEAM_OPENID_ENDPOINT, {
  method: "POST",
  headers: { "Content-Type": "application/x-www-form-urlencoded" },
  body: new URLSearchParams({ "openid.ns": STEAM_OPENID_NAMESPACE, "openid.mode": "check_authentication" }),
});
assert.ok([200, 400].includes(invalid.response.status), "Steam's verifier must respond to an incomplete request.");
assert.equal(steamVerificationSucceeded(invalid.text), false, "An unsigned request must never verify.");
checks.push({ check: "unsigned-verification-rejected", status: invalid.response.status, accepted: false });

console.log(JSON.stringify({ checkedAt, checks, completedRealLogin: false }, null, 2));

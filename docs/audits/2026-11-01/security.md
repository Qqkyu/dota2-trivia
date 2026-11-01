# Security review before the public repository

Date: 2026-11-01. Scope: `main` at `caac422`, the live site https://queuearcade.com, and the
Render configuration. Reason: the repository becomes public, and Steam sign-in is live.

Two independent reviews ran in parallel and did not share notes:

- Claude Opus 5.5: source review of every API route, the proxy, auth, rate limits, rooms and
  media, plus live probes against production and `pnpm audit`.
- Codex with GPT-6 Astra (max reasoning, read-only sandbox, no network): source review with
  in-memory checks, then a status check of the 2026-10-06 audit findings.

Neither review found account takeover, a reviewer bypass, SQL injection, XSS, SSRF, or a
committed secret. All seven findings of the [2026-10-06 audit](../2026-10-06/security.md)
are fixed in the current code.

## Findings and status

| # | Finding | Found by | Severity | Status |
|---|---|---|---|---|
| 1 | `/_next/image` made a new download and resize for every distinct query string on Steam art and avatar URLs (live: about 1 s of work per new URL), with no disk-cache bound. | Both | High | Fixed: remote patterns allow only the query strings the app ships, disk cache capped at 128 MB, avatar URLs stored without a query. |
| 2 | `/calibration` rebuilt the full catalog snapshot and rendered 1.25 MB of HTML per load, with no request limit (the API had one). | Codex | Medium | Fixed: public loads share a 30-second snapshot and are capped at 20 per address and 60 in total per minute; reviewers are not limited. |
| 3 | Presence maps of closed private rooms stayed in memory until restart. | Codex | Medium | Fixed: every expired room is swept at most every 30 seconds. |
| 4 | `GET /api/private-rooms?peek=1` returned roster, scores and chat to anyone with the code; codes can be three characters. | Both | Medium | Fixed: peek returns only `{ "exists": true }`. Roster and chat need membership. |
| 5 | Guest IDs are chosen by the client, so one address can cast votes and reports under many IDs (bounded at 150 IDs per address per minute). This can skew a reveal split, difficulty signals and the report queue. | Both | Low | Accepted. No leaderboards exist; calibration is advisory and quarantine is a manual reviewer action. Revisit with server-issued guest credentials before any ranking. |
| 6 | With the source public, the deck seed let anyone compute upcoming questions from the room clock. | Both | Low | Fixed: deck seeds include an HMAC of `ARCADE_AUTH_SECRET`. The question bank itself is public with the repository; matching a text prompt to its answer stays possible and is accepted. |
| 7 | Sign-out cleared the cookie and reported success when the stored session could not be deleted. | Codex | Low | Fixed: the cookie stays and the profile page says "Couldn't sign out. Try again." |

## Live checks (production)

- Pages send the nonce CSP, HSTS, `nosniff`, `DENY` framing, a referrer policy and a
  permissions policy. API responses send no CORS headers.
- The Steam state cookie is `Secure; HttpOnly; SameSite=Lax`, path `/api/auth/steam`, 10 minutes.
  A foreign `returnTo` falls back to `/`.
- Vote writes without an `Origin`, or with a foreign one, get 403. A 20 KB body gets 413.
  `TRACE` and unknown methods get 405.
- A spoofed `X-Forwarded-Host: *.onrender.com` redirects only to `https://queuearcade.com`.
  An unknown `Host` is refused at the edge.
- Client address: a request with a client-set `CF-Connecting-IP` is refused at the edge (403);
  spoofed `X-Forwarded-For` and `X-Real-IP` do not change the rate-limit bucket. Not verified:
  separate buckets for two real sources on the custom domain (no second source address was
  available).
- The database user is the restricted runtime role on the internal host, with `sslmode` set.
- `pnpm audit --prod`: no known vulnerabilities. Development-only tools (vite through vitest,
  zod and minimatch through eslint) have advisories; they are not in the runtime image.

## Not covered

Load and exhaustion thresholds on the hosted instance, a live Steam login with a real account,
database failure recovery, and the base image's native libraries.

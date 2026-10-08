# Cross-tab account ownership review

The browser reproduction showed a connected player's accepted answer increasing guest lifetime totals after another tab changed the account session. The gameplay tab had used its old profile state to choose the owner of the result.

## Server change

Successful `/api/rounds` and `/api/votes` responses now include `playerIdentity`:

- `{ kind: "account", id: user.id }` comes from the session cookie.
- `{ kind: "guest", id: guestId }` uses the validated, normalized guest ID.
- Anonymous round observers get `null`.

The identity comes from the same captured value used to read or write the player's vote. A session change while storage is pending cannot relabel that response. These responses use `Cache-Control: no-store`. They expose only the caller's own internal account ID, which `/api/me` already returns. They do not expose a Steam ID, session token, or another player's identifier.

Changed files:

- `src/app/api/rounds/route.ts`
- `src/app/api/votes/route.ts`
- `tests/player-identity-routes.test.mjs`

## Required client behavior

The functional agent owns the client change. The response identity must travel with accepted votes, reveals, and recovered results. Guest persistence must require a valid guest identity from that response. Missing metadata must not fall back to profile state.

Delayed vote responses must match the active round and identity before changing the answer. Delayed profile or round responses must not restore an older identity. Session scores must reset or use a separate identity key when the account changes. Pending results must retain their original identity. A focus-triggered profile refresh improves the display but does not establish result ownership.

## Checks completed

`pnpm exec vitest run tests/player-identity-routes.test.mjs tests/round-routes.test.mjs tests/security-auth.test.mjs` passed all 52 tests. The 12 new tests cover cookie precedence, guest normalization, expired cookies, reserved namespaces, anonymous observers, delayed storage across a session change, and response privacy. Targeted ESLint passed for both routes and the new test file.

The browser reproduction is recorded in `/tmp/queue-arcade-deep-review/account-baseline.log`. No real Steam account or external service was used for these tests.

## Client review

Reviewed `src/components/queue-arcade.tsx` and `src/lib/player-identity.ts` while the functional agent implemented the fix. The client now normalizes response identities, guards delayed requests with an identity generation, resets the run and answer when the identity changes, and captures result ownership before asynchronous guest persistence.

The first implementation kept the previous account's personal crowd score and report when a vote response changed the identity. The functional agent corrected this after review by replacing the stored crowd result and clearing the old report. The review also caught an unstarted analytics session after an identity change; the new session is now started and its finish state is reset.

The functional agent fixed the first unknown-to-known transition by clearing earlier unowned session results. Inspected `/tmp/queue-arcade-deep-review/identity-final.log`: all eight browser journeys passed. They cover guest-to-account credit, logout to a separate guest run, delayed accepted and failed votes, missing identity metadata, an old profile response, pending-result ownership migration, and restoration after initially missing metadata. The typecheck log was empty.

The final known-to-unknown-to-known case is also fixed. Re-read `creditRound` and confirmed that it rejects a result without an identity before changing session records when the client already has a known identity. Unowned points therefore cannot enter that run or its guest best score.

Inspected the final production evidence from the functional agent: `/tmp/queue-arcade-deep-review/journeys-production.log` and `/tmp/queue-arcade-deep-review/evidence/production/user-journeys.json` record 45 passing journeys, including all nine identity scenarios. `/tmp/queue-arcade-deep-review/gameplay-production.log` records 18 passing gameplay checks. The functional report identifies the tested production build as `a9jO2vwwKVTSsroYDHJJW`, served on isolated loopback port 3315.

No open finding remains in this account ownership review. This verdict covers the reviewed code and synthetic local browser scenarios. It does not claim a real Steam login or verification of an external deployment.

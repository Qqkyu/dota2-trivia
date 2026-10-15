Both scopes are fully read, including the CommonJS copies, which match the ESM patch hunks line for line. Here is the report.

## Scope A: postgres@3.4.9 patch

**Finding A1 (Low, confirmed by code path): stale `closeRunStart` shortens the next startup retry window to zero.**
`node_modules/postgres/src/connection.js:464` sets `closeRunStart` on a clean close during startup, but it is only cleared on success (line 592), on reserve handoff (line 587), or on exhaustion (line 469). It is not cleared when the same run ends through the non-initial branch (lines 474 to 481). That happens whenever a later attempt in the run fails through the socket error event or the connect timer, because `error()` at line 388 and `connectTimedOut()` at line 268 both reject and null `initial` before the close event arrives.

- Preconditions: a clean close during type discovery, then an ECONNREFUSED, ECONNRESET, or connect timeout on the next attempt in the same run, then a later request after the stale timestamp is more than `connect_timeout` old, with another clean startup close.
- Effect: line 467 compares against the stale start, so the new request is rejected on its first startup close instead of retrying for up to the configured 10 seconds. No crash, no data effect, and a later request can still reconnect. CJS has the identical lines (cjs/src/connection.js:464 to 469).
- Regression check: extend `tests/helpers/postgres-startup-worker.mjs` with a mode that clean-closes once during the types query, resets the second attempt, waits longer than `connect_timeout`, then clean-closes exactly once on the next query before passing through. That query must succeed. Fix by resetting `closeRunStart = 0` in the non-initial branch of `closed()`.

**Traced and found correct:** write guard after close, rollback left in `sent` after a reset (drained at line 474 regardless of `hadError`), transaction race rejection plus queued-query drain, late-callback fencing through `closedError`, release of a closed reserved handle, startup retry bound on clean closes, and `fetchArrayTypes().catch(noop)`. The app path in `src/lib/database-client.ts:35` is a plain `pool.begin`, so a lost connection rejects the vote and the pool reconnects on demand. No global exception handlers exist in the snapshot.

**Material test gaps:**
- Every worker uses `max: 1`. The app runs with 5, so pool handoff on close (`index.js:446`) and the `UNSAFE_TRANSACTION` check at `connection.js:629` are never exercised with the patch.
- No test covers the stale-window scenario in A1.

**Not patch-introduced, noted as limits:** socket errors during startup still reject the first query immediately rather than retrying, so the retry bound only covers clean closes. `sql.end()` without a timeout can hang if a connection is mid-retry; the app never calls `end()`.

## Scope B: HMAC ingress probe

**No confirmed findings.** Verified by reading: anchored token format with length cap at `ingress-probe.mjs:62` to 64, constant-time compare of fixed 32-byte buffers, canonical nonce check, purpose-separated derived keys, 60-second expiry window, 256-byte header cap, uniform no-store 404 on every denial, budget consumed only after authentication (`route.ts:16`), response limited to version, nonce, and proof, and the probe disabled unless the policy is exactly `none` plus a canonical origin and a 32-character secret. The script never prints the secret, token, or any address in assertions or output, forces IPv4, does not follow redirects, and bounds response size. Its acceptance logic requires the proof to equal the operator's known egress in all five cases, including when a fake `CF-Connecting-IP` is supplied, and to differ from the supplied values, the empty header, and `unknown`. That is sufficient evidence that the edge overwrites the header on the probed origin.

**Concerns that need evidence outside this snapshot:**
- Key separation assumes no other app code returns a raw HMAC-SHA256 of `ARCADE_AUTH_SECRET` over an attacker-chosen string equal to the derivation label. The session code that uses that secret is not in the snapshot.
- The signature binds the configured origin, so only that hostname's edge path can be probed. The trust choice is justified only if every hostname and path that reaches the app traverses the same edge. The documentation states this limit correctly.
- A captured token can be replayed for its remaining lifetime. The only effect is consuming the 24-per-minute budget, which makes the operator check fail closed.

**Test gap:** the operator script's rejection branches (stripped header, appended chain, non-200) are only exercised live, not by a unit test with a local server.

## Remaining limits of this static review

Runtime behavior of `/api/health` sibling routing and any middleware, the `diagnosticPath` logger, session code using the auth secret, and `database-schema.mjs` transaction use were outside the allowed files or not read. Test outcomes were not executed.

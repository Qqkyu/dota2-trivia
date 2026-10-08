# Final security second opinion

The final review on 2026-10-08 found two low-severity defects. Both are fixed and have
regression tests. There are no confirmed open findings in this review's scope. This
review covers the Postgres disconnect patch and the operator ingress proof. The earlier
audit reports cover the wider app.

## Claude review

Local Claude Code 2.1.294 completed the requested `claude-fable-5-1` review in 456.95
seconds and 32 turns. The returned canonical model is `claude-fable-5-1`.
The [metadata](claude-metadata.json) records the model and restrictions.

Claude could use only Read, Glob and Grep inside a frozen snapshot. Shell commands,
web tools, edits, subagents, MCP servers and session persistence were disabled. The
snapshot contained 37 named source files, tests, docs and installed dependency files.
All 37 hashes matched the repository before the review. It contained no production
credentials, private environment files or player records. See the
[source manifest](reviewed-source-manifest.json) and [review prompt](review-prompt.txt).

The [original Claude report](claude-findings.md) is preserved unchanged. It reviewed
the snapshot before the two final fixes below. Codex reproduced the findings, reviewed
the fixes and ran their tests. Claude did not execute tests or review the final delta.

## Findings and fixes

| Finding | Evidence | Final result |
| --- | --- | --- |
| A Postgres clean startup close followed by a socket error left the retry start time set. A later request could fail on its first clean close instead of retrying. Claude identified this path. | The [before check](postgres-stale-window-before.json) reproduces `ECONNRESET` followed by an unexpected `CONNECTION_CLOSED`. | Both module formats clear the timestamp when that run ends. The [after checks](postgres-stale-window-after.json) pass the mixed-failure sequence and three later queries. |
| The operator CLI's 10-second socket timeout measured inactivity. A server that kept sending data could exceed the stated duration bound. A separate Codex reviewer identified and reproduced this. | A valid local TLS response took [12,040 ms](ingress-timeout-reproduction.json), yet the original CLI accepted all five proofs. | An absolute 10-second deadline now covers the whole request. The actual CLI regression sends data every 100 ms and verifies a normal deadline failure, with no test kill or secret output. |

The driver tests now also cover a five-connection pool. They terminate one of five
active transactions, verify that the other four commit, and then verify five new
commits. This closes the fault tests' earlier single-connection limit. The tests run
both ESM and CommonJS. The interrupted transaction left no committed row.

The first local placement of the timestamp reset exposed JavaScript's semicolon-free
parsing rule. Both module tests failed immediately. The line was moved before the
passing final run. The [intermediate failure](postgres-stale-window-intermediate-syntax-failure.json)
is retained; that edit was never deployed.

## Verification

- All 29 focused ingress tests passed, including the real TLS deadline regression.
- All 34 focused driver and store tests passed on disposable PostgreSQL 17. This
  includes 28 driver fault cases. See the [test log](driver-regression-tests.log).
- The installed ESM and CommonJS close, readiness, reserved-connection and transaction
  branches have [matching code](module-parity.json).
- A frozen offline dependency install, scoped ESLint and Prettier checks passed.
- The final full suite passed all 1,284 tests in 64 files, with no skips, against
  PostgreSQL 17.11. Lint, types and the 124-input content gate also passed. See the
  [final verification](../verification/2026-10-08/unit-tests-result.json).
- Actual local CLI checks accepted a matching proof and rejected forged, missing and
  appended address proofs. See the [negative controls](ingress-negative-proofs.json).

The [check summary](checks.json) records commands and results. The
[final source manifest](final-source-manifest.json) identifies the directly reviewed
and tested delta.

Further source review found no endpoint that returns a signature over arbitrary caller
text using `ARCADE_AUTH_SECRET`. Steam state creation signs server-built base64url JSON,
which cannot equal the colon-containing ingress key
derivation labels. Account sessions use random tokens. Diagnostics omit authorization
headers, query strings and fragments. The proxy matcher excludes API routes.
The [31 checks against the actual Next server](../verification/2026-10-08/ingress-http.json)
cover invalid requests, the 24-request budget, its next-request denial and unaffected
normal health checks. These checks close the corresponding snapshot limits in
Claude's report.

## Limits

This review made no production requests or changes. A local TLS fixture does not prove
Render's header behavior. The hosted proof must bind the deployed revision and actual
origin before a forwarded address is trusted. Other origins and future ingress changes
need a new check. A captured operator token can consume its short-lived, separate
budget; it cannot change configuration or app data.

The driver checks cover the app's transaction use and explicit interruption cases.
They do not prove every upstream driver feature or every possible network failure.

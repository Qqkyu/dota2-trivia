The v2 operators account for the hosted edge rejecting requests that supply `CF-Connecting-IP`. The [hosted diagnosis](../hosted-ingress-error1000-diagnosis.json) records HTTP 403 with the plain error-1000 response for both CF-supplied cases. The other three requests reached the app. This archive covers operator preparation and offline checks; it does not record a completed hosted smoke run.

The [address operator](check-address-isolation.mjs.txt) sends 130 IPv4 login requests with rotating `X-Real-IP` and `X-Forwarded-For` values. It then requires a plain IPv4 request to remain rate limited and one real IPv6 source to retain its own allowance in the same window. It sends at most 131 IPv4 and one IPv6 login request, within a 50-second check. It verifies the IPv6 source through two independent services before sending the login control. It follows no redirects, saves no cookies, writes no app records, and omits raw addresses from its report. Direct CF-header rejection belongs to the separate v2 ingress proof.

The [gate helper](create-gate.py.txt) pins the reviewed v2 proxy-policy helper. It checks the exact successful CI revision, sole live deployment, Postgres health, configuration binding, and the matching v2 proof receipt. Its proof check requires authenticated egress results for the baseline, real-IP, and forwarded-chain cases. Only the two CF-supplied cases can use the exact HTTP-403/error-1000 outcome. The gate includes the proof version and digest, which the address operator requires.

The [original smoke operator](../smoke-helper-review-20261010/hosted-smoke.mjs.txt) is unchanged. Its one-vote budget, private ownership checkpoint, and cleanup-only recovery still apply. The original helper archive is unchanged.

The header tests failed on both rotating probes before the change and passed after removing only the outgoing CF header. The other two transport tests passed before and after. The archive retains both results. Existing address tests cover the request caps, IPv6 agreement, rate-window changes, failed controls, and report redaction. Gate tests cover proof outcomes and deployment/configuration changes. The [independent review](security-independent-review.json) found no blocking issue and reran all five suites against the final source hashes. No network or provider calls ran during these checks.

Only explicit safe result files may be copied from a hosted run. The address operator prints an `address-isolation-v2-<timestamp>.json` path. The unchanged smoke operator prints a `hosted-<timestamp>.json` path. Private ownership checkpoints, completed ownership receipts, temporary files, and the private gate remain outside this archive.

| Check | Result |
| --- | --- |
| Original header assumptions | Two expected failures; two passes |
| Updated header transport | Four passes |
| Address scenarios | 40 passes |
| Prior independent address scenarios, rerun | 16 passes |
| Gate deployment and configuration fixtures | 33 passes |
| V2 proof contract | 29 passes |
| Original archive integrity | All 26 recorded files unchanged |

Frozen gate SHA-256: `46a7599ae2e183a5f3fe74665ab394cecc10c634ad8ca0289fc547f94cdc66c5`. Frozen address operator SHA-256: `fe1c62d1e08978f9f6f858b896dd0e3fee31083384764de5cea54356c07163e4`. The gate pins proxy-policy helper `b4b143e325a030497251bd8176629c0f7d1bfa97d5c8e1a9d7d7b02d1526f672`. The unchanged smoke operator hash is `e0a09e4909016e3ee5dbefefafe9d7385401a6972294d10c8d5a92679b7bfc68`.

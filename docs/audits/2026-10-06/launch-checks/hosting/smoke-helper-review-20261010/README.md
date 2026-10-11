# Hosted smoke operator review

The independent review found no blocking issue in the frozen operator files below. All six safety suites passed. No hosted request was made during this review. Hosted deployment, ingress proof, and address isolation remain separate execution checks.

| Operator | SHA-256 |
| --- | --- |
| [Smoke and owned-room recovery](hosted-smoke.mjs.txt) | `e0a09e4909016e3ee5dbefefafe9d7385401a6972294d10c8d5a92679b7bfc68` |
| [Gate creation](create-gate.py.txt) | `0658d4d755bb7f469ea05c8e8fb54d05db74ca557c9d812ef861b3b347857c77` |
| [Address isolation](check-address-isolation.mjs.txt) | `4b3ee3e193b450d0e982d9ba1707e51a22c5fe698868c40e32de1a449aef3b58` |

The [review record](review-result.json) binds the source files and results. The [manifest](evidence-manifest.json) covers every file in this directory except itself.

## Safety checks

The gate requires a successful CI run for the exact candidate, the reviewed ingress proof, the completed proxy-policy change, and the same live deployment. It checks the configuration before and after its health request. It uses HTTPS, rejects redirects, and keeps provider credentials in memory. Its output contains no environment values.

The smoke allows one guest vote in its own private room. It sends no account cookie or alpha-session ID. The vote route excludes private rounds from public calibration. Cleanup leaves the room and confirms a 404 response. The raw private vote remains subject to normal database retention.

Before create and vote, the operator saves its ownership and attempt state in a private checkpoint. It creates the initial file exclusively with mode `0600` in a `0700` directory. Updates use a private temporary file and rename. An unresolved checkpoint blocks a new run. Cleanup-only mode can use an old gate, but it still verifies the exact live deployment and configuration before and after cleanup. It cannot create, start, or vote in a room. It keeps room codes and player IDs out of reports.

The smoke starts no ordinary request after its 15-minute work budget. It allows 140 ordinary requests, 640 browser reads, a 32 MiB response budget, and 90 seconds for browser work. Requests already in progress and cleanup have separate bounds. Cleanup has four requests and a 128 KiB allowance. Each request has a 15-second absolute deadline. A real loopback response that sent whitespace every 100 ms stopped after [15,002 ms](transport-deadline-test.json).

The browser uses a fresh context and a bounded Node HTTP transport. Its explicit header list preserves Next.js navigation and prefetch headers. It strips cookies and authorization, blocks browser writes, rejects redirects, and forwards only approved application or game-media origins. It records constant request categories, never raw URLs or header values.

The address check allows at most 131 IPv4 Steam-start reads and one IPv6 control. It first requires two HTTPS sources to agree on the IPv6 address. It varies only reserved example addresses in the spoofed headers. It requires the header-free IPv4 request to remain blocked and the IPv6 control to succeed in the same rate-limit window. The Steam-start limit is 120 requests per 60 seconds. The helper does not follow the redirect to Steam or retain state cookies. It does not write app records. It rechecks the deployment and configuration before recording full success.

| Local suite | Passed cases |
| --- | ---: |
| [Smoke and recovery guards](smoke-tests.json) | 63 |
| [Independent gate failures and stability checks](gate-tests.json) | 33 |
| [Address isolation](address-tests.json) | 36 |
| [Additional independent address checks](independent-address-tests.json) | 16 |
| [Recovery filesystem checks](recovery-filesystem-tests.json) | 10 |
| [Additional independent recovery checks](independent-recovery-tests.json) | 14 |

The filesystem tests used copied helpers with only the private checkpoint directory changed. They used isolated temporary directories and mocked app responses. They did not touch a real hosted checkpoint. Test source files are included beside the results.

## Local rehearsal and limits

The [full rehearsal](rehearsal-all-formats.json) passed all 13 formats, sampled native image and audio routes, one private vote and reveal, room cleanup, and browser layouts at 320 by 568 and 1440 by 1000. It used the [saved earlier helper](rehearsal-all-formats-source.mjs.txt), before ownership checkpoints and the final reveal timing adjustment. Its browser issued 180 requests, of which 179 reached the read transport.

The [final helper rehearsal](rehearsal-final-guest-browser.json) then passed private checkpoint creation, one vote, reveal, cleanup, and both browser layouts. This shorter run did not repeat the full format cycle. The local server used isolated file storage. It does not establish hosted database behavior or account-holder Steam login.

The [preparation status](preparation-final-status.json) confirms that the local server stopped, both checkpointed local rooms were cleaned up, and no pending hosted ownership file existed.

Three earlier failures remain in this archive. The [asset-status failure](rehearsal-asset-failure.json) did not identify its asset or cause. Later format checks passed, but the exact failed asset cannot be claimed as retested. The [browser failure](rehearsal-browser-failure.json) occurred in a helper that stripped navigation headers and had a 320-read limit. The passing helper changed both. The [private-reveal failure](rehearsal-reveal-failure.json) lacked enough timing data to establish its cause. The final helper adds a 1,200 ms margin and at most two extra reads while the same round is still answering. It never retries the vote.

## Hosted execution

Run these commands only after the exact candidate has passed CI and is live, the hosted ingress proof has passed with policy `none`, and the reviewed proxy-policy change has completed. The existing `RENDER_API_KEY` must be available in the operator environment. Do not print it or add it to a command line.

```sh
python3 /tmp/queue-arcade-launch-checks/hosted-smoke-preparation/create-gate.py
/tmp/queue-arcade-launch-checks/tools/node22/bin/node /tmp/queue-arcade-launch-checks/hosted-smoke-preparation/check-address-isolation.mjs --gate /tmp/queue-arcade-launch-checks/hosted-smoke-preparation/hosted-smoke-gate.json
/tmp/queue-arcade-launch-checks/tools/node22/bin/node /tmp/queue-arcade-launch-checks/hosted-smoke-preparation/hosted-smoke.mjs --gate /tmp/queue-arcade-launch-checks/hosted-smoke-preparation/hosted-smoke-gate.json
```

If a run stops after it creates an owned-room checkpoint, use cleanup-only mode before any new smoke run:

```sh
/tmp/queue-arcade-launch-checks/tools/node22/bin/node /tmp/queue-arcade-launch-checks/hosted-smoke-preparation/hosted-smoke.mjs --cleanup-owned --gate /tmp/queue-arcade-launch-checks/hosted-smoke-preparation/hosted-smoke-gate.json
```

Keep pending and completed ownership files private. Archive only the value-free result JSON after review.

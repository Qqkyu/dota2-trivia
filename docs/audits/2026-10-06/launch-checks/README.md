# Launch checks

This record continues the [original security audit](../remediation.md) and the
[complete content, functional and UI review](../deep-review/README.md). Those earlier
records describe their own test runs and remain unchanged. This pass checks the remaining
launch work and records later fixes. The exact release passed CI and is live on Render.
The approved proxy setting is live. Hosted acceptance checks are complete across the
bounded runs described below. All 11 reviewed scratch folders are removed. Private
recovery files and reusable tools passed retention checks. The separate Docker
cleanup awaits direct owner approval after automatic approval review blocked it.

## Completed checks

| Area | Result and evidence |
| --- | --- |
| Question correctness | All 1,517 playable questions have a per-question review record. The current content index links each marked answer to its review evidence and records the 33 later data changes. The 72 retired templates remain excluded. [Content review](content-review.md) |
| Audio | All 123 Echo Hunt and 96 Soundcheck questions received automated source and signal checks. Soundcheck also passed native browser output comparisons for all 288 stages. Speech models retain documented disagreements on some processed voice lines. [Echo](echo/README.md), [Soundcheck](soundcheck/README.md) |
| Artwork and layout | Replaced 23 unclear photo and logo assets with 13 original SVG cards. Preserved the originals outside public output. All 256 affected browser states passed at phone, landscape and desktop sizes. Fixed narrow explanation text and incorrect year-reveal presentation. [Rights and UI checks](rights/README.md) |
| Database | Verified and restored the real Render backup locally. Applied reviewed migrations and a restricted runtime role while the service was paused. All 58 original rows and their original-column hashes survived the migration. Recovery, concurrency and rollback checks use real PostgreSQL. [Database checks](database/README.md), [hosted changes](hosting/README.md) |
| Security | Hardened Steam assertion validation, request limits, ownership, private media, payload handling, browser headers and database recovery. The launch pass adds a bounded authenticated ingress diagnostic. Claude Code Fable 5.1 supplies a separate review. [Security checks](security/README.md) |
| Local checks on 8 October | The verification report records the full suite, data checks, lint, types, production build, browser bundle boundary and live response headers. It identifies which browser build predates the final dependency changes and retains failed attempts. [Local checks](verification/2026-10-08/README.md) |
| Device access | Native Linux keyboard and screen-reader checks passed. Android checks covered part of the flow. Complete native mobile gameplay and physical iPhone access remain unverified. The device report separates app results from emulator startup failures. [Device checks](devices/README.md) |
| Exact release CI | Commit `31961cbd` passed 1,302 tests in 66 files, all 22 UI scripts, three browser gates, visual smoke, PostgreSQL multiplayer and packaged cleanup. Responsive checks covered 320×568 through 3840×2160 and 200% reflow. [Final workflow](ci/runs/38050315807/README.md) |
| Container and capacity | A non-root production image passed native dependency, role, shutdown and vulnerability checks. Four players passed the tested free-service limits. A 466-player run preserved all 4,660 votes but exceeded the one-second response target on one CPU. [Container results](infrastructure/README.md) |

The release content manifest binds the reviewed data and supporting scripts with SHA-256.
It detects later changes; it does not replace factual review. No test claims that speech
recognition is human listening, browser emulation is a physical phone, or a local load run
establishes Render capacity.

The [10 October content freshness check](verification/2026-10-10/content-freshness/README.md)
retrieved all 349 requested Valve endpoints. Review of 37 changed fields found no needed
correction to the playable questions. The report preserves those responses and explains
which historical source files were outside this refresh.

The final [control contrast review](ci/forced-color-fix/README.md) found and fixed
faint muted-volume controls and missing selection marks. Browser pixel checks now cover
normal colors and both light and dark high-contrast palettes. The focused Chromium and
Firefox checks passed. The exact release CI also passed the production-build checks in
Chromium, Firefox and WebKit.

The [10 October dependency audit](security/dependency-audit-20261010.md) found no
advisories. The [refreshed image](ci/image-refresh-20261010/README.md) includes the
Sharp and Alpine zlib fixes and passed a complete vulnerability scan. The
[bundled-library review](security/zlib-bundled-review-20261010.md) records the separate
limits of native-library coverage. The final release passed all 1,302 tests and the full
browser workflow. Its built image had no known findings in the [all-severity scan](ci/final-image-scan/README.md),
which included findings without a published fix. The image report records scanner limits.

The final source candidate is `31961cbd762587225b4b8a814828dc0829952978` on
`codex/launch-checks-20261006`. Its exact Git blobs passed the corrected credential
check for seven app values and two operator values. The
[scanner correction](security/final-exact-scan-v2/README.md) explains why earlier
six-value checks missed the configured Steam web key. The corrected check found
no credential matches. The completed evidence commit requires its own final scan.

## Deployment record

The [CI record](ci/README.md) names the exact checked revision and completed workflow.
The [hosting record](hosting/README.md) records the existing Render service, database,
configuration changes and live checks. The service keeps its existing free plan and the
database keeps its existing plan. No purchase or upgrade is authorized or required for
these checks.

The live health check and signed client-address proof passed. After the owner's explicit
approval on 11 October, the operator enabled `cf-connecting-ip` and redeployed the
same checked commit. Render confirmed it as the sole live deployment. Both plans
and the empty database external allowlist stayed unchanged. Live address isolation, all 13 formats and their media, private guest voting and
reveal, and browser layouts at 320×568 and 1440×1000 passed. The
[acceptance record](hosting/acceptance-20261011/README.md) separates the completed
checks from earlier failed operator runs. The final browser-only run kept the
original limits and verified health and deployment state afterward. The
[cleanup record](cleanup/README.md) records the completed file cleanup and the
specific Docker resources that remain pending approval.

The service must keep one app process. Private rooms, chat, presence and request limits
remain in memory. A restart ends private rooms. The free service can sleep and cannot
provide continuous availability or enforce cleanup while asleep. It remains a limited
preview host. One small-player run also missed the one-second response target, so
passing repeats do not establish a reliable latency margin. The larger load result
does not establish a supported 466-player launch.

Local account lifecycle tests, Steam protocol checks and the configured Steam API key
check passed. A complete hosted interactive Steam login still needs an actual account
holder. The audit does not use their password or reuse their browser session.

The app retains Valve game artwork and audio under the bounded published-terms analysis
in the [rights report](rights/README.md). That report is not blanket legal clearance.

## Preservation and repeatability

The [verification archive](verification/2026-10-08/README.md) confirms that all 335 earlier
evidence files remain unchanged. Every removed public photo has a byte-identical original
in the ignored local archive. Credentials, player rows, database backups, browser profiles
and signed backup URLs are excluded from the checked-in evidence.

The [final evidence checks](verification/2026-10-10/final-evidence/README.md) cover
archive links, manifests, compressed evidence and unchanged earlier reports.
The evidence-only commit uses the checked release as its parent and preserves
the original checkout and index. Its own commit, secret-scan and publication
receipts must stay outside the frozen archive. A commit cannot contain a receipt
that names its own final hash.

Use [operations](../../../operations.md) for repeatable release checks, database recovery,
retention, ingress verification and the constraints on future scaling. Domain reports link
their exact inputs, commands, failures and measured results.

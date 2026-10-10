# Launch checks

This record continues the [original security audit](../remediation.md) and the
[complete content, functional and UI review](../deep-review/README.md). Those earlier
records describe their own test runs and remain unchanged. This pass checks the remaining
launch work and records later fixes. The final CI and hosted deployment checks are in progress.

## Completed checks

| Area | Result and evidence |
| --- | --- |
| Question correctness | All 1,517 playable questions have a per-question review record. The current content index confirms every answer and the 33 later data changes. The 72 retired templates remain excluded. [Content review](content-review.md) |
| Audio | All 123 Echo Hunt and 96 Soundcheck questions received automated source and signal checks. Soundcheck also passed native browser output comparisons for all 288 stages. Speech models retain documented disagreements on some processed voice lines. [Echo](echo/README.md), [Soundcheck](soundcheck/README.md) |
| Artwork and layout | Replaced 23 unclear photo and logo assets with 13 original SVG cards. Preserved the originals outside public output. All 256 affected browser states passed at phone, landscape and desktop sizes. Fixed narrow explanation text and incorrect year-reveal presentation. [Rights and UI checks](rights/README.md) |
| Database | Verified and restored the real Render backup locally. Applied reviewed migrations and a restricted runtime role while the service was paused. All 58 original rows and their original-column hashes survived the migration. Recovery, concurrency and rollback checks use real PostgreSQL. [Database checks](database/README.md), [hosted changes](hosting/README.md) |
| Security | Hardened Steam assertion validation, request limits, ownership, private media, payload handling, browser headers and database recovery. The launch pass adds a bounded authenticated ingress diagnostic. Claude Code Fable 5.1 supplies a separate review. [Security checks](security/README.md) |
| Local release candidate | The current verification report records the full suite, data checks, lint, types, actual production build, browser bundle boundary and live response headers. It retains failed setup attempts and successful repeats. [Final local checks](verification/2026-10-08/README.md) |
| Device access | Native keyboard and screen-reader checks extend the earlier three-engine browser and viewport tests. The device report separates app results from emulator startup failures. [Device checks](devices/README.md) |
| Container and capacity | A non-root production image passed native dependency, role, shutdown and vulnerability checks. Four players passed the tested free-service limits. A 466-player run preserved all 4,660 votes but exceeded the one-second response target on one CPU. [Container results](infrastructure/README.md) |

The release content manifest binds the reviewed data and supporting scripts with SHA-256.
It detects later changes; it does not replace factual review. No test claims that speech
recognition is human listening, browser emulation is a physical phone, or a local load run
establishes Render capacity.

The [10 October dependency audit](security/dependency-audit-20261010.md) found no
advisories. The [refreshed image](ci/image-refresh-20261010/README.md) includes the
Sharp and Alpine zlib fixes and passed a complete vulnerability scan. The
[bundled-library review](security/zlib-bundled-review-20261010.md) records the separate
limits of native-library coverage. Final CI must still pass for the exact release commit.

## Deployment record

The [CI record](ci/README.md) will name the exact checked revision and completed workflow.
The [hosting record](hosting/README.md) records the existing Render service, database,
configuration changes and live checks. The service keeps its existing free plan and the
database keeps its existing plan. No purchase or upgrade is authorized or required for
these checks.

The service must keep one app process. Private rooms, chat, presence and request limits
remain in memory. A restart ends private rooms. The free service can sleep and cannot
provide continuous availability or enforce cleanup while asleep. It remains a limited
preview host. The larger load result does not establish a supported 466-player launch.

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

Use [operations](../../../operations.md) for repeatable release checks, database recovery,
retention, ingress verification and the constraints on future scaling. Domain reports link
their exact inputs, commands, failures and measured results.

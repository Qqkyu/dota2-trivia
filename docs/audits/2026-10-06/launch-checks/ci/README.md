# GitHub Actions verification

[Run 38050315807](https://github.com/Qqkyu/dota2-trivia/actions/runs/38050315807) passed on October 10, 2026 for exact commit `31961cbd762587225b4b8a814828dc0829952978`. All 1,302 tests in 66 files, 22 UI scripts, three browser accessibility gates, final visual smoke, PostgreSQL multiplayer and packaged cleanup checks passed. The [run archive](runs/38050315807/README.md) contains the exact job, log and test evidence.

The [final vulnerability scan](final-image-scan/README.md) found zero known vulnerabilities across all severities, including unfixed issues, in the same tested image: `sha256:3bfdaf12795a02f03a4f0bbb990bb762a2c80c895546ee88102b802a39a1b5ab`. It used the database downloaded during that workflow at 12:05 UTC on October 10, updated at 07:01 UTC that day. The pre-scan freshness command reused this valid cache, whose next update was October 11. The archive binds the image, Dockerfile bytes, native library versions and hashes, scanner and database inputs. The first package-metadata probe stopped before scanning because `apk info --all zlib` returned 1. The installed-package query passed; correcting that helper left the image and application source unchanged.

Four players completed two rounds with eight accepted votes at 0.1 CPU and 512 MiB for the app, and 0.1 CPU and 256 MiB for PostgreSQL. Round latency at the 95th percentile was 186.05 ms; vote latency was 396.76 ms. There were no scenario errors, 5xx responses, restarts or out-of-memory kills. One startup health probe timed out before later probes passed and the workload ended healthy. This small workload does not establish a larger supported player count or a stable one-second margin. The earlier 1,190.88 ms latency miss remains in the dated evidence below.

The [final screenshot review](runs/38050315807/production-ui-review/README.md) confirms the corrected controls in light and dark forced-color palettes. All 40 targeted control images match the prior reviewed production run. Raw accessibility reports retain excluded and incomplete checks. These results do not establish full accessibility conformance. The dated sections below preserve the earlier failures and fixes.

This check prepares a disposable runner for the private `Qqkyu/dota2-trivia` repository. It uses the existing local Docker Desktop engine. It does not need a paid runner, subscription, persistent service, or change to personal settings.

## Official requirements

GitHub's current billing documentation states that self-hosted runner usage is free. Artifact and cache storage have separate allowances and can incur charges. The local workflow path therefore disables pnpm, automatic Node, and Trivy caches, and skips artifact uploads. Logs are collected locally. [GitHub Actions billing](https://docs.github.com/en/billing/concepts/product-billing/github-actions)

Linux and Docker are required for service containers. An ephemeral runner receives one job, then GitHub removes its registration. The owner must discard its local files. A repository registration token expires after one hour and requires repository administration permission. [Runner requirements and lifecycle](https://docs.github.com/en/actions/reference/runners/self-hosted-runners), [runner REST API](https://docs.github.com/en/rest/actions/self-hosted-runners)

A manual workflow event depends on the workflow's presence on the default branch. The first candidate run instead uses a push to the exact private branch `codex/launch-checks-20261006`. This avoids changing `main`. The branch selects a repository-specific self-hosted label. Main and pull-request workflows retain their hosted runner configuration. [Workflow events](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#workflow_dispatch), [workflow syntax](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax)

## Local design

The runner image uses Ubuntu 24.04, Node 22, Chrome, PulseAudio, and Docker. Runner version 2.337.0 is pinned to the SHA-256 digest published in the [official release](https://github.com/actions/runner/releases/tag/v2.337.0).

The container starts its own Docker daemon and uses a dedicated disposable data volume. No host Docker socket or personal directory is mounted. Postgres and the test app run inside that daemon, so the workflow's `127.0.0.1` and host-network checks retain their normal behavior. The outer container needs privileged mode for the nested daemon. This shares the Docker Desktop VM kernel; it is not a separate virtual machine. It is restricted to the reviewed repository job, with 2 CPUs and 5 GiB of memory enforced for each run.

The host GitHub credential stays on the host. Only a short-lived repository registration token enters the runner. Registration uses `--ephemeral --disableupdate` and label `queue-arcade-ci-local`. No runner service is installed on the host. After the job, local diagnostics are copied out, the container and its data volume are removed, and the repository runner list is checked for removal.

## Workflow validation

The workflow now supports the exact candidate branch and an explicit `local_runner` manual input. Both local paths select `[self-hosted, Linux, X64, queue-arcade-ci-local]`. They disable all three configured caches and failure artifact uploads. Hosted main and pull-request paths keep the prior behavior. Native round and shop accessibility regressions are included in the 22-script `check:ui` command. After building and scanning the image, `check:container --skip-build` runs the small four-player, two-round test with separate migration and runtime database roles and checked CPU and memory limits. The current step explicitly uses the preview budget: 0.1 CPU and 512 MiB for the app, plus 0.1 CPU and 256 MiB for Postgres.

GitHub's official `@actions/workflow-parser` version 0.3.61 parsed and converted the workflow with zero schema errors. Its expression evaluator checked candidate, main, pull-request, and manual-local routing and cache conditions. The temporary Node loader only supplies JSON module support for the parser's bundled schema; it does not change the schema or validation. [Official parser source](https://github.com/actions/languageservices/tree/main/workflow-parser)

The workflow sets `LAUNCH_DATABASE_TEST_URL` to the isolated loopback service database, so the launch migration and runtime-role suite does not skip. It sets `PG_BIN_DIR=/usr/lib/postgresql/17/bin` for backup and restore tests. Vitest runs with `--maxWorkers=2` on both runner paths. This bounds concurrency on the local two-CPU runner. The validation report checks all three settings.

The PostgreSQL client step uses the official PGDG signing key and a repository-specific `Signed-By` entry. It installs only `postgresql-client-17`, then checks the versions of `pg_dump` and `pg_restore`. The setup follows [PostgreSQL's Ubuntu instructions](https://www.postgresql.org/download/linux/ubuntu/), with the distribution codename read from the runner.

The exact workflow install script passed in an unregistered, unprivileged disposable Ubuntu 24.04 container capped at 0.5 CPU and 768 MiB. It installed client 17.11. Those client binaries created a custom-format dump from a separate PostgreSQL 17.11 container and restored both fixture rows into a new database. See the [version and repository record](pg17-client/client-versions.log), [round-trip result](pg17-client/roundtrip.json), and [preflight script](pg17-client/run-preflight.sh.txt). The first probe reached the image's temporary Unix initialization socket before database creation; the final probe waits for its TCP listener. Both attempts removed their own containers and networks. No host packages were installed. This preflight checked the tools; the successful final workflow also ran the backup and migration suites.

The pinned [Trivy action](https://github.com/aquasecurity/trivy-action/blob/57a97c7e7821a5776cebc9bb87c984fa69cba8f1/action.yaml) forwards its `cache` input to both the database cache and setup action. The pinned [setup-node action](https://github.com/actions/setup-node/blob/249970729cb0ef3589644e2896645e5dc5ba9c38/action.yml) supports explicit and automatic package caching controls. Both were checked directly before editing the workflow.

## Initial preflight on 6 October

The runner image built successfully. The local preflight passed and exited with code 0. It used runner 2.337.0, Node 22.23.3, Chrome 154.0.8037.97, Docker 29.1.3, Buildx 0.30.1, and PulseAudio 16.1. Its container and dedicated data volume were removed after collecting evidence. At this stage, no runner was registered and the full CI job had not started. GitHub Actions workflow 324937009 was initially disabled, and the repository had no registered runners. The next step at that stage was to enable the workflow and push the checked candidate branch.

The [local preflight](preflight.log) checked the runner binary, Node, Docker builds, Chrome under the unprivileged runner user, PulseAudio, a published Postgres port, and an HTTP container using the nested daemon's host network. The [container metadata](preflight-container.json) confirms the 2-CPU/5-GiB limits and its sole dedicated Docker-data mount. A passing preflight alone is not a completed GitHub Actions workflow.

The prepared [start script](start-runner.sh.txt) creates only a repository registration token and starts the local container. The [cleanup script](cleanup-runner.sh.txt) refuses to remove a running runner, saves diagnostics, removes any remaining matching registration, and deletes only the named disposable container, volume, and token file. Neither script had run at this initial preflight stage.

The [pre-push secret and file-size scan](secret-scan/README.md) classified all 59 Gitleaks matches in a 1,181-file snapshot. It found no repository credentials or files above GitHub's 100 MiB limit. This initial scan preceded the exact-commit scans recorded below.

## Resumed launch checks on 8 October

Docker Desktop was stopped when work resumed. Starting its installed application restored engine 28.3.2 and the prepared runner image. Its WSL integration service still refused connections through the Linux socket and WSL bind mounts. No Docker or WSL setting was changed.

The Windows Docker CLI can use the existing engine. A disposable capped container verified that a tar archive can pass through standard input into `docker cp`. This lets the runner start without a host bind mount. The revised [lifecycle helper](runner-lifecycle.py.txt) creates a container and a dedicated volume, then copies only the short-lived registration token and the reviewed entrypoint. The token has mode `0600` and root ownership. The [entrypoint](entrypoint-2026-10-08.sh.txt) removes it after registration and also on failure. The host GitHub credential stays outside the container. The resource limits and nested Docker design are unchanged.

The helper assigns a unique ownership label to its container, volume, and GitHub registration. Cleanup checks those labels, refuses a running container, and can resume after a partial failure. A failure to save diagnostics or remove a GitHub registration does not prevent independent local cleanup. It checks all GitHub runner pages and verifies resource removal before it allows another start. Each attempt has a separate local evidence directory.

A separate reviewer tested ten cases with mocked subprocesses. These cover start-time limits and credential handling, normal cleanup, missing resources, rejected diagnostic copies, GitHub errors, volume removal and retry, ownership mismatch, and a running container. All passed. The [result](lifecycle-review/result.json) binds the reviewed scripts by SHA-256. The [mock tests](lifecycle-review/review_lifecycle.py.txt) did not register a runner or run Docker. The helper's read-only Docker lookups and paginated GitHub listing also passed against the existing services. A full workflow result was still pending at this stage.

## First workflow results on 8 October

The original push event arrived after a manual dispatch and cancelled that dispatch under the workflow's concurrency rule. [Run 37797906984](runs/37797906984/README.md) records that incomplete attempt. A fresh dependency audit then found a newly published Sharp advisory. The next candidate includes Sharp 0.35.5.

The replacement push run reached the test step and exposed a pnpm 9.12.1 argument error. The corrected step is `pnpm exec vitest run --maxWorkers=2`. In the same installed runner environment, that command passed all 1,284 tests, then lint and typecheck passed without a generated `next-env.d.ts`. [Run 37799841251](runs/37799841251/README.md) records the failure and local recheck. Both disposable runners and their volumes were removed. The corrected command still required a new complete workflow.

## Resumed checks on 10 October

[Run 37802218519](runs/37802218519/README.md) passed all 1,284 tests, lint, typecheck, builds, the client-bundle check, and the image vulnerability gate. The constrained-container step then stopped before the app started because the nested runner had not delegated its private cgroup controllers. The [failure reproduction and fix](cgroup-fix/README.md) preserve the original failure and prove CPU throttling and child memory-limit enforcement. The outer 2 CPU, 5 GiB limit stayed unchanged. No host cgroup or daemon setting changed.

The [image preflight](image-refresh-20261010/README.md) rebuilt the candidate with the current zlib fix. The small app/database flow passed at its documented 1 CPU defaults. A refreshed Trivy database found zero known vulnerabilities across all severities, including unfixed issues. The stale runner, registration, and dedicated volume were removed. These preflight results do not replace a successful workflow for the final commit.

The final workflow now runs its small four-player container check at the intended preview budget: app 0.1 CPU and 512 MiB, database 0.1 CPU and 256 MiB, with swap disabled. The official workflow parser and expression checks passed with assertions for those four limits. These settings were included in the next exact-commit workflow.

The current image gate rejects fixable MEDIUM, HIGH, and CRITICAL vulnerabilities. This includes the newly fixed zlib advisory. The final release scan also checks LOW, UNKNOWN, and unfixed findings separately. The validator asserts the gate settings.

## Startup deadline fix

[Run 38041621109](runs/38041621109/README.md) passed all 1,284 tests, code checks, builds, and the expanded image gate. The preview-cap check then exited while awaiting its first health request. The [diagnosis and fix](health-readiness-fix/README.md) preserve the failure, controlled native-fetch reproduction, six process regressions, independent review, and capped-flow results. The new bounded request helper prevents the observed premature process exit without changing the two-second request deadline, quotas, or latency threshold.

The fixed quiet capped flow passed, but another sample missed the one-second round-latency target. Both are retained. The free preview budget has limited measured latency margin. The next run was still required at this stage. The failed-run container and its dedicated data volume have been removed.

## Browser checks on 10 October

[Run 38043410114](runs/38043410114/README.md) passed all 1,290 tests and the constrained four-player check. At the preview limits, round latency at the 95th percentile was 300.61 ms and vote latency was 514.71 ms. The browser batch then failed after a fixed 400 ms delay because the missing-room error was still empty. The original request timing was not traced. The [lobby diagnosis](party-lobby-readiness-fix/README.md) preserves the exact failure and a controlled slow-response reproduction. The check now waits for an error or an unexpected lobby, keeps its existing timeout, and verifies that Join becomes available again.

The complete saved-image UI batch passed after that change. It covered 22 scripts, 52 player journeys, 2,489 responsive checks, native audio output, and rate limiting. Chromium, Firefox and WebKit also passed their configured accessibility gates. The archived reports retain excluded forced-color contrast findings and incomplete checks; those results do not mean that automated tools proved all contrast correct.

The later visual smoke exposed two older test errors. Its four-attempt poll ignored the shared 800 ms vote grace, and its sound-settings fixtures expected obsolete defaults and storage keys. The [visual diagnosis](visual-entry-readiness-fix/README.md) records both failures. The corrected poll has request and total deadlines and requires five seconds of usable reveal time after accounting for request time. The settings check now verifies the existing 70% default, migration from the previous settings version, and an explicit muted 45% choice. Application timing, volume behavior and audio playback did not change.

The final saved-image visual smoke, PostgreSQL multiplayer test and packaged cleanup check passed. Twelve focused polling regressions and scoped lint passed. These are preflight results for the browser-test fixes; a successful workflow on the new exact commit is still required.

## Control contrast on 10 October

[Run 38046647944](runs/38046647944/README.md) was cancelled during browser installation after a [review of the saved screenshots](forced-colors-review/README.md) found four visible control defects. No application check failed in that cancelled run. Its owned runner, volume and registration were removed.

The [contrast fix and regression evidence](forced-color-fix/README.md) cover muted volume controls, party checkmarks, Shopkeeper selection and calibration filter selection. The volume controls also failed the normal-theme check. Their opacity is now unchanged by mute state; the icon and accessible label still identify mute. Forced-color selections use system colors and visible marks, with a separate keyboard focus outline. The workflow now includes both light and dark forced-color palettes.

The focused local checks passed 117 painting and interaction assertions in Chromium 149 and 78 in Firefox 151. Both browsers preserved the party button names and pressed state without announcing the decorative checkmark. Independent screenshot and source reviews passed. WebKit could not launch locally because a required shared library was absent, so this local check makes no WebKit claim. The later production workflow still runs its configured three-browser checks. These results cover the affected controls; the raw axe exclusions and incomplete contrast findings remain in the reports.

## Year-reveal smoke assertion on 10 October

[Run 38047885476](runs/38047885476/README.md) passed all 1,302 tests in 66 files, the image gate, the constrained container check, all 22 UI scripts and all three accessibility gates. The final silent browser smoke then selected a Flashback year question and failed because it still required a slider during reveal. The app already displayed the correct year and the player's separate answer, as documented in the earlier [year-display fix](../rights/year-reveal.md). The [saved screenshot review](runs/38047885476/visual-smoke-diagnosis/diagnosis.json) confirms that state. The original run did not record the report panel's pre-open bounds, so it cannot exclude a second geometry failure from that measurement alone.

The [smoke correction](year-reveal-smoke-fix/README.md) checks the visible correct-year label and readout, the submitted year and the absence of answering controls. It keeps the shared reveal, crowd and report-menu assertions. Four controlled cases against the same production image rejected the old requirement and passed the new one. The report bounds stayed identical in those cases. Forty-eight predicate checks and scoped lint also passed.

The corrected full smoke, PostgreSQL multiplayer check and packaged cleanup dry run passed against the saved image. That full smoke selected Soundcheck; the controlled cases supply the year-specific evidence. These follow-up results do not change the failed workflow's outcome. Its owned runner, registration and dedicated volume were removed before starting the next exact-commit run.

The [production screenshot review](runs/38047885476/production-ui-review/README.md) also confirmed the four contrast fixes in the light and dark forced-color palettes. Automated accessibility reports retain their excluded and incomplete findings. Neither the targeted screenshot review nor the passing automated gates claim complete contrast coverage.

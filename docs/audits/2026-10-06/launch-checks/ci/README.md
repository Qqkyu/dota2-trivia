# Local GitHub Actions runner

This check prepares a disposable runner for the private `Qqkyu/dota2-trivia` repository. It uses the existing local Docker Desktop engine. It does not need a paid runner, subscription, persistent service, or change to personal settings.

## Official requirements

GitHub's current billing documentation states that self-hosted runner usage is free. Artifact and cache storage have separate allowances and can incur charges. The local workflow path therefore disables pnpm, automatic Node, and Trivy caches, and skips artifact uploads. Logs are collected locally. [GitHub Actions billing](https://docs.github.com/en/billing/concepts/product-billing/github-actions)

Linux and Docker are required for service containers. An ephemeral runner receives one job, then GitHub removes its registration. The owner must discard its local files. A repository registration token expires after one hour and requires repository administration permission. [Runner requirements and lifecycle](https://docs.github.com/en/actions/reference/runners/self-hosted-runners), [runner REST API](https://docs.github.com/en/rest/actions/self-hosted-runners)

A manual workflow event depends on the workflow's presence on the default branch. The first candidate run instead uses a push to the exact private branch `codex/launch-checks-20261006`. This avoids changing `main`. The branch selects a repository-specific self-hosted label. Main and pull-request workflows retain their hosted runner configuration. [Workflow events](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#workflow_dispatch), [workflow syntax](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax)

## Local design

The runner image uses Ubuntu 24.04, Node 22, Chrome, PulseAudio, and Docker. Runner version 2.337.0 is pinned to the SHA-256 digest published in the [official release](https://github.com/actions/runner/releases/tag/v2.337.0).

The container starts its own Docker daemon and uses a dedicated disposable data volume. No host Docker socket or personal directory is mounted. Postgres and the test app run inside that daemon, so the workflow's `127.0.0.1` and host-network checks retain their normal behavior. The outer container needs privileged mode for the nested daemon. This shares the Docker Desktop VM kernel; it is not a separate virtual machine. It is restricted to the reviewed repository job, with 2 CPUs and 5 GiB of memory planned for the run.

The host GitHub credential stays on the host. Only a short-lived repository registration token enters the runner. Registration uses `--ephemeral --disableupdate` and label `queue-arcade-ci-local`. No runner service is installed on the host. After the job, local diagnostics are copied out, the container and its data volume are removed, and the repository runner list is checked for removal.

## Workflow validation

The workflow now supports the exact candidate branch and an explicit `local_runner` manual input. Both local paths select `[self-hosted, Linux, X64, queue-arcade-ci-local]`. They disable all three configured caches and failure artifact uploads. Hosted main and pull-request paths keep the prior behavior. Native round and shop accessibility regressions are included in the 22-script `check:ui` command. After building and scanning the image, `check:container --skip-build` runs the small four-player, two-round test with separate migration and runtime database roles and checked CPU and memory limits.

GitHub's official `@actions/workflow-parser` version 0.3.61 parsed and converted the workflow with zero schema errors. Its expression evaluator checked candidate, main, pull-request, and manual-local routing and cache conditions. The temporary Node loader only supplies JSON module support for the parser's bundled schema; it does not change the schema or validation. [Official parser source](https://github.com/actions/languageservices/tree/main/workflow-parser)

The workflow sets `LAUNCH_DATABASE_TEST_URL` to the isolated loopback service database, so the launch migration and runtime-role suite does not skip. It sets `PG_BIN_DIR=/usr/lib/postgresql/17/bin` for backup and restore tests. Vitest runs with `--maxWorkers=2` on both runner paths. This bounds concurrency on the local two-CPU runner. The validation report checks all three settings.

The PostgreSQL client step uses the official PGDG signing key and a repository-specific `Signed-By` entry. It installs only `postgresql-client-17`, then checks the versions of `pg_dump` and `pg_restore`. The setup follows [PostgreSQL's Ubuntu instructions](https://www.postgresql.org/download/linux/ubuntu/), with the distribution codename read from the runner.

The exact workflow install script passed in an unregistered, unprivileged disposable Ubuntu 24.04 container capped at 0.5 CPU and 768 MiB. It installed client 17.11. Those client binaries created a custom-format dump from a separate PostgreSQL 17.11 container and restored both fixture rows into a new database. See the [version and repository record](pg17-client/client-versions.log), [round-trip result](pg17-client/roundtrip.json), and [preflight script](pg17-client/run-preflight.sh.txt). The first probe reached the image's temporary Unix initialization socket before database creation; the final probe waits for its TCP listener. Both attempts removed their own containers and networks. No host packages were installed. This preflight checks the tools; the complete backup and migration suites still require the real CI run.

The pinned [Trivy action](https://github.com/aquasecurity/trivy-action/blob/57a97c7e7821a5776cebc9bb87c984fa69cba8f1/action.yaml) forwards its `cache` input to both the database cache and setup action. The pinned [setup-node action](https://github.com/actions/setup-node/blob/249970729cb0ef3589644e2896645e5dc5ba9c38/action.yml) supports explicit and automatic package caching controls. Both were checked directly before editing the workflow.

## Progress

The runner image built successfully. The local preflight passed and exited with code 0. It used runner 2.337.0, Node 22.23.3, Chrome 154.0.8037.97, Docker 29.1.3, Buildx 0.30.1, and PulseAudio 16.1. Its container and dedicated data volume were removed after collecting evidence. No runner is registered yet; the full CI job is waiting for the parent agent to finish memory-heavy local checks. GitHub Actions workflow 324937009 was initially disabled, and the repository had no registered runners. The parent agent owns enabling the workflow and pushing the candidate branch after source checks finish.

The [local preflight](preflight.log) checked the runner binary, Node, Docker builds, Chrome under the unprivileged runner user, PulseAudio, a published Postgres port, and an HTTP container using the nested daemon's host network. The [container metadata](preflight-container.json) confirms the 2-CPU/5-GiB limits and its sole dedicated Docker-data mount. A passing preflight alone is not a completed GitHub Actions workflow.

The prepared [start script](start-runner.sh.txt) creates only a repository registration token and starts the local container. The [cleanup script](cleanup-runner.sh.txt) refuses to remove a running runner, saves diagnostics, removes any remaining matching registration, and deletes only the named disposable container, volume, and token file. Neither script has been run yet.

The [pre-push secret and file-size scan](secret-scan/README.md) classified all 59 Gitleaks matches in a 1,181-file snapshot. It found no repository credentials or files above GitHub's 100 MiB limit. The exact final candidate still needs a scan after source and evidence files stop changing.

## Resumed launch checks on 8 October

Docker Desktop was stopped when work resumed. Starting its installed application restored engine 28.3.2 and the prepared runner image. Its WSL integration service still refused connections through the Linux socket and WSL bind mounts. No Docker or WSL setting was changed.

The Windows Docker CLI can use the existing engine. A disposable capped container verified that a tar archive can pass through standard input into `docker cp`. This lets the runner start without a host bind mount. The revised [lifecycle helper](runner-lifecycle.py.txt) creates a container and a dedicated volume, then copies only the short-lived registration token and the reviewed entrypoint. The token has mode `0600` and root ownership. The [entrypoint](entrypoint-2026-10-08.sh.txt) removes it after registration and also on failure. The host GitHub credential stays outside the container. The resource limits and nested Docker design are unchanged.

The helper assigns a unique ownership label to its container, volume, and GitHub registration. Cleanup checks those labels, refuses a running container, and can resume after a partial failure. A failure to save diagnostics or remove a GitHub registration does not prevent independent local cleanup. It checks all GitHub runner pages and verifies resource removal before it allows another start. Each attempt has a separate local evidence directory.

A separate reviewer tested ten cases with mocked subprocesses. These cover start-time limits and credential handling, normal cleanup, missing resources, rejected diagnostic copies, GitHub errors, volume removal and retry, ownership mismatch, and a running container. All passed. The [result](lifecycle-review/result.json) binds the reviewed scripts by SHA-256. The [mock tests](lifecycle-review/review_lifecycle.py.txt) did not register a runner or run Docker. The helper's read-only Docker lookups and paginated GitHub listing also passed against the existing services. A full workflow result is still pending.

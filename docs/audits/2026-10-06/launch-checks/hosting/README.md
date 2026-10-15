# Hosting launch checks

This pass checks the existing `queue-arcade` Render service and its database. It uses the repository and resource IDs that match the app. It does not change plans or buy resources.

## Initial state

The Render API reported one free Docker service in Frankfurt, suspended by the user, with automatic deployment on commits to `main`. The repository's local Blueprint specifies manual deployment, so those settings do not yet match. The service has its application origin, separate 64-character authentication and voter secrets, a database connection, a Steam API key, and Germany as its data location. It lacks an explicit trusted-proxy policy required by the new startup check. Secret values were not printed or archived.

The existing PostgreSQL 17 database is available in Frankfurt on its existing `0.1c-256mb` plan. Its external IP allowlist was empty. This blocked the hosted read-only database tool, as intended. Point-in-time recovery is available from `2026-10-02T22:54:14Z`.

A later bounded check temporarily allowed only the operator machine's single IPv4 address. It used verified TLS 1.3 and a read-only transaction, then restored the empty allowlist. The successful check took 3.82 seconds. An earlier attempt had a table-identifier error and also restored the firewall. No data, schema or plan changed. The [safe results](database-readonly.json) contain role flags and table counts, without player rows or credentials. They found 10 app tables and 58 rows. The configured database owner can create roles and databases and owns every app table, so the service needs a separate restricted runtime role.

An on-demand logical export completed at `2026-10-06T12:26:00Z`. The compressed archive is 6,702 bytes and has SHA-256 `6a16d2668dc231a0b947e7e1917b6936a7bcdabd8ac3036ed641cf11c3fac76a`. It contains 14 entries and 32,898 expanded bytes. It was downloaded into a mode-0700 temporary directory, with mode-0600 files. Raw data and the signed download URL are excluded from audit evidence. The database review owns the isolated PostgreSQL 17 restore and migration checks.

Render documents [logical exports and recovery](https://render.com/docs/postgresql-backups). The [export API](https://api-docs.render.com/reference/create-postgres-export) creates a backup on the existing database. A point-in-time restore creates another billable database, so this pass uses a local restore instead.

The initial check found working GitHub access with repository administration rights. The repository permitted Actions, but its existing workflow was disabled manually. At that point, the public app remained suspended while the candidate was checked.

## Hosted database preparation

The reviewed operator helper applied migrations 1 and 2 on the paused Render database at `2026-10-06T13:29Z`. One transaction held the schema changes, runtime-role creation, grants, and original-data checks. All 58 original rows and every original column hash matched the verified backup. The only added rows were the two migration records. The [safe result](database-productionize.json) records the checks without credentials or player data.

The new runtime role can read and write app rows. It cannot create database objects, truncate tables, change the migration ledger, inherit another role, or use administrative privileges. A separate verified-TLS login passed read-only readiness and data checks after commit. The helper restored the empty external IP allowlist. The complete operation took 23.88 seconds. Both resource plans stayed unchanged.

The paused service now uses that restricted role through Render's internal database URL with `sslmode=require`. Automatic migrations and deployments are disabled. Other environment values are unchanged. The operator retained the old configuration privately for recovery. Render's [connection documentation](https://render.com/docs/postgresql-creating-connecting#ssl-modes-for-internal-connections) explains why its internal self-signed connection uses `require`; the external operator connection verified the provider's certificate.

Automatic approval review rejected enabling `cf-connecting-ip` trust before the hosted edge check. The safer configuration was approved and applied with `ARCADE_TRUST_PROXY=none`. No forwarded address is trusted. That policy remained disabled until the signed hosted proof and later owner approval described below.

## Public contact

The privacy page linked to this private repository's issue tracker. Public players could not use it. It now links to the maintainer's email already published in the [public GitHub profile](https://github.com/Qqkyu). No email was sent. The page check rejects a return to the private issue link. The app's footer now distinguishes the Dota 2 trademark from ownership of game assets.

## Deployment on 10 October

Commit `31961cbd762587225b4b8a814828dc0829952978` passed [exact-release CI](../ci/runs/38050315807/README.md). At 12:33 UTC, the operator set the service branch to `codex/launch-checks-20261006` and kept automatic deployments off. The service remained paused with proxy trust set to `none`. Its plans stayed unchanged. The [configuration receipt](candidate-configuration.json) records those checks.

The exact-commit deploy request returned HTTP 400. A bounded retry inspected the provider message in memory and confirmed an explicit suspended-service error. A fresh service read still showed user suspension. The [diagnostic receipt](paused-deploy-unexpected-status.json) contains only that classification. It excludes the raw provider response. The original operator helper expected HTTP 409 and stopped without resuming the service. The [four-line helper correction](deployment-helper-v2/README.md) accepts either status only with the same explicit reason and fresh paused state. All 27 tests passed, including an independent run with network calls blocked.

The corrected helper repeated the paused deploy check, then resumed the existing service at 12:40:29 UTC. Resume created no deployment during its bounded observation. The operator then requested the exact commit. Render accepted deployment `dep-db534k0473hc739n08rg` at 12:40:48 UTC and reported the correct commit. The [resume receipt](candidate-resume.json) and [deploy receipt](candidate-deploy.json) record this sequence. At 12:43:51 UTC, the [status check](candidate-deploy-status.json) confirmed the exact candidate was the sole live deployment and the previous image was deactivated. The earlier [deployment-path review](deployment-path.md) explains the limits of resuming this existing service.

The original ingress proof stopped on a non-JSON response. A bounded diagnostic found that the baseline, fake `X-Real-IP`, and fake `X-Forwarded-For` cases returned JSON. The two cases supplying `CF-Connecting-IP` returned HTTP 403 with the exact Cloudflare error 1000 marker. The [safe diagnostic](hosted-ingress-error1000-diagnosis.json) records only response classifications. Cloudflare [documents this header as a cause of error 1000](https://developers.cloudflare.com/support/troubleshooting/http-status-codes/cloudflare-1xxx-errors/error-1000/). The original helper assumed that every case would reach the app.

The corrected [hosted proof](hosted-ingress-proof-v2-initial.json) passed at 12:57:17 UTC. Three cases returned signed proof of the IPv4 address agreed by two independent sources. Cloudflare rejected both requests that supplied its address header. The report labels these rejections separately; it does not claim that those requests returned address proofs. The deployment and environment stayed unchanged throughout the check.

Automatic approval review then rejected the proxy-policy update and same-commit redeploy before execution. It required explicit owner approval for this persistent change to the trusted client-address header. The operator requested that approval. The [approval status](proxy-policy-approval-status.json) records the blocked action on 10 October. The owner approved the exact setting and same-commit redeploy on 11 October, as recorded below.

## Approved proxy deployment on 11 October

The owner explicitly approved changing `ARCADE_TRUST_PROXY` to `cf-connecting-ip`
and redeploying the same checked commit. The [approval record](proxy-policy-user-approval-20261011.json)
keeps that scope. An initial operator attempt stopped before changing Render because
its restricted `PATH` could not resolve the installed GitHub CLI. The
[narrow path correction](operator-gh-path-20261011/README.md) changes only that executable
path and the gate's matching helper path and hash. All 101 offline checks passed.

The operator repeated the [signed ingress proof](hosted-ingress-proof-v2.json) at
06:23:38 UTC. Three cases proved the independently verified client address. Cloudflare
rejected both supplied Cloudflare-header cases with error 1000. The configuration and
deployment stayed stable during the proof. The helper then changed the single approved
key and requested the same commit. At 06:24:36 UTC, the
[policy deployment receipt](proxy-policy-change-v2.json) confirmed that
`dep-db5imrt9fdbs73d19570` was the sole live deployment of
`31961cbd762587225b4b8a814828dc0829952978`, with no deployment pending.
All other environment values, both plans and the empty database external allowlist
stayed unchanged. The hosted acceptance checks use this deployment.

The [hosted acceptance record](acceptance-20261011/README.md) preserves the original
failed test attempts and their corrections. The final address-isolation check passed.
Changing caller-supplied headers did not evade the IPv4 limit, and an independent
IPv6 client could start login in the same limit window. The IPv6 control used a
verified Cloudflare connection with the app hostname and certificate checks intact.
The [routing report](ipv6-routing-20261011/README.md) explains why this is not native
IPv6 support for the Render hostname.

All 13 formats and their media passed the hosted checks. The corrected private
guest test observed its accepted vote and the same round's reveal, then confirmed
room removal. A separate browser-only run passed answering, reveal and both
320×568 and 1440×1000 layouts with zero page errors. It kept the original network
limits and verified health and configuration afterward. These checks complete the
[hosted acceptance record](acceptance-20261011/README.md) across separate bounded
runs of the same deployment. The report retains the original failures and the
limits of their diagnoses. No real Steam account login was attempted.

Render builds the checked Git commit itself. The [full vulnerability scan](../ci/final-image-scan/README.md) covers the exact image built and tested in CI. This record does not claim that Render's rebuilt image has the same digest. Hosted tests check the deployed app separately.

## Acceptance criteria

- Preserve database contents and prove that the real export restores into an isolated database.
- Apply and test schema changes locally before any remote migration.
- Verify the final production image and its native dependencies under explicit CPU and memory limits.
- Verify any trusted client-IP policy against the actual hosted edge before enabling it there.
- Keep private data, secrets and original quarantined photos outside the release image and evidence archive.
- Run CI with the checked source and retain its exact revision and results.
- Keep all resource plans unchanged.

This is a working record. Final outcomes and remaining constraints belong in the launch-check summary.

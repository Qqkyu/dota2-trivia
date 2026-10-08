# Hosting launch checks

This pass checks the existing `queue-arcade` Render service and its database. It uses the repository and resource IDs that match the app. It does not change plans or buy resources.

## Initial state

The Render API reported one free Docker service in Frankfurt, suspended by the user, with automatic deployment on commits to `main`. The repository's local Blueprint specifies manual deployment, so those settings do not yet match. The service has its application origin, separate 64-character authentication and voter secrets, a database connection, a Steam API key, and Germany as its data location. It lacks an explicit trusted-proxy policy required by the new startup check. Secret values were not printed or archived.

The existing PostgreSQL 17 database is available in Frankfurt on its existing `0.1c-256mb` plan. Its external IP allowlist was empty. This blocked the hosted read-only database tool, as intended. Point-in-time recovery is available from `2026-10-02T22:54:14Z`.

A later bounded check temporarily allowed only the operator machine's single IPv4 address. It used verified TLS 1.3 and a read-only transaction, then restored the empty allowlist. The successful check took 3.82 seconds. An earlier attempt had a table-identifier error and also restored the firewall. No data, schema or plan changed. The [safe results](database-readonly.json) contain role flags and table counts, without player rows or credentials. They found 10 app tables and 58 rows. The configured database owner can create roles and databases and owns every app table, so the service needs a separate restricted runtime role.

An on-demand logical export completed at `2026-10-06T12:26:00Z`. The compressed archive is 6,702 bytes and has SHA-256 `6a16d2668dc231a0b947e7e1917b6936a7bcdabd8ac3036ed641cf11c3fac76a`. It contains 14 entries and 32,898 expanded bytes. It was downloaded into a mode-0700 temporary directory, with mode-0600 files. Raw data and the signed download URL are excluded from audit evidence. The database review owns the isolated PostgreSQL 17 restore and migration checks.

Render documents [logical exports and recovery](https://render.com/docs/postgresql-backups). The [export API](https://api-docs.render.com/reference/create-postgres-export) creates a backup on the existing database. A point-in-time restore creates another billable database, so this pass uses a local restore instead.

GitHub access works with repository administration rights. The repository permits Actions, but its existing workflow is disabled manually. The public app remains suspended while the candidate is checked.

## Hosted database preparation

The reviewed operator helper applied migrations 1 and 2 on the paused Render database at `2026-10-06T13:29Z`. One transaction held the schema changes, runtime-role creation, grants, and original-data checks. All 58 original rows and every original column hash matched the verified backup. The only added rows were the two migration records. The [safe result](database-productionize.json) records the checks without credentials or player data.

The new runtime role can read and write app rows. It cannot create database objects, truncate tables, change the migration ledger, inherit another role, or use administrative privileges. A separate verified-TLS login passed read-only readiness and data checks after commit. The helper restored the empty external IP allowlist. The complete operation took 23.88 seconds. Both resource plans stayed unchanged.

The paused service now uses that restricted role through Render's internal database URL with `sslmode=require`. Automatic migrations and deployments are disabled. Other environment values are unchanged. The operator retained the old configuration privately for recovery. Render's [connection documentation](https://render.com/docs/postgresql-creating-connecting#ssl-modes-for-internal-connections) explains why its internal self-signed connection uses `require`; the external operator connection verified the provider's certificate.

Automatic approval review rejected enabling `cf-connecting-ip` trust before the hosted edge check. The safer configuration was approved and applied with `ARCADE_TRUST_PROXY=none`. No forwarded address is trusted. Hosted ingress verification remains pending before any request to enable that policy.

## Public contact

The privacy page linked to this private repository's issue tracker. Public players could not use it. It now links to the maintainer's email already published in the [public GitHub profile](https://github.com/Qqkyu). No email was sent. The page check rejects a return to the private issue link. The app's footer now distinguishes the Dota 2 trademark from ownership of game assets.

## Acceptance criteria

- Preserve database contents and prove that the real export restores into an isolated database.
- Apply and test schema changes locally before any remote migration.
- Verify the final production image and its native dependencies under explicit CPU and memory limits.
- Verify any trusted client-IP policy against the actual hosted edge before enabling it there.
- Keep private data, secrets and original quarantined photos outside the release image and evidence archive.
- Run CI with the checked source and retain its exact revision and results.
- Keep all resource plans unchanged.

This is a working record. Final outcomes and remaining constraints belong in the launch-check summary.

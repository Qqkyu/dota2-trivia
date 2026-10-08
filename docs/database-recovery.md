# Database backup and recovery

Use these commands from an operator machine with Node and PostgreSQL client tools. They
read exported connection URLs. They do not load `.env` files. Use PostgreSQL 17 or newer
clients for a PostgreSQL 17 server. `PG_BIN_DIR` can select the directory that contains
`pg_dump` and `pg_restore`; otherwise the commands use `PATH`.

The backup account needs `CONNECT`, schema `USAGE`, and `SELECT` on all app tables,
including `queue_arcade_schema_migrations`. The restore account needs to own the restored
tables and have `CREATE` in the target schema. Keep both credentials out of the web service.

## Take a backup

Supply the source connection as `DATABASE_URL` through the operator's secret environment.
The URL must include the user, host, and database. Set `sslmode=verify-full` for a connection
outside a trusted private network. Both database clients verify the certificate when SSL
is enabled. These commands also verify certificates for `sslmode=require`. They use system
certificate authorities; custom certificate paths and unimplemented URL options are
rejected. Inherited `PG*` connection settings and personal `.pgpass` files cannot override
the supplied URL.

The migration, runtime-grant, and cleanup commands use the same explicit connection
settings. On Render, run these operator commands with the external database URL and
`sslmode=verify-full`. Render's internal endpoint uses a self-signed certificate, which
these commands reject. The deployed app uses the internal URL with `sslmode=require`
over Render's private network. This difference follows Render's documented
[internal TLS modes](https://render.com/docs/postgresql-creating-connecting#ssl-modes-for-internal-connections).
Do not use an unrestricted public firewall rule to run operator commands.

Create the parent backup directory first, then choose a new directory for each backup:

```bash
umask 077
mkdir -p /secure/queue-arcade-backups
node scripts/backup-db.mjs /secure/queue-arcade-backups/2026-10-06-before-release
```

The command creates a directory with mode `0700` and files with mode `0600`. It refuses
an existing directory. `backup.dump` contains the selected app schema and data.
`manifest.json` records the schema version, archive SHA-256, row counts, column definitions,
and a row SHA-256 for each table. Hashes are checksums, not encryption or signatures.
Both the dump and row checks use one exported PostgreSQL snapshot, so concurrent votes
cannot place the two checks at different points in time. The rows stream through the
checksum calculation in bounded batches.

The selected schema defaults to `public`. Set `ARCADE_DATABASE_SCHEMA` only for an
installation that uses another app schema. The schema must contain only app tables.
Other schemas, database roles, grants, and server settings are outside this backup.
Keep those in the deployment configuration. Preserve the app secrets separately.

The command reports success only after it writes and syncs the manifest. A directory
without a valid manifest is incomplete. It must not be used for restore. Encrypt the
complete backup before moving it off the trusted machine, and apply the agreed backup
expiry. The files contain account and session data even though the manifest contains
only counts and hashes.

## Restore and verify

Create a new isolated database. Do not point a public app, a browser test, or an enrichment
job at it. Supply its migration owner's URL as `RESTORE_DATABASE_URL`. Keep the source
URL separate. Use the application checkout that matches the backup's schema version.

```bash
node scripts/restore-db.mjs /secure/queue-arcade-backups/2026-10-06-before-release
```

The command rejects a corrupt archive, the source database, a target with user objects,
and a target with other connected clients. It restores in one transaction. A SQL error
or a lost restore connection rolls back the changes. It preserves an existing empty
schema and its grants. After restore it checks the migration ledger, all recorded columns,
row counts, and row hashes. Only `verified: true` is a successful restore.

If a post-restore check fails, keep the isolated target closed and inspect the failure.
The command does not delete the restored data or redirect public traffic. SHA checks
detect damage to a trusted backup; they do not make an untrusted SQL archive safe to run.

After a verified restore:

1. Reapply any account deletions made after the backup. Use the restricted deletion record.
2. Run pending migrations with the migration owner, using the intended release checkout.
3. Run `node scripts/grant-runtime-db.mjs` with the database owner or administrator and
   `ARCADE_DATABASE_RUNTIME_ROLE` set to the existing restricted runtime role.
4. Run cleanup in dry-run mode with the runtime connection. Start the matching app image
   against the isolated database, then check readiness, account reads and aggregate reads.
5. Record the backup time, restore duration, schema version and image digest. Change
   production traffic only through the approved deployment procedure.

Set and record the allowed data loss interval and recovery time before launch. A daily
dump alone permits up to a day of lost writes. Provider point-in-time recovery may reduce
that interval, but it also needs a tested restore procedure and a defined retention period.

## Repeat the local regression checks

The integration tests create and remove uniquely named databases. `TEST_DATABASE_URL`
must be an isolated PostgreSQL administrative connection with `CREATEDB`. Never supply
a live database. A PostgreSQL client of the same or newer major version must be available.

```bash
node node_modules/vitest/vitest.mjs run tests/database-backup.test.mjs
```

The tests cover live account votes during backup, exact restored row hashes, inherited
connection overrides, corrupted archives, occupied targets, a failed data load, and a
terminated restore connection during `COPY`. The tests do not use real player data.

PostgreSQL documents [exported dump snapshots](https://www.postgresql.org/docs/17/app-pgdump.html)
and [transactional restores](https://www.postgresql.org/docs/17/app-pgrestore.html).

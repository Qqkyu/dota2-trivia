Migration and runtime-role launch checks, 2026-10-06

The migration and role checks pass on PostgreSQL 14 and 17. The supplied Render backup also restored and migrated on a disposable PostgreSQL 17.11 database. Every original row and column value passed the before-and-after hash comparison.

The acceptance criteria were:

- A separate migration role owns the schema changes. Eight concurrent migration CLI processes apply each version once.
- With `NODE_ENV=production` and `ARCADE_AUTO_MIGRATE=false`, the runtime role passes schema verification and uses the real account, vote, and analytics stores with table read/write/delete grants.
- The runtime role cannot create database objects, create temporary tables, alter or drop app tables, truncate tables, or change the migration ledger.
- Missing, pending, and incompatible migrations make the actual health handler return 503 without creating tables. A failed check retries successfully after deployment migrations and grants, returning 200.
- Killing the migration client or terminating its database backend during a migration rolls back all new tables and ledger entries. Existing rows survive, and the next migration attempt succeeds.
- A restored copy of the supplied backup keeps every original row and column value after current migrations. Runtime permission checks do not alter those rows.

The repeatable suite is `tests/database-launch-migrations.test.mjs`. It requires the explicit `LAUNCH_DATABASE_TEST_URL` variable and accepts only a loopback database address. It creates a unique disposable database and two non-superuser login roles, then removes them. The configured test administrator needs permission to create databases and roles and terminate test backends.

```sh
LAUNCH_DATABASE_TEST_URL="$DISPOSABLE_POSTGRES_ADMIN_URL" pnpm exec vitest run tests/database-launch-migrations.test.mjs
```

All eight launch checks pass on PostgreSQL 17.11. On PostgreSQL 14, the launch suite plus the existing schema and store suites passed all 25 tests. The files ran sequentially after a concurrent run exceeded three existing test time limits. The additional column-grant case passed separately on PostgreSQL 14 and is included in the eight-test PostgreSQL 17 run.

The interruption test uses a temporary table lock to stop a real migration after earlier DDL has run. It then sends SIGKILL to the migration CLI or calls `pg_terminate_backend`. PostgreSQL can detect a dead client only after the blocked statement resumes, so the test releases its artificial blocker before checking rollback. This verifies transaction rollback, not an immediate disconnect guarantee during an unrelated lock wait. The migration's lock timeout remains 60 seconds.

One app defect was found and fixed. Missing or pending migrations did not return the `MIGRATION_REQUIRED` code expected by diagnostics, and incompatible versions did not return `MIGRATION_MISMATCH`. `src/lib/database-schema.mjs` now supplies those codes while retaining the actionable migration instruction and original cause. Readiness already rejected these states; the correction makes logs classify them consistently.

The new `scripts/grant-runtime-db.mjs` command makes the documented grants repeatable after migrations or a restore. It imports `scripts/database-runtime-grants.mjs` and `src/lib/database-schema.mjs`, and uses the existing `postgres` dependency. It requires `DATABASE_URL` and `ARCADE_DATABASE_RUNTIME_ROLE`; `ARCADE_DATABASE_SCHEMA` defaults to `public`.

Run the grant command using a database/schema owner or administrator, then supply only the runtime connection to the app:

```sh
DATABASE_URL="$DATABASE_OWNER_URL" ARCADE_DATABASE_RUNTIME_ROLE=queue_arcade_runtime node scripts/grant-runtime-db.mjs
```

The database must be dedicated to the app. The command revokes PUBLIC database CREATE/TEMP privileges and schema CREATE privileges, so those changes also affect other roles that rely on PUBLIC grants. It rejects an administrative runtime role, a role that belongs to another role, and a role that owns the database or objects in the app schema. It grants SELECT on the migration ledger and SELECT, INSERT, UPDATE, DELETE on the other app tables. Runtime credentials must not be the migration credentials. Re-run the grant command after future migrations add tables.

The test first gives the runtime role excessive table/schema privileges. It also grants separate ledger column INSERT/UPDATE privileges to the runtime role and column UPDATE to PUBLIC. The grant command removes all tested excess permissions on both PostgreSQL versions. Real account login/session operations, vote/profile/analytics writes, nonce deduplication, profile updates, and account deletion then work under the restricted role. The security reviewer proposed the column-grant case; both database runs disproved the suspected bypass for this exact REVOKE ALL path.

The health check uses the real route function and store modules. It does not start an HTTP listener in this suite. The test loader now supports JSON and relative TypeScript imports so it can load that route with the same TypeScript module choices as the app. Separate infrastructure checks cover the running container and HTTP endpoint.

The supplied Render archive used PostgreSQL directory format 1.16 and came from PostgreSQL 17.11. Matching 17.11 clients restored it into a new isolated local database in one transaction. The restore retained the database's empty public schema and omitted only the archive's SCHEMA and COMMENT SCHEMA entries. It omitted original owners and grants, so the local migration role owned the restored app tables.

| Backup and migration check                        | Result                              |
| ------------------------------------------------- | ----------------------------------- |
| Restored original tables                          | 10                                  |
| Restored original rows                            | 58                                  |
| Applied migration versions                        | 1 and 2                             |
| Tables after migration                            | 13                                  |
| Original-column row counts and SHA-256 hashes     | All match                           |
| Repeated migration                                | No changes                          |
| Runtime schema check and CRUD probe               | Passed                              |
| Runtime CREATE, TRUNCATE, and ledger-write probes | Rejected with PostgreSQL code 42501 |
| Final hashes after the rolled-back runtime probe  | All match                           |
| Temporary copied-data database and roles          | Removed                             |

`render-backup-migration.json` records only schema metadata, counts, cryptographic hashes, and check results. It contains no rows, account/session values, credentials, or dump data. Original-row hashes use sorted PostgreSQL JSON row text with UTC timestamps, ISO dates, and `extra_float_digits=3`. After migration, each original table is projected onto its original ordered columns before hashing. This permits added columns while detecting any change to existing values or row counts. Final full-row hashes also verify that the runtime probe left no data changes.

The source is the supplied backup, not a live database connection. There was no independent manifest of source-server row hashes for that historical export. The checks establish that the supplied archive restores successfully and that migrations preserve the restored original data. They do not compare the backup with the live database's current state.

`restore-render-verification.mjs` preserves the local verification script. It refers to the private temporary input and connection files used for this audit, without embedding their contents. The archived test logs record the passing checks. `source-manifest.json` hashes the code used and the safe evidence files. The PostgreSQL 14 source-loader regressions and focused ESLint checks passed. No production database, `private.env`, or external service was changed.

The operator follow-up found that `postgres(connectionString)` used inherited PostgreSQL environment variables when URL fields were absent. The migration, runtime-grant and cleanup commands now use the same explicit connection factory as backup and restore. An omitted port means 5432; an omitted password remains empty; TLS and the target session type follow validated URL options. The factory also disables inherited query debug output and TLS negotiation overrides.

The CLI normalizer preserves one validated `search_path` and `application_name` query option. It rejects duplicate options, lists of schemas, conflicting URL and environment schemas, and unsupported connection options before connecting. The backup parser stays strict. The interruption tests still locate migration backends by their application label.

The new hostile-environment command test failed before the fix because inherited `PGSSL` forced unwanted TLS. After the fix, all three commands ran against the supplied local target despite incorrect inherited destination, password, TLS and session settings. Each command also rejected an omitted URL password even when `PGPASSWORD` contained the correct password. Factory checks cover the omitted-port default and disabled debug output. All 48 checks passed across the connection, launch, schema and backup suites on PostgreSQL 17.11. See `operator-cli-regression.log`. Focused ESLint, Prettier and whitespace checks passed.

A separate PostgreSQL 17.11 rehearsal also checked a non-superuser database owner with CREATEDB and CREATEROLE. It created the exact restricted runtime role using a locally generated SCRAM verifier and applied the grants. Runtime CRUD worked, denied operations returned 42501, and connection 21 returned 53300 after 20 successful connections. The automatic creator membership points from the owner to the runtime role, so the runtime itself has no role memberships. See `non-super-role-rehearsal.md` and its JSON evidence. The synthetic database and roles were removed.

The final security review found that a JavaScript regular expression end anchor admitted a trailing newline in an otherwise valid schema or application label. The factory and CLI normalizer now reject every character outside each label alphabet. Three added cases cover URL schema and application labels with a trailing newline and labels passed directly to the factory. All 48 tests passed after this correction.

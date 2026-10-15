# Independent database release review

Reviewed on 2026-10-06. This review covers the local `postgres@3.4.9` patch,
backup and restore commands, runtime grants, and the prepared database transition
helper. Earlier audit records were not changed. No production database was accessed
by this reviewer.

The review found two driver recovery failures and one operator connection issue.
All three are fixed. The final independent run passed all 61 checks on Node 22.23.3
and PostgreSQL 17.11, including 24 driver cases. No release blocker remains in the
reviewed scope. See [the final test log](database-final-review-tests.log) and
[reviewed source hashes](postgres-reviewed-sources.json).

| Finding | Severity | Evidence | Status |
| --- | --- | --- | --- |
| A TCP reset leaves old transaction work in the connection queue. | High availability risk | [Before](postgres-reset-before.json), [after](postgres-reset-after.json) | Fixed in both module formats. Multiple queries succeed after recovery. |
| A termination during initial type discovery exits the Node process. | High availability risk | [Before](postgres-startup-before.json), [after](postgres-startup-after.json), [startup TCP reset](postgres-startup-reset-after.json) | Fixed in both module formats. Permanent tests also cover repeated failures and clean connection closes. |
| Operator commands inherit omitted connection fields from the shell. | Medium operational risk | A synthetic, connection-free check selected port 65432, inherited the password, and enabled the inherited TLS setting. | Fixed and covered by actual commands with hostile inherited settings. |

The TCP reset reproducer sends a real PostgreSQL query through a local TCP proxy.
It waits until that query is running, resets the client connection, then checks two
queries through the original pool. Before correction, both ESM and CommonJS rejected
the interrupted transaction and returned the first query. The second query remained
pending. In `connection.js`, `closed()` drained the sent queue only when `hadError`
was false. Automatic rollback could enter that queue between the socket's error and
close events. The fix drains that queue on either close path. See
`patches/postgres@3.4.9.patch:56`. The permanent regression checks three successful
requests after the reset. Confidence is high, with a repeatable local failure and pass.

The startup reproducer pauses the first type-discovery query at a local proxy, then
terminates only its own PostgreSQL backend. Before correction, both module formats
exited with an unhandled `PostgresError`, code `57P01`. The `initial` branch of
`closed()` returned before clearing the old query and error state. The failure later
rejected the internal type-discovery promise without a handler. The fix resets startup
state, bounds repeated startup retries, and handles the internal type-discovery
promise. User query failures still reject normally. See
`patches/postgres@3.4.9.patch:34` and `:64`. The tests preserve Node's normal fatal
handling of unhandled rejections. Confidence is high, with failures and passes in both
module formats.

These cases are also described in the upstream
[transaction recovery discussion](https://github.com/porsager/postgres/pull/1215)
and [startup failure report](https://github.com/porsager/postgres/issues/1223).
The local reproductions used an actual disposable PostgreSQL server. They did not
fabricate a successful database response or suppress process exceptions.

The existing patch correctly records closed transaction and reservation state before
the pool reuses a connection. Queued transaction queries reject. A late transaction
callback cannot query, commit, or roll back a replacement transaction. A separate
review check also confirmed that a stale reserved handle rejects queries and that its
late `release()` leaves the replacement transaction ID unchanged. The patch hunks for
ESM and CommonJS were identical. Evidence is in the
[fourteen-case run](postgres-driver-review-tests.log) and
[reserved-handle checks](postgres-reserved-review.log).

The runtime-grant helper applies its changes in one transaction. It rejects roles
with administrative flags, app-object ownership, or role membership. It removes
PUBLIC and direct grants before granting SELECT on the migration ledger and ordinary
data access on app tables. Existing tests exercise the actual stores and deny schema
changes, truncation, and ledger writes. A concern about old column-level grants was
tested on PostgreSQL 14 and 17. The exact table revokes remove them. No bypass was found.

The backup and restore helper uses one explicit connection parser for JavaScript and
native clients. Native commands discard inherited `PG*` values and do not read a
password file. Credentials stay outside command arguments and normal logs. New backup
directories and files are private. The dump and inventory share an exported database
snapshot. Restore requires an empty target, verifies the archive hash, and runs
`pg_restore` in one transaction. The independent thirteen-case run passed, including
concurrent app writes, archive corruption, a failed data load, and a terminated restore.
See [the test log](database-backup-review-tests.log).

The command-line review found that migration, grant, and cleanup commands still used
the driver's implicit environment defaults. The shared `connectDatabase()` factory
now supplies host, port, user, password, TLS, target-session policy, debug setting,
and application label explicitly. Its URL normalizer keeps the supported schema and
application-name options, rejects duplicates and conflicts, and rejects other startup
options. Missing URL passwords no longer silently use `PGPASSWORD`. A follow-up check
caught JavaScript's acceptance of a final newline with a `$` regex anchor. Shared label
validation now rejects such input, with regressions for URL and direct factory calls.
The corrected factory is at `scripts/database-backup.mjs:107`. The grant helper's
transaction starts at `scripts/database-runtime-grants.mjs:4`. Confidence is high for
the original environment issue. The label correction was input validation hardening;
no privilege bypass was claimed.

The prepared private production transition helper was reviewed without execution.
It pins the intended database, paused app, plan, and source IP allowance. It restores
the original firewall rule in a bounded cleanup path. Database access verifies TLS.
Migrations and grants share one transaction, with original data hashes checked before
commit. A private pending credential file exists before role creation. The helper marks
that file verified only after a separate runtime login passes read-only checks. It
reports uncertainty if interrupted around commit instead of retrying the mutation.

These checks assume trusted operator-created archives and an isolated restore target.
An archive hash detects corruption; it does not authenticate an archive supplied by
another party. PostgreSQL documents that restoring an archive can execute code chosen
by its source in the [pg_restore reference](https://www.postgresql.org/docs/17/app-pgrestore.html).
The restore preflight does not prevent a separate operator from connecting afterward.
Keep the destination isolated until verification finishes. Hosted recovery behavior
and real production execution remain the parent agent's separate checks.

# Backup and restore launch checks

The new backup and restore commands passed all 13 checks on PostgreSQL 14.19 and 17.11.
The final PostgreSQL 17 rerun also used the pinned driver patch. Its complete report is
in `../driver/tests-pg17.json`.

The acceptance checks were:

- The dump and table hashes must use the same snapshot while real account votes continue.
- Restoring that snapshot must reproduce every table, column, row count, and row hash.
- Source, occupied, and corrupt targets or archives must fail before restore writes.
- A failed `COPY` or lost restore connection must leave the target empty.
- Inherited connection settings must not redirect the native client away from the URL
  inspected by the JavaScript preflight.
- The command must keep connection passwords out of arguments and returned errors, create
  private backup files, and refuse to replace an existing backup directory.

The concurrent test uses 12 synthetic accounts through `recordRoundOutcome`. It checks
votes, saved results, analytics events, session totals, and calibration after restore.
The restore interruption test waits until PostgreSQL reports the archive's `COPY`, then
terminates only that connection. The target has no restored tables after rollback.
The connection test sets hostile `PGHOSTADDR`, service, password, port, and SSL values.
Both clients still use the explicit disposable connection.

The command-line rehearsal used the separate runtime churn fixture. It backed up and
restored 1,931 synthetic rows across 13 tables. Every row hash matched. The observed backup
time was 153 ms and the restore time was 140 ms. These are small local fixture timings,
not recovery targets for production.

`tests-pg14.json` and `tests-pg17.json` record the initial integration runs.
`cli-result.json` and `synthetic-backup-manifest.json` record the command-line rehearsal.
No dump, session value, credential, or real player row is included here. The supplied
Render archive was checked separately in `../migrations/render-backup-migration.json`.

The operator procedure is [database-recovery.md](../../../../../database-recovery.md).
It describes exported snapshots, role requirements, TLS, restore isolation, verification,
and backup expiry. This check does not establish a production backup schedule, encryption
service, deletion replay record, recovery-time target, or provider point-in-time restore.
Those must be part of the deployment's operating procedure.

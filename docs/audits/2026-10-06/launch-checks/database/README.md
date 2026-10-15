# Database launch checks

The local database launch checks passed. The final PostgreSQL 17.11 run passed 78 tests
without skips. The checks found and fixed a driver failure that could raise an uncaught
exception when a transaction lost its connection. Independent review also found and
closed failures during TCP resets and connection startup. All 24 driver fault cases pass
on the production Node 22.23.3 version.

| Area | Acceptance and result |
| --- | --- |
| Existing backup | Restored the supplied Render export only into an isolated PostgreSQL 17 database. All 58 original rows and their original-column hashes survived the current migrations. The local copied database and roles were removed. |
| Migration recovery | Eight concurrent migration processes agree on one ledger. Process interruption and backend termination roll back DDL and ledger changes. A retry succeeds. |
| Runtime role | Real account, vote, analytics, cleanup, and schema reads work. DDL, truncation, and migration-ledger writes fail. Owner and inherited migration-role credentials are rejected for runtime use. |
| Concurrent traffic | 2,384 operations across 16 workers produced correct vote, profile, calibration, and analytics counts with no unexpected errors. Deletion races do not recreate account data. |
| Backup and restore | Concurrent writes do not split the snapshot. Exact table hashes match after restore. A corrupt archive, nonempty target, failed data load, and terminated restore connection are handled safely. |
| Restart recovery | Clean and immediate shutdowns preserve acknowledged rows. An interrupted vote leaves no partial data. The same Node process and pool reconnect and save a new vote once. |
| Retention | Expiry boundaries, cleanup dry runs, cascades, saved answers, calibration totals, and the retained 14-day summary meet their contracts. |

Read the detailed evidence in [migrations](migrations/migrations.md),
[runtime](runtime/README.md), [backup](backup/README.md), and [driver](driver/README.md).
The operator procedure is [database-recovery.md](../../../../database-recovery.md).

All mutations ran in disposable local databases. The supplied provider archive stayed in
private temporary storage. These files contain only metadata, counts, checksums, and
synthetic test evidence. No live Render database was changed.

The remaining deployment checks are the production role and secret configuration, an
agreed backup schedule and retention policy, and a provider recovery rehearsal if its
point-in-time recovery will be relied on. The local process-crash checks do not simulate
host loss, disk corruption, managed failover, or a network partition.

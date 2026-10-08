# PostgreSQL runtime integrity and recovery

All runtime integrity and recovery checks passed after the PostgreSQL client patch. This check uses a new local PostgreSQL 14.19 cluster. All data is synthetic. It does not read a private environment file or use a configured `DATABASE_URL`.

The runtime check passed 2,384 operations with 16 concurrent workers. It accepted 648 distinct votes. The 24 retained accounts each have 24 saved answers and 24 analytics events. Eight deleted accounts have no remaining identity, saved answer, or owned analytics rows. Their anonymous round votes and calibration totals remain, as required by the current deletion policy. The 360 submissions rejected after deletion failed with the expected missing-account error. There were no unexpected errors, deadlocks, or timeouts.

## Checks

- Three concurrent submissions for each user and round produce one accepted vote and one set of effects.
- Vote counts, per-round counters, and question calibration totals agree after concurrent work.
- Vote, account result, and analytics writes roll back together when a trigger rejects the final analytics insert.
- Account deletion races with vote retries. Steam identity updates and 24 cleanup calls also run during the workload.
- The two-hour raw-round and 30-day analytics cutoffs retain records exactly at the boundary. Expired login sessions and Steam nonces are removed at their expiry time.
- Cleanup cascades to raw votes and analytics event keys. It preserves saved player results and question calibration totals.
- A dry run leaves data intact. Cleanup leaves the valid 14-day daily summary unchanged. That summary is calculated from retained sessions; the schema has no separate durable daily-aggregate table.
- All six existing PostgreSQL transaction tests passed without skips, including the deterministic login/deletion lock-order regression.
- Clean and immediate shutdowns preserved every checked row. The interrupted vote remained absent.
- After restart, the same Node worker and application pool accepted a new vote, saved all of its effects, and rejected its duplicate. It exited normally with no stderr.

The churn run took 8.0 seconds. Median operation time was 28 ms, the 95th percentile was 104 ms, and the longest operation took 2.93 seconds. Other audit databases shared this local cluster. These figures are test observations, not production capacity estimates.

## Isolation and reproduction

`scripts/check-db-runtime.mjs` reads only the audit marker at `/tmp/queue-arcade-launch-checks/pg-runtime/cluster.json`. It constructs a loopback connection and ignores any supplied `DATABASE_URL`. Before writes, it checks the marker, current UID, data-directory ownership, exact data-directory real path, database name, and the server's reported data directory. It also requires `fsync`, `synchronous_commit`, and `full_page_writes` to be on. Every churn run creates a fresh schema. A check with `DATABASE_URL=postgres://ignored.invalid/live` still connected to the audit cluster and matched all ten table hashes.

The `setup-cluster.py` evidence script creates the cluster and refuses to replace existing data. Run it only when no previous audit cluster occupies the fixed path. It requires local PostgreSQL 14 binaries at `/usr/lib/postgresql/14/bin`.

From the repository root:

```sh
python3 docs/audits/2026-10-06/launch-checks/database/runtime/setup-cluster.py
node scripts/check-db-runtime.mjs churn
python3 docs/audits/2026-10-06/launch-checks/database/runtime/restart-check.py
pnpm exec eslint scripts/check-db-runtime.mjs
```

The restart driver refuses to stop the cluster while another client is connected. It first performs a clean smart shutdown and checks the ten vote, account, and analytics tables after restart. It then pauses a real `recordRoundOutcome` at its final analytics insert, after the preceding writes but before commit. An independent connection confirms that the incomplete vote is not visible. The driver requests an immediate shutdown, restarts the cluster, and compares every acknowledged row in those tables against the earlier hashes. The incomplete vote must remain absent. The driver then removes its pause trigger and signals the original worker. That worker uses the same pool to commit one new vote and reject a duplicate. `post-recovery-result.json` records the resulting table hashes, which differ by the newly acknowledged vote and its effects.

## Driver defect found and fixed

The original `postgres@3.4.9` client raised an uncaught `TypeError` in `connection.js:255` after the database socket closed during a transaction. It attempted a queued write through a null socket. Two full-store runs reproduced this, including a run that kept its pools open and never called `pool.end()`. A smaller read-only `postgres.begin` case reproduced the same exception after its own socket was destroyed. The Node workers exited with code 1. Next.js installs an uncaught-exception logger, so these worker exits alone do not prove that a production Next server would exit.

The database owner added the pinned patch in `patches/postgres@3.4.9.patch` and owns its ESM/CJS driver regressions. With that patch installed, this report's original full-store scenario passed. The worker handled the interrupted transaction, survived the restart, and committed a new vote through the same pool. The interrupted write never appeared in any checked table. The archived `unpatched-*` files preserve the failure. In the diagnostic `unpatched-restart-result.json`, `ok` referred to database recovery only; `workerExitCode: 1` records the client failure. The final `restart-result.json` requires both data recovery and worker survival.

An early manual verifier used a five-second connection timeout immediately after recovery and timed out once. A later read-only verification passed with all hashes unchanged. The final complete patched run passed without that timeout. Restart duration depends on the local host and recovery work.

## Evidence and limits

`runtime-result.json` records the workload, assertions, timings, exact server settings, and each table's row count and SHA-256. `focused-checks.json` records the focused test and lint results. `source-sha256.json` identifies the source files used. The synthetic cluster itself remains under `/tmp`, outside the repository. `restart-result.json` and `recovery.log` record the final clean shutdown, crash, recovery, and worker survival. `snapshot-result.json` and `verify-result.json` hold the matching pre-vote hashes. The PostgreSQL end-of-WAL messages in `recovery.log` are followed by completed redo and readiness; the row checks confirm recovery.

PostgreSQL 16 is not installed in this environment. These results apply to PostgreSQL 14.19. The separate infrastructure check owns validation on the intended PostgreSQL 17 container. This exercise tests PostgreSQL process failure; it does not simulate disk failure, host power loss, failover, or network partitions.

# PostgreSQL audit evidence

Tested the current store functions against PostgreSQL 14.19 in a new cluster under `/tmp/queue-arcade-pg-audit.3f4hCl`. The scripts transpile the current TypeScript modules, replace import aliases, and inject the test database pool through the existing global pool cache. App source was not changed. No `.env` or configured real database was used.

## Confirmed findings

1. Concurrent first requests can fail during schema creation. All three stores cache schema initialization only inside the Node process. Each starts `CREATE TABLE IF NOT EXISTS` without a database migration lock. Twelve independent processes called each store's health function at the same time against its own empty schema. Eleven of twelve failed for each store with PostgreSQL error `23505`, `duplicate key value violates unique constraint "pg_type_typname_nsp_index"`. The remaining process succeeded. Vote source lines 99-113, account lines 34-40, alpha lines 46-54. Use a deployment migration step or a shared PostgreSQL lock. This matters when new instances initialize a fresh database or future tables together. The failed promise resets, so later requests can retry.

2. Crowd reads return data from different committed states. `getRoundCrowd` starts four independent queries at vote-store-postgres.ts:245-277. With 400 new correct votes and 700 reads, 23 responses had a correct count greater than the returned total. Example: total 1, correct count 2, answer-key total 2. A separate 300-write/500-read check found four mismatches between total and answer-key counts. The score multiplier uses the returned total and a separate score aggregate. Use one SQL statement or one transaction with a shared snapshot. The tests used normal reads and writes, without forced locks or delays.

3. Alpha analytics silently stops after 50,000 sessions. `getAlphaSessionsSince` uses `LIMIT 50000` at alpha-store-postgres.ts:150. A fixture with 50,001 recent sessions and 50,001 answered rounds returned 50,000 sessions and 50,000 rounds. Use SQL aggregates or pagination, or report that the result is truncated.

## Capacity concern

Every vote locks the shared round row at vote-store-postgres.ts:418-422, then groups all existing keyed votes at lines 506-511. The HTTP endpoint discards that result with `keyCounts: []` at votes/route.ts:181. A burst of 1,000 calls with pool size 5 took 2,210 ms on an empty round, with p95 2,091 ms. The same burst with 10,000 existing votes took 5,373 ms, with p95 5,108 ms. Calibration writes were disabled in this benchmark. This is a local store benchmark, not a production capacity forecast. Remove the unused aggregate from the locked write transaction and run a service load test against the planned deployment.

## Checks that passed

- Twenty-five simultaneous duplicate submissions for one voter produced one accepted vote and a final total of one.
- Twenty-five simultaneous Steam upserts for one identity returned one shared account ID.
- SQL values in the reviewed store queries use the PostgreSQL driver's parameters.

## Reproduction files

- `prepare.cjs` creates transpiled copies in the fixture directory.
- `races.mjs` and `worker.mjs` reproduce first-start errors. Re-run with fresh schema names.
- `concurrency.mjs` checks mixed crowd reads, duplicate votes, and Steam upserts.
- `more-checks.mjs` checks impossible score summaries and the analytics row limit.
- `benchmark.mjs` measures shared-round vote bursts.

The cluster listens only on its test Unix socket, port 55793, user `kulmisiu`. Database `postgres` holds these fixtures. The root agent may use a separate `audit_smoke` database. The root agent must stop the cluster after all checks finish.

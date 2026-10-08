# Database and data lifecycle audit

Audit date: 2026-10-06. Scope: the current working tree, both file and PostgreSQL stores, account results, sessions, calibration, reports, retention, and aggregate consistency. No application code or existing data was changed. Existing `.data` files were read only for aggregate counts and consistency checks. Test accounts and stores were synthetic and kept in `/tmp`.

P2 means a material correctness, privacy, or operational issue that should be fixed before production. These findings do not establish a production breach.

## DB-01. P2. The profile reveals correctness before the round reveal

- Sources: `src/app/api/votes/route.ts:139-158`, `src/app/api/me/route.ts:24-25`, `src/lib/player-profile.mjs:109-123` and `:124-135`, `src/app/profile/page.tsx:47-49`.
- The vote handler records the `correct` result immediately. Both the profile API and page summarize every saved round without a reveal-time condition. The API returns `recentRounds[].correct`; totals, accuracy, and streaks also disclose it.
- Proof: the actual route handlers ran against a synthetic account and temporary file stores. At `phase=answering`, with 14,000 ms left, the vote response correctly hid its score. The next `GET /api/me` returned `correct: 1`, `accuracy: 100`, and `recentRounds[0].correct: true`. No external account or network request was used.
- Impact: an authenticated player can learn whether an answer is correct while the question is still open. This bypasses the server's reveal rule and lets the answer be shared with other players.
- Fix: store the authoritative reveal time and exclude unrevealed results from every public profile field. Hiding only `recentRounds` is insufficient because aggregate changes also disclose correctness. Add a test that checks both the API and the rendered profile during answering and after reveal.
- Evidence: `evidence/profile-reveal-check.cjs`.

## DB-02. P2. A vote can commit without its personal result, with no repair after the deadline

- Sources: `src/app/api/votes/route.ts:104-105`, `:119-133`, `:139-169`, `:191-196`; `src/lib/vote-store-postgres.ts:406-522`; `src/lib/account-store-postgres.ts:219-232`.
- Vote persistence commits first. The personal result is a second operation in another transaction. A failure between them returns HTTP 503 even though the answer and calibration counts have committed. A retry can repair the personal record only while the vote endpoint still accepts that round. The raw vote does not retain a reversible link to the account for a background repair job.
- Proof: a temporary test injected one ordinary account-store failure after the vote commit. The response was 503, the crowd had one persisted vote, a retry after store recovery and the answer deadline returned 409, and the profile still had zero answers. The temporary account file also contained zero rounds. This was a controlled local store failure, not an external endpoint probe.
- Impact: a short database fault or process termination can permanently omit answers from personal accuracy and streaks. Alpha round counts have the same split-write gap and are never repaired after `result.accepted` becomes false.
- Fix: commit the vote, personal result, and a deduplicated analytics event in one database transaction. An outbox with a unique account/round or session/round key can apply secondary statistics after commit. If the file backend remains supported, journal the operation or provide a durable repair record.
- Evidence: `evidence/cross-store-failure-check.cjs`.

## DB-03. P2. The promised retention periods depend on later traffic

- Sources: `src/lib/vote-store.ts:282-297`, `src/lib/vote-store-postgres.ts:221-239` and `:401-403`, `src/lib/alpha-store.ts:136-147` and `:226-230`, `src/lib/alpha-store-postgres.ts:81-92`; promises at `src/app/privacy/page.tsx:23-25` and `:32-35`.
- File votes and alpha sessions are pruned only on writes. PostgreSQL raw votes are pruned only on the next vote, with a 15-minute throttle. PostgreSQL health checks do prune alpha sessions, but do not prune raw votes. Quiet stores can therefore retain records past their stated expiry indefinitely.
- Proof: read-only aggregate checks found 31 existing local raw rounds. All 31 were older than two hours, with the oldest about 396 hours old. Of 478 local alpha sessions, 200 had a `lastSeenAt` older than 30 days. No player identifiers were printed. This demonstrates the issue in the existing file data. PostgreSQL behavior was verified by following all callers of `maybePruneRounds`.
- Impact: the storage behavior does not match the privacy page. Retained raw votes also retain player hashes and timestamps after their stated lifetime.
- Fix: use a scheduled cleanup job with a stated maximum delay. Make its last successful run and oldest retained record observable. Test an idle database across the retention boundary. Apply the same policy to backups or disclose their separate expiry.

## DB-04. P2. Failed file writes still change the live store

- Sources: `src/lib/vote-store.ts:274-304`, `src/lib/account-store.ts:106-131`, `src/lib/alpha-store.ts:128-153`.
- All file stores mutate the cached state before they persist it. A write or rename error rejects the request but leaves the mutation in memory. Subsequent reads and duplicate checks use that changed state. A restart reloads the older disk state.
- Proof: a temporary path conflict made a vote file write fail. `getRoundCrowd` nevertheless returned one vote while the file did not exist. After the path was repaired, retrying the same vote returned `accepted: false`. A separate failed account deletion invalidated its session in memory while its Steam identity, user, and session remained on disk. The session could not authorize a deletion retry in that running process.
- Impact: disk-full, permission, or rename failures can produce false duplicate votes, inconsistent results across a restart, and incomplete account deletion. This applies to the explicitly supported single-instance file deployment too.
- Fix: apply changes to a separate state object, persist it, then replace the cached state. Add crash-safe journaling or use PostgreSQL for durable production operations. Health should verify the ability to write, not only that the initial JSON file can be read. Atomic rename alone does not make an in-memory transaction atomic.
- Evidence: `evidence/file-store-checks.cjs`.

## DB-05. P2. PostgreSQL crowd fields can describe different database states

- Source: `src/lib/vote-store-postgres.ts:242-294`, especially the four independent queries at `:245-277`.
- `getRoundCrowd` reads round counts, the player's vote, answer-key totals, and scores in separate statements outside one transaction. Concurrent commits can occur between their snapshots.
- Proof: actual store functions against a fresh local PostgreSQL 14 database processed 400 all-correct votes during 700 crowd reads. Twenty-three reads were inconsistent. One returned `total=1`, `correctCount=2`, and a sum of answer-key counts of 2. Another run returned `total=12` and answer-key counts summing to 13.
- Impact: the UI can show impossible counts. A late vote that began before the answer deadline can still commit during reveal. Mixed counts then change the crowd multiplier or score shown to a player. The application has no consistent-snapshot check.
- Fix: return all crowd fields from one SQL statement, or use a short read-only transaction at repeatable-read isolation. Keep the player-specific field in the same snapshot. Add a concurrent read/write test that checks count and score invariants.
- Evidence: `evidence/postgres/findings.md`, `concurrency.mjs`, and `more-checks.mjs`.

## DB-06. P2. Concurrent first starts race while creating PostgreSQL tables

- Sources: `src/lib/vote-store-postgres.ts:96-192`, `src/lib/account-store-postgres.ts:34-97`, `src/lib/alpha-store-postgres.ts:46-78`.
- Each process coordinates schema setup only through its own `globalThis` promise. Different instances can execute the same `CREATE TABLE IF NOT EXISTS` statements at once. There is no database migration lock or separate migration step.
- Proof: for each of the three stores, twelve independent Node processes called the actual health function against empty temporary tables. Eleven failed with PostgreSQL error `23505`, `duplicate key value violates unique constraint pg_type_typname_nsp_index`. One process succeeded. Retry can recover after that transaction commits; this is a startup failure, not demonstrated persistent corruption.
- Impact: a new deployment or database restore can fail readiness and early requests when more than one instance starts. Runtime schema creation also requires the application database role to retain schema-change privileges.
- Fix: run versioned migrations once before serving requests under a database lock. Use a runtime role with only the required data permissions. At minimum, serialize schema initialization with a database advisory lock and test concurrent cold starts.
- Evidence: `evidence/postgres/races.mjs` and `worker.mjs`.

## DB-07. P2. Owner analytics silently omit visits after 50,000 sessions

- Sources: `src/lib/alpha-store-postgres.ts:142-152`, `src/lib/alpha-ops.ts:54-59` and `:93-97`, `src/lib/alpha-analytics.mjs:25-82`.
- PostgreSQL returns only the most recent 50,000 sessions, but the owner dashboard calculates full-window visits, unique players, return rate, rounds, accuracy, and daily counts as if the result were complete. The file store has no equivalent limit.
- Proof: the temporary PostgreSQL database contained 50,001 eligible sessions, each with one round. `getAlphaSessionsSince` returned 50,000 sessions and the summary reported 50,000 rounds. It did not report truncation.
- Impact: at about 1,667 visits per day over a 30-day window, the owner dashboard starts understating activity and distorting return and daily statistics. These are the measurements intended to guide the alpha release.
- Fix: compute the aggregate results in SQL over the full time window. If a row cap is retained for another view, return a truncation flag and do not label the result as a full-window total.

## DB-08. P2. In-flight work can recreate data after successful profile deletion

- Sources: `src/app/api/me/route.ts:14-24` and `:39-44`, `src/lib/steam-profile.ts:107-116`, `src/lib/account-store-postgres.ts:132-179`, `src/lib/account-store.ts:153-170`, `src/app/api/sessions/route.ts:43-59`, `src/app/api/votes/route.ts:161-167`.
- A profile GET first authenticates the user, can wait up to several seconds for Steam enrichment, then calls `upsertSteamUser`. If the user deletes the profile during that wait, the enrichment upsert sees no identity and creates a new user and Steam identity. A session request authenticated before deletion can also write an alpha session after `deleteAlphaVisitor` has completed. Alpha deletion and account deletion use separate operations.
- Evidence level: source-confirmed interleavings. No destructive request or exploit was run against an existing account, and this specific race was not exercised at runtime.
- Impact: a successful deletion can leave a new orphan Steam identity or recreate alpha records linked to the deleted account. It contradicts the deletion promise even though the original session remains revoked.
- Fix: enrichment must update an existing authenticated account by ID and must never create one. Restrict account creation to verified login. Serialize deletion with account-owned writes, enforce ownership through database relationships, and use a deletion marker or transaction rule to reject writes from requests authenticated before deletion. Test deletion while enrichment and analytics writes are paused in flight.

## Other production requirements and limits

- There is no JSON-to-PostgreSQL import path. Setting `DATABASE_URL` selects new tables without copying existing account results or calibration. Decide which pre-release data must survive the switch and verify an import if needed.
- Profile reads fetch every saved result for an account and then sort them in JavaScript. See `src/lib/account-store-postgres.ts:235-258` and `src/lib/player-profile.mjs:43-46`. Lifetime records grow without a bound. Use stored totals and bounded recent-history reads before heavy use. This is a source-based capacity concern; no production latency claim is made.
- Every accepted PostgreSQL vote locks the round row and then scans answer keys for that round. See `src/lib/vote-store-postgres.ts:418-422` and `:506-512`. The write response hides those key counts anyway. A local store benchmark with pool size 5 took 2.21 seconds for 1,000 concurrent votes on an empty round, with p95 2.09 seconds. With 10,000 existing votes, the same burst took 5.37 seconds, with p95 5.11 seconds. Calibration writes were disabled. These measurements show growing work per round but do not predict production capacity. Remove the unused aggregate from the locked write path, then test the planned service load. Evidence: `evidence/postgres/benchmark.mjs`.
- The file backend caches the whole database, scans records, and rewrites the whole file on each mutation. It has no inter-process lock. The README correctly limits it to one long-running instance. Do not deploy it with multiple workers or overlapping writable replicas.
- Question stats, report deduplication hashes, and reviews have no retention policy. Preserving aggregate calibration is intentional. Clarify whether old revisions and reporter hashes must remain forever, and define an archival policy.
- No backup/restore procedure or versioned schema migration framework was found. Infrastructure audit owns the deployment recommendation. Restoring app data, privacy deletion handling in backups, migration rollback, and database recovery objectives remain unverified.

## Checks that passed

- PostgreSQL uses bound SQL parameters for application data. No string-concatenated user input was found in the reviewed SQL.
- Concurrent duplicate voting was correct. Twenty-five simultaneous calls for one voter and round accepted exactly one vote and counted one answer.
- Concurrent Steam upserts were correct after schema creation. Twenty-five calls for the same Steam identity produced one user, using the advisory transaction lock.
- PostgreSQL vote rows and question totals change in one transaction. Reporter insertion and report-count increments also change in one transaction.
- Account deletion cascades to Steam identities, account sessions, and personal rounds in PostgreSQL. Session reads reject expired sessions.
- Existing local data passed aggregate checks. All 31 raw-round vote counts matched their stored voter totals. All 974 question counts summed to their stored totals. The account store had no orphan sessions or round records. Alpha correct totals did not exceed answered totals.
- File writes request mode `0600`; the stores use a temporary file plus rename. Session tokens are stored as hashes. These controls do not resolve DB-04.

## Test boundaries

The database tests used an isolated PostgreSQL 14 cluster under `/tmp`, actual store source, and synthetic data. CI declares PostgreSQL 17, which was not used for these child checks. Existing configured database credentials were not used. The parent audit separately checks application smoke flows and dependencies. This review did not establish backup validity, managed database configuration, TLS enforcement, production grants, database-provider retention, or production concurrency limits.

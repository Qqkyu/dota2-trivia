# Deployment and operations

The supported layout is one application process and one Postgres database. Private rooms,
chat, presence, media work queues, and rate limits live in that process. A restart closes
private rooms and clears chat. Postgres keeps public votes, aggregates, accounts, and saved
results. Public rounds resume from the clock. Do not add replicas or autoscaling until room
state and limits use shared storage. During deployment, old and new processes can briefly
serve different private rooms; announce planned updates to active testers.

## Before the first deployment

1. Confirm the hosting region, database region, backup locations, retention, and budget.
   Set `ARCADE_DATA_COUNTRIES` to the actual countries used, including backups.
2. Use a maintained Node 22 release (at least 22.12) and the pinned pnpm version. Set the
   variables in [`.env.example`](../.env.example) through the host's secret environment.
   Production CLI commands read exported variables; they do not load `.env.local`.
3. Generate separate random `ARCADE_AUTH_SECRET` and `ARCADE_VOTER_SALT` values, each at
   least 32 characters. For example, run `openssl rand -hex 32` twice and save the outputs
   directly in the secret manager. Keep both stable across releases. Rotating the auth
   secret invalidates pending signed Steam login state. Existing random session cookies
   remain valid until their database sessions expire or are revoked; changing the voter salt changes the
   hashes used for anonymous deduplication and statistics.
4. Set `ARCADE_APP_URL` to the exact public HTTPS origin, with no path or query. All
   changing API requests require a matching `Origin` or `Referer`. Clients and smoke tools
   must send it. Never point tests that write votes or seed accounts at a live database.
5. Create separate migration and runtime database roles. The migration role owns the app
   tables and runs DDL. The runtime role needs schema `USAGE`, `SELECT` on the
   `queue_arcade_schema_migrations` ledger, and `SELECT`, `INSERT`, `UPDATE`, and `DELETE`
   on the other app tables. It must not own the schema or tables or have `CREATE`,
   superuser, or role-management rights. Grant sequence access only if a migration adds
   sequences. Recheck grants after each migration. Operator commands require TLS with
   certificate verification outside localhost. Use Render's external database URL for
   migration, grant, cleanup, backup, and restore commands. The app can use Render's
   internal private-network URL with `sslmode=require`; that endpoint's self-signed
   certificate does not satisfy the stricter operator-command policy. Do not disable
   certificate verification on the external connection.
6. Review content and run the release gates below. Take and verify a database backup before
   a schema change. With the migration role's connection supplied as `DATABASE_URL`, run
   `pnpm db:migrate`. Switch to the runtime role, run `pnpm check:config`, then start the
   application. Production startup checks configuration before it listens; readiness
   rejects a missing or incompatible schema. Runtime DDL is disabled unless the explicit
   compatibility option `ARCADE_AUTO_MIGRATE=true` is set.

Changing from file storage to `DATABASE_URL` selects a separate store. It does not import
local JSON records. Decide whether to discard test data or implement and verify an import
before changing backends. Do not copy live data into CI.

## Render service Blueprint

[`render.yaml`](../render.yaml) describes the existing `queue-arcade` Docker web service in
Frankfurt: one instance on the `0.5c-512mb` plan ($7 a month, never sleeps), manual deploys,
and a readiness check at `/api/health`. On 2026-11-01 a field-by-field comparison with the
Render API found every value equal to the live service except the plan, which was still
`free`. The Blueprint manages no database and holds no secrets. Render keeps environment
variables a Blueprint does not mention, so `DATABASE_URL`, `ARCADE_AUTH_SECRET`,
`ARCADE_VOTER_SALT`, `STEAM_WEB_API_KEY` and `ARCADE_REVIEWER_STEAM_IDS` stay as set in the
dashboard. Applying the Blueprint is a purchase; the maintainer applies it.

To apply it:

1. In the Render Dashboard choose New, Blueprint, connect `Qqkyu/dota2-trivia`, branch `main`,
   path `render.yaml`.
2. In the review, `queue-arcade` must appear as a change to the existing service, plan `free`
   to `0.5c-512mb`, and nothing else. If it appears as a new resource, or Render says the
   Blueprint matches existing resources and will add a suffix to the name, cancel. That path
   creates a second paid service with no secrets.
3. Deploy the Blueprint. The service restarts once on the new plan.
4. In the Blueprint's settings set Auto Sync to No, so later edits to `render.yaml` apply only
   on a manual sync.

A sync overwrites dashboard settings that conflict with the file, so keep `render.yaml` in
step with the dashboard.

The public address is `https://queuearcade.com` (since 2026-11-01). Its DNS is at
Cloudflare: CNAME records for `@` and `www` to `queue-arcade.onrender.com`, proxy status DNS
only. Render issues the certificate and redirects `www` to the root. `ARCADE_APP_URL` must
equal that origin: votes, sessions, reports and private-room actions are accepted only from
it, and `src/proxy.ts` sends page requests on `*.onrender.com` there with a 308. Change
`ARCADE_APP_URL` and `domains` in `render.yaml` together with the dashboard.

Render's edge cache should serve the `/api/art` images and the `/_next/static` files. A new
player loads about 400 images, and without the cache each one costs the server a request.
`render.yaml` has no field for it. In the service settings, under Edge Caching, set
Cacheable file types to Common static files. The API field is `serviceDetails.cache.profile`
with the value `origin-controlled`. Never choose All files. With it, an API route without a
`Cache-Control` header would be cached and served to every player. Common static files never
caches HTML or API responses, because their paths have no file extension. Every deploy purges
the cache, and a Blueprint sync may reset the setting, so check it after a sync. To check,
request one art URL twice; the second response carries `cf-cache-status: HIT`. On 2026-11-01
the API setting alone left every response at `DYNAMIC`, even after a deploy.

The launch checks verified the existing database and restored its Render export into an
isolated local PostgreSQL 17 instance. The reviewed migrations preserved all 58 original
rows and their original-column hashes. The service now has a restricted runtime role,
with automatic migrations and deployments disabled. See the
[hosting record](audits/2026-10-06/launch-checks/hosting/README.md) for the current deployment
and ingress results. Confirm one instance and autoscaling disabled before later releases.

On the free plan the service slept after idle and could not run private rooms or retention
cleanup while asleep; the paid plan removes that. Render's pre-deploy command is available
on paid services, but this Blueprint does not use it. Run the migration CLI through an
approved network path before a manual deploy. If the database is internal-only, use the
host's approved job/shell facility or a temporary restricted connection; do not open
unrestricted database access.

Sources: [Render Blueprints](https://render.com/docs/blueprint-spec),
[free service limits](https://render.com/docs/free), and
[deployment lifecycle](https://render.com/docs/deploys).

## Release checks

`pnpm check` validates the reviewed content snapshot, data, unit tests, lint, types,
production build, private-data bundle boundary, and browser flows. It includes both native
PulseAudio output and Web Audio sound checks. Install Chrome, ffmpeg, `pulseaudio`, and
`pulseaudio-utils` on the test host. Native audio is recorded through a private null sink;
no speaker output is needed. Set `TEST_DATABASE_URL` to a disposable Postgres database to
include database migration and account-store regression tests.

The GitHub workflow additionally builds and scans the production image, runs its packaged
migration CLI, boots that image against disposable Postgres, and checks headers, runtime
social metadata, browser journeys, native audio, multiplayer, and the packaged cleanup CLI.
The image runs as a non-root user. High and critical production dependency findings fail
CI; the image scan fails for medium, high and critical findings with available fixes.
Unfixed container findings still need review before launch. Require the `verify` check
before merging releases. The [CI record](audits/2026-10-06/launch-checks/ci/README.md) names
completed runs, their exact revisions, and the isolated runner used for launch checks.

Run `pnpm check:headers` against the built local server. HTML gets a fresh script nonce
per response, a Content Security Policy, frame denial, MIME sniffing protection, and a
referrer policy. Inline styles remain permitted because the interface uses style
attributes for progress and positioning. All pages render dynamically so the nonce and
public social origin come from the running deployment. HTTPS responses carry HSTS.

The committed content review is a release gate, not an automatic approval. Follow
[content sources and review](content-sources.md) after a data or supporting script change.
Do not run `--record-review` automatically in CI.

As of 2026-10-08, both production and full JavaScript dependency audits have no advisories.
Sharp is pinned to 0.35.5 after the fresh audit found a newly indexed advisory in its
bundled SVG library. The [security update record](audits/2026-10-06/launch-checks/security/sharp-update-20261008.md)
preserves the finding, patched native versions and verification results.
The runtime image also requires Alpine `zlib>=1.3.2-r1` after the complete container
scan found `CVE-2026-85091`. See the [package update record](audits/2026-10-06/launch-checks/security/zlib-update-20261008/README.md)
and the CI report for the replacement image's verification.
The Next ESLint plugin's directory matcher uses a scoped `tinyglobby@0.2.17` override
to remove the unpatched `braces` dependency. The pinned patch in `patches/` disables
automatic directory expansion to preserve the previous matcher behavior. Keep that patch
with the override. `tests/eslint-glob-compatibility.test.mjs` checks directory patterns and
actual Next lint rules. Review the override and patch together when updating the plugin.
Dependabot configuration covers weekly npm, image, and GitHub Action update proposals.

## Deploys without disruption

Deploy with:

```sh
RENDER_API_KEY=... pnpm run deploy:production
```

The script deploys `origin/main` only if that tree passed `pnpm check` on this machine
(`.check-pass.json`, written by the last step of `pnpm check`); commits after it may change
Markdown files only. It waits until no party is open on the live server (`--max-wait=30`
minutes), starts the Render deploy, reports when traffic moved and where the public clock was,
and runs `check:headers` and the public-play journey against production.

What a deploy does to players:

- **Public room:** nothing. Its schedule follows the clock and every answer is in Postgres.
- **Parties:** they live in the server's memory, so a switch ends them. The new server
  (`ARCADE_DEPLOY_HANDOFF=on`) holds its health check while the live server reports an open
  party, at most 10 minutes, then the deploy goes ahead. A tab whose party is gone returns to
  the party screen and says the party ended because the server restarted.
- **Data updates:** a new content version gives the public room a new identity and a new
  question order. The new server passes its health check only 1 to 4 seconds into a reveal,
  so traffic moves while players look at a result. The client keeps that reveal and starts
  the next round on the new room. A switch mid-question would swap the question.
- **Open tabs:** they keep the old page code. Keep API changes additive for one release.
- **Database changes:** the old server keeps running until the switch. Add columns first,
  deploy, then remove old ones in a later release.

The new server passes at once when nothing healthy answers at `ARCADE_APP_URL` (first boot,
crash) and never waits again after its first pass. Render cancels a deploy whose server is
not healthy within 15 minutes; the handoff stops waiting after 12. Every decision is logged
as `[queue-arcade:handoff]` in the Render logs. If a deploy misbehaves, roll back to the
previous deploy in the Render dashboard; that switch is also zero-downtime.

`scripts/check-deploy-handoff.mjs` (in `check:ui`) starts two extra servers to prove the
party wait and the reveal window; `scripts/check-party-ended.mjs` covers the tab side.

## Migrations, rollback, and backups

The migration ledger lives in `queue_arcade_schema_migrations`. Migrations run under a
Postgres advisory lock and transaction. Re-running `pnpm db:migrate` applies only pending
versions. Keep migration credentials out of the web service environment. The runtime role
can verify the ledger without DDL privileges. The application pool defaults to five
connections, with query and lock timeouts. Include the pool, cleanup jobs, migration job,
and administration in the database connection budget.

For the checked backup and restore commands, exact snapshot comparisons, and role grants,
follow [database recovery](database-recovery.md). These operator commands ignore inherited
`PG*` connection settings and use their explicit database URL. Render operator commands
must use the external URL with verified TLS, even when the app uses the internal URL.

For each release, record the Git commit, image digest, schema version, content version,
and backup timestamp in the deployment record. Keep the previous verified image. Test
schema compatibility before rolling back code; the current migration runner rejects a
ledger with unknown versions. There is no automatic down migration. When an old image
cannot use the new schema, restore the previous backup to a separate database, verify it,
and then switch traffic during a maintenance window.

Take an encrypted off-host backup at least daily and before schema or data imports. Keep
access limited to operators, and set backup expiry to the published retention policy.
Choose and record an acceptable recovery point and recovery time before launch. A backup
is not verified until a restore has passed checks. Use a Postgres client version that
supports the server version. Supply connection secrets through a protected
`PGSERVICEFILE` and `.pgpass` (permissions `0600`), not command arguments or logs:

```bash
umask 077
pg_dump --dbname=service=arcade_backup --format=custom --file=arcade-backup.dump
pg_restore --list arcade-backup.dump
```

Encrypt the dump before sending it off-host. At least monthly, restore into an empty,
isolated database with no public app traffic or outbound profile enrichment. Configure the
`arcade_restore` connection service to use the migration owner. With `--no-owner`, that
role owns the restored objects and must be able to apply later migrations:

```bash
pg_restore --dbname=service=arcade_restore --no-owner --no-acl --exit-on-error arcade-backup.dump
```

Reapply least-privilege role grants, run `pnpm db:cleanup --dry-run` with the restored
runtime connection, start the matching image, and check `/api/health`, account reads,
aggregate counts, and migrations. Record the restore duration. Do not run the destructive
multiplayer fixture against restored user data. A profile deletion can remain in a backup
until backup expiry; keep a restricted deletion record and reapply those deletions after
recovery before reopening the service.

## Retention and maintenance

A maintenance worker runs at startup and every 60 seconds while the process is running.
It removes expired raw rounds/votes, expired sessions and Steam nonces, and alpha sessions
older than 30 days. `ARCADE_ROUND_RETENTION_HOURS` defaults to two hours. Question aggregates,
reports, and saved account results have separate product retention rules. Maintenance also
retries pending account-result synchronization. Watch `storage.maintenance` failures.

For a host that can stop or sleep, arrange an independent hourly job with the runtime
connection and the same retention setting. This repository does not create a paid
scheduler. The command is safe to repeat and its dry-run uses a read-only transaction:

```bash
pnpm db:cleanup --dry-run
pnpm db:cleanup
```

In the built container use `node scripts/cleanup-db.mjs` (add `--dry-run` to inspect counts).
Do not claim that a sleeping free service enforces retention on time without an independent
job. For a running app, alert when `/api/health` reports a `maintenance.lastSucceededAt`
older than three minutes, or it remains null after startup. For an independent scheduler,
alert on its last successful exit time. Keep scheduler logs limited to counts, timestamps,
and exit status.

## Ingress and abuse limits

Public startup requires an explicit `ARCADE_TRUST_PROXY` policy. `none` ignores forwarding
headers and shares a fallback source bucket. It is the conservative setting for local
checks and initial hosted verification. One caller can consume that shared allowance,
so verify the hosted address before opening the app to wider traffic. The authenticated,
read-only [ingress proof](ingress-verification.md) works before header trust is enabled.
Set `cf-connecting-ip`, `x-real-ip`, or `x-forwarded-for` only when the trusted ingress supplies a verified
address in the selected position and users cannot bypass it to reach the origin. Test forged
headers from a client before enabling the mode. For `x-forwarded-for`, the app uses the
last address (the nearest reported peer). A multi-proxy chain may therefore group many
users under one proxy address. Verify the exact chain and sanitization at the trusted boundary.
Render's [PocketBase guide](https://render.com/articles/host-pocketbase-on-render)
recommends `CF-Connecting-IP` for public web services and says the edge overwrites caller
values. The explicit `cf-connecting-ip` mode accepts one IPv4 or IPv6 address. Missing,
invalid, or repeated values use the conservative fallback bucket. It never falls back to
another forwarded header. The app does not enable this mode from the `RENDER` variable.
Confirm that the actual service overwrites forged headers and separates independent
client addresses before enabling it. A local proxy simulation cannot establish Render's
behavior. Record the hosted result in a dated note under `docs/`.

Add shared limits at the public ingress before a public launch. Start with a request-body
cap of 64 KiB and a 15-second request-body timeout. Set request-rate limits from the actual
client cadence. One 100-player party sends about 6,000 membership requests, 1,200 round
reads, 273 votes, and 273 reveal-preload requests per minute before chat and other reads.
A cap of 6,000 API requests per source per minute would throttle normal play. The local
capacity check also covers 120 players behind one source address. A provisional per-source
ceiling of 12,000 requests per minute with a 500-request burst allowance accommodates that
cadence. Confirm it against the intended host's measured capacity before launch, and size
the service-wide cap separately. Retain the app's stricter per-route limits and bounded
media queue. Limit new connection rate and concurrent connections at the ingress as well.
Do not cache account, party, vote, or health responses. Do not allow another hostname to
bypass these controls. These are starting limits for validation, not a hosting-capacity claim.

The final local Docker check passed four synthetic players over ten rounds with the app
limited to 0.1 CPU and 512 MiB, and PostgreSQL limited to 0.1 CPU and 256 MiB. Round-read
p95 was 288 ms and vote p95 was 798 ms. All database totals matched. The app process
peaked at 174.14 MiB RSS. Cold media remained slower: the first image stage reached
3.10 seconds p95. This is a measured local preview workload, not a Render capacity limit
or a long-term stability test.

A separate run completed all 4,660 votes from 466 players across ten rounds with one CPU
and 1 GiB for the app. It had no 5xx responses, unexpected throttles, restarts, or memory-limit
kills, but failed the one-second latency target: round reads reached 2.21 seconds p95 and
votes reached 2.51 seconds. Do not describe that workload as supported on one CPU.
See the [container evidence and limits](audits/2026-10-06/launch-checks/infrastructure/README.md)
and [repeatable commands](audits/2026-10-06/launch-checks/infrastructure/checks.md).
The default `CONTAINER_ISOLATED=1 pnpm check:container` builds the reviewed image and runs
four players against a separate synthetic database. Repeat the constrained check after
material backend changes and measure the actual host before raising the expected player count.
The one-second p95 target (`CONTAINER_LATENCY_TARGET_MS`) fails the check on a dedicated host.
CI sets `CONTAINER_LATENCY_ADVISORY=1` because a 0.1-CPU container on a shared GitHub runner
gives noisy timing; correctness, memory, restart, and health assertions stay strict there, and
the measured p95 values are printed in the job log.

### Test bots in a party

To try a party with more players, create it in the browser, then run:

```sh
node scripts/party-bots.mjs --code=ABCD --bots=5 --minutes=30
```

Press Start as the host after the bots appear. They are named "Bot 1", "Bot 2" and so on,
answer about 85% of rounds at random, and leave at the time limit or on Ctrl-C. Up to 20 bots;
`--url=http://127.0.0.1:3000` points them at a local server. They join private parties only:
party votes never reach the public room, question calibration, profiles or alpha sessions.

## Readiness, logs, and alerts

Probe `GET /api/health` from outside the host every minute. It checks configuration and all
three durable stores and returns the active content version. The app permits 120 probes
per source per minute before store checks. Include Docker, Render, and external probes
in that budget; a 429 response means throttling. Alert after three failed
probes. On an always-running service, alert if `maintenance.lastSucceededAt` is more than
three minutes old. Also alert on restart loops, three consecutive database connection failures,
repeated media conversion timeouts, less than 20% free disk, pool exhaustion, and a five-minute
5xx rate above 1% with at least 100 requests. Start with a one-second p95 API latency target
and revise it using real measurements. Rate-limit 429s need review when they affect many
sources; a single blocked source is not itself an outage.

Structured errors contain a release, event, fingerprint, safe path, and allowlisted error
code where available. They omit raw exception messages, SQL, connection URLs, cookies,
and player IDs. Connection/authentication/permission codes help distinguish a bad database
configuration from an application error. Search by fingerprint and release. Do not turn
on query or request-body logging to diagnose user traffic. Restrict log access and retention.

Before reopening after an incident, verify health, headers, one anonymous game, one
private-room join/start, Steam sign-in on the real HTTPS origin, profile access/deletion,
and media playback. Use dedicated test accounts. Record what failed, the fix, and the
recovery checks. Live Steam/provider behavior and actual capacity still need a deployment
check; local test doubles cannot prove them.

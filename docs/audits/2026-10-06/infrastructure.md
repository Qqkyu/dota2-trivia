# Infrastructure and dependency audit

Audited 2026-10-06. The source tree contains the user's uncommitted changes. This audit made no source, deployment, account, workflow, or dependency changes. It did not read private `.env.local` values. It used the committed `.env.example`, current source, GitHub read APIs, public vendor advisories, and bounded HTTP reads.

Expected result: a repeatable release can run the built container, use durable storage, survive its stated restart model, reject known vulnerable dependencies, and give the operator enough information to detect and diagnose failures. Each finding below separates a verified defect from a deployment prerequisite or an unverified risk.

## Confirmed findings

### INF-01. Dependency security gate fails, and vendor fixes are missing

Priority: high before launch. This is a dependency maintenance finding, not a demonstrated remote compromise.

Evidence:

- `package.json:64` and `pnpm-lock.yaml:1531` pin Next.js 16.3.3.
- `pnpm-lock.yaml:1796` pins source-map-js 1.2.1, reached through Next.js > PostCSS.
- `pnpm audit --prod --json` exited 1 with 1 critical and 1 high finding across 96 dependencies.
- `pnpm audit --json` exited 1 with 22 findings across 437 dependencies: 1 critical, 15 high, 5 moderate, 1 low. These are scanner entries, not 22 distinct demonstrated attack paths. Several advisories repeat for different installed major versions.
- The production findings are Next.js GHSA-vcvr-r3jv-pc5j and source-map-js GHSA-68fv-2mgg-jv7q. Full outputs are `pnpm-audit-prod.json`, `pnpm-audit-network.json`, and `dependency-summary.json` in this audit directory.

Reachability matters. The [Next.js advisory](https://github.com/vercel/next.js/security/advisories/GHSA-vcvr-r3jv-pc5j) affects Node.js ImageResponse when it receives attacker-controlled SVG content, attributes, or styles. `src/app/opengraph-image.tsx:9` uses ImageResponse, but all values and its one asset URL are fixed. No attacker-controlled input into it was found. Do not report a proven RCE in this app.

The [source-map-js advisory](https://github.com/advisories/GHSA-68fv-2mgg-jv7q) concerns malformed indexed source maps and fixes 1.2.1 in 1.2.2. No application route accepts source maps, so an external visitor's route to this flaw was not found. It remains in the locked production dependency graph.

The [September 30 Next.js release](https://nextjs.org/blog/september-2026-security-release) recommends 16.3.8 and fixes more issues than this registry scan reports. Its image optimizer SSRF issue requires an attacker-controlled allowed remote URL. `next.config.mjs:27` configures remote patterns, but they are Valve asset hosts. No attacker control of those hosts or DNS was shown. Several other advisories need Pages Router, dynamic metadata segments, or Cache Components, none of which the inspected app uses. The development-server MCP issue applies to `next dev`; use a patched version in development too.

Recommendation: update Next.js and its matching tooling to a reviewed patched release, refresh affected transitive dependencies, then repeat both audits and the complete production journey. Review the development-only advisories by reachability rather than applying incompatible blanket overrides. The audit reports an unpatched braces advisory, so a completely empty full-tree audit may require replacing or accepting a constrained development-only path. Preserve any accepted exception with its scope and expiry. Add scheduled dependency review because a push-only audit does not detect new advisories while development pauses.

### INF-02. CI is disabled and the hosted test service is unavailable

Priority: high launch prerequisite. Both states appear deliberate; this is not evidence of an accidental outage.

Current checks:

- `gh workflow list --all --repo Qqkyu/dota2-trivia` returned `Queue Arcade CI`, `disabled_manually`, workflow ID 324937009. Saved in `github-workflows.json`.
- The latest three workflow runs are failures dated 2026-08-09 and 2026-08-10. No current green remote run was observed.
- At 2026-10-06 05:03:43 UTC, GET `https://queue-arcade.onrender.com/` and GET `/api/health` both returned HTTP 503 and `x-render-routing: suspend-by-user`. The body states that the owner suspended the service. Raw headers and bodies are saved as `render-*` artifacts.
- `HANDOFF.md:239` documents disabled CI. `HANDOFF.md:240` documents the suspended Render service. `README.md:148` instead claims that every push and pull request runs CI.

Consequence: the repository's current release checks are local only, and no current deployed user flow or database connectivity could be verified. Production health, TLS at the origin, reverse-proxy header policy, live database retention, and edge throttles remain unverified. Cloudflare's suspension page is not the application's response.

Recommendation: keep the current holds during the audit. Before launch, make the documentation match the state, complete local fixes, deliberately restore CI, obtain a green run for the exact release commit, and then resume the service under the owner's release plan. Do not assume that resuming is a passive action; the handoff says auto-deploy is enabled.

### INF-03. `/party` ships localhost social metadata after a normal container-style build

Priority: medium. Confirmed against the current production build and server.

Evidence:

- `src/app/layout.tsx:21` resolves `metadataBase` from `ARCADE_APP_URL`, falling back to `http://localhost:3000`.
- `src/app/party/page.tsx:13` has no dynamic data dependency. The completed `.next-check/prerender-manifest.json` lists `/party` as prerendered.
- `Dockerfile:7` through `Dockerfile:13` build without declaring or passing `ARCADE_APP_URL`. `.dockerignore:2` excludes environment files.
- Build without `ARCADE_APP_URL`, then start with `ARCADE_APP_URL=http://127.0.0.1:3210`. GET `/party` returns 200 but its canonical URL, `og:url`, and `og:image` still point to localhost:3000. GET `/`, `/play`, and `/privacy` correctly use the runtime origin.
- Exact results are in `metadata-origin-check.json`. `.next-check/server/app/party.html` contains the same localhost tags.

Consequence: sharing the party landing page gives crawlers an unreachable image and incorrect origin even when the runtime configuration and health check pass.

Recommendation: choose whether this deployment uses a fixed build-time public origin or runtime metadata. Pass a public build argument or make the relevant metadata dynamic. Test `/party` in the actual image with a runtime origin different from the builder's default. Never put private secrets into Docker build arguments.

### INF-04. CI builds the container but tests a different runtime

Priority: medium release-validation gap.

Evidence: `.github/workflows/ci.yml:54` builds `queue-arcade:ci`, but `:58` starts `pnpm start` on the GitHub Ubuntu host. `:83` and `:85` run browser and Postgres checks against that host process. No step runs the built image.

Consequence: a green workflow would not demonstrate that copied standalone assets, Linux Alpine native libraries, non-root permissions, ffmpeg, the image command, or the image health check work. INF-03 is one defect that build success alone misses.

Recommendation: boot the built image with the temporary CI Postgres service and runtime environment, wait for its health response, and point the browser/API journeys at it. Include a cold audio round and a cold fogged portrait. Keep the existing checks that prove the browser flow.

Limit: Docker is installed only as a Windows forwarding command here. `docker info` reports that WSL integration is unavailable. No local image build or image execution was possible in this audit.

### INF-05. Logs remove most of the reason for a server failure

Priority: medium operations gap.

Evidence: `src/lib/server-diagnostics.ts:27` fingerprints the error name, message, and stack, but writes only the fingerprint, error name, first frame, event, and context. `src/app/api/health/route.ts:16` through `:28` deliberately throw descriptive configuration errors, yet `:53` sends them through this logger. The HTTP response is correctly generic.

Consequence: missing configuration, bad credentials, database permission errors, and connection failures can leave an operator with only `Error`, a hash, and a bundled frame. Fingerprints group repeats but do not explain what to fix. `src/lib/alpha-ops.ts:54` is product analytics, not service health or alerting. No checked-in uptime, latency, database-capacity, bandwidth, or error-rate alert rules were found. The hosting dashboard may have controls that this audit could not see.

Recommendation: preserve safe machine-readable error codes and a short allowlisted reason for known configuration and database failures. Keep credentials, query text, and user data out of logs. Define uptime, error-rate, database storage, and bandwidth alerts, with an owner and a simple incident procedure. Check a controlled database outage and a failed asset fetch before launch.

## Deployment decisions and unverified prerequisites

### Durable database and recovery

Priority: high prerequisite, not a verified data-loss finding.

`HANDOFF.md:18` and `:241` report a Render database expiry date of 2026-08-31 that nobody had checked. The current service is suspended, so its public health endpoint cannot reveal whether the database survives. No Render API tool or authenticated Render CLI was available. This audit did not inspect connection secrets or connect to the real database.

The current tree, committed file list, GitHub root directory, and repository history have no Render blueprint file. There is a Dockerfile but no checked-in service/database definition, backup schedule, restore procedure, retention setting for backups, or verified recovery exercise. These may exist in the Render dashboard; their absence from the repository does not prove they are disabled.

Before launch, verify the database's state, data location, backup retention, and restore capability. Restore a backup into an isolated database and prove login/profile and aggregate data survive. Decide the acceptable recovery time and data loss. The database reviewer also found that setting `DATABASE_URL` selects a new store without importing existing JSON data. Choose and test migration or intentional discard. Do not call an environment switch a migration.

### Instance count and restart behavior

Priority: medium constraint, already partly documented.

`src/lib/private-rooms.mjs:26`, `src/lib/room-presence.mjs:5`, and `src/lib/rate-limit.mjs:1` keep rooms, presence, and rate limits in process memory. Postgres makes public votes durable but does not make party rooms shared. `README.md:29` correctly says restart ends a party; `HANDOFF.md:135` says multiple instances derive the same public timeline.

Use one instance for the current party implementation. Otherwise one request can create a party on instance A and the next report it absent on B. Rolling deployments also create a period with old and new process state. A content release can split public timelines because the room includes the content version. Record the deployment interruption behavior and test reconnect after a real restart. Move party state to shared storage before claiming multi-instance party support. Presence and application rate limits would also need a shared or edge solution.

### Capacity and asset dependencies

No production capacity claim is justified by this audit. The current pool defaults to five connections in `src/lib/vote-store-postgres.ts:85`. `/api/rounds` polls every five seconds and can perform several database reads, plus reads for recovered rounds. The database reviewer covers query costs and retention.

Audio and fog portraits depend on third-party hosts. `src/lib/round-audio-cache.mjs:34` and `src/app/api/round-image/route.ts:98` have no explicit fetch deadline. `src/app/api/round-audio/route.ts:158` converts early non-PCM cuts per request instead of caching the result. `src/lib/cut-round-audio.mjs:21` has no conversion deadline or worker limit. The security media reviewer reproduced repeated conversion work with an isolated stub and owns that finding. Cache per-stage cut promises, bound work, and test a slow or failed source before launch.

A representative load test should include synchronized cold media stages and database work, not just static pages. Record latency, error rate, memory, CPU, database connections, and outbound bytes at the intended initial population. Do not run the test against the suspended public service.

## Lower-priority hardening

- `package.json:50` promises Node >=20.9, but `pnpm-lock.yaml:1990` requires Node ^22.12, ^24, or >=26 for Vitest 5. Align the documented development/test engine with the supported tools. Current audit runtime is Node 24.15.0; CI uses Node 22.
- `.gitignore:32` ignores `.env*.local` only. `git check-ignore --no-index .env .env.production .env.local .env.example` confirms only `.env.local` is ignored. Add ordinary private environment filenames while retaining `.env.example`. No exposed secret was found by this check.
- `.dockerignore` omits `.next-check`, although `HANDOFF.md:74` tells maintainers to build there. The audit build is 181 MB and would enter a local Docker context. Ignore alternate build/test output directories.
- `Dockerfile:1`, `:7`, and `:15` use the moving `node:22-alpine` tag, `:21` installs unpinned ffmpeg, and CI actions use moving major tags. These make builds less reproducible. Use reviewed digest/SHA pins with an update process and scan the final operating-system packages. No image scanner was available locally.
- GitHub's branch protection and ruleset read APIs returned 403 with a plan restriction. Do not assert that particular protection rules exist or do not exist. No plan change or purchase was requested or made.

## Controls that are present

- The Docker image uses a non-root user and copies standalone output rather than the entire dependency tree into the runner.
- Dependency install uses the committed pnpm lockfile with `--frozen-lockfile` in Docker and CI.
- CI requests only `contents: read` and uses a temporary Postgres service. No production credentials appear in its checked-in environment block.
- `.dockerignore` excludes private environment files, `.data`, `.git`, and node_modules.
- `/api/health` checks the three stores and rejects missing production configuration without returning secrets.
- Public asset allowlists exist for optimized and fog images, and caches have entry and time limits. These do not replace timeouts and work limits.
- Structured diagnostics omit client error text, stack traces, query strings, and player IDs. This is a useful privacy control even though server diagnosis needs safe reason codes.

## Limits

This audit did not resume Render, enable CI, change configuration, send production test votes, run a remote load test, alter dependencies, inspect private environment values, or access the real database. It did not verify the container runtime because Docker was unavailable. Audit counts come from the package registry on 2026-10-06 and can change as advisories are added. Vendor-advisory applicability was checked against the source; exploitability was not assumed from a scanner severity.

## Verification reliability supplement

### INF-07. The Postgres multiplayer smoke test no longer matches the current app

Priority: medium. Confirmed test defects prevent the full CI integration gate from completing reliably. They are separate from application defects.

The audit's original run failed at `scripts/multiplayer-smoke.mjs:476`, which asserts the authenticated profile still contains `Smoke Tester`. The fixture at `:133` deliberately sets `avatar_url` to NULL. `src/app/profile/page.tsx:48` calls profile enrichment, and `src/lib/steam-profile.mjs:61` treats a missing avatar as needing enrichment. The profile can therefore replace the fixture name with the public Steam name. The gate depends on a real upstream profile and network conditions. The API identity check can pass while this fixed-name assertion fails.

A temporary audit-only copy seeded an avatar to avoid that external dependency. It then failed the reveal assertion at `scripts/multiplayer-smoke.mjs:528`. The script waits until `answerDeadline + 200ms` at `:503`, but `src/lib/round-timing.mjs:2` keeps the server in answering phase for 800ms after the displayed deadline. The diagnostic run recorded a response 213ms after the deadline, correctly still in answering phase. This failure is a stale test assumption, not an answer-reveal defect.

The test also chooses whichever public round is active rather than controlling format coverage. Its vote helper at `:211` supports item grids, recipes, hero grids, and value ordering, but not Flashback year or ordering keys. Its private catalog at `:28` through `:50` omits the Aghanim and Flashback decks. An isolated check of the original helper found:

- Both Flashback modes submit only `answerIndex` without `answerKey`; current answer validators reject these payloads.
- All 84 Aghanim and 191 Flashback questions are absent from the smoke test's private-question lookup.
- At its planned reveal wake time, `roundPhaseAt` returns `answering`.
- The seeded NULL-avatar identity requires enrichment.

Repeat this check with `node evidence/smoke-contract-check.mjs`. It uses the original vote helper with a fake fetch and sends no requests. Results are saved in `smoke-contract-check.json`. The failed full-run evidence is in `multiplayer-postgres.log`, `multiplayer-deterministic.log`, and `multiplayer-deterministic-retry.log`.

Other reliability limits follow from the same design. `answeringRoundWithTime` accepts only four seconds remaining at `:205`, after which the script makes many HTTP/database calls and renders a profile before asserting answering-phase state. A slow profile enrichment can exceed that budget. Successful deletion of seeded accounts occurs near the end at `:867`; early failures leave fixtures behind. Re-running with one fixed reviewer Steam ID against the same database can then collide with the identity's unique key.

Recommendation: make fixture identity enrichment deterministic, exercise every supported answer mode and deck, and poll for the required server phase with a bounded deadline. Use an isolated database and guaranteed fixture cleanup. Keep the end-to-end database checks, but do not infer a user-flow failure from these known stale assertions. A passing temporary audit copy does not make the repository's committed CI gate green.

### INF-08. The main verification chain omits the required native sound proof

Priority: medium verification gap.

`package.json:32` defines `check:sounds` as the native output check followed by the tapped PCM check. However, `package.json:48` calls `check:ui`, whose script list at `scripts/check-ui.mjs:83` runs only `check-feedback-sounds.mjs`. `.github/workflows/ci.yml:53` runs that same main chain. No later CI step invokes `check-native-feedback-sounds.mjs` or `check:sounds`.

The distinction is material. `docs/adr/0001-feedback-sounds.md` says that `pnpm check:sounds` is the gate and that a Web Audio tap is not proof. `docs/feedback-sounds.md:22` records that the old tapped checks passed while native output lost the click attack and two tabs played duplicate wrong-result sounds. The native script checks those failures and its own negative controls.

Recommendation: include the native Pulse capture gate in the supported release-check environment, or record a mandatory separate verified result for changes covered by ADR 0001. Install the required recorder tools in that environment and let missing tools fail the check. Do not describe `pnpm check` alone as proof of the complete feedback sound contract. The parent audit runs the native check separately; this finding concerns the normal repository and CI chains.

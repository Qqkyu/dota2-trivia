# Launch status

Updated 15 October 2026. This page replaces the old root `HANDOFF.md` and records the
current deployment, what is left before a public soft launch, and local housekeeping.
The October audit itself is summarized in [docs/audits/2026-10-06](audits/2026-10-06/README.md).

## Git

| Item | Value |
| --- | --- |
| Deployed source | `31961cb`, tag `launch-release-20261010` |
| Frozen audit evidence | tag `launch-evidence-20261010` (142 MB, not on `main`) |
| `main` | Release source rebuilt as area commits, plus the 15 October cleanup |

`main` keeps the Markdown reports of the audit. The raw evidence (JSON, logs, screenshots,
audio, helper scripts, the reusable tool map) is only on the evidence tag. Read it with
`git show launch-evidence-20261010:docs/audits/2026-10-06/launch-checks/README.md` or check
the tag out in a separate worktree.

## Hosted preview (deployed 20 October)

| Item | Value |
| --- | --- |
| App | <https://queuearcade.com> (custom domain since 2026-11-01; `queue-arcade.onrender.com` pages redirect to it) |
| Render service | `srv-d9mqd1942hec73e9nlt0`, Docker, plan `0.5c-512mb` ($7 a month, no sleep) since 2026-11-01, Frankfurt, one instance; managed by Blueprint `exs-dbjg5p2jnfac73ftd3f0` from `render.yaml`, Auto Sync off |
| Deploy policy | Manual deploys only from branch `main` (switched on 20 October) |
| Live deployment | `dep-dbnjagff3r2c738qlni0` from `main` at `73a8cdb` (room split PR #60, community numbers PR #61, games in 24 hours instead of the live count PR #62; 2026-11-07) |
| Edge caching | On since 2026-11-06, Common static files, saved in the dashboard. `/api/art` images and `/_next/static` files answer `cf-cache-status: HIT`; pages and API routes stay `DYNAMIC`. See [operations](operations.md#render-service-blueprint) |
| PostgreSQL | `dpg-d9mqc4taeets73aiclsg-a`, PostgreSQL 17, restricted runtime role, empty external allowlist |
| Trusted address header | `ARCADE_TRUST_PROXY=cf-connecting-ip` |
| Automatic migrations | Off (`ARCADE_AUTO_MIGRATE=false`); file store off |

The 20 October deploy built in three minutes. Right after it, `/api/health` answered
`ready` in 0.25 s, `pnpm check:headers` passed, `/api/rounds` served a live public round,
and the Steam OpenID provider check passed. Until 1 November the free plan slept the
service and the first visitor after idle waited about 17 s; the paid plan does not sleep.

## Deploying `main`

1. Run the full local gate (`pnpm check`) on the `main` commit you want to ship.
2. Trigger a manual deploy of that commit, either in the Render dashboard or with the API
   (`POST /v1/services/srv-d9mqd1942hec73e9nlt0/deploys` with the `commitId`, using
   `RENDER_API_KEY`). Render rebuilds the Docker image itself. Keep automatic deploys off.
3. After the deploy, run `APP_URL=https://queuearcade.com pnpm check:headers`
   and open the app once to confirm `/api/health` and a public round.
4. Run `pnpm db:migrate` first only when `src/lib/database-schema.mjs` changed since the
   last deploy. Follow [operations](operations.md) for migrations, backups, and rollback.
   A deploy restarts the process, which ends active private rooms.

## Open before a public soft launch

Steam login on the hosted app was confirmed by the maintainer with a real account on
2026-10-31.


- **Availability and traffic.** One paid instance, no sleep. Private rooms, chat,
  presence, and request limits live in that process. Keep one instance until those use
  shared storage. The database has Render point-in-time recovery with a 3-day window.
- **Capacity.** A four-player constrained run passed. A 466-player synthetic run kept all
  votes but missed the one-second response target. It does not prove 466 live users on
  one instance.
- **Device coverage.** Players are expected on desktop PCs. Browser checks and Android
  emulation passed; phones are not a launch target.
- **Open issues.** GitHub #1 (Muerta Spell Link tooltips), #4 (difficulty calibration
  from real rounds), and #5 (opaque asset tokens before public rankings) remain.

## Local housekeeping

- **Docker cleanup is still pending.** The audit left six image tags
  (`queue-arcade-launch:final`, `queue-arcade-launch:baseline`,
  `queue-arcade-launch-runtime-base:local`, `queue-arcade-launch-dependencies:local`,
  `queue-arcade-ci-runner:20261006`, `queue-arcade-assistive:orca49`), the stopped
  container `queue-arcade-launch-restore-pg17`, and its one anonymous volume. The `docker`
  command is not available inside this WSL distro, so remove them from Docker Desktop.
  The reviewed helper is on the evidence tag under `launch-checks/cleanup/docker-preflight-20261010/`.
- **Private recovery files** stay under the ignored `.local-assets/operator-recovery-20261010/`
  (database backup, old configuration, finalization receipts). Never copy them into Git,
  reports, or tool output.
- **Reusable tools** (Node 22.23.3, PostgreSQL 17 clients, Gitleaks, Trivy, browsers,
  speech models) live under `~/.cache/`. The exact map is on the evidence tag at
  `launch-checks/cleanup/reusable-tool-locations.json`.
- **Local runs use Node 22** (`.nvmrc`). Node 24 also works, but CI runs 22.

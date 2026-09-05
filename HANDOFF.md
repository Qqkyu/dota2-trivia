# Queue Arcade handoff

Last updated: 2026-09-05  
Repository: `git@github.com:Qqkyu/dota2-trivia.git`  
Branch: `main`  
Known-good commit when this document was written: `33c466f` (`Trim redundant round copy`)

This document is the working handoff for another coding agent. Read this and `README.md` before changing the project. The README is the detailed technical reference; this file records product decisions, current operational state, and the next sensible work.

## Product in one paragraph

Queue Arcade is an unofficial desktop-first browser arcade for the time between pressing Find Match and accepting a PC game. Dota 2 is the first content pack, inspired by Valve's retired Queue Trivia: everyone joins one endless synchronized public room, gets the same 15-second question, then sees the correct answer and the global answer/score split during a 7-second reveal. It should feel like testing real Dota knowledge—not reading-speed trivia, visual busywork, or an explanation-heavy tutorial. A match can pop at any moment, so there are no required ten-round runs and no meaningful penalty for leaving.

## Product decisions that should not be casually reversed

- There is **one public pool**, not separate queues for modes or difficulty. The named games are round identities inside the mixed rotation.
- There are no player-facing difficulty levels. Difficulty is hidden scheduling/scoring metadata.
- The game is desktop-first. Do not spend launch time making this a mobile product; mobile can become a separate app later.
- The arcade is infinite. The session summary is optional and mainly reachable through the small trophy button; do not rely on users clicking “end session.”
- Hints unlock automatically. Earlier correct answers score more; Spell Link and Aghanim's Lab additionally lose 40 points per later clue.
- The interface should communicate through layout/state. Avoid narration such as “clues unlock with time,” generic tips, repeated patch labels, or instructions that merely restate the prompt.
- Full hero/item answer grids intentionally mirror Dota's familiar layout. Players should use Dota muscle memory, not learn a custom arrangement.
- The crowd reveal after every round is core to the product, including the answer split and “You / Correct avg / Best” points comparison.
- Dota accuracy matters more than content volume. A plausible but unverified interaction is not acceptable.
- Map Sense and Counterplay are retired. Their source/data is preserved only as an archive (their live UI, vote plumbing, and CSS were removed on 2026-09-05); do not put either back into the public cadence without a new design and full re-audit.
- Mobile browser gameplay, public leaderboards, and competitive rankings are deliberately out of current scope.
- Party rooms exist at `/party` (added late August 2026): the host picks formats and a code, friends join by link, and the party runs on its own round clock with a ranking and chat. A tab that stops polling for 90 seconds is tagged Away in both lists but keeps its seat and score; only Leave removes a player. Parties live in server memory only; a deploy ends them. The public crowd remains the main product.
- The architecture should permit more games later (League of Legends was discussed), but do not build a second pack before Dota retention proves the loop is sticky.

## What currently works

The live Dota catalog contains 1,517 playable prompts for patch 7.41e in thirteen scheduled formats:

| Scheduled format       | Count | UI identity     |
| ---------------------- | ----: | --------------- |
| Classic ability values |   160 | Classic Trivia  |
| Fogged Vision          |   127 | Fogged Vision   |
| Shopkeeper builds      |    52 | Shopkeeper Rush |
| Quote Hunt             |   245 | Quote Hunt      |
| Aghanim upgrades       |    84 | Aghanim's Lab   |
| Classic hero stats     |    82 | Classic Trivia  |
| Soundcheck             |    96 | Soundcheck      |
| Value ordering         |    80 | Order Up        |
| Shopkeeper paths       |    50 | Shopkeeper Rush |
| Spell Link             |   126 | Spell Link      |
| Classic item prices    |   101 | Classic Trivia  |
| Echo Hunt              |   123 | Echo Hunt       |
| Flashback              |   191 | Flashback       |

The ten visible round identities are:

- Classic Trivia: audited mana, cooldown, damage, hero-stat, and item-price questions.
- Shopkeeper Rush: Build Result, Real Recipe, Shared Part, and Upgrade Path. Full-shop pickers are used where four options would trivialize the answer.
- Spell Link: full ability description first, then name, then icon; answer through the full Dota hero grid.
- Fogged Vision: every enabled hero, with a fixed three-stage curve. Its final stage remains somewhat fogged.
- Echo Hunt: hero responses played as two short fragments and then the full response; full hero grid.
- Soundcheck: audited ability/item activation sounds, including ordered pairs; item rounds use the Dota-style shop picker where applicable.
- Quote Hunt: 245 proper written hero lines with two timed identity hints and the full hero grid.
- Aghanim's Lab: current Scepter/Shard effect, then upgrade details, then ability name; full hero grid.
- Order Up: drag/select four audited item, ability, or hero values from lowest to highest. The fourth pick submits automatically.
- Flashback: 191 sourced history prompts (year slider with a Lock button, four choices, or ordering) about releases, patches, The International, and community moments, with official winner photos on reveal.

Other completed foundations:

- Canonical `/` lobby and `/play` game URLs, including Back/Forward behavior.
- Server-owned deterministic rounds and deadlines; multiple instances derive the same global timeline.
- Fair first entry: join the active question only with at least eight seconds remaining, otherwise wait for the next full round.
- Five-second recovery heartbeat plus deadline, focus, visibility, page-resume, and network wakeups. This fixed a critical bug where a background tab appeared frozen until mouse input.
- Server-delivered phase-aware questions. The browser does not import the private answer catalog.
- Vote deadlines, duplicate protection, hidden pre-reveal splits, keyed answers, and global result summaries.
- Semantic scheduling: the same main hero/item subject stays at least 13 rounds apart; exact prompts stay much farther apart in the deterministic audit.
- Upcoming-round audio warming so progressive audio can begin promptly.
- Persistent master sound/mute with a 70% default and Dota-native lock/correct/wrong/start sounds.
- Optional Steam OpenID sign-in and Postgres-backed personal accuracy, streak, records, early solves, and format mastery.
- Per-question reporting, calibration/review UI, reviewer allowlist, privacy page, profile deletion, structured diagnostics, and `/ops` alpha metrics.
- JSON local stores for development and transactional Postgres stores for production.

## UX taste and recurring feedback

The maintainer is a long-time Dota player. Design for an experienced player, not a beginner tutorial.

- Questions must be readable within a 15-second round. Fast English comprehension should not be the tested skill.
- “Anyone who has played once knows this” is generally too easy. Four choices often make otherwise good questions trivial; prefer full catalog pickers or ordering interactions when they add genuine game knowledge.
- Hints must narrow without literally saying the answer. Never reveal a hero name inside an ability description before the answer.
- Real spoken lines are good; laughs/noises are not fair hero-identification questions.
- Real Dota audio is strongly preferred. Current wrong feedback is the iconic “meep merp”; correct feedback is the coin/last-hit-like sound.
- Avoid redundant chrome. The patch appears once in the persistent header. The latest pass deliberately removed per-question patch stamps, generic Fog advice, “later clues cost…” narration, Shopkeeper prompt restatements, mode duplication, presence counters, and elapsed-room timers.
- Use a short prompt. The current Order Up prompt is a full question (“How do these items rank from cheapest to most expensive?”), not only an arrow label.
- Preserve stable layout across selection, hints, tooltips, and reveal. UI shifts have repeatedly been treated as bugs.
- Every implementation/fix handoff to the maintainer should include a short manual user journey for checking it.

## Architecture map

### Core client

- `src/components/queue-arcade.tsx`: the main lobby, waiting gate, all live round renderers, answer controls, polling, audio, crowd reveal, and optional summary. It is large; make changes narrowly and add regression checks.
- `src/components/queue-arcade.module.css`: all major arcade layouts and responsive styles.
- `src/app/page.tsx` and `src/app/play/page.tsx`: canonical lobby/game entry points.
- `src/lib/arcade-navigation.mjs`: canonical URL rules and legacy mode normalization.

### Catalog and scheduling

- `src/lib/trivia.ts`: private question type, catalog assembly, format-to-game mapping, and `ARCADE_CONTENT_VERSION`.
- `src/lib/arcade-games.mjs`: ten live identities and the thirteen-slot public format cadence.
- `src/lib/semantic-schedule.mjs`: deterministic global scheduling and cross-format subject spacing.
- `src/lib/game-catalogs.ts` / `src/lib/game-identity.ts`: current Dota pack registry and the intended seam for future game packs.
- `src/data/*.json`: generated and curated catalogs. Prefer editing their generators/audits rather than hand-editing generated output.
- `src/lib/classic-trivia-quality.mjs` and `src/lib/shopkeeper-quality.mjs`: live quality gates; some generated legacy templates remain in source JSON but are intentionally excluded.

### Public room and answer boundary

- `src/lib/public-rooms.ts`: 15-second answer phase, 7-second reveal, fixed epoch, room identity, and deterministic round lookup.
- `src/app/api/rounds/route.ts`: sanitized phase-aware question delivery, presence heartbeat, player vote/report state, and reveal-only crowd data.
- `src/lib/public-question.mjs` / `.ts`: explicit private-to-public serialization contract. Never put marked answers, audit/source metadata, hidden Shopkeeper keys, locked clues, or internal catalog IDs into answering payloads.
- `src/app/api/votes/route.ts`: authoritative round/answer validation and scoring. Do not trust the client to say which question or answer is correct.
- `src/lib/scoring.mjs`: shared pure scoring logic used by client preview and server acceptance.
- `src/lib/room-sync.mjs` and `src/lib/arcade-entry.mjs`: stalled-request recovery and fair first entry.
- `src/lib/round-audio-cache.mjs` plus `/api/round-audio`: answer-safe audio proxy and next-round prewarming.

### Persistence, accounts, and operations

- `src/lib/vote-store.ts` / `vote-store-postgres.ts`: votes, crowd splits, reports, and calibration aggregates.
- `src/lib/account-store.ts` / `account-store-postgres.ts`: Steam-linked accounts and personal records.
- `src/lib/alpha-store.ts` / `alpha-store-postgres.ts`: aggregate alpha visits and retention signals.
- `src/lib/steam-auth.mjs`, `auth-session.ts`, and `/api/auth/steam*`: OpenID and HttpOnly sessions.
- `/profile`, `/privacy`, `/calibration`, `/ops`: player/account/privacy/reviewer/alpha surfaces.

### Verification

- `pnpm validate-data`: catalog, scheduling, privacy, payload, and product-contract checks.
- `pnpm test`: the vitest unit suite under `tests/` (scoring, crowd splits, rate limits, calibration, reviews, revisions, diagnostics, party rooms, room sync, Spell Link redaction, interface copy). Runs in under a second.
- `pnpm lint`, `pnpm typecheck`, `pnpm build`, `pnpm validate-client-bundle`.
- `pnpm check:ui`: headless-Chrome and API click-throughs against a live app, including `check-round-copy.mjs`, which plays one party round per format and checks copy, controls, and reveals in the DOM, and `check-hero-search.mjs`, which types into the hero grid, presses Enter, and checks the reveal names the hero without moving the grid.
- `pnpm check`: all of the above in order.
- `node scripts/visual-smoke.mjs`: full desktop/mobile browser journey when Chrome exposes a remote-debugging port.
- `pnpm check:multiplayer`: API/storage smoke, best with Postgres.
- `pnpm check:resume`: freezes/stalls the browser across deadlines to prevent the former AFK stall regression.
- `pnpm audit:client`: rechecks marked answers against a supplied decompiled Dota client.

Pure logic is unit-tested in `tests/*.test.mjs` (vitest). Data and boundary rules live in `scripts/validate-*.mjs`; some of those still grep source files for architectural guards (client import boundary, cache headers, proxy usage). Player-visible behaviour belongs in the `scripts/check-*.mjs` browser click-throughs, not in source-string checks. When fixing a regression: add a unit test for logic, a `check-*.mjs` assertion for what the player sees, and update `visual-smoke.mjs` if layout or browser state is involved.

## Local development

```bash
pnpm install
pnpm dev
```

Open `http://localhost:3000`. The app works without Steam or Postgres. In that case it uses ignored files under `.data/`.

Important local-data rule: `.data/` and `.env.local` are private, ignored, and may contain real local history or secrets. Never print, commit, delete, or overwrite them unless explicitly asked. Existing local data files are currently present.

Before handing work back:

```bash
pnpm validate-data
pnpm lint
pnpm typecheck
pnpm build
pnpm validate-client-bundle
```

Also run the relevant multiplayer/resume/visual smoke for changes in those areas. Keep the development server running when the maintainer is manually auditing rounds.

## Current operational state

State verified on 2026-08-12:

- GitHub repository: `Qqkyu/dota2-trivia`, default branch `main`.
- GitHub workflow `Queue Arcade CI` exists but is **disabled manually** because the account exhausted its Actions allowance and failure email was noisy. Do not re-enable it without asking. The README sentence saying every push runs CI describes the intended launch state, not the current state.
- Render service `queue-arcade` (`srv-d9mqd1942hec73e9nlt0`, Frankfurt, `https://queue-arcade.onrender.com`) is **suspended by the user** to avoid bandwidth charges. It has auto-deploy-on-commit configured, so unsuspending it may immediately deploy the latest `main`. Do not resume or deploy without asking.
- Render Postgres `queue-arcade-db` (`dpg-d9mqc4taeets73aiclsg-a`, Frankfurt) is on the free plan and reports an expiry date of **2026-08-31**. Upgrade/replace it before launch and verify backups/migration rather than letting it expire.
- The Render web service itself is on the free plan. The maintainer intentionally wants to postpone paid hosting until launch readiness.
- Render is the maintainer's preferred host because their other apps already live there. Supabase was discussed for Postgres but not chosen; default to paid Render Postgres at launch unless that decision is explicitly reopened.
- The most recent full verification (commit `33c466f`) passed the 1,326-question data suite, lint, strict TypeScript, production build, private-client-bundle audit, and visual desktop/mobile smoke.
- A full audit on 2026-09-05 found and fixed, in one commit each: the calibration page shipping every question with its answer to the browser (via `site-chrome.tsx` importing the catalog), all Flashback four-choice answers sitting on B, party Echo Hunt/Soundcheck audio returning 409, party chat trusting a client-supplied name and votes from non-members, a red `pnpm lint`/`pnpm audit`, seven Aghanim/Spell Link clues that named their answer, and ghost party members. `pnpm check` (including `check:ui`) is green after those commits. Four small features followed the same day, one commit each: Enter picks the only hero or item a search leaves, the Flashback year slider locks with a button instead of on release, the hero grid names the correct hero on reveal in a fixed-height line, and silent party players get an Away tag instead of vanishing.
- `validate-question-delivery` now walks every "use client" import graph; nothing under `src/components` may reach `trivia.ts`, `game-catalogs`, the stores, or the question JSON.
- The development server may or may not survive a terminal/PC restart. Start it with `pnpm dev` if unavailable.

Do not place secrets, personal Steam IDs, or full environment values in this document. `.env.example` lists the supported variables. Production requires at least `DATABASE_URL`, a private `ARCADE_VOTER_SALT`, canonical `ARCADE_APP_URL`, a distinct 32+ character `ARCADE_AUTH_SECRET`, `ARCADE_DATA_COUNTRIES`, and the reviewer's SteamID allowlist. The maintainer's reviewer ID is already configured externally; ask for it if a fresh environment needs it.

## Patch/content maintenance

The current source snapshot is Dota **7.41e**, snapshot date **2026-09-05**, client build **6882**, Steam build ID **24503204**. Key audit metadata is in `src/data/trivia-meta.generated.json` and `scripts/client-constant-audit.mjs`.

Never “update the patch” by changing only the header string. Numeric values, recipes, hero stats, ownership, Aghanim effects, sounds, and generated comparisons must be re-audited together. The normal pipeline is documented in README under “Refresh the Dota data.” In particular:

```bash
DOTA_PATCH=<new-patch> DOTA_SNAPSHOT_DATE=<audit-date> pnpm sync-data
pnpm sync-soundcheck
pnpm sync-shopkeeper -- --items-cache=/path/to/opendota-items.json --client-root=/path/to/decompiled-client
DOTA_CLIENT_AUDIT_ROOT=/path/to/decompiled-client pnpm audit:client
pnpm validate-data
pnpm validate-assets
```

Generated outputs include classic/hero/quote/echo questions, metadata, Shopkeeper, Soundcheck, Order Up, and Aghanim data. Inspect diffs; do not blindly accept third-party constants because OpenDota/Dotabase can lag the client.

Any playable catalog or scheduling change also needs an intentional content-version decision. The public room ID includes `ARCADE_CONTENT_VERSION` from `src/lib/trivia.ts`; its family suffixes have been bumped as decks/scoring changed so old and new deterministic rooms cannot mix. Preserve stable per-question calibration revisions for unchanged questions, but bump the appropriate room/content suffix when the public schedule or answer contract changes.

The maintainer plans a post-launch local cron/agent that notices patches, re-audits, and proposes content updates. That automation does not exist yet and should not silently publish changes.

## Known risks and deliberately unfinished work

There is no known reproducible critical gameplay bug at this handoff. The following remain risks or launch work:

1. **No real multiplayer population has tested the crowd UX.** Synthetic tests cover 127 hero votes, 182 item votes, and all 24 order permutations, with a top-four-plus-Other reveal. Real behavior and comprehension still need observation.
2. **Question difficulty is seeded, not calibrated.** The calibration pipeline exists, but most content has no public sample. Several formats may still feel too easy to an active player—especially Shopkeeper paths/builds and some Classic questions.
3. **Hidden asset identities are not fully opaque.** The answer catalog is server-side, but descriptive artwork/audio paths can sometimes be harvested across reveals. Fine for personal records; fix before competitive public rankings.
4. **Public rankings are intentionally absent.** Steam profiles store personal stats. Add leaderboards only after server-owned opaque asset delivery and abuse/threat modeling.
5. **Current Dota assets are third-party/Valve fan-project usage.** Keep the unofficial disclaimer and attribution. There is no formal license grant in this repository.
6. **The main component is large.** `queue-arcade.tsx` carries many round variants. Avoid speculative rewrites during launch polish; split it only with strong browser regression coverage.
7. **Production database lifecycle.** The free Render database expires 2026-08-31, and the app service is suspended. This must be resolved before a public launch.
8. **CI is off.** Local validation is the only guard until GitHub Actions is deliberately re-enabled.
9. **Remote asset availability and bandwidth.** Audio is proxied to hide identities and was the primary bandwidth concern. Monitor actual bandwidth after reactivation; do not casually proxy ordinary Steam artwork.

## Prioritized next work

### P0 — Launch readiness

1. **Finish the maintainer's manual polish pass.** Play long local sessions and report exact question/round examples. Fix only observed confusing copy, layout shifts, wrong data, duplicate content, or poor difficulty. Add a regression test for each reproducible bug.
2. **Upgrade the production database before 2026-08-31.** The current default decision is paid Render Postgres. Verify and back up the existing schema/data, upgrade or deliberately migrate it, update `DATABASE_URL` if needed, run `/api/health`, then test Steam/profile/votes/reports.
3. **Restore verification intentionally.** Re-enable GitHub Actions only after allowance resets or billing is approved. Run the full Postgres CI journey once before launch.
4. **Resume Render only for a controlled soft launch.** Because auto-deploy is enabled, first ensure `main` is known-good, production env vars still exist, the database is durable, and `/api/health` is green. Watch logs, bandwidth, and `/ops` immediately.
5. **Do an actual public soft launch rather than waiting for a private group.** The maintainer does not have 5–15 Dota testers. Ship to a small public audience, then use `/ops`, calibration, and reports to learn.

### P1 — Learn from real usage

1. Review `/ops`: visits, return rate, rounds per visit, per-format correctness, and reports.
2. Work `/calibration` as the allowlisted maintainer; verify report → reviewed/quarantined → reopened flows with real data.
3. Tune question difficulty and format weights from measured answer rates, not intuition alone. Preserve one room; do not add difficulty queues.
4. Expand only the thin/over-repeated high-quality families. Current counts show Shopkeeper (102 total) and Order Up (80) are smaller than Quote/Fog, but raw count alone is not a reason to generate weak questions.
5. Revisit Soundcheck after real data. Good future candidates are carefully audited announcer/channel/courier families; every clip still needs fair distractors and a verified event/file mapping.

### P2 — Hardening after product signal

1. Replace answer-sensitive asset URLs with opaque, current-round server tokens if public competitive rankings become a goal.
2. Add abuse-resistant public rankings only after that boundary is secure. Personal records are already server-owned and safe enough for alpha.
3. Build patch-detection/audit automation that opens a reviewed change instead of auto-publishing.
4. Reduce the giant client component in behavior-preserving slices with visual smoke coverage.
5. Add a second game pack only after Dota retention is promising. Keep the `GAME_CATALOGS` and room namespace model; do not intermingle Dota and League answers in one room.

## Ideas that were tried and rejected

- Separate minigame queues: rejected because several identities have only a few loops and the charm is everyone sharing one pool.
- Player-facing Warm-up/Veteran difficulty: removed; “Veteran” still felt easy and fragmented the concept.
- Fixed ten-round sessions/reports: rejected in favor of an infinite queue-friendly loop.
- Manual “Next round”: rejected; synchronized public rounds advance automatically.
- Replay buttons for Echo/Soundcheck: removed; each timed cut plays once automatically.
- Full sound at round start: too easy; progressive short/short/full cuts are the intended design.
- Four-option hero answers: often too easy; full Dota hero grid is preferred.
- Four-option Build Result/recipe answers: often too easy; use the Dota-style item shop or recipe builder.
- Primary-attribute and ability-description-to-one-of-four-same-hero questions: too trivial and retired by quality gates.
- Map Sense: fun prototype but mostly visual guessing, high maintenance, and hard to make genuine Dota knowledge.
- Counterplay: too many basic/obvious interactions and high correctness-maintenance risk.
- Party/private rooms: rejected at first, then built in August 2026 as `/party` once the public loop was stable; the shared public crowd is still the main product.
- Session share/rating buttons: removed as low-value chrome.
- Generic side-rail “tips”: removed as noise.

## How to work with the maintainer

- Be concise and use normal language; avoid architecture jargon unless it changes a decision.
- Brainstorm uncertain game design before implementing it. Several prototypes were built and later removed because the Dota-knowledge test was unclear.
- When factual Dota mechanics are involved, research/audit them rather than asking the maintainer to catch errors manually.
- Preserve unrelated working-tree changes and private ignored data.
- For a change, implement, test in proportion to risk, commit, and push unless told otherwise. Do **not** deploy or re-enable CI while the current operational holds remain.
- After each feature/fix round, give a short manual journey such as: open `/play` → wait for format X → perform Y → confirm Z.

## Suggested first task for the next agent

Do not invent a large new feature immediately. Start the development server, let the maintainer continue the long-session polish audit, and fix the first concrete issue with a regression test. In parallel only when asked, prepare a launch checklist that converts the P0 items above into explicit go/no-go checks—especially the expiring Postgres database, disabled CI, suspended Render service, health endpoint, Steam callback origin, and bandwidth monitoring.

# Queue Arcade

Release preparation: [current launch checks](docs/audits/2026-10-06/launch-checks/README.md). Earlier records cover the [security audit and fixes](docs/audits/2026-10-06/remediation.md) and [complete question, functional and UI review](docs/audits/2026-10-06/deep-review/README.md).

An unofficial browser arcade made for the gap between **Find Match** and **Accept**. Dota 2 is its first content pack: the project began as a recreation of Valve's old Queue Trivia and now rotates ten named round identities inside one endless public arcade:

- **Classic Trivia** — mana, cooldowns, damage, stat comparisons, and item prices;
- **Shopkeeper Rush** — build finished items, spot exact recipes, find shared parts, and trace upgrade paths;
- **Spell Link** — match an ability to its hero while timed clues unlock;
- **Fogged Vision** — identify a hero while its portrait clears through three fixed-layout stages;
- **Echo Hunt** — identify a hero from two terse voice fragments before the complete response unlocks;
- **Soundcheck** — identify verified effects through three growing audio cuts, including ordered two-sound sequences;
- **Quote Hunt** — match a substantial written hero response to its speaker;
- **Aghanim's Lab** — identify a hero from an audited Scepter or Shard effect before later clues reveal the upgrade type and ability name;
- **Order Up** — arrange audited item, ability, and hero values from low to high;
- **Flashback** — Dota and The International history: release years, champions, patches, and community moments.

These are round formats, not separate queues. Everyone shares the parts that made the original compelling: short timed rounds, a global answer reveal, speed and streak scoring, and double points when you are right while most of the crowd is wrong.

The playable MVP includes:

- endless, instantly interruptible arcade sessions with automatic round transitions;
- canonical `/` lobby and `/play` session URLs with direct loading plus browser Back and Forward support;
- one shared public room of 15-second rounds, without mode, category, or player-facing difficulty queues;
- 1,517 live prompts for Dota patch 7.41f, including all 127 enabled heroes in Fogged Vision, 102 Shopkeeper rounds, 96 Soundcheck rounds, 84 Aghanim's Lab upgrades, 80 tie-free Order Up rounds, and 191 sourced Flashback prompts;
- item, hero, and ability artwork for visual answer rounds;
- 123 remotely verified Echo Hunt clips, 96 Soundcheck rounds built from 114 audited clips, and 245 Quote Hunt lines sourced through Dotabase;
- live-client answer audits plus balanced A–D placement for every generated question family;
- progressive Spell Link, Quote Hunt, and Aghanim's Lab clues delivered at server-owned stages;
- a deterministic thirteen-format cadence that gives Classic three slots, Shopkeeper two, every distinctive interaction one, and never repeats a family back-to-back;
- private party rooms at `/party`: the host picks formats and a code, friends join by link, a three-second countdown starts the party's own round clock, with an in-game ranking and a small chat; players whose tab goes silent for 90 seconds are tagged Away but keep their seat and score, and only Leave removes anyone; parties live in server memory and end on restart;
- visible speed scoring, explicit hint penalties, difficulty bonuses, streaks, and majority-wrong scoring;
- one server-owned public room: everyone receives the same round and deadlines;
- server-delivered, phase-aware question payloads: the browser never imports the playable answer catalog;
- per-round crowd results with server-enforced deadlines and duplicate-vote protection;
- Postgres-backed production votes and calibration, with a zero-config local file fallback;
- stable question revisions that preserve unchanged calibration history across content releases;
- expiring raw round votes while durable per-question answer and report aggregates remain available;
- reveal question reports for incorrect, outdated, ambiguous, or unclear content, with an opened report carrying into the next round and deduplicated per anonymous player;
- a responsive calibration lab at `/calibration`, with Steam-protected reviewed/quarantined states and automatic reopening when new reports arrive;
- ephemeral live-room presence plus a Steam-protected `/ops` dashboard for visits, return rate, rounds per visit, and format health;
- proper social preview metadata for links pasted outside the app;
- a five-second room poll plus deadline wakeups so every browser stays on the same round;
- keyboard controls, responsive layouts, persistent mute and master volume, sound cues, and local lifetime stats;
- optional Steam OpenID profiles with cross-browser accuracy, streaks, best-ten records, early solves, and per-format mastery;
- server-recorded connected results, 30-day hashed sessions, a plain-language privacy page, and self-service profile deletion;
- a reproducible data sync and validation pipeline;
- recoverable application error screens and privacy-safe client/server error fingerprints in structured host logs;
- a readiness endpoint, standalone production container, basic API throttles, and Postgres-backed CI.

## Shared difficulty pool

Difficulty remains question metadata, not a room choice. Every player receives the same approachable,
intermediate, and demanding rounds on a 15-second clock. The deterministic scheduler uses those hidden tiers to vary
the cadence and prevent several easy questions in a row; calibration can later replace the seed tiers with observed
answer rates without fragmenting the room.

Fogged Vision uses one tuned portrait curve for everyone and retains fog through the final stage.

Soundcheck alternates between ability sounds and item activations, mixing iconic cues, single deep cuts, and ordered
two-sound rounds. Each third of the clock unlocks and replays a longer cut: two tiny prefixes, then the complete effect.
Sequence answers are compact icon pairs:
recognizing only one clip still leaves two plausible choices. Each cut plays once automatically, while persistent
mute and volume controls apply to clips and interface cues alike. Fresh profiles start at 70% volume; a level still at
the retired 10% default is raised to 70% once, while other explicitly chosen levels remain unchanged.

Spell Link's hidden seed tier is reproducible: core/iconic abilities are approachable, unusual sub-abilities, innates,
upgrades, and helper abilities are demanding, and the remaining edge cases sit between them. The second clue reveals an
ability name for approachable questions and only mechanic tags for harder ones. Distractor similarity considers primary
attribute, attack type, range, and shared roles. Once the project has durable vote history, observed correct-answer
rates should supersede this seed heuristic.

## Why this version

Valve introduced Queue Trivia with The International 2017 Battle Pass. The official description called out rotating Dota questions, global competition, and double points when most players chose the wrong answer. It remained in later Battle Passes through 2022, then disappeared with that event model.

There are still adjacent projects, but they serve different loops:

- [Dotadle](https://dotadle.net/) is a daily hero-guessing game.
- [Dota2Quiz](https://www.dota2quiz.com/) recreates Shopkeeper item modes.
- [Dota 2 IQ](https://dota2iq.com/en) focuses on itemization and awareness training.
- Rift Oracle is an offline mobile ten-question quiz.
- Dota Slash describes itself as multiplayer Dota trivia, but its public site currently has an expired TLS certificate and is not a dependable replacement.

The missing niche is the old drop-in queue loop: rapid rounds, current game knowledge, and a crowd split after every answer. Queue Arcade keeps that loop and adds interactions that feel different without becoming too involved to abandon when a match appears.

## Run it

```bash
pnpm install
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000).

Votes and question reports default to `.data/queue-arcade-votes.json`, which is intentionally ignored by Git. Set `DATABASE_URL` to use Postgres. Development can initialize the schema automatically; production requires `pnpm db:migrate` with a migration role before startup. Anonymous player IDs are salted and hashed before persistence. Production requires separate private `ARCADE_VOTER_SALT` and `ARCADE_AUTH_SECRET` values of at least 32 characters each.

Steam connection is optional. Anonymous players can enter the public arcade immediately and keep browser-local lifetime
stats. A connected player receives the same public rounds, but accepted answers are also recorded against an internal
Queue Arcade account so personal records survive another browser. Steam OpenID verifies only the SteamID; Queue Arcade
never receives a Steam password. `STEAM_WEB_API_KEY` enables the official API for public names and avatars.
Without that key, profile enrichment still uses public Steam Community XML when available.

## Production alpha

The repository includes a non-root standalone `Dockerfile` and a manual-deploy
[Render test-service Blueprint](render.yaml). Use one application instance with Postgres.
Private rooms, chat, and presence live in process memory and end when that process restarts.
The launch checks verified the existing Render database, restored its backup locally,
applied the reviewed migrations, and configured a restricted application role. See the
[hosting record](docs/audits/2026-10-06/launch-checks/hosting/README.md) for deployment status.

Follow [deployment and operations](docs/operations.md) before launch. That guide covers
separate migration/runtime roles, secret setup, backups and restore drills, cleanup, edge
limits, alerts, and rollback. Copy variable names from [`.env.example`](.env.example) into
the host's secret environment; production commands read exported variables. Run
`pnpm db:migrate` with migration credentials, then `pnpm check:config` and `pnpm start` with
runtime credentials. Startup rejects invalid configuration before listening. Keep
`ARCADE_AUTO_MIGRATE=false` for a runtime role without schema privileges.

`DATABASE_POOL_SIZE` defaults to 5. Raw votes and rounds expire after two hours by default;
alpha sessions expire after 30 days. A worker cleans expired data every minute while the
app runs. Sleeping or stopped hosts need an independent `pnpm db:cleanup` job. Question
aggregates, reports, and saved account results persist separately. Postgres is the supported
public deployment backend. File storage requires an explicit `ARCADE_ALLOW_FILE_STORE=true`
exception, persistent disk, and one process. Setting `DATABASE_URL` does not import JSON data.

Use `GET /api/health` for readiness. It verifies production configuration, the migrated
schema, and all durable stores, and reports the active content version without secrets.
Set `ARCADE_APP_URL` to the canonical HTTPS origin used for Steam login and social metadata.
`ARCADE_DATA_COUNTRIES` is shown on `/privacy`; include actual storage and backup countries.
A [Steam Web API key](https://steamcommunity.com/dev/apikey) is optional and stays server-side.

API mutations require a same-origin `Origin` or `Referer`. Guest and source limits are
process-local. Explicit `ARCADE_TRUST_PROXY=none` ignores forwarded addresses and uses a
shared conservative address budget. Public startup rejects an omitted policy. Enable
`cf-connecting-ip`, `x-real-ip`, or `x-forwarded-for` only after the
[hosted ingress check](docs/ingress-verification.md) proves that the edge controls it.
Recheck that policy after any hosting or proxy change.

`ARCADE_REVIEWER_STEAM_IDS` accepts comma- or space-separated 17-digit SteamID64 values. Signed-in reviewers can mark
an open calibration signal as reviewed or quarantined. A reviewed question automatically returns to the queue when it
receives another report or its difficulty signal changes. Quarantine remains an explicit release decision and never
silently removes a question from the running room.

The same reviewer allowlist protects `/ops`. It shows aggregate alpha visits, unique and returning player counts, rounds
per visit, and current-revision format accuracy/report rates. It never exposes a player hash or
individual answer. The “playing now” number is an in-memory 45-second pulse and is not written to storage.

Unhandled server failures and sanitized browser failures are emitted as structured host logs with a release identifier
and stable fingerprint. Browser diagnostics contain only an error type, page path, fingerprint, and optional framework
digest—never error text, stack traces, query strings, or player identifiers. The app shows a retry screen instead of a
blank page when a React render fails.

Connected sessions are represented by random HttpOnly, SameSite cookies; only a one-way token hash is stored. Deleting
the profile cascades through the Steam identity, active sessions, personal round results, and linked alpha visits. Public
profile responses omit the internal question IDs and revision keys retained for server-side auditing. Public leaderboards
remain intentionally excluded from this alpha. Questions and marked answers are now server-delivered by
phase. Answer-sensitive audio and Fogged Vision images use current-round routes that hide upstream filenames.
A determined player can still harvest completed reveals and exploit the deterministic schedule. Personal records are calculated from server-accepted synchronized votes rather
than a client-submitted result.

The CI workflow is configured to install native media tools, validate the reviewed content, test and build
the app, scan and start the actual Docker image against disposable Postgres, and check
browser flows, native audio output, headers, runtime social metadata, multiplayer, and
cleanup packaging. Require its `verify` result before releasing. The
[launch CI record](docs/audits/2026-10-06/launch-checks/ci/README.md) distinguishes workflow
configuration from completed runs and names the tested revision.

## Refresh the Dota data

Names and artwork mappings are generated from OpenDota, while playable facts are checked against a current Dota client:

```bash
DOTA_PATCH=7.41f DOTA_SNAPSHOT_DATE=2026-09-15 pnpm sync-data
pnpm sync-soundcheck
pnpm sync-shopkeeper -- --items-cache=/path/to/opendota-items.json --client-root=/path/to/decompiled-client
pnpm validate-data
pnpm validate-assets
```

The data generators write:

- `src/data/questions.generated.json`
- `src/data/trivia-meta.generated.json`
- `src/data/soundcheck-questions.json`
- `src/data/shopkeeper-questions.json`
- `src/data/value-order-questions.json`
- `src/data/aghanim-questions.json`

The sync uses OpenDota for localized metadata and artwork, and Dotabase for hero-response metadata and playable audio
paths. The October review checked all 1,517 live questions against current Valve data, dated primary historical
sources, pinned response metadata and measured audio samples. Its [per-question index](docs/audits/2026-10-06/deep-review/question-review-index.json)
records the evidence and limits. All 219 audio questions still need a human listening pass. The 72 retired recipe rows
remain outside the live catalog and were not fact-checked in this pass.

The existing build 6882 extract and reviewed patch deltas provide a separate numeric check. Its original installation
provenance is unproven, so it is not a fresh installed-client certificate. `scripts/client-constant-audit.mjs` records
the differences; `scripts/audit-live-client.mjs` reruns 1,038 marked-answer checks against that pinned source:

```bash
DOTA_CLIENT_AUDIT_ROOT=/path/to/decompiled-client pnpm audit:client
```

Shopkeeper generation reads names and artwork from the matching OpenDota item snapshot, but derives every recipe from
the audited client `items.txt`. Its 102-round deck covers Build Result, Real Recipe, Shared Part, and Upgrade Path.
Real Recipe uses the full Dota shop as a three-slot, duplicate-safe recipe builder while keeping the marked
components server-side until reveal; Upgrade Path also uses the full shop and keeps its direct upgrade hidden until
reveal; and Shared Part accepts exactly one direct intersection. The old single-component and random reverse-recipe
templates remain excluded by the playable quality gates.

Aghanim's Lab is generated from the compact, reviewed `src/data/aghanim-upgrades.json` catalog. Its 84 questions cover
44 Scepter and 40 Shard upgrades across 84 unique heroes. Validation checks the matching 7.41e client upgrade flags,
prevents the opening effect from naming its hero, item, or ability, and keeps every later clue and marked answer on the
server until its reveal stage.

The pipeline checks every referenced image and audio clip, rejects questions whose assets are unavailable, filters
hero-name leaks and laugh-heavy/noise responses, blocks generated clues that leak their answer, caps timed prompts at
12 words, rejects duplicate rounds and tied comparisons, and balances correct answers across A–D per format. Damage
trivia is fail-closed through `scripts/damage-question-facts.mjs`, because Valve's generic `DAMAGE:` header can mean
direct damage, DPS, a percentage, or one conditional part of a spell. `validate-assets` can rerun the remote checks
against the committed deck. Set the patch and snapshot date deliberately after checking the current official gameplay
patch; the content pack is explicitly patch-stamped in the UI.

The retired Map Sense and Counterplay prototypes remain preserved but are not exposed in the lobby, included in the
public rotation, or maintained by the normal release and asset checks. Legacy mode values are normalized into the one
Queue Arcade room and cannot resurrect either prototype. Map Sense lives in
`src/lib/map-sense.ts` and `src/data/map-sense-*.json`; Counterplay lives in `src/data/counterplay-questions.json`,
`scripts/generate-counterplay.mjs`, and `scripts/counterplay-audit.mjs`. Run `pnpm validate-map-archive` or
`pnpm validate-counterplay-archive` when deliberately working on either archived experiment.

Soundcheck's reviewed event-to-file mappings live in `scripts/soundcheck-audit.mjs`. The generator resolves names and
icons from current OpenDota constants, verifies each named sound event against the decompiled client event file, and
checks the browser-ready WAV before writing the deck. Its independent validator enforces exact audit agreement,
ability/item balance, difficulty coverage, same-family visual choices, unique option sets, compact prompts, and even
answer-slot distribution. Higher-tier generation additionally rejects mixed-hero ability choices, passive answer
elimination, non-active item sets, unaudited sequence clips, and ordered pairs that can be solved from only one sound.

## Verify it

With `pnpm dev` running, use `pnpm check:sounds` for feedback sound changes. It opens its own muted Chrome,
uses real mouse and keyboard input, and checks both native PulseAudio output and decoded Web Audio samples. Install Chrome, ffmpeg, `pulseaudio`, and `pulseaudio-utils` on the test host. It covers
Shopkeeper recipe steps, all four Shopkeeper question types, Fogged Vision, Spell Link, four-choice trivia,
Order Up, and Flashback ordering. It also tests closely timed picks/results, hidden tabs, and mute.
Before the real checks, it proves that forced silence and cut-off clips fail even when `play()` succeeds.
All API calls are served inside the test browser; it does not write votes or sessions to the app.
Set `APP_URL` or `CHROME_BIN` to use another local server or Chrome binary.
See [the sound diagnosis and test limits](docs/feedback-sounds.md).

```bash
pnpm check
```

That first checks the committed content-review manifest, then validates the question deck, template rotation, answer balance, scan length, and visual/audio metadata, runs the vitest unit suite (`pnpm test`: scoring, crowd splits, rate limits, calibration, reviews, revisions, diagnostics, party rooms, room sync, Spell Link redaction, and interface copy), runs ESLint, runs strict TypeScript checking, creates an optimized production build, proves no private catalog data reached a browser bundle, and then runs the headless-Chrome and API click-throughs in `pnpm check:ui` (public play, party lobby, party audio and membership, one party round per format checking copy, controls, and reveals, reports, shop and hero-grid search with Enter picking the only match, Flashback, feedback sounds, and production rate limits).

The UI gate also runs touch, recovery, account-switch and responsive checks. `pnpm check:responsive` tests 31 answer variants at 11 sizes from 320px to 4K. `pnpm check:journeys` runs 54 player journeys. Install the pinned browser engines with `pnpm exec playwright install --with-deps chromium firefox webkit`, then run `pnpm check:accessibility` against an isolated `APP_URL`. Set `BROWSER_ENGINE=firefox` or `BROWSER_ENGINE=webkit` for the other engines. CI runs all three. Browser emulation does not replace physical-device or screen-reader testing.

`pnpm check:capacity` requires `CAPACITY_ISOLATED=1`, a separate local server/store, and the test proxy configuration documented in the script. Its default is four players and two rounds. The audited full run used 466 players. Run capacity tests separately from UI checks so synthetic users do not share rate-limit budgets. See the [load report](docs/audits/2026-10-06/deep-review/capacity/README.md).

With the development server running, use `pnpm check:multiplayer` to create anonymous test clients. It verifies shared
round IDs and deadlines, sanitized answering payloads, hidden pre-reveal results, concurrent votes, duplicate rejection, the shared reveal, disk
persistence, hashed voter IDs, Steam OpenID state boundaries, account/alpha-store readiness, reveal-only report submission,
report deduplication, aggregate-only calibration data, and that obsolete mode, level, or category values cannot split
the public room. Against Postgres, it additionally seeds a reviewer session, verifies unauthorized review rejection plus
reviewed/quarantined persistence and automatic reopening, proves a forged browser player ID cannot double vote, checks
the stored personal record and profile summary, tests protected alpha ops plus visit persistence, and verifies deletion cascades.

With Chrome running on remote-debugging port `9222`, `pnpm check:resume` deliberately stalls a reveal-phase room request
and freezes the page across another deadline. It verifies both recoveries advance without focus, mouse movement, or any
player input.

For visual smoke testing, start Chrome with `--mute-audio` and a debugging port, then run
`node scripts/visual-smoke.mjs`. The script disables media playback again inside the page before loading anything, then
checks the one-room lobby, social metadata, fixed-size account entry, guest profile, privacy page and private ops gate, `/play` navigation, browser Back and
Forward, legacy-mode redirect, ten compact round identities, synchronized answering/reveal/automatic-advance journey, reveal-only crowd splits,
full-catalog 127-hero and 182-item result stress cases plus all 24 possible four-card orders,
the three-stage Aghanim's Lab hero-picker layout, no-shift question-report popover, the optional session summary, the 70% fresh-install volume default, mobile lobby, mobile calibration layout, overflow, and saves screenshots
under `/tmp`.

## Crowd architecture

Each game catalog and content version owns exactly one public room. Room IDs are explicitly namespaced as `<game>:<content-version>:public`, so future content revisions and game packs cannot collide with their questions or statistics. `/api/rounds` uses a fixed epoch and deterministic question batches to calculate the current server-owned question, answer deadline, and reveal deadline. That means restarts require no timer recovery and a replacement server calculates the same public timeline when it runs the same question snapshot and configuration. This does not make private rooms or process-local limits safe across multiple instances.

`/api/rounds` converts the private catalog entry into an explicit public payload. During answering it omits the internal
question ID, marked answer, explanation, source/audit metadata, hidden Shopkeeper keys, Order Up values, and locked progressive clues. The
reveal payload adds only the marked answer, explanation, and any opaque answer key or values needed to render the result. A
phase-aware revision lets unchanged heartbeats omit the question payload; most rounds are sent once for answering and once
for reveal, while progressive rounds receive a new payload when each server-timed clue unlocks.

`/api/votes` only accepts a round ID before its server deadline and resolves the corresponding private question itself.
Votes are keyed by round ID, so a repeated question gets a fresh split, and answer counts remain hidden until the room
enters its reveal phase. `/api/reports` similarly resolves the reportable current or previous round instead of trusting a
browser-supplied question ID. It opens with the reveal and keeps the just-finished question reportable for a 20-second
rollover grace period. The browser corrects for server clock offset and schedules exact phase and progressive-clue
refreshes. A five-second recovery heartbeat plus focus, visibility, page-resume, and network wakeups repair missed timers.

Remote Steam artwork bypasses the application image proxy, the compact app icon replaces the former multi-size ICO, and
stable local Dota feedback cues carry a 30-day browser cache policy. Answer-sensitive Echo Hunt and Soundcheck audio remains
behind the current-round private proxy so its upstream filename cannot reveal an answer before the deadline.

First-time room entry is gated separately from the shared clock. A player joins the active question when at least eight seconds remain; otherwise the client holds on a synchronized countdown and begins with the next full round. Existing players never pause or leave the global timeline.

The local persistent store is an atomic JSON file suited to development and a single long-running Node instance with a persistent disk. Public deployments use transactional Postgres when `DATABASE_URL` is configured and migrations have been applied. This selects a different store; it does not migrate local JSON data. Raw per-round votes expire independently from durable question aggregates. Calibration keys include a stable fingerprint of the playable prompt, choices, marked answer, clues, and assets, so an unchanged question keeps its history across room releases while an edited question starts cleanly. `/calibration` never exposes voter hashes. It waits for 20 answers before suggesting that a question looks too easy or too hard. Reports and sampled difficulty outliers open the review queue; allowlisted Steam reviewers can mark a signal reviewed or quarantined, and a reviewed signal reopens when new evidence arrives. None of those states silently changes the live deck.
Public calibration responses also replace answer-bearing catalog IDs with their opaque revision fingerprints. Allowlisted
reviewers receive the internal IDs only after their Steam session is verified, because those IDs are needed for explicit
review and quarantine writes.

## Useful next steps

1. Add the maintainer SteamID to `ARCADE_REVIEWER_STEAM_IDS`, then work the first real report and difficulty signals.
2. Run a concentrated public soft launch, then review `/ops` after the first real sessions.
3. Collect public-alpha samples and watch structured error fingerprints by release in the deployment logs.
4. Review ordered-pair accuracy, then expand Soundcheck with carefully audited channel and announcer families.
5. Design protection against replaying harvested answers before considering competitive rankings.
6. Implement a second game's content pack only after the Dota public loop proves sticky.

## Attribution

Question names and artwork mappings are generated from [OpenDota](https://docs.opendota.com/); the review checks marked answers and numeric constants against current Valve API data, official patch notes and a pinned client extract. Hero-response metadata, browser-ready Soundcheck WAVs, and every audible arcade UI cue are sourced through [Dotabase](https://github.com/mdiller/dotabase). Queue Trivia's original answer click, the layered matchmaking-start event, the legacy `challenge_success` sting, and `General.InvalidTarget_Invulnerable` (“meep merp”) are independently checked against the installed client; the runtime synthesizes no substitute tones. Game assets are served from public Dota asset hosts. Steam connection uses Valve's OpenID provider and an inline Steam brand mark. The archived Map Sense terrain artwork comes from [OpenDota's public map archive](https://github.com/odota/web/tree/master/public/assets/images/dota2/map), with its historical objective changes checked against [Valve's 7.41 notes](https://www.dota2.com/patches/7.41). Archived Counterplay outcomes were checked against the matching client and mechanics sources. Dota 2 and its assets are trademarks of Valve Corporation. This fan project is not affiliated with or endorsed by Valve.

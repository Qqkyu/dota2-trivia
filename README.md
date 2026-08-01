# Queue Arcade

An unofficial browser arcade made for the gap between **Find Match** and **Accept**. Dota 2 is its first content pack: the project began as a recreation of Valve's old Queue Trivia and now rotates seven named round identities inside one endless public arcade:

- **Classic Trivia** — mana, cooldowns, damage, stat comparisons, and item prices;
- **Shopkeeper Rush** — build finished items, spot exact recipes, find shared parts, and trace upgrade paths;
- **Spell Link** — match an ability to its hero while timed clues unlock;
- **Fogged Vision** — identify a hero while its portrait clears through three fixed-layout stages;
- **Echo Hunt** — identify a hero from two terse voice fragments before the complete response unlocks;
- **Soundcheck** — identify verified effects through three growing audio cuts, including ordered two-sound sequences;
- **Quote Hunt** — match a substantial written hero response to its speaker.

These are round formats, not separate queues. Everyone shares the parts that made the original compelling: short timed rounds, a global answer reveal, speed and streak scoring, and double points when you are right while most of the crowd is wrong.

The playable MVP includes:

- endless, instantly interruptible arcade sessions with automatic round transitions;
- canonical `/` lobby and `/play` session URLs with direct loading plus browser Back and Forward support;
- one shared public room of 15-second rounds, without mode, category, or player-facing difficulty queues;
- 645 live prompts for Dota patch 7.41d, including 48 Shopkeeper rounds and 48 Soundcheck rounds;
- item, hero, and ability artwork for visual answer rounds;
- 44 remotely verified Echo Hunt clips, 48 Soundcheck rounds built from 60 audited clips, and 43 Quote Hunt lines sourced through Dotabase;
- live-client answer audits plus balanced A–D placement for every generated question family;
- progressive Spell Link clues at two-thirds and one-third time remaining;
- a deterministic ten-format cadence that gives Classic three slots, Shopkeeper two, every distinctive sensory format one, and never repeats a family back-to-back;
- visible speed scoring, explicit hint penalties, difficulty bonuses, streaks, and majority-wrong scoring;
- one server-owned public room: everyone receives the same round and deadlines;
- per-round crowd results with server-enforced deadlines and duplicate-vote protection;
- Postgres-backed production votes and calibration, with a zero-config local file fallback;
- stable question revisions that preserve unchanged calibration history across content releases;
- expiring raw round votes while durable per-question answer and report aggregates remain available;
- reveal question reports for incorrect, outdated, ambiguous, or unclear content, with an opened report carrying into the next round and deduplicated per anonymous player;
- a responsive calibration lab at `/calibration`, with Steam-protected reviewed/quarantined states and automatic reopening when new reports arrive;
- ephemeral live-room presence plus a Steam-protected `/ops` dashboard for visits, return rate, rounds per visit, fixed feedback, and format health;
- a compact Web Share/copy-link action and a proper social preview card;
- optional Pusher broadcasts between connected browsers, with automatic polling as the zero-config fallback;
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
recognizing only one clip still leaves two plausible choices. Every sequence can be replayed freely, while persistent
mute and volume controls apply to clips and interface cues alike.

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

Pusher is optional. Copy `.env.example` to `.env.local` and add a Pusher Channels app if you want participation totals broadcast immediately to every connected browser. Without it, clients poll the server and the synchronized game still works.

Votes and question reports default to `.data/queue-arcade-votes.json`, which is intentionally ignored by Git. Set `DATABASE_URL` to use the production Postgres store; the application creates its Queue Arcade tables on the first readiness check. Anonymous player IDs are salted and hashed before persistence, and production requires a private `ARCADE_VOTER_SALT`.

Steam connection is optional. Anonymous players can enter the public arcade immediately and keep browser-local lifetime
stats. A connected player receives the same public rounds, but accepted answers are also recorded against an internal
Queue Arcade account so personal records survive another browser. Steam OpenID verifies only the SteamID; Queue Arcade
never receives a Steam password. Set `STEAM_WEB_API_KEY` only if you want to enrich profiles with the player's current
public Steam name and avatar.

## Production alpha

The repository includes a standalone multi-stage `Dockerfile`. A production deployment should provide:

```bash
DATABASE_URL=postgres://...
ARCADE_VOTER_SALT=a-long-private-random-value
ARCADE_APP_URL=https://arcade.example
ARCADE_AUTH_SECRET=a-separate-long-private-random-value
ARCADE_DATA_COUNTRIES=Poland
ARCADE_REVIEWER_STEAM_IDS=7656119xxxxxxxxxx
```

`DATABASE_POOL_SIZE` defaults to 5. `ARCADE_ROUND_RETENTION_HOURS` defaults to 2: expired raw rounds and their voter hashes are deleted, while question-level accuracy and deduplicated reports remain. Alpha visits contain only salted player/session hashes, timestamps, round/correct totals, and one optional fixed feedback value; they expire after 30 days. A single long-running instance with a persistent disk can deliberately retain the file backend by setting `ARCADE_ALLOW_FILE_STORE=true`, but Postgres is the supported public-alpha path.

Use `GET /api/health` as the deployment readiness check. It verifies production configuration, initializes and queries
the vote, account, and alpha stores, and reports the active content version without exposing secrets. `ARCADE_APP_URL` must be
the canonical HTTPS origin used in Steam's return URL. `ARCADE_DATA_COUNTRIES` is displayed in `/privacy`, as required
when Steam-linked data is stored. The authentication secret must be at least 32 characters and distinct from the voter
salt. A standard [Steam Web API key](https://steamcommunity.com/dev/apikey) is optional and stays server-side; when it is
absent, authenticated profiles use a generic Steam-player label. The vote, report, room, and Steam authentication APIs
also apply per-player or per-IP in-process guardrails; a public host should add IP-level throttling at its edge.

`ARCADE_REVIEWER_STEAM_IDS` accepts comma- or space-separated 17-digit SteamID64 values. Signed-in reviewers can mark
an open calibration signal as reviewed or quarantined. A reviewed question automatically returns to the queue when it
receives another report or its difficulty signal changes. Quarantine remains an explicit release decision and never
silently removes a question from the running room.

The same reviewer allowlist protects `/ops`. It shows aggregate alpha visits, unique and returning player counts, rounds
per visit, fixed session feedback, and current-revision format accuracy/report rates. It never exposes a player hash or
individual answer. The “playing now” number is an in-memory 45-second pulse and is not written to storage.

Unhandled server failures and sanitized browser failures are emitted as structured host logs with a release identifier
and stable fingerprint. Browser diagnostics contain only an error type, page path, fingerprint, and optional framework
digest—never error text, stack traces, query strings, or player identifiers. The app shows a retry screen instead of a
blank page when a React render fails.

Connected sessions are represented by random HttpOnly, SameSite cookies; only a one-way token hash is stored. Deleting
the profile cascades through the Steam identity, active sessions, personal round results, and linked alpha visits. Public leaderboards are
intentionally excluded from this alpha: the browser currently ships the playable question catalog, so a public ranking
would reward scripting. Personal records are still calculated from server-accepted synchronized votes rather than a
client-submitted score.

Every push and pull request runs the full build in GitHub Actions, boots the production server against Postgres 17, and
exercises synchronized rounds, hidden results, duplicate votes, reports, protected calibration review transitions,
stable question revisions, Steam-state rejection, account sessions, personal-result idempotency, protected alpha ops,
hashed visit summaries, fixed feedback, and cascading profile deletion.

## Refresh the Dota data

Names and artwork mappings are generated from OpenDota, while playable facts are checked against a current Dota client:

```bash
DOTA_PATCH=7.41d DOTA_SNAPSHOT_DATE=2026-07-29 pnpm sync-data
pnpm sync-soundcheck
pnpm sync-shopkeeper -- --items-cache=/path/to/opendota-items.json --client-root=/path/to/decompiled-client
pnpm validate-data
pnpm validate-assets
```

The sync writes:

- `src/data/questions.generated.json`
- `src/data/trivia-meta.generated.json`
- `src/data/soundcheck-questions.json`
- `src/data/shopkeeper-questions.json`

The sync uses OpenDota for localized metadata and artwork, and Dotabase for hero-response metadata and playable audio
paths. Because third-party constants can lag behind a patch, every generated ownership, mana, cooldown, damage, hero
stat, item-price, and recipe answer was independently compared with the installed 7.41d client build 6872. The
differences are explicit in `scripts/client-constant-audit.mjs`; generation refuses unaudited patch numbers instead of
silently trusting stale values. `scripts/audit-live-client.mjs` reruns 775 marked-answer checks against decompiled client
constants:

```bash
DOTA_CLIENT_AUDIT_ROOT=/path/to/decompiled-client pnpm audit:client
```

Shopkeeper generation reads names and artwork from the matching OpenDota item snapshot, but derives every recipe from
the audited client `items.txt`. Its 48-round deck is split evenly between Build Result, Real Recipe, Shared Part, and
Upgrade Path. Real Recipe distractors swap exactly one component; Shared Part accepts exactly one direct intersection;
and Upgrade Path rejects any distractor whose full build tree contains the shown item. The old single-component and
random reverse-recipe templates remain excluded by the playable quality gates.

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

```bash
pnpm check
```

That validates the question deck, template rotation, answer balance, scan length, and visual/audio metadata, runs ESLint, runs strict TypeScript checking, and creates an optimized production build.

With the development server running, use `pnpm check:multiplayer` to create anonymous test clients. It verifies shared
round IDs and deadlines, hidden pre-reveal results, concurrent votes, duplicate rejection, the shared reveal, disk
persistence, hashed voter IDs, Steam OpenID state boundaries, account/alpha-store readiness, reveal-only report submission,
report deduplication, aggregate-only calibration data, and that obsolete mode, level, or category values cannot split
the public room. Against Postgres, it additionally seeds a reviewer session, verifies unauthorized review rejection plus
reviewed/quarantined persistence and automatic reopening, proves a forged browser player ID cannot double vote, checks
the stored personal record and profile summary, tests protected alpha ops plus visit/feedback persistence, and verifies deletion cascades.

For visual smoke testing, start Chrome with `--mute-audio` and a debugging port, then run
`node scripts/visual-smoke.mjs`. The script disables media playback again inside the page before loading anything, then
checks the one-room lobby, share metadata/action, fixed-size account entry, guest profile, privacy page and private ops gate, `/play` navigation, browser Back and
Forward, legacy-mode redirect, seven compact round identities, synchronized answering/reveal/automatic-advance journey,
no-shift question-report popover, optional session feedback, session report, mobile lobby, mobile calibration layout, overflow, and saves screenshots
under `/tmp`.

## Crowd architecture

Each game catalog and content version owns exactly one public room. Dota rooms are explicitly namespaced like `dota2:7.41d-variety-6-classic-trivia-4-shopkeeper-2-public-arcade-1-soundcheck-8:public`, so future content revisions and game packs cannot collide with their questions or statistics. `/api/rounds` uses a fixed epoch and deterministic question batches to calculate the current server-owned question, answer deadline, and reveal deadline. That means restarts require no timer recovery and multiple servers calculate the same timeline as long as they run the same question snapshot and configuration.

`/api/votes` only accepts the current room's question before its server deadline. Votes are keyed by round ID, so a repeated question gets a fresh split, and answer counts remain hidden until the room enters its reveal phase. `/api/reports` opens with the reveal and keeps the just-finished question reportable for a 20-second rollover grace period. It stores one reason per hashed player and content-versioned question. The browser corrects for server clock offset, polls once per second, resynchronizes on focus, and uses optional Pusher events to surface participation immediately.

The local persistent store is an atomic JSON file suited to development and a single long-running Node instance with a persistent disk. Public deployments switch automatically to transactional Postgres when `DATABASE_URL` is configured. Raw per-round votes expire independently from durable question aggregates. Calibration keys include a stable fingerprint of the playable prompt, choices, marked answer, clues, and assets, so an unchanged question keeps its history across room releases while an edited question starts cleanly. `/calibration` never exposes voter hashes. It waits for 20 answers before suggesting that a question looks too easy or too hard. Reports and sampled difficulty outliers open the review queue; allowlisted Steam reviewers can mark a signal reviewed or quarantined, and a reviewed signal reopens when new evidence arrives. None of those states silently changes the live deck. Pusher distributes updates but is never the source of truth.

## Useful next steps

1. Add the maintainer SteamID to `ARCADE_REVIEWER_STEAM_IDS`, then work the first real report and difficulty signals.
2. Share the production lobby with 5–15 Dota players, then review `/ops` after the first few sessions.
3. Collect public-alpha samples and watch structured error fingerprints by release in the deployment logs.
4. Review ordered-pair accuracy, then expand Soundcheck with carefully audited channel and announcer families.
5. Prototype one low-reading interaction such as ordering four audited Dota values.
6. Implement a second game's content pack only after the Dota public loop proves sticky.

## Attribution

Question names and artwork mappings are generated from [OpenDota](https://docs.opendota.com/); marked answers and numeric constants are independently audited against the installed client. Hero-response metadata, browser-ready Soundcheck WAVs, and every audible arcade UI cue are sourced through [Dotabase](https://github.com/mdiller/dotabase). Queue Trivia's original answer click, the layered matchmaking-start event, the legacy `challenge_success` sting, and `General.InvalidTarget_Invulnerable` (“meep merp”) are independently checked against the installed client; the runtime synthesizes no substitute tones. Game assets are served from public Dota asset hosts. Steam connection uses Valve's OpenID provider and an inline Steam brand mark. The archived Map Sense terrain artwork comes from [OpenDota's public map archive](https://github.com/odota/web/tree/master/public/assets/images/dota2/map), with its historical objective changes checked against [Valve's 7.41 notes](https://www.dota2.com/patches/7.41). Archived Counterplay outcomes were checked against the matching client and mechanics sources. Dota 2 and its assets are trademarks of Valve Corporation. This fan project is not affiliated with or endorsed by Valve.

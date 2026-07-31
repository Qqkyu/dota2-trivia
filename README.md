# Queue Arcade

An unofficial browser arcade made for the gap between **Find Match** and **Accept**. Dota 2 is its first content pack: the project began as a recreation of Valve's old Queue Trivia and now wraps that loop around nine fast minigames:

- **Queue Trivia** — facts, comparisons, odd-one-out rounds, reverse recipes, and ability detective prompts;
- **Shopkeeper Rush** — finish item recipes by finding the missing component;
- **Spell Link** — match an ability to its hero while timed clues unlock;
- **Fogged Vision** — identify a hero while its portrait clears through three fixed-layout stages;
- **Echo Hunt** — identify a hero from two terse voice fragments before the complete response unlocks;
- **Soundcheck** — identify verified effects through three growing audio cuts, including ordered two-sound sequences;
- **Quote Hunt** — match a substantial written hero response to its speaker;
- **Map Sense** — read map calls, block camps, follow current stack guides, and solve compact battlefield decisions;
- **Counterplay** — solve BKB, dispel, Nullifier, Linken's, and Lotus interactions from short icon-led matchups;
- **Mixed Arcade** — repeats a shuffled nine-round cycle, guaranteeing every game appears exactly once per cycle.

Every mode shares the parts that made the original compelling: short timed rounds, a shared answer reveal, speed and streak scoring, and double points when you are right while most of the crowd is wrong.

The playable MVP includes:

- endless, instantly interruptible arcade sessions with automatic round transitions;
- one shared 15-second question pool per mode, without player-facing difficulty queues;
- 1,083 prompts across 34 formats for Dota patch 7.41d, including 236 Map Sense challenges and 62 Counterplay matchups;
- item, hero, and ability artwork for visual answer rounds;
- 44 remotely verified Echo Hunt clips, 48 Soundcheck rounds built from 60 audited clips, and 43 Quote Hunt lines sourced through Dotabase;
- live-client answer audits plus balanced A–D placement for every generated question family;
- progressive Spell Link clues at two-thirds and one-third time remaining;
- deterministic template- and difficulty-aware scheduling, so large numeric pools cannot drown out distinctive formats or create long runs of trivial questions;
- visible speed scoring, explicit hint penalties, difficulty bonuses, streaks, and majority-wrong scoring;
- server-owned public rooms: everyone with the same mode and trivia filter receives the same round and deadlines;
- per-round crowd results with server-enforced deadlines and duplicate-vote protection;
- server-scored Map Sense pins plus synchronized A–D mechanic rounds, with coordinates and answer splits hidden until reveal;
- disk-backed vote history that survives Node server restarts and records per-question accuracy data;
- reveal question reports for incorrect, outdated, ambiguous, or unclear content, with an opened report carrying into the next round and deduplicated per anonymous player;
- a responsive calibration lab at `/calibration`, with report triage and difficulty recommendations only after 20 answers;
- optional Pusher broadcasts between connected browsers, with automatic polling as the zero-config fallback;
- keyboard controls, responsive layouts, persistent mute and master volume, sound cues, and local lifetime stats;
- a reproducible data sync and validation pipeline.

## Shared difficulty pool

Difficulty remains question metadata, not a room choice. Every player in a mode receives the same approachable,
intermediate, and demanding rounds on a 15-second clock. The deterministic scheduler uses those hidden tiers to vary
the cadence and prevent several easy questions in a row; calibration can later replace the seed tiers with observed
answer rates without fragmenting the room.

Fogged Vision uses one tuned portrait curve for everyone and retains fog through the final stage.

Map Sense mixes seven knowledge-bearing families in one room, including broad calls, riddles, relative-position
puzzles, Camp Block, and Stack Route. The mechanic rounds use current spawn boxes and Valve's per-camp stack
arrows and timing windows. The hardest mechanic prompts stay at four words or
fewer. A three-second reading grace preserves full speed points before the bonus begins fading; pin rounds also earn a
separate center-precision bonus.

Counterplay uses six audited mechanic families: debuff immunity, basic dispels, strong-dispel-only effects, offensive
dispels, spell block, and spell reflection. Iconic interactions and less obvious status or targeting rules now rotate
through the same room. The deck is generated from explicit `bkbpierce`, `dispellable`,
and ability-behavior fields in the patch-stamped game constants. Break questions are intentionally excluded until
breakability can be verified without inference.

Soundcheck alternates between ability sounds and item activations, mixing iconic cues, single deep cuts, and ordered
two-sound rounds. Each third of the clock unlocks and replays a longer prefix; even the final cut stops before the full
clip. Sequence answers are compact icon pairs:
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

Votes and question reports default to `.data/queue-arcade-votes.json`, which is intentionally ignored by Git. Set `ARCADE_DATA_FILE` to a path on a persistent volume in production. Anonymous player IDs are salted and hashed before they reach disk; set a private `ARCADE_VOTER_SALT` to keep that hash namespace installation-specific.

## Refresh the Dota data

Names and artwork mappings are generated from OpenDota, while playable facts are checked against a current Dota client:

```bash
DOTA_PATCH=7.41d DOTA_SNAPSHOT_DATE=2026-07-29 pnpm sync-data
pnpm sync-counterplay
pnpm sync-soundcheck
pnpm validate-data
pnpm validate-assets
```

The sync writes:

- `src/data/questions.generated.json`
- `src/data/trivia-meta.generated.json`
- `src/data/counterplay-questions.json`
- `src/data/soundcheck-questions.json`

The sync uses OpenDota for localized metadata and artwork, and Dotabase for hero-response metadata and playable audio
paths. Because third-party constants can lag behind a patch, every generated ownership, mana, cooldown, damage, hero
stat, item-price, and recipe answer was independently compared with the installed 7.41d client build 6872. The
differences are explicit in `scripts/client-constant-audit.mjs`; generation refuses unaudited patch numbers instead of
silently trusting stale values. `scripts/audit-live-client.mjs` reruns 775 marked-answer checks against decompiled client
constants:

```bash
DOTA_CLIENT_AUDIT_ROOT=/path/to/decompiled-client pnpm audit:client
```

The pipeline checks every referenced image and audio clip, rejects questions whose assets are unavailable, filters
hero-name leaks and laugh-heavy/noise responses, blocks generated clues that leak their answer, caps timed prompts at
12 words, rejects duplicate rounds and tied comparisons, and balances correct answers across A–D per format. Damage
trivia is fail-closed through `scripts/damage-question-facts.mjs`, because Valve's generic `DAMAGE:` header can mean
direct damage, DPS, a percentage, or one conditional part of a spell. `validate-assets` can rerun the remote checks
against the committed deck. Set the patch and snapshot date deliberately after checking the current official gameplay
patch; the content pack is explicitly patch-stamped in the UI.

Map Sense's direct calls live in `src/data/map-sense-locations.json`; its riddle, mirror, relative-position, and scenario
packs live in `src/data/map-sense-challenges.json`; audited camp geometry, tiers, stack windows, and arrows live in
`src/data/map-sense-mechanics.json`. Coordinates and optional
reference pins are normalized from `0–1` so future terrain artwork can be replaced without changing the interaction or
storage format. `validate-data` also checks family balance, difficulty coverage, exact camp-box inclusion, stack-route
clearance, Valve stack-guide parity, coordinate bounds, reference-pin separation, and local artwork.

Counterplay's curated matchups live in `scripts/generate-counterplay.mjs`; its reviewed 7.41d truth set lives separately
in `scripts/counterplay-audit.mjs`. BKB and dispel fields were cross-checked against the installed 7.41d client build 6872,
while special Linken's and Lotus interactions were checked against the current mechanics references linked by each
question. Generation is fail-closed: every displayed ability must have an explicit audited result, every API-derived
result must agree with it, and every Lotus question must match a named scenario fixture. Linken's rounds also reject any
option set where all four casts are not plausible unit-targeted casts; Lotus rounds use prominent spell-to-item diagrams,
a three-word prompt ceiling, and three-word answer limits instead of target-type elimination.
`validate-counterplay.mjs` independently protects those facts and scenarios as well as format, family and hidden-tier
coverage, scan length, answer balance, artwork shape, and source snapshots.

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

With the development server running, use `pnpm check:multiplayer` to create anonymous test clients. It verifies shared round IDs and deadlines, hidden pre-reveal results, concurrent votes, duplicate rejection, the shared reveal, disk persistence, hashed voter IDs, reveal-only report submission, report deduplication, aggregate-only calibration data, server-scored Map Sense answers, and that obsolete saved level values cannot split public rooms.

For visual smoke testing, start muted Chrome with a debugging port and then run `node scripts/visual-smoke.mjs`. The script checks the level-free arcade lobby, Shopkeeper Rush's target/component framing, the no-shift question-report popover, Spell Link's progressive clues, all three fixed Fogged Vision stages and the next-round reset, Echo Hunt's two terse fragments and complete final line, Soundcheck's shorter three-stage cuts, ordered playback, compact icon pairs, persistent volume, mute-safe autoplay and manual replay, Quote Hunt rendering, Counterplay prompts and reveals, both interactive Map Sense mechanics plus full-map knowledge calls, synchronized automatic round advancement, the session report, desktop/mobile calibration layouts, mobile overflow, and saves screenshots under `/tmp`.

## Crowd architecture

Each game catalog, content version, mode, and optional trivia filter is a public room. Dota rooms are explicitly namespaced like `dota2:7.41d-variety-6-map-sense-9-counterplay-4-soundcheck-6:...`, so future content revisions and game packs cannot collide with their questions or statistics. `/api/rounds` uses a fixed epoch and deterministic question batches to calculate the current server-owned question, answer deadline, and reveal deadline. That means restarts require no timer recovery and multiple servers calculate the same timeline as long as they run the same question snapshot and configuration.

`/api/votes` only accepts the current room's question before its server deadline. Votes are keyed by round ID, so a repeated question gets a fresh split, and answer counts remain hidden until the room enters its reveal phase. `/api/reports` opens with the reveal and keeps the just-finished question reportable for a 20-second rollover grace period. It stores one reason per hashed player and content-versioned question. The browser corrects for server clock offset, polls once per second, resynchronizes on focus, and uses optional Pusher events to surface participation immediately.

The default persistent store is an atomic JSON file suited to local development and a single long-running Node instance with a persistent disk. It serializes concurrent writes inside the process and stores aggregate per-question answer counts and report totals for calibration. `/calibration` never exposes voter hashes. It waits for 20 answers before suggesting that a question looks too easy or too hard, while reports remain manual-review signals; neither path silently changes the live deck. For horizontal scaling or serverless deployment, replace `src/lib/vote-store.ts` with Redis or Postgres; Pusher distributes updates but is never the source of truth.

## Useful next steps

1. Move vote storage to Redis or Postgres before a horizontally scaled public deployment.
2. Review calibration bands after enough real traffic, then tune question content and distractors manually.
3. Audit breakable passives and targeted-spell exceptions before expanding Counterplay beyond its explicit constants.
4. Prototype compact lane-equilibrium, smoke-path, and ward/deward Map Sense rounds before adding another family.
5. Review ordered-pair accuracy, then expand Soundcheck with carefully audited channel and announcer families.
6. Implement a second game's questions and minigame deck against the existing game-catalog contract.
7. Add Steam sign-in, leaderboards, and streak challenges only after the anonymous loop proves fun.
8. Package it as a lightweight desktop/overlay companion for people who want it beside the real Dota queue.

## Attribution

Question names and artwork mappings are generated from [OpenDota](https://docs.opendota.com/); marked answers and numeric constants are independently audited against the installed client. Counterplay outcomes are checked against that client and the current mechanics sources attached to each question. Hero-response metadata and browser-ready Soundcheck WAVs are sourced through [Dotabase](https://github.com/mdiller/dotabase); Soundcheck event mappings are independently checked against the installed client. Game assets are served from public Dota asset hosts. The versioned Map Sense terrain artwork comes from [OpenDota's public map archive](https://github.com/odota/web/tree/master/public/assets/images/dota2/map), with objective changes checked against [Valve's 7.41 notes](https://www.dota2.com/patches/7.41). Camp positions, sides, and tiers are checked against the installed 7.41d map entity resource; every displayed stack window and arrow is checked against Valve's matching `scripts/creep_pull_timings.txt`. Dota 2 and its assets are trademarks of Valve Corporation. This fan project is not affiliated with or endorsed by Valve.

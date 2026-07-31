# Queue Arcade

An unofficial browser arcade made for the gap between **Find Match** and **Accept**. Dota 2 is its first content pack: the project began as a recreation of Valve's old Queue Trivia and now wraps that loop around seven fast minigames:

- **Classic Trivia** — mana, cooldowns, damage, stat comparisons, and item prices;
- **Shopkeeper Rush** — build finished items, spot exact recipes, find shared parts, and trace upgrade paths;
- **Spell Link** — match an ability to its hero while timed clues unlock;
- **Fogged Vision** — identify a hero while its portrait clears through three fixed-layout stages;
- **Echo Hunt** — identify a hero from two terse voice fragments before the complete response unlocks;
- **Soundcheck** — identify verified effects through three growing audio cuts, including ordered two-sound sequences;
- **Quote Hunt** — match a substantial written hero response to its speaker;
- **Mixed Arcade** — repeats a shuffled seven-round cycle, guaranteeing every game appears exactly once per cycle.

Every mode shares the parts that made the original compelling: short timed rounds, a shared answer reveal, speed and streak scoring, and double points when you are right while most of the crowd is wrong.

The playable MVP includes:

- endless, instantly interruptible arcade sessions with automatic round transitions;
- one shared 15-second question pool per mode, without player-facing difficulty queues;
- 645 live prompts for Dota patch 7.41d, including 48 Shopkeeper rounds and 48 Soundcheck rounds;
- item, hero, and ability artwork for visual answer rounds;
- 44 remotely verified Echo Hunt clips, 48 Soundcheck rounds built from 60 audited clips, and 43 Quote Hunt lines sourced through Dotabase;
- live-client answer audits plus balanced A–D placement for every generated question family;
- progressive Spell Link clues at two-thirds and one-third time remaining;
- deterministic template- and difficulty-aware scheduling, so large numeric pools cannot drown out distinctive formats or create long runs of trivial questions;
- visible speed scoring, explicit hint penalties, difficulty bonuses, streaks, and majority-wrong scoring;
- server-owned public rooms: everyone in the same mode receives the same round and deadlines;
- per-round crowd results with server-enforced deadlines and duplicate-vote protection;
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

Votes and question reports default to `.data/queue-arcade-votes.json`, which is intentionally ignored by Git. Set `ARCADE_DATA_FILE` to a path on a persistent volume in production. Anonymous player IDs are salted and hashed before they reach disk; set a private `ARCADE_VOTER_SALT` to keep that hash namespace installation-specific.

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

The retired Map Sense and Counterplay prototypes remain preserved but are not exposed in the lobby, accepted as public
rooms, included in Mixed Arcade, or maintained by the normal release and asset checks. Map Sense lives in
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

With the development server running, use `pnpm check:multiplayer` to create anonymous test clients. It verifies shared round IDs and deadlines, hidden pre-reveal results, concurrent votes, duplicate rejection, the shared reveal, disk persistence, hashed voter IDs, reveal-only report submission, report deduplication, aggregate-only calibration data, rejection of retired rooms, and that obsolete saved level or trivia-category values cannot split public rooms.

For visual smoke testing, start Chrome with `--mute-audio` and a debugging port, then run `node scripts/visual-smoke.mjs`. The script checks the level-free, category-free arcade lobby, retired-mode deep-link fallbacks, Shopkeeper Rush's four-format framing, the no-shift question-report popover, Spell Link's progressive clues, all three fixed Fogged Vision stages and the next-round reset, Echo Hunt's two terse fragments and complete final line, Soundcheck's shorter three-stage cuts, ordered playback, compact icon pairs, persistent volume, mute-safe autoplay and manual replay, Quote Hunt rendering, synchronized automatic round advancement, the session report, desktop/mobile calibration layouts, mobile overflow, and saves screenshots under `/tmp`.

## Crowd architecture

Each game catalog, content version, and mode is a public room. Dota rooms are explicitly namespaced like `dota2:7.41d-variety-6-classic-trivia-4-shopkeeper-2-arcade-7-soundcheck-8:...`, so future content revisions and game packs cannot collide with their questions or statistics. `/api/rounds` uses a fixed epoch and deterministic question batches to calculate the current server-owned question, answer deadline, and reveal deadline. That means restarts require no timer recovery and multiple servers calculate the same timeline as long as they run the same question snapshot and configuration.

`/api/votes` only accepts the current room's question before its server deadline. Votes are keyed by round ID, so a repeated question gets a fresh split, and answer counts remain hidden until the room enters its reveal phase. `/api/reports` opens with the reveal and keeps the just-finished question reportable for a 20-second rollover grace period. It stores one reason per hashed player and content-versioned question. The browser corrects for server clock offset, polls once per second, resynchronizes on focus, and uses optional Pusher events to surface participation immediately.

The default persistent store is an atomic JSON file suited to local development and a single long-running Node instance with a persistent disk. It serializes concurrent writes inside the process and stores aggregate per-question answer counts and report totals for calibration. `/calibration` never exposes voter hashes. It waits for 20 answers before suggesting that a question looks too easy or too hard, while reports remain manual-review signals; neither path silently changes the live deck. For horizontal scaling or serverless deployment, replace `src/lib/vote-store.ts` with Redis or Postgres; Pusher distributes updates but is never the source of truth.

## Useful next steps

1. Move vote storage to Redis or Postgres before a horizontally scaled public deployment.
2. Review calibration bands after enough real traffic, then tune question content and distractors manually.
3. Review ordered-pair accuracy, then expand Soundcheck with carefully audited channel and announcer families.
4. Implement a second game's questions and minigame deck against the existing game-catalog contract.
5. Add Steam sign-in, leaderboards, and streak challenges only after the anonymous loop proves fun.
6. Package it as a lightweight desktop/overlay companion for people who want it beside the real Dota queue.

## Attribution

Question names and artwork mappings are generated from [OpenDota](https://docs.opendota.com/); marked answers and numeric constants are independently audited against the installed client. Hero-response metadata, browser-ready Soundcheck WAVs, and the original `General.InvalidTarget_Invulnerable` (“meep merp”) failure cue are sourced through [Dotabase](https://github.com/mdiller/dotabase); their event mappings are independently checked against the installed client. Game assets are served from public Dota asset hosts. The archived Map Sense terrain artwork comes from [OpenDota's public map archive](https://github.com/odota/web/tree/master/public/assets/images/dota2/map), with its historical objective changes checked against [Valve's 7.41 notes](https://www.dota2.com/patches/7.41). Archived Counterplay outcomes were checked against the matching client and mechanics sources. Dota 2 and its assets are trademarks of Valve Corporation. This fan project is not affiliated with or endorsed by Valve.

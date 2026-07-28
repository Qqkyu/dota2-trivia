# Queue Arcade

An unofficial browser arcade made for the gap between **Find Match** and **Accept**. Dota 2 is its first content pack: the project began as a recreation of Valve's old Queue Trivia and now wraps that loop around eight fast minigames:

- **Queue Trivia** — facts, comparisons, odd-one-out rounds, reverse recipes, and ability detective prompts;
- **Shopkeeper Rush** — finish item recipes by finding the missing component;
- **Spell Link** — match an ability to its hero while timed clues unlock;
- **Fogged Vision** — identify a hero while its portrait clears through three fixed-layout stages;
- **Echo Hunt** — identify a hero from a voice response, with autoplay and an always-available replay control;
- **Quote Hunt** — match a substantial written hero response to its speaker;
- **Map Sense** — match terrain, block camps, follow current stack guides, choose a TP, and solve compact battlefield calls;
- **Counterplay** — solve BKB, dispel, Nullifier, Linken's, and Lotus interactions from short icon-led matchups;
- **Mixed Arcade** — repeats a shuffled eight-round cycle, guaranteeing every game appears exactly once per cycle.

Every mode shares the parts that made the original compelling: short timed rounds, a shared answer reveal, speed and streak scoring, and double points when you are right while most of the crowd is wrong.

The playable MVP includes:

- endless, instantly interruptible arcade sessions with automatic round transitions;
- Open, Learning, and Veteran challenge levels with 12–18 second timers and filtered trivia pools;
- 1,036 prompts across 31 formats for Dota patch 7.41d, including 236 Map Sense challenges and 62 Counterplay matchups;
- item, hero, and ability artwork for visual answer rounds;
- 44 remotely verified Echo Hunt clips and 43 Quote Hunt lines sourced through Dotabase;
- progressive Spell Link clues at two-thirds and one-third time remaining;
- deterministic template-aware scheduling, so large numeric pools cannot drown out distinctive question formats;
- visible speed scoring, explicit hint penalties, difficulty bonuses, streaks, and majority-wrong scoring;
- server-owned public rooms: everyone with the same mode, filter, and challenge level receives the same round and deadlines;
- per-round crowd results with server-enforced deadlines and duplicate-vote protection;
- server-scored Map Sense pins plus synchronized A–D mechanic rounds, with coordinates and answer splits hidden until reveal;
- disk-backed vote history that survives Node server restarts and records per-question accuracy data;
- reveal question reports for incorrect, outdated, ambiguous, or unclear content, with an opened report carrying into the next round and deduplicated per anonymous player;
- a responsive calibration lab at `/calibration`, with report triage and difficulty recommendations only after 20 answers;
- optional Pusher broadcasts between connected browsers, with automatic polling as the zero-config fallback;
- keyboard controls, responsive layouts, sound cues, and local lifetime stats;
- a reproducible data sync and validation pipeline.

## Challenge levels

- **Learning** uses 18-second rounds and recognizable, core Spell Link abilities.
- **Open** uses 15 seconds and samples every content tier.
- **Veteran** uses 12 seconds, excludes recognizable core abilities, hides ability-name clues, and selects closer distractor heroes.

Fogged Vision also scales the portrait itself: Learning preserves more color and silhouette detail, Open starts
substantially obscured, and every level retains some fog through the final stage—with Veteran keeping the most.

Map Sense changes both reasoning and interaction: Learning mixes broad calls with approachable riddles and marked-start
rotations; Open samples all nine families; Veteran rotates evenly through monochrome Terrain Match, Camp Block, Stack
Route, and TP In. The mechanic rounds use current spawn boxes, Valve's per-camp stack arrows and timing windows, and
entity-backed tower positions. Prompts stay at four words or fewer for the Veteran rotation. A three-second reading
grace preserves full speed points before the bonus begins fading; pin rounds also earn a separate center-precision
bonus.

Counterplay uses six audited mechanic families: debuff immunity, basic dispels, strong-dispel-only effects, offensive
dispels, spell block, and spell reflection. Learning keeps iconic interactions; Veteran removes those warm-ups and
leans into less obvious status and targeting rules. The deck is generated from explicit `bkbpierce`, `dispellable`,
and ability-behavior fields in the patch-stamped game constants. Break questions are intentionally excluded until
breakability can be verified without inference.

Spell Link's initial content tier is reproducible: core/iconic abilities are Learning, unusual sub-abilities, innates, upgrades, and helper abilities are Veteran, and the remaining edge cases sit between them. Distractor similarity considers primary attribute, attack type, range, and shared roles. Once the project has durable vote history, observed correct-answer rates should supersede this seed heuristic.

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

Questions and minigame artwork mappings are generated from the current OpenDota constants instead of being hand-maintained:

```bash
DOTA_PATCH=7.41d DOTA_SNAPSHOT_DATE=2026-07-26 pnpm sync-data
pnpm sync-counterplay
pnpm validate-data
pnpm validate-assets
```

The sync writes:

- `src/data/questions.generated.json`
- `src/data/trivia-meta.generated.json`
- `src/data/counterplay-questions.json`

The sync uses OpenDota for current facts and artwork mappings, and Dotabase for hero-response metadata and playable
audio paths. It checks every referenced image and audio clip, rejects questions whose assets are unavailable, filters
hero-name leaks and laugh-heavy/noise responses, and blocks generated clues that leak their answer. `validate-assets`
can rerun the remote checks against the committed deck. Set the patch and snapshot date deliberately after checking
the current official gameplay patch; the content pack is explicitly patch-stamped in the UI.

Map Sense's direct calls live in `src/data/map-sense-locations.json`; its riddle, mirror, relative-position, and scenario
packs live in `src/data/map-sense-challenges.json`; terrain crops live in `src/data/map-sense-crops.json`; and audited
camp geometry, tiers, stack windows, and arrows live in `src/data/map-sense-mechanics.json`. Coordinates and optional
reference pins are normalized from `0–1` so future terrain artwork can be replaced without changing the interaction or
storage format. `validate-data` also checks family balance, difficulty coverage, exact camp-box inclusion, stack-route
clearance, non-ambiguous TP choices, coordinate bounds, reference-pin separation, and local artwork.

Counterplay's curated matchups live in `scripts/generate-counterplay.mjs`. Its generator refuses any four-option set
unless exactly one answer matches the relevant shipped constant, while `validate-counterplay.mjs` protects family
coverage, challenge-level pools, scan-length, answer balance, and the recorded interaction outcome.

## Verify it

```bash
pnpm check
```

That validates the question deck, template rotation, and visual/audio metadata, runs ESLint, runs strict TypeScript checking, and creates an optimized production build.

With the development server running, use `pnpm check:multiplayer` to create anonymous test clients. It verifies shared round IDs and deadlines, hidden pre-reveal results, concurrent votes, duplicate rejection, the shared reveal, disk persistence, hashed voter IDs, reveal-only report submission, report deduplication, aggregate-only calibration data, server-scored map coordinates, hidden-then-revealed room pins, coordinate-free Map Sense choices, and level-filtered Counterplay rooms.

For visual smoke testing, start muted Chrome with a debugging port and then run `node scripts/visual-smoke.mjs`. The script checks the arcade lobby, Shopkeeper Rush, the no-shift question-report popover, Spell Link's progressive clues, all three fixed Fogged Vision stages and the next-round reset, Echo Hunt audio readiness, Quote Hunt rendering, Counterplay prompts and reveals, all four Veteran Map Sense interactions and reveals, synchronized automatic round advancement, the session report, desktop/mobile calibration layouts, mobile overflow, and saves screenshots under `/tmp`.

## Crowd architecture

Each game catalog, content version, mode, trivia filter, and challenge-level combination is a public room. Dota rooms are explicitly namespaced like `dota2:7.41d-variety-2-map-sense-7-counterplay-1:...`, so future content revisions and game packs cannot collide with their questions or statistics. `/api/rounds` uses a fixed epoch and deterministic question batches to calculate the current server-owned question, answer deadline, and reveal deadline. That means restarts require no timer recovery and multiple servers calculate the same timeline as long as they run the same question snapshot and configuration.

`/api/votes` only accepts the current room's question before its server deadline. Votes are keyed by round ID, so a repeated question gets a fresh split, and answer counts remain hidden until the room enters its reveal phase. `/api/reports` opens with the reveal and keeps the just-finished question reportable for a 20-second rollover grace period. It stores one reason per hashed player and content-versioned question. The browser corrects for server clock offset, polls once per second, resynchronizes on focus, and uses optional Pusher events to surface participation immediately.

The default persistent store is an atomic JSON file suited to local development and a single long-running Node instance with a persistent disk. It serializes concurrent writes inside the process and stores aggregate per-question answer counts and report totals for calibration. `/calibration` never exposes voter hashes. It waits for 20 answers before suggesting that a question looks too easy or too hard, while reports remain manual-review signals; neither path silently changes the live deck. For horizontal scaling or serverless deployment, replace `src/lib/vote-store.ts` with Redis or Postgres; Pusher distributes updates but is never the source of truth.

## Useful next steps

1. Move vote storage to Redis or Postgres before a horizontally scaled public deployment.
2. Review calibration bands after enough real traffic, then tune question content and distractors manually.
3. Audit breakable passives and targeted-spell exceptions before expanding Counterplay beyond its explicit constants.
4. Prototype compact lane-equilibrium, smoke-path, and ward/deward Map Sense rounds before adding another family.
5. Add more sound formats, such as ability casts, announcer calls, and item activations.
6. Implement a second game's questions and minigame deck against the existing game-catalog contract.
7. Add Steam sign-in, leaderboards, and streak challenges only after the anonymous loop proves fun.
8. Package it as a lightweight desktop/overlay companion for people who want it beside the real Dota queue.

## Attribution

Question and Counterplay facts are generated from [OpenDota](https://docs.opendota.com/), hero-response metadata is sourced through [Dotabase](https://github.com/mdiller/dotabase), and game assets are served from public Dota asset hosts. The versioned Map Sense terrain artwork comes from [OpenDota's public map archive](https://github.com/odota/web/tree/master/public/assets/images/dota2/map), with objective changes checked against [Valve's 7.41 notes](https://www.dota2.com/patches/7.41). Camp hulls and tower positions were audited from the installed 7.41d map entity resource; stack windows and arrows come from Valve's matching `scripts/creep_pull_timings.txt`. Dota 2 and its assets are trademarks of Valve Corporation. This fan project is not affiliated with or endorsed by Valve.

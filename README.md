# Queue Arcade

An unofficial browser arcade made for the gap between **Find Match** and **Accept**. Dota 2 is its first content pack: the project began as a recreation of Valve's old Queue Trivia and now wraps that loop around three fast minigames:

- **Queue Trivia** — current mana, damage, cooldown, item, and hero facts;
- **Shopkeeper Rush** — finish item recipes by finding the missing component;
- **Spell Link** — match an ability to its hero while timed clues unlock;
- **Mixed Arcade** — rotates all three games so consecutive rounds never feel the same.

Every mode shares the parts that made the original compelling: short timed rounds, a shared answer reveal, speed and streak scoring, and double points when you are right while most of the crowd is wrong.

The playable MVP includes:

- endless, instantly interruptible arcade sessions with automatic round transitions;
- Open, Learning, and Veteran challenge levels with 12–18 second timers and filtered trivia pools;
- 420 artwork-verified questions for Dota patch 7.41d;
- item and hero artwork for the visual minigames;
- progressive Spell Link clues at two-thirds and one-third time remaining;
- visible speed scoring, explicit hint penalties, difficulty bonuses, streaks, and majority-wrong scoring;
- server-owned public rooms: everyone with the same mode, filter, and challenge level receives the same round and deadlines;
- per-round crowd results with server-enforced deadlines and duplicate-vote protection;
- disk-backed vote history that survives Node server restarts and records per-question accuracy data;
- optional Pusher broadcasts between connected browsers, with automatic polling as the zero-config fallback;
- keyboard controls, responsive layouts, sound cues, and local lifetime stats;
- a reproducible data sync and validation pipeline.

## Challenge levels

- **Learning** uses 18-second rounds and recognizable, core Spell Link abilities.
- **Open** uses 15 seconds and samples every content tier.
- **Veteran** uses 12 seconds, excludes recognizable core abilities, hides ability-name clues, and selects closer distractor heroes.

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

Votes default to `.data/queue-arcade-votes.json`, which is intentionally ignored by Git. Set `ARCADE_DATA_FILE` to a path on a persistent volume in production. Anonymous player IDs are salted and hashed before they reach disk; set a private `ARCADE_VOTER_SALT` to keep that hash namespace installation-specific.

## Refresh the Dota data

Questions and minigame artwork mappings are generated from the current OpenDota constants instead of being hand-maintained:

```bash
DOTA_PATCH=7.41d DOTA_SNAPSHOT_DATE=2026-07-26 pnpm sync-data
pnpm validate-data
pnpm validate-assets
```

The sync writes:

- `src/data/questions.generated.json`
- `src/data/trivia-meta.generated.json`

The sync checks every referenced image and rejects questions whose artwork is unavailable. `validate-assets` can rerun
that remote check against the committed deck. Set the patch and snapshot date deliberately after checking the current
official gameplay patch; the content pack is explicitly patch-stamped in the UI.

## Verify it

```bash
pnpm check
```

That validates the question deck and visual-option data, runs ESLint, runs strict TypeScript checking, and creates an optimized production build.

With the development server running, use `pnpm check:multiplayer` to create two anonymous test clients. It verifies shared round IDs and deadlines, hidden pre-reveal splits, concurrent votes, duplicate rejection, the shared reveal, disk persistence, and hashed voter IDs.

For visual smoke testing, start Chrome with a debugging port and then run `node scripts/visual-smoke.mjs`. The script checks the arcade lobby, Shopkeeper Rush, Spell Link's progressive clues, synchronized automatic round advancement, the session report, mobile overflow, and saves screenshots under `/tmp`.

## Crowd architecture

Each game catalog, content version, mode, trivia filter, and challenge-level combination is a public room. Dota rooms are explicitly namespaced like `dota2:7.41d:...`, so future game packs cannot collide with their questions or statistics. `/api/rounds` uses a fixed epoch and deterministic question batches to calculate the current server-owned question, answer deadline, and reveal deadline. That means restarts require no timer recovery and multiple servers calculate the same timeline as long as they run the same question snapshot and configuration.

`/api/votes` only accepts the current room's question before its server deadline. Votes are keyed by round ID, so a repeated question gets a fresh split, and answer counts remain hidden until the room enters its reveal phase. The browser corrects for server clock offset, polls once per second, resynchronizes on focus, and uses optional Pusher events to surface participation immediately.

The default persistent store is an atomic JSON file suited to local development and a single long-running Node instance with a persistent disk. It serializes concurrent writes inside the process and stores aggregate per-question answer counts for later difficulty calibration. For horizontal scaling or serverless deployment, replace `src/lib/vote-store.ts` with Redis or Postgres; Pusher distributes updates but is never the source of truth.

## Useful next steps

1. Move vote storage to Redis or Postgres before a horizontally scaled public deployment.
2. Turn observed per-question correct rates into live challenge tiers and an admin calibration view.
3. Add a question-report flow for ambiguous or outdated facts after patches.
4. Add **Map Pin**, then test objective locations and common warding spots.
5. Implement a second game's questions and minigame deck against the existing game-catalog contract.
6. Add shared daily rooms and friend-room codes.
7. Add Steam sign-in, leaderboards, and streak challenges only after the anonymous loop proves fun.
8. Package it as a lightweight desktop/overlay companion for people who want it beside the real Dota queue.

## Attribution

Question facts are generated from [OpenDota](https://docs.opendota.com/), and game icons are served from Valve's public Dota asset CDN. Dota 2 and its assets are trademarks of Valve Corporation. This fan project is not affiliated with or endorsed by Valve.

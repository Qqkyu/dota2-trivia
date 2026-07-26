# Queue Arcade

An unofficial, browser-based Dota 2 arcade made for the gap between **Find Match** and **Accept**. It began as a recreation of Valve's old Queue Trivia and now wraps that loop around three fast minigames:

- **Queue Trivia** — current mana, damage, cooldown, item, and hero facts;
- **Shopkeeper Rush** — finish item recipes by finding the missing component;
- **Spell Link** — match an ability to its hero while timed clues unlock;
- **Mixed Arcade** — rotates all three games so consecutive rounds never feel the same.

Every mode shares the parts that made the original compelling: short timed rounds, a shared answer reveal, speed and streak scoring, and double points when you are right while most of the crowd is wrong.

The playable MVP includes:

- endless, instantly interruptible arcade sessions with automatic round transitions;
- Open, Learning, and Veteran challenge levels with 12–18 second timers and filtered trivia pools;
- 425 generated questions for Dota patch 7.41d;
- item and hero artwork for the visual minigames;
- progressive Spell Link clues at two-thirds and one-third time remaining;
- visible speed scoring, explicit hint penalties, difficulty bonuses, streaks, and majority-wrong scoring;
- a live crowd-vote API with duplicate-vote protection;
- optional Pusher broadcasts between connected browsers;
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

Pusher is optional. Copy `.env.example` to `.env.local` and add a Pusher Channels app if you want vote totals broadcast immediately to every connected browser. Without it, the game and vote API still work.

## Refresh the Dota data

Questions and minigame artwork mappings are generated from the current OpenDota constants instead of being hand-maintained:

```bash
DOTA_PATCH=7.41d DOTA_SNAPSHOT_DATE=2026-07-26 pnpm sync-data
pnpm validate-data
```

The sync writes:

- `src/data/questions.generated.json`
- `src/data/trivia-meta.generated.json`

Set the patch and snapshot date deliberately after checking the current official gameplay patch. Generated facts are explicitly stamped in the UI.

## Verify it

```bash
pnpm check
```

That validates the question deck and visual-option data, runs ESLint, runs strict TypeScript checking, and creates an optimized production build.

For visual smoke testing, start Chrome with a debugging port and then run `node scripts/visual-smoke.mjs`. The script checks the arcade lobby, Shopkeeper Rush, Spell Link's progressive clues, automatic round advancement, the session report, mobile overflow, and saves screenshots under `/tmp`.

## Crowd architecture

`/api/votes` validates question IDs, accepts one vote per anonymous local player ID and question, and returns the current four-way split. The default store is process-local so the project has no required database. If Pusher variables are present, accepted totals are also broadcast on the `queue-arcade` channel.

This is shared, asynchronous answer history—not synchronized multiplayer yet. Each browser currently owns its deck and timer. Real multiplayer needs a server-owned question ID, answer deadline, reveal deadline, and automatic next-round event so every client stays on the same round.

For a multi-instance public deployment, replace `src/lib/vote-store.ts` with Redis, Postgres, or another durable atomic store. Pusher distributes updates but is not the source of truth.

## Useful next steps

1. Add **Map Pin**, then test objective locations and common warding spots.
2. Add durable global vote storage and per-patch historical splits.
3. Add server-timed global rounds, then shared daily rooms and friend-room codes.
4. Add a question-report flow for edge cases after patches.
5. Add Steam sign-in, leaderboards, and streak challenges only after the anonymous loop proves fun.
6. Package it as a lightweight desktop/overlay companion for people who want it beside the real Dota queue.

## Attribution

Question facts are generated from [OpenDota](https://docs.opendota.com/), and game icons are served from Valve's public Dota asset CDN. Dota 2 and its assets are trademarks of Valve Corporation. This fan project is not affiliated with or endorsed by Valve.

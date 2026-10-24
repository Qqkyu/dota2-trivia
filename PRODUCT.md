# Product

<!-- impeccable:product-schema 1 -->

Captured 20 October 2026 from the repository and one interview with the maintainer.
Facts marked "current state" describe the app today and are not binding commitments.

## Platform

web

## Users

The primary player is a Dota 2 player who has pressed Find Match and is waiting for Accept.
They most often have Queue Arcade open in a browser on the same PC, beside the Dota client
(maintainer: "probably"). Accept can appear at any second, so they must be able to leave
mid-round with nothing lost.

Sometimes the same player opens it outside a queue as a normal trivia session (maintainer:
"sometimes maybe"). Phone play is supported but is not the primary situation.

Secondary audiences:

- Friends in a private party room at `/party`, joined by link or code, with a shared round
  clock, ranking, and small chat.
- The maintainer, who is the only developer, reviewer, and operator (binding). There are no
  team workflows to design for. Reviewer tools (`/calibration`, `/ops`) are for one person.

## Product Purpose

Queue Arcade is an unofficial browser arcade for the gap between Find Match and Accept.
Dota 2 is its first content pack. It began as a recreation of Valve's Queue Trivia, which
shipped with The International 2017 Battle Pass and disappeared with that event model after
2022.

Success over the next year, as stated by the maintainer:

1. Players come back. Return rate and rounds per visit on `/ops` grow after the public
   soft launch, so the public loop proves sticky.
2. A second game's content pack ships once the Dota loop is proven. The product is a
   multi-game arcade, not a Dota-only quiz.

Reach, community recognition, and portfolio value were offered and not selected as goals.

## Positioning

The claim: the old drop-in queue loop, which no neighbouring project runs. One shared public
room, 15-second rounds, a global answer reveal, speed and streak scoring, and double points
when you are right while most of the crowd is wrong. Ten round formats rotate inside that one
room, and each one stays short enough to abandon the moment a match appears.

Neighbours serve different loops: Dotadle is a daily hero guess, Dota2Quiz recreates
Shopkeeper item modes, Dota 2 IQ trains itemization and awareness, Rift Oracle is an offline
mobile ten-question quiz, and Dota Slash is not a dependable replacement.

## Operating Context

- The Dota client is open on the same machine. Its audio and the Accept prompt compete with
  the arcade for attention. Tabs go hidden and come back.
- Every browser shares one server-owned public room per game and content version. A new
  player joins the live question only when at least 13 seconds remain; otherwise they wait
  on a synchronized countdown for the next full round.
- Players who are silent for 90 seconds in a party are tagged Away but keep seat and score;
  only Leave removes anyone (maintainer rule).
- Anonymous play works immediately with browser-local lifetime stats. Steam OpenID is
  optional and only verifies the SteamID; it adds cross-browser records.
- Content is patch-stamped (currently Dota 7.41f) and shown as such in the UI. The data
  pipeline reads OpenDota, Dotabase, and an audited decompiled client, then validates every
  question, asset, clue leak, and answer-slot balance before release.
- Hosting is one Render free-plan instance in Frankfurt with Postgres. The service sleeps;
  the first visitor after idle waits about 17 seconds. Private rooms, chat, and presence
  live in process memory and end on restart. Live app: <https://queue-arcade.onrender.com>.
- Issues live in GitHub Issues on `Qqkyu/dota2-trivia`. Domain decisions live in
  `docs/adr/`.

## Capabilities and Constraints

Confirmed functionality:

- Endless, instantly interruptible public sessions with automatic round transitions; `/`
  lobby and `/play` session URLs with Back and Forward support.
- Ten round formats: Classic Trivia, Shopkeeper Rush, Spell Link, Fogged Vision, Echo Hunt,
  Soundcheck, Quote Hunt, Aghanim's Lab, Order Up, Flashback. A deterministic
  thirteen-slot cadence never repeats a family back to back.
- Visible speed scoring, hint penalties, hidden difficulty bonuses, streaks, and
  majority-wrong double points. Per-round crowd results after a server-enforced deadline.
- Progressive clues delivered at server-owned stages; the browser never receives the
  marked answer or the answer catalog before reveal.
- Reveal-phase question reports (incorrect, outdated, ambiguous, unclear), deduplicated per
  anonymous player, carried into the next round.
- Calibration lab at `/calibration` and an operations dashboard at `/ops`, both behind a
  Steam reviewer allowlist. Reviewed and quarantined states never silently change the live
  deck.
- Keyboard controls, responsive layouts from 320 px up, persistent mute and master volume
  (fresh profiles start at 70%), sound cues sourced from the Dota client, local lifetime
  stats, optional Steam profiles with self-service deletion, a plain-language privacy page.

Technical constraints:

- Next.js 16, React 19, TypeScript, CSS Modules, Postgres in production. One instance only
  until private rooms, presence, and rate limits use shared storage.
- Every UI change must pass `pnpm check`: data validators, unit tests, lint, strict
  TypeScript, a production build, a client-bundle leak check, and headless-browser
  click-throughs for every format. Refactors that must not change what players see use the
  render-snapshot comparison.
- Feedback sounds follow ADR 0001 and the `pnpm check:sounds` gate.

Terminology:

- "format" or "round identity": one of the ten named round types; never a separate queue.
- "content pack": one game's question catalog; "content version": one release of it.
- "public room": the single shared room per game and content version. "party room": a
  private room with its own clock.
- "crowd split": the per-round distribution of answers shown at reveal.
- "majority-wrong": double points for a correct answer when most of the room was wrong.
- "Away": a party member whose tab has been silent for 90 seconds; still seated and scored.
- "report", "calibration", "reviewed", "quarantined": the question-quality workflow.
- "reviewer": a Steam account on `ARCADE_REVIEWER_STEAM_IDS`. Today that is the maintainer.

Current state, not binding (the maintainer declined to make these product commitments on
20 October 2026):

- No ads, pricing, or payments exist. Monetization is undecided.
- The public arcade has one room with no mode, category, or difficulty queues. Difficulty is
  hidden question metadata.
- Public leaderboards are excluded until answer-replay protection exists (GitHub #5).
- "No UI shifts between phases" and the feedback-sound contract are engineering rules
  enforced by checks, not product commitments.

Undecided product facts:

- Which game the second content pack covers, and when.
- Whether phone-first play ever becomes a primary situation.
- Backup retention and recovery targets for the hosted database.

## Brand Commitments

- Name: Queue Arcade. Site title: "Queue Arcade — Dota side quests between matches".
  Social description: "One live Dota arcade for the seconds between Find Match and Accept."
- Unofficial fan project. Not affiliated with or endorsed by Valve. Dota 2 and its assets
  are trademarks of Valve Corporation. Attribution to OpenDota and Dotabase stays in the
  README and `THIRD_PARTY_NOTICES.md`.
- Steam sign-in uses Valve's OpenID provider and an inline Steam brand mark. Queue Arcade
  never receives a Steam password.
- Every audible UI cue is a real Dota client sound sourced through Dotabase; the runtime
  synthesizes no substitute tones.
- Interface language: English.

## Evidence on Hand

- 1,517 live prompts for Dota 7.41f: all 127 enabled heroes in Fogged Vision, 102
  Shopkeeper rounds, 96 Soundcheck rounds, 84 Aghanim's Lab upgrades, 80 Order Up rounds,
  191 sourced Flashback prompts, 123 verified Echo Hunt clips, 245 Quote Hunt lines.
  Generated decks live under `src/data/`.
- October 2026 audit reports under `docs/audits/2026-10-06/` (launch checks, security
  remediation, deep review, capacity). Raw evidence is on Git tag
  `launch-evidence-20261010`.
- Capacity: a 466-player synthetic run kept all votes but missed the one-second response
  target. It does not prove live load on the free plan.
- Assets: hero, item, and ability artwork from public Dota hosts; local artwork and
  Flashback images under `public/arcade/` and `public/assets/dota2/`; splash
  `public/arcade/first-blood-splash.png`; `public/assets/steam-sign-in.png`; app icon
  `src/app/icon.png`; a generated social preview at `src/app/opengraph-image.tsx`; fonts
  Geist, Geist Mono, and Radiance Bold under `src/app/fonts/`.
- Absent, do not fabricate: real-session player counts (the public soft launch has not
  run), testimonials, press, community quotes, a completed interactive hosted Steam login,
  physical iPhone or screen-reader results, pricing.

## Product Principles

1. Leave at any second. A round never asks for more than 15 seconds, and leaving costs
   nothing. Nothing in the product may make a player hesitate to press Accept.
2. One room, one clock. Everyone sees the same question, deadline, and reveal. The server
   owns timing and answers; the browser only renders what the current phase allows.
3. The crowd is the payoff. The per-round split and the majority-wrong bonus are the reason
   to answer, so every format must end in a shared reveal.
4. Only audited, current game facts. Every prompt traces to the patch-stamped client or a
   dated source, and content that cannot be verified is cut rather than shipped.
5. Return visits before reach. Prove the public loop on `/ops` before adding packs or
   rankings.

## Accessibility & Inclusion

No formal standard is declared. Established needs and limits:

- Full keyboard play; persistent mute and master volume; three timed audio cuts per audio
  round so one missed clip does not end the round.
- CI runs axe accessibility checks in Chromium, Firefox, and WebKit, 54 player journeys,
  and 31 answer variants at 11 sizes from 320 px to 4K.
- Untested: physical iPhone, VoiceOver and other screen readers, and full native mobile
  gameplay. Treat screen-reader support as unverified.

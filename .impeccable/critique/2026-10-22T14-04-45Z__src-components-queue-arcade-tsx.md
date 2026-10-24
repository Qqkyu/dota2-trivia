---
target: the live app lobby and round loop
total_score: 24
max_score: 40
na_heuristics: 
p0_count: 1
p1_count: 3
target_identity: "file:/home/kulmisiu/.local/share/opencode/worktree/330f7f/design-poc/src/components/queue-arcade.tsx"
target_fingerprint: "sha256:89ab486e39d11b42223aa3896b8cf3ffb022fd45e57afe17d76b4247d5326b33"
target_path: /home/kulmisiu/.local/share/opencode/worktree/330f7f/design-poc/src/components/queue-arcade.tsx
timestamp: 2026-10-22T14-04-45Z
slug: src-components-queue-arcade-tsx
---
Method: dual-agent (A: ses_e9c1a3592ffeciA5uRwIeNwY8u · B: ses_e9c1a3591ffevQHvEvCdOmuOiA)

## Design health score

| # | Heuristic | Score | Key issue |
|---|---|---|---|
| 1 | Visibility of system status | 2 | Lobby shows a fake "00:15" and no live room. Wait screen shows a fake "15" beside the real countdown. |
| 2 | Match system / real world | 3 | Gold, streaks, announcer lines, attributes are right. "Crowd-breaker", "Global split", "Calibration lab" are not player words. |
| 3 | User control and freedom | 2 | No replay for autoplayed audio. No exit affordance in a round except the brand link. The demo board locks with no reset. |
| 4 | Consistency and standards | 2 | Locked and wrong share the same red. Hero picker uses gold for selected, the choice board uses red. |
| 5 | Error prevention | 2 | Players will answer the practice board. One mis-tap among 127 portraits is final. |
| 6 | Recognition over recall | 3 | Portrait grid and shortcut hints are good. Spell Link clue is 12 px grey and must be held while scanning 127 faces. |
| 7 | Flexibility and efficiency | 3 | Keyboard layer is excellent. Phone has no equivalent. |
| 8 | Aesthetic and minimalist | 2 | Lobby carries orbs, noise, tilt, toast, stat strip, chips. Rail repeats the round number the header shows. |
| 9 | Error recovery | 3 | Reveal copy is exact and patch-stamped. An empty room stacks five negatives and a lone dash. |
| 10 | Help and documentation | 2 | Help is three wait-screen tips and a helper line that sits below the fold on hero rounds. |
| Total | | 24/40 | Acceptable |

## Design specificity verdict

Lobby: generic, confirmed. The composition is the dark SaaS landing template: a light-weight 77 px headline with a Georgia italic coral accent, a tracked-caps eyebrow chip with a pulsing dot, a lead paragraph, a chip rail, two buttons, a four-cell stat strip, a tilted product mockup under a blurred halo with a fake OS toast attached, and orbs plus noise behind it. The Dota parts are content pasted into that frame.

Round screens: content-specific, chrome-generic. The hero picker is unmistakably Dota. Gold as currency, item art in answer rows, audio stages, and the kill-streak banner in Radiance are grounded. The frame around them is the same editorial system as the lobby.

Deterministic scan: source scan 1 warning (false positive, Arial in the error page stylesheet). Live scan of `/` at 1280: 9 findings (italic-serif-display, hero-eyebrow-chip, pulsing-dot, dark-glow on the brand mark, repeating-stripes-gradient on the Play button, two tiny-text at 11 px, one 10 px functional label). At 390: body-text-viewport-edge on the lead paragraph. `/play` scan failed twice with a navigation timeout (room polling), so no element-level coverage of round phases. Source scan is regex-only.

Visual overlays: not available (display-only browser panel); evidence from captures.

## Overall impression

The round loop is a real product with a real keyboard layer and honest reveal copy, wrapped in a lobby that argues with a player who has already pressed Find Match. The biggest opportunity is the ten seconds around entry: the wait screen shows a practice board labelled "Round 001" with a timer "15" and lockable answers that reply "Your answer · locked".

## What's working

- The keyboard layer in the hero picker and the answer shortcuts.
- Fixed geometry across phases.
- Reveal precision and patch stamping; the kill-streak banner.

## Priority issues

- [P0] The practice board impersonates the live round (entry-wait-lessons.tsx: "Round 001", static "15", live answer classes, aria-pressed, "Your answer · locked"). Fix: a Practice frame with no round number, no timer digits, reset per tip, never "locked"; better, show the live question read-only with a join countdown. Command: clarify.
- [P1] The lobby is a landing page for a product the visitor already chose. Fix: remove mockup, toast, orbs, noise, stats; show the live room (round, format, seconds left, players, join countdown) and Play as the only above-fold decision. Command: distill, then layout.
- [P1] The crowd split is a sidebar afterthought (session-rail.tsx mounts it at reveal, duplicates the row percentages, lands last on phones; empty room stacks five negatives and a dash). Fix: the answer rows are the split, one summary line, honest empty-room copy. Command: layout.
- [P1] Red means both locked and wrong (.answerLocked and .answerWrong share the red token; "No score" in gold). Fix: locked gold, wrong red, correct green, zero never gold. Command: colorize.
- [P2] The clock is not glanceable from the other monitor (19 px digits, 3 px track). Fix: seconds as the second-largest stage element, last-five-seconds colour shift, reduced-motion safe. Command: bolder.

## Persona red flags

Alex: "PLAY DOTA" reads like a Steam launch button; wait screen has three tips, no skip; A locks a practice answer; no route from lobby to the live question.
Jordan: chips look clickable and do nothing; "2x crowd-breaker bonus" undefined; "0% lifetime accuracy" before the first round; Spell Link instruction below the fold; empty-room reveal reads as a dead site.
Sam: practice board is a real answer group; kill-streak HUD aria-hidden; report popover does not move focus; picker key filter swallows printable keys.
Casey: lobby about 1,690 px tall; hero grid is a 380 px scroll box showing only Strength; Gold and Streak above the split at reveal.
Dota player on the other monitor: red lock reads as a loss; 19 px seconds; 12 px result text; only the streak banner passes the glance test; no audio replay.

## Minor observations

- Georgia on the headline accent and quote card while Radiance ships in the bundle.
- Type floors 7 to 11 px in picker indexes, crowd summary, shop headings, stat strip, "Report question"; stat caption truncates at 1440.
- Round number stated three times (header, rail, pip).
- "1 PLAYING NOW" counts the viewer.
- Lobby toast overlaps the mockup border at 1440 and the caption on mobile.
- "Calibration lab" offered to anonymous visitors.
- Entry gate: code requires 13 s (arcade-entry.mjs), README and PRODUCT.md say eight.
- Header controls in a 36 px row; chips 38 px.

## Questions to consider

- If `/` rendered the live room read-only with one Join button, who would miss the lobby?
- Why does a tutorial get the full stage and a round number while the payoff is a sidebar card that appears last on a phone?
- What should be on screen at the second Accept pops?

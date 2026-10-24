---
target: the live app lobby and round loop
total_score: 33
max_score: 40
na_heuristics: 
p0_count: 1
p1_count: 3
target_identity: "file:/home/kulmisiu/.local/share/opencode/worktree/330f7f/design-poc/src/components/queue-arcade.tsx"
target_fingerprint: "sha256:012916471db3104f3d77d329bd727c0a2559fb10c316affd2a4b88af9f2615b7"
target_path: /home/kulmisiu/.local/share/opencode/worktree/330f7f/design-poc/src/components/queue-arcade.tsx
timestamp: 2026-10-22T15-25-17Z
slug: src-components-queue-arcade-tsx
---
Method: dual-agent (A: ses_e9bd559e8ffeqpKAPfLxm6fDWb · B: ses_e9bd559e7ffeVQf4J3g17KZlEJ)

Second run, after the design/app-polish fixes (practice board, gold lock, 30 px clock, reveal room summary, live-room lobby, 10 px label floor).

## Design health score

| # | Heuristic | Score | Key issue |
|---|---|---|---|
| 1 | Visibility of system status | 3 | Round header never says Answering or Reveal; "05" at reveal reads as time to answer. (Fixed after this run: digits turn green at reveal.) |
| 2 | Match system / real world | 4 | Gold, First Blood, streak names, attribute groups, Find Match green. |
| 3 | User control and freedom | 3 | Leave at any second, no dialog. First press locks with no undo, by design. |
| 4 | Consistency and standards | 3 | Reveal clock green in the lobby card but not the round header (fixed after this run). Steam button breaks the mobile button stack. |
| 5 | Error prevention | 3 | Sticky touch hover painted an answer red before any tap (fixed after this run: hover only under `(hover: hover)`, in gold). |
| 6 | Recognition over recall | 3 | At reveal the correct hero was a 44 px tile with a 14 px check among 127 (fixed after this run: idle tiles dim, portrait in the reveal panel). |
| 7 | Flexibility and efficiency | 4 | A–D, 1–4, type-to-filter, Enter, arrow keys on tips, persistent volume. |
| 8 | Aesthetic and minimalist | 3 | Desktop rail is two cards and 600 px of nothing. Ten empty pips on a fresh session. Keyboard hints on phones. |
| 9 | Error recovery | 3 | Audio unavailable, click to hear, vote retry, report flow. |
| 10 | Help and documentation | 3 | Three tips and a per-format helper line; scoring rules only as "+90 speed" and "2× crowd breaker". |
| Total | | 33/40 | Good |

## Design specificity verdict

Lobby: specific, on a conventional skeleton. Radiance headline with the gold second line, Find Match green, live room card with the real clock and format. At 1440×900 the card floats in empty space; on mobile it sits below the fold.

Round screens: specific. Hero grid by attribute with type-to-filter, the shop with the client's search placeholder, per-format timer colours, gold lock, kill-streak banners. Nobody would mistake it for a generic quiz.

Deterministic scan: source 2 warnings (side-tab on `.practicePicked`, consistent with the shell's existing lock stripes; Arial in the error page, false positive). URL scans of `/` and `/play` timed out (the lobby polls presence every 5 s, the room polls rounds; the page never settles). Overlay skipped: display-only browser panel.

## Priority issues

- [P0] Hero-grid reveal invisible on desktop: payoff panel off-screen at 1440×900, correct hero a 14 px check among 127 tiles. Fixed after this run (dim idle tiles at reveal, portrait and name in the reveal panel). Grid height cap not done. Command: layout.
- [P1] First Blood and streak banners collide with the 72 px mobile header and cover the round header for the reveal. Not done (pre-existing, outside this pass). Command: animate.
- [P1] Sticky hover paints an answer red on touch. Fixed after this run. Command: adapt.
- [P1] Round audio keeps playing after Accept (judged from source: tab-hidden audio ownership and autoplay). Not done. Command: harden.
- [P2] Round header has no phase word. Fixed after this run (green digits at reveal). Command: clarify.
- [P3] Desktop rail mostly empty; footer exposes Calibration lab. Not done (the lab is public, not reviewer-only). Command: distill.

## Persona red flags

Alex: 14 s of dead air after locking; "+90 speed" never explains the base. Jordan: the practice board still reads as a live round at a glance (small gold Practice word and a tag). Sam: hero search overlay echoes every keystroke via aria-live; kill-streak banner hidden from assistive tech. Casey: keyboard hints on a phone, live room card below the fold, Steam button breaks the stack. Dota player on the other monitor: audio after Accept; no attention cue when a round starts while looking at the client.

## Minor observations

- "Joining…" on the button while the card still said "Play now … in 3s" (fixed after this run).
- Report menu opens upward over answer rows on mobile.
- Ten empty pips with centre dots read as missing data.
- Soundcheck reveal names abilities in prose while rows stay icon-only.
- Round header hairline separators nearly invisible at 1440.

## Questions to consider

- If the crowd is the payoff, why does the hero-grid reveal spend 127 tiles on the grid and none on the crowd? Could the grid collapse to the top four picks at reveal?
- Why does the lobby exist as a page for a returning player? Could Play be the first thing the URL does?
- First Blood is the best moment. What would a wrong answer at a five-streak look like with the same production budget?

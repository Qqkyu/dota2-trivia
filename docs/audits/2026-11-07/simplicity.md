# Simplicity audit, 2026-11-07

Goal: a newcomer understands any screen in about 10 seconds, text stays short, and each fact shows in one place. This audit read the code and did not watch a player. Nothing here is built yet. Every text change also needs a Russian change and a native-reader pass.

Maintainer decisions, 2026-11-07: Option A below. All small fixes approved. Design for the public room first; a party gets a change only if it comes along for free or party play is plainly bad. No help page. If the UI can't explain something, such as ranking, add a small "?" button with a short tooltip at that spot.

## Where the answer split lives

At the reveal the count and split repeat in the reveal sentence (`round.crowd.summary`), the Room card (`session.answeredThisRound`), the Room split card (`session.answerTotal`, `session-rail.tsx:124-163`) and on the answers (`answer-boards.tsx:233`, `hero-picker.tsx:302`, `shopkeeper-store.tsx:481`).

The side rail is hidden during party play (`queue-arcade.module.css:2450`), so the Room split card alone can't serve parties.

- Option A: keep the Room split card in the public room and remove the other three there. Parties keep the sentence and the answer percentages.
- Option B: remove the Room split card. Order Up, Flashback order and Flashback year lose their bars, and hero and item rounds lose the top picks list.

Check the Room card height at the reveal with a bounding-box assertion. Update `visual-smoke.mjs:279-293`, `check-layout.mjs:907-936` and `check-public-play.mjs:243` to match.

## Confusing controls

1. Party code: `joinCode` starts empty (`private-room-panel.tsx:254`), and nothing says the player invents the code. New create-screen label: "Choose a party code". Keep `party.code` on the join screen.
2. Flashback order reveal has two unlabeled lists (`flashback-boards.tsx:199,217`). Reuse `round.order.correct` and `round.order.yours`.
3. Order rounds name keys the cards don't show, and the fourth pick locks with no warning. `round.helper.order` becomes "Click four in order. The fourth locks it." Delete `round.helper.flashbackOrder`.
4. The reveal clock looks like the answer timer (`queue-arcade.tsx:318-323`). Show `lobby.live.nextRoundIn` beside it at the reveal and reserve the width.
5. Recipe helpers omit Build. `shopAction.recipeNotNeeded`, `shopAction.recipeIncluded` and `shopAction.pickItems` become "Pick the items, then press Build."
6. Locked Aghanim clues look like plain labels. `round.prompt.aghanim.details` becomes "Upgrade details at {seconds}s". `round.prompt.aghanim.abilityName` and `round.prompt.spell.nameUnlocks` become "Ability name at {seconds}s". `round.prompt.spell.iconUnlocks` becomes "Icon at {seconds}s". Match the two `round.preview.spell.*` keys.

## Repeats to remove

7. Hero-grid reveal: verdict and gold show in the status line (`hero-picker.tsx:229-235`) and the reveal panel; the hero name shows in the status line and the caption (`reveal-panel.tsx:123`). Check first that the panel stays above the fold (see the comment at `hero-picker.tsx:70`).
8. Labels above the prompt: remove `round.prompt.fog.eyebrow`, `.spell.eyebrow`, `.echo.eyebrow`, `.quote.eyebrow`, `.aghanim.eyebrow` and `round.prompt.quote.cardLabel`. `round.prompt.soundcheck.sequence` becomes "Two sounds".
9. Clue stage shows twice: Fog has a badge and a meter (`round-prompt.tsx:267,275`), audio has a label and a meter (`:394,412`), Spell and Aghanim have "Clue 1 / 3" and three rows (`:169,221`). Keep the badge or label for Fog and audio, and the rows for Spell and Aghanim.
10. "Between matches" shows three times on the lobby. Keep the headline. `shell.header.tagline` and `site.tagline` become "Dota 2 trivia". `shell.footer.tagline` and `footer.tagline` become "Queue Arcade".
11. Wait screen: remove `wait.notLive`. `wait.hint` becomes "Until the next round". `wait.tip.keys` becomes "Press A–D to answer". `wait.tip.shop` becomes "Start typing to filter items". `wait.picked` becomes "Picked".
12. Party setup: remove `party.setup.intro`.

## Shorter text

13. `lobby.lead`: "Dota 2 trivia: one question for everyone, {seconds} seconds to answer. Get it right when most don't to score [double]."
14. Lobby card: `lobby.live.reveal` "Live now · Showing answers"; `lobby.live.idle` "Public room"; `lobby.live.joinThisRound` "Play now to join this round."; `lobby.live.joinNextRound` "Play now to join the next round."; `lobby.live.joiningNext` "Joining the next round…"; `lobby.live.sameQuestion` "Connecting…".
15. `lobby.rotation`: "Ten round types".
16. Helpers: `round.helper.hero` "Click a hero, or type and press Enter"; `round.helper.shopItem` "Click an item, or type and press Enter"; `round.heroPicker.total` "{count} heroes"; `round.helper.flashbackYear` "Slide to the year, then press Lock".
17. Gold and lock lines: `round.helper.goldNow` "Worth {points} gold now"; `round.helper.locked` "Answer locked"; `round.answers.yoursLocked` "Your answer"; `session.lockedSoFar` "{answers} answered so far."
18. Award line: `round.reveal.crowdBreaker` "2× beat the crowd"; `round.reveal.speedHints` "+{speed} speed · −{penalty} clues"; `round.callout.timeExpired` "Time's up"; leave `round.reveal.noScore` blank and keep its height.
19. Audio: `round.prompt.audio.cutOf` "Clip {stage} of {total}"; `round.prompt.audio.blocked` "Click to hear this clip"; `round.prompt.audio.loadingCut` and `.loadingVoice` "Loading clip".
20. Errors say "vote", which players never see elsewhere: `roomStatus.voteFailed` "Answer not sent · try again"; `roomStatus.voteDelayed` "Answer not confirmed yet · checking"; `roomStatus.connectionInterrupted` "Connection lost · retrying".
21. Other: `party.ended` "The server restarted, so this party ended."; `shell.footer.calibration` and `footer.calibration` "Question stats"; show "Round 1", not "Round 001" (`queue-arcade.tsx:301`).

## Before editing

- Skip `round.helper.spell`, `.fog`, `.echo` and `.quote`: they look unreachable (`answer-helper.tsx:65`).
- Pinned strings: `wait.hint` in `tests/interface-copy.test.mjs:57`, `scripts/validate-flashback.mjs:506` and `scripts/visual-smoke.mjs:1492`; "Correct now" in `scripts/check-round-copy.mjs:196,226`.
- `check-round-copy.mjs` bans lines such as "later clues cost".
- Not checked: whether the new text fits, especially in Russian; every question prompt and explanation.

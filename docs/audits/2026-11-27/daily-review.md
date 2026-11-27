# Content review for Queue Daily

This review covers the scripts that changed for Queue Daily (issue #71). The patch-stamped catalog, content generators and question data are unchanged. The daily draws its rounds from the existing reviewed catalog: Fogged Vision, Soundcheck, Echo Hunt, Quote Hunt and Flashback questions, plus estimate subjects taken from the audited Order Up values for item prices, hero movement speed and attack range. The [council polish review](../2026-11-11/council-polish/content-review.md) remains the basis for patch 7.41f. This note does not claim a new upstream audit.

- `scripts/check-daily.mjs` is new. In headless, muted Chrome it checks that the lobby leads with the daily, plays all six rounds, opens clues, checks the clue cost and the stage of the fog image, and checks the reveals, the share text, the day streak, a reload, the lobby score and a 360 px phone width. It also checks that the server counted the finish.
- `scripts/check-ui.mjs` runs `check-daily.mjs` after `check-public-play.mjs`. No retry rule changed.
- `scripts/check-party-previews.mjs` compares the Party button with the daily button, which is now the lobby's main plaque, instead of the public room's button. The rule is unchanged: Party stays a small button.
- `scripts/check-responsive-ui.mjs` checks that the daily button, the lobby's main action, is visible without scrolling on phones, and it also inspects `/daily` at every size.
- `scripts/visual-smoke.mjs`, which is outside the gate, checks that the lobby links the daily, and on a phone it compares the daily button's width with the account slot's.

Ability cooldown, mana and damage values are not used as estimates, because one number does not say which level it is for.

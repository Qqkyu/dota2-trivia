# Opus baseline review

Model: `claude-code/claude-opus-5-5[1m]`, high effort.
Reviewer session: `ses_e44a83fcdffe61Xr8GxQgweXAd`.
UI revision: `ab0d4bb`. Date: 8 November 2026.
This file summarizes the returned review. It is not part of any later judge packet.

## Scores

| Dimension | Score |
| --- | --- |
| First action | 8 |
| Play clarity | 7 |
| Reveal and return | 6 |
| Visual craft | 7.5 |
| Access and reflow | 7 |
| State and recovery | 7 |
| Overall | 7.1 |

The reviewer calculated `42.5 / 6 = 7.08`, rounded to 7.1. Confidence was medium-high for layout and tested flows, lower for phone crowd placement and audio.

## Coverage

The reviewer inspected home, party setup, party create, Classic Trivia, Fogged Vision, and Shopkeeper screenshots at 390x844 and 1280x640, including result crops. It also inspected party crowd stress captures and the responsive check's 136 passing assertions.

It tested local keyboard order, joining public play, a locked Fogged Vision answer, a one-vote reveal, an offline interruption and recovery, an invalid party code, an invalid party link, party creation layout, and Russian home and play. It inspected the supplied Dotadle and Guess the Hero pages and relevant component source.

It did not test audio, a screen reader, a locked A-D answer, real party votes, or a successful locked phone Shopkeeper answer. Fixture timers and presence were synthetic. The Dotadle phone screenshot had a wide layout and was not evidence of successful phone reflow.

## Findings returned

1. High. Grid-round reveal explanations and awards were below the fold at 1280x640. Live reveal panels started at 793 and 837 px. The reviewer proposed adding compact gold and crowd feedback near the existing answer status without moving controls.
2. Medium. The public crowd card comes after score, shop, room status, and recent rounds. The phone risk was source-only. The reviewer proposed showing the existing crowd-summary sentence in public reveals on narrow screens.
3. Medium. Party join does not submit on Enter or focus the code input when opened. The reviewer proposed a form submission handler and deliberate focus.
4. Medium. The party code and Create button come after ten preview cards. The reviewer proposed moving those controls first or making them persist while scrolling.
5. Low-medium. Offline status appears only as a small Syncing label in recent rounds. The reviewer proposed a status near the clock.

Other observations were tooltip-only gold-shop instructions, a hidden phone next-round label, and faint small labels. The reviewer asked to preserve the stable answer layout, direct Play entry, optional Steam sign-in, and Dota identity.

## Comparison notes

Dotadle's icon plus action descriptions are useful. Its daily separate-mode loop does not fit a shared rotating room. Guess the Hero has a direct first action and large portraits, but its ten-candidate selection and confirmation step should not replace Queue Arcade's timed full roster.

## Parent verification

The hero-picker status already includes earned gold for a correct result in `hero-picker.tsx`. The claim that this must be added to all hero reveals is too broad. The crowd-placement issue and missing party form submission still need direct regression checks before acceptance.

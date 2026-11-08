# Sol baseline review

Model: `openai/gpt-6.1-sol`, high effort.
Reviewer session: `ses_e44a83fcbffeIU2y5NxSE3oKAW`.
UI revision: `ab0d4bb`. Date: 8 November 2026.
This file summarizes the returned review. It is not part of any later judge packet.

## Scores

| Dimension | Score |
| --- | --- |
| First action | 8.5 |
| Play clarity | 7.5 |
| Reveal and return | 6.5 |
| Visual craft | 8 |
| Access and reflow | 7.5 |
| State and recovery | 7 |
| Overall | 7.5 |

The exact mean was `45 / 6 = 7.5`. Confidence was high for supplied layouts and medium for complete interaction coverage.

## Coverage

The reviewer inspected both supplied sizes for home, party entry and creation, mana answering and reveal, Fogged Vision, Shopkeeper, party stress states, and profile. It used the supplied Dotadle and Guess the Hero captures and observations.

In isolated local Chrome it checked keyboard focus, blank-code validation, entry waiting, a natural timed question, timeout reveal, automatic next round, offline state and recovery, Russian home reflow, a simulated accepted hero vote, and missing-party recovery. State-changing application requests stayed intercepted.

Populated crowd results, real vote settlement, Steam login, physical phones, screen readers, and audible feedback remained unverified. Russian coverage stopped at the home page. The reviewer did not treat fixture values or the Next indicator as production defects.

## Findings returned

1. P1. Detailed result and gold feedback can fall below the initial viewport. The reviewer proposed a reserved compact verdict and award area near the controls, with detailed explanations retained below.
2. P1. Desktop Shopkeeper hit areas overlap. The captured Magic Wand and Bracer rectangles intersected by 4.53125 px at 1280x640. The reviewer proposed columns that respect minimum button dimensions and a rectangle-intersection regression check.
3. P1. Offline play can still look live at zero seconds. The reviewer proposed connection status beside the timer and explicit unavailable controls after the deadline, with automatic recovery kept.
4. P2. Phone reveals hide the countdown label. The accessible timer reported zero answer seconds while the visible reveal clock showed six. The reviewer proposed a short visible phase label and phase-correct accessible time.
5. P2. Party creation starts with an unexplained selected list. Create began below the phone viewport. The reviewer proposed a visible heading, round-type instruction, and code/action controls before the list.

The reviewer asked to preserve anonymous entry, optional Steam sign-in, the Dota identity, explicit answer locks, server timing, and answer secrecy.

## Comparison notes

Dotadle has concise instructions beside its input, but its daily repeated-guess loop does not fit the shared room. Its supplied phone view was not a reflow model. Guess the Hero separates evidence and choices clearly. Its self-paced confirmation step should not become another action in Queue Arcade's timed loop.

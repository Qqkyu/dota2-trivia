# Independent player UI review

Review every supplied application or UI version independently, read-only. Assess what the evidence supports. Separate observed behavior, source-code findings, and assumptions. Inspect each subject's evidence before comparing the scores. Subject order and the availability of source code do not indicate which subject should score highest.

Every supplied subject needs its own dimension scores and overall score. A comparison paragraph is not a substitute for scoring the other products. Use the same rubric for all subjects, relative to each product's own purpose. Do not force a ranking, equal spacing, or a preferred winner.

## Product facts

Queue Arcade is a Dota browser game for players waiting for a match. A player can join anonymously, answer a live 15-second round, see the room's answer split, and leave at any time. Ten round formats rotate in one public room. Private parties have their own room. Desktop beside the Dota client is primary; phone reflow and full keyboard play remain supported. Steam sign-in is optional. The current Dota-inspired visual identity is intentional. Preserve server-owned timing, hidden answers until reveal, and the feedback-sound contract.

Use the supplied subject descriptions and rendered evidence to resolve current-state details. `PRODUCT.md` contains dated facts, not a substitute for observation. Judge comparison apps only on the pages in the frozen packet. A daily puzzle, an untimed inventory guess, and a shared timed arcade have different loops. Do not deduct points because one lacks another's modes, timers, parties, sign-in, or progression.

Fixed reference subjects must be judged from their frozen evidence, not newly loaded live pages. Only use additional interactions when the packet explicitly permits them. Report missing coverage rather than inventing behavior. Source-only risks that have not been reproduced do not become observed UI defects.

The maintainer keeps public crowd counts and the full split in the Room split card. Improve its placement rather than repeating those numbers elsewhere. Parties have no side rail and keep inline shares. Preserve this simplicity decision unless the user explicitly reopens it.

## Rubric

Score each dimension independently from 0 to 10, with a short evidence-based reason:

| Dimension          | Assess                                                                                                                       |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------- |
| First action       | Can a new player understand the product and begin its intended activity without an avoidable obstacle?                       |
| Play clarity       | Are the clue, choices or input, current state, and submission behavior clear for this game's own loop?                       |
| Reveal and return  | Does feedback explain the guess or result and the next available action, including daily limits where applicable?            |
| Visual craft       | Are hierarchy, spacing, typography, contrast, artwork, and controls coherent and specific to this game?                      |
| Access and reflow  | Can players use the keyboard, read focus and status, and play at the supplied sizes without clipping or undersized controls? |
| State and recovery | Are the observed loading, empty, invalid-input, error, and recovery states clear for this product?                           |

For each subject, calculate the overall score as the unweighted mean of its assessed dimensions, rounded to one decimal. State coverage and confidence separately for each subject. If a dimension cannot be assessed, mark it `not assessed`, explain why, and average only the assessed dimensions. Never replace missing evidence with an invented score. Different coverage limits cross-product score comparisons and must be stated.

The scale describes usability and craft. A 0 means unusable, 5 means usable with substantial friction, 8 means well resolved with concrete remaining flaws, and 10 means no material defect found within the inspected scope. Decimal differences are subjective, not precise measurements. Do not award points for implementation effort, test counts, or agreement with a presumed maintainer preference.

## Output

Return:

1. Evidence coverage per subject, including exact screenshot names, inspected routes, recorded interactions, and unavailable checks.
2. A score table containing every subject, all six dimensions, the calculated overall score, and confidence. Briefly justify each subject's scores. Do not omit a reference subject's numeric overall score.
3. Concrete strengths and weaknesses of each product. Judge them on their own purpose before drawing comparisons.
4. Up to five priority Queue Arcade findings. Each needs severity, screenshot or reproducible interaction, affected component, player impact, a bounded fix, and a way to verify it. Label source-only risks as unverified in the browser. If there are multiple Queue Arcade subjects, identify the relevant subject rather than assuming which version is preferred.
5. A comparison across the inspected products. Name useful patterns and explain which game-loop differences make direct feature comparisons invalid.
6. What prevents an unqualified top score within the inspected scope, if anything. Return `none observed` if justified. Do not invent a backlog to fill this section.

Return the review to the parent. Do not read other reviews, edit application files, or publish anything.

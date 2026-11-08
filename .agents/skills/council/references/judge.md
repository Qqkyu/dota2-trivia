# Independent player UI review

Review the current Queue Arcade implementation read-only. Assess what the evidence supports. Separate observed behavior, source-code findings, and assumptions. Read the supplied product facts and inspect the supplied screenshots before scoring. Inspect relevant source or an isolated browser session to verify findings when possible.

## Product facts

Queue Arcade is a Dota browser game for players waiting for a match. A player can join anonymously, answer a live 15-second round, see the room's answer split, and leave at any time. Ten round formats rotate in one public room. Private parties have their own room. Desktop beside the Dota client is primary; phone reflow and full keyboard play remain supported. Steam sign-in is optional. The current Dota-inspired visual identity is intentional. Preserve server-owned timing, hidden answers until reveal, and the feedback-sound contract.

Use the current `README.md` and implementation to resolve current-state details. `PRODUCT.md` contains dated facts, not a substitute for observation. Judge the supplied comparison apps only on the pages you can inspect. Explain where their different game loops make a comparison invalid.

The maintainer keeps public crowd counts and the full split in the Room split card. Improve its placement rather than repeating those numbers elsewhere. Parties have no side rail and keep inline shares. Preserve this simplicity decision unless the user explicitly reopens it.

## Rubric

Score each dimension independently from 0 to 10, with a short evidence-based reason:

| Dimension | Assess |
| --- | --- |
| First action | Can a new player understand the game and start without mistaking sign-in for a requirement? |
| Play clarity | Can a player find the prompt, understand the current phase and deadline, choose, and recognize a locked answer? |
| Reveal and return | Does the result explain the answer, score, crowd split, and next step without obstructing the next round? |
| Visual craft | Are hierarchy, spacing, typography, contrast, artwork, and controls coherent and specific to this game? |
| Access and reflow | Can players use the keyboard, read focus and status, and play at the supplied sizes without clipping or undersized controls? |
| State and recovery | Are wait, loading, empty, invalid join, network failure, and party paths clear and recoverable? |

Calculate the overall score as the unweighted mean of the six dimensions, rounded to one decimal. State coverage and confidence separately. If a dimension cannot be assessed, mark it `not assessed`, explain why, and average only the assessed dimensions. Never replace missing evidence with an invented score.

The scale describes usability and craft. A 0 means unusable, 5 means usable with substantial friction, 8 means well resolved with concrete remaining flaws, and 10 means no material defect found within the inspected scope. Decimal differences are subjective, not precise measurements. Do not award points for implementation effort, test counts, or agreement with a presumed maintainer preference.

## Output

Return:

1. Evidence coverage, including exact screenshot names, inspected routes, interactions, source files, and unavailable checks.
2. Dimension scores with reasons, the calculated overall score, and confidence.
3. Two concrete strengths to preserve.
4. Up to five priority findings. Each needs severity, screenshot or reproducible interaction, affected component, player impact, a bounded fix, and a way to verify it. Label source-only risks as unverified in the browser.
5. A comparison with each inspected alternative. Name one useful pattern and one reason not to copy its game loop.
6. What prevents an unqualified top score within this scope, if anything. Return `none observed` if justified. Do not invent a backlog to fill this section.

Return the review to the parent. Do not read other reviews, edit application files, or publish anything.

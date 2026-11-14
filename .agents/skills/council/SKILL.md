---
name: council
description: Use when the user asks for a council, independent model reviews, or a scored UI comparison for Queue Arcade.
---

# Queue Arcade council

Adapted from [t3dotgg/tstack's council](https://github.com/t3dotgg/tstack/blob/main/skills/council/SKILL.md).
Use two independent reviewers on the user's existing subscriptions. The parent selects and implements fixes; reviewers assess read-only.

## 1. Fix the scope and the check

Read `PRODUCT.md`, `README.md`, and the relevant ADRs. Check the working tree and preserve unrelated work. Define the affected routes, states, viewports, and repeatable checks before editing. Complete known in-scope fixes first when the request identifies them.

Check recent maintainer decisions in the affected area's docs before accepting recommendations. The 7 November 2026 simplicity audit keeps the public answer split only in the Room split card. Include relevant constraints in judge packets. A reviewer suggestion does not override a maintainer decision.

For a player UI review, cover the lobby, entry wait, all ten round formats, answering, locked answers, reveals, party setup and play, profiles, and shared controls. Include keyboard operation, sound controls, error recovery, desktop, short windows, phone reflow, and English and Russian. Operator pages are outside this scope unless requested. Read `decisions.md` for the owner's current scope and approval rules.

Preserve the current Dota visual style and game rules during polish. A recommendation to replace the style or change the game needs the user's decision.

The council drives the implementation. Start with independent baseline reviews before making UI changes. Merge and verify their findings, choose accepted work within the owner's scope, then implement those changes. Do not commission a self-directed broad redesign or polish pass before the baseline council.

## 2. Prepare one evidence packet

Capture the unchanged app before the first UI edit. Keep that baseline for the entire run. Freeze the implementation while reviews run. Record the Git revision and any uncommitted diff. Capture rendered screenshots and interaction observations for the selected states and sizes. Include populated crowd results, correct/wrong/missed answers, and waiting/error states. Distinguish mocked rounds from real server interactions. Give both reviewers the same evidence and the same rubric from `references/judge.md`.

Inspect comparison apps before using them. Default candidates are [Dotadle](https://dotadle.net/) and [Guess the Hero](https://www.guessthehero.com/). Capture their current pages and record the URLs and date. Compare first-action clarity, answer selection, feedback, legibility, and responsive behavior. Their daily or match-guessing loops are not requirements for Queue Arcade. Report unreachable pages as unavailable, not as evidence.

Freeze the committed main reference and at least two competitor evidence sets for the entire run. Record capture identities and hashes. The first review scores three distinct subjects: committed Queue Arcade and the two competitors. Subsequent reviews score four: the current candidate, unchanged committed main, and the same two competitors. Give subjects neutral labels, rotate their order between rounds, and keep the evidence identical for the fixed references. Never tell reviewers which score the owner wants or show them previous scores.

Require each reviewer to score every supplied subject with the same rubric. Track every raw score separately by reviewer and round. Report movement in unchanged main and competitors as reference-score drift. Compare the candidate's gap to main and competitors within each round. Do not silently adjust scores or attribute a candidate's entire raw increase to implementation when the fixed references also rose. If reference coverage changes, version the packet and mark that break rather than calling it reviewer drift.

Use a task-local scratch folder. Keep durable findings and selected screenshots in the project before removing scratch files.

The existing responsive check can capture consistent evidence. Set `APP_URL`, `RESPONSIVE_SCREENSHOTS`, `RESPONSIVE_ARTWORK=1`, `RESPONSIVE_VIEWPORTS`, and `RESPONSIVE_CASES`, then run `node scripts/check-responsive-ui.mjs`. Use viewports and case IDs defined in that script. Without the artwork flag, the check blocks image API requests and can show artificial broken images. Label the synthetic presence, empty votes, and extended fixture timers in every review packet. Supplement those captures with real server interactions for locked answers, entry waits, crowd results, and errors.

## 3. Dispatch independent reviewers

Resolve exact model IDs and available effort variants with the harness's model lookup. The requested default pair is Opus 5.5 and GPT-6.1 Sol, both at high effort. Use the subagent tool with fresh contexts, not forks of the parent. Report an unavailable model or effort setting instead of silently substituting. Add more models only when requested.

Create a fresh, self-contained prompt using `references/judge.md`. Include only the product facts, scope, evidence locations, source paths, and output contract needed for the review. Never forward the raw conversation, a desired grade, previous scores, another review, or an instruction to raise a score. Keep synthesis and review files out of the evidence packet. For a second pass, use fresh reviewers and the same criteria without the previous reviews or a change list.

Dispatch both at once. Use separate browser contexts if they inspect the app. Reviewers may read source and use isolated browser state, but may not edit code, commit, publish, or write into shared report files. Collect each review privately before showing either to the other model.

## 4. Select fixes

Report each review's scores unchanged. Preserve disagreement rather than averaging it away. A model score is a subjective assessment, not a measured user outcome.

Check findings against rendered evidence and the code. Prioritize blocked play, misleading state, accessibility, and weak hierarchy before cosmetic preferences. Agreement helps prioritize a finding but is not proof. Record accepted and rejected findings with reasons. Do not add accounts, daily gates, leaderboards, monetization, or new game modes just to improve a review.

When the user authorized polish, make substantial accepted improvements across the existing UI, not only technical repairs. Improve composition, hierarchy, typography, spacing, controls, and feedback where the evidence supports it. Preserve the Dota identity, game rules, and prior maintainer decisions. Record rejected findings and owner decisions in `decisions.md` so later rounds do not reopen them. Run the repo checks and the affected player flow. Inspect the rendered result at the same sizes. Keep English and Russian copy consistent.

The current approval rule overrides routine commit-and-push permission: keep all work uncommitted through the loop. Before any commit, push, merge, or deployment, open annotated before/after screenshots for the owner to approve or veto. Never interpret a review score as shipping approval.

## 5. Reassess and stop

One full pair of reviews is one round. Start fresh reviewers after each checked improvement pass. Continue toward the owner's private target while concrete accepted improvements remain. Keep the same evidence-capture method and rubric. A lower or unchanged score is a valid result and stays in the record. Never rerun an unchanged build merely to obtain a more favorable score.

Stop when both members meet the owner's target, or pause for the owner when three rounds stay flat and remaining findings require owner decisions or conflict with agreed constraints. Explain the unresolved choices rather than declaring success or adding features. There is no default two-round cap.

Record the model, effort, evidence inspected, dimension scores, overall score, confidence, limitations, and remaining findings for each round. If a reviewer returns no score, record `no score`. If no UI changes were made, report a baseline only.

If this work involves an issue or pull request, link it to the OpenChamber session as soon as it is known. Put council results in the pull request description when there is one. Otherwise show the scores in the final reply and link to the saved evidence. State what changed, what checks passed, what remains unverified, and the next decision.

For the owner's final review, open one scrollable comparison sheet in OpenChamber's sidebar. Pair each changed screen with the original baseline at the same size and state. Use large BEFORE and AFTER labels, red rectangles on both images, and a short explanation underneath. Keep individual pairs available for zooming, plus bottom-of-page captures for long screens. Mark changing question content or fixture values as such; do not call them design changes. Put review images inside the project in an ignored folder, not only under `/tmp`. Wait for approval, apply vetoes, and recheck before committing anything.

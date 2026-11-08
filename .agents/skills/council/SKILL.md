---
name: council
description: Use when the user asks for a council, independent model reviews, or a scored UI comparison for Queue Arcade.
---

# Queue Arcade council

Adapted from [t3dotgg/tstack's council](https://github.com/t3dotgg/tstack/blob/main/skills/council/SKILL.md).
Use two independent reviewers on the user's existing subscriptions. The parent selects and implements fixes; reviewers assess read-only.

## 1. Fix the scope and the check

Read `PRODUCT.md`, `README.md`, and the relevant ADRs. Check the working tree and preserve unrelated work. Define the affected routes, states, viewports, and repeatable checks before editing. Complete known in-scope fixes first when the request identifies them.

For a player UI review, cover the lobby, entry wait, answering, locked answer, reveal, and party create/join. Include keyboard operation, sound controls, error recovery, desktop, and phone reflow. Operator pages are outside this scope unless requested.

Preserve the current Dota visual style and game rules during polish. A recommendation to replace the style or change the game needs the user's decision.

## 2. Prepare one evidence packet

Freeze the implementation while reviews run. Record the Git revision and any uncommitted diff. Capture rendered screenshots and interaction observations for the selected states and sizes. Distinguish mocked rounds from real server interactions. Give both reviewers the same evidence and the same rubric from `references/judge.md`.

Inspect comparison apps before using them. Default candidates are [Dotadle](https://dotadle.net/) and [Guess the Hero](https://www.guessthehero.com/). Capture their current pages and record the URLs and date. Compare first-action clarity, answer selection, feedback, legibility, and responsive behavior. Their daily or match-guessing loops are not requirements for Queue Arcade. Report unreachable pages as unavailable, not as evidence.

Use a task-local scratch folder. Keep durable findings and selected screenshots in the project before removing scratch files.

The existing responsive check can capture consistent evidence. Set `APP_URL`, `RESPONSIVE_SCREENSHOTS`, `RESPONSIVE_ARTWORK=1`, `RESPONSIVE_VIEWPORTS`, and `RESPONSIVE_CASES`, then run `node scripts/check-responsive-ui.mjs`. Use viewports and case IDs defined in that script. Without the artwork flag, the check blocks image API requests and can show artificial broken images. Label the synthetic presence, empty votes, and extended fixture timers in every review packet. Supplement those captures with real server interactions for locked answers, entry waits, crowd results, and errors.

## 3. Dispatch independent reviewers

Resolve exact model IDs and available effort variants with the harness's model lookup. The requested default pair is Opus 5.5 and GPT-6.1 Sol, both at high effort. Use the subagent tool with fresh contexts, not forks of the parent. Report an unavailable model or effort setting instead of silently substituting. Add more models only when requested.

Create a fresh, self-contained prompt using `references/judge.md`. Include only the product facts, scope, evidence locations, source paths, and output contract needed for the review. Never forward the raw conversation, a desired grade, previous scores, another review, or an instruction to raise a score. Keep synthesis and review files out of the evidence packet. For a second pass, use fresh reviewers and the same criteria without the previous reviews or a change list.

Dispatch both at once. Use separate browser contexts if they inspect the app. Reviewers may read source and use isolated browser state, but may not edit code, commit, publish, or write into shared report files. Collect each review privately before showing either to the other model.

## 4. Select fixes

Report each review's scores unchanged. Preserve disagreement rather than averaging it away. A model score is a subjective assessment, not a measured user outcome.

Check findings against rendered evidence and the code. Prioritize blocked play, misleading state, accessibility, and weak hierarchy before cosmetic preferences. Agreement helps prioritize a finding but is not proof. Record accepted and rejected findings with reasons. Do not add accounts, daily gates, leaderboards, monetization, or new game modes just to improve a review.

When the user authorized polish, make a bounded set of verified fixes. Otherwise stop after the assessment and recommendations. Run the repo checks and the affected player flow. Inspect the rendered result at the same sizes. Keep English and Russian copy consistent.

## 5. Reassess and stop

One full pair of reviews is one round. Default to a baseline and one fresh review after fixes for an initial experiment. Use the identical evidence-capture method and rubric. A lower or unchanged score is a valid result. Do not repeat reviews until a preferred number appears. Further rounds need a concrete unresolved defect and an agreed scope.

Record the model, effort, evidence inspected, dimension scores, overall score, confidence, limitations, and remaining findings for each round. If a reviewer returns no score, record `no score`. If no UI changes were made, report a baseline only.

If this work involves an issue or pull request, link it to the OpenChamber session as soon as it is known. Put council results in the pull request description when there is one. Otherwise show the scores in the final reply and link to the saved evidence. State what changed, what checks passed, what remains unverified, and the next decision.

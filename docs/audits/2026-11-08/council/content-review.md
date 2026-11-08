# Council evidence helper review

Reviewed by GPT-6.1 Sol on 8 November 2026.

This is a narrow review of `scripts/check-responsive-ui.mjs`, the council additions to `scripts/check-user-journeys.mjs`, and one selector in `scripts/check-party-crowd.mjs` against `ab0d4bb`.
The existing [content review](../../2026-10-06/launch-checks/content-review.md) still supplies the factual review. This pass does not repeat its upstream checks.

The helper gains an opt-in `RESPONSIVE_ARTWORK=1` setting, active only when a screenshot output directory is supplied. It allows artwork requests through the local app and waits for images to finish or reach a five-second timeout before capture. API snapshots, question fixtures, layout assertions, and normal check behavior stay unchanged. The helper changes no question, answer, clue, generator, runtime sound, or production code.

ESLint passed for the changed helper. A phone evidence smoke run passed 33 responsive checks with the setting enabled, and the saved home screenshot contains the loaded Dota brand mark. The earlier two-size fixture capture passed 136 checks. These are synthetic round layouts, not evidence of real player traffic, physical devices, or a new factual review.

The journey check gains 16 cases. They check party input focus and Enter submission, initial Create visibility, desktop shop-button intersections, visible verdict and gold for correct/wrong/missed answers, keyed crowd percentages, phase-correct timer labels, a fixed answer-section start, expired offline controls, and recovery. It uses the existing intercepted fixture API and changes no gameplay facts. The cases passed against the local UI, and ESLint passed for the changed script.

All other recorded catalog and script hashes still match the prior review. The UI changes outside those scripts affect presentation, form submission, and expired answer controls, not question data or scoring rules.

The party crowd check now finds the round-type group by its heading association instead of the old English-only `Games` label. Its viewport and reachability assertions stay unchanged. The first full gate caught that stale selector after the visible creation heading changed. This correction changes no runtime behavior or content. ESLint and the corrected check passed for 1, 20, 50, and 100 players at six viewport sizes, including the 101st-player rejection.

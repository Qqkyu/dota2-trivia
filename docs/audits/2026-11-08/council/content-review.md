# Council evidence helper review

Reviewed by GPT-6.1 Sol on 8 November 2026.

This is a narrow review of `scripts/check-responsive-ui.mjs` against `ab0d4bb`.
The existing [content review](../../2026-10-06/launch-checks/content-review.md) still supplies the factual review. This pass does not repeat its upstream checks.

The helper gains an opt-in `RESPONSIVE_ARTWORK=1` setting, active only when a screenshot output directory is supplied. It allows artwork requests through the local app and waits for images to finish or reach a five-second timeout before capture. API snapshots, question fixtures, layout assertions, and normal check behavior stay unchanged. The helper changes no question, answer, clue, generator, runtime sound, or production code.

ESLint passed for the changed helper. A phone evidence smoke run passed 33 responsive checks with the setting enabled, and the saved home screenshot contains the loaded Dota brand mark. The earlier two-size fixture capture passed 136 checks. These are synthetic round layouts, not evidence of real player traffic, physical devices, or a new factual review.

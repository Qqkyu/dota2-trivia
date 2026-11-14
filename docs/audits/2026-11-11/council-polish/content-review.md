# Content review for the council polish

This review covers the browser-check changes since `c72a0c0`. The patch-stamped catalog, content generators, public-question logic, server timing, and API routes are unchanged.

The factual review recorded in [the prior council review](../../2026-11-08/council/content-review.md) remains the basis for patch 7.41f. This note does not claim a new upstream audit.

Eight reviewed scripts changed:

- `scripts/check-layout.mjs` checks the single public Room split, its visible score summary, and stable desktop power-up controls instead of a redundant presence card's reveal height.
- `scripts/check-hero-search.mjs` keeps keyboard search and stable answering-to-locked checks. It checks the intentional compact reveal, named correct/wrong cards, disabled controls, and party shares.
- `scripts/check-party-ended.mjs` includes the last party state in its timeout error. The existing conditions and deadline are unchanged.
- `scripts/check-party-previews.mjs` includes the form state, click target, and a bounded request/response/failure trace in timeout errors. Its preview, validation, creation, deadline, and native-click assertions are unchanged. Screenshots respect the task's temporary directory. One isolated run caught a failed lookup before creation; four later runs passed. The network cause is unconfirmed.
- `scripts/visual-flashback.mjs` checks the visible year-action label instead of concatenating the hidden width-reservation label. It also checks the browser's accessible name in ready and locked states. Slider, submission, reveal, and height assertions remain. Screenshots respect the task's temporary directory.
- `scripts/check-russian.mjs` uses the extracted `scripts/lib/russian-copy.mjs` checker. It matches whole proper names, so it does not strip "Io" from "International". Known game, update, and event titles stay in English. The checker still inspects instructions around them and returns the original offending text. Eight unit cases include a replay of all 191 localized Flashback records. The replay has no reported issues. No question text changed.
- `scripts/check-user-journeys.mjs` adds English and Russian cases for clue stability, phone ordering, recovery, practice-answer bounds, party form order, previews, and compact reveals. Later cases check phone choice results beside the timer, Quote Hunt unlock thresholds, native roster scrolling, wrong-order comparisons, offline clock recovery, single answer status, included score contributions, wrapping score labels, compact item/recipe results, party shares, bilingual search, and round restoration. Its result-position check permits upward reveal compaction but rejects downward movement. Answering and locked controls still have stable-position checks.

The tests use local fixtures or the local server. Fixture questions, counts, and media are not new gameplay facts. The catalog validators and unit tests passed. The first UI candidate passed the full browser gate, the second passed the full release gate, and the third passed 26 added journeys plus English/Russian layout checks. Full logs are retained separately.

Local review evidence is excluded from ESLint so archived source snapshots are not checked as application code. The reviewed application source still matches the round-6 frozen packet.

# Content review for the visual and multiplayer smoke checks

This review covers changes to two manual smoke checks that are not part of `pnpm check`. Their expectations dated from before PRs #55, #57, #58 and #65. The patch-stamped catalog, content generators, question logic, API routes and app code are unchanged. The [council polish review](../2026-11-11/council-polish/content-review.md) remains the basis for patch 7.41f. This note does not claim a new upstream audit.

- `scripts/multiplayer-smoke.mjs` reads public calibration in the first reveal after any older shared snapshot has expired. Since #57, public readers share one snapshot for 30 seconds, and the server rebuilds it only early in a reveal, so that no snapshot shows votes for an open question. The old check read at once. It passed only on a server that had served no calibration since it started. On a used server it failed every run, even though the stored reports were correct. The conditions on the response are unchanged.
- `scripts/visual-smoke.mjs` changes five expectations:
  - In the lobby, it looks for "Ten round types" in place of "ten games", following the #65 copy change.
  - On the privacy page, it uses the current sentences from #55 about play without an account, profile deletion, crash reports and the 30-day visit records. Each probe checks the same fact as before.
  - At a public reveal, the answer buttons, shop items and hero grid must show no percentages. Since #65 the Room split card is the only place for the split in the public room, and `scripts/check-layout.mjs` already fails if the answers repeat it.
  - In the full-catalog crowd stress cases, the hero and item grids must show no percentages, for the same reason.
  - A locked Aghanim's Lab clue must read "Upgrade details at Ns" and "Ability name at Ns", following the #58 copy.

Before the change, the visual check failed five assertions and the multiplayer check failed on every run against a used server. After the change, both passed on a fresh server and on a used one. The screenshots of the hero crowd reveal and the Aghanim's Lab layout show the states that the new expectations describe.

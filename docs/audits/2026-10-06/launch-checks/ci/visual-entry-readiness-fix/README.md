# Reveal entry timing

The saved-environment visual check failed after all three browser accessibility checks passed. Its [original log](initial-visual-smoke.log) records an exit before the first-entry reveal scenario. The helper made at most four round requests and did not include the shared 800 ms vote grace when it chose its next polling time.

Two [real API reproductions](reveal-window-repro.log) preserved that failure. The [second run](reveal-window-repro-2.log) started in a reveal with too little time left, then failed in the next round. In the first run, the API still reported the answering phase 171, 327, and 485 ms after the answer deadline. Those responses were correct under the shared grace period. The [phase comparison](observed-round-phases.json) verifies every saved response against that rule.

The [legacy helper](reveal-entry-legacy.mjs.txt) failed all three initial focused cases. The [corrected helper](sources/scripts/lib/reveal-entry.mjs.txt) uses the shared grace constant and a 60-second total deadline. Each request, including its JSON body, has a five-second deadline with a timer that keeps the Node process alive. It validates the phase and timestamps, and subtracts the elapsed request time measured by a monotonic clock. It still requires at least five seconds of usable reveal time.

All 12 [final focused tests](reveal-entry-green.log) passed. They cover entry before and during grace, a reveal with too little time left, a delayed snapshot, malformed data, HTTP failure, and stalled headers or bodies. The [red test log](reveal-entry-red.log) preserves the earlier failures. [Source snapshots](provenance.json) and the [visual check difference](visual-smoke-change.patch.txt) bind the implementation. Application round timing did not change.

The corrected helper then found a usable reveal through the [real API](reveal-window-green.log). The [next full visual run](intermediate-visual-smoke.log) reached its final assertions and failed the stale settings predicate described below. Its source remains in the [intermediate snapshot](sources/scripts/visual-smoke-before-settings.mjs.txt). The [final full visual rerun](final-visual/result.json) passed with exit zero using both corrections. It ran from 10:50:20 to 10:52:24 UTC on October 10. The [source freeze](browser-wait-source-freeze.json) binds all four changed test files, and final lint passed. The [desktop lobby screenshot](final-visual/lobby.png) shows the final 45% muted settings fixture. All saved-environment preflight checks are complete. A successful workflow for the exact release candidate is still pending. The separate [lobby archive](../party-lobby-readiness-fix/README.md) records the passing UI batch and browser accessibility follow-up.

## Settings fixtures

The visual check still expected a 10% default volume and seeded obsolete or shadowed settings keys. The existing app defaults to 70%, reads settings v4 first, and migrates an older v3 volume of 10% or less to 70%. It preserves the mute setting. The [application excerpts](settings/app-settings-excerpts.txt) match the unchanged app source in the failed CI candidate.

The [reduced red proof](settings/lobby-metadata-red.log) failed only the default volume, migrated volume, and mute predicates. The revised fixture clears storage before each scenario, checks a muted v3 value of 10% migrating to 70%, then checks a muted v4 value of 45%. An [intermediate 43% fixture](settings/lobby-metadata-invalid-step.log) failed because it did not match the slider's five-point step. That test value was corrected to 45%. The [green proof](settings/lobby-metadata-green.log) passed every predicate. The [fixture difference](settings/settings-fixture-change.patch.txt) changes only the test.

## Completed independent flows

The [multiplayer check](completed-flows/multiplayer.log) passed against PostgreSQL. Two votes persisted, deadlines matched, and a duplicate vote was rejected. Its account and OpenID checks used synthetic records and provider-boundary checks; they did not perform an interactive login with the owner's Steam account. The [packaged cleanup dry run](completed-flows/cleanup-dry-run.log) also exited zero and reported no eligible records in the temporary test database. These follow-ups do not change the failed GitHub run into a successful release check.

The [failed runner cleanup](../runs/38043410114/cleanup-result.json) then removed its owned container, dedicated volume, and registration without reported errors. The reusable runner image remains available for the next CI run.

# Audit checks and evidence

These checks cover the starting working tree recorded in [original-status.txt](evidence/original-status.txt). Application code remained unchanged. Generated test stores, synthetic accounts, browser profiles, and failure fixtures were separate from existing app data.

## Existing checks

| Check | Result | Evidence and qualification |
| --- | --- | --- |
| `pnpm validate-data` | Failed | [Log](evidence/validate-data.log). The Shopkeeper validator rejects local artwork on Disperser and Phylactery rows. The earlier generated-question validator passed. |
| The 17 later data validators, run separately | Passed | [Individual results](evidence/validators-individual.json). This preserved coverage after the main chain stopped. These checks are not independent proof of every fact. |
| `pnpm test` | Passed | [Log](evidence/unit-tests.log). 134 tests in 18 files. |
| `pnpm lint` | Passed | [Log](evidence/lint.log). |
| `pnpm typecheck` | Passed | [Log](evidence/typecheck.log). |
| `QUEUE_ARCADE_DIST_DIR=.next-check pnpm build` | Passed | [Log](evidence/build.log). Preserved the existing `.next` build. |
| `QUEUE_ARCADE_DIST_DIR=.next-check pnpm validate-client-bundle` | Passed | [Log](evidence/client-bundle.log). Fourteen private-catalog fingerprints absent from browser bundles. |
| `APP_URL=http://127.0.0.1:3210 QUEUE_ARCADE_DIST_DIR=.next-check pnpm check:ui` | Passed | [Log](evidence/ui-suite.log). All 15 component browser/API scripts completed, including all ten round identities, party limits, reports, search, layouts, and basic rate limits. |
| `APP_URL=http://127.0.0.1:3210 node scripts/check-native-feedback-sounds.mjs` | Passed | [Log](evidence/native-sounds.log). Ten native PCM output checks. The raw-lock and double-result negative controls failed as intended. The full UI suite separately passed 30 tapped PCM checks and its negative controls. |
| Original `scripts/multiplayer-smoke.mjs` against temporary PostgreSQL | Failed | [Log](evidence/multiplayer-postgres.log). The saved name changed because its null-avatar fixture triggered real public-profile enrichment. Further isolated runs found stale reveal timing and incomplete format fixtures. |
| Adapted smoke in a temporary file | Passed | [Final output](evidence/multiplayer-complete-formats.log). Covered account results and deletion, shared rounds, reports, reviewer changes, protected ops, analytics, and stable revisions. This does not make the original smoke test pass. |
| `pnpm audit --prod --json` | Failed | [Registry output](evidence/pnpm-audit-prod.json). Two production advisory entries. See the infrastructure report for actual preconditions. |
| Full dependency audit | Failed | [Registry output](evidence/pnpm-audit-network.json). Twenty-two entries, including repeated paths and development dependencies. |
| Docker runtime | Unavailable | The installed Docker command reported unavailable WSL integration. No claim is made that the final image runs. |

The full `pnpm check` chain is not green. Its first failing data step is enough to stop it. Running later checks independently supplied useful evidence; it did not change that result.

## Temporary smoke adaptations

The audit kept the repository's test unchanged. [multiplayer-deterministic.mjs](evidence/multiplayer-deterministic.mjs.txt) is a temporary diagnostic copy with these changes:

- Imports point at the audited workspace because the copy lived outside `scripts/`.
- The synthetic Steam identity has a non-null avatar URL, so profile rendering does not fetch and replace its test name.
- Reveal waiting includes the current 800 ms acceptance grace. The original waits only 200 ms.
- Private fixture lookup includes the Aghanim and Flashback catalogs, and uses revealed kind, prompt, and explanation to identify the row.
- The vote fixture can submit Flashback year and order keys.
- Additional diagnostics explain a failed reveal assertion.

The original profile, timing, and catalog failures are preserved in the `multiplayer-*.log` evidence. A separate [contract check](evidence/smoke-contract-check.json) confirms the missing answer keys and timing mismatch without network calls. Failed synthetic accounts were removed only from the new audit database before retrying. No real account was deleted.

The final smoke's `steamOpenIdBoundaryVerified` flag refers to login initiation and rejected invalid state. It does not mean a valid Steam sign-in or S1's duplicate-field boundary was verified. Its account deletion result covers the ordinary path, not deletion concurrent with pending requests.

## Independent user-flow and accessibility checks

The UI review used Chrome for Testing 153.0.8010.12, Playwright 1.61.1, and axe-core 4.14.0. It covered 18 supporting-page viewport states and 26 round viewport states. Fixtures use real catalog rows through the current public serializer. Keyboard checks capture the resulting vote request.

[ui-modern-results.json](evidence/ui-modern-results.json) records every state. All tested desktop states and supporting pages passed the automated rules. Five narrow hero grids failed the WCAG 2.2 target-size rule at 320 pixels. No tested document had horizontal overflow. These are automated results, not a complete accessibility certification.

Initial older axe and Chrome results were superseded. In particular, an old-scanner Shopkeeper label finding did not reproduce with the current scanner and was excluded. The final findings rely on current scans or directly observed browser behavior.

Attempts to extend the journey to cached Firefox and WebKit failed before an app page opened. Firefox 115 did not support the automation protocol expected by the installed Playwright. One WebKit build lacked `libavif.so.13`; the older build rejected a protocol setting. [Exact results](evidence/ui-cross-browser-results.json) record these environment failures. They are not app failures. No system packages were installed, and compatibility with those engines remains unverified.

[Functional browser evidence](evidence/functional-browser.log), [counter and storage evidence](evidence/functional-browser-extra.log), and [public two-tab evidence](evidence/functional-public.log) record actual local production flows. Controlled response ordering and delayed-store fixtures are labelled in the functional report. They establish the code's behavior under those conditions, not their production frequency.

## Database checks

Tests used PostgreSQL 14.19 in a new temporary cluster listening on a Unix socket. CI declares version 17. Source modules were transpiled into the fixture directory and connected to a new pool. Existing environment credentials were not used.

[PostgreSQL findings](evidence/postgres/findings.md) and the accompanying scripts record concurrent schema creation, mixed crowd snapshots, the 50,000-session analytics cap, duplicate-vote protection, and concurrent account creation. A local 1,000-vote burst measured database work with calibration disabled. It is not an HTTP capacity test or a prediction for Render.

[Profile reveal evidence](evidence/profile-reveal-check.txt), [partial-write evidence](evidence/cross-store-failure-check.txt), and [file-store evidence](evidence/file-store-checks.txt) use synthetic data. Controlled exceptions and path conflicts simulate failures without altering existing stores.

## Data and external checks

[content-inventory.json](evidence/content-inventory.json) records the catalog inventory, excluded rows, and targeted examples. [flashback-asset-heads.json](evidence/flashback-asset-heads.json) records successful HEAD responses for all 65 remote Flashback image URLs. All 55 local references across the complete catalog existed. HEAD success does not prove image decoding or factual correctness.

Order Up and Aghanim regeneration ran in temporary directories and matched all 80 and 84 committed rows semantically. The full mutating remote sync was not run. The installed older client produced six expected differences against current patch data; those are audit-tool version gaps, not six confirmed wrong answers.

[Render response headers](evidence/render-health-headers.txt) show owner suspension. [GitHub workflow state](evidence/github-workflows.json) shows disabled CI. No application headers or live database state can be inferred from Render's suspension page. [Metadata checks](evidence/metadata-origin-check.json) confirm that the local production `/party` page retains localhost metadata despite a different runtime origin.

## Reproduction notes

Run diagnostic scripts only against a new temporary store or database. Some scripts create and delete synthetic accounts or rows. They are audit evidence, not new production tests. Some reference this workspace, temporary helper modules, cached browser installations, or the original cluster socket. Review their setup before reuse; they are not portable one-command tooling.

JavaScript fixtures are archived with an additional `.txt` suffix so repository lint and test discovery do not ingest them. Detailed reports refer to their original temporary names. Copy the files to a temporary directory and restore the script suffix when preparing a repeat run.

For stable regression coverage, move each confirmed case into the existing test suite with explicit fixtures and cleanup. Keep the app's source changes separate from the audit evidence.

The evidence excludes private environment values, existing account identities, raw existing data stores, and real session credentials. All screenshots contain synthetic or public catalog content. Existing data was inspected only through aggregate counts and consistency checks.

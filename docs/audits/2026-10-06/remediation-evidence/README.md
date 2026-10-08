# Evidence for the audit fixes

These files record local verification on 6 October 2026. See [release status](../remediation.md) for conclusions and remaining gates. The earlier audit evidence remains in [the original evidence directory](../evidence/).

Tests used disposable files, synthetic identities, temporary browser profiles, and a local PostgreSQL 14 cluster. No real account, deployment, or production database was changed. Database dumps and fixture session records are not included here.

## Final source checks

| Evidence | What it checks |
| --- | --- |
| [Tests](tests-release.log) | 354 tests in 43 files. PostgreSQL tests ran with `TEST_DATABASE_URL`; none were skipped. |
| [Lint](lint-release.log), [build](build-release.log) | Complete ESLint check and production build, including TypeScript. |
| [Data](data-final.log), [content review](content-release-final.log) | Catalog validators and the final reviewed script/data hashes. |
| [Bundle](bundle-release.log) | Private answer catalog fingerprints do not enter browser bundles. |
| [Headers](headers-release.log) | Fresh nonces, protection headers, runtime metadata, and error pages. |
| [Dependency audit](dependency-audit-prod.json), [development audit](dependency-audit.json) | Registry advisory results after the dependency update. |
| [Final secret scan](secret-scan-final.json) | 372 text files and 29 reviewed candidates; no embedded production credential identified. Binary and private ignored files are outside this check. |
| [Source manifest](source-manifest.json) | Hashes of the final source, scripts, tests, public assets, configuration, and operating documentation. |

[Original file comparison](original-file-comparison.json) confirms that none of the 325 starting files was removed. There are 233 unchanged files and 92 files extended or corrected by this work. The original `AGENTS.md`, `tsconfig.json`, and the user's three item images are unchanged.

The build used `QUEUE_ARCADE_DIST_DIR=.next-check`. The normal build directory was preserved. Local tools were Node 24.15.0 and pnpm 9.12.1. The container targets Node 22 Alpine and still needs its CI run.

## Application and recovery checks

| Evidence | What it checks |
| --- | --- |
| [Browser gate](ui-release.log) | Complete `pnpm check:ui`, including the two new recovery scripts, all ten formats, native audio, tapped audio, and the production vote limit. |
| [PostgreSQL journey](multiplayer-release.log) | Shared rounds, answer secrecy, reports, reviewer permissions, profiles, analytics, and deletion. |
| [100-player party](capacity-result.json) | 100 concurrent accepted answers and a 100-vote reveal in one local process. This is not a Render capacity result. |
| [Restore](restore-full-result.json) | Full row equality across 13 restored tables, including synthetic accounts and sessions. |
| [Guest stress](gameplay-idb-browser.log), [100-pair trace](two-tab-stress-idb.log) | 200 accepted results, stale local mirror recovery, blocked storage, delayed requests, keyboard behavior, and score correction. |
| [Guest fault review](guest-idb-fault-review.md) | Independent transaction abort and callback rollback checks. |
| [Score and navigation review](gameplay-cross-review.md) | Four independently reproduced client failures and their passing repeat checks. |
| [Media and security review](cross-review-media-security.md) | Independent review of media bounds and request protection. |
| [Accessibility](accessibility-results.json) | 44 state scans in Chromium 153 with axe 4.14. Desktop passes; five narrow hero-grid states retain small targets. |
| [Reviewer accessibility](ops-a11y-results.json), [profile outage](profile-outage-results.json) | Keyboard data access and recoverable account-store failures. |
| [Standalone headers](standalone-headers-release.log), [standalone play](standalone-public-play-release.log) | Freshly staged standalone package with its own disposable stores. |
| [Packaged migrations](packaged-migrations-release.log), [packaged cleanup](packaged-cleanup-release.log) | The release package contains working database commands. Cleanup was a dry run. |
| [Render schema](render-schema-result.json) | Blueprint structure matches the official schema. No Blueprint was applied. |

The older stock browser scripts use installed Chrome 121. The new gameplay checks and native audio checks used Chromium 153 through `CHROME_BIN`. The independent IndexedDB fault review also passed in Chrome 121. Native sound tests record a private PulseAudio sink; they do not claim human listening judgment.

The full browser gate uses live local requests except where the recovery scripts deliberately substitute failures, delayed replies, or controlled rounds. Those scripts still exercise the actual page and browser events. The standalone package check preserves pnpm dependency symlinks, as Docker COPY does. It does not replace execution of the Alpine container.

Additional one-off check sources are archived as `.mjs.txt` files so repository lint does not treat them as application scripts. Their temporary paths describe the original test setup. The main regressions are repeatable through the committed tests and `scripts/check-ui.mjs`.

## Independent model review

[Claude's final review](claude-fix-review.md) and [usage metadata](claude-fix-review-metadata.json) record a read-only local pass with the requested Fable 5.1 model. It completed 76 turns with no tool denials. The reported availability and private-media findings received fixes and regression checks. Line numbers and thresholds in that output describe the tree at review time, before the final changes.

## Repeat the main gates

Use a disposable PostgreSQL database and the documented browser/media prerequisites in [operations](../../../operations.md). Export its connection as `TEST_DATABASE_URL`, then run:

```bash
pnpm check
```

The CI workflow adds the actual Docker build, scan, packaged migrations, and container app journey. Run that workflow for the chosen release commit before deployment. Do not point test scripts at real user data.

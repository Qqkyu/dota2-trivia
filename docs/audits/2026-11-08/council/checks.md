# Council pilot verification

The full gate passed on 8 November 2026 at `14:38:50.316Z`.

- Application commit: `9131d20cd44261871cb3b76f22b8a841750cf641`.
- Git tree: `b202f4fbd8979fa8470319876c9ce6a951ba0f0d`.
- Tracked working tree was clean when the gate completed.
- Later report and image commits contain no runtime changes and were not a separate full-gate run.

Command:

```sh
QUEUE_ARCADE_DIST_DIR=.next-check \
TMPDIR=/tmp/dota2-trivia-council \
JOURNEY_EVIDENCE_DIR=/tmp/dota2-trivia-council/full-journeys \
pnpm check
```

## Passed

- Content-release hash check for 128 recorded files and all offline data validators.
- 76 unit-test files, 1,310 tests.
- ESLint with zero errors and 28 existing warnings.
- Strict TypeScript and the production build.
- Fourteen private-catalog fingerprints remained server-only, with zero browser-bundle matches.
- Public lobby, answer and reveal, all ten round formats, party creation/join, membership, preview, reports, recovery, and gold shop checks.
- English and Russian layout checks for 16 format cases at five widths.
- 68 player journeys, including the 16 added council cases.
- Round announcements, recipe announcements, and keyboard focus recovery.
- 2,489 responsive assertions across 11 sizes, including 320 px, phone landscape, 4K, and 200% reflow.
- Ten native sound-output checks, raw/doubled sound negative controls, 30 tapped PCM sound checks, and silent/truncated sound negative controls.
- Production vote rate limiting.

No browser script needed a retry in this final run. Earlier runs caught a stale party selector and the public-split duplication. Both were corrected before this pass. The earlier development-server sound abort did not recur in the final gate.

## Limits

Three test files and 58 tests were skipped. The supported extracted Valve client was absent, so direct Shopkeeper recipe, hero-roster, and Aghanim flag comparisons did not run. This UI pass changes no game facts and does not claim a new upstream content audit.

The responsive and most browser cases use intercepted API fixtures. Reviewers also exercised real local entry, locking, reveal, party, and recovery flows. This is not a physical-device, screen-reader, hosted Steam-login, production load, or human listening verdict. No feedback-sound checkpoint tag moved. No deployment ran.

The saved [passing-gate record](evidence/verification/check-pass.json) and [compressed full log](evidence/verification/pnpm-check.log.gz) preserve the source identity and results. Temporary servers, browser profiles, and task scratch files were removed after archiving.

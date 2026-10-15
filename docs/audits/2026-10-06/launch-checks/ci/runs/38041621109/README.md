# CI health readiness check failure

[Run 38041621109](https://github.com/Qqkyu/dota2-trivia/actions/runs/38041621109) tested commit `15617dcaf2a495418c163398732d5f57b1add238` on runner `queue-arcade-ci-20261010T093043Z`. GitHub recorded a failed run on October 10, 2026. The [workflow result](workflow-result.json), [job steps](workflow-jobs.json), and [full workflow log](workflow.log) retain that outcome.

All 1,284 tests in 64 files passed. The dependency audit, configuration, content and data checks, lint, typecheck, Next build, client bundle check, production image build, and configured image security gate also passed. The image gate checked fixed MEDIUM, HIGH, and CRITICAL findings. It did not cover every severity or unfixed issue.

The constrained check reached its initial application health request after it checked the packaged migration and database grant commands. Node 22.23.3 then exited with code 13 because the top-level health fetch had not settled. The failure occurred before the player workload. This log does not show that the application failed a completed health request.

The later production startup, browser, native audio, accessibility, synchronized room, and packaged cleanup checks were skipped. This run does not approve a release. The separate health readiness investigation and corrected checks do not change its historical conclusion.

The runner and its dedicated volume remained available for that investigation. This archive makes no cleanup claim. [Runtime metadata](runtime-metadata.json) describes the saved startup state. [Token metadata](token-lifecycle.json) records removal of the temporary registration token file.

The archive excludes private environment files, child database credentials, and runner diagnostic logs. The full workflow log retains GitHub's masking. Visible authentication strings and the account identifier belong to the workflow's synthetic test fixture. The [provenance record](provenance.json) binds the copied inputs, and the [secret scan](evidence-secret-scan.json) records the checks before copying them into the repository.

# CI runner cgroup failure

[Run 37802218519](https://github.com/Qqkyu/dota2-trivia/actions/runs/37802218519) tested commit `c8729a2b11b5723f99375e53cabc8fde6fd5fa31` on the disposable local runner. GitHub recorded a failed run on October 8, 2026. The [saved workflow result](workflow-result.json), [job steps](workflow-jobs.json), and [complete workflow log](workflow.log) retain that result.

All 1,284 tests in 64 files passed. The dependency audit, content and data checks, lint, typecheck, Next build, client bundle check, production image build, and configured image security gate also passed. That gate checked fixed HIGH and CRITICAL findings. It was not a full-severity security clearance.

The constrained container check failed before the application started. The nested Docker runtime could not create a limited container because its cgroup v2 parent was in threaded mode. The later production startup, browser, audio, accessibility, room, and cleanup checks did not run. This run therefore does not approve a release.

The [separate red and green probes](../../cgroup-fix/README.md) reproduce the runner failure and test its correction. They do not change this historical workflow conclusion. The outer container and its volume remained available for that investigation. This archive makes no cleanup claim.

The copied files exclude runner diagnostic logs and credentials. GitHub already masked its database connection credentials in the saved workflow log. The visible authentication strings and account identifier belong to the workflow's explicit synthetic test fixture. The [secret scan](evidence-secret-scan.json) records the archive checks.

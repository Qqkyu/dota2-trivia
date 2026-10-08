# Workflow argument failure and checked fix

[Run 37799841251](https://github.com/Qqkyu/dota2-trivia/actions/runs/37799841251) used exact commit `c9546063069b76fe2776c588d21d993d98be8aca` on the local runner. The frozen dependency install, browser installs, production dependency audit, configuration check, content release check, and data validation passed.

The test step stopped before it ran any tests. pnpm 9.12.1 treated `--maxWorkers=2` in `pnpm test --maxWorkers=2` as a pnpm option and rejected it. The workflow now calls `pnpm exec vitest run --maxWorkers=2`. The package's test script is `vitest run`, so the suite and worker limit are unchanged.

A local recheck used the same installed pnpm 9.12.1, candidate checkout, runner user, CPU and memory limits, and a fresh synthetic PostgreSQL 17 database. All 1,284 tests in 64 files passed in 32.04 seconds. Lint and typecheck also passed. `next-env.d.ts` was absent before typecheck. The [recheck result](argument-recheck/result.json) and its logs record these checks. This follow-up was not a new GitHub workflow run.

The container, dedicated volume, and registration were removed. [Cleanup](cleanup-result.json) reported no errors. The archived workflow and recheck logs passed Gitleaks without findings. The corrected workflow still needs a complete GitHub run before release.

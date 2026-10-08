# Player journey evidence

Final production build: `IqM7S-izzhLw1FS90-lLJ`, tested on the isolated local server at port 3320. The 54 journey checks and 18 gameplay recovery checks passed. Both processes exited 0.

`functional.md` records defects, fixes, scope and limits. `security-identity.md` records the independent server/client identity review and its final sign-off. `production-scroll-user-journeys.json` contains each final journey result. `journeys-production-scroll.log` and `gameplay-production-scroll.log` contain the final browser gate results. The earlier 45-case files are retained as historical evidence. `scroll-baseline.log` and the baseline screenshot show the hidden-prompt defect before its fix; `scroll-fixed-user-journeys.json` records the nine added transition checks. Baseline evidence is limited to confirmed app defects; initial fixture selector mistakes are excluded.

Durable checks are `scripts/check-user-journeys.mjs` and `scripts/check-gameplay-recovery.mjs`. Set `APP_URL` to the test server. `ALLOW_LIVE_JOURNEYS=1` enables isolated loopback-only party endpoint tests. `JOURNEY_PROFILE_COOKIE` enables the synthetic profile error/cancel scenario; it never deletes that account. The default journey suite mocks API calls and uses the real public question serializer.

The historical, inert `touch-native-debug.mjs.txt` script demonstrates Chromium's post-slider gesture click suppression on plain HTML. It is supporting diagnostic evidence, not part of the production gate. It refers to the original local source path and development test port.

The typecheck and ESLint logs are empty because both checks passed without diagnostics. The root audit owns the complete build, native audio, infrastructure, security, data and accessibility gate results.

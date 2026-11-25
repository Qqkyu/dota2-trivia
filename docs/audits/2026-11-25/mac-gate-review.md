# Content review for the macOS gate

This review covers the script changes that let the full gate run on macOS. The patch-stamped catalog, content generators, question logic and API routes are unchanged. The [council polish review](../2026-11-11/council-polish/content-review.md) remains the basis for patch 7.41f. This note does not claim a new upstream audit.

- `scripts/lib/chrome-binary.mjs` is new. It picks the installed Chrome for the platform, and `CHROME_BIN` still overrides it. Twelve browser checks and `scripts/lib/feedback-browser.mjs` use it instead of a bare `google-chrome`. Apart from the next two items, nothing else in them changed.
- `scripts/check-party-ended.mjs` waits for the party lobby, which shows once the tab has joined. It waited for the outer section, which also shows while the tab joins, so a fast machine ended the party too early. The conditions and deadlines after that point are unchanged.
- `scripts/check-native-feedback-sounds.mjs` runs itself in a Linux container on macOS. The cases, thresholds and negative controls are unchanged. `scripts/lib/native-audio-container.mjs`, `scripts/native-audio/entry.mjs` and `scripts/native-audio/Dockerfile` are new. A missing Docker engine fails the check.

On macOS the native check passed six of six runs. Both negative controls still failed as required, and so did runs without a Docker engine and without an app. The party-ended check passed five of five runs after failing every run before the change.

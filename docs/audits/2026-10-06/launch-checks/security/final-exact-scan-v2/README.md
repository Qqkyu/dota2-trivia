# Final evidence scan, corrected Steam key lookup

This directory supersedes the earlier [prepared operator](../final-exact-scan/README.md). The earlier helper and six-value checks recognized `STEAM_API_KEY`, but the app uses `STEAM_WEB_API_KEY`. Those checks did not cover the configured Steam web key. The corrected operator requires the actual key name. It checks seven app values and two operator values. Historical reports remain unchanged; the separate Steam provider validation remains valid.

This directory contains the corrected operator for the final evidence commit. Preparing and testing this operator did not scan the final commit. Run it after all evidence writers finish and the final evidence commit exists.

The operator reads each file from its exact Git blob. It checks the blob ID and ignores Git export attributes. It scans all paths with the pinned Gitleaks binary. It removes only the upstream configuration's global path exclusions. A separate check looks for seven configured app values and two hosting credentials in raw bytes, URL encoding, and JSON escaping. Those values stay in memory.

The operator also checks bounded gzip payloads and tar member bodies. It checks the complete decoded tar container to cover metadata. It rejects other archive formats, nested archives, symbolic links, and private file paths. New Gitleaks findings fail the scan until someone reviews the exact file hash and finding location. The original baseline contains 67 previously reviewed findings from release `da28a646479fab030e9b02b187e177c0f89555b9`. The command below uses a combined file with those records and three exact manifest findings rechecked on source candidate `6e1eace126e89341052dddbd76eeb4ad4de584e6`. It does not approve findings in changed files.

Use an evidence commit with one parent, the verified app release. Keep `refs/heads/codex/launch-checks-20261006` on that parent during the scan. The operator checks that the main checkout HEAD, real index, and release ref stay unchanged. It does not check out, stage, commit, push, or contact a hosting API.

The default local inputs are:

| Input | Path or source |
| --- | --- |
| Repository | `/home/kulmisiu/dev/dota2-trivia` |
| App environment | `/home/kulmisiu/dev/dota2-trivia/.env.local` |
| Render recovery directory | `/home/kulmisiu/dev/dota2-trivia/.local-assets/operator-recovery-20261010/render-productionize-private` |
| Render recovery files | `runtime-verified.json`, `environment-before.json` |
| Gitleaks binary | `/home/kulmisiu/.cache/gitleaks/queue-arcade-audit/gitleaks` |
| Gitleaks configuration | `/home/kulmisiu/.cache/gitleaks/queue-arcade-audit/gitleaks.toml` |
| Reviewed findings | `/tmp/dota2-trivia-audit-close/reviewed-findings-baseline.json` |
| Render API credential | The existing `RENDER_API_KEY` environment variable |
| GitHub credential | The local `gh auth token --hostname github.com` command, captured in memory |

The original `.env.local` stays in place. The operator requires a regular file owned by the current user, with no symbolic link or group/world write permission. Other app environment paths must have mode `0600`. The recovery directory must be owned by the current user and have mode `0700`; its files must have mode `0600`. Missing inputs, changed scanner hashes, or a different count of configured values stop the scan. No secret is copied into this archive.

After setting `EVIDENCE_COMMIT` and `APP_RELEASE_COMMIT` to the exact 40-character commit IDs, run:

```sh
python3 /tmp/dota2-trivia-audit-close/final-exact-scan.py \
  --commit "$EVIDENCE_COMMIT" \
  --release-commit "$APP_RELEASE_COMMIT" \
  --reviewed-findings /tmp/dota2-trivia-audit-close/reviewed-findings-through-6e1eace.json \
  --output-dir /tmp/dota2-trivia-audit-close/final-evidence-scan
```

The output directory must be new and outside the repository. All path inputs have explicit command-line options; use `--help` to see them. The command exits with zero only when the scan passes. It prints a value-free summary or a fixed failure code. Keep the output private until review. Do not publish the snapshot, raw scanner log, or redacted report without a separate review. The final exact scan can stay outside its own commit to avoid a circular record of the commit ID.

The [independent review](independent-review.json) records 28 passing isolated tests with synthetic credentials and temporary Git repositories. The [Gitleaks fixture result](gitleaks-all-paths-result.json) shows that the upstream configuration excludes a synthetic SVG and lockfile, while the derived configuration detects both. The [earlier test log](review-tests-before.log) preserves a stale fixture expectation after the helper added full tar-container coverage. The final tests include checks for known values in tar metadata, inconsistent scanner results, recovery-directory ownership, and the actual Steam key name. The legacy alias is scanned if present, but it cannot replace the required `STEAM_WEB_API_KEY`. These tests verify the operator, not the final application release.

To repeat the isolated checks from this directory:

```sh
python3 review-tests.py
python3 test-gitleaks-all-paths.py \
  --gitleaks-bin /home/kulmisiu/.cache/gitleaks/queue-arcade-audit/gitleaks \
  --gitleaks-config /home/kulmisiu/.cache/gitleaks/queue-arcade-audit/gitleaks.toml
```

The seven app values comprise one auth secret, one voter salt, two database URLs, their two passwords, and one Steam web key. The operator values are the Render API credential and the GitHub credential. The [corrected source-candidate check](steam-web-key-correction.json) found no matches for these nine values in all 1,656 exact raw blobs of `6e1eace126e89341052dddbd76eeb4ad4de584e6`. That check does not replace the final Gitleaks and expanded-payload scan.

The [credential lookup check](credential-readiness-steam-key-corrected.json) confirms the nine values are available at the current private paths. A check of the retained paths must follow the cleanup move. No secret value appears in either record.

The separate [source-candidate wrapper](scan-candidate-known-values.py) repeats the nine-value check before a source candidate is pushed. Its [independent review](known-values-wrapper-review.json) records 14 passing isolated tests. It reads exact raw blobs and leaves Git unchanged. It does not run Gitleaks or expand compressed payloads. Run it with an exact `--commit` and a new absolute `--output` JSON path outside the repository. Before the cleanup move, pass `--private-recovery-dir /tmp/queue-arcade-launch-checks/render-productionize-private`; after the move, the default uses the retained recovery directory. Repeat its isolated tests with `python3 review-known-values-wrapper.py`.

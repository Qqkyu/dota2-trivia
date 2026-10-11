# Source candidate secret scan

The pre-push checks passed for `31961cbd762587225b4b8a814828dc0829952978`, whose parent is `64046c2d198fcbfe556599e727ae0638423a3482`. The candidate changes the visual smoke test and its content-manifest hash. It does not change the app or questions.

The [review result](additional-review.json) confirms that all 1,657 files passed to Gitleaks match the candidate's exact raw Git blobs. All 67 findings are reviewed nonsecrets. Sixty-four match earlier reviewed file hashes and finding locations. Three are SHA-256 entries in the changed content manifest; each matches its candidate file. All 127 manifest inputs and the evidence digest were checked.

The [corrected known-value check](corrected-known-values.json) found no matches for seven app values and two operator values, including `STEAM_WEB_API_KEY`. It checked raw bytes, URL encoding, and JSON escaping. The [older scanner summary](summary.json) reports its original six-value check, which omits the actual Steam key name. Use the corrected result for credential coverage.

The [source comparison](../final-source-comparison-31961cb-20261010.json) confirms that all 454 non-audit working files matched the candidate at the check time. Audit evidence was excluded because writers were still active. Git HEAD, the real index, and the release ref did not change during these checks. This review did not push the candidate.

The [extended review file](reviewed-findings-through-31961cb.json) contains 76 exact review records. Pass it explicitly to the final scanner. The [three added records](new-reviewed-findings.json) apply only to the current content-manifest bytes.

These results use the existing pinned Gitleaks configuration. They do not replace the final evidence scan, which removes global path exclusions and checks expanded compressed payloads. The [corrected final operator](../final-exact-scan-v2/README.md) remains unchanged. Its archived example refers to an older baseline; the final command must use the current release and latest reviewed-findings file.

The archive contains value-free reports and hashes. The raw snapshot, scanner log, credential sources, and redacted matches remain outside this archive.

# Exact source candidate security review

These safe records describe commit `31961cbd762587225b4b8a814828dc0829952978` before its push. The [summary](summary.json) covers 1,657 files and 130,489,954 bytes. It records no forbidden local files or oversized files.

Gitleaks exited with code 1 because it reported 67 detector findings. The [additional review](additional-review.json) matched 64 unchanged findings to prior exact reviews and rechecked three content-manifest digests. It verified 127 manifest file digests, the content evidence digest, and zero unreviewed findings. [New reviewed findings](new-reviewed-findings.json) records the three new manifest locations and classifications. This is a reviewed detector result, not a zero-finding scan.

The original [six-value check](known-secret-scan.json) omitted the configured Steam Web API key. The [corrected known-value check](corrected-known-values.json) is authoritative. It checked seven app and two operator credential values in raw, URL-quoted and JSON-escaped forms against the exact raw Git blobs and found no matches. The added review confirmed that the archived Git bytes match those blobs. No credential values are included here.

These records do not replace the separate production image scan or the final scan of all evidence paths and expanded payloads. Raw finding payloads, credential inputs and the 130 MB source snapshot are not copied into this subarchive. Parent provenance binds the copied records to their original bytes.

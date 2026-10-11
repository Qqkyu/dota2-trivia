# Exact candidate scan

Commit `15617dcaf2a495418c163398732d5f57b1add238` passed the file and credential review. The [inventory](inventory.json) covers all 1,652 regular files, 130,459,347 bytes. No private local path or file above 100 MiB is present. All 519 audit JSON files parse.

Gitleaks reported 67 candidate matches. The initial [summary](summary.json) retains its one unclassified match. The [manual review](manual-review.json) resolves it as a unit-test assertion of permitted environment variable names, with no credential value. The remaining matches are 58 SHA-256 fields, six unchanged anonymous publisher fields, one public image filename, and one explicitly synthetic test secret. [Reviewed match locations](reviewed-findings.json) contain no matched values.

Six configured app and database secret values matched no candidate files. Two additional hosting and GitHub credential values also matched no candidate files. No credential value is saved in this report. The checks read exact Git blobs, not the changing working tree.

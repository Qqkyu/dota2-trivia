# Exact health-fix commit scan

Commit `da28a646479fab030e9b02b187e177c0f89555b9` passed the exact-file and credential review. The [inventory](inventory.json) covers 1,654 regular files and 130,466,007 bytes. It contains no forbidden private paths or files above 100 MiB. All 519 audit JSON files parse.

All 67 Gitleaks matches have reviewed classifications in the [summary](summary.json). They consist of 58 SHA-256 fields, six unchanged anonymous publisher fields, one assertion containing environment variable names, one public image filename, and one synthetic test secret. Six configured app/database secrets and two hosting/GitHub credentials matched no files. No matched credential values are archived.

The [additional review](additional-review.json) also confirms that the health helper, its call site, and its test match the independently reviewed source hashes. This commit changes only those three files and the required content-release manifest, relative to the previous candidate.

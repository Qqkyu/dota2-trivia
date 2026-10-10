# Corrected workflow candidate scan

Commit `c8729a2b11b5723f99375e53cabc8fde6fd5fa31` contains 1,519 files and 128,537,513 bytes. The [inventory](inventory.json) comes from its exact Git blobs. It has no forbidden local files or files above 100 MiB.

The verified Gitleaks scan found 67 matches. Review classified 58 as file digests, six as unchanged anonymous publisher fields, one as an unchanged public image filename, and one as a synthetic ingress test secret. The remaining match is the environment variable name `INGRESS_EXPECTED_IPV4` in a helper's allowlist assertion. It is not a credential value. All findings are resolved in the [review result](review-result.json).

An exact-byte search found none of six known configured secrets. All 461 audit JSON files parse. See [known-secret check](known-secret-scan.json) and [JSON validation](json-validation.json). No repository credential was identified. Old Git history and text inside images are outside this scan. These records were written after the candidate commit.

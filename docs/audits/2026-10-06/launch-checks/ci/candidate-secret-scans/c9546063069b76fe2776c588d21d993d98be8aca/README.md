# Replacement candidate scan

Commit `c9546063069b76fe2776c588d21d993d98be8aca` contains 1,491 files and 127,898,739 bytes. The [inventory](inventory.json) comes from its exact Git blobs. No forbidden local file or file above 100 MiB entered this commit.

The same verified Gitleaks binary and official configuration used in the [earlier exact scan](../../candidate-secret-scan/README.md) found 66 matches. Review classified all of them as 58 file digests, six unchanged anonymous publisher fields, one unchanged public image filename, and one synthetic ingress test secret. No repository credential was identified. An exact-byte search for six known configured secrets found no matches. All 445 audit JSON files parse. See [review results](review-result.json), [known-secret check](known-secret-scan.json), and [JSON validation](json-validation.json).

This candidate includes the Sharp 0.35.5 fix. These new scan reports were written after the commit. The scan does not examine old Git history or text rendered inside images.

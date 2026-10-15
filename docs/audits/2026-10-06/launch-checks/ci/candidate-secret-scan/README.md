# Exact candidate scan

Commit `ca7c89b3dcff21b3e8e5c4064f0638fea2407623` contains 1,425 files and 125,518,091 bytes. The scan read every file from this exact Git commit. It did not substitute working-tree content. The [inventory](inventory.json) records each path, size, and SHA-256 digest. No ignored local credential file, quarantined asset directory, dependency directory, or build directory entered the commit. No file exceeds GitHub's 100 MiB limit.

Gitleaks 8.30.1 and its pinned official configuration matched the digests in the earlier [provenance record](../secret-scan/provenance.json). The scan disabled inline allow comments and used an empty ignore directory. Full redaction was enabled. All 66 findings were reviewed. They comprise 58 file digests, six anonymous public publisher-page fields, one public image filename, and one explicit synthetic test secret. The publisher page and image-replacement script are byte-identical to their earlier reviewed versions. The [reviewed findings](reviewed-findings.json) contain locations and classifications only.

An additional exact-byte check searched all candidate files for six distinct known configured secret values, including database credentials. It found no matches. Those values stayed in memory and were not logged. See the [result](known-secret-scan.json).

All 412 JSON files under the audit directory parse successfully. This check guards against a report copied during an incomplete write. See [JSON validation](json-validation.json).

No repository credential was identified in this candidate. This result does not prove that every possible secret is absent. The scan did not examine older Git history or text rendered inside images. These scan reports were written after the candidate commit and are not part of that commit.

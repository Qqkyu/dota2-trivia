# Firefox cache preparation

This helper is prepared. No real runtime entry has been removed, and no real bundle hash check has run. The metadata dry run passed. The helper passed 21 primary fixture tests and 26 independent fixture tests. [review.json](review.json) binds those results to its source hash.

The existing Firefox cache has the same file metadata as the audit copy, except for four empty runtime entries in the audit source. Before removing those entries, this helper requires completed hosted and CI checks, a fresh clean Windows report, new Windows checks for both exact bundle paths, and Linux owner, mount, and process checks. It compares the complete source file set after excluding only those four paths against the existing cache, including every file hash.

Removal uses fixed relative paths and open directory handles. The lock must stay an empty regular file with one hard link. Each update directory must be empty when removed. Changed identities, links, extra entries, active users, or different bundle bytes stop the helper. The existing cache is never changed. It checks both bundle hashes again after removal.

After root gives the hosted-complete signal, refresh `windows-task-users.json` with the reviewed Windows helper, then run:

```sh
python3 /tmp/dota2-trivia-audit-close/prepare-firefox-cache.py --execute --hosted-checks-complete --ci-complete
```

The default command omits `--execute` and checks metadata only. `--check-hashes` adds a read-only comparison. Successful execution writes the safe receipt `/tmp/dota2-trivia-audit-close/firefox-cache-preparation.json`. The pinned main cleanup helper remains unchanged and still runs its own collision and hash checks during retention.

Execution completed on 11 October 2026. The [UUID normalization receipt](../completed-20261011/firefox-font-uuid-normalization.json) and [four-entry preparation receipt](../completed-20261011/firefox-cache-preparation.json) confirm that the existing cache stayed unchanged. The earlier pending statements above describe preparation before execution.

# Firefox font UUID preparation

The read-only hash comparison found one changed file, `firefox/fonts/.uuid`. Both versions are canonical 36-byte version 4 UUIDs. The other 62 entries match exactly. The installed fontconfig version is 2.13.1. Its manual describes this file as a generated marker used to identify a font directory and select its cache filename. [Fontconfig 2.13.1 manual](https://manpages.ubuntu.com/manpages/jammy/man3/FcDirCacheCreateUUID.3.html).

The standalone normalizer first preserves the original source marker as `/tmp/queue-arcade-launch-checks/debug-backup/firefox-font-uuid-original.bin`, with mode 0600. The parent directory must have mode 0700. The pinned main cleanup helper retains that directory in the ignored operator recovery folder. No UUID value appears in public evidence.

The normalizer then replaces only the source marker with the existing cache marker. It pins the reviewed source and cache tree hashes, verifies all other 62 entries, checks UUID type, format, owner and link count, and refreshes process guards before mutation. It checks source equality and the unchanged cache after replacement. The four empty runtime entries remain for the frozen Firefox preparation helper. The frozen preparation and main cleanup helpers remain unchanged.

Eight primary fixture tests and eight independent fixture tests passed. A read-only run on the real trees passed. Execution remains pending until root runs the command below after CI and hosted checks are complete. Refresh the Windows process receipt first.

```sh
python3 /tmp/dota2-trivia-audit-close/normalize-firefox-font-uuid.py \
  --execute --hosted-checks-complete --ci-complete
```

Then run the unchanged four-entry preparation helper. The normalizer source hash is `59acad8de84a083213e3d14d0264e99e6cbe0b70782ec8792f5f64b74c9aaffa`. The normalizer's default mode only reads and compares hashes.

Execution completed on 11 October 2026. The [UUID normalization receipt](../completed-20261011/firefox-font-uuid-normalization.json) and [four-entry preparation receipt](../completed-20261011/firefox-cache-preparation.json) confirm that the existing cache stayed unchanged. The earlier pending statements above describe preparation before execution.

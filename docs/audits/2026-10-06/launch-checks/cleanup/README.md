# Audit cleanup plan

Local file cleanup is complete. The unchanged cleanup helper removed all 11 reviewed scratch roots after it retained 11 reusable tools and 24 private files totaling 109,052 bytes. The private files use mode 0600 under mode 0700 directories. The retained scanner inputs passed their check. [Completion receipts](completed-20261011/completion-summary.json).

Docker cleanup is pending explicit user approval. Automatic approval review blocked removal of the six reviewed image tags, the stopped restore container, and its volume before execution. Those resources remain in place. The exact scope and rejection reason are in the [Docker approval receipt](completed-20261011/docker-cleanup-approval-block.json).

The final tools remain in `/tmp/dota2-trivia-audit-close/` for the evidence commit, exact secret scan, and push. Delete this last folder after a successful push and retain required final receipts in the ignored recovery folder first.

The 11 reviewed audit directories used 26.73 GB at the inventory check on 10 October 2026. The exact paths are in [cleanup-plan.json](cleanup-plan.json). Another 814 name matches are excluded from removal. Some belong to older work. No wildcard cleanup is allowed.

The helper preserves reusable tools under `~/.cache/`. [reusable-tool-locations.json](reusable-tool-locations.json) records each path. The largest items are the Android SDK and the speech models. The helper repairs absolute paths in the speech environment and PostgreSQL wrappers, then checks those tools. It extracts only the Chrome tool from the portable tar. It discards that tar's copy of the app source during scratch cleanup. The Gitleaks binary and config remain available in `/home/kulmisiu/.cache/gitleaks/queue-arcade-audit/` for the final secret scan.

Private Render recovery files go under the existing Git- and Docker-ignored `.local-assets/operator-recovery-20261010/`. All retained private directories use mode 0700 and their files use 0600. The original `.env.local` stays in the repository unchanged. The helper does not make a second copy of it. It also preserves `.local-assets/flashback-originals` unchanged.

## Completed cleanup on 11 October

The Firefox preparation preserved the original font UUID in private recovery, aligned only the audit source marker, and removed four empty source runtime entries. The existing browser cache stayed unchanged. Both preparation receipts are in [the completion evidence](completed-20261011/).

The first deletion attempt removed ten roots. It then stopped at root-owned Orca test output directories in the final root. A separate reviewed helper changed the owner of exactly 178 listed directories to the audit user. It left their modes and groups unchanged and did not change the 451 regular files. Five primary tests and three independent tests passed. The helper, exact ownership plan, origin evidence, and execution receipt are archived in [the completion evidence](completed-20261011/). The unchanged main cleanup helper then resumed and removed the final root.

A final presence check confirmed that all 11 listed scratch roots are absent and all 11 retained tool directories are present. The [private retention check](completed-20261011/private-retention-verification.json) verified full hashes, ownership, modes, and Git and Docker exclusions. The [scanner input check](completed-20261011/final-scan-retained-inputs.json) verified the retained tool and all nine configured values without printing any value. No private backup contents or cleanup-state file are in this archive.

The following sections retain the reviewed plan and the earlier preflight history.

## Checks

The metadata dry run makes no file changes, reads no private values, and hashes no large trees. The helper passed 33 local fixture tests and 38 independent checks. [review.json](review.json) binds those results to the script hash. The fixtures test changed bytes of the same size, symlinks, hard links, path collisions, interrupted moves, private modes, archive traversal, process use, mount points, evidence mismatch, and exact removal scope. They do not prove that moved real tools work. The execute phase checks each real tool after it moves.

The helper refuses removal until both CI and hosted checks are complete, root has checked Windows file users, the retained tool and private-file hashes match, and the current launch evidence manifest covers the exact repository archive. It also requires its running source and plan to match the archived copies. Evidence must be present in the repository before cleanup. The final evidence commit follows cleanup, as root requested.

## Execution order

1. Finish CI, hosted checks, and the final container scan. Stop only task-owned processes. The CI agent handles its named runner, registration, volume, and optional runner image. Keep shared Docker base images and unrelated resources unchanged.
2. Keep the final evidence checker, committer, secret scanner, and this cleanup helper in `/tmp/dota2-trivia-audit-close/`. This folder is outside the 11-root removal list. Copy `cleanup-audit.py.txt` from this archive there as `cleanup-audit.py` before the launch scratch folder is removed.
3. Freeze a pre-cleanup launch manifest at `docs/audits/2026-10-06/launch-checks/archive-manifest.json`. Its file records must use `path`, `bytes`, and `sha256`, or a relative-path map of hashes. Include this cleanup archive.
4. Run the helper with `--execute --phase retain --hosted-checks-complete --ci-complete --windows-users-checked --evidence-manifest /home/kulmisiu/dev/dota2-trivia/docs/audits/2026-10-06/launch-checks/archive-manifest.json`. Supply those completion flags only after their checks have finished. This phase copies private recovery files and moves reusable tools. It leaves all 11 scratch roots present.
5. Run the same command with `--phase delete`. It checks retention again, then removes only the 11 listed roots. It removes `/tmp/queue-arcade-launch-checks` last. A private receipt remains in the ignored recovery directory. Capture only the helper's safe result counts for the public report; do not publish the private receipt.
6. Add the actual cleanup result to this archive, regenerate the final manifest, make the evidence commit, run the exact-commit secret scan, and push. Then delete the remaining `/tmp/dota2-trivia-audit-close/` folder. Do not delete it before the final push succeeds.

The helper does not contact Render, GitHub, Steam, or Docker. Filesystem writes under `~/.cache/` need the normal tool permission review. Do not rewrite historic audit reports to change their old temporary paths.

The separate [Docker cleanup preflight](docker-preflight-20261010/README.md) records
the exact six audit image tags and stopped restore fixture. Its reviewed helper
requires completed hosted checks and verified private-backup retention before
removal. It preserves shared images and unrelated resources. This preflight did
not remove anything.

## 11 October preflight

The Linux preflight at `2026-10-11T06:17:11.500054+00:00` confirmed the owners of all 11 scratch roots. Its mount and process checks passed. The Windows check at `2026-10-11T06:17:14.251974+00:00` found no audit-path matches or listed device-tool processes. The Windows check covers process metadata, not every open file handle. Refresh these checks immediately before cleanup.

The Firefox cache destination `/home/kulmisiu/.cache/ms-playwright/firefox-1532` now exists. The first metadata check found 63 matching entries by path, type, size, owner, and link target. A later full hash check found one changed file, `firefox/fonts/.uuid`. The other 62 entries match exactly. Both UUID files contain 36 bytes and pass the canonical version 4 UUID check. The read-only comparison is recorded in [the hash difference receipt](firefox-preparation/firefox-cache-hash-differences-20261011.json). The source has four extra runtime entries under `/tmp/queue-arcade-deep-review/browser-cache/firefox-1532/`:

- `firefox/.parentlock` is an empty regular file with one hard link.
- `firefox/updates/0` is an empty directory.
- `firefox/updates/downloading` is an empty directory.
- `firefox/updates` contains only those two empty directories.

A strict metadata check passed at `2026-10-11T06:23:49.820727+00:00`. All four entries belong to the audit user. None is a symlink, and no ancestor is a symlink. No entry was removed.

The installed fontconfig version is 2.13.1. Its official manual describes `.uuid` as a generated font-directory marker used to select cache files. This supports treating the single difference as runtime cache metadata. [Fontconfig 2.13.1 manual](https://manpages.ubuntu.com/manpages/jammy/man3/FcDirCacheCreateUUID.3.html).

After root confirms that hosted and CI checks are complete, refresh the process and ownership checks. Run the separate [source UUID normalizer](firefox-preparation/normalize-font-uuid-README.md). It first preserves the original 36 bytes under the existing private `debug-backup/` directory, then changes only the audit source marker. It requires the other 62 entries and both reviewed tree hashes to match. It leaves the existing cache unchanged and verifies that fact after the change. The main cleanup helper will retain the original marker with the other private backups.

Then remove only the empty source lock and the three source update directories. Use an empty-directory removal for each directory. Leave the existing cache unchanged. The pinned retention helper must then compare the complete file hashes before it reuses that cache. If any byte or path differs, stop and review the collision.

This adjustment does not change the 11-root deletion list, the cache destinations, or the reviewed cleanup helper. All other retention and manifest guards still apply.

The separate [Firefox preparation helper](firefox-preparation/README.md) implements this four-entry step. Its 21 primary and 26 independent fixture tests passed. The default is read-only; execution still waits for root's hosted-complete signal. It does not change the pinned main cleanup helper.

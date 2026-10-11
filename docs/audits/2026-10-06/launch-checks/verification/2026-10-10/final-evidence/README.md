# Audit evidence checks

The [final structural result](final-structural-check-20261011.json) passed at
07:20 UTC on 11 October. It checked 1,641 files and 56,866,298 bytes outside this
results folder. It parsed 664 JSON files and 463 JSONL records, then checked
837 local links in 91 Markdown files. All 51 evidence manifests, four refresh
records, 29 linked revision blobs and 28 compressed archives passed. All 335
original archived files remain unchanged. There were no structural failures,
narrow credential-pattern matches or concurrent changes.

The original result files remain unchanged. The precleanup global manifest was
preserved outside the archive before its stale generated copy was removed.
The final global manifest covers this report, the saved results and the reviewed
helper files as well as the structural check's input files.

The final check covers the completed hosted results and scratch cleanup receipts.
All 11 owned scratch roots were removed after the verified retention step.
Docker resource cleanup remains blocked by automatic approval review. The
[cleanup report](../../../cleanup/README.md) records the remaining resources and
the approval status. A passing archive check does not remove that blocker.

## Check before scratch cleanup

The [precleanup structural result](precleanup-structural-check-20261011.json)
passed at 07:01 UTC on 11 October. It checked 1,618 files and 56,667,160 bytes
outside this results folder. It parsed 649 JSON files and 463 JSONL records, then
checked 825 local links in 91 Markdown files. All 51 evidence manifests, four
refresh records, 29 linked revision blobs and 28 compressed archives passed.
The 335 original archived files were unchanged. The check found no structural
failures, narrow credential-pattern matches or concurrent changes.

The [repeat before the corrected freeze](precleanup-corrected-freezer-20261011.json)
passed at 07:07 UTC with the same input file count and bytes. The corrected
helpers and their reviewed tests live in this results folder, outside the
structural check's inventory. Their child manifest and local links were checked
separately. The global manifest includes them.

This result includes the completed CI and hosted acceptance evidence. Scratch
cleanup and its final receipts were still pending. It does not establish that
cleanup is complete. The earlier result files remain unchanged. The final result above supersedes this precleanup inventory for the current
reports. The global manifest includes this results folder and excludes only
itself.

These are archive checks. The [exact-release CI report](../../../ci/runs/38050315807/README.md)
and [hosting report](../../../hosting/README.md) record the app test results for
release `31961cbd762587225b4b8a814828dc0829952978`.

## Earlier checks

The earlier 10 October check found no broken local file links or changed archived evidence.
The [initial structural result](structural-check.json) records its time and exact input hashes.
CI and hosted checks were still in progress when that check ran. It does not claim
that the release passed either check.

The recorded pass covered 744 files and 37,136,447 bytes. It parsed 345 JSON files
and 463 JSONL records, then checked 400 local links in 52 Markdown files. All 19
scoped evidence manifest checks passed. The check also verified all 335 files in
the original archive against its unchanged manifest. All 12 compressed archives
opened, and the tar members had safe relative paths and ordinary file types.
No input changed during the check.

The [preflight before hosted checks](preflight-before-hosted.json) passed at
12:01 UTC on 10 October. It covered 1,326 files and 53,313,033 bytes outside this
results folder. It parsed 506 JSON files and 463 JSONL records, then checked 646
local links in 73 Markdown files. All 38 evidence manifest checks, four refresh
records, 29 linked revision blob checks and 24 compressed archive checks passed.
The original 335 archived files were unchanged. No input changed during this run,
and it found no prohibited files, broken links or narrow credential-pattern
matches. This is a preflight result. It does not freeze the archive or establish
that the pending CI and hosted checks pass.

The [preflight while proxy-policy approval was pending](preflight-awaiting-policy-approval.json)
passed at 13:00 UTC on 10 October. It covered 1,518 files and 56,134,410 bytes
outside this results folder, including the completed CI evidence and the new
hosting and cleanup helper records. All 759 local links, 45 evidence manifests,
four refresh records and the original 335 archived files passed. There were no
concurrent changes, structural failures or narrow credential-pattern matches.
The service was live on release `31961cbd762587225b4b8a814828dc0829952978`
with proxy trust set to `none`. The authenticated ingress proof passed, but
approval for the proxy-policy change and redeployment was still pending.
This preflight does not establish hosted acceptance or freeze the archive.

The earlier privacy checks found no symlinks, prohibited private paths or backup
files, token-pattern matches, private keys or signed cloud URLs. A separate review
of address-shaped strings and URLs with user information found package versions,
public advisory examples and local test fixtures. This is a narrow check of text and archive contents. It does not
replace the release commit's Gitleaks scan, exact known-secret scan or screenshot
review. It does not prove that all possible credentials are absent.

Historical source manifests remain separate from archived evidence manifests.
The former identify the files reviewed at that time. Their documented source
changes do not mean the evidence changed. The mixed database manifest also gets
a separate check of its ten archive evidence files, so source drift cannot hide
a changed migration report.

## Summary wording

An independent read-only review found two wording issues in the launch overview.
The content index links each answer to review evidence and checks coverage and
hashes. It cannot itself confirm factual truth. The Oct8 browser build also
predates the final driver and Sharp changes. The final summary must tie those
claims to the exact release CI results and retain the earlier build's limits.
These issues were sent to the main audit agent for the final overview update.

At the time of that review, the overview did not claim that the pending hosted
checks had passed. The final summary must cite the actual hosted results. It must
also keep the distinction between software emulation and a physical phone,
between speech recognition and human listening, and between the 466-player load
run and supported capacity.

## Repeat the checks

Run this command from the repository root after hosted results, cleanup receipts
and other reports are complete. Keep the earlier results unchanged.

If cleanup used a temporary global manifest, preserve its bytes outside the
archive first. Remove only that generated root `archive-manifest.json` before
this final saved check. The checker validates an existing global manifest, so a
stale manifest would make this check fail. Do not remove any child manifest.

```sh
python3 -B docs/audits/2026-10-06/launch-checks/verification/2026-10-10/final-evidence/check-evidence.py.txt --output docs/audits/2026-10-06/launch-checks/verification/2026-10-10/final-evidence/final-structural-check-20261011.json
```

Read the result and finish this report. Then write the final global manifest.
After that write, use read-only checks and keep commit, scan and push receipts
outside the frozen archive.

The [checker](check-evidence.py.txt) returns a nonzero status for structural
failures or credential-pattern matches. Its output gives paths and rule names,
never matched credential values. It excludes this results folder from its input
inventory to avoid a result containing its own hash. The final global archive
manifest must include this folder and exclude only itself.

The [validator tests](check-validator.py.txt) pass all 30 checks. They cover broken
links, malformed and changed manifests, duplicate paths, path traversal, mixed
source and evidence entries, source-manifest change records, and secret-safe output. See the
[test results](validator-tests.json).

The later source-manifest refresh records have a separate, explicit check. The
old classifier treated their metadata as file entries and produced
[false failures](manifest-refresh-classifier-before.json). The corrected checker
binds each known record to its before and after Git revisions.
It checks the linked manifest hashes, counts and input changes, then checks the
changed input and review-evidence blobs. All three
[focused checks passed](manifest-refresh-classifier-after.json), with 23 revision
blob checks. The [exact checker diff](manifest-refresh-classifier.diff) is saved.
The later [year-reveal smoke record](year-reveal-classifier-check.json) also passed
all six linked revision blob checks. Its [checker diff](year-reveal-classifier.diff)
adds only that exact path and revision pair. These focused checks did not run
broad archive validation or freeze the archive.

After the global archive is frozen, rerun the checker without `--output`. Writing
a new result would change a file covered by that manifest. Local heading anchors,
web destinations and screenshot pixels are outside this check's scope.

## Freeze the complete archive

The [corrected global manifest helper](freezer-exact-workflow-v2/freeze-archive.py.txt) includes every regular file
below `launch-checks`, including this folder and all nested manifests. It excludes
only the root `archive-manifest.json`. It records sorted relative paths, sizes,
SHA-256 hashes, the exact release commit, the file count and the total bytes.
It rejects symlinks, private paths, cache files and changes during the read.

The [11 October correction](freezer-exact-workflow-v2/README.md) permits one exact
archived workflow path and its parent directories. The original helper refused
that public file because its path contains `.github`. Both versions and their
test results remain in this archive.

The original helper passed [36 offline fixture tests](freeze-tests.json). These cover
missing, extra and changed files; malformed manifests; duplicate JSON keys;
unsafe paths; concurrent changes; and explicit replacement of an old manifest.
The [test source](test-freeze-archive.py.txt) and [log](freeze-tests.log) are saved.
An initial fixture expected the wrong byte total. Its corrected expectation passed;
the helper's size calculation did not change.
These tests did not write a manifest to the real audit archive.

When the saved structural check has passed, all final reports are complete and
no process is writing evidence, run this command from the repository root.
The release is `31961cbd762587225b4b8a814828dc0829952978`. Pass its exact hash;
the helper's historical default is an earlier candidate.

```sh
python3 -B docs/audits/2026-10-06/launch-checks/verification/2026-10-10/final-evidence/freezer-exact-workflow-v2/freeze-archive.py.txt --write --release 31961cbd762587225b4b8a814828dc0829952978
```

The writer refuses to replace an existing manifest unless `--replace` is also
given. The sequence above removes the temporary manifest before the final saved
structural check, so the final write does not need that option. The helper
verifies the result after the atomic write. To check the complete
archive later without changing any file, use this command.

```sh
python3 -B docs/audits/2026-10-06/launch-checks/verification/2026-10-10/final-evidence/freezer-exact-workflow-v2/freeze-archive.py.txt --verify --release 31961cbd762587225b4b8a814828dc0829952978
```

## Commit the evidence separately

The [corrected evidence commit helper](freezer-exact-workflow-v2/create-evidence-commit.py.txt) requires `--create`
and an explicit `--release` commit. It checks that commit against the fixed
deployment candidate ref and the valid frozen archive manifest. Its live copy
is `/tmp/dota2-trivia-audit-close/create-evidence-commit-workflow-path.py`.
Its only changes are the corrected freezer path and hash. The original
[committer](create-evidence-commit.py.txt) remains unchanged.

The helper uses a temporary Git index seeded from that release. It replaces only
the exact `launch-checks` file set with raw file bytes, preserves existing
executable modes, and gives new files mode `100644`. It then checks every stored
blob's size and SHA-256 hash. All entries outside that folder must match the
release tree exactly. Git hooks, file-system monitor commands and shared index
files are disabled.

The resulting commit has the release as its sole parent. The helper can create
only `codex/launch-evidence-20261010`, and only when that ref does not exist.
It checks that main, the real index and the deployment candidate ref stay
unchanged. All outputs remain in `/tmp/dota2-trivia-audit-close`, outside the
frozen archive. The helper does not push or deploy.

The [21 fixture tests](evidence-commit-tests.json) passed in disposable Git
repositories. They cover dirty-index preservation, exact parent and file scope,
binary and CRLF bytes, filters and ignored files, executable modes, stale
manifests, unsafe paths and competing ref creation. The
[test source](test-evidence-commit.py.txt) and [log](evidence-commit-tests.log)
are saved. No test wrote Git objects or refs to the real repository.

An [independent review](independent-committer-review-result.json) passed 14 checks.
It reproduced three defects in earlier helper versions. A
[reference hook](independent-committer-hook-before.json) and a
[file-system monitor command](independent-committer-fsmonitor-before.json) could
run during Git operations. An expected-zero ref update could also replace a
[concurrently created dangling symbolic ref](independent-committer-symbolic-race-before.json).
The final helper disables those commands. It holds a prepared Git ref transaction
while checking that both direct and symbolic refs are absent, then commits before
its deadline. The [transaction proof](independent-prepared-ref-proof.json) and
[independent test source](independent-committer-review.py.txt) are saved.

## Scan the final evidence commit

Use the [corrected scanner](../../../security/final-exact-scan-v2/README.md).
The command below supersedes that preserved record's older findings-file example.
Set `EVIDENCE_COMMIT` to the exact commit printed by the evidence commit helper.
Keep the deployment candidate ref on the app release shown here.

```sh
python3 -B /tmp/dota2-trivia-audit-close/final-exact-scan.py \
  --commit "$EVIDENCE_COMMIT" \
  --release-commit 31961cbd762587225b4b8a814828dc0829952978 \
  --reviewed-findings /tmp/dota2-trivia-audit-close/reviewed-findings-through-31961cb.json \
  --expected-app-values 7 \
  --output-dir /tmp/dota2-trivia-audit-close/final-evidence-scan
```

The output directory must be new. Run this after the recovery files and scanner
tools have moved to their retained locations. The scanner checks seven app values,
including the actual `STEAM_WEB_API_KEY`, plus two operator values. It also runs
Gitleaks against exact blobs and checks the bounded compressed contents. The
candidate's raw-byte scan alone does not replace this final scan.

Push only after the exact commit scan passes. Preserve the small, safe commit,
scan and push receipts outside this frozen archive before deleting the remaining
close directory. Do not publish a raw scanner log or private recovery receipt.

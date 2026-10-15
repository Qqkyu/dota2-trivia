# Exact workflow path in the evidence archive

The original global freezer refused the existing
`ci/forced-color-fix/after/.github/workflows/ci.yml.txt` record. Its hidden-path
rule also rejected that file's two directories. The [refusal record](initial-freeze-refusal.json)
confirms that the attempt stopped before it wrote a global manifest.

The [corrected freezer](freeze-archive.py.txt) allows only those three exact
paths. Other hidden names and private or cache paths remain blocked. File and
directory symlink checks, path validation, hash checks and manifest rules are
unchanged. The [diff](freezer.diff) records the only code change. The original
freezer and the archived CI file remain unchanged.

The [focused tests](test-workflow-path.py.txt) reproduce the original refusal
and check the corrected round trip, later file changes, twelve other unsafe
paths, and file and directory symlinks. The original helper failed one of four
tests. The corrected helper passed all four. See the [before log](focused-before.log)
and [after log](focused-after.log). All 36 earlier freezer tests also passed
with the corrected helper in [the rerun](original-suite.log). Those fixtures ran
inside the owned scratch directory, despite the unchanged test log's historical
scope label naming this results folder.

The [corrected evidence committer](create-evidence-commit.py.txt) changes only the
freezer path and SHA-256 binding. Its [two-line diff](committer-binding.diff)
leaves the Git transaction and file scope unchanged. Its 21 fixture tests and
14 earlier independent checks passed in disposable repositories. See the
[fixture log](committer-suite.log), [independent log](committer-independent-suite.log),
and the [single-path adjustment](committer-review-harness.diff) to that review's
fixture source. None of these tests wrote Git objects or refs in the app repo.

An [independent review](independent-review.json) passed eight tests covering
31 blocked paths, three exact permitted paths and five symlink cases. It also
checked the committer binding and the exact archived workflow file. The
[independent test source](independent-tests.py.txt) and [log](independent-tests.log)
are saved.
The workflow contains local CI fixture credentials, not production values.
The final exact-value and Gitleaks scans still apply to the complete evidence commit.

Use the corrected freezer for the global write and verification. Use
`/tmp/dota2-trivia-audit-close/create-evidence-commit-workflow-path.py` for the
later evidence commit. Preserve the old helpers as historical evidence.

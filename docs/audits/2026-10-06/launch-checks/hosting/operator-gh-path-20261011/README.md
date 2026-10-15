# Operator GitHub CLI path correction

The policy helper could not start its GitHub check because its restricted
`PATH=/usr/bin:/bin` did not contain the installed `gh` executable. The original
lookup raised `FileNotFoundError`. The installed binary at
`/home/kulmisiu/.local/bin/gh` returned its version under the same restricted
environment. This reproduction made no network request.

The copied [policy helper](policy-source.py.txt) changes only that executable path.
The copied [gate helper](gate-source.py.txt) changes only the policy helper path
and its expected SHA-256. The [policy diff](policy.diff.txt) and
[gate diff](gate.diff.txt) show the complete changes. The original v2 helpers and
their archived evidence remain unchanged. All proof, configuration, deployment
and receipt checks remain in place. The gate still writes the original private
`hosted-smoke-gate-v2.json` path.

The expected result was an executable GitHub check with the same safety checks.
The [path reproduction](path-reproduction.json) and three offline suites passed:

- All 39 policy cases passed with an empty inherited environment.
- All 33 gate state and receipt cases passed.
- All 29 proof-schema cases passed.

An independent agent confirmed the exact diffs and hashes and repeated the 39
policy cases. The [review result](review-result.json) records the reviewed bytes,
installed CLI hash and test scope. The tests used fixtures for provider calls.
This review did not apply a hosted change or create a real smoke gate.

The executable copies remain under `/tmp/queue-arcade-launch-checks` because the
authorized deployment and hosted checks still need them. Their source and test
records are saved here for review and later task cleanup.

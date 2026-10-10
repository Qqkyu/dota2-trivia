# Dependency audit refresh

The full `pnpm audit --json` check passed on October 10, 2026. It returned zero
advisories across 447 reported dependencies. The command did not exclude
development dependencies or filter by severity. No dependency changed during
this check.

The [registry response](dependency-audit-20261010.json) records the result.
The [check record](dependency-audit-20261010-summary.json) binds the response,
`package.json` and `pnpm-lock.yaml` by SHA-256 and records the tool versions.

This refresh supersedes the October 8 registry result for the current lockfile.
It does not assess operating system packages or establish that bundled native
libraries are free of defects. Those require the separate container scan and
native-library review.

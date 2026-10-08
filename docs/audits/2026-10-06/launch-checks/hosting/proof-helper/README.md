# Hosted ingress operator helper review

The helper passed its offline review on 2026-10-08. No hosted requests ran during
this review. These results do not prove Render's header behavior.

Three gaps were fixed before hosted use:

- The provider API helper rejects redirects. The Render bearer token cannot follow
  a redirect to another host.
- The helper checks service, live deploy, commit, branch, trust policy and private
  environment values before and after the proof. It saves no proof if they change.
  It also rejects a deployment still in progress.
- The local CLI and imported ingress helper must match the exact candidate Git
  blobs before and after the proof. Missing, changed, oversized or symbolic-link
  inputs fail the check.

Child stdout and stderr share a byte limit and an absolute time limit. The child
CLI receives only PATH, the required app secret and the expected IPv4 address.
Git and curl receive no production credentials. Curl ignores local configuration.
The helper reads secrets into memory and never writes them to a file.

Successful evidence is rebuilt from an explicit field list. It includes the
candidate commit, live deploy ID, CI run ID and local input hashes. Arbitrary child
fields, private values, stderr output and failed proof results are rejected. Errors
print only their type and the check time.

All 20 offline tests and 49 subtests passed without skips. The tests used synthetic
provider responses and local child processes. They forbid network calls and clear
the inherited environment. They cover redirect denial, changed deployments and
configuration, local input mismatches, output limits, a continuously active child
deadline, private output rejection and generic error output.

The [results](offline-tests.json) and [log](offline-tests.log) record that run. The
[operator source](operator-source.py.txt) and [test source](offline-tests.py.txt)
are archived for review. The [local input check](local-input-check.json) separately
confirms that the actual working files match the candidate commit. The evidence
manifest binds these files by SHA-256.

The helper uses the CI-gated deployment status written by the deployment check.
Its second provider read detects a change during the proof. It cannot prevent a
later deployment or configuration change, so any later trust-policy action must
check the saved commit and deploy ID against the current service again.

# Deployment helper review

Reviewed on 8 October 2026 before deployment. All 20 offline tests passed. The tests made no network calls or Git changes. [Results and file hashes](deployment-helper-review.json), [test log](deployment-helper-tests.log).

The review found and fixed three defects. An unrelated HTTP 409 could previously authorize resume. The helper now requires an explicit service-suspension error and stores only that classification. An accepted HTTP 202 with no response body could previously cause a generic error. The helper now records it as queued and requires polling. The default HTTP client could also forward its Authorization header on a redirect. The helper now rejects redirects. Mocked GET and POST checks cover HTTP 301, 302, 303, 307, and 308 and confirm that each attempt makes only one request.

Resume now requires recent evidence for the same service, candidate SHA, and successful CI run. It immediately checks newly created deployments. If a new deployment reports another SHA, it requests suspension before trying to cancel the build. A pending response without a commit remains unverified. External health checks remain blocked until polling finds exactly one live deployment with the checked SHA.

The candidate helper uses a temporary Git index and updates only the candidate reference. Offline checks confirmed that it preserves the user's index, rejects private and generated paths, rejects a changed working HEAD, and compares the previous candidate reference before updating it.

The review covers helper logic. It does not prove that Render will never serve an old image briefly after resume. See the [provider behavior review](deployment-path.md).

The reviewed files are archived as text:

- [Deployment helper](deploy-render-candidate.py.txt).
- [Candidate helper](create-candidate.py.txt).
- [Offline tests](test-deploy-helpers.py.txt).

To repeat the offline checks, copy these three files to `/tmp/queue-arcade-launch-checks/` without their `.txt` suffixes, then run `python3 /tmp/queue-arcade-launch-checks/test-deploy-helpers.py`. The tests replace provider and Git operations with local fixtures. Do not run either mutation helper to repeat this test.

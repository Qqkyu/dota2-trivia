# Deployment helper HTTP 400 suspension handling

The [provider diagnosis](../paused-deploy-unexpected-status.json) recorded HTTP 400, an explicit service-suspension error, and a service that remained paused by its user. The original helper accepted only HTTP 409 for that condition.

This version changes four lines. It accepts HTTP 400 or 409 for the existing bounded suspension-message check, records the actual status, uses a status-neutral assertion message, and accepts the same two statuses in the resume receipt. It keeps all other checks unchanged. An unrelated HTTP 400, any HTTP 403, a changed pause state, or stale or mismatched evidence still prevents resume.

The [red test run](red-tests.log) reproduced the missing HTTP 400 path with one failure and three errors. The [green test run](green-tests.log) passed all 27 tests. The error text in the red log is an explicit synthetic fixture value, not a credential or provider response. Tests use mocks and temporary files. They make no provider requests.

The root reviewer independently inspected the four-line diff and reported another passing run of all 27 tests for the same source hash. The [review record](review.json) binds these checks to the helper bytes. The original helper and its archive remain unchanged.

A second [independent review](independent-review.json) confirmed the exact four-line diff and passed all 27 tests with network access and unmocked subprocesses blocked.

Use the v2 helper path directly. Run its `--deploy` phase to obtain a fresh normal receipt before its `--resume` phase. The earlier diagnosis file does not replace that receipt. Resume still checks the service, exact candidate, passing CI run, receipt age, branch, and paused user state. It inspects new deployments and leaves external health checks blocked until a later poll confirms one live deployment with the exact candidate commit.

This review changes no provider settings and does not prove a successful deployment. As recorded in the [original review](../deployment-helper-review.md), the provider does not guarantee that resume cannot briefly serve an older image before observation. Root owns the deployment and its outcome records.

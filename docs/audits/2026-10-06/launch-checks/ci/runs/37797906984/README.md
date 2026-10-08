# Cancelled initial CI attempt

[Run 37797906984](https://github.com/Qqkyu/dota2-trivia/actions/runs/37797906984) used exact commit `ca7c89b3dcff21b3e8e5c4064f0638fea2407623` on the reviewed local runner. Checkout, tool setup, the PostgreSQL service, and signed PostgreSQL 17 client installation passed.

The original push event arrived after the explicit manual dispatch. GitHub created push run `37797997276` at 15:06:29 UTC and cancelled this earlier dispatch under the workflow's concurrency rule. Dependency installation was still in progress. This is an incomplete check, not a test failure or a release pass.

The one-job runner exited and removed its GitHub registration. Cleanup then removed its exact owned container and Docker-data volume with no errors. The registration token had already been deleted after configuration. No host bind mounts or host Docker socket entered the container.

The [workflow result](workflow-result.json) records the steps and runner identity. The [GitHub log](workflow.log) passed the pinned Gitleaks scan without findings. Only selected metadata and this service-provided log are archived here. Raw local runner diagnostics remain outside the repository.

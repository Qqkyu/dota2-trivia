# Container launch acceptance checks

This work uses isolated local containers and synthetic data. It does not deploy the app or use an existing database. Earlier audit archives remain unchanged.

Before accepting the container build:

1. Build the repository Dockerfile with its pinned Node 22 base image and the reviewed final source manifest. Record the image ID, base digest, runtime versions, build ID, and content version.
2. Confirm the packaged migration and cleanup commands work against a separate PostgreSQL database. Start the app without runtime DDL. Check readiness, runtime headers, metadata, and a normal guest party flow.
3. Confirm the app runs as its non-root user and native image/audio processing works in the actual image. Scan the image and review findings with fixes.

Before describing a supported test workload:

1. Set and read back a one-CPU quota, a 1 GiB memory cap, and no swap allowance for the app. Constrain PostgreSQL separately. Record the actual cgroup values and container restarts or out-of-memory events.
2. Run the 466-player matrix for ten rounds with the UI's one-second party membership and five-second round polling, session accounting, concurrent chat, votes, and audio preloads. Require every existing score, reveal, duplicate, deadline, reconnect, and party-size assertion to pass. Unexpected 429s, any 5xx, restarts, or lost results fail the normal-load check.
3. Compare active round and vote p95 latency with the operations guide's one-second target. Record client queue delays separately. A functional pass does not imply that the latency target passed.
4. Repeat bounded rounds without restarting the app and vary synthetic party identities to inspect memory growth and room cleanup. Exercise cold shared media with a fresh process and record the number of actual upstream requests and conversion jobs if practical. Do not create high upstream traffic to test local capacity.
5. Read database aggregates independently of the HTTP test's result data. Record the tested duration, workload, constraints, failures, and limits. Local limits do not establish Render capacity.

Docker Desktop was already installed. Its CLI initially found no engine. Starting the installed Desktop application exposed the existing Linux engine without changing global settings. The daemon reports cgroup v2, CPU quota support, memory limits, and swap limits.

Docker documents that an equal `--memory` and `--memory-swap` value disables container swap, and that `--cpus` sets the CPU quota. See [resource constraints](https://docs.docker.com/engine/containers/resource_constraints/). The supported local startup command is documented in [Docker Desktop start](https://docs.docker.com/reference/cli/docker/desktop/start/).

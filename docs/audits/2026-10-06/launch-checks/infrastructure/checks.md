# Repeat the local container checks

Use an installed local Docker engine. The command rejects remote Docker endpoints. It creates separate containers, a private network, a new database, and distinct migration and runtime roles. It removes these test containers and their volumes when the check ends. It does not use the application's configured database.

The default check builds the repository Dockerfile, including the content-review gate, then runs four players for two rounds:

```sh
CONTAINER_ISOLATED=1 pnpm check:container
```

To test an image already built from the reviewed source, set `CONTAINER_IMAGE` and add `--skip-build`. The output directory contains private test environment files. Archive only the result JSON, selected test JSON, and aggregate metrics. Do not copy the environment files.

The longer check uses 466 players across private and public groups. It first tests 100 concurrent readers of shared Soundcheck, Echo Hunt, and Fogged Vision media. Echo Hunt must run exactly two native MP3 conversions for its two clipped stages, with no failed conversion. Then each workload runs ten rounds at the UI's polling cadence. Three repetitions keep the same app process alive:

```sh
CONTAINER_ISOLATED=1 \
CONTAINER_IMAGE=queue-arcade:verified \
CONTAINER_OUTPUT=/tmp/queue-arcade-container-full \
CONTAINER_RUNS=3 \
pnpm check:container --skip-build --full
```

The default resource caps are one CPU and 1 GiB for the app, and one CPU and 512 MiB for PostgreSQL. Neither container can use swap. The check reads both containers' actual cgroup limits. It requires exact database totals, no unexpected request failures, no container restart or memory-limit kill, healthy readiness, and round/vote p95 latency of at most one second.

A separate modest-load check models the published free-plan CPU and memory limits. The local machine's CPU, network, storage, and scheduler still differ from Render:

```sh
CONTAINER_ISOLATED=1 \
CONTAINER_IMAGE=queue-arcade:verified \
CONTAINER_OUTPUT=/tmp/queue-arcade-container-preview \
CONTAINER_CPUS=0.1 CONTAINER_MEMORY_MIB=512 \
CONTAINER_DATABASE_CPUS=0.1 CONTAINER_DATABASE_MEMORY_MIB=256 \
pnpm check:container --skip-build --cold-media --players=20 --rounds=10
```

Render lists its free web service as 0.1 CPU and 512 MB, and its free PostgreSQL instance as 0.1 CPU and 256 MB. See [compute plans](https://render.com/docs/compute-plans). A local pass does not prove hosted throughput or uptime. Render's [free service limits](https://render.com/docs/free) still apply. These checks do not change a hosting plan or deploy a service.

Use separate quiet measurement windows. Do not run builds, browser suites, image scans, or speech recognition during the final timing check. Preserve a failed run with its exact image ID and parameters before changing code or limits.

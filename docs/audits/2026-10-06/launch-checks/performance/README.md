# Constrained-load diagnosis

No application code changed in this investigation. The measured party, chat, and presence work does not justify a cache or polling change. The 466-player workload still exceeds the one-second latency target on the tested one-CPU container. A supported launch workload needs its own passing run at the intended hosting limits.

## Reproduction

The first infrastructure run overlapped other host work and failed around round six. The repeat used the same preserved image, `queue-arcade-launch:baseline`, with Android, Orca, builds, and scans paused. The app had one CPU, 1 GiB memory, and no swap. Its separate PostgreSQL container had one CPU and 512 MiB. Both used fresh synthetic data. The temporary driver added V8 CPU sampling at one-millisecond intervals and saved a profile every 30 seconds.

| Check                                | Initial shared-host run | Quiet profiled run |
| ------------------------------------ | ----------------------: | -----------------: |
| Requested players                    |                     466 |                466 |
| Players who completed all ten rounds |                       0 |                462 |
| Worst round-read p95                 |       About 5.9 seconds |      2.071 seconds |
| Worst vote p95                       |      About 11.5 seconds |      2.896 seconds |
| Container health at end              |               Unhealthy |            Healthy |
| App cgroup memory peak               |           About 311 MiB |         257.52 MiB |
| Out-of-memory events                 |                       0 |                  0 |

The [workload comparison](workload-comparison.json) keeps every cohort's measured latency, request counts, queue delays, and errors. The [container result](quiet-container-result.json) identifies the exact image, Node version, cgroup limits, and health checks. The complete quiet run is not marked as a pass.

Eleven cohorts completed ten rounds. The four-player media cohort failed during its first round because an answering snapshot's image request reached the server after the clue closed. The load driver treated that expected stale-stage 409 as a failure. Infrastructure owns the narrow driver correction and the next capacity run. The API's deadline guard remains unchanged.

The quiet run did not reproduce the widespread missed deadlines or health failure. This does not prove host contention was the only cause. CPU sampling adds overhead, and each run uses fresh room IDs that select different questions. The comparison establishes the remaining latency problem and narrows the search; it is not a precise before-and-after speedup measurement.

## Profile and smaller check

The seven workload CPU profiles contain 167,135 samples. Exclusive sample groups were 24.50% idle, 24.72% Node runtime, 15.89% framework and dependencies, 15.22% native or unattributed work, 13.05% application bundles, and 6.62% garbage collection. Application bundles can also contain bundled dependencies. No individual party or presence function dominates the profile. See [the groups](exclusive-profile-groups.json) and [function summaries](cpu-profile-summary.json).

The app's maximum measured event-loop delay was 363 ms. Event-loop utilization reached 1 in busy intervals. The cgroup CPU counters also record quota throttling. These measurements do not support an out-of-memory diagnosis. [Process summary](process-summary.json).

A smaller check exercised the actual party and presence functions, the actual client-payload mapper, and JSON serialization. It created 446 private players across the workload's room sizes, including 100-seat rooms. Each room had 40 chat messages and ten settled award rounds. Public players do not use this membership path.

| Function work                                         |  Calls | Total time | p95 per call |
| ----------------------------------------------------- | -----: | ---------: | -----------: |
| Membership lookup, touch, presence, payload, and JSON | 10,000 |  230.18 ms |    0.0318 ms |
| Repeated room reads and pending-award scan            | 10,000 |   84.52 ms |    0.0108 ms |

The membership loop serialized about 104 MB in total. This check excludes HTTP handling and database operations and runs outside the CPU-limited container. It rules out the proposed party computation as the main cause of multi-second request latency in this case; it is not a hosting throughput claim. [Microbenchmark results](party-microbench.json).

The database owner identified contention on the shared round row during simultaneous vote transactions as a plausible next hypothesis. That contention was not measured in this pass. Increasing the connection pool or changing transaction order without lock and pool-wait evidence would be premature. No such change was made.

## Evidence and rerun

The eight original app CPU profiles are archived as `.cpuprofile.gz`, including startup. Their compressed and original hashes are in [profile-manifest.json](profile-manifest.json). Decompress one to open it in a CPU profiler. The traces contain function and source locations, not request bodies or credentials. No database or environment file is archived.

The temporary driver and analysis scripts are preserved as `.mjs.txt`. To repeat the full check, copy `check-container-profile.mjs.txt` to an executable `.mjs` file and run it from the repository root with the preserved local image:

```sh
CONTAINER_ISOLATED=1 CONTAINER_IMAGE=queue-arcade-launch:baseline CONTAINER_RUNS=1 CONTAINER_OUTPUT=/tmp/queue-arcade-capacity-repeat node /path/to/check-container-profile.mjs --skip-build --full
```

Set `DOCKER_BIN` if the local Docker CLI is not on `PATH`. The driver refuses remote Docker endpoints, creates its own network and databases, and removes its containers afterward. The microbenchmark helper retains this audit machine's repository and temporary paths; adjust those before reuse. [source-manifest.json](source-manifest.json) identifies the party code measured by that smaller check.

The diagnosis is complete for party and presence ownership. Application source remains frozen. Infrastructure owns the corrected driver and the supported-load result under the actual launch limits.

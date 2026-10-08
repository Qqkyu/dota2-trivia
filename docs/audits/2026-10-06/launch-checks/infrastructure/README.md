# Container and constrained capacity results

The reviewed app image built and ran on the actual Docker engine. Its full Trivy scan found zero known vulnerabilities in the cached database dated 2026-10-06. A four-player check passed under the published free-preview CPU and memory limits. The 466-player check preserved all results but failed the latency target on one CPU. It is not an accepted capacity claim.

These checks used local synthetic databases. No hosting plan changed, no image was published, and no live database was used by the container checks. The separate local PostgreSQL 17 fixture used by the database audit remained available for root's checks.

## Tested artifact

The Docker image ID is `sha256:691894e712d4c9c24abbe9d4be7776f03f996c6835d82453d96ddd02c43eed40`. The image config ID is `sha256:80bf93f2948f4b2fe5abde9cecac014f0e90dcc9ca2a4f1466691c351f86dc6b`. Its Next build ID is `17maTjvFAVt1T9gU35HQ-`.

The unmodified repository Dockerfile passed the 122-input content-review gate dated 13:26:52 UTC. The runtime was Node 22.23.3 on Alpine 3.24.2, with ffmpeg 8.1.2, Sharp 0.35.4, and PostgreSQL 17.11. The app ran as UID 1001. See [the build manifest](final-build-manifest.json), [the exact review manifest](content-review-at-build.json), and [native versions](final-native-metadata.json).

Later accessibility or hosting-probe edits need a fresh build, image scan, and small container acceptance check. These measurements remain evidence for the recorded image and unchanged capacity paths.

## Quiet measurements

Builds, scans, browser suites, Android emulation, and the assistive browser container stopped before both final runs. App and database CPU, memory, and zero-swap limits were read back from cgroups. The one-second target applies to the worst cohort's round-read and vote p95, not cold-media loading.

| Check             | App cap          | Database cap     | Players and rounds     | Round p95 | Vote p95 | Result                                          |
| ----------------- | ---------------- | ---------------- | ---------------------- | --------- | -------- | ----------------------------------------------- |
| Final preview     | 0.1 CPU, 512 MiB | 0.1 CPU, 256 MiB | 4 players, 10 rounds   | 288 ms    | 798 ms   | Passed                                          |
| Final larger load | 1 CPU, 1 GiB     | 1 CPU, 512 MiB   | 466 players, 10 rounds | 2,212 ms  | 2,509 ms | Latency failed; game and database checks passed |

The preview game workload completed 1,260 requests in 226.85 seconds. Separate database queries found four finished sessions, 40 vote events, and ten correct answers. App process RSS peaked at 174.14 MiB. The container memory counter peaked at 174.79 MiB. No out-of-memory event, restart, unexpected throttle, or 5xx response occurred. See [preview summary](final-preview/summary.json), [database totals](final-preview/database-crosscheck.json), and [process metrics](final-preview/process-metrics-summary.json).

The larger game workload completed 130,486 requests in 224.22 seconds. It returned about 830 MB of response bodies. Independent queries found 466 finished sessions, 4,660 vote events, and 1,135 correct answers. Every player score, crowd result, duplicate vote, deadline, reconnect, chat retention, and 101st-player rejection assertion passed. There were no 5xx responses or unexpected throttles. The app stayed healthy with no restart or memory-limit kill. App process RSS peaked at 250.59 MiB; the cgroup memory counter peaked at 211.98 MiB. These counters account for memory differently and must not be added together.

The app's event-loop utilization reached 0.9996 at p95 during the larger workload. The client also queued requests for up to 1.19 seconds. The independent [CPU profile review](../performance/README.md) did not justify a party-specific code change. Do not describe 466 players on one CPU as responsive or supported. See [larger-load summary](final-full/summary.json), [database totals](final-full/database-crosscheck.json), and [process metrics](final-full/process-metrics-summary.json).

Both app containers stopped after SIGTERM in under half a second. Next.js uses exit code 143 after its cleanup completes. The checker accepts that code and still rejects timeout, restart, or out-of-memory termination.

## Real cold media

The larger run first served 100 clients at each of three Soundcheck, Echo Hunt, and Fogged Vision stages. All 900 responses matched within their stage. Only three upstream sources were fetched. Echo Hunt ran exactly two successful native MP3 conversions, one per clipped stage, with no concurrent duplicate conversion. Soundcheck used its PCM path, and Fogged Vision exercised the packaged native image library. The game workload later made 90 media reads and 4,610 answer-safe preload requests.

At one CPU, the slowest cold-stage p95 was 1.46 seconds for Soundcheck and 1.23 seconds for Echo Hunt. Fogged Vision stayed below 411 ms. At the free-preview limits with four readers, the first image stage reached 3.10 seconds, Soundcheck reached 2.69 seconds, and Echo Hunt reached 1.80 seconds. The preview passed correctness; cold clues can still take several seconds. Raw measurements are in each run's `cold-media.json` and `container-result.json`.

## Changes and earlier failures

The runtime image now removes unused npm, Corepack, and Yarn installations. Trivy found 21 advisories in the stock Node image's global npm tree. The cleaned runtime base and complete app image had zero findings. The image includes the dependency patches, database CLI helper, role-grant commands, and third-party notices. It excludes `.local-assets`. See [scan summary](scan-summary.json).

The repeatable checks are [documented here](checks.md). The default small check is wired into CI. They use separate migration and runtime roles, verify packaged commands and browser headers, check native processing, and compare HTTP-derived expectations with SQL totals.

The first contended 466-player baseline timed out around round six. A quiet repeat exposed a stale media request at the answering deadline. The driver now skips new media work near that deadline and permits a 409 only after the deadline has passed. Exact shared-media matching is checked away from stage transitions. The final run had no media request expire in flight. Both failed baselines remain archived, including the 20-player free-sized calibration whose vote p95 reached 3.60 seconds.

These are short, local HTTP workloads. They do not prove long-term memory stability, a maximum player count, browser performance, or Render uptime. The planned three-run baseline stopped at its first failure; the final checks cover one ten-round workload each. The current free service remains a limited preview. Repeat the checks after material backend changes and measure the actual host before increasing the expected player count.

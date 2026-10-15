# Image preflight on 10 October

The refreshed image passed the constrained app and database flow. Trivy found zero known vulnerabilities across all severities, including unfixed issues, using its database updated at 07:01 UTC on 10 October. The [summary](summary.json) binds the result to the Dockerfile hash and image ID.

The build used commit `c8729a2b11b5723f99375e53cabc8fde6fd5fa31` with only the reviewed Dockerfile update copied into that checkout. The runtime now requires Alpine zlib 1.3.2-r1 or newer. Its [package inventory](completed/trivy-full.json) confirms zlib 1.3.2-r1. [Native metadata](completed/native-metadata.json) confirms Sharp 0.35.5, librsvg 2.63.2, and libvips 8.18.7. This preflight does not replace CI for the next exact commit.

The [container check](completed/container-result.json) used a 1 CPU, 1 GiB app and a separate 1 CPU, 512 MiB PostgreSQL 17.11 database. It checked the packaged migration and grant commands, restricted runtime role, real CPU and memory limits, image encoding, health, four synthetic player sessions, and shutdown. All four sessions finished. Round latency was 30.01 ms at the 95th percentile; vote latency was 41.42 ms. The app had no restart or out-of-memory termination. This small workload does not establish large-user capacity or the smaller Render free plan's capacity.

The [scan command](entrypoint.sh.txt) explicitly includes UNKNOWN, LOW, MEDIUM, HIGH, and CRITICAL severities and sets `--ignore-unfixed=false`. The report includes the scanner version, database date and hashes, and full package inventory. A package scanner cannot prove that it found every statically bundled native library. Node and Sharp's embedded library versions are therefore also recorded.

The first build succeeded, but its read-only metadata probe assumed `/app/node_modules/@img`. Next's standalone output uses pnpm package paths. The corrected probe walks the actual node_modules tree. The [first build log](initial/build.log) and [original probe](initial-entrypoint.sh.txt) remain available. The second attempt reused build cache and completed all checks.

The runner kept its outer limit of 2 CPUs and 5 GiB, with no host directory or Docker socket mounted. The [cleanup record](cleanup-result.json) confirms removal of the exact owned container, dedicated volume, and matching registration. The [remaining runner list](runners-after-cleanup.json) contains no audit runner.

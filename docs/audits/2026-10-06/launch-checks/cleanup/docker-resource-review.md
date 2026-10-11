# Docker cleanup review

No Docker resource was removed. The review found one stopped audit restore container and six task image tags. Each image had no container users at the check. Refresh this state before cleanup because another CI runner may start.

The stopped container is `queue-arcade-launch-restore-pg17`, ID `0f6a9b0963a0c01c52c7815a216e7f623249bf08870d42bf48cd6dd115324890`. The archived infrastructure cleanup record names this exact fixture as retained for another audit step on 6 October. Its creation time is 6 October 2026 at 12:33 UTC.

Its only mount is the anonymous Docker volume `b8a2f56da4718a3162e88b791b6791bb3b460d4c90abad59295ef374180789ae` at `/var/lib/postgresql/data`. It has no host bind mounts or explicit mount requests. Only this container uses that volume. After private recovery backups are retained and verified, this stopped fixture and its anonymous volume can be removed. Keep the shared `postgres:17-alpine` image. No database contents were inspected.

| Image tag | ID prefix | Recommendation |
| --- | --- | --- |
| `queue-arcade-launch:final` | `691894e712d4` | Remove after final CI and hosted checks. |
| `queue-arcade-launch:baseline` | `ce9eca3d1cf8` | Remove after final CI and hosted checks. |
| `queue-arcade-launch-runtime-base:local` | `cda0d9616bf2` | Remove after final CI and hosted checks. |
| `queue-arcade-launch-dependencies:local` | `84459f933569` | Remove after final CI and hosted checks. |
| `queue-arcade-ci-runner:20261006` | `285cd0c0d0fd` | Keep until the CI owner confirms that all jobs and scans are complete. |
| `queue-arcade-assistive:orca49` | `567f0e041794` | Recommend removal after final accessibility evidence is accepted. |

The app image IDs match the archived container checks. The runtime-base and dependency image IDs match their local build logs. The archived Orca runner names its image, and the archived CI runner scripts name the runner image. Full IDs, metadata, and evidence paths are in [docker-resource-review.json](docker-resource-review.json).

The Orca image is reusable, but no remaining planned check needs it. Its build recipe and test runner are archived. The cache plan preserves Orca source and the Chrome tool. The portable reader tar contains Chrome and task source, not the full Orca runtime. Removing this image means a later Orca check must rebuild the runtime. The image list reports 4.13 GB for it, but shared layers mean this is not a promise of space recovered.

Remove only the reviewed stopped container, its verified anonymous volume, and the exact task image tags that root approves. Use no force or global prune. Keep shared base-image tags and unrelated Docker resources unchanged. Docker environment values, process arguments, logs, and data contents were outside this review.

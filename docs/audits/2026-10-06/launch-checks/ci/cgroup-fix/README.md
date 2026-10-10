# Nested Docker resource limits

The [October 8 CI run](../runs/37802218519/README.md) failed when nested Docker tried to create a constrained container. Its cgroup v2 parent was in threaded mode. The application had not started.

An October 10 probe reproduced the same runtime error. The [red result](red/result.json) records Docker exit 125. The entrypoint first ran an unconstrained process, then the CPU and memory constrained process failed during container creation. The empty CPU output does not count as a completed application check.

The runner now prepares its private cgroup v2 namespace before it starts Docker. The [guard](sources/runner-image/prepare-cgroup-v2.sh.txt) checks the namespace layout and the outer limits. It moves existing processes into a leaf group, enables child controllers, and checks that the limits did not change. The outer container stays at two CPUs and 5 GiB of memory with no swap allowance. The [lifecycle helper](sources/runner-lifecycle.py.txt) checks private namespaces, ownership labels, and the single task-owned volume before startup. It rejects host mounts and shared host namespaces.

The [green result](green/result.json) records a passing probe. The nested process read a 0.5 CPU quota and a 64 MiB memory limit. Its busy loop recorded 30 throttled periods and 1,494,178 microseconds of throttling. The bounded memory probe exited 137 and Docker marked that child as killed for exceeding its memory limit. A later command still entered the outer container, and its CPU, memory, and swap limits matched the starting values.

Docker also reported `OOMKilled: true` for the outer container. The kernel's saved memory counters separate child and local events. The recursive counter increased by one, while the outer group's local out-of-memory counters stayed at zero. The outer entrypoint finished with exit zero. This probe intentionally tests the child memory limit; it does not show an application memory failure.

The offline [guard review](review/prepare-mock-results.json) passed 26 cases. The [lifecycle review](review/lifecycle-mock-results.json) passed 33 checks. These tests use confined files or in-memory substitutes. They do not prove kernel enforcement; the real red and green probes provide that evidence. The [archive validation](archive-validation.json) checks the saved source hashes and shell or Python syntax.

The [interrupted copy inventory](interrupted-copy-inventory.json) preserves the earlier empty evidence-file record. It contains no completed result. This fix changes the temporary local runner. It does not change the app's limits, Render settings, or the failed GitHub run. A complete later workflow must still pass before release.

# Bounded startup health requests

[Run 38041621109](../runs/38041621109/README.md) exited with Node status 13 while awaiting a health request during the preview-cap check. It left the promise unsettled and skipped the check's catch and finally blocks. The app process continued to start. Its later DNS error occurred during workflow teardown, after the check process had already exited.

The unchanged container command passed on its next run. The exact original network timing remains unknown. An [independent reproduction](independent/README.md) found a controlled way to trigger the same process failure using real native fetch and a real TCP connection. It delayed delivery of the native HTTP parser's compiled result while the peer closed. Nineteen of twenty delayed-parser processes exited with status 13 before cleanup. All twenty controls with a referenced request deadline reached catch and finally. Ordinary network controls and 12,800 additional requests did not reproduce the failure. These injected timings establish a failure mechanism; they do not prove the original CI sequence.

The check now uses [readHealthWithDeadline](health-readiness.mjs.txt). Its two-second timer stays referenced through both fetch and JSON parsing. It aborts and rejects when the deadline expires, even if fetch ignores the abort signal. Its finally block clears the timer on success or failure. The existing readiness conditions, retry count, CPU quotas, memory caps, and one-second latency target are unchanged.

The [process regression](health-readiness.test.mjs.txt) keeps the fixture server in the parent process so it cannot keep the child alive. The [legacy result](health-readiness-red.log) failed two tests with status 13, including the real TCP parser-timing case. All six tests pass with the [fixed helper](health-readiness-green-final.log). They also cover a stalled JSON body, successful and non-ready health responses, malformed JSON, and a fetch implementation that ignores abort. Seven additional independent checks passed. Scoped lint passed. The first sandboxed test attempt could not bind loopback sockets; its log is retained separately.

The real capped flow then completed its health wait and cleanup. It preserved all eight answers across four finished sessions, with no app restart or out-of-memory termination. The first fixed run missed the one-second round-latency target. One extra diagnostic health request occurred during that run, but individual request overlap was not recorded. It is not a proven cause of the latency difference. A quiet repeat with the same image and limits passed. All three results remain in the [comparison](comparison.json).

| Attempt | Round p95 | Vote p95 | Result |
| --- | ---: | ---: | --- |
| Unchanged code recheck | 241.87 ms | 599.19 ms | Pass |
| Fixed helper with one extra health observation | 1,190.88 ms | 704.92 ms | Latency target failed |
| Fixed helper, quiet repeat | 301.87 ms | 601.16 ms | Pass |

Each run used a 0.1 CPU, 512 MiB app and a 0.1 CPU, 256 MiB database, with no swap. These small samples show limited latency margin at the free preview budget. One quiet pass does not establish a stable one-second service level or large-user capacity. The final exact-commit workflow must still pass.

The [cleanup record](cleanup-result.json) confirms removal of the diagnostic runner, its dedicated volume, and its matching registration. The original image and all attempts were preserved until the diagnosis completed. Only synthetic test data was present in that runner.

# Independent health-wait review

The original CI command exited with Node status 13 while awaiting its first health fetch. The app had started about 0.3 seconds earlier and continued to run. This review did not change application or shared script files.

All checks used the real Node 22.23.3 binary at `/tmp/queue-arcade-launch-checks/tools/node22/bin/node`. Each HTTP or TCP fixture ran in a separate local process. Requests stayed on the IPv4 loopback interface and used synthetic data.

## Ordinary network controls

Run `python3 /tmp/queue-arcade-health-wait-review/run.py`.

The 18 processes covered nine scenarios with and without a referenced keeper timer. Slow headers, slow bodies, closed connections, truncated bodies, TCP half-close, keepalive reuse, and temporary HTTP 503 responses completed through the expected catch and retry path. A permanently stalled socket hit the explicit readiness failure. None exited with status 13. Results are in `result.json`.

Run `python3 /tmp/queue-arcade-health-wait-review/stress.py`.

The next 128 processes each made 100 native fetch requests. The eight cases used a refused port, an immediate TCP reset, destroy, half-close, a complete HTTP 503 response followed by close, a truncated response, resets after zero to three milliseconds, and alternating ready responses and resets. Every process exited with status zero after its fetch promises settled. A child-process and log-close step preceded each batch to cover the check script's preceding work. Results are in `stress-result.json`.

These checks do not support attributing the original failure to a slow response or TCP reset alone.

## Controlled parser timing

Run `python3 /tmp/queue-arcade-health-wait-review/parser-gap.py`.

This test keeps native fetch and real TCP connections. It changes one timing condition in the child process. After the real `WebAssembly.compile` operation finishes, the wrapper delays delivery of its result by 100 milliseconds. The delay uses an unreferenced timer to model a pending parser operation that does not keep the Node event loop alive. The server closes the connection before the parser result returns.

The test ran five server-close cases with four repetitions and three client modes, for 60 processes:

| Client mode | Exit 13 | Exit 0 |
| --- | ---: | ---: |
| Unchanged parser timing and `AbortSignal.timeout` | 0 | 20 |
| Delayed parser result and `AbortSignal.timeout` | 19 | 1 |
| Delayed parser result and a referenced abort timer | 0 | 20 |

Every failing process printed the same unsettled top-level await warning as CI. It exited before its catch and finally blocks ran. Every referenced-timer control reached its catch and finally blocks. The only delayed-parser process that did not fail handled a reset before the parser delay became relevant. Results and resource snapshots are in `parser-gap-result.json`.

Node's bundled Undici code awaits the parser instance before it adds the HTTP parser's socket error and close listeners. The controlled test supports this timing gap as one way to produce the observed failure. It does not prove that the original CI run encountered this exact sequence. The original run had no trace of parser compilation or socket events.

## Scope of the proposed guard

A referenced deadline keeps the check process alive until the request settles or its bound expires. The deadline must include reading the JSON body. A rejected request must still reach the existing retry path, and the final cleanup must run on readiness failure. A helper test should also cover a fetch promise that ignores abort so the overall bound cannot depend on a well-behaved fetch implementation.

This guard addresses the observed process-lifetime failure without increasing the two-second request timeout or relaxing the readiness checks. Passing the guarded fault fixture does not establish app capacity. The real constrained container test remains required.

## Independent helper check

Run `python3 /tmp/queue-arcade-health-wait-review/helper-review.py` after the fixed helper is present.

The independent check passed all seven cases. It read the actual helper from `scripts/lib/health-readiness.mjs`. A healthy response and HTTP 503 preserved their expected return values. Stalled headers and a stalled body both rejected within about 103 milliseconds for a 100 millisecond deadline. The parser-delay and closed-peer case rejected within 302 milliseconds for a 300 millisecond deadline. A healthy connection still completed with the same parser delay. A fetch promise that ignored abort rejected at its deadline, and the signal was aborted. All seven child processes reached their finally block and exited with status zero. The helper source hash and checks are in `helper-review-summary.json`.

The code review found no defect in the helper or its call site. It keeps the timer referenced while both fetch and JSON body parsing run. Its race rejects even if fetch ignores abort. Its finally block clears the timer after success or failure. The existing readiness loop still requires successful HTTP status and `health.status` equal to `ready`.

The first version of the parser regression caught its own assertion for an unexpected successful response. This could let an incorrect helper pass that test. The CI agent corrected the test to catch only `TimeoutError` or `TypeError`. An unexpected successful response now throws an error that escapes the catch. The independent review confirmed this correction and recorded the final helper, call site, and test hashes. The independent fixture checks exact success or error events and does not have that gap.

## Primary sources

[Node 22 process documentation](https://nodejs.org/download/release/v22.23.3/docs/api/process.html#exit-codes) defines status 13 as an unsettled top-level await. [Node 22 abort controller source](https://github.com/nodejs/node/blob/v22.23.3/lib/internal/abort_controller.js#L131-L153) calls `unref()` on the timeout timer. These facts also match the local binary's bundled source. [Undici 6.28.1 HTTP/1 client source](https://github.com/nodejs/undici/blob/v6.28.1/lib/dispatcher/client-h1.js) contains the parser initialization and socket listener order.

All temporary fixture servers were stopped by their parent scripts. No hosted service or Docker state changed in this review.

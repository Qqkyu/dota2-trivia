# Driver interruption checks

All 24 driver tests pass on PostgreSQL 17.11 with the pinned `postgres@3.4.9`
patch. Each test runs a separate Node process. No process installs an uncaught-exception
handler. The PostgreSQL 17 run used Node 24.15.0 and passed all 52 selected database tests.
The production Node 22.23.3 binary passed the final 78 selected database tests, including
all 24 driver cases. Its official archive SHA-256 matched the published checksum.

Before the patch, all six initial cases exited with code 1 and the same null `socket.write`
TypeError. They covered ESM and CommonJS transactions after socket loss or backend
termination, plus reserved connections after socket loss. The runtime directory preserves
the original full-store failures. After the patch, all six processes reject the interrupted
query and reconnect through the same pool.

Eight further cases check both module formats. A closed transaction rejects queued work.
An old callback cannot issue a query, commit, or roll back a replacement transaction. The
replacement transaction keeps the same PostgreSQL transaction ID and the pool remains usable.

Independent review then found a stale queue after a real TCP reset and an unhandled
rejection during startup type discovery. The revised patch drains work queued between
socket error and close, clears failed startup state, and bounds repeated startup failures.
Ten further cases cover ESM and CommonJS TCP resets, a single startup termination, startup
reset, repeated type-query termination, and repeated clean close before authentication.
Each process accepts three subsequent queries after recovery. The user's initial query
still rejects when a socket reset requires it. The tests install no global error handler.

The full-store crash rehearsal also passed after the patch. The original worker survived
PostgreSQL immediate shutdown, reused its application pool after restart, saved one new
vote and all related effects, and rejected its duplicate. Every earlier acknowledged row
matched its pre-crash hash. The interrupted vote remained absent.

`tests-final-node22-pg17.json` contains the final 78-test report. The earlier
`tests-pg17.json` and `tests-node22-pg17.json` preserve the checks before independent review.
`source-sha256.json` pins the final patch and
regression sources. See [postgres-driver-patch.md](../../../../../postgres-driver-patch.md)
for upstream issue references and the removal criteria. The upstream proposals remain
unmerged, so this is a maintained local patch until a release passes the same checks.

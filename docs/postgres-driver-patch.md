# Postgres driver disconnect patch

The release pins `postgres@3.4.9` with `patches/postgres@3.4.9.patch`. On 2026-10-06,
3.4.9 was the latest [upstream release](https://github.com/porsager/postgres/releases).
Our database restart check reproduced an uncaught `socket.write` TypeError after a
transaction lost its connection. A plain Node store worker exited before reconnecting.

The patch guards writes after socket close, clears the old query and buffer state, and
rejects work that belongs to a closed transaction or reserved connection. Releasing an
old reserved connection cannot return it to the ready pool. A late callback cannot query,
commit, or roll back a replacement transaction on the same physical connection.

The changes follow these upstream proposals, which were still open when reviewed:

- [PR 1209](https://github.com/porsager/postgres/pull/1209), guard writes after close.
- [PR 1215](https://github.com/porsager/postgres/pull/1215), reject disconnected transaction work.
- [PR 1240](https://github.com/porsager/postgres/pull/1240), keep a terminated reserved connection out of the pool.
- [PR 1241](https://github.com/porsager/postgres/pull/1241), clear failed startup state and bound retries.

Independent review found two further failures. A TCP reset could leave a rollback in the
sent queue, so the second query after reconnect stalled. Closing a connection now drains
that queue even when the socket already reported an error. A disconnect during automatic
type discovery could also leave an unhandled internal promise rejection. The patch clears
the startup state, handles that internal promise, and bounds startup retries by the
connection timeout. The user's query still receives a connection error when required.

The final Claude Fable 5.1 review found one further startup error. A clean close followed
by a socket error could leave the retry start time set. A later request then lost its
retry window. Both module formats now clear that timestamp when the failed run ends.
The regression repeats that exact failure sequence before checking three later queries.

The patch applies to both Node module formats, ESM and CommonJS. It adds no global
exception handler and does not retry failed transactions. An interrupted vote must still
fail as one atomic operation. A later request may reconnect and submit a new vote.

`tests/postgres-driver-recovery.test.mjs` starts separate Node processes against the
explicit disposable `TEST_DATABASE_URL`. The tests interrupt only their own connections.
They check process survival, reconnection, queued query rejection, and late callback
isolation. All six initial interruption tests crashed without the patch. The complete
28-case set covers repeated TCP-reset recovery, startup termination, startup resets,
mixed startup failures, and bounded retry exhaustion as well as transaction isolation.
The five-connection checks interrupt one transaction while four other transactions
commit, then verify five new commits. The store restart check also saves a new vote
through the original pool after PostgreSQL restarts.

Run these tests when changing the dependency or patch:

```bash
pnpm exec vitest run tests/postgres-driver-recovery.test.mjs tests/postgres-store.test.mjs
```

Remove the patch only after a released upstream version passes these tests and the store
restart check. The patch uses the dependency's Unlicense terms. It does not change its API.

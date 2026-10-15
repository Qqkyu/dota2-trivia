# Guest persistence fault review

Independent review of `src/lib/guest-lifetime-storage.mjs` and its integration in `src/components/queue-arcade.tsx` on 2026-10-06.

The browser test used a fresh temporary Chrome profile and a temporary empty HTTP origin. It did not use the app server or existing user data. Chrome reported `Chrome/121.0.6167.160` through `Browser.getVersion`. The script loads the current helper source directly.

Run `node /tmp/queue-arcade-fixes/guest-idb-fault-review.mjs` to repeat the checks.

All three checks passed:

1. Force an IndexedDB transaction to abort after its `put` request succeeds. Queue two increments from an initial saved count of 5. The helper falls back to memory with counts 6 and 7. It uses the committed baseline and applies each queued update once.
2. Open a second renderer after the abort. It reads the saved count of 5 from IndexedDB and replaces the aborted local mirror. The mirror cannot replace the saved record.
3. Throw `null` after changing the transaction's candidate values. The callback runs once, the transaction rolls back, and the next read still uses IndexedDB with the saved count of 5.

The source review also checked cross-tab transaction scope, the per-tab operation queue, one-time legacy import, blocked-open handling, callback ordering, and pending-vote deletion after confirmed commit. Two callback failure cases found during review were fixed. The focused guest storage, guest accuracy, and browser storage suites passed all 8 tests.

No remaining blocker was found in the guest persistence change. If IndexedDB is unavailable, the page retains new lifetime totals in memory and keeps pending recovery entries. That fallback cannot promise persistence after the tab closes.

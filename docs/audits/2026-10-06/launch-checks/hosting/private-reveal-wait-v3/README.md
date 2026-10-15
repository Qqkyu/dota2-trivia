# Private reveal wait correction

The hosted smoke on 11 October reached all 13 public formats, then failed `PRIVATE_REVEAL`. Its first private reveal check saw the next round answering. The helper sent one accepted private vote and confirmed removal of its room. Browser checks had not started. The [original result](original-hosted-failure.json) is unchanged.

The app does not fast-forward when all players vote. Private rounds keep a 15-second answer period and a 7-second reveal period. The 800 ms vote grace leaves 6.2 seconds of visible reveal. An accepted private vote changes score, not the round start time. The relevant app code is [privateRoundTiming](../../../../../../src/lib/private-rooms.mjs) and the [vote route](../../../../../../src/app/api/votes/route.ts).

The old helper slept for the remaining duration from its pre-vote snapshot after it received the vote response. This adds any elapsed response or receipt time to that stale duration. A controlled 6.5-second delay in either the active response or vote response reproduces the next-round `PRIVATE_REVEAL` failure. Normal timing passes. The original hosted result did not record those durations, so the exact hosted delay source remains unknown.

The [corrected helper](hosted-smoke.mjs.txt) reads the room immediately after the accepted vote. If that same round is still answering, it calculates the wait from the new server snapshot and the elapsed read time. It refreshes this calculation after each answering response. It still requires the same round in reveal with the answer and the player's vote. It sends one vote, permits three reveal reads, and keeps the original 30.6-second maximum total sleep and all request, byte, wall-time, ownership, and cleanup limits. No app source changed.

The helper now records the active and vote request durations, time since those responses, and each read's duration and remaining answer/reveal time. These metrics contain no room code, player ID, question content, or credentials. They let the next run distinguish measured latency from an assumed cause.

The [timing regression](reveal-wait-tests.mjs.txt) runs the real `Check.guest` method and app timing function with controlled responses and a virtual clock. Eleven expected outcomes pass in [reveal-green.json](reveal-green.json). They include normal timing, delay before and after a server snapshot, delay around the vote, an already active reveal, and rejection of the next round, missing answer, missing vote, never-revealing round, or failed read. Every case sends one vote and confirms cleanup. The [old helper's result](reveal-red.json) retains the red cases.

Independent review found an early-read case in the first proposed correction. Subtracting the full request time can wake early if that time passed before the server timestamp. A final fixed 300 ms retry was insufficient. The [counterexample](review-counterexample-red.json) and [intermediate source](before-refresh-every-wait.mjs.txt) are retained. Recalculating each wait resolves it without adding requests or increasing the sleep limit.

The 63 existing operator safety checks pass. Their copied fixture only adds the real response's `revealDeadline` field. The gate copy changes only the smoke path, its pinned hash, and its new exclusive output path. All 33 gate tests and 29 proof-schema tests pass. The original helper and gate archives remain unchanged. See [operator.diff](operator.diff), [gate-copy.diff](gate-copy.diff), and the exact source hashes in [review.json](review.json).

This folder proves the local correction and preserves the failed hosted attempt. The corrected hosted execution and its browser results are recorded separately. The diagnosis made no hosted or provider requests.

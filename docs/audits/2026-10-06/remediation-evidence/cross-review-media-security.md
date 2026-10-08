# Cross-review findings

## NAT limits were below the advertised party capacity

The new independent IP limits initially rejected ordinary traffic from a 100-player party behind one address.

- Audio had a 300/minute default, while a two-clip Soundcheck round can produce about 2,100 requests/minute across 100 players, including preload calls. Image stages could also exceed 300/minute. Fixed in the media routes with 3,000 audio and 1,500 image requests per IP, while keeping the 60/player limit and bounded media processing.
- Private-room reads had a 9,000 preflight allowance but a second limit of 600. The security agent raised the second allowance to 9,000. Touch calls now also have 9,000 IP capacity.
- Votes at 300/minute have no retry margin for 100 players and three rounds per minute. Sent to the security/database agents with a recommended 600 cap.
- Presence uses the shared identity `public-room` with 60/minute. One hundred lobby players poll every 15 seconds, requiring about 400/minute. Steam start/callback similarly use a shared `steam` identity with 20/minute, so 100 users cannot sign in together. These predate the current fixes but remain inconsistent with the party capacity. Sent to security with recommended presence 600 and login 120 limits.
- The new profile IP cap of 120/minute can reject a second page load or lobby return for a 100-player party. Sent to security with a recommended 600 cap.

## Profile failures change the client identity

`loadAccount` in src/components/queue-arcade.tsx sets `authenticated: false` on any fetch error. A 429 or temporary 503 therefore makes the client use its guest identity while the valid account cookie still makes the server use the account identity. The new profile limit makes this easier to trigger. Sent to the functional agent with a recommendation to keep the last known account on transient failures and switch to guest only after a successful `authenticated: false` response.

## Already-aborted media callers could leave an unhandled rejection

The independent security helper review found that `waitForMedia` returned before observing the shared promise when the request signal was already aborted. A later shared-job failure could become an unhandled rejection. Fixed by always attaching settlement handlers before checking the signal. The new regression test covers an already-aborted caller followed by a failed job.

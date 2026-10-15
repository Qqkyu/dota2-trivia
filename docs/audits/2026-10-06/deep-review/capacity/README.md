# Local capacity review

The final run passed with 466 synthetic players across 12 simultaneous groups for ten rounds. It completed 129,932 HTTP requests and accepted 4,660 votes in 224.54 seconds. There were no HTTP 5xx responses, unexpected throttles, lost votes, wrong score totals, or failed reconnect assertions. This is a measured local test window, not a Render capacity claim.

## Final-candidate regression

The final `.next-deep-check` build, `a9jO2vwwKVTSsroYDHJJW`, passed the default four-player,
two-round regression against a fresh PostgreSQL database on local port 3316. It completed
379 requests in 42.077 seconds. All 14 HTTP 409 and nine HTTP 429 responses were expected
late-vote or throttle checks. There were no 5xx responses or unexpected throttles.

The independent database check found four finished sessions, exactly two answered rounds
per session, eight unique round events, and the expected two correct answers. Readiness
returned HTTP 200 with all three PostgreSQL stores ready and 1,517 active questions.
Peak app resident memory during this small check was 150.74 MiB. This short regression
does not repeat or extend the 466-player measurement.

The archived evidence is `capacity-regression.json`, `capacity-regression-summary.json`,
`capacity-regression-database.json`, and `capacity-regression-health.json`. The manifest
records both build IDs, the test script hash, and hashes of the archived artifacts.

## Test and evidence

The durable test is [`scripts/check-capacity.mjs`](../../../../../scripts/check-capacity.mjs). Its default is four players in one party for two rounds. `--full` adds the matrix below and uses ten rounds. `--busy-chat` sends one message per ten players each round, rounded up. The final command was:

```sh
CAPACITY_ISOLATED=1 CAPACITY_SOURCE_SUBNET=35 \
  APP_URL=http://127.0.0.1:3313 \
  CAPACITY_OUTPUT=/tmp/queue-arcade-deep-review/capacity-final.json \
  node scripts/check-capacity.mjs --full --busy-chat
```

Start a separate synthetic server and store before this command. The server must trust `x-real-ip` for these local synthetic source addresses. That test setting does not establish a trusted-header contract for a public deployment. The script refuses non-local origins, redirects, unknown options, more than 20 rounds, and runs without `CAPACITY_ISOLATED=1`. The negative remote-origin check exited before network access. Requests have a 15-second timeout. At most 256 requests can be in flight, and the whole run has a deadline. A fresh source subnet isolates each run's quotas without a rate-limit reset endpoint.

Evidence files:

- `capacity-final.json` contains request counts, status counts, per-endpoint latency and client queue delay, every round's expected counts, and each player's cumulative score and recovery count.
- `capacity-final-summary.json` joins those results with the app's process measurements.
- `capacity-final-database.json` contains the independent aggregate database check.
- `process-metrics-summary.json` preserves process measurements aggregated within each test window. The source sampled memory, CPU time, event-loop delay, and event-loop use once per second, with 20 ms delay resolution. Raw process logs are not archived.
  Earlier runs checked five-second membership, chat retention, and then one-second membership. They omitted guest analytics writes and most preload HEADs. Their process aggregates remain in `process-metrics-summary.json`; use the archived final result for the workload claim.

The final script SHA-256 is `0dedf34f66a36b9cf8f83ef2ef0fc242e648046cf046df1b3048e993c2027f78`. Prettier and ESLint passed for the script.

## Workload

The test ran 1-, 20-, 50-, and 100-player private parties both behind one shared source address and with separate source addresses. Another shared address held two 50-player parties plus 20 public-room players. A four-player party alternated Fogged Vision and Soundcheck. Total load was 446 private players and 20 public players.

The request cadence follows the current UI. `PRIVATE_ROOM_POLL_MS` is 1,000 ms in `src/lib/private-rooms.mjs:17`. The private panel sends membership POSTs while play is active. `ROOM_SYNC_HEARTBEAT_MS` is 5,000 ms in `src/lib/room-sync.mjs:5`. Active round GETs update presence; the separate lobby-presence poll is not an active-play request. Each synthetic client starts an alpha session, includes its session ID with each vote, and finishes the session at exit. Every client that sees a reveal sends its once-per-round audio-preload HEAD, as `src/components/queue-arcade.tsx` does. The script also makes extra reads for its assertions.

It checks these results independently of the server's scoring helper:

- All players see the same round and answer deadline. The reveal and score distribution stay hidden during answering.
- Every first vote is accepted. A repeated vote returns the same committed choice and does not add a vote.
- Reveal totals, answer bins, correct counts, each player's points, average and best scores, and cumulative party scores match the test's own calculation from submitted times and public reveal data.
- The final player in each multi-player group skips every other reveal and pauses membership updates until the next round. The next request recovers the exact committed result through `pendingRoundIds`.
- Every private party reports its expected active-player count. Both 100-player parties reject a 101st join with HTTP 409.
- Concurrent chat writes remain visible. The newest 40 messages match exactly after older messages fall out of the room's retention window.
- Votes after the answer deadline plus the 800 ms grace interval return HTTP 409.
- On separate unused source addresses, the first 12 expired vote attempts return HTTP 409 and the next eight return HTTP 429 with Retry-After. The first 150 new read identities are admitted; the 151st returns HTTP 429.

The final database query found exactly 466 started and finished sessions, 4,660 answered rounds, 4,660 unique alpha round events, and 1,126 correct answers. Every session had exactly ten answered rounds. The correctness sum matched the independent reveal oracle. Duplicate votes did not inflate those counters.

## Observed results

All latency values below are milliseconds. They exclude time in the test client's 256-request queue. These scenarios ran together, so the table is not an isolated comparison of NAT and distributed traffic.

| Group                            | Round GET p95 | Vote POST p95 | Membership POST p95 | Maximum client queue wait |
| -------------------------------- | ------------: | ------------: | ------------------: | ------------------------: |
| 1 shared source                  |          7.42 |          5.54 |                6.08 |                    223.19 |
| 1 separate source                |          7.62 |          4.66 |                5.83 |                    223.78 |
| 20 shared source                 |        122.58 |        328.81 |               19.92 |                    478.77 |
| 20 separate sources              |        201.31 |        347.88 |               37.96 |                    384.95 |
| 50 shared source                 |        167.80 |        365.77 |               33.19 |                    442.67 |
| 50 separate sources              |        241.18 |        511.32 |               27.48 |                    417.51 |
| 100 shared source                |        564.92 |        729.59 |               96.52 |                    499.14 |
| 100 separate sources             |        555.20 |        688.80 |               53.10 |                    556.44 |
| Mixed shared source, party A     |        570.71 |        660.64 |               65.32 |                    461.99 |
| Mixed shared source, party B     |        646.53 |        622.96 |               52.57 |                    446.54 |
| Mixed shared source, public room |        370.35 |        117.66 |                 n/a |                    381.14 |
| Four-player media party          |        569.36 |        628.10 |               43.89 |                    541.06 |

The final run averaged 578.66 completed requests per second, including setup, assertions, cleanup, and the deliberate throttle probes. Decoded response bodies totalled 829,027,208 bytes. This is application payload volume, not measured network transfer after transport compression. The test reached its 256-request concurrency bound. No membership tick had to skip a still-pending prior membership request in this final run.

Status totals were 125,179 HTTP 200, 4,610 HTTP 204, 134 expected HTTP 409, and nine expected HTTP 429. The HTTP 409 total consists of 120 late-vote checks, two full-party checks, and 12 expired-vote checks. The HTTP 429 total consists of eight vote-burst checks and one identity-admission check.

Peak app resident memory was 611.22 MiB. Peak used JavaScript heap was 343.18 MiB. The process started this run at 598.72 MiB after the earlier test runs and ended at 610.56 MiB. The earlier one-second membership run grew resident memory from 401.90 to 599.07 MiB. These short samples do not establish a leak or a memory bound. They do show that a 512 MiB hosting plan cannot be declared adequate from this test.

The maximum sampled event-loop delay was 159.78 ms and the highest one-second event-loop-use sample was 0.871. Total process CPU time during the measured interval was 91.88 seconds. The earlier one-second membership run recorded vote p95 up to 1.93 seconds and maximum event-loop delay of 247.86 ms. Local scheduling and warmed state affect these samples; the faster final run is not proof that analytics writes make the app faster.

## Media coverage

The media party completed five Fogged Vision rounds and five Soundcheck rounds. Three clients concurrently fetched the same live media at the opening and at the next clue stages, with a maximum of two audio clips per snapshot. The final run issued 60 image GETs and 72 audio GETs, received 18,934,500 media bytes, and verified non-empty payloads with identical content type and byte length across shared-source readers. It also issued the normal reveal preload HEADs for all connected players in all parties and the public room.

Image GET p95 was 158.54 ms and its maximum was 163.00 ms. Audio GET p95 was 6.49 ms and its maximum was 12.56 ms. The media party's longest preload HEAD was 2,530.82 ms. Media reads used the real local app proxy and native conversion paths with their normal source caches. There was no separate high-volume upstream-media load. This run did not instrument upstream fetch or encoder counts, so it does not independently prove one encoder job per shared cache key. It also does not measure 466 simultaneous media downloads or cold-cache media overload.

## Environment and limits

The app ran on localhost port 3313 with the production `.next-check` build ID `b-Fjb1-sNhRtFg4M0Kbmr`, built before the later content and browser-recovery edits. It used Next 16.3.8, Node 24.15.0, PostgreSQL 14, and a five-connection app database pool. The PostgreSQL cluster used a separate temporary directory, socket, and database. No user data, existing project store, remote database, or hosted app was used.

The machine was WSL2 on an Intel i5-13600KF with 20 logical CPUs and 17.56 GiB visible memory. Other review tasks also ran on this machine. The app ran with `next start`, not inside the intended Node 22 container or behind Render's proxy. There was no TLS, network latency, CPU quota, or 512 MiB memory cap. Guest traffic was tested; Steam account/profile writes and browser rendering at this scale were not. The disconnect check missed a reveal and recovered in the next round. It did not test a 90-second absence, host handoff, or hours-long churn. It did not fill the global 500-party cap.

The final source candidate passed the separate small regression recorded above. The current CI configuration has not run this capacity script, and no hosted Actions or container execution is claimed here.

## Follow-up from the evidence

A proposed ingress limit of 6,000 API requests per source per minute is too low for the current full-party UI. A 100-player party alone generates about 6,000 membership requests, 1,200 active-round reads, 273 votes, and 273 reveal preloads per minute before chat and other reads. The tested 120-player shared-source mix adds more. Set ingress limits from the real request cadence and measured hosting headroom, with appropriate per-route limits and burst handling. The operations guide now gives the measured cadence and a provisional limit that must be verified on the intended host.

The one-second membership payload is the largest traffic source. Polling changes, smaller updates, or server push could reduce that cost, but this run does not by itself justify a product change. Measure the final container under the intended host's CPU and memory limits before choosing its supported party count or public load limit.

# Functional audit

Date: 2026-10-06. Scope: public and private round scheduling, scoring, client state, entry and recovery, guest persistence, and supporting tests. I did not change application source. I used the working tree supplied for the audit, including existing uncommitted changes.

The expected result was that accepted answers count once, recovery preserves accepted results, each selected format uses its eligible questions, and failures leave a usable retry path. I inspected the implementation, ran the scheduler with the actual question catalog, and ran isolated Chrome sessions against the temporary production server at `http://127.0.0.1:3210`. The server uses temporary audit stores. Test player IDs, rooms, and Chrome profiles were disposable.

## Confirmed findings

### F1. Guest recovery rejects the application's own round IDs and can block all play

Severity: High, P1.

Evidence:

- `src/lib/trivia.ts:227` constructs the current long content version. A current public room ID is 170 characters and its round ID is 184 characters. A tested party round ID was 204 characters.
- `src/app/api/rounds/route.ts:78-85` discards every supplied pending round ID longer than 180 characters. The code appends the immediately preceding round separately at line 87, which masks the bug during short interruptions.
- `src/app/api/rounds/route.ts:46-48` rejects the whole request when the pending list exceeds 4,000 characters.
- `src/lib/guest-accuracy.mjs:27-31` keeps up to 24 pending IDs. It has no expiry or failure cleanup.
- `src/components/queue-arcade.tsx:2717-2726` includes that list in every room request. Lines 713-720 permit 24 entries.

Reproduction and observed result:

1. Submit an accepted answer in a temporary party's round 0.
2. Request round 2 with the accepted round 0 ID in `pendingRoundIds`.
3. The response has `previousResults: []`. The request ID was 204 characters. The stored vote exists, but the route silently discarded its ID.
4. Send 22 distinct valid public-format IDs. Their joined length is 4,069 characters.
5. The API returns HTTP 400 and `Invalid pending rounds.`

A guest who repeatedly closes or suspends a tab before seeing the reveal can accumulate unrecoverable IDs. At the limit, every later room request fails, including new runs and reloads. The error persists until browser storage is cleared. This also affects a connected user who signs in after the browser has accumulated guest pending entries, because the client sends the same list for every account state.

Recommended fix: define one round ID contract for producers and consumers, preferably compact opaque IDs. Make the total request limit consistent with the allowed count. Scope and expire pending entries, remove invalid entries, and do not let recovery metadata prevent the current round from loading. Test the actual generated ID length, recovery after at least two missed rounds, and the full 24-entry pending list.

Proof: `functional-browser.mjs`, `functional-browser.log`. The log has `MISSED_ROUND` and `PENDING_LIMIT` records.

### F2. Correct answers increment the session streak twice

Severity: Medium, P2. Fix before launch because this affects ordinary play on every correct answer.

Evidence:

- `src/components/queue-arcade.tsx:2783-2785` increments the guest session correct count and streak in `creditGuestRound`.
- `src/components/queue-arcade.tsx:2841-2847` calls that function on a normal guest reveal.
- The alternate branch increments the connected session counters at `src/components/queue-arcade.tsx:2862-2864`.
- `src/components/queue-arcade.tsx:2870-2872` then increments both counters again for either path.
- `src/components/queue-arcade.tsx:3775` requires a correct count of exactly 1 for First Blood.

Reproduction and observed result: start a fresh browser profile, play one Spell Link party round, and click the correct hero. The real browser rendered `Gold219Streak2`. Its stored lifetime record contained `answered: 1` and `correct: 1`. There was no First Blood banner. The accepted answer and correct hero state were visible in the reveal.

The duplicate update makes the session streak inaccurate and skips First Blood. Later streak announcements occur too early. This finding does not claim that stored Steam profile streaks double, because those use server records.

Recommended fix: apply the session counter update in one place. Keep lifetime persistence and session reconciliation separate. Test one correct answer, two consecutive correct answers, a wrong answer, a missed reveal, and a resumed accepted answer in the component flow.

Proof: `functional-browser-extra.mjs` and `functional-browser-extra.log`. The `CORRECT_ONE` record includes the counter text and stored lifetime JSON. A separate public-game run also showed a visible streak of 2 after one correct answer. See `functional-public.log` and `functional-public-tab2.png`.

### F3. Private game selections repeat blocks and omit eligible questions

Severity: Medium, P2.

Evidence:

- `src/lib/private-room-rounds.ts:48-55` passes the host's selected formats to the shared scheduler.
- `src/lib/semantic-schedule.mjs:8-9` sets the semantic slot count to 12.
- `src/lib/semantic-schedule.mjs:283-293` calculates the format, slot, and bucket occurrence with an assumption that the format cadence and 12 are coprime.
- That assumption is true for the 13-format public cadence. It is false for common party selections with 2, 3, 4, 6, 8, 9, 10, or 12 formats.

Reproduction and observed result: run `node evidence/functional-scheduler.mjs` with the current catalog and deterministic seed `functional-audit`.

- Classic Trivia only has 3 formats. Its first 12 questions repeat exactly in rounds 12 through 23 and again in rounds 24 through 35. The 10,000-round sample reaches 256 of 342 eligible questions.
- Shopkeeper only has 2 formats. Its first 12 questions repeat immediately. The sample reaches 88 of 100 eligible questions.
- Spell Link plus Fogged Vision has 2 formats. It repeats the first 12 questions and reaches 128 of 254 eligible questions.
- Classic Trivia plus Shopkeeper plus Spell Link has 6 formats. It repeats 12-question blocks and reaches 250 of 569 eligible questions.
- Flashback alone, a 1-format control, reaches all 191 eligible questions and has a minimum exact-question gap of 180 rounds.

The unreachable buckets are a mathematical consequence of the fixed format and slot residues, not only a short sample. At the 22-second round cycle, common parties repeat the same questions after 4 minutes 24 seconds.

Recommended fix: design the bucket assignment and occurrence calculation for arbitrary selected cadences. Ensure each format can visit every intended subject bucket. Test all nonempty supported game selections for reachability, deterministic batch consistency, and duplicate spacing. Keep the current public cadence as a regression case.

Proof: `functional-scheduler.mjs` and `functional-scheduler.log`, records prefixed `SUBSET`.

### F4. A transient first room request failure has no automatic recovery

Severity: Medium, P2.

Evidence:

- `src/components/queue-arcade.tsx:3104-3106` sends the entry request directly, without the sync gate or an abort timeout.
- On failure, lines 3147-3152 clear the room settings and display `Could not join the public room · retrying.`
- Lines 3169-3175 attempt direct `/play` entry once through `autoStartAttemptedRef`.
- Lines 3562-3565 do not start the recovery heartbeat while the phase is `lobby`.
- Lines 3038-3039 also prevent sync when the failed entry cleared the settings.

Reproduction and observed result: open `/play` in Chrome with an injected network fault that makes only the first `/api/rounds` request return HTTP 503. Later requests would succeed. After 11 seconds, the client had sent exactly one room request, remained in `lobby`, and still displayed `retrying.`

A transient service error, including a cold-start failure, requires the user to press Play again or reload. A hung entry request is worse because it has no timeout and retains `joiningRoomRef`, which prevents another entry attempt.

Recommended fix: give entry requests an abort timeout and bounded retries. Keep the retry state explicit, cancel it on navigation, and make the message match the action. Test one failed initial request followed by success and one initial request that never settles.

Proof: `functional-browser.mjs` and `functional-browser.log`, record `INITIAL_FAILURE`.

### F5. Browser storage failure crashes the app before play

Severity: Medium, P2.

Evidence:

- `src/components/queue-arcade.tsx:3670-3695` catches storage errors during hydration and claims corrupt local data must not stop a round.
- `src/components/queue-arcade.tsx:3702-3705` then calls `localStorage.setItem` in an effect without a guard.
- Other unguarded writes occur at lines 2576-2578, 2754, and 2766.
- `src/lib/guest-accuracy.mjs:17-18` also lets storage write errors escape.

Reproduction and observed result: in a fresh Chrome page, make `Storage.prototype.setItem` throw the standard `SecurityError` used when browser storage is unavailable. Navigate to `/`. The page renders the error boundary, `ARCADE INTERRUPTED` and `That round crashed`, before any round starts.

Quota exhaustion can also make writes throw. This is a conditional compatibility issue, not a claim that default browser settings fail.

Recommended fix: wrap storage reads and writes in a small adapter with an in-memory fallback. Let sound settings, IDs, and active play continue even when persistence is unavailable. Test blocked storage and quota errors through the browser flow.

Proof: `functional-browser-extra.mjs` and `functional-browser-extra.log`, record `STORAGE_DISABLED`.

### F6. Completed private parties retain scheduler memory for the process lifetime

Severity: Medium, P2. Resource risk grows with party turnover and service uptime.

Evidence:

- `src/lib/semantic-schedule.mjs:21` declares a process-level WeakMap.
- `src/lib/semantic-schedule.mjs:254-277` retains a nested Map entry for each distinct seed and selected format set, without a size limit or expiry.
- The WeakMap key is the long-lived `triviaQuestions` array, so completed entries cannot be collected while the app serves that catalog.
- `src/lib/private-room-rounds.ts:49` includes the private room ID and start time in the seed. A new party produces a new cache entry.
- `src/lib/private-rooms.mjs:339-348` removes the room after the last player leaves, but does not remove its cached schedule.

Reproduction and observed result: run the scheduler proof with `node --expose-gc`. Create, schedule, and delete 1,000 temporary in-process parties using the actual catalog. Force garbage collection at each checkpoint.

- 100 created and deleted parties retained about 3.57 MB.
- 500 retained about 17.52 MB.
- 1,000 retained 35,011,240 additional heap bytes after collection.
- The private room Map contained zero rooms at the end.

This is about 35 KB retained per full-format party in this process. Actual hosting overhead and limits vary. The finding is distinct from the documented in-memory party state because the memory remains after that state is deleted.

Recommended fix: bound the schedule cache, expire private entries with rooms, or share immutable precomputed data while retaining only a small per-party permutation. Test memory after many create, play, and leave cycles.

Proof: `functional-scheduler.mjs` and `functional-scheduler.log`, records `MEMORY` and `AFTER_ALL_ROOMS_DELETED`.

### F7. Two guest tabs share a settlement key but have different voter IDs

Severity: Medium, P2.

Evidence:

- `src/components/queue-arcade.tsx:2572-2580` creates a guest voter ID in `sessionStorage`, independently for each tab.
- `src/lib/guest-accuracy.mjs:39-49` marks a round settled in shared `localStorage`, using only the round ID.
- `src/components/queue-arcade.tsx:2753-2757` checks that shared settlement marker before applying the tab's session gold, history, or normal streak increment.

Reproduction and observed result: open two fresh public `/play` tabs in one Chrome profile. Both tabs answered the same Spell Link question correctly as distinct guests. Both votes were accepted. At reveal, both crowd summaries displayed `You +223`. The visible session panel in tab 1 displayed `Gold 0` and `Streak 1`. Tab 2 displayed `Gold 223` and `Streak 2`. Shared lifetime storage recorded one answer. Tab 1 had no history record for its accepted answer.

The first tab to settle prevents the other tab from receiving its own session credit. F2 explains why the two streaks differ as well. The two defects have separate causes. A shared lifetime record may intentionally count one browser result, but it must not suppress an accepted vote's active-session score or disagree with the server's `You` score.

Recommended fix: define whether guest identity belongs to a tab or a browser. Make pending and settled keys follow that identity. Deduplicate lifetime persistence separately from per-tab session updates, and reconcile state between tabs. Test two accepted votes and two independently displayed sessions.

Proof: `functional-public.mjs`, `functional-public.log`, `functional-public-tab1.png`, and `functional-public-tab2.png`. The `PUBLIC_TWO_CORRECT` record contains both visible score panels and server-derived crowd summaries. `functional-tabs.mjs` and `functional-tabs.log` reproduce the same state in a party.

### F8. A late accepted vote can lose its party ranking points permanently

Severity: Medium, P2. Trigger requires a vote commit to overlap the reveal read.

Evidence:

- `src/app/api/votes/route.ts:79` captures the acceptance time before the asynchronous store operation at lines 119-133.
- The route adds party points only after that operation completes, at lines 135-136.
- `src/app/api/rounds/route.ts:115-122` can settle the round in the meantime.
- `src/lib/private-rooms.mjs:286-295` marks a round settled even when no pending award exists.
- `src/lib/private-rooms.mjs:308` excludes a later award for an already settled ID from recovery.

Deterministic check: `functional-settlement.mjs` loads the unchanged TypeScript POST and GET route functions through TypeScript transpilation. It uses the real private-room and scoring modules. A controlled vote-store dependency holds a correct vote's commit. The test captures submission at deadline plus 700 ms, inside the 800 ms acceptance grace. A reveal request at deadline plus 850 ms sees no committed vote and marks the round settled. The commit then completes and the POST returns HTTP 200 with `accepted: true`. On the next round, `previousResults` correctly reports 100 points, while the party ranking remains zero. The pending award still contains 100 points, but the recovery function returns no pending ID.

This proves the route interleaving with controlled storage. It does not measure its frequency against the deployed Postgres database. The local file store serializes reads behind its write queue, so it can mask the database timing problem.

Recommended fix: make final settlement depend on committed votes and ensure an accepted award can be applied after the first reveal read. Avoid a permanent settled marker for an empty or incomplete award set. Test both an in-progress first vote and a final vote that changes the crowd multiplier at the cutoff.

Proof: `functional-settlement.mjs` and `functional-settlement.log`, records `BEFORE_COMMIT`, `VOTE_COMMITTED`, and `NEXT_ROUND`.

### F9. A delayed lobby chat response can restart an active party view

Severity: Medium, P2. Trigger requires a chat response to arrive after the party starts.

Evidence:

- `src/components/private-room-panel.tsx:523-535` sends chat through `requestRoom` without a request signal or component-generation check.
- `src/components/private-room-panel.tsx:328-337` applies that response even if the initiating panel has unmounted.
- `src/components/private-room-panel.tsx:317` sends its old `waiting` state to the parent.
- `src/components/queue-arcade.tsx:3065-3079` clears the active room settings and question when that old response says the party is waiting.
- Reentry through `startRun` resets the session state at `src/components/queue-arcade.tsx:3125-3129`.

Reproduction and observed result: hold a real successful chat POST response from the party lobby. Let the host start the party. Answer one question correctly and reach reveal. Release the old chat response. A MutationObserver saw `reveal`, then `lobby`, then `reveal`. The session counter text changed from `Gold218Streak2` to `Gold0Streak1`. This test delayed the response in Chrome without changing application code or server data. It did not show a loss of the separate server-owned party ranking score.

The same callback can interrupt an answer in progress and reset its controls. The observed reset was at reveal. Test interruption during an unfinished recipe or ordered-answer input as a follow-up.

The related GET poll path passed the check. Its old waiting response had an aborted controller after the lobby panel unmounted and did not interrupt the game. Do not report all out-of-order party reads as broken.

Recommended fix: ignore responses from unmounted or superseded party views. Keep chat delivery separate from authoritative party lifecycle updates, or attach a sequence/generation to all requests. Test delayed chat, start, and rename responses across the lobby-to-game transition.

Proof: `functional-ordering.mjs` and `functional-ordering.log`, records `OLD_WAITING_POLL`, `BEFORE_OLD_CHAT`, and `AFTER_OLD_CHAT`.

## Additional integration risks

This needs targeted follow-up before treating it as a confirmed user-flow defect.

- Connected users have server-owned lifetime records, but local session recovery for skipped reveals only calls the guest credit function at `src/components/queue-arcade.tsx:2944-2951`. That function immediately returns for connected users at line 2753. A connected tab that misses a reveal can therefore omit its accepted result from the session gold and history even though its profile remains correct. Test with a temporary authenticated account and a frozen tab.

## Explicit policy conflict

A party code can be reclaimed after all tabs have been silent for 90 seconds. `src/lib/private-rooms.mjs:377-382` deletes the previous party before creating the replacement. This behavior has an explicit test at `tests/private-rooms.test.mjs:408-419`. It is therefore a deliberate current policy, not an accidental implementation error.

A pure-module check created a Classic Trivia party with two members and a host score of 250. At 90,001 ms of inactivity, another host created a Flashback party using the same code. The original host's next poll joined the replacement party as a guest with zero points. The original roster was gone. See `functional-code-reuse.log`.

The policy conflicts with the README promise that away players keep their seat and score and that only Leave removes them. The 30-minute room idle timeout also does not describe this shorter replacement window. Before launch, decide whether codes remain reserved for the party lifetime or whether the UI must clearly explain the 90-second reclaim rule. This is relevant to users who pause all party tabs while accepting a Dota match.

## Coverage and maintainability

The code has useful boundaries: server-owned deadlines and correctness checks, phase-aware question delivery, a shared scoring formula, stable question revisions, a deterministic scheduler, and a sync gate that replaces stalled active-room polls. These are appropriate foundations.

The tests cover many pure contracts, but the confirmed defects cross those contracts. `tests/scoring.test.mjs` checks the formula and crowd multiplier. `tests/guest-accuracy.test.mjs` checks one storage object and short example IDs such as `round-1`. `scripts/validate-semantic-repetition.mjs:71-78` checks only the full public cadence. The standard public browser smoke reaches a reveal without checking that one correct answer produces streak 1 or First Blood. Unit success therefore does not cover the actual counter updates, current round ID lengths, or private subset scheduling.

The 5,144-line `queue-arcade.tsx` combines polling, answer controls, local persistence, account state, audio, party navigation, and ten question renderers. The state is split across React state and many mutable refs. The duplicate counters and separate entry recovery path show specific costs of that design. After fixing the defects, extract round reconciliation and storage access into testable modules. Retain browser tests across reveal, navigation, refresh, and account changes. Avoid a broad rewrite before those tests exist.

Recommended missing checks:

- One correct answer and one wrong answer through both guest and connected browser flows.
- Reload during answering, reload during reveal, freeze across two or more rounds, and close before reveal.
- A pending list at its full supported size, using real generated IDs.
- Every nonempty private game selection through the deterministic scheduler.
- Initial and active-room HTTP 503, a request that never settles, and out-of-order responses.
- Two tabs with guest votes and independent tab IDs, with expected scores asserted in each visible panel.
- Storage disabled and quota exhausted.
- Slow accepted votes at the deadline and score settlement afterward.
- Sign-in, sign-out, and session expiry while a party is open.

## Limits

I did not make a live Steam login, modify a real profile, or exercise the production database. The root audit runs the repository-wide checks and owns the deployment audit. These functional probes ran against the temporary local production build. Audio speaker output and accessibility are covered by other audit work, not by the muted Chrome runs here.

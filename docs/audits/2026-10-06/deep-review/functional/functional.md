# Functional and player-journey review

The deep pass found and fixed seven functional defects, plus several accessibility and content presentation defects. The final production build `IqM7S-izzhLw1FS90-lLJ` passed all 54 deep journeys and all 18 existing gameplay checks on the isolated loopback server at port 3320. Both test processes exited with status 0.

## Confirmed defects and fixes

| Defect | Evidence before the fix | Result after the fix |
| --- | --- | --- |
| Hero search had no editable input on phones. The virtual keyboard could not be opened. | `evidence/baseline/user-journeys.json`, mobile hero case. | A labelled search input accepts touch and keyboard input. A unique match can be submitted with Enter. Zero or several matches cannot submit. The first match scrolls into the hero grid without moving the page. |
| A cancelled party join/create could finish later and navigate back into the party. | `evidence/baseline/user-journeys.json`, delayed join/create cases. | Entry requests use cancellation and generation guards. Back invalidates both the pending request and its response. Rapid Join submits once. |
| A party request whose headers arrived but body never ended left Join busy indefinitely. | `timeout-baseline.log`, held response body. | The five-second request deadline includes JSON body consumption. An error appears and Join is usable again. Poll, rename, start and chat use the same full-body deadline. |
| An unsent chat draft was lost when the waiting panel remounted as the play dock. | `chat-draft-baseline.log`, empty draft after start. | A bounded session-storage draft is scoped to the party code. The text survives the transition and sends once. Failure restores it only if the user has not replaced it. |
| An old guest tab could credit an account's accepted result to guest lifetime statistics after the shared session changed. | `account-baseline.log`, guest answered count increased from 0 to 1 for a connected result. | Server responses carry the identity used for that operation. Client persistence uses that identity; a changed identity resets the local run. Delayed profile/vote responses cannot overwrite newer identity state. Pending recovery metadata moves to the returned identity. Unknown metadata cannot create guest credit or add unowned points to a known run. |
| After reading a mobile reveal, the next round could start with its prompt above the screen. | `scroll-baseline.log`: all six 320/390px Flashback, hero and shop transitions failed. Prompt tops ranged from −64px to −575px while the sticky timer remained visible. | A new answering round scrolls the game stage into view only when its prompt or timer is outside the viewport. Nine targeted cases pass, including nested grid/search reset, unchanged scroll on clue/reveal updates, and preserved chat focus. The existing report-focus test also passes at 320px. |
| A delayed masked vote response could overwrite an already revealed authoritative score. | `gameplay-final.log`, score changed from 200 to 225 after the held response was released during the identity fix. | A masked same-identity response keeps the current revealed crowd result. A new identity with masked crowd waits for a fresh room snapshot before finalizing. The independent gameplay recovery suite is green. |

Related fixes completed with the UI, security and content reviewers:

- Report reason focus remains on the same button when the report moves into the carryover panel at the next round. A stale report result cannot alter a new identity's report state.
- Shop search has a programmatic label. Shop category buttons use a native button group, without an unsupported tab keyboard contract.
- The timer is readable but no longer announces every second through a live region.
- The reviewer format table can receive keyboard focus for horizontal scrolling.
- Recipe copy and the included-scroll badge use audited `recipeCost`. Zero-cost recipes say “No recipe required”; missing legacy metadata makes no scroll claim. Public answer-phase metadata contains no component answer key.
- The party chooser has a visible heading and instructions. Its pre-membership exit says “Back to lobby.”

## Source locations

- `src/components/queue-arcade.tsx`: hero/shop input, recipe presentation, report focus, timer, identity adoption, result settlement and delayed response guards.
- `src/components/private-room-panel.tsx`: full-body deadlines, entry cancellation, duplicate-action guard, scoped chat draft and entry copy.
- `src/lib/player-identity.ts`, `src/lib/arcade-contract.ts`: explicit normalized response identity. Store return types omit this HTTP-layer field; the route adds it from the captured authenticated caller.
- `src/lib/public-question.mjs`, `src/lib/public-question.ts`, `src/lib/trivia.ts`: public recipe cost metadata.
- `src/app/ops/page.tsx`: keyboard access to the horizontally scrollable format table.
- `scripts/check-user-journeys.mjs`, `scripts/lib/journey-browser.mjs`: durable browser journeys using real serialized questions and controlled API timing. Optional local-only live scenarios test real party endpoints and SSR profile UI.
- `tests/player-identity.test.mjs`, `tests/public-recipe-metadata.test.mjs`: identity namespace validation and public recipe metadata/secrecy.

## Verification

- Before the identity additions, 34 browser journeys passed, including real API host leave/handoff, guest reload, host rejoin, and mock-failed profile deletion: `journeys-iteration-2.log`.
- Eight identity race journeys passed: `identity-final.log`. They cover account adoption, logout into a separate guest run, same-round unlock, late accepted and failed vote responses, missing metadata, stale profile response, pending ownership migration from an old tab and initial metadata restoration. The ninth known-identity metadata-gap case passed in the final full run.
- All 18 existing gameplay checks pass after the new identity contract: `gameplay-final-2.log`. This includes 100 concurrent rounds/200 guest credits, stale mirror protection, denied IndexedDB, missed reveals, late vote commits, crowd correction, keyboard modifiers and focused native controls.
- Five focused test files passed, 23 assertions: `functional-unit.log`.
- Final source type and lint output: `scroll-typecheck.log`, `scroll-lint.log`. The earlier identity pass is also retained as `functional-typecheck-final-2.log` and `functional-lint-final-2.log`.
- All 45 complete journeys passed on the development server: `journeys-final-3.log`, structured results under `evidence/final-3/user-journeys.json`. The initial production candidate also passed those 45 journeys. After the mobile transition fix, the final build passed all 54 journeys: `journeys-production-scroll.log` and `production-scroll-user-journeys.json`. All 18 gameplay checks passed again in `gameplay-production-scroll.log`. Both processes exited 0.

The full journey run uses native CDP touch events for all supported answer families: four-choice questions, hero grid, item grid, recipe builder, year slider and order cards. It tests invalid partial submissions, Undo/removal, single-match search, failure/retry, offline recovery, report carryover, keyboard year controls, browser Back/Forward, resize during a partial answer and chat during party start.

The touch helper initially moved a native slider and tapped Lock inside Chromium's post-drag click-suppression window. The same missing first click reproduced on a plain native HTML range and button, with no application code (`touch-native-debug.mjs.txt`). CSS touch-action changes did not alter it. The durable test lets the native gesture settle for 350 ms, then performs one Lock tap. The range value and resulting answer are still asserted. This is a browser gesture constraint, not an app event-handler fix.

## Limits

Browser touch emulation is not a physical iOS or Android device test. External Steam login, a real change of Steam account and an external deployment were not exercised in this subtask. Identity race tests control the API response timing and identity, while separate route tests prove that the server binds that identity to the captured cookie. The real private-room scenarios run only on explicitly enabled loopback test servers and use temporary names/room codes. Profile error tests do not delete the synthetic account.

No active blocker remains in this client scope after the final production build passed all 54 journeys and all 18 gameplay checks. Release decisions still depend on root's integrated production build, security, content and infrastructure checks.

The final nine added mobile cases check actual round transitions without resetting scroll in the fixture. They verify the question heading is fully visible below the timer, then submit an answer by touch. Both nested grids start scrolled and filtered; same-round clue updates preserve those states, while a new round clears them. Reveal does not trigger a page reset. A focused party chat retains its draft, focus and scroll position. A focused mobile report keeps its reason button through carryover.

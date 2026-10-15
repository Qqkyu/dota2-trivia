# Accessibility and browser review

The confirmed accessibility defects found in this pass are fixed. Chromium 153, Firefox 151 and WebKit 26.5 passed the final authenticated page, mobile format and keyboard checks. All three engines also passed the long-explanation and round-transition checks after their respective fixes. This review does not establish full WCAG conformance.

The durable browser check is `scripts/check-accessibility.mjs`. It uses actual DOM output, axe 4.14, keyboard events, the Chromium accessibility tree, screenshots and measured page widths. It fails on serious or critical axe violations, page overflow, browser errors, lost report focus, live timer ticks and unsupported tab keyboard behavior. It records incomplete axe checks for manual review. API round, vote, session and report requests use isolated responses. These tests did not submit votes or reports to a live service.

## Coverage

The baseline production server was `http://127.0.0.1:3310`, followed by development checks on port 3311. Production verification used these builds:

| Build | Scope |
| --- | --- |
| `a9jO2vwwKVTSsroYDHJJW`, port 3315 | All 16 answering formats across six accessibility modes in the three engines. Chromium and Firefox also completed all 42 page states. WebKit page coverage was completed on the later authenticated build. |
| `DKFXc21icCaO5DvyThFkY`, port 3318 | In each engine: seven page states across six modes, all 16 mobile formats and five keyboard cases. The account API and rendered profile both confirmed a long synthetic name, 100 answers and ten format records. |
| `sC6gD0NWB3unDRTq6LaOu`, port 3319 | The only later change removed four CSS declarations that clamped reveal paragraphs. Three real explanations were tested at 320x568 and 960x540 in each engine. All 18 cases passed. |
| `IqM7S-izzhLw1FS90-lLJ`, port 3320 | A later fix brings the next question back into view on phones. All three engines pass six keyboard cases, including the new round after scrolling below the old question. The prior build fails the same check. |

The initial synthetic cookie was shorter than the API's accepted token length. It loaded the server-rendered profile, while `/api/me` correctly returned guest state. Those earlier runs therefore cover the guest main app and the server-rendered profile. The final port 3318 checks used a valid token and a new mandatory `/api/me` authentication guard. The profile had a 59-character synthetic name, 100 answers and ten format records. The guard rejects the old invalid fixture before a new test run starts.

| Browser | Exact engine version | Coverage |
| --- | --- | --- |
| Chromium | 153.0.8010.12 | Full format matrix, final signed page/mobile/keyboard matrix, explanation checks, accessibility tree and forced-color keyboard checks |
| Firefox | 151.0 | Full format matrix, final signed page/mobile/keyboard matrix and explanation checks |
| WebKit | 26.5 | Full format matrix across separate runs, final signed page/mobile/keyboard matrix and explanation checks |
| Chromium | 121.0.6167.160 | Baseline mobile pages and all answer formats |
| Firefox | 115.0 | Baseline mobile pages and all answer formats |
| WebKit | 17.0 | Baseline mobile pages and all answer formats |

The Chromium full matrix covered six page routes and 16 answer formats at 1280x900, mobile 320x640, a 200% reflow equivalent of 640x450, a 400% reflow equivalent of 320x225, reduced motion, and forced colors. Initial baseline and development passes had 132 rendered cases each, plus keyboard checks. The production passes added the party creation state with one format deselected, for 138 rendered cases across six modes. The final authenticated matrix then checked all 42 page states and all 16 mobile formats per engine.

The answer formats were classic ability, hero and item trivia; shop recipe, build and path; Spell Link; Fogged Vision; Echo Hunt; Quote Hunt; Aghanim's Lab; Soundcheck; Order Up; and Flashback year, choice and order.

The 200% and 400% checks used equivalent CSS viewport dimensions and device scale, not the browser's native zoom menu. This checks the reflow dimensions in the [WCAG reflow guidance](https://www.w3.org/WAI/WCAG22/Understanding/reflow.html). Firefox does not support Playwright's `isMobile` switch, so its mobile checks used the same 320px touch viewport without that switch.

## Confirmed defects and fixes

| Defect | Evidence and impact | Result |
| --- | --- | --- |
| Hero answer targets were too small on phones | Baseline 320px hero buttons measured about 21x20px. Axe reported 127 target-spacing failures in each of the five hero-picker formats. | Mobile targets now measure at least 44px. All 16 corrected mobile formats pass the target-size check in current Chromium, Firefox and WebKit. |
| Mobile pages expanded beyond the viewport | Chrome 121 mobile pages expanded from a configured 320px viewport to 331px. Checking only `innerWidth` would miss the defect. | Global minimum width was removed. The final script compares page width against the configured viewport, and all final mobile page states fit. |
| Report focus was lost at a round change | Opening a report with Enter, focusing a reason, then receiving the next round moved focus to `BODY` when the menu moved. | The same reason receives focus in the carryover group. Verified with actual round response changes and keyboard focus, including forced colors. Source: `src/components/queue-arcade.tsx:3025` and `:3788`. |
| Shop section controls claimed tab semantics without tab keys | The old `role=tab` controls did not move focus with ArrowRight. | They are native buttons in a named group with pressed state. This removes an unsupported [ARIA tabs keyboard contract](https://www.w3.org/WAI/ARIA/apg/patterns/tabs/). |
| Timer updates were live announcements | Chromium's accessibility tree exposed the timer as a polite live region while its name changed each second. | The timer has `aria-live="off"`. The final accessibility tree has no live region property. Source: `src/components/queue-arcade.tsx:4537`. |
| Profile text contrast was too low | The account fixture exposed small You/Crowd labels at 3.04:1, the privacy note at 3.5:1 and an Aghanim preview label at 3.47:1. Whole-card opacity dimmed text. | Whole-card dimming was removed and the privacy note color changed. The final profile checks pass at desktop, mobile and both reflow sizes. Source: `src/app/profile/profile.module.css:195` and `:370`. |
| Ops table could not be reached for keyboard scrolling | Axe reported `scrollable-region-focusable` on the narrow format health table. | The named table now has `tabIndex={0}`. Chromium and Firefox final checks pass. Source: `src/app/ops/page.tsx:192`. |
| Deselected party labels were dimmed below normal text contrast | The enabled Classic Trivia toggle used opacity 0.45. Axe could not resolve the textured background and returned an incomplete result. A raster sample measured about 4.01:1 for its 16px label. | Whole-card opacity is now 1. The same raster sample is about 15.82:1. Checked and unchecked markers still show state. Source: `src/components/private-room-panel.module.css:56`. |
| Reveal explanations were clamped to two lines | The UI pass found clipped answer explanations. An independent three-engine check measured the paragraph and tested whether its first and last text lines could be reached by scrolling. The old build failed five of six Chromium cases. | All 18 final cases pass at 320px and 960px. The Shadow Shaman explanation now uses eight visible lines on the phone layout. Source: `src/components/queue-arcade.module.css:4321`. |
| The next question could stay above the phone viewport | After scrolling to answers, a new round kept the old document scroll offset. The independent check advanced a real mocked round snapshot with the old question above the viewport. | The new prompt and timer are visible in all three engines. The prompt moves from y=-317px before the transition to y=250px afterward. Existing report-focus checks still pass. The functional suite separately tests chat focus and same-round updates. Source: `src/components/queue-arcade.tsx:3783`. |

The shop search also received an explicit `aria-label="Search shop items"`. The old placeholder already supplied a fallback name to axe, so this was an improvement rather than a confirmed missing-name violation.

Small inline links remain in the raw target geometry. They are not automatically failures. The target-size rule has spacing and inline-text exceptions, as described in the [WCAG target-size guidance](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html).

## Keyboard, motion and contrast findings

The keyboard pass recorded the first 14 Tab stops in classic trivia, shop build, Fogged Vision, Order Up and Flashback year. It checked report opening, reason focus and focus after a round transition. The functional agent's separate journey suite covers answer submission and fuller keyboard flows.

The report control is an inline group, not a modal dialog. It does not trap focus. Escape leaves the group open, but the user can continue tabbing, select a reason or toggle the report control. This was not classified as a modal-dialog defect.

The full corrected Chromium pass found no running animation that ignored reduced-motion preferences. Forced-color screenshots showed readable system colors and a visible keyboard border. Moving focus between report reasons changed the actual screenshot. Axe still reported authored-color contrast warnings in forced-color mode, even though the browser painted system colors. The script retains those warnings but does not count them as confirmed forced-color failures.

Contrast checking has limits on this app's textured backgrounds. The final JSON retains axe's incomplete `color-contrast` results. The unchecked party label was one concrete defect found by reviewing those results and the screenshot. The profile and privacy pages have no incomplete contrast results in the final mobile checks. A full manual measurement of every text/background combination remains outside this automated result.

Two test-tool issues were resolved during production checking. Firefox cannot capture a full-page image taller than 32767 device pixels, so screenshots now use CSS pixels while viewport and scale measurements remain unchanged. A WebKit retry also exposed a fixture race. The fixture originally advanced after its first HTTP request, which account initialization could cancel. The app then correctly waited for another round, but the static fixture never advanced again. The test now waits for the DOM to acknowledge the entry round before it advances. The saved failure state shows the waiting phase and no browser error. These runs are retained as test-tool diagnostics, with separate successful retry evidence.

One intermediate development run reported a calibration hydration mismatch, with a server count of 1516 and a client count of 1517. It did not recur in the complete final page pass after edits settled. Treat it as a development hot-reload observation unless it recurs in the production build. The older WebKit baseline also reported navigation-time `/api/me` errors; current checks use a fresh browser context per page, and current WebKit did not reproduce them.

## Evidence and rerun

The archived machine evidence is in `evidence/`. The summary index is `accessibility.json`. Full temporary screenshots remain under `/tmp/queue-arcade-deep-review/accessibility/`; the archive includes selected before-and-after images.

Representative screenshots:

- [Baseline small hero targets](screenshots/chromium153-baseline-mobile-fogged-vision.png)
- [Final signed mobile hero picker](screenshots/chromium153-final-signed-mobile-fogged-vision.png)
- [Final long-name profile at 400% reflow](screenshots/chromium153-final-signed-zoom400-profile.png)
- [Party label before contrast fix](screenshots/chromium153-reviewer-fixed-mobile-party-unchecked.png)
- [Final readable unchecked party label](screenshots/chromium153-final-signed-mobile-party-unchecked.png)
- [Forced-color report focus](screenshots/chromium153-production-forced-keyboard-report-focus-second.png)
- [Final report focus after round change](screenshots/webkit265-final-signed-report-carryover-focus.png)
- [Current WebKit mobile format](screenshots/webkit265-final-signed-mobile-shop-build.png)
- [Clipped explanation before the fix](screenshots/chromium153-reveal-before-320x568-aghanim-upgrade.png)
- [All explanation lines after the fix](screenshots/chromium153-final-reveal-320x568-aghanim-upgrade.png)
- [New question left above the viewport before the fix](screenshots/chromium153-scroll-before-mobile-next-round.png)
- [New question visible after the fix](screenshots/chromium153-final-keyboard-scroll-mobile-next-round.png)

To rerun, supply `APP_URL`, `PLAYWRIGHT_MODULE`, `AXE_SOURCE` and `BROWSER_EXECUTABLE`, then run `node scripts/check-accessibility.mjs`. Use `BROWSER_ENGINE=firefox` or `webkit` for those engines. `A11Y_MODES=mobile` runs the narrow matrix; omit it for the full matrix. `A11Y_REVIEWER_COOKIE` is only for a disposable local reviewer fixture and must authenticate through `/api/me`. Add `A11Y_EXPECT_PROFILE_NAME_LENGTH=40` and `A11Y_EXPECT_PROFILE_MIN_ANSWERS=100` to assert the populated fixture. `A11Y_FIXTURE_MODES=mobile` limits gameplay to mobile while retaining all requested page modes. `A11Y_BUILD_ID` records the tested build. The default command exits nonzero on recorded failures. `A11Y_REPORT_ONLY=1` preserves failure evidence without setting that exit code. Targeted ESLint and `git diff --check` passed. The temporary cross-engine reveal probe is archived as `evidence/reveal-check-source.txt`; the durable paragraph and line-reachability checks are also in `scripts/check-responsive-ui.mjs`.

Current Firefox and WebKit builds were downloaded to `/tmp/queue-arcade-deep-review/browser-cache`. WebKit 26.5 needed four Ubuntu 22.04 libraries extracted under `/tmp/queue-arcade-deep-review/webkit-libs`: libavif13 0.9.3-3, libgav1-0 0.17.0-1build1, libyuv0 0.0~git20220104.b91df1a-2 and libabsl20210324 0~20210324.2-2ubuntu0.3. A temporary launcher points only that browser at these libraries. No packages were installed into the operating system and no personal browser profile was used.

Not verified here: real iPhone Safari, Android Chrome, native browser zoom, Windows High Contrast, VoiceOver, NVDA or JAWS speech output. The WebKit checks ran on Linux. Apple's Safari application and iOS keyboard behavior were not tested. The Chromium accessibility tree confirms exposed names, roles and live-region settings, but it cannot prove screen-reader usability by itself.

## Execution times

These are measured wall times for the successful browser processes. They include page setup, axe checks and screenshots.

| Browser | Final signed page/mobile matrix | Final six keyboard cases |
| --- | --- | --- |
| Chromium 153.0.8010.12 | 49.03s | 4.31s |
| Firefox 151.0 | 83.88s | 8.40s |
| WebKit 26.5 | 368.59s | 50.27s |

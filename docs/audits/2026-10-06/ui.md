# UI and user-flow audit

Audit date: 2026-10-06. Repository commit: `7528a842754642d249640531df3f6fc91bf032b9`.

The expected result was that supported desktop flows remain usable with mouse and keyboard, browser shortcuts do not submit answers, errors preserve user input and permit recovery, and every current round type renders without missing controls or horizontal overflow. Repeatable checks run against the isolated production build at `http://127.0.0.1:3210`. Source files and existing user data were not changed.

## Confirmed defects

### UI-01, P2: Browser shortcuts submit irreversible four-choice answers

Source: `src/components/queue-arcade.tsx:3708-3727`.

The global four-choice keyboard handler reads the letter or number without checking Ctrl, Meta, or Alt. Browser commands become game answers, and the handler prevents the normal command.

Browser reproduction with a Classic Trivia round:

- `Ctrl+A` posts `answerIndex: 0`.
- `Ctrl+C` posts `answerIndex: 2`.
- `Ctrl+D` posts `answerIndex: 3`.
- `Alt+1` posts `answerIndex: 0`.

Each case started with no answer selected. The browser's own `/api/votes` request was captured. These votes cannot be changed during the round. The same handler serves all four-choice rounds. Meta modifiers are also unguarded in the source, but a macOS browser was not tested.

Fix: ignore modified or previously handled keyboard events, and scope shortcuts to the intended game context. Keep input, textarea, select, and editable controls out of the global handler.

Evidence: `ui-modern-results.json`, `keyboard`; repeatable script `ui-modern.mjs`.

### UI-02, P2: Game handlers consume keyboard activation of unrelated controls

Source: Flashback `src/components/queue-arcade.tsx:1271-1286`; hero picker `src/components/queue-arcade.tsx:2067-2089`.

In a Flashback year round, focus the Mute game sounds button and press Enter or Space. The app submits the year slider's default value, `year-v1:2017` in the test, and leaves sound enabled. The global handler prevents the button's normal activation.

In a Spell Link round, type `abaddon`, focus Mute game sounds, and press Enter. The app submits Abaddon and does not mute. Pressing Space instead appends a space to the search and still does not mute. The same hero picker serves several other identities.

Fix: preserve native keyboard behavior on buttons and links. Handle Enter and Space inside the answer controls, or use a guard that lets interactive targets handle their own events. This applies to mute, navigation, and other controls outside the answer area.

Evidence: `ui-modern-results.json`, `ui-extra-results.json`; screenshots `ui-flashback-mute-space.png`, `ui-hero-keyboard-Enter.png`, `ui-hero-keyboard-Space.png`. Repeatable scripts `ui-modern.mjs` and `ui-extra.mjs`.

### UI-03, P2: Expired party links repeatedly reset the recovery form

Source: `src/components/private-room-panel.tsx:383-406`.

Open an invitation to an unavailable room, then choose Join party. After the next poll, the form resets to the choice screen. The browser recorded `data-path="join"` changing to `data-path="choose"` after 1.3 seconds. The old invitation code stays in `initialCode`, so each one-second 404 poll repeats the reset. Create uses the same state reset. The user must leave the page before joining or creating another room.

Fix: stop polling an unavailable initial room and clear that invitation state before offering recovery actions.

Evidence: `supporting-ui-browser-results.json`, `expiredInvite`; screenshot `supporting-expired-invite.png`.

### UI-04, P2: Failed chat sends destroy newer drafts and hide errors during play

Source: `src/components/private-room-panel.tsx:523-535`, active-play branch `599-620`.

Send a message, delay its response, type a new draft, then fail the request. The catch block restores the sent text over the new draft. During an active round, the component sets an error but renders no error message. The lobby does show the same failure.

Fix: track pending messages separately, or restore text only when the draft has not changed. Render delivery errors next to chat in both views.

Evidence: `supporting-ui-browser-results.json`, `failedDraft` and `playChatFailure`; screenshot `supporting-chat-failure.png`.

### UI-05, P3: New chat messages stop scrolling into view after the 40-message cap

Source: `src/components/private-room-panel.tsx:129-132`; `src/lib/private-rooms.mjs:430-434`.

The autoscroll effect depends on `room.messages.length`. Once the server keeps only the latest 40 messages, that length no longer changes. Replacing the oldest message with a new wrapping message left the log 42 pixels above its bottom and hid the latest message.

Fix: watch the newest message ID. Scroll only when the user was already at the bottom, so reading earlier messages does not cause unwanted jumps.

Evidence: `supporting-ui-browser-results.json`, `initialLog` and `cappedLog`; screenshot `supporting-chat-cap.png`.

### UI-06, P3: Calibration cannot browse more than 80 matching records

Source: `src/components/calibration-dashboard.tsx:113`, `249-253`, `265-334`.

The real calibration page showed 80 of 1,515 records, with no next-page or load-more control. The source truncates the filtered list with `slice(0, 80)`. Search can locate a known record, but it cannot support a full review of unknown records in a large result set.

Fix: add pagination or load more while preserving filter and search state.

Evidence: `supporting-ui-browser-results.json`, `calibration`; page screenshots `ui-modern-1400-calibration.png` and `ui-modern-320-calibration.png`.

## Static findings needing further verification

- P2, profile outage UX: `src/app/profile/page.tsx:44-52` catches session lookup, Steam enrichment, and profile retrieval failures together. `profile` stays null, and lines 66-79 render the ordinary signed-out CTA. A storage fault can therefore look like a lost login. Distinguish an absent session from an unavailable profile service. A valid-account fixture with a controlled storage failure was not tested in this sub-audit.
- P3, chat announcements: `src/components/private-room-panel.tsx:135-144` renders incoming messages in an ordinary div without `role="log"` or a live region. Add an appropriate labelled log and test with a screen reader. This is a source finding; no screen reader was used.
- P3, reviewer data accessibility: `src/app/ops/page.tsx:161-167` puts daily values only in `title` attributes on nonfocusable divs. Lines 182-189 use an ARIA row for the table header without columnheader roles on its children. Expose chart values as text and complete the table semantics. The authenticated reviewer view was inspected in source, not opened with a real account.

## Checks and results

The current scanner is axe-core 4.14.0, installed only in `evidence/audit-tools` with install scripts disabled. Browser automation uses Playwright 1.61.1 and cached Chrome for Testing 153.0.8010.12. The scanner includes WCAG 2.0, 2.1, 2.2 AA tags and axe best-practice rules.

The scan covers 44 rendered states:

- Real homepage, party entry, signed-out profile, privacy, calibration, and ops gate at 1400, 375, and 320 CSS pixels.
- Thirteen answer states at 1400 and 320 pixels. These cover all ten identities plus Shopkeeper recipe and Flashback year, choice, and ordering variants.

Round checks use real catalog data passed through `publicQuestionForRound`, then intercept local API snapshots to keep each state stable. Votes in targeted keyboard checks are captured locally. This proves the browser behavior but does not claim to retest server vote validation. The main audit's separate API and live-round checks cover those paths.

The current scanner reported zero violations on all 1400-pixel desktop states and all six supporting pages at every tested width. At 320 pixels, it reported the WCAG 2.2 `target-size` rule in the five hero-picker identities: Spell Link, Fogged Vision, Echo Hunt, Quote Hunt, and Aghanim's Lab. Hero controls measured about 21.3 by 20.3 pixels with insufficient spacing. This is recorded as a narrow-layout support limit under the desktop-first scope.

All inspected states had no horizontal document overflow. Representative desktop and narrow screenshots were manually inspected. Reduced-motion emulation disabled ongoing lobby animation. The scans are automated checks, not a claim of complete accessibility conformance.

An initial scan used Chrome 121 and axe 3.5.6. It reported a Shopkeeper search label issue that the current scanner did not reproduce. That old-scanner result is excluded from confirmed defects. The search currently uses placeholder text rather than an explicit textual label.

The app remains desktop-first by the product decision in `HANDOFF.md`. Narrow screenshots reveal very small hero targets and no touch keyboard input for the hero filter. Those are current mobile support limits, not launch blockers under the stated scope.

## Evidence and limits

Main browser data and scripts: `ui-modern-results.json`, `ui-modern.mjs`, `ui-extra-results.json`, `ui-extra.mjs`. Supporting flows: `supporting-ui-browser-results.json`, `supporting-ui-browser.mjs`, and `supporting-ui.md`. Screenshots are alongside these files.

No real Steam account was used, no real profile was deleted, and reviewer mutations were not performed. Screen-reader speech, native speakers, Firefox, Safari, mobile Safari, and Android browser behavior were not verified in this sub-audit. Native audio quality is covered separately by the feedback-sound contract and cannot be inferred from headless screenshots or a resolved audio promise.

## Firefox and WebKit follow-up

Tried the cached Firefox and WebKit engines with installed Playwright 1.61.1. All failed before opening an app page, so the proposed real homepage, public-round answer/reveal, and party-create journeys could not run. These are audit-environment limits, not evidence of app defects.

- Firefox revision 1419 identifies itself as Firefox 115.0. It launched, but browser-context creation failed because the older browser protocol does not accept Playwright's `Browser.setDefaultViewport` argument `viewport.isMobile`.
- WebKit revision 2336 failed to launch because `libavif.so.13` is missing.
- WebKit revision 1869 launched, but page creation failed with `Page.overrideSetting: Unknown setting: FixedBackgroundsPaintRelativeToDocument`. Its engine version was not verified because the cached binary and Playwright protocol are incompatible. Playwright's reported version in the raw output must not be used as the cached engine's version.

No system packages were installed. The attempts created no party or vote because none reached an app page. Evidence: `ui-cross-browser.mjs`, `ui-cross-browser-results.json`, and `ui-cross-browser.log` in this audit directory. Firefox and WebKit compatibility remain unverified.

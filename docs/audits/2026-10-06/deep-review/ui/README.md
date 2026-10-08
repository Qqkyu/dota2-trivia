# Responsive UI review

The review found and fixed phone overflow, clipped party controls, small hero and item targets, hidden round timers, unreadable ordering results, clipped clues, and cut-off reveal explanations. Supporting pages now reflow, retain readable contrast, and expose keyboard focus. No responsive failures remain in the checked cases.

The evidence contains a complete production matrix followed by focused production checks for later CSS fixes. All 781 states were not rerun on the last build.

## Production checks

| Build                   | Coverage                                                                                                                    | States | Passed assertions | Failed assertions |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------- | -----: | ----------------: | ----------------: |
| `a9jO2vwwKVTSsroYDHJJW` | 31 longest-prompt cases, answering and reveal, 11 viewports, supporting pages and 100-player parties                        |    781 |             1,963 |                 2 |
| `DKFXc21icCaO5DvyThFkY` | Spell Link and Aghanim after the clue-height fix, all 11 viewports                                                          |    143 |               423 |                 0 |
| `sC6gD0NWB3unDRTq6LaOu` | 31 longest-explanation cases, answering and reveal, five phone/short-desktop sizes, supporting pages and 100-player parties |    355 |             1,151 |                 0 |

The two first-build failures were real. The longest Spell Link clue was cut off at 960x540 in both answering and reveal. The later build allowed the clue and its prompt to grow. Its complete text passed across all eleven viewports. See the [full matrix](artifacts/full-matrix-results.json), [clue follow-up](artifacts/clue-follow-up-results.json), and [explanation follow-up](artifacts/explanation-follow-up-results.json).

The eleven viewports were 320x568, 360x640, 390x844, 568x320, 768x1024, 1280x640, 1920x1080, 2560x1440, 3440x1440, 3840x2160, and 960x540 at device scale 2. The last case models 1920x1080 at 200% reflow. The explanation follow-up used 320x568, 360x640, 390x844, 568x320, and 1280x640. These checks used Chromium 153.

The 31 cases cover all ten games. They include nine classic numeric/recipe kinds, four shop kinds, five hero games, four sound combinations, six ordering kinds, and three Flashback variants. Each results file records the exact source question ID. The normal selection uses the longest combined prompt, condition, hint, and answer text. The explanation selection uses the longest raw explanation per case.

A separate real signed-in journey passed at 320x568, 768x1024, 1280x640, 3840x2160, and 960x540 at scale 2 on build `DKFXc21icCaO5DvyThFkY`. It confirmed actual API authentication, a long display name, 100 recorded answers, ten format cards, both calibration pagination directions, the activity heading, and a focused chart tooltip contained in the viewport. The phone Play button ended at 420.84px. See [signed-in page results](artifacts/signed-in-pages-results.json) and the [repeatable local check](artifacts/final-supporting.mjs.txt).

The updated legacy layout check passed all sixteen formats at widths 420 and 1400 on that build. The existing party-crowd check also passed all 24 player-count/viewport combinations and rejected player 101 during the earlier development check. See [layout output](artifacts/final-layout.log) and [party output](artifacts/crowd.log).

## Changes

- Removed the fixed 320px body minimum. It caused horizontal scrolling when browser scrollbars reduced the available width, and caused mobile browsers to widen the layout viewport.
- Put Play before the format list on phones. The old 320px layout placed its bottom at about 725px; it now ends at about 421px.
- Allowed phone and short-screen party lobbies to scroll. Start, chat, send, errors, and the chat toggle remain reachable with 100 players. The roster keeps its own bounded scroll area.
- Put active party chat below the game on small screens without clipping it or keeping an empty score column.
- Made hero and item targets at least 44px tall on phones and tablets. Hero search stays outside the bounded grid. Desktop item targets have a 26px minimum height.
- Kept the phone round timer visible while the player scrolls to the answers. Before the fix, the timer moved up to 330px above the viewport.
- Gave Order Up result names and values separate rows. Phone results use one column so names and values do not collapse or overlap.
- Hid decorative format miniatures below 520px while retaining names, statistics, and controls. Party format choices show checked and unchecked markers. Enabled choices retain full text contrast when not selected.
- Reduced the empty area above home content on tall 4K screens while retaining a bounded reading width.
- Reflowed calibration records as cards at tablet widths. Added pagination above the records so phone users can reach Next without scrolling through 80 cards.
- Contained the first and last ops chart tooltips. Corrected faded profile text and added visible keyboard focus to affected controls.
- Allowed long Spell Link clues to increase the prompt height.
- Removed the two-line limit on reveal explanations. Long text now wraps and uses its full height. The result and report control remain reachable by scrolling.

## Regression checks

The durable check is [`scripts/check-responsive-ui.mjs`](../../../../../scripts/check-responsive-ui.mjs). It uses the existing Chrome DevTools helper without a new dependency. It renders the app and replaces API snapshots for repeatable question, reveal, and party states. Real gameplay actions and room transitions are checked separately in the [functional review](../functional/README.md).

The check compares document width with both the configured viewport and the available client width. It checks prompt clipping, answer target sizes, result labels, phone Play placement, timer visibility at the answer controls, party control reachability, and top calibration pagination. Explanation checks detect hidden text and scroll to the first and last text lines to confirm that each can be read and is not covered.

Use `APP_URL` to select an isolated local app. `RESPONSIVE_LONGEST=explanation` selects the longest explanations. `RESPONSIVE_VIEWPORTS`, `RESPONSIVE_CASES`, and `RESPONSIVE_SCREENSHOTS` limit coverage or save evidence. `RESPONSIVE_SESSION` supplies a synthetic reviewer session for protected server-rendered pages. The real signed-in supporting-page check uses actual API responses and a separate synthetic account store. No user account store was changed.

The old layout script treated any helper crossing the viewport edge as clipped. It now scrolls the helper into view, checks full bounds and hit testing, verifies the timer, restores the original scroll, and confirms the prompt remains unchanged, visible, and unclipped. Existing horizontal overflow, hidden-parent clipping, text, and overlap checks remain.

The reveal regression first failed on the old production CSS for mana cost, Aghanim, and Flashback choice. All three failed both the full-text check and the last-line reachability check. The [six recorded failures](artifacts/explanation-red.log) passed after the CSS correction.

## Selected screenshots

| Evidence                            | Before                                               | After                                                                                 |
| ----------------------------------- | ---------------------------------------------------- | ------------------------------------------------------------------------------------- |
| Phone home and Play placement       | [Before](images/01-before-phone-home.png)            | [After, signed in](images/02-after-phone-home.png)                                    |
| Phone hero answer grid              | [Before](images/03-before-phone-heroes.png)          | [After, scrolled to controls](images/04-after-phone-heroes.png)                       |
| Long Spell Link clue at 200% reflow | [Clipped](images/05-before-long-clue.png)            | [Complete](images/06-after-long-clue.png)                                             |
| Phone reveal explanation            | [Two lines](images/07-before-reveal-explanation.png) | [Complete, final production build](images/08-after-reveal-explanation-production.png) |

Additional inspected screenshots show [phone profile records](images/09-phone-profile-records.png), [page-two calibration controls and records](images/10-phone-calibration-page2.png), and a [focused ops chart tooltip](images/11-phone-chart-focus.png). Different question fixtures and scroll positions are identified in the table; these are visual evidence, not pixel-diff comparisons.

Screenshots were inspected at page, answer-control, and reveal positions. Large desktop pages retain a bounded content width. The full temporary screenshot archive remains under `/tmp/queue-arcade-deep-review/ui/`; this repository archive retains the selected images and all final result data, logs, and build identifiers.

## Limits

The checks used browser emulation rather than physical phones. Equivalent reflow and device scale do not prove every operating-system zoom behavior. Cross-engine accessibility, forced colors, motion settings, and assistive-technology limits are recorded in the [accessibility report](../accessibility/README.md). The snapshot matrix resets scroll before each fixture and does not establish actual next-round scroll behavior. That transition belongs to the separate functional journey check.

[The hash manifest](manifest.json) records every file in this UI evidence archive except the manifest itself.

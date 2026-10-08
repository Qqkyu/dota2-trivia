# Functional, content and UI review

Reviewed on 2026-10-06. This follows the [security and production-preparation audit](../remediation.md). The user asked for every trivia question to be proofread and checked, complete player flows, very small and large screens, and many concurrent players. This pass made local fixes and added repeatable tests. Nothing was deployed or published.

## Question coverage

All 1,517 live questions have an individual review record. The [index](question-review-index.json) links each original and current ID to its exact source file, current hash, review ledger, changed fields and limits. An independent verifier found no missing or duplicate live IDs. The 72 retired recipe rows remain outside the playable catalog and are explicitly marked unreviewed.

| Area                         | Questions | Evidence                                                                                       |
| ---------------------------- | --------: | ---------------------------------------------------------------------------------------------- |
| Classic numeric and Order Up |       422 | [Numeric review](numeric/numeric.md)                                                           |
| Spell Link and Fogged Vision |       254 | [Identity review](identity/identity.md)                                                        |
| Quote Hunt and Echo Hunt     |       368 | [Voice and quote review](voices/README.md)                                                     |
| Shopkeeper                   |       102 | [Recipe review](shopkeeper/README.md) and [182-icon visual check](shopkeeper/images/README.md) |
| Soundcheck                   |        96 | [Sound review](soundcheck/report.md)                                                           |
| Aghanim's Lab                |        84 | [Upgrade review](aghanim/README.md)                                                            |
| Flashback                    |       191 | [Historical review](flashback/README.md)                                                       |

The review changed player-visible data in 701 records, sources alone in 316, and other metadata in 60. The remaining 440 records kept the same data. These counts include clearer wording and conditions as well as factual corrections. They do not count UI or server fixes. Six response selections were replaced, with their old and new IDs preserved in the index.

All 342 marked numeric answers and 80 numeric orderings already matched the checked primary values. Corrections were still needed in damage progressions, secondary-hit ratios and measurement conditions. Other fixes include 37 Spell Link descriptions, 24 Aghanim records, direct-component recipe wording, missing recipe ingredients, ambiguous shared sound choices, almost silent audio openings, one cross-hero text quote and 76 historical records. The historical corrections preserve the marked answers while correcting or narrowing unsupported wording. All seven initial historical evidence gaps were closed with original documents, broadcasts, interviews or game-map data.

The archive contains 408 exact Valve API JSON files with hashes, pinned response metadata, selected original historical sources and measured audio evidence. Every reviewed item icon and every Spell Link/Fogged Vision image was inspected on labeled contact sheets. The [source manifest](sources/valve-api-manifest.json) describes the API snapshot.

"Verified" has a defined scope in each ledger. The API does not embed a patch/build ID; its latest published patch was 7.41f at retrieval. The older build 6882 extract has unproven installation provenance. No Dota match was launched to simulate every mechanic. All 123 Echo and 96 Soundcheck questions still lack a human listening verdict, although their sources, decoding, durations and early waveform energy were checked. Audio source agreement does not prove subjective recognizability.

## Functional and security changes

The [functional report](functional/README.md) records fixes for touch hero search, late party navigation after Back, response-body timeouts, chat drafts lost at game start, report focus and retry/recovery behavior. Recipe rounds now show a recipe-scroll hint only when the recipe needs one. Party setup has a clear heading and Back action.

A real cross-tab account bug could credit account answers to guest lifetime statistics. Round and vote responses now identify the authenticated account or validated guest that owns the result. The client rejects stale responses, separates runs when ownership changes, and cannot credit unowned results to guest statistics. Nine account-transition cases and an [independent security review](functional/security-identity.md) cover that fix. No open finding remains in that change's reviewed scope.

## UI and accessibility

The responsive suite renders 31 variants in both answering and reveal states, plus supporting pages and a 100-player party. Its 11 sizes include 320x568 phones, landscape phones, tablets, short desktops, 200% equivalent reflow, ultrawide and 3840x2160 displays. The full matrix contains 781 rendered states.

Fixes include 44px phone/tablet answer targets, a reachable phone Play button, scrollable party controls, a timer that stays visible while selecting answers, readable ordering results, full clue text at short widths, readable reveal explanations, stronger text contrast, visible keyboard focus and usable calibration pagination. The activity page uses a clear heading. Selected screenshots and precise pass scopes are in the [UI evidence](ui/README.md).

The [accessibility report](accessibility/README.md) records Chromium 153, Firefox 151 and WebKit 26.5 checks. It covers keyboard operation, automated accessibility checks, reduced motion, forced colors and 200%/400% equivalent reflow. Device emulation and browser-engine checks do not establish physical-phone behavior or real assistive-technology support.

## Verification

Final check results and build IDs are recorded in [verification.json](verification.json). The checks include:

- 1,140 tests across 56 files, including isolated PostgreSQL transactions, with no skipped tests.
- 54 production player journeys and 18 gameplay recovery checks, including 100 concurrent two-tab pairs preserving 200 guest results.
- All ten round formats, 24 party-size/viewport combinations, player 101 rejection, private membership/media protection, search, reports, native feedback audio and production rate limits.
- Catalog validators, 1,038 client-source answer checks, 784 image and 230 audio availability/header checks, type checking, lint and optimized production builds.
- Fresh response nonces and security headers; 14 private catalog fingerprints appear only in the server build.
- No known production dependency advisories in the final dependency check.

The main production journey and layout run used build `a9jO2vwwKVTSsroYDHJJW`. Follow-up builds fixed clipped clue text, the activity heading and clipped explanations. Affected layouts and signed-in pages were checked again on those builds. A final transition check found that a scrolled phone could retain its position and hide the next question. The client now brings the new prompt into view once, while preserving active chat/report focus and same-round scrolling. Nine targeted transition cases passed. The final code build is `IqM7S-izzhLw1FS90-lLJ`. The reports distinguish full matrix runs from focused follow-ups.

The [load test](capacity/README.md) used 466 synthetic players for ten rounds, 129,932 requests and 4,660 accepted answers. It exercised the real polling cadence, chat, analytics sessions and audio preload requests. It recorded no server errors or unexpected throttles. Independent database totals matched all sessions, answers and results. A separate four-player regression passed on the revised application build.

Peak app memory was 611.22 MiB. This local, unrestricted test does not establish Render capacity or justify a 512 MiB host for that workload. The operations guide now includes the measured request rate and requires a repeat under the intended CPU/memory limits. It proposes at least 1 GiB as the starting test allowance. No paid resources were created.

The [Claude Code Fable 5.1 review](second-opinion/README.md) used the requested model for 170 turns. It found no new confirmed wrong answer, leaked answer or ambiguous option set. Its reported missing ability evidence was present under the `abilities/` subdirectory; the source hashes match the ledger. Historical questions it could not verify are resolved in the linked disposition.

## Test setup corrections

Parallel synthetic browsers initially shared one server's source-IP rate-limit budget. Three checks received 429 responses. Each passed on a separate local process with rate limits enabled. The capacity test used its own process and database throughout.

The first manually seeded reviewer token was shorter than the API's accepted session-token length. It reached the server-rendered profile but left the client API anonymous. A valid synthetic token then passed `/api/me`, and signed-in pages and game formats were checked again. Real issued session tokens already meet the contract. The accessibility script now rejects an unauthenticated fixture before testing.

The legacy layout test assumed every phone helper must be visible before scrolling. It now checks actual scroll reachability, hit testing, timer visibility and prompt recovery, while retaining overlap and clipping assertions. A plain native range-input experiment reproduced Chromium's post-drag click suppression; the touch test now waits for that gesture to settle. These were test corrections, not changes to app security limits.

## Before launch

The existing Render endpoint still returns HTTP 503 with `x-render-routing: suspend-by-user`. This pass could not exercise the deployed app. The [earlier release gates](../remediation.md) still apply, including a real Steam login, a container/staging run, verified database/backups and GitHub CI execution. The local Docker integration was unavailable, and no hosted workflow or deployment was started.

Complete the human listening pass, physical-device and screen-reader checks, asset permission records and the constrained hosting load test before calling the app ready to ship. The prior review also records an unresolved development-only dependency advisory. Production dependencies passed the current advisory check.

The new commands are `pnpm check:journeys`, `pnpm check:responsive`, `pnpm check:accessibility` and `pnpm check:capacity`. Journeys and responsive checks are part of `pnpm check:ui`; CI installs the pinned browser engines and runs the three accessibility engines. The load test refuses remote URLs and requires an explicit isolated local store.

The release manifest was refreshed only after the review and checks. It detects changes to the reviewed catalog and scripts; it does not prove that upstream game facts have stayed unchanged since this review.

The [source snapshot](verification/source-manifest.json) compares the final work with this pass's 392-file baseline. No baseline file is missing. The [archive manifest](archive-manifest.json) records the size and SHA-256 hash of each retained evidence file. Local test servers and the disposable PostgreSQL instance were stopped after verification.

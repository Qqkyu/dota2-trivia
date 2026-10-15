# Audit fixes and release status

The audit and local fixes cover security, persistence, gameplay, content, the interface, and deployment checks. The original findings remain in [the audit report](README.md). This document records the later fixes. The starting uncommitted work was preserved and extended where a fix required it. No changes were committed, pushed, or deployed. Existing application data was not migrated or deleted.

The release still needs staging verification. Render was suspended and GitHub Actions was disabled when inspected. The local Docker integration is unavailable. These are specific release gates, not evidence that the local checks failed.

## What changed

| Audit findings | Result |
| --- | --- |
| S1, Steam login | The callback rejects duplicate fields and uses one immutable assertion for verification and session identity. It requires signed identity fields, checks nonce age, and records each verified nonce once. Tests cover mismatched state cookies, return origins, return state, replay, and provider failures. |
| S2, request limits | Independent address and player budgets replace the bypassable combined key. One address can introduce at most 150 identities per minute across routes. Health probes also have a budget before database checks. Active limits cannot be evicted to reset their budgets. Public startup requires an explicit trusted-proxy setting. The real ingress contract still needs verification. |
| S3, media work | Shared finite caches and work queues replace duplicate encoder jobs. Fetches, redirects, MIME types, byte counts, image dimensions, conversion time, and child cleanup have bounds. A disconnected caller cannot cancel another caller's shared job. |
| S4 to S6, identity and mutations | Guests cannot use account namespaces. Malformed cookies fail safely. Party membership changes use same-origin POST requests. JSON readers enforce size and time limits. Private rounds, audio, images, and preloading require membership. |
| S7, browser protection | HTML receives a fresh script nonce and Content Security Policy. Responses include frame, MIME, referrer, permission, and transport protections. Social metadata uses the runtime origin. |
| DB-01 to DB-08 | Profiles hide unrevealed results. PostgreSQL commits votes, personal results, and analytics together. File stores use durable recovery records and consistent cache updates. Cleanup runs without player traffic. Crowd reads use one snapshot. Migrations are serialized and versioned. Analytics include the full window. Deletion and enrichment share ownership and locking rules. |
| F1, F2, F4, F5, F7 | Recovery accepts the app's long round IDs. Each round counts once. Entry retries have deadlines and navigation cancellation. Blocked browser storage does not crash play. Separate tabs keep separate pending votes and session scores; shared guest statistics use atomic IndexedDB transactions. |
| F3, F6, F8 | Every private game selection reaches its full eligible question pool. Schedule caches and room counts are bounded. Late commits and later crowd corrections update scores without duplicate credit. Away players keep their seats until Leave or full room expiry. |
| F9, UI-01 to UI-06 | Old lobby replies cannot reset active play. Browser shortcuts and focused buttons do not submit answers. Expired invites leave recovery controls usable. Chat preserves new drafts, reports failures, and follows new messages at the 40-message cap. Calibration has pagination. |
| C-01 to C-09 | Fixed the shared item-sound answer space, damage conditions, courier answer, historical explanations, and two rejected local icons. Extended asset checks and added precise history sources. Client comparisons use a pinned extracted base plus reviewed patch changes. A review manifest detects later changes through file hashes. See [content fixes](content-remediation.md). |
| INF-01, INF-03 to INF-08 | Updated vulnerable production dependencies, runtime metadata, safe error categories, startup validation, and release tooling. CI is configured to test the actual image against PostgreSQL and include native sound checks. Added a reviewed Render blueprint, migration and cleanup commands, third-party notices, and an [operations guide](../../operations.md). |

The final source scan found no embedded production credential among 29 reviewed candidates across 372 text files. Candidates were runtime expressions, examples, or isolated test credentials; 77 binary files were excluded. The earlier Git-history scan remains in the original audit. This is a bounded pattern check, not proof that no secret exists.

The production dependency audit has zero findings. The full development audit retains one unpatched `braces@3.0.3` advisory through ESLint. This is recorded in the operations guide.

## Second opinion and additional fixes

The installed Claude Code CLI ran three read-only review passes requested as `claude-fable-5-1`: the original audit, its focused follow-up, and a review of the fixes. The final pass completed 76 turns and its usage metadata identifies Fable 5.1. It found no remaining authentication or ownership bypass in the files reviewed. This is review evidence, not a security certification.

The final pass identified further availability risks. The fixes now cap distinct identities per address, require a configured proxy for public origins, and limit active rooms to 20 per address and five per creator. Host handoff cannot reset the creator's quota. It also prompted membership checks for private media and removal of cleanup from vote transactions. Review thresholds in the original output can differ from the final code because changes continued during review.

Independent local review also found a login/deletion lock-order deadlock and four client score/navigation races. Regression tests reproduce those cases and pass with the fixes. A short-screen chat layout regression and test-room cleanup failure were found during integration and corrected. A later two-tab stress test found that browser locks still allowed stale localStorage reads to lose guest results. Guest lifetime data now uses one IndexedDB transaction for settlement, scores, and legacy import. Pending recovery survives until that transaction commits. A repeat test preserved all 200 accepted answers across 100 simultaneous rounds; a stale local mirror could not replace the saved data.

## Verification

Expected result: ordinary flows work, confirmed failure cases recover, account and answer boundaries hold, and release checks fail clearly for invalid input or configuration. All writes used disposable local files, databases, or browser fixtures.

| Check | Result |
| --- | --- |
| Unit and PostgreSQL regression suite | 354 tests passed in 43 files, with no skipped database tests. Includes SQL rollback, concurrent votes and migrations, 50,001-visit analytics, file failure/recovery, deletion races, and authentication boundaries. |
| Lint, TypeScript, production build | Passed. The build used `.next-check`, preserving the user's normal build directory. |
| Data and release review | All validators passed for 1,517 live prompts. The reviewed content manifest passed. |
| Client and assets | 1,038 client comparisons passed. Checked 785 images and 230 audio clips. This does not prove every fact, clip identity, or asset permission. |
| Schedule | All 1,023 nonempty game selections reached every eligible question over 5,000 rounds each. The public 10,000-round check retained a 12-round subject gap and 624-round exact-question gap. |
| Browser bundle | All 14 private catalog fingerprints remained server-only. |
| Headers and metadata | Six production page responses, including a 404, had fresh matching nonces, expected protection headers, and the runtime social origin. |
| PostgreSQL app journey | Passed synchronized rounds, hidden answers, duplicate rejection, reports, calibration/reviewer access, profiles, analytics, hashed identifiers, and account deletion. |
| Local concurrency | 100 guests joined one party, read the same round, submitted 100 accepted votes concurrently, and received a 100-vote reveal. Local p95 round read was 164 ms and vote was 219 ms. This does not establish Render capacity. |
| Backup restore | A disposable PostgreSQL 14 dump restored successfully. All rows matched across 13 tables, including synthetic account, session, saved result, analytics, and nonce records. No production backup was inspected. |
| Accessibility | Repeated 44 page and round scans with Chromium 153 and axe 4.14. No desktop violations or page errors. Five hero-picker states still have small targets at 320 px. Browser modifier keys and Enter/Space on Mute submitted no votes. |
| Full browser and sound gate | All 18 scripts passed on the final production build. Includes all ten formats, 24 party size/viewport combinations, ten UI recovery cases, 18 gameplay recovery cases, ten native output checks, 30 tapped audio checks, and the live vote limit. |
| Standalone packaging | Local staged standalone app, packaged migration and cleanup commands, and headers passed. Render blueprint passed its official schema. Actual Docker/Alpine execution and Trivy remain unverified. |

## Release gates and retained limits

1. Restore access to the intended Render database and verify its state, region, credentials, runtime role, and backups. Run the migrations with a separate migration role. Decide whether any old JSON test data must be imported. No automatic import is provided.
2. Verify the real proxy header contract with forged-header checks. Configure a trustworthy client-address header and ingress limits. The startup check rejects an unconfigured public proxy; it cannot prove a selected header is trustworthy.
3. Enable the disabled workflow and obtain a passing build, actual-container test, and image scan for the chosen release commit. The repository changes have not enabled Actions or resumed Render.
4. Complete a real Steam sign-in and account lifecycle test on the staging HTTPS origin. Local tests used provider doubles or seeded test sessions; they did not authenticate to Steam.
5. Confirm uptime, independent cleanup for a sleeping host, external alerts, and a production backup restore. Private rooms, chat, presence, and limits still require one application process. A restart ends private rooms.
6. Provide a public support and privacy contact. The privacy page currently links to this private repository's issue tracker, which public players cannot use. No public contact address was supplied.
7. Resolve unknown asset reuse permissions, especially the 23 local event-photo/winner assets listed in [content sources](../../content-sources.md). Added notices and citations do not establish those permissions.

Desktop remains the tested launch target. The narrow hero grid needs work before claiming mobile accessibility. Firefox, Safari/WebKit, screen-reader speech, all audio subjects, and a new full client extraction remain outside the verified result.

When IndexedDB is unavailable, guest lifetime updates stay in page memory and do not overwrite another tab's stored totals. Clearing site data removes guest records. Guest runs keep 200 editable best-score records and 200 settled-round keys. Private score history retains 128 rounds per member; an unsettled award evicted after that limit keeps base points. Lifetime account profiles still read the user's full saved history, so larger real datasets need performance observation. The public schedule remains deterministic and is not designed for competitive rankings. Guest identifiers are browser-held bearer credentials, not proof of a unique person. A party code still grants access to its roster and chat preview and permits joining. Short custom codes should not be treated as confidential invitations. The limits reduce abuse from one address; they cannot prevent coordinated abuse from many addresses.

The final test logs and independent review are linked from [remediation evidence](remediation-evidence/README.md).

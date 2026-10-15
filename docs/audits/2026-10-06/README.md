# Queue Arcade audit for production preparation

> Archive note (15 October 2026): `main` keeps only the Markdown reports from this audit.
> Links below to JSON, logs, screenshots, audio, and helper files resolve on the Git tag
> `launch-evidence-20261010`, which holds the complete frozen evidence tree. The findings in
> this file describe the 6 October state; the fixes shipped in the preview release tagged
> `launch-release-20261010`. See [launch status](../../launch-status.md) for the current state.

Do not release this working tree yet. The app has working public and party flows, useful content checks, and a production build that passes. The audit also found a critical Steam login verification defect, ineffective public abuse limits, and reproducible failures in scoring, recovery, content, and persistence.

This is an audit, not a remediation release. No application source, question data, dependency, deployment setting, or existing user data was changed. The report and its evidence are the only repository additions. Existing uncommitted work was included and preserved.

## Scope and evidence

Audit date: 6 October 2026. Base commit: `7528a842754642d249640531df3f6fc91bf032b9` on `main`, plus the starting working tree recorded in [original-status.txt](evidence/original-status.txt). The [source hashes](evidence/original-hashes.json) identify the exact files reviewed.

The expected result was that documented desktop flows work, answers and scores remain correct across failures, permissions hold, stored data matches its retention promises, and the deployment can be checked and recovered. Verification used source review, existing checks, local production browser sessions, controlled failure tests, synthetic PostgreSQL data, content audits, and public deployment reads. Claude Code `claude-fable-5-1` supplied an independent security review.

The local production app used new temporary stores. A second instance used a new PostgreSQL 14 database. No production votes, rooms, account changes, load tests, or login attacks were performed. The public Render service was inspected with read-only requests.

The live catalog has 1,515 prompts across ten identities. All records received structural checks. All 191 Flashback records and 84 Aghanim effect clues were read. Selected factual claims were checked against primary sources. This does not certify every gameplay fact or every audio clip.

## Findings to address first

Severity describes impact. Priority also considers ordinary user exposure and the cost of leaving a defect in the release. A source-confirmed security flaw is not a claim that a live account was compromised.

| Priority | Finding | Evidence and consequence |
| --- | --- | --- |
| Immediate, critical | S1. Steam callback can select a different identity from the one it verifies. | Local parsing reads the first duplicate field; provider verification forwards the last. Session creation uses the first. Fix before enabling real sign-in. No live exploitation was attempted. [Security](security.md#s1-critical-steam-verification-and-account-selection-use-different-duplicate-values) |
| Before public traffic, high | S2 and S3. Guest limits are bypassable and early audio requests start separate unbounded ffmpeg jobs. | Rotated guest IDs evade the sole limit. A controlled handler check produced 65 conversions for 65 identical-stage requests. Add independent limits, shared conversion results, deadlines, and resource bounds. [Security](security.md) |
| Before release, high | F1. Missed-round recovery rejects the app's own IDs and can prevent all later play. | Current public IDs have 184 characters; the filter permits 180. Twenty-two pending IDs exceed the total request limit and make every poll return 400. [Functional](functional.md) |
| Before release, high gate | INF-01. The locked production dependency audit fails. | Two production advisory entries and 22 full-tree entries. Their scanner severities do not prove a reachable exploit here. Apply vendor fixes and repeat the checks. [Infrastructure](infrastructure.md) |
| Before release | F2 and F7. Correct-answer session credit is wrong. | One correct answer shows streak 2. Two guest tabs can both answer correctly while one gets zero session gold. [Functional](functional.md) |
| Before release | C-01 to C-03. Some questions reject valid answers or lack a unique answer. | Force Staff and Hurricane Pike share the played cue; damage-order cards lose needed conditions; the 7.23 courier question marks the wrong item. [Content](content.md) |
| Before release | UI-01 and UI-02. Browser shortcuts and focused controls can submit an answer. | Ctrl+A can answer Classic Trivia. Enter or Space on Mute can submit a Flashback year. Both were reproduced in Chrome. [UI](ui.md) |
| Before release | DB-01 and DB-02. Profiles disclose results too early and accepted answers can be lost from personal records. | During answering, `/api/me` exposes correctness. A fault after the vote commit can leave no profile result, and retry after the deadline cannot repair it. [Database](database.md) |
| Before release | DB-03 and DB-08. Retention and deletion do not fully match the stated promises. | Idle stores retain expired data. In-flight enrichment can recreate a deleted identity. Retention has runtime evidence; the deletion race is source-confirmed. [Database](database.md) |
| Before release | F3 and F8. Party scheduling and late score settlement are incorrect. | Common format selections repeat 12-question blocks. A controlled delayed vote can commit after an empty round has already been marked settled, leaving its party score at zero. [Functional](functional.md) |
| Before trusting a green release | C-04, INF-04, INF-07, INF-08. The release checks have gaps and failures. | Two local-image questions fail validation. The multiplayer smoke has stale fixtures and timing. CI builds an image but tests the host process. The main gate omits native sound verification. [Content](content.md), [infrastructure](infrastructure.md) |

Other material findings include failed file writes changing cached state, inconsistent PostgreSQL crowd snapshots, concurrent schema initialization failures, initial connection errors with no retry, a browser-storage exception that crashes the app, permanent scheduler-cache growth, expired-party recovery loops, chat draft loss, and delayed chat responses that reset an active session. The detailed reports include reproduction steps, exact source references, fixes, and test expectations.

## Detailed reports

| Area | Report | Coverage |
| --- | --- | --- |
| Security | [security.md](security.md) | Steam verification, sessions, authorization, request limits, media processing, body limits, headers, secret exposure, and observed controls. |
| Database | [database.md](database.md) | PostgreSQL and file stores, transactions, concurrency, retention, deletion, query cost, analytics, and recovery prerequisites. |
| Functionality | [functional.md](functional.md) | Public and party scheduling, scoring, guest tabs, recovery, storage failures, memory, and maintainability. |
| UI | [ui.md](ui.md) | Keyboard use, errors, party recovery, chat, calibration, responsive layout, and 44 accessibility scans. |
| Questions and assets | [content.md](content.md) | All ten identities, data inventory, answer ambiguity, generation, asset checks, source versions, and release provenance. |
| Historical facts | [flashback-facts.md](flashback-facts.md) | One wrong marked answer, five incorrect explanations, and weak source references. |
| Infrastructure | [infrastructure.md](infrastructure.md) | Render, CI, dependencies, Docker, metadata, logs, runtime limits, backups, and release checks. |
| Independent review | [second-opinion.md](second-opinion.md) | Claude Fable 5.1 findings, agreement, corrections, and unresolved design choices. |

Related evidence and test qualifications are indexed in [verification.md](verification.md). The detailed reports overlap where a defect crosses areas. Do not add their finding counts together as if all were separate defects.

## What passed

The unit suite passed all 134 tests in 18 files. ESLint, TypeScript, and the isolated production build passed. The browser-bundle check found all 14 private-catalog fingerprints only on the server. The full existing browser suite passed, including live public play, party membership and limits, all ten round identities, reports, answer controls, layout, sounds, and the basic production rate limit.

Native sound verification passed ten output checks, including first clicks before window focus, wrong results, and two-tab playback. Its injected faulty controls failed as expected. The separate tapped-audio suite passed 30 checks. No human listening judgment is claimed.

Current Chrome and axe found no automated accessibility violations in the tested desktop states. The narrow hero grid fails target-size rules. Mobile is explicitly outside the present desktop launch scope. Keyboard defects still exist even where an automated accessibility scan passes.

Concurrent PostgreSQL duplicate votes accepted exactly one of 25 submissions. Twenty-five simultaneous Steam upserts created one account. The adapted local PostgreSQL journey passed reports, review transitions, profile persistence, analytics permissions, and account deletion. These passing controls do not remove the separate race and failure findings.

## Current deployment state

`https://queue-arcade.onrender.com/` and `/api/health` returned HTTP 503 with `x-render-routing: suspend-by-user`. GitHub reports the Queue Arcade workflow as `disabled_manually`. No current Render blueprint was found in the tree or inspected repository history. These holds appear deliberate and were preserved.

The handoff records a database expiry date of 31 August 2026, but this audit could not establish the database's current state. The suspended endpoint cannot verify its connectivity, contents, backups, region, TLS settings, or restore capability. No authenticated Render management interface was available.

The current party implementation needs one application instance. PostgreSQL does not share its in-memory party state between instances. A restart ends parties. A separate confirmed policy permits reusing a room code once every member has been away for 90 seconds. That conflicts with the documented promise that Away players keep their seats and scores until Leave. Decide the intended behavior before launch; a test currently requires code reuse.

## Recommended work order

1. Fix the Steam identity verification boundary. Add negative tests for duplicate fields and a test that the verified identity is the identity receiving the session. Then run a dedicated real-provider staging login check.
2. Bound public request work. Add effective IP or edge limits, server-owned guest identity rules, request-body bounds, media timeouts, and shared finite audio conversions. Keep party and scheduler caches bounded.
3. Fix score, recovery, question, and keyboard defects. Add browser regression tests for one correct answer, two guest tabs, multiple missed reveals, all private format selections, and focused controls.
4. Make persistence and privacy operations consistent. Cover partial writes, delayed commits, deletion races, idle cleanup, and shared read snapshots. Use one controlled schema migration step and test restore into a new database.
5. Repair the release gates and update dependencies. Test the actual container, all live formats, native audio, and intended content. Obtain a green run for the exact release commit.
6. Prepare a small staging release. Verify the Render database and backup restore, runtime environment, one-instance policy, health checks, proxy limits, alerts, media behavior, and application-origin metadata. Record the initial capacity target, then test that target locally or in dedicated staging.

Do not resume Render or enable CI as part of this audit. Those actions belong to the next release step after the fixes are reviewable. Asset permission and attribution records also need a release decision, especially for event photos and any monetization.

## Limits

The audit did not verify a live Steam login, exploit the callback against Steam, test the suspended production app, inspect the real database, run the Docker image, or prove backup recovery. Docker's WSL integration was unavailable. Database exercises used PostgreSQL 14; CI declares PostgreSQL 17.

The audit did not play every prompt, listen to every content clip, independently certify every numeric fact against a new current client, conduct a player difficulty study, test screen-reader speech, or exercise Safari and Firefox. The initial content checks used installed client build 6882 plus reviewed 7.41f changes. The old live-client comparison is therefore not a current factual release certificate.

The findings establish defects and specific unverified requirements. They do not establish a production compromise or a production capacity limit.

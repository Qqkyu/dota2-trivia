# Independent Claude review and reconciliation

The audit ran the installed Claude Code CLI with `--model claude-fable-5-1`, high effort, and only Read, Glob, and Grep tools. It used safe mode, disabled session persistence and external tool servers, and instructed the reviewer to avoid secrets, source edits, and live service calls.

The first pass completed successfully with 124 CLI turns. Its usage metadata names `claude-fable-5-1`. A focused second pass also completed successfully. That pass's usage metadata names Fable 5.1 and an auxiliary `claude-opus-4-8` entry. Both invocations requested Fable 5.1. The record is in [claude-review-metadata.json](evidence/claude-review-metadata.json). The [first output](evidence/claude-first-pass.txt) and [focused output](evidence/claude-focused-pass.txt) preserve the original claims, including those corrected below.

## Agreement

Claude independently identified the guest/account identity namespace collision, caller-controlled rate-limit keys, repeated ffmpeg work, unbounded party creation, missing request-body limits, incomplete origin checks, missing browser policies, and deployment uncertainty. These agree with the primary security review. They are consolidated there rather than counted twice.

Claude also identified the party-code replacement policy after every member has been away for 90 seconds. A later local fixture confirmed that replacement discards the original party's scores. The repository has a test requiring that behavior. Treat it as an explicit product decision to reconcile with the documented Away-seat promise.

The reviews also found useful controls: parameterized SQL, random hashed sessions, server-side reviewer checks, ordinary duplicate-vote protection, safe React text rendering, fixed ffmpeg argument arrays, and a non-root image user. Those controls do not establish that every trust boundary is correct.

## The Steam finding was missed in the first pass

Claude's initial report said it found no authentication bypass and described the callback as checking the right fields. The primary review found that this statement missed the interaction between two parsers.

The focused pass confirmed the mismatch and explicitly withdrew its clean assessment of the callback. It agreed that the session identity and verification identity can differ and recommended rejecting duplicate OpenID fields.

Claude then suggested capping severity at High until Steam's duplicate parsing is known. The primary review does not accept that rationale. `steamVerificationBody` has already collapsed duplicate fields before sending the request. Steam receives a single value per key. The mismatch is between the app's selected identity and that constructed verification record; it does not require Steam to accept duplicate fields. An otherwise valid verification record can remain intact while the app selected a different first value locally.

The final assessment remains a critical potential account-access defect and an immediate release blocker. The parser inconsistency is confirmed. No real assertion was submitted and no account takeover was executed. The distinction between confirmed code behavior and untested live impact is explicit in [S1](security.md#s1-critical-steam-verification-and-account-selection-use-different-duplicate-values).

The regression rule should be stricter than choosing one duplicate convention. Reject duplicate OpenID and state parameters, then use one parsed record for local validation, provider verification, and session creation. OpenID 2.0 forbids repeated parameter names. [OpenID message requirements](https://openid.net/specs/openid-authentication-2_0.html#rfc.section.4.1).

## Suggestions that were limited or rejected

| Claude observation | Final assessment |
| --- | --- |
| A public repository makes the deterministic future schedule directly computable. | The code is deterministic, but GitHub reports this repository as private. The public-repository premise was wrong. Keep prediction and answer harvesting as casual-game limitations, and revisit them before public competitive rankings or source publication. |
| Stage-three Spell Link artwork names the hero in its URL. | Confirmed source-level game-integrity limit. The project already defers answer-sensitive artwork work until competitive rankings. It is not equivalent to a login or data-access flaw. |
| Any accepted vote can create an alpha analytics session. | Consistent with the broader untrusted guest-identity and abuse problem. It can inflate visits, but is not a separate privilege escalation. The 50,000-row analytics truncation has an independent database finding. |
| A captured callback URL can reconstruct the matching state cookie. | No independent replay exploit was established. Protect callback URLs in logs and verify replay rejection during staging. Do not infer a new authentication bypass solely from the signed double-submit state design. |
| A public health response should require authentication because it exposes backend and reviewer counts. | That small metadata exposure is not a release blocker by itself. Keep health useful for deployment checks. Bound its work and separate migration from normal request handling. |
| All-away code replacement is consistent with the Away promise. | The implementation and test agree, but the documentation promises retained seats and scores until Leave. A player can lose both after 90 seconds if the code is reused. The owner should choose and document the intended policy. |

## Limits

Claude's work was static source review. It did not run the app, check dependency advisories, inspect the database, verify Render, use Steam, or perform a browser journey. The primary audit supplied those local and read-only external checks where available. The independent opinion helped find and challenge issues; it was not treated as proof when its assumptions conflicted with code or observed state.

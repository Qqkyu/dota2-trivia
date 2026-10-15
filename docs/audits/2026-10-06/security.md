# Queue Arcade security audit

Date: 2026-10-06. Scope: the current working tree, including existing uncommitted changes. This report covers authentication, authorization, public APIs, abuse controls, media processing, output handling, and security test gaps. Application files and existing data were not changed.

The primary review used source inspection. It did not construct or send an account takeover request, use a real Steam assertion, query an external account, or test a deployed endpoint. A supporting reviewer completed small isolated VM checks before the parent narrowed further security work to static review. Those checks used fixed fixtures and fake media conversion. They did not open a socket or start ffmpeg. Their evidence is in `security-media-abuse.md` and `media-probes.mjs` in this audit directory.

The Steam callback defect is a release blocker. Its parser inconsistency is confirmed by source. Its full impact against Steam remains untested. The app also needs effective public abuse limits and bounded audio processing before an open production launch.

## Findings

### S1. Critical. Steam verification and account selection use different duplicate values

Confidence: high in the code defect and resulting identity mismatch. No live Steam exploitation was attempted.

Evidence:

- `src/app/api/auth/steam/callback/route.ts:55` reads `openid.claimed_id` with `URLSearchParams.get` and derives `steamId` from that value at line 56.
- `src/app/api/auth/steam/callback/route.ts:58` through line 63 validate individual fields with the same first-value lookup.
- `src/lib/steam-auth.mjs:97` through line 103 constructs the provider verification body by iterating all parameters and calling `body.set`. A later occurrence replaces an earlier one.
- `src/app/api/auth/steam/callback/route.ts:76` accepts the provider's positive verification response. Lines 78 through 82 create an account session for the locally selected `steamId`.
- No callback check rejects repeated `openid.*` fields or repeated state fields.

Trigger: a callback contains conflicting repeated identity fields. The app validates and selects the first identity, while the verification request contains the last identity. This breaks the requirement that the verified identity and the account receiving a session must be the same.

Impact: an otherwise valid assertion can be checked for one Steam account while the application issues a session for another. The expected impact includes account access and account deletion. If the selected Steam ID belongs to a configured reviewer, it also affects `/ops` and question review permissions. This impact follows from the call chain; it was not reproduced against Steam.

Static review clarification: the verification helper removes duplicates before it sends the provider request. The provider can therefore receive an otherwise valid assertion with its original signed values and signature. This issue does not require Steam to accept duplicate fields or altered signed content. The mismatch is between the first value selected locally and the single value sent for verification.

The URL standard defines the first-value behavior of `get`. OpenID 2.0 section 4.1 forbids repeated parameter names. The current callback does not enforce that rule. [WHATWG URL standard](https://url.spec.whatwg.org/#dom-urlsearchparams-get), [OpenID Authentication 2.0](https://openid.net/specs/openid-authentication-2_0.html#rfc.section.4.1).

Remediation: reject duplicate OpenID and state parameters before any validation or provider call. Parse one immutable assertion record and use that same record for validation, verification, and session creation. Verify the required signed fields and the provider response format. Review nonce replay handling at the same time.

Regression expectations: conflicting or identical duplicate identity, claimed-ID, return URL, endpoint, signature, signed-field list, nonce, namespace, mode, and state fields must fail before session creation. A provider success response must never allow session creation for an identity other than the identity sent for verification. Test normal sign-in separately with the real provider in a dedicated test environment.

Existing test gap: `scripts/validate-player-profiles.mjs:95` through line 120 covers state integrity, ordinary field forwarding, claimed-ID format, and redirect filtering. It does not cover duplicate fields or the complete assertion-to-session identity invariant.

### S2. High. Caller-chosen IDs bypass the public request limits

Confidence: high for the application flaw. Trust in forwarded IP headers depends on the final host.

Evidence: `src/lib/api-protection.ts:14` accepts a caller-supplied player ID. Line 21 keys the only limit by the combination of IP address and identity. `src/app/api/votes/route.ts:75`, `src/app/api/reports/route.ts:55`, `src/app/api/rounds/route.ts:52`, `src/app/api/private-rooms/route.ts:72`, `src/app/api/round-audio/route.ts:105`, and `src/app/api/round-image/route.ts:115` use this pattern.

Trigger: a guest changes the player or voter ID while keeping the same IP address. Each new ID receives a fresh allowance. Media routes use the supplied player ID even if an account cookie is present.

Impact: the limits do not bound deliberate guest traffic. This permits excessive database work, media conversion, fake crowd votes, report spam, and party creation. The party map has no global room cap at `src/lib/private-rooms.mjs:27` and line 400. The same limiter is local to each process at `src/lib/rate-limit.mjs:2`, so multiple instances do not share a limit.

The supporting reviewer safely checked the actual limiter in an isolated VM. One identity received 60 allowed requests out of 61. Rotating identities at the same IP allowed 125 out of 125. No request reached a server.

Remediation: apply an independent IP limit before body parsing and other expensive work. Add a separate limit for an authenticated account or a server-issued guest session. Use an edge or shared limiter across instances. Bound active parties and other in-memory collections. Decide how much guest vote duplication the product can tolerate.

Additional deployment check: `src/lib/api-protection.ts:6` trusts `x-real-ip` before `x-forwarded-for`. Verify that the public proxy overwrites these headers and that callers cannot reach the Node server directly. Header spoofing was not established on a deployed host.

Regression expectations: changing an ID must not evade the IP allowance; changing a raw forwarded header must not change the trusted source address; multiple application instances must enforce the intended combined limit.

Context: `README.md:124` already calls for edge throttling. This is an unmet production control, not proof that the existing guard was intended to stop all abuse.

### S3. High. Repeated early audio requests create unbounded encoder work

Confidence: high for the source behavior. Actual host exhaustion was not tested.

Evidence: `src/app/api/round-audio/route.ts:135` caches source audio, but lines 158 through 161 cut non-PCM audio for each request during early clue stages. `src/lib/cut-round-audio.mjs:22` starts a new ffmpeg process. Lines 29 through 31 wait for it without a deadline, cancellation, or a concurrency bound. `src/data/questions.generated.json:15864` contains MP3 hero responses, so this is an active content path.

Trigger: several players, or one caller using the S2 flaw, request the same current MP3 clue at the same time. Each request starts separate conversion and temporary-file work.

Impact: CPU, process, and temporary-disk pressure can affect the whole application. A hung encoder retains the request and its files until the child exits. Normal player bursts can also duplicate identical work.

The supporting review invoked the real handler in an isolated VM with a fixed MP3 fixture and a fake converter. Sixty-five requests caused 65 conversion calls. No real encoder ran. This confirms duplicate work, not the capacity of a production machine.

Remediation: precompute the finite clue cuts, or cache the result and share one pending conversion for each source, clip, and stage. Limit concurrent encoder jobs. Set a deadline, stop aborted or hung work, and bound output bytes. Use request limits independent of player-supplied IDs.

Regression expectations: concurrent requests for one clue trigger one conversion. A timed-out or cancelled encoder releases its process, request, and temporary directory. The queue rejects or delays excess work within a documented bound.

### S4. Medium. Guest IDs can claim the authenticated account namespace

Confidence: high for the trust-boundary defect. Abuse against another account needs that account's internal ID, which this review did not find exposed to other party members.

Evidence:

- `src/lib/private-room-rounds.ts:23` through line 28 returns `account:<user.id>` for an authenticated request, but returns any supplied 8 to 80 character guest ID unchanged for an unauthenticated request.
- `src/app/api/votes/route.ts:75`, `src/app/api/reports/route.ts:55`, `src/app/api/sessions/route.ts:51`, and `src/app/api/rounds/route.ts:52` use the same account prefix while accepting arbitrary guest IDs.
- `src/lib/private-rooms.mjs:407` authorizes host start using only equality with that effective identity. Lines 420 through 427 authorize chat the same way. `src/app/api/private-rooms/leave/route.ts:29` uses it for leaving.

Trigger: an unauthenticated request supplies a guest identity equal to a known account identity. The guest branch treats it as the same player for votes, reports, party membership, host checks, and alpha session tracking.

Impact: a known identity can be used to preempt its vote, alter its party state, or send chat under its roster name. This does not directly authenticate `/api/me` or reviewer routes, which still use the account cookie. Internal account IDs are random and the party payload hides member IDs, which limits easy targeting. That protection should not replace authentication.

Remediation: separate account and guest identities using types and server-owned prefixes. Never accept an account identity from a guest request. Use a random server-issued guest credential, preferably in a signed or stored session, rather than a bare arbitrary identifier as proof of guest identity.

Regression expectations: a request without an account session cannot use any reserved account identity or act as a stored account party member. A known internal ID alone must not authorize voting, host actions, messaging, or leaving as that account.

### S5. Medium. Party polling performs account mutations through GET

Confidence: high for the application behavior. No browser forgery flow was run.

Evidence: `src/app/api/private-rooms/route.ts:13` exports GET. Line 31 resolves an account from the session cookie. Lines 36 through 42 accept a name in the query and call `touchPrivateRoom`. `src/lib/private-rooms.mjs:184` through line 208 changes existing names or adds new members. `src/lib/auth-session.ts:77` through line 83 sets the account cookie to SameSite Lax.

Trigger: a signed-in player follows an external top-level link to the party API with a room code and a name. A SameSite Lax cookie can accompany that navigation. The GET changes party membership or the existing member's name without checking the request origin.

Impact: an external navigation can join the account to a party or change its party name. This is a limited account-state forgery issue. The endpoint does not delete accounts or change Steam credentials.

Other account-affecting POST handlers for votes, reports, party creation, start, chat, and leave also omit `isSameOriginMutation`. They accept JSON without requiring an application/json Content-Type. SameSite Lax blocks ordinary cross-site cookie-bearing POST requests, so this review does not claim those POST paths alone bypass current cookie protections. Same-site hostile origins require separate assessment. OWASP advises avoiding state-changing GET handlers and treating SameSite as one part of a broader CSRF defense. [OWASP CSRF prevention guidance](https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html).

Remediation: keep GET polling read-only. Use explicit POST operations for join, rename, and presence updates. Apply the existing origin check consistently to account-affecting mutations, and require the expected request Content-Type.

Regression expectations: reading a room cannot add or rename a member. Cross-origin requests cannot mutate an account's party state. Same-origin join, rename, start, leave, and chat continue to work.

### S6. Medium. Public routes read full request bodies before effective bounds

Confidence: high for application behavior. Effective exposure depends on the hosting proxy.

Evidence: `src/app/api/votes/route.ts:31`, `src/app/api/reports/route.ts:19`, and `src/app/api/private-rooms/route.ts:60` parse the entire JSON body before their rate-limit checks and have no body cap. `src/app/api/diagnostics/route.ts:9` trusts Content-Length for an early check, then reads the whole stream at line 16 before its 2,048 character limit at line 17. Its limiter runs at line 27.

Trigger: an unauthenticated caller supplies a large body, or a slow stream without a useful Content-Length. Parsing and buffering happen before rejection. Invalid payloads can return without reaching any limiter.

Impact: excessive memory use, parsing CPU, and outstanding requests. An external body and read-time limit may reduce this risk, but the repository does not define one.

Existing safe evidence: the supporting reviewer passed a local 65,536 byte ReadableStream to the diagnostics handler. The handler consumed all of it before returning 413. There was no socket or running app.

Remediation: add a small byte limit at the reverse proxy and in a shared streaming JSON reader. Stop and cancel reads at the cap. Add a read deadline. Apply the independent IP limit before reading.

Regression expectations: requests with oversized Content-Length fail early; a chunked or headerless stream stops at the same byte bound; malformed bodies still consume the relevant abuse allowance.

### S7. Low. Site-wide browser security headers are absent from the repository

Confidence: high for repository configuration. Public-host headers were not inspected.

Evidence: `next.config.mjs:5` only configures asset cache headers. No source configuration defines a site-wide Content-Security-Policy, framing policy, Referrer-Policy, or Permissions-Policy.

Trigger: the eventual host does not add these controls. An unrelated site can frame the UI, and a future injection bug has no application content policy to limit its effects.

Impact: missing browser defenses. This finding is not evidence of an existing script injection.

Remediation: disallow cross-origin framing. Configure and test a CSP that works with Next.js scripts, styles, and the actual asset hosts. Set an explicit referrer policy and disable unused browser capabilities. Verify HSTS at the HTTPS host.

Regression expectations: the deployed document response has the agreed policies, cross-origin framing is blocked, and the normal UI and media flows work without CSP errors.

## Other risks and verification limits

- A party code is the access token. Codes can be 3 to 16 user-selected characters at `src/lib/private-rooms.mjs:4`. Anonymous `peek=1` returns roster and chat at `src/app/api/private-rooms/route.ts:21`. Short memorable codes therefore provide little confidentiality, especially with S2. Decide whether party chat is intentionally visible to anyone who knows or guesses the code. If privacy is intended, issue high-entropy invitation tokens and check membership before returning messages. This is a product privacy decision, not a claim that a guessed party was accessed during the audit.
- The callback has no explicit required-signed-field check or local nonce replay store at `src/app/api/auth/steam/callback/route.ts:57`. Provider-side check_authentication may reject replay, but its current behavior was not tested. Close this protocol-review gap when fixing S1. Do not label replay as confirmed from source alone.
- Media downloads read the full response before checking actual bytes and have no explicit fetch deadline at `src/lib/round-audio-cache.mjs:34` and `src/app/api/round-image/route.ts:98`. Image loading follows redirects after checking only the starting host. Audio source loading has no host allowlist and returns the upstream MIME type. These URLs come from committed catalogs; no caller-controlled SSRF path was found. Add bounded streaming reads, timeouts, redirect checks, and audio MIME restrictions before allowing runtime-managed sources.
- `anonymousVoterHash` falls back to a public development salt at `src/lib/voter-hash.ts:4`. The production requirement is checked in `/api/health` at `src/app/api/health/route.ts:16`, not in the hash function. Production correctness therefore depends on health-based deployment gating. Validate required secrets when the process starts, before serving normal traffic.
- The account correctness leak through `/api/me` before round reveal is covered by database finding DB-01. It affects answer secrecy even though `/api/votes` hides its score. Database finding DB-08 covers delayed profile enrichment recreating a deleted identity. Keep both findings in the release plan.
- Dependency advisories, container and host configuration, database privileges, backup handling, and transport configuration are covered by the infrastructure and database reports. This source review does not certify the eventual deployment or its secret settings.
- A malformed percent-encoded session cookie can throw in `src/lib/auth-session.ts:49`. Most callers turn this into a storage error. Treat malformed cookies as absent and clear them. No broader availability impact was established.

## Controls observed

- Session tokens use 32 random bytes and only their SHA-256 hash is stored. Cookies are HttpOnly, SameSite Lax, and Secure in production. Session expiry is checked by both storage implementations.
- Sign-in state uses an HMAC, a random nonce, a short expiry, and a matching browser cookie. The canonical application origin is configured, and post-login return paths use an allowlist. These controls do not resolve S1's identity mismatch.
- Account deletion, logout, alpha session mutations, and reviewer writes check the origin. Reviewer access checks a server-configured Steam ID allowlist, rather than a client flag.
- The inspected PostgreSQL operations use parameterized tagged templates. No raw client SQL string path was found.
- Party names and messages render as React text at `src/components/private-room-panel.tsx:140`. No `dangerouslySetInnerHTML`, `innerHTML`, `eval`, or `new Function` use was found in inspected application source.
- ffmpeg runs with a fixed executable and argument array. Caller-provided strings do not enter a shell command.
- The image route resolves local files under the public directory and checks that boundary. The caller selects a current round rather than supplying an arbitrary path.
- Public question serialization uses an allowlist and hides the answer before reveal. Guest calibration responses remove all answer counts and correctness values in the current source. The separate profile leak still needs correction.
- Server diagnostics hash error details and strip query content from paths. No actual credential or session token was included in this report.

## Recommended release checks

Fix S1 before any real sign-in test with users. Add the identity-invariant regression tests, then verify sign-in, sign-out, session expiry, account deletion, and reviewer access in an isolated staging environment. Verify body, traffic, media-job, and memory bounds before a public traffic test. Check the final host's proxy address behavior and browser headers. Run account and party flows with signed-in and guest clients, including requests without credentials and without valid origins. A passing unit suite or build does not establish these guarantees.

## Bounded secret exposure check

No actual committed credential or private key was identified by this check. It scanned 249 tracked text files in the current working tree and 1,885 unique text blobs reachable from all 249 commits in local Git refs. It skipped 71 current binary files and 72 historical binary blobs. The per-file limit was 2 MiB; no text file exceeded that limit. The scanner did not read ignored `.env.local`, credential stores, or untracked files. It did not fetch remote history.

The patterns covered private-key headers, common GitHub, AWS, Slack, Google, Stripe, SendGrid, npm, and Resend credentials, credential-bearing database URLs, and assignments to secret, token, password, API-key, and voter-salt names. It found 21 current and 117 historical candidates. Source review classified all candidates as runtime expressions, documentation placeholders, local test fixtures, or an ephemeral CI PostgreSQL service. No matched value was printed or recorded in the evidence report.

The only environment-file path found in the full reachable filename history was `.env.example`. Its first change was commit `ab99c80b86135fc87dac3abccd41fb365c223771`, with seven change commits in total. No `.env`, `.env.local`, production environment file, private-key file, or credential-file path appeared in the corresponding history check.

Representative reviewed candidates:

| File | Introducing or relevant commit | Pattern type | Review result |
| --- | --- | --- | --- |
| `.github/workflows/ci.yml:24` and line 33 | `2326b7bf4abc12a8ae3c89573409fc1675bfab9a` | PostgreSQL password assignment and connection URL | Synthetic CI service. The URL points to loopback and its password matches the job's temporary PostgreSQL service. |
| `scripts/check-rate-limit-live.mjs:57` and line 58 | `160ee72deff692330fd45e0c03434493db0d6bdf` | Auth-secret and voter-salt assignments | Fixed local rate-limit test fixtures. |
| `README.md:108` and line 110 | `02ef1554f14b6f9c9d8913aad116afbabd5748de` | Secret and salt assignments | Human-readable deployment placeholders. |
| `.env.example` | `ab99c80b86135fc87dac3abccd41fb365c223771` | Environment-file history | Example file only. No real credential was identified. |

The current tracked source had no `NEXT_PUBLIC_PUSHER*`, `PUSHER_APP_SECRET`, or `PUSHER_SECRET` references. A name-only check of 20 JavaScript files or source maps under `.next/static` and 19 under `.next-check/static` found none of those variable names. This does not prove that an arbitrary value was never inlined into a build. Ignored environment values were deliberately not read or compared against the bundles.

Evidence files are `secret-scan.py` and `secret-scan-results.json` in this audit directory. The JSON contains paths, line numbers, pattern types, commit and blob IDs, and review classifications. It contains no matched credential values.

Limits: this is a pattern-based source-history check, not proof that no secret exists. It excludes binary contents, unreachable Git objects and reflogs, unfetched remote refs, ignored private configuration, external hosting settings, provider logs, and credentials encoded in formats outside the listed patterns. There was no reason from the reviewed candidates to recommend credential rotation or history rewriting.

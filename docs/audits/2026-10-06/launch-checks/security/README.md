# Authentication, proxy and dependency launch checks

Checked on 2026-10-06. Earlier audit archives were not changed.

## Acceptance and results

| Requirement | Result | Evidence |
| --- | --- | --- |
| Full and production package audits report no known advisories. | Passed. Both audits report zero. | [Before](audit-before.json), [full after](audit-after.json), [production](audit-production.json). |
| The replacement keeps Next's directory discovery and lint rules. | Passed ten compatibility tests and full lint. | `tests/eslint-glob-compatibility.test.mjs`, [lint](lint.log). |
| A clean install accepts the frozen lockfile and applies its patch. | Passed in a separate temporary directory, offline, with lifecycle scripts disabled. | [Install log](frozen-install.log). |
| Authentication rejects malformed, unsigned, duplicate, stale and replayed assertions. | Passed local route regressions with synthetic provider responses. Production cookie and canonical-origin checks passed. | [Final regression log](regressions-final.log), `tests/security-auth.test.mjs`. |
| Steam's public discovery, login page and verification endpoint are reachable over verified TLS. | Passed three unauthenticated checks. | [Provider result](steam-provider.json), [discovery document](steam-discovery.xml). |
| Proxy trust stays explicit and ignores other caller-supplied address headers. | Passed strict address, configuration and source-limit tests. A local TLS ingress test also passed. | [Final regression log](regressions-final.log), [TLS test](tls-ingress.log). |
| The hosted ingress overwrites forged headers and separates independent clients. | Pending the isolated hosted probe. | Procedure below. |
| A real Steam account completes login on the final HTTPS origin. | Requires the account owner. No personal credentials or browser cookies were accessed. | Procedure below. |

The final focused regression run passed all 116 tests, including the local TLS test.

## Dependency change

The npm registry still lists `braces@3.0.3` as latest. The advisory has no patched version.
The only affected chain was the development dependency
`eslint-config-next > @next/eslint-plugin-next > fast-glob > micromatch > braces`.
The application had no production path to it. See the
[advisory](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm) and
[registry results](dependency-metadata.json).

The override applies only to the Next ESLint plugin's `fast-glob` dependency. It uses
`tinyglobby@0.2.17`, which exports the `globSync` function used by the plugin.
The [maintainer's documentation](https://github.com/SuperchupuDev/tinyglobby) describes
the supported glob API. Compatibility tests caught its different directory-expansion
default. The pinned patch adds `expandDirectories: false` to Next's sole glob call.
The tests cover ordinary, nested, brace and missing directory patterns, arrays of roots,
and actual `no-html-link-for-pages` diagnostics.

No advisory was ignored, lint rule disabled, or audit threshold lowered. Update the
override, patch and compatibility tests together when the plugin changes.

## Steam verification

`node scripts/check-steam-provider.mjs` makes three bounded public checks. It loads no
environment files, cookies, account stores or credentials. Discovery advertised the
same HTTPS endpoint that the app uses. Steam redirected the unauthenticated login
request once within its own HTTPS origin, then returned its login form. Its verification
endpoint returned HTTP 200 and rejected a request with no assertion or signature.

These results test connectivity and the public protocol. They do not substitute for a
Steam-signed login. The route regressions use synthetic assertions and mocked provider
responses. They prove local validation, cookie behavior and failure handling without
claiming provider authentication. The official
[Steamworks authentication guide](https://partner.steamgames.com/doc/features/auth)
describes the real browser flow.

The guide documents HTTP claimed-ID URLs. The app previously accepted only HTTPS IDs.
It now accepts both exact Steam HTTP and HTTPS identity namespaces, with the same strict
Steam host, path and numeric ID checks. Identity and claimed ID must still match, and the
required signature fields are unchanged. Verification always goes to the fixed HTTPS
provider endpoint. Regression tests reject userinfo, alternate hosts, ports, extra paths,
query strings, fragments, encoded paths and trailing newlines.

The account owner must complete one login on the final HTTPS origin, confirm that the
profile belongs to that account, log out, and confirm that the profile becomes anonymous.
Record only outcomes. Do not copy passwords, cookies, callback assertions or account data
into the audit archive.

## Proxy contract and hosted check

`ARCADE_TRUST_PROXY=cf-connecting-ip` is an explicit option. The default remains `none`.
The app never enables trust from the `RENDER` environment variable. The selected header
must contain one valid IPv4 or IPv6 address. Invalid or missing values share the fallback
bucket, and the app does not fall back to another forwarded header.

Render's [public-service guide](https://render.com/articles/host-pocketbase-on-render)
states that its edge overwrites `CF-Connecting-IP` and appends `X-Forwarded-For`.
Cloudflare's [header contract](https://developers.cloudflare.com/fundamentals/reference/http-headers/)
also defines one client address for that header and explains the separate behavior of
Worker subrequests. Use this mode only when the origin cannot be reached around that
trusted edge. Recheck the contract if another proxy or Worker is added.

The local TLS test models an ingress that replaces the header with the actual socket
address. It proves the app's behavior under that contract. It does not prove Render's
behavior for this service.

On the isolated hosted service, run:

```sh
node scripts/check-ingress-trust.mjs https://EXACT-APP-HOST --saturate
```

The script sends at most 131 cookie-free requests to the login-start route. It follows
no redirects and writes no app data. Rotating all three forwarding headers must not
bypass that route's 120-request allowance. At least ten requests must return 429, and a
header-free control from the same source must also return 429. The script aborts if the
run exceeds the rate window.

Before that window resets, use an independent egress to run:

```sh
node scripts/check-ingress-trust.mjs https://EXACT-APP-HOST
```

That source must receive the Steam redirect. This second check distinguishes a real
client address from one shared proxy or fallback address. Do not saturate `/api/health`,
which the platform uses for readiness. Save only the scripts' summary JSON. If either
check fails, keep the hosted proxy verification open and inspect the ingress behavior.

## Additional database review

The later [independent database release review](postgres-review.md) found and verified
fixes for two further driver recovery failures and inherited operator connection settings.
Its final independent run passed all 61 checks. That report includes the failures,
reproductions, corrected behavior, and reviewed source hashes.

The backup helper initially inherited `PGHOSTADDR`. That could send native PostgreSQL
tools to a different server from the one inspected by the JavaScript client. The database
agent removed inherited `PG*` options and made both clients use one explicit URL parser.
Re-read the final helper and confirmed that destination, credentials, SSL and target-session
settings are explicit for both clients. No further blocker was found within trusted
operator-created archives and isolated empty targets. The database report owns the final
native-client tests and hosted backup verdict.

The runtime-grant review also requested a regression for existing column-level grants
on the migration ledger. The database agent tested the exact revokes on PostgreSQL 14
and 17 and confirmed that the seeded runtime and PUBLIC column grants were removed.
That concern was not reproduced.

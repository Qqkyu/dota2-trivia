# Verify the hosted client address

Start a new or unverified deployment with `ARCADE_TRUST_PROXY=none`. This ignores all forwarded address headers. Requests share a conservative address budget until the actual ingress has been checked. It is suitable for bounded launch checks, not a capacity claim.

The read-only `/api/health/ingress` endpoint lets an operator verify the received Cloudflare header before trusting it. It does not use the database, sessions, cookies, or account permissions. It works only while the configured trust policy is exactly `none`. Enabling any header policy disables the endpoint.

The operator authenticates with a short-lived HMAC derived from `ARCADE_AUTH_SECRET`. Requests bind the method, configured application origin, exact path, expiry, and a random 32-byte nonce. They expire within 60 seconds. Request and response keys have separate purposes. Invalid requests receive a generic, uncached 404 response. Successful requests share a separate limit of 24 per minute.

The response contains only a version, the request nonce, and an HMAC of the received `CF-Connecting-IP`. It contains no raw address, secret, request signature, or general header dump. This proves a header value to the operator who already knows the secret and expected address. It does not change the trust policy.

## Run the check

Supply the existing app authentication secret through the operator's private environment as `ARCADE_AUTH_SECRET`. Do not put it in a command argument, report, shell history, or repository file. Set `INGRESS_EXPECTED_IPV4` to this machine's independently verified public IPv4 address. The check forces IPv4 so this expected address and the app request use the same address family.

```sh
node scripts/check-ingress-proof.mjs https://queue-arcade.onrender.com
```

The command makes five requests to the supplied origin. It compares the baseline and supplied test headers with the expected real address. It rejects a missing header or one controlled by the supplied values. Its output records pass/fail facts without addresses or signatures. Redirects are not followed, TLS certificates are verified, and response size and duration are bounded.

Keep `none` if any check fails. A passing result applies to that origin, provider path, and configuration at the time checked. It does not verify other ingress paths or future hosting changes. After the proof has passed and the configuration change is authorized, select `cf-connecting-ip` explicitly and run the bounded rate-budget check:

```sh
node scripts/check-ingress-trust.mjs https://queue-arcade.onrender.com --saturate
```

That second command makes at most 131 requests without cookies, following no redirects and writing no app data. It checks that changing supplied address headers cannot obtain extra login allowances. Confirm that a separate real source retains its own allowance during the same reset window. The earlier header proof identifies the actual source, and the budget check verifies enforcement.

Render's [published ingress example](https://render.com/articles/host-pocketbase-on-render) documents its Cloudflare header behavior. The hosted proof checks the specific deployment before relying on that behavior. Preserve the proof time, deployment revision, and value-free results with the release evidence. Never save the operator authentication header.

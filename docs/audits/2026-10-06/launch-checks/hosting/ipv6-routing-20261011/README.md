# Hosted IPv6 control route on 11 October 2026

## Correction to the first diagnosis

The first paragraph of the [earlier diagnosis](../ipv6-transport-20261011/README.md) is incorrect. The initial check did send application requests. It did not fail during the public address-source checks. That earlier file remains unchanged so the correction is visible.

All three failed attempts saved checkpoints. Each records 131 IPv4 application requests and one attempted IPv6 application request. Each allowed 120 requests with changing `X-Real-IP` and `X-Forwarded-For` values, then blocked ten. The next request without those headers also had to return 429 before the helper could attempt its IPv6 control.

The checkpoints are [06:25 UTC](../acceptance-20261011/address-isolation-v2-1791699907966.json), [06:27 UTC](../acceptance-20261011/address-isolation-v2-1791700038588.json), and [06:29 UTC](../acceptance-20261011/address-isolation-v2-1791700185161.json). None passed the complete isolation check or the final deployment check. The first two attempts suppressed the child process error details, so their exact transport errors remain unknown.

An observation-only Node preload recorded safe metadata during the third attempt. It returned each original child-process promise without changing the arguments, child environment, error, or exit behavior. Both public IPv6 sources returned HTTP 200. The application control then failed with curl exit code 6, a DNS failure. It returned no HTTP response. The preload retained no addresses, response bodies, or header values.

## DNS and the available routes

The system resolver and Google Public DNS both returned two A records and no AAAA records for the application hostname. A records identify IPv4 endpoints. AAAA records identify IPv6 endpoints. Render's [DNS guide](https://render.com/docs/configure-other-dns) says Render uses IPv4. The normal hostname cannot supply this check's IPv6 control.

The local Windows and Linux clients also share one IPv4 egress address. Two public services agreed on that address for each client. Switching between these clients would not provide an independent IPv4 source. Only the comparison result was saved.

A separate read-only health check used Windows curl over IPv6 with `--connect-to queue-arcade.onrender.com:443:www.cloudflare.com:443`. The URL stayed `https://queue-arcade.onrender.com/api/health`. The request sent no replacement headers or cookies and did not follow redirects. It returned HTTP 200 with a verified application certificate, a global IPv6 connection, the content version from the approved gate, 1,517 questions, and three ready PostgreSQL stores.

Curl's [manual](https://curl.se/docs/manpage.html#--connect-to) states that this option changes the network connection target while keeping the original TLS name, certificate checks, and application hostname. Cloudflare documents that its [proxy addresses are shared by proxied hostnames](https://developers.cloudflare.com/fundamentals/concepts/cloudflare-ip-addresses/). This check uses an explicit Cloudflare IPv6 edge route. It does not show that Render advertises native IPv6 access for the application hostname.

## Separate operator helper

The copied helper changes four lines. It adds the fixed connection target only for the exact application login URL. Both independent public address-source requests keep their original transport arguments. The result identifies the explicit edge route, uses report version 3, and writes to a separate output filename. It keeps the original gate, certificate checks, request counts, response limits, time limits, rate-window checks, redirect checks, and configuration checks.

The helper SHA-256 is `932be267c45efb0c3a262c1f6f9c0aa5eb556167ea1571b3cfd7867728dedd97`. The original helper remains unchanged. No application source, hosting setting, DNS record, or system setting changed.

All 40 earlier address tests passed against the copy. Another 18 tests check the fixed route, exact URL scope, unchanged public-source transport, certificate and credential options, result fields, and request limits. An [independent review](independent-review/review.json) found no blocking issue. Its 16 earlier independent tests and nine new route tests also passed. All these tests ran offline. Actual execution of the new helper has a separate acceptance record.

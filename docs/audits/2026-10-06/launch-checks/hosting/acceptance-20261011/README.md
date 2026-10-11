# Hosted acceptance checks on 11 October

These checks use release `31961cbd762587225b4b8a814828dc0829952978` and Render deployment `dep-db5imrt9fdbs73d19570`. The signed ingress proof and single-key configuration change are recorded in the [hosting report](../README.md).

## Original operator results

The [first smoke result](hosted-1791700234744.json) passed health checks for all three PostgreSQL stores, recent maintenance, 1,517 questions, six page/header checks, all 13 public formats and 15 media fetches. It created its own private room and submitted one accepted guest vote. Its reveal check found the next round instead of the submitted round. The test left the room and confirmed its removal. Browser checks had not started. The overall result is a failure and remains unchanged here.

The original helper waits the full pre-vote remaining time after the vote response. That timing can miss a seven-second reveal window when the vote request is slow. The app uses fixed private-round timing and does not end the round early because all players voted. A separate operator correction must keep the requirement to observe the same round, its revealed answer and the player's vote.

Three address-test attempts are preserved:

- [06:25 attempt](address-isolation-v2-1791699907966.json)
- [06:27 attempt](address-isolation-v2-1791700038588.json)
- [06:29 instrumented attempt](address-isolation-v2-1791700185161.json)

Each attempt sent 131 IPv4 requests. Of the 130 requests with changing `X-Real-IP` and `X-Forwarded-For`, 120 received the expected Steam redirect and ten received the rate limit. A final request without those headers was also blocked. Each attempt then failed its separate IPv6 control request. The post-check configuration verification did not run, so none is a complete independent-client acceptance result.

The initial console-only interpretation that no app probes had run was wrong. The saved checkpoints above establish the actual request counts. No redirect was followed, no cookie was retained and no app data write was made by the address tests. The separate [initial transport diagnosis](../ipv6-transport-20261011/README.md) records public-source connectivity checks, not a successful application control. Its first paragraph repeats the incorrect early interpretation. The saved application checkpoints supersede that statement.

Later corrected checks will be recorded separately. These original failures will remain unchanged.

## Corrected address control

The [corrected result](address-isolation-edge-v3-1791700698282.json) passed at 06:38 UTC in 15.213 seconds. After 120 allowed requests, all ten remaining spoof-header requests and the header-free IPv4 request received the rate limit. An independent IPv6 request received the expected Steam redirect in the same rate window. No redirect was followed and no cookie or app data was stored by the test. The deployment and configuration matched before and after.

This control used the explicit Cloudflare IPv6 connection described in the [routing review](../ipv6-routing-20261011/README.md). It preserved the app hostname and normal TLS certificate verification. It does not establish native IPv6 support in Render DNS.

The [private-reveal operator correction](../private-reveal-wait-v3/README.md) is separate. Its [hosted result](hosted-1791700992134.json) passed all 13 formats, the guest vote, the same-round reveal and room cleanup. The active-round request took 410 ms and the vote request took 110.92 ms. The reveal response still had 5,612 ms remaining. These measurements do not establish the cause of the earlier failure.

That run later failed `BROWSER_RUNTIME` after 639 proxied browser HTTP requests, close to its fixed 640-request ceiling. The separate browser diagnosis and passing acceptance result appear below. This overall result remains a failure; it is not a complete hosted smoke pass.

## Completed browser acceptance

The [browser-only diagnostic](browser-diagnostic-1791701345130.json) passed with the original request, byte and time limits. It used the same release, deployment and checked private gate as the guest test. It verified health and configuration before and after. The browser rendered answering and reveal states, with prompt, timer, answer controls and no horizontal overflow at 320×568 and 1440×1000. It reported zero page errors and no proxy failure. It closed its browser and sent no vote or private-room write.

The run took 37.342 seconds and intercepted 360 browser requests. It forwarded 359, including 304 public game-CDN requests and 11 round reads. One session POST was intentionally blocked by the read-only proxy. The expected blocked request produced a console network error; it did not produce a page error. The trace showed no rapid round polling in this run.

These separate results complete the hosted acceptance checks for the same deployment. They do not turn either earlier full-run failure into a pass. The original browser failure lacks category and page-error counters. Repeated image loading with Playwright's disabled browser cache is a supported explanation from code review, but this successful repeat does not prove the exact earlier cause. The original limit remains unchanged.

The [browser diagnosis archive](../browser-diagnostic-v4/README.md) includes the exact wrapper, independent review and local cache comparison. The local synthetic page reproduced exhaustion of the unchanged proxy budget with repeated image mounts. A Chromium cache toggle did not reduce those requests. This supports retaining the proxy limitation without changing app code or claiming that the original hosted failure was fully explained. All owned local test processes were closed.

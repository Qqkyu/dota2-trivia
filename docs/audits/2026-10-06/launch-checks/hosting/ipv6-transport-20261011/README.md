# IPv6 transport check on 11 October 2026

The first hosted address-isolation attempt stopped with `IPV6_TRANSPORT` before it sent application login probes. The pinned helper suppresses the child process error details. That result does not identify the cause.

A bounded diagnostic checked Windows curl with the same restricted environment. Both public address services returned HTTP 200 over IPv6 and IPv4. The executable reports IPv6 support. The diagnostic recorded status, byte counts, and parsed address families. It did not save raw addresses or response bodies.

At 06:26:49 UTC, a second diagnostic imported `curl6` and `ipv6` from the unchanged helper. It repeated only the two original IPv6 source requests. Both returned HTTP 200. Both addresses were global IPv6 addresses and agreed in memory. This supports retrying the unchanged hosted check. It does not prove a cause for the first failure or prove application address isolation.

No system settings changed. These diagnostics sent six public network requests in total and no application requests. They did not follow redirects or use application cookies.

The helper SHA-256 was `fe1c62d1e08978f9f6f858b896dd0e3fee31083384764de5cea54356c07163e4`. The scripts remain snapshots of their original scratch paths. The final hosted check has its own result record.

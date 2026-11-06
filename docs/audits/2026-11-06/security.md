# Security pass before the announcement, 2026-11-06

Claude Fable 5.1 (`xhigh` effort) reviewed the code read-only and sent 7 plain GET requests to
production. Scope: Steam sign-in and sessions, everything new since the
[2026-11-01 review](../2026-11-01/security.md) (`f3359f8..cdda53e`), Render edge caching, a quick
look at the rest, and the privacy page against the code.

No critical or high finding. Steam sign-in and sessions were sound.

| #   | Finding                                                                                                                                                                                                 | Severity | Result                                                                                                                                 |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `/api/calibration` zeroed the open public question's total but kept its place in a list sorted by total. That marked the live question, and its revision maps to its answer through the public catalog. | Medium   | Fixed. No record is treated differently. An expired public snapshot is rebuilt only early in a reveal, because votes count on arrival. |
| 2   | `/api/art` served any image on the six Steam avatar hosts.                                                                                                                                              | Low      | Fixed. Avatar hosts serve avatar file names only.                                                                                      |
| 3   | Three privacy page statements did not match the code.                                                                                                                                                   | Low      | Fixed. See below.                                                                                                                      |
| 4   | Rate limits used the full IPv6 address, so one /64 owner could fill the bucket map. Not reachable today: the domain has no AAAA record.                                                                 | Note     | Fixed. IPv6 addresses share one bucket per /64.                                                                                        |

Finding 3 in detail:

- Visits could be joined to saved results through round IDs. The visit table now keeps a hash of
  visit and round. Maintenance clears the old round IDs and the `user_id` and `visitor_hash` links
  on visits from before PR #55.
- Reporter hashes never expired. Maintenance now deletes them after 90 days; report counts stay.
- Crash reports can carry the framework's error code. The page now says so.

Remaining limit: the first public read after a restart or a review builds a snapshot even during
answering. An attacker would need a snapshot from just before it, and would learn one round.

The two PostgreSQL behaviours were tested on a local PostgreSQL 17 with `TEST_DATABASE_URL` (58
tests). That run also found two tests that PR #55 had left out of date, because the normal gate
skips them. Both are fixed.

This archive records the factual review of all 191 Flashback questions on 6 October 2026.

All 191 records are supported after the corrections: 115 without content edits and 76 with corrected or narrower claims. No records require exclusion. The review preserved every scored answer key. Forty-three records have a changed calibration revision.

`flashback-ledger.json` records each question, all checked text, the scored answer, exact primary URLs, changes and evidence limits. `flashback.md` explains the results. The three follow-up reports explain the original video, Warcraft map and prize-pool evidence.

Retained evidence includes 70 cited Valve news records, 28 primary page responses, two archived Valve announcements, selected original broadcast frames and caption files, compact video metadata, publisher text and map provenance records. Full maps, videos and transient media download URLs are excluded. Some primary pages were read through the web tool; their exact citations and checked claims remain in the ledger without a local page snapshot. `snapshot-limitations.json` records the failed separate NAVI snapshot fetch.

Run these checks from the repository root:

```sh
node scripts/validate-flashback.mjs
node docs/audits/2026-10-06/deep-review/flashback/check-flashback-flow.mjs
python3 docs/audits/2026-10-06/deep-review/flashback/check-flashback-sources.py
```

The first two checks do not use the network. The last check reads the 70 exact Valve news API links. The flow check uses the current app serializer and scoring functions, compares the ledger with the current data, preserves the answer keys and checks the 43 recorded calibration changes. Structural checks alone do not establish factual correctness.

For the Warcraft extraction, download the pinned map files named in `wc3-primary/source-manifest.json` into that directory as `dota-6.41.w3x` and `dota-6.52.w3x`, then run `extract.py`. Check the input hashes before extraction. The reader inspects archive members without executing the map script. The bundled mpyq reader retains its upstream license.

`archive-manifest.json` gives the SHA-256 of every retained file except itself. The hashes detect later changes; they do not establish source authority. Source authority and any inference are stated separately in the ledger.

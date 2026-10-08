Warcraft III DotA name checks, 2026-10-06

Both Flashback answers are supported by the original map data. The check read map archive members without running Warcraft III or executing the map script. It does not rely on a wiki's naming claim.

The main artifact is [DotA Allstars v6.52 at pinned GitHub commit 6dfc50b6a7654db3c89f60f241c1871b1c68a277](https://github.com/n3k0lai/dota-legacy/blob/6dfc50b6a7654db3c89f60f241c1871b1c68a277/DotA%20Allstars%20v6.52.w3x). The [raw file](https://raw.githubusercontent.com/n3k0lai/dota-legacy/6dfc50b6a7654db3c89f60f241c1871b1c68a277/DotA%20Allstars%20v6.52.w3x) is 3,187,686 bytes. Its SHA-256 is `52992049f850436c699beafd26474926f8fd4ad797dffdb62e843a6d8b3cf368`.

I downloaded the same map independently from [Epic War map 51441](https://www.epicwar.com/maps/51441/) and [Hive map 86648](https://www.hiveworkshop.com/threads/dota-allstars-v6-52.86648/). Both downloads match the pinned GitHub file byte for byte and have the same SHA-256. Epic War dates its upload to 30 April 2008; Hive dates its upload to 12 June 2008. The map's own `war3map.w3i` identifies version 6.52 and IceFrog as its author. These are three independent public copies of the original artifact. I did not find a developer signature or an original developer-published checksum.

For `flashback:scythe-old-name`, the extracted `Units\\ItemStrings.txt` record `I0AL` contains:

```ini
Name="Guinsoo's Scythe of Vyse"
```

The item tooltip describes Hex and the stat bonuses. The recipe entry `I07K` and muted-item entry `I0BY` use the same name. This supports the answer Guinsoo and the claim that the older Warcraft III item carried his name. It does not establish the first version that introduced the name. Use "Warcraft III DotA" or "DotA Allstars" rather than language that implies a check of the earliest original DotA release. [Original map](https://github.com/n3k0lai/dota-legacy/blob/6dfc50b6a7654db3c89f60f241c1871b1c68a277/DotA%20Allstars%20v6.52.w3x).

An earlier [version 6.41 artifact](https://github.com/n3k0lai/dota-legacy/blob/6dfc50b6a7654db3c89f60f241c1871b1c68a277/DotA%20Allstars%20v6.41.w3x) independently supports the same item name. Its `war3map.w3t` original-object record `spre`, field `unam`, contains the full name at zero-based byte offset 51,608. The artifact's MD5 is `024267384e541edea8fed22202e2a1ef`, exactly the checksum published by [ModDB's version 6.41 download record](https://www.moddb.com/games/warcraft-iii-frozen-throne/addons/dota-allstars-6-41), dated 12 February 2007. The downloaded file also matches that page's 1,981,041-byte size. MD5 here identifies the historical published artifact; SHA-256 in the manifest verifies the bytes retained for this review.

For `flashback:pit-lord`, the extracted `Units\\NeutralUnitStrings.txt` record `N00R` contains:

```ini
Name=Pit Lord
Propernames=Azgalor
```

That record's `Ubertip` lists Firestorm, Pit of Malice, Expulsion, and Dark Rift. The map script also maps hero identifier `N00R` to the same hero label. Three of those ability names match [Valve's Underlord introduction](https://www.dota2.com/darkrift/), which names the Dota 2 hero Vrogros. This provides the direct original-name evidence plus an independently sourced connection to the Dota 2 hero. The ability comparison is an inference from the two primary artifacts. The map alone does not document Valve's rename decision or its reasons. Keep the explanation to the two names used by the respective games.

The local evidence is under `docs/audits/2026-10-06/deep-review/flashback/wc3-primary/`:

- `source-manifest.json` records source URLs, archive hashes, and the independent mirror matches.
- `name-evidence.json` retains the exact short source values, record IDs, member hashes, and the earlier item's byte offset.
- `extraction-manifest.json` records the extracted members and their SHA-256 hashes.
- `extract.py` repeats the read-only extraction with `mpyq.py`, downloaded from the [mpyq project](https://github.com/eagleflo/mpyq). The wrapper locates the MPQ header at offset 512 and reads encrypted archive sectors. It does not execute the map script.
- The original map files and extraction outputs remain in the temporary research folder; this durable archive retains the exact evidence values, source URLs and hashes. A durable audit only needs the two short evidence JSON files, this report, and extraction code; the full map binaries need not be committed.

Checks passed: both expected names found in their actual item or hero records; both original-map names found without a wiki lookup; all three version 6.52 downloads identical; version 6.41 matches the independently published historical checksum; every extracted member has the length declared in the archive.

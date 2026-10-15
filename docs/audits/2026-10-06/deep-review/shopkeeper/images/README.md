# Shopkeeper icon review

Reviewed all 182 catalog icons on 2026-10-06. The three sheets were opened at original resolution, and every labeled position was inspected. No obvious wrong, blank, corrupt, or name-mismatched artwork was found.

- [Items 1 to 63](items-01.jpg)
- [Items 64 to 126](items-02.jpg)
- [Items 127 to 182](items-03.jpg)

All 179 remote images loaded from their current Steam CDN URLs. The three local images decoded correctly. Phylactery is item 110, Khanda is item 114 with the internal key `angels_demise`, and Disperser is item 176. Their file hashes match the original user-provided files recorded by the first audit. No image source was changed.

The [manifest](manifest.json) records each exact URL or local path, SHA-256 hash, decoded dimensions, and sheet position. All images contain visible pixels, and no two catalog files have the same encoded hash. The two `.txt` helpers preserve the fetch and sheet-generation steps. They retain the original temporary cache paths.

This review checks the artwork shown by the current catalog. It does not verify live-client shop order, item availability, or every icon against an independent client capture. Small source PNGs were enlarged only in these audit sheets.

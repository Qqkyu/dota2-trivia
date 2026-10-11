The four UI corrections remain visible in the inspected production CI screenshots. Muted volume controls remain clear, party selection uses a checkmark, the active shop tab has an underline, and the active calibration filter has a double border. Keyboard focus remains a separate outline. I found no visible regression in this targeted review.

This evidence belongs to run `38047885476`, source `64046c2d198fcbfe556599e727ae0638423a3482`, and image `sha256:2805e11a91f951c2b316c290068566f2cd759ef5cd10086e6a5c4ed12d658600`. The CI owner supplied that association. The raw browser reports have no build ID. The six changed source files match the hashes from the earlier corrected local capture.

The accessibility steps passed in Chromium, Firefox and WebKit. The overall run later failed the separate visual-smoke shared-reveal/report assertion. This UI spot review does not mark release CI passed.

| Check | Forced light | Forced dark |
|---|---|---|
| Muted volume and mute icon | [Comparison](forced-volume-comparison.png) | [Comparison](forced-dark-volume-comparison.png) |
| Party, shop and calibration selection | [Comparison](forced-selection-comparison.png) | [Comparison](forced-dark-selection-comparison.png) |
| Keyboard focus | [Comparison](forced-focus-comparison.png) | [Comparison](forced-dark-focus-comparison.png) |
| Calibration controls | [Final crop](forced-calibration-top.png) | [Final crop](forced-dark-calibration-top.png) |

The comparison sheets show the corrected local crop on the left and the final production crop on the right. Small crops use 3x nearest-neighbor scaling. Final full-page examples are [home](chromium-forced-dark-home.png), [party](chromium-forced-party-unchecked.png) and [Shopkeeper](chromium-forced-shop-build.png).

I inspected 40 final control crops against 40 earlier local crops, six final full-page images, and two calibration top crops. The source images, hashes, browser versions and timestamps are listed in [review.json](review.json). No app changes or new browser runs were needed.

Chromium records 117 passing targeted painting checks, including 78 forced-color checks. The forced-light report still contains 22 excluded color-contrast rule instances with 240 node occurrences. It also has 1,538 incomplete contrast node occurrences; forced dark has 1,534. These remain automated-check limits. Three empty light-mode shop search inputs retain an incomplete 1:1 contrast message; their placeholders are visible in the saved pages. See the [raw Chromium report](../accessibility/chromium.json.gz) for the unchanged results.

This review does not certify all contrast, every UI state, physical devices, screen readers or Windows high-contrast themes. Firefox and WebKit passed their mobile checks, but this review did not inspect their screenshots and those runs did not test forced-color painting. The calibration inspection covered the top section and controls, not every table row. The overall release result is recorded in the parent CI archive.

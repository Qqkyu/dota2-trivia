The four UI defects are corrected in the reviewed local capture. Muted volume controls remain visible in the normal theme and both forced-color modes. The party checkmark, shop underline and calibration double border now identify the selected state. The tested controls also retain a separate keyboard-focus outline. I found no new visible regression in this scope.

| Control | Before and after | Final page |
|---|---|---|
| Volume | [Normal](desktop-volume-comparison.png), [forced light](forced-volume-comparison.png), [forced dark](forced-dark-volume-comparison.png) | [Dark home](chromium-forced-dark-home.png) |
| Party, shop and calibration selection | [Normal](desktop-selection-comparison.png), [forced light](forced-selection-comparison.png), [forced dark](forced-dark-selection-comparison.png) | [Party](chromium-forced-party-unchecked.png), [shop](chromium-forced-shop-build.png) |
| Keyboard focus | [Normal](desktop-focus-comparison.png), [forced light](forced-focus-comparison.png), [forced dark](forced-dark-focus-comparison.png) | [Light calibration](forced-calibration-top.png), [dark calibration](forced-dark-calibration-top.png) |

Each comparison sheet puts the old crop on the left and the corrected crop on the right. Small crops use 3x nearest-neighbor scaling for inspection. The source pixels retain their colors. Red has no mute-button capture, so those sheet cells are blank. The source screenshots remain unchanged.

I inspected 54 old control crops, 60 corrected control crops, and 12 corrected full-page images in normal, forced-light and forced-dark modes. Full pages cover home, unchecked party selection, Shopkeeper and calibration. Calibration received a full-page overview and a native-size top crop. I did not read every table row.

The [green capture summary](../green/summary.json) records 117 passing targeted painting checks and zero failures in Chromium 149.0.7827.55. The old run had 102 checks and 16 failures. The counts differ because the corrected run adds mute-icon, label, restoration and normal-theme volume checks. The [raw green report](../green/chromium.json.gz) retains excluded axe contrast results and incomplete checks. Zero gate failures do not establish a full contrast pass.

This is a local development-server review, completed against the 10 October 2026 capture at 11:10 UTC. The report has no build ID, and the screenshots show the development indicator. The six source hashes in the capture summary matched the workspace when reviewed. [review.json](review.json) preserves those hashes, source-image hashes, timestamps, observations and image derivations. The [earlier snapshot review](../../forced-colors-review/README.md) remains unchanged.

Final production-image CI remains separate. This review does not certify physical Windows high-contrast themes, other browser engines, smaller screens, screen readers or page-wide contrast. The pixel checks use the most common crop color as a reference and report the highest sampled contrast. Those values are not minimum text contrast measurements.

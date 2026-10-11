# Production CI browser accessibility checks

All three accessibility steps passed in [run 38050315807](https://github.com/Qqkyu/dota2-trivia/actions/runs/38050315807) for commit `31961cbd762587225b4b8a814828dc0829952978`. The [copy record](copy-provenance.json) identifies the exact runner and source directory. The [summary](summary.json) retains counts, raw axe findings and scope limits.

| Engine | Page states | Fixtures | General keyboard scenarios | Painted-control assertions |
| --- | ---: | ---: | ---: | ---: |
| Chromium 149.0.7827.55 | 49 | 112 | 6 | 117 |
| Firefox 151.0 | 7 | 16 | 6 | 0 |
| WebKit 26.5 | 7 | 16 | 6 | 0 |

These are 207 rendered states and 18 keyboard scenarios. Chromium covered desktop, mobile, 200% and 400% zoom configurations, reduced motion, and light and dark forced colors. Its 117 painted-control assertions covered desktop and both forced-color palettes. Firefox and WebKit ran mobile page and fixture checks plus the general keyboard scenarios. They did not run painted-control checks in this workflow. The reports contain no gate failures or browser errors.

The raw [Chromium](chromium.json.gz), [Firefox](firefox.json.gz) and [WebKit](webkit.json.gz) reports remain complete in lossless gzip. Chromium has 22 raw serious color-contrast records across 240 node occurrences that the checker excludes in the light forced-color mode. There were no raw violations in dark forced-color mode. It also retains 152 incomplete rule records across 9,334 node occurrences. Firefox and WebKit each retain 22 incomplete rule records across 1,044 node occurrences and no axe violations. These counts include repeated nodes across states. Passing the gate does not resolve every incomplete axe result or establish full accessibility compliance.

All three reports have `buildId: null` and `reviewerFixture: false`. The [container result](../container-result.json) separately records build `_mJ940ch4y2ZdKUAMXDdy` and image `sha256:3bfdaf12795a02f03a4f0bbb990bb762a2c80c895546ee88102b802a39a1b5ab`. That external metadata and the exact-run copy record provide provenance; the browser reports did not observe a build ID themselves. The archived checker sources come from the exact committed source and are not hashes measured inside the browser process.

The [screenshot inventory](screenshot-inventory.json) records 273 private PNG files totaling 78,123,857 bytes, with dimensions and SHA-256 hashes. It does not mean every image received a manual review. The separate [production screenshot review](../production-ui-review/README.md) preserves selected images and states its review scope. Physical devices, every high-contrast palette and screen-reader use still require separate evidence.

# Accessibility follow-up evidence

All three commands completed on 10 October 2026 with exit code 0 and no checker failures. They ran against the isolated app at `http://127.0.0.1:3000`. These manual diagnostic results do not establish that the full GitHub Actions workflow passed.

| Browser reported by Playwright | Modes | Page inspections | Fixture inspections | Keyboard scenarios |
| --- | --- | ---: | ---: | ---: |
| Chromium 149.0.7827.55 | Desktop, mobile, 200% and 400% reflow, reduced motion, forced colors | 42 | 96 | 6 |
| Firefox 151.0 | Mobile | 7 | 16 | 6 |
| WebKit 26.5 | Mobile | 7 | 16 | 6 |

The reports contain 184 page and fixture inspections and 18 keyboard scenarios. They record no browser errors or horizontal overflow. The six keyboard scenarios per engine cover classic ability answers, recipe building, Fogged Vision, Order Up, Flashback year entry, and the next round on mobile. The fixture checks use local synthetic API responses. WebKit is a browser engine test, not a test on an iPhone or in Safari.

The checker reports zero failures, but the raw Chromium report contains 22 serious axe color-contrast entries in forced-color mode. The checker excludes those entries on the stated basis that axe reads authored colors while the browser paints forced colors. This archive preserves those entries and does not claim that the archive review checked their painted contrast. Axe also leaves 176 color-contrast rule checks incomplete across the three reports, with 9,956 affected node occurrences. These counts include repeated states and nodes, not unique defects. These checks need separate evidence and are not passes.

Every report has `reviewerFixture: false` and `buildId: null`. These runs do not check an authenticated reviewer fixture or independently identify the app build. The current checker file matches candidate commit `da28a646479fab030e9b02b187e177c0f89555b9`, with SHA-256 `ada35f46e03ae9a917a7705db0e62477ad2e0dd008606040b933468277d9a9e9`. No direct hash of the executed runner file was captured. These limits remain in [provenance.json](provenance.json).

[summary.json](summary.json) records the exact versions, start and end times, counts, and exclusions. The three `.json.gz` files preserve the full report bytes after decompression. Each engine also has its exact `.log`, `.started`, `.finished`, and `.exit` files. [provenance.json](provenance.json) records source and archive hashes.

The [screenshot inventory](private-screenshot-inventory.json) records the names, sizes, and SHA-256 hashes of 190 private local screenshots, totalling 66,732,606 bytes. No screenshot bytes were copied into this repository archive. This archive task did not inspect screenshots or change app code, containers, or services.

Before compression and publication, Gitleaks found no secrets in the full reports or logs. A separate scan found no match for six known configured secrets. See [secret-scan.json](secret-scan.json). [manifest.json](manifest.json) records all archive files except itself.

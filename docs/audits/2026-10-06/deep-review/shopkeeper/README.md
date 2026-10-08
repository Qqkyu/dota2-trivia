# Shopkeeper content review

Reviewed all 102 questions and all 182 catalog entries on 2026-10-06. The ledger marks 56 questions verified and 46 fixed. All 182 catalog names and prices match Valve's current item records. No question remains factually unverified within this scope.

## Sources and method

The review used Valve's [item list](https://www.dota2.com/datafeed/itemlist?language=english), 182 individual item records, and 26 individual recipe records. The item list supplies direct component IDs. Each item record supplies its English name and current gold cost. The exact response bytes and URL/SHA-256 manifests are in the shared [Valve API archive](../sources/valve-api-2026-10-06.tar.gz). Its [manifest](../sources/valve-api-manifest.json) records each file hash. The original `valve/` prefix in the ledger refers to the root of that extracted archive. The [7.41f patch notes](https://www.dota2.com/patches/7.41f) independently confirm the recent cost changes.

Each question was checked for its prompt, item names, component multiplicities, options, marked answer, explanation, source recipes, and valid alternatives. Build and upgrade questions were checked against all 182 selectable shop items. Recipe builders were checked against every official recipe variant, with recipe scrolls excluded from the selected components. Shared-component questions were checked against both complete direct recipes. All option costs and stored ingredient trees were checked too.

The independent Valve recipe data agrees with the local `core/scripts/npc/items.txt` snapshot for every recipe used by the 102 questions. The source-based tests do not use the existing validator's expected answers as factual evidence.

## Corrections

1. All 38 Shared Part prompts now ask, "Which component is used directly in both recipes?" Three old prompts allowed an offered answer through a deeper recipe tree. Bloodthorn and Monkey King Bar both use Blitz Knuckles through Oblivion Staff. Monkey King Bar and Silver Edge both use Blitz Knuckles through Shadow Blade. Orchid and Bloodthorn both use Claymore. Their existing marked answers were uniquely correct only for direct recipes. The explanations already stated that scope.
2. Six recipe-builder targets need no recipe scroll: Bloodstone, Echo Sabre, Shadow Blade, Maelstrom, Oblivion Staff, and Tranquil Boots. The old UI always showed a scroll as included. All 26 builder records now contain the exact `recipeCost`, and the six zero-cost explanations state that no scroll is needed. The functional review covers the conditional UI display and browser checks. Costs match each recipe's own Valve response, including [Bloodstone's zero-cost recipe](https://www.dota2.com/datafeed/itemdata?language=english&item_id=120).
3. Two upgrade records had incomplete Guardian Greaves ingredient trees. The generator skipped one-component recipes and therefore omitted Ring of Regen and Sage's Mask below Headdress and Ring of Basilius. The generator now expands all source recipes. The affected records were corrected. Their marked answers did not change.

## Checks

- `node node_modules/vitest/vitest.mjs run tests/shopkeeper-facts.test.mjs` passed all 285 tests. The fixture contains independently fetched Valve names, prices and recipes for all 182 shop items.
- `node scripts/validate-shopkeeper.mjs --require-client` passed all 102 stored rounds, all 26 full-shop recipe builders and the 182-item catalog, including local-client recipe parity.
- Focused ESLint passed for the generator, validator and factual tests.
- `check-shopkeeper-generator.mjs` generated a separate temporary copy. All 102 questions and all 182 catalog entries matched the checked-in facts after normalizing equivalent image paths. Existing local image optimizations were preserved in the repository.

No catalog prices or names needed correction. No correct answer index changed. Existing user edits outside the confirmed issues were preserved.

## Limits

Valve's item API does not expose the visual shop-tab arrangement. The existing 11-group order was retained and was not independently compared with a current client screenshot. This factual review checked every icon's item key. A [separate completed visual review](images/README.md) inspected all 182 catalog icons on three contact sheets. It found no obvious wrong, blank, corrupt, or name-mismatched artwork. It did not compare every icon against an independent client capture. The ledger preserves the earlier factual review's narrower visual limit; the image report records the later completed check.

The combined build, content version, and browser checks are recorded in the wider audit.

## Saved evidence and repeat checks

The [ledger](shopkeeper-ledger.json) records all 102 questions and 182 catalog entries. The [selected source fixture](shopkeeper-valve-7.41f.json) records names, prices, direct recipes, and reviewed recipe-scroll costs. Its bytes match the committed test fixture at archive time. The [test source snapshot](shopkeeper-facts.test.mjs.txt) preserves the checks that used it.

The [focused test log](focused-tests.log) records a final combined run with all 289 Shopkeeper and Aghanim tests passing. This run also rehashed the 127 complete Valve hero responses used by the Aghanim fixture. The [strict validator log](shopkeeper-strict-final.log) records all 102 rounds, 26 builders, and 182 catalog entries passing with client recipe parity.

From the repository root, repeat the factual tests with:

```sh
node node_modules/vitest/vitest.mjs run tests/shopkeeper-facts.test.mjs
```

To repeat the client check, provide the reviewed client extraction through `DOTA_CLIENT_AUDIT_ROOT`, then run:

```sh
node scripts/validate-shopkeeper.mjs --require-client
```

The [generator parity helper](check-shopkeeper-generator.mjs.txt) preserves the earlier full generation comparison. It retains its original temporary paths and needs those inputs restored or the paths adapted before use. It must generate into a separate temporary directory.

The [archive manifest](archive-manifest.json) records the saved file hashes and the reviewed repository file hashes. The existing [image archive manifest](images/archive-manifest.json) covers the visual evidence. No image archive file was changed during this archival step.

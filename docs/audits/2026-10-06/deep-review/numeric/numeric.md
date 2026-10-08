# Numeric question review

Reviewed on 2026-10-06. This review covers all 422 assigned live records. Each prompt, answer option, explanation, comparison condition, and ordering card was read. No marked numeric answer or ascending answer order needed to change.

| Family | Records | Checks |
| --- | ---: | --- |
| Classic ability values | 159 | 52 cooldowns, 60 mana costs, 47 damage questions; selected levels and full explanation progressions |
| Classic hero stats | 82 | 40 movement speeds and all four offered heroes in 42 stat comparisons |
| Classic item prices | 101 | 73 total prices and all four offered items in 28 price comparisons |
| Order Up | 80 | All 320 cards, their values and units, all four stored answer options, and each ascending order |

The complete ledger is `numeric-ledger.json`. Its 422 rows are marked `fixed` because every record received visible comparison conditions or direct source references. This does not mean 422 incorrect numeric answers were found. The substantive errors and ambiguous wording are listed below.

## Facts and wording corrected

| Record or scope | Finding and correction | Primary evidence |
| --- | --- | --- |
| `damage:mirana_starfall:4` and its Order Up card | The question said each meteor deals 300 damage. The primary meteor does; the secondary meteor has an 80% base multiplier. The prompt and card now identify the primary meteor, and the explanation qualifies facet effects. | [Current Mirana data](https://www.dota2.com/datafeed/herodata?language=english&hero_id=9), [7.41d patch notes](https://www.dota2.com/datafeed/patchnotes?version=7.41d&language=english) |
| `damage:snapfire_scatterblast:4` | The point-blank bonus in the explanation was 30%. It is 25%. The marked base damage stays 280. | [Current Snapfire data](https://www.dota2.com/datafeed/herodata?language=english&hero_id=128), [7.41e patch notes](https://www.dota2.com/datafeed/patchnotes?version=7.41e&language=english) |
| `damage:rubick_fade_bolt:4` | Corrected the lower-level damage progression to 85/165/245/325. The max-level answer stays 325. | [Current Rubick data](https://www.dota2.com/datafeed/herodata?language=english&hero_id=86), [7.41d patch notes](https://www.dota2.com/datafeed/patchnotes?version=7.41d&language=english) |
| `damage:vengefulspirit_magic_missile:4` | Corrected the progression to 100/180/260/340. The max-level answer stays 340. | [Current Vengeful Spirit data](https://www.dota2.com/datafeed/herodata?language=english&hero_id=20), [7.41d patch notes](https://www.dota2.com/datafeed/patchnotes?version=7.41d&language=english) |
| `damage:axe_culling_blade:3` and four Order Up rounds | Removed the obsolete condition about a target being above an execution threshold. The current listed damage is pure damage. | [Current Axe data](https://www.dota2.com/datafeed/herodata?language=english&hero_id=2) |
| `cooldown:invoker_invoke:1` and `value-order:ability-cooldown:02` | The 7-second answer is the base cooldown. Orb levels reduce it. The condition now appears before the answer; the explanation gives the 0.3-second reduction per orb level. | [Current Invoker data](https://www.dota2.com/datafeed/herodata?language=english&hero_id=74) |
| All ability values | Added visible conditions for base or listed values, excluding talents, facets, upgrades and relevant modifiers. Damage questions specify enemy heroes and exclude amplification and resistance. This also separates Hook's hero damage from its creep kill effect. | Exact per-ability sources and hashes are recorded in the ledger. |
| All hero stats | Added default-form and base-stat conditions. Attack-range prompts now say base attack range. This matters when Troll Warlord appears among the offered heroes. | [Current Troll Warlord data](https://www.dota2.com/datafeed/herodata?language=english&hero_id=95) and each hero reference in the ledger. |
| All item prices | Specified total shop price, including components and recipes. Dagon means level 1. Boots of Travel 2 uses its 4,500 total price, not only its upgrade recipe. | [Dagon data](https://www.dota2.com/datafeed/itemdata?language=english&item_id=104), [Boots of Travel 2 data](https://www.dota2.com/datafeed/itemdata?language=english&item_id=220) |
| Wording | Fixed possessives for ability names ending in `s`. Current hero names come from the shared canonical-name helper. | Current Valve hero and ability profiles. |
| Sources | Replaced the generic build-6882 patch-page stamp with the exact Valve hero, ability or item data. Comparison questions and Order Up retain all relevant references. | URLs and SHA-256 hashes in the ledger and independent fixture. |

All choices are distinct. Each Classic record has one correct offered answer under its stated conditions. No Order Up set has a value tie or a duplicate set of four cards. Some low-price item questions have distant distractors; their introductory difficulty is appropriate. The review did not find an answer ambiguity from those easy options.

## Patch and source limits

Valve's [published patch list](https://www.dota2.com/datafeed/patchnoteslist?language=english) ended at **7.41f** when retrieved on 2026-10-06. Its patch timestamp is `1789455600`. The four changed spell facts above are also supported by the older 7.41d and 7.41e notes, so they are not assumed to be changes from an unpublished later patch.

The live profile APIs do not include a patch or client-build identifier. The review can establish their values on the retrieval date and the latest published patch at that time. It cannot prove that each response is cryptographically tied to 7.41f.

The pre-existing `/tmp/queue-arcade-live6882` extract has no verified acquisition log. Its stored hashes support repeatable comparisons, but do not establish its origin or that it is a current installed client. The numeric checks now use separately fetched Valve public responses. The original client comparison remains a secondary check.

No Dota 2 match or local hero-demo damage simulation was run. In particular, Fiend's Grip's public data gives a damage field and a 0.5-second tick interval; the per-second interpretation was reviewed with the spell description and Valve's [published tick-change note](https://www.dota2.com/706?l=english). This review does not claim to have measured its runtime ticks. Numeric values, damage components and the other stated conditions were checked against the public profiles and patch notes.

## Changes that preserve the review

- Added `scripts/numeric-question-copy.mjs` for visible conditions and direct primary references.
- Corrected the reviewed damage facts and stale Rubick/Vengeful Spirit overrides.
- Updated the central generator, including canonical hero names, reviewed Spell Link overrides and the voice-quality guards supplied by the other reviewers. The central content version is `7.41f-variety-8`.
- Regenerated only the 80 Order Up records. The shared Classic changes were sent as ID-keyed field patches and applied by the root agent. No full live sync was run.
- Added an independent frozen Valve numeric fixture and exhaustive regression tests. The tests compare stored values to the independently fetched facts, rather than to the generator's own expected values.

## Checks

The initial regression run failed on the missing conditions, stale explanations and source stamps. The corrected suite passes all **425 numeric tests**. Related content, voice-selection and Spell Link override tests also pass. The Order Up validator passes all 80 rounds, including all 24 permutations per round. The normal question validator passes after the four hidden Spell Link sources use the newly fetched Valve ability endpoints.

A separate comparison applied the generator's overrides to the existing cached OpenDota input. All 159 selected cooldown, mana and damage fields, including full progressions, matched the independent Valve data. Generator syntax and formatting checks passed. Public-question tests confirm that the new details reach the player before reveal and that no reveal is exposed early. The root agent owns the browser layout checks and final release manifest.

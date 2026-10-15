# Aghanim's Lab fact review

Reviewed on 2026-10-06 for patch 7.41f.

The review covered all 84 questions and their 84 source upgrade records. It checked the prompt, opening effect, upgrade item and mode, ability name, correct hero, explanation, and staged disclosure. It used fresh Valve hero data, as the factual reference.

The result is 60 verified records without gameplay-text changes and 24 corrected records. There are 21 corrected effect clues and four corrected answer lists; one question is in both groups. No factual claim in the retained questions remains unverified against the cited Valve data. The catalog retains 44 Scepter upgrades, 40 Shard upgrades, 36 new abilities, and 48 existing abilities.

## Evidence

The [ledger](aghanim-ledger.json) contains one entry per question. Each entry records the hero, ability, status, changed text, review note, direct Valve URL, response SHA-256, retrieval date, and fields used as evidence. The exact primary responses are in the shared [Valve API archive](../sources/valve-api-2026-10-06.tar.gz). Its [manifest](../sources/valve-api-manifest.json) records each file hash. The ledger's `valve/heroes/<id>.json` paths refer to `heroes/<id>.json` after extraction. Their acquisition manifest is `heroes/manifest.json` inside that archive.

Valve's retrieved [patch list](https://www.dota2.com/datafeed/patchnoteslist?language=english) ends at 7.41f. The current hero data agrees with relevant 7.41f changes, including Anti-Mage's Mana Break damage conversion and Lifestealer's shorter enemy Infest duration. Within these 84 selected upgrades, the patch changes Lifestealer's enemy Infest duration, from five seconds to four seconds. Its question does not state a duration. Mirana's arrow stun scaling also changed, but that question describes the Starstorm upgrade without a stun number. [Valve patch notes](https://www.dota2.com/datafeed/patchnotes?version=7.41f&language=english), [Anti-Mage](https://www.dota2.com/datafeed/herodata?language=english&hero_id=1), [Lifestealer](https://www.dota2.com/datafeed/herodata?language=english&hero_id=54), [Mirana](https://www.dota2.com/datafeed/herodata?language=english&hero_id=9).

The review also checked the upgrade flags in the retained build 6882 definitions. That older client snapshot is supporting evidence. It does not establish the current description by itself. The fresh Valve responses supply the descriptions and current values used here.

## Corrections

| Hero               | Correction                                                                                                                                        | Primary source                                                                |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| Axe                | The attack-damage reduction applies against the caster, rather than reducing damage against every target.                                         | [Valve](https://www.dota2.com/datafeed/herodata?language=english&hero_id=2)   |
| Crystal Maiden     | The caster disjoints projectiles while sliding. The clone later provides the area disable.                                                        | [Valve](https://www.dota2.com/datafeed/herodata?language=english&hero_id=5)   |
| Drow Ranger        | Replaced the vague claim about high-ground bonuses with flying vision and the ranged-ally attack-range bonus.                                     | [Valve](https://www.dota2.com/datafeed/herodata?language=english&hero_id=6)   |
| Morphling          | The strong illusion requires alt-cast. Toggling again replaces the illusion with the caster.                                                      | [Valve](https://www.dota2.com/datafeed/herodata?language=english&hero_id=10)  |
| Shadow Shaman      | Identified the summoned serpent wards and stated that allied targets are not disabled.                                                            | [Valve](https://www.dota2.com/datafeed/herodata?language=english&hero_id=27)  |
| Tidehunter         | The anchor targets an enemy hero.                                                                                                                 | [Valve](https://www.dota2.com/datafeed/herodata?language=english&hero_id=29)  |
| Enigma             | Removed an unsupported claim that the spawned units are uncontrollable. The verified limitation is that they cannot multiply.                     | [Valve](https://www.dota2.com/datafeed/herodata?language=english&hero_id=33)  |
| Faceless Void      | Identified the return action as a second ability, rather than another cast of the original mobility spell.                                        | [Valve](https://www.dota2.com/datafeed/herodata?language=english&hero_id=41)  |
| Dazzle             | Clarified that the caster attacks each enemy reached by the bouncing spell.                                                                       | [Valve](https://www.dota2.com/datafeed/herodata?language=english&hero_id=50)  |
| Leshrac            | Removed the claim that the caster has no penalty. Ethereal form prevents attacks. The clue now states the different movement effects.             | [Valve](https://www.dota2.com/datafeed/herodata?language=english&hero_id=52)  |
| Enchantress        | Replaced the unclear speed bonus with movement speed and attack speed. Removed the em dashes.                                                     | [Valve](https://www.dota2.com/datafeed/herodata?language=english&hero_id=58)  |
| Huskar             | Stated that the heal happens after a delay.                                                                                                       | [Valve](https://www.dota2.com/datafeed/herodata?language=english&hero_id=59)  |
| Weaver             | Added the 1200 range condition for the secondary attack.                                                                                          | [Valve](https://www.dota2.com/datafeed/herodata?language=english&hero_id=63)  |
| Batrider           | Added the 650 range limit for the second victim.                                                                                                  | [Valve](https://www.dota2.com/datafeed/herodata?language=english&hero_id=65)  |
| Spirit Breaker     | The spell redirects targeted casts from the selected hero. It does not intercept arbitrary spells aimed nearby.                                   | [Valve](https://www.dota2.com/datafeed/herodata?language=english&hero_id=71)  |
| Outworld Destroyer | Replaced the vague lethal-damage threshold with the verified 20% health threshold. The canonical hero-name correction also reaches this question. | [Valve](https://www.dota2.com/datafeed/herodata?language=english&hero_id=76)  |
| Chaos Knight       | The extra-illusion chance applies to copies of the caster, rather than all created illusions.                                                     | [Valve](https://www.dota2.com/datafeed/herodata?language=english&hero_id=81)  |
| Treant Protector   | Added the six-minute expiry. Updated the ability name to match Valve's current label.                                                             | [Valve](https://www.dota2.com/datafeed/herodata?language=english&hero_id=83)  |
| Medusa             | Specified an enemy spell as the trigger.                                                                                                          | [Valve](https://www.dota2.com/datafeed/herodata?language=english&hero_id=94)  |
| Ringmaster         | The beams damage illusions based on maximum health. They do not lower the illusion's maximum health.                                              | [Valve](https://www.dota2.com/datafeed/herodata?language=english&hero_id=131) |
| Largo              | Buff copying requires an allied hero. A copy from a self-cast must remain within the original ability's cast range.                               | [Valve](https://www.dota2.com/datafeed/herodata?language=english&hero_id=155) |

The remaining 63 effect clues received a full source comparison. Their individual findings are in the ledger. The canonical Outworld Destroyer name also replaced the old name in three other questions' fallback answer lists. The full review includes explicit checks of the numeric clues: Anti-Mage's five-second window, Puck's 90% attack rate, Pudge's 50% cooldown reduction, Storm Spirit's three charges, Kunkka's two ships, Tidehunter's four attacks, Faceless Void's 1.5-second return window, Dark Seer's seven-second trail, Omniknight's three-second repeat at 65%, and Meepo's three-second heal for 25% maximum health.

## Answer and clue review

Every upgrade belongs to its named hero in the current Valve roster. All 84 item and mode classifications match the actual upgrade flags. All 84 ability names match the primary localized names.

The final two clues, item and mode plus ability name, were compared with every native ability in all 127 current Valve hero profiles. Each combination has exactly one matching native hero. There were no missing heroes or conflicting correct owners. The effect clue provides the earlier challenge. The later clues resolve the native owner without requiring an ability from another hero to be rejected as equivalent.

The public serializer was exercised for every question at all three stages. Stage one exposes only the effect. Stage two adds the upgrade item and mode. Stage three adds the ability name. Neither answering stage exposes the answer reveal. The generated explanation uses the verified hero, item, action, ability name, and corrected effect.

## Changes and checks

Changed files:

- `src/data/aghanim-upgrades.json`
- `src/data/aghanim-questions.json`
- `scripts/generate-aghanim.mjs`
- `scripts/validate-aghanim.mjs`
- `tests/aghanim-facts.test.mjs`
- `tests/fixtures/aghanim-valve-7.41f.json`

Each source upgrade now records its direct Valve hero URL, response hash, and retrieval date. The generator requires that evidence and carries the per-hero citation into the generated question. The catalog no longer assigns the same moving OpenDota localization URL to every question.

Checks completed:

```sh
node scripts/generate-aghanim.mjs
node scripts/validate-aghanim.mjs --require-client
pnpm exec vitest run tests/aghanim-facts.test.mjs
DOTA_VALVE_HERO_DATA_ROOT="$audit_evidence_root/heroes" pnpm exec vitest run tests/aghanim-facts.test.mjs
```

Generation and the required client check passed for all 84 records. A second generation reproduced the reviewed question bytes. ESLint passed for the changed scripts and tests. All four tests pass without skips in the default CI run. The committed fixture contains the exact identity and upgrade-flag fields for 127 heroes and 285 abilities, plus each response URL, retrieval date, byte count, and full raw SHA-256. It retains only the source fields needed for these checks. The tests cover all 84 hero and upgrade records, corrected conditions, all three public clue stages, actual upgrade flags, and native-owner uniqueness across the full roster. A second run with the raw-cache environment variable also passed. That run rehashes all 127 full responses and compares their selected fields with the fixture. The complete responses remain in the separate audit evidence archive.

## Limits

Valve's hero endpoint does not return a client build ID or accept a historical patch selector. This review records its actual response bytes and the latest published patch at retrieval time. It does not claim that the older build 6882 contains all current descriptions.

This was a source and application-data review. It did not run combat experiments in the Dota client. The opening effects remain concise clues rather than complete ability manuals. The browser layout was not rechecked in this subreview; the existing 10–22-word clue limit and all three serializer stages passed. The wider audit records browser checks, the shared source archive, content version changes, and the final release manifest.

## Saved evidence and repeat checks

The [source comparison](aghanim-source-comparison.json) retains the exact selected ability descriptions, upgrade text, notes, and numeric values from the original 84-row review comparison. It pairs them with the effect and ability name before review and after the corrections. These are selected source fields, not complete hero responses. The [fixture](aghanim-valve-7.41f.json) retains the identity and upgrade flags needed by the tests. The [test source snapshot](aghanim-facts.test.mjs.txt) preserves those checks.

The [focused test log](focused-tests.log) records all 289 combined Shopkeeper and Aghanim tests passing. The run set `DOTA_VALVE_HERO_DATA_ROOT`, so it also verified the byte counts and SHA-256 hashes of all 127 raw hero responses and compared their selected fields with the fixture. The [strict validator log](aghanim-strict-final.log) records all 84 upgrades passing the required client check.

From the repository root, restore the archived primary evidence and repeat the raw-response comparison with:

```sh
audit_evidence_root="$(mktemp -d)"
tar -xzf docs/audits/2026-10-06/deep-review/sources/valve-api-2026-10-06.tar.gz -C "$audit_evidence_root"
DOTA_VALVE_HERO_DATA_ROOT="$audit_evidence_root/heroes" node node_modules/vitest/vitest.mjs run tests/aghanim-facts.test.mjs
```

To repeat the client check, provide the reviewed client extraction through `DOTA_CLIENT_AUDIT_ROOT`, then run:

```sh
node scripts/validate-aghanim.mjs --require-client
```

The earlier generation commands write application data. Use a separate checkout when repeating them. The [archive manifest](archive-manifest.json) records saved evidence hashes and the repository file hashes checked at archive time.

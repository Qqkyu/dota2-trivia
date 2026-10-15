# Completed content review

Reviewed on 2026-10-06. This record covers all 1,517 playable questions and the content changes made after the full factual review. Each current question has a source file, a question hash, a marked answer, and links to its review evidence in the [current index](question-review-index.json). The [checks](question-review-index-checks.json) confirm complete coverage without duplicate or missing IDs. The 72 retired recipe templates remain outside the playable catalog and are explicitly marked as unreviewed.

This is a content review record. Device support, CI, deployment, capacity, and hosting approval belong to separate operational checks. Their outcome does not change the factual scope recorded here.

## Full factual review

The [earlier review](../deep-review/README.md) records the original pass through every prompt, offered answer, marked answer, clue, explanation, and relevant image or audio metadata. Its [1,517-question index](../deep-review/question-review-index.json), seven ledgers, source records, and correction history remain unchanged.

| Review | Questions | Scope and evidence |
| --- | ---: | --- |
| Classic values and Order Up | 422 | [Numeric review](../deep-review/numeric/numeric.md), all stated levels, values, conditions, alternatives, and orders |
| Spell Link and Fogged Vision | 254 | [Identity review](../deep-review/identity/identity.md), hero ownership, current names, descriptions, distractors, and visual identity |
| Quote Hunt and Echo Hunt | 368 | [Voice review](../deep-review/voices/README.md), 245 quotes and 123 voice questions, source transcripts, speaker metadata, clue wording, timing, and collisions |
| Shopkeeper | 102 | [Recipe review](../deep-review/shopkeeper/README.md), quantities, complete selectable alternatives, upgrades, and shared components |
| Soundcheck | 96 | [Sound review](../deep-review/soundcheck/report.md), source events, offered answers, waveform reuse, sequence order, and timing |
| Aghanim Lab | 84 | [Upgrade review](../deep-review/aghanim/README.md), Scepter and Shard facts, effect wording, and answer choices |
| Flashback | 191 | [Historical review](../deep-review/flashback/README.md), dates, names, orderings, explanations, and primary evidence for each scored claim |

These counts include corrected records. They do not mean that every original record was correct. The ledgers distinguish corrections from unchanged facts. All 182 selectable item icons and the Spell Link and Fogged Vision artwork also received the separate visual checks linked in those reports.

The source limits remain explicit. Valve's public profile responses do not include a patch or client-build identifier. The retrieved patch list ended at 7.41f, but this does not cryptographically bind every profile value to that patch. The older build-6882 extract has no verified acquisition history. No Dota match or hero-demo experiment was performed. Historical claims retain the source and inference limits in their individual records.

## Launch content changes

The [launch delta](question-review-delta.json) compares current content with the completed earlier index. Exactly 33 question records changed: one Echo recording and 32 Flashback records with replacement artwork. The other 1,484 question records are byte-equivalent under the documented canonical JSON hash. Every marked answer, answer index, scored year, and scored order is unchanged.

Troll Warlord now uses `hero-voice:npc_dota_hero_troll_warlord:troll_respawn_10` instead of `hero-voice:npc_dota_hero_troll_warlord:troll_kill_06`. Its ID, explanation, and audio URL changed. The [Echo change ledger](echo/echo-change-ledger.json) preserves both source hashes and the ID mapping. The replacement is 12.19 dB louder than the quiet original. Two model sizes transcribed its complete line correctly without hints, and both gameplay prefixes passed the signal checks. The generation guard retains this reviewed selection.

Urn of Shadows and Mjollnir also have changed presentation rules. Both now offer four reviewed answers because another item shares the served sound. Their stored question JSON is unchanged. The current index records these two changes separately. Together with the 33 data changes, they produce 35 changed calibration revisions, which identify the content used for answer statistics.

## Completed automated audio review

All 219 audio questions received the launch checks described below. Earlier references to an outstanding listening pass describe the historical review stage. This record replaces that handoff with the completed automated work and its measured limits.

The [Echo review](echo/README.md) covers all 123 full recordings and their exact 240 ms and 560 ms gameplay prefixes, 369 current stage files. Local speech models received no transcript or hero hints. All selected source mappings and signal checks pass. Full transcripts agree for 106 questions after punctuation and case normalization. Seven more agree under documented spelling or contraction rules. Nine retain partial word disagreements, and Spectre's complete wording remains unresolved by the models. The [per-question ledger](echo/echo-ledger.json) preserves those distinctions. Speaker metadata comes from the pinned source export; speech recognition does not independently prove speaker identity. Bounty Hunter's selected sentence occurs under other heroes as well.

The [Soundcheck review](soundcheck/README.md) covers all 96 questions, 107 selected WAV files, and 114 clip references. It checked current source-event tables and compared available competing sounds. The Urn and Mjollnir corrections resolve the additional measured cue overlaps. All 288 unique gameplay stages passed native Chrome output checks after the recorded repeats. This includes 342 emitted clips and every ordered pair. The archive retains the initial waveform anomaly and transition timeout rather than counting them as initial passes.

Soundcheck captured actual browser output through a separate virtual audio sink and compared it with the served samples. Echo used source decoding, exact server prefix generation, signal measurements, and local speech recognition. Neither method is human listening or a physical-speaker test. They do not establish subjective clue difficulty. The Soundcheck inventory includes unavailable alternate assets and inferred item-event associations, which are listed as limits. No selected audio asset was unavailable. No claim is made about every cosmetic variant or the complete live Dota sound mix.

## Artwork and rights changes

The [rights review](rights/README.md) records 47 image-field replacements across 32 Flashback questions. Thirteen original SVG graphics replace venue photos, winner photos or logos, and ordering-card images. All 13 graphics decoded in Chromium and received visual inspection. Prompts, factual explanations, answer keys, dates, card text, and reveal captions are unchanged. Winner cards remain hidden until reveal. The [replacement checks](rights/replacement-checks.json) confirm these facts and the new asset hashes.

The 23 removed local assets are preserved outside the public directory and excluded from Git additions and the Docker build context. The audit retains their [provenance](rights/photo-provenance.md) and [quarantine manifest](rights/quarantine-manifest.json), not copies for publication. No Flashback team-logo reference remains.

The [published Valve terms](rights/valve-terms.md) and [font review](rights/fonts.md) state the remaining rights evidence. Noncommercial fan-art terms provide a possible basis, but do not name browser trivia applications. Video and streaming policies do not grant permission to distribute individual game assets. The app retains Valve artwork and audio; this review does not claim blanket redistribution permission or legal clearance. No permission was inferred from a credit, remote URL, MIT metadata license, or lack of a reply.

## Repeat the content coverage check

Run from the repository root:

```sh
node --input-type=module < docs/audits/2026-10-06/launch-checks/build-content-review-index.mjs.txt
```

The default command only reads files. It verifies the historical ledger hashes, every current question, the exact 33 data changes, both presentation changes, all 47 artwork replacements, and all 13 new artwork files. It also checks the 123 final Echo question hashes and the 96 Soundcheck stage results. A changed input or unexpected record fails the check. Per-domain reports contain the source and media replay instructions.

The [index check record](question-review-index-checks.json) binds the index and delta with SHA-256. Each index row points to its earlier review and any launch evidence. The index also binds the six catalogs, presentation helpers, reports, ledgers, and replacement graphics. Hashes detect later changes; they do not establish source authority. The release manifest is recorded separately after the complete set of release inputs is frozen.

Five [negative checks](question-review-negative-checks.json) passed in an isolated temporary copy. The checker rejected a changed marked answer, an unreviewed prompt, a missing historical ledger, changed artwork, and a changed saved index. The restored copy passed again. The [test helper](check-content-review-failures.mjs.txt) leaves application files and the earlier archive untouched.

Review complete. One confirmed issue (an evidence-archive gap, not a wrong answer), a handful of unverifiable flashback claims, and no new wrong answers, leaked answers, or duplicate distractors found.

## Confirmed findings

**1. Evidence gap for five abilitydata-sourced numbers (Medium, process not gameplay)**
- IDs: `cooldown:spectre_reality:1`, `mana:spectre_reality:1`, `mana:monkey_king_primal_spring:1`, `damage:monkey_king_primal_spring:4`, `damage:visage_stone_form_self_cast:3`
- Field: `source.url` points at abilitydata ids 5338, 5724, 7116. The numeric ledger cites those files with SHA256 hashes, but `/tmp/queue-arcade-deep-review/valve/` holds only `abilitydata-5337.json` (Haunt), `abilitydata-5725.json` (Wukong's Command) and `abilitydata-8140.json` (empty abilities array). The herodata files for Spectre (67), Monkey King (114) and Visage (92) do not carry these sub-ability values.
- Consequence: the values cannot be independently confirmed from the archive. They are not shown to be wrong.
- Fix: add the three abilitydata snapshots to the archive, or re-point the ledger hashes at files that exist.

**2. Soundcheck and Echo Hunt remain unlistened** (known gap, not repeated as a finding). All 96 Soundcheck event names match the stated subject ability or item. Casing such as "Scream Of Pain" matches Valve's own name_loc.

## Challenged and cleared

- **Shopkeeper recipes**: Skull Basher, Drum of Endurance, Mekansm, Yasha, Orb of Corrosion, Manta Style, Spirit Vessel, Harpoon, Abyssal Blade and Boots of Bearing all match `valve/itemlist.json` recipe item lists exactly. "Orb of Blight" is Valve's current name_loc for `item_blight_stone`, so that label is correct.
- **Aghanim spot-checks**: Earthshaker Fissure shard, Mirana Sacred Arrow scepter, Lifestealer Infest scepter and Treant Eyes In The Forest shard (360-second duration, granted_by_shard flag set) match Valve loc text. Treant's data still carries a stale Living Armor shard_loc string, but `ability_has_shard` is false there, so the question is right.
- **Fogged-hero**: all 127 now read. Every correctIndex matches the explanation and image, no duplicate options.
- **Flashback**: all 191 ids, prompts, explanations, correct years and answer lists read. Every year question includes its correct year. Order-round card contexts contain no dates and are reveal-only. Patch dates for 7.38 and 7.40 match `patchlist.json` timestamps (18 Feb 2025, 15 Dec 2025).

## Uncertain, not verifiable from local sources

- `flashback:flying-courier-gone` explanation claims the Flying Courier upgrade left the shop in 7.07. If it actually remained until 7.23, "Flying Courier" becomes a second defensible answer. Confirm against the 7.07 and 7.23 notes.
- `flashback:shrines-700` explanation says 7.24 removed the remaining Shrines. Confirm the patch number.
- `flashback:refresher-shard` claims a 7.41 change to item cooldowns; no Refresher Shard record exists in the local item snapshots.
- `flashback:odpixel-fogged`, `flashback:longest-pro-game`, `flashback:ti2-year` ("The Play" bracket stage) rest on esports history with no local evidence.

## Coverage

| Area | Status |
|---|---|
| cooldown, ability-damage, mana-cost, stat-duel, move-speed, item-cost, price-duel | Fully verified against Valve snapshots except the 5 abilitydata items above |
| spell-owner, hero-quote, hero-voice, fogged-hero | Fully read |
| value-order, shopkeeper, aghanim | Fully read via field extracts; recipes and 4 aghanim effects verified |
| soundcheck | Fields and answers fully read; no listening |
| flashback | Fully read; historical claims not source-verified |

Not exhaustive certification. No new confirmed wrong answer, leaked answer, or ambiguous option set was found.

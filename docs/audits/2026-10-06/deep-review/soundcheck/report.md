# Soundcheck content and audio review

Reviewed on 2026-10-06. The review covers all 96 questions, all 384 declared choice labels, all 114 clip references, 107 distinct WAV files, and 48 referenced event files. The complete result for each question is in [soundcheck-ledger.json](soundcheck-ledger.json).

## Findings and fixes

1. **Blink Dagger had valid wrong answers.** The Blink Dagger, Arcane Blink, Swift Blink, and Overwhelming Blink events all use `sounds/weapons/hero/antimage/blink_out.vsnd`. The upgrades add separate sound layers. The app played only the shared base WAV but offered all four items in its shop. The question now offers its four reviewed choices. The source fixture proves the shared file independently of the question generator. [Valve item sound events mirrored by Dotabase](https://dotabase.dillerm.io/vpk/soundevents/game_sounds_items.vsndevts).

2. **Diffusal Blade also had a valid wrong answer.** `DOTA_Item.DiffusalBlade.Activate` and `Item.Disperser.Cast` use the same `item_diffusalblade.vsnd`. The Diffusal question now uses its reviewed four choices. The Disperser sequence keeps its distinct ally-target cue. [Item sound events](https://dotabase.dillerm.io/vpk/soundevents/game_sounds_items.vsndevts).

3. **Muerta's same-hero choices included another owner of the same base WAV.** Dead Shot, Parting Shot, and Spectral Blast use `deadshot_cast.vsnd`. Their in-game event pitch can differ, but this app serves the unmodified base WAV. The Spectral Slug distractor is now Gunslinger. Current Valve behavior identifies Gunslinger as an active ability, and the NPC record specifies a toggle. [Muerta sound events](https://dotabase.dillerm.io/vpk/soundevents/game_sounds_heroes/game_sounds_muerta.vsndevts), [Valve Muerta data](https://www.dota2.com/datafeed/herodata?language=english&hero_id=138).

4. **Kez's Echo Slash question offered an identical cue as wrong.** `EchoSlash.Katana.Start` and `FalconRush.Sai.Target` use the same `echo_katana_cast.vsnd`, pitch, and duration. Talon Toss replaces Falcon Rush in the four choices. [Kez sound events](https://dotabase.dillerm.io/vpk/soundevents/game_sounds_heroes/game_sounds_kez.vsndevts), [Valve Kez data](https://www.dota2.com/datafeed/herodata?language=english&hero_id=145).

5. **Reincarnation's first two previews were silent.** The original WAV has about 587 ms of leading silence. Both the 120 ms and 270 ms cuts had zero sample energy. A trusted `startSeconds: 0.6` now removes that prefix. The server applies it to all answering stages, reveal ranges, and prewarming. Cache keys include the offset. The source file and its SHA-256 fingerprint stay unchanged. Public metadata reports the resulting 5.583356-second playback duration. The generator now rejects a source whose progressive previews are silent. [Reincarnation sound events](https://dotabase.dillerm.io/vpk/soundevents/game_sounds_heroes/game_sounds_skeletonking.vsndevts).

6. **Eul's had an unresolved upgrade ambiguity.** Eul's and Wind Waker use Cyclone, and the item event file exposes one Cyclone cue. The available files do not expose Wind Waker's runtime call site. As a precaution, Eul's now uses its existing reviewed four choices, which exclude Wind Waker. This is an inference, not a confirmed runtime mapping. [Item sound events](https://dotabase.dillerm.io/vpk/soundevents/game_sounds_items.vsndevts), [Valve item names](https://www.dota2.com/datafeed/itemlist?language=english).

7. **Item copy was too specific.** The Silver Edge clip is a target effect, and other item sounds can be triggered effects. All single-item rounds now say "Item sound" and "gameplay sound" instead of claiming each clip is an activation. Prompts and explanations match the selected identity and sequence order.

The earlier Force Staff and Hurricane Pike fix remains in place. The reviewed-choice rules also prevent later generation from restoring the confirmed shared-cue distractors.

## Full-deck checks

- All 114 selected events exist in the local extract. Their selected WAV paths and durations match the current Dotabase mirror. Whole-file hashes differ; selected event metadata does not.
- All 107 downloaded WAV files decode. Their SHA-256 fingerprints match the stored deck fingerprints. Each decoded source duration matches its metadata within 20 ms.
- No two distinct selected WAVs have identical full decoded PCM or identical first/second preview PCM. Seven repeated clip references use the same subject in another question or ordered pair.
- All 114 references now have non-silent first and second previews. Reincarnation's measured RMS values changed from zero to 0.05255 and 0.14979. RMS measures sample energy; it does not prove that a listener can identify a short cue.
- The real Reincarnation WAV was cut with both ffmpeg and the PCM fast path. The decoded sample bytes agree for all three stages. [reincarnation-waveform.json](reincarnation-waveform.json) records the results.
- All 384 declared choice labels match Valve's current ability and item lists. Same-hero requirements and active-behavior requirements pass against NPC data. All 18 ordered pairs have the correct first and second subject and distinct choices. [Valve ability names](https://www.dota2.com/datafeed/abilitylist?language=english), [Valve item names](https://www.dota2.com/datafeed/itemlist?language=english).
- Cross-event scans include source reuse outside the selected deck. Refresher versus Ex Machina, Midas versus Philosopher's Stone, and Soul Ring versus Flayer's Wineskin do not compete in the shop. Lion versus Nyx Impale, Void Spirit versus Brewmaster, and item cues reused by hero abilities do not compete in their reviewed answer scopes.
- Generation was repeated with the fetched event and WAV cache. All 96 results agree with the final deck after normalization of existing local icon paths. The application data file was not regenerated over those existing overrides.

## Repeatable checks and evidence

The new tests are `tests/soundcheck-facts.test.mjs` and `tests/round-audio-offset.test.mjs`. The former uses independent excerpts from Valve event data and official name snapshots. The latter executes the actual audio route with controlled clocks and WAV samples. It checks every stage, ignored caller offset/stage inputs, reveal byte ranges, prewarming, invalid trusted offsets, cache separation, and unchanged final Echo audio. `tests/cut-round-audio.test.mjs` also checks real ffmpeg output after a silent prefix.

Run from the repository root:

```sh
pnpm exec vitest run tests/soundcheck-facts.test.mjs tests/round-audio-offset.test.mjs tests/cut-round-audio.test.mjs tests/content-answers.test.mjs tests/media-work.test.mjs tests/question-revision-content.test.mjs
node scripts/validate-soundcheck.mjs
node scripts/validate-audio-preload.mjs
```

The [source manifest](source-assets-manifest.json) records the exact upstream URLs and SHA-256 hashes for all 155 fetched inputs. The [waveform measurements](soundcheck-waveforms.json), [Reincarnation check](reincarnation-waveform.json), and [question ledger](soundcheck-ledger.json) contain the measured results. The [generation result](generation-check.json) links the generated copy and empty difference list.

The compact [event excerpts](source-event-excerpts.json) and [official name records](source-official-names.json) also remain in the repository test fixtures. The archive does not contain the 107 WAV files, decoded PCM, or raw client files. Binary assets can be fetched again from the manifest URLs and checked against their hashes. A changed upstream hash requires another source review.

The three `.mjs.txt` files preserve the original fetch, ledger, and cached-generation checks. They retain audit-machine cache paths and need those inputs restored before execution. The commands above run the permanent regressions from the repository root without those temporary inputs.

## Limits

No human listening or in-client playback was performed. Source names, event mappings, actual sample data, and game metadata were checked. Of the 114 clip references, 32 match an NPC `AbilitySound` property directly. Other clips are named ability components, target effects, or item events whose runtime call sites are not present in these data files.

The local extract identifies itself as build 6882, but this review did not establish its original installation provenance. The current Dotabase mirror independently confirms every selected event path and duration. That does not prove every event still fires in every live game context, cosmetic variant, or patch.

The answer choices and the Reincarnation offset change question calibration identities. The recipe-cost clue also changes calibration when it changes. `tests/question-revision-content.test.mjs` checks those changes and confirms that source-only reviews retain calibration. Release-manifest status and deployment status belong to the parent audit report.

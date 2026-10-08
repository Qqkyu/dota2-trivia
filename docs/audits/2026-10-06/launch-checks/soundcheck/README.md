# Soundcheck launch checks

All 96 questions pass the automated checks in this pass. This covers 114 clip references, 107 selected WAV files, 288 browser stage cases, and 342 emitted clips. The [question ledger](question-ledger.json) records each result. No human listening or Dota client playback is claimed.

Two additional answer ambiguities were fixed. The previous [deep review](../../deep-review/soundcheck/report.md) remains unchanged.

## Fixes

- Urn of Shadows now uses its four reviewed choices. Essence Distiller's 1.11-second cast cue matches the tail of Urn's sound at an offset of 0.891 seconds. Their aligned waveform correlation is 0.9909. The source tables give them distinct event names, so a filename equality check did not detect this reuse.
- Mjollnir also uses its four reviewed choices. Its first 120 milliseconds match Maelstrom's chain-jump cue with a correlation of 0.9951. The first clue previously offered Maelstrom as a wrong answer in the full shop.

The correct answers, original files, stored hashes, and timing are unchanged. The reviewed choices exclude those competing identities at every stage. Independent PCM excerpts and regressions are in `tests/fixtures/soundcheck-near-duplicate-cues.json` and `tests/soundcheck-facts.test.mjs`. The presentation change also changes the affected calibration identities through the existing revision helper.

The [event excerpts](source-event-excerpts.json) contain the exact source definitions and hashes. The sound files come from [Urn](https://dotabase.dillerm.io/vpk/sounds/items/urn_of_shadows.wav), [Essence Distiller](https://dotabase.dillerm.io/vpk/sounds/items/item_distiller_cast.wav), [Mjollnir](https://dotabase.dillerm.io/vpk/sounds/items/item_mjoll_on.wav), and [Maelstrom](https://dotabase.dillerm.io/vpk/sounds/items/item_mael_lightning_chain.wav).

## Source and waveform checks

The pass fetched 130 current sound-event tables from the Dotabase mirror. They contain 3,568 event definitions. All 114 selected definitions still match the earlier extract, including their files, duration, pitch, volume, and layers. Each selected event names its selected WAV, and all selected asset hashes match the deck. The mirror is an independent delivery source for Valve data; it does not prove the provenance of the old local build label. See [the current comparison](current-event-comparison.json) and [source inventory](source-inventory.json).

The comparison inventory covers all 152 ability subjects offered in the deck and all 182 shop items. It includes named cast, target, loop, random-variant, and layer files. The fetch tried 674 distinct WAV URLs. Of these, 643 decoded; 31 unavailable variant files returned non-audio responses. All 107 selected files were available. The [asset manifest](source-assets.json) records every URL, hash, ownership inference, and failed response.

The final pass ran 4,646 complete-waveform comparisons against available competing cues. It also compared both short stage outputs against competing cue starts. It found no further matches above the declared thresholds. A further 400 speed comparisons covered the 50 closest pairs at eight non-unit speed ratios. They found no further matches. Positive controls detected attenuated, embedded, and pitch-shifted copies. The [comparison results](perceptual-comparison.json) and [pitch results](pitch-comparison.json) retain the methods, thresholds, and coverage.

The analysis uses spectral fingerprints to rank candidates and normalized waveform correlation to detect reuse. It tests all available full-waveform candidates; ranking does not exclude them. Full-cue correlation above 0.95 and short-preview correlation above 0.98 trigger review. These are measured similarity tests, not a model of human recognition. SciPy documents the [correlation operation](https://docs.scipy.org/doc/scipy/reference/generated/scipy.signal.correlate.html) and [polyphase resampling](https://docs.scipy.org/doc/scipy/reference/generated/scipy.signal.resample_poly.html).

Source levels span -23.04 to -7.60 dBFS RMS. Nineteen selected files already contain enough full-scale samples to trigger the clipping review threshold. Those samples are present in the upstream files. The app did not add full-scale clipping in the native output checks. The maximum recorded output peak was 0.7537 at the default 70% volume. No selected preview was silent. The [source metrics](audio-metrics.json) preserve the measured values.

Layered events remain recognizable source components, not reconstructions of the entire in-game mix. Four selected references declare another event layer. Axe's and Scythe's nominal pitches differ from 1 by 0.025, with declared random variation of 0.025. The app intentionally uses the stable original WAV. The current wording says "gameplay sound" and does not promise the full layered mix or one exact random pitch.

## Native browser playback

The actual `round-audio` GET handler generated each stage response with a controlled clock and the verified source buffers. Those response bodies were supplied to the real app's audio requests. Chrome played them through its native media decoder into a separate PulseAudio null sink. The recorder captured the final stereo output. A wrapper logged `play()` calls and returned the original native promise. It did not route sound through Web Audio, enable an autoplay exemption, or use speakers. A trusted click unlocked the first playback. All API traffic used disposable fixtures, and no votes or rooms were written.

The local app was `http://127.0.0.1:3330`, build `IqM7S-izzhLw1FS90-lLJ`. The route output hashes are in [the output manifest](route-output-manifest.json). The browser used the baseline compiled client. The two later choice restrictions do not change these audio bytes and were checked by the public-question regressions.

All 288 unique stage cases passed after the repeats described below. Each expected clip played once, ended, matched on both output channels, and kept the correct sequence order. The comparison requires correlation above 0.98, fitted gain within 10% of the expected gain, and unexplained output energy below 4%. The lowest final correlation was 0.9845; the largest residual was 2.77%. All 18 ordered pairs passed every stage. Reincarnation passed all three stages with the reviewed offset. See [native verification](native-verification.json) and [browser observations](browser-observations.json).

The check also rejected two deliberately broken native playbacks. A muted clip and an extra delayed copy both resolved their play promises, but failed the recorded waveform criteria. [Negative controls](native-controls.json).

There were two initial anomalies. One Mask of Madness stage-two recording had a 28 ms timing discontinuity; sections before and after it still matched the expected samples. One transition into Tango's ordered pair timed out. The capture did not retain enough information to assign the timeout to an app or host cause. A fresh run completed it. Both affected transitions then passed two more repeats. There were 307 recorded attempts, with one initial waveform failure, plus the initial timeout. The [first failure](native-initial-outlier.json), [segment timings](native-outlier-segments.json), and [repeat results](native-repeat-verification.json) remain in the archive. No reproducible defect remained in those checks.

## Coverage limits

The source tables establish the selected event-to-file mappings. Thirty-two selected references also match a hero NPC `AbilitySound` directly. The others are named components or item effects. Some item-to-event associations are inferred from names; the table files do not expose their runtime call sites. Ninety-five shop items have no attributed event in this inventory, including eight active items. Most of the remainder are passive items or components. Unavailable cosmetic and alternate files are also listed. These gaps are not counted as successful waveform comparisons.

No installed Dota client was found in the targeted local Steam locations. This pass therefore does not certify every live patch, cosmetic variant, or engine call site. It checks the available source definitions, original audio, served stage samples, competing available cues, and actual app playback. It does not replace a human judgment about the difficulty of a 120 ms clue.

## Repeat the checks

From the repository root:

```sh
pnpm exec vitest run tests/soundcheck-facts.test.mjs tests/content-answers.test.mjs tests/question-revision-content.test.mjs
node scripts/validate-soundcheck.mjs
```

The focused run passed 24 tests. Content validation passed all 96 questions and 114 three-stage profiles. The changed source and regression files passed Prettier.

The `.mjs.txt` and `.py.txt` files preserve the audit helpers. They retain the audit-machine paths under `/tmp/queue-arcade-launch-checks/soundcheck`, `/tmp/queue-arcade-live6882`, and `/home/kulmisiu/dev/dota2-trivia`. Restore the listed inputs and adjust those paths before a full rerun. The checks used Google Chrome 121.0.6167.160, Node 24.15.0, Python 3.10.12, NumPy 2.2.6, and SciPy 1.15.3. `prepare-playback.mjs.txt` generates the route bodies, `browser-playback.mjs.txt` records the real client, and `verify-native.py.txt` evaluates every attempt. The binary WAV corpus and native PCM recordings stay outside the repository; this archive retains their hashes and measurements. A changed upstream hash needs a new source review.

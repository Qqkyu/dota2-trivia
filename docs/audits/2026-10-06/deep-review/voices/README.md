# Quote Hunt and Echo Hunt full review

Reviewed all 245 Quote Hunt records and all 123 Echo Hunt records on 2026-10-06. I read every prompt, displayed line, identity clue, and explanation. Six response choices needed replacement. The root agent applied those replacements and corrected Outworld Destroyer's name in another 15 records. The final ledger contains 347 unchanged verified records and 21 fixed records.

Here, verified means the text, source attribution, identity metadata, and measured behavior passed the checks below. It does not mean I listened to the voice. Audio input is unsupported in this session; the audio tool returned `audio content omitted because you do not support audio input`. All 123 Echo listening checks remain explicitly unverified in the ledger.

## Sources and coverage

I downloaded Dotabase's complete response directory and hero metadata at commit `7ec2f5a91d21f52aae5a37bf12caa3c057fdbffa`. The download contained 226 response files, 91,246 response records, and one hero metadata file. All 227 downloads succeeded. Each file has a recorded URL, byte count, and SHA-256 hash in [voices-upstream-manifest.json](voices-upstream-manifest.json). The archive includes the source manifest and selected evidence. It excludes the full downloaded corpus and all binary audio files. The replay steps below restore the recorded inputs and verify their hashes.

For each selected record, I joined the response name and `hero_id` with Dotabase's hero key and Valve's current hero ID. Every ID matched. All 368 final transcripts match their Dotabase source after whitespace normalization. Every Echo URL matches the source record's MP3 path. Correct answer artwork also identifies the same hero. The sources for each row are in `voices-ledger.json` and [voices-selected-source-records.json](voices-selected-source-records.json).

The current [Valve hero list](https://www.dota2.com/datafeed/herolist?language=english) has 127 heroes. All 245 Quote Hunt attribute hints match it. The client build 6882 `npc_heroes.txt` supports every attack-type and role hint. The ledger records that file's hash and the relevant fields. All 245 public question serializers show no identity hint before five seconds, the attribute at five seconds, and the attack type and role at ten seconds in a 15-second round.

I checked source spelling, speaker identity, HTML and entity leakage, obvious placeholder text, names that give away the answer, repeated lines, and near-duplicates. The final 245 text quotes have no cross-hero text collision in the 91,246-response source snapshot. Dialogue dialect and source punctuation were retained when they do not change the answer. Invoker persona lines and Crystal Maiden's Blueheart loadout line remain attributed to their source hero IDs.

## Corrections

The proposal file [voices-question-patches.json](voices-question-patches.json) is keyed by original question ID. It includes expected old fields, exact replacements, and evidence. All six proposals are now applied.

| Original response                      | Defect                                                                                                    | Applied replacement                                          |
| -------------------------------------- | --------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| Lich quote `lich_kill_06`              | Disruptor also speaks the exact same sentence as `dis_kill_04`; the text-only answer was ambiguous.       | `lich_rare_02`                                               |
| Sniper quote `snip_kill_12`            | Ten repetitions of "Hee" supplied no meaningful text clue.                                                | `snip_rare_04`                                               |
| Techies quote `tech_firstblood_03`     | Nearly the same exchange as retained `tech_firstblood_01`; only a vocalization and a short ending differ. | `tech_levelup_09`                                            |
| Timbersaw Echo `timb_attack_03`        | One word repeated seven times failed the intended substantial-spoken-line rule.                           | `timb_respawn_02`                                            |
| Jakiro Echo `jak_kill_06`              | Its first 240 ms has only -88.78 dB RMS. The first clue contains negligible signal.                       | `jak_kill_11`, first-clue RMS -34.43 dB                      |
| Ancient Apparition Echo `appa_kill_06` | Its first 240 ms has only -77.68 dB RMS. The first clue contains negligible signal.                       | `appa_blink_02`, first-clue RMS -42.10 dB and peak -20.01 dB |

The [Lich response source](https://raw.githubusercontent.com/mdiller/dotabase/7ec2f5a91d21f52aae5a37bf12caa3c057fdbffa/json/responses/lich.json) and [Disruptor response source](https://raw.githubusercontent.com/mdiller/dotabase/7ec2f5a91d21f52aae5a37bf12caa3c057fdbffa/json/responses/disruptor.json) establish the ambiguous quote. Each replacement's exact source row is saved in [voices-replacement-evidence.json](voices-replacement-evidence.json). Evidence for the rejected choices is in [voices-finding-source-records.json](voices-finding-source-records.json).

Valve currently names `npc_dota_hero_obsidian_destroyer` Outworld Destroyer. The root agent corrected the old name in three correct-answer records and twelve records where the hero was a distractor. Its internal key, ID, and artwork remain correct.

## Audio checks

All 123 original Echo MP3s downloaded and decoded successfully. Their source hashes are distinct. Their durations range from 1.557 to 6.217 seconds, so each full line fits the final seven-second clue window. I decoded every file to PCM and measured both actual early clue prefixes using the app's duration rules. No prefix is digital silence, but the two low-energy openings above required replacement. A nonzero peak alone was not treated as evidence of a useful clue.

I also downloaded and decoded all three applied Echo replacements. Their durations are 3.125 seconds for Timbersaw, 4.039 seconds for Jakiro, and 3.430 seconds for Ancient Apparition. Both early prefixes contain measurable signal. The Ancient Apparition choice followed probes of 43 eligible alternatives because many of that hero's clips have long, quiet openings.

[voices-audio-checks.json](voices-audio-checks.json) records the original file checks. [voices-prefix-checks.json](voices-prefix-checks.json) records source hashes, onset, duration, peak, and RMS for all 123 originals. Replacement measurements are in [voices-replacement-audio-check.json](voices-replacement-audio-check.json), [voices-low-prefix-replacements.json](voices-low-prefix-replacements.json), and [voices-aa-candidate-probes.json](voices-aa-candidate-probes.json).

Bounty Hunter's Echo text also occurs in other heroes' responses. That alone is not an error in an audio-identification round. Its source record, hero ID, MP3 path, and unique downloaded hash match Bounty Hunter. A listener still needs to verify the actual rendered voice, as with the other Echo records.

## Regression checks and generation

Added `scripts/hero-response-quality.mjs` and four focused regression tests. The helper rejects laugh-only and repeated-word-only choices, detects near-duplicate lines, checks text ownership across the downloaded response pool, and excludes all six rejected choices from their relevant game modes.

Updated `scripts/validate-hero-responses.mjs` to enforce meaningful lines and near-duplicate checks. Its previous `for (const [heroKey] of expectedSpeakingKeys)` loop took the first character of each hero-key string. That prevented its per-hero comparison from running against the intended hero. The loop now uses the complete key.

The content agent applied the coordinated generator patch to `scripts/sync-dota-data.mjs`. It builds ownership from all downloaded source responses, filters ambiguous quotes, excludes reviewed bad choices, and skips nearly identical variants when selecting lines. Future newly selected audio still requires an opening-energy review; the current exclusions cover the reviewed defects.

Checks passed:

- `pnpm exec vitest run tests/hero-response-quality.test.mjs`: four tests passed, each added after a failing case.
- `node scripts/validate-hero-responses.mjs`: 123 Echo records and 245 quotes passed after all replacements and name corrections.
- Focused ESLint and `git diff --check`: passed.
- `check-voices.py src/data/questions.generated.json`: all 368 final source comparisons passed against 91,246 response records.
- Public answering and reveal serialization: all six replacements passed; Quote Hunt exposes the new text and Echo uses the protected audio route. No answer reveal appeared during answering. Evidence is in [voices-public-flow-checks.json](voices-public-flow-checks.json).

Two late Dark Seer clue pairs identify a single hero, because the client lists only one melee Intelligence hero. Two Huskar clue pairs narrow to two heroes. These hints are factual; they are a difficulty consideration for later player testing.

## Ledger and limits

[The complete ledger](voices-ledger.json) contains one record for every original question ID, its current ID, verification status, current content hash, source records, checks, and notes. Each Echo record separately marks audio listening as unverified. This folder contains the ledger, selected source records, source manifest, findings, proposals, and measured results. Original `/tmp` paths in the JSON identify the review workspace; they are historical provenance, not paths needed by the replay commands.

The source metadata supports transcript and speaker attribution. Decoding and waveform measurements support format, duration, and prefix signal. Neither proves intelligibility, actor identity, or subjective difficulty by listening. I did not use an external speech-recognition service, and no local speech-recognition model is installed. A human listening pass remains necessary to claim that coverage.

## Replay the checks

Run these commands from the repository root. They require Python 3.9 or later and `ffmpeg`. Restoring missing inputs requires network access. The helpers are saved as `.py.txt` audit artifacts and can be executed with Python.

```sh
voices_audit_dir=docs/audits/2026-10-06/deep-review/voices
python3 "$voices_audit_dir/restore-inputs.py.txt" sources --output-dir /tmp/queue-arcade-voices-sources
python3 "$voices_audit_dir/check-voices.py.txt" src/data/questions.generated.json --source-root /tmp/queue-arcade-voices-sources --output-dir /tmp/queue-arcade-voices-replay
python3 "$voices_audit_dir/restore-inputs.py.txt" audio --output-dir /tmp/queue-arcade-voices-audio
python3 "$voices_audit_dir/check-echo-prefixes.py.txt" --audio-root /tmp/queue-arcade-voices-audio --output-dir /tmp/queue-arcade-voices-replay
```

The source check compares the current application catalog with the pinned Dotabase source snapshot. It rejects a missing or changed source input and writes new results outside this archive. The prefix check replays the final 123 Echo choices recorded in the ledger. It rejects a changed audio input and a prefix below -60 dB RMS. These measurements do not establish intelligibility or speaker identity by listening.

The restore helper reuses an existing file only when its SHA-256 matches. A missing upstream file or changed audio bytes stops the replay. The saved results remain the record of the 2026-10-06 review; do not replace them with a later run. `archive-manifest.json` records the hashes of the files in this folder.

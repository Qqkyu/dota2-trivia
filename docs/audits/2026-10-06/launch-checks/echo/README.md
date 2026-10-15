# Echo audio review

Reviewed all 123 Echo questions on 2026-10-06. The local checks covered each full line and both exact gameplay prefixes, 369 files in total. One unusually quiet Troll Warlord line was replaced. All final source mappings and signal checks pass.

Speech recognition agrees with 106 full transcripts after case and punctuation normalization. Another seven agree after the documented spelling, spacing, dialect, and contraction rules. Nine have partial word disagreements. Spectre's full wording remains unresolved by the models. The [final ledger](echo-ledger.json) records a separate result for every question.

This was an automated audio review. No human listening, actor identification model, physical-speaker test, or subjective difficulty test was performed. The models received no expected transcript, hero name, or vocabulary hint. Audio was processed locally and was not uploaded to a speech service.

## Inputs and tools

The current audio route serves MP3 prefixes of 240 ms and 560 ms, then the complete line. Its fallback duration for these MP3 files is four seconds. The two prefixes were generated with the application's `cutAudioWithFfmpeg` helper. This checks the actual encoded files used by the game, including encoder behavior. The [final input manifest](inputs-final.json) records every source URL, source hash, encoded-stage hash, expected transcript, and relevant repository file hash. [The baseline manifest](inputs-before.json) preserves the prior Troll choice.

The source comparison used the pinned Dotabase commit `7ec2f5a91d21f52aae5a37bf12caa3c057fdbffa`. It rehashed all 226 response files and compared 91,246 records. The [final source check](final-source-checks.json) confirms every selected response name, hero ID, voice ID, transcript, MP3 path, and source-file hash. Response text and identity metadata come from this upstream export. The MP3 files contain the game audio distributed by Dotabase.

[faster-whisper](https://github.com/SYSTRAN/faster-whisper) 1.2.1 ran on the CPU with int8 computation. The [small English model](https://huggingface.co/Systran/faster-whisper-small.en), [medium English model](https://huggingface.co/Systran/faster-whisper-medium.en), and [large-v3 model](https://huggingface.co/Systran/faster-whisper-large-v3) are the publisher's CTranslate2 conversions. Exact model revisions and file hashes are in [model-manifests.json](model-manifests.json). The [package list](asr-requirements.txt) and [ffmpeg version](ffmpeg-version.txt) record the local environment. Model weights and binary audio are excluded from this archive.

Every recognition run used English, beam size 5, temperature 0, no voice-activity filtering, no initial prompt, and no previous-file text. The small model covered all 369 baseline stage files. The medium model rechecked all 26 nonmatching full lines. The large model checked the remaining 11 lines after ordinary text equivalences. Two Troll alternatives were checked at all three stages by both English models. Four uncertain voices received 17 diagnostic filter, speed, pitch, or reversal variants. Those variants were used only for diagnosis; they did not change gameplay audio.

## Applied correction

The old Troll Warlord clip was 13.18 dB below the original catalog's median integrated loudness. Fifteen pinned alternatives were measured. The selected replacement is 12.19 dB louder than the old line and remains below full scale.

| Check                 | Old `troll_kill_06`         | New `troll_respawn_10`            |
| --------------------- | --------------------------- | --------------------------------- |
| Transcript            | You were a casualty of war. | Being dead only makes me angrier. |
| Integrated loudness   | -29.96 LUFS                 | -17.77 LUFS                       |
| True peak             | -10.70 dBFS                 | -1.39 dBFS                        |
| Full-line recognition | Small model matched         | Small and medium models matched   |
| First-prefix RMS      | -29.9 dBFS                  | -18.82 dBFS                       |
| Second-prefix RMS     | -28.0 dBFS                  | -19.75 dBFS                       |

The replacement lasts 3.918375 seconds after decoding and fits the final seven-second window. Both prefixes contain signal and have no near-full-scale samples. Its source hero ID and voice ID are both 95. Its complete text has no match under another hero in the pinned corpus. Its audio and each decoded prefix are distinct from the other final selections.

Only the question ID, explanation, and audio URL changed in `questions.generated.json`. The [change ledger](echo-change-ledger.json) records the old and new IDs, source hashes, and current question hash. The generator now retains `troll_respawn_10` for Troll's Echo selection and rejects the old quiet clip. Quote selection is unchanged. A [pinned test fixture](candidates/echo-troll-reviewed.json) binds the selected question to its reviewed source.

Six focused tests, the hero-response validator, and focused ESLint passed. The new guard test first failed against the old code, then passed. [The public-flow check](troll-public-flow.json) confirmed all three answering stages still use protected audio without the source URL or transcript reveal, and that the answer stage shows the new explanation. The earlier deep-review archive remains unchanged.

## Signal results

The [final measurements](signal-checks-final.json) cover all 369 current stage files. There are no zero-signal files, no early prefix below -60 dBFS RMS, and no full clip with more than 0.1% of decoded samples at or above absolute amplitude 0.999. Each stage has 123 distinct decoded PCM hashes. No pair reached 0.95 absolute cosine similarity when aligned at its start. This comparison does not test every possible time shift or prove speaker identity.

Final full-line integrated loudness ranges from -24.37 to -12.07 LUFS. The original range was -29.96 to -12.07 LUFS. No global volume normalization was added. The [baseline measurements](signal-checks-before.json) and [Troll candidate probes](candidates/troll-probes.json) preserve the comparison.

Early clues often end within a word. Their acceptance checks use actual duration and signal, while recognition output is retained as supporting evidence. Full-sentence recognition is assessed on the complete third-stage clip.

## Remaining recognition limits

| Hero          | Model result                                                                                                                     |
| ------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| Alchemist     | The opening verb varies between Mixed, Mix, Nix, and Next. The rest agrees.                                                      |
| Bristleback   | The source slang "chinned ya" becomes "changed it" or "changed you." Diagnostic filters did not resolve it.                      |
| Disruptor     | The models use "a solution" where the source uses "the solution."                                                                |
| Faceless Void | The models use "I return" where the source uses "I returned."                                                                    |
| Jakiro        | Candle becomes cattle or counter, or the preposition differs. Filtering did not produce exact agreement.                         |
| Ogre Magi     | The first-blood shout is misread or omitted. The second clause agrees.                                                           |
| Skywrath Mage | The lore name Skree'auk is rendered phonetically, and talons becomes talents.                                                    |
| Slark         | The source word wanted becomes wied, whited, or whined. The remaining words agree.                                               |
| Warlock       | Death becomes This, with a further no/new disagreement in two models.                                                            |
| Spectre       | All three model sizes produce conflicting full-line text. Slower playback recovers the opening phrase but not the complete line. |

The [medium results](asr-medium-review.jsonl), [large results](asr-large-review.jsonl), and [diagnostic results](diagnostics/asr-medium.jsonl) retain these outputs. The source transcripts were not silently rewritten to match a model. No wrong-hero mapping was found. The checks do not independently establish every spoken word in these ten recordings.

Bounty Hunter's complete sentence also occurs under 11 other heroes. All 17 matching source records are in the [text review](text-review-before.json). Its keyed audio matches the pinned source and has a distinct decoded waveform. Transcript agreement alone cannot identify the speaker of that shared sentence. Thirty selected lines also start with First Blood. Shared wording is relevant to interpretation of ASR, while the game presents recorded voices.

The [text-only review](text-review-before.md) predates the Troll replacement. It read all 123 baseline lines individually and checked the full pinned corpus. The final source check and change ledger cover the replacement. Its earlier wording about a separate audio check describes the division of work at that point; this report contains the completed automated audio work.

## Repeat the checks

Run from the repository root. The replay helper fetches only missing audio, verifies its recorded source hash, and reproduces all final stage files. It refuses to write inside this archive. A changed source or encoded output stops the replay. Use the recorded ffmpeg version for byte-identical prefix output.

```sh
echo_audit_dir=docs/audits/2026-10-06/launch-checks/echo
python3 "$echo_audit_dir/replay-inputs.py.txt" --output-dir /tmp/echo-audio-replay
python3 -m venv /tmp/echo-asr-replay
/tmp/echo-asr-replay/bin/pip install -r "$echo_audit_dir/asr-requirements.txt"
```

Download the required model with `huggingface_hub.snapshot_download` using its repository ID and exact revision from `model-manifests.json`. Check each downloaded file against that manifest. Then pass its local directory to the recognizer. The helper sends no transcript hints and loads only local model files.

```sh
OPENBLAS_NUM_THREADS=1 OMP_NUM_THREADS=4 /tmp/echo-asr-replay/bin/python "$echo_audit_dir/transcribe-echo.py.txt" --input /tmp/echo-audio-replay/inputs.json --model /path/to/verified/small.en --label small.en --threads 4 --output /tmp/echo-audio-replay/asr.jsonl
OPENBLAS_NUM_THREADS=1 OMP_NUM_THREADS=1 /tmp/echo-asr-replay/bin/python "$echo_audit_dir/measure-echo.py.txt" --input /tmp/echo-audio-replay/inputs.json --output /tmp/echo-audio-replay/signal.json
```

The replay helper reproduced the exact reviewed Troll source and both encoded prefixes in the [smoke check](replay-smoke.log). The other saved helpers retain historical workspace paths where needed for ledger assembly. They are review artifacts, not application runtime dependencies. [The archive manifest](archive-manifest.json) records saved evidence and reviewed repository hashes.

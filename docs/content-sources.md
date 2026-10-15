# Content sources and release review

Last reviewed on 2026-10-06. The [content audit](audits/2026-10-06/content.md) records the original factual coverage and its limits. The [content fixes](audits/2026-10-06/content-remediation.md) record subsequent changes and checks. The [Flashback review](audits/2026-10-06/flashback-facts.md) and [composite event sources](audits/2026-10-06/flashback-sources.md) record the historical evidence.

## Complete question review

The [deep review](audits/2026-10-06/deep-review/README.md) covers every one of the 1,517 live questions. Its [index](audits/2026-10-06/deep-review/question-review-index.json) links each reviewed ID to its ledger and records the content hashes at the close of that review. It separately lists 72 retired rows as unreviewed. That review changed player-visible text or clues in 701 records; this includes clarity and wording changes as well as factual corrections. Later launch checks have separate evidence, including the [Flashback image replacements](audits/2026-10-06/launch-checks/rights/replacements.json).

The archive preserves 408 Valve API JSON files, exact URLs and hashes, selected pinned Dotabase records, original historical sources and measured audio evidence. These are the inputs of this review, not a recovered copy of the original generation inputs. Valve's API does not embed a patch/build ID. Its latest published patch was 7.41f when fetched on 2026-10-06. The older build 6882 extract has unproven installation provenance.

All 123 Echo and 96 Soundcheck questions have source and waveform checks, but none has a human listening verdict from this audit. Asset permissions, actual in-game behavior and a physical-device pass remain separate release checks.

## Release check

Run `pnpm check:content-release` before release. It compares the files in the working tree with `docs/content-review.json`. The manifest records SHA-256 hashes for every JSON file under `src/data` and every JavaScript module under `scripts`. New files, removed files, changed bytes, a changed patch, and changed review evidence cause failure. A missing or unreadable manifest also causes failure. The command does not write a new manifest.

The scope includes all scripts so that a new generator, source override, or validator cannot escape review by using a new filename. A script-only change may need only a narrow review. Describe that scope in the evidence document.

After a content change:

1. Inspect the changed questions, answers, measurement conditions, and citations. Compare changed gameplay facts with the supported client snapshot and current Valve patch notes. Run `pnpm audit:client` and inspect whether the source checks ran.
2. Run `pnpm validate-data` and `pnpm validate-assets`. Check the changed question in the app, including its answer and reveal. Tests that compare local files with each other do not establish a fact's correctness.
3. Save the results and any remaining limits in a repository Markdown file. Give each factual claim a source that supports that claim. A homepage or a result page does not establish the source or license of its photograph.
4. Record the completed review with the reviewer and evidence path. For example:

   ```sh
   node scripts/validate-content-release.mjs --record-review --reviewed-by='Reviewer name' --evidence='docs/audits/2026-10-06/deep-review/README.md'
   pnpm check:content-release
   ```

5. Review and commit the content changes, evidence, and manifest together. CI must run the validation command. Do not run `--record-review` in CI or add it to a sync command.

Recording the manifest is an explicit claim that the named review happened. It is not a substitute for that review. The file is not a cryptographic signature, and a person who can edit both the files and manifest can replace both. Repository review and branch protection control that authority.

For a release, require the client-dependent checks to run. The normal offline validators can report a skipped client check when the snapshot is absent. A skipped check is not release evidence. Run these commands with the supported snapshot installed, or pass the supported `--client-root` path:

```sh
pnpm audit:client
node scripts/validate-shopkeeper.mjs --require-client
node scripts/validate-hero-picker.mjs --require-client
node scripts/validate-aghanim.mjs --require-client
```

## Source snapshot limits

The existing sync scripts read moving OpenDota API endpoints and Dotabase's `master` branch. Their original input bytes and commit IDs were not saved. The baseline review cannot recover those missing records. A matching patch string alone cannot establish that an upstream response belongs to that patch.

The release manifest prevents an unnoticed same-patch regeneration from passing the recorded review. It hashes the committed output and scripts, not the historical downloads. For future syncs, save each input's URL, retrieval time, commit or build ID when available, and SHA-256 hash with the factual review. Preserve the downloaded bytes when their terms permit it. Do not claim complete reproduction of an older generation without those inputs.

`scripts/client-constant-audit.mjs` identifies the reviewed gameplay patch and base client build. `src/data/client-audit-snapshot.json` records hashes for the base client files used by the audit. `src/data/client-patch-deltas.json` records the reviewed numeric changes and their official patch-feed evidence. The client audit rejects a different base snapshot before it applies those changes. The release manifest covers both records and the audit script.

These numeric deltas do not establish the correctness of every current localized ability description or Aghanim effect. Those need their own content review. A successful release hash check also does not prove that the game has not changed since the review.

| Material                                     | Recorded source                                                                                              | Remaining limit                                                                                                      |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------- |
| Hero, ability, item, and ownership constants | OpenDota API URLs in `src/data/trivia-meta.generated.json`; overrides in `scripts/client-constant-audit.mjs` | Original upstream response hashes and version IDs are absent.                                                        |
| Hero responses and related metadata          | Dotabase repository and asset URLs in the catalogs and sync script                                           | Moving source branch and remote assets need versioned acquisition records.                                           |
| Gameplay corrections                         | Valve patch links and client audit metadata                                                                  | Compare with the required client snapshot; do not treat old build data as the current patch without reviewed deltas. |
| Historical facts                             | Each Flashback question's `source` field; composite events use per-card `source.references`                  | Other legacy wiki citations remain in the catalog. The public interface does not display the source list.            |
| Soundcheck clips                             | Event paths and clip hashes in the Soundcheck catalog                                                        | A data hash does not establish permission to redistribute the clip.                                                  |
| Feedback sounds                              | [Sound provenance and hashes](../public/assets/dota2/sounds/README.md)                                       | Review the permitted use of Valve audio for the intended release.                                                    |
| Hero and item artwork                        | Steam CDN URLs and local files                                                                               | Source location alone does not establish permission or long-term availability.                                       |

## Licenses and asset permissions

[Third-party notices](../THIRD_PARTY_NOTICES.md) preserves the OpenDota and Dotabase MIT notices. Those licenses do not establish rights to the game artwork, extracted sounds, event photographs, or team marks referenced by their data.

The [launch asset review](audits/2026-10-06/launch-checks/rights/README.md) removed all uses of the 23 local event-photo/winner assets previously listed here. It also replaced every Flashback team-logo reference, including remote Steam CDN logos, with original SVG/text cards. The original files are preserved byte for byte outside public output in the ignored `.local-assets/flashback-originals/` directory. Do not publish that directory. The [quarantine manifest](audits/2026-10-06/launch-checks/rights/quarantine-manifest.json) keeps the complete old file list and hashes.

These replacements affect only images. All 191 Flashback questions retain their IDs, prompts, answers, explanations, historical dates, order and fact citations. The [photo provenance review](audits/2026-10-06/launch-checks/rights/photo-provenance.md) records the source evidence and missing permission records. The earlier audit remains an immutable record of the previous app state.

The remaining Valve artwork and audio have a separate, bounded [published-terms review](audits/2026-10-06/launch-checks/rights/valve-terms.md). Steam Subscriber Agreement section 2.D addresses noncommercial fan art and requires rights to third-party material. The video and DotaTV policies do not establish permission for this app to distribute individual assets. The current checkout has no payment, advertising or paywall flow; a change to that behavior requires a new terms review. No blanket redistribution license is claimed.

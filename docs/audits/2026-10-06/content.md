# Content and data audit

Audit date: 2026-10-06. Repository: `/home/kulmisiu/dev/dota2-trivia`. This audit read the current working tree, including the user's existing changes. It changed no repository files.

## Result

The live catalog contains 1,515 questions across all ten round identities. Its structure and answer selection pass most existing checks. The remaining defects include a wrong historical answer, ambiguous damage comparisons, an ambiguous full-shop sound answer, and a quality gate that removes two valid local-image questions. Passing validators do not establish factual correctness.

The official Valve patch list still ends at 7.41f. The repository's gameplay patch is current as of this audit. Historical Flashback rows retain a 7.41e stamp. This alone does not make historical facts stale, but present-tense mechanics in that file require patch review. [Valve patch list](https://www.dota2.com/datafeed/patchnoteslist?language=english), [Valve 7.41f announcement](https://www.dota2.com/newsentry/677383425371407609?l=english).

## Confirmed gameplay and content defects

### C-01, P2: Soundcheck rejects an item that uses the played sound

Evidence:

- `src/data/soundcheck-questions.json:2992` defines `soundcheck-item:force_staff`, a single-item sound round.
- `scripts/soundcheck-audit.mjs:15` explicitly records that Hurricane Pike uses the Force Staff cue on self and allied casts.
- `src/lib/item-picker.mjs:39` makes every single-item Soundcheck round use the full shop.
- `src/data/shopkeeper-catalog.json:1096` includes Hurricane Pike.
- `src/lib/keyed-answer.ts:49` accepts any catalog item as a valid submission. Lines 78 and 88 accept only the one stored correct key.
- `scripts/validate-soundcheck.mjs:107` checks ambiguity only against the four old fallback options.

A direct call to `publicQuestionForRound` returned `answerMode: "item-grid"`, no four-choice answers, and the expected key `force_staff`. Hurricane Pike is available in the same picker. Choosing it is valid input but is marked wrong, even though it can produce the clip.

Fix the question's answer scope. Either accept an explicit set of equivalent correct items, use an unambiguous cue, or restrict this round to carefully checked choices. The ambiguity check must examine the actual player answer space. Re-run the full picker flow with both Force Staff and Hurricane Pike.

Repeatable evidence: `node evidence/content-checks.mjs`.

### C-02, P2: Order Up removes damage qualifiers needed for a unique answer

`scripts/generate-value-order.mjs:190` extracts a number from a Classic damage question, labels it simply "damage", and retains only the hero as card context. The public prompt says "max-level damage". It drops the distinctions that the Classic source and `scripts/damage-question-facts.mjs` took care to preserve.

Two concrete rounds:

- `value-order:ability-damage:07`, `src/data/value-order-questions.json:4589`, compares Rolling Boulder at 90, Shadow Wave at 145, Dragon Tail at 150, and Terror Wave at 200. The source question says 90 is only Rolling Boulder's base damage, with 100% of Strength added. At 100 Strength its damage is 190, which changes the order. Shadow Wave's 145 is one healing pulse, and overlapping pulses can also change the comparison.
- `value-order:ability-damage:12`, `src/data/value-order-questions.json:5054`, ranks Scatterblast's 280 below 300, 320, and 325. Its source explicitly states that point-blank targets take 30% more. That is 364, which moves it from first to last.

The source rows are `damage:earth_spirit_rolling_boulder:4`, `damage:dazzle_shadow_wave:4`, and `damage:snapfire_scatterblast:4` in `questions.generated.json`. No matching condition appears in the ordering cards, prompt, or reveal.

State the measurement on each card, such as base damage, one pulse, and outside point-blank range. A shared pre-talents, upgrades, amplification, and resistance rule would also remove uncertainty. Prefer structured measurement metadata to parsing prose. Check the displayed question with a Dota player who has not read the source JSON.

### C-03, P2: Flashback marks Flying Courier correct for the wrong patch

`flashback:flying-courier-gone`, `src/data/flashback-questions.json:5218`, asks which shop item 7.23 removed when each player received a courier. Line 5225 keys Flying Courier. Animal Courier is offered as a distractor.

The Flying Courier purchase had already been removed in 7.07. That patch made the flying upgrade automatic. Patch 7.23 made the personal courier automatic. The offered answer that fits 7.23 is Animal Courier. [Valve 7.07 Courier notes](https://www.dota2.com/duelingfates), [Valve 7.23 Courier notes](https://www.dota2.com/outlanders).

Correct the keyed answer and explanation, or change the prompt to ask about the 7.07 flying upgrade. Verify both the answer and the reveal in a played round.

### C-04, P2: The quality filter removes two questions after artwork moves locally

`src/lib/shopkeeper-quality.mjs:115` requires an HTTPS image for each prompt item. The current data correctly uses local paths for compact Disperser and Phylactery icons. Therefore:

- `shopkeeper-recipe:disperser` fails with "invalid prompt item tray".
- `shopkeeper-upgrade:phylactery:angels_demise` fails with the same error.

`src/lib/trivia.ts:237` filters both out. Only 100 of the 102 Shopkeeper records are playable. Both local files exist. This is also the baseline `pnpm validate-data` failure observed by the parent audit.

Use one shared asset-path contract for runtime, generators, and validators. Permit the intended local asset paths, with a local existence check. Make unexpected content exclusion visible in the release check. Verify that all intended Shopkeeper rows enter the deck and play.

### C-05, P3: Five Flashback explanations teach incorrect facts

The answer years or names remain correct in these rows, but the reveal text is wrong.

| Question ID | File line | Defect |
| --- | ---: | --- |
| `flashback:shrines-700` | 2946 | Says Shrines were removed in 7.23. The remaining Shrines were removed in 7.24. |
| `flashback:first-battlepass-year` | 2487 | Calls TI2016 the first product named Battle Pass. Winter 2016 Battle Pass came first. |
| `flashback:ti2-year` | 4272 | Places The Play in the grand final instead of the winners' bracket semifinal. |
| `flashback:techies-year` | 209 | Gives 21 August 2014 instead of the main-client release on 4 September. |
| `flashback:refresher-shard` | 5128 | Says Refresher Shard resets item cooldowns. Patch 7.41 removed that effect. |

All lines refer to `src/data/flashback-questions.json`. Sources and exact corrections are in [the Flashback report](flashback-facts.md). Valve evidence directly supports four claims. The Techies day is supported by a contemporary first-hand patch analysis, with the evidence limit stated in that report.

The Refresher Shard statement is present-tense gameplay content inside a history mode. Give such rows explicit historical scope or include them in every gameplay patch review. [Valve 7.41 data, item ID 260](https://www.dota2.com/datafeed/patchnotes?version=7.41&language=english).

## Validation and maintenance defects

### C-06, P2: The asset check omits two live catalogs and Flashback media fields

`scripts/validate-image-assets.mjs:9` loads only generated, Soundcheck, Shopkeeper, and Order Up data. It omits Flashback and Aghanim's Lab. `scripts/image-assets.mjs:10` also omits Flashback card art and reveal media.

Flashback has 118 distinct image references, including 65 remote URLs. Sixty distinct references occur in fields omitted by the shared image helper. The current pipeline cannot substantiate README's claim that every referenced image is checked.

I separately sent HEAD requests to all 65 remote Flashback image URLs. All returned successful status codes. All 55 local image references found across the complete live catalog exist. These checks found no current unavailable Flashback image, but the release check leaves a future regression untested.

Load the same playable catalog used by the application, enumerate all media fields, and check HTTP status plus content type. A HEAD result does not prove successful image decoding or a correct image. The current helper also checks local existence rather than decode success.

Evidence: [Flashback image probes](evidence/flashback-asset-heads.json).

### C-07, P2: "Live-client audit" can mean either a skipped check or an obsolete comparison

There are two separate problems:

1. `scripts/validate-aghanim.mjs:193`, `scripts/validate-hero-picker.mjs:125`, and the Shopkeeper validator catch a missing client file and continue. Both hero-picker and Aghanim validators returned success when run with `--client-root=evidence/no-client-snapshot`. Their output still says the data was validated.
2. `scripts/audit-live-client.mjs:12` defaults to build 6882, the prior 7.41e snapshot. Its raw comparisons do not apply the patch deltas in `client-constant-audit.mjs`. It currently fails six comparisons even though the relevant committed values match the 7.41f patch notes.

The six failures were Daedalus, Heart, Hurricane Pike, and Octarine prices; an Octarine price duel; and Broodmother's Insatiable Hunger mana cost. The repository's updated values are supported by Valve's 7.41f changes. These failures are not evidence that those answers are wrong. [Valve 7.41f notes](https://www.dota2.com/patches/7.41f?l=english).

Split offline structure validation from a required factual release audit. Report skipped source checks explicitly. Use a versioned current client snapshot, or a pinned base snapshot plus a separately reviewed patch-delta manifest. Verify its build and hashes before comparing facts. Do not update data to satisfy the old snapshot.

### C-08, P2: A same-patch sync can import a newer upstream snapshot under the old audit stamp

`scripts/sync-dota-data.mjs:29` uses a hardcoded patch default. Lines 36-41 read current OpenDota endpoints and Dotabase's moving master branch. Lines 53-56 compare the configured patch string to the static audit string. They do not establish that the downloaded inputs belong to that patch.

After an upstream patch, running the default sync can therefore mix newer constants with older explicit overrides and still stamp the output 7.41f. The small override set does not pin the many untouched values. The Soundcheck generator also reads current OpenDota endpoints.

Store input versions, retrieval dates, source commit IDs where available, and content hashes. Reject a source version that does not match the reviewed patch. Require the factual release audit before promoting regenerated data. This is a reproducibility risk in the pipeline, not a claim that the committed catalog already contains such a mixture.

### C-09, P3: Historical citations often do not prove the row

The full-file source check found nine Dota homepage citations, 27 old Fandom URLs, and 25 raw URLs used as source labels in Flashback. Several rows cite broad articles for a precise date or match event. This helped the incorrect explanations survive.

Use a source for the exact claim, with a checked date and readable label. Add an as-of date to changing record claims. The full Flashback report names examples and separates weak evidence from confirmed wrong answers. No claim is made that every Fandom URL is broken.

## Asset provenance and release evidence

This section records what was found. It is not a conclusion that the project infringes rights or that a general policy authorizes every use.

- `README.md:295` attributes OpenDota, Dotabase, and Valve. `src/components/site-footer.tsx:31` gives the Valve trademark and unaffiliated-project notice.
- `public/assets/dota2/sounds/README.md` records source URLs and SHA-256 values for feedback audio. This is stronger provenance than the other asset groups.
- No repository LICENSE, NOTICE, or per-asset credits manifest was found by filename search. The Flashback winner/event photos have local paths, captions, and question fact sources, but no distinct creator, original photo URL, or reuse-license record. A source for a tournament result does not establish the origin of its photograph.
- OpenDota's constants repository has an MIT license with a condition to preserve its copyright and permission notice. Dotabase also has an MIT license, copyright Malcolm McCord Diller, 2016, with the same condition. The project credits names but contains no matching upstream notice file. The release review should determine which redistributed material requires those notices and include them. [OpenDota license](https://raw.githubusercontent.com/odota/dotaconstants/master/LICENSE), [Dotabase license](https://github.com/mdiller/dotabase/blob/master/LICENSE).
- Valve's current Steam Subscriber Agreement section 2.D permits noncommercial Fan Art incorporating Valve content and separately addresses third-party content rights. This is relevant evidence to review against this website and its intended business model. It does not resolve the scope for every extracted audio file, logo, or event photo. Record the applicable permission before shipping or adding monetization. [Valve agreement, section 2.D](https://store.steampowered.com/subscriber_agreement/).

Runtime media relies on Steam CDN hosts and Dotabase. Two audio game identities depend on Dotabase availability. Current assets are mutable public URLs. Soundcheck records SHA-256 values, but `src/lib/round-audio-cache.mjs:34` does not compare fetched bytes to those recorded values. A changed upstream clip can therefore stop matching the reviewed event while the old audit metadata remains. Decide which permitted assets to version or cache durably, document origin and permission, and add availability monitoring. Infrastructure resilience and request limits are covered by the parent audit.

## Coverage and passing evidence

| Round identity | Live questions | Content checks performed |
| --- | ---: | --- |
| Classic Trivia | 342 | Numeric/ownership validators; installed client comparison; current 7.41f changed-value spot checks; damage measurement definitions; duplicate and answer-shape scan. |
| Shopkeeper Rush | 100 | All 102 source rows checked by quality gate; 38 build-result/upgrade-path target sets independently compared with all purchasable local-client recipes. Each has one valid result. Two rows excluded by the local-image bug. |
| Spell Link | 127 | One question per enabled hero; ownership, hint leakage, full-name leakage, word limits, and staged public serialization checks. |
| Fogged Vision | 127 | Every enabled hero exactly once; portrait/answer identity; server-owned image route and hidden-alt contract; existing progressive-curve validator. |
| Echo Hunt | 123 | Unique response ownership and audio references; substantial spoken-line policy; four intentionally non-speaking heroes excluded. |
| Soundcheck | 96 | 48 ability and 48 item rounds; 114 clip profiles; event metadata, duplicate hashes, durations, option layouts, and progressive timing. Full-shop ambiguity defect remains. |
| Quote Hunt | 245 | Unique normalized quotes, speaker ownership, answer-name leakage, identity-clue construction, and length checks. |
| Aghanim's Lab | 84 | All effect clues manually read; owner/type flags checked against installed files; structured regeneration exactly matches committed records. No additional factual error confirmed. |
| Order Up | 80 | All value/source links, ties, answer permutations, card sets; structured regeneration exactly matches committed records. Damage scope defect remains. |
| Flashback | 191 | All prompts, offered answers, marked answers, and explanations manually read; targeted external fact checks; all 65 remote image URLs probed; local image presence checked. |

The current catalog has no duplicate IDs, no exact duplicate question content under the recorded comparison, and no malformed four-answer records. There are 72 archived generated questions excluded from live play by design. Archived Map Sense and Counterplay are not part of the ten live modes and were not fact-audited.

All 17 validators after the failing Shopkeeper step passed when invoked independently. Their complete tool outputs are in [validators-individual.json](evidence/validators-individual.json). This includes the existing 10,000-round scheduling check, which found main subjects at least 12 rounds apart and exact questions at least 624 rounds apart for its tested schedule.

Independent regeneration in a temporary directory produced semantically identical 80 Order Up and 84 Aghanim records. The full remote-data sync was not run, because it rewrites generated content and depends on changing upstream inputs. No application data was changed.

The inventory, source-domain counts, excluded records, and damage examples are in [content-inventory.json](evidence/content-inventory.json). A repeatable targeted diagnostic is [content-checks.mjs](evidence/content-checks.mjs.txt).

## Limits

This audit did not listen to every hero, ability, and item audio clip, play every one of the 1,515 live questions in a browser, or independently re-prove every numeric fact against a newly downloaded current client. It used the installed 6882 files as a base and checked relevant 7.41f changes against Valve. Some validators compare generated files to other local files or search source strings; those are consistency checks, not independent factual evidence.

The 65 successful image HEAD requests establish availability at audit time, not visual correctness. Six local Flashback event images were opened for visual inspection. The full image set was not manually matched to each depicted event. No real player study establishes difficulty balance or the readability of every question within 15 seconds. Existing hidden difficulty tiers and calibration data are useful mechanisms, but they are not evidence of player-tested fairness.

# Flashback factual review

Reviewed on 6 October 2026. Scope: all 191 records in `src/data/flashback-questions.json`, using the app's 7.41e catalog scope. No records were deleted.

Result: 115 records verified without content changes, 76 corrected or narrowed and verified, and none left unverified. There are 98 choice, 72 year and 21 order records. Seventy-six records have content edits. Citation-only edits are separate.

Each record was read for its prompt, all answer choices, scored answer, explanation, eyebrow, ordering-card names and hints, and reveal caption. The ledger stores the final claim, exact URLs, source type, changes, limitations and recommendation. It includes all 191 IDs exactly once. A homepage or a page that only names the topic was not accepted as proof of a detailed claim.

The primary material includes Valve patch feeds and announcements, Valve product and event pages, NAVI's own tournament history, Perfect World's event report, original creator depositions in a court record, record-keeper reports and first-hand interviews. The Techies patch source is original analysis of the shipped game client. The Carl source is a pinned extraction of Valve's game text, not a new audio listening test. Some earliest-event conclusions are inferences across dated primary records; the ledger identifies the important cases.

## Corrections

| Record | Correction | Evidence |
| --- | --- | --- |
| `flashback:underhollow-year` line 4839 | Correct the owner of the maze and use the directly documented launch month. | [The Underhollow Beckons](https://api.steampowered.com/ISteamNews/GetNewsForApp/v2/?appid=570&count=2&maxlength=0&enddate=1529007223&feeds=steam_community_announcements); [The International Grand Champions](https://api.steampowered.com/ISteamNews/GetNewsForApp/v2/?appid=570&count=2&maxlength=0&enddate=1535409006&feeds=steam_community_announcements) |
| `flashback:coop-events-order` line 3865 | Dark Moon was a winter event, so remove the summer-only heading. The maze is beneath Roshan's lair, not Underlord's. | [Special Event: Dark Moon](https://api.steampowered.com/ISteamNews/GetNewsForApp/v2/?appid=570&count=2&maxlength=0&enddate=1485473166&feeds=steam_community_announcements); [Exclusive Battle Pass Campaign — Siltbreaker: Act I](https://api.steampowered.com/ISteamNews/GetNewsForApp/v2/?appid=570&count=2&maxlength=0&enddate=1496956046&feeds=steam_community_announcements) |
| `flashback:morokai-year` line 4881 | Valve announced the mode on 5 July Pacific, not 7 July; it is about ancient beasts, not Monkey King. | [Special Battle Pass Event and Immortal Treasure II](https://api.steampowered.com/ISteamNews/GetNewsForApp/v2/?appid=570&count=2&maxlength=0&enddate=1562375589&feeds=steam_community_announcements) |
| `flashback:frostivus-year` line 4797 | Valve says Frostivus was cancelled and replaced by The Greeviling in 2012. | [Dota 2 Update - December 19th, 2012](https://api.steampowered.com/ISteamNews/GetNewsForApp/v2/?appid=570&count=2&maxlength=0&enddate=1355945881&feeds=steam_updates); [Valve: frostivus](https://www.dota2.com/frostivus) |
| `flashback:frostivus-what` line 6485 | Correct the cancelled Frostivus launch. | [Valve: frostivus](https://www.dota2.com/frostivus); [Dota 2 Update - December 19th, 2012](https://api.steampowered.com/ISteamNews/GetNewsForApp/v2/?appid=570&count=2&maxlength=0&enddate=1355945881&feeds=steam_updates) |
| `flashback:season-events-order` line 7096 | The 2012 mode was The Greeviling; the card must not claim Frostivus ran. Use the event that actually ran and remove dates that disclose the order. Use Roshan artwork for the dungeon beneath his lair. Remove misleading Monkey King artwork. | [Dota 2 Update - December 19th, 2012](https://api.steampowered.com/ISteamNews/GetNewsForApp/v2/?appid=570&count=2&maxlength=0&enddate=1355945881&feeds=steam_updates); [The Underhollow Beckons](https://api.steampowered.com/ISteamNews/GetNewsForApp/v2/?appid=570&count=2&maxlength=0&enddate=1529007223&feeds=steam_community_announcements) |
| `flashback:tormentors` line 3201 | Make the mechanic historical and distinguish an automatic Shard grant from an item drop. | [Valve patch 7.33](https://www.dota2.com/datafeed/patchnotes?version=7.33&language=english) |
| `flashback:shield-rune` line 6254 | Wisdom is an experience rune, not a power rune. | [Valve patch 7.33](https://www.dota2.com/datafeed/patchnotes?version=7.33&language=english) |
| `flashback:stockholm-planned` line 6409 | Separate the COVID postponement from Sweden's sports-classification and visa problem. | [An Important Update on TI10: The International - Dota 2 Championships in Sweden](https://api.steampowered.com/ISteamNews/GetNewsForApp/v2/?appid=570&count=2&maxlength=0&enddate=1624314509&feeds=steam_community_announcements); [Announcing New Location and Dates for The International - Dota 2 Championships](https://api.steampowered.com/ISteamNews/GetNewsForApp/v2/?appid=570&count=2&maxlength=0&enddate=1625689948&feeds=steam_community_announcements) |
| `flashback:free-to-play` line 7695 | Remove the incorrect premiere claim; distinguish an early TI screening from the public release. | [Free to Play Documentary: Coming Soon](https://api.steampowered.com/ISteamNews/GetNewsForApp/v2/?appid=570&count=2&maxlength=0&enddate=1392836560&feeds=steam_community_announcements); [True Sight: A New Documentary Series](https://api.steampowered.com/ISteamNews/GetNewsForApp/v2/?appid=570&count=2&maxlength=0&enddate=1476232723&feeds=steam_community_announcements) |
| `flashback:scan-added` line 7816 | The 25 April announcement says the main client follows later; keep the month and documented mechanic. | [Valve: 687](https://www.dota2.com/687); [New Gameplay Update](https://api.steampowered.com/ISteamNews/GetNewsForApp/v2/?appid=570&count=2&maxlength=0&enddate=1461606330&feeds=steam_community_announcements) |
| `flashback:old-name-windranger` line 8056 | Specify the Dota 2 rename so Warcraft III personal names cannot also fit. | [Dota 2 Update - November 21st, 2013](https://api.steampowered.com/ISteamNews/GetNewsForApp/v2/?appid=570&count=2&maxlength=0&enddate=1385086981&feeds=steam_updates) |
| `flashback:odpixel-fogged` line 7464 | Replace the unbounded most-finals record with the specific final confirmed by Valve. | [True Sight World Premiere — The International 2019](https://api.steampowered.com/ISteamNews/GetNewsForApp/v2/?appid=570&count=2&maxlength=0&enddate=1580113725&feeds=steam_community_announcements) |
| `flashback:pendragon-allstars` line 1876 | The sale and claimed community split lack primary proof. The court record identifies the site manager. | [Court record: DotA creator depositions, pages 6 to 10](https://www.govinfo.gov/content/pkg/USCOURTS-cand-3_15-cv-04084/pdf/USCOURTS-cand-3_15-cv-04084-6.pdf) |
| `flashback:first-arcana-hero` line 7785 | The dated Valve item record proves its hero; remove unsupported first-item and particle-effect claims. | [Dota 2 Update - March 7th, 2013](https://api.steampowered.com/ISteamNews/GetNewsForApp/v2/?appid=570&count=2&maxlength=0&enddate=1362703861&feeds=steam_updates) |
| `flashback:outworld-devourer` line 7633 | Anchor the former name to the exact Valve rename record. | [Valve: mistwoods](https://www.dota2.com/mistwoods) |
| `flashback:og-majors-order` line 6763 | OG won later DPC Majors too; identify the original series. Remove ordinal answer hints. | [The Frankfurt Major Champions](https://api.steampowered.com/ISteamNews/GetNewsForApp/v2/?appid=570&count=2&maxlength=0&enddate=1448304305&feeds=steam_community_announcements); [Manila Champions, TI Qualifiers and 6.88 Gameplay Update](https://api.steampowered.com/ISteamNews/GetNewsForApp/v2/?appid=570&count=2&maxlength=0&enddate=1465838993&feeds=steam_community_announcements) |

Several other edits remove nonessential claims that the cited primary material did not prove. Examples include roster-breakup remarks, exact live-client days inferred from advance announcements, ongoing all-time records and a nickname-origin story. Those removals do not mean the deleted claims were proved false.

The answer arrays, correctIndex values, correctYear values and correctOrder arrays were preserved in this pass. The prior Animal Courier correction remains correct and checked. First-Arcana questions now ask about the dated Fiery Soul item, the OD question asks his documented real name, and the caster-pair question asks about TI9. These changes preserve the keyed answer while giving each prompt a claim the evidence supports.

## Exclusion decision

All seven evidence gaps were closed in the follow-up. No Flashback records require factual-review exclusion. The machine-readable `flashback-exclusions.json` is an empty array. All 191 records remain eligible.

## Evidence gaps closed in the follow-up

- Auto Chess: [Valve’s May announcement](https://web.archive.org/web/20190522050030id_/http://blog.dota2.com/2019/05/dota-auto-chess/) and [June Underlords announcement](https://web.archive.org/web/20190613201930id_/http://blog.dota2.com/2019/06/dota-underlords/) were retrieved in full from Internet Archive. They establish Drodo’s authorship, Valve’s standalone project and its Underlords name.
- TI2016: [Guinness’s record page](https://www.guinnessworldrecords.com/world-records/775490-highest-earning-esports-nation) explicitly identifies the first esports pool over $20 million. Its [contemporary certificate report](https://www.guinnessworldrecords.com/news/2016/10/chinese-gaming-team-wins-largest-prize-for-an-esports-competition-ever-448932) gives the amount and previous-record comparison.

- Original names: pinned DotA Allstars 6.52 map bytes directly supply Guinsoo’s Scythe of Vyse and Pit Lord/Azgalor. The same map was downloaded from two independent historical archives and all three SHA256 values match. Underlord’s Valve release page supplies the matching ability names.
- Long match: the original Beyond the Summit ending frame shows C9 vs ScaryFaceZ, a final clock of 3:20:34 and both caster credits.
- Fountain Hook: Valve’s original 2013 match and retrospective film establish the teams, heroes and mechanic. Captions and selected frames were inspected.
- Sheever: her PGL interview gives the sea-serpent origin; Penguin Random House’s own novel excerpt connects Shreever to Robin Hobb. This is a stated inference across two primary sources.

## Repeatable checks

- `node scripts/validate-flashback.mjs` passed for all 191 archived records. It checked the data contract, answer-slot balance, prompt length, artwork rules and entry/reveal rules.
- `node docs/audits/2026-10-06/deep-review/flashback/check-flashback-flow.mjs` passed for every record. It exercised the actual public serializer and year/order scoring, confirmed hidden answers during answering, and checked the corrected text and keys in reveal payloads.
- `python3 docs/audits/2026-10-06/deep-review/flashback/check-flashback-sources.py` resolved all 70 exact Steam API citations to the expected article ID or the same titled article at the same timestamp.
- `git diff --check -- src/data/flashback-questions.json scripts/validate-flashback.mjs` passed.

The structural checks do not establish historical truth. The claim-by-claim ledger and primary evidence supply that part of the review. This pass did not re-audit every image visually, play every historical video in full, or run a new browser session. The follow-up inspected the selected original video frames and transcripts recorded in the ledger. The affected data-to-public-question path was exercised directly. Root owns the full application flow checks and the central exclusion policy.

## Calibration and catalog coordination

Forty-three content changes alter question calibration revisions. Exact IDs are in `flashback-calibration-changes.json`. Citation metadata stays inside `source`, which the calibration revision function excludes. Root owns shared catalog version changes; this pass did not edit them.

Files changed in the repository: `src/data/flashback-questions.json` and `scripts/validate-flashback.mjs`. The validator artwork expectations now match Roshan for Underhollow and a map for Mo'rokai and ward-price trivia. All other research and checks are in this directory.

Follow-up evidence reports: `flashback-primary-review.md`, `flashback-wc3-primary.md`, and `flashback-ti20m-primary.md`. Their compact source manifests and extraction records retain hashes, timestamps and repeatable checks.

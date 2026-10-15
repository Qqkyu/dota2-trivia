# Flashback composite citation fixes

Changed only the source objects for five ordering questions and added a source coverage check in `scripts/validate-flashback.mjs`. The expected result was direct primary evidence for all four cards in each question, with no change to answers, public payloads, or calibration revisions.

All 20 event cards now have citations. The five questions contain 22 references. References live under `source.references` and name their card through `eventKey`. Every source uses HTTPS and links beyond the publisher homepage.

## Evidence

### flashback:engine-history-order

- `wc3`: [Blizzard: Warcraft III DotA map](https://classic.battle.net/war3/maps/dota.shtml).
- `wc3`: [Valve: DotA already existed when Dota 2 was announced in 2010](https://store.steampowered.com/oldnews/4487).
- `ti1`: [Valve: The International announced in August 2011](https://store.steampowered.com/oldnews/5967).
- `release`: [Dota 2 Steam release: July 2013](https://store.steampowered.com/app/570/Dota_2/).
- `reborn`: [Reborn and Source 2 updates: 2015](https://www.dota2.com/reborn/updates).

### flashback:patch-systems-order

- `talents`: [7.00: Talent trees](https://www.dota2.com/700/gameplay).
- `neutrals`: [7.23 Outlanders: Neutral items](https://www.dota2.com/outlanders).
- `shard`: [7.28 Mistwoods: Aghanim's Shard](https://www.dota2.com/mistwoods).
- `newmap`: [7.33: New Frontiers map and release date](https://www.dota2.com/datafeed/patchnotes?version=7.33&language=english).

### flashback:modes-order

- `ability_draft`: [New Bloom 2014: Random Ability Draft](https://www.dota2.com/newbloom2014/day2/?l=english).
- `turbo`: [7.07 Dueling Fates: Turbo Mode](https://www.dota2.com/duelingfates).
- `plus`: [Valve: Dota Plus launches in March 2018](https://store.steampowered.com/oldnews/38154?l=english).
- `artifact`: [Artifact Steam release: November 2018](https://store.steampowered.com/app/583950/Artifact/).

### flashback:map-features-order

- `bounty`: [6.82 Rekindling Soul: Bounty Rune](https://www.dota2.com/rekindlingsoul).
- `arcane`: [6.86 Balance of Power: Arcane Rune](https://www.dota2.com/balanceofpower).
- `neutrals`: [7.23 Outlanders: Neutral items](https://www.dota2.com/outlanders).
- `twingates`: [7.33: Twin Gates and release date](https://www.dota2.com/datafeed/patchnotes?version=7.33&language=english).

### flashback:recent-patches-order

- `frontiers`: [7.33: New Frontiers in April 2023](https://www.dota2.com/datafeed/patchnotes?version=7.33&language=english).
- `facets`: [7.36: Facets and innates in May 2024](https://www.dota2.com/datafeed/patchnotes?version=7.36&language=english).
- `waters`: [7.38: Wandering Waters in February 2025](https://www.dota2.com/datafeed/patchnotes?version=7.38&language=english).
- `largo`: [7.40: December 2025 release date](https://www.dota2.com/datafeed/patchnotes?version=7.40&language=english).
- `largo`: [Valve: Introducing Largo and Patch 7.40, December 2025](https://store.steampowered.com/news/posts/?appids=570&enddate=1766531101&feed=steam_community_announcements).

## Verification of dates and ordering

- Blizzard identifies DotA as a Warcraft III map. Valve's October 2010 Dota 2 announcement describes the existing DotA game. Together they establish that Warcraft III DotA precedes TI1 in 2011. No precise original-mod release date is asserted.

- Valve's TI1 announcement names August 2011. The Dota 2 Steam page names July 2013. The Reborn updates page contains 2015 dates and Source 2 migration notes.

- Valve's event pages describe the new talent trees, neutral items, Shard, Bounty Rune, Arcane Rune, Ability Draft, and Turbo. The official Steam announcement feed independently confirms the older event years. The [Steam news API](https://api.steampowered.com/ISteamNews/GetNewsForApp/v2/?appid=570&count=40&maxlength=0&enddate=1483228800&feeds=steam_community_announcements) returned the 7.00 launch announcement dated December 2016. Equivalent queries with end dates 1391299200, 1412121600, 1451606400, and 1509840000 returned New Bloom in January 2014, Rekindling Soul in September 2014, Balance of Power in December 2015, and Dueling Fates in November 2017.

- Valve's patch datafeed gives 7.23 as November 2019 and 7.28 as December 2020, pointing to the Outlanders and Mistwoods pages. For reproduction, use [7.23 metadata](https://www.dota2.com/datafeed/patchnotes?version=7.23&language=english) and [7.28 metadata](https://www.dota2.com/datafeed/patchnotes?version=7.28&language=english).

- The direct patch feeds record 7.33 in April 2023, 7.36 in May 2024, 7.38 in February 2025, and 7.40 in December 2025. Their notes explicitly describe the expanded map and Twin Gates, the new facet and innate systems, and Wandering Waters. The pinned official Steam announcement feed links Largo's release to 7.40 in December 2025.

## Checks

- `node scripts/validate-flashback.mjs` passed for all 191 questions. The new check requires each card in these five questions to have a labelled direct primary source and requires the main source URL to match one reference.
- A before-and-after comparison confirmed that all five changes touch only `source`. Both answering and reveal payloads remain identical through `publicQuestionForRound`. All five `questionCalibrationRevision` values remain identical.
- No `https://www.dota2.com/` homepage citations remain in the file.
- `pnpm exec prettier --check scripts/validate-flashback.mjs` and `git diff --check` passed. The JSON file had existing multiline-array formatting that Prettier flags, also reproduced against the saved pre-change file. I kept that format to avoid changing unrelated data.

## Limits

The offline validator checks source structure and card coverage. It does not fetch URLs or establish historical truth. Primary sources were read during this task. Some modern Valve pages need JavaScript, so their exact patch datafeed URLs provide readable primary records. The Largo announcement uses a pinned official Steam feed because the old external-post ID did not resolve to a stable direct article. No UI source rendering was added.

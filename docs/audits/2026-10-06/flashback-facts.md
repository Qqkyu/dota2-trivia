# Flashback factual audit

Audit date: 2026-10-06. Scope: `src/data/flashback-questions.json`. Read-only review. No repository files changed.

## Result and coverage

Read the prompt, answers, keyed answer, and explanation for all 191 questions: 72 year questions, 98 choice questions, and 21 order questions. Checked selected suspect claims against Valve's patch pages, Valve's public patch-data API, Valve's match video, and contemporary reporting. The confirmed scored-answer defect is the Flying Courier question. Several explanations also teach incorrect history.

This is a complete manual reading of this file, not a source-by-source independent certification of all 191 records. Dates, biographical anecdotes, release order, and every tournament result were not all externally re-proved. The source counts below are a full-file computation. Browser rendering, question selection, answer submission, and scoring are outside this sub-audit.

## Confirmed findings

### F-FB-01, P2: Flying Courier has the wrong keyed answer

- ID: `flashback:flying-courier-gone`.
- Location: `src/data/flashback-questions.json:5218` and `:5225`.
- Prompt asks which shop item patch 7.23 removed when everyone received a courier.
- Data offers `Animal Courier`, `Flying Courier`, `Boots of Travel`, and `Town Portal Scroll`. It marks `Flying Courier` correct.
- Valve's 7.07 Dueling Fates notes already say that players can no longer buy the Flying Courier upgrade and that a courier upgrades automatically at three minutes. Patch 7.23 later made a personal courier automatic for each player.
- The correct offered answer for the 7.23 change is `Animal Courier`. The current data rewards the wrong answer and rejects the right one.
- Primary evidence: [Valve's 7.07 Dueling Fates notes, Courier section](https://www.dota2.com/duelingfates), [Valve's 7.23 Outlanders notes, Courier section](https://www.dota2.com/outlanders).
- Suggested correction: key `Animal Courier`, and describe removal of the purchasable team courier. Alternatively, ask which upgrade became automatic in 7.07 and retain `Flying Courier`.
- Repeatable check: compare the two official Courier sections with this row's prompt, answer list, `correctIndex`, and explanation.

### F-FB-02, P3: Shrine removal is assigned to the wrong patch

- ID: `flashback:shrines-700`.
- Location: `src/data/flashback-questions.json:2946`.
- Explanation says 7.23 removed Shrines. Valve removed the remaining Shrines in 7.24. The 7.23e notes separately removed the two non-Roshan Shrines.
- Primary evidence: [Valve's English 7.24 patch data](https://www.dota2.com/datafeed/patchnotes?version=7.24&language=english), [Valve's English 7.23e patch data](https://www.dota2.com/datafeed/patchnotes?version=7.23e&language=english).
- The data API returned `Removed Shrines` under 7.24. It returned removal of two non-Roshan Shrines under 7.23e. These responses were read directly during the audit.
- Impact: the answer `Shrines` remains correct, but the reveal teaches the wrong patch history.
- Suggested correction: change the final sentence to say 7.24 removed the remaining Shrines.

### F-FB-03, P3: The first Battle Pass explanation names the wrong event

- ID: `flashback:first-battlepass-year`.
- Location: `src/data/flashback-questions.json:2487`.
- Explanation calls the TI2016 Battle Pass the first product sold under that name. The Winter 2016 Battle Pass already existed before the Shanghai Major.
- Primary evidence: [Valve's Winter 2016 Battle Pass page](https://www.dota2.com/winter2016?l=english). The page names the Winter 2016 Battle Pass and its included Shanghai Major Compendium.
- Impact: year answer `2016` remains correct, but the reveal teaches the wrong first product. The cited TI2016 page does not prove that it was first.
- Suggested correction: name the Winter 2016 Battle Pass and its Shanghai Major Compendium.

### F-FB-04, P3: The Play is assigned to the TI2 grand final

- ID: `flashback:ti2-year`.
- Location: `src/data/flashback-questions.json:4272`.
- Explanation says The Play occurred in game two of the TI2 final. It occurred in game two of the winners' bracket semifinal between iG and Na'Vi.
- Primary evidence: [Valve's official match recording, titled Winner Bracket Semifinals](https://www.youtube.com/watch?v=La--egn0MrU). The recording is on the verified `dota2` channel, published 2012-09-01.
- Impact: year answer `2012` remains correct, but the reveal joins the winning grand-final result to a different match.
- Suggested correction: use the winners' bracket semifinal in the final sentence.

### F-FB-05, P3: Techies' exact release date is wrong

- ID: `flashback:techies-year`.
- Location: `src/data/flashback-questions.json:209`.
- Explanation says Techies arrived on 21 August 2014. The main-client release was 4 September 2014.
- Evidence: [Matthew Bailey's contemporary 4 September patch analysis](https://www.gamespot.com/articles/dota-2-4th-september-patch-content-analysis/1100-6438363/) reports and documents the new hero entering the main client. [Valve's Techies update page](https://www.dota2.com/techies/) documents that update but does not itself expose the release date in the parsed page. [Liquipedia's client patch list](https://liquipedia.net/dota2/Client_Patches) agrees with 4 September.
- Evidence qualification: the exact day is supported by a first-hand contemporary patch analysis and an independent index, rather than a dated Valve announcement fetched in this audit.
- Impact: year answer `2014` remains correct. The precise date in its reveal is false.
- Suggested correction: use 4 September 2014, or omit the day and month if the content process only validates years.

### F-FB-07, P3: Refresher Shard explanation retains a removed effect

- ID: `flashback:refresher-shard`.
- Location: `src/data/flashback-questions.json:5128`.
- Explanation says the shard resets item and ability cooldowns. Patch 7.41 removed its ability to refresh items.
- Primary evidence: [Valve's English 7.41 patch data](https://www.dota2.com/datafeed/patchnotes?version=7.41&language=english). The entry for item ability ID 260 says `Reset Cooldowns no longer refreshes items`.
- The parent content audit identified the entry as Refresher Shard, checked against its Liquipedia item record. This sub-audit independently read the API entry.
- Impact: `Refresher Shard` remains the correct offered answer. The present-tense reveal teaches obsolete gameplay despite the row's `7.41e` patch tag.
- Suggested correction: say it resets ability cooldowns, or anchor the whole question and explanation to a historical patch before 7.41.

## Source and wording maintenance

### F-FB-06, P3: Several citations cannot directly substantiate their rows

Full-file counts:

| Source characteristic | Questions |
| --- | ---: |
| Dota 2 homepage only | 9 |
| Old `dota2.fandom.com` URLs | 27 |
| Raw URL used as source label | 25 |
| Liquipedia source domain | 63 |
| Wikipedia source domain | 40 |
| `www.dota2.com` source domain, including the homepage rows | 44 |

Examples include the Techies date pointing to the homepage at line 217, Shrine history pointing to a general Game Versions page at line 2953, and The Play pointing to the broad International article at line 4280. A publisher homepage is not evidence for a historical date. General pages also make errors harder to trace.

These counts do not prove that every Fandom link is broken or every secondary source is wrong. This sub-audit did not run a complete HTTP link test. Prefer a claim-specific official release, patch note, tournament record, or original interview, plus a checked date. Keep `source.label` readable.

### Wording to improve, without treating it as a scored-answer defect

`flashback:stockholm-planned`, line 5474, compresses the postponement and move into "COVID moved it to Bucharest in 2021." Valve's own account distinguishes the pandemic postponement from Sweden's later refusal to classify TI10 as an elite sporting event, which prevented reliable entry and visas. The answer `Stockholm` is correct. A more exact explanation should distinguish the two events. Primary source: [Valve's update on TI10 in Sweden](https://www.dota2.com/newsentry/2992060508108464823). The text was also read through Valve's Steam community-announcement feed.

`flashback:odpixel-fogged`, line 6282, is an all-time record claim, but its citation at line 6297 is one edition of TI. `flashback:back-to-back`, line 882, and `flashback:longest-pro-game`, line 6228, also contain unbounded record claims. Add an as-of date and keep evidence that supports the record. No incorrect record answer was established in this audit.

## Checks that did not become findings

- The 15 versus 16 December 2025 Largo date varies with publication date and timezone. Did not classify the day as an error.
- Dota Plus has 12 versus 13 March 2018 publication dates in sources. A dated Valve Steam release uses 13 March. Did not classify the row as wrong.
- Did not classify the first-Arcana particle-effects statement as false. It requires a narrower definition and stronger evidence than was collected.
- Did not classify the exact longest-match duration as wrong. Secondary sources differ, and the original match timing was not independently read.
- Read the public 7.39, 7.40, and 7.41 patch data for Roshan changes. No false Roshan drop answer was established. The follow-up item-specific check found the obsolete Refresher Shard effect described above. This is not a complete revalidation of current item drops.

## Audit method

Local checks used Python's JSON parser and line lookup by question ID. This loaded all 191 rows, counted kinds and source domains, and printed prompt, offered answers, keyed answer, and explanation for manual reading. Source data was read with web search and direct HTTP GETs to Valve's public patch-data and news APIs. The default shell lacked DNS access; authorized read-only network calls succeeded. No private data, keys, or accounts were used.

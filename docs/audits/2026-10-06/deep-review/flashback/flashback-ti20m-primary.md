# TI prize-pool threshold primary-source check

Reviewed on 2026-10-06. Question ID `flashback:ti20m` asks which year a TI prize pool first passed $20 million. The retained answer, **2016**, is verified by the recordkeeper's own published finding.

## Evidence

1. [Guinness World Records, Highest-earning esports nation](https://www.guinnessworldrecords.com/world-records/775490-highest-earning-esports-nation). The record page identifies The International 2016, gives its prize pool as $20.77 million, and calls it "the first esports tournament to offer more than $20 million in prize money". This directly supports the year and the first-event condition. The page's record date is 5 February 2025.
2. [Guinness World Records, TI2016 certification article](https://www.guinnessworldrecords.com/news/2016/10/chinese-gaming-team-wins-largest-prize-for-an-esports-competition-ever-448932). Rachel Swatman's article, published on 28 October 2016, records a $20,770,460 prize pool and certifies the largest esports prize pool. It states that TI2016 broke the previous year's record. This is contemporary confirmation from the organization that issued the record certificates.
3. [Valve, The International 2016 Battle Pass](https://www.dota2.com/international2016/battlepass?l=english). The prize-pool section identifies the prior year's total as $18,429,613 and describes the annual esports prize-pool record. It supports the previous record being below $20 million. Its present $1,600,000 current-total display is a stale fallback and is not evidence of the final TI2016 total.

The first source alone establishes the first-event condition. The other two sources independently support the final amount and prior record. No inference from an incomplete series of tournament totals is needed.

## Retained evidence

All three full HTML responses were fetched successfully with HTTP 200. Their exact bytes, URLs, observation date, sizes, and SHA-256 hashes are in `flashback-ti20m-sources/manifest.json`. The saved HTML was parsed locally and checked for the event, amount, and first-record text.

| Saved response | Bytes | SHA-256 |
| --- | ---: | --- |
| `guinness-highest-earning-esports-nation.html` | 31099 | `4649de36bc6743ebfa9396833f686b464e999f2da7664759239ec68a06800831` |
| `guinness-ti2016-certification.html` | 33567 | `84ac05badcfa9b1a66da05fdd7581ef9417d77817182e13aa4f08f6edec4c1d8` |
| `valve-ti2016-battlepass.html` | 122673 | `9a87a0543e059c9bbfb24985d03c66c67e22ffa79b3f8b42637247fd214bba9b` |

## Recommendation and limits

Keep the question and answer. Use the Guinness record page as its direct source, with the certification article as supporting evidence in the ledger. This closes the primary-source gap without using the unavailable Washington Interactive Network PDF, a wiki, or a search excerpt alone. Guinness is the recordkeeper, not the event organizer. No app files were changed in this research.

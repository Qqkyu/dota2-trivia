# History finding disposition

Checked on 6 October 2026 against the current Flashback records. All six claims are supported. The second review found missing evidence, not a new incorrect answer. No catalog or ledger changes are needed.

| Record | Exact primary evidence | Decision |
| --- | --- | --- |
| `flashback:flying-courier-gone` | In [cited-primary-pages.json](../flashback/cited-primary-pages.json), select the `https://www.dota2.com/duelingfates` key and its `text` field. The title identifies 7.07. Under Item Changes, Courier: “Flying Courier upgrade can no longer be purchased.” The next sentence says the upgrade becomes automatic at three minutes. [Valve source](https://www.dota2.com/duelingfates). | Retain. This explanation distinguishes the earlier Flying Courier upgrade removal from the Animal Courier change in 7.23. |
| `flashback:shrines-700` | In the same archive, select the `https://www.dota2.com/datafeed/patchnotes?version=7.24&language=english` key, then parse its `text` as JSON. `general_notes[0].generic[7].note` is “Removed Shrines”. The response identifies patch 7.24. [Valve source](https://www.dota2.com/datafeed/patchnotes?version=7.24&language=english). | Retain. The current explanation correctly gives 7.24 for removal of the remaining Shrines. |
| `flashback:refresher-shard` | In the same archive, parse the 7.41 patch response. `items[10].ability_id` is `260`; `items[10].ability_notes[0].note` is “Reset Cooldowns no longer refreshes items”. The archived [Valve API bundle](../sources/valve-api-2026-10-06.tar.gz), member `itemlist.json`, maps `result.data.itemabilities[207].id = 260` to `name = item_refresher_shard` and `name_loc = Refresher Shard`. [Patch source](https://www.dota2.com/datafeed/patchnotes?version=7.41&language=english), [item-name source](https://www.dota2.com/datafeed/itemlist?language=english). | Retain. Both the change and the numeric item identity are established by Valve data. |
| `flashback:odpixel-fogged` | In [cited-valve-news.json](../flashback/cited-valve-news.json), select `gid = 2597949245060857650`. Its title names the TI2019 True Sight premiere. Its `contents` says the event is “hosted by Grand Finals casters ODPixel and Fogged”. [Exact Valve API source](https://api.steampowered.com/ISteamNews/GetNewsForApp/v2/?appid=570&count=2&maxlength=0&enddate=1580113725&feeds=steam_community_announcements). | Retain the current TI9 question. The earlier claim about the most finals was removed and is not asserted. |
| `flashback:longest-pro-game` | The original [ending frame](../flashback/flashback-primary/long-match-119m50.png), at video time 1:59:50, shows C9 against ScaryFaceZ, a game clock of 3:20:34, and credits for ODPixel and Purge. The [compact source metadata](../flashback/flashback-primary/LSLqy4iVkdQ.metadata.json) identifies Beyond the Summit, game 2, STLV12 EU and the March 2015 upload. [Original broadcast](https://www.youtube.com/watch?v=LSLqy4iVkdQ&t=7190s). | Retain the current question. It asks about this match, without an all-time record or a Sheever casting claim. |
| `flashback:ti2-year` | The [ledger](../flashback/flashback-ledger.json) records Valve's exact match URL. The original video metadata was retrieved again for this disposition; its primary title explicitly names game two and the winners' bracket semifinal. The compact result is below. [Valve recording](https://www.youtube.com/watch?v=La--egn0MrU). | Retain the corrected semifinal wording. The earlier grand-final wording was removed. |

The TI2 archive previously contained the exact URL and review finding, but no retained video metadata. This fresh read supplies that missing evidence locator:

```json
{
  "id": "La--egn0MrU",
  "title": "iG vs Na`Vi Game 2, Winner Bracket Semifinals - The International - English Commentary",
  "uploader_id": "@dota2",
  "channel_id": "UCTQKT5QqO3h7y32G8VzuySQ",
  "upload_date": "20120902"
}
```

The date above is the metadata's UTC upload date. It is not an assertion about the match's local start date. This read confirmed the bracket title; it did not replay the entire match. The [original media follow-up](../flashback/flashback-primary-review.md) gives the other broadcast checks and their limits.

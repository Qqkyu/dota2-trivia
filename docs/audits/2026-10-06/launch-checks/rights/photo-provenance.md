# Flashback photo and mark provenance

Reviewed on 6 October 2026. This pass covers all 23 originals listed in [the quarantine manifest](quarantine-manifest.json). It makes no app or asset changes. The expected result is a record for every asset with its hash, source, creator and permission status. A byte match must use SHA-256; a resized or recompressed resemblance must remain a separate result.

Seven winner files match Valve's published image bytes exactly. Eight files match the composition of a published photograph after resizing or recompression. One venue photo has an unconfirmed source candidate. Seven assets still have no established exact source. The [per-asset JSON](photo-provenance.json) records the URLs, comparison results, introduction commits and remaining gaps. The [primary evidence index](photo-primary-evidence.json) records the inspected license pages and their hashes.

## Confirmed license evidence

`ti1-gamescom.jpg` matches the composition of ["valve's booth next door"](https://www.flickr.com/photos/designducky/6073132468/). The photographer's current Flickr page names designducky and publishes CC BY-SA 2.0. [The Commons mirror](https://commons.wikimedia.org/wiki/File:The_International_Dota_2_video_game_tournament.jpg) records the photographer as YJ and the same license. The local image is a transformed match, not a proven identical download. Reuse requires attribution and compliance with the license, including share-alike where applicable. [CC BY-SA 2.0 terms](https://creativecommons.org/licenses/by-sa/2.0/).

`ti-seattle.jpg` matches [Jakob Wells's TI4 photograph](https://www.flickr.com/photos/jakobwells/14516251507/). The photographer's page publishes CC BY 2.0. [The Commons mirror](https://commons.wikimedia.org/wiki/File:The_International_2014.jpg) names Wells, dates the image to 18 July 2014 and identifies KeyArena. This image previously appeared on TI2 and TI3 questions. It must not return as an illustration of those events. Reuse requires the license's attribution and other conditions. [CC BY 2.0 terms](https://creativecommons.org/licenses/by/2.0/).

The official Flickr sources matched to [`ti9-og.jpg`](https://www.flickr.com/photos/dota2ti/48617255962/) and [`ti10-spirit.jpg`](https://www.flickr.com/photos/dota2ti/51600685519/) each display "All rights reserved". Their account is Dota 2 The International; the individual photographers remain Unknown. No separate permission for this app was found. Flickr instructs users to check the license attached to each photo and obtain permission where required. [Flickr's image-use guidance](https://www.flickrhelp.com/hc/en-us/articles/10710266545556-Using-Flickr-images-shared-by-other-members).

## Asset results

All names below are relative to the former `public/arcade/flashback/` directory. The originals remain in `.local-assets/flashback-originals/`.

| Asset                         | Source result                                               | Creator and license result                |
| ----------------------------- | ----------------------------------------------------------- | ----------------------------------------- |
| `ti-seattle.jpg`              | Transformed match to Jakob Wells's Flickr photo 14516251507 | Jakob Wells; CC BY 2.0                    |
| `ti1-gamescom.jpg`            | Transformed match to Flickr photo 6073132468                | YJ / designducky; CC BY-SA 2.0            |
| `ti5-keyarena.jpg`            | Unconfirmed Commons candidate                               | Unknown for this asset                    |
| `ti8-vancouver.jpg`           | Unknown                                                     | Unknown                                   |
| `winners/boston-og.jpg`       | Exact Valve article image                                   | Photographer and license Unknown          |
| `winners/falcons.png`         | Unknown                                                     | Designer and license Unknown              |
| `winners/frankfurt-og.jpg`    | Exact Valve article image                                   | Photographer and license Unknown          |
| `winners/kiev-og.jpg`         | Exact Valve article image                                   | Photographer and license Unknown          |
| `winners/manila-og.jpg`       | Exact Valve article image                                   | Photographer and license Unknown          |
| `winners/shanghai-secret.jpg` | Exact Valve article image                                   | Photographer and license Unknown          |
| `winners/spirit.png`          | Unknown                                                     | Designer and license Unknown              |
| `winners/ti10-spirit.jpg`     | Transformed official Flickr match                           | Photographer Unknown; all rights reserved |
| `winners/ti11-tundra.jpg`     | Exact Valve article image                                   | Photographer and license Unknown          |
| `winners/ti12-spirit.jpg`     | Transformed Valve article match                             | Photographer and license Unknown          |
| `winners/ti13-liquid.jpg`     | Exact Valve article image                                   | Photographer and license Unknown          |
| `winners/ti14-falcons.jpg`    | Transformed Valve article match                             | Photographer and license Unknown          |
| `winners/ti3-alliance.jpg`    | Git note names dota2ti; exact photo Unknown                 | Photographer and license Unknown          |
| `winners/ti5-eg.jpg`          | Git note names dota2ti; exact photo Unknown                 | Photographer and license Unknown          |
| `winners/ti7-liquid.jpg`      | Transformed Valve article match                             | Photographer and license Unknown          |
| `winners/ti8-og.jpg`          | Transformed Valve article match                             | Photographer and license Unknown          |
| `winners/ti9-og.jpg`          | Transformed official Flickr match                           | Photographer Unknown; all rights reserved |
| `winners/tundra.png`          | Unknown                                                     | Designer and license Unknown              |
| `winners/wings.png`           | Unknown                                                     | Designer and license Unknown              |

The exact Valve matches come from the official [Frankfurt](https://store.steampowered.com/news/app/570/view/377536659007548439), [Shanghai](https://store.steampowered.com/news/app/570/view/295355202054110079), [Manila](https://store.steampowered.com/news/app/570/view/3819571008275229825), [Boston](https://store.steampowered.com/news/app/570/view/3819571008275060558), [Kiev](https://store.steampowered.com/news/app/570/view/3819571008275059440), [TI11](https://store.steampowered.com/news/app/570/view/4706851091188574456) and [TI13](https://store.steampowered.com/news/app/570/view/6341720536507758661) winner articles. The JSON records each article's image URL and the matching hash. Hosting by Valve does not identify the photographer or establish an image-specific permission grant.

The TI5 venue candidate is [Zilsonzxc's own-work Commons upload](https://commons.wikimedia.org/wiki/File:The_International_2015,_Key_Arena,_Seattle,_Washington_D.C..jpg), which displays CC BY-SA 4.0. Its thumbnail could not be downloaded for an identity check, so that license is not assigned to the local asset. The initially suspected Seattle source, `Crowd_at_TI4.jpg`, was rejected because it shows a different camera angle. Its license is not used as evidence for `ti-seattle.jpg`.

## Checks and limits

All 23 preserved files still match the quarantine manifest's byte length and SHA-256. Git history and embedded metadata were checked for all 23. No acquisition script or complete download log was found. Photoshop metadata in the five Major photos names software, not a photographer. The Seattle file's embedded artist value is literally `unknown`; the photographer identification comes from the matched primary source.

The exact Valve matches use identical SHA-256 hashes. Transformed matches use the same photograph composition and low mean RGB difference after resizing. Their conversion commands and actual acquisition URLs remain Unknown. The Commons thumbnail hosts returned HTTP 403, so venue comparisons used available photographer thumbnails where possible. The Flickr search covered selected pages from the relevant albums, not every photograph in those albums.

No photo bytes were added to this report folder. Reference downloads remain under `/tmp/queue-arcade-launch-checks/photo-sources/`. No rights holder was contacted and no license was bought. Keep the originals outside public output. The two confirmed Creative Commons sources provide possible future reuse paths, subject to their conditions. The current app replacements avoid any need to restore them for launch.

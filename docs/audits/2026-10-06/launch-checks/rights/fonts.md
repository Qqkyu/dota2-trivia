# Bundled font license check

Reviewed on 6 October 2026. All four font files were read. The expected result was an exact inventory of their source, version and embedded license fields, with no font or layout changes. [The JSON](fonts.json) records all extracted fields and hashes.

Geist and Geist Mono are both version `1.200`. Their local WOFF files match the official [Create Next App 14.2.15 Geist file](https://raw.githubusercontent.com/vercel/next.js/v14.2.15/packages/create-next-app/templates/app/ts/app/fonts/GeistVF.woff) and [Mono file](https://raw.githubusercontent.com/vercel/next.js/v14.2.15/packages/create-next-app/templates/app/ts/app/fonts/GeistMonoVF.woff) byte for byte. That also matches this repository's initial Next.js dependency and commit from 14 October 2024.

The decompressed font tables match the [Geist 1.2.0 release](https://github.com/vercel/geist-font/releases/tag/1.2.0), commit `63b548e95d4821c66fb74f9f93c7c8a693d48301`. Every Mono table is identical. For Sans, only bytes in the checksum and modification-time fields of `head` differ. The glyph, naming and all other tables are identical. The embedded designer fields name Basement.studio, Andres Briganti and Mateo Zaragoza. Neither local font has copyright or license text in its `name` table.

The matching historical [license](https://raw.githubusercontent.com/vercel/geist-font/63b548e95d4821c66fb74f9f93c7c8a693d48301/LICENSE.txt) is SIL Open Font License 1.1, with the 2023 Vercel and basement.studio copyright statement. It permits embedding and distribution with software, subject to its conditions. Each distributed copy must include the copyright notice and license. It does not require the app itself to use the OFL.

The complete historical notice was added, without modification, at `src/app/fonts/OFL-Geist.txt` and `public/fonts/OFL-Geist.txt`. Both copies are 4,368 bytes, SHA-256 `930853ee1daa68554d9e35c8a9175affb74f699fad9a5da6ee5ebe76379d9137`. The public copy is available at `/fonts/OFL-Geist.txt` when the app serves its public files.

Both Radiance OTF copies are identical, version `1.000`. They name Valve Corporation as the copyright and trademark holder and YouWorkForThem as the designer and manufacturer. Name ID13 expressly refers to the Steam Subscriber Agreement:

> Like other Valve game content, you may use this font to create Fan Art, as described in the Steam Subscriber Agreement.

[Section 2.D](https://store.steampowered.com/subscriber_agreement/#2) permits noncommercial fan art incorporating Valve game content. This is a specific permission in the local font, so it should not be described as having no license evidence. It does not establish unrestricted commercial permission. The project retains Radiance for the current noncommercial fan-app scope on this basis. This records the project decision; it does not claim an unrestricted font license.

The local Radiance acquisition URL is still Unknown. The introduction commit does not record it. [Valve's official Radiance WOFF](https://cdn.steamstatic.com/apps/dota2/fonts/radiance-bold.woff) was checked, but it is a different font binary. Its metadata restricts that webfont to CSS use and excludes desktop publishing. Its contents are not proof of the local OTF's acquisition history, and its hosting does not by itself grant redistribution permission.

The check used a small SFNT/WOFF metadata parser and `fc-scan`. All four font hashes remain unchanged. The two Radiance copies are identical. Both new Geist notices match the pinned historical license bytes. No font binary, CSS or application flow changed. No purchase or contact with a rights holder was made.

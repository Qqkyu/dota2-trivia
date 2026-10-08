# Asset rights and provenance check

The concrete photo issue is closed by removing the affected images from the app. We preserved all 23 original files, byte for byte, in `.local-assets/flashback-originals/`. This directory is outside `public` and is excluded from Git additions and the Docker build context. It must not be published. The audit retains only file paths, hashes and source records.

The change affects 32 Flashback questions and 47 image fields:

- Four venue photos, used in 14 prompts, now use an original tournament card with no date, city or winner clue.
- All 21 winner reveals use original text cards. Winner names and event captions remain intact.
- Eight team cards and four city cards in three ordering questions use original graphics. No Flashback team-logo URL remains.

Thirteen SVG files provide these replacements. They contain basic geometry and plain text, with no embedded photos, team logos, third-party vectors or font files. The winner cards appear only after the answer deadline. The [replacement list](replacements.json) gives every old and new field and each new asset hash. The [quarantine manifest](quarantine-manifest.json) records all 23 preserved originals. Their previous public URLs no longer exist in the source tree.

All 13 original graphics decoded in Chromium and were visually inspected in the [rendered gallery](original-art-gallery.png). The labels fit within the cards, and no external asset was needed.

All 191 question IDs, prompts, answers, marked answers, explanations, dates, orderings and fact citations are unchanged. [Comparison results](replacement-checks.json) record this check against the [pre-change catalog](flashback-before-rights.json). Earlier audit archives remain unchanged and describe the earlier app state.

The first focused test run failed on the old public assets and absent replacement cards. After the changes, 12 tests passed, including executable/external SVG rejection, all-question playability and reveal-only winner delivery. Both Flashback and public-question validators passed. [Initial failures](tests-red.log), [passing tests](tests-green.log), [Flashback validator](validate-flashback.log), [delivery validator](validate-question-delivery.log).

Production build `NsjBPH5Ygi5SqnYfuwSHz` passed all 256 browser states. These cover the 32 changed questions during answering and reveal at 320×568, 390×844, 568×320 and 1440×1000. All replacement images loaded. There was no horizontal overflow or clipped explanation or caption. The checks confirmed access to the first and last explanation lines, the report button and the mobile timer. All 13 SVG responses matched their hashes, and all 23 retired image URLs returned HTTP 404. [Browser results](browser/results.json), [all-image presence comparison](browser/image-presence-check.json), [passing log](browser-check.log), [repeatable check](check-flashback-art.mjs.txt).

Visual review found that the old mobile media grid left only 54 of 232 pixels for the TI1 explanation. The mobile grid now gives the explanation the full 232 pixels below the image. The width check failed before the fix and passed afterward. [Failing check](browser-width-red.log), [before screenshot](browser-before-media-fix/320-flashback-ti7-winner-reveal.png), [after screenshot](browser/320-flashback-ti7-winner-reveal.png).

The same review found that year reveals kept the default or wrong submitted year in large type. The year board now names the correct year and shows the player's choice separately. All six new unanswered, wrong and correct answer cases passed at phone and desktop widths. The [year review](year-reveal.md) records the failure, fix and screenshots. The [standard Flashback flow](standard-flashback-browser.log) also passed ordering, explicit year locking and winner-reveal checks.

These browser checks use the real production page, CSS and assets with controlled question responses. They do not test a physical phone, Steam login, database writes or scoring. The standard fixture supplies synthetic crowd and point values. Two setup failures were also preserved: the first runner used mismatched question/round IDs, and a later run tried to click the disabled automatic Joining button. The runner now uses matching IDs and waits through Joining. These were test setup failures. [Initial fixture failure](browser-fixture-setup.log), [Joining failure](browser-hydration-setup.log).

The [verification record](verification.json) names the final build, checks and hashes of the source and evidence files.

The app still uses Valve artwork and audio. The [published-terms review](valve-terms.md) explains the noncommercial fan-art terms and their limits. It does not use the video or streaming policies as permission to distribute individual assets. The [photo provenance review](photo-provenance.md) distinguishes exact source evidence from missing reuse permission. A source or credit is not a license.

The [font check](fonts.md) traced both Geist WOFF files to exact official template bytes and added their full historical Open Font License. Radiance's embedded metadata expressly permits Fan Art under the Steam Subscriber Agreement. All four font binaries remain unchanged. No font replacement or font-related layout change was needed.

The removal closes the identified photo/team-logo use without asking the user to obtain those permissions. It does not assert that all remaining game assets have an unrestricted license. No purchase, payment, outreach, deployment or publication was performed.

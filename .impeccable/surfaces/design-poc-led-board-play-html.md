---
version: 1
slug: "design-poc-led-board-play-html"
primary_target: "design/poc/led-board/play.html"
related_targets: ["design/poc/led-board/index.html"]
---

# Surface brief: Queue Arcade LED-board proof of concept

Scope: a standalone static prototype under `design/poc/led-board/` (lobby `index.html`, round `play.html`). Visitor mode: Experience. It exists so the maintainer can compare a second visual world against the shipped Dota-pastiche app. It changes nothing in the Next.js app.

Audience and job: a Dota 2 player in a browser beside the Dota client, waiting for Accept, glancing over to answer a 15-second round and see how the room split. Proof and content: real catalog questions, real hero and item art from the public Dota asset hosts, real format names, no invented stats.

Constraints: the app is untouched; nothing may move between answering, locked, and reveal phases; four answer cells are the only primary action during a round; A–D keys work; mute and volume stay reachable.

Unresolved: party room, profile, calibration, and eight of the ten formats are not prototyped.

## Direction contract

THESIS: The arcade is an arena ribbon board: one continuous light-emitting band that every player in the room reads at once, where the clock, the question, and the crowd's split are the same material. It refuses the dark dashboard of bordered cards with one glowing accent and a mono countdown.

OWN-WORLD: Matte black LED modules with visible panel seams. Everything that changes is light: amber for live answering, white for locked and waiting, green for correct, red for wrong, white-gold reserved by law for the 2x crowd-breaker. Numbers in a dot-matrix face (Doto); words in condensed arena signage caps (Barlow Condensed) with Barlow for reading text. Unlit ghost dots are drawn. No gradients, no borders as state, no glow halos. Hero and item art sits in video-board modules.

STORY: The player sees one shared clock draining cell by cell, reads the question in signage caps, lights one cell, and watches the band flip colour as the whole room's split draws itself in dots. They understand that everyone saw the same thing, that they are scored against the crowd, and that they can leave at any second.

FIRST VIEWPORT: Play at 1440x900. A full-width fascia ticker across the top (room pulse, patch, next format). Below it the board: the left third holds the dot-matrix clock over a 15-cell time bar; the right two thirds hold the question in signage caps beside the item-art module. Under both, one row of four answer cells spans the full width, each a lit keycap A to D plus its label. The bottom band is the session scoreboard: points, streak, rounds. The four cells are the primary action; nothing else is clickable during a round.

FORM: Arena LED ribbon board, candidate 3 of 6 grounded directions; seed:59c1eea2ee114265. Raises from the hand it beat: continuous time axis (daylight section): the clock is also a spatial bar; provenance ticket (moon-shadow bazaar): every question carries its patch ticket; state palette law (CRT arcade cabinet): one colour per state, never decoration; honest weight (collider event display): split bars draw one dot per percent; flat-field commitment (Blue Note sleeve): the reveal drenches the whole band; decisive beat (manga page): the full-band colour change happens only at reveal.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance.

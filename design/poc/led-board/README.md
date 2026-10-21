# Queue Arcade LED-board concept

A standalone proof of concept for a second visual world: the arcade as an arena LED
ribbon board. It is static HTML, CSS, and a small demo script. It touches nothing in the
Next.js app.

## View it

```bash
python3 -m http.server 3470 --bind 127.0.0.1 --directory design/poc/led-board
```

Open <http://127.0.0.1:3470/index.html> for the lobby and
<http://127.0.0.1:3470/play.html> for the round loop. The same pages with the Dota skin are
<http://127.0.0.1:3470/index-dota.html> and <http://127.0.0.1:3470/play-dota.html>.

## Two layers

`board.css` is the shell: the clock over a time bar, cells that light by fill, one dot per
percent in every split bar, one full-band colour flip at reveal, and fixed space for every
phase so nothing moves. `theme-dota.css` is the Dota 2 skin, loaded after it on pages with
`body.skin-dota`. It dresses the shell in the client's own rituals: Radiance type and the
Dota 2 logo (both Valve's, used at the maintainer's decision), the HUD top bar with Radiant
and Dire scores around the clock and the day-night dial (sun while answering, moon at
reveal), answer cells as ability slots with hotkey badges and a cooldown sweep once an
answer is locked, gold with the coin, kill-streak names from the app's announcer (Killing
Spree, Dominating, and so on), the pick screen grouped by Strength, Agility, Intelligence,
and Universal, fog of war on the Fogged Vision portrait, and the Find Match green on the
lobby's primary action. `board.js` reads `body.skin-dota` for the grouped hero grid, the
cooldown, the dial, and the HUD scores. A second game pack would ship its own skin file
and leave the shell alone. The round loop runs on its own:
3 seconds of entry countdown, a 15-second Classic Trivia round, an 8-second reveal, then a
Fogged Vision round with the hero grid, then it repeats. Press A to D or click a cell to
lock an answer. In Fogged Vision, type a hero name and press Enter when one hero is left.

## What is real and what is synthetic

Real: the two questions and their marked answers, explanations, and patch stamp (taken from
`src/data/questions.generated.json`), the 127 hero names and crops, the item icon, the ten
format names and descriptions, and the scoring rules named on the lobby.

Synthetic, labelled on the ticker: the room count (41), the crowd split percentages, the
starting points, streak, and round counters. No sounds play. The Steam, party, and privacy
links go nowhere.

## Assets and provenance

- `fonts/`: Barlow, Barlow Condensed, Doto, and Cinzel, downloaded from Google Fonts, SIL
  Open Font License 1.1 (latin subsets only). `fonts/radiance-bold.otf` is Valve's Dota 2
  UI face, copied from `public/fonts/` in this repository; the repository holds no licence
  for it.
- `assets/dota2-logo.png` is the app icon from `src/app/icon.png`, Valve's Dota 2 mark.
- Attribute icons on the pick screen load from the public Dota asset host, as the app does.
- Hero primary attributes in `heroes.js` come from the OpenDota hero constants.
- `assets/steam-sign-in.png`: Valve's official "Sign in through Steam" button, copied from
  `public/assets/steam-sign-in.png` in this repository.
- Hero and item artwork is loaded from the public Dota 2 asset host, as the app does.
- `heroes.js` is generated from the Fogged Vision entries in
  `src/data/questions.generated.json`.

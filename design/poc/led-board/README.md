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
phase so nothing moves. `theme-dota.css` is a skin loaded after it. It changes material
only: the client's dark slate, shop gold for live, Radiant green for right, Dire red for
wrong, attribute colours on hero tiles, gold hairline frames, Cinzel for titles, and the
Find Match green on the lobby's primary action. A second game pack would ship its own skin
file and leave the shell alone. Valve's Radiance font was not used; the repository has no
licence for it. The round loop runs on its own:
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
  Open Font License 1.1 (latin subsets only).
- Hero primary attributes in `heroes.js` come from the OpenDota hero constants.
- `assets/steam-sign-in.png`: Valve's official "Sign in through Steam" button, copied from
  `public/assets/steam-sign-in.png` in this repository.
- Hero and item artwork is loaded from the public Dota 2 asset host, as the app does.
- `heroes.js` is generated from the Fogged Vision entries in
  `src/data/questions.generated.json`.

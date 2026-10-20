---
name: Queue Arcade LED board
description: Arena LED ribbon-board concept for the Queue Arcade public room. Matte black modules, amber light, dot-matrix numerals, instant state swaps.
colors:
  amber: "#ffb000"
  lit: "#f6f2e8"
  green: "#3fe36f"
  red: "#ff3b3b"
  gold: "#ffe08a"
  ground: "#101010"
  module: "#000000"
  ghost: "#1b1b1b"
  ghost-2: "#292929"
  seam: "rgba(255, 255, 255, 0.05)"
  seam-strong: "rgba(255, 255, 255, 0.14)"
  text: "#ece7db"
  text-2: "#a99f8b"
  text-3: "#8f8676"
typography:
  display:
    fontFamily: "Barlow Condensed, Arial Narrow, sans-serif"
    fontSize: "clamp(2.75rem, 5.2vw, 4.75rem)"
    fontWeight: 800
    lineHeight: 0.92
    letterSpacing: "0.01em"
  headline:
    fontFamily: "Barlow Condensed, Arial Narrow, sans-serif"
    fontSize: "clamp(2.25rem, 3.6vw, 3.25rem)"
    fontWeight: 700
    lineHeight: 0.95
    letterSpacing: "0.01em"
  clock:
    fontFamily: "Doto, Courier New, monospace"
    fontSize: "clamp(5.5rem, 9vw, 8.75rem)"
    fontWeight: 800
    lineHeight: 0.9
    letterSpacing: "0.02em"
    fontFeature: "tnum"
  title:
    fontFamily: "Barlow Condensed, Arial Narrow, sans-serif"
    fontSize: "1.75rem"
    fontWeight: 600
    lineHeight: 1
    letterSpacing: "0.02em"
  state:
    fontFamily: "Barlow Condensed, Arial Narrow, sans-serif"
    fontSize: "1.25rem"
    fontWeight: 700
    letterSpacing: "0.12em"
  body:
    fontFamily: "Barlow, Helvetica Neue, Arial, sans-serif"
    fontSize: "1.125rem"
    fontWeight: 400
    lineHeight: 1.4
    letterSpacing: "normal"
  label:
    fontFamily: "Barlow Condensed, Arial Narrow, sans-serif"
    fontSize: "1rem"
    fontWeight: 600
    letterSpacing: "0.12em"
  caption:
    fontFamily: "Barlow Condensed, Arial Narrow, sans-serif"
    fontSize: "0.8125rem"
    fontWeight: 600
    letterSpacing: "0.12em"
  numeral:
    fontFamily: "Doto, Courier New, monospace"
    fontSize: "1.75rem"
    fontWeight: 800
    lineHeight: 1
    letterSpacing: "normal"
    fontFeature: "tnum"
rounded:
  none: "0"
spacing:
  dot-gap: "2px"
  xs: "4px"
  sm: "8px"
  md: "12px"
  lg: "16px"
  xl: "24px"
  2xl: "28px"
  ticker: "40px"
components:
  fascia:
    backgroundColor: "{colors.module}"
    height: "56px"
  sign:
    textColor: "{colors.amber}"
    padding: "0 24px"
  ticker:
    textColor: "{colors.text-2}"
    typography: "{typography.label}"
  module:
    backgroundColor: "{colors.module}"
    padding: "24px 28px 28px"
    rounded: "{rounded.none}"
  clock:
    textColor: "{colors.amber}"
    typography: "{typography.clock}"
  timebar-cell:
    backgroundColor: "{colors.ghost-2}"
    height: "14px"
  timebar-cell-lit:
    backgroundColor: "{colors.amber}"
  answer-cell:
    backgroundColor: "{colors.module}"
    textColor: "{colors.lit}"
    height: "128px"
    padding: "16px 18px 12px"
    rounded: "{rounded.none}"
  answer-cell-hover:
    backgroundColor: "{colors.ghost}"
  answer-cell-entry:
    textColor: "{colors.text-3}"
  answer-cell-picked:
    backgroundColor: "{colors.amber}"
    textColor: "{colors.module}"
  answer-cell-unpicked-locked:
    textColor: "{colors.text-2}"
  answer-cell-correct:
    backgroundColor: "{colors.green}"
    textColor: "{colors.module}"
  answer-cell-wrong:
    backgroundColor: "{colors.red}"
    textColor: "{colors.module}"
  keycap:
    backgroundColor: "{colors.ghost}"
    textColor: "{colors.amber}"
    size: "42px"
  keycap-on-lit-cell:
    backgroundColor: "{colors.module}"
  keycap-breaker:
    backgroundColor: "{colors.gold}"
    textColor: "{colors.module}"
  action:
    backgroundColor: "{colors.module}"
    textColor: "{colors.lit}"
    height: "128px"
    padding: "16px 20px 14px"
    rounded: "{rounded.none}"
  action-hover:
    backgroundColor: "{colors.ghost}"
  action-primary:
    backgroundColor: "{colors.amber}"
    textColor: "{colors.module}"
  action-primary-hover:
    backgroundColor: "{colors.lit}"
  search-input:
    backgroundColor: "{colors.ghost}"
    textColor: "{colors.lit}"
    height: "44px"
    padding: "0 14px"
    rounded: "{rounded.none}"
  hero-tile:
    backgroundColor: "{colors.ghost}"
    width: "52px"
    height: "68px"
  scoreboard-stat:
    textColor: "{colors.amber}"
    typography: "{typography.numeral}"
    padding: "14px 24px"
  leave-link:
    textColor: "{colors.text}"
    padding: "0 24px"
  leave-link-hover:
    backgroundColor: "{colors.ghost}"
    textColor: "{colors.amber}"
  fixture-row:
    padding: "12px 20px"
    height: "56px"
  art-module:
    backgroundColor: "{colors.ghost}"
    size: "200px"
---

# Design System: Queue Arcade LED board

This file describes the LED-board concept under `design/poc/led-board/` (lobby `index.html`, round `play.html`, `board.css`, `board.js`). It does not describe the shipped Next.js app, which keeps its own older look in CSS modules under `src/components`. Every value below is taken from the built concept.

## Overview

**Creative North Star: "The Arena Ribbon Board"**

The public room is one arena LED ribbon board. The page is a matte black floor ruled into 96px panels by faint seams. On the floor sit pure black LED modules: the clock, the question, four answer cells, and the scoreboard band. Everything that carries state is light. Words are condensed arena signage in capitals. Numbers are dot-matrix. Reading text is plain Barlow in sentence case.

Nothing fades, slides, or glows. A change of state is a one-frame swap, the way a scoreboard flips. The round has four phases (entry, answering, locked, reveal) and every element keeps its box through all four, so the player's eye never has to re-find the clock or the cells. At reveal the whole band drenches in the result colour for 700ms, then drops back to black with the result still lit.

The build rejects the dark dashboard of bordered cards with one glowing accent. It has no colour gradients, no glow halos, no shadows, no rounded corners, no transitions, and no borders used to show state.

**Key Characteristics:**
- Matte ground, black modules, visible seams, zero radius.
- One colour per state: amber live, white locked or waiting, green right, red wrong, white-gold only for the 2x crowd-breaker.
- Unlit elements are drawn, not hidden: ghost dots at 16% opacity, unlit bar cells in ghost grey.
- Dot-matrix numerals (Doto), signage capitals (Barlow Condensed), reading text (Barlow).
- Every state change is instant. The only loops are the ticker scroll and the crowd-breaker blink.
- Every phase-dependent element reserves its space. Nothing moves between entry, answering, locked, and reveal.

## Colors

Five light colours on three blacks, with three warm greys for text that is drawn rather than lit.

### Primary
- **Amber** (`amber`, #ffb000): the live light. It lights the sign, the running clock, the lit time-bar cells, the "Answer now" state line, the keycaps, every inline numeral, the picked cell fill, the Play now action, the lobby headline's emphasised phrase, the focus ring, text selection, the input caret, and the scrollbar thumb. Amber means "live" and is never decoration.

### Secondary
- **Lit white** (`lit`, #f6f2e8): light that is on but not live. The question prompt, answer labels, the clock and state line while locked or waiting, the "Missed" result, the lobby headline, and the hover fill of the primary action.
- **Right green** (`green`, #3fe36f): the correct cell fill at reveal, the clock and state line on a right result, the correct hero tile's inset outline, and the correct split row.
- **Wrong red** (`red`, #ff3b3b): the fill of a cell the player picked and got wrong, the clock and state line on a wrong result, and the wrong hero tile's inset outline.

### Tertiary
- **Breaker gold** (`gold`, #ffe08a): reserved by law for the 2x crowd-breaker. It appears only on the keycap of the correct cell when the player was right and the room majority was wrong, blinking against module black.

### Neutral
- **Ground** (`ground`, #101010): the page floor under every module, ruled by seams.
- **Module** (`module`, #000000): every LED module, the fascia, and the ink on any lit surface (picked, correct, wrong, primary action, reveal flash).
- **Ghost** (`ghost`, #1b1b1b): an unlit pressable surface. Keycaps, the art module, the search input, hero tiles, and the hover state of cells, actions, and fascia controls.
- **Ghost 2** (`ghost-2`, #292929): unlit indicator cells. Time-bar cells, volume bars, fog-stage bars, the dark pixels of the sign mark, and the verdict placeholder dots.
- **Seam** (`seam`, 5% white): the ground's panel lines and the fascia control dividers.
- **Seam strong** (`seam-strong`, 14% white): the fascia bottom edge, the sign divider, scoreboard stat dividers, the Leave link divider, and the search input's resting stroke.
- **Text** (`text`, #ece7db): reading text (verdict, pitch, scoreboard note, Leave link, Steam label).
- **Text 2** (`text-2`, #a99f8b): secondary labels (round label, ticker, ticket, captions, cell sub-lines, unpicked cells after lock, muted controls).
- **Text 3** (`text-3`, #8f8676): the dimmest grey. Cells during entry, placeholder text, fixture slot names, grey LED separators, and the muted volume readout.

### Named Rules
**The State Colour Law.** Amber is live answering. Lit white is locked, waiting, or missed. Green is right. Red is wrong. White-gold is the 2x crowd-breaker keycap and nothing else. A colour is never used as decoration.

**The Lit-or-Drawn Rule.** Every surface is either emitting light in one of the five colours or drawn unlit in a black or grey. There are no colour gradients, no glows, no translucent tints. A radial-gradient appears only as a dot stencil (the art module's screen-door overlay, the verdict placeholder field), never as a colour ramp.

**The Decisive Beat Rule.** The full band changes colour once per round, at reveal. The body takes flash-right, flash-wrong, or flash-missed for 700ms: every fascia, module, and cell background becomes the result colour (green, red, or lit white), all text and indicator cells become black, and images keep their pixels. The ground stays matte. The flash is then removed in one frame and the result colour stays only on the clock, the state line, and the result cells.

## Typography

**Display Font:** Barlow Condensed (with Arial Narrow, sans-serif), weights 500, 600, 700, 800
**Body Font:** Barlow (with Helvetica Neue, Arial, sans-serif), weights 400, 500, 600, 700
**Label/Mono Font:** Doto (with Courier New, monospace), variable 400 to 900

All three are self-hosted woff2 files under `design/poc/led-board/fonts/` (SIL Open Font License 1.1, latin subset, `font-display: swap`).

**Character:** Arena signage. Barlow Condensed carries every heading, label, and state line in capitals with wide tracking. Doto renders every readout as a grid of dots, so the clock, percentages, and points look like the same light as the time bar. Barlow in sentence case is only for sentences a player reads: the verdict, the pitch, and the scoreboard note.

### Hierarchy
- **Display** (800, clamp(2.75rem, 5.2vw, 4.75rem), 0.92, uppercase): the lobby headline, balanced, max 16ch, with the emphasised phrase in amber. 2.5rem under 720px.
- **Headline** (700, clamp(2.25rem, 3.6vw, 3.25rem), 0.95, uppercase): the question prompt, balanced, max 22ch, lit white. It keeps a 1.9em minimum height. During entry it dims to text-2 and reads "Next: [format]". 1.625rem under 720px.
- **Clock** (Doto 800, clamp(5.5rem, 9vw, 8.75rem), 0.9, tabular): the shared countdown as `00:SS`. Its colour follows the State Colour Law. 3.75rem under 720px.
- **Title** (600, 1.75rem, 1, 0.02em, uppercase): answer cell labels, one line, ellipsis on overflow. Action labels use the same role at weight 800 and 2rem. 1.25rem and 1.5rem under 720px.
- **State** (700, 1.25rem, 0.12em, uppercase): the line under the time bar ("Answer now", "Locked at 00:13", "Right"). The hero status line uses 1.125rem and 0.1em. Fixture names use 1.25rem and 0.04em. The lobby scoring line uses 1.0625rem and 0.1em.
- **Body** (Barlow 400, 1.125rem, 1.4): the verdict, max 64ch. The lobby pitch is 1.1875rem at 1.45, max 58ch. The scoreboard note is 0.9375rem at 1.35. Emphasis is weight 600 in lit white. An inline count inside body text switches to Doto 700 in amber.
- **Label** (600, 1rem, 0.12em, uppercase): the round label, the search label, the split heading, and the ticker (0.1em). Items in a label are separated by a 6px LED square, not by punctuation.
- **Caption** (600, 0.8125rem, 0.12em, uppercase): scoreboard captions. Cell sub-lines use 0.9rem at 0.1em. Action sub-lines use 0.95rem at 0.1em. The provenance ticket is the one caption set in Barlow 500 at 0.8125rem with 0.08em tracking.
- **Numeral** (Doto 800, 1.75rem, 1, tabular): scoreboard stats in amber. Keycaps are 1.5rem. Percent readouts are 1.25rem. Inline counts in labels and the ticker are 1.05rem to 1.125rem at weight 700.

### Named Rules
**The Signage Caps Rule.** Every heading, label, state line, and button label is Barlow Condensed in uppercase with tracking between 0.01em (display) and 0.14em (the sign). Sentence case is only for Barlow reading text.

**The Dot Readout Rule.** A readout is Doto: the clock, the round number, percentages, points, streaks, round counts, slot counts, the volume percent, and scored amounts inside the verdict. A digit that is part of a label or a signage line stays in the signage face, as in the answer label "2,250 gold" and the state line "Locked at 00:13".

## Layout

The fascia is a full-width 56px strip of module black at the top of the page, divided into three columns by 1px seam-strong lines: the sign (amber, 24px side padding, with a 3x3 pixel mark), the scrolling ticker, and the controls (mute, ten-bar volume slider, Steam sign-in). It has a 1px seam-strong bottom edge.

The board is centred at a maximum width of 1392px with 24px padding and a minimum height of the viewport minus the fascia. It is a grid of two columns, `minmax(340px, 5fr) 9fr`, and four rows, `1fr auto auto auto`, with a 12px gap. The ground shows through the gap. The body background draws 1px seam lines every 96px, offset by 24px horizontally and by the fascia height plus 24px vertically, so module edges land on seams.

Modules are pure black rectangles with 24px top and 28px side and bottom padding. The clock module and the question module each have a 384px minimum height so the top row holds its shape in every phase. The clock module stacks round label, clock, a 15-cell time bar (4px gaps, 14px cells), and the state line. The question module places a 200px art module beside the prompt and ticket, with the verdict spanning the full width below.

The answer row spans both columns: four equal cells, 128px tall, 12px apart. The scoreboard band spans both columns: four stats separated by 1px seam-strong lines, a note column, and a Leave link on the right behind a seam-strong divider.

The lobby uses the same frame. The question module holds headline, pitch, and scoring line. An actions row of `2fr 1fr 1fr` replaces the answer row. A two-column fixtures list follows, each row 56px minimum with 1px seam borders, then the scoreboard band.

Fogged Vision swaps the answer row for a hero picker module (search input, status line, and a 296px scrolling grid of 52x68 tiles with 4px gaps) beside a 360px split module with four rows. The art module grows to 320x180 and carries a three-bar fog-stage indicator in its bottom left corner.

Spacing uses 2px (dot gaps), 4px, 8px, 12px (between modules), 16px, 24px (board padding, stat padding), 28px (module side padding), and 40px (ticker item gap).

Breakpoints:
- At 1100px and below, the board columns become `minmax(300px, 2fr) 3fr`, answers go to a 2x2 grid, the Play action spans both action columns, the Leave link drops to its own 52px row, and the fog picker stacks above a two-column split.
- At 720px and below, the tokens change: seams every 64px, cells 112px tall, fascia 84px, dots 3px with 1px gaps. The board becomes one column with 12px padding and 10px gaps. The fascia becomes two rows (sign and controls at 52px, ticker at 32px). The Steam button and volume percent are hidden. The art module shrinks to 72px. Answers are 2x2 with 8px gaps, the scoreboard is 2x2, and the fixtures list is one column.

### Named Rules
**The Reserved Space Rule.** Nothing moves between entry, answering, locked, and reveal. Phase-dependent text has a minimum height (prompt 1.9em, state line 1.4em, verdict 3em on desktop and 6.75em under 720px). Phase-dependent content is hidden with visibility: hidden, never display: none, so its box stays. Cell footers and split rows have fixed heights. The verdict placeholder draws a field of ghost-2 dots on an 8px grid in the verdict's box while the round runs, then swaps to text at reveal.

## Elevation & Depth

There are no shadows. Depth comes from three blacks: the matte ground (#101010) with its seam lines, the deeper module black (#000000) sitting on it, and the ghost fill (#1b1b1b) that marks a pressable or unlit surface inside a module. Hover is a swap from module black to ghost. Press and focus are the amber outline.

Two dot stencils add texture without light: the art module's screen-door overlay (40% black dots on a 3px grid over the artwork) and the verdict placeholder field (ghost-2 dots on an 8px grid). Fogged Vision hides the hero behind a filter that steps from blur 18px, saturate 0.35, contrast 0.6, brightness 0.7 at scale 1.12 (stage 3) through blur 9px (stage 2) and blur 4px (stage 1) to clear (stage 0). The stages change at 10 and 5 seconds left, with no transition.

### Named Rules
**The Three Blacks Rule.** Ground, module, and ghost are the only depth. A surface never gets a shadow, a glow, a border, or a tint to lift it.

## Shapes

Every shape is a rectangle with zero radius. Modules, cells, keycaps, actions, inputs, hero tiles, and LED squares are all square-cornered. Modules have no border; they are separated by 12px of ground. The only strokes are 1px seams: the fascia edges and dividers, scoreboard stat dividers, fixture row edges, and the search input's resting stroke.

State is shown by fill, not by border. A picked cell fills amber, a correct cell fills green, a wrong cell fills red, and the keycap inverts to black on the cell's colour. The one exception is image tiles in the hero grid, where a fill would hide the art: hover and focus draw a 3px amber outline inset, picked a 4px amber outline inset, and reveal a 4px green or red outline inset while every other tile drops to 25% opacity.

Small LED squares are the system's only mark. A 6px amber or grey square separates label items in the ticker, round label, scoring line, and status line. A 5px grey square separates ticket items. The sign carries a 3x3 grid of 5px pixels with alternating amber and ghost-2. Doto's dots, the time bar's 15 cells, the volume slider's ten 8x18 bars, the fog-stage's three 44x6 bars, and the 100-dot split bars are the same vocabulary.

## Components

### Buttons
Answer cells and lobby actions are the buttons. They are flat black rectangles that light up by fill.
- **Shape:** square (0 radius), 128px tall, no border.
- **Answer cell:** module black with lit white text, padding 16px 18px 12px. Three rows: a head (42px ghost keycap in Doto 800 amber beside the label in Title), a split row (percent readout plus the 100-dot bar, 28px tall), and a 20px footer that holds either the "Locked 00:SS" sub-line or the "2x crowd-breaker" bonus line in the same grid area.
- **Hover:** background swaps to ghost. No transition.
- **Entry phase:** text and keycap in text-3, label hidden, cell disabled.
- **Picked:** amber fill, black text, keycap inverts to black on amber. Other cells drop to text-2 and lose their hover fill.
- **Reveal:** every cell drops to text-2, percent and lit dots become visible, sub-lines hide. The correct cell fills green with black text; a picked wrong cell fills red with black text. If the player was right and the room majority was wrong, the correct cell's keycap turns gold and blinks to black on gold at 0.5s steps, and its bonus line shows.
- **Keyboard:** A to D keys pick the matching cell. Focus is the 2px amber outline with 2px offset.
- **Lobby action:** module black, lit white, padding 16px 20px 14px, label at 800 and 2rem with a caption below. Hover swaps to ghost.
- **Primary action (Play now):** amber fill with black text and black caption. Hover swaps the fill to lit white.
- **Fascia controls (mute, volume):** module black, 18px side padding, hover to ghost. The mute icon is a 20px square-capped stroke in amber (text-2 when muted). The volume slider is ten 8x18 bars, lit amber up to the level, with a Doto percent readout.
- **Leave link:** signage caps in text, 24px side padding, full scoreboard height, hover to ghost with amber text.

### Cards / Containers
Modules are the containers.
- **Corner Style:** square.
- **Background:** module black on the ground.
- **Shadow Strategy:** none (see Elevation & Depth).
- **Border:** none between modules; 1px seams only inside the fascia, scoreboard, and fixtures.
- **Internal Padding:** 24px top, 28px sides and bottom on desktop; 14px top and 16px sides and bottom under 720px. The hero picker and split modules use 18px top and 20px sides and bottom.

### Inputs / Fields
The hero search is the one text field.
- **Style:** ghost fill, 1px seam-strong stroke, lit white text in Barlow Condensed 600 at 1.25rem, uppercase with 0.06em tracking, 44px tall, 14px side padding, placeholder in text-3, caret in amber.
- **Focus:** 2px amber outline with no offset and the stroke turns amber.
- **Disabled:** the field is disabled after a pick; it keeps its look and the status line reports the lock.

### Navigation
The fascia is the navigation.
- **Sign:** "Queue Arcade" in Barlow Condensed 800 at 1.375rem, 0.14em tracking, amber, with the 3x3 pixel mark. It links to the lobby and stays amber on hover.
- **Ticker:** label-role signage in text-2 with amber emphasis, items 40px apart with a 6px amber LED before each, scrolling left at 48s per loop and pausing on hover. Under reduced motion it stops scrolling and steps through items one at a time every 4 seconds.
- **Controls:** mute, volume, and the Steam sign-in raster, divided by 1px seams. Under 720px the controls sit beside the sign and the ticker takes a second 32px row.

### Clock module
The shared clock is the first thing on the board. Round label (label role, with the round number in Doto amber and LED separators), the Doto clock, a 15-cell time bar (lit count is seconds left over the round length times 15, rounded), and the state line. In entry and locked the clock and lit cells are lit white. In answering they are amber. At reveal the bar goes fully unlit and the clock and state line take the result colour.

### Split bars
A split bar is 100 dots in 25 columns of 5px squares with 2px gaps (3px and 1px under 720px). Each dot is the row's current colour at 16% opacity; a lit dot is 100%. The bar is drawn in every phase so its box never changes; the lit dots and the Doto percent appear only at reveal. In answer cells the bar sits beside a 4.2ch percent column. In the Fogged Vision split module each row is a 44x58 hero crop, the hero name in signage, the percent, and the bar; the correct row turns green and the player's wrong row turns red.

### Scoreboard
A full-width band of stats: a Doto 800 numeral at 1.75rem in amber over a caption in text-2, each stat with 14px vertical and 24px side padding and a seam-strong right divider. A Barlow note at 0.9375rem follows, then the Leave link. Unplayed lobby stats show an em dash in the numeral slot.

### Fixtures
The lobby's rotation list. Each row is a 9ch slot column (caption role in text-3), a name (signage 700 at 1.25rem in lit white over a Barlow description in text-2), and a Doto count. The current row's slot, name, and count turn amber; the next row's slot turns lit white. Rows are divided by 1px seams.

### Hero picker
A search input, a status line (state role, LED separator; amber when locked, green or red at reveal), and a scrolling grid of 52x68 hero tiles on ghost. Tiles filter as the player types and Enter picks the only remaining match. After a pick, unpicked tiles drop to 35% opacity.

### Motion
**The Instant Swap Rule.** No element has a transition. Every state change (phase, pick, lock, reveal, hover, fog stage) is a one-frame swap of class and colour. The only animations are the ticker scroll (48s linear loop, paused on hover), the crowd-breaker keycap blink (0.5s, steps(1)), and the 700ms reveal flash, which is a class added and removed by script. Under prefers-reduced-motion: reduce the ticker stops scrolling and steps in place, the keycap blink is removed, and the flash remains as a single instant swap.

### Browser surfaces
The world extends to browser chrome: selection is amber with black text, the caret is amber, the scrollbar is a 10px amber thumb on a ghost track, links are amber and turn lit white on hover, and focus is a 2px amber outline with 2px offset on every control.

## Do's and Don'ts

### Do:
- **Do** set every readout (clock, percent, points, counts) in Doto with tabular numerals.
- **Do** reserve the box for every phase-dependent element: minimum heights on text, fixed heights on footers and split rows, visibility: hidden for content that is not yet shown.
- **Do** show state by fill: a picked cell fills amber, a right cell fills green, a wrong cell fills red, each with black ink and an inverted keycap.
- **Do** draw unlit dots and cells rather than hiding them: 16% opacity for split dots, ghost-2 for bar cells.
- **Do** separate modules by 12px of ground and join stats or rows with 1px seams.
- **Do** keep the 2px amber focus ring with 2px offset on every control.
- **Do** use a 6px LED square between label items in place of punctuation.
- **Do** swap colour across the whole band once at reveal, for 700ms, and leave the ground matte.

### Don't:
- **Don't** add transitions, easing, fades, or slides. Every change is instant.
- **Don't** use colour gradients, glows, blur halos, tints, or shadows. A radial gradient is only ever a dot stencil.
- **Don't** round a corner.
- **Don't** use amber for anything that is not live. It is a state, not an accent.
- **Don't** use breaker gold anywhere but the 2x crowd-breaker keycap.
- **Don't** show state with a border. Fill the surface. Inset outlines are allowed only on image tiles where a fill would hide the art.
- **Don't** let a phase change move, resize, or reflow anything on the board.
- **Don't** set a heading, label, or button in sentence case or in Barlow. Signage is Barlow Condensed uppercase.

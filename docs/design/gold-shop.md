# Gold shop

Status: direction approved by the maintainer on 2026-11-07. Nothing is built. The simplicity pass comes first.

## Goal

Gold is only a score today. Players earn it and can do nothing with it. The shop gives gold a use: between rounds, a player can spend it on something that changes the next round.

## Keep it simple

A new player must understand the shop in about 10 seconds, without reading anything else.

- Each button shows only an icon, a name and a price.
- One short line on hover says what the item does. There is no shop page, panel or tutorial.
- The shop never asks for attention during a question. No pop-ups, no prompts.
- Ignoring the shop must cost nothing: a player who never opens it plays the same game as today.
- New items are added only if they pass this same test.

## How gold works today

- A right answer usually pays 125 to 250 gold: 100, plus up to 100 for speed, plus up to 50 for difficulty. Spell Link and Aghanim's Lab pay less after a later clue.
- The answer pays double when less than half of the room got it right.
- The server scores each answer. The browser adds the scores up into the Gold number.
- Gold starts at 0 each run and is lost on a page reload.
- Streak pays no gold. It only drives the streak banners, such as Dominating and Godlike.

## What the player sees

A small Shop strip sits under Gold and Streak in the side rail, in every phase. It has two buttons with prices. A button is greyed out when the player can't afford it, and marked once bought. The strip keeps its size at all times, so nothing on screen moves.

## The two items

| Item                   | Price        | What it does                                                                    |
| ---------------------- | ------------ | ------------------------------------------------------------------------------- |
| **Aegis**              | 300 gold     | The next thing that would reset your streak doesn't.                            |
| **Double Damage rune** | 200 gold bet | Right answer next round: you get 400 back. Wrong or no answer: the 200 is gone. |

The rune is a fair bet: it pays off for anyone who is right more than half the time. Aegis costs about two right answers. Both prices are first guesses.

## Rules

- A purchase applies to the next round, even if it is bought mid-round.
- A player can hold one of each item at a time.
- No refunds. Items and gold go when the run ends.
- Gold only ever buys things in the game. There is no real money and nothing to purchase.
- Item icons are our own, not Valve art.

## Records stay on gold earned

The shop keeps its own balance:

`Gold shown = gold earned − gold spent + rune winnings`

The run score stays as it is today. Best runs, profile stats and party standings keep using gold earned, so spending never hurts a record and the rune can't inflate one.

## Why no hint items

A 50/50 or an extra clue would change how people answer. That would skew the room split, the accuracy numbers and the double-gold rule. Aegis and the rune don't touch what a player sees in a question.

## Size of the work

The first version runs in the browser only. It needs no database change and no change to scoring. Editing the browser's balance only fools that player, because gold spent has no effect on records or other players.

One pull request:

1. Shop balance and item state, with tests for the rules above.
2. The Shop strip, with a check that nothing moves in any phase.
3. Aegis in the streak count, and the rune paid out when the round result arrives.
4. English and Russian text, with a native-reader pass.

No new sounds in the first version.

## Left out for now

- Gold saved between runs.
- Cosmetics, such as titles or profile frames.
- More items.

These make sense only if people come back. We can decide once there is traffic.

## Decisions needed

1. **Gold number:** the rail shows spendable gold, so it can drop after a purchase. Records keep gold earned. Recommended: yes.
2. **Saved gold:** gold resets each run in the first version. Recommended: yes. Saving it needs accounts or browser storage, plus a plan for guests.
3. **Aegis value:** it protects a streak that pays no gold, only banners. Recommended: ship it and see if people buy it. A gold bonus for streaks would change scoring and records, so it should be a separate decision.
4. **Prices:** we should check how many rounds a typical run lasts before fixing them. If most runs are short, 300 gold may be too much.

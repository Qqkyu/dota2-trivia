# ADR 0001: Feedback sound contract

- Status: Accepted
- Date: 2026-09-14
- Checkpoint tag: `checkpoint-sounds-ok`

The maintainer confirmed live pick and result cues play every time. That state
is the contract.

## Working means

On a real Chrome tab, with speakers:

- The first Shopkeeper Rush item tap clicks.
- That click still plays when it is the first click that brings the window forward.
- Aghanim's Lab first hero tap clicks.
- A wrong result is one copy of `magic_immune.wav`, not a cave / echo / double.
- Later picks in the same run still click.

## Proof

`pnpm check:sounds` against `http://localhost:3000` is the gate.

It is done only when:

1. Native Pulse capture of Chrome output matches the full WAV at UI volume on
   cold first Shopkeeper recipe picks, first Shopkeeper answers, first Aghanim
   picks, those same first Shopkeeper picks while `hasFocus()` is still false,
   single-tab wrong results, two-tab wrong results, and return to the old tab.
2. These faults stay red: `raw-lock`, `double-result`, `silent-lock`, `cut-lock`.
3. The tapped PCM suite still covers recipe edits, mouse/keyboard, reveal races,
   hidden-tab return, and mute.

A resolved `play()` promise, element currentTime, or Web Audio tap is not proof.
Those paths already passed while the speaker mix was missing the click attack or
playing two wrong cues.

Evidence and how to run the check: `docs/feedback-sounds.md`.

## Change rule

Any edit to feedback playback, the lock WAV, tab ownership, or `check:sounds`
keeps that gate. Move the tag only after the maintainer hears a live run stay
good, then `git tag -f checkpoint-sounds-ok` and push the tag.

Restore the known-good tree with `git switch --detach checkpoint-sounds-ok`.

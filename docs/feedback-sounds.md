# Feedback sound verification

Known-good checkpoint: git tag `checkpoint-sounds-ok`.
Contract: `docs/adr/0001-feedback-sounds.md`.
Gate: `pnpm check:sounds` with the app at `http://localhost:3000`.

## Live-client findings after 70eabcf

The local `/play` client was driven with trusted Chrome input. A separate
PulseAudio monitor recorded the browser's native stereo output. No person
listened to judge these results.

- The first Shopkeeper recipe pick, first Shopkeeper item answer, and first
  Aghanim's Lab answer each kept only **41.9% of the expected sample energy**.
  Each native `play()` promise resolved and each file finished. The loss was in
  the first 10 ms, where the click has 94% of its energy. This was attenuation,
  not an all-zero recording. Rebuilding the WAV header alone did not fix it.
- Two open game tabs each played the wrong-result sound. In one recording, the
  full copies were **116 ms apart**. Subtracting one reference waveform left a
  second full copy. Muting the older tab removed it; a single tab's wrong sound
  matched the source WAV. Background tabs also sound results for missed rounds.
- All 28 previous PCM cases passed on that same client. Their
  `createMediaElementSource()` tap routed playback through Web Audio and bypassed
  the native output behavior that weakened the click. They inspected individual
  voices in one game tab, so they could not detect the combined output of two
  game tabs. Aghanim's Lab was absent.

The new check was run before the fixes:

```bash
node scripts/check-native-feedback-sounds.mjs --skip-controls
```

It failed for all three first picks and the two-tab wrong result. The pick had
41.9% energy and 24.9% waveform error. The two-tab result left 100% extra sound
energy after subtracting the expected single copy.

## Changes

The runtime pick WAV has 20 ms of silence before the original samples. This
protects its short attack from the native output's initial fade. The original
WAV remains in the repo. The asset validator requires the runtime file to retain
every original stereo sample, with only the silent lead-in added. Gain is unchanged.

The last game tab used owns audio. Focus or trusted input transfers ownership;
the old tab stops its sounds and drops pending results. Returning to an old tab
does not replay its old result. One game tab can still play a result while hidden
by a different application. If local storage is unavailable, playback is limited
to the focused, visible page. This applies to feedback and round audio.

A pick click still plays when `document.hasFocus()` is still false. That happens
on the first click that brings the game window forward. Ownership also transfers
on that click. Result cues stay owner-only so a background tab cannot echo.

## Sleeping output devices (2026-10-24)

The maintainer heard every result cue on a Bluetooth speaker but almost no pick
clicks, and only two or three of four Order Up clicks. The click is 20 ms of
silence and about 180 ms of sound. A Bluetooth or USB device that has dropped its
link after a few seconds of silence needs 200 ms to over a second to wake, so the
whole click falls into that gap while a longer cue only loses its start.

The client now keeps the output open while a round is live. `useOutputKeepAlive`
in `src/components/arcade/use-arcade-audio.ts` runs an AudioContext that renders
digital silence from the entry wait until the lobby, suspended while the tab is
hidden or sounds are muted. It is not a media element, so the per-voice tap does
not count it, and it adds nothing to the native recording; `pnpm check:sounds`
passed with it (10 native checks, 30 tapped checks). Whether a given speaker stays
awake is only provable on that device.

## Run

With the app already running at `http://localhost:3000`:

```bash
pnpm check:sounds
```

`APP_URL` and `CHROME_BIN` can select another app URL or Chrome binary. The native
check requires Linux, PulseAudio (`pulseaudio` and `parec`), and Chrome. It starts
its own temporary audio server and records a null sink; it does not use speakers
or change the user's audio server. An unpacked PulseAudio package tree can be
supplied with `SOUND_PULSE_ROOT`. On this workspace it is already installed at
`~/.cache/queue-arcade/sound-tools`, which the check finds by default. Missing
recorder tools fail the check instead of skipping native verification.

The native check covers cold first picks in separate browser profiles, first
Shopkeeper picks while `hasFocus()` is still false, individual wrong results, two
game tabs with staggered results, and return to the old tab.
It compares both recorded channels with the expected full waveforms at the UI
volume. Missing samples, reduced gain, or another delayed copy fail the check.
Two negative controls must fail: the original unpadded click, and a second native
wrong-sound playback delayed by 75 ms. The latter bypasses the per-tab call log,
so only the actual mixed recording can expose it.

The second check retains the per-voice tap for broad UI coverage: 30 PCM cases,
including Aghanim mouse and keyboard picks, recipe edits, ordering picks,
correct/wrong results, reveal races, next-round picks, hidden-tab return, and
mute. Its silent and cut-short controls must also fail.

Supporting checks:

```bash
pnpm exec vitest run tests/feedback-player.test.mjs
node scripts/validate-feedback-sounds.mjs
```

All browser API responses are fixtures and all real API requests are blocked,
including writes and beacons. Only round data is replaced in the native check;
application handlers, audio files, decoding, autoplay policy, and final output
remain real. The tests cannot write to `.data` or use server API stores.

## Limits

This verifies the current local client in Chrome on Linux. It does not establish
what happened in the maintainer's exact past session. No all-zero first-pick
recording was reproduced; the measured fault was loss of the click's attack.
Physical devices, operating-system effects outside the test sink, other browsers,
and the real server's round/vote timing are not covered. Production was not tested.

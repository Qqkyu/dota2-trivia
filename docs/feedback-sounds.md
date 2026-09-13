# Feedback sound failures

## Cause and evidence

Two faults were reproduced through the real `/play` client with native Chrome audio:

- A Shopkeeper recipe component pick only changed the draft. It never called the feedback player.
  A real mouse click filled one recipe slot, with zero `play()` calls and zero audio samples.
  The search/Enter path had the same omission. Partial Order Up and Flashback order picks also omitted the cue.
- `createFeedbackPlayer.play()` paused every previous voice. When a reveal followed a late pick,
  the result could cancel the pick before Chrome's media thread started it. The native promise rejected
  with `AbortError`, at `currentTime === 0`. Shopkeeper Build Result, Fogged Vision, Spell Link, and
  four-choice trivia all reproduced zero pick samples. The same policy could cut off a delayed result
  when the next pick arrived.

The old player discarded its preload elements and created a new, unready media element on each cue.
It reported `played: true` before playback started and swallowed rejection. This made the cancellation
window harder to see.

The fix gives each accepted pick/result its own voice until `ended` or `error`. The entry cue can still
be stopped by a pick. Mute and exit stop all voices and clear blocked results. Unused preload elements
are retained and consumed once. The return value now separates `requested` from the asynchronous
`started` result. A blocked result can retry on focus or a user gesture, without repeating a heard result.
Draft picks have an explicit `onPick` callback; completing an answer still calls `onChoose` once.

## Why the previous checks missed it

- The asset validator checked WAV hashes and source-code strings. Its fake media tests required the
  faulty behavior: each new cue had to pause the previous cue.
- The browser check chose two random rounds. It did not require Shopkeeper recipe coverage or test
  two cues arriving close together.
- It used `--autoplay-policy=no-user-gesture-required`, accepted a resolved `play()` promise as sound,
  and did not measure audio output. Its clip-state lookup found the first preload element rather than
  the voice associated with the current action.
- Layout checks explicitly replaced media playback with a resolved promise.

The asset validator now states its limited scope. Playback behavior belongs to the browser check and
the feedback-player regression tests, rather than source-order expressions or always-successful media stubs.

Running the broader checks also exposed existing failures. The shop/hero validators still required an
old statement order. They now check the callback connection; the browser check verifies its sound.
The navigation validator still required the global scrollbar rule deliberately removed in `c73cb30`;
that obsolete requirement was removed. The party route now checks that the optional `full` property
exists before reading it, which fixes its TypeScript error.

## Run the checks

With the app running on `http://localhost:3000`:

```bash
pnpm check:sounds
pnpm test -- tests/feedback-player.test.mjs
node scripts/validate-feedback-sounds.mjs
```

`pnpm check:sounds` owns a temporary Chrome profile and uses normal autoplay rules. It feeds fixed room
snapshots through the existing client fetch boundary and drives the real controls with trusted browser
input. API traffic is also blocked at the browser network layer, so test votes, sessions, and beacons
cannot reach the server's stores. No test-only route or playable fixture is added to the application.

For each voice, an AudioWorklet reads PCM (decoded sound samples) from the native media element, before
the browser's speaker mute. The check requires one start, an `ended` event, first sound within 350 ms,
and 90–110% of the original WAV's expected sample energy at the selected volume. It associates voices
with individual actions, so a previous cue cannot hide a later miss.

The check first runs two negative controls: a muted media element and an element paused immediately
after `play()` resolves. Both must fail the PCM assertion. Run just those controls with:

```bash
node scripts/check-feedback-sounds.mjs --self-test
```

The browser cases cover each recipe step, removal, Enter, final Build, all reported formats, correct
and wrong results, partial ordering picks, a reveal immediately after a vote, a delayed result followed
by the next pick, a hidden tab and focus return, and mute. The unit tests control the media-start delay
to make the cancellation race deterministic, and cover voice cleanup and blocked-result recovery.

## Limits

The check measures browser audio, not the operating system's volume, speakers, or headphones. It runs
in Chrome; other browsers are not covered. The room/vote responses are controlled fixtures, so this
check does not test the real server's scheduling, vote storage, or outages. It recreates the reported
failure patterns; no trace of the maintainer's exact past browser session was available.

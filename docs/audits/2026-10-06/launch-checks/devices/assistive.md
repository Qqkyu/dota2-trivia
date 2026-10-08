# Linux assistive technology checks

Dates: 2026-10-06 and 2026-10-08.

The tests ran Orca, AT-SPI, Speech Dispatcher, and eSpeak NG against the app in a visible Chrome window. The first tests captured generated speech from a custom output module. A later isolated Ubuntu 24.04 container used Orca 49.8 and the stock eSpeak NG module, with real PulseAudio output recorded to WAV. These are screen-reader runs, not only accessibility-tree scans.

The final source passes the three targeted Orca 49.8 and Chrome 153 checks on build `fQ95T7-zzQo1Bnsef8oBI`. The reader spoke the next prompt once with both recovered and retained focus. The recipe flow spoke both component counts and submitted one vote. See [final source verification](#final-source-verification). These separate cases do not establish full continuous screen-reader support.

The baseline exposed two defects. A new round had no spoken prompt and left focus on the page body after an answer control disappeared. A searched Shopkeeper component also removed focus without announcing the selection. The fixes add stable live status regions and guarded keyboard focus recovery. Both regression checks pass on production build `YC6nz9frAbvjRFKHq5lSy` at `http://127.0.0.1:3331`. Orca 42 completes the recipe speech flow in Chrome 121 and 149. Chrome 153 with Orca 42 passes the round announcement and zoom checks, but retains the recipe text-entry issue below. On the earlier build `NsjBPH5Ygi5SqnYfuwSHz`, Orca 49.8 passed the recipe in a fresh session but dropped the round prompt in the stock-speech run. The historical results and cause are retained below. Removing the redundant status role corrected that prompt failure in the final source.

## Expected result and method

A player must be able to find named controls, submit an answer with the keyboard, hear the result, and identify the next round. A recipe selection must announce the item and count. If an answer control disappears, the next useful control must remain reachable. Chat, report controls, and an active outside input must retain focus.

The test used native X keyboard events through `xdotool`. Playwright controlled fixtures and read the page state. Actual game components rendered the fixtures. Votes and reports stayed in the browser. Fixture answer windows were extended to 60 seconds so setup time did not end the question. This does not measure a player's ability to finish a normal timed round.

Orca read native AT-SPI events. It was not fed a DOM snapshot or a manually prepared text description. The custom Speech Dispatcher output command recorded each utterance and used `espeak-ng -w` to synthesize it. The test checked the PCM data and synthesis exit codes. No physical speaker, headphones, human listener, or braille device was used. The file sink also does not reproduce the timing and interruption behavior of real audio playback.

## Environment

| Component         | Version or setting                                                                                               |
| ----------------- | ---------------------------------------------------------------------------------------------------------------- |
| OS                | Ubuntu 22.04.5 under WSL                                                                                         |
| Orca              | Ubuntu package 42.0-1ubuntu2                                                                                     |
| AT-SPI            | 2.44.0-3; pyatspi 2.38.2-1                                                                                       |
| Speech Dispatcher | 0.11.1-1ubuntu3                                                                                                  |
| eSpeak NG         | 1.50, Ubuntu package 1.50+dfsg-10ubuntu0.1                                                                       |
| Browser           | Google Chrome 121.0.6167.160                                                                                     |
| Display           | Xvfb display 96, 1280 by 900 pixels                                                                              |
| Baseline          | `http://127.0.0.1:3330`, build `IqM7S-izzhLw1FS90-lLJ`                                                           |
| Profiles          | Separate DBus, XDG paths, Chrome profile, and Orca preferences under `/tmp/queue-arcade-launch-checks/assistive` |

The test extracted free Ubuntu packages under `/tmp`. It did not install system packages or change personal settings. The AT-SPI bus used a separate address service. The WSLg socket directory was read-only, so Xvfb used a separate TCP display. The session script stops its test services when the run ends.

## Baseline findings

| Flow                     | Observed result                                                                                                                                                                                                                                |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Home keyboard navigation | Tab reached Home, sound toggle, volume, Play Dota, Party, Steam sign-in, and Profile in order. Orca spoke their names and roles.                                                                                                               |
| Classic answer           | Orca spoke `A 160 toggle button not pressed`. Enter submitted one vote. The result explanation was spoken.                                                                                                                                     |
| Automatic next round     | No utterance during the 2,537 ms interval from `1791289578283` to `1791289580820`. Focus remained on `BODY`. Pressing Orca's H command then found `Round 2 heading level 1`. This was a defect.                                                |
| Hero search              | Orca named `Filter heroes`, spoke typed text, and announced Abaddon. Enter submitted the hero. The reveal identified the correct hero and explanation.                                                                                         |
| Year slider              | Orca named `Year`. Right changed the value from 2017 to 2018 and spoke `2018`. Tab reached Lock; Enter submitted `year-v1:2018`.                                                                                                               |
| Order Up                 | Native Tab and Enter selected four different cards and submitted one order. Orca spoke card names and pressed state.                                                                                                                           |
| Shopkeeper search        | Orca spoke `Search shop items` and `Gloves of Haste, 450 gold`. Selecting the item cleared search, removed the focused button, and left focus on `BODY`. There was no selection confirmation during the next three seconds. This was a defect. |

The first exploratory Order Up run toggled the same card four times. It did not submit an order. The corrected run selected four distinct cards and submitted one order. Both records remain in the temporary evidence; only the corrected run supports the Order Up result above.

## Verified fixes

The first final run used Chrome 121 and the rebuilt production app at `http://127.0.0.1:3331`, build `YC6nz9frAbvjRFKHq5lSy`. Both new browser regressions passed. The scoped ESLint check, full TypeScript check, and formatting check also passed.

| Check                  | Final observed result                                                                                                                                                                      |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| New round              | DOM focus moved to the Round 2 heading. Orca spoke `Round 2 heading level 1`, then `Round 2. What year did Dota 2 officially release?`. The prompt appeared once in the transition speech. |
| Next control           | Native Tab reached the Year slider. The browser regression also checks the first Tab without an Orca heading command.                                                                      |
| First recipe component | Focus returned to Search shop items. Orca spoke `Added Gloves of Haste. 1 of 2 components selected.`                                                                                       |
| Complete recipe        | Focus moved to Build. Orca spoke `Added Gloves of Haste. 2 of 2 components selected.` Enter submitted one recipe vote.                                                                     |
| Outside focus          | The browser regression kept focus on Game volume when the next round started.                                                                                                              |
| Polling                | The browser regression observed one nonempty round announcement, with no repeat on a same-round refresh.                                                                                   |

See the [final transcript](evidence/assistive/final-transcript.json), [verification record](evidence/assistive/verification.json), and [Orca debug excerpt](evidence/assistive/orca-speech-excerpt.txt). The [round recording](evidence/assistive/round-announcement.wav) and [recipe recording](evidence/assistive/recipe-selection.wav) join consecutive output packets without other audio changes. [PCM measurements](evidence/assistive/wav-inspection.json) confirm nonzero samples and successful synthesis.

The baseline [slider recording](evidence/assistive/year-slider-2018.wav) and [result recording](evidence/assistive/classic-result.wav) show the working value and result speech. These recordings verify generated speech. They do not substitute for a listening session on a physical device.

## Current browser check and remaining issue

The same production build was checked with Chrome for Testing `149.0.7827.55` and `153.0.8010.12`. Both browser regression scripts also pass in Chrome 153. The [Chrome 149 transcript](evidence/assistive/final149-transcript.json) confirms the complete recipe speech flow. The [Chrome 153 transcript](evidence/assistive/final153-transcript.json) confirms the new-round announcement and the first component announcement.

Orca 42 with Chrome 153 has a remaining text-entry mode problem. After the first component, DOM focus returns to Search, but Orca stays in browse mode. Typing `gloves` invokes reader navigation commands and leaves the query empty. In this run, the next item was Magic Wand rather than a filtered Gloves of Haste result. This is not a full recipe screen-reader pass.

Ordinary native Tab away and Shift+Tab back to Search makes Orca speak `Focus mode`. The same letters then enter the input, and the second component announcement and Build action work. See the [native-focus control](evidence/assistive/probe-native-transcript.json). No explicit reader mode toggle was used. A [one-frame delay](evidence/assistive/probe-raf-transcript.json) and a [150 ms delay](evidence/assistive/probe-delay-transcript.json) did not correct the programmatic focus case. Those probes changed only the test page at runtime. No timing workaround was added to app source.

The cause of the Orca 42 result is not established. The modern-reader check below uses a newer native stack and a stock speech output module, so it cannot isolate the reader version as the only cause.

That check cannot use the current native libraries. Python 3.10.12 meets the Python requirement, but the installed AT-SPI library is `2.44.0-3`. The [Orca 49 build requirements](https://raw.githubusercontent.com/GNOME/orca/gnome-49/meson.build) require AT-SPI 2.52 and ATK bridge 2.50 or newer. [Orca 50](https://raw.githubusercontent.com/GNOME/orca/gnome-50/meson.build) requires both at version 2.56 or newer. [Current Orca source](https://raw.githubusercontent.com/GNOME/orca/main/meson.build) requires both at 2.58.6 or newer and the new `gi.overrides.Atspi` module. That module is absent here. A Python-only temporary install cannot meet those requirements. The host libraries stayed unchanged. The container below supplies the newer libraries.

## Modern reader in an isolated container

The follow-up built Orca 49.8 from GNOME's `gnome-49` source in a disposable Ubuntu 24.04.5 image. It used AT-SPI and ATK bridge 2.52.0, Python 3.12.3, Speech Dispatcher 0.12.0-rc2, eSpeak NG 1.51, PulseAudio 16.1, Openbox 3.6.1, and the exact Chrome for Testing `153.0.8010.12` binary. The [environment record](evidence/assistive/modern-orca49/environment.json) includes package versions and the downloaded source hash. The final app was `http://127.0.0.1:3333`, build `NsjBPH5Ygi5SqnYfuwSHz`, reached through the container's host gateway.

The container used separate DBus, Xvfb, browser, reader, and XDG profiles. Repository and browser mounts were read-only. The host gateway origin was marked secure for this local test, matching localhost's secure-context behavior. No host package or personal setting changed. The test container has stopped.

The stock `sd_espeak-ng` module kept normal speech index and cancellation callbacks. FFmpeg recorded its PulseAudio null-sink monitor. The earlier generic file output is not the evidence for this stock-module result. The [audio measurements](evidence/assistive/modern-orca49/audio-inspection.json) confirm nonzero PCM. No human listening or physical speaker test occurred.

Before changing the initial lobby fixture, the driver pressed native Control once. Control stops Orca's current speech. It did not switch between Browse and Focus mode. The driver sent no extra stop or mode command between selecting a component and typing into the recovered Search field. A separate recipe run used a fresh reader, browser, and profile.

| Final-build check          | Result                                                                                                                                                                                                                                             |
| -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Recovered round focus      | Passed. Focus moved to the Round 2 heading. Native Tab reached Year.                                                                                                                                                                               |
| New round prompt           | Failed in the stock-module run. Orca spoke `Round 2 heading 1 clickable.` but did not speak the new question during the 6,037 ms observation window.                                                                                               |
| First recipe selection     | Passed in the fresh recipe run. Focus returned to Search, Orca entered Focus mode, and it requested `Added Gloves of Haste. 1 of 2 components selected.`                                                                                           |
| Second recipe selection    | Passed. Native typing entered `gloves`, the second count announcement occurred, and focus moved to Build.                                                                                                                                          |
| Recipe submission          | Passed. Enter submitted exactly one `recipe-v1:gloves+gloves` vote.                                                                                                                                                                                |
| Second page in one session | Failed before recipe selection. Even after native Control at the second entry gate, Orca remained in SayAll and ignored native Search focus events. The query stayed empty. This is separate from the successful fresh-session selection recovery. |

The [verification record](evidence/assistive/modern-orca49/verification.json) preserves the failed prompt assertion. The [recipe transcript](evidence/assistive/modern-orca49/recipe-transcript.json) and [recipe audio](evidence/assistive/modern-orca49/recipe-audio.wav) support the fresh-session result. The same targeted recipe flow also passed on the preceding build `2156i_Ft_RgrUFq0svQeJ` at port 3332.

For the prompt failure, AT-SPI delivered the status text at `13:28:26.679709 UTC`. Orca discarded the insertion at `13:28:26.679766` with `Ignoring object:text-changed:insert due to multiple instances in short time`. The heading-focus event arrived later at `13:28:26.681034`; heading speech followed at `13:28:26.769027`. The reader discarded the status event before it spoke the focused heading. See the [event order](evidence/assistive/modern-orca49/round-event-order.txt), [combined transcript](evidence/assistive/modern-orca49/combined-transcript.json), and [round audio](evidence/assistive/modern-orca49/round-audio.wav).

The retained-focus control also lost the prompt while Game volume stayed focused. The failure therefore did not require heading focus or competing focus speech. Orca 49's [event filter](https://github.com/GNOME/orca/blob/gnome-49/src/orca/event_manager.py#L333) exempts text insertion into a live `SECTION` from its 100 ms event filter. Chrome exposed the `role=status` region as `STATUS_BAR`.

Removing only the redundant role before initial accessibility-tree creation exposed a `SECTION`. With `aria-live=polite` and `aria-atomic=true` unchanged, Orca spoke the full prompt exactly once. The control passed with focus on Game volume and with focus recovered to the round heading. See the [control summary](evidence/assistive/modern-orca49/controls-summary.json), [unchanged control](evidence/assistive/modern-orca49/control-external-status.json), [generic live-region control](evidence/assistive/modern-orca49/control-external-generic-initial.json), and [recovered-focus control](evidence/assistive/modern-orca49/control-recovered-generic.json). Removing the role after first exposure did not change the cached AT-SPI role, so that late-change attempt does not support the result.

The source fix removes that one redundant role. It adds no delay and preserves the existing focus guards. `scripts/check-orca-round.mjs` fails against the recorded original stock-module run and passes both successful controls. It checks the actual Orca speech log, expected focus, and native Tab to Year. The final source verification below confirms the change in a production rebuild. The evidence does not establish full Orca 49.8 support for a continuous game session.

The [Dockerfile](evidence/assistive/modern-orca49/Dockerfile.txt), [session script](evidence/assistive/modern-orca49/modern-session.sh.txt), [driver](evidence/assistive/modern-orca49/modern-check.mjs.txt), and [speech configuration](evidence/assistive/modern-orca49/speechd.conf.txt) retain the setup. Full logs and continuous audio remain under `/tmp/queue-arcade-launch-checks/assistive-modern`.

## Final source verification

On 2026-10-08, three native reader sessions checked production build `fQ95T7-zzQo1Bnsef8oBI` at port 3334. Each driver fetched the build manifest and matched its SHA-256 against the built file before the user flow. The driver did not alter the live-region role at runtime. The app source retained `aria-live=polite` and `aria-atomic=true`, with no explicit `role=status`.

| Case | Result |
| --- | --- |
| An answer control disappears before the next round | Passed. Orca spoke the new prompt exactly once. Focus moved to the Round 2 heading. Native Tab reached Year. |
| Game volume is focused when the next round begins | Passed. Orca spoke the same prompt exactly once. Focus stayed on Game volume. Native Tab reached Year. |
| Search and build a recipe | Passed. Native typing entered both searches. Orca spoke the first and second component counts. Focus returned to Search after the first pick and moved to Build after the second. Enter submitted exactly one `recipe-v1:gloves+gloves` vote. |

The [verification record](evidence/assistive/final-orca49/verification.json) contains all assertions, source hashes, speech requests, and audio measurements. The [recovered-focus transcript](evidence/assistive/final-orca49/recovered-transcript.json), [retained-focus transcript](evidence/assistive/final-orca49/external-transcript.json), and [recipe transcript](evidence/assistive/final-orca49/recipe-transcript.json) retain native input and DOM observations. The stock Speech Dispatcher output was recorded through PulseAudio. The [recovered-focus audio](evidence/assistive/final-orca49/recovered-audio.wav), [retained-focus audio](evidence/assistive/final-orca49/external-audio.wav), and [recipe audio](evidence/assistive/final-orca49/recipe-audio.wav) contain nonzero PCM. No physical speaker or human listening check is claimed.

The existing Ubuntu 24.04 reader image supplied Orca 49.8 and AT-SPI 2.52.0. The exact Chrome 153.0.8010.12 files and fixture dependencies were copied into a disposable container. Docker's WSL integration socket was unavailable after the session restart, so the test used the installed Windows Docker CLI and tar streams. The [input record](evidence/assistive/final-orca49/portable-reader-inputs.json) gives the image digest, archive hash, and narrow copy paths. No repository environment file, personal browser profile, host mount, or Docker setting was used or changed.

The first retained-focus setup stalled on stale audio services before the app driver started. That attempt has no app result. The [setup record](evidence/assistive/final-orca49/setup-attempts.json) and [log](evidence/assistive/final-orca49/stale-service-attempt.log) retain it. Resetting the disposable container between sessions gave clean reader and browser processes. Both remaining cases then passed. The container was removed after the checks.

The reader checker still rejects the original failed speech recording and accepts both diagnostic controls. See [checker controls](evidence/assistive/final-orca49/round-checker-controls.json). The [file manifest](evidence/assistive/final-orca49/sha256.json) binds the final evidence. Compressed full Orca logs and raw app results are retained beside the transcripts, so these assertions can be checked without the temporary runtime.

These were separate targeted sessions. The earlier two-page SayAll problem was not retested as a continuous final-source session. This pass does not establish every format's screen-reader support or support in another operating system or reader.

## Real browser zoom

The zoom tests used Chrome 121 on the baseline and Chrome 153 on the final production build. They used native Ctrl++ shortcuts in Chrome with no emulated viewport. This was browser page zoom, not a smaller CSS viewport or pinch zoom.

| Zoom | CSS viewport | Device pixel ratio | Horizontal overflow | Keyboard result                                                        |
| ---- | ------------ | ------------------ | ------------------- | ---------------------------------------------------------------------- |
| 200% | 639 by 411   | 2                  | None                | Tab reached a named answer with a visible focus outline.               |
| 400% | 319 by 205   | 4                  | None                | Tab reached answer B with a visible focus outline. Enter submitted it. |

Chrome 153 had a 639 by 406 CSS viewport at 200% and a 319 by 203 viewport at 400%. Device pixel ratios were 2 and 4. It also had no horizontal overflow, reached visible answer controls with native Tab, and submitted with Enter at 400%. See the [Chrome 153 measurements](evidence/assistive/native-zoom-chrome153.json), [200% display](evidence/assistive/native-zoom-200-chrome153.png), and [400% display](evidence/assistive/native-zoom-400-chrome153.png).

The table above records Chrome 121. See [200% display](evidence/assistive/native-zoom-200.png), [400% display](evidence/assistive/native-zoom-400.png), and [measurements](evidence/assistive/native-zoom.json). The native display screenshots include the Chrome controls. Chrome's page screenshot command returned an incorrect crop under native zoom, so those page captures are not used as visual evidence.

## Repeatable checks

Run against the rebuilt local app. Set `CHROME_BIN` to the retained wrapper for Chrome 153, or omit it to use the system Chrome 121:

```sh
CHROME_BIN=/tmp/queue-arcade-launch-checks/assistive/chrome153-wrapper.sh APP_URL=http://127.0.0.1:3331 node scripts/check-round-accessibility.mjs
CHROME_BIN=/tmp/queue-arcade-launch-checks/assistive/chrome153-wrapper.sh APP_URL=http://127.0.0.1:3331 node scripts/check-shop-accessibility.mjs
```

Both scripts failed against the baseline. The round check found no status text. The shop check found no focused search field after selection. The checks exercise rendered components, native browser keyboard input, and local API fixtures. They do not claim to be screen-reader tests by themselves.

For the separate Orca run, the retained setup uses:

```sh
cd /tmp/queue-arcade-launch-checks/assistive
source env.sh
ASSISTIVE_APP_URL=http://127.0.0.1:3331 ASSISTIVE_BROWSER=/home/kulmisiu/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome dbus-run-session -- bash final-session.sh
```

The session runs a separate screen reader, display, accessibility bus, speech service, and browser. The selected setup files are in [evidence/assistive](evidence/assistive). JavaScript captures have an extra `.txt` suffix to keep archived test code out of repository lint scans. Remove that suffix when copying them back to the temporary test directory. Full temporary evidence, package files, speech recordings, and Orca debug logs are under `/tmp/queue-arcade-launch-checks/assistive`.

## Sources and limits

GNOME documents that [Orca debug output records keyboard events and speech](https://orca.gnome.org/debugging). Its [live region guide](https://help.gnome.org/orca/howto_live_regions.html) explains dynamic announcements, and its [speech preferences](https://help.gnome.org/orca/preferences_speech.html) describe the synthesizer and spoken roles. The capture setup follows the [Speech Dispatcher generic output configuration](https://github.com/brailcom/speechd/blob/master/config/modules/espeak-ng-mbrola-generic.conf) and the [eSpeak NG user guide](https://github.com/espeak-ng/espeak-ng/blob/master/docs/guide.md). Sources were checked on 2026-10-06.

These results cover the listed Linux and Chrome flows. They do not establish VoiceOver, NVDA, JAWS, TalkBack, Firefox, braille, or physical-device support. They also do not establish that every visual or audio question is independently playable without sight or hearing.

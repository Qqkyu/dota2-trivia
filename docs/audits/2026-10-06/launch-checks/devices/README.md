# Device and assistive checks

Dates: 2026-10-06 and 2026-10-08. Final native checks used `http://127.0.0.1:3334`, build `fQ95T7-zzQo1Bnsef8oBI`.

This pass adds native operating-system input, Linux screen-reader speech, and real browser zoom to the earlier Playwright viewport checks. It uses disposable local environments. It does not claim a physical phone, iPhone, VoiceOver, NVDA, JAWS, or braille test.

The [assistive report](assistive.md) records the tested browser and reader combinations, speech evidence, app fixes, and remaining limits. The final source passes all three targeted Orca 49.8 and Chrome 153 cases. A stable polite live region announces the next prompt once. Focus returns to the round heading when an answer control disappears, or stays on the active volume control. Shopkeeper speaks both component counts and returns keyboard focus to Search or Build. The tests check actual screen-reader speech, native keyboard input, and synthesized audio.

The [final Android report](android-final.md) records a partial native check in Android 11 and Firefox 157.0.1. Native Party navigation, keyboard input, retained form state, and a server-confirmed Join passed. The completed waiting-room screen and settled landscape layout remain unverified. This is not a complete Android gameplay pass. The [runtime inventory](runtime-inventory.json) and [attempt records](android-attempts.json) retain the Android 16 startup failures and the Android 11 limits.

## Native test methods

| Method | What it exercises | What it does not establish |
| --- | --- | --- |
| Android Emulator with an Android system image | Android OS, browser process, native input method, screen rotation, and app background state | Physical touch hardware, GPU timing, battery use, or a real mobile network |
| Native ADB touch and key events | Android's input path and software keyboard | A person's finger accuracy or gesture experience |
| WebDriver connected to Android Firefox | Assertions in a real Android browser | A physical device, or native input when JavaScript performs the action |
| Orca with AT-SPI and Speech Dispatcher | Browser accessibility events, reader navigation, and synthesized speech | Human comprehension, physical speakers, other screen readers, or every game format without sight |
| Native browser zoom shortcuts | Actual 200% and 400% page zoom, reflow, and keyboard access | Android pinch zoom or iOS Dynamic Type |

Android Emulator is an official local device emulator. [Google's acceleration guide](https://developer.android.com/studio/run/emulator-acceleration) documents KVM on Linux and WHPX on Windows. This WSL host has no `/dev/kvm`; its Windows Hypervisor Platform optional feature is disabled. The attempted Android runtimes therefore use software CPU emulation. [Google documents that mode as unsupported and slow](https://developer.android.com/studio/run/emulator-commandline).

[Appium UiAutomator2](https://github.com/appium/appium-uiautomator2-driver) can drive Android native and browser interfaces. It still needs a working emulator or connected device. Installing it would not remove this host's missing CPU acceleration. Direct [ADB commands](https://developer.android.com/tools/adb) and Mozilla's [Android WebDriver support](https://firefox-source-docs.mozilla.org/testing/geckodriver/Flags.html) cover the intended local inputs and assertions without an extra automation service.

## Isolation

The SDK downloads, Android homes, virtual devices, browser profiles, reader settings, and speech recordings use `/tmp/queue-arcade-launch-checks`. The ADB server was started only after confirming its port was unused. Commands select the task-owned `emulator-5582` device. No personal browser profile, connected phone, system setting, paid service, or host virtualization setting was changed.

The Android browser reaches the app through `adb reverse` and the exact `127.0.0.1:3334` origin for the final run. This keeps the app's origin checks active. Reverse forwarding does not prove emulator mobile-network throttling applies to the connection. No network-throttling result is claimed without a separate measured proxy test.

The emulator's audio device is disabled in these startup attempts. A media element's playback state would not prove speaker output. The separate Linux reader run records actual synthesized audio as described in its report.

The final emulator, task-owned ADB server, and reader container are stopped. The final reader container used only copied browser files, fixture code, and public question data. No personal profile, repository environment file, or host Docker setting was copied or changed.

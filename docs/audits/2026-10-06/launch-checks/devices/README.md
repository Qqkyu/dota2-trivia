# Device and assistive checks

Date: 2026-10-06. Final app origin: `http://127.0.0.1:3333`. Build: `NsjBPH5Ygi5SqnYfuwSHz`.

This pass adds native operating-system input, Linux screen-reader speech, and real browser zoom to the earlier Playwright viewport checks. It uses disposable local environments. It does not claim a physical phone, iPhone, VoiceOver, NVDA, JAWS, or braille test.

The [assistive report](assistive.md) records the tested browser and reader combinations, speech evidence, two app fixes, and remaining limits. The app now announces round prompts through a stable status region and recovers focus when an answer control disappears. Shopkeeper announces selected components and returns keyboard focus to Search or Build. The tests distinguish a DOM status update from speech that the reader actually emits.

The Android work is still in progress. [Runtime inventory](runtime-inventory.json) and [attempt records](android-attempts.json) record the exact tools and environment failures. No Android app journey has passed or failed yet. Runtime startup failures before the app loads are not app defects.

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

The Android browser reaches the app through `adb reverse` and the exact `127.0.0.1:3333` origin. This keeps the app's origin checks active. Reverse forwarding does not prove emulator mobile-network throttling applies to the connection. No network-throttling result is claimed without a separate measured proxy test.

The emulator's audio device is disabled in these startup attempts. A media element's playback state would not prove speaker output. The separate Linux reader run records actual synthesized audio as described in its report.

# Final Android check

Date: 2026-10-08. App: `http://127.0.0.1:3334`. Build: `fQ95T7-zzQo1Bnsef8oBI`.

The native Android run verified Party navigation, keyboard input and a Join request that added the Android guest to the local room. It did not verify a complete gameplay journey. The waiting-room screen and settled landscape layout remain unverified.

## Environment and method

This was the official Android Emulator 37.2.12 with the existing Android 11 AOSP image and Firefox 157.0.1. The virtual screen was 720 by 1280 pixels at 320 dpi. The browser used Android's Latin keyboard. The host has no `/dev/kvm`, so this run used software CPU emulation and SwiftShader graphics with Vulkan disabled. No physical phone, paid service or host virtualization setting was used or changed.

The app was the isolated local candidate with synthetic data. ADB reverse forwarded port 3334 to that exact origin. ADB injected native taps, key events, orientation changes, Home and resume. No browser JavaScript performed those actions.

Firefox exposed its toolbar in the UiAutomator tree, but not the app's web content. I inspected the screenshots and checked the local server response. This is not a DOM-asserted browser test. The [action log](evidence/android/final-native-20261008/actions.jsonl) records the input sequence. The [results](evidence/android/final-native-20261008/results.json) give each check's status and evidence.

## Results

| Check | Result | Evidence |
| --- | --- | --- |
| Android starts within six minutes | Passed. The emulator log reports a boot time of 160,614 ms. | [Emulator log](evidence/android/final-native-20261008/emulator.log) |
| Party page and native Join navigation | Passed. The page rendered, and a native tap opened the code form. | [Party page](evidence/android/final-native-20261008/party-ready.png), [Join form](evidence/android/final-native-20261008/join-form.png) |
| Empty-code error message | Not verified. Submission focused the field and opened the keyboard, which covered the error area. Typing then cleared the error. | [Keyboard after empty submission](evidence/android/final-native-20261008/empty-code-validation.png) |
| Native text entry | Passed. Native key events entered `android11q8`; the focused field displayed `ANDROID11Q8` while the Android keyboard was open. | [Typed code](evidence/android/final-native-20261008/typed-code-keyboard.png) |
| Form state after rotation and Home/resume | Passed. The code remained visible in both captures. | [After rotation](evidence/android/final-native-20261008/landscape-code.png), [After resume](evidence/android/final-native-20261008/landscape-resumed.png) |
| Server accepts native Join | Passed. The room changed from one synthetic host to the host plus one active Android guest after the native tap. | [Before Join](evidence/android/final-native-20261008/server-create.json), [After Join](evidence/android/final-native-20261008/server-check.json) |
| Waiting-room screen finishes loading | Not verified. The browser URL changed to `/play`, but the captured frame still showed `Joining…`. | [Last portrait frame](evidence/android/final-native-20261008/joined-room.png) |
| Settled landscape layout | Unresolved. Captures showed cropped or stale-size content. They do not establish whether the cause was the app, Firefox or software emulation. | [Rotation frame](evidence/android/final-native-20261008/landscape-code.png), [Resume frame](evidence/android/final-native-20261008/landscape-resumed.png) |

The room was created through the local API as a test fixture. Only the Android browser joined it. The server assertion checked HTTP 200, the exact room code, two participants, the synthetic host, and one active guest. No real account or hosted data was used. The host became away after 90 seconds, and the app transferred host duty to the Android guest.

## Runtime limits and cleanup

Android showed one System UI not-responding dialog during Firefox startup. A native Wait tap cleared it, and the app then loaded. [The screenshot](evidence/android/final-native-20261008/party-load.png) and [native UI tree](evidence/android/final-native-20261008/boot-progress.xml) record the dialog. Screenshot capture preceded each UI-tree capture, so those two files can show different moments.

Native commands and rendering were slow. At the fixed 14:56 UTC deadline, I stopped the task-owned emulator with `adb -P 5037 -s emulator-5582 emu kill`. The command acknowledged shutdown, and the emulator process exited. The final landscape screenshot was still pending and returned `error: closed`; no image from that capture exists. No equivalent restart was attempted. After confirming that no device remained connected, I also stopped the ADB server that this task had started.

This run does not establish Android gameplay, audio output, TalkBack, physical touch accuracy, mobile network behavior or iOS support. The earlier viewport tests and this native run are separate evidence. The [attempt history](android-attempts.json) retains the Android 16 failures and the earlier Android 11 page-load attempt.

The [file manifest](evidence/android/final-native-20261008/manifest.json) binds the evidence and helper scripts by SHA-256. No app source changed in this check.

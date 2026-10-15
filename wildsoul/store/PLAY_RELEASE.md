# Vesperglen · Android / Google Play release handoff

**Status: preparation only, not a release candidate.** Policy references checked 15 October 2026. Check the Play Console again on submission day. The current sandbox cannot compile or install an Android app; the scaffold has not been device-tested.

## Current artifact status

| Artifact | Status |
|---|---|
| Browser build | `npm run build` succeeds; `dist/` and `vesperglen-web-demo.zip` generated |
| Capacitor native project | `android/` scaffolded with branded launch/splash art; `npm run android:sync` copies latest web assets |
| Debug APK | **Not built.** `./gradlew assembleDebug` fails here: no Java/JDK in environment |
| Release AAB | **Not built or signed.** Requires Android SDK, Gradle dependencies, device testing and an owner-controlled upload key |
| Play Store | **Not submitted or approved** |

## Version / Android configuration

- Provisional title **Vesperglen · The First Light**; verify trademark and game-name uniqueness. A quick search found a different *WildSoul App*, so the original working title was not used commercially.
- Provisional application ID: `com.vesperglen.hollowvale` (confirm package name availability and developer ownership before first upload). `versionCode` 1, `versionName` 0.1.0; bump the code each submission.
- `android/variables.gradle`: **minSdk 24, compileSdk 36, targetSdk 36**. As of 31 August 2026, new phone/tablet apps and app updates submitted to Google Play must target **Android 16 / API 36 or higher**. Official Play policy: [1](https://support.google.com/googleplay/android-developer/answer/11926878?hl=en-GB).
- Android 7.0/API 24 is the *configured* minimum, not a tested compatibility claim. WebGL 2 and a modern Android System WebView are needed. Test portrait, landscape, tablet, cutouts and Android 16 edge-to-edge navigation before release.

## Build and signing — owner-controlled

1. Install current Android Studio with SDK Platform 36, build tools, JDK compatible with Gradle 8.14.3/AGP 8.13 (normally JDK 17), and `adb`. The Gradle wrapper will need network access to its distribution and Android dependencies.
2. `cd wildsoul && npm ci --legacy-peer-deps && npm run android:sync`.
3. `cd android && ./gradlew assembleDebug` → `android/app/build/outputs/apk/debug/app-debug.apk`. Install on a real phone and an emulator; run smoke tests, check logs, memory and frame timing.
4. Configure **release signing privately** in Android Studio or via untracked local Gradle properties/CI secrets. Never commit a keystore or password; `android/.gitignore` excludes `*.jks` and `*.keystore`.
5. After a signed release build has passed review, use `./gradlew bundleRelease` → `android/app/build/outputs/bundle/release/app-release.aab`. New Play apps publish via Android App Bundles and Play App Signing; the owner should generate/store the upload key. Official guidance: [1](https://support.google.com/googleplay/android-developer/answer/9842756?hl=en) and [2](https://support.google.com/googleplay/android-developer/answer/9844279).
6. Use an internal test track first, then a qualifying closed test where applicable. New *personal* developer accounts created after 13 November 2023 need at least **12 opted-in testers continuously for 14 days** before applying for production access: [2](https://support.google.com/googleplay/android-developer/answer/14151465?hl=en). Do not claim that a test group has been recruited.

## Permission / privacy audit

- Source app manifest currently declares **no permissions**. The demo does not use location, contacts, camera, microphone, analytics, ads, IAP, login or backend. `android:allowBackup="false"` avoids implicit cloud backup of local saves. The Capacitor library and build toolchain must still be audited in the **merged release manifest** for inherited permissions; no merged manifest exists yet.
- Game saves, settings and collection are stored on-device in browser/WebView local storage. They can be deleted by clearing site/app data or uninstalling. The hosted *browser* demo still downloads files from a host, which may receive normal HTTP request metadata.
- Draft privacy page: `public/privacy.html`, bundled into `dist/privacy.html`. **Not ready for Play** until a real developer identity/contact and permanent HTTPS URL are provided, and the final build/host are reviewed. Fill in the Play **Data safety** questionnaire accurately for the *final* artifact; never assume local-only data automatically makes every form field "No". Play requires an accurate privacy policy/Data safety submission: [3](https://support.google.com/googleplay/android-developer/answer/10788890?hl=en).
- No account creation, so account-deletion UX is not applicable to this version; reassess if accounts or cloud saves are added. Document browser-host retention with the final provider. If any SDK adds collection, update consent, manifest, privacy policy and Data safety before release.

## Graphics / store listing

- `store/app-icon.png`: **512×512** original RGBA PNG with rounded edges; generated from `store/icon.svg`. Original adaptive launcher PNGs and splash screens were installed into `android/app/src/main/res`. `store/feature-graphic.png`: **1024×500** RGB PNG composed from an actual running-game capture and original typography. Google specifies these dimensions / formats: [1](https://support.google.com/googleplay/android-developer/answer/9866151?hl=en).
- Gameplay screenshots: `store/gameplay-desktop.png`, `store/battle-desktop.png`, `store/trainer-battle.png`, `store/cave-exploration.png`, `store/mobile-gameplay.png`, `store/party-captured.png`, etc. They are **real browser/phone-viewport-emulation captures**. They are **not** captures from an Android APK and therefore are *not ready to represent a verified Android build*. Replace with real Android phone/tablet captures after device testing; Play recommends at least three 16:9 landscape or 9:16 portrait in-game screenshots for games at 1920×1080 / 1080×1920 or better, and screenshots must represent actual gameplay: [1](https://support.google.com/googleplay/android-developer/answer/9866151?hl=en).
- Title, short/full descriptions and positioning drafts: [`listing.md`](listing.md). Complete age/content rating questionnaire honestly; unrated apps are not allowed (policy announcement: [1](https://support.google.com/googleplay/android-developer/answer/17134731)). Decide target audience, category, regions, support email and monetization only after developer review.

## Device/crash/performance checklist (not yet performed)

- [ ] Install debug APK on a baseline mid-range Android phone and a low-memory phone; record model, SoC/GPU, Android and WebView versions, resolution, quality setting, memory, cold start, typical/95th-percentile frame time and observed FPS. Target stable **30 FPS**, optional 60 FPS where tested — no FPS result is claimed here.
- [ ] Verify WebGL 2, shadows and fonts on Adreno, Mali and at least one tablet; profile draw calls, texture/geometry memory, thermal throttling, battery and repeated battles. Tune shadow map, DPR, forest instance count or draw distance as needed. Compare low/high graphics presets.
- [ ] Exercise touch movement/look, jump, bridge/cave collision, camera behind houses, interaction prompts, landscape UI, navigation bars/safe areas, Android Back button and long/short session resume. A browser `visibilitychange` saves and suspends audio; Android lifecycle interruptions require native testing.
- [ ] Test capture fail/success, trainer win/loss/rematch, quest rewards, evolution, party/storage at the 6/300 limits, bag at 40, corrupted saves and local-storage quota; verify an installed app retains data after an update but not after clearing app data.
- [ ] Confirm merged manifest is permission-minimal and no unintended SDK collects data. Run Android vitals, pre-launch report, crash/ANR monitoring and accessibility checks.
- [ ] **16 KB page-size compatibility:** Inspect packaged native libraries and test on a 16 KB emulator/device. Google documents 16 KB support for API 35+ apps and an update enforcement starting 1 February 2027: [1](https://developer.android.com/guide/practices/page-sizes). Do not claim compliance without inspecting the generated package.

## Submission steps

1. Verify ownership/name/package ID and replace provisional branding if needed; add developer identity and permanent privacy/support URLs.
2. Complete build, smoke/performance/regression/16 KB tests and true-device screenshots; use Play Console's pre-launch testing and app bundle explorer.
3. Audit manifest and Data safety; complete content rating, target audience, app access, developer verification, store listing and privacy forms.
4. Privately configure upload key, create signed AAB, verify signature and target API, enroll in Play App Signing.
5. Upload to internal testing; fix findings; run required closed test if account qualifies; apply for production access; only then submit for review. Nothing in this repository implies a Play listing or approval.

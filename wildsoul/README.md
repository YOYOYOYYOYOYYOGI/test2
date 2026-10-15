# Vesperglen · The First Light

**A real, offline-first 3D creature adventure vertical slice.** Original game art, code, models, setting, characters, dialogue and synthesized music. This is a *separate subproject* inside the existing `test2` repository; the unrelated root Chrome extension has not been replaced.

> Working name was Project Wildsoul. A quick title search found an existing **WildSoul App** in a similar space, so the demo is provisionally named **Vesperglen**. This is *not* trademark clearance: check relevant registers and app stores before commercial use.

## Play now / run locally

```bash
cd wildsoul
npm ci --legacy-peer-deps
npm run dev               # binds 0.0.0.0:5173
# open http://localhost:5173/
```

For a production-equivalent local preview:

```bash
npm run build
npm run preview -- --port 4173
# open http://localhost:4173/
```

Needs a recent browser with **WebGL 2** and local storage (Chrome / Edge recommended; current Firefox / Safari should work but were not tested in this sandbox). Bundled static assets and synthesized audio have no runtime CDN or account dependency. The game is designed for landscape desktop and portrait mobile; rotate a small phone if the view is too narrow. Its save key is `vesperglen.save.v1` in the browser origin's local storage. Backups use `.backup`. Different hostnames, protocols or browser profiles have *different local saves*.

### Controls

| Desktop | Phone / tablet |
|---|---|
| **WASD / arrows** walk · **Shift** run · **Space** jump | Drag the **left joystick** to move; hold **RUN**; tap **JUMP** |
| **Drag the 3D view** to rotate camera · mouse wheel zoom | Drag the **right half of the 3D view** to rotate camera |
| **E / Enter** interact; click the prompt arrow | Tap **ACT** near a person, wildling, cache, cave or waystone |
| **P** party · **I/B** bag · **J** journal · **M** map · **Esc** pause/close | Bottom menu buttons open companions, bag, journal, and pause; tap the circular minimap's MAP button |
| Battle: click moves, vials, tonics or switch; **1–4** select known moves | Battle: tap a move/item/companion; **RETREAT** works only against wildlings |

**First guided route:** Pick one of Orla's three starter companions. Talk to **Pip** to receive two free vials (once). Talk to **Orla** near the western cottage to accept *The First Light*. Walk south into the fields, approach a **Mosskip** (or another wildling), use a move, then choose **Vials** in battle. Return to Orla to claim the quest reward. Walk south to **Rowan** for the trainer battle. **Mira** at the hearth heals companions; **Fen** sells supplies. The bridge leads into Whisperwood; Echo Cave is to the southeast. Open the world map to see your position. Once the quest is complete, revisit the old waystone near the bridge to unlock travel to that discovered landmark.

## What is actually implemented

- One contiguous procedurally authored **3D Hollow Vale**: four-cottage village, terrain-following trails, river, bridge, lake, meadow, instanced forest and vegetation, rocks, hills, a walk-in cave, crystals, lanterns, waystone, soft shadows, fog, and a six-minute day/dusk lighting cycle. Near-zone wildling meshes activate/deactivate; defeated/captured spawns recover after a cooldown (rare spawns may not immediately return).
- Third-person avatar with responsive camera-relative walk/run/jump, smooth camera orbit and zoom, building/terrain/river/rock/tree collision, camera obstruction handling, keyboard and touch controls. Mobile defaults to lower vegetation/shadow density and DPR 1.
- **12 original species definitions** (11 silhouette families), fully data-driven stats, 19 moves, seven affinities, status/scorch, critical hits, speed order, wild and one-trainer battles. Three original selectable starter models and animations; *all 12* species have battle-capable moves. Bristlebloom evolves into Thorncrest at level 5 and registers the evolved form in the guide.
- Catch chance depends on health, rarity, status and vial strength. Failure consumes the vial, logs feedback and allows the encounter to continue; success sends to the six-slot party or up to 300 lodge storage slots, updates the guide/quest/inventory/save. At full storage, capture is refused **before** using a vial.
- Party ordering, storage transfer, searchable/filterable/sortable field guide, rendered 3D model portraits, nicknames, stats, moves, HP/XP; item bag (40 slots), healing in/out of battle, shop buy/sell, currency, hidden one-time caches.
- Five interactable NPCs (guide, researcher, healer, merchant, trainer), one complete quest and one repeatable trainer challenge **with first-victory rewards only**, quest journal, minimap, world map and unlocked two-point fast travel. Travel cannot bypass quest completion and requires visiting the destination first.
- Safe interrupted-battle behavior: after every resolved turn, changed health/items are saved. A reload starts outside the unfinished encounter; the pause menu can abandon it without rewards. No remote account, tracking, ads, payments or network play.
- Original generated ambient/battle music and cues using Web Audio; sound starts after the user's first interaction. Settings for volume/mute, camera sensitivity/inversion and graphics.

For exact implemented/partial/unimplemented status and the next milestone, see [`ROADMAP.md`](ROADMAP.md).

**Not a finished large commercial open-world RPG.** This slice has one compact region, one single-wildling trainer battle, one quest, one evolution, procedural original models (not hand-sculpted AAA assets), no weather, no avatar creator, no dungeons beyond the small walk-in cave, no cloud saves/multiplayer, and no tested native Android performance. The battle arena is a separate **rendered 3D scene** that transitions back to the same explorable world. The WebView-wrapped Android version is *not* a Unity-native/URP game and has not yet been profiled or compiled here.

## Project architecture

```
wildsoul/
  src/data/          original species, moves, affinities, item definitions
  src/core/          battle turns, capture, progression/evolution, party, quest, inventory, validation/persistence
  src/world/         terrain, 3D species/person models, camera/touch controls, wild spawns, battle scene, portraits
  src/ui/            HTML interface, SVG icons, minimap/world map, responsive CSS
  src/audio/         original Web Audio score and UI/action cues
  tests/             23 Vitest engine, terrain and persistence tests
  scripts/           browser smoke, complete adventure and bridge-to-cave E2E, store asset generator
  android/           actual Capacitor 8 Gradle/Android Studio project, targetSdk 36
  public/privacy.html  privacy-policy *draft* (requires developer details before release)
  store/             original artwork, feature graphic, listing prep and actual browser captures
  dist/              generated static web build (ignored; recreate with npm run build)
```

World spawns are data/coordinates in `src/world/world.ts`; definitions and learnsets in `src/data/species.ts`; each new species can use a silhouette family or a new geometry builder in `src/world/models.ts`. The pure battle engine `src/core/battle.ts` takes a save state, a session, an action and an injectable RNG, returning a new state plus combat events; UI and renderer do not compute rewards. `src/core/save.ts` validates version, bounds, unique IDs, quantities and runtime species before saving/loading, keeps a valid previous backup, and does not write invalid state. No secret keys or external SDKs are bundled.

## Tests and evidence

```bash
npm run typecheck
npm test                    # 23 deterministic battle, capture, quest, terrain, inventory and save tests
npm run build
# In another terminal: npm run preview -- --port 4173
npm run test:browser        # headless real Chromium + SwiftShader; UI/movement/camera/touch/save smoke
npm run test:adventure      # real navigation to Orla, wild capture failure/success, quest, Rowan trainer victory
npm run test:cave           # physically cross bridge and forest, enter/interact with Echo Cave
```

Verified in this workspace on 15 October 2026: `npm run android:sync` built and copied the browser assets, `npm test` passed **23/23**, `npm run test:browser` passed **8/8** checks, and both `npm run test:adventure` and `npm run test:cave` passed. The Android instrumentation test is authored but **not run**. The browser tests use npm-bundled Chromium and SwiftShader on minimal Linux; no browser binary needs downloading from Google. They are **not hardware FPS benchmarks**. Browser tests run against the local built site at `http://127.0.0.1:4173/` by default; set `GAME_URL` for another reachable URL. The adventure E2E injects deterministic random rolls *only in the test browser* to cover both failed and successful catches. Neither navigation script teleports the player. The cave test follows a procedurally clear trail around its western rock wall, opens the real cave interaction and checks the saved discovery; run `CAPTURE_CAVE_SCREENSHOT=1 npm run test:cave` to refresh the evidence image. Screenshots in `store/` were captured from the working game in headless Chromium (desktop and phone viewport emulation); they are **not Android device screenshots**. Observed page errors in those flows: none. No claims about 30/60 FPS on a physical phone have been made. Test a real mid-range Android device and profile GPU frame time/draw calls/memory before publishing.

Known constraints: WebGL 2 is required; some Android WebViews may need an OS/WebView update. Local storage may be cleared by browser storage policies. With very small landscape windows, battle models have less visual room although buttons remain functional. Vegetation density changes with the quality preset **on next reload**, while DPR updates immediately. The server preview is session-lived, not permanent hosting.

## Android project (scaffolded, not compiled here)

`android/` is a **generated and branded Capacitor 8 Android project**, not just a config snippet. `android/variables.gradle` sets minSdk **24**, compile/targetSdk **36**. The current app ID recommendation is `com.vesperglen.hollowvale` (verify global package uniqueness and trademark before release). Manifest requests no game permissions, disallows Android backup for local-only saves, and bundles the site under a local origin. The release privacy/data-safety audit still needs a **merged-manifest** check on real build tools.

On a computer with Android Studio, Android SDK Platform 36 + build tools, a working JDK supported by the Gradle/AGP versions (typically JDK 17), Gradle dependency access, and an Android device/emulator with WebGL 2:

```bash
cd wildsoul
npm ci --legacy-peer-deps
npm run android:sync          # builds static assets and copies them into android/app/src/main/assets
cd android
./gradlew assembleDebug      # debug APK: app/build/outputs/apk/debug/app-debug.apk
# install with adb install -r app/build/outputs/apk/debug/app-debug.apk
# open in Android Studio for device profiling and signed release wizard
```

A production AAB needs the user's **private upload key** generated and stored outside Git and a verified release config in Android Studio; do not share it in chat or commit it. After signing configuration, `./gradlew bundleRelease` outputs `android/app/build/outputs/bundle/release/app-release.aab`. Enroll in Play App Signing, check the final merged manifest and target SDK, run real device and 16 KB page-size tests, recapture screenshots on Android, complete listing/privacy/content-rating forms and track tests. See [`store/PLAY_RELEASE.md`](store/PLAY_RELEASE.md).

**This sandbox has no `java`, JDK, Android SDK, adb, Gradle distribution or Google Maven access.** `./gradlew assembleDebug` was attempted and fails immediately: `JAVA_HOME is not set and no 'java' command could be found`. Therefore there is **no debug APK, release AAB, signed build, Android-device FPS measurement or Play publication** in this delivery.

## Deployment

The generated `dist/` folder is a self-contained static site; Vite sets `base: './'` so it can run at a subpath. Host the *contents* of `dist/` as static HTTPS files on any static host, with `index.html` at the chosen path. No backend, environment variables or rewrites are needed; ensure the host serves JS, WOFF2 and SVG with correct MIME types. `privacy.html` is included. [`vesperglen-web-demo.zip`](vesperglen-web-demo.zip) is a ready-to-upload archive of that static output. [`vesperglen-source.zip`](vesperglen-source.zip) is a self-contained snapshot of the source, Android scaffold, store assets and tests (dependencies/build output excluded). The Git branch is the primary source of truth; after edits run `npm run build && python3 scripts/package.py` to refresh and integrity-check both ZIPs. For example, Netlify Drop accepts the unzipped `dist/` directory, or upload the files to a dedicated Pages repository and enable GitHub Pages there. Verify the host URL in a real browser, including asset paths and save isolation.

**This repository already serves an unrelated live GitHub Pages site from the `gh-pages` branch.** This session is fixed to `arena/c1552908-test2`, so this delivery intentionally did not overwrite or reconfigure that existing site. Arena's live preview URL remains available while the preview process/session is running; for a permanent independent public URL, a separate host or explicit permission to change the existing Pages site is required. Do not advertise the existing unrelated Pages URL as this game.

## Rights / asset provenance

All geometry, textures (vertex colors), UI vector artwork, graphics, dialogue and music generation here were authored for this project. `store/ASSET-SOURCES.txt` documents the imagery. Three.js and Capacitor are MIT licensed. Inter and Cormorant Garamond are under the SIL Open Font License 1.1, installed via `@fontsource` and bundled locally. No creature, art, sound or code was imported from Pokémon or another monster-catching franchise. See each installed package's LICENSE and the locked dependencies for further licenses. All store materials are drafts, not a trademark approval or Play Store submission.

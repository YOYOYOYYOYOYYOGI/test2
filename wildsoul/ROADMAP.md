# Vesperglen roadmap · honesty ledger

As delivered 15 October 2026. "Implemented" means in the browser slice, not a native performance certification.

## Implemented and tested (Milestone 1)

- Real contiguous 3D region with village/meadow/forest/river/lake/bridge/cave, avatar, third-person keyboard/touch camera and movement, NPC interaction.
- 12 original species definitions, 3 starter choices, visible wild spawns, turn-based combat, capture success/failure, six-slot party and 300-slot lodge storage, shop/items, XP/levels, one evolution, healer.
- First Light quest, Rowan trainer battle with one-time reward, map and two safe travel anchors, journal, local save/backup, responsive interface, procedural sound.
- TypeScript build, 23 deterministic engine/terrain tests and real Chromium smoke/full-adventure/bridge-to-cave E2E tests; manually inspected actual browser captures. Branded Capacitor Android project and draft Play materials.

## Partial / needs further testing

- Mobile optimizations (instancing, density presets, DPR cap, cooldown/nearby simulation) are in place, **but Android performance/FPS/memory have not been measured** on a physical device.
- Android wrapper exists and has API 36 config, but no compiled APK/AAB or native/WebView/safe-area compatibility tests; Android-specific instrumentation test is authored but cannot run here.
- Art is original procedural low-poly geometry with idle/walk effects and synthesized audio. Creature-specific cries, bespoke rigged animations, ambient weather, authored terrain meshes and richer battle/capture effects need a dedicated art/audio pass.
- Browser preview URL is live while this Arena session's process runs; permanent public static hosting needs a separate host or explicit permission to modify the repo's existing unrelated Pages site.
- Android privacy page/listing are drafts; final legal owner/contact, classification, device screenshots, Data safety form and source/third-party license audit are required.

## Not yet implemented

- More regions, a true interior dungeon, additional story acts, multiple opposing creatures per trainer, advanced AI, additional quests, advanced status effects, breeding, procedural weather, cosmetic avatar selection, voice acting, physical gamepad support, cloud saves or multiplayer.
- Android release signing, crash telemetry, Play Console listing, production rollout, tablet/GPU matrix and 16 KB page-size verification.

## Next focused milestone (Milestone 2)

1. On real Android devices, fix any WebView/touch issues and measure cold start, 95th-percentile frame time, memory and battery. Aim for a **tested** 30 FPS baseline; lower shadow/geometry cost as the profiler indicates.
2. Add two distinct quest arcs, a second trainer with a multi-creature party, four new wild moves and a second evolution, each with new battle and save regression tests.
3. Build richer creature animations/individual sound cues, a visible capture vessel VFX and a compact cave chamber. Add stronger world navigation/objectives and accessible controls.
4. Deploy the verified static build to an independent persistent HTTPS host and update the privacy URL. Then capture actual Android gameplay screenshots and prepare an internal test APK.

Milestone 3 grows Hollow Vale into further towns/habitats and story; Milestone 4 adds polish, balancing and accessibility; Milestone 5 is an Android release candidate only after device profiling, signed AAB verification, store compliance and user-run Play testing.

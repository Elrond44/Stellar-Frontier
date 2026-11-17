# v8 progress (concept-sheet fleet at true scale)

Branch `v8-wip` holds local WIP commits. `main` stays at v7 (45689c9) until v8 passes all suites. Tests live outside the repo in `/workspace/stellar-frontier/tests`.

## Done
- `src/hulls.js`: 15 hulls from the concept sheet, built procedurally at true scale (1 u = 5 m; Scout 20 m … Dreadnought 720 m). Includes:
  - faction paint schemes and emblems;
  - keel hitbox segments (`hullSegs`);
  - a merged low-poly LOD mesh per hull.
- `src/lod.js`: HullLOD. Near = full model; mid = the detail group is hidden; far = one InstancedMesh per hull and paint.
- `src/game.js`:
  - `hull()`, `hullInfo`, `buyHull`, `flyHull` (a `buyTier`/`tierInfo` shim is kept);
  - stats come from the hull, including armour, regen, vsBase, vsBig and radar;
  - 13 role abilities (`roleAbility`, `heavyStrike`);
  - carrier wings (`resetWing`, `launchWing`, `updateWing`);
  - capsule collisions (`sweepShip`, `capsulePt`);
  - the camera, fog, streaming, spawn and despawn distances scale with the hull;
  - enemies use concept hulls in faction paint, and frigate/destroyer join raids;
  - the station is built ×2 and DOCK_R is 54; the start and respawn position is z 62.
- `campaign.js`:
  - flagships and commanders use true-scale hulls, with boss parts spread over the deck;
  - bases are built ×2;
  - Federation Corvette and Frigate patrols.
- `ai.js`: 'line' role, plus carrier bay launches.
- `rpg.js`: ROLE_ABILITIES.
- `ui.js`:
  - the shipyard has rank rows, concept-sheet crops, BUILD and FLY buttons, and pvhull chips;
  - the radar draws capital ships as outlines;
  - the HUD shows the hull name, plus new ability icons.
- `preview.js`: true-scale hull preview with a ghosted Scout.
- `save.js`: v8. Migration maps T1–T5 to scout / strike / gunship / cruiser / battlecruiser.
- `lineup.html`: Fleet Registry viewer. `art/ship-concepts.jpg` added. README and CREDITS have v8 sections.
- Tests:
  - `tests/v8.js` is new and passed in full;
  - play, v4, v5, v6, v7, smoke5, compat and smoke pass;
  - audio failed once because the old spawn point was inside the new dock radius; the spawn was then moved to z 62.

## Status: v8 released
- Commit 0b3b130 was pushed to main at 9:40 PM EST on Nov 9, 2026. Pages built it and the live site serves v8.
- Live tests passed: v8.js with NO_SHOTS=1, and smoke5 against https://elrond44.github.io/Stellar-Frontier/.
- Local suites passed: v8, play, v4, v5, v6, v7, audio, smoke, smoke5, compat.

## Next (optional)
- The 4 promised songs are still outstanding: `tools/build_music.py` is ready and `music/tracks.json` is `[]`.
- Possible polish:
  - Turrets look oversized on the Frigate and Destroyer.
  - Carrier fighters are hard to see at full zoom-out.
  - Gameplay balance for capital hulls has not been checked on real devices.

## v9 — Cinematic Explosion & Destruction System 2.0 (released to main)
Plan:
- [x] src/explosions.js: ExplosionManager, PROFILES, PlasmaSystem (instanced noise/temperature billboards), ArcSystem, DebrisPhysics (momentum inheritance, hit-side impulse, wreck slabs w/ cap), ExplosionLighting (light budget), DestructionSequence (6 stages, per-class, dreadnought/station 8 steps), ExplosionAudio (layered, voice limit)
- [x] Hooks: killEnemy, damageEnemy (hit dir / shield hit / collapse), impactFx (weapon signatures), playerDie, structures (modules/HQ)
- [x] Quality budgets + exposure clamp
- [x] ?v=9 bump, About v9, README/CREDITS
- [x] tests/v9.js (10 scenarios + leaks) ALL PASS; shots/v9 taken
- [x] rerun old suites: play, v4, v5, v6, v7, v8, audio, smoke, smoke5, compat, v9 all pass (v4 outpost and v6 ramming checks are timing-flaky under SwiftShader: they failed once and passed on rerun; that code is untouched)
- [x] README/CREDITS v9 sections
- [x] merge to main, push, verify Pages (see git log)

Next / known limitations: Low preset has no dynamic lights (point-light pool disabled on Low, same as v8); dreadnought mid-sequence detonations read small at full-hull zoom; plasma is billboarded sprites (not volumetric); no real-device perf test yet; the 4 soundtrack songs are still outstanding.

## Blender test (branch blender-test, NOT on main)
- Blender 5.3 as the pip `bpy` module in /workspace/stellar-frontier/blender/.venv (Python 3.13). Builders: tools/blender/*.py (source of truth in /workspace/stellar-frontier/blender/src), exported glbs in models/.
- Run: `cd /workspace/stellar-frontier/blender && .venv/bin/python src/<ship>.py --render && ./sync.sh`
- [x] kit.py (loft/box/cyl/nozzle/turret/windows/greebles, material slots H P D A C W G, box-projected UVs, glb export, Cycles render)
- [x] scout 1,616 tris (48 KB), frigate 6,984 tris (157 KB), dreadnought 19,616 tris (419 KB) - meshopt+quantized glbs (gltf-transform), plain glbs were 107 KB / 449 KB / 1.28 MB
- [x] src/glbhulls.js: GLTFLoader + MeshoptDecoder, toggle `?hulls=glb` (sticky in localStorage 'sf-hulls'; `?hulls=proc` turns it off). Default OFF -> live behaviour unchanged.
  - buildHull keeps HULLS stats/keel hitbox chain/procedural far-LOD; only visible meshes, engine anchors (engine_* empties) and hardpoints (hard_* empties) come from the glb
  - slot materials swapped for hullMats(scheme) (C->W glass, W->Wn windows, G->G glow) so faction paint + damage shader work; geometry baked to float game units at load (damage noise is object-space)
  - any load failure / 404 / 15 s timeout -> procedural hull; enemy bolt-on turrets kept (aim/fire origins) but hidden since the glb models turrets
- [x] blender-test.html viewer: procedural (left) vs glb (right) in the game's renderer/tonemapping/env; hull, paint, view, damage, spin, flames; URL params hull/view/paint/dmg
- [x] comparison shots: tests/blender_viewer.js -> blender/shots/compare-*.png (also asserts glb loaded, damage clones, 404 fallback, no console errors); tests/blender_ingame.js (?hulls=glb in the real game)
- [x] v8 + smoke5 pass with toggle off
- Known gaps: player weapon turrets in the shipyard preview still bolt on over the modelled ones; far LOD (`lo`) is still procedural; only 3 of 15 hulls converted

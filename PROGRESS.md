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
### Blender batch 1 (approved by Elrond, fleet conversion in batches)
- Kit: `slab` (extruded outlines for wings/fins/armour scales), `strips` (thin broken window/light lines that follow the hull wall), `skin` (segmented armour plates with real gaps = panel lines that survive the game's lighting), baked vertex colours (12-ray AO x top-light gradient x per-panel tint) -> COLOR_0; `parts.py` fighter parts + `warship()` layered capital hull; `crops.py` crops each concept-sheet panel; `compare.py` builds concept | Blender | in-game sheets (`blender/shots/concept-vs-<id>.png`).
- Game: glb meshes with vertex colours get a per-material clone (vertexColors, metalness <= 0.62, base colour x1.3) so AO/panels read in game; GLB_IDS now 8 hulls; cache-bust ?v=bt2; viewer: all 8 hulls, `view=concept`, `solo=1`.
- Hulls (tris / meshopt glb): scout v2 1,260 / 49 KB; interceptor 1,082 / 47 KB; strike 1,642 / 59 KB; corvette 2,632 / 87 KB; gunship 2,116 / 75 KB; frigate v2 3,240 / 104 KB; destroyer 4,558 / 141 KB; dreadnought v2 10,824 / 313 KB. All 8 = 875 KB.
- Tests: tests/blender_viewer.js (8 hulls, damage clones, 404 fallback, solo concept-angle renders), blender_ingame.js, v8, smoke5 -> all pass.
- Next batches: engineer, cruiser, bomber, intercept carrier, explorer, battlecruiser, fleet carrier (+ procedural far-LOD from the glb, shipyard turret overlap).
- Known gaps: player weapon turrets in the shipyard preview still bolt on over the modelled ones; far LOD (`lo`) is still procedural; only 3 of 15 hulls converted
### Blender batch 2 (all 15 hulls, release-ready behind the toggle)
- New hulls (tris / meshopt glb): engineer 2,414 / 76 KB; bomber 1,748 / 61 KB; explorer 2,568 / 84 KB; intercept carrier 3,584 / 113 KB; cruiser 5,660 / 163 KB; battlecruiser 8,814 / 242 KB; fleet carrier 7,268 / 191 KB.
- Scout + Interceptor rebuilt as the concept's layered multi-hull fighter (core + canopy spine + two side pontoons, canted blades): 1,356 tris / 50 KB each (v2 kept as tools/blender/*_v2.py).
- Whole fleet: 15 glbs = 1,795 KB.
- parts.py: `arc` (rings/hoops), `port` (round glowing side ports), `hangar` (lit hangar mouth + `bay_*` empty).
- Game: GLB_IDS = all 15; cache-bust ?v=bt3; far LOD built from the glb (merged vertex-coloured mesh, cached per hull+scheme); carriers' fighter launch bays come from the glb hangar empties; enemy/faction variant parts kept on glb hulls; duplicate bolt-on turrets hidden (enemy, player in-game, shipyard preview); dedicated dark-blue glass material for canopies (fixes salmon canopy).
- Go-live switch: `export const GLB_DEFAULT = false` in src/glbhulls.js -> set true (and bump ?v=) to ship. `?hulls=proc` still opts out.
- Tests: v4-v9, smoke, smoke5, compat, blender_viewer, blender_ingame run in both modes via SF_HULLS=proc|glb (tests/_lib.js, smoke.js, compat.js init-script hook).
- Suite results (Nov 17, both SF_HULLS=proc and SF_HULLS=glb): v5, v6, v7, v8, v9, smoke, smoke5, compat (3/3), blender_viewer (all 15 hulls + variants + 404 fallback), blender_ingame all PASS.
  - v4: 2 FAILs in both modes ("pirate outpost spawns…", "music goes intense near an outpost"). Pre-existing: identical failure on current main (checked in a main worktree), not caused by the glb work. Probably the v8 rescale vs the test's outpost setup; fix separately.
  - v6 capital-ram check failed once in a loaded full run, passes when run alone (timing flake under load).
- Fixed this session: preview.js syntax error (a comment had swallowed the shipyard turret loop) that stopped the game booting on this branch.
- Go live: set `GLB_DEFAULT = true` in src/glbhulls.js, bump the module ?v= / glb ?v=bt3 cache-busters, merge blender-test into main, push, check https://elrond44.github.io/Stellar-Frontier/ on a phone.

## Cinematic texture test (branch blender-tex, off blender-test; NOT on main)
Approved by Elrond (t28u): Dreadnought + Scout only, baked texture maps + lighting upgrade, before deciding on the whole fleet.
- Pipeline: `blender/src/tex.py <ship> [--render]` (copy in tools/blender/). Builds the in-game low-poly hull, smart-UV unwraps it, builds a high-poly copy (every hull face cut into armour panels, inset seam + random raise, greebles: plate stacks, vents, pipes, hatches, sensor domes/antennas; extra lit window rows; trim stripes; hull-number + emblem decals) and Cycles-bakes high -> low: tangent normal, AO, albedo (panel tint x 3D grime), paint mask, roughness/metal, emissive, curvature (pointiness). numpy composes albedo x AO + edge wear, ORM packing. gltf-transform: KTX2 (UASTC+RDO normals, ETC1S colour/ORM/emissive) and WebP sets, full + half res, meshopt. Toolchain: KTX-Software 4.4.2 in /tmp/ktx (toktx/ktx), Blender bpy venv + pillow.
  - Scout: 1,356 tris in game (unchanged), 25k-tri high-poly, 1024 maps. Dreadnought: 10,824 tris in game (unchanged), 344k-tri high-poly, 2048 maps.
  - Bake time on the box: Scout ~15 s, Dreadnought ~100 s (+ ~40 s renders).
- Files (models/tex/): scout.ktx.glb 1.09 MB / half 0.44 MB (WebP 0.66 / 0.24 MB); dreadnought.ktx.glb 4.42 MB / half 1.74 MB (WebP 3.12 / 1.23 MB); paint masks *-mask.webp (32 KB scout, 277 KB dreadnought; half 30 / 222 KB). Basis transcoder (vendor/addons/libs/basis) 570 KB, one-time. The UASTC normal map is ~60% of each KTX file.
- GPU memory (gltf-transform estimate): Dreadnought KTX ~14 MB vs ~89 MB for the same maps as WebP/PNG; Scout ~3.5 MB vs ~22 MB.
- Game (src/glbhulls.js): `?tex=1` (sticky 'sf-tex', `?tex=0` off, needs `?hulls=glb`), `TEX_DEFAULT = false`. KTX2Loader + vendored three r170 addons (KTX2Loader, WorkerPool, ktx-parse, zstddec, ColorSpaces); `?texfmt=webp` forces the WebP set; any load failure -> untextured glb.
  - Gameplay: High -> full set, Medium -> half set, Low -> untextured glb (main.js setupQuality, player ship rebuilt when a set arrives). Shipyard preview + Fleet Registry (lineup.html) always use the full set.
  - Faction paint: mask RGBA = H/P/A/D slot weights; shader multiplies masked texels by scheme colour / Blender palette colour, so seams, grime and wear survive any paint. Chained into the damage shader via a shared prePatch registry (vfx.js), damage clones keep the tint.
  - Lighting (src/shiplight.js, only with the tex toggle and only on Medium/High): PMREM env from the game's own sky shader + key/rim lobes, key 2.2->2.55, rim 1.1->1.8/2.1. Low and toggle-off keep today's look exactly. No SSAO (too costly on phones); baked AO in the ORM map is the AO.
- Tests: tests/blender_tex.js (toggle off/High/Medium/Low, shipyard close-ups, FPS samples, faction tint, damage chaining, no console errors) -> shots in blender/shots/tex (copied to shots/blender-tex). Comparison sheets: `blender/src/tex_compare.py scout dreadnought` -> tex-vs-<id>.png, closeup-<id>.png, gameplay-<id>.png.

## v10: Blender fleet live (main)
- Merged blender-tex (blender-test + the opt-in texture test) into main. `GLB_DEFAULT = true` (Blender hulls are the default, `?hulls=proc` opts out), `TEX_DEFAULT = false` (textures only with `?tex=1`; models/tex/* is never fetched otherwise).
- Cache-busters ?v=10 everywhere, glb ?v=bt4. lineup.html got a favicon link (the 404). About says v10. README/CREDITS updated.

## v10.1: Fleet Registry readable on phones (main)
- lineup.html: labels are laid out in screen space once per resize. Each label tries spots around its own hull (nearest first) and avoids the header, other labels, hulls and the screen edge; a leader line is drawn only when a label has to sit away from its ship.
- Hulls stay at true scale; only the spacing between them flexes to the screen shape (taller rows on portrait phones, wider rows on height-limited screens).
- Phones show compact labels (name + length); tap a label or a ship for a detail card (class, role, length, beam, ×Scout, rank, hull, cargo, hardpoints, speed, description). Fonts scale with the viewport.
- Catalog mode (?mode=catalog): 3/4/5 columns by aspect, each cell framed for its own shape (was broken on portrait phones), labels inside their cells.
- In-game shipyard checked at 390×844, 844×390 and 360×640: no overlapping or clipped text, no change needed.
- Cache-busters ?v=11. Tests: tests/registry.js (overlap/on-screen/card/no-errors), tests/yardcheck.js.

## v12: reshape the big hulls toward the concept silhouettes (branch reshape)
- Pipeline: edit blender/src/<hull>.py -> `.venv/bin/python src/<hull>.py --render && ./sync.sh` -> `node tests/reshape_shots.js <ids>` (in-game solo renders) -> `.venv/bin/python src/reshape_compare.py <ids>` -> blender/shots/reshape/concept-vs-<id>.png + side-<id>.png (before = blender/shots/reshape/before, copies of the v10 renders; v10 builders + glbs backed up in blender/backup-pre-reshape/). Copied to game/shots/reshape.
- [x] Dreadnought v3: stacked layers that start further aft and higher (deck -> tier 2 hoods -> tier 3 hoods -> crown -> stepped citadel ~z 140 + spires), each tier built from separate chunky sloped "hood" modules (silver / two red / red emblem block with a winged emblem), longer pointed prow taper, deep ventral keel of hanging modules + dropped towers + fins. Height ~0.3 L like the art (was ~0.17). 11,968 tris (was 10,824), meshopt glb ~340 KB (was 313 KB). Same 8 heavy + 16 PD turret anchors, same engines.
- [x] Fleet Carrier v2: pointed bow deck with raised amber edge rails, the aft 40% now a massive layered superstructure (4 sloped-module tiers to z ~98 + turret tower), side armour pods bulging past the deck, two blue sensor domes on pylons mid-deck (the old floating domes are gone), big round nacelle ports at the bow chin and aft, blue side hangars. 7,772 tris (was 7,268), ~216 KB (was 196 KB). Hangar bays: 2 bow + 4 side (was 4 + 6).
- [x] Battlecruiser v2: the concept's big blue rings are now forward-facing turbine nacelles slung low on each flank (fore 46 m-long and aft 62 m-long pods with glowing intakes, armour shrouds, pylons, blue strips, rear nozzles) instead of side-facing discs; chunky armoured dorsal humps flank the centreline guns; centreline turrets now sit on the tier under them (parts.warship seat_turrets option; no floating guns over the prow). 9,276 tris (was 8,814).
- [ ] Cruiser  - [x] Cruiser v2: bridge tower moved back onto the full-height tiers (no longer floating over the prow), deck steps up aft into a two-step wedge (the concept's rising stern) with blue strips and the aft turret on the top step; seat_turrets. 5,790 tris (was 5,660).
- [x] Intercept Carrier v2: tall forward bridge spine with a sloped nose and amber glass, taller sloped shoulder decks, forward-swept outboard blade wings with amber edge lights (the concept's mandible wings), raised stern block. 3,860 tris (was 3,584).
- [x] ?tex=1: Dreadnought texture set rebaked on the reshaped hull (tex.py dreadnought, ~4 min; the three red trim bands dropped since the new hull already carries red modules): KTX full 4.35 MB / half 1.73 MB (was 4.42 / 1.78). Texture cache-buster ?v=tx2. Old sets backed up in blender/backup-pre-reshape/tex.
- [x] Cache-bust: modules ?v=12, glbs ?v=bt5; About says v12; README v12 section.
- [x] Tests (local, glb default): yardcheck, registry, live10, blender_ingame, blender_viewer (all 15 hulls, bays, variants, 404 fallback), smoke, smoke5, compat, v8, v9, blender_tex -> all PASS.
- Fleet glb total after reshape: ~1.86 MB (was ~1.80 MB).

## v13: Advanced player controls & dynamic camera (branch camera)
Brief: ../briefs/camera-controls.txt (written for a fantasy RPG; mapped to the space game: character -> ship, terrain/walls -> station, capital hulls, big asteroids; dodge -> Space dash).
- [x] One camera controller, extended in place (`Game.updateCamera`): free 360° yaw, clamped pitch (default 25–82°, settings 20/25/35 and 70/82/85), user zoom ×0.5–×2 (max 1.5/2/2.5) on top of the hull-class distance; critically damped (SmoothDamp) yaw/pitch/zoom, slower eased glides for presets/reset/recenter. Classic (yaw 0, 58.4°, ×1, full framing) reproduces the v12 view exactly and is the default for old saves.
- [x] Contextual combat/boss framing kept; strength Off/Mild/Full only scales the context zoom, never touches yaw/pitch or the manual zoom.
- [x] Presets: Classic / Dynamic (48°, ×0.88, more look-ahead) / Tactical (78°, ×1.55) / Cinematic (32°, ×0.72, slow rotation). V cycles, R resets, C = behind the ship; optional auto-rotate-behind (off by default).
- [x] Occlusion every 0.1 s, no per-frame allocations: station (AABB then exact raycast; pull in to ≥55% then fade to 22% via cached transparent material clones, restored after), capital hulls / outposts (oriented boxes, pull in only, enemies never faded), asteroids r≥3 (spheres). Never closer than the ship's hull (minD).
- [x] Input (`UI.bind`/`readInput`): touch router: first touch in the move area (lower 55% portrait / left 55% landscape / anywhere) = joystick, other touches on empty space = camera (1 finger rotate after 8 px dead zone, 2 fingers pinch + optional twist); joystick and camera fingers work together; HUD and menus never start camera gestures; opening a menu cancels gestures. Desktop: left-drag flies, right-drag rotates, wheel zooms, Q/E, PgUp/PgDn, +/-; all keys rebindable (menu/ability keys reserved; conflicts swap).
- [x] Camera-relative movement for stick and keys (toggle to classic north-up); radial joystick dead zone with rescale; floating or fixed joystick, size S/M/L.
- [x] Settings: CAMERA & CONTROLS card (style, reset/recenter, 3 sensitivity sliders, invert Y/X, zoom & rotation smoothing, follow, look-ahead, max zoom-out, pitch limits, auto-framing, auto-rotate, collision, fade, camera-relative, joystick mode/size/dead zone/area, twist, key bindings, defaults). Stored in settings.cam (camctl.js sanitizeCam migrates/repairs); current yaw/pitch/zoom persist.
- [x] Radar turns with the camera (radar-up = screen-up, N marker when rotated); cinematic lens pass sized along the camera right axis (fixes a grey-screen bug at rotated views); streaming radius widens at low pitch.
- [x] tests/v13cam.js (15 criteria, CDP multitouch, wheel, right-drag, keys, settings UI, reload persistence, migration) + tests/v13shots.js. WIP commit 91a2e6b.
- [x] Final v13cam run 50/50 ALL PASS (tests/v13cam.last.log); old suites smoke, smoke5, compat, v8, v9, blender_ingame, blender_viewer, registry, yardcheck, live10 all PASS
- [x] Cache-bust ?v=13, README v13 section, shots/v13 (presets, rotated, zoomed in/out, occlusion, settings)
- [x] Merged camera -> main (ff), pushed 2726739 at 12:12 AM EST Nov 18; live: v13cam 50/50, smoke5, live10 ALL PASS against elrond44.github.io (run from the box)

## v14: Environment assets in Blender (branch env)
Source: the user's concept sheets. Sheets 1 and 3 reached the box (briefs/env-concepts-1.png: stations / asteroids + mining rigs / celestial;
env-concepts-3.png: stations, asteroids + rigs + crystals, celestial). The second sheet never arrived; it's an alternate take of the same assets.
Style: dark gunmetal hulls, warm amber windows, red ring/accent lights, teal-blue reactor and crystal glow, gold industrial cranes and
scaffolding, blue solar wings, heavy greebles, purple/teal nebula space.
Same pipeline as the ships: bmesh builders in blender/src (env_kit.py, station.py, asteroids.py) -> glb -> meshopt -> game/models/env/
(copied by blender/sync_env.sh). Showcase renders + concept-vs-<asset>.png comparisons are in blender/shots/env/ (copied to game/shots/env/);
concept crops are in briefs/crops/; compare_env.py builds the comparisons.

Plan / batches
1. Batch 1 (this release): the player station's 6 growth stages (Outpost Refinery -> Solar Refinery -> Factory Station ->
   Orbital Works -> Industrial Hub -> Frontier Citadel) plus the asteroid set (lumpy x2, porous, holed cavern, molten, green-veined,
   gold-nugget, and 3 crystal-cluster rich rocks), matched to minerals: molten = ferrite/crimsonite, veins = viridium,
   cavern = voidstone, nuggets = ferrite/crimsonite; crystals take each mineral's glow colour.
2. Batch 2: pirate citadel, faction stations (ring station, industrial hub, dome biosphere, reactor, comms relay, beacon
   spire, hangar block, turret platforms), mining-rig asteroids (open pit, crystal drill, tunnel hangar, dome colony), ore pickups and crystals.
3. Batch 3: planets (rim-lit dark planet, banded ringed gas giant, cratered moon), fiery star, blue black hole, teal/purple nebula clouds.

Batch 1 checklist
- [x] env_kit.py: extra slots (red, solar, greenery, rock, rock glow, nugget, beacon), torus/sphere/lathe/tube/beam/truss/dish/crystal/
      faceted pitted rock primitives, AO bake, nebula world + showcase camera
- [x] station.py L1..L6 (5k -> 52k tris; 0.19-1.5 MB): same footprint and dock port (0,0,7.9) as the procedural station; animated parts are
      pivot empties (spin_ring, crane_N) so meshopt quantization can't move their pivots; empties stack_/chase_/dock_/nav*; drones stay procedural
- [x] asteroids.py: unit-radius hi/lo LOD rocks (hi 2.5-8k tris, lo 320-1.9k), glow slot -> aGlow; one 0.9 MB glb; no normals/uvs (flat shaded)
- [x] showcase sheets + concept-vs comparisons in blender/shots/env/
- [x] game: src/glbenv.js loader; Game/preview use buildStationAny, AsteroidField uses the glb rocks with a per-mineral shape map;
      `?env=proc` (sticky) and any load failure (404/timeout) fall back to procedural; startup awaits rocks + the saved station level,
      the next level preloads in the background, a level that isn't loaded yet shows procedurally and swaps in when ready
- [x] occlusion fade, docking, upgrades, shipyard/station live view, mining damage/hit glow all work; no console errors
- [x] Playwright: tests/v14env.js (34 checks, all pass) + shots in game/shots/v14/
- [x] fix: station keeps its v8 capital scale (x2) with the glb models (caught by v8 suite); footprint check measured in world units, drones excluded (glb reach 36-43 vs procedural 38-42)
- [x] old suites green: smoke, smoke5, v8, v9, v13cam, registry, blender_ingame, blender_tex_registry, yardcheck, compat
- [x] merge to main, cache-bust v14, push, verify live

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

## Next
1. (done 9:52 PM EST) Re-ran audio, play, smoke5 and v8 after the spawn move: all pass. shots/v8 refreshed.
3. Merge v8-wip into main (fast-forward or squash), push, check the Pages build, then run the live tests: `SF_URL=https://elrond44.github.io/Stellar-Frontier/index.html node v8.js` (with NO_SHOTS=1) and smoke5.
4. Report. The 4 promised songs are still outstanding: `tools/build_music.py` is ready and `music/tracks.json` is `[]`.

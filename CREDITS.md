# Credits

- **three.js** r170, MIT licence, vendored in `vendor/`.
- **Fonts:** Rajdhani and Orbitron, SIL Open Font License, in `fonts/`.
- **Audio:** all sound effects and music are synthesised procedurally at runtime in `src/audio.js` (Web Audio API: oscillators, filtered noise, generated impulse-response reverb). No recorded samples or third-party audio files are used.
- **v4 art:** faction insignia, skill and ability icons, the galaxy map, loot pods and outpost models are original and drawn in code (SVG paths, canvas and three.js geometry). No third-party art is used.
- **v6 effects:** the flight model, impulse physics, impact-shield, hull-damage and plasma shaders, staged explosions and all particle effects are original code written for this game. No third-party assets or code beyond three.js.
- **v5 art:** the five flagship hulls, installation types, civilian ships, telegraph markers, stage tracker and map glyphs are original and built in code (three.js geometry, shaders, canvas). No third-party art is used.
- **Optional soundtrack:** `music/tracks.json` lists songs to play in order. It is empty by default, so the game plays its generated music.

- **v7 environments:** planets, nebulae, phenomena (including the black-hole lensing shader), staged structure destruction, the camera system, quality presets and the profiler are original code written for this game. No third-party assets or code beyond three.js.

- **v8 fleet:** the ship designs follow the "Stellar Odyssey" concept sheet that Elrond supplied for this project (`art/ship-concepts.jpg`). The sheet is used for the shipyard cards. All 3D hulls, faction liveries, emblems, LODs and the Fleet Registry are original code (three.js geometry, canvas textures). No third-party assets or code beyond three.js.

## v9
- The explosion and destruction system (plasma noise shader, temperature ramp, debris physics, destruction sequences) and the layered explosion sound effects are original, procedurally generated code. No third-party assets were added.

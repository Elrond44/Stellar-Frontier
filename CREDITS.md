# Credits

- **three.js** r170, MIT licence, vendored in `vendor/`.
- **Fonts:** Rajdhani and Orbitron, SIL Open Font License, in `fonts/`.
- **Audio:** all sound effects and music are synthesised procedurally at runtime in `src/audio.js` (Web Audio API: oscillators, filtered noise, generated impulse-response reverb). No recorded samples or third-party audio files are used.
- **v4 art:** faction insignia, skill and ability icons, the galaxy map, loot pods and outpost models are original and drawn in code (SVG paths, canvas and three.js geometry). No third-party art is used.
- **v5 art:** the five flagship hulls, installation types, civilian ships, telegraph markers, stage tracker and map glyphs are original and built in code (three.js geometry, shaders, canvas). No third-party art is used.
- **Optional soundtrack:** `music/tracks.json` lists songs to play in order. It is empty by default, so the game plays its generated music.

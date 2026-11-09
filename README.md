# Stellar Frontier

An original 3D space-mining, auto-combat and empire-building game for mobile browsers (also plays on desktop).

**Play:** https://elrond44.github.io/Stellar-Frontier/

- Steer with the virtual joystick (drag anywhere) or WASD / arrow keys. Weapons fire automatically.
- Mine glowing asteroids, haul ore back to your station, and sell it.
- Upgrade your ship, run the station factory (Income / Capacity / CLAIM), and expand the station from a lone refinery to an industrial hub.
- Evolve your ship through 5 tiers, from a tiny mining scout to a capital dreadnought.
- Push into pirate sectors for rare ores, and take on the Warlord Dreadnought.

Built with [three.js](https://threejs.org) (vendored in `vendor/`, MIT licence). All models, effects, music and sound are generated procedurally in code. Progress autosaves to your browser's local storage.

## v3: sound and music
Everything you hear is synthesised in the browser with the Web Audio API. There are **no sample files**, so there is nothing to license (see `CREDITS.md`).
- **Layered SFX** (34 sounds, several variations each, rendered once when the game starts): a distinct sound for each weapon (mining laser beam loop, autocannon, missile pod, pulse emitter, capital-ship point defence, escort drones), plus pirate blasters and heavy cannons, metal hull impacts, a shield shimmer, a hull crunch, small and large explosions with debris and a low rumble tail, laser grinding and rock cracking, small and large asteroid breaks, mineral chimes that rise with your pickup combo, factory cash, upgrades, level up, quest complete, the ship-evolution and station fanfare, the low-hull alarm, the pirate klaxon, UI taps, menu open and close, save confirmation, autopilot boost, sector warp, the docking clamp and the tractor-beam hum.
- **Engine** loop follows the joystick and gets deeper and heavier with each ship tier (scout whine up to a capital-ship rumble).
- **Mixing:** stereo panning and distance attenuation by world position, air absorption on far sounds, a generated convolution reverb, random pitch and volume on every shot, per-sound and global voice limits with stealing, music ducking under big blasts, and a compressor plus limiter master bus.
- **Generative music:** an evolving ambient layer (slow chord random-walk, detuned pads, sub drone, bells, space wind) crossfades into a combat layer (kick, snare, hats, a resonant bass pulse and an arpeggio) when pirates engage, and into a mellow electric-piano layer while docked or in menus. There is no fixed loop.
- **Settings:** Master, Music and SFX sliders plus Mute, saved with your other settings. Older saves keep working. Audio starts on your first tap, pauses when the tab is hidden, and resumes afterwards. *Low* graphics quality also cuts audio voices and reverb.

## v2
- **Save / Load** (Settings → Save / Load, or *Load game* on the title screen): autosave plus 3 manual slots showing ship tier, level, credits, station level, sector, playtime and save date. Export a save as a code or a `.sfsave` file and import it on another device. Codes are versioned and checksummed, and older (v1) saves are migrated automatically.
- **Detailed graphics:** panel-lined hulls with normal/roughness maps, greebles, vents, pipes, antennae, hazard stripes, lit windows and blinking nav lights. Recoiling turrets, layered engine flames, point-defence turrets on the capital ship. Instanced, LOD'd asteroids with craters, strata and crystal veins. A busier station with smokestacks, cranes, chase lights, drone traffic and a docking tractor beam. Layered explosions with light flashes, smoke, sparks and debris, plus shield hit ripples. Nebula, planets, a sun and speed-streaked dust.
- **UI polish:** Rajdhani/Orbitron fonts (SIL OFL, in `fonts/`), animated bars, transitions, and rotating 3D previews in the shipyard and station menus.
- **Balance:** Sector 2 is gentler for a Tier 1 ship, and station mining drones add passive income.

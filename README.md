# Stellar Frontier

An original 3D space-mining, auto-combat and empire-building game for mobile browsers (also plays on desktop).

**Play:** https://elrond44.github.io/Stellar-Frontier/

- Steer with the virtual joystick (drag anywhere) or WASD / arrow keys. Weapons fire automatically.
- Mine glowing asteroids, haul ore back to your station, and sell it.
- Upgrade your ship, run the station factory (Income / Capacity / CLAIM), and expand the station from a lone refinery to an industrial hub.
- Evolve your ship through 5 tiers, from a tiny mining scout to a capital dreadnought.
- Push into pirate sectors for rare ores, and take on the Warlord Dreadnought.

Built with [three.js](https://threejs.org) (vendored in `vendor/`, MIT licence). All models, effects, music and sound are generated procedurally in code. Progress autosaves to your browser's local storage.

## v2
- **Save / Load** (Settings → Save / Load, or *Load game* on the title screen): autosave plus 3 manual slots showing ship tier, level, credits, station level, sector, playtime and save date. Export a save as a code or a `.sfsave` file and import it on another device. Codes are versioned and checksummed, and older (v1) saves are migrated automatically.
- **Detailed graphics:** panel-lined hulls with normal/roughness maps, greebles, vents, pipes, antennae, hazard stripes, lit windows and blinking nav lights. Recoiling turrets, layered engine flames, point-defence turrets on the capital ship. Instanced, LOD'd asteroids with craters, strata and crystal veins. A busier station with smokestacks, cranes, chase lights, drone traffic and a docking tractor beam. Layered explosions with light flashes, smoke, sparks and debris, plus shield hit ripples. Nebula, planets, a sun and speed-streaked dust.
- **UI polish:** Rajdhani/Orbitron fonts (SIL OFL, in `fonts/`), animated bars, transitions, and rotating 3D previews in the shipyard and station menus.
- **Balance:** Sector 2 is gentler for a Tier 1 ship, and station mining drones add passive income.

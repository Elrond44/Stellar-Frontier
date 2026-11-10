# Stellar Frontier

An original 3D space-mining, auto-combat and empire-building game for mobile browsers (also plays on desktop).

**Play:** https://elrond44.github.io/Stellar-Frontier/

- Steer with the virtual joystick (drag anywhere) or WASD / arrow keys. Weapons fire automatically.
- Mine glowing asteroids, haul ore back to your station, and sell it.
- Upgrade your ship, run the station factory (Income / Capacity / CLAIM), and expand the station from a lone refinery to an industrial hub.
- Climb a class path of 15 hulls, from a 20 m Scout to a 720 m Dreadnought, all built at true relative scale.
- Push into pirate sectors for rare ores and loot, liberate them stage by stage from five warring pirate factions, and bring down each faction's flagship.

Built with [three.js](https://threejs.org) (vendored in `vendor/`, MIT licence). All models, effects, music and sound are generated procedurally in code. Progress autosaves to your browser's local storage.

## v9: Cinematic explosions and destruction 2.0

Every destruction now runs through `src/explosions.js` (ExplosionManager), in six stages: structural failure (sparks, electrical arcs, venting gas) → a localized flash → plasma expansion (an instanced noise shader with a white → yellow → orange → deep-red temperature ramp) → fragmentation → staggered secondary detonations → fast dissipation (no lingering smoke, it's vacuum).

- **Per-class profiles sized from the v8 hulls:** fighters 0.6–1.2 s, medium ships 1.2–2.5 s, frigates/destroyers 2.5–5 s, cruisers 4–6.5 s, battleships 6–8 s. Ships from medium up keep their hull on screen while it fails, drifting with their momentum and spinning away from the hit side. Secondaries go off at real points along the keel. At the end the hull splits into wreck slabs that drift for 25–40 s (capped per quality preset).
- **Dreadnoughts and flagships:** an 11–13 s, 8-step sequence: shields collapse → weapons fail at the turret mounts → hull sections detonate → bow and stern components separate → the reactor destabilises (pulsing core and a rising hum) → central discharge → the hull breaks up → the debris drifts.
- **Pirate bases:** each module explodes where it sits. The core runs the same 8 steps on top of the v7 staged wreck (the telegraphed reactor blast is unchanged).
- **Debris physics:** fragments inherit the ship's velocity, plus an impulse ∝ 1/√mass biased away from the side that was hit. Spin ∝ 1/mass, and hot pieces cool from orange to bare metal. Big pieces bounce off asteroids.
- **Hits:** a shield hit shows the hex ripple, a flare and arcs that skate over the bubble, with no debris. A shield collapse adds discharge filaments around the shield. Hull hits show the weapon's signature:
  - laser: a focused burn
  - plasma: a superheated splash
  - railgun: penetration, with chunks blown out the far side
  - missile: a concussive mini-blast
  - ion: arcs with no fire
  - experimental: a violet implosion
- **Lighting:** the shared point-light pool now has a brightness budget and priorities, so a capital-ship blast is never cut short by a fighter pop. The light lands on nearby hulls, asteroids and stations.
- **Readability:**
  - Overlapping blasts share an exposure budget, so a big battle doesn't white out.
  - Plasma near the player's ship is dimmed.
  - Shockwave rings are softer.
  - Effect size and light energy scale with the class.
- **Camera:** the impulse scales with blast size and distance. Screen shake is set to Full, Reduced or Off in Settings.
- **Audio:** each blast is layered (crack + body, sub-bass impact, metallic rupture, electrical crackle, reactor resonance), attenuated by distance and filtered with range. An explosion-event limiter keeps big battles clean. The soundtrack ducks gently and never drops below 55%.
- **Performance:** everything is pooled: one instanced plasma mesh, one instanced debris mesh, one line buffer for arcs and the existing light pool. No scene objects or materials are created per explosion. Low, Medium and High set the budgets (plasma 40/90/140, fragments 90/180/280, wreck slabs 14/28/44, active sequences 4/8/12). Far-away blasts are scaled down.
- Damage, AI, controls, progression and saves are unchanged (save format v8).

## v8: Concept-sheet fleet at true scale
- **15 hulls from the "Stellar Odyssey" concept sheet** (`art/ship-concepts.jpg`): Scout, Interceptor, Strike Fighter, Bomber, Corvette, Gunship, Engineer, Explorer, Frigate, Destroyer, Intercept Carrier, Cruiser, Battlecruiser, Fleet Carrier and Dreadnought. Each is built in code (`src/hulls.js`) to match the sheet's silhouette, colours, panel lines, engines, turrets, emissive strips and greebles. The v6 PBR materials and damage states are kept.
- **True relative scale** (1 unit = 5 m; Scout = 20 m):

  | Hull | Length | × Scout |
  |---|---|---|
  | Interceptor / Strike Fighter | 23–25 m | 1.2× |
  | Corvette / Gunship | 50–52 m | 2.5× |
  | Frigate | 100 m | 5× |
  | Destroyer | 140 m | 7× |
  | Cruiser | 200 m | 10× |
  | Battlecruiser / Fleet Carrier | 380–420 m | 19–21× |
  | Dreadnought | 720 m | 36× |

  Hitboxes (keel capsules for long hulls), mass, hardpoints and turret counts all follow size.
  - The camera pulls back with the hull, and fog, asteroid streaming, radar range and spawn distances adapt.
  - The radar draws capital ships as true-size outlines.
  - The home station and pirate bases are built larger so they read correctly next to capital ships.
- **Progression:** a class path with branch choices at each rank, unlocked by station level and owning a hull from the rank before. Side-grades have their own roles:
  - **Bomber:** ×1.6 damage against bases, plus Bomb Run.
  - **Engineer:** self-repair, plus a Repair Field that also heals allies.
  - **Explorer:** long radar, better mining, plus Deep Scan.
  - **Carriers:** launch fighter wings from their hangar bays.

  Every hull has its own stats, slots and role ability (Recon Ping, Afterburner, Strike Run, Flak Screen, Broadside, Tactical Shift, Anti-Capital Torpedo, Scramble Wing, Command Aura, Titan Main Battery…). Built hulls are kept, and you can switch between them while docked. Old saves migrate T1–T5 to the Scout, Strike Fighter, Gunship, Cruiser and Battlecruiser.
- **Shipyard:**
  - Cards are cropped from the concept sheet.
  - The 3D preview shows each hull at true scale beside a ghosted Scout.
  - Each card shows the hull's role, ability and requirements, with BUILD and FLY buttons.
- **Factions:** the sheet's faction liveries are mapped onto the pirate factions:
  - Pirate Clans red for Crimson.
  - Corporate gold for Eclipse.
  - Mercenary grey for Iron.
  - Alien violet for Void.
  - Ember for Ashen.

  Frontier patrols fly Federation-blue Corvettes and Frigates. Frigates and Destroyers join deep-space raids. Commanders fly Cruisers. Flagships are Dreadnoughts, Battlecruisers and a Fleet Carrier at true scale, with their destructible components spread over the real deck.
- **Performance:**
  - Mid-range hulls drop their greeble layer.
  - Distant craft collapse into merged, vertex-coloured low-poly meshes drawn with one `InstancedMesh` per hull and paint, so a whole wing is a single draw call.
- **Fleet Registry:** `lineup.html` shows every hull at true scale (`?mode=lineup`), faction variants (`?mode=factions`), a catalogue (`?mode=catalog`) or one hull (`?mode=single&hull=dreadnought`).

## v7: Living space, destructible bases and polish (Release D)
- **Environments:** procedural planets sit far below the play plane. There are 7 types (desert, ocean, two gas giants, ice, volcanic, violet rock), with shader-lit terminators, clouds, craters, lava glow, atmosphere rims and ringed giants that cast shadows. Three parallax nebula layers, background asteroid fields, foreground shards and distant galaxies with dust lanes give the scene depth.
- **Phenomena with visible warnings:** about 37 deterministic hazard zones are spread across the galaxy:
  - **Ion storms:** lightning is always telegraphed by a warning circle before it strikes. A strike hurts your hull, drains energy and stuns enemies. Storms also jam your sensors: radar contacts drop out, the scope shows static, and enemy fire control gets worse.
  - **Dense nebulae:** lower visibility (fog) and radar range, and every ship inside has shorter detection and weapon ranges.
  - **Gravity anomalies:** pull ships, projectiles and small asteroids toward the centre, and visibly bend shots.
  - **Radiation fields:** deal gradual hull damage, stronger near the core and reduced while your shields are up. They hurt pirates too.
  - **The black hole (Obsidian Spiral):** has an accretion disc, a photon ring and real gravitational lensing. Its pull strengthens toward the event horizon, which deals tidal damage, but full thrust can always escape it.
  - **Warnings:** a hazard strip shows the hazard type and distance before you enter, and intensity once you are inside. The first time you enter a zone, a toast explains its effect. Zones also appear on the radar.
- **Destructible pirate bases:** each base is built from separate parts, each with its own job:
  - **Shield generators:** destroying them drops the core's dome.
  - **Turrets:** each destroyed turret is one fewer gun.
  - **Fusion reactor:** below 50% it goes unstable, with arcs and telegraphed discharges. Destroying it cuts 15% off the core's HP and puts the turrets on slow backup power.
  - **Fighter hangars:** fighters launch from the hangar mouths. With every hangar destroyed, the base cannot launch.
  - **Detail:** bases also have rotating radar masts and docking pads with landing lights.
- **Staged destruction:** a base core goes through 5 stages: systems failure (lights flicker, fires start), chain explosions that shed chunks, structural collapse (it tilts and sinks), a telegraphed reactor overload, and a core breach with a shockwave. Its other systems fail one by one along the way.
- **Enemy AI:** every hull has thrust and torque limits, and heavy ships turn slowly. Enemies steer by acceleration rather than snapping to a speed. Damaged ships retreat tactically, interceptors coordinate flanking runs, and gunships strafe. Light ships jink when you aim at them. Enemies use predictive (lead) targeting, and its accuracy depends on faction and threat level: Eclipse is the sharpest, Crimson raiders the sloppiest. They fire from their real hardpoints, heavy weapons have recoil, and enemy ships collide with each other by impulse.
- **Camera:** a spring-damped follow camera leads in your direction of travel and lags behind boosts and dashes. Contextual zoom pulls in while exploring, widens with speed, fits nearby threats in combat and widens further for bosses and black holes. Random shake has been replaced by directional impulses that push the view away from each hit or blast. Settings → **Camera shake**: Full / Reduced / Off.
- **HUD:**
  - Banners, the boss bar, battle tag, attack warnings and the hazard strip now stack in one column, so they never overlap.
  - Banners queue by priority: boss banners interrupt, and other banners wait their turn.
  - Toasts stack bottom-left (at most 4), and repeated messages merge into one with a ×N counter.
  - Red (hull) and cyan (shield) arcs around the ship point toward the source of each hit, and lagging "ghost" bars show recent damage.
  - Labels have stronger contrast, and the layout respects mobile safe areas.
- **Quality presets:** Low / Medium / High, with AUTO choosing one from the GPU, CPU cores, memory and screen size. AUTO also steps down a level if frames stay slow. The settings page shows what each preset does and what was detected. There is also a **30 FPS cap** to save battery and heat, and a **performance overlay**.
- **Profiler:** tracks frame time (average and 95th percentile), time spent in update, AI, physics, weapons, particles, environment and rendering, plus draw calls, triangles, texture and render-target memory, heap size, GC events and a 10-second thermal (sustained frame rate) ratio. Open it from Settings → Performance overlay.
- **Saves:** v1–v6 saves migrate automatically. The old shake on/off setting becomes a shake level, and the frame cap defaults to 60. Export codes are now `SF7.`.

## v6: Cinematic combat and physics (Release C)
- **Flight model:** Newtonian-hybrid handling. Each ship tier has mass. The main engine pushes along the nose, the hull turns with angular inertia, and stabilisers bleed off sideways drift. With no input, retro-thrusters brake progressively instead of the ship stopping dead. Settings → **Flight assist** (Low / Normal / High) trades momentum and drift for arcade-style vectored thrust. Normal keeps the joystick about as snappy as v5. Autopilot always flies on High.
- **Thrusters tied to real forces:** main-engine length and brightness follow actual thrust. Nose and tail RCS jets fire when the ship turns, lateral jets fire to cancel drift, and retro jets fire when braking. Boost (emergency thrust or hyperdrive autopilot) lengthens the flames. The player ship now casts a dynamic engine light.
- **Collisions with mass and impulse:** ships and asteroids collide using an impulse solver (restitution, mass ratio, a spin kick and impact energy). Ramming shoves light asteroids and small fighters but bounces you off capital ships. Ramming damages enemies and, at high speed, hurts you too (Impact Dampers still negate it). Asteroids now have mass, drift, knock into each other, and their fragments inherit the parent's momentum. Railgun slugs physically shove what they hit.
- **No tunnelling:** every projectile uses a swept (continuous) test against a spatial-hash broadphase, so 130+ u/s railgun slugs can no longer pass through small ships or rocks between frames, and big fights cost less CPU.
- **Weapons fire from the real hardpoints with distinct identities:**
  - Lasers have a core and glow, a muzzle bloom, and sparks that kick back off the hull.
  - Plasma bolts are turbulent instanced plasma balls with an ion trail, a bloom and an energy wave on impact.
  - Railguns fire long thin streaks with an electromagnetic discharge, a directional camera kick and an exit spray.
  - Missiles launch slowly off the rail, then light their motor. Their turn rate is limited and they have a proximity fuse.
  - Recoil scales with weapon power and ship mass, and off-centre hardpoints add a little torque.
- **5-stage explosions:** a flash, an energy sphere with fireball, hot metal fragments that inherit the wreck's velocity and cool down, secondary detonations, then smoke and embers. Capital ships, flagships and big structures chain secondaries into a final core breach. Everything is driven by a game-time sequencer, so effects pause with the game.
- **Impact shields:** shields are invisible until hit. Up to 4 simultaneous impact ripples run over a hex lattice, dimming and shifting toward red as the shield weakens. Shields shatter with a collapse effect when they break and show a regeneration sweep when they come back. Enemy shields show local impact bubbles. Overload turns your shield into a bright, fast-flowing field.
- **Health-driven damage states:** hull materials take scorch blooms, lose their sheen and open glowing cracks as HP drops. Sparks and smoke follow, then venting plasma fires and electrical arcs. Windows and lights flicker, and the player's engines sputter. It is all tied to real HP, so repairs heal the visuals. EMP'd ships black out.
- **PBR materials:** hull plating has packed roughness and metalness maps (bare plates and rivets read as metal, seams and vents as dull), normal maps, emissive windows and stronger environment reflections. Light count stays fixed (pooled flash lights plus one engine light) so no shaders recompile mid-fight.
- **Abilities:**
  - Quantum Dash leaves afterimages and an implode/burst distortion.
  - EMP fires an electromagnetic shell that lights up and blacks out its targets.
  - Overload produces the flowing shield.
  - Barrage alternates launch rails and leaves readable trails.
  - Surge makes your hardpoints glow.
  - Combat drones fly with real thrust and engine flames.
- **Performance first:** a central FX manager scales particle emission by quality tier, pool load, frame time and distance from the player. Distant effects get a trickle and phones keep a smooth frame rate. Damage materials are cloned only for damaged ships and disposed on removal (tested for leaks after large battles).
- **Saves:** v1–v5 saves migrate automatically (v6 adds the flight-assist setting). Export codes are now `SF6.`.

## v5: Faction war, flagships and missions (Release B)
- **6-stage liberation:** every pirate sector is liberated in order through Reconnaissance (fly within 130 m of each installation to identify it), Disruption (comm arrays, resource facilities, supply convoys), Defensive Suppression (defense platforms, shipyards, elite patrols), Base Assault (the HQ's sector shield only drops once suppression is complete), Commander Encounter (a named sector commander warps in) and Liberation. Tap the HUD stage tracker (6 pips, current objective) to open the sector on the map, which lists every stage and installation.
- **Installation types:** communication arrays call in reinforcement waves, shipyards launch replacement ships, resource facilities fund the faction's war effort and send drones, defense platforms fire telegraphed long-range artillery, and the HQ stronghold sits under a sector shield and calls its garrison. Shield generators and turrets guard them all.
- **Autonomous faction war** (Settings → Faction warfare: Off / Low / Normal / High): factions fund themselves from their resource facilities, raid neighbouring sectors, form temporary pacts against the strongest faction and take territory. Gains are capped, and liberated space, the Haven and faction homeworlds never change hands. Ownership changes flash on the map with a ⚑ SEIZED tag. Fly into a battle (⚔ on the map and radar) to watch both fleets fight. They ignore you unless you shoot them, and every kill tips the battle. The map's Faction War tab shows strength, territory, pacts, active battles and a war log.
- **5 multi-phase flagships**, one at each faction homeworld: Admiral Varkos (Crimson Marauders, *Dread Sovereign*), Matriarch Nyx (Void Reavers, *Requiem*), Marshal Kordan (Iron Dominion, *Bastion of Iron*), Archon Seraphine Vale (Eclipse Syndicate, *Penumbra*) and Captain Rook Ashgrave (Ashen Corsairs, *Cinderwake*). Each has its own hull model and 4 phases. Attacks are telegraphed on the floor (bombardment circles, lance lines, mines, charges, novas and drains). Shield-pylon phases make the hull immune until the pylons fall. Destroying a component (cannon, missile battery, engine, uplink) shuts down the attack it powers. Flagships summon escorts. Defeating one drops its exclusive Legendary weapon and unlocks the blueprint (fabricate copies at the Armory), and the faction collapses: it loses its frontier holdings and threat drops. The boss bar shows phase, shield and component health.
- **Missions** (Missions → Mission Log / Job Board / Story & Contracts): 8 job types (Eliminate Patrol, Destroy Installation, Escort Civilians, Defend Station, Recover Stolen Cargo, Investigate Signal, Hunt Elite Commander and Intercept Supply Convoy), scaled to your level and the target sector's threat. Run up to 3 at once, track one (waypoint, radar and map marker, HUD card), abandon jobs or pay to reroll the board. Completed and failed jobs go to the history.
- **AI roles:** interceptors flank, heavies brawl, snipers hold range and telegraph their shots, support ships repair allies, EW ships jam your abilities (Void EW re-cloaks allies), and capital ships buff, coordinate and launch drones. Each faction fields its own mix. AI runs on an update budget.
- **Liberated space comes alive:** Frontier patrols defend it, a repair relay at the sector beacon restores your hull, shields and energy, and a trader sells better-than-Armory gear that restocks every 8 minutes.
- **Balance:** installation, commander and flagship toughness targets a time-to-kill against your level's expected damage (see `src/balance.js`), so content stays meaningful as you level. Reinforcements share a budget so fights never snowball into swarms, heat waves pause during flagship fights, and boss healing is capped per phase.
- **Saves:** v1–v4 saves migrate automatically (v4 outposts become typed installations). Export codes are now `SF5.`.

## v4: RPG expansion (Release A)
- **Levels and skill points:** XP from mining, kills, outposts, discoveries and liberations. You get 1 SP per level plus a bonus SP every 5th level. Older saves are granted the SP for their current level.
- **Skill tree** (Upgrades → Skills, or tap the SP chip / press K): 5 branches (Weapons, Defense, Engines, Tech, Tactical) with 42 nodes in 4 tiers. Nodes have prerequisites and level gates. Tap a node to inspect it, then tap again to confirm the purchase. A paid respec is available while docked. Passives change the real ship stats.
- **Active abilities** (HUD buttons on the right, keys 1–6, Space = Dash): Quantum Dash, EMP Pulse, Shield Overload, Missile Barrage, Energy Surge and Drone Deployment. They use energy, have cooldown rings, and come with their own effects and sounds. The ship now has a shield layer and an energy bar.
- **Weapons as loot:** 9 weapon models across 7 categories (laser, plasma, railgun, missile, ion, particle, experimental) and 6 colour-coded rarities (Common → Exotic). Rarity scales stats, beam and bolt colours, and the hardpoint ring. Each weapon has a full stat block (DPS, damage, fire rate, range, energy, heat, projectile speed, vs shields, armour penetration, crit) and special traits (burn, chain, stun, pierce, splash, leech, overclock, shred). Drops come from pirates, elites, outposts, hidden caches and bosses, and the best rarity you can get depends on sector threat.
- **Armory** (Upgrades → Gear, press I): compare, equip, unequip, upgrade with components, and salvage. Your ship tier sets the hardpoint count. The station Armory sells basic weapons. v3 weapons are converted into items automatically.
- **Galaxy:** 25 named sectors in 4 rings, held by 5 pirate factions: Crimson Marauders, Void Reavers, Iron Dominion, Eclipse Syndicate and Ashen Corsairs. Each faction has its own colours, insignia, ship tints and tactics (cloaks, energy drain, armour, shield-breakers, flanking swarms). A banner shows the sector, faction and threat when you enter.
- **Galaxy map** (MAP button, radar tap, sector name, or G): a holographic map with ownership colours, threat pips, fog of war, outposts, found caches, your ship, pan and pinch zoom, and sector inspection. You can set a waypoint, which adds a HUD arrow and a radar marker.
- **Liberation:** pirate sectors contain outposts with a core, shield generators and turrets. While the generators are up, the core takes only 10% damage. Destroying outposts and killing faction ships raises liberation progress. At 100% the sector is liberated: the map turns cyan, a sting plays, you get rewards (credits, XP, components and a guaranteed Rare+ weapon), and raids stop there.
- **Music moods:** peaceful (home and liberated space), mysterious (newly charted or unclaimed space), tense (pirate territory), intense (outposts, bosses, big fights), and a liberation sting.

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

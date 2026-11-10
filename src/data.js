// Game tuning tables
export const MINERALS = {
  ferrite:    { name: 'Ferrite',    color: 0xff8a3d, css: '#ff9a52', value: 4,  vault: false },
  stellarite: { name: 'Stellarite', color: 0x38c8ff, css: '#4fd2ff', value: 7,  vault: false },
  viridium:   { name: 'Viridium',   color: 0x4dff8a, css: '#5dff98', value: 15, vault: true },
  crimsonite: { name: 'Crimsonite', color: 0xff3355, css: '#ff4d6a', value: 35, vault: true },
  voidstone:  { name: 'Voidstone',  color: 0xb35cff, css: '#c27bff', value: 80, vault: true },
};
export const MINERAL_KEYS = Object.keys(MINERALS);

// Sectors are rings of distance around the station
export const SECTORS = [
  { id: 1, name: 'Safe Belt',      r0: 0,   r1: 190, danger: 0, density: 5, minerals: { ferrite: 6, stellarite: 4 }, rich: 0.0, tint: [0.25, 0.35, 0.9] },
  { id: 2, name: 'Frontier Drift', r0: 190, r1: 400, danger: 1, density: 6, minerals: { ferrite: 3, stellarite: 5, viridium: 3 }, rich: 0.08, tint: [0.2, 0.55, 0.8] },
  { id: 3, name: 'Pirate Reach',   r0: 400, r1: 650, danger: 2, density: 6, minerals: { stellarite: 3, viridium: 4, crimsonite: 3 }, rich: 0.14, tint: [0.75, 0.2, 0.45] },
  { id: 4, name: "Warlord's Maw",  r0: 650, r1: 99999, danger: 3, density: 7, minerals: { viridium: 2, crimsonite: 4, voidstone: 3 }, rich: 0.18, tint: [0.6, 0.15, 0.85] },
];
export function sectorAt(dist) {
  for (const s of SECTORS) if (dist < s.r1) return s;
  return SECTORS[SECTORS.length - 1];
}
export const BOSS_LAIR = { x: 520, z: -560 }; // ~763 from origin, inside sector 4

// legacy v1-v7 tiers: only used to migrate old saves (v8 hulls live in hulls.js)
export const TIERS = [
  { tier: 1, name: 'Mote Scout',          cls: 'Mining Scout',          slots: 1, hp: 100,  cargo: 40,  dmg: 1.0, speed: 1.0,  accel: 1.0,  scale: 1.0, cam: 1.0,  radius: 1.8, cost: 0,      station: 1, mats: null },
  { tier: 2, name: 'Packmule',            cls: 'Frigate Hauler',        slots: 2, hp: 230,  cargo: 90,  dmg: 1.3, speed: 1.02, accel: 0.95, scale: 1.0, cam: 1.15, radius: 2.6, cost: 1200,   station: 2, mats: null },
  { tier: 3, name: 'Ironclad',            cls: 'Destroyer',             slots: 3, hp: 480,  cargo: 180, dmg: 1.7, speed: 1.04, accel: 0.9,  scale: 1.0, cam: 1.33, radius: 3.5, cost: 6000,   station: 3, mats: { viridium: 20 } },
  { tier: 4, name: 'Bastion',             cls: 'Heavy Cruiser',         slots: 4, hp: 950,  cargo: 340, dmg: 2.2, speed: 1.06, accel: 0.85, scale: 1.0, cam: 1.55, radius: 4.6, cost: 25000,  station: 4, mats: { crimsonite: 30 } },
  { tier: 5, name: 'Sovereign',           cls: 'Capital Dreadnought',   slots: 6, hp: 2000, cargo: 650, dmg: 3.0, speed: 1.08, accel: 0.8,  scale: 1.0, cam: 1.85, radius: 6.5, cost: 90000,  station: 5, mats: { voidstone: 30 } },
];

export const STATION_LEVELS = [
  { lvl: 1, name: 'Outpost Refinery',  mult: 1.0, cost: 0, mats: null, desc: 'A lone refinery bolted to an asteroid.' },
  { lvl: 2, name: 'Solar Refinery',    mult: 1.5, cost: 600, mats: null, desc: 'Solar arrays power a second smelter. Unlocks fighters: Interceptor and Strike Fighter.' },
  { lvl: 3, name: 'Factory Station',   mult: 2.2, cost: 3000, mats: { viridium: 15 }, desc: 'Factory modules and a docking ring. Unlocks Corvette, Gunship, Bomber, Engineer and Explorer.' },
  { lvl: 4, name: 'Orbital Works',     mult: 3.2, cost: 12000, mats: { crimsonite: 20 }, desc: 'Cranes and assembly bays. Unlocks Frigate, Destroyer and Intercept Carrier.' },
  { lvl: 5, name: 'Industrial Hub',    mult: 4.6, cost: 40000, mats: { crimsonite: 30, voidstone: 10 }, desc: 'Drone bays and a capital slipway. Unlocks Cruiser, Battlecruiser and Fleet Carrier.' },
  { lvl: 6, name: 'Frontier Citadel',  mult: 6.5, cost: 120000, mats: { voidstone: 40 }, desc: 'A sprawling industrial empire with a titan drydock. Unlocks the Dreadnought.' },
];

export const WEAPONS = {
  laser:   { name: 'Mining Laser', short: 'LASER',   unlock: 1,  price: 0,    color: '#4fd2ff', desc: 'Continuous beam. Huge bonus vs asteroids, weak vs ships.', dps: 14, range: 13, vsRock: 2.5, vsShip: 0.6 },
  cannon:  { name: 'Autocannon',   short: 'CANNON',  unlock: 3,  price: 400,  color: '#ffd166', desc: 'Rapid kinetic bolts. Solid all-rounder, best vs pirates.', dmg: 7, rate: 4, speed: 60, range: 17, vsRock: 0.8, vsShip: 1.2 },
  missile: { name: 'Missile Pod',  short: 'MISSILE', unlock: 6,  price: 2500, color: '#ff8a3d', desc: 'Homing missiles with splash damage. Long range.', dmg: 24, rate: 0.65, speed: 30, range: 24, splash: 4.5, vsRock: 1.0, vsShip: 1.3 },
  pulse:   { name: 'Pulse Emitter',short: 'PULSE',   unlock: 10, price: 8000, color: '#c27bff', desc: 'Area shockwave hits everything nearby.', dmg: 30, rate: 0.4, range: 11, vsRock: 0.8, vsShip: 1.0 },
};
export const WEAPON_KEYS = Object.keys(WEAPONS);

export const UPGRADES = [
  { key: 'damage',   name: 'Weapon Damage',     icon: '✷', base: 60,  growth: 1.22, max: 60, per: 0.12, fmt: (l) => `+${Math.round(l * 12)}% damage` },
  { key: 'firerate', name: 'Fire Rate',         icon: '≫', base: 80,  growth: 1.24, max: 40, per: 0.06, fmt: (l) => `+${Math.round(l * 6)}% fire rate` },
  { key: 'projspeed',name: 'Projectile Speed',  icon: '➶', base: 50,  growth: 1.2,  max: 30, per: 0.08, fmt: (l) => `+${Math.round(l * 8)}% projectile speed` },
  { key: 'range',    name: 'Targeting Range',   icon: '◎', base: 90,  growth: 1.25, max: 30, per: 0.04, fmt: (l) => `+${Math.round(l * 4)}% range` },
  { key: 'crit',     name: 'Critical Chance',   icon: '✦', base: 120, growth: 1.26, max: 30, per: 0.015, fmt: (l) => `${(5 + l * 1.5).toFixed(1)}% crit (x2.5)` },
  { key: 'mining',   name: 'Mining Efficiency', icon: '⛏', base: 70,  growth: 1.22, max: 50, per: 0.1, fmt: (l) => `+${Math.round(l * 10)}% ore yield & rock dmg` },
  { key: 'engine',   name: 'Engine Speed',      icon: '⇧', base: 60,  growth: 1.22, max: 30, per: 0.05, fmt: (l) => `+${Math.round(l * 5)}% speed` },
  { key: 'magnet',   name: 'Collect Radius',    icon: '⊚', base: 40,  growth: 1.2,  max: 30, per: 0.1, fmt: (l) => `+${Math.round(l * 10)}% magnet radius` },
  { key: 'cargo',    name: 'Cargo Hold',        icon: '▣', base: 75,  growth: 1.23, max: 40, per: 0.15, fmt: (l) => `+${Math.round(l * 15)}% cargo space` },
  { key: 'hull',     name: 'Hull Plating',      icon: '⛨', base: 70,  growth: 1.22, max: 40, per: 0.12, fmt: (l) => `+${Math.round(l * 12)}% hull` },
];
export const upgradeCost = (u, lvl) => Math.round(u.base * Math.pow(u.growth, lvl));

export const ENEMIES = {
  drone:       { name: 'Raider Drone',    hp: 28,   speed: 17, dmg: 3,  fireRate: 0.9,  range: 15, radius: 1.0, xp: 6,   credits: 12,   armor: 0 },
  interceptor: { name: 'Interceptor',     hp: 65,   speed: 25, dmg: 6,  fireRate: 1.6,  range: 18, radius: 1.4, xp: 14,  credits: 30,   armor: 0 },
  gunship:     { name: 'Armored Gunship', hp: 320,  speed: 8,  dmg: 11, fireRate: 0.55, range: 22, radius: 2.8, xp: 45,  credits: 110,  armor: 0.35 },
  sentinel:    { name: 'Mining Sentinel', hp: 130,  speed: 12, dmg: 7,  fireRate: 0.8,  range: 18, radius: 1.6, xp: 20,  credits: 45,   armor: 0.1 },
  boss:        { name: 'Warlord Dreadnought', hp: 7000, speed: 5, dmg: 16, fireRate: 1.2, range: 34, radius: 9, xp: 1500, credits: 5000, armor: 0.25 },
  // v4 pirate outpost parts (static)
  inst_core:   { name: 'Outpost Command Core', hp: 2600, speed: 0, dmg: 0, fireRate: 0, range: 0, radius: 5.6, xp: 120, credits: 300, armor: 0.3, inst: true },
  inst_gen:    { name: 'Shield Generator', hp: 520, speed: 0, dmg: 0, fireRate: 0, range: 0, radius: 2.2, xp: 40, credits: 80, armor: 0.2, inst: true },
  inst_turret: { name: 'Defense Turret', hp: 380, speed: 0, dmg: 8, fireRate: 0.75, range: 34, radius: 1.9, xp: 15, credits: 40, armor: 0.25, inst: true },
  inst_reactor: { name: 'Fusion Reactor', hp: 600, speed: 0, dmg: 0, fireRate: 0, range: 0, radius: 2.4, xp: 45, credits: 90, armor: 0.2, inst: true },
  inst_hangar: { name: 'Fighter Hangar', hp: 560, speed: 0, dmg: 0, fireRate: 0, range: 0, radius: 2.8, xp: 40, credits: 80, armor: 0.25, inst: true },
  // v5 installation cores (one per installation, plus generators + turrets)
  inst_comm:   { name: 'Communication Array', hp: 1500, speed: 0, dmg: 0, fireRate: 0, range: 0, radius: 4, xp: 160, credits: 260, armor: 0.25, inst: true },
  inst_res:    { name: 'Resource Facility', hp: 1700, speed: 0, dmg: 0, fireRate: 0, range: 0, radius: 4.6, xp: 160, credits: 420, armor: 0.3, inst: true },
  inst_yard:   { name: 'Hidden Shipyard', hp: 2400, speed: 0, dmg: 0, fireRate: 0, range: 0, radius: 6, xp: 220, credits: 380, armor: 0.3, inst: true },
  inst_def:    { name: 'Orbital Defense Platform', hp: 2200, speed: 0, dmg: 22, fireRate: 0.28, range: 60, radius: 5, xp: 220, credits: 360, armor: 0.4, inst: true },
  inst_hq:     { name: 'Faction Stronghold', hp: 6500, speed: 0, dmg: 0, fireRate: 0, range: 0, radius: 9, xp: 600, credits: 1500, armor: 0.35, inst: true },
  // v5 AI roles
  sniper:      { name: 'Rail Sniper', hp: 80, speed: 18, dmg: 20, fireRate: 0.32, range: 46, radius: 1.6, xp: 22, credits: 50, armor: 0, role: 'sniper' },
  support:     { name: 'Repair Tender', hp: 150, speed: 15, dmg: 3, fireRate: 0.6, range: 16, radius: 1.8, xp: 26, credits: 60, armor: 0.1, role: 'support' },
  ew:          { name: 'EW Jammer', hp: 120, speed: 17, dmg: 4, fireRate: 0.8, range: 20, radius: 1.7, xp: 26, credits: 60, armor: 0.05, role: 'ew' },
  frigate:     { name: 'Pirate Frigate', hp: 950, speed: 7.5, dmg: 9, fireRate: 0.8, range: 34, radius: 5, xp: 130, credits: 280, armor: 0.3, role: 'line' },
  destroyer:   { name: 'Pirate Destroyer', hp: 1350, speed: 7, dmg: 13, fireRate: 0.7, range: 38, radius: 6, xp: 180, credits: 400, armor: 0.35, role: 'line' },
  capital:     { name: 'Intercept Carrier', hp: 1900, speed: 4.5, dmg: 9, fireRate: 0.9, range: 30, radius: 6, xp: 220, credits: 500, armor: 0.35, role: 'capital' },
  freighter:   { name: 'Supply Freighter', hp: 520, speed: 7, dmg: 0, fireRate: 0, range: 0, radius: 3, xp: 40, credits: 160, armor: 0.25, role: 'freighter' },
  commander:   { name: 'Sector Commander', hp: 2600, speed: 8, dmg: 10, fireRate: 1.0, range: 30, radius: 4.2, xp: 500, credits: 1500, armor: 0.25, boss: true },
  flagship:    { name: 'Faction Flagship', hp: 15000, speed: 5, dmg: 16, fireRate: 1.2, range: 34, radius: 10, xp: 3000, credits: 12000, armor: 0.3, boss: true },
  bpart:       { name: 'Ship Component', hp: 900, speed: 0, dmg: 0, fireRate: 0, range: 0, radius: 1.8, xp: 60, credits: 120, armor: 0.2, part: true },
};

export const LEVEL_TITLES = ['Rookie Miner', 'Rock Hopper', 'Ore Runner', 'Starward Miner', 'Belt Prospector', 'Void Hauler', 'Frontier Captain', 'Fleet Commander', 'Industrial Baron', 'Frontier Sovereign'];
export const xpForLevel = (l) => Math.round(80 * Math.pow(l, 1.55));

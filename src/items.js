// Weapon items: 7 categories, 6 rarities, rolled stats, specials, upgrade/salvage, loot tables
export const RARITIES = [
  { id: 'common',    name: 'Common',    color: '#c9d3de', rgb: [1.6, 1.8, 2.0], mult: 1.0,  rate: 1.0,  maxUp: 3, specials: 0, salvage: 2 },
  { id: 'uncommon',  name: 'Uncommon',  color: '#5dff98', rgb: [0.5, 3.0, 1.1], mult: 1.15, rate: 1.04, maxUp: 4, specials: 0, salvage: 5 },
  { id: 'rare',      name: 'Rare',      color: '#4fa8ff', rgb: [0.5, 1.6, 3.4], mult: 1.32, rate: 1.08, maxUp: 5, specials: 1, salvage: 12 },
  { id: 'epic',      name: 'Epic',      color: '#c27bff', rgb: [2.2, 0.8, 3.4], mult: 1.52, rate: 1.12, maxUp: 6, specials: 2, salvage: 30 },
  { id: 'legendary', name: 'Legendary', color: '#ffb238', rgb: [3.4, 2.0, 0.4], mult: 1.78, rate: 1.16, maxUp: 7, specials: 2, salvage: 80 },
  { id: 'exotic',    name: 'Exotic',    color: '#ff4fd8', rgb: [3.4, 0.6, 2.8], mult: 2.1,  rate: 1.2,  maxUp: 8, specials: 3, salvage: 200 },
];
// Categories. beh: which firing behaviour / turret the item uses (beam, bolt, missile, pulse)
export const CATS = {
  laser:    { name: 'Laser',        icon: '⌁', color: '#4fd2ff' },
  plasma:   { name: 'Plasma Cannon', icon: '◍', color: '#ff7a45' },
  railgun:  { name: 'Railgun',      icon: '⇶', color: '#ffd166' },
  missile:  { name: 'Missile Launcher', icon: '➹', color: '#ff8a3d' },
  ion:      { name: 'Ion Weapon',   icon: 'ϟ', color: '#6fe7ff' },
  particle: { name: 'Particle Beam', icon: '≋', color: '#ff5fa8' },
  exp:      { name: 'Experimental', icon: '✺', color: '#c27bff' },
};
// Templates (base weapons). Stat units: beam dmg = damage/second; others = per shot. energy = per shot (beam: per second). heat = per shot (beam: per second).
export const TEMPLATES = {
  mining_laser:  { cat: 'laser', beh: 'beam', name: 'Mining Laser', lvl: 1, price: 0, desc: 'Continuous beam. Huge bonus vs asteroids, weak vs ships.', dmg: 14, rate: 1, range: 13, energy: 2, heat: 6, speed: 0, shieldMul: 1.0, pen: 0, crit: 0, vsRock: 2.5, vsShip: 0.6, beamRgb: [0.7, 1.9, 2.6] },
  autocannon:    { cat: 'railgun', beh: 'bolt', name: 'Rail Autocannon', lvl: 3, price: 400, desc: 'Rapid kinetic slugs. Solid all-rounder, best vs pirates.', dmg: 7, rate: 4, range: 17, energy: 0.6, heat: 4, speed: 60, shieldMul: 0.8, pen: 0.15, crit: 0, vsRock: 0.8, vsShip: 1.2, len: 1.8, w: 1, rgb: [3.2, 2.4, 0.8] },
  plasma_cannon: { cat: 'plasma', beh: 'bolt', name: 'Plasma Cannon', lvl: 4, price: 900, desc: 'Slow superheated bolts that splash on impact. Great vs shields.', dmg: 22, rate: 1.3, range: 18, energy: 3, heat: 9, speed: 30, shieldMul: 1.4, pen: 0.05, crit: 0, vsRock: 1.1, vsShip: 1.25, splash: 2.6, len: 1.1, w: 2.4, rgb: [3.4, 1.2, 0.5] },
  missile_pod:   { cat: 'missile', beh: 'missile', name: 'Missile Pod', lvl: 6, price: 2500, desc: 'Homing missiles with splash damage. Long range, good vs armor.', dmg: 24, rate: 0.65, range: 24, energy: 4, heat: 12, speed: 30, shieldMul: 0.9, pen: 0.3, crit: 0, vsRock: 1.0, vsShip: 1.3, splash: 4.5 },
  ion_blaster:   { cat: 'ion', beh: 'bolt', name: 'Ion Disruptor', lvl: 7, price: 3600, desc: 'Ion bolts shred shields and can short out enemy systems.', dmg: 9, rate: 2.4, range: 18, energy: 1.6, heat: 5, speed: 48, shieldMul: 2.6, pen: 0, crit: 0, vsRock: 0.5, vsShip: 1.0, stun: 0.1, len: 1.4, w: 1.4, rgb: [0.6, 2.6, 3.6] },
  railgun:       { cat: 'railgun', beh: 'bolt', name: 'Railgun', lvl: 8, price: 5200, desc: 'Hypervelocity slugs that punch through armor and multiple targets.', dmg: 38, rate: 0.7, range: 26, energy: 4, heat: 16, speed: 130, shieldMul: 0.7, pen: 0.6, crit: 0.05, vsRock: 1.0, vsShip: 1.4, pierce: 2, len: 3.2, w: 0.7, rgb: [2.4, 2.8, 3.6] },
  pulse_emitter: { cat: 'exp', beh: 'pulse', name: 'Pulse Emitter', lvl: 10, price: 8000, desc: 'Experimental area shockwave that hits everything nearby.', dmg: 30, rate: 0.4, range: 11, energy: 8, heat: 20, speed: 0, shieldMul: 1.2, pen: 0.2, crit: 0, vsRock: 0.8, vsShip: 1.0 },
  particle_beam: { cat: 'particle', beh: 'beam', name: 'Particle Beam', lvl: 12, price: 12000, desc: 'High-energy continuous beam built for ship-to-ship combat.', dmg: 34, rate: 1, range: 16, energy: 6, heat: 9, speed: 0, shieldMul: 1.2, pen: 0.25, crit: 0, vsRock: 0.7, vsShip: 1.5, beamRgb: [3.2, 0.8, 2.2] },
  arc_projector: { cat: 'exp', beh: 'bolt', name: 'Arc Projector', lvl: 9, price: 0, drop: true, desc: 'Recovered tech: lightning bolts that jump between targets.', dmg: 16, rate: 1.8, range: 17, energy: 2.5, heat: 7, speed: 70, shieldMul: 1.3, pen: 0.1, crit: 0.03, vsRock: 0.6, vsShip: 1.2, chainBase: 0.5, len: 1.6, w: 1.2, rgb: [2.0, 1.4, 3.6] },
};
export const TEMPLATE_KEYS = Object.keys(TEMPLATES);
export const SPECIALS = {
  burn:    { name: 'Searing',     desc: 'Sets targets ablaze: +35% damage over 3 s' },
  chain:   { name: 'Arcing',      desc: 'Hits jump to a nearby enemy for 40% damage' },
  stun:    { name: 'Disruptor',   desc: '12% chance to short out the target for 0.8 s' },
  pierce:  { name: 'Piercing',    desc: 'Projectiles pass through one extra target' },
  splash:  { name: 'Volatile',    desc: 'Impacts explode for 50% splash damage' },
  leech:   { name: 'Vampiric',    desc: 'Repairs your hull for 3% of damage dealt' },
  overclock: { name: 'Overclocked', desc: '+12% fire rate and +5% critical chance' },
  shred:   { name: 'Shredding',   desc: 'Hit targets take +15% damage for 4 s' },
};
const BEH_SPECIALS = { beam: ['burn', 'leech', 'shred', 'overclock', 'chain'], bolt: ['burn', 'chain', 'stun', 'pierce', 'splash', 'leech', 'overclock', 'shred'], missile: ['burn', 'stun', 'splash', 'shred', 'overclock', 'leech'], pulse: ['burn', 'stun', 'shred', 'leech', 'overclock'] };
const UNIQUE = { // legendary / exotic names per category
  laser: ['Dawnpiercer', 'Helios Lance'], plasma: ['Sunforge', 'Crimson Dread'], railgun: ['Widowmaker', 'Longshot Prime'], missile: ['Hydra Rack', 'Thunderhead'],
  ion: ['Stormcaller', 'Blackout'], particle: ['Nova Lance', 'Starbreaker'], exp: ['Singularity Engine', 'Void Harp'],
};

let seq = 0;
export const newItemId = () => 'i' + Date.now().toString(36) + (seq++).toString(36) + Math.floor(Math.random() * 1e5).toString(36);
const rnd = (seed) => { let t = seed >>> 0; return () => { t += 0x6d2b79f5; let r = Math.imul(t ^ (t >>> 15), 1 | t); r ^= r + Math.imul(r ^ (r >>> 7), 61 | r); return ((r ^ (r >>> 14)) >>> 0) / 4294967296; }; };

// Create an item. rar = rarity index 0..5, il = item level (= required ship level)
export function makeItem(t, rar, il, src = 'Merchant', opts = {}) {
  const T = TEMPLATES[t]; const R = RARITIES[rar]; const seed = opts.seed ?? Math.floor(Math.random() * 2 ** 31); const r = rnd(seed);
  const pool = [...BEH_SPECIALS[T.beh]]; const sp = [];
  for (let i = 0; i < R.specials && pool.length; i++) sp.push(pool.splice(Math.floor(r() * pool.length), 1)[0]);
  let name = T.name;
  if (rar >= 4) name = UNIQUE[T.cat][Math.floor(r() * 2)] + ` (${T.name})`;
  else if (sp.length) name = `${SPECIALS[sp[0]].name} ${T.name}`;
  return { id: opts.id || newItemId(), t, r: rar, il: Math.max(1, Math.round(il)), up: 0, sp, seed, src, name, at: opts.at || Date.now() };
}
// Full stat block for an item (pure function of the item)
export function itemStats(it) {
  const T = TEMPLATES[it.t]; const R = RARITIES[it.r]; const r = rnd(it.seed); const roll = () => 0.94 + r() * 0.12;
  const lvlK = 1 + 0.06 * (it.il - 1); const upK = 1 + 0.09 * it.up; const has = (k) => it.sp.includes(k);
  const s = {
    beh: T.beh, cat: T.cat,
    dmg: T.dmg * R.mult * lvlK * upK * roll(),
    rate: T.rate * R.rate * (1 + 0.02 * it.up) * roll() * (has('overclock') ? 1.12 : 1),
    range: T.range * (1 + 0.03 * it.r) * roll(),
    energy: T.energy * (1 - 0.04 * it.r),
    heat: T.heat * (1 - 0.05 * it.r),
    speed: T.speed * (1 + 0.04 * it.r),
    shieldMul: T.shieldMul * (1 + 0.05 * it.r),
    pen: Math.min(0.9, T.pen + 0.04 * it.r + 0.02 * it.up),
    crit: T.crit + 0.01 * it.r + (has('overclock') ? 0.05 : 0),
    vsRock: T.vsRock, vsShip: T.vsShip, splash: T.splash || (has('splash') ? 2.2 : 0), pierce: (T.pierce || 0) + (has('pierce') ? 1 : 0),
    stun: (T.stun || 0) + (has('stun') ? 0.12 : 0), chain: (T.chainBase || 0) + (has('chain') ? 0.4 : 0),
    burn: has('burn') ? 0.35 : 0, leech: has('leech') ? 0.03 : 0, shred: has('shred') ? 0.15 : 0, splashK: T.splash ? 1 : 0.5,
    req: it.il,
  };
  // visuals scale with rarity
  const tint = R.rgb; const mix = (a, b, k) => a.map((v, i) => v * (1 - k) + b[i] * k);
  const k = it.r === 0 ? 0 : 0.25 + 0.12 * it.r;
  if (T.rgb) s.rgb = mix(T.rgb, tint, k);
  if (T.beamRgb) s.beamRgb = mix(T.beamRgb, tint, k * 0.8);
  s.w = (T.w || 1) * (1 + 0.08 * it.r); s.len = (T.len || 1.6) * (1 + 0.05 * it.r);
  return s;
}
export const itemPower = (it) => { const s = itemStats(it); return Math.round((s.beh === 'beam' ? s.dmg : s.dmg * s.rate) * (s.beh === 'pulse' ? 2 : 1) * (1 + s.pen * 0.5 + (s.splash ? 0.3 : 0) + s.pierce * 0.2 + s.chain * 0.4 + s.burn) * 10) / 10; };
export const upgradeCost = (it) => ({ credits: Math.round(120 * Math.pow(1.7, it.up) * (it.r + 1) * (1 + it.il * 0.08)), parts: (it.up + 1) * (it.r + 1) * 3 });
export const salvageValue = (it) => ({ parts: Math.round(RARITIES[it.r].salvage * (1 + it.up * 0.35) * (1 + it.il * 0.03)), credits: Math.round(25 * (it.r + 1) * (1 + it.il * 0.1)) });

// ---- loot tables: rarity gated by sector threat (1..5) and source ----
const SOURCE = { pirate: { chance: 0.06, cap: 0, bonus: 0 }, elite: { chance: 0.4, cap: 1, bonus: 1 }, cache: { chance: 1, cap: 1, bonus: 0.6 }, installation: { chance: 1, cap: 1, bonus: 1.2 }, boss: { chance: 1, cap: 2, bonus: 2.5 }, liberation: { chance: 1, cap: 2, bonus: 2 } };
export function lootChance(src, luck = 0) { return Math.min(1, SOURCE[src].chance * (1 + luck)); }
export function rollRarity(threat, src, luck = 0, minR = 0) {
  const S = SOURCE[src]; const maxR = Math.min(5, Math.max(1, threat - 1) + S.cap + (threat >= 5 && (src === 'boss' || src === 'liberation') ? 1 : 0));
  let r = 0; const steps = [0.45, 0.4, 0.32, 0.22, 0.12]; // chance to climb each rung
  for (let i = 0; i < 5; i++) { const p = Math.min(0.92, steps[i] * (1 + S.bonus * 0.5 + luck) * (0.55 + threat * 0.18)); if (Math.random() < p) r++; else break; }
  return Math.max(minR, Math.min(maxR, r));
}
export function rollTemplate(level, rar) {
  const opts = TEMPLATE_KEYS.filter((k) => k !== 'mining_laser' || rar >= 1).filter((k) => TEMPLATES[k].lvl <= level + 4 || rar >= 3);
  return opts[Math.floor(Math.random() * opts.length)];
}
export function rollLoot(level, threat, src, luck = 0, minR = 0) {
  const rar = rollRarity(threat, src, luck, minR); const t = rollTemplate(level, rar);
  const il = Math.max(1, Math.min(level + (src === 'boss' || src === 'liberation' ? 2 : 1), level + Math.floor(Math.random() * 3) - 1));
  return makeItem(t, rar, il, { pirate: 'Pirate wreck', elite: 'Elite pirate', cache: 'Hidden cache', installation: 'Pirate outpost', boss: 'Faction boss', liberation: 'Liberation reward' }[src]);
}
// Merchant stock: common/uncommon versions of non-drop templates unlocked by level
export function merchantStock(level) {
  return TEMPLATE_KEYS.filter((k) => !TEMPLATES[k].drop && k !== 'mining_laser').map((k) => ({ t: k, r: level >= TEMPLATES[k].lvl + 6 ? 1 : 0, il: Math.max(TEMPLATES[k].lvl, level), price: Math.round(TEMPLATES[k].price * (1 + 0.12 * Math.max(0, level - TEMPLATES[k].lvl)) * (level >= TEMPLATES[k].lvl + 6 ? 1.6 : 1)), locked: level < TEMPLATES[k].lvl, lvl: TEMPLATES[k].lvl }));
}
// v3 weapon keys -> templates (save migration)
export const LEGACY = { laser: ['mining_laser', 0], cannon: ['autocannon', 1], missile: ['missile_pod', 2], pulse: ['pulse_emitter', 2] };

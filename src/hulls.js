// v8 hull registry: the fifteen ship classes from the "Stellar Odyssey" concept sheet, built procedurally at true relative scale.
// Every hull is designed at a normalised length of 10 (nose +z, tail -z) and built by a scaled Kit at its real length.
// 1 world unit = 5 m. Scout = 4 u (20 m) ... Dreadnought = 144 u (720 m).
import * as THREE from 'three';
import { Kit, materials, hullTextures, makeTurret } from './models.js?v=8';
import { mulberry } from './util.js?v=8';

export const UNIT_M = 5;
export const HULL_CLASSES = { small: 'Small Ships', medium: 'Medium Ships', large: 'Large Ships', special: 'Specialized Ships', capital: 'Capital Ships', titan: 'Titan Class' };
// rank = position on the class path (1..7); side = side-grade (not on the main line). from = owning ANY of these unlocks it.
export const HULLS = {
  scout:         { name: 'Scout',             cls: 'small',   role: 'Fast · Recon',              rank: 1, len: 4,   beam: 2.6, slots: 1, hp: 100,  cargo: 40,   dmg: 1.0,  speed: 1.12, accel: 1.05, turn: 1.15, cost: 0,      station: 1, mats: null, from: [], ability: 'recon', paint: 'scout', radar: 1.25, desc: 'A needle-nosed recon craft. Quick, fragile, sharp-eyed.' },
  interceptor:   { name: 'Interceptor',       cls: 'small',   role: 'Agile · Dogfight',          rank: 2, len: 4.6, beam: 2.6, slots: 2, hp: 170,  cargo: 50,   dmg: 1.35, speed: 1.3,  accel: 1.25, turn: 1.35, cost: 1500,   station: 2, mats: null, from: ['scout'], ability: 'afterburn', paint: 'interceptor', desc: 'Swept-wing dogfighter: the fastest, twitchiest hull in the yard.' },
  strike:        { name: 'Strike Fighter',    cls: 'small',   role: 'Balanced · Versatile',      rank: 2, len: 5,   beam: 3.4, slots: 2, hp: 230,  cargo: 70,   dmg: 1.4,  speed: 1.1,  accel: 1.02, turn: 1.08, cost: 1500,   station: 2, mats: null, from: ['scout'], ability: 'strikerun', paint: 'strike', desc: 'Twin dorsal nacelles and a heavier frame. Good at everything.' },
  bomber:        { name: 'Bomber',            cls: 'special', role: 'High Explosive · Base Assault', rank: 2, side: true, len: 6.4, beam: 4.8, slots: 2, hp: 280, cargo: 60, dmg: 1.5, speed: 0.96, accel: 0.86, turn: 0.85, cost: 4500, station: 3, mats: { viridium: 12 }, from: ['interceptor', 'strike'], ability: 'bombrun', paint: 'bomber', vsBase: 1.6, desc: 'Forward-swept claw wings full of ordnance. +60% damage to installations.' },
  corvette:      { name: 'Corvette',          cls: 'medium',  role: 'Multi-Role · Durable',      rank: 3, len: 10,  beam: 4.2, slots: 3, hp: 470,  cargo: 160,  dmg: 1.75, speed: 1.0,  accel: 0.88, turn: 0.85, cost: 6500,   station: 3, mats: { viridium: 20 }, from: ['interceptor', 'strike', 'bomber'], ability: 'flak', paint: 'corvette', desc: 'Twin-pod workhorse with a point-defence suite.' },
  gunship:       { name: 'Gunship',           cls: 'medium',  role: 'Heavy Firepower',           rank: 3, len: 10.4, beam: 4.8, slots: 3, hp: 430, cargo: 120,  dmg: 1.95, speed: 0.92, accel: 0.82, turn: 0.8,  cost: 7000,   station: 3, mats: { viridium: 20 }, from: ['interceptor', 'strike', 'bomber'], ability: 'broadside', paint: 'gunship', desc: 'Stub wings bristling with cannon pods. Hits like a frigate.' },
  engineer:      { name: 'Engineer',          cls: 'medium',  role: 'Support · Repair',          rank: 3, side: true, len: 9.2, beam: 4.6, slots: 2, hp: 450, cargo: 280, dmg: 1.4, speed: 0.95, accel: 0.85, turn: 0.82, cost: 8000, station: 3, mats: { viridium: 25 }, from: ['corvette', 'gunship'], ability: 'repair', paint: 'engineer', regen: 0.012, mining: 1.15, desc: 'Modular tender with repair cranes. Self-repairs 1.2% hull/s; huge cargo.' },
  explorer:      { name: 'Explorer',          cls: 'special', role: 'Long Range · Resource Scan', rank: 3, side: true, len: 16, beam: 6.8, slots: 2, hp: 400, cargo: 440, dmg: 1.45, speed: 1.16, accel: 0.9, turn: 0.8, cost: 12000, station: 3, mats: { viridium: 30 }, from: ['corvette', 'gunship', 'engineer'], ability: 'scan', paint: 'explorer', radar: 1.6, mining: 1.3, desc: 'Survey ship with a sensor ring. +60% radar, +30% mining, deep scans.' },
  frigate:       { name: 'Frigate',           cls: 'large',   role: 'Tactical · Flexible',       rank: 4, len: 20,  beam: 6.4, slots: 4, hp: 920,  cargo: 360,  dmg: 2.2,  speed: 0.98, accel: 0.75, turn: 0.62, cost: 26000,  station: 4, mats: { crimsonite: 30 }, from: ['corvette', 'gunship', 'engineer', 'explorer'], ability: 'tactical', paint: 'frigate', pd: 2, desc: 'Stepped-deck line ship. Balanced guns, shields and speed.' },
  destroyer:     { name: 'Destroyer',         cls: 'large',   role: 'High Damage · Anti-Capital', rank: 4, len: 28, beam: 7.2, slots: 4, hp: 880, cargo: 300, dmg: 2.45, speed: 0.95, accel: 0.7, turn: 0.55, cost: 30000, station: 4, mats: { crimsonite: 35 }, from: ['corvette', 'gunship', 'engineer', 'explorer'], ability: 'torpedo', paint: 'destroyer', vsBig: 1.3, pd: 2, desc: 'A dagger hull built around its guns. +30% damage to capital ships.' },
  icarrier:      { name: 'Intercept Carrier', cls: 'special', role: 'Deploys Drones · Field Support', rank: 4, side: true, len: 32, beam: 11, slots: 3, hp: 1050, cargo: 420, dmg: 2.0, speed: 0.88, accel: 0.62, turn: 0.48, cost: 42000, station: 4, mats: { crimsonite: 40 }, from: ['frigate', 'destroyer'], ability: 'wing', paint: 'icarrier', wing: { hull: 'scout', n: 4, name: 'drone' }, pd: 4, desc: 'Flat-deck carrier. Keeps 4 combat drones in the air.' },
  cruiser:       { name: 'Cruiser',           cls: 'large',   role: 'Command · Heavy Armor',     rank: 5, len: 40,  beam: 11, slots: 5, hp: 1550, cargo: 520,  dmg: 2.7,  speed: 0.92, accel: 0.6,  turn: 0.45, cost: 70000,  station: 5, mats: { crimsonite: 30, voidstone: 15 }, from: ['frigate', 'destroyer', 'icarrier'], ability: 'command', paint: 'cruiser', armor: 0.1, pd: 4, desc: 'Layered armour and a command tower. Takes 10% less damage.' },
  battlecruiser: { name: 'Battlecruiser',     cls: 'capital', role: 'Heavy Weapons · Fleet Support', rank: 6, len: 76, beam: 18, slots: 6, hp: 2600, cargo: 700, dmg: 3.1, speed: 0.9, accel: 0.5, turn: 0.36, cost: 140000, station: 5, mats: { voidstone: 35 }, from: ['cruiser'], ability: 'broadside', paint: 'battlecruiser', armor: 0.12, pd: 6, desc: 'A capital ship of the line: eight batteries and a fleet-support deck.' },
  fleetcarrier:  { name: 'Fleet Carrier',     cls: 'capital', role: 'Deploys Fighters · Mobile Base', rank: 6, side: true, len: 84, beam: 22, slots: 5, hp: 2500, cargo: 900, dmg: 2.7, speed: 0.86, accel: 0.45, turn: 0.32, cost: 150000, station: 5, mats: { voidstone: 40 }, from: ['cruiser', 'battlecruiser'], ability: 'wing', paint: 'fleetcarrier', wing: { hull: 'strike', n: 6, name: 'fighter' }, armor: 0.1, pd: 6, desc: 'A mobile base: runway deck, repair bays and a six-fighter wing.' },
  dreadnought:   { name: 'Dreadnought',       cls: 'titan',   role: 'Massive Firepower · Command', rank: 7, len: 144, beam: 36, slots: 8, hp: 4400, cargo: 1300, dmg: 3.8, speed: 0.85, accel: 0.4, turn: 0.26, cost: 320000, station: 6, mats: { voidstone: 60, crimsonite: 40 }, from: ['battlecruiser', 'fleetcarrier'], ability: 'titanlance', paint: 'dreadnought', armor: 0.18, shieldK: 1.3, pd: 10, desc: 'Titan class. Advanced shielding, a spinal lance and a faction-defining presence.' },
};
export const HULL_IDS = Object.keys(HULLS);
for (const id of HULL_IDS) { const H = HULLS[id]; H.id = id; H.mass = +(1.2 * (H.len / 4) ** 2).toFixed(2); H.cam = +((H.len / 4) ** 0.55).toFixed(3); H.radius = +(0.45 * Math.sqrt(H.len * H.beam)).toFixed(2); H.bound = H.len / 2; }
export const MAIN_PATH = [['scout'], ['interceptor', 'strike'], ['corvette', 'gunship'], ['frigate', 'destroyer'], ['cruiser'], ['battlecruiser'], ['dreadnought']];
export const LEGACY_TIER_HULL = { 1: 'scout', 2: 'strike', 3: 'gunship', 4: 'cruiser', 5: 'battlecruiser' }; // v7 T1..T5 -> equivalent hulls
export const ENEMY_HULL = { drone: 'scout', interceptor: 'interceptor', sniper: 'strike', ew: 'scout', support: 'engineer', gunship: 'gunship', sentinel: 'interceptor', capital: 'icarrier', frigate: 'frigate', destroyer: 'destroyer', commander: 'cruiser', boss: 'dreadnought' };
export const FLAGSHIP_HULL = { crimson: 'dreadnought', iron: 'dreadnought', void: 'battlecruiser', eclipse: 'battlecruiser', ashen: 'fleetcarrier' };

// ---------------------------------------------------------------- paint schemes (from the sheet)
const SCHEMES = {
  // player liveries: each hull keeps its concept-art colour blocking
  scout:         { hull: 0x8a95a4, plate: 0xdfe6ee, dark: 0x3c434d, accent: 0x2c6be0, glow: [0.4, 1.9, 3.6], eng: [0.45, 1.9, 3.6], win: [0.5, 1.8, 3.2] },
  interceptor:   { hull: 0x585e68, plate: 0xd8dade, dark: 0x2e3238, accent: 0xc0222c, glow: [3.3, 0.45, 0.4], eng: [0.5, 1.7, 3.6], win: [3.0, 1.4, 0.5] },
  strike:        { hull: 0x4a4e57, plate: 0x2c2f35, dark: 0x24272c, accent: 0xe6b012, glow: [3.4, 2.2, 0.45], eng: [3.4, 1.7, 0.45], win: [3.2, 2.0, 0.6] },
  bomber:        { hull: 0x46404a, plate: 0x8f8c90, dark: 0x2a262b, accent: 0xa81c24, glow: [3.4, 0.55, 0.35], eng: [3.4, 1.0, 0.4], win: [3.2, 1.2, 0.4] },
  corvette:      { hull: 0x5b6573, plate: 0xb6c0cc, dark: 0x343b45, accent: 0x3a76d6, glow: [0.45, 1.8, 3.6], eng: [0.45, 1.9, 3.6], win: [0.6, 1.8, 3.2] },
  gunship:       { hull: 0x4b4f57, plate: 0xd2d3d6, dark: 0x2d3036, accent: 0xb81f28, glow: [3.4, 0.6, 0.4], eng: [3.4, 1.2, 0.45], win: [3.2, 1.4, 0.5] },
  engineer:      { hull: 0x6d737c, plate: 0xe6e8ea, dark: 0x3d4148, accent: 0xe8761c, glow: [3.4, 1.6, 0.4], eng: [3.4, 1.7, 0.5], win: [3.2, 1.8, 0.6] },
  explorer:      { hull: 0x8a93a0, plate: 0xe4e9ef, dark: 0x3a414b, accent: 0x2f78e0, glow: [0.5, 2.0, 3.8], eng: [0.5, 2.0, 3.8], win: [0.6, 2.0, 3.4] },
  frigate:       { hull: 0x4d535d, plate: 0x8e96a1, dark: 0x2c3138, accent: 0x3b4d6a, glow: [0.5, 1.8, 3.6], eng: [0.5, 1.9, 3.6], win: [3.2, 1.8, 0.6] },
  destroyer:     { hull: 0x4a4d55, plate: 0x9ca1aa, dark: 0x2b2e34, accent: 0xa31d26, glow: [3.4, 0.55, 0.35], eng: [3.4, 1.4, 0.5], win: [3.4, 1.7, 0.5] },
  icarrier:      { hull: 0x4b525c, plate: 0x9aa2ad, dark: 0x2c3138, accent: 0x6b7380, glow: [3.4, 2.1, 0.5], eng: [0.5, 1.9, 3.6], win: [3.4, 2.0, 0.6] },
  cruiser:       { hull: 0x5c6573, plate: 0xaab4c2, dark: 0x323944, accent: 0x2b5db8, glow: [0.4, 1.9, 3.8], eng: [0.45, 2.0, 3.8], win: [0.5, 1.9, 3.6] },
  battlecruiser: { hull: 0x4e555f, plate: 0x9ea6b1, dark: 0x2c3138, accent: 0x3b4656, glow: [0.45, 1.9, 3.8], eng: [0.5, 2.0, 3.8], win: [3.4, 1.9, 0.6] },
  fleetcarrier:  { hull: 0x50565f, plate: 0x9ca3ac, dark: 0x2e333a, accent: 0x5a6170, glow: [3.4, 2.1, 0.5], eng: [0.5, 1.9, 3.6], win: [3.4, 2.0, 0.6] },
  dreadnought:   { hull: 0x50555d, plate: 0xa3a8af, dark: 0x2e3238, accent: 0xa3262a, glow: [3.6, 1.6, 0.35], eng: [0.6, 1.8, 3.8], win: [3.6, 1.7, 0.4], emblem: 'frontier' },
  // faction variants (bottom row of the sheet)
  federation:    { hull: 0x5a6472, plate: 0xc9d2de, dark: 0x323a46, accent: 0x2f6fd6, glow: [0.4, 1.8, 3.6], eng: [0.45, 1.9, 3.6], win: [0.6, 1.9, 3.4], emblem: 'federation', variant: 'federation' },
  pirate:        { hull: 0x3e3437, plate: 0x8a8f96, dark: 0x241c1e, accent: 0xb3202a, glow: [3.4, 0.5, 0.3], eng: [3.4, 0.9, 0.4], win: [3.4, 0.6, 0.4], emblem: 'pirate', variant: 'pirate' },
  ashen:         { hull: 0x3d322b, plate: 0x8c8580, dark: 0x241d19, accent: 0xc4561c, glow: [3.6, 1.3, 0.3], eng: [3.6, 1.2, 0.3], win: [3.6, 1.4, 0.4], emblem: 'pirate', variant: 'pirate' },
  corporate:     { hull: 0x4b4e55, plate: 0x9a9da3, dark: 0x2a2c30, accent: 0xe0a81a, glow: [3.4, 2.4, 0.5], eng: [3.4, 2.0, 0.6], win: [3.4, 2.3, 0.7], emblem: 'corporate', variant: 'corporate' },
  mercenary:     { hull: 0x5d6168, plate: 0xb0b4ba, dark: 0x30333a, accent: 0x7d838c, glow: [1.2, 1.8, 3.4], eng: [1.0, 1.7, 3.6], win: [2.6, 2.4, 2.0], emblem: 'mercenary', variant: 'mercenary' },
  alien:         { hull: 0x2b2337, plate: 0x4f4168, dark: 0x1a1424, accent: 0x7a3fd0, glow: [2.0, 0.6, 3.8], eng: [2.2, 0.7, 3.8], win: [2.2, 0.8, 3.8], emblem: 'alien', variant: 'alien' },
};
export const FACTION_PAINT = { crimson: 'pirate', ashen: 'ashen', eclipse: 'corporate', iron: 'mercenary', void: 'alien', federation: 'federation', sentinel: 'corporate' };
export const PAINT_NAMES = { federation: 'Federation', pirate: 'Pirate Clans', ashen: 'Pirate Clans (Ashen)', corporate: 'Corporate', mercenary: 'Mercenary', alien: 'Alien / Exotic' };
export const schemeIds = () => Object.keys(SCHEMES);

// faction emblems (white on transparent) painted on armour blocks
const EMB = {};
function emblemTex(kind) {
  if (EMB[kind]) return EMB[kind];
  const c = document.createElement('canvas'); c.width = c.height = 256; const g = c.getContext('2d'); g.fillStyle = '#f2f2f2'; g.strokeStyle = '#f2f2f2'; g.lineJoin = 'round';
  const poly = (pts) => { g.beginPath(); pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.closePath(); g.fill(); };
  if (kind === 'frontier' || kind === 'federation') { // winged chevron (the sheet's Dreadnought crest)
    poly([[128, 222], [36, 70], [92, 92], [128, 40], [164, 92], [220, 70]]); g.globalCompositeOperation = 'destination-out'; poly([[128, 176], [84, 104], [128, 120], [172, 104]]); g.globalCompositeOperation = 'source-over';
    if (kind === 'federation') { g.beginPath(); g.arc(128, 128, 112, 0, Math.PI * 2); g.lineWidth = 12; g.stroke(); }
  } else if (kind === 'pirate') { g.beginPath(); g.arc(128, 110, 70, 0, Math.PI * 2); g.fill(); poly([[86, 150], [170, 150], [158, 214], [98, 214]]); g.globalCompositeOperation = 'destination-out'; g.beginPath(); g.arc(102, 110, 20, 0, 7); g.arc(154, 110, 20, 0, 7); g.fill(); poly([[128, 136], [116, 160], [140, 160]]); g.globalCompositeOperation = 'source-over'; g.lineWidth = 18; g.beginPath(); g.moveTo(30, 40); g.lineTo(226, 226); g.moveTo(226, 40); g.lineTo(30, 226); g.stroke(); }
  else if (kind === 'corporate') { g.lineWidth = 20; g.beginPath(); g.arc(128, 128, 96, 0.4, Math.PI * 2 - 0.4); g.stroke(); poly([[70, 150], [128, 70], [186, 150], [150, 150], [128, 118], [106, 150]]); }
  else if (kind === 'mercenary') { poly([[128, 20], [160, 100], [236, 128], [160, 156], [128, 236], [96, 156], [20, 128], [96, 100]]); g.globalCompositeOperation = 'destination-out'; g.beginPath(); g.arc(128, 128, 26, 0, 7); g.fill(); g.globalCompositeOperation = 'source-over'; }
  else { g.lineWidth = 22; g.lineCap = 'round'; for (const s of [-1, 0, 1]) { g.beginPath(); g.moveTo(128 + s * 60, 220); g.quadraticCurveTo(128 + s * 100, 120, 128 + s * 30, 30); g.stroke(); } }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return (EMB[kind] = t);
}

const HM = {};
export function hullMats(sid) {
  if (HM[sid]) return HM[sid];
  const S = SCHEMES[sid] || SCHEMES.federation; const T = hullTextures(); const base = materials();
  const std = (o) => new THREE.MeshStandardMaterial({ map: T.map, normalMap: T.normal, roughnessMap: T.rough, metalnessMap: T.rough, envMapIntensity: 1.25, normalScale: new THREE.Vector2(0.9, 0.9), ...o });
  const hdr = (a, k = 1) => new THREE.Color(a[0] * k, a[1] * k, a[2] * k); const wc = hdr(S.win, 0.3);
  const M = {
    H: std({ color: S.hull, metalness: 0.85, roughness: 0.66, emissive: wc, emissiveMap: T.windows, emissiveIntensity: 0.3 }),
    P: std({ color: S.plate, metalness: 0.55, roughness: 0.55 }),
    D: std({ color: S.dark, metalness: 0.95, roughness: 0.6 }),
    A: std({ color: S.accent, metalness: 0.35, roughness: 0.45, emissive: new THREE.Color(S.accent).multiplyScalar(0.08) }),
    G: new THREE.MeshBasicMaterial({ color: hdr(S.glow) }),
    Gs: new THREE.MeshBasicMaterial({ color: hdr(S.glow, 0.45) }),
    Wn: new THREE.MeshBasicMaterial({ color: hdr(S.win, 0.8) }),
    W: new THREE.MeshStandardMaterial({ color: 0x0a1620, metalness: 0.9, roughness: 0.08, emissive: hdr(S.glow, 0.25), emissiveIntensity: 1.0 }),
    E: std({ color: 0xf2f2f2, metalness: 0.2, roughness: 0.5, map: emblemTex(S.emblem || 'frontier'), normalMap: null, roughnessMap: null, metalnessMap: null, alphaTest: 0.5 }),
    R: base.red, hazard: base.hazard,
  };
  M.eng = hdr(S.eng); M.scheme = S; M.sid = sid;
  return (HM[sid] = M);
}

// ---------------------------------------------------------------- helpers (normalised hull space)
const sym = (half) => { const out = half.slice(); for (let i = half.length - 1; i >= 0; i--) { const [x, z] = half[i]; if (x > 1e-6) out.push([-x, z]); } return out; };
const tp = (pts, sx, sz = sx, dz = 0) => pts.map(([x, z]) => [x * sx, z * sz + dz]);
function stripZ(k, m, x, y, z0, z1, w = 0.05, h = 0.05) { k.box(m, w, h, Math.abs(z1 - z0), x, y, (z0 + z1) / 2); }
function lights(k, m, x, y, z0, z1, n, w = 0.05) { const d = (z1 - z0) / n; for (let i = 0; i < n; i++) k.box(m, w, w * 0.9, Math.abs(d) * 0.45, x, y, z0 + d * (i + 0.5)); }
function sides(fn) { fn(1); fn(-1); }
function greeble(k, rng, x0, x1, z0, z1, y, n, s) { k.det = true; k.dress(rng, x0, x1, z0, z1, y, n, s); k.det = false; }

// faction-variant bolt-ons (sheet bottom row)
function variantParts(k, M, v, H) {
  const w = Math.min(1.6, H.beam / H.len * 5); k.det = false;
  if (v === 'pirate') sides((sx) => { k.add(M.D, new THREE.ConeGeometry(0.07 * w + 0.05, 0.9, 4), sx * 0.35 * w, 0.35, 2.6, -Math.PI / 2.3, 0, sx * 0.3); k.add(M.A, new THREE.ConeGeometry(0.06 * w + 0.04, 0.7, 4), sx * 0.55 * w, 0.1, -2.2, -Math.PI / 2.6, 0, sx * 0.6); });
  else if (v === 'corporate') { sides((sx) => k.slab(M.A, [[sx * 0.3 * w, -2.2], [sx * 0.9 * w, -4.4], [sx * 0.75 * w, -4.6], [sx * 0.25 * w, -3.4]], 0.07, 0.62)); stripZ(k, M.G, 0, 0.5, 0.5, 3.2, 0.06, 0.04); }
  else if (v === 'mercenary') sides((sx) => { k.plate(M.P, 0.25 * w, 0.4, 2.4, sx * 0.95 * w, 0.05, 0.4); k.plate(M.D, 0.22 * w, 0.32, 1.6, sx * 0.98 * w, 0.05, -2.4); });
  else if (v === 'alien') sides((sx) => { const t = new THREE.TorusGeometry(1.5 * w, 0.06, 5, 20, Math.PI * 0.7); k.add(M.A, t, sx * 0.4 * w, 0.2, -0.4, Math.PI / 2, 0, sx > 0 ? -0.9 : Math.PI - 2.2); k.add(M.G, new THREE.SphereGeometry(0.1, 8, 6), sx * 1.55 * w, 0.2, 0.9); });
  else if (v === 'federation') { k.slab(M.A, [[0, 2.4], [0.5 * w, 1.2], [0.5 * w, 0.9], [0, 1.9], [-0.5 * w, 0.9], [-0.5 * w, 1.2]], 0.05, 0.52); }
}

// ---------------------------------------------------------------- the fifteen builders (return hardpoints, pd, bays in normalised space)
const B = {};
B.scout = (k, M, r) => {
  k.slab(M.P, sym([[0, 5], [0.32, 3.6], [0.62, 1.4], [0.8, -1.0], [0.85, -3.6], [0.6, -4.8]]), 0.75, 0);
  k.slab(M.A, sym([[0, 4.7], [0.2, 3.6], [0.42, 1.6], [0.5, -0.6], [0.3, -1.4]]), 0.12, 0.42);
  k.sphere(M.W, 0.32, 0, 0.42, 2.0, 1, 0.75, 2.6);
  k.plate(M.H, 1.0, 0.28, 3.0, 0, 0.42, -2.6);
  sides((sx) => {
    k.slab(M.P, [[sx * 0.75, 0.6], [sx * 3.1, -2.2], [sx * 3.25, -3.3], [sx * 0.8, -2.2]], 0.16, -0.05);
    k.slab(M.A, [[sx * 2.4, -1.6], [sx * 3.1, -2.2], [sx * 3.25, -3.3], [sx * 2.55, -2.75]], 0.2, -0.05);
    k.slab(M.G, [[sx * 0.9, 0.35], [sx * 2.6, -1.45], [sx * 2.62, -1.6], [sx * 0.92, 0.15]], 0.06, 0.05);
    k.zcyl(M.H, 0.3, 0.36, 3.2, 10, sx * 1.0, -0.05, -2.2); k.zcyl(M.D, 0.24, 0.24, 0.1, 10, sx * 1.0, -0.05, -0.6);
    k.slab(M.A, [[sx * 0.55, 2.9], [sx * 1.35, 2.0], [sx * 1.35, 1.75], [sx * 0.6, 2.2]], 0.08, 0.1);
    k.box(M.P, 0.08, 0.8, 1.2, sx * 0.55, 0.6, -3.7, 0, 0, sx * -0.3);
    k.engine(sx * 1.0, -0.05, -3.9, 0.3, 0.5);
  });
  k.engine(0, 0.1, -4.75, 0.36, 0.55); greeble(k, r, -0.35, 0.35, -3.8, -1.4, 0.58, 5, 0.18);
  k.navLights(3.2, 0, -2.9, -4.9);
  return { hard: [{ x: 0, y: 0.55, z: 0.5, size: 1.5 }, { x: 1.9, y: 0.12, z: -1.6, size: 1.1 }, { x: -1.9, y: 0.12, z: -1.6, size: 1.1 }] };
};
B.interceptor = (k, M, r) => {
  k.slab(M.H, sym([[0, 5], [0.25, 3.4], [0.55, 1.2], [0.75, -1.5], [0.7, -4.2], [0.45, -5]]), 0.6, 0);
  k.slab(M.A, sym([[0, 4.8], [0.18, 3.4], [0.42, 1.2], [0.55, -1.2], [0.45, -3.6]]), 0.1, 0.36);
  sides((sx) => { k.box(M.P, 0.08, 0.04, 3.2, sx * 0.24, 0.43, 0.8); });
  k.sphere(M.W, 0.26, 0, 0.42, 1.2, 1, 0.75, 2.4);
  sides((sx) => {
    k.slab(M.H, [[sx * 0.6, 0.4], [sx * 2.8, -3.4], [sx * 2.9, -4.2], [sx * 0.7, -2.6]], 0.14, 0);
    k.slab(M.A, [[sx * 1.2, -0.6], [sx * 2.6, -3.2], [sx * 2.75, -3.9], [sx * 1.3, -1.7]], 0.17, 0);
    k.slab(M.P, [[sx * 1.5, -1.6], [sx * 2.2, -2.6], [sx * 2.25, -2.85], [sx * 1.55, -1.85]], 0.19, 0);
    k.slab(M.H, [[sx * 0.5, 1.6], [sx * 1.15, 0.2], [sx * 1.1, -0.6], [sx * 0.6, 0.2]], 0.2, -0.1);
    k.slab(M.G, [[sx * 0.62, 0.2], [sx * 2.6, -3.0], [sx * 2.62, -3.15], [sx * 0.64, 0.0]], 0.05, 0.08);
    k.box(M.A, 0.08, 1.0, 1.4, sx * 0.55, 0.6, -3.8, 0, 0, -sx * 0.45);
    k.zcyl(M.D, 0.05, 0.05, 1.4, 6, sx * 0.62, 0, 1.6);
    k.engine(sx * 0.42, 0, -4.85, 0.26, 0.5);
  });
  greeble(k, r, -0.3, 0.3, -3.6, -1.6, 0.36, 4, 0.16); k.navLights(2.9, 0, -4.2, -5);
  return { hard: [{ x: 0.85, y: 0.2, z: 0.0, size: 1.15 }, { x: -0.85, y: 0.2, z: 0.0, size: 1.15 }, { x: 0, y: 0.45, z: -2.4, size: 1.0 }] };
};
B.strike = (k, M, r) => {
  k.slab(M.P, sym([[0, 5], [0.35, 3.6], [0.75, 1.5], [0.95, -1.5], [0.85, -4.4]]), 0.7, 0);
  k.slab(M.A, sym([[0, 4.6], [0.28, 3.5], [0.6, 1.4], [0.7, -1.0], [0.4, -1.6]]), 0.12, 0.42);
  k.sphere(M.W, 0.3, 0, 0.45, 1.8, 1, 0.75, 2.2);
  sides((sx) => {
    k.slab(M.A, [[sx * 0.9, 0.6], [sx * 3.0, -1.6], [sx * 3.4, -2.6], [sx * 0.95, -2.2]], 0.16, -0.1);
    k.slab(M.D, [[sx * 1.6, -0.3], [sx * 2.4, -1.1], [sx * 2.5, -1.45], [sx * 1.65, -0.75]], 0.19, -0.1);
    k.box(M.A, 0.1, 0.9, 1.2, sx * 3.3, -0.45, -2.2, 0, 0, sx * 0.3);
    k.zcyl(M.A, 0.42, 0.48, 3.6, 12, sx * 0.95, 0.75, -1.6); k.zcyl(M.D, 0.36, 0.36, 0.12, 12, sx * 0.95, 0.75, 0.2);
    stripZ(k, M.G, sx * 1.42, 0.75, -2.8, -0.6, 0.04, 0.08); k.engine(sx * 0.95, 0.75, -3.4, 0.4, 0.6);
    k.slab(M.A, [[sx * 0.6, 3.4], [sx * 1.5, 2.6], [sx * 1.5, 2.3], [sx * 0.65, 2.7]], 0.08, 0.1);
  });
  k.engine(0, 0, -4.45, 0.3, 0.5); greeble(k, r, -0.4, 0.4, -3.6, -1.8, 0.5, 5, 0.18); k.navLights(3.4, -0.1, -2.6, -4.5);
  return { hard: [{ x: 0, y: 0.55, z: 3.0, size: 1.1 }, { x: 2.1, y: 0.1, z: -1.2, size: 1.05 }, { x: -2.1, y: 0.1, z: -1.2, size: 1.05 }] };
};
B.bomber = (k, M, r) => {
  k.slab(M.H, sym([[0, 4.2], [0.6, 3.4], [1.1, 0.8], [1.2, -2.6], [0.9, -4.6]]), 0.95, 0);
  k.slab(M.A, sym([[0, 3.9], [0.45, 3.2], [0.85, 0.8], [0.9, -2.0], [0.5, -2.6]]), 0.14, 0.52);
  k.sphere(M.W, 0.32, 0, 0.55, 2.4, 1, 0.7, 1.8);
  sides((sx) => {
    k.slab(M.H, [[sx * 1.1, 1.0], [sx * 2.6, 4.6], [sx * 3.0, 4.7], [sx * 3.4, -0.4], [sx * 3.7, -2.8], [sx * 1.2, -2.4]], 0.35, -0.05);
    k.slab(M.A, [[sx * 2.2, 3.4], [sx * 2.75, 4.35], [sx * 3.05, 4.4], [sx * 3.3, -0.2], [sx * 2.5, 0.6]], 0.4, -0.05);
    k.slab(M.P, [[sx * 1.4, -0.9], [sx * 3.3, -1.3], [sx * 3.45, -2.3], [sx * 1.4, -1.9]], 0.4, -0.05);
    k.slab(M.G, [[sx * 1.25, 1.2], [sx * 2.6, 4.3], [sx * 2.7, 4.3], [sx * 1.35, 1.0]], 0.05, 0.16);
    for (const z of [0.2, -0.9]) { k.zcyl(M.D, 0.22, 0.22, 1.2, 8, sx * 2.2, -0.4, z); k.sphere(M.P, 0.22, sx * 2.2, -0.4, z + 0.62, 1, 1, 1.4, 8, 6); }
    k.engine(sx * 0.9, 0, -4.35, 0.3, 0.5);
  });
  k.engine(0, 0.05, -4.6, 0.36, 0.55); k.hazard(1.0, 0.05, 0.4, 0, 0.6, -2.0); greeble(k, r, -0.6, 0.6, -3.8, -0.4, 0.52, 6, 0.2); k.navLights(3.6, 0, -2.6, -4.7);
  return { hard: [{ x: 0, y: 0.7, z: 0.6, size: 1.3 }, { x: 2.7, y: 0.25, z: 2.2, size: 1.0 }, { x: -2.7, y: 0.25, z: 2.2, size: 1.0 }] };
};
B.corvette = (k, M, r) => {
  k.slab(M.H, sym([[0, 5], [0.5, 3.8], [1.1, 1.5], [1.3, -2.5], [1.15, -5]]), 0.9, 0);
  k.slab(M.P, sym([[0, 4.4], [0.4, 3.4], [0.85, 1.2], [0.95, -2.2], [0.8, -4.2]]), 0.4, 0.6);
  sides((sx) => {
    k.box(M.A, 0.06, 0.25, 6, sx * 1.27, 0.1, -0.3);
    k.plate(M.H, 0.8, 0.7, 5.2, sx * 1.75, -0.05, -1.8); k.box(M.A, 0.82, 0.12, 3.6, sx * 1.75, 0.38, -1.6);
    stripZ(k, M.G, sx * 2.17, 0.0, -4.0, 0.4, 0.05, 0.08); lights(k, M.Wn, sx * 1.33, 0.25, 2.6, -0.6, 6, 0.06);
    k.engine(sx * 1.75, -0.05, -4.45, 0.36, 0.6); k.box(M.P, 0.08, 0.7, 0.9, sx * 0.6, 1.0, -3.8, 0, 0, -sx * 0.2);
  });
  k.plate(M.H, 1.1, 0.45, 1.6, 0, 0.95, -0.6); k.box(M.W, 0.8, 0.14, 0.12, 0, 1.08, 0.2); k.plate(M.A, 0.7, 0.18, 1.6, 0, 0.88, 2.2);
  k.engine(0, 0.1, -5.0, 0.42, 0.6); k.antenna(0.3, 1.15, -1.0, 0.6); greeble(k, r, -0.7, 0.7, -4, 1.8, 0.82, 12, 0.22); k.navLights(2.2, 0, -1.8, -5.0);
  return { hard: [{ x: 0, y: 0.85, z: 3.0, size: 1.2 }, { x: 1.75, y: 0.4, z: 0.4, size: 1.0 }, { x: -1.75, y: 0.4, z: 0.4, size: 1.0 }, { x: 0, y: 1.2, z: -2.0, size: 1.0 }], pd: [{ x: 0.9, y: 0.85, z: -3.2, size: 0.55 }, { x: -0.9, y: 0.85, z: -3.2, size: 0.55 }] };
};
B.gunship = (k, M, r) => {
  k.slab(M.H, sym([[0, 4.6], [0.9, 4.2], [1.35, 2.0], [1.5, -2.4], [1.3, -5]]), 1.1, 0);
  k.slab(M.P, sym([[0, 4.5], [0.85, 4.05], [1.2, 2.2], [1.25, 0.8], [0, 0.8]]), 0.3, 0.6);
  k.slab(M.A, sym([[0, 0.8], [1.25, 0.8], [1.3, -2.2], [1.0, -4.2], [0, -4.2]]), 0.3, 0.6);
  sides((sx) => {
    k.slab(M.H, [[sx * 1.4, 1.6], [sx * 3.0, 0.4], [sx * 3.0, -1.4], [sx * 1.4, -2.0]], 0.35, -0.1);
    k.slab(M.A, [[sx * 1.6, 1.2], [sx * 2.8, 0.2], [sx * 2.8, -1.1], [sx * 1.6, -1.5]], 0.4, -0.1);
    k.zcyl(M.D, 0.28, 0.32, 2.6, 10, sx * 2.6, -0.05, 0.6); for (const dx of [-0.12, 0.12]) k.zcyl(M.D, 0.07, 0.07, 1.4, 6, sx * 2.6 + dx, -0.05, 2.4);
    stripZ(k, M.G, sx * 1.52, 0.15, -4.2, 1.8, 0.05, 0.07); lights(k, M.Wn, sx * 1.42, 0.35, 3.4, 0.2, 5, 0.06);
    k.engine(sx * 0.8, 0, -5.05, 0.42, 0.7);
  });
  k.zcyl(M.D, 0.18, 0.22, 2.2, 10, 0, -0.35, 4.4); k.plate(M.P, 1.0, 0.5, 1.4, 0, 1.0, -0.6); k.box(M.W, 0.7, 0.14, 0.1, 0, 1.12, 0.1);
  k.engine(0, 0.25, -5.0, 0.3, 0.6); greeble(k, r, -0.9, 0.9, -4.0, -1.4, 0.82, 10, 0.24); k.navLights(3.0, 0, -0.4, -5.0);
  return { hard: [{ x: 0.7, y: 0.8, z: 2.6, size: 1.25 }, { x: -0.7, y: 0.8, z: 2.6, size: 1.25 }, { x: 0, y: 1.3, z: -1.6, size: 1.4 }, { x: 2.6, y: 0.35, z: -0.6, size: 0.95 }, { x: -2.6, y: 0.35, z: -0.6, size: 0.95 }] };
};
B.engineer = (k, M, r) => {
  k.plate(M.H, 1.0, 0.8, 9.0, 0, 0, -0.2); k.plate(M.P, 1.7, 1.1, 1.9, 0, 0.2, 3.7); k.box(M.W, 1.2, 0.18, 0.1, 0, 0.55, 4.66); k.box(M.A, 1.72, 0.18, 0.4, 0, 0.78, 3.4);
  for (const z of [1.4, -1.6]) sides((sx) => {
    k.zcyl(M.P, 0.75, 0.75, 2.4, 14, sx * 1.45, 0.1, z); k.zcyl(M.A, 0.79, 0.79, 0.34, 14, sx * 1.45, 0.1, z + 0.6); k.zcyl(M.D, 0.55, 0.62, 0.2, 14, sx * 1.45, 0.1, z - 1.3);
    k.box(M.H, 0.8, 0.22, 0.5, sx * 0.85, 0.1, z); lights(k, M.Wn, sx * 2.21, 0.1, z + 0.9, z - 0.9, 4, 0.05);
  });
  sides((sx) => { k.box(M.D, 0.12, 0.12, 2.2, sx * 0.6, 0.6, 4.4); k.box(M.A, 0.3, 0.12, 0.3, sx * 0.6, 0.6, 5.4); k.box(M.A, 0.12, 0.35, 0.12, sx * 0.6, 0.45, 5.45); k.engine(sx * 0.55, 0, -4.9, 0.35, 0.6); });
  k.plate(M.H, 1.8, 1.0, 1.2, 0, 0, -4.2); k.dish(0, 0.45, -2.6, 0.6); stripZ(k, M.G, 0, 0.42, -3.6, 2.6, 0.08, 0.05); greeble(k, r, -0.4, 0.4, -3.4, 2.4, 0.42, 8, 0.2); k.navLights(2.2, 0.1, 1.4, -4.8);
  return { hard: [{ x: 0, y: 0.75, z: 2.4, size: 1.1 }, { x: 0, y: 0.5, z: -0.2, size: 1.1 }, { x: 0, y: 0.6, z: -3.6, size: 0.9 }] };
};
B.explorer = (k, M, r) => {
  k.slab(M.P, sym([[0, 5], [0.35, 3.8], [0.75, 1.6], [0.9, -1.6], [0.75, -4.4]]), 0.8, 0);
  k.slab(M.A, sym([[0, 4.6], [0.25, 3.7], [0.5, 1.6], [0.55, 0.4]]), 0.12, 0.45); k.sphere(M.W, 0.3, 0, 0.45, 2.4, 1, 0.75, 2.2);
  sides((sx) => { k.slab(M.P, [[sx * 0.8, 0.2], [sx * 1.9, -2.0], [sx * 1.9, -2.8], [sx * 0.8, -2.2]], 0.14, 0); k.slab(M.A, [[sx * 1.6, -1.6], [sx * 1.9, -2.0], [sx * 1.9, -2.8], [sx * 1.6, -2.6]], 0.18, 0); k.engine(sx * 0.5, 0, -4.55, 0.32, 0.55); k.box(M.H, 1.5, 0.12, 0.22, sx * 1.55, 0.3, -0.6); });
  const ring = new THREE.TorusGeometry(2.25, 0.13, 8, 56); k.add(M.P, ring, 0, 0.3, -0.6, -0.95); k.add(M.G, new THREE.TorusGeometry(2.12, 0.035, 4, 56), 0, 0.3, -0.6, -0.95);
  k.add(M.A, new THREE.TorusGeometry(2.25, 0.15, 6, 56, 0.8), 0, 0.3, -0.6, -0.95, 0, 1.2); k.add(M.A, new THREE.TorusGeometry(2.25, 0.15, 6, 56, 0.8), 0, 0.3, -0.6, -0.95, 0, 1.2 + Math.PI);
  k.dish(0, 0.45, 3.0, 0.42, 0.9); k.engine(0, 0.2, -4.7, 0.38, 0.55); stripZ(k, M.G, 0.62, 0.15, -3.8, 1.6, 0.04, 0.06); stripZ(k, M.G, -0.62, 0.15, -3.8, 1.6, 0.04, 0.06);
  greeble(k, r, -0.4, 0.4, -3.8, -1.6, 0.45, 6, 0.16); k.navLights(1.95, 0, -2.4, -4.7);
  return { hard: [{ x: 0, y: 0.55, z: 1.0, size: 0.8 }, { x: 0, y: 0.55, z: -3.0, size: 0.8 }] };
};
B.frigate = (k, M, r) => {
  k.slab(M.H, sym([[0, 5], [0.55, 4.0], [1.3, 1.6], [1.6, -1.2], [1.6, -4.0], [1.3, -5]]), 0.7, 0);
  k.slab(M.P, sym([[0, 4.0], [0.5, 3.2], [1.1, 1.2], [1.25, -3.8], [0.8, -4.4]]), 0.4, 0.55);
  k.plate(M.H, 1.6, 0.6, 3.2, 0, 0.95, -1.6); k.plate(M.P, 1.0, 0.5, 1.2, 0, 1.45, -1.0); k.box(M.W, 0.8, 0.12, 0.06, 0, 1.55, -0.38); k.plate(M.A, 1.2, 0.2, 1.6, 0, 0.82, 1.4);
  k.plate(M.D, 1.0, 0.5, 6, 0, -0.45, -0.8);
  sides((sx) => { k.box(M.A, 0.06, 0.18, 6, sx * 1.62, 0.05, -0.8); stripZ(k, M.G, sx * 1.64, -0.18, -4.6, 1.0, 0.04, 0.06); lights(k, M.Wn, sx * 1.62, 0.22, 1.2, -4.4, 10, 0.06); lights(k, M.Wn, sx * 0.81, 1.1, -0.2, -3.0, 5, 0.05);
    k.engine(sx * 0.9, 0, -5.05, 0.42, 0.6); k.box(M.H, 0.4, 0.3, 1.4, sx * 1.75, 0, -2.6); });
  k.engine(0, 0.1, -5.1, 0.5, 0.6); k.antenna(0, 1.7, -1.6, 0.9); k.antenna(0.3, 1.7, -1.3, 0.5, false);
  greeble(k, r, -1.0, 1.0, -4.2, 2.4, 0.78, 22, 0.2); k.navLights(1.65, 0, -2.0, -5.1);
  return { hard: [{ x: 0, y: 0.85, z: 2.6, size: 0.9 }, { x: 0, y: 1.3, z: -3.2, size: 0.85 }, { x: 0.8, y: 0.8, z: 0.4, size: 0.8 }, { x: -0.8, y: 0.8, z: 0.4, size: 0.8 }, { x: 0, y: 0.8, z: 3.7, size: 0.75 }, { x: 0.9, y: 0.8, z: -2.4, size: 0.7 }, { x: -0.9, y: 0.8, z: -2.4, size: 0.7 }],
    pd: [{ x: 1.2, y: 0.5, z: -3.5, size: 0.45 }, { x: -1.2, y: 0.5, z: -3.5, size: 0.45 }] };
};
B.destroyer = (k, M, r) => {
  k.slab(M.H, sym([[0, 5], [0.35, 3.8], [0.95, 1.0], [1.25, -1.5], [1.3, -4.2], [1.05, -5]]), 0.65, 0);
  k.slab(M.A, sym([[0, 4.7], [0.25, 3.7], [0.6, 1.8], [0.7, 1.2], [0, 1.2]]), 0.12, 0.38);
  k.slab(M.P, sym([[0, 3.4], [0.6, 1.0], [0.95, -1.2], [1.0, -4.0], [0.6, -4.5]]), 0.35, 0.5);
  k.plate(M.H, 0.9, 0.9, 1.6, 0, 1.05, -2.0); k.plate(M.P, 0.7, 0.4, 0.9, 0, 1.65, -1.8); k.plate(M.A, 0.72, 0.1, 0.92, 0, 1.9, -1.8); k.box(M.W, 0.6, 0.1, 0.05, 0, 1.6, -1.33);
  k.box(M.D, 0.25, 0.25, 5, 0, 0.75, 0.6);
  sides((sx) => { k.box(M.A, 0.05, 0.12, 7.4, sx * 1.22, 0.12, -0.6, 0, sx * 0.04, 0); k.box(M.A, 0.3, 0.06, 2.6, sx * 0.72, 0.7, -2.6); stripZ(k, M.G, sx * 1.29, -0.15, -4.6, -0.4, 0.04, 0.05); lights(k, M.Wn, sx * 1.27, 0.25, 0.4, -4.4, 10, 0.05);
    k.engine(sx * 0.65, 0, -5.05, 0.36, 0.6); k.plate(M.H, 0.35, 0.3, 1.6, sx * 1.3, -0.05, -3.2); });
  k.engine(0, 0.05, -5.1, 0.42, 0.6); k.antenna(0, 1.95, -2.1, 0.8); k.antenna(0.25, 1.95, -1.6, 0.5, false);
  greeble(k, r, -0.8, 0.8, -4.4, 1.2, 0.68, 22, 0.17); k.navLights(1.35, 0, -2.6, -5.1);
  return { hard: [{ x: 0, y: 0.8, z: 3.0, size: 0.8 }, { x: 0, y: 0.85, z: 1.7, size: 0.8 }, { x: 0.7, y: 0.75, z: -0.6, size: 0.7 }, { x: -0.7, y: 0.75, z: -0.6, size: 0.7 }, { x: 0, y: 1.95, z: -1.9, size: 0.55 }, { x: 0.7, y: 0.75, z: -3.8, size: 0.6 }, { x: -0.7, y: 0.75, z: -3.8, size: 0.6 }],
    pd: [{ x: 0.95, y: 0.5, z: 0.8, size: 0.4 }, { x: -0.95, y: 0.5, z: 0.8, size: 0.4 }] };
};
B.icarrier = (k, M, r) => {
  k.slab(M.H, sym([[0, 5], [0.9, 4.2], [1.6, 2.2], [1.75, -1.6], [1.7, -4.4], [1.3, -5]]), 0.8, 0);
  k.slab(M.P, sym([[0, 4.6], [0.8, 3.9], [1.3, 2.0], [1.35, -1.6], [0.9, -2.0]]), 0.12, 0.46);
  stripZ(k, M.G, 0, 0.53, -1.4, 4.2, 0.05, 0.03); sides((sx) => { stripZ(k, M.G, sx * 1.25, 0.53, -1.2, 1.9, 0.04, 0.03); lights(k, M.G, sx * 0.4, 0.53, 4.2, -1.2, 9, 0.05); });
  k.box(M.D, 1.6, 0.35, 0.25, 0, 0.25, 4.45); k.hazard(1.4, 0.04, 0.25, 0, 0.53, 3.9);
  sides((sx) => { k.plate(M.H, 0.7, 0.6, 3.6, sx * 1.95, 0, 0.2); k.box(M.D, 0.5, 0.35, 0.12, sx * 1.95, 0.0, 2.03); lights(k, M.Wn, sx * 2.31, 0.1, 1.8, -1.4, 7, 0.06); stripZ(k, M.G, sx * 1.76, -0.18, -4.2, -1.8, 0.05, 0.06);
    k.engine(sx * 1.1, 0, -5.0, 0.42, 0.6); k.engine(sx * 0.4, 0, -5.05, 0.36, 0.6); });
  k.plate(M.H, 1.0, 0.9, 2.0, 0.75, 0.9, -2.8); k.plate(M.P, 0.7, 0.45, 1.1, 0.75, 1.45, -2.9); k.box(M.W, 0.5, 0.1, 0.06, 0.75, 1.5, -2.33); k.antenna(0.75, 1.68, -3.1, 0.7);
  k.plate(M.A, 1.4, 0.2, 2.2, -0.6, 0.5, -3.2); greeble(k, r, -1.4, 1.4, -4.6, -2.2, 0.42, 22, 0.2); k.navLights(2.3, 0, 0.2, -5.0);
  return { hard: [{ x: 0.75, y: 1.5, z: -3.6, size: 0.6 }, { x: -1.0, y: 0.7, z: -3.6, size: 0.65 }, { x: 1.4, y: 0.6, z: -3.9, size: 0.55 }, { x: -1.4, y: 0.6, z: -1.8, size: 0.5 }, { x: 1.6, y: 0.6, z: 3.0, size: 0.45 }, { x: -1.6, y: 0.6, z: 3.0, size: 0.45 }],
    pd: [{ x: 1.95, y: 0.4, z: 1.4, size: 0.35 }, { x: -1.95, y: 0.4, z: 1.4, size: 0.35 }, { x: 1.95, y: 0.4, z: -1.2, size: 0.35 }, { x: -1.95, y: 0.4, z: -1.2, size: 0.35 }],
    bays: [{ x: 0, y: 0.3, z: 4.6 }, { x: 1.95, y: 0, z: 2.1 }, { x: -1.95, y: 0, z: 2.1 }] };
};
B.cruiser = (k, M, r) => {
  k.slab(M.H, sym([[0, 5], [0.7, 4.2], [1.2, 2.4], [1.4, -0.5], [1.38, -3.8], [1.1, -5]]), 0.75, 0);
  k.slab(M.P, sym([[0, 4.2], [0.6, 3.2], [1.0, 1.0], [1.05, -3.6], [0.7, -4.4]]), 0.35, 0.55);
  sides((sx) => { for (let i = 0; i < 5; i++) k.plate(i % 2 ? M.P : M.H, 0.35, 0.55, 1.5, sx * 1.36, 0.08, 3.0 - i * 1.65, sx * 0.02);
    stripZ(k, M.G, sx * 1.44, -0.22, -4.6, 2.6, 0.05, 0.06); stripZ(k, M.G, sx * 1.07, 0.74, -3.6, 1.0, 0.04, 0.04); lights(k, M.Wn, sx * 1.41, 0.32, 3.2, -4.0, 14, 0.05);
    k.box(M.A, 0.3, 0.06, 3.0, sx * 0.7, 0.75, 1.6); k.engine(sx * 0.75, 0, -5.05, 0.42, 0.6); });
  k.plate(M.H, 1.3, 0.45, 4.5, 0, 0.85, -1.3); k.plate(M.H, 0.9, 0.6, 1.4, 0, 1.3, -1.6); k.plate(M.P, 0.6, 0.35, 0.8, 0, 1.75, -1.5); k.plate(M.A, 0.62, 0.08, 0.82, 0, 1.95, -1.5); k.box(M.W, 0.55, 0.1, 0.05, 0, 1.75, -1.08);
  k.engine(0, 0.15, -5.1, 0.5, 0.6); k.antenna(0, 2.0, -1.6, 0.8); k.antenna(-0.25, 2.0, -1.8, 0.5, false); k.plate(M.D, 1.2, 0.5, 5, 0, -0.45, -0.6);
  greeble(k, r, -0.95, 0.95, -4.2, 3.2, 0.78, 30, 0.17); k.navLights(1.45, 0, -2.4, -5.1);
  return { hard: [{ x: 0, y: 0.85, z: 3.0, size: 0.65 }, { x: 0, y: 0.8, z: 1.9, size: 0.65 }, { x: 0.75, y: 0.75, z: 0.6, size: 0.6 }, { x: -0.75, y: 0.75, z: 0.6, size: 0.6 }, { x: 0.6, y: 1.1, z: -3.1, size: 0.6 }, { x: -0.6, y: 1.1, z: -3.1, size: 0.6 }, { x: 0, y: 2.0, z: -2.1, size: 0.45 }, { x: 0, y: 1.1, z: -3.9, size: 0.5 }],
    pd: [{ x: 1.15, y: 0.55, z: 2.4, size: 0.32 }, { x: -1.15, y: 0.55, z: 2.4, size: 0.32 }, { x: 1.15, y: 0.55, z: -3.6, size: 0.32 }, { x: -1.15, y: 0.55, z: -3.6, size: 0.32 }] };
};
B.battlecruiser = (k, M, r) => {
  k.slab(M.H, sym([[0, 5], [0.5, 4.4], [0.95, 3.0], [1.18, 0.5], [1.2, -3.5], [1.1, -5]]), 0.6, 0);
  k.slab(M.P, sym([[0, 4.4], [0.55, 3.6], [0.9, 1.6], [0.95, -4.0], [0.7, -4.6]]), 0.32, 0.45);
  const blocks = [[0.9, 0.36, 1.5, 0, 2.8], [1.4, 0.4, 1.6, 0, 1.0], [1.6, 0.42, 1.8, 0, -0.9], [1.5, 0.46, 1.6, 0, -2.9], [1.2, 0.4, 1.0, 0, -4.2]];
  blocks.forEach(([w, h, d, x, z], i) => { k.plate(i % 2 ? M.H : M.P, w, h, d, x, 0.72, z); lights(k, M.G, w / 2 + 0.01, 0.72, z + d / 2 - 0.1, z - d / 2 + 0.1, 6, 0.04); lights(k, M.G, -w / 2 - 0.01, 0.72, z + d / 2 - 0.1, z - d / 2 + 0.1, 6, 0.04); });
  k.plate(M.H, 0.8, 0.7, 1.4, 0, 1.15, -2.3); k.plate(M.P, 0.55, 0.4, 0.8, 0, 1.6, -2.3); k.box(M.W, 0.5, 0.08, 0.05, 0, 1.6, -1.88); k.plate(M.A, 0.82, 0.08, 1.42, 0, 1.52, -2.3);
  sides((sx) => { k.plate(M.H, 0.35, 0.4, 2.4, sx * 1.25, 0.0, 1.2); k.plate(M.H, 0.35, 0.4, 2.4, sx * 1.27, 0.0, -1.9); stripZ(k, M.G, sx * 1.22, -0.12, -4.8, 3.0, 0.03, 0.04);
    lights(k, M.Wn, sx * 1.2, 0.18, 2.8, -4.6, 22, 0.035); lights(k, M.G, sx * 1.44, 0.05, 2.3, 0.1, 6, 0.04); lights(k, M.G, sx * 1.46, 0.05, -0.8, -3.0, 6, 0.04);
    k.engine(sx * 0.35, 0, -5.0, 0.28, 0.4); k.engine(sx * 0.85, 0, -4.95, 0.25, 0.4); k.antenna(sx * 0.3, 1.6, -2.6, 0.7, sx > 0); });
  k.plate(M.D, 1.0, 0.45, 6, 0, -0.38, -0.6); greeble(k, r, -0.9, 0.9, -4.6, 3.8, 0.64, 46, 0.12); k.navLights(1.3, 0, -2.0, -5.0);
  return { hard: [{ x: 0, y: 0.95, z: 3.4, size: 0.36 }, { x: 0, y: 0.95, z: 2.4, size: 0.36 }, { x: 0.45, y: 0.98, z: 1.0, size: 0.34 }, { x: -0.45, y: 0.98, z: 1.0, size: 0.34 }, { x: 0.5, y: 0.98, z: -0.6, size: 0.34 }, { x: -0.5, y: 0.98, z: -0.6, size: 0.34 }, { x: 0.45, y: 1.0, z: -3.4, size: 0.34 }, { x: -0.45, y: 1.0, z: -3.4, size: 0.34 }],
    pd: [{ x: 1.25, y: 0.3, z: 1.8, size: 0.2 }, { x: -1.25, y: 0.3, z: 1.8, size: 0.2 }, { x: 1.27, y: 0.3, z: -1.3, size: 0.2 }, { x: -1.27, y: 0.3, z: -1.3, size: 0.2 }, { x: 0.8, y: 0.5, z: 3.6, size: 0.18 }, { x: -0.8, y: 0.5, z: 3.6, size: 0.18 }] };
};
B.fleetcarrier = (k, M, r) => {
  k.slab(M.H, sym([[0, 5], [0.7, 4.6], [1.2, 3.2], [1.3, -3.6], [1.15, -5]]), 0.6, 0);
  k.slab(M.P, sym([[0, 4.9], [0.65, 4.5], [1.12, 3.2], [1.2, -2.6], [1.0, -3.4]]), 0.08, 0.36);
  stripZ(k, M.Gs, 0, 0.41, -2.8, 4.6, 0.04, 0.02); lights(k, M.Wn, 0.25, 0.41, 4.6, -2.8, 16, 0.03); lights(k, M.Wn, -0.25, 0.41, 4.6, -2.8, 16, 0.03);
  sides((sx) => { stripZ(k, M.Gs, sx * 1.12, 0.41, -2.6, 3.1, 0.03, 0.02); lights(k, M.Wn, sx * 1.31, 0.12, 3.0, -4.6, 26, 0.035); stripZ(k, M.Gs, sx * 1.3, -0.15, -4.8, 3.0, 0.03, 0.04);
    k.plate(M.H, 0.3, 0.42, 3.0, sx * 1.4, -0.02, 0.8); k.box(M.D, 0.25, 0.25, 0.08, sx * 1.4, -0.02, 2.31); k.engine(sx * 0.4, 0, -5.0, 0.3, 0.45); k.engine(sx * 0.9, 0, -4.95, 0.26, 0.45); });
  k.engine(0, 0.05, -5.05, 0.32, 0.45); k.hazard(1.2, 0.03, 0.18, 0, 0.42, 4.2); k.box(M.D, 1.0, 0.25, 0.12, 0, 0.2, 4.92);
  k.plate(M.H, 0.5, 0.8, 2.2, 0.88, 0.8, -2.0); k.plate(M.P, 0.4, 0.4, 1.2, 0.88, 1.35, -2.0); k.box(M.W, 0.36, 0.06, 0.04, 0.88, 1.4, -1.38); k.plate(M.A, 0.52, 0.06, 2.22, 0.88, 1.22, -2.0);
  k.antenna(0.88, 1.55, -2.3, 0.7); k.antenna(0.95, 1.55, -1.8, 0.45, false); k.plate(M.A, 1.0, 0.1, 1.4, -0.4, 0.42, -3.9);
  greeble(k, r, 0.5, 1.15, -4.4, 2.8, 0.42, 30, 0.1); greeble(k, r, -1.15, -0.5, -4.4, 2.8, 0.42, 20, 0.08); k.navLights(1.35, 0, 0.8, -5.0);
  return { hard: [{ x: 0.88, y: 1.55, z: -2.7, size: 0.3 }, { x: 0.88, y: 1.2, z: -1.0, size: 0.3 }, { x: -1.0, y: 0.45, z: -4.2, size: 0.32 }, { x: 1.0, y: 0.45, z: -4.4, size: 0.3 }, { x: -1.1, y: 0.45, z: 3.4, size: 0.26 }, { x: 1.1, y: 0.45, z: 3.4, size: 0.26 }],
    pd: [{ x: 1.4, y: 0.3, z: 1.8, size: 0.16 }, { x: -1.4, y: 0.3, z: 1.8, size: 0.16 }, { x: 1.4, y: 0.3, z: -0.4, size: 0.16 }, { x: -1.4, y: 0.3, z: -0.4, size: 0.16 }, { x: 1.2, y: 0.42, z: -3.0, size: 0.16 }, { x: -1.2, y: 0.42, z: -3.0, size: 0.16 }],
    bays: [{ x: 0.3, y: 0.4, z: 4.9 }, { x: -0.3, y: 0.4, z: 4.9 }, { x: 1.4, y: 0, z: 2.4 }, { x: -1.4, y: 0, z: 2.4 }] };
};
B.dreadnought = (k, M, r) => {
  // three stacked hull decks, sharp layered prow
  k.slab(M.H, sym([[0, 5], [0.45, 4.5], [0.9, 3.3], [1.15, 1.0], [1.25, -2.0], [1.2, -4.2], [1.0, -5]]), 0.7, 0);
  k.slab(M.D, sym([[0, 4.8], [0.4, 4.4], [0.85, 3.2], [1.08, 1.0], [1.16, -2.0], [1.1, -4.2], [0.9, -4.9]]), 0.25, -0.45);
  k.slab(M.H, sym([[0, 4.4], [0.5, 3.7], [0.9, 2.0], [1.0, -1.0], [0.95, -4.2], [0.7, -4.7]]), 0.32, 0.48);
  k.slab(M.P, sym([[0, 3.6], [0.4, 3.0], [0.62, 1.6], [0.66, -1.6], [0.6, -4.3], [0, -4.3]]), 0.22, 0.72);
  k.slab(M.P, sym([[0, 4.75], [0.3, 4.3], [0.6, 3.4], [0.5, 3.1], [0, 3.9]]), 0.14, 0.62);
  // red armour panels (sheet colour blocking): sloped flank plates fore and aft + the crest block
  sides((sx) => {
    k.slab(M.A, [[sx * 0.42, 3.4], [sx * 0.9, 2.3], [sx * 1.0, 0.4], [sx * 0.66, 0.6], [sx * 0.6, 2.2]], 0.16, 0.66);
    k.slab(M.A, [[sx * 0.68, -0.4], [sx * 1.0, -0.7], [sx * 0.97, -2.2], [sx * 0.68, -1.9]], 0.16, 0.66);
    k.slab(M.A, [[sx * 1.16, 1.6], [sx * 1.25, -0.4], [sx * 1.22, -1.6], [sx * 1.12, -0.2]], 0.5, 0.05);
    for (let i = 0; i < 6; i++) k.plate(i % 2 ? M.H : M.P, 0.12, 0.38, 0.62, sx * 1.24, 0.05, 3.0 - i * 0.62 - (i > 2 ? 2.6 : 0), sx * 0.02);
    k.plate(M.D, 0.2, 0.3, 2.6, sx * 0.86, 0.5, -3.0);
    stripZ(k, M.Wn, sx * 1.255, 0.2, -4.3, 3.0, 0.02, 0.025); stripZ(k, M.Wn, sx * 1.255, -0.08, -4.2, 2.4, 0.02, 0.02); stripZ(k, M.G, sx * 0.995, 0.55, -4.0, 1.8, 0.02, 0.025);
    lights(k, M.Wn, sx * 1.255, 0.32, 2.8, -4.3, 34, 0.025); lights(k, M.Wn, sx * 1.12, -0.32, 2.4, -4.4, 26, 0.022); lights(k, M.G, sx * 0.67, 0.84, 1.2, -4.2, 18, 0.022);
    k.engine(sx * 0.3, 0.05, -5.0, 0.26, 0.35); k.engine(sx * 0.75, 0.05, -4.9, 0.22, 0.35); k.engine(sx * 0.52, 0.42, -4.85, 0.16, 0.3);
    for (const z of [2.6, 0.9, -0.9, -2.7]) k.box(M.D, 0.9, 0.02, 0.03, sx * 0.48, 0.84, z); // deck trenches
  });
  k.plate(M.A, 0.95, 0.24, 1.35, 0, 0.9, -0.85); { const e = new THREE.PlaneGeometry(0.9, 0.9); e.rotateX(-Math.PI / 2); k.add(M.E, e, 0, 1.1, -0.85); }
  // stepped command superstructure with spires
  k.plate(M.H, 0.95, 0.42, 1.8, 0, 1.0, -2.75); k.plate(M.P, 0.7, 0.38, 1.2, 0, 1.38, -2.85); k.plate(M.A, 0.5, 0.26, 0.7, 0, 1.68, -2.95); k.plate(M.H, 0.32, 0.2, 0.45, 0, 1.9, -3.0);
  k.box(M.W, 0.62, 0.06, 0.03, 0, 1.42, -2.25); stripZ(k, M.Wn, 0.48, 1.05, -3.6, -1.9, 0.02, 0.03); stripZ(k, M.Wn, -0.48, 1.05, -3.6, -1.9, 0.02, 0.03);
  for (const [x, z, h] of [[0.22, -2.9, 1.2], [-0.26, -2.7, 0.95], [0, -3.1, 1.5], [0.42, -3.7, 0.8], [-0.42, -3.7, 0.7], [0.14, -2.3, 0.6], [-0.12, -3.4, 1.05]]) { k.cyl(M.D, 0.016, 0.04, h, 6, x, 1.7 + h / 2 - 0.3, z); k.box(M.D, 0.12, 0.02, 0.02, x, 1.7 + h * 0.6 - 0.3, z); k.lights.push({ x, y: 1.7 + h - 0.3, z, color: 0xff3030, mode: 'blink', size: 0.5 }); }
  k.plate(M.H, 0.5, 0.3, 0.7, 0, 0.92, 1.2); k.plate(M.P, 0.36, 0.2, 0.5, 0, 1.12, 1.2);
  // ventral keels / hanging decks
  for (const [z, d, h] of [[2.0, 1.2, 0.5], [0.2, 1.6, 0.7], [-1.8, 1.4, 0.8], [-3.6, 1.0, 0.55]]) { k.plate(M.D, 0.45, h, d, 0, -0.5 - h / 2 + 0.15, z); lights(k, M.Wn, 0.23, -0.5, z + d / 2 - 0.1, z - d / 2 + 0.1, 5, 0.02); }
  greeble(k, r, -0.62, 0.62, -4.2, 3.2, 0.84, 70, 0.08); greeble(k, r, -1.0, 1.0, -4.4, 3.6, 0.65, 50, 0.09); greeble(k, r, -0.45, 0.45, -3.5, -2.0, 1.2, 14, 0.06); k.navLights(1.3, 0, -1.0, -5.0);
  const hard = [[0, 0.95, 3.25, 0.29], [0.36, 0.92, 2.55, 0.275], [-0.36, 0.92, 2.55, 0.275], [0.42, 0.9, 1.3, 0.275], [-0.42, 0.9, 1.3, 0.275], [0.5, 0.88, -0.2, 0.275], [-0.5, 0.88, -0.2, 0.275], [0.42, 0.9, -1.6, 0.275], [-0.42, 0.9, -1.6, 0.275], [0, 2.0, -2.95, 0.232], [0.45, 0.86, -4.0, 0.261], [-0.45, 0.86, -4.0, 0.261]].map(([x, y, z, size]) => ({ x, y, z, size }));
  const pd = []; for (let i = 0; i < 5; i++) sides((sx) => pd.push({ x: sx * 1.15, y: 0.4, z: 2.4 - i * 1.55, size: 0.09 }));
  return { hard, pd, bays: [{ x: 1.25, y: 0, z: 0.3 }, { x: -1.25, y: 0, z: 0.3 }] };
};

// ---------------------------------------------------------------- build + cache
// opts: { scheme, turrets: 'enemy'|'none' (player turrets are mounted by the game), detail: true }
export function buildHull(id, opts = {}) {
  const H = HULLS[id] || HULLS.scout; const sid = opts.scheme || H.paint; const M = hullMats(sid); const S = H.len / 10;
  const k = new Kit(S); k.ch = H.rank >= 4 ? 0.1 : 0.2; k.pal = { hull: M.H, dark: M.D, orange: M.A, glowSoft: M.Gs }; k.core = [];
  const rng = mulberry(4000 + HULL_IDS.indexOf(id) * 131);
  const o = B[id](k, M, rng); const v = M.scheme.variant; if (v && opts.variant !== false) variantParts(k, M, v, H);
  const lo = k.buildLo(); const group = k.build(); group.name = 'hull:' + id;
  const sc = (p) => ({ ...p, x: p.x * S, y: p.y * S, z: p.z * S, size: (p.size || 1) * S });
  const hard = (o.hard || []).map(sc), pd = (o.pd || []).map(sc), bays = (o.bays || []).map(sc);
  if (opts.turrets === 'enemy') {
    const pal = { D: M.D, A: M.A, H: M.H }; const n = Math.max(1, Math.min(hard.length, H.slots + 2));
    for (let i = 0; i < n; i++) { const h = hard[i]; const tu = makeTurret(H.rank >= 4 ? 'cannon' : i % 2 ? 'laser' : 'cannon', h.size, pal); tu.position.set(h.x, h.y, h.z); tu.name = 'eturret'; group.add(tu); }
    for (const h of pd) { const tu = makeTurret('cannon', h.size, pal); tu.position.set(h.x, h.y, h.z); group.add(tu); }
  }
  const segs = hullSegs(H);
  return { group, lo, hardpoints: opts.turrets === 'enemy' ? hard.slice(0, Math.max(1, Math.min(hard.length, H.slots + 2))) : hard, pointDefense: pd, bays, engines: k.engines, length: H.len, radius: H.radius, bound: H.bound, beam: H.beam, segs, mass: H.mass, hull: id, scheme: sid, engColor: M.eng };
}
// hitbox: a chain of circles along the keel for long hulls (the bounding circle would be far too generous on a 720 m titan)
export function hullSegs(H) {
  if (H.len < 9 || H.len / H.beam < 1.6) return null;
  const r = H.beam * 0.5; const n = Math.max(2, Math.min(7, Math.ceil(H.len / (H.beam * 1.05)))); const z0 = -H.len / 2 + r * 0.9, z1 = H.len / 2 - r * 0.7; const out = [];
  for (let i = 0; i < n; i++) { const t = i / (n - 1); const z = z0 + (z1 - z0) * t; out.push({ z, r: r * (t > 0.85 ? 0.75 : 1) }); }
  return out;
}
export function playerPaintFor(id) { return HULLS[id] ? HULLS[id].paint : 'scout'; }

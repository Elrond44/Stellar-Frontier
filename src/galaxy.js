// Galaxy layer: named sectors (wedges in distance rings) owned by factions, threat, outposts, caches, liberation.
// Sits on top of the distance-ring SECTORS (which still drive asteroid density & minerals).
import { BOSS_LAIR } from './data.js?v=4';

export const FACTIONS = {
  crimson: { id: 'crimson', name: 'Crimson Marauders', short: 'CRIMSON', color: '#ff3b4a', rgb: [3.4, 0.35, 0.4], hull: 0x5c2428, desc: 'Brutal raiders: tougher hulls, heavier guns, more gunships.', tactic: 'Aggressive: +20% hull, +25% damage, gunship-heavy raids.' },
  void:    { id: 'void', name: 'Void Reavers', short: 'VOID', color: '#a05cff', rgb: [1.8, 0.6, 3.6], hull: 0x2e2442, desc: 'Ambush specialists who strike from cloaked approach vectors.', tactic: 'Ambush: cloaked until close, waves spawn nearby, shots drain energy.' },
  iron:    { id: 'iron', name: 'Iron Dominion', short: 'IRON', color: '#5b7cff', rgb: [0.8, 1.3, 3.6], hull: 0x3a4152, desc: 'Militarised pirates flying heavily armoured, shielded ships.', tactic: 'Fortress: +30% hull, +20% armor, energy shields, slower.' },
  eclipse: { id: 'eclipse', name: 'Eclipse Syndicate', short: 'ECLIPSE', color: '#f5d442', rgb: [3.4, 2.7, 0.5], hull: 0x4a4228, desc: 'Tech smugglers with strong shields and shield-breaker guns.', tactic: 'Tech: strong shields, shots deal +80% to your shields.' },
  ashen:   { id: 'ashen', name: 'Ashen Corsairs', short: 'ASHEN', color: '#ff8a2a', rgb: [3.6, 1.4, 0.3], hull: 0x4a3020, desc: 'Fast hit-and-run corsairs who attack from two sides.', tactic: 'Hit & run: +30% speed, lighter hulls, pincer waves.' },
};
export const FACTION_KEYS = Object.keys(FACTIONS);
export const NEUTRAL = { id: 'neutral', name: 'Unclaimed Space', short: 'NEUTRAL', color: '#8896a8', rgb: [1.4, 1.6, 1.8] };
export const LIBERATED = { id: 'liberated', name: 'Liberated', short: 'FREE', color: '#4fd2ff', rgb: [0.5, 2.2, 3.4] };
export const HAVEN_C = { id: 'haven', name: 'Frontier Haven', short: 'HAVEN', color: '#5dff98', rgb: [0.6, 3, 1.2] };

// faction insignia as unit-square path commands (canvas & SVG friendly)
export const INSIGNIA = {
  crimson: 'M0.5 0.05 L0.62 0.38 L0.95 0.38 L0.68 0.6 L0.8 0.95 L0.5 0.74 L0.2 0.95 L0.32 0.6 L0.05 0.38 L0.38 0.38 Z',
  void: 'M0.5 0.05 C0.85 0.2 0.95 0.55 0.5 0.95 C0.62 0.6 0.6 0.4 0.5 0.3 C0.4 0.4 0.38 0.6 0.5 0.95 C0.05 0.55 0.15 0.2 0.5 0.05 Z',
  iron: 'M0.5 0.05 L0.92 0.22 L0.86 0.62 L0.5 0.95 L0.14 0.62 L0.08 0.22 Z M0.5 0.25 L0.3 0.35 L0.33 0.58 L0.5 0.74 L0.67 0.58 L0.7 0.35 Z',
  eclipse: 'M0.5 0.05 A0.45 0.45 0 1 0 0.5 0.95 A0.45 0.45 0 1 0 0.5 0.05 Z M0.62 0.18 A0.33 0.33 0 1 1 0.62 0.82 A0.38 0.38 0 0 0 0.62 0.18 Z',
  ashen: 'M0.5 0.04 C0.6 0.3 0.85 0.4 0.78 0.7 C0.74 0.88 0.6 0.96 0.5 0.96 C0.4 0.96 0.26 0.88 0.22 0.7 C0.15 0.4 0.4 0.3 0.5 0.04 Z',
  neutral: 'M0.5 0.1 L0.9 0.5 L0.5 0.9 L0.1 0.5 Z',
  liberated: 'M0.5 0.05 L0.6 0.35 L0.92 0.35 L0.66 0.55 L0.76 0.88 L0.5 0.68 L0.24 0.88 L0.34 0.55 L0.08 0.35 L0.4 0.35 Z',
  haven: 'M0.5 0.08 L0.9 0.42 L0.78 0.92 L0.22 0.92 L0.1 0.42 Z',
};

export const RINGS = [
  { id: 'H', name: 'Haven', r0: 0, r1: 190, n: 1, off: 0 },
  { id: 'F', name: 'Frontier', r0: 190, r1: 400, n: 6, off: 0.18 },
  { id: 'R', name: 'Reach', r0: 400, r1: 650, n: 8, off: -0.12 },
  { id: 'M', name: 'Maw', r0: 650, r1: 1000, n: 10, off: 0.07 },
];
export const MAP_R = 1000;
const NAMES = {
  F: ['Cinder Drift', 'Halcyon Shoals', 'Ferro Expanse', 'Lantern Reach', 'Glasswater Belt', 'Sable Verge'],
  R: ['Redline Narrows', 'Kestrel Gap', 'Hollow Crown', 'Brimstone Lanes', 'Vesper Fault', 'Tidecaller Rift', 'Gilded Wake', 'Ironveil Run'],
  M: ['Dusk Anvil', 'Abyssal Choir', 'Starfall Deep', 'Obsidian Spiral', 'Gravemind Shelf', 'Nyx Corridor', 'Ember Throne', 'Shattered Halo', "Warlord's Maw", 'Phantom Tides'],
};
const TAU = Math.PI * 2;
const norm = (a) => ((a % TAU) + TAU) % TAU;
const BOSS_ANG = Math.atan2(BOSS_LAIR.z, BOSS_LAIR.x);
const F_START = BOSS_ANG - TAU / 10; // crimson wedge is centred on the warlord's lair
export function factionAtAngle(a) { return FACTION_KEYS[Math.floor(norm(a - F_START) / (TAU / 5)) % 5]; }
export const factionCenter = (fk) => F_START + (FACTION_KEYS.indexOf(fk) + 0.5) * TAU / 5;
function mulberry(seed) { let t = seed >>> 0; return () => { t += 0x6d2b79f5; let r = Math.imul(t ^ (t >>> 15), 1 | t); r ^= r + Math.imul(r ^ (r >>> 7), 61 | r); return ((r ^ (r >>> 14)) >>> 0) / 4294967296; }; }

// Build the static sector table once
export const GSECTORS = [];
for (const R of RINGS) {
  for (let i = 0; i < R.n; i++) {
    const a0 = R.off + (i / R.n) * TAU, a1 = R.off + ((i + 1) / R.n) * TAU, am = (a0 + a1) / 2;
    const id = R.id === 'H' ? 'H' : R.id + (i + 1);
    let fac = R.id === 'H' ? 'haven' : factionAtAngle(am);
    if (R.id === 'F' && (i === 1 || i === 4)) fac = 'neutral';
    const ringI = RINGS.indexOf(R);
    let threat = fac === 'haven' ? 0 : fac === 'neutral' ? 1 : ringI + 1;
    if (R.id === 'M' && fac !== 'neutral' && Math.abs(Math.atan2(Math.sin(am - factionCenter(fac)), Math.cos(am - factionCenter(fac)))) < TAU / 20 + 0.01) threat = 5;
    GSECTORS.push({ id, ring: R.id, ringI, idx: i, name: R.id === 'H' ? 'Frontier Haven' : NAMES[R.id][i], a0, a1, am, r0: R.r0, r1: R.id === 'M' ? 1e9 : R.r1, rm: R.id === 'H' ? 0 : (R.r0 + Math.min(R.r1, 1000)) / 2, faction: fac, threat });
  }
}
// home sectors (threat 5) by faction
for (const fk of FACTION_KEYS) { const cand = GSECTORS.filter((s) => s.ring === 'M' && s.faction === fk); if (!cand.some((s) => s.threat === 5) && cand.length) cand.sort((a, b) => Math.abs(norm(a.am - factionCenter(fk) + Math.PI) - Math.PI) - Math.abs(norm(b.am - factionCenter(fk) + Math.PI) - Math.PI))[0].threat = 5; }
export const SECTOR_BY_ID = Object.fromEntries(GSECTORS.map((s) => [s.id, s]));

export function gsectorAt(x, z) {
  const d = Math.hypot(x, z); const a = Math.atan2(z, x);
  for (const R of RINGS) {
    if (d >= R.r1 && R.id !== 'M') continue;
    if (R.id === 'H') return GSECTORS[0];
    const i = Math.floor(norm(a - R.off) / (TAU / R.n)) % R.n;
    return SECTOR_BY_ID[R.id + (i + 1)];
  }
  return GSECTORS[GSECTORS.length - 1];
}
export const isPirate = (sec) => FACTIONS[sec.faction] !== undefined;
const wedgePoint = (sec, rng, pad = 40) => { const da = sec.a1 - sec.a0; const r = sec.r0 + pad + rng() * (Math.min(sec.r1, 1000) - sec.r0 - pad * 2); const padA = Math.min(0.3, (pad + 10) / r); const a = sec.a0 + da * 0.5 + (rng() - 0.5) * Math.max(0.05, da - 2 * padA); return { x: Math.cos(a) * r, z: Math.sin(a) * r }; };

// Pirate outposts ("installations") — deterministic per sector
export function outposts(sec) {
  if (sec._out) return sec._out;
  const out = [];
  if (isPirate(sec)) {
    const n = sec.ring === 'F' ? 1 : sec.ring === 'R' ? 2 : 3; const rng = mulberry(sec.id.charCodeAt(0) * 977 + sec.idx * 131 + 5);
    for (let k = 0; k < n; k++) {
      let p, tries = 0;
      do { p = wedgePoint(sec, rng, 45); tries++; } while (tries < 30 && (Math.hypot(p.x - BOSS_LAIR.x, p.z - BOSS_LAIR.z) < 110 || out.some((o) => Math.hypot(o.x - p.x, o.z - p.z) < 90)));
      const gens = sec.faction === 'iron' ? 3 : 2; const turrets = 3 + Math.min(3, sec.threat - 1);
      out.push({ id: `${sec.id}-o${k}`, sector: sec.id, x: Math.round(p.x), z: Math.round(p.z), gens, turrets, name: `${FACTIONS[sec.faction].short} Outpost ${String.fromCharCode(65 + k)}` });
    }
  }
  sec._out = out; return out;
}
// Hidden caches
export function caches(sec) {
  if (sec._cache) return sec._cache;
  const out = []; if (sec.ring !== 'H') { const rng = mulberry(sec.idx * 7919 + sec.ringI * 104729 + 3); const n = 1 + (rng() < 0.5 ? 1 : 0); for (let k = 0; k < n; k++) { const p = wedgePoint(sec, rng, 30); out.push({ id: `${sec.id}-c${k}`, sector: sec.id, x: Math.round(p.x), z: Math.round(p.z) }); } }
  sec._cache = out; return out;
}
export const killsNeeded = (sec) => 8 + 3 * sec.threat;
// liberation progress 0..1 from galaxy save state
export function liberation(sec, g) {
  if (!isPirate(sec)) return 0;
  if (g.liberated[sec.id]) return 1;
  const os = outposts(sec); const done = os.filter((o) => g.inst[o.id]).length;
  return Math.min(1, 0.65 * done / os.length + 0.35 * Math.min(1, (g.kills[sec.id] || 0) / killsNeeded(sec)));
}
// controller (owner shown on map), honouring liberation
export function owner(sec, g) { if (sec.faction === 'haven') return HAVEN_C; if (g.liberated[sec.id]) return LIBERATED; return FACTIONS[sec.faction] || NEUTRAL; }
// director danger: 0 (no raids) .. 3
export function dangerOf(sec, g) { if (sec.faction === 'haven' || g.liberated[sec.id]) return 0; if (sec.faction === 'neutral') return 1; return Math.min(3, sec.ringI); }
export function threatLabel(t) { return ['Safe', 'Low', 'Moderate', 'High', 'Severe', 'Extreme'][t] || 'Unknown'; }
// neighbouring sectors (share an edge in the same ring, or overlap in angle across adjacent rings)
export function neighbours(sec) {
  const out = [];
  for (const s of GSECTORS) {
    if (s === sec) continue;
    if (s.ring === sec.ring) { const n = RINGS[sec.ringI].n; if (Math.abs(s.idx - sec.idx) === 1 || Math.abs(s.idx - sec.idx) === n - 1) out.push(s); }
    else if (Math.abs(s.ringI - sec.ringI) === 1) { if (sec.ring === 'H' || s.ring === 'H') { out.push(s); continue; } const ov = (a0, a1, b0, b1) => { for (let k = -1; k <= 1; k++) if (a0 < b1 + k * TAU && b0 + k * TAU < a1) return true; return false; }; if (ov(sec.a0, sec.a1, s.a0, s.a1)) out.push(s); }
  }
  return out;
}
export function freshGalaxy() { return { explored: { H: 1 }, liberated: {}, kills: {}, inst: {}, caches: {}, wp: null }; }

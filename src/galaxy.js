// Galaxy layer: named sectors (wedges in distance rings) owned by factions, threat, outposts, caches, liberation.
// Sits on top of the distance-ring SECTORS (which still drive asteroid density & minerals).
import { BOSS_LAIR } from './data.js?v=8';

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

// ---- live world binding: ownership changes (faction warfare, boss defeats) live in the save ----
let W = null; // the save's galaxy state
export function bindWorld(g) { W = g; }
const BOSS_DOWN = () => (W && W.bosses) || {};

// Build the static sector table once. `faction` and `threat` are live getters (base values + world state).
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
    const sec = { id, ring: R.id, ringI, idx: i, name: R.id === 'H' ? 'Frontier Haven' : NAMES[R.id][i], a0, a1, am, r0: R.r0, r1: R.id === 'M' ? 1e9 : R.r1, rm: R.id === 'H' ? 0 : (R.r0 + Math.min(R.r1, 1000)) / 2, base: fac, baseThreat: threat };
    Object.defineProperty(sec, 'faction', { enumerable: true, get() { return (W && W.own && W.own[this.id]) || this.base; } });
    Object.defineProperty(sec, 'threat', { enumerable: true, get() {
      const f = this.faction; if (f === 'haven') return 0; if (f === 'neutral') return 1;
      let t = this.base === f ? this.baseThreat : Math.min(4, this.ringI + 1); // conquered sectors carry ring threat
      if (BOSS_DOWN()[f] && t > 1) t -= 1; // a fallen leader weakens the whole faction
      return t; } });
    GSECTORS.push(sec);
  }
}
// home sectors (threat 5) by faction
for (const fk of FACTION_KEYS) { const cand = GSECTORS.filter((s) => s.ring === 'M' && s.base === fk); if (!cand.some((s) => s.baseThreat === 5) && cand.length) cand.sort((a, b) => Math.abs(norm(a.am - factionCenter(fk) + Math.PI) - Math.PI) - Math.abs(norm(b.am - factionCenter(fk) + Math.PI) - Math.PI))[0].baseThreat = 5; }
export const SECTOR_BY_ID = Object.fromEntries(GSECTORS.map((s) => [s.id, s]));
export const HOME = {}; for (const fk of FACTION_KEYS) HOME[fk] = GSECTORS.find((s) => s.base === fk && s.baseThreat === 5);
export const isHome = (sec) => !!sec && FACTION_KEYS.some((fk) => HOME[fk] === sec);
// flagship lairs: the Crimson lair is the original Warlord lair, the others sit in the middle of each home sector
export const LAIRS = {}; for (const fk of FACTION_KEYS) { const h = HOME[fk]; LAIRS[fk] = fk === 'crimson' ? { ...BOSS_LAIR, sec: gsectorAtRaw(BOSS_LAIR.x, BOSS_LAIR.z).id } : { x: Math.round(Math.cos(h.am) * (h.r0 + 170)), z: Math.round(Math.sin(h.am) * (h.r0 + 170)), sec: h.id }; }
function gsectorAtRaw(x, z) { return gsectorAt(x, z); }

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

// ---- Installations: every non-haven sector has a deterministic set; they are active while a faction holds it ----
export const INST_KINDS = {
  comm: { name: 'Communication Array', short: 'COMM', icon: '📡', glyph: 'C', stage: 'disrupt', role: 'Coordinates patrols: calls reinforcements whenever you fight in this sector.' },
  res:  { name: 'Resource Facility', short: 'MINE', icon: '⛏', glyph: 'R', stage: 'disrupt', role: 'Extracts ore that funds the faction war effort (faction income).' },
  yard: { name: 'Hidden Shipyard', short: 'YARD', icon: '⚙', glyph: 'Y', stage: 'suppress', role: 'Builds replacement ships: launches fresh pirates while it stands.' },
  def:  { name: 'Orbital Defense Platform', short: 'DEF', icon: '⛨', glyph: 'D', stage: 'suppress', role: 'Long-range artillery that shells anything approaching.' },
  hq:   { name: 'Faction Stronghold', short: 'HQ', icon: '☗', glyph: 'H', stage: 'assault', role: 'Sector headquarters. Shielded until the sector defences are suppressed.' },
};
const LAYOUT = { F: ['comm', 'res', 'def', 'hq'], R: ['comm', 'res', 'yard', 'def', 'hq'], M: ['comm', 'res', 'yard', 'def', 'def', 'hq'] };
export function installations(sec) {
  if (sec._inst) return sec._inst;
  const out = [];
  if (sec.ring !== 'H') {
    const rng = mulberry(sec.id.charCodeAt(0) * 977 + sec.idx * 131 + 5); const kinds = LAYOUT[sec.ring]; const cnt = {};
    const lairs = Object.values(LAIRS);
    for (const kind of kinds) {
      let p, tries = 0; const pad = sec.ring === 'F' ? 38 : 45;
      do { p = wedgePoint(sec, rng, pad); tries++; } while (tries < 60 && (lairs.some((l) => Math.hypot(p.x - l.x, p.z - l.z) < 120) || out.some((o) => Math.hypot(o.x - p.x, o.z - p.z) < (sec.ring === 'F' ? 78 : 90))));
      const k = cnt[kind] = (cnt[kind] || 0) + 1;
      out.push({ id: `${sec.id}-${kind}${k}`, sector: sec.id, kind, x: Math.round(p.x), z: Math.round(p.z), n: k });
    }
  }
  sec._inst = out; return out;
}
export const instName = (o) => { const sec = SECTOR_BY_ID[o.sector]; const F = FACTIONS[sec.faction]; return `${F ? F.short + ' ' : ''}${INST_KINDS[o.kind].name}${o.n > 1 ? ' ' + o.n : ''}`; };
export const instById = (id) => { const sid = String(id).split('-')[0]; const sec = SECTOR_BY_ID[sid]; return sec ? installations(sec).find((o) => o.id === id) || null : null; };
// v4 compatibility: "outposts" are now the full installation list
export const outposts = installations;

// Hidden caches
export function caches(sec) {
  if (sec._cache) return sec._cache;
  const out = []; if (sec.ring !== 'H') { const rng = mulberry(sec.idx * 7919 + sec.ringI * 104729 + 3); const n = 1 + (rng() < 0.5 ? 1 : 0); for (let k = 0; k < n; k++) { const p = wedgePoint(sec, rng, 30); out.push({ id: `${sec.id}-c${k}`, sector: sec.id, x: Math.round(p.x), z: Math.round(p.z) }); } }
  sec._cache = out; return out;
}

// ---- 6-stage liberation ----
export const STAGES = [
  { id: 'recon', name: 'Reconnaissance', icon: '◎', desc: 'Scout the sector: fly close to every installation to identify it.' },
  { id: 'disrupt', name: 'Disruption', icon: '⚡', desc: 'Destroy communication arrays and resource facilities, and intercept supply ships.' },
  { id: 'suppress', name: 'Defensive Suppression', icon: '⛨', desc: 'Destroy defense platforms and shipyards, and eliminate elite patrols.' },
  { id: 'assault', name: 'Base Assault', icon: '☗', desc: 'The stronghold shield is down: destroy the faction HQ.' },
  { id: 'commander', name: 'Commander Encounter', icon: '☠', desc: 'Defeat the sector commander who arrives to defend the sector.' },
  { id: 'liberate', name: 'Liberation', icon: '★', desc: 'Control of the sector passes to the Frontier.' },
];
export const supplyNeed = (sec) => (sec.ring === 'F' ? 1 : 2);
export const eliteNeed = (sec) => (sec.ring === 'F' ? 1 : sec.ring === 'R' ? 2 : 3) - (BOSS_DOWN()[sec.faction] ? 1 : 0);
export const killsNeeded = (sec) => 8 + 3 * sec.threat; // legacy stat (kills still tracked)
export function libStages(sec, g) {
  const ins = installations(sec); const destroyed = (k) => ins.filter((o) => o.kind === k && g.inst[o.id]).length; const total = (k) => ins.filter((o) => o.kind === k).length;
  const items = {
    recon: [{ label: 'Installations identified', have: ins.filter((o) => g.spot[o.id] || g.inst[o.id]).length, need: ins.length }],
    disrupt: [{ label: 'Communication arrays', have: destroyed('comm'), need: total('comm') }, { label: 'Resource facilities', have: destroyed('res'), need: total('res') }, { label: 'Supply ships intercepted', have: Math.min(g.supply[sec.id] || 0, supplyNeed(sec)), need: supplyNeed(sec) }],
    suppress: [{ label: 'Defense platforms', have: destroyed('def'), need: total('def') }, ...(total('yard') ? [{ label: 'Shipyards', have: destroyed('yard'), need: total('yard') }] : []), { label: 'Elite patrol ships', have: Math.min(g.elite[sec.id] || 0, Math.max(0, eliteNeed(sec))), need: Math.max(0, eliteNeed(sec)) }],
    assault: [{ label: 'Stronghold destroyed', have: destroyed('hq'), need: total('hq') }],
    commander: [{ label: isHome(sec) ? 'Faction flagship defeated' : 'Sector commander defeated', have: g.cmd[sec.id] ? 1 : 0, need: 1 }],
    liberate: [{ label: 'Sector liberated', have: g.liberated[sec.id] ? 1 : 0, need: 1 }],
  };
  let cur = -1; const steps = STAGES.map((S, i) => {
    const it = items[S.id]; const frac = it.reduce((a, x) => a + (x.need ? Math.min(1, x.have / x.need) : 1), 0) / it.length; const done = g.liberated[sec.id] ? true : frac >= 1;
    if (!done && cur < 0) cur = i; return { ...S, items: it, frac, done };
  });
  if (cur < 0) cur = 6;
  const pct = g.liberated[sec.id] ? 1 : steps.reduce((a, s) => a + s.frac, 0) / 6;
  return { steps, stage: cur, pct, hqOpen: steps[1].done && steps[2].done, cmdOpen: steps[3].done };
}
// liberation progress 0..1 (v4 API)
export function liberation(sec, g) { if (!isPirate(sec) && !g.liberated[sec.id]) return 0; return libStages(sec, g).pct; }
// controller (owner shown on map), honouring liberation
export function owner(sec, g) { if (sec.faction === 'haven') return HAVEN_C; if (g.liberated[sec.id]) return LIBERATED; return FACTIONS[sec.faction] || NEUTRAL; }
// director danger: 0 (no raids) .. 3
export function dangerOf(sec, g) { if (sec.faction === 'haven' || g.liberated[sec.id]) return 0; if (sec.faction === 'neutral') return 1; const d = Math.min(3, sec.ringI); return BOSS_DOWN()[sec.faction] ? Math.max(1, d - 1) : d; }
export function threatLabel(t) { return ['Safe', 'Low', 'Moderate', 'High', 'Severe', 'Extreme'][t] || 'Unknown'; }
// neighbouring sectors (share an edge in the same ring, or overlap in angle across adjacent rings)
const NB = {};
export function neighbours(sec) {
  if (NB[sec.id]) return NB[sec.id];
  const out = [];
  for (const s of GSECTORS) {
    if (s === sec) continue;
    if (s.ring === sec.ring) { const n = RINGS[sec.ringI].n; if (Math.abs(s.idx - sec.idx) === 1 || Math.abs(s.idx - sec.idx) === n - 1) out.push(s); }
    else if (Math.abs(s.ringI - sec.ringI) === 1) { if (sec.ring === 'H' || s.ring === 'H') { out.push(s); continue; } const ov = (a0, a1, b0, b1) => { for (let k = -1; k <= 1; k++) if (a0 < b1 + k * TAU && b0 + k * TAU < a1) return true; return false; }; if (ov(sec.a0, sec.a1, s.a0, s.a1)) out.push(s); }
  }
  return (NB[sec.id] = out);
}
export const sectorCenter = (sec) => (sec.ring === 'H' ? { x: 0, z: 0 } : { x: Math.cos(sec.am) * sec.rm, z: Math.sin(sec.am) * sec.rm });
export function freshGalaxy() { return { explored: { H: 1 }, liberated: {}, kills: {}, inst: {}, caches: {}, wp: null, own: {}, spot: {}, supply: {}, elite: {}, cmd: {}, bosses: {}, bossSeen: {}, flipT: {} }; }
// map a v4 outpost id (`F1-o0`) onto the v5 installation it most likely was (o0 -> comm, o1 -> res, o2 -> yard)
export function legacyOutpost(id) { const m = /^([A-Z]\d+)-o(\d)$/.exec(id); if (!m) return null; const sec = SECTOR_BY_ID[m[1]]; if (!sec) return null; const kind = ['comm', 'res', 'yard'][+m[2]] || 'comm'; const o = installations(sec).find((x) => x.kind === kind) || installations(sec)[+m[2]]; return o ? o.id : null; }

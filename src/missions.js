// Dynamic missions: generated from the live galaxy state, scaled by ship level and sector threat.
import { FACTIONS, GSECTORS, SECTOR_BY_ID, installations, libStages, isPirate, neighbours, sectorCenter, instName, INST_KINDS } from './galaxy.js?v=8';

export const MTYPES = {
  patrol: { name: 'Eliminate Patrol', icon: '✷', color: '#ff6b6b', obj: (m) => `Destroy the ${FACTIONS[m.fac] ? FACTIONS[m.fac].name : 'pirate'} patrol`, unit: 'ships' },
  outpost: { name: 'Destroy Installation', icon: '☗', color: '#ff9a52', obj: (m) => `Destroy the ${m.instName}`, unit: '' },
  escort: { name: 'Escort Civilians', icon: '⛴', color: '#5dff98', obj: (m) => `Escort the ${m.name} to ${m.destName}`, unit: '% of route' },
  defend: { name: 'Defend Station', icon: '⛨', color: '#4fd2ff', obj: (m) => `Hold off the raid on ${m.name}`, unit: 'waves' },
  cargo: { name: 'Recover Stolen Cargo', icon: '▣', color: '#ffd166', obj: () => 'Destroy the pirate hauler and recover its cargo pods', unit: 'pods' },
  signal: { name: 'Investigate Signal', icon: '◉', color: '#c27bff', obj: () => 'Fly to the signal and scan its source', unit: '' },
  commander: { name: 'Hunt Elite Commander', icon: '☠', color: '#ff4fd8', obj: (m) => `Hunt down ${m.name}`, unit: '' },
  convoy: { name: 'Intercept Supply Convoy', icon: '⇶', color: '#ffb238', obj: (m) => `Destroy the ${FACTIONS[m.fac] ? FACTIONS[m.fac].name : 'pirate'} supply freighters before they escape`, unit: 'freighters' },
};
export const MAX_ACTIVE = 3, MAX_OFFERS = 4;
const SHIPS = ['Halcyon Dawn', 'Merrow', 'Kestrel Bloom', 'Tallow Star', 'Ninefold', 'Brightwater', 'Juniper Vale', 'Second Chance'];
const COLONIES = ['Driftwell Colony', 'Lumen Relay', 'Cobalt Rest', 'Harrow Dock', 'Saffron Spire'];
const OFFICERS = ['"Red" Sallow', 'Ivo the Knife', 'Grell Vantar', 'Mother Ash', 'Kiro Blackwake', 'Sefa Moraine', 'Olm the Patient'];
const pickR = (a, R) => a[Math.floor(R() * a.length)];
export const threatCap = (level) => (level < 6 ? 2 : level < 12 ? 3 : level < 20 ? 4 : 5);
function pointIn(sec, R, pad = 40) { const r = sec.r0 + pad + R() * (Math.min(sec.r1, 1000) - sec.r0 - pad * 2); const da = sec.a1 - sec.a0; const a = sec.a0 + da * (0.2 + R() * 0.6); return { x: Math.round(Math.cos(a) * r), z: Math.round(Math.sin(a) * r) }; }
function rewardFor(type, threat, level, R) {
  const mult = { patrol: 1, outpost: 1.6, escort: 1.3, defend: 1.4, cargo: 1.1, signal: 0.9, commander: 1.8, convoy: 1.3 }[type];
  return { credits: Math.round((150 + level * 45) * threat * mult * (0.9 + R() * 0.2) / 10) * 10, xp: Math.round((60 + level * 14) * threat * mult), parts: Math.round(4 * threat * mult), item: type === 'commander' || type === 'outpost' || R() < 0.35, minR: type === 'commander' ? 2 : type === 'outpost' && threat >= 3 ? 2 : 1 };
}
// Build one mission of a given type from the live galaxy. Returns null if no valid location exists.
export function genMission(type, ctx) {
  const { level, G, R = Math.random } = ctx; const cap = threatCap(level);
  const explored = GSECTORS.filter((s) => G.explored[s.id]);
  const frontier = [...new Set([...explored, ...explored.flatMap((s) => neighbours(s))])];
  const pirate = frontier.filter((s) => isPirate(s) && !G.liberated[s.id] && s.threat <= cap);
  const id = 'm' + Date.now().toString(36) + Math.floor(R() * 1e6).toString(36);
  const base = (sec, threat) => ({ id, type, sec: sec.id, threat: Math.max(1, threat), status: 'offer', prog: 0, created: Date.now(), reward: rewardFor(type, Math.max(1, threat), level, R), data: {} });
  if (type === 'patrol' || type === 'cargo' || type === 'commander' || type === 'convoy') {
    if (!pirate.length) return null; const sec = pickR(pirate, R); const m = base(sec, sec.threat); m.fac = sec.faction; const p = pointIn(sec, R); m.x = p.x; m.z = p.z;
    if (type === 'patrol') m.need = 3 + Math.min(4, sec.threat) + (level > 15 ? 1 : 0);
    if (type === 'cargo') m.need = 4;
    if (type === 'commander') { m.need = 1; m.name = pickR(OFFICERS, R); }
    if (type === 'convoy') { m.need = 2 + (sec.threat >= 3 ? 1 : 0); const q = pointIn(sec, R); m.x2 = q.x; m.z2 = q.z; if (Math.hypot(m.x2 - m.x, m.z2 - m.z) < 90) { const c = sectorCenter(sec); m.x2 = Math.round(c.x * 2 - m.x); m.z2 = Math.round(c.z * 2 - m.z); } }
    return m;
  }
  if (type === 'outpost') {
    const opts = []; for (const s of pirate) { const st = libStages(s, G); for (const o of installations(s)) if (!G.inst[o.id] && (o.kind !== 'hq' || st.hqOpen)) opts.push(o); }
    if (!opts.length) return null; const o = pickR(opts, R); const sec = SECTOR_BY_ID[o.sector]; const m = base(sec, sec.threat + (o.kind === 'hq' ? 1 : 0)); m.fac = sec.faction; m.x = o.x; m.z = o.z; m.inst = o.id; m.instName = instName(o); m.need = 1; m.kind = o.kind; return m;
  }
  if (type === 'escort') {
    const dests = frontier.filter((s) => s.ring !== 'H' && (s.faction === 'neutral' || G.liberated[s.id] || (s.ring === 'F' && s.threat <= cap)));
    if (!dests.length) return null; const sec = pickR(dests, R); const c = sectorCenter(sec); const m = base(sec, Math.max(1, Math.min(cap, sec.ring === 'F' ? 2 : 3)));
    m.x = 0; m.z = 40; m.x2 = Math.round(c.x); m.z2 = Math.round(c.z); m.name = pickR(SHIPS, R); m.destName = sec.name; m.need = 100; m.fac = neighbours(sec).map((n) => n.faction).find((f) => FACTIONS[f]) || 'crimson'; return m;
  }
  if (type === 'defend') {
    const libs = frontier.filter((s) => G.liberated[s.id]); const neut = frontier.filter((s) => s.faction === 'neutral');
    const pool = libs.length ? libs : neut; if (!pool.length) return null; const sec = pickR(pool, R); const c = sectorCenter(sec);
    const m = base(sec, Math.min(cap, Math.max(2, sec.ringI + 1))); m.x = Math.round(c.x + 18); m.z = Math.round(c.z + 18); m.name = G.liberated[sec.id] ? `${sec.name} Relay` : pickR(COLONIES, R); m.need = 3; m.fac = neighbours(sec).map((n) => n.faction).find((f) => FACTIONS[f]) || 'ashen'; return m;
  }
  if (type === 'signal') {
    const pool = frontier.filter((s) => s.ring !== 'H' && s.threat <= cap); if (!pool.length) return null; const sec = pickR(pool, R); const m = base(sec, Math.max(1, sec.threat)); const p = pointIn(sec, R); m.x = p.x; m.z = p.z; m.need = 1;
    m.data.outcome = R() < 0.35 ? 'ambush' : R() < 0.5 ? 'relic' : 'derelict'; return m;
  }
  return null;
}
export function genOffers(G, level, existing = [], R = Math.random) {
  const out = [...existing.filter((m) => m.status === 'offer')]; const order = ['patrol', 'outpost', 'escort', 'signal', 'convoy', 'cargo', 'defend', 'commander'];
  let guard = 0;
  while (out.length < MAX_OFFERS && guard++ < 40) {
    const have = new Set(out.map((m) => m.type)); const pool = order.filter((t) => !have.has(t)); const t = pool.length ? pool[Math.floor(R() * pool.length)] : order[Math.floor(R() * order.length)];
    const m = genMission(t, { level, G, R }); if (m) out.push(m);
  }
  return out;
}
export function missionTitle(m) { const T = MTYPES[m.type]; const sec = SECTOR_BY_ID[m.sec]; return `${T.name} · ${sec ? sec.name : '?'}`; }
export function freshMissions() { return { offers: [], active: [], log: [], done: 0, failed: 0, tracked: null, refreshAt: 0 }; }

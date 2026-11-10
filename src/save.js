// Save system: versioned state, migration, validation, manual slots, export/import codes
import { MINERAL_KEYS, UPGRADES, TIERS } from './data.js?v=8';
import { HULLS, LEGACY_TIER_HULL } from './hulls.js?v=8';
import { TEMPLATES, LEGACY, makeItem, RARITIES } from './items.js?v=8';
import { SKILL_BY_ID } from './rpg.js?v=8';
import { SECTOR_BY_ID, freshGalaxy, legacyOutpost, FACTION_KEYS } from './galaxy.js?v=8';
import { freshWar } from './war.js?v=8';
import { MTYPES, freshMissions } from './missions.js?v=8';

export const SAVE_VERSION = 8; // v8 = hull classes (s.hull + owned s.hulls replace the 5 tiers; T1..T5 map to Scout/Strike Fighter/Gunship/Cruiser/Battlecruiser); v7 = shake level (full/reduced/off), frame cap, notification settings; v6 = flight-assist setting (physics overhaul); v3 builds still wrote v2 (audio settings were additive); v5 = campaign (stages, war, missions, bosses)
export const INV_CAP = 48;
export const AUTO_KEY = 'stellar-frontier-save-v1'; // kept so v1 autosaves keep loading
export const SLOT_COUNT = 3;
export const slotKey = (i) => 'stellar-frontier-slot-' + i;

export function freshState() {
  const z = {}; for (const k of MINERAL_KEYS) z[k] = 0;
  const up = {}; for (const u of UPGRADES) up[u.key] = 0;
  return {
    v: SAVE_VERSION, credits: 50, xp: 0, level: 1, cargo: { ...z }, vault: { ...z }, upgrades: up,
    tier: 1, hull: 'scout', hulls: ['scout'], stationLvl: 1, factory: { inc: 0, cap: 0, stored: 0, last: Date.now() },
    // v4 item system: inventory of weapon items + equipped item ids per hardpoint
    inv: [], equip: [], parts: 0, skills: {}, respecs: 0, galaxy: freshGalaxy(), abilityBar: [],
    story: 0, storyProg: 0, contracts: [], maxSector: 1,
    // v5 campaign: faction war simulation, missions, unlocked flagship blueprints
    war: freshWar(), missions: freshMissions(), blueprints: {},
    stats: { mined: 0, rocks: 0, kills: 0, sold: 0, bosses: 0, deaths: 0, playTime: 0, outposts: 0, liberated: 0, caches: 0, items: 0 },
    settings: { music: true, sfx: true, shake: 'full', fpsCap: 60, quality: 'auto', fps: false, masterVol: 0.8, musicVol: 0.6, sfxVol: 0.85, mute: false, musicMode: 'soundtrack', trackIdx: 0, trackPos: 0, war: 'normal', assist: 'normal' },
    pos: { x: 0, z: 62 }, hp: null, tutorialDone: false, savedAt: Date.now(), created: Date.now(),
  };
}
export function starterKit(s) { const it = makeItem('mining_laser', 0, 1, 'Starter kit', { seed: 7 }); s.inv = [it]; s.equip = [it.id]; return s; }
export function newGame() { return starterKit(freshState()); }
// v2/v3 owned weapons + loadout -> v4 items. One item per owned weapon, extra copies for repeated loadout use.
export function legacyItems(weapons, loadout, tier, level) {
  const inv = [], equip = []; const owned = Object.keys(LEGACY).filter((k) => weapons && weapons[k] === true); if (!owned.includes('laser')) owned.unshift('laser');
  const slots = (TIERS[tier - 1] || TIERS[0]).slots; const used = {};
  const mk = (k) => { const [t, r] = LEGACY[k]; const it = makeItem(t, Math.min(r, 1), Math.max(TEMPLATES[t].lvl, Math.min(level, TEMPLATES[t].lvl + 4)), 'Migrated from v3', { seed: inv.length * 977 + 13 }); inv.push(it); return it; };
  const byKey = {}; for (const k of owned) byKey[k] = [mk(k)];
  for (let i = 0; i < slots; i++) {
    let k = Array.isArray(loadout) ? loadout[i] : null; if (!owned.includes(k)) k = i === 0 ? 'laser' : (owned.includes('cannon') ? 'cannon' : 'laser');
    used[k] = (used[k] || 0) + 1; if (used[k] > byKey[k].length) byKey[k].push(mk(k));
    equip.push(byKey[k][used[k] - 1].id);
  }
  return { inv, equip };
}

const num = (v, d, lo = -Infinity, hi = Infinity) => (typeof v === 'number' && isFinite(v) ? Math.min(hi, Math.max(lo, v)) : d);
const int = (v, d, lo, hi) => Math.round(num(v, d, lo, hi));

// v1 -> v2: added savedAt/created, settings stay, bossRespawnLocal (session-only) dropped
export function migrate(d) {
  if (!d || typeof d !== 'object' || Array.isArray(d)) throw new Error('Save data is not an object');
  let v = int(d.v, 1, 0, 999);
  if (v > SAVE_VERSION) throw new Error(`Save is from a newer version (v${v})`);
  d = { ...d };
  if (v < 2) { d.savedAt = d.savedAt || Date.now(); d.created = d.created || Date.now(); delete d.bossRespawnLocal; delete d.bossRespawn; v = 2; }
  // v2/v3 -> v4: weapons/loadout become items; skills, galaxy, components added (skill points are derived from level, so old saves get them retroactively)
  if (v < 4) { const lvl = int(d.level, 1, 1, 999), tier = int(d.tier, 1, 1, TIERS.length); const m = legacyItems(d.weapons || { laser: true }, d.loadout, tier, lvl); d.inv = m.inv; d.equip = m.equip; d.migratedFrom = v; delete d.weapons; delete d.loadout; d.skills = {}; d.parts = 0; v = 4; }
  // v4 -> v5: the three generic outposts per sector become typed installations (o0 comm, o1 resource, o2 shipyard);
  // destroyed ones stay destroyed and count as identified. Liberated sectors stay liberated.
  if (v < 5) { const g = d.galaxy && typeof d.galaxy === 'object' ? { ...d.galaxy } : null; if (g) { const inst = {}, spot = {}; for (const k in (g.inst || {})) { const n = legacyOutpost(k); if (n) { inst[n] = 1; spot[n] = 1; } else if (!/-o\d$/.test(k)) inst[k] = 1; } g.inst = inst; g.spot = { ...(g.spot || {}), ...spot }; d.galaxy = g; } d.v5From = v; v = 5; }
  // v7 -> v8: the five tiers become hull classes from the concept sheet; you keep an equivalent hull (and the Scout)
  if (v < 8) { const t = int(d.tier, 1, 1, TIERS.length); const h = LEGACY_TIER_HULL[t] || 'scout'; d.hull = h; d.hulls = [...new Set(['scout', h])]; d.migratedTier = t; v = 8; }
  d.v = v;
  return d;
}

// Merge onto a fresh state and coerce every field to a sane type/range.
export function sanitize(raw) {
  const d = migrate(raw); const f = freshState(); const s = f;
  s.credits = num(d.credits, f.credits, 0, 1e15); s.xp = num(d.xp, 0, 0, 1e15); s.level = int(d.level, 1, 1, 999);
  for (const k of MINERAL_KEYS) { s.cargo[k] = int(d.cargo && d.cargo[k], 0, 0, 1e9); s.vault[k] = int(d.vault && d.vault[k], 0, 0, 1e9); }
  for (const u of UPGRADES) s.upgrades[u.key] = int(d.upgrades && d.upgrades[u.key], 0, 0, u.max);
  s.hulls = [...new Set((Array.isArray(d.hulls) ? d.hulls : []).filter((h) => typeof h === 'string' && HULLS[h]))]; if (!s.hulls.includes('scout')) s.hulls.unshift('scout');
  s.hull = typeof d.hull === 'string' && HULLS[d.hull] ? d.hull : 'scout'; if (!s.hulls.includes(s.hull)) s.hulls.push(s.hull);
  s.tier = HULLS[s.hull].rank; s.stationLvl = int(d.stationLvl, 1, 1, 6); if (d.migratedTier) s.migratedTier = int(d.migratedTier, 1, 1, 5);
  const fa = d.factory || {}; s.factory = { inc: int(fa.inc, 0, 0, 200), cap: int(fa.cap, 0, 0, 200), stored: num(fa.stored, 0, 0, 1e15), last: num(fa.last, Date.now(), 0, Date.now() + 1) };
  // items
  const seen = new Set();
  s.inv = (Array.isArray(d.inv) ? d.inv : []).filter((it) => it && typeof it === 'object' && TEMPLATES[it.t] && typeof it.id === 'string' && !seen.has(it.id) && seen.add(it.id)).slice(0, INV_CAP + 8).map((it) => ({
    id: it.id.slice(0, 40), t: it.t, r: int(it.r, 0, 0, RARITIES.length - 1), il: int(it.il, 1, 1, 999), up: Math.min(int(it.up, 0, 0, 20), RARITIES[int(it.r, 0, 0, RARITIES.length - 1)].maxUp),
    sp: (Array.isArray(it.sp) ? it.sp : []).filter((x) => typeof x === 'string').slice(0, 3), ...(typeof it.bp === 'string' && /^bp_[a-z]+$/.test(it.bp) ? { bp: it.bp } : {}), seed: int(it.seed, 1, 0, 2 ** 31), src: String(it.src || 'Unknown').slice(0, 40), name: String(it.name || TEMPLATES[it.t].name).slice(0, 60), at: num(it.at, Date.now()), lock: it.lock === true }));
  const ids = new Set(s.inv.map((it) => it.id)); const eq = new Set();
  s.equip = (Array.isArray(d.equip) ? d.equip : []).slice(0, 8).map((id) => (typeof id === 'string' && ids.has(id) && !eq.has(id) && eq.add(id) ? id : null));
  if (!s.inv.length || !s.equip.some(Boolean)) { if (!s.inv.length) starterKit(s); else s.equip = [s.inv[0].id]; }
  s.parts = int(d.parts, 0, 0, 1e9); s.respecs = int(d.respecs, 0, 0, 1e6);
  s.skills = {}; for (const k in (d.skills || {})) { const sk = SKILL_BY_ID[k]; if (sk) { const r = int(d.skills[k], 0, 0, sk.max); if (r) s.skills[k] = r; } }
  const g = d.galaxy || {}; const fg = freshGalaxy(); const pick = (o, ok, val) => { const out = {}; if (o && typeof o === 'object') for (const k in o) if (ok(k)) out[k] = val(o[k]); return out; };
  const isSec = (k) => !!SECTOR_BY_ID[k]; const isSub = (k) => typeof k === 'string' && k.length < 16 && !!SECTOR_BY_ID[k.split('-')[0]];
  s.galaxy = { explored: { ...fg.explored, ...pick(g.explored, isSec, () => 1) }, liberated: pick(g.liberated, isSec, () => 1), kills: pick(g.kills, isSec, (v) => int(v, 0, 0, 1e6)), inst: pick(g.inst, isSub, () => 1), caches: pick(g.caches, isSub, () => 1),
    wp: g.wp && typeof g.wp === 'object' && isFinite(g.wp.x) && isFinite(g.wp.z) ? { x: num(g.wp.x, 0, -5000, 5000), z: num(g.wp.z, 0, -5000, 5000), label: String(g.wp.label || 'Waypoint').slice(0, 40) } : null,
    own: pick(g.own, (k) => isSec(k) && k !== 'H' && (FACTION_KEYS.includes(g.own[k]) || g.own[k] === 'neutral'), (v) => v), spot: pick(g.spot, isSub, () => 1), supply: pick(g.supply, isSec, (v) => int(v, 0, 0, 99)), elite: pick(g.elite, isSec, (v) => int(v, 0, 0, 99)),
    cmd: pick(g.cmd, isSec, () => 1), bosses: pick(g.bosses, (k) => FACTION_KEYS.includes(k), () => 1), bossSeen: pick(g.bossSeen, (k) => FACTION_KEYS.includes(k), () => 1), flipT: pick(g.flipT, isSec, (v) => num(v, 0, -1e12, 1e12)) };
  for (const k in s.galaxy.liberated) delete s.galaxy.own[k];
  s.war = sanitizeWar(d.war); s.missions = sanitizeMissions(d.missions); s.blueprints = pick(d.blueprints, (k) => /^bp_[a-z]+$/.test(k), () => 1);
  if (typeof d.v5From === 'number') s.v5From = d.v5From;
  if (typeof d.migratedFrom === 'number') s.migratedFrom = d.migratedFrom;
  s.story = int(d.story, 0, 0, 100); s.storyProg = num(d.storyProg, 0, 0, 1e12); s.maxSector = int(d.maxSector, 1, 1, 4);
  s.contracts = Array.isArray(d.contracts) ? d.contracts.filter((c) => c && typeof c === 'object' && typeof c.kind === 'string' && num(c.need, 0) > 0 && c.reward && typeof c.title === 'string' && typeof c.desc === 'string')
    .slice(0, 3).map((c) => ({ id: String(c.id || Math.random()), title: c.title.slice(0, 60), desc: c.desc.slice(0, 120), kind: c.kind.slice(0, 30), need: num(c.need, 1, 1, 1e9), prog: num(c.prog, 0, 0, 1e12), reward: { credits: num(c.reward.credits, 0, 0, 1e12), xp: num(c.reward.xp, 0, 0, 1e12) } })) : [];
  for (const k in f.stats) s.stats[k] = num(d.stats && d.stats[k], 0, 0, 1e15);
  const st = d.settings || {}; s.settings = { music: st.music !== false, sfx: st.sfx !== false, shake: ['full', 'reduced', 'off'].includes(st.shake) ? st.shake : st.shake === false ? 'off' : 'full', fpsCap: st.fpsCap === 30 ? 30 : 60, quality: ['auto', 'low', 'medium', 'high'].includes(st.quality) ? st.quality : 'auto', fps: st.fps === true,
    // v3 audio mixer (older saves: the on/off toggles map onto the new sliders)
    masterVol: num(st.masterVol, 0.8, 0, 1), musicVol: num(st.musicVol, st.music === false ? 0 : 0.6, 0, 1), sfxVol: num(st.sfxVol, st.sfx === false ? 0 : 0.85, 0, 1), mute: st.mute === true,
    musicMode: st.musicMode === 'generated' ? 'generated' : 'soundtrack', trackIdx: int(st.trackIdx, 0, 0, 99), trackPos: num(st.trackPos, 0, 0, 36000), war: ['off', 'low', 'normal', 'high'].includes(st.war) ? st.war : 'normal', assist: ['low', 'normal', 'high'].includes(st.assist) ? st.assist : 'normal' };
  s.settings.music = s.settings.musicVol > 0; s.settings.sfx = s.settings.sfxVol > 0;
  s.pos = { x: num(d.pos && d.pos.x, 0, -1e5, 1e5), z: num(d.pos && d.pos.z, 34, -1e5, 1e5) };
  s.hp = d.hp == null ? null : num(d.hp, null, 0, 1e9);
  s.tutorialDone = !!d.tutorialDone; s.savedAt = num(d.savedAt, Date.now()); s.created = num(d.created, Date.now());
  return s;
}

const isFac = (k) => FACTION_KEYS.includes(k); const str = (v, n = 60) => String(v == null ? '' : v).slice(0, n);
function sanitizeWar(w) {
  const f = freshWar(); if (!w || typeof w !== 'object') return f;
  const out = { clock: num(w.clock, 0, 0, 1e10), next: num(w.next, 45, 0, 1e10), flips: int(w.flips, 0, 0, 1e6), seq: int(w.seq, 0, 0, 1e9), rel: {}, allies: {}, fres: {}, battles: [], log: [] };
  for (const k of FACTION_KEYS) out.fres[k] = num(w.fres && w.fres[k], 40, 0, 400);
  for (const k in (w.rel || {})) if (/^[a-z]+\|[a-z]+$/.test(k)) out.rel[k] = num(w.rel[k], 0, -1, 1);
  for (const k in (w.allies || {})) if (/^[a-z]+\|[a-z]+$/.test(k)) out.allies[k] = num(w.allies[k], 0, 0, 1e10);
  out.battles = (Array.isArray(w.battles) ? w.battles : []).filter((b) => b && isFac(b.a) && (isFac(b.d) || b.d === 'neutral') && SECTOR_BY_ID[b.sec]).slice(0, 4)
    .map((b) => ({ id: str(b.id, 12), a: b.a, d: b.d, sec: b.sec, start: num(b.start, 0), end: num(b.end, 0), x: num(b.x, 0, -2000, 2000), z: num(b.z, 0, -2000, 2000), pa: num(b.pa, 10, 1, 1e4), pd: num(b.pd, 10, 1, 1e4), pa0: num(b.pa0, 10, 1, 1e4), pd0: num(b.pd0, 10, 1, 1e4) }));
  out.log = (Array.isArray(w.log) ? w.log : []).filter((l) => l && typeof l.text === 'string').slice(0, 24).map((l) => ({ t: num(l.t, 0), text: str(l.text, 140), kind: str(l.kind, 10) }));
  return out;
}
function sanitizeMission(m) {
  if (!m || typeof m !== 'object' || !MTYPES[m.type] || !SECTOR_BY_ID[m.sec] || typeof m.id !== 'string') return null;
  const r = m.reward || {};
  const o = { id: str(m.id, 30), type: m.type, sec: m.sec, threat: int(m.threat, 1, 1, 6), status: ['offer', 'active', 'done', 'failed', 'abandoned'].includes(m.status) ? m.status : 'offer', prog: num(m.prog, 0, 0, 1e4), need: num(m.need, 1, 1, 1e4),
    reward: { credits: num(r.credits, 0, 0, 1e9), xp: num(r.xp, 0, 0, 1e9), parts: num(r.parts, 0, 0, 1e6), item: r.item === true, minR: int(r.minR, 0, 0, 5) }, x: num(m.x, 0, -3000, 3000), z: num(m.z, 0, -3000, 3000), data: { outcome: ['ambush', 'relic', 'derelict'].includes(m.data && m.data.outcome) ? m.data.outcome : 'derelict' },
    created: num(m.created, Date.now()) };
  for (const k of ['x2', 'z2', 'accepted', 'ended']) if (typeof m[k] === 'number' && isFinite(m[k])) o[k] = m[k];
  for (const k of ['name', 'instName', 'destName', 'reason']) if (typeof m[k] === 'string') o[k] = str(m[k]);
  if (isFac(m.fac) || m.fac === 'neutral') o.fac = m.fac; if (typeof m.inst === 'string' && m.inst.length < 20) o.inst = m.inst; if (typeof m.kind === 'string') o.kind = str(m.kind, 8);
  return o;
}
function sanitizeMissions(M) {
  const f = freshMissions(); if (!M || typeof M !== 'object') return f;
  const list = (a, st, n) => (Array.isArray(a) ? a : []).map(sanitizeMission).filter((m) => m && (!st || st.includes(m.status))).slice(0, n);
  const out = { offers: list(M.offers, ['offer'], 6), active: list(M.active, ['active'], 3), log: list(M.log, ['done', 'failed', 'abandoned'], 30), done: int(M.done, 0, 0, 1e6), failed: int(M.failed, 0, 0, 1e6), tracked: null, refreshAt: num(M.refreshAt, 0, 0, 1e15) };
  if (typeof M.tracked === 'string' && out.active.some((m) => m.id === M.tracked)) out.tracked = M.tracked; else if (out.active[0]) out.tracked = out.active[0].id;
  return out;
}

// ---- storage helpers ----
export function readKey(key) {
  try { const raw = localStorage.getItem(key); if (!raw) return null; return sanitize(JSON.parse(raw)); } catch (e) { console.warn('Unreadable save in', key); return null; }
}
export function writeKey(key, s) {
  try { localStorage.setItem(key, JSON.stringify({ ...s, v: SAVE_VERSION, savedAt: Date.now() })); return true; } catch (e) { return false; }
}
export function deleteKey(key) { try { localStorage.removeItem(key); } catch (e) { /* ignore */ } }
export function meta(s) {
  if (!s) return null;
  return { tier: s.tier, hull: s.hull, tierName: HULLS[s.hull].name, hullCls: HULLS[s.hull].cls, level: s.level, credits: s.credits, station: s.stationLvl, sector: s.maxSector, playTime: s.stats.playTime, savedAt: s.savedAt, liberated: Object.keys(s.galaxy.liberated).length, items: s.inv.length };
}

// ---- export / import codes ----
function fnv(str) { let h = 0x811c9dc5; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193); } return (h >>> 0).toString(16).padStart(8, '0'); }
function b64enc(str) { const bytes = new TextEncoder().encode(str); let bin = ''; for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]); return btoa(bin); }
function b64dec(b) { const bin = atob(b); const bytes = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i); return new TextDecoder().decode(bytes); }

export function exportCode(s) {
  const json = JSON.stringify({ game: 'stellar-frontier', v: SAVE_VERSION, exported: Date.now(), data: { ...s, v: SAVE_VERSION } });
  return `SF${SAVE_VERSION}.${b64enc(json)}.${fnv(json)}`;
}
// Returns { ok:true, state } or { ok:false, error } — never throws.
export function importCode(input) {
  try {
    if (typeof input !== 'string') return { ok: false, error: 'Nothing to import' };
    const text = input.trim();
    if (!text) return { ok: false, error: 'Paste a save code first' };
    if (text.length > 2_000_000) return { ok: false, error: 'Save code is too large' };
    let payload;
    if (text[0] === '{') { // raw JSON (e.g. a hand-copied save)
      payload = JSON.parse(text);
      if (payload && !payload.game) { if (typeof payload.credits !== 'number' || (typeof payload.tier !== 'number' && typeof payload.hull !== 'string')) return { ok: false, error: 'That JSON is not a Stellar Frontier save' }; payload = { game: 'stellar-frontier', data: payload }; }
    } else {
      const parts = text.replace(/\s+/g, '').split('.');
      if (parts.length !== 3 || !/^SF\d+$/.test(parts[0])) return { ok: false, error: 'That is not a Stellar Frontier save code' };
      let json; try { json = b64dec(parts[1]); } catch (e) { return { ok: false, error: 'Save code is damaged (bad encoding)' }; }
      if (fnv(json) !== parts[2]) return { ok: false, error: 'Save code is damaged (checksum mismatch)' };
      payload = JSON.parse(json);
    }
    if (!payload || payload.game !== 'stellar-frontier' || typeof payload.data !== 'object') return { ok: false, error: 'That is not a Stellar Frontier save' };
    return { ok: true, state: sanitize(payload.data) };
  } catch (e) {
    return { ok: false, error: 'Could not read save: ' + (e && e.message ? e.message : 'invalid data') };
  }
}

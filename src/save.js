// Save system: versioned state, migration, validation, manual slots, export/import codes
import { MINERAL_KEYS, UPGRADES, WEAPONS, TIERS } from './data.js';

export const SAVE_VERSION = 2;
export const AUTO_KEY = 'stellar-frontier-save-v1'; // kept so v1 autosaves keep loading
export const SLOT_COUNT = 3;
export const slotKey = (i) => 'stellar-frontier-slot-' + i;

export function freshState() {
  const z = {}; for (const k of MINERAL_KEYS) z[k] = 0;
  const up = {}; for (const u of UPGRADES) up[u.key] = 0;
  return {
    v: SAVE_VERSION, credits: 50, xp: 0, level: 1, cargo: { ...z }, vault: { ...z }, upgrades: up,
    tier: 1, stationLvl: 1, factory: { inc: 0, cap: 0, stored: 0, last: Date.now() },
    weapons: { laser: true }, loadout: ['laser', 'cannon', 'laser', 'missile', 'cannon', 'pulse'],
    story: 0, storyProg: 0, contracts: [], maxSector: 1,
    stats: { mined: 0, rocks: 0, kills: 0, sold: 0, bosses: 0, deaths: 0, playTime: 0 },
    settings: { music: true, sfx: true, shake: true, quality: 'auto', fps: false },
    pos: { x: 0, z: 34 }, hp: null, tutorialDone: false, savedAt: Date.now(), created: Date.now(),
  };
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
  d.v = v;
  return d;
}

// Merge onto a fresh state and coerce every field to a sane type/range.
export function sanitize(raw) {
  const d = migrate(raw); const f = freshState(); const s = f;
  s.credits = num(d.credits, f.credits, 0, 1e15); s.xp = num(d.xp, 0, 0, 1e15); s.level = int(d.level, 1, 1, 999);
  for (const k of MINERAL_KEYS) { s.cargo[k] = int(d.cargo && d.cargo[k], 0, 0, 1e9); s.vault[k] = int(d.vault && d.vault[k], 0, 0, 1e9); }
  for (const u of UPGRADES) s.upgrades[u.key] = int(d.upgrades && d.upgrades[u.key], 0, 0, u.max);
  s.tier = int(d.tier, 1, 1, TIERS.length); s.stationLvl = int(d.stationLvl, 1, 1, 6);
  const fa = d.factory || {}; s.factory = { inc: int(fa.inc, 0, 0, 200), cap: int(fa.cap, 0, 0, 200), stored: num(fa.stored, 0, 0, 1e15), last: num(fa.last, Date.now(), 0, Date.now() + 1) };
  s.weapons = { laser: true }; for (const k in WEAPONS) if (d.weapons && d.weapons[k] === true) s.weapons[k] = true;
  if (Array.isArray(d.loadout)) for (let i = 0; i < 6; i++) if (WEAPONS[d.loadout[i]]) s.loadout[i] = d.loadout[i];
  s.story = int(d.story, 0, 0, 100); s.storyProg = num(d.storyProg, 0, 0, 1e12); s.maxSector = int(d.maxSector, 1, 1, 4);
  s.contracts = Array.isArray(d.contracts) ? d.contracts.filter((c) => c && typeof c === 'object' && typeof c.kind === 'string' && num(c.need, 0) > 0 && c.reward && typeof c.title === 'string' && typeof c.desc === 'string')
    .slice(0, 3).map((c) => ({ id: String(c.id || Math.random()), title: c.title.slice(0, 60), desc: c.desc.slice(0, 120), kind: c.kind.slice(0, 30), need: num(c.need, 1, 1, 1e9), prog: num(c.prog, 0, 0, 1e12), reward: { credits: num(c.reward.credits, 0, 0, 1e12), xp: num(c.reward.xp, 0, 0, 1e12) } })) : [];
  for (const k in f.stats) s.stats[k] = num(d.stats && d.stats[k], 0, 0, 1e15);
  const st = d.settings || {}; s.settings = { music: st.music !== false, sfx: st.sfx !== false, shake: st.shake !== false, quality: ['auto', 'low', 'medium', 'high'].includes(st.quality) ? st.quality : 'auto', fps: st.fps === true };
  s.pos = { x: num(d.pos && d.pos.x, 0, -1e5, 1e5), z: num(d.pos && d.pos.z, 34, -1e5, 1e5) };
  s.hp = d.hp == null ? null : num(d.hp, null, 0, 1e9);
  s.tutorialDone = !!d.tutorialDone; s.savedAt = num(d.savedAt, Date.now()); s.created = num(d.created, Date.now());
  return s;
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
  return { tier: s.tier, tierName: TIERS[s.tier - 1].name, level: s.level, credits: s.credits, station: s.stationLvl, sector: s.maxSector, playTime: s.stats.playTime, savedAt: s.savedAt };
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
      if (payload && !payload.game) { if (typeof payload.credits !== 'number' || typeof payload.tier !== 'number') return { ok: false, error: 'That JSON is not a Stellar Frontier save' }; payload = { game: 'stellar-frontier', data: payload }; }
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

// Autonomous pirate faction warfare: a bounded, state-driven simulation that runs on a game clock.
// Factions earn income from held sectors + resource facilities, launch attacks on neighbouring rival/unclaimed
// sectors, form short alliances against the strongest power and retaliate. Liberated space, the Haven and faction
// home sectors never change hands, and every faction is capped at a few sectors above its starting territory.
import { FACTIONS, FACTION_KEYS, GSECTORS, SECTOR_BY_ID, HOME, installations, neighbours, isHome } from './galaxy.js?v=7';

// conflict frequency presets (Settings > Faction warfare)
export const WAR_LEVELS = {
  off: { on: false, label: 'OFF' },
  low: { on: true, label: 'LOW', tick: 95, battle: 120, maxBattles: 1, local: 0.25 },
  normal: { on: true, label: 'NORMAL', tick: 55, battle: 95, maxBattles: 2, local: 0.4 },
  high: { on: true, label: 'HIGH', tick: 30, battle: 75, maxBattles: 3, local: 0.6 },
};
export const WAR = {
  maxGain: 2,            // a faction can hold at most (starting sectors + maxGain)
  flipCooldown: 480,     // seconds a sector is protected after changing hands
  allianceChance: 0.12, allianceDur: 600,
  aggression: { crimson: 1.0, void: 0.6, iron: 0.55, eclipse: 0.6, ashen: 0.9 },
};
const pairKey = (a, b) => (a < b ? a + '|' + b : b + '|' + a);
export function freshWar() { const fres = {}; for (const fk of FACTION_KEYS) fres[fk] = 40; return { clock: 0, next: 45, battles: [], rel: {}, allies: {}, log: [], flips: 0, seq: 0, fres }; }
const BASE_HELD = {}; for (const fk of FACTION_KEYS) BASE_HELD[fk] = GSECTORS.filter((s) => s.base === fk).length;

export function factionStats(G, w) {
  const out = {};
  for (const fk of FACTION_KEYS) out[fk] = { held: 0, sectors: [], res: 0, yards: 0, str: 0, down: !!G.bosses[fk] };
  for (const sec of GSECTORS) {
    const f = sec.faction; if (!out[f] || G.liberated[sec.id]) continue;
    const o = out[f]; o.held++; o.sectors.push(sec);
    for (const ins of installations(sec)) if (!G.inst[ins.id]) { if (ins.kind === 'res') o.res++; else if (ins.kind === 'yard') o.yards++; }
  }
  for (const fk of FACTION_KEYS) { const o = out[fk]; o.str = Math.round((20 + o.held * 8 + o.res * 5 + o.yards * 4 + (w ? w.fres[fk] || 0 : 0) * 0.2) * (o.down ? 0.55 : 1)); }
  return out;
}
export const allied = (w, a, b) => (w.allies[pairKey(a, b)] || 0) > w.clock;
function canFlip(sec, G, w) { return sec.faction !== 'haven' && !G.liberated[sec.id] && !isHome(sec) && (w.clock - (G.flipT[sec.id] || -1e9)) > WAR.flipCooldown; }

// Advance the simulation by one tick. Returns a list of events for the game to react to.
export function warTick(w, G, cfg, ctx = {}) {
  const R = ctx.rand || Math.random; const ev = []; const FS = factionStats(G, w);
  const log = (text, kind) => { w.log.unshift({ t: Math.round(w.clock), text, kind }); if (w.log.length > 24) w.log.length = 24; };
  // income
  for (const fk of FACTION_KEYS) w.fres[fk] = Math.min(400, (w.fres[fk] || 0) + FS[fk].res * 3 + FS[fk].held * 0.8 + (FS[fk].down ? 0 : 2));
  // resolve finished battles
  for (let i = w.battles.length - 1; i >= 0; i--) {
    const b = w.battles[i]; if (w.clock < b.end) continue; w.battles.splice(i, 1);
    const sec = SECTOR_BY_ID[b.sec]; const A = FACTIONS[b.a], D = FACTIONS[b.d];
    const chance = b.pa / (b.pa + b.pd * 1.2);
    const still = sec.faction === b.d; // ownership may have changed meanwhile (liberation, collapse)
    if (still && canFlip(sec, G, w) && FS[b.a].held < BASE_HELD[b.a] + WAR.maxGain && R() < chance) {
      if (b.a === sec.base) delete G.own[sec.id]; else G.own[sec.id] = b.a; G.flipT[sec.id] = w.clock; w.flips++;
      w.rel[pairKey(b.a, b.d)] = Math.max(-1, (w.rel[pairKey(b.a, b.d)] || 0) - 0.35);
      ev.push({ kind: 'flip', sec: sec.id, a: b.a, d: b.d, battle: b }); log(`${A.name} seized ${sec.name} from ${D ? D.name : 'unclaimed space'}`, 'flip');
    } else { ev.push({ kind: 'repelled', sec: sec.id, a: b.a, d: b.d, battle: b }); log(`${D ? D.name : 'Local militia'} repelled ${A.name} at ${sec.name}`, 'hold'); if (D) w.rel[pairKey(b.a, b.d)] = Math.max(-1, (w.rel[pairKey(b.a, b.d)] || 0) - 0.15); }
  }
  // alliances: the two weakest factions sometimes team up against the strongest
  if (R() < WAR.allianceChance) {
    const order = [...FACTION_KEYS].sort((a, b) => FS[a].str - FS[b].str); const [a, b] = order; const top = order[4];
    if (!allied(w, a, b) && FS[top].str > FS[a].str * 1.4) { w.allies[pairKey(a, b)] = w.clock + WAR.allianceDur; ev.push({ kind: 'alliance', a, b, vs: top }); log(`${FACTIONS[a].name} and ${FACTIONS[b].name} formed a pact against ${FACTIONS[top].name}`, 'pact'); }
  }
  for (const k in w.allies) if (w.allies[k] <= w.clock) delete w.allies[k];
  // launch new attacks
  if (w.battles.length < cfg.maxBattles) {
    const weights = FACTION_KEYS.map((fk) => (FS[fk].held && FS[fk].held < BASE_HELD[fk] + WAR.maxGain && w.fres[fk] >= 25 ? WAR.aggression[fk] * FS[fk].str : 0));
    let tot = weights.reduce((a, b) => a + b, 0); let a = null;
    if (tot > 0) { let r = R() * tot; for (let i = 0; i < 5; i++) { r -= weights[i]; if (r <= 0) { a = FACTION_KEYS[i]; break; } } a ||= FACTION_KEYS[4]; }
    if (a) {
      const cands = new Map();
      for (const s of FS[a].sectors) for (const n of neighbours(s)) {
        if (n.faction === a || n.faction === 'haven' || !canFlip(n, G, w) || w.battles.some((b) => b.sec === n.id)) continue;
        const d = n.faction; if (FACTIONS[d] && (allied(w, a, d) || FS[d].held <= 1)) continue;
        let wgt = FACTIONS[d] ? 1 : 0.7; if (FACTIONS[d] && (w.rel[pairKey(a, d)] || 0) < -0.4) wgt *= 2; // retaliation
        if (ctx.playerSec && (n.id === ctx.playerSec || neighbours(SECTOR_BY_ID[ctx.playerSec]).includes(n))) wgt *= 1 + cfg.local * 6; // fights tend to happen where the player can see them
        cands.set(n.id, wgt);
      }
      if (cands.size) {
        let t2 = 0; for (const v of cands.values()) t2 += v; let r = R() * t2; let pickId = null; for (const [k, v] of cands) { r -= v; if (r <= 0) { pickId = k; break; } } pickId ||= [...cands.keys()][0];
        const sec = SECTOR_BY_ID[pickId]; const d = sec.faction; const defAlive = installations(sec).filter((o) => o.kind === 'def' && !G.inst[o.id]).length;
        const pa = FS[a].str * (0.25 + R() * 0.25); const pd = FACTIONS[d] ? FS[d].str * (0.3 + R() * 0.25) + defAlive * 10 : 14 + R() * 10;
        const ang = sec.a0 + (sec.a1 - sec.a0) * (0.25 + R() * 0.5), rad = sec.r0 + (Math.min(sec.r1, 1000) - sec.r0) * (0.3 + R() * 0.4);
        const b = { id: 'b' + (++w.seq), a, d, sec: sec.id, start: w.clock, end: w.clock + cfg.battle * (0.8 + R() * 0.4), x: Math.round(Math.cos(ang) * rad), z: Math.round(Math.sin(ang) * rad), pa: Math.round(pa), pd: Math.round(pd), pa0: Math.round(pa), pd0: Math.round(pd) };
        w.battles.push(b); w.fres[a] -= 25; ev.push({ kind: 'battle', battle: b }); log(`${FACTIONS[a].name} attacked ${sec.name}${FACTIONS[d] ? ` (${FACTIONS[d].name})` : ''}`, 'battle');
      }
    }
  }
  return ev;
}
// the player's kills during a skirmish shift the balance of that battle
export function warHit(w, battleId, side, amount) { const b = w.battles.find((x) => x.id === battleId); if (!b) return; if (side === b.a) b.pa = Math.max(1, b.pa - amount); else b.pd = Math.max(1, b.pd - amount); }
// a fallen faction leader: two nearby sectors collapse into unclaimed space and the faction loses its war chest
export function bossCollapse(G, w, fk) {
  const home = HOME[fk]; const lost = [];
  const cand = GSECTORS.filter((s) => s.faction === fk && !isHome(s) && !G.liberated[s.id]).sort((a, b) => Math.abs(a.am - home.am) + Math.abs(a.ringI - home.ringI) - Math.abs(b.am - home.am) - Math.abs(b.ringI - home.ringI));
  for (const s of cand.slice(0, 2)) { G.own[s.id] = 'neutral'; G.flipT[s.id] = w.clock; lost.push(s.id); }
  w.fres[fk] = 0; w.battles = w.battles.filter((b) => b.a !== fk);
  w.log.unshift({ t: Math.round(w.clock), text: `${FACTIONS[fk].name} lost their leader: ${lost.map((id) => SECTOR_BY_ID[id].name).join(' and ') || 'their grip'} fell into chaos`, kind: 'flip' });
  return lost;
}

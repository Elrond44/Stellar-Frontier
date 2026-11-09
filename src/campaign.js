// v5 campaign runtime: installations, the 6-stage liberation flow, supply convoys, sector commanders, faction
// flagship bosses (phases, telegraphed attacks, destructible components), autonomous faction warfare with visible
// skirmishes, friendly activity in liberated space and the dynamic mission runtime.
import * as THREE from 'three';
import { RING_L0, FLAGSHIP_L0, ttkHp, dmgK } from './balance.js?v=6';
import { ENEMIES } from './data.js?v=6';
import { FACTIONS, FACTION_KEYS, SECTOR_BY_ID, HOME, LAIRS, isHome, isPirate, installations, instName, INST_KINDS, libStages, neighbours, sectorCenter, gsectorAt, STAGES, caches } from './galaxy.js?v=6';
import { WAR_LEVELS, warTick, warHit, bossCollapse } from './war.js?v=6';
import { BOSSES, ATTACKS, commanderFor } from './bosses.js?v=6';
import { MTYPES, MAX_ACTIVE, genOffers, missionTitle } from './missions.js?v=6';
import { makeItem, RARITIES, rollTemplate } from './items.js?v=6';
import { INV_CAP } from './save.js?v=6';
import { buildInstallationV5, buildCivilian, buildShip, makeDome, buildCacheCrate } from './models.js?v=6';

const TAU = Math.PI * 2; const rand = (a, b) => a + Math.random() * (b - a); const randInt = (a, b) => Math.floor(rand(a, b + 1));
const pick = (a) => a[Math.floor(Math.random() * a.length)];
const PARTS = { comm: { gens: 1, tur: 2 }, res: { gens: 1, tur: 2 }, yard: { gens: 2, tur: 3 }, def: { gens: 2, tur: 2 }, hq: { gens: 3, tur: 4 } };
// faction fleet doctrine: ship roles used by skirmishes, probes and mission spawns
export const FLEET = {
  crimson: ['interceptor', 'gunship', 'gunship', 'interceptor', 'capital', 'support'],
  void: ['interceptor', 'ew', 'interceptor', 'sniper', 'ew', 'drone'],
  iron: ['gunship', 'support', 'gunship', 'capital', 'sniper', 'drone'],
  eclipse: ['sniper', 'interceptor', 'ew', 'sniper', 'support', 'gunship'],
  ashen: ['interceptor', 'interceptor', 'drone', 'interceptor', 'gunship', 'sniper'],
  neutral: ['interceptor', 'drone', 'drone', 'interceptor', 'gunship', 'drone'],
};
const WARN_COL = { def: [3.6, 0.5, 0.3], drain: [2.0, 0.6, 3.6], gravity: [0.5, 2.4, 3.6], mine: [3.6, 1.8, 0.3] };

export class Campaign {
  constructor(g) {
    this.g = g; this.scene = g.scene; this.live = new Map(); this.instHp = new Map(); this.tele = []; this.telePool = { c: [], l: [] };
    this.bossE = {}; this.bossHp = {}; this.cmdE = null; this.cmdPending = null; this.convoys = []; this.convoyT = 0; this.skirm = new Map(); this.aggro = {};
    this.friends = []; this.lib = null; this.probeT = 90; this.scanT = 0; this.mrt = {}; this.lastStage = {}; this.flash = {}; this.warn = null; this.nearMerchant = false; this.repairing = false;
  }
  get G() { return this.g.s.galaxy; }
  get W() { return this.g.s.war; }
  get M() { return this.g.s.missions; }
  reset() { // called when a save is (re)loaded
    for (const T of this.tele) this.freeTele(T); this.tele.length = 0;
    this.live.clear(); this.instHp.clear(); this.bossE = {}; this.bossHp = {}; this.cmdE = null; this.cmdPending = null; this.convoys.length = 0; this.convoyT = 0; this.skirm.clear(); this.aggro = {};
    for (const f of this.friends) this.dropFriend(f); this.friends.length = 0; this.teardownLib(); this.mrt = {}; this.lastStage = {}; this.warn = null; this.g.boss = null; this.drainBoss = this.gravBoss = null;
  }
  update(dt) {
    const g = this.g; if (!g.s.war) return;
    this.scanT -= dt; if (this.scanT <= 0) { this.scanT = 0.5; this.scanInstallations(); this.scanLairs(); this.scanSkirmishes(); if (isPirate(g.gsec) && !g.dead) this.checkStage(g.gsec); }
    this.updateTele(dt); this.updateWar(dt); this.updateConvoys(dt); this.updateCommander(dt); this.updateFriendly(dt); this.updateMissions(dt);
    for (const f of this.friends) if (f.hitT > 0) f.hitT -= dt;
    if (this.warn && g.time > this.warn.until) this.warn = null;
  }
  // ------------------------------------------------------------------ telegraphs
  makeTeleMesh(kind) {
    const mk = (geo, op) => { const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: 0xff3030, transparent: true, opacity: op, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide })); m.renderOrder = 6; return m; };
    const grp = new THREE.Group(); let edge, fill;
    if (kind === 'c') { const ge = new THREE.RingGeometry(0.9, 1, 56); ge.rotateX(-Math.PI / 2); const gf = new THREE.CircleGeometry(1, 48); gf.rotateX(-Math.PI / 2); edge = mk(ge, 0.6); fill = mk(gf, 0.2); }
    else { const ge = new THREE.PlaneGeometry(1, 1); ge.rotateX(-Math.PI / 2); ge.translate(0, 0, 0.5); const gf = ge.clone(); edge = mk(ge, 0.18); fill = mk(gf, 0.3); }
    grp.add(edge, fill); return { grp, edge, fill };
  }
  teleCircle(x, z, r, dur, fire, col = [3.6, 0.5, 0.3], o = {}) {
    const P = this.telePool.c.pop() || this.makeTeleMesh('c'); const T = { kind: o.mine ? 'm' : 'c', x, z, r, dur, t: 0, fire, P, follow: o.follow, dmg: o.dmg, life: o.life || 0, arm: o.arm || 0 };
    this.setTeleCol(P, col); P.grp.position.set(x, 0.12, z); P.grp.rotation.y = 0; P.edge.scale.setScalar(r); P.fill.scale.setScalar(0.01); this.scene.add(P.grp); this.tele.push(T); return T;
  }
  teleLine(x, z, ang, len, w, dur, fire, col = [3.6, 0.5, 0.3], o = {}) {
    const P = this.telePool.l.pop() || this.makeTeleMesh('l'); const T = { kind: 'l', x, z, ang, len, w, dur, t: 0, fire, P, follow: o.follow };
    this.setTeleCol(P, col); P.grp.position.set(x, 0.14, z); P.grp.rotation.y = ang; P.edge.scale.set(w, 1, len); P.fill.scale.set(w, 1, 0.01); this.scene.add(P.grp); this.tele.push(T); return T;
  }
  setTeleCol(P, c) { const k = 0.32; P.edge.material.color.setRGB(c[0] * k, c[1] * k, c[2] * k); P.fill.material.color.setRGB(c[0] * k, c[1] * k, c[2] * k); }
  freeTele(T) { if (T.dead) return; this.scene.remove(T.P.grp); (T.kind === 'l' ? this.telePool.l : this.telePool.c).push(T.P); T.dead = true; }
  updateTele(dt) {
    const g = this.g; const p = g.player;
    for (let i = this.tele.length - 1; i >= 0; i--) {
      const T = this.tele[i]; if (T.dead) { this.tele.splice(i, 1); continue; } T.t += dt;
      if (T.follow) { if (T.follow.dead) { this.freeTele(T); this.tele.splice(i, 1); continue; } T.x = T.follow.x; T.z = T.follow.z; }
      T.P.grp.position.x = T.x; T.P.grp.position.z = T.z; if (T.kind === 'l') T.P.grp.rotation.y = T.ang;
      const flick = 0.5 + 0.5 * Math.sin(g.time * 18);
      if (T.kind === 'm') { // proximity mine
        const armed = T.t > T.arm; T.P.fill.scale.setScalar(T.r * (armed ? 0.35 + 0.1 * flick : 0.15)); T.P.edge.material.opacity = armed ? 0.35 + 0.4 * flick : 0.2;
        const trig = armed && !g.dead && Math.hypot(p.x - T.x, p.z - T.z) < T.r + p.radius * 0.5;
        if (trig || T.t > T.life) { if (trig) { g.boom(T.x, 0.5, T.z, 1.2, [3.6, 1.6, 0.4]); g.hurtPlayer(T.dmg, T.x, T.z, { energy: false }); } this.freeTele(T); this.tele.splice(i, 1); }
        continue;
      }
      const k = Math.min(1, T.t / T.dur);
      if (T.kind === 'c') T.P.fill.scale.setScalar(Math.max(0.01, T.r * k)); else T.P.fill.scale.set(T.w, 1, Math.max(0.01, T.len * k));
      T.P.edge.material.opacity = (T.kind === 'l' ? 0.12 : 0.4) + 0.35 * flick * k; T.P.fill.material.opacity = 0.12 + 0.3 * k;
      if (T.t >= T.dur) { if (T.fire) T.fire(T); this.freeTele(T); this.tele.splice(i, 1); }
    }
  }
  inCircle(T, extra = 0) { const p = this.g.player; return !this.g.dead && Math.hypot(p.x - T.x, p.z - T.z) < T.r + p.radius * 0.5 + extra; }
  inLine(T) { const p = this.g.player; const ux = Math.sin(T.ang), uz = Math.cos(T.ang); const rx = p.x - T.x, rz = p.z - T.z; const along = rx * ux + rz * uz; const perp = Math.abs(rx * uz - rz * ux); return !this.g.dead && along > -1 && along < T.len + 1 && perp < T.w / 2 + p.radius * 0.6; }
  // reinforcement budget: hostile ships near the player (installations, parts, bosses, freighters and battle ships excluded)
  crowded(extra = 0, boss = false) {
    const g = this.g, p = g.player; let n = 0; for (const e of g.enemies) if (!e.dead && !e.D.inst && !e.D.part && !e.D.boss && !e.battle && e.type !== 'freighter' && Math.abs(e.x - p.x) < 170 && Math.abs(e.z - p.z) < 170) n++;
    const cap = (boss ? 14 : this.bossActive() ? 8 : 12) + 3 * Math.min(3, g.gsec.ringI || 0); return n + extra > cap;
  }
  warnText(text, kind = 'boss') { this.warn = { text, kind, until: this.g.time + 2.2 }; this.g.audio.warn && this.g.audio.warn(); }
  // ------------------------------------------------------------------ installations
  scanInstallations() {
    const g = this.g; const p = g.player; const G = this.G; const det = !!g.skillFx().detect;
    for (const sec of [g.gsec, ...neighbours(g.gsec)]) {
      for (const c of caches(sec)) if (!G.caches[c.id] && !g.liveCaches.has(c.id) && Math.hypot(c.x - p.x, c.z - p.z) < 120) g.spawnCache(c, sec);
      if (!isPirate(sec) || G.liberated[sec.id]) continue;
      for (const o of installations(sec)) {
        if (G.inst[o.id]) continue; const d = Math.hypot(o.x - p.x, o.z - p.z);
        if (!G.spot[o.id] && (d < 130 || (det && d < 260))) { G.spot[o.id] = 1; const it = libStages(sec, G).steps[0].items[0]; g.toast(`◎ Identified: ${instName(o)} (${it.have}/${it.need} in ${sec.name})`, 'good'); this.checkStage(sec); }
        if (!this.live.has(o.id) && d < 150) this.spawnInst(o, sec);
      }
    }
    for (const [, L] of this.live) if (Math.hypot(L.o.x - p.x, L.o.z - p.z) > 230 || L.sec.faction !== L.fac) this.despawnInst(L);
    for (const [id, c] of g.liveCaches) if (Math.hypot(c.c.x - p.x, c.c.z - p.z) > 160) { g.freeCache(c); g.liveCaches.delete(id); }
  }
  despawnInst(L) { for (const part of L.parts) if (!part.dead) { this.instHp.set(part.partId, part.hp); this.g.removeEnemy(part); } else this.instHp.set(part.partId, 0); this.live.delete(L.o.id); }
  spawnInst(o, sec) {
    const g = this.g; const fac = sec.faction; const spec = PARTS[o.kind]; const L = { o, sec, fac, parts: [], gens: [], core: null, callT: 12, buildT: 10, summonT: 8, reinf: 0 };
    const add = (type, x, z, partId, extra = {}) => { const hp0 = this.instHp.get(partId); if (hp0 === 0) return null; const e = g.spawnEnemy(type, x, z, { faction: fac, inst: o.id, partId, state: 'attack', ...extra }); e.yaw = type === 'inst_gen' || type === 'inst_turret' ? 0 : rand(0, TAU); if (hp0 > 0) e.hp = Math.min(e.maxHp, hp0); e.vx = e.vz = 0; L.parts.push(e); return e; };
    L.core = add('inst_' + o.kind, o.x, o.z, o.id + ':core', { variant: o.kind, kind: o.kind });
    const R0 = L.core ? L.core.radius : 5;
    for (let k = 0; k < spec.gens; k++) { const a = k / spec.gens * TAU + 0.4; const ge = add('inst_gen', o.x + Math.cos(a) * (R0 + 7), o.z + Math.sin(a) * (R0 + 7), o.id + ':g' + k); if (ge) L.gens.push(ge); }
    const nt = spec.tur + (sec.ringI >= 3 ? 1 : 0); for (let k = 0; k < nt; k++) { const a = k / nt * TAU; add('inst_turret', o.x + Math.cos(a) * (R0 + 14), o.z + Math.sin(a) * (R0 + 14), o.id + ':t' + k); }
    if (!L.core) { this.G.inst[o.id] = 1; for (const part of L.parts) g.removeEnemy(part); return; }
    const F = FACTIONS[fac]; L.dome = makeDome(F ? F.rgb : [3, 0.4, 0.4]); const ds = R0 + 3.5; L.dome.scale.set(ds, ds * 0.75, ds); L.core.group.add(L.dome);
    if (o.kind === 'hq') { L.sdome = makeDome([1.6, 2.4, 3.6]); const s2 = R0 + 8; L.sdome.scale.set(s2, s2 * 0.7, s2); L.core.group.add(L.sdome); }
    L.core.outpost = L; this.live.set(o.id, L);
  }
  hqShield(L) { return L.o.kind === 'hq' && !libStages(L.sec, this.G).hqOpen; }
  updateInst(e, dt, dist, dx, dz) { // every installation part, from Game.updateEnemies
    const g = this.g; if (!g.enemyStatus(e, dt)) return;
    const L = this.live.get(e.inst); e.group.position.set(e.x, 0, e.z); const pulse = e.hitT > 0 ? 1 + e.hitT * 0.25 : 1; e.group.scale.setScalar(pulse);
    if (e.type === 'inst_gen') { e.group.rotation.y += dt * 0.6; return; }
    if (e.type === 'inst_turret') return this.turretAI(e, dt, dist, dx, dz);
    e.group.rotation.y = e.yaw; const spin = e.group.getObjectByName('spin'); if (spin) spin.rotation.y += dt * 0.5;
    if (!L) return;
    { const on = L.gens.some((x) => !x.dead); L.dome.visible = on; L.dome.material.uniforms.uT.value = g.time; const u = L.dome.material.uniforms.uHit; u.value = Math.max(0, u.value - dt * 3); }
    if (L.sdome) { L.sdome.visible = this.hqShield(L); L.sdome.material.uniforms.uT.value = g.time; const u = L.sdome.material.uniforms.uHit; u.value = Math.max(0, u.value - dt * 3); }
    if (g.dead || e.stunT > 0) return;
    const k = e.kind; const danger = Math.max(1, Math.min(3, L.sec.ringI));
    if (k === 'comm' && dist < 85) { L.callT -= dt; if (L.callT <= 0) { L.callT = 32; if (!this.crowded(4)) g.spawnWave(danger, false, { x: e.x, z: e.z }, '📡 Comm array called in reinforcements!'); } }
    else if (k === 'yard' && dist < 110) { L.buildT -= dt; if (L.buildT <= 0) { L.buildT = 24; const n = g.enemies.filter((x) => !x.dead && x.yard === L.o.id).length; if (n < 5 && !this.crowded(1)) { const t = L.fac === 'iron' ? 'gunship' : L.fac === 'void' ? pick(['interceptor', 'ew']) : L.fac === 'eclipse' ? pick(['sniper', 'interceptor']) : danger >= 2 && Math.random() < 0.4 ? 'gunship' : 'interceptor'; const s = g.spawnEnemy(t, e.x + rand(-4, 4), e.z + rand(-4, 4), { faction: L.fac, yard: L.o.id }); s.cloaked = false; s.group.visible = true; g.rings.spawn(e.x, 0.5, e.z, e.radius * 2, FACTIONS[L.fac] ? FACTIONS[L.fac].rgb : [3, 0.5, 0.4], 0.5); g.toast(`⚙ Shipyard launched a new ${s.D.name}`, 'warn'); } } }
    else if (k === 'res' && dist < 80) { L.summonT -= dt; if (L.summonT <= 0) { L.summonT = 26; const n = g.enemies.filter((x) => !x.dead && x.mother === e).length; if (n < 4 && !this.crowded(2)) for (let j = 0; j < 2; j++) g.spawnEnemy('drone', e.x + rand(-5, 5), e.z + rand(-5, 5), { faction: L.fac, mother: e }); } }
    else if (k === 'def' && dist < e.D.range) {
      const tu = e.turrets[0]; if (tu) tu.rotation.y = THREE.MathUtils.damp(tu.rotation.y, Math.atan2(dx, dz) - e.yaw, 3, dt);
      if (e.cd <= 0) { e.cd = 1 / e.D.fireRate * rand(0.85, 1.15); const p = g.player; const tx = p.x + p.vx * 1.1 + rand(-3, 3), tz = p.z + p.vz * 1.1 + rand(-3, 3); const dmg = e.D.dmg * e.dmgMul * 1.6;
        g.audio.enemyShoot('boss', e.x, e.z); g.fx.burst(e.x, 3, e.z, 10, 8, 0.3, 1, 0.1, [3.4, 1.2, 0.4], 3);
        this.teleCircle(tx, tz, 5.5, 1.7, (T) => { g.boom(T.x, 0.5, T.z, 1.5, [3.6, 1.2, 0.4]); if (this.inCircle(T)) g.hurtPlayer(dmg, T.x, T.z, { energy: false }); this.splashFriends(T.x, T.z, T.r, dmg); }, WARN_COL.def); }
    }
    else if (k === 'hq' && dist < 75) {
      L.summonT -= dt; if (L.summonT <= 0) { L.summonT = 15; const n = g.enemies.filter((x) => x.type === 'drone' && !x.dead).length; if (n < 6 && !this.crowded(3)) for (let j = 0; j < 3; j++) g.spawnEnemy('drone', e.x + rand(-7, 7), e.z + rand(-7, 7), { faction: L.fac }); }
      const f = e.hp / e.maxHp; if ((L.reinf === 0 && f < 0.66) || (L.reinf === 1 && f < 0.33)) { L.reinf++; if (!this.crowded(4)) g.spawnWave(Math.min(3, danger + 1), true, { x: e.x, z: e.z }, '☗ The stronghold calls its garrison!'); }
    }
  }
  turretAI(e, dt, dist, dx, dz) {
    const g = this.g; const yaw = Math.atan2(dx, dz);
    for (const tu of e.turrets) { tu.rotation.y = THREE.MathUtils.damp(tu.rotation.y, yaw - e.yaw, e.stunT > 0 ? 0 : 3, dt); if (tu.userData.rec > 0) tu.userData.rec = Math.max(0, tu.userData.rec - dt * 4); tu.userData.barrel.position.z = -(tu.userData.rec || 0) * 0.3; }
    if (!g.dead && dist < e.D.range && e.cd <= 0 && e.stunT <= 0) {
      e.cd = 1 / e.D.fireRate * rand(0.8, 1.2); g.curShooter = e; const ux = dx / dist, uz = dz / dist;
      for (const off of [-0.06, 0.06]) { const c = Math.cos(off), s2 = Math.sin(off); g.enemyShot(e.x + ux * 2.2, e.z + uz * 2.2, ux * c - uz * s2, uz * c + ux * s2, 26, e.D.dmg * e.dmgMul, [3.5, 1.2, 0.3]); }
      for (const tu of e.turrets) tu.userData.rec = 1; g.audio.enemyShoot('gunship', e.x, e.z);
    }
  }
  dmgMod(e, probe) { // [multiplier, label] applied by Game.damageEnemy (probe = targeting query, no hit flash)
    if (e.inst) { const L = this.live.get(e.inst); if (L) {
      if (L.sdome && e.type !== 'inst_turret' && this.hqShield(L)) { if (!probe) L.sdome.material.uniforms.uHit.value = 1; return [0, 'SECTOR SHIELD']; }
      if (e === L.core && L.gens.some((x) => !x.dead)) { if (!probe) L.dome.material.uniforms.uHit.value = 1; return [0.1, 'SHIELDED']; } } }
    if (e.bc && (e.bc.gens.some((x) => !x.dead) || e.bc.invT > 0 || e.bc.cloaked)) return [0, 'SHIELDED'];
    return [1, null];
  }
  instDestroyed(e) {
    const g = this.g; const L = this.live.get(e.inst); this.instHp.set(e.partId, 0); if (!L) return;
    if (e.type === 'inst_gen') { const left = L.gens.filter((x) => !x.dead).length; g.toast(left ? `Shield generator destroyed (${left} left)` : `All generators down: the ${INST_KINDS[L.o.kind].name} is exposed!`, 'good'); if (!left) { g.audio.shieldDown(); g.rings.spawn(L.o.x, 1, L.o.z, 16, [0.6, 2, 3.4], 0.8); } }
    if (e !== L.core) return;
    const G = this.G; const o = L.o; G.inst[o.id] = 1; G.spot[o.id] = 1; g.s.stats.outposts++;
    for (const part of L.parts) if (!part.dead && part !== e) { part.hp = 0; part.noLoot = true; g.killEnemy(part); }
    this.live.delete(o.id);
    for (let k = 0; k < 5; k++) setTimeout(() => g.boom(e.x + rand(-9, 9), 0.5, e.z + rand(-9, 9), 1.8, FACTIONS[e.faction] ? FACTIONS[e.faction].rgb : [3.2, 0.6, 0.4], k % 2 === 0), 120 + k * 160);
    g.flashes.spawn(e.x, 3, e.z, 120, 0xffb070, 0.6, 50);
    const th = Math.max(1, L.sec.threat); g.dropLoot(e.x, e.z, 'installation', th, o.kind === 'hq' ? 2 : 1); if (th >= 4 || o.kind === 'hq') g.dropLoot(e.x, e.z, 'installation', th);
    if (o.kind === 'res') { const keys = ['stellarite', 'viridium', 'crimsonite', 'voidstone']; for (let k = 0; k < 3; k++) g.minerals.spawn(e.x, e.z, pick(keys), 6, 12); }
    const msg = { comm: 'enemy coordination disrupted', res: `${FACTIONS[L.fac] ? FACTIONS[L.fac].name : 'faction'} income reduced`, yard: 'no more replacement ships', def: 'artillery cover removed', hq: 'the stronghold has fallen' }[o.kind];
    g.toast(`${instName(o)} destroyed: ${msg}`, 'level'); g.emit('outpost', { kind: o.kind });
    if (o.kind === 'hq') {
      const B = BOSSES[L.fac];
      if (isHome(L.sec)) g.toast(`Only the ${B ? B.ship : 'flagship'} remains. Defeat ${B ? B.name : 'the faction leader'} to liberate ${L.sec.name}!`, 'warn');
      else if (!G.cmd[L.sec.id]) { const C = commanderFor(L.sec, L.fac); this.cmdPending = { sec: L.sec, x: o.x, z: o.z, t: g.time + 4.5, fac: L.fac }; g.toast(`☠ ${C.name} is warping in to defend ${L.sec.name}!`, 'warn'); g.audio.alarm(); }
    }
    this.checkStage(L.sec); g.save();
  }
  // ------------------------------------------------------------------ liberation stages
  checkStage(sec) {
    const g = this.g; const G = this.G; if (G.liberated[sec.id] || !isPirate(sec)) return;
    const st = libStages(sec, G); g.libProg = { id: sec.id, v: st.pct, t: g.time };
    const prev = this.lastStage[sec.id] ?? st.stage; this.lastStage[sec.id] = st.stage;
    if (st.stage > prev && st.stage < 5) { g.toast(`✔ ${STAGES[prev].name} complete · Next: ${STAGES[st.stage].name}`, 'level'); g.audio.quest(); g.ui && g.ui.stageNotice && g.ui.stageNotice(sec, st); if (st.hqOpen && prev < 3 && st.stage >= 3) g.toast(`The ${sec.name} stronghold shield is DOWN!`, 'good'); }
    if (st.steps.slice(0, 5).every((s) => s.done)) g.liberate(sec);
  }
  eliteBoost() { const sec = this.g.gsec; if (!isPirate(sec) || this.G.liberated[sec.id]) return 0; return libStages(sec, this.G).stage === 2 ? 0.45 : 0; }
  directorMod() { // comm arrays and shipyards make the sector busier (shorter spawn timers)
    const sec = this.g.gsec; if (!isPirate(sec) || this.G.liberated[sec.id]) return 1; let m = 1;
    for (const o of installations(sec)) if (!this.G.inst[o.id]) { if (o.kind === 'comm') m *= 0.85; if (o.kind === 'yard') m *= 0.88; } return m;
  }
  clearSector(sec) { for (const [, L] of this.live) if (L.sec === sec) { for (const part of L.parts) if (!part.dead) this.g.removeEnemy(part); this.live.delete(L.o.id); } }
  // ------------------------------------------------------------------ convoys (disruption stage + convoy missions)
  updateConvoys(dt) {
    const g = this.g; const p = g.player; const G = this.G; const sec = g.gsec;
    if (isPirate(sec) && !G.liberated[sec.id] && !g.dead && !g.docked) {
      const st = libStages(sec, G); const need = st.steps[1].items[2];
      if (st.stage >= 1 && need.have < need.need && !this.convoys.some((c) => c.kind === 'supply')) { if (!this.convoyT) this.convoyT = g.time + 18; if (g.time > this.convoyT) { this.convoyT = g.time + 75; this.spawnConvoy(sec, { kind: 'supply', n: sec.ring === 'F' ? 1 : 2 }); } }
    }
    for (let i = this.convoys.length - 1; i >= 0; i--) {
      const C = this.convoys[i]; let alive = 0;
      for (const f of C.fr) { if (f.dead) continue; alive++; const d = Math.hypot(f.x - C.dest.x, f.z - C.dest.z); const dp = Math.hypot(f.x - p.x, f.z - p.z);
        if (d < 10 || dp > 260) { g.fx.burst(f.x, 0.6, f.z, 18, 10, 0.4, 0.9, 0.1, [0.6, 2.2, 3.4], 3); g.removeEnemy(f); C.escaped++; alive--; if (dp <= 260) g.toast('A supply freighter jumped away!', 'warn'); } }
      if (!alive) { for (const e of C.esc) if (!e.dead) e.convoy = null; this.convoys.splice(i, 1); if (C.m) this.convoyMissionCheck(C); }
    }
  }
  spawnConvoy(sec, o) {
    const g = this.g; const p = g.player; const fac = o.fac || sec.faction; let start, dest;
    if (o.from) { start = o.from; dest = o.to; }
    else { const a = rand(0, TAU); const px = -Math.sin(a), pz = Math.cos(a); const off = rand(-20, 20); start = { x: p.x + Math.cos(a) * 95 + px * off, z: p.z + Math.sin(a) * 95 + pz * off }; dest = { x: p.x - Math.cos(a) * 170 + px * off, z: p.z - Math.sin(a) * 170 + pz * off }; }
    const C = { kind: o.kind, sec, fac, fr: [], esc: [], dest, escaped: 0, m: o.m || null };
    const ux = dest.x - start.x, uz = dest.z - start.z, ud = Math.hypot(ux, uz) || 1;
    for (let k = 0; k < o.n; k++) { const f = g.spawnEnemy('freighter', start.x - ux / ud * k * 9, start.z - uz / ud * k * 9, { faction: fac, convoy: C, dest, mid: o.m ? o.m.id : null, cloaked: false }); f.group.visible = true; f.yaw = Math.atan2(ux, uz); C.fr.push(f); }
    const nE = 2 + (sec.ringI >= 2 ? 1 : 0); for (let k = 0; k < nE; k++) { const t = k === 2 ? 'gunship' : pick(FLEET[fac] || FLEET.neutral).replace('capital', 'gunship'); const e = g.spawnEnemy(t, start.x + rand(-8, 8), start.z + rand(-8, 8), { faction: fac, convoy: C, cloaked: false }); e.group.visible = true; C.esc.push(e); }
    this.convoys.push(C); g.audio.alarm(); g.toast(o.kind === 'supply' ? `⇶ ${FACTIONS[fac] ? FACTIONS[fac].short : 'Pirate'} supply convoy detected: intercept the freighters!` : '⇶ Target convoy on the move: destroy the freighters!', 'warn');
    return C;
  }
  // ------------------------------------------------------------------ commanders & flagships
  scanLairs() {
    const g = this.g; const p = g.player; const G = this.G;
    for (const fk of FACTION_KEYS) {
      if (G.bosses[fk] || this.bossE[fk]) continue; const L = LAIRS[fk]; const home = HOME[fk];
      if (G.liberated[home.id]) continue;
      if (Math.hypot(p.x - L.x, p.z - L.z) < 160) this.spawnBoss(BOSSES[fk], L.x, L.z, { home: true });
    }
    // the sector commander returns to the stronghold ruins until defeated
    const sec = g.gsec;
    if (!this.cmdE && !this.cmdPending && isPirate(sec) && !G.liberated[sec.id] && !isHome(sec) && !G.cmd[sec.id] && libStages(sec, G).cmdOpen) {
      const hq = installations(sec).find((o) => o.kind === 'hq'); if (hq && Math.hypot(hq.x - p.x, hq.z - p.z) < 150) this.cmdPending = { sec, x: hq.x, z: hq.z, t: g.time + 1.5, fac: sec.faction };
    }
  }
  updateCommander() {
    const g = this.g; const P = this.cmdPending; if (!P || g.time < P.t) return; this.cmdPending = null;
    if (this.cmdE || this.G.cmd[P.sec.id] || this.G.liberated[P.sec.id]) return;
    const def = commanderFor(P.sec, P.fac); const a = Math.atan2(g.player.z - P.z, g.player.x - P.x);
    const x = P.x + Math.cos(a) * 20, z = P.z + Math.sin(a) * 20;
    g.flashes.spawn(x, 3, z, 80, 0xff66ee, 0.5, 40); g.rings.spawn(x, 0.5, z, 24, FACTIONS[P.fac] ? FACTIONS[P.fac].rgb : [3, 0.5, 2], 0.9); g.audio.warp();
    this.spawnBoss(def, x, z, { sec: P.sec.id, wake: true });
  }
  bossHpFor(def, sec) { // time-to-kill based (see balance.js): commanders at their sector's ring level, flagships at FLAGSHIP_L0
    const lv = this.g.s.level; if (def.commander) return Math.round(ttkHp('commander', lv, RING_L0[sec ? sec.ring : 'R'] || 11, def.armor) * (sec && sec.threat >= 4 ? 1.25 : 1));
    return Math.round(ttkHp('flagship', lv, FLAGSHIP_L0, def.armor) * def.hp / 15000);
  }
  spawnBoss(def, x, z, o = {}) {
    const g = this.g; const fk = def.fk; const type = def.commander ? 'commander' : 'flagship';
    const D = { ...ENEMIES[type], name: def.name, armor: def.armor, speed: def.speed, dmg: def.dmg, radius: def.radius };
    const hp = this.bossHpFor(def, o.sec ? SECTOR_BY_ID[o.sec] : null); const keep = !def.commander && this.bossHp[fk];
    const e = g.spawnEnemy(type, x, z, { faction: fk, variant: def.commander ? '' : fk, D, hp: keep ? keep.hp : hp, maxHp: hp, shield: 0, maxShield: 0, armor: def.armor, speedMul: 1, dmgMul: dmgK(g.s.level, def.commander ? (RING_L0[(SECTOR_BY_ID[o.sec] || {}).ring] || 11) : FLAGSHIP_L0), cloaked: false, state: o.wake ? 'attack' : 'idle', elite: false, threat: 5 });
    e.group.visible = true; e.yaw = Math.atan2(g.player.x - x, g.player.z - z);
    e.bc = { def, phase: keep ? keep.phase : 0, atkT: 3, atkI: 0, sumT: 6, invT: 0, gens: [], parts: [], anchor: { x, z }, chargeT: 0, distAcc: 0, distN: 0, mode: null, modeT: 6, home: !!o.home, sec: o.sec };
    const php = Math.round(hp * (def.commander ? 0.12 : 0.06));
    for (const pd of def.parts) { if (keep && keep.lost && keep.lost.includes(pd.name)) continue; const pe = g.spawnEnemy('bpart', x + pd.x, z + pd.z, { faction: fk, variant: pd.k, D: { ...ENEMIES.bpart, name: pd.name }, hp: php, maxHp: php, shield: 0, maxShield: 0, armor: 0.15, dmgMul: 1, cloaked: false, parent: e, off: pd, partK: pd.k, weak: pd.weak, threat: 5 }); pe.group.visible = true; e.bc.parts.push(pe); }
    if (def.commander) this.cmdE = e; else this.bossE[fk] = e;
    if (o.wake) this.wake(e);
    return e;
  }
  wake(e) {
    const g = this.g; const bc = e.bc; const def = bc.def; e.state = 'attack'; g.boss = e; bc.anchor = { x: e.x, z: e.z };
    if (!def.commander) this.G.bossSeen[def.fk] = 1;
    g.toast(`☠ ${def.name}${def.commander ? '' : ', ' + def.title}: ${def.intro || '"All ships, engage the intruder!"'}`, 'warn'); g.audio.alarm(); g.ui && g.ui.bossIntro && g.ui.bossIntro(def, bc.phase);
  }
  partsLost(e, weak) { const all = e.bc.parts.filter((x) => x.weak === weak); if (!all.length) return 0; return all.filter((x) => x.dead).length / all.length; }
  enterPhase(e, i) {
    const g = this.g; const bc = e.bc; const def = bc.def; const P = def.phases[i]; bc.phase = i; bc.invT = 1.4; bc.atkT = 2.2; bc.sumT = 0.5;
    if (!(g.ui && g.ui.bossPhase)) g.toast(`☠ ${def.name}: ${P.name}!`, 'warn'); g.audio.bossPhase ? g.audio.bossPhase() : g.audio.alarm(); g.ui && g.ui.bossPhase && g.ui.bossPhase(def, i);
    g.rings.spawn(e.x, 0.5, e.z, e.radius * 3, FACTIONS[def.fk] ? FACTIONS[def.fk].rgb : [3, 0.5, 2], 0.9); g.addShake(0.4, e.x, e.z);
    if (P.rage) e.speedMul = (e.speedMul || 1) * 1.25;
    if (P.shieldGens) { const n = P.shieldGens; const hp = Math.round(e.maxHp * 0.045);
      for (let k = 0; k < n; k++) { const ge = g.spawnEnemy('bpart', e.x, e.z, { faction: def.fk, variant: 'gen', D: { ...ENEMIES.bpart, name: 'Shield Pylon' }, hp, maxHp: hp, shield: 0, maxShield: 0, armor: 0.1, dmgMul: 1, cloaked: false, parent: e, orbitR: e.radius + 9, orbitA: k / n * TAU, partK: 'gen', threat: 5 }); ge.group.visible = true; bc.gens.push(ge); }
      g.toast(`Shield pylons online: destroy all ${n} to breach ${def.name}'s shields!`, 'warn'); }
  }
  updatePart(e, dt, dist, dx, dz) { // destructible boss components follow their parent ship
    const g = this.g; const P = e.parent; if (!P || P.dead) { g.removeEnemy(e); return; }
    if (!g.enemyStatus(e, dt)) return;
    if (e.orbitR) { e.orbitA += dt * 0.35; e.x = P.x + Math.cos(e.orbitA) * e.orbitR; e.z = P.z + Math.sin(e.orbitA) * e.orbitR; e.group.position.set(e.x, 1 + Math.sin(g.time * 2 + e.orbitA) * 0.4, e.z); e.group.rotation.y += dt;
      if (Math.random() < 0.5 * g.fx.budget) { const t = Math.random(); g.fx.emit(e.x + (P.x - e.x) * t, 1.2, e.z + (P.z - e.z) * t, 0, 0, 0, 0.25, 0.8, 0.2, 0.6, 2, 3.6, 1); } return; }
    const o = e.off; const c = Math.cos(P.yaw), s = Math.sin(P.yaw);
    e.x = P.x + c * o.x + s * o.z; e.z = P.z - s * o.x + c * o.z; e.group.position.set(e.x, 1.4, e.z); e.group.rotation.y = P.yaw; e.group.visible = P.group.visible;
    const pulse = e.hitT > 0 ? 1 + e.hitT * 0.5 : 1; e.group.scale.setScalar(pulse);
    for (const tu of e.turrets) tu.rotation.y = THREE.MathUtils.damp(tu.rotation.y, Math.atan2(dx, dz) - P.yaw, 4, dt);
    if (P.state === 'attack' && e.partK === 'cannon' && e.cd <= 0 && dist < 40 && !g.dead && e.stunT <= 0 && P.group.visible) { e.cd = rand(1.6, 2.4); g.curShooter = P; const ux = dx / dist, uz = dz / dist; g.enemyShot(e.x + ux * 1.5, e.z + uz * 1.5, ux, uz, 28, P.D.dmg * 0.55, [3.5, 0.6, 0.3]); g.audio.enemyShoot('gunship', e.x, e.z); }
  }
  partDestroyed(e) {
    const g = this.g; const P = e.parent; if (!P || P.dead) return; const bc = P.bc;
    if (e.partK === 'gen') { const left = bc.gens.filter((x) => !x.dead).length; g.toast(left ? `Shield pylon destroyed (${left} left)` : `${bc.def.name}'s shields are DOWN!`, 'good'); if (!left) { g.audio.shieldDown(); g.rings.spawn(P.x, 1, P.z, P.radius * 3, [0.6, 2, 3.4], 0.8); } return; }
    const dmg = P.maxHp * 0.035; P.hp = Math.max(1, P.hp - dmg); P.armor = Math.max(0, P.armor - 0.04);
    const eff = { bombard: 'bombardment weakened', salvo: 'missile salvos disabled', speed: 'engines crippled', cloak: 'cloaking disabled', drain: 'drain fields disabled', lance: 'lance strikes disabled', sweep: 'prism sweeps weakened', gravity: 'gravity wells disabled', mines: 'minelaying disabled', charge: 'ramming charge disabled', summon: 'reinforcements cut off', nova: 'overload nova weakened' }[e.weak] || 'armour breached';
    g.toast(`${e.D.name} destroyed: ${eff}!`, 'good'); g.ui && g.ui.float(P.x, 4, P.z, `-${Math.round(dmg)} STRUCTURE`, '#ffd166', true);
    if (e.weak === 'speed' && this.partsLost(P, 'speed') >= 1) P.speedMul = (P.speedMul || 1) * 0.6;
  }
  bossAI(e, dt, dist, dx, dz) { // movement / fire intent for flagships and commanders
    const g = this.g; const bc = e.bc; const def = bc.def; const p = g.player;
    if (e.state === 'idle') { if (dist < 72 || e.hp < e.maxHp) this.wake(e); else { e.yaw += dt * 0.05; return { tx: e.x, tz: e.z, spd: 0, wantFire: false }; } }
    if (!g.boss || g.boss.dead || (g.boss !== e && Math.hypot(g.boss.x - p.x, g.boss.z - p.z) > dist)) g.boss = e;
    while (bc.phase + 1 < def.phases.length && e.hp / e.maxHp <= def.phases[bc.phase + 1].at) this.enterPhase(e, bc.phase + 1);
    const P = def.phases[bc.phase]; if (bc.invT > 0) bc.invT -= dt;
    let attacks = P.attacks; let keep = 18 + e.radius;
    if (P.adapt) { bc.distAcc += dist * dt; bc.distN += dt; bc.modeT -= dt; if (bc.modeT <= 0) { const avg = bc.distAcc / Math.max(0.1, bc.distN); bc.distAcc = bc.distN = 0; bc.modeT = 7; const mode = avg > 26 ? 'pursuit' : 'kite'; if (mode !== bc.mode) { bc.mode = mode; g.toast(`${def.name} adapts: ${mode === 'pursuit' ? 'pursuit doctrine (closing in)' : 'kiting doctrine (mines and novas)'}`, 'warn'); } }
      if (bc.mode === 'pursuit') { attacks = ['charge', 'lance', 'spread']; keep = 12; } else if (bc.mode === 'kite') { attacks = ['nova', 'mines', 'spread']; keep = 30; } }
    if (bc.chargeT > 0) { bc.chargeT -= dt; e.vx = bc.cvx; e.vz = bc.cvz; if (!bc.chargeHit && dist < e.radius + p.radius + 1) { bc.chargeHit = true; g.hurtPlayer(e.D.dmg * 2.4, e.x, e.z, { energy: false }); g.addShake(0.6); } if (Math.random() < 0.8) g.fx.emit(e.x - bc.cvx * 0.05, 0.4, e.z - bc.cvz * 0.05, 0, 0, 0, 0.4, e.radius, 0.3, 3.4, 1.2, 0.4, 2); return { raw: true, wantFire: false }; }
    if (bc.cloaked) { bc.cloakT -= dt; if (bc.cloakT <= 0) { bc.cloaked = false; e.group.visible = true; g.fx.burst(e.x, 1, e.z, 40, 14, 0.5, 1.4, 0.1, [1.8, 0.6, 3.6], 2); this.attack(e, 'lance'); } return { tx: bc.cx, tz: bc.cz, spd: e.D.speed * 3, wantFire: false }; }
    if (P.summon && this.partsLost(e, 'summon') < 1) { bc.sumT -= dt; if (bc.sumT <= 0) { bc.sumT = P.summon.every; const n = g.enemies.filter((x) => !x.dead && x.summoner === e).length; if (n < 8 && !this.crowded(P.summon.types.length, true)) { for (const t of P.summon.types) { const a = rand(0, TAU); const s = g.spawnEnemy(t, e.x + Math.cos(a) * (e.radius + 6), e.z + Math.sin(a) * (e.radius + 6), { faction: def.fk, summoner: e }); s.cloaked = false; s.group.visible = true; } g.rings.spawn(e.x, 0.5, e.z, e.radius * 2.5, FACTIONS[def.fk] ? FACTIONS[def.fk].rgb : [3, 0.5, 2], 0.6); g.toast(`${def.name} calls reinforcements!`, 'warn'); } } }
    bc.atkT -= dt; if (bc.atkT <= 0 && !g.dead) { const atk = attacks[bc.atkI++ % attacks.length]; bc.atkT = P.every * rand(0.9, 1.1); this.attack(e, atk); }
    const a = Math.atan2(-dz, -dx) + Math.sin(g.time * 0.25) * 0.9; let tx = p.x + Math.cos(a) * keep, tz = p.z + Math.sin(a) * keep;
    if (Math.hypot(e.x - bc.anchor.x, e.z - bc.anchor.z) > 140) { tx = bc.anchor.x; tz = bc.anchor.z; }
    const ring = e.group.getObjectByName('ring'); if (ring) ring.rotation.y += dt * (P.rage ? 2 : 0.8);
    return { tx, tz, spd: e.D.speed * (e.speedMul || 1), wantFire: dist < e.D.range };
  }
  attack(e, atk) { // every damaging attack is telegraphed by a warning zone first
    const g = this.g; const bc = e.bc; const p = g.player; const B = e.D.dmg * (e.dmgMul || 1); const fcol = FACTIONS[bc.def.fk] ? FACTIONS[bc.def.fk].rgb : [3.5, 0.6, 0.4];
    if (this.partsLost(e, atk) >= 1 && !['bombard', 'spread', 'sweep', 'nova'].includes(atk)) atk = 'spread';
    const k = 1 - 0.5 * this.partsLost(e, atk); const W = ATTACKS[atk]; if (W.warn) this.warnText(`⚠ ${W.warn}`);
    const px = p.x + p.vx * 0.7, pz = p.z + p.vz * 0.7; const ang = Math.atan2(p.x - e.x, p.z - e.z); const pd = Math.hypot(p.x - e.x, p.z - e.z);
    switch (atk) {
      case 'bombard': { const n = Math.max(2, Math.round((bc.phase >= 3 ? 6 : 4) * k)); for (let i = 0; i < n; i++) { const a = rand(0, TAU), r = i === 0 ? 0 : rand(3, 11); setTimeout(() => { if (e.dead) return; this.teleCircle(px + Math.cos(a) * r, pz + Math.sin(a) * r, 5.5, 1.6, (T) => { g.boom(T.x, 0.5, T.z, 1.6, fcol); g.addShake(0.2, T.x, T.z); if (this.inCircle(T)) g.hurtPlayer(B * 2.2, T.x, T.z, { energy: true }); }, [3.6, 0.6, 0.3]); }, i * 140); } g.audio.enemyShoot('boss', e.x, e.z); break; }
      case 'salvo': { const n = Math.max(2, Math.round(6 * k)); for (let i = 0; i < n; i++) { const d = pd - 8 + i * 4.5; const sx = e.x + Math.sin(ang) * d + rand(-3, 3), sz = e.z + Math.cos(ang) * d + rand(-3, 3);
          this.teleCircle(sx, sz, 3.8, 1.1 + i * 0.13, (T) => { g.boom(T.x, 0.5, T.z, 1, [3.4, 1.4, 0.4], false); if (this.inCircle(T)) g.hurtPlayer(B * 1.4, T.x, T.z, { energy: false }); }, [3.6, 1.4, 0.3]); }
        for (let i = 0; i < 6; i++) g.fx.emit(e.x, 2, e.z, rand(-6, 6), 8, rand(-6, 6), 0.6, 1, 0.2, 3.4, 1.4, 0.4, 2); g.audio.enemyShoot('gunship', e.x, e.z); break; }
      case 'spread': { const n = bc.phase >= 2 ? 24 : 16; g.curShooter = e; for (let i = 0; i < n; i++) { const a2 = i / n * TAU + g.time; g.enemyShot(e.x, e.z, Math.cos(a2), Math.sin(a2), 15, B * 0.7, fcol); } g.audio.enemyShoot('boss', e.x, e.z); break; }
      case 'nova': { const r = (22 + e.radius) * (0.75 + 0.25 * k); this.teleCircle(e.x, e.z, r, 2.1, (T) => { g.rings.spawn(T.x, 0.5, T.z, T.r, fcol, 0.7); g.flashes.spawn(T.x, 3, T.z, T.r * 2, 0xffaa66, 0.5, 40); g.addShake(0.5); if (this.inCircle(T)) g.hurtPlayer(B * 3, T.x, T.z, { energy: true }); }, [3.6, 0.9, 0.5], { follow: e }); break; }
      case 'charge': { const len = 60; this.teleLine(e.x, e.z, ang, len, e.radius * 1.6, 1.3, () => { if (e.dead) return; bc.chargeT = 1.0; bc.chargeHit = false; bc.cvx = Math.sin(ang) * len; bc.cvz = Math.cos(ang) * len; g.audio.ability('dash', e.x, e.z); }, [3.6, 0.5, 0.3], { follow: e }); break; }
      case 'lance': { this.teleLine(e.x, e.z, ang, 75, 2.8, 1.15, (T) => { this.beam(T, fcol); if (this.inLine(T)) g.hurtPlayer(B * 2.6, e.x, e.z, { energy: true }); }, [2.6, 0.6, 3.6], { follow: e }); break; }
      case 'sweep': { const n = bc.phase >= 3 ? 5 : 3; for (let i = 0; i < n; i++) { const a = ang + (i - (n - 1) / 2) * 0.38 * (0.6 + 0.4 * k); this.teleLine(e.x, e.z, a, 70, 2.4, 1.1 + i * 0.25, (T) => { this.beam(T, fcol); if (this.inLine(T)) g.hurtPlayer(B * 2, e.x, e.z, { energy: true }); }, [3.6, 2.6, 0.6], { follow: e }); } break; }
      case 'cloak': { bc.cloaked = true; bc.cloakT = 2.2; e.group.visible = false; const a = rand(0, TAU); bc.cx = p.x + Math.cos(a) * 24; bc.cz = p.z + Math.sin(a) * 24; g.fx.burst(e.x, 1, e.z, 40, 14, 0.5, 1.4, 0.1, [1.8, 0.6, 3.6], 2); break; }
      case 'drain': { const r = 21; this.teleCircle(e.x, e.z, r, 6, null, WARN_COL.drain, { follow: e }); bc.drainT = 6; bc.drainR = r; this.drainBoss = e; break; }
      case 'gravity': { this.teleCircle(e.x, e.z, 34, 2.6, (T) => { const r2 = 13; g.rings.spawn(T.x, 0.5, T.z, r2, [0.5, 2.4, 3.6], 0.6); if (!g.dead && Math.hypot(p.x - T.x, p.z - T.z) < r2 + p.radius) g.hurtPlayer(B * 2.8, T.x, T.z, { energy: true }); }, WARN_COL.gravity, { follow: e }); bc.gravT = 2.6; this.gravBoss = e; break; }
      case 'mines': { for (let i = 0; i < 7; i++) { const a = rand(0, TAU), r = rand(6, 24); this.teleCircle(p.x + Math.cos(a) * r, p.z + Math.sin(a) * r, 2.6, 0, null, WARN_COL.mine, { mine: true, arm: 1.2, life: 16, dmg: B * 1.6 }); } break; }
    }
  }
  beam(T, col) { const g = this.g; const ux = Math.sin(T.ang), uz = Math.cos(T.ang); for (let i = 0; i < 26; i++) { const t = i / 25 * T.len; g.fx.emit(T.x + ux * t, 0.8, T.z + uz * t, 0, 0, 0, 0.35, T.w * 1.4, 0.4, col[0], col[1], col[2], 0); } g.flashes.spawn(T.x + ux * T.len * 0.3, 2, T.z + uz * T.len * 0.3, 40, 0xcc88ff, 0.25, 30); g.audio.enemyShoot('boss', T.x, T.z); g.addShake(0.25); }
  bossFields(dt) { // continuous effects: drain fields and gravity wells
    const g = this.g; const p = g.player;
    const d = this.drainBoss; if (d && !d.dead && d.bc.drainT > 0) { d.bc.drainT -= dt; if (!g.dead && Math.hypot(p.x - d.x, p.z - d.z) < d.bc.drainR) { p.energy = Math.max(0, p.energy - 28 * dt); p.sh = Math.max(0, p.sh - g.stats().shield * 0.12 * dt); if (Math.random() < 0.6) g.fx.emit(p.x + rand(-1, 1), 0.8, p.z + rand(-1, 1), (d.x - p.x) * 0.5, 0.5, (d.z - p.z) * 0.5, 0.6, 0.8, 0.2, 2, 0.6, 3.6, 1); } }
    const v = this.gravBoss; if (v && !v.dead && v.bc.gravT > 0) { v.bc.gravT -= dt; const dx = v.x - p.x, dz = v.z - p.z, dd = Math.hypot(dx, dz) || 1; if (!g.dead && dd < 34 && g.dashT <= 0) { p.vx += dx / dd * 22 * dt; p.vz += dz / dd * 22 * dt; } }
  }
  bossKilled(e) {
    const g = this.g; const bc = e.bc; const def = bc.def; const G = this.G; const fk = def.fk; if (g.boss === e) g.boss = null;
    for (const x of [...bc.parts, ...bc.gens]) if (!x.dead) g.removeEnemy(x);
    for (const x of g.enemies) if (!x.dead && x.summoner === e) { g.fx.burst(x.x, 0.6, x.z, 14, 10, 0.4, 0.8, 0.1, [0.6, 2.2, 3.4], 3); g.removeEnemy(x); }
    for (let k = 0; k < 8; k++) setTimeout(() => g.boom(e.x + rand(-e.radius, e.radius), 0.5, e.z + rand(-e.radius, e.radius), def.commander ? 1.6 : 2.4, FACTIONS[fk] ? FACTIONS[fk].rgb : [3, 0.6, 0.4], k % 2 === 0), k * 170);
    g.flashes.spawn(e.x, 4, e.z, 200, 0xffc080, 0.9, 70); g.addShake(1.0, e.x, e.z);
    if (def.commander) {
      G.cmd[bc.sec] = 1; this.cmdE = null; const sec = SECTOR_BY_ID[bc.sec]; const th = Math.max(1, sec.threat);
      g.addCredits(1200 * th); g.addXP(350 * th); g.s.parts += 15 * th; g.dropLoot(e.x, e.z, 'commander', th, 2); g.dropLoot(e.x, e.z, 'commander', th, 1);
      g.toast(`${def.name} defeated!`, 'level'); g.emit('commander', { sec: bc.sec }); this.checkStage(sec);
    } else {
      G.bosses[fk] = 1; G.cmd[HOME[fk].id] = 1; delete this.bossE[fk]; delete this.bossHp[fk]; g.s.stats.bosses++;
      g.addCredits(25000); g.addXP(6000); g.s.parts += 250;
      const R = def.reward; const it = makeItem(R.t, R.r, Math.max(g.s.level, 25), `Flagship: ${def.name}`, { name: R.name, sp: R.sp, bp: R.bp });
      g.s.blueprints[R.bp] = 1; if (g.s.inv.length >= INV_CAP) { g.s.inv.push(it); g.s.stats.items++; } else g.addItem(it); for (let k = 0; k < 2; k++) g.dropLoot(e.x + rand(-4, 4), e.z + rand(-4, 4), 'boss', 5, 3);
      g.minerals.spawn(e.x, e.z, 'voidstone', 25, 16); g.minerals.spawn(e.x, e.z, 'crimsonite', 25, 16);
      const lost = bossCollapse(G, this.W, fk); for (const id of lost) this.flash[id] = g.time;
      g.toast(`☠ ${def.name} DEFEATED! ${R.name} recovered and its blueprint unlocked.`, 'level');
      g.ui && g.ui.bossDefeated && g.ui.bossDefeated(def, it, lost.map((id) => SECTOR_BY_ID[id].name));
      g.emit('boss', { fk }); this.checkStage(HOME[fk]);
    }
    g.save();
  }
  onRemove(e) { // a boss despawned by distance keeps its damage for this session
    if (e.bc && !e.bc.def.commander) { const fk = e.bc.def.fk; this.bossHp[fk] = { hp: e.hp, phase: e.bc.phase, lost: e.bc.parts.filter((x) => x.dead).map((x) => x.D.name) }; delete this.bossE[fk]; for (const x of [...e.bc.parts, ...e.bc.gens]) if (!x.dead) this.g.removeEnemy(x); }
    if (e.bc && e.bc.def.commander) { this.cmdE = null; for (const x of e.bc.parts) if (!x.dead) this.g.removeEnemy(x); }
    if (this.g.boss === e) this.g.boss = null;
  }
  bossActive() { const b = this.g.boss; return b && !b.dead && b.state === 'attack' ? b : null; }
  instNear(r = 70) { const p = this.g.player; for (const [, L] of this.live) if (Math.hypot(L.o.x - p.x, L.o.z - p.z) < r) return true; return false; }
  // ------------------------------------------------------------------ faction warfare
  warCfg() { return WAR_LEVELS[this.g.s.settings.war || 'normal'] || WAR_LEVELS.normal; }
  updateWar(dt) {
    const g = this.g; const w = this.W; const cfg = this.warCfg(); if (!cfg.on) return;
    w.clock += dt; if (w.clock < w.next) return; w.next = w.clock + cfg.tick * rand(0.8, 1.2);
    this.applyWarEvents(warTick(w, this.G, cfg, { playerSec: g.gsec.id }));
  }
  applyWarEvents(evs) {
    const g = this.g; const G = this.G; const near = (id) => { const s = SECTOR_BY_ID[id]; return s === g.gsec || neighbours(g.gsec).includes(s); };
    for (const ev of evs) {
      if (ev.kind === 'battle') { const b = ev.battle; const sec = SECTOR_BY_ID[b.sec]; if (near(b.sec) || G.explored[b.sec]) g.toast(`⚔ The ${FACTIONS[b.a].name} are attacking ${sec.name}${near(b.sec) ? ' (nearby!)' : ''}`, near(b.sec) ? 'warn' : ''); }
      else if (ev.kind === 'flip') { const sec = SECTOR_BY_ID[ev.sec]; this.flash[ev.sec] = g.time; this.endSkirmish(ev.battle); if (G.explored[ev.sec] || near(ev.sec)) g.toast(`⚑ The ${FACTIONS[ev.a].name} seized ${sec.name}${FACTIONS[ev.d] ? ' from the ' + FACTIONS[ev.d].name : ''}`, 'warn'); if (sec === g.gsec) g.ui && g.ui.sectorBanner(sec, { flip: true }); delete this.lastStage[ev.sec]; }
      else if (ev.kind === 'repelled') { this.endSkirmish(ev.battle); if (near(ev.sec)) g.toast(`${FACTIONS[ev.d] ? 'The ' + FACTIONS[ev.d].name : 'Local militia'} repelled the ${FACTIONS[ev.a].name} at ${SECTOR_BY_ID[ev.sec].name}`); }
      else if (ev.kind === 'alliance') g.toast(`🤝 The ${FACTIONS[ev.a].name} and ${FACTIONS[ev.b].name} formed a pact against the ${FACTIONS[ev.vs].name}`);
    }
    if (evs.length) g.save();
  }
  scanSkirmishes() {
    const g = this.g; const p = g.player; const w = this.W; if (!w) return;
    for (const b of w.battles) { if (this.skirm.has(b.id)) continue; if (Math.hypot(b.x - p.x, b.z - p.z) < 210 && !g.docked) this.spawnSkirmish(b); }
    for (const [id, S] of this.skirm) {
      const live = S.ships.filter((x) => !x.dead); if (!live.length || !w.battles.includes(S.b)) { this.endSkirmish(S.b); continue; }
      for (const side of [S.b.a, S.b.d]) { if (S.wiped[side]) continue; if (!S.ships.some((x) => !x.dead && x.side === side)) { S.wiped[side] = true; warHit(w, id, side, 999); const F = FACTIONS[side]; g.toast(`${F ? 'The ' + F.name : 'The militia'} strike group was wiped out at ${SECTOR_BY_ID[S.b.sec].name}`, 'good'); } }
      for (const e of live) { const foe = this.nearestFoe(e, S); e.tgt = foe || (this.aggro[id + e.side] || Math.hypot(e.x - p.x, e.z - p.z) < 14 ? null : { x: S.b.x + Math.cos(e.orbit) * 14, z: S.b.z + Math.sin(e.orbit) * 14, hold: true }); }
    }
  }
  nearestFoe(e, S) { let best = null, bd = 1e9; for (const o of S.ships) { if (o.dead || o.side === e.side) continue; const d = Math.hypot(o.x - e.x, o.z - e.z); if (d < bd) { bd = d; best = o; } } return this.aggro[S.b.id + e.side] && Math.hypot(this.g.player.x - e.x, this.g.player.z - e.z) < bd * 0.8 ? null : best; }
  spawnSkirmish(b) {
    const g = this.g; const S = { b, ships: [], wiped: {} };
    const side = (fk, pw, ox, oz) => { const F = FACTIONS[fk]; const comp = FLEET[F ? fk : 'neutral']; const n = Math.max(2, Math.min(6, Math.round(2 + pw / 22))); for (let i = 0; i < n; i++) { let t = comp[i % comp.length]; if (t === 'capital' && !(i === 0 && pw > 70)) t = 'gunship'; if (i === 0 && pw > 70 && F) t = 'capital'; const e = g.spawnEnemy(t, b.x + ox + rand(-7, 7), b.z + oz + rand(-7, 7), { faction: F ? fk : null, battle: b.id, side: fk, cloaked: false }); e.group.visible = true; S.ships.push(e); } };
    const a = rand(0, TAU); side(b.a, b.pa, Math.cos(a) * 18, Math.sin(a) * 18); side(b.d, b.pd, -Math.cos(a) * 18, -Math.sin(a) * 18);
    this.skirm.set(b.id, S);
  }
  endSkirmish(b) {
    if (!b) return; const S = this.skirm.get(b.id); if (!S) return; const g = this.g;
    for (const e of S.ships) if (!e.dead) { g.fx.burst(e.x, 0.6, e.z, 14, 10, 0.4, 0.8, 0.1, [0.6, 2.2, 3.4], 3); g.removeEnemy(e); }
    this.skirm.delete(b.id);
  }
  skirmishNear(r = 70) { const p = this.g.player; for (const [, S] of this.skirm) if (Math.hypot(S.b.x - p.x, S.b.z - p.z) < r && S.ships.some((x) => !x.dead)) return S; return null; }
  playerHit(e) { if (e.battle && e.side) this.aggro[e.battle + e.side] = true; if (e.hold) e.hold = null; }
  // ------------------------------------------------------------------ friendly units (patrols, escorts, defended stations)
  addFriend(f) { this.friends.push(f); this.scene.add(f.obj); return f; }
  dropFriend(f) { this.scene.remove(f.obj); f.dead = true; }
  hurtFriend(f, dmg) { if (f.dead) return; f.hp -= dmg; f.hitT = 0.15; if (f.hp <= 0) { f.dead = true; this.g.boom(f.x, 0.5, f.z, f.big ? 2.2 : 1.2, [0.6, 2.2, 3.4]); this.scene.remove(f.obj); if (f.onDie) f.onDie(f); } }
  splashFriends(x, z, r, dmg) { for (const f of this.friends) if (!f.dead && Math.hypot(f.x - x, f.z - z) < r + f.radius) this.hurtFriend(f, dmg * 0.5); }
  updateFriendly(dt) {
    const g = this.g; const p = g.player; const G = this.G; this.bossFields(dt);
    const sec = g.gsec; this.nearMerchant = false; this.repairing = false;
    if (G.liberated[sec.id] && sec.ring !== 'H') { if (!this.lib || this.lib.sec !== sec) this.buildLib(sec); }
    else if (this.lib && Math.hypot(this.lib.c.x - p.x, this.lib.c.z - p.z) > 400) this.teardownLib();
    const L = this.lib;
    if (L) {
      L.relay.rotation.y += dt * 0.2; if (L.ring) L.ring.rotation.y += dt * 0.6;
      L.ma += dt * 0.05; L.merchant.position.set(L.c.x + Math.cos(L.ma) * 22, 0.4, L.c.z + Math.sin(L.ma) * 22); L.merchant.rotation.y = -L.ma;
      const dr = Math.hypot(L.c.x - p.x, L.c.z - p.z);
      if (dr < 20 && !g.dead) { this.repairing = true; const st = g.stats(); p.hp = Math.min(p.maxHp, p.hp + p.maxHp * 0.12 * dt); p.sh = Math.min(st.shield, p.sh + st.shield * 0.25 * dt); p.energy = Math.min(st.energyMax, p.energy + st.energyMax * 0.2 * dt);
        if (!L.greeted) { L.greeted = true; g.toast('Repair relay: hull, shields and capacitor restoring', 'good'); g.audio.docked(); } if (Math.random() < 0.3 * g.fx.budget) g.fx.emit(p.x + rand(-1, 1), 0.6, p.z + rand(-1, 1), 0, 2, 0, 0.5, 0.6, 0.2, 0.5, 3, 1.4, 1); }
      else if (dr > 40) L.greeted = false;
      this.nearMerchant = Math.hypot(L.merchant.position.x - p.x, L.merchant.position.z - p.z) < 16 && !g.dead;
      if (g.time > L.stockAt) this.restock(L);
      if (sec === L.sec && neighbours(sec).some((n) => isPirate(n) && !G.liberated[n.id])) { this.probeT -= dt; if (this.probeT <= 0) { this.probeT = rand(110, 170); const fk = neighbours(sec).map((n) => n.faction).find((f) => FACTIONS[f]); const a = rand(0, TAU); for (let k = 0; k < randInt(2, 3); k++) g.spawnEnemy(pick(['drone', 'interceptor', 'drone']), p.x + Math.cos(a) * 48 + rand(-6, 6), p.z + Math.sin(a) * 48 + rand(-6, 6), { faction: fk, probe: true }); g.toast('⚠ Pirate probe entering liberated space: Frontier patrols intercepting', 'warn'); } }
      for (let i = 0; i < L.patrols.length; i++) { const P = L.patrols[i]; if (P.dead) { P.respawn ||= g.time + 60; if (g.time > P.respawn) L.patrols[i] = this.makePatrol(L, P.slot); } }
    }
    const st = g.stats();
    for (let i = this.friends.length - 1; i >= 0; i--) {
      const f = this.friends[i]; if (f.dead) { this.friends.splice(i, 1); continue; }
      if (f.kind !== 'patrol') continue;
      f.a += dt * 0.5; let tgt = null, bd = 38; for (const e of g.enemies) { if (e.dead || e.cloaked || e.battle || e.D.inst || e.D.part || e.bc) continue; const d = Math.hypot(e.x - f.x, e.z - f.z); if (d < bd) { bd = d; tgt = e; } }
      const home = L && Math.hypot(L.c.x - p.x, L.c.z - p.z) > 300; const ax = home ? L.c.x : p.x, az = home ? L.c.z : p.z;
      const gx = tgt ? tgt.x + Math.cos(f.a * 2 + f.slot) * 10 : ax + Math.cos(f.a + f.slot * Math.PI) * 26, gz = tgt ? tgt.z + Math.sin(f.a * 2 + f.slot) * 10 : az + Math.sin(f.a + f.slot * Math.PI) * 26;
      const dx = gx - f.x, dz = gz - f.z, dd = Math.hypot(dx, dz) || 1; const sp = Math.min(26, dd * 1.5); f.vx = THREE.MathUtils.damp(f.vx, dx / dd * sp, 3, dt); f.vz = THREE.MathUtils.damp(f.vz, dz / dd * sp, 3, dt); f.x += f.vx * dt; f.z += f.vz * dt;
      const yaw = tgt ? Math.atan2(tgt.x - f.x, tgt.z - f.z) : Math.atan2(f.vx, f.vz); f.obj.position.set(f.x, 0.4, f.z); f.obj.rotation.y = yaw;
      f.cd -= dt; if (tgt && f.cd <= 0 && bd < 32) { f.cd = 0.5; const d = Math.hypot(tgt.x - f.x, tgt.z - f.z) || 1; g.bolts.spawn({ x: f.x, z: f.z, y: 0.8, vx: (tgt.x - f.x) / d * 55, vz: (tgt.z - f.z) / d * 55, dmg: f.dmg * st.dmg * 0.6, owner: 'p', kind: 'cannon', S: { vsShip: 1, vsRock: 0, shieldMul: 1, pen: 0.1 }, life: 0.8, len: 1.3, w: 1, color: [0.5, 2.4, 3.6], ally: true }); }
      if (Math.random() < 0.3 * g.fx.budget) g.fx.emit(f.x - Math.sin(yaw) * 1.5, 0.3, f.z - Math.cos(yaw) * 1.5, 0, 0, 0, 0.3, 0.6, 0.1, 0.5, 1.8, 3.4, 2);
    }
  }
  makePatrol(L, slot) { const o = buildShip(2).group; o.scale.setScalar(0.62); const c = L.c; const hp = 260 + this.g.s.level * 18; return this.addFriend({ kind: 'patrol', obj: o, x: c.x + rand(-10, 10), z: c.z + rand(-10, 10), vx: 0, vz: 0, hp, maxHp: hp, radius: 1.6, a: rand(0, TAU), cd: 1, slot, dmg: 8, name: 'Frontier Patrol' }); }
  buildLib(sec) {
    this.teardownLib(); const c = sectorCenter(sec); const r = buildInstallationV5('relay'); r.group.position.set(c.x, 0, c.z); this.scene.add(r.group);
    const m = buildCivilian('merchant').group; this.scene.add(m);
    const L = this.lib = { sec, c, relay: r.group, ring: r.group.getObjectByName('spin'), merchant: m, ma: rand(0, TAU), patrols: [], stockAt: 0, stock: [] };
    L.patrols.push(this.makePatrol(L, 0), this.makePatrol(L, 1)); this.restock(L);
    this.g.toast(`Liberated space: Frontier patrols on station. Repair relay and trader at the ${sec.name} beacon.`, 'good');
  }
  teardownLib() { const L = this.lib; if (!L) return; this.scene.remove(L.relay); this.scene.remove(L.merchant); for (const P of L.patrols) if (!P.dead) this.dropFriend(P); this.lib = null; }
  restock(L) { // liberated-sector trader: better gear than the station Armory, rotating every 8 minutes
    const g = this.g; L.stockAt = g.time + 480; const lv = g.s.level; const th = Math.max(2, L.sec.threat);
    L.stock = []; for (let k = 0; k < 4; k++) { const r = k === 0 ? Math.min(4, 2 + (th >= 4 ? 1 : 0)) : k === 1 ? 2 : 1 + (Math.random() < 0.5 ? 1 : 0); const t = rollTemplate(lv, r); const it = makeItem(t, r, Math.max(1, lv), `Trader: ${L.sec.name}`); L.stock.push({ it, price: Math.round((400 + lv * 60) * Math.pow(2.3, r) * 0.6 / 10) * 10, sold: false }); }
  }
  buyTrader(i) {
    const g = this.g; const L = this.lib; if (!L || !this.nearMerchant) return false; const o = L.stock[i]; if (!o || o.sold) return false;
    if (g.s.credits < o.price) { g.audio.denied(); g.toast('Not enough credits', 'warn'); return false; }
    if (g.s.inv.length >= INV_CAP) { g.audio.denied(); g.toast('Inventory full: salvage something first', 'warn'); return false; }
    g.s.credits -= o.price; o.sold = true; g.addItem(o.it); g.audio.coins(); g.save(); return true;
  }
  // ------------------------------------------------------------------ missions
  refreshOffers(force = false) {
    const g = this.g; const M = this.M; const now = Date.now(); const G = this.G;
    M.offers = M.offers.filter((m) => m.status === 'offer' && !G.liberated[m.sec] && (!m.inst || !G.inst[m.inst]));
    if (force || now > M.refreshAt || M.offers.length < 2) { M.offers = genOffers(G, g.s.level, M.offers); M.refreshAt = now + 6 * 60 * 1000; }
    return M.offers;
  }
  rerollCost() { return 100 + this.g.s.level * 20; }
  rerollOffers() { const g = this.g; const cost = this.rerollCost(); if (g.s.credits < cost) { g.audio.denied(); return false; } g.s.credits -= cost; this.M.offers = []; this.refreshOffers(true); g.save(); return true; }
  accept(id) {
    const g = this.g; const M = this.M; const m = M.offers.find((x) => x.id === id); if (!m) return false;
    if (M.active.length >= MAX_ACTIVE) { g.audio.denied(); g.toast(`You can run at most ${MAX_ACTIVE} missions at once`, 'warn'); return false; }
    M.offers = M.offers.filter((x) => x !== m); m.status = 'active'; m.accepted = Date.now(); M.active.push(m);
    this.track(m.id, true); g.toast(`Mission accepted: ${missionTitle(m)}`, 'good'); g.audio.quest(); g.save(); return true;
  }
  track(id, quiet) { const m = this.M.active.find((x) => x.id === id); if (!m) return; this.M.tracked = id; this.g.s.galaxy.wp = { x: Math.round(m.x), z: Math.round(m.z), label: MTYPES[m.type].name }; if (!quiet) { this.g.audio.click(); this.g.save(); } }
  abandon(id) { const m = this.M.active.find((x) => x.id === id); if (!m) return; this.finish(m, 'abandoned'); this.g.toast(`Mission abandoned: ${missionTitle(m)}`); }
  finish(m, status, reason) {
    const g = this.g; const M = this.M; if (m.status !== 'active') return; m.status = status; m.ended = Date.now(); if (reason) m.reason = reason;
    M.active = M.active.filter((x) => x !== m); M.log.unshift(m); if (M.log.length > 30) M.log.length = 30; if (M.tracked === m.id) M.tracked = M.active[0] ? M.active[0].id : null;
    const R = this.mrt[m.id]; if (R) { for (const e of R.ents || []) if (!e.dead) { e.mid = null; e.hold = null; if (e.tgt && (e.tgt === R.civ || e.tgt === R.station)) e.tgt = null; } if (R.civ && !R.civ.dead) this.dropFriend(R.civ); if (R.station && !R.station.dead) this.dropFriend(R.station); for (const pd of R.pods || []) this.scene.remove(pd.obj); delete this.mrt[m.id]; }
    const wp = g.s.galaxy.wp; if (wp && wp.label === MTYPES[m.type].name && Math.hypot(wp.x - m.x, wp.z - m.z) < 2) g.s.galaxy.wp = null;
    if (status === 'done') {
      M.done++; const r = m.reward; g.addCredits(r.credits); g.addXP(r.xp); g.s.parts += r.parts; let it = null;
      if (r.item) { const l = g.dropLoot(g.player.x + rand(-2, 2), g.player.z + rand(-2, 2), 'mission', m.threat, r.minR); it = l.it; }
      g.toast(`✔ Mission complete: ${missionTitle(m)} · +${r.credits} cr, +${r.xp} XP, +${r.parts} components${it ? ' + ' + RARITIES[it.r].name + ' gear' : ''}`, 'level'); g.audio.quest(); g.emit('mission', { type: m.type });
    } else if (status === 'failed') { M.failed++; g.toast(`✘ Mission failed: ${missionTitle(m)}${reason ? ' (' + reason + ')' : ''}`, 'warn'); g.audio.denied(); }
    g.save();
  }
  convoyMissionCheck(C) { const m = C.m; if (m.status !== 'active' || m.prog >= m.need) return; if (C.escaped > 0 && m.prog < m.need) this.finish(m, 'failed', 'freighters escaped'); else { const R = this.mrt[m.id]; if (R) R.spawned = false; } }
  spawnGroup(fac, x, z, n, o = {}) { const g = this.g; const comp = FLEET[FACTIONS[fac] ? fac : 'neutral']; const out = []; for (let i = 0; i < n; i++) { const t = comp[i % comp.length] === 'capital' ? 'gunship' : comp[i % comp.length]; out.push(g.spawnEnemy(t, x + rand(-8, 8), z + rand(-8, 8), { faction: FACTIONS[fac] ? fac : null, ...o })); } return out; }
  updateMissions(dt) {
    const g = this.g; const p = g.player; const M = this.M; if (!M) return; const G = this.G;
    for (const m of [...M.active]) {
      if (m.status !== 'active') continue;
      const R = this.mrt[m.id] ||= { ents: [], spawned: false }; const d = Math.hypot(m.x - p.x, m.z - p.z);
      if (R.spawned && !R.ents.some((e) => !e.dead) && m.prog < m.need && (m.type === 'patrol' || m.type === 'commander' || (m.type === 'cargo' && !R.hauled))) R.spawned = false; // despawned by distance: respawn on return
      switch (m.type) {
        case 'patrol': if (!R.spawned && d < 150) { R.spawned = true; R.ents = this.spawnGroup(m.fac, m.x, m.z, m.need - m.prog, { mid: m.id, hold: { x: m.x, z: m.z } }); g.toast(`✷ Target patrol detected (${m.need - m.prog} ships)`, 'warn'); } break;
        case 'commander': if (!R.spawned && d < 150) { R.spawned = true; const boss = g.spawnEnemy(m.threat >= 3 ? 'capital' : 'gunship', m.x, m.z, { faction: m.fac, elite: true, hpMul: 1.6, mid: m.id, named: m.name, hold: { x: m.x, z: m.z }, cloaked: false }); boss.group.visible = true; R.ents = [boss, ...this.spawnGroup(m.fac, m.x, m.z, 2 + Math.min(3, m.threat - 1), { hold: { x: m.x, z: m.z } })]; g.toast(`☠ ${m.name} located!`, 'warn'); } break;
        case 'outpost': if (G.inst[m.inst] || G.liberated[m.sec]) { m.prog = 1; this.finish(m, 'done'); } break;
        case 'cargo':
          if (!R.spawned && !R.hauled && d < 150) { R.spawned = true; const h = g.spawnEnemy('freighter', m.x, m.z, { faction: m.fac, mid: m.id, cargo: true, dest: { x: m.x + 0.1, z: m.z }, cloaked: false }); h.group.visible = true; R.ents = [h, ...this.spawnGroup(m.fac, m.x, m.z, 2 + (m.threat >= 3 ? 1 : 0), { hold: { x: m.x, z: m.z } })]; }
          if (R.pods) for (let i = R.pods.length - 1; i >= 0; i--) { const pd = R.pods[i]; pd.obj.rotation.y += dt; pd.obj.position.y = 0.4 + Math.sin(g.time * 2 + i) * 0.2; if (!g.dead && Math.hypot(pd.x - p.x, pd.z - p.z) < 3.5 + p.radius) { this.scene.remove(pd.obj); R.pods.splice(i, 1); m.prog++; g.audio.loot(1); g.ui && g.ui.float(p.x, 2.4, p.z, `CARGO ${m.prog}/${m.need}`, '#ffd166', true); if (m.prog >= m.need) { this.finish(m, 'done'); break; } } }
          break;
        case 'convoy': if (!R.spawned && d < 170) { R.spawned = true; const C = this.spawnConvoy(SECTOR_BY_ID[m.sec], { kind: 'mission', m, fac: m.fac, n: m.need - m.prog, from: { x: m.x, z: m.z }, to: { x: m.x2, z: m.z2 } }); R.ents = [...C.fr, ...C.esc]; } break;
        case 'signal':
          if (d < 18 && !g.dead) { R.scan = (R.scan || 0) + dt; if (Math.random() < 0.3 * g.fx.budget) g.fx.emit(m.x + rand(-2, 2), 0.6, m.z + rand(-2, 2), 0, 2, 0, 0.6, 0.8, 0.3, 2.2, 0.8, 3.6, 1); if ((R.lastF || 0) < g.time - 0.7) { R.lastF = g.time; g.ui && g.ui.float(m.x, 2.2, m.z, `SCANNING ${Math.min(100, Math.round(R.scan / 4 * 100))}%`, '#c27bff'); } }
          else if (R.scan) R.scan = Math.max(0, R.scan - dt);
          if (R.scan >= 4 && !R.resolved) { R.resolved = true; const out = m.data.outcome;
            if (out === 'ambush') { g.toast('◉ It was a trap! Pirate ambush!', 'warn'); this.spawnGroup(m.fac || 'void', m.x, m.z, 3 + Math.min(3, m.threat), {}).forEach((e) => { e.cloaked = false; e.group.visible = true; }); g.dropLoot(m.x, m.z, 'cache', m.threat); }
            else if (out === 'relic') { g.toast('◉ Signal source: a pre-collapse relic vault!', 'good'); g.dropLoot(m.x, m.z, 'mission', m.threat, 2); g.addXP(150 * m.threat); }
            else { g.toast('◉ Signal source: a derelict freighter with salvage', 'good'); g.dropLoot(m.x, m.z, 'cache', m.threat); g.minerals.spawn(m.x, m.z, pick(['viridium', 'crimsonite', 'voidstone']), 10, 10); }
            m.prog = 1; this.finish(m, 'done'); }
          break;
        case 'escort': this.escortTick(m, R, dt); break;
        case 'defend': this.defendTick(m, R, dt); break;
      }
    }
  }
  escortTick(m, R, dt) {
    const g = this.g; const p = g.player;
    if (!R.civ) { if (Math.hypot(m.x - p.x, m.z - p.z) > 60) return; const o = buildCivilian('freighter').group; const hp = 700 + m.threat * 260; R.civ = this.addFriend({ kind: 'civ', obj: o, x: m.x, z: m.z, hp, maxHp: hp, radius: 3, big: true, name: m.name, onDie: () => this.finish(m, 'failed', `${m.name} was destroyed`) }); R.total = Math.hypot(m.x2 - m.x, m.z2 - m.z); R.amb = [30, 65]; m.prog = 0; g.toast(`⛴ ${m.name}: "Ready when you are, escort."`, 'good'); }
    const c = R.civ; if (c.dead) return;
    const dx = m.x2 - c.x, dz = m.z2 - c.z, dd = Math.hypot(dx, dz) || 1; const near = Math.hypot(c.x - p.x, c.z - p.z) < 45 && !g.dead;
    const threat = g.enemies.some((e) => !e.dead && e.tgt === c && Math.hypot(e.x - c.x, e.z - c.z) < 30);
    const sp = near ? (threat ? 5 : 9) : 0; c.x += dx / dd * sp * dt; c.z += dz / dd * sp * dt; c.obj.position.set(c.x, 0.4, c.z); c.obj.rotation.y = Math.atan2(dx, dz);
    if (!near) { R.waitT = (R.waitT || 0) + dt; if (R.waitT > 14) { R.waitT = 0; g.toast(`⛴ ${m.name}: "Holding position until you're close."`); } }
    m.prog = Math.min(99, Math.max(m.prog, Math.round(100 * (1 - dd / R.total))));
    if (R.amb.length && m.prog >= R.amb[0]) { R.amb.shift(); const a = rand(0, TAU); const grp = this.spawnGroup(m.fac, c.x + Math.cos(a) * 45, c.z + Math.sin(a) * 45, 3 + Math.min(3, m.threat), {}); grp.forEach((e, i) => { e.cloaked = false; e.group.visible = true; if (i % 2 === 0) e.tgt = c; }); R.ents.push(...grp); g.audio.alarm(); g.toast(`⚠ Ambush! Protect the ${m.name}!`, 'warn'); }
    if (dd < 12) { m.prog = 100; this.finish(m, 'done'); }
  }
  defendTick(m, R, dt) {
    const g = this.g; const p = g.player; const d = Math.hypot(m.x - p.x, m.z - p.z);
    if (!R.station) { if (d > 70) return; const o = buildInstallationV5('relay').group; const hp = 1200 + m.threat * 450; R.station = this.addFriend({ kind: 'station', obj: o, x: m.x, z: m.z, hp, maxHp: hp, radius: 5, big: true, name: m.name, onDie: () => this.finish(m, 'failed', `${m.name} was destroyed`) }); o.position.set(m.x, 0, m.z); R.wave = 0; R.waveT = 5; R.cleared = false; m.prog = 0; g.toast(`⛨ ${m.name}: "Raiders inbound! Hold them off!"`, 'warn'); }
    const S = R.station; if (S.dead) return; S.obj.rotation.y += dt * 0.2;
    if (d > 260) { this.dropFriend(S); R.station = null; for (const e of R.ents) if (!e.dead) g.removeEnemy(e); R.ents = []; m.prog = 0; g.toast(`${m.name} defence abandoned: return to restart it`, 'warn'); return; }
    const alive = R.ents.filter((e) => !e.dead).length;
    if (R.wave > 0 && !alive && !R.cleared) { R.cleared = true; m.prog = R.wave; if (m.prog >= m.need) { this.finish(m, 'done'); return; } g.toast(`Wave ${R.wave} repelled! Next wave incoming…`, 'good'); R.waveT = 7; }
    if ((R.wave === 0 || R.cleared) && (R.waveT -= dt) <= 0) { R.wave++; R.cleared = false; const a = rand(0, TAU); const grp = this.spawnGroup(m.fac, m.x + Math.cos(a) * 58, m.z + Math.sin(a) * 58, 3 + Math.min(4, m.threat) + R.wave - 1, {}); grp.forEach((e, i) => { e.cloaked = false; e.group.visible = true; e.defend = m.id; if (i % 2 === 0) e.tgt = S; }); R.ents = grp; g.audio.alarm(); g.toast(`⚠ Wave ${R.wave}/${m.need} attacking ${m.name}!`, 'warn'); }
  }
  // called from Game.killEnemy for every destroyed ship
  onKill(e) {
    const g = this.g; const G = this.G; const M = this.M;
    if (e.D.part) { this.partDestroyed(e); return; }
    if (e.bc) { this.bossKilled(e); return; }
    if (e.battle) warHit(this.W, e.battle, e.side, e.lastHit === 'rival' ? 3 : 7);
    if (e.type === 'freighter' && e.convoy && e.convoy.kind === 'supply') { const sec = e.convoy.sec; G.supply[sec.id] = (G.supply[sec.id] || 0) + 1; const need = libStages(sec, G).steps[1].items[2]; g.toast(`Supply freighter destroyed (${need.have}/${need.need})`, 'good'); g.minerals.spawn(e.x, e.z, pick(['copper', 'crimsonite', 'iron']), 8, 10); if (Math.random() < 0.6) g.dropLoot(e.x, e.z, 'supply', sec.threat); this.checkStage(sec); }
    if (e.elite && !e.mid && !e.battle && e.lastHit !== 'rival') { const sec = gsectorAt(e.x, e.z); if (isPirate(sec) && !G.liberated[sec.id] && e.faction === sec.faction) { G.elite[sec.id] = (G.elite[sec.id] || 0) + 1; const it = libStages(sec, G).steps[2].items.at(-1); if (it.need) g.toast(`Elite patrol ship eliminated (${it.have}/${it.need})`, 'good'); this.checkStage(sec); } }
    if (e.mid && M) { const m = M.active.find((x) => x.id === e.mid); if (m) {
      if (m.type === 'patrol') { m.prog++; if (m.prog >= m.need) this.finish(m, 'done'); }
      else if (m.type === 'commander' && e.named) { m.prog = 1; g.toast(`${m.name} eliminated!`, 'good'); this.finish(m, 'done'); }
      else if (m.type === 'convoy' && e.type === 'freighter') { m.prog++; if (m.prog >= m.need) this.finish(m, 'done'); }
      else if (m.type === 'cargo' && e.cargo) { const R = this.mrt[m.id]; if (R) { R.hauled = true; R.pods = []; for (let k = 0; k < m.need - m.prog; k++) { const o = buildCacheCrate(); const a = k / 4 * TAU; const x = e.x + Math.cos(a) * 5, z = e.z + Math.sin(a) * 5; o.position.set(x, 0.4, z); o.visible = true; this.scene.add(o); R.pods.push({ obj: o, x, z }); } g.toast('Hauler destroyed: collect the cargo pods!', 'good'); } }
    } }
  }
}

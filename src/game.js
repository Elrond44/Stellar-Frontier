// Core game: state, player ship, weapons, enemies, economy, quests, saving
import * as THREE from 'three';
import { clamp, lerp, damp, rand, randInt, pick, angleDiff, TAU } from './util.js';
import { MINERALS, MINERAL_KEYS, SECTORS, sectorAt, BOSS_LAIR, TIERS, STATION_LEVELS, WEAPONS, UPGRADES, upgradeCost, ENEMIES, xpForLevel } from './data.js';
import { buildShip, makeTurret, makeFlames, buildPirate, buildStation, animateStation, materials } from './models.js';
import { AsteroidField, Minerals } from './world.js';
import { Particles, Debris, Rings, Bolts } from './fx.js';
import { STORY, makeContract } from './quests.js';

const SAVE_KEY = 'stellar-frontier-save-v1';
const DOCK_R = 28;

function freshState() {
  const z = {}; for (const k of MINERAL_KEYS) z[k] = 0;
  const up = {}; for (const u of UPGRADES) up[u.key] = 0;
  return {
    v: 1, credits: 50, xp: 0, level: 1, cargo: { ...z }, vault: { ...z }, upgrades: up,
    tier: 1, stationLvl: 1, factory: { inc: 0, cap: 0, stored: 0, last: Date.now() },
    weapons: { laser: true }, loadout: ['laser', 'cannon', 'laser', 'missile', 'cannon', 'pulse'],
    story: 0, storyProg: 0, contracts: [], maxSector: 1,
    stats: { mined: 0, rocks: 0, kills: 0, sold: 0, bosses: 0, deaths: 0, playTime: 0 },
    settings: { music: true, sfx: true, shake: true, quality: 'auto', fps: false },
    pos: { x: 0, z: 34 }, hp: null, bossRespawn: 0, tutorialDone: false,
  };
}

export class Game {
  constructor(scene, camera, audio) {
    this.scene = scene; this.camera = camera; this.audio = audio;
    this.time = 0; this.ui = null; this.listeners = {};
    this.s = this.load();
    // systems
    this.fx = new Particles(scene, 4000);
    this.debris = new Debris(scene);
    this.rings = new Rings(scene);
    this.bolts = new Bolts(scene, 600);
    this.field = new AsteroidField(scene);
    this.minerals = new Minerals(scene);
    this.enemies = []; this.protos = {};
    this.heat = 0; this.spawnT = 30; this.guards = new Map();
    this.shake = 0; this.input = { x: 0, z: 0, active: false };
    this.autopilot = false; this.docked = false; this.dead = false;
    this.pickupCombo = 0; this.pickupT = 0; this.pickupAgg = {};
    this.boss = null; this.lastHurt = -10; this.sectorId = 1;
    this.tmpV = new THREE.Vector3(); this.tmpV2 = new THREE.Vector3();
    // station
    this.stationRoot = null; this.buildStationModel();
    // player
    this.player = { x: this.s.pos.x, z: this.s.pos.z, vx: 0, vz: 0, yaw: Math.PI, yawVel: 0, bank: 0, thrust: 0, group: null, weapons: [], radius: 1.4, hp: 100, maxHp: 100 };
    this.buildPlayerShip();
    if (this.s.hp != null) this.player.hp = Math.min(this.s.hp, this.stats().hp);
    // hp bars pool
    this.bars = []; this.initBars();
    // offline factory accrual
    this.updateFactory(0, true);
    if (!this.s.contracts.length) for (let i = 0; i < 3; i++) this.s.contracts.push(this.newContract());
    this.camPos = new THREE.Vector3(this.player.x, 40, this.player.z + 25);
    this.camLook = new THREE.Vector3(this.player.x, 0, this.player.z);
  }

  // ---------- events ----------
  on(ev, fn) { (this.listeners[ev] ||= []).push(fn); }
  emit(ev, data) { (this.listeners[ev] || []).forEach((f) => f(data)); this.questEvent(ev, data); }
  toast(msg, kind) { this.ui && this.ui.toast(msg, kind); }

  // ---------- save/load ----------
  load() {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (raw) {
        const d = JSON.parse(raw); const f = freshState();
        const merged = { ...f, ...d, cargo: { ...f.cargo, ...d.cargo }, vault: { ...f.vault, ...d.vault }, upgrades: { ...f.upgrades, ...d.upgrades }, factory: { ...f.factory, ...d.factory }, stats: { ...f.stats, ...d.stats }, settings: { ...f.settings, ...d.settings }, weapons: { ...f.weapons, ...d.weapons } };
        if (!Array.isArray(merged.loadout) || merged.loadout.length < 6) merged.loadout = f.loadout;
        return merged;
      }
    } catch (e) { console.warn('save load failed', e); }
    return freshState();
  }
  save() {
    if (this.resetting) return;
    this.s.pos = { x: this.player.x, z: this.player.z }; this.s.hp = this.player.hp;
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(this.s)); this.lastSave = Date.now(); } catch (e) { /* storage full or blocked */ }
  }
  reset() { this.resetting = true; localStorage.removeItem(SAVE_KEY); location.reload(); }

  // ---------- derived stats ----------
  stats() {
    const u = this.s.upgrades, T = TIERS[this.s.tier - 1];
    return {
      dmg: T.dmg * (1 + 0.12 * u.damage) * (1 + 0.02 * (this.s.level - 1)),
      rate: 1 + 0.06 * u.firerate,
      proj: 1 + 0.08 * u.projspeed,
      range: (1 + 0.04 * u.range) * (1 + 0.1 * (this.s.tier - 1)),
      crit: Math.min(0.6, 0.05 + 0.015 * u.crit),
      mining: 1 + 0.1 * u.mining,
      speed: 15 * T.speed * (1 + 0.05 * u.engine),
      accel: 38 * T.accel,
      magnet: (10 + this.s.tier * 2) * (1 + 0.1 * u.magnet),
      cargo: Math.round(T.cargo * (1 + 0.15 * u.cargo)),
      hp: Math.round(T.hp * (1 + 0.12 * u.hull)),
      slots: T.slots,
    };
  }
  cargoTotal() { let n = 0; for (const k in this.s.cargo) n += this.s.cargo[k]; return n; }

  // ---------- station ----------
  buildStationModel() {
    if (this.stationRoot) { this.scene.remove(this.stationRoot); }
    this.stationRoot = buildStation(this.s.stationLvl, this.field.stationMat);
    this.scene.add(this.stationRoot);
  }
  factoryRates() {
    const m = STATION_LEVELS[this.s.stationLvl - 1].mult;
    return { income: 20 * Math.pow(1.3, this.s.factory.inc) * m, capacity: Math.round(150 * Math.pow(1.45, this.s.factory.cap) * m) };
  }
  factoryUpCost(which) { return which === 'inc' ? Math.round(150 * Math.pow(1.6, this.s.factory.inc)) : Math.round(120 * Math.pow(1.55, this.s.factory.cap)); }
  updateFactory(dt, offline = false) {
    const f = this.s.factory, r = this.factoryRates();
    if (offline) { const el = Math.max(0, (Date.now() - f.last) / 1000); f.stored = Math.min(r.capacity, f.stored + r.income / 60 * el); this.offlineGain = el > 60 ? r.income / 60 * el : 0; }
    else f.stored = Math.min(r.capacity, f.stored + r.income / 60 * dt);
    f.last = Date.now();
  }
  claimFactory() {
    const amt = Math.floor(this.s.factory.stored); if (amt <= 0) return 0;
    this.s.factory.stored -= amt; this.addCredits(amt); this.addXP(Math.round(amt * 0.1));
    this.audio.coins(); this.emit('claim', { amt }); this.save(); return amt;
  }
  upgradeFactory(which) {
    const c = this.factoryUpCost(which); if (this.s.credits < c) return false;
    this.s.credits -= c; this.s.factory[which]++; this.audio.upgrade(); this.save(); return true;
  }
  stationUpgradeInfo() {
    const next = STATION_LEVELS[this.s.stationLvl]; if (!next) return null;
    let ok = this.s.credits >= next.cost; const mats = next.mats || {};
    for (const k in mats) if (this.s.vault[k] < mats[k]) ok = false;
    return { next, ok };
  }
  upgradeStation() {
    const inf = this.stationUpgradeInfo(); if (!inf || !inf.ok || !this.docked) return false;
    this.s.credits -= inf.next.cost; for (const k in (inf.next.mats || {})) this.s.vault[k] -= inf.next.mats[k];
    this.s.stationLvl++; this.buildStationModel(); this.audio.levelUp();
    this.fx.burst(0, 4, 0, 80, 30, 1.2, 1.5, 0.2, [0.6, 2.4, 3.2], 1.5); this.rings.spawn(0, 0, 0, 40, [0.4, 1.6, 2.4], 1.2);
    this.toast(`Station upgraded: ${inf.next.name}!`, 'good'); this.emit('station', {}); this.save(); return true;
  }
  sellCargo() {
    let credits = 0, units = 0, vaulted = 0; const parts = [];
    for (const k of MINERAL_KEYS) {
      const n = this.s.cargo[k]; if (!n) continue;
      units += n;
      if (MINERALS[k].vault) { this.s.vault[k] += n; vaulted += n; parts.push(`${n} ${MINERALS[k].name} → vault`); }
      else { credits += n * MINERALS[k].value; parts.push(`${n} ${MINERALS[k].name}`); }
      this.s.cargo[k] = 0;
    }
    if (!units) return null;
    const bonus = 1 + 0.1 * (this.s.stationLvl - 1); credits = Math.round(credits * bonus);
    this.addCredits(credits); this.addXP(Math.round(units * 0.5)); this.s.stats.sold += units;
    this.audio.coins(); this.emit('sell', { units, credits });
    this.save();
    return { credits, units, vaulted, parts };
  }
  sellVault(k, n) {
    n = Math.min(n, this.s.vault[k]); if (n <= 0) return;
    this.s.vault[k] -= n; const c = n * MINERALS[k].value; this.addCredits(c); this.audio.coins(); this.save();
  }

  // ---------- progression ----------
  addCredits(n) { this.s.credits += n; }
  addXP(n) {
    this.s.xp += n; let leveled = false;
    while (this.s.xp >= xpForLevel(this.s.level)) { this.s.xp -= xpForLevel(this.s.level); this.s.level++; leveled = true;
      for (const k in WEAPONS) if (WEAPONS[k].unlock === this.s.level) this.toast(`${WEAPONS[k].name} unlocked in Loadout!`, 'good');
    }
    if (leveled) { this.audio.levelUp(); this.toast(`LEVEL UP! Level ${this.s.level}`, 'level'); this.fx.burst(this.player.x, 1, this.player.z, 50, 18, 0.9, 1.2, 0.1, [2.5, 2.0, 0.6], 2); this.emit('level', {}); }
  }
  buyUpgrade(key) {
    const u = UPGRADES.find((x) => x.key === key); const lvl = this.s.upgrades[key];
    if (lvl >= u.max) return false; const c = upgradeCost(u, lvl); if (this.s.credits < c) return false;
    this.s.credits -= c; this.s.upgrades[key]++;
    const st = this.stats();
    if (key === 'hull') { this.player.maxHp = st.hp; this.player.hp = Math.min(st.hp, this.player.hp + st.hp * 0.12); }
    this.audio.upgrade(); this.emit('upgrade', { key }); this.save(); return true;
  }
  tierInfo(t) {
    const T = TIERS[t - 1]; if (!T) return null;
    const reasons = []; let ok = true;
    if (this.s.stationLvl < T.station) { ok = false; reasons.push(`Station level ${T.station}`); }
    if (this.s.credits < T.cost) ok = false;
    for (const k in (T.mats || {})) if (this.s.vault[k] < T.mats[k]) ok = false;
    return { T, ok, reasons };
  }
  buyTier(t) {
    const inf = this.tierInfo(t); if (!inf || !inf.ok || t !== this.s.tier + 1 || !this.docked) return false;
    this.s.credits -= inf.T.cost; for (const k in (inf.T.mats || {})) this.s.vault[k] -= inf.T.mats[k];
    this.s.tier = t; this.buildPlayerShip(); this.player.hp = this.player.maxHp;
    this.audio.levelUp(); this.rings.spawn(this.player.x, 0, this.player.z, 18 * inf.T.cam, [0.6, 2, 3], 1);
    this.fx.burst(this.player.x, 1, this.player.z, 90, 20, 1.2, 1.5, 0.1, [0.5, 2.2, 3.2], 1.5);
    this.toast(`New ship: ${inf.T.name} (${inf.T.cls})!`, 'level'); this.emit('tier', {}); this.save(); return true;
  }
  buyWeapon(k) {
    const W = WEAPONS[k]; if (this.s.weapons[k] || this.s.level < W.unlock || this.s.credits < W.price) return false;
    this.s.credits -= W.price; this.s.weapons[k] = true;
    // auto-equip to first slot still using a default/locked weapon
    const slots = this.stats().slots;
    for (let i = 0; i < slots; i++) if (!this.s.weapons[this.s.loadout[i]] || (i > 0 && this.s.loadout[i] === 'laser' && k !== 'laser')) { this.s.loadout[i] = k; break; }
    this.buildPlayerShip(); this.audio.upgrade(); this.save(); return true;
  }
  setSlot(i, k) { if (!this.s.weapons[k]) return; this.s.loadout[i] = k; this.buildPlayerShip(); this.audio.click(); this.save(); }
  slotWeapon(i) { const k = this.s.loadout[i]; return this.s.weapons[k] ? k : (i === 0 ? 'laser' : (this.s.weapons.cannon ? 'cannon' : 'laser')); }

  // ---------- quests ----------
  currentStory() { return STORY[this.s.story] || null; }
  newContract() { return { ...makeContract(this.s.level, this.s.maxSector), prog: 0 }; }
  questState(q, prog) {
    if (['station', 'tier', 'sector', 'level'].includes(q.kind)) {
      const v = q.kind === 'station' ? this.s.stationLvl : q.kind === 'tier' ? this.s.tier : q.kind === 'sector' ? this.s.maxSector : this.s.level;
      return Math.min(q.need, v);
    }
    return Math.min(q.need, prog);
  }
  questEvent(ev, d) {
    const inc = (q, cur) => {
      let add = 0;
      if (ev === 'collect' && (q.kind === 'collect' || q.kind === 'collect:' + d.type)) add = d.n;
      else if (ev === 'sell' && q.kind === 'sell') add = 1;
      else if (ev === 'sell' && q.kind === 'sellunits') add = d.units;
      else if (ev === 'upgrade' && q.kind === 'upgrade') add = 1;
      else if (ev === 'claim' && q.kind === 'claim') add = 1;
      else if (ev === 'kill' && q.kind === 'kill') add = 1;
      else if (ev === 'rock' && q.kind === 'rock') add = 1;
      else if (ev === 'boss' && q.kind === 'boss') add = 1;
      return cur + add;
    };
    const st = this.currentStory();
    if (st) this.s.storyProg = inc(st, this.s.storyProg);
    for (const c of this.s.contracts) c.prog = inc(c, c.prog);
  }
  storyDone() { const st = this.currentStory(); return st && this.questState(st, this.s.storyProg) >= st.need; }
  claimStory() {
    const st = this.currentStory(); if (!st || !this.storyDone()) return false;
    this.addCredits(st.reward.credits); this.addXP(st.reward.xp); this.s.story++; this.s.storyProg = 0;
    this.audio.coins(); this.toast(`Mission complete: ${st.title} +${st.reward.credits} cr`, 'good'); this.save(); return true;
  }
  claimContract(i) {
    const c = this.s.contracts[i]; if (!c || this.questState(c, c.prog) < c.need) return false;
    this.addCredits(c.reward.credits); this.addXP(c.reward.xp); this.s.contracts[i] = this.newContract();
    this.audio.coins(); this.toast(`Contract complete +${c.reward.credits} cr`, 'good'); this.save(); return true;
  }

  // ---------- player ship ----------
  buildPlayerShip() {
    const p = this.player; const T = TIERS[this.s.tier - 1]; const st = this.stats();
    if (p.group) { this.scene.remove(p.group); for (const w of p.weapons) { if (w.beam) this.scene.remove(w.beam); } }
    const built = buildShip(this.s.tier);
    const g = new THREE.Group(); g.add(built.group); g.rotation.order = 'YXZ'; built.group.scale.setScalar(1.25);
    const fl = makeFlames(built.engines); built.group.add(fl.group);
    p.flames = fl; p.weapons = [];
    built.hardpoints.forEach((h, i) => {
      if (i >= st.slots) return;
      const key = this.slotWeapon(i); const tur = makeTurret(key, (h.size || 1) * 1.05);
      tur.position.set(h.x, h.y, h.z); built.group.add(tur);
      const w = { key, turret: tur, cd: rand(0, 0.3), target: null, retarget: 0, acc: 0, tick: 0 };
      if (key === 'laser') { w.beam = this.makeBeam(); this.scene.add(w.beam); }
      p.weapons.push(w);
    });
    // T4/T5 escort drones (visual + light auto-fire)
    p.escorts = [];
    if (this.s.tier >= 4) {
      const n = this.s.tier === 5 ? 4 : 2;
      for (let i = 0; i < n; i++) {
        const dg = buildShip(1).group; dg.scale.setScalar(0.45); this.scene.add(dg);
        p.escorts.push({ obj: dg, a: (i / n) * TAU, cd: rand(0, 1) });
      }
    }
    if (p.escortsOld) for (const e of p.escortsOld) this.scene.remove(e.obj);
    p.escortsOld = p.escorts;
    p.group = g; p.length = built.length; p.radius = T.radius; p.maxHp = st.hp; p.hp = Math.min(p.hp ?? st.hp, st.hp);
    this.scene.add(g);
  }
  makeBeam() {
    const geo = new THREE.CylinderGeometry(1, 1, 1, 8, 1, true); geo.translate(0, 0.5, 0); geo.rotateX(Math.PI / 2);
    const core = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: new THREE.Color(0.7, 1.9, 2.6), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
    const glow = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: new THREE.Color(0.05, 0.3, 0.6), transparent: true, opacity: 0.3, blending: THREE.AdditiveBlending, depthWrite: false }));
    core.scale.set(0.07, 0.07, 1); glow.scale.set(3, 3, 1);
    core.add(glow); core.visible = false; core.frustumCulled = false; glow.frustumCulled = false;
    return core;
  }

  // ---------- enemies ----------
  proto(type) {
    if (!this.protos[type]) {
      const b = buildPirate(type); const fl = makeFlames(b.engines, new THREE.Color(3.4, 0.8, 0.4)); b.group.add(fl.group);
      this.protos[type] = { ...b, flameMat: fl.mat };
    }
    return this.protos[type];
  }
  spawnEnemy(type, x, z, opts = {}) {
    const P = this.proto(type); const D = ENEMIES[type];
    const sec = sectorAt(Math.hypot(x, z)); const sc = 1 + 0.85 * Math.max(0, sec.danger - 1);
    const g = P.group.clone(); g.rotation.order = 'YXZ'; this.scene.add(g);
    const e = { type, D, x, z, vx: 0, vz: 0, yaw: rand(0, TAU), bank: 0, hp: D.hp * sc * (opts.hpMul || 1), maxHp: D.hp * sc * (opts.hpMul || 1), dmgMul: 1 + 0.5 * Math.max(0, sec.danger - 1),
      group: g, cd: rand(0.5, 2), state: 'attack', t: rand(0, 10), radius: P.radius, hard: P.hardpoints, hitT: 0, orbit: rand(0, TAU), ...opts };
    g.position.set(x, 0, z);
    this.enemies.push(e); return e;
  }
  removeEnemy(e) { this.scene.remove(e.group); e.dead = true; }
  spawnWave(danger, big = false) {
    const p = this.player; const a = rand(0, TAU); const d = rand(48, 60);
    const cx = p.x + Math.cos(a) * d, cz = p.z + Math.sin(a) * d;
    const list = [];
    if (danger <= 1) { const n = randInt(2, 4) + (big ? 2 : 0); for (let i = 0; i < n; i++) list.push('drone'); if (big || Math.random() < 0.35) list.push('interceptor'); }
    else if (danger === 2) { for (let i = 0; i < randInt(2, 3); i++) list.push('interceptor'); for (let i = 0; i < randInt(1, 3); i++) list.push('drone'); if (big || Math.random() < 0.4) list.push('gunship'); }
    else { for (let i = 0; i < randInt(2, 4); i++) list.push('interceptor'); list.push('gunship'); if (big) list.push('gunship'); for (let i = 0; i < randInt(2, 4); i++) list.push('drone'); }
    for (const t of list) this.spawnEnemy(t, cx + rand(-8, 8), cz + rand(-8, 8));
    this.audio.alarm(); this.toast(big ? '⚠ PIRATE RAID INCOMING!' : '⚠ Pirates detected', 'warn');
  }
  director(dt) {
    const p = this.player; const sec = sectorAt(Math.hypot(p.x, p.z));
    const danger = sec.danger;
    if (danger === 0) { this.heat = Math.max(0, this.heat - dt * 6); this.spawnT = Math.max(this.spawnT, 25); }
    else {
      const prev = this.heat;
      this.heat = Math.min(100, this.heat + dt * (0.35 + danger * 0.35));
      for (const th of [40, 75]) if (prev < th && this.heat >= th) this.spawnWave(danger, false);
      if (this.heat >= 100) { this.spawnWave(danger, true); this.heat = 55; }
      this.spawnT -= dt;
      const cap = 4 + danger * 4; const pirates = this.enemies.filter((e) => e.type !== 'sentinel' && e.type !== 'boss').length;
      if (this.spawnT <= 0) { this.spawnT = rand(28, 40) - danger * 5; if (pirates < cap) this.spawnWave(danger, false); }
    }
    // guards for rich asteroids
    // guards for rich asteroids: spawned lazily when the player gets close
    this.pendingGuards ||= new Map();
    for (const g of this.field.guardRequests) this.pendingGuards.set(g.id, g);
    this.field.guardRequests.length = 0;
    this.guardScan = (this.guardScan || 0) - dt;
    if (this.guardScan <= 0) {
      this.guardScan = 0.5;
      for (const [id, g] of this.pendingGuards) {
        const d = Math.hypot(g.x - p.x, g.z - p.z);
        if (d > 200) { this.pendingGuards.delete(id); continue; }
        if (d > 75 || this.guards.has(id)) continue;
        const dep = this.field.depleted.get(id); if (dep && this.time < dep) continue;
        const list = [];
        for (let i = 0; i < g.count; i++) list.push(this.spawnEnemy('sentinel', g.x + rand(-6, 6), g.z + rand(-6, 6), { guard: { x: g.x, z: g.z }, guardId: id, state: 'idle' }));
        this.guards.set(id, list); this.pendingGuards.delete(id);
      }
    }
    // boss
    const bd = Math.hypot(p.x - BOSS_LAIR.x, p.z - BOSS_LAIR.z);
    if (!this.boss && bd < 150 && this.time > (this.s.bossRespawnLocal || 0)) {
      this.boss = this.spawnEnemy('boss', BOSS_LAIR.x, BOSS_LAIR.z, { state: 'idle', phase: 1, summonT: 12, burstT: 6 });
      this.toast('☠ The Warlord Dreadnought awakens!', 'warn'); this.audio.alarm();
    }
  }
  updateEnemies(dt) {
    const p = this.player; const E = this.enemies;
    for (let i = E.length - 1; i >= 0; i--) {
      const e = E[i];
      if (e.dead) { E.splice(i, 1); continue; }
      e.t += dt; e.cd -= dt; if (e.hitT > 0) e.hitT -= dt;
      const dx = p.x - e.x, dz = p.z - e.z, dist = Math.hypot(dx, dz) || 0.001;
      const far = e.type === 'boss' ? 400 : 170;
      if (dist > far && !e.guard) { this.removeEnemy(e); E.splice(i, 1); if (e === this.boss) this.boss = null; continue; }
      if (e.guard && e.state === 'idle' && Math.hypot(e.guard.x - p.x, e.guard.z - p.z) > 110) { this.removeEnemy(e); E.splice(i, 1); if (e.guardId && this.guards.has(e.guardId)) { this.guards.delete(e.guardId); this.pendingGuards.set(e.guardId, { id: e.guardId, x: e.guard.x, z: e.guard.z, count: 1 }); } continue; }
      if (e.guard && Math.hypot(e.guard.x - p.x, e.guard.z - p.z) > 220) { this.removeEnemy(e); E.splice(i, 1); if (e.guardId) this.guards.delete(e.guardId); continue; }
      let tx = p.x, tz = p.z, spd = e.D.speed, wantFire = !this.dead && dist < e.D.range;
      const D = e.D;
      if (e.type === 'drone') {
        e.orbit += dt * 0.9; tx = p.x + Math.cos(e.orbit) * 9; tz = p.z + Math.sin(e.orbit) * 9;
      } else if (e.type === 'interceptor') {
        if (e.state === 'attack') { if (dist < 7) { e.state = 'break'; e.bt = 1.4; const a = Math.atan2(dz, dx) + rand(-1, 1); e.bx = e.x + Math.cos(a) * 30; e.bz = e.z + Math.sin(a) * 30; } }
        else { tx = e.bx; tz = e.bz; e.bt -= dt; wantFire = false; if (e.bt <= 0) e.state = 'attack'; }
        spd *= e.state === 'break' ? 1.2 : 1;
      } else if (e.type === 'gunship') {
        e.orbit += dt * 0.25; const r = 17; tx = p.x + Math.cos(e.orbit) * r; tz = p.z + Math.sin(e.orbit) * r;
      } else if (e.type === 'sentinel') {
        const gd = Math.hypot(e.guard.x - p.x, e.guard.z - p.z);
        if (e.state === 'idle' && gd < 24 && !this.dead) { e.state = 'attack'; this.toast('Mining sentinels activated!', 'warn'); }
        if (e.state === 'attack' && (gd > 55 || this.dead)) e.state = 'idle';
        if (e.state === 'idle') { e.orbit += dt * 0.5; tx = e.guard.x + Math.cos(e.orbit) * 7; tz = e.guard.z + Math.sin(e.orbit) * 7; wantFire = false; spd *= 0.4; }
        else { e.orbit += dt * 0.8; tx = p.x + Math.cos(e.orbit) * 11; tz = p.z + Math.sin(e.orbit) * 11; }
      } else if (e.type === 'boss') {
        if (e.state === 'idle' && dist < 70) { e.state = 'attack'; }
        if (e.state === 'attack') {
          const keep = 24; const a = Math.atan2(-dz, -dx); tx = p.x + Math.cos(a) * keep; tz = p.z + Math.sin(a) * keep;
          if (Math.hypot(e.x - BOSS_LAIR.x, e.z - BOSS_LAIR.z) > 120) { tx = BOSS_LAIR.x; tz = BOSS_LAIR.z; }
          e.summonT -= dt; e.burstT -= dt;
          if (e.hp < e.maxHp * 0.5 && e.phase === 1) { e.phase = 2; this.toast('The Warlord is enraged!', 'warn'); }
          if (e.summonT <= 0) { e.summonT = e.phase === 2 ? 10 : 15; const n = E.filter((x) => x.type === 'drone').length; if (n < 8) for (let k = 0; k < 3; k++) this.spawnEnemy('drone', e.x + rand(-6, 6), e.z + rand(-6, 6)); }
          if (e.burstT <= 0) { e.burstT = e.phase === 2 ? 3.5 : 5.5; const n = e.phase === 2 ? 24 : 16; for (let k = 0; k < n; k++) { const a2 = k / n * TAU + e.t; this.enemyShot(e.x, e.z, Math.cos(a2), Math.sin(a2), 16, D.dmg * 0.8 * e.dmgMul, [3.5, 0.6, 1.2]); } this.audio.enemyShoot(); }
        } else { tx = e.x; tz = e.z; wantFire = false; }
        const ring = e.group.getObjectByName('ring'); if (ring) ring.rotation.y += dt * (e.phase === 2 ? 2 : 0.8);
      }
      // steering
      const sx = tx - e.x, sz = tz - e.z, sd = Math.hypot(sx, sz) || 0.001;
      const accel = e.type === 'boss' ? 4 : e.type === 'gunship' ? 10 : 30;
      const desiredV = Math.min(spd, sd * 2);
      e.vx += ((sx / sd) * desiredV - e.vx) * Math.min(1, accel * dt / Math.max(spd, 1));
      e.vz += ((sz / sd) * desiredV - e.vz) * Math.min(1, accel * dt / Math.max(spd, 1));
      // separation
      for (let j = 0; j < E.length; j++) { const o = E[j]; if (o === e) continue; const ox = e.x - o.x, oz = e.z - o.z; const od = Math.hypot(ox, oz); const min = e.radius + o.radius + 0.5; if (od < min && od > 0.001) { e.vx += (ox / od) * (min - od) * 6 * dt; e.vz += (oz / od) * (min - od) * 6 * dt; } }
      e.x += e.vx * dt; e.z += e.vz * dt;
      // face: toward player when firing (gunship/boss/drone/sentinel), else movement dir
      const faceP = (e.type !== 'interceptor' || e.state === 'attack') && wantFire;
      const desiredYaw = faceP ? Math.atan2(dx, dz) : Math.atan2(e.vx, e.vz);
      const turn = e.type === 'boss' ? 0.6 : e.type === 'gunship' ? 1.5 : 5;
      const dy = angleDiff(e.yaw, desiredYaw); const step = clamp(dy, -turn * dt, turn * dt); e.yaw += step;
      e.bank = damp(e.bank, clamp(step / dt * 0.25, -0.7, 0.7), 5, dt);
      e.group.position.set(e.x, Math.sin(e.t * 2) * 0.15, e.z); e.group.rotation.set(0, e.yaw, -e.bank);
      const pulse = e.hitT > 0 ? 1 + e.hitT * 0.6 : 1; e.group.scale.setScalar(pulse);
      // fire
      if (wantFire && e.cd <= 0 && Math.abs(angleDiff(e.yaw, Math.atan2(dx, dz))) < (e.type === 'interceptor' ? 0.5 : 1.2)) {
        e.cd = 1 / D.fireRate * (e.type === 'boss' && e.phase === 2 ? 0.6 : 1) * rand(0.85, 1.15);
        const dmg = D.dmg * e.dmgMul; const ux = dx / dist, uz = dz / dist;
        if (e.type === 'gunship') { for (const off of [-0.18, 0, 0.18]) { const c = Math.cos(off), s = Math.sin(off); this.enemyShot(e.x + ux * 2.5, e.z + uz * 2.5, ux * c - uz * s, uz * c + ux * s, 22, dmg, [3.5, 1.2, 0.3]); } }
        else if (e.type === 'boss') { for (const h of e.hard) { const wx = e.x + Math.cos(e.yaw) * h.x + Math.sin(e.yaw) * h.z, wz = e.z - Math.sin(e.yaw) * h.x + Math.cos(e.yaw) * h.z; const ddx = p.x - wx, ddz = p.z - wz, dd = Math.hypot(ddx, ddz); this.enemyShot(wx, wz, ddx / dd, ddz / dd, 26, dmg, [3.5, 0.5, 0.4]); } }
        else this.enemyShot(e.x + ux * e.radius, e.z + uz * e.radius, ux, uz, e.type === 'drone' ? 20 : 30, dmg, e.type === 'sentinel' ? [3.2, 1.8, 0.3] : [3.5, 0.4, 0.4]);
        this.audio.enemyShoot();
      }
      // engine trail
      if (Math.random() < 0.3 * this.fx.budget) this.fx.emit(e.x - Math.sin(e.yaw) * e.radius, 0.2, e.z - Math.cos(e.yaw) * e.radius, -e.vx * 0.2, 0, -e.vz * 0.2, 0.4, 0.7 * (e.radius * 0.5 + 0.5), 0.1, 2.5, 0.6, 0.3, 2);
    }
  }
  enemyShot(x, z, ux, uz, speed, dmg, color) {
    this.bolts.spawn({ x, z, y: 0.6, vx: ux * speed, vz: uz * speed, dmg, owner: 'e', life: 2.2, len: 1.4, w: 1.3, color });
  }
  damageEnemy(e, dmg, crit) {
    if (e.dead) return;
    const d = dmg * (1 - e.D.armor); e.hp -= d; e.hitT = 0.15;
    if (e.type === 'sentinel' && e.state === 'idle') e.state = 'attack';
    if (e.type === 'boss' && e.state === 'idle') e.state = 'attack';
    if (this.ui && (crit || Math.random() < 0.35)) this.ui.float(e.x, 1.5, e.z, (crit ? 'CRIT ' : '') + Math.round(d), crit ? '#ffd166' : '#ff8a8a', crit);
    if (e.hp <= 0) this.killEnemy(e);
  }
  killEnemy(e) {
    this.removeEnemy(e);
    const big = e.type === 'boss' ? 4 : e.type === 'gunship' ? 1.8 : 1;
    this.fx.explosion(e.x, 0.5, e.z, big, [3.2, 0.5, 0.4]); this.rings.spawn(e.x, 0.3, e.z, 8 * big, [3, 1.2, 0.5], 0.6);
    this.debris.spawn(e.x, 0.3, e.z, Math.round(6 * big), 10, 0.6);
    this.audio.explode(big > 1); this.addShake(0.25 * big, e.x, e.z);
    const credits = Math.round(e.D.credits * e.dmgMul); this.addCredits(credits); this.addXP(Math.round(e.D.xp * e.dmgMul));
    this.ui && this.ui.float(e.x, 2, e.z, `+${credits} cr`, '#ffd166', true);
    const sec = sectorAt(Math.hypot(e.x, e.z)); const keys = Object.keys(sec.minerals);
    this.minerals.spawn(e.x, e.z, pick(keys), randInt(1, 3) * (e.type === 'gunship' ? 3 : 1));
    this.s.stats.kills++; this.emit('kill', { type: e.type });
    if (e.guardId) this.field.depleted.set(e.guardId, this.time + 180);
    if (e.type === 'boss') {
      this.boss = null; this.s.stats.bosses++; this.s.bossRespawnLocal = this.time + 300;
      this.minerals.spawn(e.x, e.z, 'voidstone', 25, 16); this.minerals.spawn(e.x, e.z, 'crimsonite', 25, 16);
      this.toast('WARLORD DESTROYED! Massive bounty collected!', 'level'); this.emit('boss', {});
      for (let k = 0; k < 6; k++) setTimeout(() => this.fx.explosion(e.x + rand(-8, 8), 0.5, e.z + rand(-8, 8), 2), k * 180);
    }
  }

  // ---------- player damage ----------
  hurtPlayer(dmg) {
    if (this.dead) return;
    const p = this.player; p.hp -= dmg; this.lastHurt = this.time;
    this.addShake(0.18); this.audio.hurt(); this.ui && this.ui.hurtFlash();
    if (p.hp <= 0) this.playerDie();
  }
  playerDie() {
    const p = this.player; this.dead = true; p.hp = 0; this.autopilot = false;
    this.fx.explosion(p.x, 0.5, p.z, 2.5, [0.5, 2, 3]); this.rings.spawn(p.x, 0, p.z, 20, [0.5, 2, 3], 0.8); this.debris.spawn(p.x, 0, p.z, 20, 14, 0.7);
    this.audio.explode(true); this.addShake(0.8); p.group.visible = false;
    let lost = 0; for (const k of MINERAL_KEYS) { const n = Math.ceil(this.s.cargo[k] / 2); lost += n; this.s.cargo[k] -= n; if (n) this.minerals.spawn(p.x, p.z, k, Math.min(n, 12), 12); }
    this.s.stats.deaths++;
    this.toast(`Hull breached! Lost ${lost} cargo units. Respawning at station…`, 'warn');
    setTimeout(() => {
      p.x = 0; p.z = 34; p.vx = p.vz = 0; p.hp = p.maxHp; p.group.visible = true; this.dead = false; this.heat = 0;
      for (const e of this.enemies) if (e.type !== 'sentinel' && e.type !== 'boss') this.removeEnemy(e);
      this.camPos.set(p.x, 40, p.z + 25);
    }, 2600);
  }
  addShake(a, x, z) {
    if (!this.s.settings.shake) return;
    if (x !== undefined) { const d = Math.hypot(x - this.player.x, z - this.player.z); a *= clamp(1 - d / 60, 0, 1); }
    this.shake = Math.min(1, this.shake + a);
  }

  // ---------- asteroids ----------
  damageRock(a, dmg, crit) {
    if (!a.alive) return;
    a.hp -= dmg; a.hitT = 0.18;
    if (a.rich) { const sec = sectorAt(Math.hypot(a.x, a.z)); if (sec.danger) this.heat = Math.min(100, this.heat + dmg * 0.012); }
    if (crit && this.ui) this.ui.float(a.x, 1.5, a.z, 'CRIT ' + Math.round(dmg), '#ffd166');
    if (a.hp <= 0) this.breakRock(a);
  }
  breakRock(a) {
    const st = this.stats(); const col = new THREE.Color(MINERALS[a.type].color);
    const tint = [col.r * 3, col.g * 3, col.b * 3];
    this.fx.burst(a.x, a.y, a.z, 12 + a.r * 5, 10 + a.r * 2, 0.8, 1.2, 0.15, tint.map((v) => v * 0.7), 2);
    this.fx.burst(a.x, a.y, a.z, 8 + a.r * 3, 5, 1.0, a.r * 1.2, a.r * 2, [0.35, 0.3, 0.32], 2);
    this.fx.emit(a.x, a.y + 0.5, a.z, 0, 0, 0, 0.2, a.r * 2, a.r * 3.5, tint[0] * 0.5, tint[1] * 0.5, tint[2] * 0.5, 0);
    this.debris.spawn(a.x, a.y, a.z, Math.round(4 + a.r * 3), 6 + a.r * 2, 0.5 + a.r * 0.25);
    this.rings.spawn(a.x, a.y, a.z, a.r * 3, tint.map((v) => v * 0.5), 0.45);
    this.audio.rockBreak(a.r > 3); this.addShake(0.05 + a.r * 0.03, a.x, a.z);
    const sec = sectorAt(Math.hypot(a.x, a.z));
    const n = Math.max(1, Math.round(a.r * 1.5 * (a.rich ? 2.6 : 1) * st.mining * (1 + 0.2 * (sec.id - 1))));
    this.minerals.spawn(a.x, a.z, a.type, n, 5 + a.r);
    this.addXP(Math.round(a.r * 2 * sec.id * (a.rich ? 3 : 1)));
    this.s.stats.rocks++; this.emit('rock', {});
    if (a.r > 3.3 && !a.rich) { const k = randInt(2, 3); for (let i = 0; i < k; i++) { const ang = rand(0, TAU); this.field.spawnFragment(a.x + Math.cos(ang) * a.r * 0.6, a.z + Math.sin(ang) * a.r * 0.6, rand(1.0, 1.5), a.type, a.sector); } }
    this.field.destroy(a, this.time, a.rich ? 240 : 150);
  }

  // ---------- targeting ----------
  findTarget(x, z, range, preferShips) {
    let best = null, bd = Infinity, bestS = null, bsd = Infinity;
    for (const e of this.enemies) { if (e.dead || (e.type === 'sentinel' && e.state === 'idle' && !preferShips)) continue; const d = Math.hypot(e.x - x, e.z - z) - e.radius; if (d < range && d < bsd) { bsd = d; bestS = e; } }
    if (preferShips && bestS) return { kind: 'ship', o: bestS };
    for (const a of this.field.list) { if (!a.alive) continue; const d = Math.hypot(a.x - x, a.z - z) - a.r * 0.8; if (d < range && d < bd) { bd = d; best = a; } }
    if (best) return { kind: 'rock', o: best };
    if (bestS) return { kind: 'ship', o: bestS };
    return null;
  }
  targetValid(t, x, z, range) {
    if (!t) return false; const o = t.o;
    if (t.kind === 'rock' ? !o.alive : o.dead) return false;
    const r = t.kind === 'rock' ? o.r * 0.8 : o.radius;
    return Math.hypot(o.x - x, o.z - z) - r < range;
  }

  updateWeapons(dt) {
    const p = this.player; const st = this.stats();
    const hasCombat = p.weapons.some((w) => w.key !== 'laser');
    let laserOn = 0;
    p.group.updateMatrixWorld(true);
    for (const w of p.weapons) {
      const W = WEAPONS[w.key]; const range = W.range * st.range;
      w.retarget -= dt; w.cd -= dt;
      if (this.dead) { if (w.beam) w.beam.visible = false; continue; }
      const preferShips = w.key !== 'laser' || !hasCombat;
      if (w.retarget <= 0 || !this.targetValid(w.target, p.x, p.z, range)) {
        w.target = this.findTarget(p.x, p.z, range, preferShips); w.retarget = 0.3;
      }
      // pulse is omni
      if (w.key === 'pulse') {
        if (w.target && w.cd <= 0) { w.cd = 1 / (W.rate * st.rate); this.firePulse(range * 0.9, W.dmg * st.dmg, W); }
        continue;
      }
      const t = w.target;
      const muzzle = this.tmpV.copy(w.turret.userData.muzzle); w.turret.localToWorld(muzzle);
      if (!t) { if (w.beam) w.beam.visible = false; w.turret.rotation.y = damp(w.turret.rotation.y, 0, 3, dt); continue; }
      const o = t.o; const ty = t.kind === 'rock' ? o.y : 0.4;
      // aim turret (local yaw)
      const wantYaw = Math.atan2(o.x - muzzle.x, o.z - muzzle.z) - p.yaw;
      const cur = w.turret.rotation.y; const dd = angleDiff(cur, wantYaw);
      w.turret.rotation.y = cur + clamp(dd, -10 * dt, 10 * dt);
      const aimed = Math.abs(dd) < 0.5;
      if (w.key === 'laser') {
        laserOn++;
        const tgt = this.tmpV2.set(o.x, ty, o.z); const dir = tgt.clone().sub(muzzle); const len = dir.length();
        const rad = t.kind === 'rock' ? o.r * 0.75 : o.radius * 0.6; const hitLen = Math.max(0.5, len - rad);
        dir.normalize(); const hit = muzzle.clone().addScaledVector(dir, hitLen);
        w.beam.visible = aimed; w.beam.position.copy(muzzle); w.beam.lookAt(hit); w.beam.scale.z = hitLen;
        const flick = 0.85 + Math.random() * 0.3; w.beam.scale.x = w.beam.scale.y = 0.06 * flick * (1 + this.s.tier * 0.12);
        if (!aimed) continue;
        const mult = t.kind === 'rock' ? W.vsRock * st.mining : W.vsShip;
        w.acc += W.dps * st.dmg * mult * st.rate * dt; w.tick -= dt;
        if (Math.random() < 0.7 * this.fx.budget) this.fx.emit(hit.x, hit.y, hit.z, rand(-6, 6), rand(0, 4), rand(-6, 6), 0.35, 0.7, 0.1, 1.2, 2.8, 3.4, 3);
        if (Math.random() < 0.15 * this.fx.budget && t.kind === 'rock') this.fx.emit(hit.x, hit.y, hit.z, rand(-3, 3), rand(0, 2), rand(-3, 3), 0.8, 0.4, 1.4, 0.25, 0.22, 0.22, 2);
        if (w.tick <= 0) {
          w.tick = 0.15; const crit = Math.random() < st.crit; const dmg = w.acc * (crit ? 2.5 : 1); w.acc = 0;
          if (t.kind === 'rock') this.damageRock(o, dmg, crit); else this.damageEnemy(o, dmg, crit);
        }
      } else if (w.cd <= 0 && aimed) {
        if (w.key === 'cannon') {
          w.cd = 1 / (W.rate * st.rate);
          const speed = W.speed * st.proj; const d = Math.hypot(o.x - muzzle.x, o.z - muzzle.z); const lead = d / speed;
          const ax = o.x + (o.vx || 0) * lead, az = o.z + (o.vz || 0) * lead; const ad = Math.hypot(ax - muzzle.x, az - muzzle.z) || 1;
          const sp = rand(-0.03, 0.03); const ux = (ax - muzzle.x) / ad, uz = (az - muzzle.z) / ad; const c = Math.cos(sp), s = Math.sin(sp);
          this.bolts.spawn({ x: muzzle.x, z: muzzle.z, y: muzzle.y, vx: (ux * c - uz * s) * speed, vz: (uz * c + ux * s) * speed, dmg: W.dmg * st.dmg, owner: 'p', kind: 'cannon', W, life: range * 1.3 / speed, len: 1.8, w: 1, color: [3.2, 2.4, 0.8] });
          this.fx.emit(muzzle.x, muzzle.y, muzzle.z, 0, 0, 0, 0.08, 1.4, 0.4, 3, 2.2, 0.8, 0);
          this.audio.shoot();
        } else if (w.key === 'missile') {
          w.cd = 1 / (W.rate * st.rate);
          for (const off of [-0.5, 0.5]) {
            const base = p.yaw + w.turret.rotation.y + off; const speed = W.speed * st.proj;
            this.bolts.spawn({ x: muzzle.x, z: muzzle.z, y: muzzle.y, vx: Math.sin(base) * speed * 0.5, vz: Math.cos(base) * speed * 0.5, speed, dmg: W.dmg * st.dmg, owner: 'p', kind: 'missile', W, target: t, life: 3.2, len: 1.2, w: 1.8, color: [3.4, 1.6, 0.5], splash: W.splash * (1 + 0.1 * (this.s.tier - 1)) });
          }
          this.audio.missile();
        }
      }
    }
    this.audio.laser(laserOn > 0 && !this.dead, Math.min(2, laserOn));
    // escort drones (T4/T5)
    for (const esc of p.escorts || []) {
      esc.a += dt * 1.2; const r = p.radius + 4;
      const ex = p.x + Math.cos(esc.a) * r, ez = p.z + Math.sin(esc.a) * r;
      esc.obj.position.set(ex, 1.5 + Math.sin(esc.a * 2) * 0.4, ez); esc.obj.rotation.y = -esc.a;
      esc.cd -= dt;
      if (esc.cd <= 0 && !this.dead) {
        const t = this.findTarget(ex, ez, 20 * st.range, true);
        if (t) { esc.cd = 0.6 / st.rate; const o = t.o; const d = Math.hypot(o.x - ex, o.z - ez) || 1; const sp = 55 * st.proj;
          this.bolts.spawn({ x: ex, z: ez, y: 1.2, vx: (o.x - ex) / d * sp, vz: (o.z - ez) / d * sp, dmg: 5 * st.dmg, owner: 'p', kind: 'cannon', W: WEAPONS.cannon, life: 0.6, len: 1.2, w: 0.8, color: [0.6, 2.6, 3.4] }); }
        else esc.cd = 0.3;
      }
    }
  }
  firePulse(radius, dmg, W) {
    const p = this.player; const st = this.stats();
    this.rings.spawn(p.x, 0.3, p.z, radius, [1.8, 0.8, 3.2], 0.5); this.rings.spawn(p.x, 0.3, p.z, radius * 0.7, [1.2, 0.6, 2.4], 0.35);
    this.fx.burst(p.x, 0.4, p.z, 30, radius * 3, 0.35, 1.0, 0.2, [1.6, 0.8, 3], 3, 0.05);
    this.audio.pulse(); this.addShake(0.08);
    for (const e of [...this.enemies]) if (!e.dead && Math.hypot(e.x - p.x, e.z - p.z) < radius + e.radius) { const c = Math.random() < st.crit; this.damageEnemy(e, dmg * W.vsShip * (c ? 2.5 : 1), c); }
    for (const a of [...this.field.list]) if (a.alive && Math.hypot(a.x - p.x, a.z - p.z) < radius + a.r * 0.5) { const c = Math.random() < st.crit; this.damageRock(a, dmg * W.vsRock * st.mining * (c ? 2.5 : 1), c); }
  }
  explodeMissile(b) {
    const st = this.stats();
    this.fx.explosion(b.x, 0.5, b.z, 0.6); this.rings.spawn(b.x, 0.4, b.z, b.splash, [3, 1.4, 0.4], 0.35); this.audio.hit();
    for (const e of [...this.enemies]) { if (e.dead) continue; const d = Math.hypot(e.x - b.x, e.z - b.z); if (d < b.splash + e.radius) { const c = Math.random() < st.crit; this.damageEnemy(e, b.dmg * b.W.vsShip * (d < e.radius + 0.5 ? 1 : 0.6) * (c ? 2.5 : 1), c); } }
    for (const a of [...this.field.list]) { if (!a.alive) continue; const d = Math.hypot(a.x - b.x, a.z - b.z); if (d < b.splash + a.r * 0.7) { const c = Math.random() < st.crit; this.damageRock(a, b.dmg * b.W.vsRock * st.mining * (c ? 2.5 : 1), c); } }
  }
  updateBolts(dt) {
    const p = this.player; const st = this.stats();
    for (const b of this.bolts.list) {
      if (b.dead) continue;
      b.life -= dt;
      if (b.kind === 'missile') {
        const t = b.target; let tx, tz;
        if (t && (t.kind === 'rock' ? t.o.alive : !t.o.dead)) { tx = t.o.x; tz = t.o.z; }
        else { const nt = this.findTarget(b.x, b.z, 30, true); if (nt) { b.target = nt; tx = nt.o.x; tz = nt.o.z; } }
        const cur = Math.atan2(b.vx, b.vz); let sp = Math.hypot(b.vx, b.vz); sp = Math.min(b.speed, sp + b.speed * 2 * dt);
        let ang = cur; if (tx !== undefined) ang = cur + clamp(angleDiff(cur, Math.atan2(tx - b.x, tz - b.z)), -6 * dt, 6 * dt);
        b.vx = Math.sin(ang) * sp; b.vz = Math.cos(ang) * sp;
        if (Math.random() < 0.8 * this.fx.budget) this.fx.emit(b.x, b.y, b.z, rand(-1, 1), rand(0, 1), rand(-1, 1), 0.5, 0.8, 1.6, 1.4, 0.7, 0.3, 2);
      }
      b.x += b.vx * dt; b.z += b.vz * dt;
      if (b.owner === 'p') {
        let hit = false;
        for (const e of this.enemies) { if (e.dead) continue; if (Math.hypot(e.x - b.x, e.z - b.z) < e.radius + 0.4) { hit = true; if (b.kind === 'missile') this.explodeMissile(b); else { const c = Math.random() < st.crit; this.damageEnemy(e, b.dmg * b.W.vsShip * (c ? 2.5 : 1), c); this.fx.burst(b.x, 0.5, b.z, 4, 8, 0.25, 0.6, 0.1, [3, 2, 0.8], 3); this.audio.hit(); } break; } }
        if (!hit) for (const a of this.field.list) { if (!a.alive) continue; if (Math.abs(a.x - b.x) < a.r && Math.abs(a.z - b.z) < a.r && Math.hypot(a.x - b.x, a.z - b.z) < a.r * 0.85) { hit = true; if (b.kind === 'missile') this.explodeMissile(b); else { const c = Math.random() < st.crit; this.damageRock(a, b.dmg * b.W.vsRock * st.mining * (c ? 2.5 : 1), c); this.fx.burst(b.x, a.y, b.z, 3, 6, 0.3, 0.5, 0.1, [2.5, 1.8, 0.8], 3); } break; } }
        if (hit) { b.dead = true; continue; }
        if (b.life <= 0 && b.kind === 'missile') this.explodeMissile(b);
      } else if (!this.dead) {
        if (Math.hypot(p.x - b.x, p.z - b.z) < p.radius) { this.hurtPlayer(b.dmg); this.fx.burst(b.x, 0.5, b.z, 6, 8, 0.3, 0.8, 0.1, [3, 0.6, 0.4], 3); b.dead = true; continue; }
      }
      if (b.life <= 0) b.dead = true;
    }
    this.bolts.sync();
  }

  // ---------- hp bars ----------
  initBars() {
    const bg = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.6, depthTest: false });
    const geo = new THREE.PlaneGeometry(1, 1); geo.translate(0.5, 0, 0);
    for (let i = 0; i < 40; i++) {
      const g = new THREE.Group(); const b = new THREE.Mesh(geo, bg); const f = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: 0xff4455, depthTest: false }));
      b.renderOrder = 20; f.renderOrder = 21; f.position.z = 0.01; g.add(b, f); g.visible = false; this.scene.add(g); this.bars.push({ g, f });
    }
  }
  updateBars() {
    let i = 0; const q = this.camera.quaternion;
    const show = (x, y, z, w, frac, col) => { if (i >= this.bars.length) return; const B = this.bars[i++]; B.g.visible = true; B.g.position.set(x - w / 2, y, z); B.g.quaternion.copy(q); B.g.scale.set(w, Math.max(0.22, w * 0.07), 1); B.f.scale.x = clamp(frac, 0, 1); B.f.material.color.set(col); };
    for (const e of this.enemies) if (!e.dead && e.hp < e.maxHp && e.type !== 'boss') show(e.x, 2 + e.radius, e.z - e.radius, Math.max(2, e.radius * 1.6), e.hp / e.maxHp, '#ff4d5e');
    for (const a of this.field.list) if (a.alive && a.hp < a.maxHp && Math.hypot(a.x - this.player.x, a.z - this.player.z) < 50) show(a.x, a.y + a.r + 1, a.z - a.r, Math.max(1.8, a.r * 1.1), a.hp / a.maxHp, MINERALS[a.type].css);
    for (; i < this.bars.length; i++) this.bars[i].g.visible = false;
  }

  // ---------- main update ----------
  update(dt) {
    this.time += dt; this.s.stats.playTime += dt;
    const p = this.player; const st = this.stats(); const T = TIERS[this.s.tier - 1];
    this.field.setTime(this.time);
    // --- movement ---
    let ix = this.input.x, iz = this.input.z; const mag = Math.min(1, Math.hypot(ix, iz));
    if (mag > 0.08 && this.autopilot) { this.autopilot = false; this.toast('Autopilot off'); }
    if (this.autopilot && !this.dead) { const d = Math.hypot(p.x, p.z) || 1; ix = -p.x / d; iz = -p.z / d; if (d < DOCK_R - 6) { this.autopilot = false; } }
    const im = Math.min(1, Math.hypot(ix, iz));
    if (!this.dead) {
      p.vx += ix * st.accel * dt; p.vz += iz * st.accel * dt;
      const drag = im > 0.05 ? 0.6 : 1.8; const k = Math.exp(-drag * dt); p.vx *= k; p.vz *= k;
      const sp = Math.hypot(p.vx, p.vz); const max = st.speed * (this.autopilot ? 1.15 : 1);
      if (sp > max) { p.vx *= max / sp; p.vz *= max / sp; }
      p.x += p.vx * dt; p.z += p.vz * dt;
    }
    p.thrust = damp(p.thrust, im, 6, dt);
    // collisions with rocks & station core
    for (const a of this.field.list) {
      if (!a.alive) continue; const dx = p.x - a.x, dz = p.z - a.z; const min = a.r * 0.85 + p.radius * 0.7;
      if (Math.abs(dx) > min || Math.abs(dz) > min) continue;
      const d = Math.hypot(dx, dz); if (d < min && d > 0.001) { const nx = dx / d, nz = dz / d; p.x = a.x + nx * min; p.z = a.z + nz * min; const vn = p.vx * nx + p.vz * nz; if (vn < 0) { p.vx -= vn * 1.4 * nx; p.vz -= vn * 1.4 * nz; } }
    }
    { const d = Math.hypot(p.x, p.z); const min = 8 + p.radius * 0.5; if (d < min && d > 0.001) { p.x = p.x / d * min; p.z = p.z / d * min; } }
    // heading & banking
    const sp = Math.hypot(p.vx, p.vz);
    if (sp > 0.8 || im > 0.1) {
      const want = im > 0.1 ? Math.atan2(ix, iz) : Math.atan2(p.vx, p.vz);
      const turnRate = 4.2 * T.accel; const dy = angleDiff(p.yaw, want); const step = clamp(dy, -turnRate * dt, turnRate * dt);
      p.yaw += step; p.yawVel = step / Math.max(dt, 1e-4);
    } else p.yawVel = 0;
    p.bank = damp(p.bank, clamp(p.yawVel * 0.22, -0.65, 0.65), 6, dt);
    p.group.position.set(p.x, Math.sin(this.time * 1.6) * 0.12, p.z);
    p.group.rotation.set(Math.sin(this.time * 1.1) * 0.02 - p.thrust * 0.05, p.yaw, -p.bank);
    // flames + trails
    const pw = 0.25 + p.thrust * 1.1; p.flames.mat.uniforms.uPower.value = pw; p.flames.mat.uniforms.uTime.value = this.time;
    for (const f of p.flames.flames) { const L = f.r * (1.2 + p.thrust * 5.5) * (0.9 + Math.random() * 0.2); f.mesh.scale.set(1, 1, L); f.mesh.visible = !this.dead; f.sprite.scale.setScalar(f.r * (1.8 + p.thrust * 1.6)); }
    if (!this.dead && p.thrust > 0.2) {
      p.group.updateMatrixWorld(true);
      for (const f of p.flames.flames) if (Math.random() < p.thrust * 0.6 * this.fx.budget) {
        const wp = this.tmpV.copy(f.mesh.position); f.mesh.parent.localToWorld(wp);
        this.fx.emit(wp.x, wp.y, wp.z, -Math.sin(p.yaw) * 8 + rand(-1, 1), rand(-0.3, 0.3), -Math.cos(p.yaw) * 8 + rand(-1, 1), 0.45, f.r * 2.2, 0.1, 0.35, 1.4, 2.2, 2);
      }
    }
    // hull regen + docking
    const dHome = Math.hypot(p.x, p.z);
    const wasDocked = this.docked; this.docked = !this.dead && dHome < DOCK_R;
    if (this.docked) { p.hp = Math.min(p.maxHp, p.hp + p.maxHp * 0.25 * dt); }
    else if (this.time - this.lastHurt > 4 && !this.dead) p.hp = Math.min(p.maxHp, p.hp + p.maxHp * 0.025 * dt);
    if (this.docked && this.cargoTotal() > 0) {
      const r = this.sellCargo();
      if (r) { this.toast(`Sold cargo: +${r.credits} cr${r.vaulted ? ` · ${r.vaulted} rare units to vault` : ''}`, 'good'); this.ui && this.ui.float(p.x, 2, p.z, `+${r.credits} cr`, '#ffd166', true); }
    }
    if (this.docked && !wasDocked) { this.autopilot = false; this.ui && this.ui.onDock(); }
    // sector tracking
    const sec = sectorAt(dHome);
    if (sec.id !== this.sectorId) { this.sectorId = sec.id; this.ui && this.ui.sectorBanner(sec); if (sec.id > this.s.maxSector) { this.s.maxSector = sec.id; this.save(); } }
    // world streaming
    this.field.loadR = this.s.tier >= 4 ? 3 : 2;
    this.field.update(p.x, p.z, this.time, dt);
    this.director(dt);
    this.updateEnemies(dt);
    this.updateWeapons(dt);
    this.updateBolts(dt);
    // minerals
    const cap = st.cargo;
    this.minerals.update(dt, p.x, p.z, st.magnet, p.radius + 1.0, () => !this.dead && this.cargoTotal() < cap, (o) => {
      this.s.cargo[o.type]++; this.s.stats.mined++; this.pickupCombo++; this.pickupT = 0.5;
      this.pickupAgg[o.type] = (this.pickupAgg[o.type] || 0) + 1;
      this.audio.pickup(this.pickupCombo); this.emit('collect', { type: o.type, n: 1 });
      this.fx.emit(p.x, 0.6, p.z, 0, 2, 0, 0.25, 1.2, 2.2, 0.6, 1.8, 2.6, 0);
      if (this.cargoTotal() >= cap) { this.toast('Cargo full! Return to the station to sell.', 'warn'); this.ui && this.ui.cargoFull(); }
    }, this.time);
    this.pickupT -= dt;
    if (this.pickupT <= 0 && Object.keys(this.pickupAgg).length) {
      let off = 0; for (const k in this.pickupAgg) { this.ui && this.ui.float(p.x + off, 2.5, p.z - 1, `+${this.pickupAgg[k]} ${MINERALS[k].name}`, MINERALS[k].css); off += 1.5; }
      this.pickupAgg = {}; this.pickupCombo = 0; this.pickupT = 0.5;
    }
    this.updateFactory(dt);
    // fx
    this.fx.update(dt); this.debris.update(dt); this.rings.update(dt);
    animateStation(this.stationRoot, this.time, dt);
    this.updateBars();
  }

  updateCamera(dt, aspect) {
    if (this.camOverride) { const o = this.camOverride; this.camera.position.set(o.x, o.y, o.z); this.camera.lookAt(o.tx, o.ty, o.tz); return; }
    const p = this.player; const T = TIERS[this.s.tier - 1];
    const portrait = aspect < 1;
    const base = portrait ? 42 : 34; const dist = base * T.cam * (portrait ? clamp(0.6 / aspect, 1, 1.2) : 1);
    const elev = 1.02; // radians (~58 deg)
    const lookX = p.x + p.vx * 0.35, lookZ = p.z + p.vz * 0.35 - (portrait ? 2 : 0);
    this.camLook.x = damp(this.camLook.x, lookX, 4, dt); this.camLook.z = damp(this.camLook.z, lookZ, 4, dt);
    const tx = this.camLook.x, ty = Math.sin(elev) * dist, tz = this.camLook.z + Math.cos(elev) * dist;
    this.camPos.x = damp(this.camPos.x, tx, 6, dt); this.camPos.y = damp(this.camPos.y, ty, 2.5, dt); this.camPos.z = damp(this.camPos.z, tz, 6, dt);
    this.camera.position.copy(this.camPos);
    this.camera.lookAt(this.camLook.x, 0, this.camLook.z);
    if (this.shake > 0) {
      const s = this.shake * this.shake * 1.2; this.camera.position.x += rand(-s, s); this.camera.position.y += rand(-s, s) * 0.5; this.camera.position.z += rand(-s, s);
      this.shake = Math.max(0, this.shake - dt * 1.8);
    }
  }
}

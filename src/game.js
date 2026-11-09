// Core game: state, player ship, weapons, enemies, economy, quests, saving
import * as THREE from 'three';
import { clamp, lerp, damp, rand, randInt, pick, angleDiff, TAU } from './util.js?v=5';
import { MINERALS, MINERAL_KEYS, SECTORS, sectorAt, BOSS_LAIR, TIERS, STATION_LEVELS, UPGRADES, upgradeCost, ENEMIES, xpForLevel } from './data.js?v=5';
import { buildShip, makeTurret, makeFlames, buildPirate, buildStation, animateStation, animateNavLights, disposeObject, glowTexture, tintPirate, buildInstallation, makeDome, rarityRing, buildLootPod, buildCacheCrate, buildInstallationV5, buildFlagship, buildBossPart, factionMats, retint } from './models.js?v=5';
import { Campaign, FLEET } from './campaign.js?v=5';
import { roleAI } from './ai.js?v=5';
import { BOSS_BY_BP } from './bosses.js?v=5';
import { RING_L0, TTK, ttkHp, shipK, dmgK } from './balance.js?v=5';
import { newGame, readKey, writeKey, deleteKey, slotKey, meta, exportCode, importCode, AUTO_KEY, SLOT_COUNT, INV_CAP } from './save.js?v=5';
import { SKILLS, SKILL_BY_ID, ABILITIES, ABILITY_ORDER, spEarned, spSpent, skillFx, skillState, skillCost, respecCost } from './rpg.js?v=5';
import { RARITIES, TEMPLATES, makeItem, itemStats, itemPower, upgradeCost as itemUpCost, salvageValue, rollLoot, lootChance, merchantStock } from './items.js?v=5';
import { FACTIONS, GSECTORS, SECTOR_BY_ID, gsectorAt, caches, liberation, owner, dangerOf, isPirate, neighbours, bindWorld } from './galaxy.js?v=5';
import { AsteroidField, Minerals } from './world.js?v=5';
import { Particles, Debris, Rings, Bolts, Flashes } from './fx.js?v=5';
import { STORY, makeContract } from './quests.js?v=5';

const DOCK_R = 28;
const BEH_TURRET = { beam: 'laser', bolt: 'cannon', missile: 'missile', pulse: 'pulse' };
const INST_XP = { inst_turret: 15, inst_gen: 40, inst_core: 120 };
const ENERGY_DMG = { drone: 1, interceptor: 1, sentinel: 1, inst_turret: 0, gunship: 0, boss: 1, sniper: 0, support: 1, ew: 1, capital: 0, commander: 1, flagship: 1, bpart: 0, inst_def: 0 };
const ENEMY_SFX = { sniper: 'gunship', support: 'drone', ew: 'interceptor', capital: 'boss', commander: 'boss', flagship: 'boss', freighter: 'drone' }; // 1 = energy (laser) shots, 0 = kinetic
const DRONES = [0, 2, 3, 4, 6, 10];

export class Game {
  constructor(scene, camera, audio) {
    this.scene = scene; this.camera = camera; this.audio = audio;
    this.time = 0; this.ui = null; this.listeners = {};
    this.s = this.load(); bindWorld(this.s.galaxy);
    // systems
    this.fx = new Particles(scene, 4000);
    this.smoke = new Particles(scene, 900, { normal: true });
    this.flashes = new Flashes(scene, 3);
    this.debris = new Debris(scene);
    this.rings = new Rings(scene);
    this.bolts = new Bolts(scene, 600);
    this.field = new AsteroidField(scene); this.field.camera = camera;
    this.minerals = new Minerals(scene);
    this.enemies = []; this.protos = {};
    this.heat = 0; this.spawnT = 30; this.guards = new Map();
    this.shake = 0; this.input = { x: 0, z: 0, active: false };
    this.autopilot = false; this.docked = false; this.dead = false;
    this.pickupCombo = 0; this.pickupT = 0; this.pickupAgg = {};
    this.boss = null; this.lastHurt = -10; this.sectorId = 1;
    // v4 systems
    this.abil = { cd: {}, last: {} }; this.overT = 0; this.surgeT = 0; this.dashT = 0; this.emergT = -99; this.emergThrustT = -99; this.lastShieldHit = -10;
    this.loot = []; this.lootPool = []; this.liveCaches = new Map(); this.cachePool = []; this.jamT = 0;
    this.allies = []; this.gsec = GSECTORS[0]; this.secEnterT = -99; this.taken = new Set(); this.fxCache = null;
    this.tmpV = new THREE.Vector3(); this.tmpV2 = new THREE.Vector3(); this.droneOre = 0; this.dockT = 0;
    this.shieldMat = this.makeShieldMat(); this.tractor = this.makeBeam(new THREE.Color(0.3, 1.4, 2.2), new THREE.Color(0.05, 0.25, 0.5)); scene.add(this.tractor);
    // station
    this.stationRoot = null; this.buildStationModel();
    // player
    this.player = { x: this.s.pos.x, z: this.s.pos.z, vx: 0, vz: 0, yaw: Math.PI, yawVel: 0, bank: 0, thrust: 0, group: null, weapons: [], radius: 1.4, hp: 100, maxHp: 100 };
    this.buildPlayerShip();
    if (this.s.hp != null) this.player.hp = Math.min(this.s.hp, this.stats().hp);
    // hp bars pool
    this.bars = []; this.initBars();
    this.camp = new Campaign(this);
    // offline factory accrual
    this.updateFactory(0, true);
    if (!this.s.contracts.length) for (let i = 0; i < 3; i++) this.s.contracts.push(this.newContract());
    this.camPos = new THREE.Vector3(this.player.x, 40, this.player.z + 25);
    this.camLook = new THREE.Vector3(this.player.x, 0, this.player.z);
  }

  get liveOutposts() { return this.camp.live; }
  invCap() { return INV_CAP; }
  // ---------- events ----------
  on(ev, fn) { (this.listeners[ev] ||= []).push(fn); }
  emit(ev, data) { (this.listeners[ev] || []).forEach((f) => f(data)); this.questEvent(ev, data); }
  toast(msg, kind) { this.ui && this.ui.toast(msg, kind); }

  // ---------- save/load ----------
  load() { return readKey(AUTO_KEY) || newGame(); }
  syncState() { this.s.pos = { x: this.player.x, z: this.player.z }; this.s.hp = this.player.hp; }
  save() {
    if (this.resetting) return false;
    this.syncState();
    const ok = writeKey(AUTO_KEY, this.s); if (ok) { this.lastSave = Date.now(); this.s.savedAt = this.lastSave; }
    return ok;
  }
  reset() { this.resetting = true; deleteKey(AUTO_KEY); location.reload(); }
  slotCount() { return SLOT_COUNT; }
  slotMeta(i) { return meta(readKey(i === 'auto' ? AUTO_KEY : slotKey(i))); }
  saveSlot(i) { this.syncState(); const ok = writeKey(slotKey(i), this.s); this.save(); return ok; }
  loadSlot(i) { const st = readKey(i === 'auto' ? AUTO_KEY : slotKey(i)); if (!st) return false; this.applyState(st); return true; }
  deleteSlot(i) { deleteKey(slotKey(i)); }
  exportSave() { this.syncState(); return exportCode(this.s); }
  importSave(code) { const r = importCode(code); if (r.ok) this.applyState(r.state); return r; }
  // replace the whole game state in place (used by Load / Import)
  applyState(st) {
    st.settings = { ...st.settings, ...this.s.settings }; // keep this device's audio/graphics settings
    st.factory.last = Date.now();
    for (const e of this.enemies) this.removeEnemy(e); this.enemies.length = 0; this.camp.reset(); this.boss = null;
    for (const l of this.loot) this.freeLoot(l); this.loot.length = 0; for (const [, c] of this.liveCaches) this.freeCache(c); this.liveCaches.clear(); this.clearAllies();
    this.abil = { cd: {}, last: {} }; this.overT = this.surgeT = this.dashT = 0; this.fxCache = null;
    this.guards.clear(); if (this.pendingGuards) this.pendingGuards.clear();
    for (const b of this.bolts.list) b.dead = true; this.bolts.sync();
    for (const o of this.minerals.list) { this.minerals.setHidden(o.idx); this.minerals.free.push(o.idx); } this.minerals.list.length = 0; this.minerals.mesh.instanceMatrix.needsUpdate = true;
    for (const a of this.field.list) a.alive = false; this.field.list.length = 0; this.field.chunks.clear(); this.field.depleted.clear(); this.field.guardRequests.length = 0;
    this.s = st; bindWorld(st.galaxy); this.camp.reset(); this.heat = 0; this.spawnT = 30; this.dead = false; this.autopilot = false; this.docked = false; this.dockT = 0;
    const p = this.player; p.x = st.pos.x; p.z = st.pos.z; p.vx = p.vz = 0; p.hp = undefined;
    this.buildStationModel(); this.buildPlayerShip(); p.group.visible = true;
    p.hp = st.hp != null ? Math.min(st.hp, p.maxHp) : p.maxHp;
    if (!this.s.contracts.length) for (let i = 0; i < 3; i++) this.s.contracts.push(this.newContract());
    this.sectorId = sectorAt(Math.hypot(p.x, p.z)).id; this.gsec = gsectorAt(p.x, p.z); p.energy = this.stats().energyMax; p.sh = this.stats().shield;
    this.camPos.set(p.x, 40, p.z + 25); this.camLook.set(p.x, 0, p.z);
    this.save(); this.emit('loaded', {});
  }

  // ---------- derived stats ----------
  skillFx() { return this.fxCache || (this.fxCache = skillFx(this.s.skills)); }
  stats() {
    const u = this.s.upgrades, T = TIERS[this.s.tier - 1]; const fx = this.skillFx(); const surge = this.surgeT > 0;
    const hp = Math.round(T.hp * (1 + 0.12 * u.hull));
    return {
      dmg: T.dmg * (1 + 0.12 * u.damage) * (1 + 0.02 * (this.s.level - 1)) * (surge ? 1.5 : 1),
      rate: (1 + 0.06 * u.firerate) * (1 + (fx.fireRate || 0)) * (surge ? 1.3 : 1),
      proj: (1 + 0.08 * u.projspeed) * (1 + (fx.projSpeed || 0)),
      range: (1 + 0.04 * u.range) * (1 + 0.1 * (this.s.tier - 1)) * (1 + (fx.range || 0)),
      crit: Math.min(0.75, 0.05 + 0.015 * u.crit + (fx.crit || 0)),
      mining: (1 + 0.1 * u.mining) * (1 + (fx.ore || 0)),
      speed: 15 * T.speed * (1 + 0.05 * u.engine) * (1 + (fx.speed || 0)),
      accel: 38 * T.accel * (1 + (fx.accel || 0)),
      turn: 4.2 * T.accel * (1 + (fx.turn || 0)),
      magnet: (10 + this.s.tier * 2) * (1 + 0.1 * u.magnet),
      cargo: Math.round(T.cargo * (1 + 0.15 * u.cargo)),
      hp,
      shield: Math.round(hp * 0.35 * (1 + (fx.shieldCap || 0))),
      shieldRegen: 0.12 * (1 + (fx.shieldRegen || 0)), shieldDelay: Math.max(0.8, 3 + (fx.shieldDelay || 0)),
      energyMax: Math.round(100 * (1 + (fx.energyMax || 0))), energyRegen: 14 * (1 + (fx.energyRegen || 0)),
      radar: 1 + (fx.radar || 0), luck: fx.luck || 0, pen: fx.pen || 0,
      slots: Math.min(8, T.slots + (fx.slots || 0)),
      fx,
    };
  }
  cargoTotal() { let n = 0; for (const k in this.s.cargo) n += this.s.cargo[k]; return n; }

  // ---------- station ----------
  buildStationModel() {
    if (this.stationRoot) { this.scene.remove(this.stationRoot); disposeObject(this.stationRoot); }
    this.stationRoot = buildStation(this.s.stationLvl, this.field.stationMat);
    this.scene.add(this.stationRoot);
  }
  factoryRates() {
    const m = STATION_LEVELS[this.s.stationLvl - 1].mult;
    return { income: 20 * Math.pow(1.3, this.s.factory.inc) * m, capacity: Math.round(150 * Math.pow(1.45, this.s.factory.cap) * m) };
  }
  droneCount() { return DRONES[this.s.stationLvl - 1] || 0; }
  droneIncome() { return this.droneCount() * 3 * STATION_LEVELS[this.s.stationLvl - 1].mult; }
  factoryUpCost(which) { return which === 'inc' ? Math.round(150 * Math.pow(1.6, this.s.factory.inc)) : Math.round(120 * Math.pow(1.55, this.s.factory.cap)); }
  updateFactory(dt, offline = false) {
    const f = this.s.factory, r = this.factoryRates();
    if (offline) { const el = Math.max(0, (Date.now() - f.last) / 1000); f.stored = Math.min(r.capacity, f.stored + r.income / 60 * el); this.offlineGain = el > 60 ? r.income / 60 * el : 0; }
    else {
      f.stored = Math.min(r.capacity, f.stored + (r.income + this.droneIncome()) / 60 * dt);
      const nd = DRONES[this.s.stationLvl - 1] || 0;
      if (nd && this.s.stationLvl >= 3) { this.droneOre += nd * dt / 900; if (this.droneOre >= 1) { this.droneOre -= 1; this.s.vault.viridium++; this.toast('Station drones hauled in 1 Viridium', 'good'); } }
    }
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
    this.s.stationLvl++; this.buildStationModel(); this.audio.stationUp();
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
    const sp0 = this.spAvail();
    while (this.s.xp >= xpForLevel(this.s.level)) { this.s.xp -= xpForLevel(this.s.level); this.s.level++; leveled = true;
      for (const k in TEMPLATES) if (TEMPLATES[k].lvl === this.s.level && TEMPLATES[k].price) this.toast(`${TEMPLATES[k].name} now sold at the station Armory`, 'good');
      for (const sk of SKILLS) if (sk.ability && sk.lvl === this.s.level) this.toast(`New ability available: ${sk.name} (Skill tree)`, 'good');
    }
    if (leveled) { const gained = this.spAvail() - sp0; this.audio.levelUp(); this.toast(`LEVEL UP! Level ${this.s.level} · +${gained} skill point${gained === 1 ? '' : 's'}`, 'level'); this.fx.burst(this.player.x, 1, this.player.z, 50, 18, 0.9, 1.2, 0.1, [2.5, 2.0, 0.6], 2); this.emit('level', {}); }
  }
  // ---------- skills (one level system: ship level -> skill points) ----------
  spAvail() { return spEarned(this.s.level) - spSpent(this.s.skills); }
  skillInfo(id) { return skillState(this.s.skills, id, this.s.level, this.spAvail()); }
  buySkill(id) {
    const sk = SKILL_BY_ID[id]; if (!sk) return false; const inf = this.skillInfo(id); if (!inf.canBuy) { this.audio.denied(); return false; }
    this.s.skills[id] = (this.s.skills[id] || 0) + 1; this.fxCache = null;
    const prevSlots = this.player.weapons.length; const st = this.stats();
    if (st.slots !== prevSlots || sk.fx?.slots) { this.ensureEquipSlots(); this.buildPlayerShip(); }
    this.player.maxHp = st.hp; this.audio.skill(); this.fx.burst(this.player.x, 1.2, this.player.z, 40, 14, 0.8, 1.0, 0.1, [2.6, 2.0, 0.6], 2);
    this.toast(sk.ability ? `Ability unlocked: ${sk.name}!` : `${sk.name} → rank ${this.s.skills[id]}`, 'good'); this.emit('skill', { id }); this.save(); return true;
  }
  respecInfo() { return { cost: respecCost(this.s.level), spent: spSpent(this.s.skills), docked: this.docked }; }
  respec() {
    const inf = this.respecInfo(); if (!inf.spent || this.s.credits < inf.cost || !this.docked) { this.audio.denied(); return false; }
    this.s.credits -= inf.cost; this.s.skills = {}; this.s.respecs++; this.fxCache = null; this.abil.cd = {};
    this.ensureEquipSlots(); this.buildPlayerShip(); this.audio.upgrade(); this.toast(`Skills reset: ${inf.spent} SP refunded`, 'good'); this.save(); return true;
  }
  abilityUnlocked(id) { const sk = SKILLS.find((x) => x.ability === id); return !!(sk && this.s.skills[sk.id]); }
  abilities() { return ABILITY_ORDER.filter((id) => this.abilityUnlocked(id)); }
  abilityCd(id) { const fx = this.skillFx(); return ABILITIES[id].cd * (1 - (fx.cdr || 0)) * (id === 'dash' ? 1 + (fx.dashCd || 0) : 1); }
  abilityCost(id) { const fx = this.skillFx(); return ABILITIES[id].energy * (id === 'dash' ? 1 + (fx.dashCost || 0) : 1); }
  abilityState(id) { const rem = Math.max(0, (this.abil.cd[id] || 0) - this.time); const cd = this.abilityCd(id); return { rem, frac: cd ? rem / cd : 0, ready: rem <= 0 && this.player.energy >= this.abilityCost(id), cost: this.abilityCost(id), energyOk: this.player.energy >= this.abilityCost(id) }; }
  // ---------- items / inventory ----------
  item(id) { return id ? this.s.inv.find((it) => it.id === id) || null : null; }
  equippedIds() { return new Set(this.s.equip.filter(Boolean)); }
  ensureEquipSlots() { const n = this.stats().slots; while (this.s.equip.length < n) this.s.equip.push(null); if (this.s.equip.length > n) { this.s.equip.length = n; } if (!this.s.equip.some(Boolean) && this.s.inv.length) this.s.equip[0] = this.s.inv[0].id; }
  equip(itemId, slot) {
    const it = this.item(itemId); this.ensureEquipSlots(); if (!it || slot < 0 || slot >= this.s.equip.length) return false;
    if (it.il > this.s.level) { this.toast(`Requires ship level ${it.il}`, 'warn'); this.audio.denied(); return false; }
    const prev = this.s.equip.indexOf(itemId); if (prev >= 0) this.s.equip[prev] = this.s.equip[slot];
    this.s.equip[slot] = itemId; this.buildPlayerShip(); this.audio.upgrade(); this.emit('equip', {}); this.save(); return true;
  }
  unequip(slot) {
    if (this.s.equip.filter(Boolean).length <= 1 && this.s.equip[slot]) { this.toast('You need at least one weapon equipped', 'warn'); this.audio.denied(); return false; }
    this.s.equip[slot] = null; this.buildPlayerShip(); this.audio.click(); this.save(); return true;
  }
  firstFreeSlot() { this.ensureEquipSlots(); return this.s.equip.findIndex((x) => !x); }
  upgradeItem(id) {
    const it = this.item(id); if (!it) return false; const R = RARITIES[it.r]; if (it.up >= R.maxUp) return false;
    const c = itemUpCost(it); if (this.s.credits < c.credits || this.s.parts < c.parts) { this.audio.denied(); return false; }
    this.s.credits -= c.credits; this.s.parts -= c.parts; it.up++;
    if (this.equippedIds().has(id)) this.buildPlayerShip(); this.audio.upgrade(); this.toast(`${it.name} upgraded to +${it.up}`, 'good'); this.emit('upgrade', { key: 'item' }); this.save(); return true;
  }
  salvageItem(id) {
    const it = this.item(id); if (!it) return false; if (this.equippedIds().has(id)) { this.toast('Unequip it before salvaging', 'warn'); return false; }
    if (it.lock) { this.toast('Item is locked', 'warn'); return false; }
    const v = salvageValue(it); this.s.inv = this.s.inv.filter((x) => x !== it); this.s.parts += v.parts; this.addCredits(v.credits);
    this.audio.coins(); this.toast(`Salvaged ${it.name}: +${v.parts} components, +${v.credits} cr`, 'good'); this.save(); return v;
  }
  addItem(it, announce = true) {
    if (this.s.inv.length >= INV_CAP) { const v = salvageValue(it); this.s.parts += v.parts; this.addCredits(v.credits); this.toast(`Inventory full: auto-salvaged ${it.name} (+${v.parts} components)`, 'warn'); return false; }
    this.s.inv.push(it); this.s.stats.items++;
    // auto-equip into an empty hardpoint
    const free = this.firstFreeSlot(); if (free >= 0 && it.il <= this.s.level) { this.s.equip[free] = it.id; this.buildPlayerShip(); }
    if (announce) { const R = RARITIES[it.r]; this.toast(`◆ ${R.name.toUpperCase()} · ${it.name}`, 'rar r' + it.r); }
    this.emit('item', { r: it.r }); return true;
  }
  fabricate(bp) { // craft a copy of an unlocked flagship blueprint
    const B = BOSS_BY_BP[bp]; if (!B || !this.s.blueprints[bp]) { this.audio.denied(); return false; } const R = B.reward, c = R.cost;
    const mats = Object.entries(c).filter(([k]) => k !== 'credits' && k !== 'parts');
    if (this.s.credits < c.credits || this.s.parts < c.parts || mats.some(([k, n]) => (this.s.vault[k] || 0) < n)) { this.audio.denied(); this.toast('Missing materials for this blueprint', 'warn'); return false; }
    if (this.s.inv.length >= INV_CAP) { this.toast('Inventory full: salvage something first', 'warn'); return false; }
    this.s.credits -= c.credits; this.s.parts -= c.parts; for (const [k, n] of mats) this.s.vault[k] -= n;
    const it = makeItem(R.t, R.r, Math.max(this.s.level, 25), 'Blueprint fabrication', { name: R.name, sp: R.sp, bp }); this.addItem(it); this.audio.upgrade(); this.save(); return it;
  }
  buyItem(t) {
    const offer = merchantStock(this.s.level).find((o) => o.t === t); if (!offer || offer.locked || this.s.credits < offer.price) { this.audio.denied(); return false; }
    if (this.s.inv.length >= INV_CAP) { this.toast('Inventory full: salvage something first', 'warn'); return false; }
    this.s.credits -= offer.price; const it = makeItem(t, offer.r, offer.il, 'Station Armory'); this.addItem(it); this.audio.upgrade(); this.save(); return it;
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
    this.s.tier = t; this.ensureEquipSlots();
    // new hulls ship with stock armament: fill empty hardpoints with spare inventory first, else a common stock weapon
    const used = this.equippedIds(); const spare = this.s.inv.filter((it) => !used.has(it.id) && it.il <= this.s.level).sort((a, b) => itemPower(b) - itemPower(a));
    for (let i = 0; i < this.s.equip.length; i++) if (!this.s.equip[i]) {
      let it = spare.shift(); if (!it && this.s.inv.length < INV_CAP) { it = makeItem(i % 2 ? 'autocannon' : 'mining_laser', 0, Math.max(1, Math.min(this.s.level, 5)), 'Shipyard stock'); this.s.inv.push(it); }
      if (it) this.s.equip[i] = it.id;
    }
    this.buildPlayerShip(); this.player.hp = this.player.maxHp;
    this.audio.tierUp(); this.rings.spawn(this.player.x, 0, this.player.z, 18 * inf.T.cam, [0.6, 2, 3], 1);
    this.fx.burst(this.player.x, 1, this.player.z, 90, 20, 1.2, 1.5, 0.1, [0.5, 2.2, 3.2], 1.5);
    this.toast(`New ship: ${inf.T.name} (${inf.T.cls})!`, 'level'); this.emit('tier', {}); this.save(); return true;
  }
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
    this.audio.questComplete(); this.toast(`Mission complete: ${st.title} +${st.reward.credits} cr`, 'good'); this.save(); return true;
  }
  claimContract(i) {
    const c = this.s.contracts[i]; if (!c || this.questState(c, c.prog) < c.need) return false;
    this.addCredits(c.reward.credits); this.addXP(c.reward.xp); this.s.contracts[i] = this.newContract();
    this.audio.questComplete(); this.toast(`Contract complete +${c.reward.credits} cr`, 'good'); this.save(); return true;
  }

  // ---------- player ship ----------
  buildPlayerShip() {
    const p = this.player; const T = TIERS[this.s.tier - 1]; const st = this.stats();
    if (p.group) {
      this.scene.remove(p.group); disposeObject(p.group);
      if (p.flames) { p.flames.mat.dispose(); p.flames.coreMat.dispose(); p.flames.spriteMat.dispose(); }
      for (const w of p.weapons) if (w.beam) { this.scene.remove(w.beam); this.disposeBeam(w.beam); }
    }
    const built = buildShip(this.s.tier);
    const g = new THREE.Group(); g.add(built.group); g.rotation.order = 'YXZ'; built.group.scale.setScalar(1.25);
    const fl = makeFlames(built.engines); built.group.add(fl.group);
    p.flames = fl; p.weapons = [];
    this.ensureEquipSlots();
    // hardpoints: hull mounts plus auxiliary mounts unlocked by the skill tree
    const hps = [...built.hardpoints]; const h0 = hps[0] || { x: 0, y: 0.3, z: 1, size: 0.8 };
    for (let k = 0; hps.length < st.slots; k++) hps.push({ x: (k % 2 ? 1 : -1) * (0.5 + 0.35 * this.s.tier) * (k >> 1 ? 0.6 : 0), y: h0.y + 0.12, z: -(built.length || 4) * (0.18 + 0.1 * k), size: (h0.size || 1) * 0.85, aux: true });
    hps.forEach((h, i) => {
      if (i >= st.slots) return;
      const it = this.item(this.s.equip[i]);
      if (!it) { const mount = makeTurret('cannon', (h.size || 1) * 0.6); mount.remove(mount.userData.barrel); mount.position.set(h.x, h.y, h.z); built.group.add(mount); return; }
      const S = itemStats(it); const key = BEH_TURRET[S.beh]; const tur = makeTurret(key, (h.size || 1) * 1.05 * (1 + it.r * 0.03));
      tur.position.set(h.x, h.y, h.z); built.group.add(tur); rarityRing(tur, it.r, RARITIES[it.r].rgb);
      const w = { key: S.beh, item: it, S, turret: tur, cd: rand(0, 0.3), target: null, retarget: 0, acc: 0, tick: 0, recoil: 0, heat: 0, over: 0, bz0: tur.userData.barrel.position.z, slot: i };
      if (S.beh === 'beam') { const c = S.beamRgb; w.beam = this.makeBeam(new THREE.Color(c[0], c[1], c[2]), new THREE.Color(c[0] * 0.08, c[1] * 0.12, c[2] * 0.2)); this.scene.add(w.beam); }
      p.weapons.push(w);
    });
    // T5 point-defence turrets (track and plink nearby pirates)
    p.pd = [];
    for (const h of built.pointDefense || []) { const tu = makeTurret('cannon', h.size, 'player'); tu.position.set(h.x, h.y, h.z); built.group.add(tu); p.pd.push({ turret: tu, cd: rand(0, 1), recoil: 0, bz0: tu.userData.barrel.position.z }); }
    // shield bubble (hit ripple)
    if (p.shield) { p.shield.geometry.dispose(); }
    p.shield = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 16), this.shieldMat); p.shield.scale.set(T.radius * 1.7, T.radius * 0.9, T.radius * 1.9); p.shield.visible = false; p.shield.renderOrder = 6; g.add(p.shield);
    p.model = built.group;
    // T4/T5 escort drones (visual + light auto-fire)
    p.escorts = [];
    if (this.s.tier >= 4) {
      const n = this.s.tier === 5 ? 4 : 2;
      for (let i = 0; i < n; i++) {
        const dg = buildShip(1).group; dg.scale.setScalar(0.45); this.scene.add(dg);
        p.escorts.push({ obj: dg, a: (i / n) * TAU, cd: rand(0, 1) });
      }
    }
    if (p.escortsOld) for (const e of p.escortsOld) { this.scene.remove(e.obj); disposeObject(e.obj); }
    p.escortsOld = p.escorts;
    p.group = g; p.length = built.length; p.radius = T.radius; p.maxHp = st.hp; p.hp = Math.min(p.hp ?? st.hp, st.hp);
    p.energy = Math.min(p.energy ?? st.energyMax, st.energyMax); p.sh = Math.min(p.sh ?? st.shield, st.shield);
    this.scene.add(g);
  }
  makeBeam(coreCol = new THREE.Color(0.7, 1.9, 2.6), glowCol = new THREE.Color(0.05, 0.3, 0.6)) {
    const geo = new THREE.CylinderGeometry(1, 1, 1, 8, 1, true); geo.translate(0, 0.5, 0); geo.rotateX(Math.PI / 2);
    const core = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: coreCol, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
    const glow = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: glowCol, transparent: true, opacity: 0.3, blending: THREE.AdditiveBlending, depthWrite: false }));
    core.scale.set(0.07, 0.07, 1); glow.scale.set(3, 3, 1);
    core.add(glow); core.visible = false; core.frustumCulled = false; glow.frustumCulled = false;
    // impact glow sprite at the hit point (positioned in world space each frame)
    const imp = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: coreCol.clone().multiplyScalar(0.6), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
    imp.visible = false; this.scene.add(imp); core.userData.impact = imp;
    return core;
  }
  disposeBeam(b) { b.geometry.dispose(); b.material.dispose(); b.children[0].material.dispose(); const imp = b.userData.impact; if (imp) { this.scene.remove(imp); imp.material.dispose(); } }
  makeShieldMat() {
    return new THREE.ShaderMaterial({
      uniforms: { uHit: { value: new THREE.Vector3(0, 0, 1) }, uT: { value: 0 }, uCol: { value: new THREE.Color(0.3, 1.3, 2.4) } },
      vertexShader: `varying vec3 vN; varying vec3 vP; varying vec3 vV; void main(){ vP=normalize(position); vN=normalize(normalMatrix*normal); vec4 mv=modelViewMatrix*vec4(position,1.0); vV=normalize(-mv.xyz); gl_Position=projectionMatrix*mv; }`,
      fragmentShader: `uniform vec3 uHit; uniform float uT; uniform vec3 uCol; varying vec3 vN; varying vec3 vP; varying vec3 vV;
        void main(){ float fres=pow(1.0-abs(dot(vN,vV)),2.5); float d=acos(clamp(dot(vP,normalize(uHit)),-1.0,1.0));
          float age=1.0-uT; float ring=exp(-pow((d-age*2.2)*7.0,2.0))*uT; float spot=exp(-d*d*6.0)*uT*uT;
          float hex=0.5+0.5*sin(vP.x*40.0)*sin(vP.z*40.0);
          float a=(fres*0.16*uT + ring*0.55 + spot*0.35)*(0.75+0.25*hex); gl_FragColor=vec4(uCol*a,a); }`,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    });
  }
  // layered explosion: flash, fireball, sparks, smoke, debris, shock ring, light flash
  boom(x, y, z, s, tint, ring = true) {
    this.fx.explosion(x, y, z, s, tint);
    this.smoke.burst(x, y, z, Math.ceil(6 * s), 3.5 * s, 1.6, 1.2 * s, 3.4 * s, [0.16, 0.14, 0.15], 1.6, 0.3);
    this.fx.burst(x, y, z, Math.ceil(5 * s), 14 * s, 0.9, 0.35, 0.05, [3.0, 1.6, 0.5], 0.6, 0.6); // long hot streaks
    if (ring) this.rings.spawn(x, y - 0.2, z, 8 * s, tint ? tint.map((v) => v * 0.8) : [3, 1.2, 0.5], 0.55);
    this.flashes.spawn(x, y, z, 30 + 25 * s, 0xff9a4a, 0.3 + 0.08 * s, 18 + 10 * s);
  }

  // ---------- enemies ----------
  proto(type, fac, variant = '') {
    const key = type + ':' + (fac || '') + ':' + variant;
    if (!this.protos[key]) {
      const D = ENEMIES[type]; const F = FACTIONS[fac]; let b;
      if (type === 'flagship') b = buildFlagship(variant || fac || 'crimson', F ? factionMats(fac, F.rgb, F.hull) : factionMats('crimson', [3.4, 0.4, 0.4], 0x3a1e22));
      else if (type === 'bpart') { b = buildBossPart(variant || 'core'); if (F) retint(b.group, fac, F.rgb, F.hull); }
      else if (D.inst && type !== 'inst_core' && type !== 'inst_gen' && type !== 'inst_turret') { b = buildInstallationV5(type.slice(5)); if (F) retint(b.group, fac, F.rgb, F.hull); }
      else { b = D.inst ? buildInstallation(type.slice(5)) : buildPirate(type); if (F && type !== 'boss') tintPirate(b.group, fac, F.rgb, F.hull, b.radius); }
      const fl = makeFlames(b.engines || [], F ? new THREE.Color(F.rgb[0], F.rgb[1] * 0.8 + 0.3, F.rgb[2]) : new THREE.Color(3.4, 0.8, 0.4)); b.group.add(fl.group);
      this.protos[key] = { ...b, hardpoints: b.hardpoints || [], flameMat: fl.mat, flames: fl };
    }
    return this.protos[key];
  }
  // faction tactical modifiers
  facMods(fac) {
    switch (fac) {
      case 'crimson': return { hp: 1.2, dmg: 1.25, speed: 1, armor: 0, shield: 0 };
      case 'void': return { hp: 1, dmg: 1, speed: 1.1, armor: 0, shield: 0, cloak: true, drain: 6 };
      case 'iron': return { hp: 1.3, dmg: 1, speed: 0.8, armor: 0.2, shield: 0.3 };
      case 'eclipse': return { hp: 1, dmg: 1, speed: 1, armor: 0, shield: 0.4, shieldBreak: 1.8 };
      case 'ashen': return { hp: 0.85, dmg: 1, speed: 1.3, armor: 0, shield: 0, rate: 1.2 };
      default: return { hp: 1, dmg: 1, speed: 1, armor: 0, shield: 0 };
    }
  }
  spawnEnemy(type, x, z, opts = {}) {
    const D = opts.D || ENEMIES[type]; const gs = gsectorAt(x, z);
    const fac = opts.faction !== undefined ? opts.faction : (FACTIONS[gs.faction] && type !== 'sentinel' && type !== 'boss' ? gs.faction : null);
    const P = this.proto(type, fac, opts.variant || ''); const M = this.facMods(fac);
    const danger = Math.max(D.inst ? 1 : 0, Math.min(3, gs.ringI)); const sc = (1 + 0.85 * Math.max(0, danger - 1)) * (gs.threat >= 5 ? 1.3 : 1); const easy = danger <= 1 && this.s.tier === 1 ? 0.7 : 1;
    const elite = !!opts.elite; const L0 = RING_L0[gs.ring] || 1; const lv = this.s.level;
    const baseHp = D.inst && TTK[type] ? ttkHp(type, lv, L0, D.armor) : D.hp * sc * shipK(lv, L0);
    const hp = baseHp * (opts.hpMul || 1) * M.hp * (elite ? 2.6 : 1);
    const g = P.group.clone(); g.rotation.order = 'YXZ'; this.scene.add(g); if (elite) g.scale.setScalar(1.25);
    const e = { type, D, x, z, vx: 0, vz: 0, yaw: rand(0, TAU), bank: 0, hp, maxHp: hp, dmgMul: (1 + 0.5 * Math.max(0, danger - 1)) * easy * M.dmg * (elite ? 1.4 : 1) * dmgK(lv, L0),
      group: g, turrets: [], cd: rand(0.5, 2), state: 'attack', t: rand(0, 10), radius: P.radius * (elite ? 1.2 : 1), hard: P.hardpoints, hitT: 0, orbit: rand(0, TAU),
      faction: fac, M, armor: Math.min(0.8, D.armor + M.armor), speedMul: M.speed, shield: hp * M.shield, maxShield: hp * M.shield, shieldT: 0, stunT: 0, burnT: 0, burnDps: 0, shredT: 0, elite, threat: gs.threat, sector: gs.id,
      cloaked: !!M.cloak && !D.inst && !D.part && !D.boss && type !== 'sentinel' && type !== 'freighter', aiAcc: 0, aiTick: 0, scale: elite ? 1.25 : 1, ...opts };
    delete e.variant; e.D = D;
    g.traverse((c) => { if (c.name === 'eturret') { c.userData = { barrel: c.getObjectByName('barrel'), rec: 0 }; e.turrets.push(c); } });
    if (e.cloaked) g.visible = false;
    g.position.set(x, 0, z);
    this.enemies.push(e); return e;
  }
  removeEnemy(e) { this.scene.remove(e.group); e.dead = true; } // geometry is shared with the prototype; nothing to dispose
  // pirate wave: composition follows the sector faction's fleet doctrine (roles unlock with danger)
  spawnWave(danger, big = false, near, msg) {
    const p = this.player; const a = rand(0, TAU); const fac = FACTIONS[this.gsec.faction] && !this.s.galaxy.liberated[this.gsec.id] ? this.gsec.faction : null;
    const d = near ? rand(14, 22) : fac === 'void' ? rand(22, 28) : rand(48, 60);
    const bx = near ? near.x : p.x, bz = near ? near.z : p.z;
    const cx = bx + Math.cos(a) * d, cz = bz + Math.sin(a) * d;
    const list = [];
    if (danger <= 1) { const t1 = this.s.tier === 1; const n = (t1 ? randInt(2, 3) : randInt(2, 4)) + (big ? (t1 ? 1 : 2) : 0); for (let i = 0; i < n; i++) list.push('drone'); if (!t1 && (big || Math.random() < 0.35)) list.push('interceptor'); }
    else if (danger === 2) { for (let i = 0; i < randInt(2, 3); i++) list.push('interceptor'); for (let i = 0; i < randInt(1, 2); i++) list.push('drone'); if (big || Math.random() < 0.4) list.push('gunship'); }
    else { for (let i = 0; i < randInt(2, 3); i++) list.push('interceptor'); list.push('gunship'); if (big) list.push('gunship'); for (let i = 0; i < randInt(1, 3); i++) list.push('drone'); }
    // faction specialists (support / sniper / EW / capital) join from danger 2
    if (fac && danger >= 2) { const pool = FLEET[fac].filter((t) => t !== 'interceptor' && t !== 'drone' && t !== 'gunship' && (t !== 'capital' || (danger >= 3 && big))); if (pool.length) { list.push(pick(pool)); if (danger >= 3 && Math.random() < 0.5) list.push(pick(pool.filter((t) => t !== 'capital')) || 'gunship'); } }
    if (fac === 'crimson' && danger >= 2) list.push('gunship');
    const eliteP = 0.18 + (big ? 0.2 : 0) + this.camp.eliteBoost();
    const eliteI = danger >= 1 && this.gsec.threat >= 2 && Math.random() < eliteP ? randInt(0, list.length - 1) : -1;
    list.forEach((t, i) => {
      let x = cx + rand(-8, 8), z = cz + rand(-8, 8);
      if (fac === 'ashen' && i % 2) { x = bx - Math.cos(a) * d + rand(-8, 8); z = bz - Math.sin(a) * d + rand(-8, 8); } // pincer from the opposite side
      this.spawnEnemy(t, x, z, { faction: fac, elite: i === eliteI });
    });
    const F = FACTIONS[fac];
    this.audio.alarm(); this.toast((msg || (near ? '⚠ Installation reinforcements launched!' : (big ? '⚠ PIRATE RAID INCOMING!' : '⚠ Pirates detected'))) + (F ? ` · ${F.name}` : '') + (eliteI >= 0 ? ' · ELITE spotted' : ''), 'warn');
  }
  director(dt) {
    const p = this.player;
    const danger = dangerOf(this.gsec, this.s.galaxy);
    if (danger === 0) { this.heat = Math.max(0, this.heat - dt * 6); this.spawnT = Math.max(this.spawnT, 25); }
    else {
      const prev = this.heat; const mod = this.camp.directorMod();
      this.heat = Math.min(100, this.heat + dt * (0.35 + danger * 0.35) * (danger === 1 && this.s.tier === 1 ? 0.65 : 1) / mod);
      const fb = this.camp.bossActive(); const flag = fb && !fb.bc.def.commander; if (flag) this.heat = Math.min(this.heat, 35); // a flagship fight replaces heat waves
      for (const th of [40, 75]) if (prev < th && this.heat >= th && !this.camp.crowded(4)) this.spawnWave(danger, false);
      if (this.heat >= 100) { if (!this.camp.crowded(6)) this.spawnWave(danger, true); this.heat = 55; }
      this.spawnT -= dt;
      const cap = flag ? 2 : 4 + danger * 4; const pirates = this.enemies.filter((e) => e.type !== 'sentinel' && !e.D.boss && !e.D.inst && !e.D.part && !e.battle).length;
      if (this.spawnT <= 0) { this.spawnT = (rand(28, 40) - danger * 5 + (danger === 1 && this.s.tier === 1 ? 14 : 0)) * mod; if (pirates < cap) this.spawnWave(danger, false); }
    }
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
    // installations, liberation stages, convoys, commanders, flagships, faction war, friendlies, missions
    this.camp.update(dt);
  }
  updateEnemies(dt) {
    const p = this.player; const E = this.enemies; const camp = this.camp;
    for (let i = E.length - 1; i >= 0; i--) {
      const e = E[i];
      if (e.dead) { E.splice(i, 1); continue; }
      let dx = p.x - e.x, dz = p.z - e.z, dist = Math.hypot(dx, dz) || 0.001;
      if (e.D.inst) { camp.updateInst(e, dt, dist, dx, dz); continue; }
      if (e.D.part) { camp.updatePart(e, dt, dist, dx, dz); continue; }
      const far = e.D.boss ? 400 : 170;
      if (dist > far && !e.guard) { this.removeEnemy(e); E.splice(i, 1); camp.onRemove(e); continue; }
      if (e.guard && e.state === 'idle' && Math.hypot(e.guard.x - p.x, e.guard.z - p.z) > 110) { this.removeEnemy(e); E.splice(i, 1); if (e.guardId && this.guards.has(e.guardId)) { this.guards.delete(e.guardId); this.pendingGuards.set(e.guardId, { id: e.guardId, x: e.guard.x, z: e.guard.z, count: 1 }); } continue; }
      if (e.guard && Math.hypot(e.guard.x - p.x, e.guard.z - p.z) > 220) { this.removeEnemy(e); E.splice(i, 1); if (e.guardId) this.guards.delete(e.guardId); continue; }
      // AI budget: distant ships think at a third of the rate (with the elapsed time accumulated)
      let edt = dt;
      if (dist > 90 && !e.D.boss) { e.aiAcc += dt; e.aiTick = (e.aiTick + 1) % 3; if (e.aiTick) continue; edt = e.aiAcc; e.aiAcc = 0; }
      // target selection: the player, or an assigned target (escorted civilian, defended station, rival skirmish ship, hold point)
      let T = p;
      if (e.hold && (dist < 55 || e.hitT > 0 || this.dead)) e.hold = null;
      if (e.hold) T = { x: e.hold.x + Math.cos(e.orbit) * 10, z: e.hold.z + Math.sin(e.orbit) * 10, hold: true };
      else if (e.tgt && !e.tgt.dead) { if (e.tgt.hold || e.tgt === p || Math.hypot(e.tgt.x - e.x, e.tgt.z - e.z) < dist + 25) T = e.tgt; }
      if (T !== p) { dx = T.x - e.x; dz = T.z - e.z; dist = Math.hypot(dx, dz) || 0.001; }
      this.enemyAI(e, edt, dist, dx, dz, T);
    }
  }
  enemyStatus(e, dt) { // shared per-enemy timers: hit flash, stun, burn, shred, shield regen
    e.t += dt; e.cd -= dt; if (e.hitT > 0) e.hitT -= dt; if (e.shredT > 0) e.shredT -= dt;
    if (e.burnT > 0) { e.burnT -= dt; e.burnAcc = (e.burnAcc || 0) + e.burnDps * dt; if (e.burnAcc > 4 || e.burnT <= 0) { const d = e.burnAcc; e.burnAcc = 0; e.hp -= d; if (Math.random() < 0.5) this.ui && this.ui.float(e.x, 1.6, e.z, Math.round(d), '#ff9a3d'); if (e.hp <= 0) { this.killEnemy(e); return false; } }
      if (Math.random() < 0.5 * this.fx.budget) this.fx.emit(e.x + rand(-1, 1) * e.radius * 0.5, 0.6, e.z + rand(-1, 1) * e.radius * 0.5, 0, 2, 0, 0.4, 0.9, 0.2, 3.2, 1.2, 0.3, 2); }
    if (e.stunT > 0) { e.stunT -= dt; if (Math.random() < 0.6 * this.fx.budget) this.fx.emit(e.x + rand(-1, 1) * e.radius, 0.8 + rand(0, 1), e.z + rand(-1, 1) * e.radius, rand(-3, 3), rand(0, 2), rand(-3, 3), 0.2, 0.5, 0.1, 0.8, 2.6, 3.6, 3); }
    if (e.maxShield > 0 && this.time - e.shieldT > 4 && e.shield < e.maxShield && e.stunT <= 0) e.shield = Math.min(e.maxShield, e.shield + e.maxShield * 0.12 * dt);
    return true;
  }
  enemyAI(e, dt, dist, dx, dz, T = this.player) {
    const p = this.player; const E = this.enemies; const isP = T === p;
    if (!this.enemyStatus(e, dt)) return;
    // Void Reavers stay cloaked until close or hit
    if (e.cloaked) { if (dist < 26 || e.hitT > 0 || !isP) { e.cloaked = false; e.group.visible = true; this.fx.burst(e.x, 0.6, e.z, 18, 8, 0.4, 1.0, 0.1, [1.8, 0.6, 3.6], 3); }
      else if (Math.random() < 0.25 * this.fx.budget) this.fx.emit(e.x + rand(-1, 1), 0.5, e.z + rand(-1, 1), 0, 0.3, 0, 0.5, 1.2, 0.3, 0.5, 0.2, 0.9, 1); }
    let tx = T.x, tz = T.z, spd = e.D.speed * (e.speedMul || 1), wantFire = !(isP && this.dead) && !T.hold && dist < e.D.range && !e.cloaked, raw = false, face = false;
    const D = e.D;
    const r = e.bc ? this.camp.bossAI(e, dt, dist, dx, dz) : roleAI(this, e, dt, dist, dx, dz, T);
    if (r) { if (r.raw) raw = true; else { tx = r.tx; tz = r.tz; spd = r.spd; } wantFire = wantFire && r.wantFire; face = !!r.face; }
    else if (e.type === 'drone') {
      e.orbit += dt * 0.9; tx = T.x + Math.cos(e.orbit) * 9; tz = T.z + Math.sin(e.orbit) * 9;
    } else if (e.type === 'interceptor') {
      if (e.state === 'attack') { if (dist < 7) { e.state = 'break'; e.bt = 1.4; const a = Math.atan2(dz, dx) + rand(-1, 1); e.bx = e.x + Math.cos(a) * 30; e.bz = e.z + Math.sin(a) * 30; }
        else if (e.flank && dist > 14) { const ux = dx / dist, uz = dz / dist; tx = T.x - uz * 12 * e.flank; tz = T.z + ux * 12 * e.flank; } } // capital-ship flanking orders
      else { tx = e.bx; tz = e.bz; e.bt -= dt; wantFire = false; if (e.bt <= 0) e.state = 'attack'; }
      spd *= e.state === 'break' ? 1.2 : 1;
    } else if (e.type === 'gunship') {
      e.orbit += dt * 0.25; const r2 = 17; tx = T.x + Math.cos(e.orbit) * r2; tz = T.z + Math.sin(e.orbit) * r2;
    } else if (e.type === 'sentinel') {
      const gd = Math.hypot(e.guard.x - p.x, e.guard.z - p.z);
      if (e.state === 'idle' && gd < 24 && !this.dead) { e.state = 'attack'; this.toast('Mining sentinels activated!', 'warn'); }
      if (e.state === 'attack' && (gd > 55 || this.dead)) e.state = 'idle';
      if (e.state === 'idle') { e.orbit += dt * 0.5; tx = e.guard.x + Math.cos(e.orbit) * 7; tz = e.guard.z + Math.sin(e.orbit) * 7; wantFire = false; spd *= 0.4; }
      else { e.orbit += dt * 0.8; tx = p.x + Math.cos(e.orbit) * 11; tz = p.z + Math.sin(e.orbit) * 11; }
    }
    if (T.hold) { spd *= 0.45; }
    if (e.stunT > 0) { wantFire = false; spd *= 0.15; }
    const heavy = e.D.boss || e.type === 'capital' || e.type === 'freighter';
    if (!raw) { // steering
      const sx = tx - e.x, sz = tz - e.z, sd = Math.hypot(sx, sz) || 0.001;
      const accel = heavy ? 4 : e.type === 'gunship' || e.type === 'support' ? 10 : 30;
      const desiredV = Math.min(spd, sd * 2);
      e.vx += ((sx / sd) * desiredV - e.vx) * Math.min(1, accel * dt / Math.max(spd, 1));
      e.vz += ((sz / sd) * desiredV - e.vz) * Math.min(1, accel * dt / Math.max(spd, 1));
    }
    // separation
    for (let j = 0; j < E.length; j++) { const o = E[j]; if (o === e || o.D.part) continue; const ox = e.x - o.x, oz = e.z - o.z; const od = Math.hypot(ox, oz); const min = e.radius + o.radius + 0.5; if (od < min && od > 0.001) { const k = o.D.boss || o.D.inst ? 10 : 6; e.vx += (ox / od) * (min - od) * k * dt; e.vz += (oz / od) * (min - od) * k * dt; } }
    e.x += e.vx * dt; e.z += e.vz * dt;
    // face: toward the target when firing, else movement direction
    const faceP = ((e.type !== 'interceptor' || e.state === 'attack') && wantFire) || face || (e.D.boss && !raw);
    const desiredYaw = faceP ? Math.atan2(dx, dz) : Math.atan2(e.vx, e.vz);
    const turn = heavy ? 0.6 : e.type === 'gunship' ? 1.5 : 5;
    const dy = angleDiff(e.yaw, desiredYaw); const step = clamp(dy, -turn * dt, turn * dt); e.yaw += step;
    e.bank = damp(e.bank, clamp(step / Math.max(dt, 1e-4) * 0.25, -0.7, 0.7), 5, dt);
    e.group.position.set(e.x, Math.sin(e.t * 2) * 0.15, e.z); e.group.rotation.set(0, e.yaw, heavy ? -e.bank * 0.3 : -e.bank);
    const pulse = e.hitT > 0 ? 1 + e.hitT * (heavy ? 0.15 : 0.6) : 1; e.group.scale.setScalar(pulse * e.scale);
    for (const tu of e.turrets) { tu.rotation.y = damp(tu.rotation.y, angleDiff(0, Math.atan2(dx, dz) - e.yaw), 4, dt); if (tu.userData.rec > 0) { tu.userData.rec = Math.max(0, tu.userData.rec - dt * 4); } if (tu.userData.barrel) tu.userData.barrel.position.z = -(tu.userData.rec || 0) * 0.3; }
    // fire
    const multi = e.D.boss || e.type === 'capital';
    if (wantFire && e.cd <= 0 && (multi || Math.abs(angleDiff(e.yaw, Math.atan2(dx, dz))) < (e.type === 'interceptor' ? 0.5 : 1.2))) {
      const buff = e.buffT > this.time ? 1.3 : 1;
      e.cd = 1 / (D.fireRate * (e.M.rate || 1) * buff) * rand(0.85, 1.15); this.curShooter = e;
      const dmg = D.dmg * e.dmgMul; const ux = dx / dist, uz = dz / dist;
      if (e.type === 'gunship') { for (const off of [-0.18, 0, 0.18]) { const c = Math.cos(off), s = Math.sin(off); this.enemyShot(e.x + ux * 2.5, e.z + uz * 2.5, ux * c - uz * s, uz * c + ux * s, 22, dmg, [3.5, 1.2, 0.3]); } }
      else if (multi && e.hard.length) { for (const h of e.hard) { const wx = e.x + Math.cos(e.yaw) * h.x + Math.sin(e.yaw) * h.z, wz = e.z - Math.sin(e.yaw) * h.x + Math.cos(e.yaw) * h.z; const ddx = T.x - wx, ddz = T.z - wz, dd = Math.hypot(ddx, ddz) || 1; this.enemyShot(wx, wz, ddx / dd, ddz / dd, 26, dmg / Math.max(1, e.hard.length * 0.5), [3.5, 0.5, 0.4]); } }
      else this.enemyShot(e.x + ux * e.radius, e.z + uz * e.radius, ux, uz, e.type === 'drone' ? 20 : 30, dmg, e.type === 'sentinel' ? [3.2, 1.8, 0.3] : [3.5, 0.4, 0.4]);
      for (const tu of e.turrets) tu.userData.rec = 1;
      this.fx.emit(e.x + ux * e.radius, 0.6, e.z + uz * e.radius, 0, 0, 0, 0.08, 1.2 + Math.min(4, e.radius) * 0.3, 0.3, 3, 0.8, 0.4, 0);
      this.audio.enemyShoot(multi ? 'boss' : ENEMY_SFX[e.type] || e.type, e.x, e.z);
    }
    // engine trail
    if (Math.random() < 0.3 * this.fx.budget && e.group.visible) this.fx.emit(e.x - Math.sin(e.yaw) * e.radius, 0.2, e.z - Math.cos(e.yaw) * e.radius, -e.vx * 0.2, 0, -e.vz * 0.2, 0.4, 0.7 * (Math.min(4, e.radius) * 0.5 + 0.5), 0.1, 2.5, 0.6, 0.3, 2);
  }
  enemyShot(x, z, ux, uz, speed, dmg, color, o = {}) {
    const e = this.curShooter; const F = e && e.faction && e.type !== 'boss' ? FACTIONS[e.faction] : null;
    this.bolts.spawn({ x, z, y: 0.6, vx: ux * speed, vz: uz * speed, dmg, owner: 'e', life: o.life || 2.2, len: o.len || 1.4, w: o.w || 1.3, color: o.keepColor || !F ? color : F.rgb, energy: e ? ENERGY_DMG[e.type] !== 0 : true, fac: e ? e.faction : null, battle: e ? e.battle : null, side: e ? e.side : null, src: e });
  }
  // ---------- hidden caches ----------
  spawnCache(c, sec) {
    const obj = this.cachePool.pop() || buildCacheCrate(); obj.visible = true; obj.position.set(c.x, 0.3, c.z); this.scene.add(obj);
    this.liveCaches.set(c.id, { c, sec, obj });
  }
  freeCache(L) { this.scene.remove(L.obj); this.cachePool.push(L.obj); }
  updateCaches(dt) {
    const p = this.player; const fx = this.skillFx();
    for (const [id, L] of this.liveCaches) {
      const d = Math.hypot(L.c.x - p.x, L.c.z - p.z); L.obj.rotation.y += dt * 0.8; L.obj.position.y = 0.3 + Math.sin(this.time * 2 + L.c.x) * 0.25;
      L.obj.visible = d < 30 || !!fx.anomaly; L.obj.userData.sp.material.opacity = 0.5 + 0.5 * Math.sin(this.time * 4);
      if (d < 30 && !L.found) { L.found = true; this.toast('Hidden cargo cache detected nearby', 'good'); }
      if (d < 4 + p.radius && !this.dead) {
        this.s.galaxy.caches[id] = 1; this.freeCache(L); this.liveCaches.delete(id); this.s.stats.caches++;
        const th = Math.max(1, L.sec.threat); const cr = 150 * th; this.addCredits(cr); const parts = 4 * th; this.s.parts += parts; this.addXP(40 * th);
        this.dropLoot(L.c.x, L.c.z, 'cache', th);
        this.fx.burst(L.c.x, 1, L.c.z, 40, 12, 0.7, 1.0, 0.1, [0.6, 3, 1.2], 2); this.rings.spawn(L.c.x, 0.3, L.c.z, 8, [0.5, 2.6, 1.2], 0.6); this.audio.coins();
        this.toast(`Cache opened: +${cr} cr, +${parts} components`, 'good'); this.ui && this.ui.float(L.c.x, 2, L.c.z, `+${cr} cr`, '#ffd166', true); this.emit('cache', {}); this.save();
      }
    }
  }
  // ---------- loot pods ----------
  dropLoot(x, z, src, threat, minR = 0) {
    const it = rollLoot(this.s.level, threat, src, this.stats().luck, minR);
    const obj = this.lootPool.pop() || buildLootPod(); const R = RARITIES[it.r]; const col = new THREE.Color(R.rgb[0], R.rgb[1], R.rgb[2]);
    const u = obj.userData; u.core.material.color.copy(col).multiplyScalar(0.8); u.shell.material.color.copy(col); u.beam.material.color.copy(col).multiplyScalar(0.5); u.sp.material.color.copy(col).multiplyScalar(0.7);
    u.beam.scale.set(1 + it.r * 0.15, 0.6 + it.r * 0.25, 1 + it.r * 0.15); obj.visible = true; this.scene.add(obj);
    const a = rand(0, TAU), sp = rand(3, 7); const l = { it, obj, x, z, vx: Math.cos(a) * sp, vz: Math.sin(a) * sp, t: 0 }; obj.position.set(x, 0, z); this.loot.push(l);
    this.audio.lootDrop(it.r, x, z); this.rings.spawn(x, 0.3, z, 3 + it.r, R.rgb.map((v) => v * 0.6), 0.5);
    return l;
  }
  freeLoot(l) { this.scene.remove(l.obj); l.obj.visible = false; this.lootPool.push(l.obj); }
  updateLoot(dt) {
    const p = this.player; const st = this.stats();
    for (let i = this.loot.length - 1; i >= 0; i--) {
      const l = this.loot[i]; l.t += dt; const dx = p.x - l.x, dz = p.z - l.z, d = Math.hypot(dx, dz) || 0.001;
      if (d < st.magnet * 0.8 && l.t > 0.6 && !this.dead) { const pull = 18 + 40 * (1 - d / (st.magnet * 0.8)); l.vx += dx / d * pull * dt * 3; l.vz += dz / d * pull * dt * 3; }
      const k = Math.exp(-2.5 * dt); l.vx *= k; l.vz *= k; l.x += l.vx * dt; l.z += l.vz * dt;
      l.obj.position.set(l.x, Math.sin(l.t * 3) * 0.2, l.z); l.obj.userData.core.rotation.y += dt * 2; l.obj.userData.shell.rotation.y -= dt * 1.2;
      if (d < p.radius + 1.6 && l.t > 0.6 && !this.dead) {
        this.loot.splice(i, 1); this.freeLoot(l); this.audio.loot(l.it.r); const R = RARITIES[l.it.r];
        this.fx.burst(p.x, 1, p.z, 16 + l.it.r * 6, 8, 0.5, 0.8, 0.1, R.rgb, 2); this.ui && this.ui.float(p.x, 2.6, p.z, R.name.toUpperCase(), R.color, true);
        this.addItem(l.it); this.save(); continue;
      }
      if (l.t > 150) { this.loot.splice(i, 1); this.freeLoot(l); }
    }
  }
  // damage pipeline: bonuses -> shields (x shieldMul) -> armor (minus penetration) -> hull. S = weapon stat block (optional)
  damageEnemy(e, dmg, crit, S, noChain, src) {
    if (e.dead) return;
    const rival = src === 'rival'; e.lastHit = rival ? 'rival' : 'p'; if (!rival) this.camp.playerHit(e);
    const fx = rival ? {} : this.skillFx(); const st = this.stats();
    if ((e.elite || e.D.inst || e.D.boss || e.D.part) && fx.eliteDmg) dmg *= 1 + fx.eliteDmg;
    if (e.shredT > 0) dmg *= 1.15;
    if (!rival && fx.overcharge && this.player.energy > st.energyMax * 0.7) dmg *= 1 + fx.overcharge;
    const [mul, label] = this.camp.dmgMod(e); let shielded = !!label; dmg *= mul;
    if (e.shield > 0 && dmg > 0) { const sm = (S && S.shieldMul) || 1; const sd = dmg * sm; const ab = Math.min(e.shield, sd); e.shield -= ab; dmg = (sd - ab) / sm; e.shieldT = this.time;
      if (e.shield <= 0) { this.rings.spawn(e.x, 0.6, e.z, e.radius * 2.5, [0.5, 2, 3.4], 0.4); } else if (Math.random() < 0.3) this.fx.emit(e.x, 0.8, e.z, 0, 0, 0, 0.15, e.radius * 2.2, 0.4, 0.4, 1.6, 3, 0); }
    const armor = Math.max(0, (e.armor ?? e.D.armor) - ((S && S.pen) || 0) - (rival ? 0 : st.pen || 0));
    const d = dmg * (1 - armor); e.hp -= d; e.hitT = 0.15;
    if (S && d > 0) {
      if (S.burn) { e.burnT = 3; e.burnDps = Math.max(e.burnDps || 0, d * S.burn / 3 * (S.beh === 'beam' ? 0.4 : 1)); }
      if (S.shred) e.shredT = 4;
      if (S.stun && Math.random() < S.stun && !e.D.inst && !e.D.boss && !e.D.part) e.stunT = Math.max(e.stunT, 0.8);
      if (S.leech) { const p = this.player; p.hp = Math.min(p.maxHp, p.hp + d * S.leech); }
      if (S.chain && !noChain) { let best = null, bd = 10; for (const o of this.enemies) { if (o === e || o.dead) continue; const dd = Math.hypot(o.x - e.x, o.z - e.z); if (dd < bd) { bd = dd; best = o; } }
        if (best) { this.arc(e.x, e.z, best.x, best.z); this.damageEnemy(best, d * S.chain, false, S, true); } }
    }
    if (e.type === 'sentinel' && e.state === 'idle' && !rival) e.state = 'attack';
    if (this.ui && !rival && (crit || shielded || Math.random() < 0.35)) this.ui.float(e.x, 1.5, e.z, shielded ? (label + (d >= 1 ? ' ' + Math.round(d) : '')) : (crit ? 'CRIT ' : '') + Math.round(d), shielded ? '#6fd8ff' : crit ? '#ffd166' : '#ff8a8a', crit);
    if (e.hp <= 0) this.killEnemy(e);
  }
  arc(x0, z0, x1, z1) { // lightning arc between two points
    const n = 8; for (let i = 0; i <= n; i++) { const t = i / n; const j = i === 0 || i === n ? 0 : 0.8; this.fx.emit(lerp(x0, x1, t) + rand(-j, j), 0.8 + rand(-0.3, 0.3), lerp(z0, z1, t) + rand(-j, j), 0, 0, 0, 0.18, 0.7, 0.2, 1.6, 2.2, 3.6, 0); }
  }
  killEnemy(e) {
    if (e.dead) return;
    this.removeEnemy(e);
    const big = e.type === 'flagship' ? 5 : e.type === 'boss' ? 4 : e.type === 'inst_hq' ? 4 : e.D.inst && e.outpost ? 3.2 : e.type === 'commander' || e.type === 'capital' ? 3 : e.type === 'gunship' || e.type === 'freighter' || e.type === 'inst_gen' || e.D.part ? 1.8 : e.D.inst ? 1.4 : 1;
    const F = FACTIONS[e.faction]; const tint = F ? F.rgb.map((v) => v * 0.9) : [3.2, 0.5, 0.4];
    this.boom(e.x, 0.5, e.z, big, tint);
    this.debris.spawn(e.x, 0.3, e.z, Math.round(6 * Math.min(big, 4)), 10, 0.6, 0x2a1416);
    this.audio.explode(big > 1, e.x, e.z, big >= 3); this.addShake(0.25 * Math.min(big, 4), e.x, e.z);
    this.s.stats.kills++; this.emit('kill', { type: e.type });
    if (e.bc || e.D.part) { this.camp.onKill(e); return; }
    const rival = e.lastHit === 'rival'; // ships destroyed by a rival faction in a skirmish give no rewards
    const th = Math.max(1, e.threat || 1);
    if (!rival && !e.noLoot) {
      const xp = e.D.inst ? (INST_XP[e.type] || e.D.xp) * th : Math.round(e.D.xp * e.dmgMul * (e.elite ? 3 : 1));
      const credits = Math.round(e.D.credits * (e.D.inst ? th : e.dmgMul) * (e.elite ? 3 : 1)); this.addCredits(credits); this.addXP(xp);
      this.ui && this.ui.float(e.x, 2, e.z, `+${credits} cr · +${xp} XP`, '#ffd166', true);
      const sec = sectorAt(Math.hypot(e.x, e.z)); const keys = Object.keys(sec.minerals);
      if (!e.D.inst) this.minerals.spawn(e.x, e.z, pick(keys), randInt(1, 3) * (e.type === 'gunship' || e.type === 'capital' ? 3 : 1));
      const luck = this.stats().luck;
      if (!e.D.inst && e.type !== 'freighter' && Math.random() < lootChance(e.elite ? 'elite' : 'pirate', luck)) this.dropLoot(e.x, e.z, e.elite ? 'elite' : 'pirate', th);
    }
    if (e.D.inst) this.camp.instDestroyed(e);
    else this.camp.onKill(e);
    // legacy stat: pirate kills inside a faction sector
    const gs = gsectorAt(e.x, e.z); const g = this.s.galaxy;
    if (!rival && isPirate(gs) && !g.liberated[gs.id] && e.faction === gs.faction && !e.D.inst) g.kills[gs.id] = (g.kills[gs.id] || 0) + 1;
    if (e.guardId) this.field.depleted.set(e.guardId, this.time + 180);
  }
  checkLiberation(sec) { this.camp.checkStage(sec); }
  liberate(sec) {
    const g = this.s.galaxy; g.liberated[sec.id] = 1; this.s.stats.liberated++;
    const th = sec.threat; const cr = 1200 * th, xp = 400 * th, parts = 25 * th; this.addCredits(cr); this.s.parts += parts;
    const p = this.player; const l = this.dropLoot(p.x + rand(-3, 3), p.z + rand(-3, 3), 'liberation', th, 2);
    // the faction withdraws: its ships in this sector warp out
    for (const e of this.enemies) if (!e.dead && e.faction === sec.faction && gsectorAt(e.x, e.z).id === sec.id && !e.D.inst && !e.D.boss && !e.D.part && !e.battle) { this.fx.burst(e.x, 0.6, e.z, 14, 10, 0.4, 0.8, 0.1, [0.6, 2.2, 3.4], 3); this.removeEnemy(e); }
    this.camp.clearSector(sec);
    this.heat = 0; this.audio.liberate();
    this.rings.spawn(p.x, 0.3, p.z, 60, [0.5, 2.4, 3.6], 1.6); this.fx.burst(p.x, 2, p.z, 120, 30, 1.6, 1.6, 0.2, [0.6, 2.4, 3.6], 1.5);
    const F = FACTIONS[sec.faction];
    this.ui && this.ui.liberationNotice({ sec, faction: F, credits: cr, xp, parts, item: l.it });
    this.addXP(xp); this.emit('liberate', { id: sec.id }); this.save();
  }
  setWaypoint(x, z, label) { this.s.galaxy.wp = { x: Math.round(x), z: Math.round(z), label: String(label || 'Waypoint').slice(0, 40) }; this.audio.click(); this.save(); }
  clearWaypoint() { this.s.galaxy.wp = null; this.save(); }
  // ---------- active abilities ----------
  useAbility(id) {
    if (this.dead || !this.abilityUnlocked(id)) return false;
    const st = this.abilityState(id); const p = this.player;
    if (st.rem > 0 || !st.energyOk) { this.audio.denied(); if (!st.energyOk && st.rem <= 0) this.ui && this.ui.float(p.x, 2.5, p.z, 'LOW ENERGY', '#6fd8ff'); return false; }
    p.energy -= st.cost; this.abil.cd[id] = this.time + this.abilityCd(id); this.abil.last[id] = this.time;
    const fx = this.skillFx(); const pst = this.stats();
    if (id === 'dash') {
      let dx = this.input.x, dz = this.input.z; let m = Math.hypot(dx, dz); if (m < 0.2) { dx = Math.sin(p.yaw); dz = Math.cos(p.yaw); m = 1; }
      const dist = 26 * (1 + (fx.dashLen || 0)); this.dashT = 0.22; this.dashV = { x: dx / m * dist / 0.22, z: dz / m * dist / 0.22 }; p.yaw = Math.atan2(dx, dz);
      this.rings.spawn(p.x, 0.3, p.z, 6 + p.radius * 2, [0.5, 3, 1.4], 0.4); this.fx.burst(p.x, 0.6, p.z, 24, 10, 0.4, 1.1, 0.1, [0.5, 3, 1.4], 3);
    } else if (id === 'emp') {
      const R = 24 + p.radius; let n = 0;
      for (const e of this.enemies) { if (e.dead) continue; const d = Math.hypot(e.x - p.x, e.z - p.z); if (d < R + e.radius) { n++; e.shield = 0; e.shieldT = this.time; if (!e.D.inst && !e.D.part) e.stunT = e.D.boss ? 1.0 : 3.5; if (e.cloaked) { e.cloaked = false; e.group.visible = true; } this.arc(p.x, p.z, e.x, e.z); this.damageEnemy(e, 10 * pst.dmg, false); } }
      for (const b of this.bolts.list) if (!b.dead && b.owner === 'e' && Math.hypot(b.x - p.x, b.z - p.z) < R) { b.dead = true; this.fx.emit(b.x, 0.6, b.z, 0, 1, 0, 0.3, 0.8, 0.2, 0.8, 2.4, 3.6, 3); }
      this.rings.spawn(p.x, 0.4, p.z, R, [0.6, 2.4, 3.6], 0.7); this.rings.spawn(p.x, 0.4, p.z, R * 0.6, [1.2, 2.8, 3.6], 0.5); this.flashes.spawn(p.x, 2, p.z, 40, 0x66ddff, 0.3, 34);
      this.fx.burst(p.x, 0.6, p.z, 46, R * 2.2, 0.3, 0.7, 0.1, [0.5, 1.8, 2.8], 3, 0.05); this.addShake(0.3);
      this.ui && this.ui.float(p.x, 3, p.z, n ? `EMP · ${n} disabled` : 'EMP', '#6fd8ff', true);
    } else if (id === 'overload') {
      p.sh = pst.shield; this.overT = 5 + (fx.barrier || 0); this.shieldMat.uniforms.uT.value = 1;
      this.rings.spawn(p.x, 0.5, p.z, p.radius * 4, [0.5, 1.8, 3.6], 0.6); this.fx.burst(p.x, 1, p.z, 40, 8, 0.6, 1, 0.1, [0.5, 1.8, 3.6], 2);
    } else if (id === 'barrage') {
      const tg = this.enemies.filter((e) => !e.dead && !e.cloaked && Math.hypot(e.x - p.x, e.z - p.z) < 42).sort((a, b) => Math.hypot(a.x - p.x, a.z - p.z) - Math.hypot(b.x - p.x, b.z - p.z));
      const n = 12 + (fx.multi ? 4 : 0); const S = { vsShip: 1.3, vsRock: 1, shieldMul: 1, pen: 0.3, beh: 'missile' };
      for (let k = 0; k < n; k++) { const t = tg.length ? { kind: 'ship', o: tg[k % tg.length] } : this.findTarget(p.x, p.z, 40, true); const a = p.yaw + (k / n - 0.5) * 2.6 + Math.PI; const sp = 34 * pst.proj;
        setTimeout(() => { if (this.dead) return; this.bolts.spawn({ x: p.x, z: p.z, y: 1.2, vx: Math.sin(a) * sp * 0.6, vz: Math.cos(a) * sp * 0.6, speed: sp, dmg: 16 * pst.dmg, owner: 'p', kind: 'missile', S, target: t, life: 3.4, len: 1.1, w: 1.6, color: [3.4, 1.4, 0.4], splash: 3.5, turn: 7 }); }, k * 45); }
    } else if (id === 'surge') {
      this.surgeT = 6; this.rings.spawn(p.x, 0.5, p.z, p.radius * 5, [3.4, 2.6, 0.5], 0.7); this.fx.burst(p.x, 1, p.z, 50, 10, 0.6, 1.2, 0.1, [3.4, 2.6, 0.5], 2);
    } else if (id === 'drones') {
      this.clearAllies(); for (let k = 0; k < 3; k++) { const o = buildShip(1).group; o.scale.setScalar(0.42); o.traverse((m) => { if (m.isMesh && m.material && m.material.emissive) { /* keep */ } }); this.scene.add(o); this.allies.push({ obj: o, a: k / 3 * TAU, cd: rand(0, 0.5), t: 20, x: p.x, z: p.z }); }
      this.fx.burst(p.x, 1, p.z, 30, 10, 0.5, 1, 0.1, [2.2, 0.8, 3.4], 2);
    }
    this.audio.ability(id, p.x, p.z); this.emit('ability', { id }); return true;
  }
  clearAllies() { for (const a of this.allies) { this.scene.remove(a.obj); disposeObject(a.obj); } this.allies.length = 0; }
  updateAllies(dt) {
    const p = this.player; const st = this.stats();
    for (let i = this.allies.length - 1; i >= 0; i--) {
      const a = this.allies[i]; a.t -= dt; if (a.t <= 0 || this.dead) { this.fx.burst(a.x, 1, a.z, 10, 6, 0.4, 0.6, 0.1, [2.2, 0.8, 3.4], 3); this.scene.remove(a.obj); disposeObject(a.obj); this.allies.splice(i, 1); continue; }
      a.a += dt * 1.6; const t = this.findTarget(a.x, a.z, 26, true); const tgt = t && t.kind === 'ship' ? t.o : null;
      const gx = tgt ? tgt.x + Math.cos(a.a) * 8 : p.x + Math.cos(a.a) * (p.radius + 6), gz = tgt ? tgt.z + Math.sin(a.a) * 8 : p.z + Math.sin(a.a) * (p.radius + 6);
      a.x = damp(a.x, gx, 3, dt); a.z = damp(a.z, gz, 3, dt); a.obj.position.set(a.x, 1.6, a.z); a.obj.rotation.y = tgt ? Math.atan2(tgt.x - a.x, tgt.z - a.z) : -a.a;
      a.cd -= dt; if (tgt && a.cd <= 0) { a.cd = 0.45; const d = Math.hypot(tgt.x - a.x, tgt.z - a.z) || 1, sp = 60;
        this.bolts.spawn({ x: a.x, z: a.z, y: 1.4, vx: (tgt.x - a.x) / d * sp, vz: (tgt.z - a.z) / d * sp, dmg: 7 * st.dmg, owner: 'p', kind: 'cannon', S: { vsShip: 1.1, vsRock: 0.5, shieldMul: 1, pen: 0.1 }, life: 0.6, len: 1.2, w: 0.9, color: [2.4, 0.9, 3.6] }); this.audio.droneFire(a.x, a.z); }
    }
  }
  // ---------- player damage ----------
  hurtPlayer(dmg, fx, fz, o = {}) {
    if (this.dead || this.dashT > 0) return;
    const p = this.player; const sk = this.skillFx(); const st = this.stats();
    if (sk.evade && p.thrust > 0.3 && Math.random() < sk.evade) { this.ui && this.ui.float(p.x, 2.2, p.z, 'EVADED', '#5dff98'); return; }
    dmg *= 1 - (o.energy ? (sk.resEnergy || 0) : (sk.resKinetic || 0));
    if (this.overT > 0) dmg *= 0.25;
    if (o.drain) p.energy = Math.max(0, p.energy - o.drain);
    // shield layer
    if (p.sh > 0) { const k = o.shieldBreak || 1; const sd = dmg * k; const ab = Math.min(p.sh, sd); p.sh -= ab; dmg = (sd - ab) / k; this.lastShieldHit = this.time; if (p.sh <= 0) { this.audio.shieldDown(); this.ui && this.ui.float(p.x, 2.4, p.z, 'SHIELDS DOWN', '#6fd8ff'); } }
    p.hp -= dmg; this.lastHurt = this.time;
    if (sk.emergencyShield && p.hp > 0 && p.hp < p.maxHp * 0.3 && this.time - this.emergT > 60) { this.emergT = this.time; p.sh = st.shield; this.audio.ability('overload', p.x, p.z); this.toast('Emergency shield restore!', 'good'); this.rings.spawn(p.x, 0.5, p.z, p.radius * 4, [0.5, 1.8, 3.6], 0.6); }
    if (sk.emergencyThrust && p.hp > 0 && p.hp < p.maxHp * 0.25 && this.time - this.emergThrustT > 45) { this.emergThrustT = this.time; const a = fx !== undefined ? Math.atan2(p.x - fx, p.z - fz) : p.yaw; this.dashT = 0.25; this.dashV = { x: Math.sin(a) * 120, z: Math.cos(a) * 120 }; this.audio.ability('dash', p.x, p.z); this.toast('Emergency thrust engaged!', 'good'); }
    if (fx !== undefined && p.shield && this.shieldOn !== false) {
      const lx = fx - p.x, lz = fz - p.z, c = Math.cos(-p.yaw), s = Math.sin(-p.yaw);
      this.shieldMat.uniforms.uHit.value.set(lx * c + lz * s, 0.2, -lx * s + lz * c).normalize(); this.shieldMat.uniforms.uT.value = 1;
    }
    this.addShake(0.18); this.audio.hurt(fx !== undefined && p.sh > 0, fx === undefined ? p.x : fx, fz === undefined ? p.z : fz); if (dmg > 0.5) this.ui && this.ui.hurtFlash();
    if (p.hp <= 0) this.playerDie();
  }
  playerDie() {
    const p = this.player; this.dead = true; p.hp = 0; this.autopilot = false;
    this.boom(p.x, 0.5, p.z, 2.5, [0.5, 2, 3]); this.debris.spawn(p.x, 0, p.z, 20, 14, 0.7);
    this.audio.explode(true, p.x, p.z); this.addShake(0.8); p.group.visible = false;
    let lost = 0; for (const k of MINERAL_KEYS) { const n = Math.ceil(this.s.cargo[k] / 2); lost += n; this.s.cargo[k] -= n; if (n) this.minerals.spawn(p.x, p.z, k, Math.min(n, 12), 12); }
    this.s.stats.deaths++;
    this.toast(`Hull breached! Lost ${lost} cargo units. Respawning at station…`, 'warn');
    setTimeout(() => {
      p.x = 0; p.z = 34; p.vx = p.vz = 0; p.hp = p.maxHp; p.sh = this.stats().shield; p.energy = this.stats().energyMax; p.group.visible = true; this.dead = false; this.heat = 0; this.clearAllies();
      for (const e of this.enemies) if (e.type !== 'sentinel' && e.type !== 'boss' && !e.D.inst) this.removeEnemy(e);
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
    this.smoke.burst(a.x, a.y, a.z, Math.ceil(3 + a.r), 3, 1.4, a.r * 0.8, a.r * 2.2, [0.2, 0.19, 0.2], 1.8, 0.3);
    if (a.r > 2.5 || a.rich) this.flashes.spawn(a.x, a.y, a.z, 25, col.getHex(), 0.3, 16);
    this.rings.spawn(a.x, a.y, a.z, a.r * 3, tint.map((v) => v * 0.5), 0.45);
    this.audio.rockBreak(a.r > 3, a.x, a.z); this.addShake(0.05 + a.r * 0.03, a.x, a.z);
    const sec = sectorAt(Math.hypot(a.x, a.z));
    const n = Math.max(1, Math.round(a.r * 1.5 * (a.rich ? 2.6 : 1) * st.mining * (1 + 0.2 * (sec.id - 1))));
    this.minerals.spawn(a.x, a.z, a.type, n, 5 + a.r);
    this.addXP(Math.round(a.r * 2 * sec.id * (a.rich ? 3 : 1)));
    this.s.stats.rocks++; this.emit('rock', {});
    if (a.r > 1.9 && !a.rich) { const k = a.r > 3.3 ? randInt(2, 3) : randInt(1, 2); for (let i = 0; i < k; i++) { const ang = rand(0, TAU); this.field.spawnFragment(a.x + Math.cos(ang) * a.r * 0.6, a.z + Math.sin(ang) * a.r * 0.6, a.r > 3.3 ? rand(1.0, 1.5) : rand(0.7, 1.0), a.type, a.sector); } }
    this.field.destroy(a, this.time, a.rich ? 240 : 150);
  }

  // ---------- targeting ----------
  findTarget(x, z, range, preferShips, avoid) {
    let best = null, bd = Infinity, bestS = null, bsd = Infinity;
    for (const e of this.enemies) { if (e.dead || e.cloaked || (e.type === 'sentinel' && e.state === 'idle' && !preferShips) || (avoid && avoid.has(e))) continue; const d = Math.hypot(e.x - x, e.z - z) - e.radius; if (d >= range) continue;
      // priority: skip immune hulls (sector shield, pylons up, cloaked boss) in favour of what actually unlocks them
      let sd = d; if (e.D.boss || e.D.inst) { const m = this.camp.dmgMod(e, true)[0]; if (m === 0) sd += 60; else if (m < 0.5) sd += 25; } if (e.partK === 'gen') sd -= 12;
      if (sd < bsd) { bsd = sd; bestS = e; } }
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
    const p = this.player; const st = this.stats(); const fx = st.fx;
    const hasCombat = p.weapons.some((w) => w.key !== 'beam' || w.S.vsShip >= 1);
    let laserOn = 0; this.taken.clear();
    const cool = 12 * Math.pow(st.rate, 0.8); const eMul = 1 + (fx.weaponEnergy || 0); const heatMul = 1 + (fx.heat || 0);
    p.group.updateMatrixWorld(true);
    for (const w of p.weapons) {
      const S = w.S; const range = S.range * st.range;
      w.retarget -= dt; w.cd -= dt; w.heat = Math.max(0, w.heat - cool * dt);
      if (w.over > 0) { w.over -= dt; if (w.over <= 0) w.heat = 30; }
      if (w.recoil > 0) { w.recoil = Math.max(0, w.recoil - dt * 5); w.turret.userData.barrel.position.z = w.bz0 - w.recoil * 0.35 * w.turret.userData.size; }
      const off = this.dead || w.over > 0;
      if (off) { if (w.beam) { w.beam.visible = false; w.beam.userData.impact.visible = false; } continue; }
      const preferShips = S.vsShip >= 1 || !hasCombat;
      if (w.retarget <= 0 || !this.targetValid(w.target, p.x, p.z, range)) {
        w.target = this.findTarget(p.x, p.z, range, preferShips, fx.multi ? this.taken : null) || (fx.multi ? this.findTarget(p.x, p.z, range, preferShips) : null); w.retarget = 0.3;
      }
      if (w.target && w.target.kind === 'ship') this.taken.add(w.target.o);
      const heatUp = (h) => { w.heat += h * heatMul; if (w.heat >= 100) { w.over = 2.5; w.heat = 100; this.audio.overheat(); this.ui && this.ui.float(p.x, 2.8, p.z, 'OVERHEAT', '#ff7a45'); } };
      const pay = (e) => { e *= eMul; if (p.energy < e) return false; p.energy -= e; return true; };
      const critC = st.crit + S.crit;
      // pulse is omni
      if (S.beh === 'pulse') {
        if (w.target && w.cd <= 0 && pay(S.energy)) { w.cd = 1 / (S.rate * st.rate); heatUp(S.heat); this.firePulse(range * 0.9, S.dmg * st.dmg, S, critC); }
        continue;
      }
      const t = w.target;
      const muzzle = this.tmpV.copy(w.turret.userData.muzzle); w.turret.localToWorld(muzzle);
      if (!t) { if (w.beam) { w.beam.visible = false; w.beam.userData.impact.visible = false; } w.turret.rotation.y = damp(w.turret.rotation.y, 0, 3, dt); continue; }
      const o = t.o; const ty = t.kind === 'rock' ? o.y : 0.4;
      // aim turret (local yaw)
      const wantYaw = Math.atan2(o.x - muzzle.x, o.z - muzzle.z) - p.yaw;
      const cur = w.turret.rotation.y; const dd = angleDiff(cur, wantYaw);
      w.turret.rotation.y = cur + clamp(dd, -10 * dt, 10 * dt);
      const aimed = Math.abs(dd) < 0.5;
      if (S.beh === 'beam') {
        const powered = pay(S.energy * dt);
        const tgt = this.tmpV2.set(o.x, ty, o.z); const dir = tgt.clone().sub(muzzle); const len = dir.length();
        const rad = t.kind === 'rock' ? o.r * 0.75 : o.radius * 0.6; const hitLen = Math.max(0.5, len - rad);
        dir.normalize(); const hit = muzzle.clone().addScaledVector(dir, hitLen);
        const on = aimed && powered; if (on) laserOn++;
        w.beam.visible = on; w.beam.position.copy(muzzle); w.beam.lookAt(hit); w.beam.scale.z = hitLen;
        const flick = 0.85 + Math.random() * 0.3; w.beam.scale.x = w.beam.scale.y = 0.06 * flick * (1 + this.s.tier * 0.12) * (1 + w.item.r * 0.12);
        const imp = w.beam.userData.impact; imp.visible = on; imp.position.copy(hit); imp.scale.setScalar((1.6 + this.s.tier * 0.25) * flick * (1 + w.item.r * 0.1));
        if (!on) continue;
        heatUp(S.heat * dt);
        const mult = t.kind === 'rock' ? S.vsRock * st.mining : S.vsShip * (1 + (fx.beamDmg || 0));
        w.acc += S.dmg * st.dmg * mult * st.rate * dt; w.tick -= dt;
        const bc = S.beamRgb;
        if (Math.random() < 0.7 * this.fx.budget) this.fx.emit(hit.x, hit.y, hit.z, rand(-6, 6), rand(0, 4), rand(-6, 6), 0.35, 0.7, 0.1, bc[0] * 0.6, bc[1] * 0.9, bc[2], 3);
        if (Math.random() < 0.15 * this.fx.budget && t.kind === 'rock') this.fx.emit(hit.x, hit.y, hit.z, rand(-3, 3), rand(0, 2), rand(-3, 3), 0.8, 0.4, 1.4, 0.25, 0.22, 0.22, 2);
        if (w.tick <= 0) {
          w.tick = 0.15; const crit = Math.random() < critC; const dmg = w.acc * (crit ? 2.5 : 1); w.acc = 0;
          if (t.kind === 'rock') { this.damageRock(o, dmg, crit); this.audio.rockHit(hit.x, hit.z); } else { this.damageEnemy(o, dmg, crit, S); this.audio.hit(hit.x, hit.z); }
        }
      } else if (w.cd <= 0 && aimed) {
        if (!pay(S.energy)) { w.cd = 0.15; continue; }
        w.cd = 1 / (S.rate * st.rate); heatUp(S.heat);
        if (S.beh === 'bolt') {
          const speed = S.speed * st.proj; const d = Math.hypot(o.x - muzzle.x, o.z - muzzle.z); const lead = d / speed;
          const ax = o.x + (o.vx || 0) * lead, az = o.z + (o.vz || 0) * lead; const ad = Math.hypot(ax - muzzle.x, az - muzzle.z) || 1;
          const sp = rand(-0.03, 0.03); const ux = (ax - muzzle.x) / ad, uz = (az - muzzle.z) / ad; const c = Math.cos(sp), s = Math.sin(sp);
          const crit = Math.random() < critC;
          this.bolts.spawn({ x: muzzle.x, z: muzzle.z, y: muzzle.y, vx: (ux * c - uz * s) * speed, vz: (uz * c + ux * s) * speed, dmg: S.dmg * st.dmg, crit, owner: 'p', kind: 'cannon', S, pierce: S.pierce, life: range * 1.3 / speed, len: S.len, w: S.w, color: S.rgb });
          const mc = S.rgb; this.fx.emit(muzzle.x, muzzle.y, muzzle.z, 0, 0, 0, 0.08, 1.8 * S.w, 0.5, mc[0], mc[1], mc[2], 0); this.fx.emit(muzzle.x, muzzle.y, muzzle.z, 0, 0, 0, 0.05, 0.7, 0.2, 4, 4, 3, 0); w.recoil = 1;
          this.audio.shoot(muzzle.x, muzzle.z, this.s.tier + (S.cat === 'plasma' ? -1.5 : S.cat === 'railgun' && S.speed > 100 ? -2 : S.cat === 'ion' ? 2 : 0));
        } else if (S.beh === 'missile') {
          const n = 2 + (fx.multi ? 1 : 0);
          for (let k = 0; k < n; k++) {
            const off = (k / (n - 1) - 0.5) * 1.0; const base = p.yaw + w.turret.rotation.y + off; const speed = S.speed * st.proj;
            this.bolts.spawn({ x: muzzle.x, z: muzzle.z, y: muzzle.y, vx: Math.sin(base) * speed * 0.5, vz: Math.cos(base) * speed * 0.5, speed, dmg: S.dmg * st.dmg * (1 + (fx.missileDmg || 0)), crit: Math.random() < critC, owner: 'p', kind: 'missile', S, target: t, life: 3.2, len: 1.2, w: 1.8, color: [3.4, 1.6, 0.5], splash: S.splash * (1 + 0.1 * (this.s.tier - 1)), turn: 6 * (1 + (fx.missileTurn || 0)) });
          }
          w.recoil = 1; this.smoke.burst(muzzle.x, muzzle.y, muzzle.z, 3, 2, 0.8, 0.5, 1.6, [0.3, 0.3, 0.32], 2, 0.2);
          this.audio.missile(muzzle.x, muzzle.z);
        }
      }
    }
    this.audio.laser(laserOn > 0 && !this.dead, Math.min(2, laserOn));
    // point defence (T5)
    const pdS = { vsShip: 1.2, vsRock: 0.8, shieldMul: 1, pen: 0.1 };
    for (const pd of p.pd || []) {
      pd.cd -= dt; if (pd.recoil > 0) { pd.recoil = Math.max(0, pd.recoil - dt * 6); pd.turret.userData.barrel.position.z = pd.bz0 - pd.recoil * 0.25; }
      const mz = this.tmpV.copy(pd.turret.userData.muzzle); pd.turret.localToWorld(mz);
      let tgt = null, bd = 22; for (const e of this.enemies) { if (e.dead || e.cloaked || (e.type === 'sentinel' && e.state === 'idle')) continue; const d = Math.hypot(e.x - mz.x, e.z - mz.z); if (d < bd) { bd = d; tgt = e; } }
      const wy = tgt ? angleDiff(0, Math.atan2(tgt.x - mz.x, tgt.z - mz.z) - p.yaw) : Math.sin(this.time * 0.5 + pd.bz0 * 10) * 0.8;
      pd.turret.rotation.y = pd.turret.rotation.y + clamp(angleDiff(pd.turret.rotation.y, wy), -8 * dt, 8 * dt);
      if (tgt && pd.cd <= 0 && !this.dead) { pd.cd = 0.45 / st.rate; pd.recoil = 1; const d = bd || 1, sp = 60;
        this.bolts.spawn({ x: mz.x, z: mz.z, y: mz.y, vx: (tgt.x - mz.x) / d * sp, vz: (tgt.z - mz.z) / d * sp, dmg: 4 * st.dmg, owner: 'p', kind: 'cannon', S: pdS, life: 0.5, len: 0.9, w: 0.6, color: [0.8, 2.6, 3.4] });
        this.fx.emit(mz.x, mz.y, mz.z, 0, 0, 0, 0.05, 0.8, 0.2, 1, 2.6, 3.2, 0); this.audio.pdFire(mz.x, mz.z); }
    }
    // escort drones (T4/T5)
    for (const esc of p.escorts || []) {
      esc.a += dt * 1.2; const r = p.radius + 4;
      const ex = p.x + Math.cos(esc.a) * r, ez = p.z + Math.sin(esc.a) * r;
      esc.obj.position.set(ex, 1.5 + Math.sin(esc.a * 2) * 0.4, ez); esc.obj.rotation.y = -esc.a;
      esc.cd -= dt;
      if (esc.cd <= 0 && !this.dead) {
        const t = this.findTarget(ex, ez, 20 * st.range, true);
        if (t) { esc.cd = 0.6 / st.rate; const o = t.o; const d = Math.hypot(o.x - ex, o.z - ez) || 1; const sp = 55 * st.proj;
          this.bolts.spawn({ x: ex, z: ez, y: 1.2, vx: (o.x - ex) / d * sp, vz: (o.z - ez) / d * sp, dmg: 5 * st.dmg, owner: 'p', kind: 'cannon', S: pdS, life: 0.6, len: 1.2, w: 0.8, color: [0.6, 2.6, 3.4] }); this.audio.droneFire(ex, ez); }
        else esc.cd = 0.3;
      }
    }
  }
  firePulse(radius, dmg, S, critC) {
    const p = this.player;
    const c0 = RARITIES[0].rgb; const tint = S.rgb || [1.8, 0.8, 3.2];
    this.rings.spawn(p.x, 0.3, p.z, radius, [1.8, 0.8, 3.2], 0.5); this.rings.spawn(p.x, 0.3, p.z, radius * 0.7, [1.2, 0.6, 2.4], 0.35);
    this.fx.burst(p.x, 0.4, p.z, 30, radius * 3, 0.35, 1.0, 0.2, [1.6, 0.8, 3], 3, 0.05);
    this.audio.pulse(p.x, p.z); this.addShake(0.08);
    for (const e of [...this.enemies]) if (!e.dead && !e.cloaked && Math.hypot(e.x - p.x, e.z - p.z) < radius + e.radius) { const c = Math.random() < critC; this.damageEnemy(e, dmg * S.vsShip * (c ? 2.5 : 1), c, S); }
    for (const a of [...this.field.list]) if (a.alive && Math.hypot(a.x - p.x, a.z - p.z) < radius + a.r * 0.5) { const c = Math.random() < critC; this.damageRock(a, dmg * S.vsRock * this.stats().mining * (c ? 2.5 : 1), c); }
  }
  explodeMissile(b) {
    const st = this.stats(); const S = b.S;
    this.boom(b.x, 0.5, b.z, 0.6, null, false); this.rings.spawn(b.x, 0.4, b.z, b.splash, [3, 1.4, 0.4], 0.35); this.audio.missileBoom(b.x, b.z);
    for (const e of [...this.enemies]) { if (e.dead) continue; const d = Math.hypot(e.x - b.x, e.z - b.z); if (d < b.splash + e.radius) { const c = b.crit && d < e.radius + 0.5; this.damageEnemy(e, b.dmg * S.vsShip * (d < e.radius + 0.5 ? 1 : 0.6) * (c ? 2.5 : 1), c, S); } }
    for (const a of [...this.field.list]) { if (!a.alive) continue; const d = Math.hypot(a.x - b.x, a.z - b.z); if (d < b.splash + a.r * 0.7) { const c = !!b.crit; this.damageRock(a, b.dmg * S.vsRock * st.mining * (c ? 2.5 : 1), c); } }
  }
  boltSplash(b, hitE) { // plasma / volatile splash
    const S = b.S; const R = S.splash; this.rings.spawn(b.x, 0.4, b.z, R, S.rgb ? S.rgb.map((v) => v * 0.7) : [3, 1.2, 0.5], 0.3);
    for (const e of [...this.enemies]) { if (e.dead || e === hitE) continue; if (Math.hypot(e.x - b.x, e.z - b.z) < R + e.radius) this.damageEnemy(e, b.dmg * S.vsShip * 0.5 * S.splashK, false, S, true); }
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
        const tr = b.turn || 6; let ang = cur; if (tx !== undefined) ang = cur + clamp(angleDiff(cur, Math.atan2(tx - b.x, tz - b.z)), -tr * dt, tr * dt);
        b.vx = Math.sin(ang) * sp; b.vz = Math.cos(ang) * sp;
        if (Math.random() < 0.8 * this.fx.budget) this.fx.emit(b.x, b.y, b.z, rand(-1, 1), rand(0, 1), rand(-1, 1), 0.3, 0.8, 0.3, 2.4, 1.1, 0.4, 2);
        if (Math.random() < 0.9 * this.smoke.budget) this.smoke.emit(b.x, b.y, b.z, rand(-0.6, 0.6), rand(0, 0.8), rand(-0.6, 0.6), 1.1, 0.4, 1.8, 0.32, 0.31, 0.33, 1.5, 0.8);
      }
      b.x += b.vx * dt; b.z += b.vz * dt;
      if (b.owner === 'p') {
        let hit = false; const S = b.S;
        for (const e of this.enemies) {
          if (e.dead || e.cloaked || (b.hitSet && b.hitSet.has(e))) continue;
          if (Math.hypot(e.x - b.x, e.z - b.z) < e.radius + 0.4) {
            if (b.kind === 'missile') { hit = true; this.explodeMissile(b); break; }
            let tgt = e; if (e.bc) for (const q of [...e.bc.gens, ...e.bc.parts]) if (!q.dead && Math.hypot(q.x - b.x, q.z - b.z) < q.radius + 1.2) { tgt = q; break; } // components first
            const c = !!b.crit; this.damageEnemy(tgt, b.dmg * S.vsShip * (c ? 2.5 : 1), c, S);
            if (S.splash) this.boltSplash(b, e);
            const col = b.color || [3, 2, 0.8]; this.fx.burst(b.x, 0.5, b.z, 4, 8, 0.25, 0.6, 0.1, col, 3); this.audio.hit(b.x, b.z);
            if (b.pierce > 0) { b.pierce--; (b.hitSet ||= new Set()).add(e); b.dmg *= 0.8; continue; }
            hit = true; break;
          }
        }
        if (!hit) for (const a of this.field.list) { if (!a.alive) continue; if (Math.abs(a.x - b.x) < a.r && Math.abs(a.z - b.z) < a.r && Math.hypot(a.x - b.x, a.z - b.z) < a.r * 0.85) { hit = true; if (b.kind === 'missile') this.explodeMissile(b); else { const c = !!b.crit; this.damageRock(a, b.dmg * S.vsRock * st.mining * (c ? 2.5 : 1), c); this.audio.rockHit(b.x, b.z); this.fx.burst(b.x, a.y, b.z, 5, 9, 0.3, 0.45, 0.06, b.color || [3, 2, 0.8], 3, 0.7); this.smoke.emit(b.x, a.y + 0.3, b.z, 0, 0.6, 0, 0.9, 0.5, 1.4, 0.2, 0.18, 0.18, 1.5, 0.7); } break; } }
        if (hit) { b.dead = true; continue; }
        if (b.life <= 0 && b.kind === 'missile') this.explodeMissile(b);
      } else {
        // enemy bolts: rival skirmish ships and friendly units (patrols, escorts, defended stations) can be hit too
        let hit = false;
        if (b.battle) for (const e of this.enemies) { if (e.dead || e.battle !== b.battle || e.side === b.side) continue; if (Math.hypot(e.x - b.x, e.z - b.z) < e.radius + 0.3) { this.damageEnemy(e, b.dmg, false, null, true, 'rival'); this.fx.burst(b.x, 0.5, b.z, 4, 8, 0.25, 0.6, 0.1, b.color || [3, 0.6, 0.4], 3); hit = true; break; } }
        if (!hit) for (const f of this.camp.friends) { if (f.dead) continue; if (Math.hypot(f.x - b.x, f.z - b.z) < f.radius + 0.3) { this.camp.hurtFriend(f, b.dmg); this.fx.burst(b.x, 0.5, b.z, 4, 8, 0.25, 0.6, 0.1, [0.6, 2.2, 3.4], 3); hit = true; break; } }
        if (hit) { b.dead = true; continue; }
        if (this.dead) { if (b.life <= 0) b.dead = true; continue; }
        if (Math.hypot(p.x - b.x, p.z - b.z) < p.radius) { const M = b.fac ? this.facMods(b.fac) : null; this.hurtPlayer(b.dmg, b.x - b.vx * 0.05, b.z - b.vz * 0.05, { energy: b.energy, drain: M && M.drain, shieldBreak: M && M.shieldBreak }); this.fx.burst(b.x, 0.5, b.z, 6, 8, 0.3, 0.8, 0.1, [3, 0.6, 0.4], 3); b.dead = true; continue; }
      }
      if (b.life <= 0) b.dead = true;
    }
    this.bolts.sync();
  }

  // ---------- hp bars ----------
  initBars() {
    const bg = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.6, depthTest: false });
    const geo = new THREE.PlaneGeometry(1, 1); geo.translate(0.5, 0, 0);
    for (let i = 0; i < 56; i++) {
      const g = new THREE.Group(); const b = new THREE.Mesh(geo, bg); const f = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: 0xff4455, depthTest: false }));
      b.renderOrder = 20; f.renderOrder = 21; f.position.z = 0.01; g.add(b, f); g.visible = false; this.scene.add(g); this.bars.push({ g, f });
    }
  }
  updateBars() {
    let i = 0; const q = this.camera.quaternion;
    const show = (x, y, z, w, frac, col) => { if (i >= this.bars.length) return; const B = this.bars[i++]; B.g.visible = true; B.g.position.set(x - w / 2, y, z); B.g.quaternion.copy(q); B.g.scale.set(w, Math.max(0.22, w * 0.07), 1); B.f.scale.x = clamp(frac, 0, 1); B.f.material.color.set(col); };
    for (const e of this.enemies) { if (e.dead || e.D.boss || e.cloaked || !e.group.visible) continue; const w = Math.min(12, Math.max(2, e.radius * 1.6)); const yb = 2 + Math.min(8, e.radius) * (e.D.inst ? 1.3 : 1);
      if (e.hp < e.maxHp || e.elite || e.D.part || e.type === 'freighter' || (e.D.inst && Math.hypot(e.x - this.player.x, e.z - this.player.z) < 50)) show(e.x, yb, e.z - e.radius, w, e.hp / e.maxHp, e.D.part ? '#ff9a3d' : e.type === 'freighter' ? '#ffd166' : e.elite || e.named ? '#ffb238' : e.battle ? '#c99bff' : '#ff4d5e');
      if (e.maxShield > 0 && (e.shield < e.maxShield || e.hp < e.maxHp)) show(e.x, yb + 0.45, e.z - e.radius, w, e.shield / e.maxShield, '#4fd2ff'); }
    for (const f of this.camp.friends) if (!f.dead && (f.hp < f.maxHp || f.kind !== 'patrol')) show(f.x, 2.4 + f.radius, f.z - f.radius, Math.max(2.4, f.radius * 1.6), f.hp / f.maxHp, '#5dff98');
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
    // timers: abilities, energy, shields
    if (this.overT > 0) this.overT -= dt; if (this.surgeT > 0) { this.surgeT -= dt; if (Math.random() < 0.5 * this.fx.budget) this.fx.emit(p.x + rand(-1, 1) * p.radius, 0.8, p.z + rand(-1, 1) * p.radius, 0, 2, 0, 0.5, 0.8, 0.2, 3.4, 2.6, 0.5, 2); }
    if (!this.dead) {
      p.energy = Math.min(st.energyMax, p.energy + st.energyRegen * dt * (this.jamT > this.time ? 0.4 : 1));
      if (this.docked) p.sh = Math.min(st.shield, p.sh + st.shield * 0.5 * dt);
      else if (this.time - this.lastShieldHit > st.shieldDelay && this.time - this.lastHurt > st.shieldDelay) p.sh = Math.min(st.shield, p.sh + st.shield * st.shieldRegen * dt);
      if (this.skillFx().autoRepair && p.hp < p.maxHp) p.hp = Math.min(p.maxHp, p.hp + p.maxHp * this.skillFx().autoRepair * dt);
    }
    if (this.overT > 0) { this.shieldMat.uniforms.uT.value = Math.max(this.shieldMat.uniforms.uT.value, 0.55 + 0.15 * Math.sin(this.time * 12)); }
    if (!this.dead) {
      if (this.dashT > 0) { // quantum dash: fixed-velocity blink, then carry top speed
        const ddt = Math.min(dt, this.dashT); this.dashT -= dt; p.x += this.dashV.x * ddt; p.z += this.dashV.z * ddt;
        if (Math.random() < 0.9) this.fx.emit(p.x, 0.6, p.z, 0, 0, 0, 0.35, p.radius * 1.4, 0.4, 0.4, 2.6, 1.4, 0);
        if (this.dashT <= 0) { const m = Math.hypot(this.dashV.x, this.dashV.z) || 1; p.vx = this.dashV.x / m * st.speed; p.vz = this.dashV.z / m * st.speed; this.rings.spawn(p.x, 0.3, p.z, 4 + p.radius, [0.5, 3, 1.4], 0.3); }
      } else {
      p.vx += ix * st.accel * dt; p.vz += iz * st.accel * dt;
      const drag = im > 0.05 ? 0.6 : 1.8; const k = Math.exp(-drag * dt); p.vx *= k; p.vz *= k;
      const sp = Math.hypot(p.vx, p.vz); const max = st.speed * (this.autopilot ? 1.15 * (1 + (st.fx.hyper || 0)) : 1) * (this.time - this.emergThrustT < 4 ? 1.5 : 1);
      if (sp > max) { p.vx *= max / sp; p.vz *= max / sp; }
      p.x += p.vx * dt; p.z += p.vz * dt;
      }
    }
    p.thrust = damp(p.thrust, im, 6, dt);
    // collisions with rocks & station core
    for (const a of this.field.list) {
      if (!a.alive) continue; const dx = p.x - a.x, dz = p.z - a.z; const min = a.r * 0.85 + p.radius * 0.7;
      if (Math.abs(dx) > min || Math.abs(dz) > min) continue;
      const d = Math.hypot(dx, dz); if (d < min && d > 0.001) { const nx = dx / d, nz = dz / d; p.x = a.x + nx * min; p.z = a.z + nz * min; const vn = p.vx * nx + p.vz * nz; if (vn < 0) { p.vx -= vn * 1.4 * nx; p.vz -= vn * 1.4 * nz;
        if (vn < -11 && !st.fx.collision && !this.docked && this.dashT <= 0) this.hurtPlayer((-vn - 11) * 0.6 * this.s.tier, a.x, a.z, { energy: false }); } } // high-speed impacts hurt (Impact Dampers negate)
    }
    { const d = Math.hypot(p.x, p.z); const min = 8 + p.radius * 0.5; if (d < min && d > 0.001) { p.x = p.x / d * min; p.z = p.z / d * min; } }
    // heading & banking
    const sp = Math.hypot(p.vx, p.vz);
    if (sp > 0.8 || im > 0.1) {
      const want = im > 0.1 ? Math.atan2(ix, iz) : Math.atan2(p.vx, p.vz);
      const turnRate = st.turn; const dy = angleDiff(p.yaw, want); const step = clamp(dy, -turnRate * dt, turnRate * dt);
      p.yaw += step; p.yawVel = step / Math.max(dt, 1e-4);
    } else p.yawVel = 0;
    p.bank = damp(p.bank, clamp(p.yawVel * 0.22, -0.65, 0.65), 6, dt);
    p.group.position.set(p.x, Math.sin(this.time * 1.6) * 0.12, p.z);
    p.group.rotation.set(Math.sin(this.time * 1.1) * 0.02 - p.thrust * 0.05, p.yaw, -p.bank);
    // flames + trails
    const pw = 0.25 + p.thrust * 1.1; p.flames.mat.uniforms.uPower.value = pw; p.flames.mat.uniforms.uTime.value = this.time;
    for (const f of p.flames.flames) { const L = f.r * (1.2 + p.thrust * 5.5) * (0.9 + Math.random() * 0.2); f.mesh.scale.set(1, 1, L); f.core.scale.set(1, 1, L * 0.55); f.mesh.visible = f.core.visible = !this.dead; f.sprite.scale.setScalar(f.r * (2.2 + p.thrust * 2.2) * (0.92 + Math.random() * 0.16)); }
    animateNavLights(p.model, this.time);
    for (const e of p.escorts || []) animateNavLights(e.obj, this.time);
    { const animated = {}; for (const e of this.enemies) if (!e.dead && !animated[e.type]) { animated[e.type] = 1; animateNavLights(e.group, this.time); } }
    for (const k in this.protos) this.protos[k].flameMat.uniforms.uTime.value = this.time;
    // shield ripple
    { const u = this.shieldMat.uniforms.uT; if (u.value > 0) u.value = Math.max(0, u.value - dt * 2.6); p.shield.visible = u.value > 0 && !this.dead && this.shieldOn !== false; }
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
    if (this.docked && !wasDocked) { this.audio.docked(); this.autopilot = false; this.dockT = 0; p.vx *= 0.35; p.vz *= 0.35; this.rings.spawn(p.x, 0, p.z, 6 + p.radius * 2, [0.4, 1.8, 2.8], 0.7); this.ui && this.ui.onDock(); }
    if (this.docked) {
      this.dockT += dt; if (this.dockT < 1.2) { const k = Math.exp(-2.5 * dt); p.vx *= k; p.vz *= k; }
      const port = this.stationRoot.userData.dockPort; const tb = this.tractor; const hit = this.tmpV2.set(p.x, 0.3, p.z);
      tb.visible = true; tb.position.set(port.x, port.y + 0.5, port.z); tb.lookAt(hit); tb.scale.z = Math.max(0.5, tb.position.distanceTo(hit) - p.radius * 0.4);
      const a = 0.35 + 0.65 * Math.max(0, 1 - this.dockT / 1.5); const w = (0.18 + 0.05 * Math.sin(this.time * 9)) * (0.6 + a);
      tb.scale.x = tb.scale.y = w; tb.material.opacity = a; tb.children[0].material.opacity = 0.25 * a;
      if (Math.random() < 0.35 * this.fx.budget) { const t = Math.random(); this.fx.emit(lerp(port.x, p.x, t), 0.5, lerp(port.z, p.z, t), 0, 0.3, 0, 0.5, 0.6, 0.1, 0.4, 1.8, 2.6, 1); }
    } else this.tractor.visible = false;
    // sector tracking: distance rings (minerals/quests) + named galaxy sectors (factions, threat, discovery)
    const sec = sectorAt(dHome);
    if (sec.id !== this.sectorId) { this.sectorId = sec.id; if (sec.id > this.s.maxSector) { this.s.maxSector = sec.id; this.save(); } }
    const gs = gsectorAt(p.x, p.z);
    if (gs !== this.gsec) {
      this.gsec = gs; const g = this.s.galaxy; const fresh = !g.explored[gs.id]; let xp = 0;
      if (fresh) { g.explored[gs.id] = 1; xp = 60 * Math.max(1, gs.ringI); this.addXP(xp); this.secEnterT = this.time; this.emit('discover', { id: gs.id }); this.save(); }
      if (this.time > 3) { this.audio.warp(); this.audio.sector(); }
      this.ui && this.ui.sectorBanner(gs, { fresh, xp, flip: g.flipT[gs.id] != null && this.s.war.clock - g.flipT[gs.id] < 400 });
    }
    // waypoint arrival
    { const wp = this.s.galaxy.wp; if (wp && Math.hypot(wp.x - p.x, wp.z - p.z) < 12 + p.radius) { this.toast(`Waypoint reached: ${wp.label}`, 'good'); this.audio.click(); this.s.galaxy.wp = null; this.save(); } }
    // world streaming
    this.field.loadR = this.s.tier >= 4 ? 3 : 2;
    this.field.update(p.x, p.z, this.time, dt);
    this.director(dt);
    this.updateEnemies(dt);
    this.updateWeapons(dt);
    this.updateBolts(dt);
    this.updateLoot(dt); this.updateCaches(dt); this.updateAllies(dt);
    // minerals
    const cap = st.cargo;
    this.minerals.update(dt, p.x, p.z, st.magnet, p.radius + 1.0, () => !this.dead && this.cargoTotal() < cap, (o) => {
      this.s.cargo[o.type]++; this.s.stats.mined++; this.pickupCombo++; this.pickupT = 0.5;
      this.pickupAgg[o.type] = (this.pickupAgg[o.type] || 0) + 1;
      this.audio.pickup(this.pickupCombo); this.emit('collect', { type: o.type, n: 1 });
      this.fx.emit(p.x, 0.6, p.z, 0, 2, 0, 0.25, 1.2, 2.2, 0.6, 1.8, 2.6, 0);
      if (this.cargoTotal() >= cap) { this.toast('Cargo full! Return to the station to sell.', 'warn'); this.ui && this.ui.cargoFull(); }
    }, this.time, (x, y, z, type, pulled) => {
      const c = MINERALS[type].rgb || (MINERALS[type].rgb = new THREE.Color(MINERALS[type].color)); const k = pulled ? 2.6 : 3.2;
      this.fx.emit(x + rand(-0.2, 0.2), y + rand(0, 0.4), z + rand(-0.2, 0.2), 0, pulled ? 0 : 0.5, 0, pulled ? 0.35 : 0.5, pulled ? 0.5 : 0.35, 0.05, c.r * k, c.g * k, c.b * k, 1);
    });
    this.pickupT -= dt;
    if (this.pickupT <= 0 && Object.keys(this.pickupAgg).length) {
      let off = 0; for (const k in this.pickupAgg) { this.ui && this.ui.float(p.x + off, 2.5, p.z - 1, `+${this.pickupAgg[k]} ${MINERALS[k].name}`, MINERALS[k].css); off += 1.5; }
      this.pickupAgg = {}; this.pickupCombo = 0; this.pickupT = 0.5;
    }
    this.updateFactory(dt);
    // fx
    this.fx.update(dt); this.debris.update(dt); this.rings.update(dt);
    animateStation(this.stationRoot, this.time, dt);
    if (this.smoke.budget > 0) for (const v of this.stationRoot.userData.anim.stacks) if (Math.random() < 0.25) {
      this.smoke.emit(v.x + rand(-0.2, 0.2), v.y, v.z + rand(-0.2, 0.2), rand(-0.3, 0.3) + 0.4, rand(1.2, 2), rand(-0.3, 0.3) - 0.3, 2.6, 0.6, 3.2, 0.24, 0.23, 0.25, 0.3, 0.55);
      if (Math.random() < 0.3) this.fx.emit(v.x, v.y + 0.1, v.z, 0, 0.8, 0, 0.5, 0.9, 0.3, 1.6, 0.6, 0.15, 1);
    }
    this.smoke.update(dt); this.flashes.update(dt);
    this.updateBars();
  }

  setQuality(q) {
    const low = q === 'low';
    this.flashes.enabled = !low; for (const o of this.flashes.pool) o.l.visible = !low;
    this.smoke.budget = low ? 0 : q === 'medium' ? 0.6 : 1; this.smoke.points.visible = !low;
    this.shieldOn = !low;
    this.field.hiDist = low ? 22 : q === 'medium' ? 45 : 70;
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

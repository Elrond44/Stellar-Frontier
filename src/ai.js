// v5 enemy AI roles. Each returns movement intent {tx, tz, spd, wantFire} (or null for the default behaviour).
// dx/dz/dist point from the ship to its current target T (the player, an escorted civilian, or a rival ship).
import { ABILITY_ORDER, ABILITIES } from './rpg.js?v=6';
import { FACTIONS } from './galaxy.js?v=6';
const rand = (a, b) => a + Math.random() * (b - a);

export function roleAI(G, e, dt, dist, dx, dz, T) {
  const role = e.D.role; if (!role) return null;
  const spd0 = e.D.speed * (e.speedMul || 1);
  if (role === 'sniper') return sniper(G, e, dt, dist, dx, dz, T, spd0);
  if (role === 'support') return support(G, e, dt, dist, dx, dz, T, spd0);
  if (role === 'ew') return ew(G, e, dt, dist, dx, dz, T, spd0);
  if (role === 'capital') return capital(G, e, dt, dist, dx, dz, T, spd0);
  if (role === 'freighter') return freighter(G, e, dt, dist, dx, dz, T, spd0);
  return null;
}
// Snipers hold long range, paint the target with a visible targeting laser, then fire one hypervelocity slug.
function sniper(G, e, dt, dist, dx, dz, T, spd) {
  const ux = dx / dist, uz = dz / dist; let tx = e.x, tz = e.z;
  e.strafe ??= Math.random() < 0.5 ? 1 : -1; if ((e.t | 0) % 7 === 0 && Math.random() < dt) e.strafe *= -1;
  const want = e.D.range * 0.85;
  if (dist < want - 8) { tx = e.x - ux * 20; tz = e.z - uz * 20; } else if (dist > e.D.range - 2) { tx = T.x - ux * want; tz = T.z - uz * want; } else { tx = e.x - uz * 10 * e.strafe; tz = e.z + ux * 10 * e.strafe; spd *= 0.4; }
  if (e.aimT > 0) {
    e.aimT -= dt; spd *= 0.15;
    if (e.aimT > 0.25) { e.aimUx = ux; e.aimUz = uz; } // track until the last moment, then lock
    if (e.tele) { e.tele.x = e.x; e.tele.z = e.z; e.tele.ang = Math.atan2(e.aimUx, e.aimUz); }
    if (e.aimT <= 0) {
      G.curShooter = e; G.enemyShot(e.x + e.aimUx * 2, e.z + e.aimUz * 2, e.aimUx, e.aimUz, 85, e.D.dmg * e.dmgMul, [3.6, 0.6, 2.4], { life: 0.9, len: 3.4, w: 1.0 });
      G.fx.burst(e.x + e.aimUx * 2, 0.6, e.z + e.aimUz * 2, 8, 10, 0.3, 0.5, 0.1, [3.6, 1.2, 2.6], 3); G.audio.enemyShoot('gunship', e.x, e.z); e.cd = 1 / e.D.fireRate * rand(0.9, 1.2); e.tele = null;
    }
  } else if (e.cd <= 0 && dist < e.D.range && !G.dead && e.stunT <= 0 && !e.cloaked) {
    e.aimT = 1.15; e.aimUx = ux; e.aimUz = uz; e.tele = G.camp.teleLine(e.x, e.z, Math.atan2(ux, uz), e.D.range + 6, 0.5, 1.15, null, [3.4, 0.3, 1.6]);
  }
  return { tx, tz, spd, wantFire: false, face: true };
}
// Support tenders repair the most damaged ally nearby and hang back behind the fleet.
function support(G, e, dt, dist, dx, dz, T, spd) {
  e.healT = (e.healT || 0) - dt; let tgt = e.healTgt && !e.healTgt.dead && e.healTgt.hp < e.healTgt.maxHp ? e.healTgt : null;
  if (e.healT <= 0) {
    e.healT = 0.8; tgt = null; let best = 0.98;
    for (const o of G.enemies) { if (o === e || o.dead || o.D.inst || o.D.part || o.faction !== e.faction) continue; const d = Math.hypot(o.x - e.x, o.z - e.z); if (d > 30) continue; const f = o.hp / o.maxHp; if (f < best) { best = f; tgt = o; } }
    e.healTgt = tgt;
    if (tgt && Math.hypot(tgt.x - e.x, tgt.z - e.z) < 22 && e.stunT <= 0) {
      const bc = tgt.bc; const ceil = bc ? tgt.maxHp * Math.min(1, bc.def.phases[bc.phase].at) : tgt.maxHp; const amt = tgt.maxHp * (bc ? 0.0025 : 0.07); tgt.hp = Math.min(Math.max(tgt.hp, ceil), tgt.hp + amt); if (tgt.maxShield) tgt.shield = Math.min(tgt.maxShield, tgt.shield + tgt.maxShield * 0.1);
      for (let k = 0; k < 6; k++) { const t = k / 6; G.fx.emit(e.x + (tgt.x - e.x) * t, 0.8, e.z + (tgt.z - e.z) * t, 0, 0.5, 0, 0.45, 0.7, 0.1, 0.4, 3.2, 1.2, 1); }
      if (Math.random() < 0.4) G.ui && G.ui.float(tgt.x, 1.8, tgt.z, '+' + Math.round(amt), '#5dff98');
    }
  }
  const ux = dx / dist, uz = dz / dist; let tx, tz;
  if (tgt) { tx = tgt.x - ux * 9; tz = tgt.z - uz * 9; } else { tx = T.x - ux * 24; tz = T.z - uz * 24; }
  if (dist < 14) { tx = e.x - ux * 15; tz = e.z - uz * 15; spd *= 1.2; }
  return { tx, tz, spd, wantFire: dist < 16 };
}
// Electronic warfare: jams the player's capacitor and radar, briefly locks out an ability, and (Void) re-cloaks allies.
function ew(G, e, dt, dist, dx, dz, T, spd) {
  e.orbit += dt * 0.6; const r = 22; const tx = T.x + Math.cos(e.orbit) * r, tz = T.z + Math.sin(e.orbit) * r;
  if (T === G.player && dist < 34 && e.stunT <= 0 && !G.dead) {
    G.jamT = G.time + 0.5;
    e.lockT = (e.lockT ?? rand(4, 8)) - dt;
    if (e.lockT <= 0) { e.lockT = rand(10, 14); const ids = G.abilities(); if (ids.length) { const id = ids[Math.floor(Math.random() * ids.length)]; G.abil.cd[id] = Math.max(G.abil.cd[id] || 0, G.time + 4); G.toast(`⚠ EW lock: ${ABILITIES[id].name} jammed for 4 s`, 'warn'); G.audio.denied(); } }
    if (Math.random() < 0.5 * G.fx.budget) G.fx.emit(e.x + rand(-2, 2), 0.8, e.z + rand(-2, 2), 0, 0.4, 0, 0.6, 1.4, 0.4, 2.4, 0.6, 3.2, 1);
  }
  if (e.faction === 'void') { e.cloakT = (e.cloakT ?? 8) - dt; if (e.cloakT <= 0) { e.cloakT = 12; for (const o of G.enemies) if (!o.dead && o !== e && !o.D.inst && !o.D.boss && !o.D.part && o.faction === 'void' && Math.hypot(o.x - e.x, o.z - e.z) < 18) { o.cloaked = true; o.group.visible = false; } } }
  return { tx, tz, spd, wantFire: dist < e.D.range };
}
// Capital ships hold at range, launch drones, buff nearby allies' fire rate and hand out flanking orders.
function capital(G, e, dt, dist, dx, dz, T, spd) {
  e.orbit += dt * 0.12; const r = 28; const tx = T.x + Math.cos(e.orbit) * r, tz = T.z + Math.sin(e.orbit) * r;
  e.cmdT = (e.cmdT || 0) - dt;
  if (e.cmdT <= 0) { e.cmdT = 1; let side = 1; for (const o of G.enemies) { if (o.dead || o === e || o.faction !== e.faction || o.D.inst || Math.hypot(o.x - e.x, o.z - e.z) > 45) continue; o.buffT = G.time + 1.5; if (o.type === 'interceptor') { o.flank = side; side = -side; } } }
  e.launchT = (e.launchT ?? 6) - dt;
  if (e.launchT <= 0 && e.stunT <= 0 && dist < 60) { e.launchT = 16; const n = G.enemies.filter((o) => !o.dead && o.mother === e).length; if (n < 4) for (let k = 0; k < 2; k++) { const d = G.spawnEnemy('drone', e.x + rand(-3, 3), e.z + rand(-3, 3), { faction: e.faction, mother: e, battle: e.battle, side: e.side }); d.tgt = e.tgt; } G.rings.spawn(e.x, 0.5, e.z, 8, (FACTIONS[e.faction] || { rgb: [3, 0.5, 0.4] }).rgb, 0.4); }
  return { tx, tz, spd, wantFire: dist < e.D.range };
}
// Supply freighters run their route and try to slip away from attackers.
function freighter(G, e, dt, dist, dx, dz, T, spd) {
  const d = e.dest || { x: e.x, z: e.z }; if (dist < 18) spd *= 1.35;
  return { tx: d.x, tz: d.z, spd, wantFire: false };
}

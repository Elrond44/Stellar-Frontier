// v7: staged destruction for stations, pirate bases and capital ships.
// A dying structure is handed over here instead of vanishing: its systems fail, modules chain-explode and
// shed chunks, the frame buckles and sinks, the reactor overloads (telegraphed blast) and the core breaches.
import { ensureDamage, releaseDamage } from './vfx.js?v=7';

const rand = (a, b) => a + Math.random() * (b - a);
const TAU = Math.PI * 2;
export const WRECK_STAGES = ['systems failure', 'chain explosions', 'structural collapse', 'reactor overload', 'core breach'];

export class Wrecks {
  constructor(g) { this.g = g; this.list = []; this.stats = { started: 0, finished: 0 }; }
  get count() { return this.list.length; }
  add(e, o = {}) {
    const g = this.g; const grp = e.group; const D = ensureDamage(grp);
    const R = Math.max(2, (e.radius || 3) * (e.scale || 1)); const dur = o.dur || (e.type === 'capital' ? 4.2 : 5.2);
    const mods = []; const n = o.modules || (R > 6 ? 7 : 5);
    for (let i = 0; i < n; i++) { const a = i / n * TAU + rand(-0.3, 0.3); mods.push({ x: Math.cos(a) * R * rand(0.35, 0.95), z: Math.sin(a) * R * rand(0.35, 0.95), t: 0.45 + i * (dur * 0.42 / n) + rand(-0.05, 0.05), done: false }); }
    grp.traverse((c) => { if (c.name === 'dome') c.visible = false; });
    const W = { e, grp, D, x: e.x, z: e.z, y0: grp.position.y, R, dur, t: 0, stage: 0, mods, tint: o.tint || [3.2, 0.7, 0.4], vx: (e.vx || 0) * 0.4, vz: (e.vz || 0) * 0.4,
      spin: rand(-0.35, 0.35), tx: rand(-1, 1), tz: rand(-1, 1), yaw: grp.rotation.y, blastR: o.blastR || R * 2.2 + 6, blastDmg: o.blastDmg ?? 0.1, overload: false, onEnd: o.onEnd, scale0: grp.scale.x };
    this.list.push(W); this.stats.started++; g.toast && o.label && g.toast(o.label, 'warn');
    return W;
  }
  update(dt) {
    const g = this.g; if (!this.list.length) return;
    for (let i = this.list.length - 1; i >= 0; i--) {
      const W = this.list[i]; W.t += dt; const t = W.t, k = t / W.dur; const near = g.vfx ? g.vfx.near(W.x, W.z) : 1;
      W.x += W.vx * dt; W.z += W.vz * dt; W.vx *= 1 - dt * 0.4; W.vz *= 1 - dt * 0.4;
      const grp = W.grp; const st = k < 0.1 ? 0 : k < 0.45 ? 1 : k < 0.7 ? 2 : 3; if (st > W.stage) W.stage = st;
      // 0: systems failure: lights flicker out, hull scorches
      W.D.U.uDmg.value = Math.min(1, 0.55 + k * 0.6); W.D.U.uFlick.value = Math.random() < 0.25 + k * 0.5 ? rand(0, 0.25) : Math.max(0, 0.9 - k);
      const c = Math.cos(W.yaw), s = Math.sin(W.yaw);
      // fires and smoke from failing modules
      if (Math.random() < (0.5 + k) * near) { const m = W.mods[(Math.random() * W.mods.length) | 0]; const wx = W.x + c * m.x + s * m.z, wz = W.z - s * m.x + c * m.z;
        g.fx.emit(wx, 0.9, wz, rand(-1, 1), rand(1.5, 4), rand(-1, 1), rand(0.3, 0.7), 0.8 + W.R * 0.08, 0.15, 2.8, 1.0, 0.3, 1.5);
        if (g.smoke && Math.random() < 0.6) g.smoke.emit(wx, 1, wz, rand(-0.5, 0.5), rand(0.8, 1.8), rand(-0.5, 0.5), 2.2, 0.6 + W.R * 0.1, 1.6 + W.R * 0.2, 0.1, 0.09, 0.09, 1, 0.8); }
      if (Math.random() < 0.06 + k * 0.1) { const a = rand(0, TAU); g.arc(W.x + Math.cos(a) * W.R * 0.6, W.z + Math.sin(a) * W.R * 0.6, W.x - Math.cos(a) * W.R * 0.3, W.z - Math.sin(a) * W.R * 0.3); }
      // 1: chain explosions, modules shed chunks
      for (const m of W.mods) if (!m.done && t >= m.t) { m.done = true; const wx = W.x + c * m.x + s * m.z, wz = W.z - s * m.x + c * m.z;
        g.boom(wx, 0.8, wz, rand(1.1, 1.6), W.tint, Math.random() < 0.5, { secondary: 0, metal: false });
        g.metal.spawn(wx, 0.8, wz, 5, (wx - W.x) * 1.2, (wz - W.z) * 1.2, 9, 0.9 + W.R * 0.05, 1); g.debris.spawn(wx, 0.5, wz, 3, 12, 0.9, 0x2a1416);
        g.addShake(0.12, wx, wz); }
      // 2: structural collapse: frame buckles, tilts and sinks
      const ck = Math.max(0, (k - 0.45) / 0.55); W.yaw += W.spin * dt * (0.3 + ck);
      grp.position.set(W.x, W.y0 - ck * ck * W.R * 0.5, W.z); grp.rotation.set(W.tx * ck * 0.35, W.yaw, W.tz * ck * 0.3); grp.scale.setScalar(W.scale0 * (1 - ck * 0.12));
      // 3: reactor overload, telegraphed so the player can clear the blast radius
      if (k >= 0.7 && !W.overload) { W.overload = true; W.stage = 3; const T = g.camp && g.camp.teleCircle ? g.camp.teleCircle(W.x, W.z, W.blastR, W.dur * 0.3, () => {}, [3.6, 2.0, 0.6]) : null; W.tele = T;
        g.audio && g.audio.alarm && g.audio.alarm(); }
      if (W.overload && Math.random() < 0.5 * near) g.shells && g.shells.spawn(W.x, 1.2, W.z, W.R * (0.4 + (k - 0.7) * 2.2), [3.4, 2.2, 1.0], 0.12);
      // 4: core breach
      if (t >= W.dur) { this.breach(W); this.list.splice(i, 1); }
    }
  }
  breach(W) {
    const g = this.g; W.stage = 4;
    g.boom(W.x, 0.6, W.z, Math.min(5, 2.6 + W.R * 0.2), W.tint, true, { secondary: 4, r: W.R });
    g.flashes.spawn(W.x, 3, W.z, 140, 0xffc080, 0.7, 60); g.rings.spawn(W.x, 0.4, W.z, W.blastR * 1.4, [3.4, 2.0, 0.8], 1.0); g.ripple(W.x, W.z, W.blastR * 1.6, 0.02, 0.8);
    g.debris.spawn(W.x, 0.3, W.z, 14, 16, 1.0, 0x2a1416); g.audio && g.audio.explode(true, W.x, W.z, true);
    const p = g.player; const d = Math.hypot(p.x - W.x, p.z - W.z);
    if (!g.dead && d < W.blastR) { const f = 1 - d / W.blastR; if (W.blastDmg > 0) g.hurtPlayer(p.maxHp * W.blastDmg * (0.4 + 0.6 * f), W.x, W.z, { energy: true }); const ux = (p.x - W.x) / (d || 1), uz = (p.z - W.z) / (d || 1); p.vx += ux * 18 * f; p.vz += uz * 18 * f; }
    g.addShake(0.8, W.x, W.z); g.zoomPunch && g.zoomPunch(0.08);
    this.remove(W); this.stats.finished++; W.onEnd && W.onEnd(W);
  }
  remove(W) { const g = this.g; g.scene.remove(W.grp); releaseDamage(W.grp); }
  clear() { for (const W of this.list) this.remove(W); this.list.length = 0; }
}

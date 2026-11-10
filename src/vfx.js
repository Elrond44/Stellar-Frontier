// v6 cinematic VFX: particle budget manager, staged-explosion sequencer, energy shells, hot metal debris,
// impact shields (player + enemy bubbles), health-driven hull damage shader, plasma bolt material.
import * as THREE from 'three';
import { rand, TAU, clamp } from './util.js?v=7';

// ---------------------------------------------------------------- budget manager
// One place decides how much eye candy we can afford: quality tier x particle pool load x frame time.
export class FXManager {
  constructor(game) { this.g = game; this.base = 1; this.ft = 1 / 60; this.load = 0; this.scale = 1; }
  setQuality(q) { this.base = q === 'low' ? 0.45 : q === 'medium' ? 0.8 : 1; }
  frame(realDt) { if (realDt > 0 && realDt < 0.5) this.ft += (realDt - this.ft) * 0.05; }
  update() {
    const g = this.g; const fx = g.fx, sm = g.smoke;
    this.load = Math.max(fx.active / fx.max, sm.active / sm.max);
    const loadK = clamp(1.35 - this.load * 1.1, 0.25, 1); // pools filling up -> emit less
    const ftK = clamp(1.5 - this.ft * 24, 0.5, 1); // below ~48 fps -> emit progressively less (phones)
    this.scale = this.base * loadK * ftK; fx.budget = this.scale; sm.budget = g.quality === 'low' ? 0 : this.scale * (g.quality === 'medium' ? 0.6 : 1);
  }
  // priority by distance from the player: full detail up close, a trickle far away
  near(x, z) { const p = this.g.player; const d = Math.hypot(x - p.x, z - p.z); return d < 40 ? 1 : d > 140 ? 0.15 : 1 - (d - 40) / 100 * 0.85; }
  stats() { const g = this.g; return { particles: g.fx.active, smoke: g.smoke.active, debris: g.metal ? g.metal.active : 0, shells: g.shells ? g.shells.active : 0, seq: g.seq ? g.seq.q.length : 0, budget: +this.scale.toFixed(2), lights: g.flashes.pool.filter((o) => o.life > 0).length };
  }
}

// ---------------------------------------------------------------- sequencer (game-time, pausable; no setTimeout)
export class Sequencer {
  constructor() { this.q = []; this.t = 0; }
  at(delay, fn) { if (this.q.length > 400) return; this.q.push({ t: this.t + delay, fn }); }
  update(dt) { this.t += dt; if (!this.q.length) return; const due = []; this.q = this.q.filter((e) => (e.t <= this.t ? (due.push(e), false) : true)); for (const e of due) e.fn(); }
  clear() { this.q.length = 0; }
}

// ---------------------------------------------------------------- energy shells (expanding fresnel spheres)
const shellVS = `varying vec3 vN; varying vec3 vV; varying vec3 vP; void main(){ vP=position; vN=normalize(normalMatrix*normal); vec4 mv=modelViewMatrix*vec4(position,1.0); vV=normalize(-mv.xyz); gl_Position=projectionMatrix*mv; }`;
const shellFS = `uniform vec3 uCol; uniform float uA; uniform float uT; varying vec3 vN; varying vec3 vV; varying vec3 vP;
  void main(){ float f=1.0-abs(dot(vN,vV)); float rim=pow(f,1.6); float core=pow(1.0-f,3.0)*(1.0-uT)*0.6;
    float n=0.75+0.25*sin(vP.x*9.0+uT*20.0)*sin(vP.z*9.0-uT*14.0);
    float a=(rim*n+core)*uA; gl_FragColor=vec4(uCol*a,a); }`;
export class EnergyShells {
  constructor(scene, n = 10) {
    this.pool = []; this.active = 0; const geo = new THREE.SphereGeometry(1, 20, 12);
    for (let i = 0; i < n; i++) {
      const mat = new THREE.ShaderMaterial({ uniforms: { uCol: { value: new THREE.Color() }, uA: { value: 0 }, uT: { value: 0 } }, vertexShader: shellVS, fragmentShader: shellFS, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
      const m = new THREE.Mesh(geo, mat); m.visible = false; m.renderOrder = 7; m.frustumCulled = false; scene.add(m); this.pool.push({ m, life: 0, max: 1, r0: 0, r1: 1, flat: 1, vx: 0, vz: 0 });
    }
  }
  spawn(x, y, z, r1, col, life = 0.4, o = {}) {
    let s = this.pool.find((p) => p.life <= 0); if (!s) { s = this.pool[0]; for (const p of this.pool) if (p.life < s.life) s = p; }
    s.life = s.max = life; s.r0 = o.r0 ?? r1 * 0.15; s.r1 = r1; s.flat = o.flat ?? 0.55; s.vx = o.vx || 0; s.vz = o.vz || 0; s.a0 = o.a ?? 1.4;
    s.m.position.set(x, y, z); s.m.material.uniforms.uCol.value.setRGB(col[0], col[1], col[2]); s.m.visible = true; return s;
  }
  update(dt) {
    let n = 0;
    for (const s of this.pool) {
      if (s.life <= 0) continue; s.life -= dt; if (s.life <= 0) { s.m.visible = false; continue; } n++;
      const t = 1 - s.life / s.max; const e = 1 - (1 - t) * (1 - t) * (1 - t); const r = s.r0 + (s.r1 - s.r0) * e;
      s.m.position.x += s.vx * dt; s.m.position.z += s.vz * dt; s.m.scale.set(r, r * s.flat, r);
      const u = s.m.material.uniforms; u.uT.value = t; u.uA.value = s.a0 * (1 - t) * (1 - t * 0.3);
    }
    this.active = n;
  }
}

// ---------------------------------------------------------------- hot metal debris (instanced, inherits ship velocity, cools down)
export class MetalDebris {
  constructor(scene, max = 160) {
    this.max = max; this.i = 0; this.active = 0;
    const a = new THREE.BoxGeometry(0.5, 0.12, 0.8); const b = new THREE.TetrahedronGeometry(0.4); // panels + shards
    const mat = new THREE.MeshStandardMaterial({ color: 0x4a4e57, metalness: 0.75, roughness: 0.45 });
    mat.onBeforeCompile = (sh) => { sh.fragmentShader = sh.fragmentShader.replace('#include <color_fragment>', '').replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n#ifdef USE_INSTANCING_COLOR\n totalEmissiveRadiance += vColor;\n#endif'); };
    mat.customProgramCacheKey = () => 'metaldebris1';
    this.meshes = [a, b].map((geo) => { const m = new THREE.InstancedMesh(geo, mat, max / 2); m.frustumCulled = false; m.instanceMatrix.setUsage(THREE.DynamicDrawUsage); m.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(max / 2 * 3), 3); m.instanceColor.setUsage(THREE.DynamicDrawUsage); m.count = 0; scene.add(m); return m; });
    this.d = Array.from({ length: max }, () => ({ life: 0, max: 1, p: new THREE.Vector3(), v: new THREE.Vector3(), r: new THREE.Euler(), w: new THREE.Vector3(), s: 1, heat: 1, smoke: 0 }));
    this.dummy = new THREE.Object3D(); this.mat = mat;
  }
  // inherits the parent's velocity (vx, vz) plus a radial kick
  spawn(x, y, z, n, vx, vz, speed, size, heat = 1) {
    for (let k = 0; k < n; k++) {
      const o = this.d[this.i]; this.i = (this.i + 1) % this.max;
      const a = rand(0, TAU), sp = speed * rand(0.25, 1);
      o.life = o.max = rand(1.4, 3); o.p.set(x + Math.cos(a) * size, y, z + Math.sin(a) * size); o.v.set(vx + Math.cos(a) * sp, rand(-0.2, 0.5) * sp, vz + Math.sin(a) * sp);
      o.r.set(rand(0, 6), rand(0, 6), rand(0, 6)); o.w.set(rand(-7, 7), rand(-7, 7), rand(-7, 7)); o.s = size * rand(0.5, 1.6); o.heat = heat * rand(0.5, 1); o.smoke = Math.random() < 0.4 ? 1 : 0;
    }
  }
  update(dt, smoke, fx) {
    const dm = this.dummy; const half = this.max / 2; let act = 0; const cnt = [0, 0];
    for (let i = 0; i < this.max; i++) {
      const o = this.d[i]; if (o.life <= 0) continue; o.life -= dt; if (o.life <= 0) continue; act++;
      o.v.multiplyScalar(Math.exp(-0.5 * dt)); o.p.addScaledVector(o.v, dt); o.r.x += o.w.x * dt; o.r.y += o.w.y * dt; o.r.z += o.w.z * dt;
      o.heat *= Math.exp(-1.4 * dt);
      if (o.smoke && smoke && smoke.budget > 0 && Math.random() < 0.25 * smoke.budget) smoke.emit(o.p.x, o.p.y, o.p.z, 0, 0.4, 0, 0.9, 0.3 * o.s, 1.2 * o.s, 0.14, 0.13, 0.14, 1.5, 0.6);
      if (o.heat > 0.4 && fx && Math.random() < 0.15 * fx.budget) fx.emit(o.p.x, o.p.y, o.p.z, 0, 0, 0, 0.25, 0.3, 0.05, 3, 1.3, 0.4, 0);
      const m = this.meshes[i < half ? 0 : 1]; const j = cnt[i < half ? 0 : 1]++;
      dm.position.copy(o.p); dm.rotation.copy(o.r); dm.scale.setScalar(o.s * Math.min(1, o.life * 1.5)); dm.updateMatrix(); m.setMatrixAt(j, dm.matrix);
      const h = o.heat; m.instanceColor.setXYZ(j, 3.2 * h, 1.1 * h * h, 0.25 * h * h * h);
    }
    this.meshes.forEach((m, k) => { m.count = cnt[k]; if (cnt[k]) { m.instanceMatrix.needsUpdate = true; m.instanceColor.needsUpdate = true; } });
    this.active = act;
  }
}

// ---------------------------------------------------------------- impact shields
// Invisible until hit: up to 4 simultaneous impact ripples with a hex lattice, dimmer/redder as the shield weakens,
// a shatter-collapse when it breaks, a regeneration sweep when it comes back, and a bright flowing field on Overload.
const hexGLSL = `
float shHash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float hexEdge(vec2 uv, out vec2 id){ const vec2 s = vec2(1.0, 1.7320508); vec4 hC = floor(vec4(uv, uv - vec2(0.5, 1.0)) / s.xyxy) + 0.5;
  vec4 h = vec4(uv - hC.xy * s, uv - (hC.zw + 0.5) * s); bool f = dot(h.xy, h.xy) < dot(h.zw, h.zw); vec2 g = f ? h.xy : h.zw; id = f ? hC.xy : hC.zw + 0.5;
  vec2 a = abs(g); return 0.5 - max(dot(a, s * 0.5), a.x); }`;
export function makeShieldMaterial(col = [0.3, 1.3, 2.4]) {
  return new THREE.ShaderMaterial({
    uniforms: { uImp: { value: [0, 1, 2, 3].map(() => new THREE.Vector4(0, 0, 1, 9)) }, uStr: { value: 1 }, uOver: { value: 0 }, uCollapse: { value: 0 }, uRegen: { value: 0 }, uTime: { value: 0 }, uGain: { value: 1 },
      uCol: { value: new THREE.Color(col[0], col[1], col[2]) }, uWeak: { value: new THREE.Color(2.6, 0.7, 0.35) } },
    vertexShader: `varying vec3 vN; varying vec3 vP; varying vec3 vV; void main(){ vP=normalize(position); vN=normalize(normalMatrix*normal); vec4 mv=modelViewMatrix*vec4(position,1.0); vV=normalize(-mv.xyz); gl_Position=projectionMatrix*mv; }`,
    fragmentShader: `uniform vec4 uImp[4]; uniform float uStr; uniform float uOver; uniform float uCollapse; uniform float uRegen; uniform float uTime; uniform float uGain; uniform vec3 uCol; uniform vec3 uWeak;
      varying vec3 vN; varying vec3 vP; varying vec3 vV; ${hexGLSL}
      void main(){
        float fres = pow(1.0 - abs(dot(vN, vV)), 2.0);
        vec2 uv = vec2(atan(vP.z, vP.x) * 4.2, asin(clamp(vP.y, -1.0, 1.0)) * 4.2);
        vec2 id; float e = hexEdge(uv, id); float edge = 1.0 - smoothstep(0.0, 0.07, e); float cell = shHash(id);
        float a = 0.0;
        for (int i = 0; i < 4; i++) { vec4 I = uImp[i]; if (I.w < 1.0) { float d = acos(clamp(dot(vP, normalize(I.xyz)), -1.0, 1.0)); float age = I.w;
          float wave = exp(-pow((d - age * 1.9) * 6.0, 2.0)) * (1.0 - age); float spot = exp(-d * d * 9.0) * (1.0 - age) * (1.0 - age);
          a += wave * (0.35 + 0.9 * edge) + spot * (0.45 + 0.9 * edge) + fres * 0.12 * (1.0 - age); } }
        a *= 0.4 + 0.6 * uStr;
        vec3 col = mix(uWeak, uCol, clamp(uStr * 1.3, 0.0, 1.0));
        if (uOver > 0.0) { vec2 id2; float e2 = hexEdge(uv + vec2(uTime * 2.6, uTime * 0.9), id2); float ed2 = 1.0 - smoothstep(0.0, 0.08, e2);
          a += uOver * (0.12 + fres * 0.55 + ed2 * (0.25 + 0.25 * sin(uTime * 10.0 + shHash(id2) * 6.28))); col = mix(col, vec3(0.9, 2.2, 3.6), uOver * 0.6); }
        if (uCollapse > 0.0) { float c = uCollapse; a += c * (edge * step(cell, c) * 1.6 + fres * 0.9); col = mix(col, vec3(3.0, 3.0, 3.4), c * 0.5); }
        if (uRegen > 0.0 && uRegen < 1.0) { float band = exp(-pow((vP.z * 0.5 + 0.5 - (1.0 - uRegen)) * 7.0, 2.0)); a += band * (0.15 + 0.7 * edge) * (1.0 - uRegen * 0.5); }
        a = min(a, 1.4) * uGain; gl_FragColor = vec4(col * a, a); }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
  });
}
export class ShieldFX { // drives one shield material
  constructor(mat) { this.mat = mat; this.slot = 0; this.regenT = 0; this.collapseT = 0; this.prev = 1; }
  hit(x, y, z, k = 1) { const v = this.mat.uniforms.uImp.value[this.slot++ % 4]; const l = Math.hypot(x, y, z) || 1; v.set(x / l, y / l, z / l, Math.max(0, 0.15 - k * 0.15)); }
  collapse() { this.collapseT = 1; for (const v of this.mat.uniforms.uImp.value) v.w = 9; }
  regen() { this.regenT = 0.001; }
  active() { const u = this.mat.uniforms; return u.uOver.value > 0.01 || this.collapseT > 0 || (this.regenT > 0 && this.regenT < 1) || u.uImp.value.some((v) => v.w < 1); }
  update(dt, frac, over, time) {
    const u = this.mat.uniforms; for (const v of u.uImp.value) if (v.w < 1) v.w += dt * 1.5;
    u.uStr.value = frac; u.uTime.value = time; u.uOver.value += ((over ? 1 : 0) - u.uOver.value) * Math.min(1, dt * 6);
    if (this.collapseT > 0) this.collapseT = Math.max(0, this.collapseT - dt * 1.4); u.uCollapse.value = this.collapseT;
    if (this.regenT > 0 && this.regenT < 1) this.regenT = Math.min(1, this.regenT + dt * 1.2); u.uRegen.value = this.regenT;
    this.prev = frac;
  }
}
// pooled shield bubbles for enemy ships (shown only around a recent impact)
export class ShieldBubbles {
  constructor(scene, n = 6) {
    this.list = []; const geo = new THREE.SphereGeometry(1, 24, 12);
    for (let i = 0; i < n; i++) { const mat = makeShieldMaterial([2.2, 0.8, 0.5]); mat.uniforms.uGain.value = 0.35; const m = new THREE.Mesh(geo, mat); m.visible = false; m.renderOrder = 6; scene.add(m); this.list.push({ m, fx: new ShieldFX(mat), e: null, t: 0 }); }
  }
  get(e) { let b = this.list.find((o) => o.e === e); if (b) return b; b = this.list.find((o) => !o.e) || this.list.reduce((a, o) => (o.t < a.t ? o : a)); b.e = e; b.fx.collapseT = 0; for (const v of b.fx.mat.uniforms.uImp.value) v.w = 9; return b; }
  hit(e, wx, wz, col) { const b = this.get(e); b.t = 1.2; if (col) b.fx.mat.uniforms.uCol.value.setRGB(col[0], col[1], col[2]); b.fx.hit(wx - e.x, 0.3 * e.radius, wz - e.z, 1); }
  collapse(e) { const b = this.get(e); b.t = 1.2; b.fx.collapse(); }
  update(dt, time) {
    for (const b of this.list) {
      if (!b.e) continue; const e = b.e; b.t -= dt;
      if (e.dead || b.t <= 0 || !e.group.visible) { b.e = null; b.m.visible = false; continue; }
      b.fx.update(dt, e.maxShield ? e.shield / e.maxShield : 0, false, time);
      b.m.visible = b.fx.active(); b.m.position.set(e.x, 0.5, e.z); const r = e.radius * 1.25 * (e.scale || 1); b.m.scale.set(r, r * 0.6, r);
    }
  }
}

// ---------------------------------------------------------------- health-driven hull damage
// Injected into the standard (PBR) hull materials: scorch blooms spread with damage, plating loses its sheen,
// glowing cracks open past ~35% damage, and emissives (windows / nav lights) flicker as systems fail.
export const DMG_TIME = { value: 0 };
const STATIC_U = { uDmg: { value: 0 }, uFlick: { value: 1 } };
const dmgGLSL = `uniform float uDmg; uniform float uFlick; uniform float uDTime; varying vec3 vDmgP;
float dmgHash(vec3 p){ p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float dmgNoise1(vec3 x){ vec3 i = floor(x); vec3 f = fract(x); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(dmgHash(i), dmgHash(i + vec3(1,0,0)), f.x), mix(dmgHash(i + vec3(0,1,0)), dmgHash(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(dmgHash(i + vec3(0,0,1)), dmgHash(i + vec3(1,0,1)), f.x), mix(dmgHash(i + vec3(0,1,1)), dmgHash(i + vec3(1,1,1)), f.x), f.y), f.z); }
float dmgNoise(vec3 p){ return dmgNoise1(p) * 0.65 + dmgNoise1(p * 2.3 + 3.1) * 0.35; }
`;
function patchDamage(mat, U) {
  mat.userData.dmgU = U;
  mat.onBeforeCompile = (sh) => {
    const u = mat.userData.dmgU; sh.uniforms.uDmg = u.uDmg; sh.uniforms.uFlick = u.uFlick; sh.uniforms.uDTime = DMG_TIME;
    sh.vertexShader = 'varying vec3 vDmgP;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nvDmgP = position;');
    sh.fragmentShader = dmgGLSL + sh.fragmentShader
      .replace('#include <map_fragment>', '#include <map_fragment>\nfloat dmgN = dmgNoise(vDmgP * 1.4); float dmgS = uDmg > 0.001 ? smoothstep(1.05 - uDmg * 0.85, 1.22 - uDmg * 0.85, dmgN) : 0.0; diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.025, 0.02, 0.018), 0.88 * dmgS);')
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = mix(roughnessFactor, 1.0, dmgS);')
      .replace('#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>\nmetalnessFactor *= 1.0 - 0.6 * dmgS;')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance *= uFlick * (1.0 - 0.92 * dmgS);\nif (uDmg > 0.3) { float cr = dmgNoise1(vDmgP * 2.6 + 7.0); float mask = smoothstep(0.58, 0.72, dmgNoise1(vDmgP * 0.8 + 13.0)) * dmgS; float crack = smoothstep(0.022, 0.0, abs(cr - 0.5)) * mask; totalEmissiveRadiance += vec3(3.2, 1.0, 0.25) * crack * (uDmg - 0.2) * 1.3 * (0.7 + 0.3 * sin(uDTime * 9.0 + cr * 30.0)); }');
  };
  mat.customProgramCacheKey = () => 'sfdmg6';
  mat.needsUpdate = true;
}
const isHull = (m) => m && m.isMeshStandardMaterial && !m.userData.noDamage && !m.transparent && (!Object.prototype.hasOwnProperty.call(m, 'onBeforeCompile') || !!m.userData.dmgU); // never clobber another shader patch (rocks)
// base pass: every shared hull material gets the (inactive) patch once, so damaged clones reuse the same GPU program
export function prepareDamage(obj) {
  obj.traverse((o) => { if (!o.isMesh || o.isInstancedMesh) return; const ms = Array.isArray(o.material) ? o.material : [o.material]; for (const m of ms) if (isHull(m) && !m.userData.dmgU) patchDamage(m, STATIC_U); });
}
// per-ship clones (made lazily, first time the ship is hurt) with their own uniforms
export function ensureDamage(obj) {
  const ud = obj.userData; if (ud.dmg) return ud.dmg;
  const U = { uDmg: { value: 0 }, uFlick: { value: 1 } }; const clones = []; const map = new Map();
  obj.traverse((o) => {
    if (!o.isMesh || o.isInstancedMesh) return;
    const swap = (m) => { if (!isHull(m)) return m; let c = map.get(m); if (!c) { c = m.clone(); patchDamage(c, U); c.userData.dmgClone = true; map.set(m, c); clones.push(c); } return c; };
    o.material = Array.isArray(o.material) ? o.material.map(swap) : swap(o.material);
  });
  ud.dmg = { U, clones }; DMG_STATS.live += clones.length; return ud.dmg;
}
export function releaseDamage(obj) { const d = obj && obj.userData.dmg; if (!d) return; for (const c of d.clones) c.dispose(); DMG_STATS.live -= d.clones.length; obj.userData.dmg = null; }
export const DMG_STATS = { live: 0 };

// ---------------------------------------------------------------- plasma bolt material (instanced, turbulent)
export function plasmaMaterial(timeU) {
  return new THREE.ShaderMaterial({
    uniforms: { uTime: timeU },
    vertexShader: `uniform float uTime; varying vec3 vC; varying float vF;
      void main(){ float s = float(gl_InstanceID) * 1.731; vec3 p = position;
        float w = sin(p.x * 5.0 + uTime * 23.0 + s) * sin(p.y * 6.0 - uTime * 17.0 + s * 2.0) * sin(p.z * 4.0 + uTime * 29.0 + s * 0.5); p *= 1.0 + 0.32 * w;
        #ifdef USE_INSTANCING_COLOR
        vC = instanceColor;
        #else
        vC = vec3(2.0, 0.8, 3.0);
        #endif
        vec4 mv = modelViewMatrix * instanceMatrix * vec4(p, 1.0); vec3 n = normalize(normalMatrix * mat3(instanceMatrix) * normal); vF = abs(dot(n, normalize(-mv.xyz))); gl_Position = projectionMatrix * mv; }`,
    fragmentShader: `varying vec3 vC; varying float vF; void main(){ float core = pow(vF, 2.2); float a = 0.3 + 0.7 * core; gl_FragColor = vec4(vC * (0.45 + 1.5 * core) * a + vec3(core * core * 0.8), a); }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  });
}

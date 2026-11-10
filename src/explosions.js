// v9: Cinematic Explosion & Destruction System 2.0
// ExplosionManager drives six physically-staged phases for every destruction event:
//   1 structural failure (sparks, arcs, venting gas)  2 localized flash  3 plasma expansion (noise shader + temperature ramp)
//   4 fragmentation (momentum inheritance + hit-side impulse)  5 staggered secondary detonations at real hull positions
//   6 dissipation (fast, no lingering smoke — it's vacuum)
// Profiles are sized from the v8 hull dimensions; capital ships keep their hull visible while it breaks apart and
// leave persistent (capped) drifting wreckage. Everything is pooled: one instanced plasma mesh, one instanced debris
// mesh, one line-segment arc buffer and the shared point-light pool — no per-explosion scene objects or materials.
import * as THREE from 'three';
import { ensureDamage, releaseDamage } from './vfx.js?v=9';

const rand = (a, b) => a + Math.random() * (b - a);
const TAU = Math.PI * 2;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

// ---------------------------------------------------------------- profiles
// dur: total sequence length (s); size: blast scale (old boom() units); sec: secondary detonations; frags/slabs: debris;
// keep: hull stays visible while it fails (fraction of dur until break-up); shake/light: camera impulse and light energy
export const PROFILES = {
  fighter:     { name: 'fighter',     dur: [0.6, 1.2], size: 1.0, sec: 0,  frags: 9,  slabs: 0,  keep: 0,    shake: 0.16, light: 1.0, fail: 1 },
  medium:      { name: 'medium',      dur: [1.2, 2.5], size: 1.7, sec: 2,  frags: 16, slabs: 2,  keep: 0.55, shake: 0.3,  light: 1.6, fail: 2 },
  frigate:     { name: 'frigate',     dur: [2.5, 5.0], size: 2.5, sec: 4,  frags: 22, slabs: 4,  keep: 0.7,  shake: 0.45, light: 2.2, fail: 3 },
  cruiser:     { name: 'cruiser',     dur: [4.0, 6.5], size: 3.3, sec: 6,  frags: 28, slabs: 6,  keep: 0.75, shake: 0.6,  light: 2.8, fail: 4 },
  battleship:  { name: 'battleship',  dur: [6.0, 8.0], size: 4.2, sec: 8,  frags: 34, slabs: 8,  keep: 0.78, shake: 0.75, light: 3.4, fail: 5 },
  dreadnought: { name: 'dreadnought', dur: [11, 13],   size: 5.2, sec: 18, frags: 40, slabs: 10, keep: 0.72, shake: 1.0,  light: 4.0, fail: 6, steps: true },
  module:      { name: 'module',      dur: [0.8, 1.4], size: 1.4, sec: 1,  frags: 10, slabs: 1,  keep: 0,    shake: 0.2,  light: 1.4, fail: 1 },
};
export const DREAD_STEPS = ['shields collapse', 'weapons fail', 'hull sections detonate', 'components separate', 'reactor destabilises', 'central discharge', 'hull breaks up', 'debris drifts'];
export const STATION_STEPS = DREAD_STEPS;
// quality budgets (pools are allocated at the High size once; lower presets just use less of them)
export const XBUDGET = {
  low:    { plasma: 40,  frags: 90,  slabs: 14, arcs: 8,  seqs: 4,  sec: 0.5, spark: 0.45 },
  medium: { plasma: 90,  frags: 180, slabs: 28, arcs: 16, seqs: 8,  sec: 0.8, spark: 0.8 },
  high:   { plasma: 140, frags: 280, slabs: 44, arcs: 24, seqs: 12, sec: 1,   spark: 1 },
};
const POOL = XBUDGET.high;

// hull length in game units (1 u = 5 m) -> profile
export function classify(e) {
  const len = e.hullLen || (e.radius || 1) * 2 * (e.scale || 1);
  if (e.D && e.D.inst) return PROFILES.module;
  if (e.type === 'flagship') return len >= 100 ? PROFILES.dreadnought : PROFILES.battleship;
  if (e.type === 'boss') return len >= 100 ? PROFILES.dreadnought : len >= 30 ? PROFILES.battleship : PROFILES.cruiser;
  if (e.D && e.D.part) return PROFILES.module;
  if (len >= 110) return PROFILES.dreadnought;
  if (len >= 60) return PROFILES.battleship;
  if (len >= 30) return PROFILES.cruiser;
  if (len >= 15) return PROFILES.frigate;
  if (len >= 7.5 || e.type === 'gunship' || e.type === 'capital' || e.type === 'commander' || e.type === 'freighter') return PROFILES.medium;
  return PROFILES.fighter;
}

// ---------------------------------------------------------------- 3: plasma expansion (instanced noise billboards)
const PLASMA_VS = `
attribute vec4 aP; attribute vec3 aC;
varying vec2 vUv; varying vec4 vP; varying vec3 vC;
void main() {
  vUv = uv; vP = aP; vC = aC;
  vec3 c = (instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz; float s = length(instanceMatrix[0].xyz);
  vec4 mv = modelViewMatrix * vec4(c, 1.0); float r = aP.y * 6.2831;
  vec2 q = mat2(cos(r), -sin(r), sin(r), cos(r)) * position.xy; mv.xy += q * s;
  gl_Position = projectionMatrix * mv;
}`;
const PLASMA_FS = `
uniform float uGain;
varying vec2 vUv; varying vec4 vP; varying vec3 vC;
float h(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float n2(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(h(i), h(i + vec2(1.0, 0.0)), f.x), mix(h(i + vec2(0.0, 1.0)), h(i + 1.0), f.x), f.y); }
float fbm(vec2 p) { float v = 0.0, a = 0.5; for (int i = 0; i < 4; i++) { v += a * n2(p); p = p * 2.03 + 17.1; a *= 0.5; } return v; }
// blackbody-ish temperature ramp: white-blue core -> yellow -> orange -> deep red rim
vec3 ramp(float T) {
  vec3 c = mix(vec3(0.16, 0.02, 0.01), vec3(0.85, 0.14, 0.03), smoothstep(0.0, 0.3, T));
  c = mix(c, vec3(1.0, 0.48, 0.1), smoothstep(0.25, 0.55, T));
  c = mix(c, vec3(1.0, 0.84, 0.5), smoothstep(0.5, 0.8, T));
  return mix(c, vec3(0.92, 0.96, 1.0), smoothstep(0.84, 1.0, T));
}
void main() {
  vec2 p = vUv * 2.0 - 1.0; float r = length(p); if (r > 1.0) discard;
  float age = vP.x, sd = vP.y * 31.0;
  float n = fbm(p * 2.4 + vec2(sd, sd * 0.7) + vec2(0.0, -age * 2.0) + p * age * 1.6);
  float rim = 0.5 + 0.45 * n;
  float body = 1.0 - smoothstep(rim * 0.55, rim, r);
  float hollow = mix(1.0, smoothstep(0.0, 0.75, r + n * 0.35), smoothstep(0.3, 1.0, age) * 0.75); // core cools first, shell thins
  float T = clamp(vP.z * (1.0 - age * 0.6) * (1.25 - r * 0.85) + (n - 0.5) * 0.4, 0.0, 1.0);
  vec3 col = ramp(T) * mix(vec3(1.0), vC, 0.3) * (0.8 + 2.4 * T * T) * (0.6 + 0.55 * n);
  float a = body * hollow * pow(1.0 - age, 0.9) * vP.w * uGain;
  gl_FragColor = vec4(min(col, vec3(2.6)) * a, a * 0.45); // premultiplied: partly occludes (soft internal shadow), mostly adds
}`;
class PlasmaSystem {
  constructor(scene) {
    const n = POOL.plasma; const geo = new THREE.PlaneGeometry(1, 1);
    this.aP = new THREE.InstancedBufferAttribute(new Float32Array(n * 4), 4); this.aC = new THREE.InstancedBufferAttribute(new Float32Array(n * 3), 3);
    this.aP.setUsage(THREE.DynamicDrawUsage); this.aC.setUsage(THREE.DynamicDrawUsage); geo.setAttribute('aP', this.aP); geo.setAttribute('aC', this.aC);
    this.U = { uGain: { value: 1 } };
    this.mat = new THREE.ShaderMaterial({ uniforms: this.U, vertexShader: PLASMA_VS, fragmentShader: PLASMA_FS, transparent: true, depthWrite: false,
      blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor, blendEquation: THREE.AddEquation });
    this.mesh = new THREE.InstancedMesh(geo, this.mat, n); this.mesh.frustumCulled = false; this.mesh.count = 0; this.mesh.renderOrder = 5; this.mesh.name = 'xplasma';
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); scene.add(this.mesh);
    this.list = []; this.free = []; for (let i = 0; i < n; i++) this.free.push({ x: 0, y: 0, z: 0, vx: 0, vz: 0, s0: 1, s1: 2, a: 0, life: 1, seed: 0, heat: 1, gain: 1, c: [1, 1, 1] });
    this.m = new THREE.Matrix4(); this.cap = n; this.peak = 0;
  }
  get active() { return this.list.length; }
  // heat 0..1 (1 = white-hot), gain: brightness multiplier before the global exposure clamp
  spawn(x, y, z, s0, s1, life, heat = 1, gain = 1, tint = null, vx = 0, vz = 0) {
    if (this.list.length >= this.cap) { // steal the oldest small one
      let v = -1, best = -1; for (let i = 0; i < this.list.length; i++) { const o = this.list[i]; const sc = o.a - o.s1 * 0.01; if (sc > best) { best = sc; v = i; } }
      if (v < 0) return null; this.free.push(this.list.splice(v, 1)[0]);
    }
    const o = this.free.pop(); o.x = x; o.y = y; o.z = z; o.vx = vx; o.vz = vz; o.s0 = s0; o.s1 = s1; o.a = 0; o.life = life; o.seed = Math.random(); o.heat = heat; o.gain = gain;
    if (tint) { const m = Math.max(tint[0], tint[1], tint[2], 0.01); o.c[0] = tint[0] / m; o.c[1] = tint[1] / m; o.c[2] = tint[2] / m; } else { o.c[0] = 1; o.c[1] = 0.6; o.c[2] = 0.3; }
    this.list.push(o); if (this.list.length > this.peak) this.peak = this.list.length; return o;
  }
  update(dt, px, pz) {
    const L = this.list; let w = 0; let load = 0;
    for (let i = 0; i < L.length; i++) { const o = L[i]; o.a += dt / o.life; if (o.a >= 1) { this.free.push(o); continue; } L[w++] = o; o.x += o.vx * dt; o.z += o.vz * dt; o.vx *= 1 - dt * 0.6; o.vz *= 1 - dt * 0.6; load += o.gain * (1 - o.a) * Math.min(1, o.s1 / 10); }
    L.length = w; this.load = load;
    // exposure clamp: overlapping blasts share a brightness budget instead of stacking into white
    this.U.uGain.value = 1 / (1 + Math.max(0, load - 1.2) * 0.35);
    const P = this.aP.array, C = this.aC.array, m = this.m;
    for (let i = 0; i < w; i++) { const o = L[i]; const k = 1 - Math.pow(1 - o.a, 2.6); const s = o.s0 + (o.s1 - o.s0) * k;
      m.makeScale(s, s, s); m.setPosition(o.x, o.y, o.z); this.mesh.setMatrixAt(i, m);
      const dp = Math.hypot(o.x - px, o.z - pz); const pv = dp < s * 0.5 + 4 ? 0.55 : 1; // keep the player's ship readable through nearby blasts
      P[i * 4] = o.a; P[i * 4 + 1] = o.seed; P[i * 4 + 2] = o.heat; P[i * 4 + 3] = o.gain * pv; C[i * 3] = o.c[0]; C[i * 3 + 1] = o.c[1]; C[i * 3 + 2] = o.c[2]; }
    this.mesh.count = w; if (w) { this.mesh.instanceMatrix.needsUpdate = true; this.aP.needsUpdate = true; this.aC.needsUpdate = true; }
  }
  clear() { for (const o of this.list) this.free.push(o); this.list.length = 0; this.mesh.count = 0; }
}

// ---------------------------------------------------------------- 1: electrical arcs (pooled jagged line segments)
const ARC_SEG = 6;
class ArcSystem {
  constructor(scene) {
    const n = POOL.arcs; this.cap = n; const V = n * ARC_SEG * 2;
    const geo = new THREE.BufferGeometry(); this.pos = new Float32Array(V * 3); this.col = new Float32Array(V * 3);
    this.pA = new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage); this.cA = new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('position', this.pA); geo.setAttribute('color', this.cA); geo.setDrawRange(0, 0);
    this.mat = new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
    this.mesh = new THREE.LineSegments(geo, this.mat); this.mesh.frustumCulled = false; this.mesh.renderOrder = 6; this.mesh.name = 'xarcs'; scene.add(this.mesh);
    this.list = []; this.free = []; for (let i = 0; i < n; i++) this.free.push({ a: [0, 0, 0], b: [0, 0, 0], life: 0, max: 1, c: [1, 1, 1], j: 1 });
  }
  get active() { return this.list.length; }
  spawn(ax, ay, az, bx, by, bz, life = 0.25, c = [1.4, 2.4, 4], jit = 0.8) {
    if (this.list.length >= this.cap) this.free.push(this.list.shift());
    const o = this.free.pop(); o.a[0] = ax; o.a[1] = ay; o.a[2] = az; o.b[0] = bx; o.b[1] = by; o.b[2] = bz; o.life = o.max = life; o.c = c; o.j = jit; this.list.push(o); return o;
  }
  update(dt) {
    const L = this.list; let w = 0; for (const o of L) { o.life -= dt; if (o.life > 0) L[w++] = o; else this.free.push(o); } L.length = w;
    const P = this.pos, C = this.col; let v = 0;
    for (const o of L) { const f = o.life / o.max; const fl = Math.random() < 0.25 ? 0.3 : 1; // flicker
      let px = o.a[0], py = o.a[1], pz = o.a[2];
      for (let s = 1; s <= ARC_SEG; s++) { const t = s / ARC_SEG; const j = s === ARC_SEG ? 0 : o.j;
        const nx = o.a[0] + (o.b[0] - o.a[0]) * t + rand(-j, j), ny = o.a[1] + (o.b[1] - o.a[1]) * t + rand(-j, j) * 0.4, nz = o.a[2] + (o.b[2] - o.a[2]) * t + rand(-j, j);
        P[v * 3] = px; P[v * 3 + 1] = py; P[v * 3 + 2] = pz; P[v * 3 + 3] = nx; P[v * 3 + 4] = ny; P[v * 3 + 5] = nz;
        for (let q = 0; q < 2; q++) { C[(v + q) * 3] = o.c[0] * f * fl; C[(v + q) * 3 + 1] = o.c[1] * f * fl; C[(v + q) * 3 + 2] = o.c[2] * f * fl; }
        v += 2; px = nx; py = ny; pz = nz; } }
    this.mesh.geometry.setDrawRange(0, v); if (v) { this.pA.needsUpdate = true; this.cA.needsUpdate = true; }
  }
  clear() { for (const o of this.list) this.free.push(o); this.list.length = 0; this.mesh.geometry.setDrawRange(0, 0); }
}

// ---------------------------------------------------------------- 4: debris physics (instanced fragments + persistent wreck slabs)
// Each fragment: velocity = parent velocity + impulse / sqrt(mass) (biased away from the side that was hit), angular
// velocity ~ 1/mass, hot fragments glow then cool, big fragments bounce off asteroids. Persistent slabs drift for
// 25-40 s and are capped (oldest recycled first).
class DebrisPhysics {
  constructor(scene) {
    const n = POOL.frags + POOL.slabs; this.cap = n;
    const geo = new THREE.IcosahedronGeometry(0.5, 0); // scaled non-uniformly into plates, beams and chunks
    const mat = new THREE.MeshStandardMaterial({ color: 0x5a5f69, metalness: 0.75, roughness: 0.42, flatShading: true });
    mat.onBeforeCompile = (sh) => { sh.fragmentShader = sh.fragmentShader.replace('#include <color_fragment>', '').replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n#ifdef USE_INSTANCING_COLOR\n totalEmissiveRadiance += vColor;\n#endif'); };
    mat.customProgramCacheKey = () => 'xdebris1';
    this.mesh = new THREE.InstancedMesh(geo, mat, n); this.mesh.frustumCulled = false; this.mesh.count = 0; this.mesh.name = 'xdebris';
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); this.mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(n * 3), 3); this.mesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
    scene.add(this.mesh); this.mat = mat;
    this.list = []; this.free = []; for (let i = 0; i < n; i++) this.free.push({ p: new THREE.Vector3(), v: new THREE.Vector3(), q: new THREE.Quaternion(), w: new THREE.Vector3(), s: new THREE.Vector3(), mass: 1, life: 0, max: 1, heat: 0, hc: [3, 1, 0.3], slab: false });
    this.d = new THREE.Object3D(); this.tq = new THREE.Quaternion(); this.e = new THREE.Euler(); this.slabs = 0; this.budget = XBUDGET.medium; this.cand = []; this.bounces = 0; this.ax = new THREE.Vector3();
  }
  get active() { return this.list.length; }
  // kind: 'chip' | 'plate' | 'beam' | 'slab'
  spawn(x, y, z, vx, vz, ix, iz, sp, size, kind = 'chip', heat = 1, life = 0) {
    const slab = kind === 'slab'; const B = this.budget;
    if (slab) { if (this.slabs >= B.slabs) { const i = this.list.findIndex((o) => o.slab); if (i >= 0) { this.free.push(this.list.splice(i, 1)[0]); this.slabs--; } } }
    else if (this.list.length - this.slabs >= B.frags) { const i = this.list.findIndex((o) => !o.slab); if (i >= 0) this.free.push(this.list.splice(i, 1)[0]); else return null; }
    if (!this.free.length) return null;
    const o = this.free.pop(); o.slab = slab; if (slab) this.slabs++;
    const a = rand(0, TAU); const ux = Math.cos(a), uz = Math.sin(a);
    const S = kind === 'plate' ? [rand(1, 1.6), rand(0.15, 0.3), rand(0.8, 1.4)] : kind === 'beam' ? [rand(0.25, 0.4), rand(0.25, 0.4), rand(1.6, 2.6)] : slab ? [rand(0.8, 1.2), rand(0.35, 0.55), rand(1.3, 2.0)] : [rand(0.5, 1), rand(0.4, 0.8), rand(0.5, 1)];
    o.s.set(S[0] * size, S[1] * size, S[2] * size); o.mass = Math.max(0.05, o.s.x * o.s.y * o.s.z * 2);
    const im = sp / Math.sqrt(1 + o.mass); // impulse: lighter pieces fly faster
    const bx = ux * 0.55 + ix * 0.9, bz = uz * 0.55 + iz * 0.9; // hit-side bias: debris is blown out the far side
    o.p.set(x, y, z); o.v.set(vx + bx * im, rand(-0.4, 0.8) * im * 0.25, vz + bz * im);
    this.e.set(rand(0, TAU), rand(0, TAU), rand(0, TAU)); o.q.setFromEuler(this.e); const ws = 5 / Math.sqrt(1 + o.mass * 3); o.w.set(rand(-ws, ws), rand(-ws, ws), rand(-ws, ws));
    o.heat = heat; o.max = o.life = life || (slab ? rand(25, 40) : kind === 'chip' ? rand(1.2, 2.6) : rand(2.5, 5)); o.hc = heat > 0.9 ? [3.2, 1.3, 0.35] : [2.6, 0.8, 0.2];
    this.list.push(o); return o;
  }
  update(dt, g) {
    const L = this.list; let w = 0; const d = this.d; const hR = g && g.hashR; const cand = this.cand;
    for (let i = 0; i < L.length; i++) { const o = L[i]; o.life -= dt; if (o.life <= 0) { if (o.slab) this.slabs--; this.free.push(o); continue; } L[w++] = o;
      const drag = o.slab ? 0.04 : 0.22; o.v.multiplyScalar(1 - dt * drag); o.v.y -= o.p.y * dt * 0.6; o.v.y *= 1 - dt * 0.8; // stay near the play plane
      o.p.addScaledVector(o.v, dt); const wl = o.w.length(); if (wl > 0) { this.tq.setFromAxisAngle(this.ax.copy(o.w).divideScalar(wl), wl * dt); o.q.premultiply(this.tq); }
      o.heat = Math.max(0, o.heat - dt * (o.slab ? 0.25 : 0.7));
      if (hR && o.mass > 0.6 && (i + (g.frame || 0)) % 3 === 0) { cand.length = 0; hR.query(o.p.x, o.p.z, 1.5, cand); // big fragments bounce off asteroids
        for (const a of cand) { if (!a.alive) continue; const dx = o.p.x - a.x, dz = o.p.z - a.z; const dd = Math.hypot(dx, dz); const rr = a.r * 0.85 + o.s.z * 0.4;
          if (dd < rr && dd > 0.01) { const nx = dx / dd, nz = dz / dd; const vn = o.v.x * nx + o.v.z * nz; if (vn < 0) { o.v.x -= 1.6 * vn * nx; o.v.z -= 1.6 * vn * nz; o.w.multiplyScalar(-0.7); this.bounces++; } o.p.x = a.x + nx * rr; o.p.z = a.z + nz * rr; } } } }
    L.length = w;
    const col = this.mesh.instanceColor.array;
    for (let i = 0; i < w; i++) { const o = L[i]; const fade = Math.min(1, o.life / (o.slab ? 3 : 0.5)); d.position.copy(o.p); d.quaternion.copy(o.q); d.scale.copy(o.s).multiplyScalar(fade); d.updateMatrix(); this.mesh.setMatrixAt(i, d.matrix);
      const h = o.heat * o.heat; col[i * 3] = o.hc[0] * h; col[i * 3 + 1] = o.hc[1] * h; col[i * 3 + 2] = o.hc[2] * h; }
    this.mesh.count = w; if (w) { this.mesh.instanceMatrix.needsUpdate = true; this.mesh.instanceColor.needsUpdate = true; }
  }
  clear() { for (const o of this.list) this.free.push(o); this.list.length = 0; this.slabs = 0; this.mesh.count = 0; }
}

// ---------------------------------------------------------------- lighting: shared point-light pool with a brightness budget
class ExplosionLighting {
  constructor(g) { this.g = g; this.used = 0; }
  // energy ~ profile.light; distance-attenuated reach; big blasts take priority over small ones
  light(x, y, z, energy, color = 0xff9a4a, life = 0.35, reach = 24) {
    const F = this.g.flashes; if (!F || !F.enabled) return; const near = this.g.vfx.near(x, z); if (near < 0.25 && energy < 2) return;
    let act = 0; for (const o of F.pool) if (o.life > 0) act += o.i0 * (o.life / o.max);
    const k = 1 / (1 + act / 220); // overlapping explosions share the light budget
    this.used++; F.spawn(x, y, z, (22 + 30 * energy) * k, color, life, reach, energy < 1.2, energy);
  }
}

// ---------------------------------------------------------------- the manager
export class ExplosionManager {
  constructor(g, scene) {
    this.g = g; this.plasma = new PlasmaSystem(scene); this.arcs = new ArcSystem(scene); this.debris = new DebrisPhysics(scene); this.lights = new ExplosionLighting(g);
    this.seqs = []; this.q = 'medium'; this.B = XBUDGET.medium; this.stats0 = { started: 0, finished: 0, secondaries: 0, blasts: 0, shieldHits: 0, hullHits: 0, collapses: 0 };
    this.dummyV = { x: 0, z: 0 };
  }
  setQuality(q) { this.q = XBUDGET[q] ? q : 'medium'; this.B = XBUDGET[this.q]; this.debris.budget = this.B; this.plasma.cap = this.B.plasma; this.arcs.cap = this.B.arcs; }
  shake(a, x, z) { this.g.addShake(a, x, z); }
  stats() { return { plasma: this.plasma.active, arcs: this.arcs.active, debris: this.debris.active, slabs: this.debris.slabs, seqs: this.seqs.length, hulls: this.seqs.filter((s) => s.grp && !s.broke).length, gain: +this.plasma.U.uGain.value.toFixed(2), ...this.stats0 }; }

  // ---- generic blast (stages 2,3,4,6): used for secondaries, modules, missiles and anything without a hull
  // size in the same units as the old boom(); o: {vx,vz,tint,ix,iz,frags,heat,light,sound,shake,y,electric}
  blast(x, y, z, size, o = {}) {
    const g = this.g; const near = g.vfx.near(x, z); const vx = o.vx || 0, vz = o.vz || 0; const B = this.B; this.stats0.blasts++;
    const s = size; const heat = o.heat ?? 1; if (this.log) this.log.push({ k: o.kind || 'blast', x, z, s, t: g.time });
    // 2: localized flash (short, white-hot, small) — sized so a fighter never rivals a capital ship
    this.plasma.spawn(x, y + 0.4, z, 0.6 * s, 2.6 * s, 0.12 + 0.03 * s, 1, 1.2, null, vx * 0.5, vz * 0.5);
    // 3: plasma expansion: main lobe + offset lobes drifting with the wreck
    this.plasma.spawn(x, y + 0.3, z, 1.2 * s, 5.2 * s, 0.6 + 0.2 * s, heat * 0.95, 1, o.tint, vx * 0.6, vz * 0.6);
    const lobes = near > 0.4 ? Math.min(4, Math.round(s * 1.2)) : 1;
    for (let k = 0; k < lobes; k++) { const a = rand(0, TAU), d = rand(0.4, 1) * s; this.plasma.spawn(x + Math.cos(a) * d, y + 0.2, z + Math.sin(a) * d, 0.6 * s, rand(2.6, 3.8) * s, rand(0.5, 0.8) + 0.15 * s, heat * rand(0.55, 0.8), 0.8, o.tint, vx * 0.6 + Math.cos(a) * s, vz * 0.6 + Math.sin(a) * s); }
    // hot streaks / sparks (existing pooled particles)
    g.fx.burst(x, y, z, Math.ceil((4 + 4 * s) * B.spark * near), 9 + 5 * s, 0.6, 0.35, 0.05, [3.0, 1.6, 0.5], 0.6, 0.5);
    // 4: fragments
    const nf = o.frags ?? Math.round((3 + 4 * s) * (0.35 + 0.65 * near));
    for (let k = 0; k < nf; k++) this.debris.spawn(x, y, z, vx, vz, o.ix || 0, o.iz || 0, 5 + 3 * s, 0.25 + 0.12 * Math.min(s, 4) * rand(0.6, 1.3), Math.random() < 0.3 ? 'plate' : 'chip', heat);
    if (o.light !== false) this.lights.light(x, y, z, o.light ?? s, 0xff9a4a, 0.25 + 0.08 * s, 14 + 9 * s);
    if (s >= 2.5 && near > 0.3) g.ripple && g.ripple(x, z, 6 * s, 0.005 + 0.0015 * Math.min(4, s), 0.5);
    if (o.ring !== false && s >= 1.2) g.rings.spawn(x, y - 0.2, z, 4.5 * s, o.tint ? o.tint.map((v) => v * 0.35) : [1.5, 0.6, 0.25], 0.4 + 0.05 * s);
    if (o.sound !== false && g.audio && g.audio.blast) g.audio.blast(s, x, z, { electric: o.electric, reactor: o.reactor });
    if (o.shake !== false) this.shake(o.shake ?? 0.12 * Math.min(4, s), x, z);
    // 6: dissipation — a few cooling embers, no smoke
    if (near > 0.5) g.fx.burst(x, y, z, Math.ceil(3 * s * B.spark), 2 * s, 1.4, 0.25, 0.04, [1.6, 0.5, 0.15], 0.8, 0.4);
  }

  // ---- stage 1 building blocks
  failPoint(x, y, z, s, ix = 0, iz = 0) { // sparks, a short arc and a venting gas jet at a failing section
    const g = this.g; const B = this.B;
    g.fx.burst(x, y, z, Math.ceil(5 * s * B.spark), 6 + 3 * s, 0.4, 0.3, 0.04, [3.2, 2.2, 1.0], 1.2, 0.4);
    const a = rand(0, TAU), L = rand(0.8, 1.8) * s; this.arcs.spawn(x, y + 0.3, z, x + Math.cos(a) * L, y + 0.4, z + Math.sin(a) * L, rand(0.12, 0.3), [1.4, 2.4, 4], 0.35 * s);
    const jx = -ix + rand(-0.5, 0.5), jz = -iz + rand(-0.5, 0.5); const jl = Math.hypot(jx, jz) || 1; // gas vents back toward the breach
    for (let k = 0; k < 4; k++) g.fx.emit(x, y + 0.2, z, jx / jl * rand(5, 9) * s, rand(0, 0.6), jz / jl * rand(5, 9) * s, rand(0.25, 0.45), 0.25 * s, 0.9 * s, 0.9, 1.1, 1.3, 2.5, 0.5);
  }

  // ---- hits: shield ripple vs shield collapse vs hull impact
  shieldHit(e, x, z, col) { const g = this.g; this.stats0.shieldHits++; const c = col || [0.6, 1.8, 3.4];
    const ex = e.x, ez = e.z; const dx = x - ex, dz = z - ez; const d = Math.hypot(dx, dz) || 1; const R = Math.max(1.5, (e.bound || e.radius || 2) * (e.scale || 1));
    const hx = ex + dx / d * Math.min(d, R), hz = ez + dz / d * Math.min(d, R); // hex ripple itself is ShieldBubbles; add a flare + skating arcs, never debris
    this.plasma.spawn(hx, 0.8, hz, 0.4, 1.6, 0.16, 0.95, 0.5, c);
    if (this.g.vfx.near(hx, hz) > 0.4) for (let k = 0; k < 2; k++) { const a = Math.atan2(dz, dx) + rand(-0.9, 0.9); this.arcs.spawn(hx, 0.8, hz, ex + Math.cos(a) * R, 0.8, ez + Math.sin(a) * R, rand(0.1, 0.18), [c[0] * 0.8, c[1] * 0.9, c[2]], 0.4); }
  }
  shieldCollapse(e, col) { const g = this.g; this.stats0.collapses++; const c = col || [0.6, 1.8, 3.4]; const R = Math.max(2, (e.bound || e.radius || 2) * (e.scale || 1));
    const n = Math.min(8, 3 + Math.round(R / 4)); for (let k = 0; k < n; k++) { const a = k / n * TAU + rand(-0.3, 0.3); const a2 = a + rand(0.6, 1.4); this.arcs.spawn(e.x + Math.cos(a) * R, 0.8, e.z + Math.sin(a) * R, e.x + Math.cos(a2) * R * 0.9, 0.8, e.z + Math.sin(a2) * R * 0.9, rand(0.25, 0.45), c, 0.6 + R * 0.05); }
    this.plasma.spawn(e.x, 0.8, e.z, R * 0.6, R * 2.2, 0.3, 0.7, 0.45, c); g.flashes.spawn(e.x, 1, e.z, 40, 0x66ccff, 0.3, 18 + R * 2);
    g.audio && g.audio.play && g.audio.play('xArc', { x: e.x, z: e.z, vol: 0.8 });
  }
  // weapon signatures on hull/armour: laser burns, plasma splashes, railgun punches through, missiles blast,
  // ion arcs and disrupts, experimental collapses inward
  hullHit(x, z, ix, iz, cat, dmg = 1, tint) { const g = this.g; this.stats0.hullHits++; const near = g.vfx.near(x, z); if (near < 0.2) return; const s = clamp(0.6 + dmg / 60, 0.6, 1.8);
    const sp = Math.ceil(4 * this.B.spark * s);
    switch (cat) {
      case 'laser': case 'particle': // focused burn: tight white-gold spark spray + molten glow
        this.plasma.spawn(x, 0.7, z, 0.2, 0.9 * s, 0.14, 0.9, 0.6, [3, 1.4, 0.5]); g.fx.burst(x, 0.7, z, sp, 7, 0.3, 0.22, 0.03, [3.4, 2.4, 1.2], 1.5, 0.3); break;
      case 'plasma': // splash of superheated gas, lingers briefly
        this.plasma.spawn(x, 0.7, z, 0.5, 2.0 * s, 0.38, 0.75, 0.75, [3.2, 0.9, 0.3]); g.fx.burst(x, 0.7, z, sp, 5, 0.6, 0.5, 0.1, [3, 1, 0.3], 1.5, 0.6); break;
      case 'railgun': // kinetic: penetration — chunks blown out the far side along the shot
        for (let k = 0; k < Math.ceil(3 * s); k++) this.debris.spawn(x + ix * 0.8, 0.7, z + iz * 0.8, 0, 0, ix * 1.6, iz * 1.6, 9, 0.18, 'chip', 0.9);
        g.fx.burst(x + ix, 0.7, z + iz, sp + 2, 14, 0.25, 0.25, 0.03, [3.2, 2.6, 1.6], 1, 0.2); this.plasma.spawn(x, 0.7, z, 0.2, 0.8, 0.1, 1, 0.6, null); break;
      case 'missile': // concussive blast
        this.blast(x, 0.6, z, 0.75 * s, { ix, iz, frags: 3, sound: false, ring: false, shake: 0.05 }); break;
      case 'ion': // electrical disruption: arcs crawling over the hull, no fire
        for (let k = 0; k < 3; k++) { const a = rand(0, TAU), L = rand(1.2, 2.6); this.arcs.spawn(x, 0.8, z, x + Math.cos(a) * L, 0.8, z + Math.sin(a) * L, rand(0.15, 0.3), [1.2, 2.6, 4.2], 0.5); }
        this.plasma.spawn(x, 0.8, z, 0.3, 1.2, 0.16, 0.95, 0.45, [0.8, 2.2, 4]); break;
      case 'exp': // experimental: implosion — violet flash that pulls inward, then a crackle
        this.plasma.spawn(x, 0.8, z, 1.8 * s, 0.3, 0.3, 0.8, 0.8, [2.2, 0.8, 3.6]); for (let k = 0; k < 6; k++) { const a = rand(0, TAU); g.fx.emit(x + Math.cos(a) * 2, 0.8, z + Math.sin(a) * 2, -Math.cos(a) * 6, 0, -Math.sin(a) * 6, 0.3, 0.3, 0.05, 2.2, 0.8, 3.6, 0); } break;
      default:
        g.fx.burst(x, 0.7, z, sp, 8, 0.35, 0.3, 0.04, [3, 1.8, 0.7], 1.5, 0.3);
    }
    if (cat !== 'ion' && cat !== 'exp' && cat !== 'railgun') for (let k = 0; k < Math.ceil(1.5 * s * near); k++) this.debris.spawn(x, 0.7, z, 0, 0, ix * 0.8, iz * 0.8, 5, 0.12, 'chip', 1, rand(0.5, 1));
  }

  // ---- full destruction sequence
  destroy(e, o = {}) {
    if (!Number.isFinite(e.x) || !Number.isFinite(e.z)) return { P: PROFILES.fighter, grp: null, dur: 0, t: 0, ev: [] };
    const g = this.g; const P = o.profile || classify(e); const B = this.B; this.stats0.started++;
    const near = g.vfx.near(e.x, e.z); const busy = this.seqs.length >= B.seqs;
    const keep = !!(P.keep && e.group && e.group.visible && e.group.parent && !o.noHull && near > 0.08 && !busy);
    const dur = rand(P.dur[0], P.dur[1]) * (busy ? 0.6 : 1);
    const yaw = e.yaw || (e.group ? e.group.rotation.y : 0); const k = e.scale || 1;
    let ix = o.ix, iz = o.iz; if (ix === undefined) { const p = g.player; const dx = e.x - p.x, dz = e.z - p.z; const d = Math.hypot(dx, dz) || 1; ix = dx / d; iz = dz / d; }
    const S = { e, P, t: 0, dur, x: e.x, z: e.z, y: 0.5, vx: Number.isFinite(e.vx) ? e.vx : 0, vz: Number.isFinite(e.vz) ? e.vz : 0, yaw, hx: Math.sin(yaw), hz: Math.cos(yaw), ix, iz, tint: o.tint || [3, 1.2, 0.45],
      grp: keep ? e.group : null, broke: !keep, breakT: keep ? dur * P.keep : 0, ev: [], step: P.steps ? 0 : -1, spin: (ix * Math.cos(yaw) - iz * Math.sin(yaw)) * 0.25 / Math.sqrt(Math.max(1, (e.hullLen || 4) / 10)) + rand(-0.03, 0.03),
      len: e.hullLen || (e.radius || 1) * 2 * k, beam: (e.beam || e.radius || 1) * k, z0: e.segs ? e.segs[0].z * k : -(e.radius || 1) * 0.8, z1: e.segs ? e.segs[e.segs.length - 1].z * k : (e.radius || 1) * 0.8, y0: e.group ? e.group.position.y : 0, shield: (e.shieldMax || e.maxShield || 0) > 0 };
    S.top = 0.8; if (keep) { g.lod && g.lod.release(e.group); S.D = ensureDamage(e.group); const bb = (this._bb || (this._bb = new THREE.Box3())).setFromObject(e.group); if (Number.isFinite(bb.max.y)) S.top = Math.max(0.8, Math.min(bb.max.y, 12) * 0.9 + 0.3); } // effects sit on the deck, not inside it
    const at = (t, fn) => S.ev.push({ t, fn });
    const sz = P.size; const t1 = P === PROFILES.fighter || P === PROFILES.module ? 0.04 : keep ? Math.min(dur * 0.18, 1.6) : dur * 0.08; // end of stage 1
    // 1: structural failure at a few real hull points, hit side first
    const nFail = P.fail; for (let i = 0; i < nFail; i++) at(i * t1 / Math.max(1, nFail), () => { const q = this.hullPt(S, i === 0 ? -0.6 : rand(-1, 1), i === 0 ? 1 : rand(-1, 1)); this.failPoint(q.x, S.top, q.z, Math.min(2.2, 0.6 + sz * 0.3), S.ix, S.iz); });
    if (keep) at(0, () => { const q = this.hullPt(S, -0.5, 0.9); const u = 0.6 + 0.3 * sz; // the killing blow breaches the hull: local flash, hot chips, light
      this.plasma.spawn(q.x, S.top, q.z, u * 0.5, u * 2.4, 0.4, 0.9, 1, S.tint, S.vx, S.vz); this.lights.light(q.x, S.top, q.z, Math.min(2, sz * 0.5), 0xffa060, 0.3, 16 + 4 * sz);
      for (let k = 0; k < 6 + Math.round(sz); k++) this.debris.spawn(q.x, S.top, q.z, S.vx, S.vz, S.ix, S.iz, 6, 0.2 + 0.04 * sz, 'chip', 1); });
    // 2+3+4: primary detonation (for kept hulls: the breach section; the core goes at break-up)
    at(t1, () => { const q = keep ? this.hullPt(S, -0.4, 0.8) : S; this.blast(q.x, S.grp ? S.top : 0.5, q.z, keep ? Math.min(2.2, sz * 0.5) : sz, { vx: S.vx, vz: S.vz, tint: S.tint, ix: S.ix, iz: S.iz, light: P.light * (keep ? 0.6 : 1), shake: P.shake * (keep ? 0.5 : 1), frags: keep ? Math.round(P.frags * 0.3) : P.frags, electric: keep }); });
    // 5: staggered secondaries at real positions along the keel, bow/stern alternating out from the breach
    const nSec = Math.round(P.sec * B.sec * (busy ? 0.5 : 1)); const t5a = t1 + 0.1, t5b = keep ? S.breakT * 0.98 : dur * 0.8;
    for (let i = 0; i < nSec; i++) { const u = (i + rand(0.1, 0.9)) / Math.max(1, nSec); at(t5a + (t5b - t5a) * u, () => { this.stats0.secondaries++; const q = this.hullPt(S, rand(-1, 1), rand(-0.8, 0.8)); if (this.log) this.log.push({ k: 'sec', x: q.x, z: q.z, cx: S.x, cz: S.z, hx: S.hx, hz: S.hz, z0: S.z0, z1: S.z1, beam: S.beam, t: g.time });
      this.blast(q.x, S.grp ? S.top : 0.6, q.z, Math.max(0.7, sz * rand(0.3, 0.48), S.len / 40 * rand(0.8, 1.2)), { vx: S.vx, vz: S.vz, tint: S.tint, ix: q.ox, iz: q.oz, light: P.light * 0.45, shake: 0.05 * Math.min(4, sz), sound: i % 2 === 0, frags: Math.round(4 + sz), ring: false });
      if (S.grp && i % 2 === 1) { const q2 = this.hullPt(S, rand(-1, 1), 1); this.debris.spawn(q2.x, 0.7, q2.z, S.vx, S.vz, q2.ox, q2.oz, 3 + sz, 0.25 + 0.05 * sz, 'plate', 0.8); } }); }
    if (keep) {
      if (P.steps) this.dreadSteps(S, at);
      // break-up: core breach, hull disappears, the ship splits into slabs that keep drifting (persistent wreckage)
      at(S.breakT, () => this.breakUp(S));
    }
    S.ev.sort((a, b) => a.t - b.t); this.seqs.push(S);
    if (!keep) { this.seqStep(S, 0); } // fire t=0 events now so position matches the frame of death
    return S;
  }
  dreadSteps(S, at) { const g = this.g; const D = S.dur; const sz = S.P.size; const set = (i) => () => { S.step = i; (S.steps || (S.steps = [])).push(i); };
    // 0 shields collapse
    at(0, () => { set(0)(); if (S.shield || true) { this.shieldCollapse({ x: S.x, z: S.z, bound: S.len * 0.5, radius: S.len * 0.5 }, [0.6, 1.8, 3.4]); } });
    // 1 weapons fail: pops at the turret mounts / hardpoints
    at(D * 0.1, () => { set(1)(); const tu = S.e.turrets || []; const n = Math.min(8, tu.length || 6); for (let i = 0; i < n; i++) at(S.t + i * 0.12, () => { const q = tu[i] ? this.worldOf(tu[i], S) : this.hullPt(S, rand(-1, 1), rand(-1, 1)); g.fx.burst(q.x, 1, q.z, 6, 6, 0.4, 0.4, 0.05, [3.2, 2, 0.8], 1, 0.3); this.arcs.spawn(q.x, 1, q.z, q.x + rand(-2, 2), 1, q.z + rand(-2, 2), 0.2); }); S.ev.sort((a, b) => a.t - b.t); });
    // 2 hull sections detonate (the secondaries above fall in this window)
    at(D * 0.2, set(2));
    // 3 components separate: bow and stern sections shed big pieces while the hull is still there
    at(D * 0.42, () => { set(3)(); for (let i = 0; i < 4; i++) { const q = this.hullPt(S, i < 2 ? -0.95 : 0.95, rand(-1, 1)); this.debris.spawn(q.x, 0.8, q.z, S.vx, S.vz, q.ox * 0.5 + S.hx * (i < 2 ? -0.6 : 0.6), q.oz * 0.5 + S.hz * (i < 2 ? -0.6 : 0.6), 2.5, 2.2 + sz * 0.3, 'slab', 0.6); }
      this.blast(this.hullPt(S, -0.9, 0).x, 0.6, this.hullPt(S, -0.9, 0).z, sz * 0.4, { vx: S.vx, vz: S.vz, tint: S.tint, sound: true, ring: false }); });
    // 4 reactor destabilises: pulsing blue-white core, arcs, rising hum
    at(D * 0.55, () => { set(4)(); g.audio && g.audio.play && g.audio.play('xReactor', { x: S.x, z: S.z, vol: 1 }); });
    for (let i = 0; i < 6; i++) at(D * (0.55 + i * 0.025), () => { this.plasma.spawn(S.x, S.top + 0.5, S.z, 2 + i, 5 + i * 1.6, 0.45, 0.95, 0.5 + i * 0.08, [1, 1.8, 3.4], S.vx, S.vz); const a = rand(0, TAU); this.arcs.spawn(S.x, 1, S.z, S.x + Math.cos(a) * S.len * 0.3, 1, S.z + Math.sin(a) * S.len * 0.3, 0.3, [1.6, 2.6, 4], 1.2); });
    // 5 central discharge -> 6 hull breaks up (breakUp at keep fraction) -> 7 debris drifts
    at(S.breakT - 0.05, () => { set(5)(); });
    at(S.breakT + 0.6, set(6)); at(S.breakT + 1.8, set(7));
  }
  breakUp(S) {
    const g = this.g; const P = S.P; const sz = P.size; S.broke = true;
    this.blast(S.x, 0.6, S.z, sz, { vx: S.vx, vz: S.vz, tint: P.steps ? [2.4, 2.4, 3.2] : S.tint, ix: S.ix, iz: S.iz, light: P.light, shake: P.shake, frags: P.frags, reactor: sz >= 3 });
    if (P.steps || sz >= 3) { g.rings.spawn(S.x, 0.4, S.z, S.len * 1.1, [3.2, 2.2, 1.4], 1.0); g.flashes.spawn(S.x, 3, S.z, 90 + 20 * sz, 0xffd0a0, 0.6, 40 + S.len * 0.4); g.zoomPunch && g.zoomPunch(0.04 + 0.01 * sz); }
    const n = P.slabs; for (let i = 0; i < n; i++) { const u = n === 1 ? 0 : -1 + 2 * i / (n - 1); const q = this.hullPt(S, u, rand(-0.5, 0.5));
      const sl = Math.max(0.6, Math.min(S.len / n * 0.55, 7)); this.debris.spawn(q.x, 0.7, q.z, S.vx, S.vz, q.ox * 0.6 + S.hx * u * 0.5, q.oz * 0.6 + S.hz * u * 0.5, 1.5 + sz * 0.4, sl, 'slab', 0.7); }
    if (S.grp) { g.scene.remove(S.grp); releaseDamage(S.grp); S.grp = null; }
  }
  // world point on the hull: u along the keel (-1 bow ... +1 stern), w across the beam; ox/oz = outward direction
  hullPt(S, u, w) { const zz = (S.z0 + S.z1) / 2 + (S.z1 - S.z0) / 2 * clamp(u, -1, 1); const xx = w * S.beam * 0.4;
    const x = S.x + S.hx * zz + S.hz * xx, z = S.z + S.hz * zz - S.hx * xx; let ox = x - S.x, oz = z - S.z; const d = Math.hypot(ox, oz); if (d > 0.01) { ox /= d; oz /= d; } else { ox = S.ix; oz = S.iz; } return { x, z, ox, oz }; }
  worldOf(obj, S) { const v = (this._v || (this._v = new THREE.Vector3())); obj.getWorldPosition(v); return { x: v.x, z: v.z, ox: 0, oz: 0 }; }
  seqStep(S, dt) {
    S.t += dt; while (S.ev.length && S.ev[0].t <= S.t) S.ev.shift().fn();
  }
  update(dt) {
    const g = this.g; const p = g.player;
    for (let i = this.seqs.length - 1; i >= 0; i--) { const S = this.seqs[i];
      S.x += S.vx * dt; S.z += S.vz * dt; const dk = S.grp ? 0.12 : 0.5; S.vx *= 1 - dt * dk; S.vz *= 1 - dt * dk; // momentum carries the dying hull along
      if (S.grp) { S.yaw += S.spin * dt; S.hx = Math.sin(S.yaw); S.hz = Math.cos(S.yaw); const f = Math.min(1, S.t / Math.max(0.1, S.breakT));
        S.grp.position.set(S.x, S.y0, S.z); S.grp.rotation.y = S.yaw; S.grp.rotation.z = Math.sin(S.t * 0.7) * 0.04 * f;
        if (S.D) { S.D.U.uDmg.value = Math.min(1, 0.6 + f * 0.5); S.D.U.uFlick.value = Math.random() < 0.2 + f * 0.6 ? rand(0, 0.3) : Math.max(0, 0.9 - f); }
        const nr = g.vfx.near(S.x, S.z);
        if (Math.random() < dt * (2 + S.P.size) * nr) { const q = this.hullPt(S, rand(-1, 1), rand(-1, 1)); this.failPoint(q.x, S.top, q.z, 0.6 + S.P.size * 0.15, q.ox, q.oz); }
        if (Math.random() < dt * (0.8 + S.P.size * 0.7) * nr * (0.4 + f)) { const q = this.hullPt(S, rand(-1, 1), rand(-0.7, 0.7)); const u = 0.5 + 0.25 * S.P.size; // burning breaches along the failing hull
          this.plasma.spawn(q.x, S.top, q.z, u * 0.6, u * rand(2, 3), rand(0.45, 0.7), rand(0.6, 0.8), 0.8, S.tint, S.vx, S.vz); }
        if (S.step === 4 && Math.random() < dt * 7) { const R = S.len * rand(0.05, 0.11); this.plasma.spawn(S.x, S.top + 0.5, S.z, R * 0.5, R, 0.3, 1, 0.6, [1, 1.8, 3.4], S.vx, S.vz); } } // reactor destabilising
      this.seqStep(S, dt);
      if (!S.ev.length && S.t >= S.dur) { if (S.grp) this.breakUp(S); this.seqs.splice(i, 1); this.stats0.finished++; }
    }
    this.plasma.update(dt, p.x, p.z); this.arcs.update(dt); this.debris.update(dt, g);
  }
  clear() { for (const S of this.seqs) if (S.grp) { this.g.scene.remove(S.grp); releaseDamage(S.grp); } this.seqs.length = 0; this.plasma.clear(); this.arcs.clear(); this.debris.clear(); }
}

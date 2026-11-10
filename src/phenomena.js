// v7 galactic phenomena: ion storms, dense nebulae, gravity anomalies, radiation fields and a black hole region.
// Zones are deterministic per galaxy sector. Each has a visible boundary, an approach warning, and limited, consistent
// physics that applies to the player, enemies, projectiles and asteroids alike.
import * as THREE from 'three';
import { mulberry, clamp, rand, TAU } from './util.js?v=7';
import { GSECTORS, installations, LAIRS } from './galaxy.js?v=7';
import { nebulaTexture } from './environment.js?v=7';

export const PHEN = {
  ion:       { name: 'Ion Storm', short: 'ION STORM', icon: '⚡', col: [0.55, 0.7, 3.2], css: '#8fb4ff', warn: 'Lightning strikes (watch the warning circles) · sensors jammed', inside: 'SENSORS JAMMED · LIGHTNING' },
  nebula:    { name: 'Dense Nebula', short: 'DENSE NEBULA', icon: '☁', col: [1.6, 0.6, 2.2], css: '#d38cff', warn: 'Visibility and radar range reduced inside', inside: 'VISIBILITY LOW · RADAR REDUCED' },
  gravity:   { name: 'Gravity Anomaly', short: 'GRAVITY ANOMALY', icon: '◎', col: [1.3, 0.8, 3.0], css: '#b49bff', warn: 'Trajectories bend toward the centre (ships, shots, rocks)', inside: 'TRAJECTORIES BENDING' },
  radiation: { name: 'Radiation Field', short: 'RADIATION', icon: '☢', col: [1.6, 3.0, 0.4], css: '#c6ff4d', warn: 'Gradual hull damage inside, stronger near the core', inside: 'HULL EXPOSURE' },
  blackhole: { name: 'Black Hole', short: 'BLACK HOLE', icon: '●', col: [3.2, 1.6, 0.5], css: '#ffb15c', warn: 'Strong pull toward the event horizon · tidal damage at the core · thrust away to escape', inside: 'GRAVITATIONAL PULL' },
};
export const BH_HORIZON = 7;

// ---------------------------------------------------------------- deterministic layout
let ZONES = null;
export function zones() {
  if (ZONES) return ZONES;
  const out = []; const lairs = Object.values(LAIRS);
  const ok = (x, z, r) => {
    for (const l of lairs) if (Math.hypot(x - l.x, z - l.z) < r + 130) return false;
    if (Math.hypot(x, z) < 250 + r) return false; // keep the home belt clear
    for (const o of out) if (Math.hypot(x - o.x, z - o.z) < r + o.r + 30) return false;
    return true;
  };
  const instOk = (sec, x, z, r) => { for (const s of [sec]) for (const o of installations(s)) if (Math.hypot(o.x - x, o.z - z) < r + 34) return false; return true; };
  const place = (sec, rng, type, r) => {
    for (let t = 0; t < 120; t++) {
      const rr = sec.r0 + r + 15 + rng() * (Math.min(sec.r1, 1000) - sec.r0 - 2 * r - 30); const a = sec.a0 + (sec.a1 - sec.a0) * (0.12 + rng() * 0.76);
      const x = Math.cos(a) * rr, z = Math.sin(a) * rr; if (rr < sec.r0 + r * 0.6) continue;
      if (ok(x, z, r) && (type === 'nebula' || instOk(sec, x, z, type === 'blackhole' ? 60 : r))) { out.push({ id: `${sec.id}-${type}`, type, x: Math.round(x), z: Math.round(z), r, sec: sec.id, seed: rng() * 100 }); return true; }
    }
    return false;
  };
  // the black hole: one region in the outer Maw, away from the faction home sectors and lairs
  const bhSec = GSECTORS.find((s) => s.name === 'Obsidian Spiral') || GSECTORS.find((s) => s.ring === 'M');
  place(bhSec, mulberry(9001), 'blackhole', 140);
  const W = { F: [['nebula', 4], ['ion', 3], ['radiation', 3]], R: [['nebula', 3], ['ion', 3], ['gravity', 2], ['radiation', 3]], M: [['nebula', 2], ['ion', 3], ['gravity', 3], ['radiation', 3]] };
  for (const sec of GSECTORS) {
    if (sec.ring === 'H') continue; const rng = mulberry(sec.id.charCodeAt(0) * 4099 + sec.idx * 211 + 77);
    const n = sec.ring === 'F' ? 1 : sec.ring === 'R' ? (rng() < 0.6 ? 2 : 1) : 2;
    for (let k = 0; k < n; k++) {
      const w = W[sec.ring]; let tot = 0; for (const [, v] of w) tot += v; let x = rng() * tot; let type = w[0][0]; for (const [t, v] of w) { x -= v; if (x <= 0) { type = t; break; } }
      const rmax = (Math.min(sec.r1, 1000) - sec.r0 - 40) / 2; // must fit inside the ring band
      const order = [type, ...w.map(([t]) => t).filter((t) => t !== type)];
      for (const ty of order) { // fall back to smaller sizes, then to another phenomenon, so every ring gets its hazards
        if (out.some((o) => o.sec === sec.id && o.type === ty)) continue;
        const r0 = ty === 'nebula' ? 80 + rng() * 45 : ty === 'ion' ? 64 + rng() * 34 : ty === 'gravity' ? 38 + rng() * 16 : 52 + rng() * 26;
        let okp = false; for (const f of [1, 0.8, 0.65]) { const r = Math.round(Math.min(r0 * f, rmax)); if (r < 30) break; if (place(sec, rng, ty, r)) { okp = true; break; } }
        if (okp) break;
      }
    }
  }
  ZONES = out; return out;
}
export function zonesNear(x, z, R) { return zones().filter((o) => Math.hypot(o.x - x, o.z - z) < R + o.r); }

// ---------------------------------------------------------------- visuals
const DISC_VS = `varying vec2 vL; varying vec2 vW; void main(){ vL = position.xz; vec4 w = modelMatrix*vec4(position,1.0); vW = w.xz; gl_Position = projectionMatrix*viewMatrix*w; }`;
const ZONE_FS = {
  ion: `uniform sampler2D uTex; uniform float uTime; uniform float uFlash; uniform float uSeed; uniform vec3 uCol; uniform float uA; varying vec2 vL; varying vec2 vW;
    void main(){ float r = length(vL); if (r > 1.0) discard; vec2 uv = vW/150.0 + uSeed;
      vec4 a = texture2D(uTex, uv*0.6 + vec2(uTime*0.012, uTime*0.006)); vec2 w = (a.rg-0.5)*0.6; vec4 b = texture2D(uTex, uv + w + vec2(-uTime*0.02, uTime*0.015));
      float cloud = smoothstep(0.3, 0.85, b.r*0.7 + a.r*0.5); float crack = pow(b.g, 2.0) * smoothstep(0.45, 0.8, a.b);
      float flick = 0.6 + 0.4*sin(uTime*23.0 + b.b*30.0); float edge = smoothstep(1.0, 0.72, r);
      vec3 c = uCol*cloud*0.22 + vec3(0.7,0.85,1.8)*crack*(0.35 + 2.5*uFlash)*flick;
      gl_FragColor = vec4(c*edge*uA, 0.0); }`,
  nebula: `uniform sampler2D uTex; uniform float uTime; uniform float uSeed; uniform vec3 uCol; uniform float uA; varying vec2 vL; varying vec2 vW;
    void main(){ float r = length(vL); if (r > 1.0) discard; vec2 uv = vW/120.0 + uSeed;
      vec4 a = texture2D(uTex, uv*0.5 + vec2(uTime*0.004, 0.0)); vec2 w = (a.rg-0.5)*0.5; vec4 b = texture2D(uTex, uv + w - vec2(0.0, uTime*0.006));
      float den = smoothstep(0.25, 0.75, b.r*0.6 + a.r*0.6) * smoothstep(1.0, 0.55, r);
      vec3 c = mix(uCol, uCol.bgr, b.b) * (0.045 + 0.07*b.g);
      float al = den * uA; gl_FragColor = vec4(c*al, al); }`,
  gravity: `uniform float uTime; uniform vec3 uCol; uniform float uA; varying vec2 vL; varying vec2 vW;
    void main(){ float r = length(vL); if (r > 1.0) discard; float ang = atan(vL.y, vL.x);
      float arms = 0.5 + 0.5*sin(ang*3.0 + log(r+0.03)*7.0 - uTime*1.6); float rr = smoothstep(1.0, 0.25, r) * smoothstep(0.02, 0.12, r);
      float core = exp(-pow((r-0.1)/0.025, 2.0));
      vec3 c = uCol*(pow(arms, 3.0)*rr*0.22 + core*1.4) + vec3(0.02,0.0,0.05)*rr;
      gl_FragColor = vec4(c*uA, 0.0); }`,
  radiation: `uniform sampler2D uTex; uniform float uTime; uniform float uSeed; uniform vec3 uCol; uniform float uA; varying vec2 vL; varying vec2 vW;
    void main(){ float r = length(vL); if (r > 1.0) discard; vec2 uv = vW/90.0 + uSeed; vec4 b = texture2D(uTex, uv + vec2(uTime*0.01, uTime*0.013));
      float glow = pow(1.0 - r, 1.6); float pulse = 0.75 + 0.25*sin(uTime*2.4 - r*9.0);
      vec3 c = uCol*(glow*0.16*pulse + pow(b.g,2.0)*0.12*glow) + uCol*0.04*smoothstep(1.0,0.8,r)*b.r;
      gl_FragColor = vec4(c*uA, 0.0); }`,
  accretion: `uniform sampler2D uTex; uniform float uTime; varying vec2 vL; varying vec2 vW;
    void main(){ float r = length(vL); float t = (r - 1.35)/(5.2 - 1.35); if (t < 0.0 || t > 1.0) discard; float ang = atan(vL.y, vL.x);
      float sw = ang + uTime*(1.4/(0.4+t*2.0)); vec2 uv = vec2(sw/6.2831*3.0, t*1.6 - uTime*0.05);
      float g = texture2D(uTex, uv).r*0.6 + texture2D(uTex, uv*2.3 + 0.4).g*0.6;
      float heat = pow(1.0 - t, 1.6); vec3 col = mix(vec3(1.6,0.35,0.08), vec3(3.2,2.6,2.0), heat); col = mix(col, vec3(2.4,2.8,3.6), heat*heat*0.6);
      float dop = 0.55 + 0.45*sin(ang + 0.6); // relativistic beaming: approaching side brighter
      float a = smoothstep(0.0, 0.06, t) * smoothstep(1.0, 0.45, t) * (0.35 + 0.9*g) * (0.5 + 0.9*dop);
      gl_FragColor = vec4(col*a, 0.0); }`,
  ring: `uniform float uTime; uniform vec3 uCol; uniform float uA; uniform float uStripes; varying vec2 vL; varying vec2 vW;
    void main(){ float ang = atan(vL.y, vL.x); float dash = step(0.5, fract(ang*(uStripes > 0.5 ? 18.0 : 24.0)/6.2831 - uTime*0.08));
      vec3 c = uStripes > 0.5 ? mix(uCol, vec3(0.02,0.02,0.0), dash) : uCol*dash; float a = uStripes > 0.5 ? 1.0 : dash;
      gl_FragColor = vec4(c*uA, a*uA*0.0); }`,
};
const LIGHT = { transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false };
const PREMUL = { transparent: true, depthWrite: false, premultipliedAlpha: true, blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor, fog: false };
let DISC = null, RING = null, RING_T = null;
function geos() {
  if (DISC) return; DISC = new THREE.PlaneGeometry(2, 2, 1, 1); DISC.rotateX(-Math.PI / 2); DISC.userData.shared = true;
  RING = new THREE.RingGeometry(0.985, 1.0, 160, 1); RING.rotateX(-Math.PI / 2); RING.userData.shared = true;
  RING_T = new THREE.RingGeometry(1.35, 5.2, 128, 4); RING_T.rotateX(-Math.PI / 2); RING_T.userData.shared = true;
}
// hazard boundary: dashed (or striped, for radiation / black hole) ring with a type colour
function boundary(Z, def, tex, U) {
  const m = new THREE.ShaderMaterial({ ...LIGHT, vertexShader: DISC_VS, fragmentShader: ZONE_FS.ring, uniforms: { uTime: U.uTime, uCol: { value: new THREE.Color(def.col[0] * 0.45, def.col[1] * 0.45, def.col[2] * 0.45) }, uA: { value: 1 }, uStripes: { value: Z.type === 'radiation' || Z.type === 'blackhole' ? 1 : 0 } } });
  m.blending = THREE.AdditiveBlending; const mesh = new THREE.Mesh(RING, m); mesh.scale.setScalar(Z.r); mesh.position.y = 0.05; mesh.renderOrder = 6; return mesh;
}
function buildZone(Z, quality) {
  geos(); const def = PHEN[Z.type]; const tex = nebulaTexture(); const g = new THREE.Group(); g.position.set(Z.x, 0, Z.z);
  const U = { uTex: { value: tex }, uTime: { value: 0 }, uFlash: { value: 0 }, uSeed: { value: Z.seed * 0.013 }, uCol: { value: new THREE.Color(...def.col) }, uA: { value: 1 } };
  const disc = (fs, y, scale, opts = LIGHT, a = 1) => { const u = { ...U, uA: { value: a } }; const m = new THREE.Mesh(DISC, new THREE.ShaderMaterial({ ...opts, vertexShader: DISC_VS, fragmentShader: fs, uniforms: u })); m.position.y = y; m.scale.setScalar(scale); m.renderOrder = 5; g.add(m); return m; };
  const V = { g, U, parts: [] };
  if (Z.type === 'ion') { V.parts.push(disc(ZONE_FS.ion, -1.5, Z.r)); if (quality !== 'low') V.parts.push(disc(ZONE_FS.ion, 3.5, Z.r * 0.92, LIGHT, 0.45)); }
  else if (Z.type === 'nebula') { // stacked translucent slices: real occlusion of ships flying inside
    const ys = quality === 'low' ? [2.5] : quality === 'medium' ? [-3, 3.2] : [-4, 0.9, 4.6];
    ys.forEach((y, i) => { const m = disc(ZONE_FS.nebula, y, Z.r * (1 - i * 0.05), PREMUL, i === ys.length - 1 ? 0.55 : 0.7); m.material.uniforms.uSeed = { value: Z.seed * 0.013 + i * 0.21 }; m.renderOrder = 8 + i; V.parts.push(m); });
  } else if (Z.type === 'gravity') V.parts.push(disc(ZONE_FS.gravity, -0.6, Z.r));
  else if (Z.type === 'radiation') {
    V.parts.push(disc(ZONE_FS.radiation, -0.8, Z.r));
    const core = new THREE.Mesh(new THREE.IcosahedronGeometry(2.2, 1), new THREE.MeshStandardMaterial({ color: 0x223014, emissive: new THREE.Color(1.6, 3.2, 0.4), emissiveIntensity: 1, roughness: 0.6, metalness: 0.3, flatShading: true }));
    core.position.y = 0.4; g.add(core); V.core = core;
    const shell = new THREE.Mesh(new THREE.IcosahedronGeometry(3.2, 0), new THREE.MeshBasicMaterial({ color: new THREE.Color(0.6, 1.4, 0.2), wireframe: true, transparent: true, opacity: 0.4, blending: THREE.AdditiveBlending, depthWrite: false })); shell.position.y = 0.4; g.add(shell); V.shell = shell;
  } else if (Z.type === 'blackhole') {
    const H = BH_HORIZON;
    const hole = new THREE.Mesh(new THREE.SphereGeometry(H, 48, 24), new THREE.MeshBasicMaterial({ color: 0x000000, fog: false })); hole.position.y = 0.5; hole.renderOrder = 4; g.add(hole); V.hole = hole;
    const acc = new THREE.Mesh(RING_T, new THREE.ShaderMaterial({ ...LIGHT, vertexShader: DISC_VS, fragmentShader: ZONE_FS.accretion, uniforms: { uTex: U.uTex, uTime: U.uTime } })); acc.scale.setScalar(H); acc.position.y = 0.5; acc.rotation.set(0.22, 0, 0.1); acc.renderOrder = 5; g.add(acc); V.acc = acc;
    // back half of the disc lensed over the top of the hole (the classic 'halo' arc), approximated by a tilted copy
    const halo = new THREE.Mesh(RING_T, acc.material); halo.scale.set(H * 0.82, H * 0.82, H * 0.5); halo.position.set(0, 0.6, -H * 0.15); halo.rotation.set(-1.15, 0, 0); halo.renderOrder = 5; g.add(halo); V.halo = halo;
    const ph = new THREE.Mesh(new THREE.TorusGeometry(H * 1.05, 0.16, 6, 96), new THREE.MeshBasicMaterial({ color: new THREE.Color(3.2, 2.4, 1.6), transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false, fog: false })); ph.rotation.x = Math.PI / 2; ph.position.y = 0.5; g.add(ph);
    V.parts.push(disc(ZONE_FS.gravity, -0.8, Z.r * 0.55, LIGHT, 0.6));
  }
  const ring = boundary(Z, def, tex, U); g.add(ring); V.ring = ring;
  return V;
}
function disposeZone(V) { V.g.traverse((o) => { if (o.isMesh) { if (!o.geometry.userData.shared) o.geometry.dispose(); o.material.dispose(); } }); }

// ---------------------------------------------------------------- runtime
export class Phenomena {
  constructor(g) {
    this.g = g; this.live = new Map(); this.list = zones(); this.near = []; this.drift = { x: 0, z: 0 }; this.env = { ax: 0, az: 0, rad: 0, ion: 0, neb: 0, bh: 0, grav: 0, horizon: false, zone: null, warn: null };
    this.lenses = []; this.strikeT = 2; this.seen = {}; this.quality = 'high'; this.tmp = { ax: 0, az: 0 }; this.stats = { zones: this.list.length };
  }
  setQuality(q) { if (q === this.quality) return; this.quality = q; for (const [, V] of this.live) { this.g.scene.remove(V.g); disposeZone(V); } this.live.clear(); }
  // acceleration field at a point (gravity anomalies + black hole), for any body
  field(x, z, out = this.tmp) {
    out.ax = 0; out.az = 0;
    for (const Z of this.near) {
      if (Z.type !== 'gravity' && Z.type !== 'blackhole') continue; const dx = Z.x - x, dz = Z.z - z; const d = Math.hypot(dx, dz) || 1e-3; if (d > Z.r) continue;
      const ux = dx / d, uz = dz / d; let a, sw;
      if (Z.type === 'gravity') { const f = 1 - d / Z.r; a = 9 * f * Math.min(1, d / 4); sw = 4.5 * f; }
      else { a = Math.min(20, 14 * Math.pow(22 / Math.max(d, 4), 1.3)) * (1 - Math.pow(d / Z.r, 3)); sw = a * 0.25; } // capped below a ship's thrust: you can always fly out
      out.ax += ux * a - uz * sw; out.az += uz * a + ux * sw;
    }
    return out;
  }
  sample(x, z, E = this.scratch || (this.scratch = { rad: 0, ion: 0, neb: 0, bh: 0, grav: 0, horizon: false, zone: null })) { // hazard intensities at a point (player env uses this.env)
    E.rad = 0; E.ion = 0; E.neb = 0; E.bh = 0; E.grav = 0; E.horizon = false; E.zone = null;
    for (const Z of this.near) { const d = Math.hypot(Z.x - x, Z.z - z); if (d > Z.r) continue; const k = 1 - d / Z.r; E.zone = E.zone && E.zone.type === 'blackhole' ? E.zone : Z;
      if (Z.type === 'radiation') E.rad = Math.max(E.rad, Math.pow(k, 0.7)); else if (Z.type === 'ion') E.ion = Math.max(E.ion, Math.min(1, k * 2.5)); else if (Z.type === 'nebula') E.neb = Math.max(E.neb, Math.min(1, k * 2.2)); else if (Z.type === 'gravity') E.grav = Math.max(E.grav, k); else if (Z.type === 'blackhole') { E.bh = Math.max(E.bh, k); if (d < BH_HORIZON + 4) E.horizon = true; } }
    return E;
  }
  update(dt) {
    const g = this.g, p = g.player, t = g.time; const q = g.quality || 'high';
    if (q !== this.quality) this.setQuality(q);
    // streaming: zones within 520 get visuals, beyond 620 they are freed
    this.near = this.list.filter((Z) => Math.abs(Z.x - p.x) < 520 + Z.r && Math.abs(Z.z - p.z) < 520 + Z.r);
    for (const Z of this.near) if (!this.live.has(Z.id) && Math.hypot(Z.x - p.x, Z.z - p.z) < 470 + Z.r) { const V = buildZone(Z, q); g.scene.add(V.g); this.live.set(Z.id, V); }
    for (const [id, V] of this.live) { const Z = this.list.find((o) => o.id === id); if (Math.hypot(Z.x - p.x, Z.z - p.z) > 620 + Z.r) { g.scene.remove(V.g); disposeZone(V); this.live.delete(id); } }
    this.stats.live = this.live.size;
    // ---- player environment
    const E = this.sample(p.x, p.z, this.env); this.lenses.length = 0;
    let warn = null, wd = 1e9;
    for (const Z of this.near) { const d = Math.hypot(Z.x - p.x, Z.z - p.z) - Z.r; if (d < 60 && d < wd) { wd = d; warn = { Z, d: Math.max(0, Math.round(d)), inside: d <= 0 }; } }
    E.warn = warn;
    if (warn && warn.inside && !this.seen[warn.Z.id] && !g.dead) { this.seen[warn.Z.id] = 1; const D = PHEN[warn.Z.type]; g.toast(`${D.icon} Entered ${D.name}: ${D.warn}`, 'warn'); }
    if (!g.dead && !g.docked) {
      // pull: part goes into the hull velocity (flight assist fights it), part is an environmental drift the assist cannot cancel.
      // Drift terminal speed is ~F/2 (<= 10 u/s at the black hole core) so full thrust always escapes.
      const F = this.field(p.x, p.z); const D = this.drift; if (g.dashT <= 0) { p.vx += F.ax * dt; p.vz += F.az * dt; D.x += F.ax * dt; D.z += F.az * dt; }
      const dk = Math.exp(-2 * dt); D.x *= dk; D.z *= dk; const dm = Math.hypot(D.x, D.z); if (dm > 5) { D.x *= 5 / dm; D.z *= 5 / dm; } p.x += D.x * dt; p.z += D.z * dt;
      if (E.rad > 0) { const st = g.stats(); const rate = 0.004 + 0.011 * E.rad; const shf = p.sh > 0 ? 0.6 : 1; p.hp -= p.maxHp * rate * shf * dt; g.lastHurt = Math.max(g.lastHurt, t - 3.6); g.radDose = (g.radDose || 0) + rate * dt; if (p.hp <= 0) { p.hp = 0; g.playerDie(); } }
      if (E.horizon) { p.hp -= p.maxHp * 0.06 * dt; g.lastHurt = t; g.addShake(0.05); if (p.hp <= 0) { p.hp = 0; g.playerDie(); } }
      if (E.ion > 0.05) g.jamT = Math.max(g.jamT, t + 0.25);
    }
    // ---- everything else feels the same physics
    if (this.near.some((Z) => Z.type === 'gravity' || Z.type === 'blackhole')) {
      for (const e of g.enemies) { if (e.dead || e.D.inst || e.D.part) continue; const F = this.field(e.x, e.z); const k = e.D.boss ? 0.15 : 1; e.vx += F.ax * dt * k; e.vz += F.az * dt * k; }
      for (const b of g.bolts.list) { if (b.dead) continue; const F = this.field(b.x, b.z); if (F.ax || F.az) { b.vx += F.ax * dt * 1.6; b.vz += F.az * dt * 1.6; } }
      for (const a of g.field.list) { if (!a.alive || a.r > 3.6) continue; const F = this.field(a.x, a.z); if (F.ax || F.az) { a.vx = (a.vx || 0) + F.ax * dt * 0.5; a.vz = (a.vz || 0) + F.az * dt * 0.5; } }
    }
    if (this.near.some((Z) => Z.type === 'radiation')) for (const e of g.enemies) { if (e.dead || e.D.inst || e.D.part || e.D.boss) continue; const r = this.sampleRad(e.x, e.z); if (r > 0) { e.hp -= e.maxHp * (0.004 + 0.011 * r) * dt; if (e.hp <= 0) g.killEnemy(e); } }
    // ---- visuals, hazards, lenses
    for (const [id, V] of this.live) {
      const Z = this.list.find((o) => o.id === id); const d = Math.hypot(Z.x - p.x, Z.z - p.z); V.U.uTime.value = t; const near = clamp(1.6 - (d - Z.r) / 40, 0.35, 1.6);
      V.ring.material.uniforms.uA.value = near * (0.8 + 0.2 * Math.sin(t * 4));
      if (Z.type === 'ion') { V.U.uFlash.value = Math.max(0, V.U.uFlash.value - dt * 3); if (d < Z.r + 30) this.ionStorm(Z, V, dt); }
      if (Z.type === 'radiation') { V.core.rotation.y += dt * 0.6; V.shell.rotation.y -= dt * 0.9; V.shell.rotation.x += dt * 0.4; V.core.material.emissiveIntensity = 0.8 + 0.4 * Math.sin(t * 2.4);
        if (d < Z.r + 40 && Math.random() < 0.9 * g.fx.budget) { const a = rand(0, TAU), rr = Math.sqrt(Math.random()) * Z.r; g.fx.emit(Z.x + Math.cos(a) * rr, 0.2, Z.z + Math.sin(a) * rr, 0, rand(1.5, 4), 0, 0.9, 0.35, 0.05, 1.4, 3.2, 0.4, 1); } }
      if (Z.type === 'nebula' && d < Z.r + 20 && Math.random() < 0.3 * g.fx.budget && g.smoke.budget > 0) { const a = rand(0, TAU), rr = Math.sqrt(Math.random()) * Z.r * 0.9; g.smoke.emit(Z.x + Math.cos(a) * rr, rand(-1, 3), Z.z + Math.sin(a) * rr, rand(-0.5, 0.5), 0.1, rand(-0.5, 0.5), 5, 3, 7, 0.3, 0.16, 0.36, 0.25, 0.25); }
      if (Z.type === 'gravity') { this.lenses.push({ x: Z.x, y: 0, z: Z.z, r: 5, s: 0.035, mode: 0 });
        if (d < Z.r + 30 && Math.random() < 0.6 * g.fx.budget) { const a = rand(0, TAU), rr = Z.r * rand(0.5, 1); const vx = -Math.sin(a) * 6 - Math.cos(a) * 3, vz = Math.cos(a) * 6 - Math.sin(a) * 3; g.fx.emit(Z.x + Math.cos(a) * rr, 0.3, Z.z + Math.sin(a) * rr, vx, 0, vz, 1.4, 0.3, 0.05, 1.0, 0.7, 2.4, 1); } }
      if (Z.type === 'blackhole') { V.acc.rotation.y += dt * 0.05; this.lenses.push({ x: Z.x, y: 0.5, z: Z.z, r: BH_HORIZON * 1.18, s: 0.2, mode: 0 });
        if (d < Z.r + 60 && Math.random() < 1.2 * g.fx.budget) { const a = rand(0, TAU), rr = rand(14, 40); const sp = 10 + 160 / rr; g.fx.emit(Z.x + Math.cos(a) * rr, 0.5, Z.z + Math.sin(a) * rr, -Math.sin(a) * sp - Math.cos(a) * 4, 0, Math.cos(a) * sp - Math.sin(a) * 4, 1.2, 0.4, 0.05, 3.0, 1.5, 0.5, 1); } }
    }
  }
  sampleRad(x, z) { let r = 0; for (const Z of this.near) if (Z.type === 'radiation') { const d = Math.hypot(Z.x - x, Z.z - z); if (d < Z.r) r = Math.max(r, Math.pow(1 - d / Z.r, 0.7)); } return r; }
  ionStorm(Z, V, dt) { // telegraphed lightning strikes near the player while inside / at the edge of a storm
    const g = this.g, p = g.player; if (g.dead) return; this.strikeT -= dt; if (this.strikeT > 0) return; this.strikeT = rand(1.1, 2.0);
    const a = rand(0, TAU), rr = rand(0, 14); let x = p.x + p.vx * 0.8 + Math.cos(a) * rr, z = p.z + p.vz * 0.8 + Math.sin(a) * rr;
    if (Math.hypot(x - Z.x, z - Z.z) > Z.r) return;
    const dmg = p.maxHp * 0.06;
    g.camp.teleCircle(x, z, 4.5, 1.0, (T) => {
      V.U.uFlash.value = 1; g.flashes.spawn(T.x, 6, T.z, 60, 0x9fc4ff, 0.25, 30, true);
      for (let i = 0; i <= 10; i++) { const k = i / 10; g.fx.emit(T.x + rand(-0.6, 0.6) * (1 - k), 12 * (1 - k), T.z + rand(-0.6, 0.6) * (1 - k), 0, 0, 0, 0.2, 1.1, 0.3, 1.8, 2.4, 3.8, 0); }
      g.rings.spawn(T.x, 0.3, T.z, 7, [0.8, 1.6, 3.6], 0.35); g.audio.pulse && g.audio.pulse(T.x, T.z);
      if (g.camp.inCircle(T)) { g.hurtPlayer(dmg, T.x, T.z, { energy: true }); p.energy = Math.max(0, p.energy - 30); }
      for (const e of g.enemies) if (!e.dead && !e.D.inst && !e.D.boss && Math.hypot(e.x - T.x, e.z - T.z) < 4.5 + e.radius) { e.stunT = Math.max(e.stunT, 0.8); g.damageEnemy(e, e.maxHp * 0.08, false, null, true, 'rival'); }
    }, [0.9, 1.8, 3.8]);
  }
}

// v7 celestial environment: procedural nebula texture, layered parallax nebulae, lit 3D planets (atmospheres, clouds,
// craters, rings with shadows), distant asteroid layer and a foreground debris layer. Everything is world-anchored at a
// real depth below the play plane, so parallax comes from the actual perspective camera (no fake scrolling).
import * as THREE from 'three';
import { mulberry, hash2, clamp } from './util.js?v=7';
import { makeRockGeometry } from './models.js?v=7';

// ---------------------------------------------------------------- tileable nebula texture (CPU, once)
// R: large gas  G: ridged filaments  B: fine particulate  A: dark dust
function latt(p, seed) { const r = mulberry(seed); const a = new Float32Array(p * p); for (let i = 0; i < a.length; i++) a[i] = r(); return a; }
function vnoise(L, p, x, y) { // periodic value noise, x,y in lattice units
  const xi = Math.floor(x), yi = Math.floor(y); const xf = x - xi, yf = y - yi; const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const x0 = ((xi % p) + p) % p, y0 = ((yi % p) + p) % p, x1 = (x0 + 1) % p, y1 = (y0 + 1) % p;
  const a = L[y0 * p + x0], b = L[y0 * p + x1], c = L[y1 * p + x0], d = L[y1 * p + x1];
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
let NEB_TEX = null;
export function nebulaTexture(size = 256) {
  if (NEB_TEX) return NEB_TEX;
  const t0 = performance.now(); const data = new Uint8Array(size * size * 4);
  const chan = (base, oct, seed, ridged) => { const Ls = []; for (let o = 0; o < oct; o++) Ls.push(latt(base << o, seed + o * 17)); return (x, y) => { let s = 0, a = 0.5, n = 0; for (let o = 0; o < oct; o++) { const p = base << o; let v = vnoise(Ls[o], p, x * p, y * p); if (ridged) v = 1 - Math.abs(v * 2 - 1); s += v * a; n += a; a *= 0.5; } return s / n; }; };
  const R = chan(4, 5, 11), G = chan(6, 4, 37, true), B = chan(16, 3, 71), A = chan(5, 4, 113);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const u = x / size, v = y / size; const i = (y * size + x) * 4;
    const g = G(u, v);
    data[i] = clamp(R(u, v) * 255, 0, 255); data[i + 1] = clamp(g * g * g * 255, 0, 255); data[i + 2] = clamp(B(u, v) * 255, 0, 255); data[i + 3] = clamp(A(u, v) * 255, 0, 255);
  }
  const t = new THREE.DataTexture(data, size, size, THREE.RGBAFormat); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearMipmapLinearFilter; t.generateMipmaps = true; t.needsUpdate = true;
  t.userData.ms = performance.now() - t0; NEB_TEX = t; return t;
}

// ---------------------------------------------------------------- layered nebula planes
const NEB_VS = `varying vec2 vW; void main(){ vec4 w = modelMatrix*vec4(position,1.0); vW = w.xz; gl_Position = projectionMatrix*viewMatrix*w; }`;
const NEB_FS = `uniform sampler2D uTex; uniform vec3 uTint; uniform vec3 uTint2; uniform float uTime; uniform float uScale; uniform float uAlpha; uniform float uDust; uniform float uGain; uniform float uFil; uniform vec2 uOff; uniform vec2 uCenter; uniform float uHalf; varying vec2 vW;
  void main(){
    vec2 uv = vW*uScale + uOff;
    vec4 a = texture2D(uTex, uv*0.37 + vec2(uTime*0.0011, -uTime*0.0007));
    vec2 warp = (a.rg - 0.5)*0.42;
    vec4 b = texture2D(uTex, uv + warp + vec2(-uTime*0.0016, uTime*0.0009));
    float gas = smoothstep(0.34, 0.86, b.r*0.75 + a.r*0.45);
    float fil = b.g * smoothstep(0.35, 0.7, a.r) * uFil;
    float dust = smoothstep(0.52, 0.8, texture2D(uTex, uv*0.61 + warp*0.6 + 0.37).a) * uDust;
    vec3 col = mix(uTint, uTint2, smoothstep(0.25, 0.85, a.b)) * gas * (0.55 + 0.7*b.b);
    col += mix(uTint2, vec3(0.9,0.95,1.0), 0.5) * fil * 0.6;
    col *= uGain * (1.0 - dust*0.9);
    float fade = 1.0 - smoothstep(uHalf*0.55, uHalf, length(vW - uCenter));
    float al = clamp(gas*0.22*uAlpha + dust*0.55, 0.0, 0.85);
    gl_FragColor = vec4(col*fade, al*fade);
  }`;
export class NebulaLayers {
  constructor(scene) {
    this.scene = scene; this.layers = []; this.tex = nebulaTexture();
    // far: huge diffuse formations; mid: filaments + dust closer to the play plane; near (high only): faint particulate veil
    const defs = [{ y: -520, half: 1500, scale: 1 / 1400, alpha: 1.0, dust: 0.75, gain: 0.55, fil: 0.6, ro: -9 }, { y: -210, half: 700, scale: 1 / 520, alpha: 0.7, dust: 0.45, gain: 0.42, fil: 1.0, ro: -7 }, { y: -70, half: 320, scale: 1 / 210, alpha: 0.35, dust: 0.0, gain: 0.22, fil: 0.5, ro: -6 }];
    const geo = new THREE.PlaneGeometry(1, 1); geo.rotateX(-Math.PI / 2); geo.userData.shared = true;
    defs.forEach((d, i) => {
      const m = new THREE.ShaderMaterial({ vertexShader: NEB_VS, fragmentShader: NEB_FS, transparent: true, depthWrite: false, premultipliedAlpha: true, blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor, fog: false,
        uniforms: { uTex: { value: this.tex }, uTint: { value: new THREE.Color() }, uTint2: { value: new THREE.Color() }, uTime: { value: 0 }, uScale: { value: d.scale }, uAlpha: { value: d.alpha }, uDust: { value: d.dust }, uGain: { value: d.gain }, uFil: { value: d.fil }, uOff: { value: new THREE.Vector2(i * 0.37, i * 0.61) }, uCenter: { value: new THREE.Vector2() }, uHalf: { value: d.half } } });
      const mesh = new THREE.Mesh(geo, m); mesh.scale.set(d.half * 2, 1, d.half * 2); mesh.position.y = d.y; mesh.renderOrder = d.ro; mesh.frustumCulled = false; scene.add(mesh);
      this.layers.push({ mesh, d });
    });
    this.count = 3;
  }
  setCount(n) { this.count = n; this.layers.forEach((L, i) => (L.mesh.visible = i < n)); }
  update(cam, tint, time) {
    const c2 = this._c2 ||= new THREE.Color();
    // complementary hue for the second gas colour keeps the sector identity but adds layered gradients
    c2.setRGB(tint.z * 0.7 + 0.15, tint.x * 0.5 + 0.1, tint.y * 0.9 + 0.2);
    for (const L of this.layers) { if (!L.mesh.visible) continue; const u = L.mesh.material.uniforms; L.mesh.position.x = cam.x; L.mesh.position.z = cam.z; u.uCenter.value.set(cam.x, cam.z); u.uTime.value = time; u.uTint.value.setRGB(tint.x, tint.y, tint.z); u.uTint2.value.copy(c2); }
  }
}

// ---------------------------------------------------------------- planets
const NOISE3 = `float h3(vec3 p){ p=fract(p*0.3183099+.1); p*=17.0; return fract(p.x*p.y*p.z*(p.x+p.y+p.z)); }
  float n3(vec3 x){ vec3 i=floor(x); vec3 f=fract(x); f=f*f*(3.0-2.0*f);
    return mix(mix(mix(h3(i),h3(i+vec3(1,0,0)),f.x),mix(h3(i+vec3(0,1,0)),h3(i+vec3(1,1,0)),f.x),f.y),
               mix(mix(h3(i+vec3(0,0,1)),h3(i+vec3(1,0,1)),f.x),mix(h3(i+vec3(0,1,1)),h3(i+vec3(1,1,1)),f.x),f.y),f.z); }
  float fb(vec3 p){ float s=0.0,a=0.5; for(int i=0;i<OCT;i++){ s+=a*n3(p); p=p*2.03+vec3(1.7,9.2,3.1); a*=0.5; } return s; }`;
const PLANET_VS = `uniform float uSpin; varying vec3 vO; varying vec3 vWN; varying vec3 vWP;
  void main(){ float c=cos(uSpin), s=sin(uSpin); vO = vec3(c*position.x - s*position.z, position.y, s*position.x + c*position.z);
    vec4 w = modelMatrix*vec4(position,1.0); vWP = w.xyz; vWN = normalize(mat3(modelMatrix)*normal); gl_Position = projectionMatrix*viewMatrix*w; }`;
const PLANET_FS = `uniform vec3 uL; uniform vec3 uC1; uniform vec3 uC2; uniform vec3 uC3; uniform vec3 uAtm; uniform float uType; uniform float uSeed; uniform float uTime;
  uniform vec3 uCenter; uniform float uR; uniform float uRing; uniform vec3 uRingN; uniform vec2 uRingR; varying vec3 vO; varying vec3 vWN; varying vec3 vWP;
  ${NOISE3}
  float ringDen(float r){ float t=(r-uRingR.x)/(uRingR.y-uRingR.x); if(t<0.0||t>1.0) return 0.0; float b=n3(vec3(r*9.0,uSeed,0.0))*0.6+n3(vec3(r*31.0,uSeed*2.0,1.0))*0.4; return smoothstep(0.0,0.08,t)*smoothstep(1.0,0.85,t)*smoothstep(0.25,0.6,b); }
  #ifdef CRATERS
  float craters(vec3 p){ vec3 i=floor(p); vec3 f=fract(p); float c=0.0; for(int x=-1;x<=1;x++) for(int y=-1;y<=1;y++) for(int z=-1;z<=1;z++){ vec3 g=vec3(x,y,z); vec3 o=vec3(h3(i+g),h3(i+g+11.3),h3(i+g+27.1)); float r=0.22+0.25*h3(i+g+5.7); float d=length(g+o-f)/r; if(d<1.25) c+= d<1.0 ? -(1.0-d*d)*0.9 : (1.25-d)*2.4; } return c; }
  #endif
  void main(){
    vec3 p = normalize(vO); vec3 n = normalize(vWN); vec3 V = normalize(cameraPosition - vWP);
    float h = fb(p*2.3 + uSeed); float h2 = fb(p*7.0 - uSeed);
    vec3 col; float spec = 0.0; float emis = 0.0; float hb = h;
    if (uType < 0.5) { // rocky / desert
      float ridge = 1.0 - abs(2.0*fb(p*4.5+uSeed*1.7)-1.0); col = mix(uC1, uC2, smoothstep(0.35,0.7,h)); col = mix(col, uC3, smoothstep(0.65,0.9,ridge)*0.7); col *= 0.75+0.5*h2; hb = h*0.6 + ridge*0.5;
      #ifdef CRATERS
      float cr = craters(p*5.0+uSeed) + 0.5*craters(p*11.0-uSeed); col *= 1.0 + 0.18*cr; hb += cr*0.12;
      #endif
    } else if (uType < 1.5) { // ocean world
      float land = smoothstep(0.5, 0.53, h); col = mix(uC1*(0.6+0.5*h), mix(uC2, uC3, smoothstep(0.55,0.75,h2)), land); spec = (1.0-land)*0.9; hb = land*h;
    } else if (uType < 2.5) { // gas giant
      float lat = p.y; float w = fb(vec3(p.x*2.0, lat*9.0, p.z*2.0)+uSeed); float b = sin(lat*(14.0+uSeed*0.3) + w*5.0);
      col = mix(uC1, uC2, 0.5+0.5*b); col = mix(col, uC3, smoothstep(0.55,0.8,w)*0.5);
      float sd = length(vec2(atan(p.z,p.x)*0.8 - 1.0, (lat+0.25)*3.0)); col = mix(col, uC3*1.2, smoothstep(0.35,0.1,sd)*0.8); hb = 0.0;
    } else if (uType < 3.5) { // ice
      float cr = 1.0 - abs(2.0*fb(p*6.0+uSeed)-1.0); col = mix(uC1, uC2, h); col = mix(col, uC3, smoothstep(0.86,0.97,cr)); spec = 0.5; hb = h*0.4;
    } else { // volcanic
      float cr = 1.0 - abs(2.0*fb(p*5.0+uSeed)-1.0); col = mix(uC1, uC2, h)*0.7; emis = smoothstep(0.88,0.97,cr); hb = h*0.8 - emis*0.3;
    }
    // terrain bump from screen-space height derivatives (cheap mountain shading)
    vec3 dpx = dFdx(vWP), dpy = dFdy(vWP); float dhx = dFdx(hb), dhy = dFdy(hb);
    vec3 r1 = cross(dpy, n), r2 = cross(n, dpx); float det = dot(dpx, r1); vec3 grad = sign(det)*(dhx*r1 + dhy*r2);
    vec3 nb = normalize(abs(det)*n - grad*uR*0.9);
    float ndl = dot(nb, uL); float ndl0 = dot(n, uL);
    float day = smoothstep(-0.12, 0.3, ndl0);
    float lit = max(ndl, 0.0)*0.9 + 0.04;
    vec3 c = col*lit*day;
    // clouds (rotate a little faster than the surface, with soft shadows)
    if (uType < 1.5 || uType > 3.5) {
      #ifdef CLOUDS
      vec3 cp = p*3.2 + vec3(uTime*0.01, 0.0, -uTime*0.006) + uSeed; float cl = smoothstep(0.52, 0.78, fb(cp)); float cs = smoothstep(0.52, 0.78, fb(cp - uL*0.06));
      c *= 1.0 - cs*0.35*day; c = mix(c, vec3(0.95)*(max(ndl0,0.0)*0.95+0.03), cl*(uType > 3.5 ? 0.35 : 0.8));
      #endif
    }
    // specular (oceans / ice)
    vec3 H = normalize(uL + V); c += vec3(1.0,0.95,0.85)*pow(max(dot(n,H),0.0), 60.0)*spec*day*0.9;
    // volcanic glow, strongest on the night side
    c += vec3(2.4,0.7,0.12)*emis*(0.4 + 0.8*(1.0-day));
    // ring shadow on the surface
    if (uRing > 0.5) { float dn = dot(uL, uRingN); if (abs(dn) > 0.01) { float t = dot(uCenter - vWP, uRingN)/dn; if (t > 0.0) { vec3 q = vWP + uL*t; c *= 1.0 - 0.65*ringDen(length(q-uCenter)/uR); } } }
    // atmospheric haze + terminator scattering
    float rim = pow(1.0 - max(dot(n, V), 0.0), 2.6);
    float term = exp(-pow(ndl0*4.0, 2.0));
    c += uAtm*rim*(0.25 + 0.9*smoothstep(-0.25, 0.5, ndl0)) + uAtm*vec3(1.3,0.6,0.4)*term*0.12*rim;
    gl_FragColor = vec4(c, 1.0);
  }`;
const ATM_FS = `uniform vec3 uL; uniform vec3 uAtm; varying vec3 vWN; varying vec3 vWP; void main(){ vec3 n=normalize(vWN); vec3 V=normalize(cameraPosition-vWP); float f=1.0-abs(dot(n,V)); float s=smoothstep(-0.35,0.45,dot(n,uL)); float a=pow(f,3.2)*s; gl_FragColor=vec4(uAtm*a*1.4, a); }`;
const RING_VS = `varying vec3 vWP; varying float vR; void main(){ vR = length(position.xy); vec4 w = modelMatrix*vec4(position,1.0); vWP = w.xyz; gl_Position = projectionMatrix*viewMatrix*w; }`;
const RING_FS = `uniform vec3 uL; uniform vec3 uC1; uniform vec3 uCenter; uniform float uR; uniform float uSeed; uniform vec2 uRingR; uniform vec3 uRingN; varying vec3 vWP; varying float vR;
  float h3(vec3 p){ p=fract(p*0.3183099+.1); p*=17.0; return fract(p.x*p.y*p.z*(p.x+p.y+p.z)); }
  float n3(vec3 x){ vec3 i=floor(x); vec3 f=fract(x); f=f*f*(3.0-2.0*f); return mix(mix(mix(h3(i),h3(i+vec3(1,0,0)),f.x),mix(h3(i+vec3(0,1,0)),h3(i+vec3(1,1,0)),f.x),f.y),mix(mix(h3(i+vec3(0,0,1)),h3(i+vec3(1,0,1)),f.x),mix(h3(i+vec3(0,1,1)),h3(i+vec3(1,1,1)),f.x),f.y),f.z); }
  void main(){
    float r = vR; float t=(r-uRingR.x)/(uRingR.y-uRingR.x); float b=n3(vec3(r*9.0,uSeed,0.0))*0.6+n3(vec3(r*31.0,uSeed*2.0,1.0))*0.4;
    float den = smoothstep(0.0,0.08,t)*smoothstep(1.0,0.85,t)*smoothstep(0.25,0.6,b);
    float dustL = smoothstep(0.0,0.3,t)*smoothstep(1.0,0.6,t)*0.18; // transparent dust layer between the bands
    // planet shadow on the ring
    vec3 oc = vWP - uCenter; float bb = dot(oc, uL); float cc = dot(oc,oc) - uR*uR; float sh = (bb < 0.0 && bb*bb - cc > 0.0) ? 0.12 : 1.0;
    float lit = (0.35 + 0.65*abs(dot(uRingN, uL))) * sh;
    vec3 col = uC1 * (0.6 + 0.6*b) * lit;
    float a = clamp(den*0.75 + dustL, 0.0, 0.9);
    gl_FragColor = vec4(col*a, a);
  }`;
const PTYPES = [
  { type: 0, c: [[0.42, 0.28, 0.2], [0.72, 0.52, 0.36], [0.9, 0.82, 0.7]], atm: [0.9, 0.5, 0.25] },   // desert
  { type: 1, c: [[0.03, 0.12, 0.32], [0.22, 0.42, 0.18], [0.55, 0.5, 0.38]], atm: [0.25, 0.55, 1.2] }, // ocean
  { type: 2, c: [[0.7, 0.52, 0.36], [0.92, 0.82, 0.62], [0.72, 0.32, 0.18]], atm: [0.9, 0.6, 0.35] }, // gas (amber)
  { type: 2, c: [[0.28, 0.36, 0.7], [0.62, 0.72, 0.95], [0.85, 0.9, 1.0]], atm: [0.35, 0.55, 1.3] },   // gas (ice blue)
  { type: 3, c: [[0.62, 0.75, 0.85], [0.9, 0.95, 1.0], [0.35, 0.6, 0.85]], atm: [0.5, 0.7, 1.2] },     // ice
  { type: 4, c: [[0.12, 0.08, 0.08], [0.3, 0.2, 0.18], [0.9, 0.4, 0.1]], atm: [1.1, 0.35, 0.15] },     // volcanic
  { type: 0, c: [[0.32, 0.26, 0.38], [0.55, 0.45, 0.62], [0.8, 0.75, 0.85]], atm: [0.7, 0.4, 1.2] },   // violet rock
];
export const PLANET_CELL = 1100;
export function planetAt(ci, cj) { // deterministic planet for a world cell (or null)
  const h = hash2(ci, cj, 4242); const r = mulberry(h); if (r() > 0.5 || (ci === 0 && cj === 0)) return null;
  const T = PTYPES[Math.floor(r() * PTYPES.length)]; const R = 70 + r() * 90;
  return { id: ci + ':' + cj, x: (ci + 0.2 + r() * 0.6) * PLANET_CELL, z: (cj + 0.2 + r() * 0.6) * PLANET_CELL, y: -(520 + r() * 380), R, T, seed: r() * 50, ring: r() < (T.type === 2 ? 0.75 : 0.3), tilt: (r() - 0.5) * 0.9, tilt2: (r() - 0.5) * 0.8, spin: 0.004 + r() * 0.01 };
}
export class Planets {
  constructor(scene, light) {
    this.scene = scene; this.L = light.clone().normalize(); this.pool = []; this.max = 3; this.detail = 'high';
    this.geo = new THREE.SphereGeometry(1, 72, 36); this.geo.userData.shared = true;
    this.ringGeo = new THREE.RingGeometry(1.35, 2.45, 128, 1); this.ringGeo.userData.shared = true;
    for (let i = 0; i < 3; i++) this.pool.push(this.makeSlot());
    this.setDetail('high');
  }
  makeSlot() {
    const U = { uL: { value: this.L }, uC1: { value: new THREE.Color() }, uC2: { value: new THREE.Color() }, uC3: { value: new THREE.Color() }, uAtm: { value: new THREE.Color() }, uType: { value: 0 }, uSeed: { value: 0 }, uTime: { value: 0 }, uSpin: { value: 0 },
      uCenter: { value: new THREE.Vector3() }, uR: { value: 1 }, uRing: { value: 0 }, uRingN: { value: new THREE.Vector3(0, 1, 0) }, uRingR: { value: new THREE.Vector2(1.35, 2.45) } };
    const body = new THREE.Mesh(this.geo, new THREE.ShaderMaterial({ uniforms: U, vertexShader: PLANET_VS, fragmentShader: PLANET_FS, defines: { OCT: 5, CLOUDS: 1, CRATERS: 1 } }));
    const atm = new THREE.Mesh(this.geo, new THREE.ShaderMaterial({ uniforms: U, vertexShader: PLANET_VS, fragmentShader: ATM_FS, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    const ring = new THREE.Mesh(this.ringGeo, new THREE.ShaderMaterial({ uniforms: U, vertexShader: RING_VS, fragmentShader: RING_FS, transparent: true, depthWrite: false, side: THREE.DoubleSide, premultipliedAlpha: true, blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor }));
    body.renderOrder = -8; atm.renderOrder = -7.5; ring.renderOrder = -7.4; body.frustumCulled = atm.frustumCulled = ring.frustumCulled = false;
    const g = new THREE.Group(); g.add(body, atm, ring); g.visible = false; this.scene.add(g);
    return { g, body, atm, ring, U, id: null };
  }
  setDetail(q) { // low: 3 octaves, no clouds/craters; medium: clouds; high: everything
    this.detail = q; this.max = q === 'low' ? 1 : q === 'medium' ? 2 : 3;
    for (const s of this.pool) { const m = s.body.material; m.defines = q === 'low' ? { OCT: 3 } : q === 'medium' ? { OCT: 4, CLOUDS: 1 } : { OCT: 5, CLOUDS: 1, CRATERS: 1 }; m.needsUpdate = true; }
  }
  visibleList(cx, cz) {
    const out = []; const ci = Math.floor(cx / PLANET_CELL), cj = Math.floor(cz / PLANET_CELL);
    for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) { const P = planetAt(ci + i, cj + j); if (P) { P.d = Math.hypot(P.x - cx, P.z - cz) - P.R * 2; out.push(P); } }
    out.sort((a, b) => a.d - b.d); return out.slice(0, this.max);
  }
  update(cam, time) {
    const list = this.visibleList(cam.x, cam.z); this.active = list;
    const used = new Set();
    for (const P of list) { let s = this.pool.find((x) => x.id === P.id); if (!s) continue; used.add(s); this.fill(s, P, time); }
    for (const P of list) { if (this.pool.some((x) => x.id === P.id && used.has(x))) continue; const s = this.pool.find((x) => !used.has(x)); if (!s) break; used.add(s); s.id = P.id; this.fill(s, P, time); }
    for (const s of this.pool) if (!used.has(s)) { s.g.visible = false; s.id = null; }
  }
  fill(s, P, time) {
    const U = s.U; s.g.visible = true; s.g.position.set(P.x, P.y, P.z);
    s.body.scale.setScalar(P.R); s.atm.scale.setScalar(P.R * 1.045);
    U.uC1.value.setRGB(...P.T.c[0]); U.uC2.value.setRGB(...P.T.c[1]); U.uC3.value.setRGB(...P.T.c[2]); U.uAtm.value.setRGB(...P.T.atm).multiplyScalar(P.T.type === 4 ? 0.6 : 1);
    U.uType.value = P.T.type; U.uSeed.value = P.seed; U.uTime.value = time; U.uSpin.value = time * P.spin; U.uR.value = P.R; U.uCenter.value.set(P.x, P.y, P.z);
    s.ring.visible = P.ring; U.uRing.value = P.ring ? 1 : 0;
    if (P.ring) { s.ring.scale.setScalar(P.R); s.ring.rotation.set(-Math.PI / 2 + P.tilt, P.tilt2, 0); s.ring.updateMatrixWorld(); U.uRingN.value.set(0, 0, 1).applyQuaternion(s.ring.getWorldQuaternion(this._q ||= new THREE.Quaternion())).normalize(); U.uRingR.value.set(1.35, 2.45); }
  }
}

// ---------------------------------------------------------------- distant asteroids (background) + foreground debris
export class DepthRocks {
  constructor(scene, o) {
    this.o = o; const r = mulberry(o.seed); this.items = [];
    const geo = o.fg ? new THREE.TetrahedronGeometry(1, 0) : makeRockGeometry(901 + o.seed, { detail: 1, craters: 3 });
    const mat = new THREE.MeshStandardMaterial({ color: o.fg ? 0x16181e : 0x8a8580, vertexColors: !o.fg, roughness: 0.95, metalness: 0.05, flatShading: true, fog: !o.fg });
    if (o.fg) mat.emissive = new THREE.Color(0x0a1424);
    this.mesh = new THREE.InstancedMesh(geo, mat, o.count); this.mesh.frustumCulled = false; this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); this.mesh.renderOrder = o.fg ? 30 : -6;
    for (let i = 0; i < o.count; i++) this.items.push({ x: r() * o.L, z: r() * o.L, y: o.y0 + r() * (o.y1 - o.y0), s: o.s0 + r() * (o.s1 - o.s0), rx: r() * 6, ry: r() * 6, w: (r() - 0.5) * 0.3 });
    this.m4 = new THREE.Matrix4(); this.q = new THREE.Quaternion(); this.e = new THREE.Euler(); this.v = new THREE.Vector3(); this.sv = new THREE.Vector3();
    scene.add(this.mesh); this.n = o.count;
  }
  setCount(n) { this.n = Math.min(n, this.o.count); this.mesh.count = this.n; this.mesh.visible = this.n > 0; }
  update(cx, cz, t) {
    if (!this.mesh.visible) return; const L = this.o.L;
    for (let i = 0; i < this.n; i++) { const it = this.items[i];
      const x = cx + ((((it.x - cx) % L) + L) % L) - L / 2, z = cz + ((((it.z - cz) % L) + L) % L) - L / 2;
      this.e.set(it.rx + t * it.w, it.ry + t * it.w * 0.7, 0); this.q.setFromEuler(this.e); this.v.set(x, it.y, z); this.sv.setScalar(it.s); this.m4.compose(this.v, this.q, this.sv); this.mesh.setMatrixAt(i, this.m4); }
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}

export class Environment {
  constructor(scene, keyDir) {
    this.neb = new NebulaLayers(scene);
    this.planets = new Planets(scene, new THREE.Vector3(0.78, 0.3, -0.55));
    this.bgRocks = new DepthRocks(scene, { count: 56, L: 420, y0: -95, y1: -38, s0: 2.2, s1: 7.5, seed: 5 });
    this.fgRocks = new DepthRocks(scene, { count: 14, L: 150, y0: 8, y1: 15, s0: 0.12, s1: 0.32, seed: 9, fg: true });
    this.setQuality('high');
  }
  setQuality(q) {
    this.q = q; this.neb.setCount(q === 'low' ? 1 : q === 'medium' ? 2 : 3); this.planets.setDetail(q);
    this.bgRocks.setCount(q === 'low' ? 0 : q === 'medium' ? 28 : 56); this.fgRocks.setCount(q === 'high' ? 14 : 0);
  }
  update(camera, tint, time) { const c = camera.position; this.neb.update(c, tint, time); this.planets.update(c, time); this.bgRocks.update(c.x, c.z, time); this.fgRocks.update(c.x, c.z, time); }
}

// v16 celestial pack (environment batch 3): Blender-baked equirect maps for the dark planet, the banded gas giant,
// the cratered moon and the star surface, plus a tileable nebula map, the black-hole disc and the ring strip.
// Textures are KTX2 (Basis ETC1S colour / UASTC normals, stays compressed on the GPU) with a WebP fallback; High uses the
// full set, Medium the half set, Low none (the procedural v7 shaders keep running). Everything loads lazily the first
// time a body needs it, and ?env=proc (ENV.enabled false) turns the whole pack off.
import * as THREE from 'three';
import { KTX2Loader } from '../vendor/addons/loaders/KTX2Loader.js';
import { ENV } from './glbenv.js?v=15';
import { GSECTORS } from './galaxy.js?v=15';
import { mulberry, hash2 } from './util.js?v=15';

const P = new URLSearchParams(location.search);
export const SKY = { enabled: ENV.enabled, level: 'full', fmt: P.get('skyfmt') === 'webp' ? 'webp' : 'ktx', base: 'models/sky/', tex: {}, loading: {}, failed: {}, bytes: {}, renderer: null, ver: 's2' };
const DATA = new Set(['dark-normal', 'moon-normal', 'star', 'nebula', 'bhdisc']); // linear maps (the rest are sRGB colour)
const WRAP_BOTH = new Set(['nebula']);
let KTX = null;
export function setSkyRenderer(r) { SKY.renderer = r; }
export function setSkyQuality(q) {
  const lv = !SKY.enabled || q === 'low' ? null : q === 'medium' ? 'half' : 'full';
  if (lv === SKY.level) return; SKY.level = lv;
  for (const k in SKY.tex) SKY.tex[k].dispose(); SKY.tex = {}; SKY.loading = {}; // free the other set (phone texture memory)
}
function prep(t, name) {
  t.colorSpace = DATA.has(name) ? THREE.NoColorSpace : THREE.SRGBColorSpace; t.wrapS = THREE.RepeatWrapping; t.wrapT = WRAP_BOTH.has(name) ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping;
  t.anisotropy = 4; t.minFilter = THREE.LinearMipmapLinearFilter; t.magFilter = THREE.LinearFilter; t.needsUpdate = true; return t;
}
// texture or null; the first call starts the download (the caller keeps its procedural look until it arrives)
export function skyTex(name) {
  if (!SKY.enabled || !SKY.level) return null;
  const key = name + (SKY.level === 'half' ? '-half' : '');
  if (SKY.tex[key]) return SKY.tex[key];
  if (SKY.loading[key] || SKY.failed[key]) return null;
  const lv = SKY.level; let fmt = SKY.fmt; if (fmt === 'ktx' && !SKY.renderer) fmt = 'webp';
  const url = `${SKY.base}${key}.${fmt === 'ktx' ? 'ktx2' : 'webp'}?v=${SKY.ver}`;
  let p;
  if (fmt === 'ktx') {
    KTX ||= new KTX2Loader().setTranscoderPath(new URL('../vendor/addons/libs/basis/', import.meta.url).href).setWorkerLimit(1).detectSupport(SKY.renderer);
    p = new Promise((res, rej) => KTX.load(url, res, undefined, rej));
  } else p = new Promise((res, rej) => new THREE.TextureLoader().load(url, res, undefined, rej));
  SKY.loading[key] = p.then((t) => { if (SKY.level !== lv) { t.dispose(); return; } SKY.tex[key] = prep(t, name); SKY.bytes[key] = (t.image && t.image.width) ? t.image.width * t.image.height : 0; })
    .catch((e) => { SKY.failed[key] = String(e && e.message || e); console.warn('sky texture fallback', key, e && e.message); });
  return null;
}
export function skyStats() { return { level: SKY.level, loaded: Object.keys(SKY.tex), failed: Object.keys(SKY.failed), fmt: SKY.fmt }; }

// ---------------------------------------------------------------- shared lens-flare sprite (starburst) for star / planet limbs
let FLARE = null;
export function flareTexture() {
  if (FLARE) return FLARE; const S = 256; const cv = document.createElement('canvas'); cv.width = cv.height = S; const x = cv.getContext('2d');
  const g = x.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2); g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.08, 'rgba(255,240,210,0.85)'); g.addColorStop(0.3, 'rgba(255,160,70,0.22)'); g.addColorStop(1, 'rgba(0,0,0,0)');
  x.fillStyle = g; x.fillRect(0, 0, S, S); x.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 6; i++) { x.save(); x.translate(S / 2, S / 2); x.rotate(i * Math.PI / 6 + 0.2); const L = i % 3 === 0 ? S * 0.5 : S * 0.3; const gg = x.createLinearGradient(-L, 0, L, 0); gg.addColorStop(0, 'rgba(255,200,140,0)'); gg.addColorStop(0.5, 'rgba(255,235,200,0.55)'); gg.addColorStop(1, 'rgba(255,200,140,0)'); x.fillStyle = gg; x.fillRect(-L, -1.2, L * 2, 2.4); x.restore(); }
  FLARE = new THREE.CanvasTexture(cv); FLARE.colorSpace = THREE.SRGBColorSpace; return FLARE;
}

// ---------------------------------------------------------------- stars (one per sector on ~60% of sectors, far below the play plane)
const NOISE = `float h3(vec3 p){ p=fract(p*0.3183099+.1); p*=17.0; return fract(p.x*p.y*p.z*(p.x+p.y+p.z)); }
  float n3(vec3 x){ vec3 i=floor(x); vec3 f=fract(x); f=f*f*(3.0-2.0*f);
    return mix(mix(mix(h3(i),h3(i+vec3(1,0,0)),f.x),mix(h3(i+vec3(0,1,0)),h3(i+vec3(1,1,0)),f.x),f.y),
               mix(mix(h3(i+vec3(0,0,1)),h3(i+vec3(1,0,1)),f.x),mix(h3(i+vec3(0,1,1)),h3(i+vec3(1,1,1)),f.x),f.y),f.z); }
  float fb(vec3 p){ float s=0.0,a=0.5; for(int i=0;i<4;i++){ s+=a*n3(p); p=p*2.03+vec3(1.7,9.2,3.1); a*=0.5; } return s; }`;
const STAR_VS = `varying vec3 vO; varying vec3 vWN; varying vec3 vWP; void main(){ vO = position; vec4 w = modelMatrix*vec4(position,1.0); vWP = w.xyz; vWN = normalize(mat3(modelMatrix)*normal); gl_Position = projectionMatrix*viewMatrix*w; }`;
const STAR_FS = `uniform sampler2D uTex; uniform float uHas; uniform float uTime; uniform vec3 uHot; uniform vec3 uMid; uniform vec3 uCool; varying vec3 vO; varying vec3 vWN; varying vec3 vWP;
  ${NOISE}
  void main(){
    vec3 p = normalize(vO); float u = atan(p.z, p.x)/6.2831853 + 0.5; float v = asin(clamp(p.y,-1.0,1.0))/3.14159265 + 0.5; float u2 = fract(u+0.5)-0.5; float uu = fwidth(u) < fwidth(u2) + 1e-6 ? u : u2;
    float gran, plasma, spot;
    if (uHas > 0.5) { vec3 a = texture2D(uTex, vec2(uu + uTime*0.0016, v)).rgb; vec3 b = texture2D(uTex, vec2(uu*1.0 - uTime*0.0011 + 0.31, v)).rgb; gran = mix(a.r, b.r, 0.5 + 0.5*sin(uTime*0.4 + a.g*6.0)); plasma = (a.g + b.g)*0.5; spot = a.b; }
    else { gran = fb(p*18.0 + uTime*0.05); plasma = fb(p*3.0 - uTime*0.02); spot = smoothstep(0.7, 0.78, fb(p*2.2)); }
    vec3 n = normalize(vWN); vec3 V = normalize(cameraPosition - vWP); float mu = max(dot(n, V), 0.0);
    float I = clamp(gran*0.55 + plasma*0.75 - spot*0.6, 0.0, 1.4);
    vec3 col = mix(uCool, uMid, smoothstep(0.25, 0.7, I)); col = mix(col, uHot, smoothstep(0.75, 1.15, I));
    col *= 0.55 + 0.45*pow(mu, 0.45); // limb darkening
    col += uMid*pow(1.0 - mu, 3.0)*0.9; // hot limb glow
    gl_FragColor = vec4(col, 1.0);
  }`;
const COR_VS = `varying vec2 vQ; void main(){ vQ = position.xy; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }`;
const COR_FS = `uniform float uTime; uniform float uSeed; uniform vec3 uMid; uniform vec3 uHot; uniform float uFlares; varying vec2 vQ;
  ${NOISE}
  void main(){
    float r = length(vQ); if (r > 1.0) discard; float R = r*5.0; // body radius = 1 in R units (plane = 5 radii)
    float ang = atan(vQ.y, vQ.x);
    float halo = (exp(-max(R - 1.0, 0.0)*4.5) + 0.04*exp(-max(R - 1.0, 0.0)*1.3))*smoothstep(0.97, 1.03, R);
    float c = 0.0;
    if (uFlares > 0.5) {
      vec3 q = vec3(cos(ang)*2.2, sin(ang)*2.2, R*1.8 - uTime*0.12) + uSeed; float f = clamp(1.0 - abs(2.0*fb(q) - 1.0), 0.0, 1.0); float loops = pow(f, 12.0);
      float arc = clamp(1.0 - abs(2.0*fb(vec3(cos(ang)*4.0, sin(ang)*4.0, uSeed + uTime*0.03)) - 1.0), 0.0, 1.0);
      c = loops*(1.0 - smoothstep(1.05, 2.3, R))*smoothstep(0.98, 1.08, R)*(0.5 + 1.5*pow(arc, 4.0));
    }
    vec3 col = uMid*halo*0.3 + mix(uMid, uHot, 0.3)*c*0.28;
    gl_FragColor = vec4(max(col, 0.0)*(1.0 - smoothstep(0.75, 1.0, r)), 1.0);
  }`;
const SCOL = [ // [hot, mid, cool] HDR
  { hot: [2.4, 1.6, 0.8], mid: [1.8, 0.62, 0.1], cool: [0.5, 0.06, 0.01] },   // fiery orange (concept)
  { hot: [2.6, 2.2, 1.5], mid: [2.0, 1.15, 0.32], cool: [0.7, 0.2, 0.03] },    // yellow-white
  { hot: [2.2, 1.2, 0.5], mid: [1.5, 0.36, 0.06], cool: [0.35, 0.03, 0.01] },  // red giant
];
export function starList() {
  const out = [];
  for (const s of GSECTORS) {
    const r = mulberry(hash2(s.id.charCodeAt(0) * 31 + (s.idx || 0), s.ringI, 7177)); if (s.id !== 'H' && r() > 0.6) continue;
    const rm = s.id === 'H' ? 620 : s.rm + (r() - 0.5) * 120, am = s.id === 'H' ? 2.2 : s.am + (r() - 0.5) * 0.3;
    const k = r(); out.push({ id: 'star-' + s.id, sec: s.id, x: Math.cos(am) * rm, z: Math.sin(am) * rm, y: -(1050 + r() * 220), R: 64 + r() * 36, C: SCOL[k < 0.6 ? 0 : k < 0.85 ? 1 : 2], seed: r() * 40 });
  }
  return out;
}
export class SkyStars {
  constructor(scene) {
    this.scene = scene; this.list = starList(); this.max = 2; this.flares = true; this.pool = []; this.active = [];
    this.geo = new THREE.SphereGeometry(1, 48, 24); this.plane = new THREE.PlaneGeometry(2, 2);
    for (let i = 0; i < 2; i++) this.pool.push(this.slot());
  }
  slot() {
    const U = { uTex: { value: null }, uHas: { value: 0 }, uTime: { value: 0 }, uHot: { value: new THREE.Color() }, uMid: { value: new THREE.Color() }, uCool: { value: new THREE.Color() }, uSeed: { value: 0 }, uFlares: { value: 1 } };
    const body = new THREE.Mesh(this.geo, new THREE.ShaderMaterial({ uniforms: U, vertexShader: STAR_VS, fragmentShader: STAR_FS, fog: false }));
    const cor = new THREE.Mesh(this.plane, new THREE.ShaderMaterial({ uniforms: U, vertexShader: COR_VS, fragmentShader: COR_FS, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
    body.renderOrder = -8.5; cor.renderOrder = -8.4; body.frustumCulled = cor.frustumCulled = false;
    const g = new THREE.Group(); g.name = 'sky-star'; g.add(body, cor); g.visible = false; this.scene.add(g); return { g, body, cor, U, id: null };
  }
  setQuality(q) { this.max = !SKY.enabled ? 0 : q === 'high' ? 2 : 1; this.flares = q !== 'low'; }
  update(camera, time) {
    const c = camera.position; const L = this.list.map((S) => ({ S, d: Math.hypot(S.x - c.x, S.z - c.z) })).filter((o) => o.d < 2600).sort((a, b) => a.d - b.d).slice(0, this.max);
    this.active = L.map((o) => o.S); const used = new Set();
    for (const { S } of L) { let s = this.pool.find((x) => x.id === S.id && !used.has(x)) || this.pool.find((x) => !used.has(x) && !L.some((o) => o.S.id === x.id)); if (!s) continue; used.add(s); s.id = S.id; this.fill(s, S, camera, time); }
    for (const s of this.pool) if (!used.has(s)) { s.g.visible = false; s.id = null; }
  }
  fill(s, S, camera, time) {
    const U = s.U; s.g.visible = true; s.g.position.set(S.x, S.y, S.z); s.body.scale.setScalar(S.R); s.cor.scale.setScalar(S.R * 5); s.cor.quaternion.copy(camera.quaternion);
    const t = skyTex('star'); U.uTex.value = t; U.uHas.value = t ? 1 : 0; U.uTime.value = time; U.uSeed.value = S.seed; U.uFlares.value = this.flares ? 1 : 0;
    U.uHot.value.setRGB(...S.C.hot); U.uMid.value.setRGB(...S.C.mid); U.uCool.value.setRGB(...S.C.cool);
  }
}

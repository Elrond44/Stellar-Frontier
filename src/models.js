// Procedural models v2: detailed ships, turrets, pirates, station, asteroid geometry + materials.
import * as THREE from 'three';
import { mergeGeometries } from '../vendor/addons/utils/BufferGeometryUtils.js';
import { mulberry, fbm3 } from './util.js?v=7';

// ================= Procedural textures =================
function mkCanvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
function toTex(c, srgb = true, repeat = true) {
  const t = new THREE.CanvasTexture(c);
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4; return t;
}
// Height field of hull plating -> colour, normal and roughness maps
function panelSet(seed, size = 512) {
  const r = mulberry(seed);
  const hc = mkCanvas(size, size), g = hc.getContext('2d');
  g.fillStyle = 'rgb(128,128,128)'; g.fillRect(0, 0, size, size);
  const plates = [];
  for (let i = 0; i < 90; i++) {
    const x = Math.floor(r() * 16) * 32, y = Math.floor(r() * 16) * 32;
    const w = (1 + Math.floor(r() * 4)) * 32, h = (1 + Math.floor(r() * 3)) * 32;
    const lv = 110 + Math.floor(r() * 50); plates.push([x, y, w, h, lv]);
    g.fillStyle = `rgb(${lv},${lv},${lv})`; g.fillRect(x, y, w, h);
  }
  // seams
  g.strokeStyle = 'rgb(40,40,40)'; g.lineWidth = 2;
  for (const [x, y, w, h] of plates) g.strokeRect(x + 1, y + 1, w - 2, h - 2);
  g.lineWidth = 1; g.strokeStyle = 'rgb(80,80,80)';
  for (let i = 0; i <= 32; i++) { if (r() < 0.5) { g.beginPath(); g.moveTo(i * 16, 0); g.lineTo(i * 16, size); g.stroke(); } }
  // vents (recessed slats)
  for (let i = 0; i < 28; i++) {
    const x = Math.floor(r() * 30) * 16 + 4, y = Math.floor(r() * 30) * 16 + 4, n = 3 + Math.floor(r() * 5), w = 10 + Math.floor(r() * 18);
    g.fillStyle = 'rgb(60,60,60)'; g.fillRect(x - 2, y - 2, w + 4, n * 5 + 3);
    for (let k = 0; k < n; k++) { g.fillStyle = 'rgb(30,30,30)'; g.fillRect(x, y + k * 5, w, 2); g.fillStyle = 'rgb(150,150,150)'; g.fillRect(x, y + k * 5 + 2, w, 1); }
  }
  // hatches / raised boxes
  for (let i = 0; i < 30; i++) { const x = r() * size, y = r() * size, w = 6 + r() * 16, h = 6 + r() * 12; g.fillStyle = 'rgb(175,175,175)'; g.fillRect(x, y, w, h); g.strokeStyle = 'rgb(70,70,70)'; g.strokeRect(x, y, w, h); }
  // rivets
  for (const [x, y, w, h] of plates) if (r() < 0.6) for (let k = 4; k < w - 2; k += 8) { g.fillStyle = 'rgb(200,200,200)'; g.fillRect(x + k, y + 4, 2, 2); g.fillRect(x + k, y + h - 6, 2, 2); }
  const hd = g.getImageData(0, 0, size, size).data;
  const H = (x, y) => hd[(((y + size) % size) * size + ((x + size) % size)) * 4] / 255;
  // normal map
  const nc = mkCanvas(size, size), ng = nc.getContext('2d'); const nd = ng.createImageData(size, size);
  const rc = mkCanvas(size, size), rg = rc.getContext('2d'); const rd = rg.createImageData(size, size);
  const strength = 3.5;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const dx = (H(x + 1, y) - H(x - 1, y)) * strength, dy = (H(x, y + 1) - H(x, y - 1)) * strength;
    const l = Math.hypot(dx, dy, 1); const i = (y * size + x) * 4;
    nd.data[i] = (-dx / l * 0.5 + 0.5) * 255; nd.data[i + 1] = (dy / l * 0.5 + 0.5) * 255; nd.data[i + 2] = (1 / l * 0.5 + 0.5) * 255; nd.data[i + 3] = 255;
    const h = H(x, y); const rough = Math.min(255, 120 + (1 - h) * 120 + (Math.random() * 18));
    const met = Math.min(255, 60 + h * 200 + Math.random() * 16); // v6: B = metalness (bare raised plates/rivets metallic, seams/vents dull)
    rd.data[i] = rough; rd.data[i + 1] = rough; rd.data[i + 2] = met; rd.data[i + 3] = 255;
  }
  ng.putImageData(nd, 0, 0); rg.putImageData(rd, 0, 0);
  // colour map: light-grey tint * height shading + grime
  const cc = mkCanvas(size, size), cg = cc.getContext('2d');
  cg.drawImage(hc, 0, 0); cg.globalCompositeOperation = 'multiply'; cg.fillStyle = 'rgb(225,230,236)'; cg.fillRect(0, 0, size, size);
  cg.globalCompositeOperation = 'source-over';
  for (let i = 0; i < 40; i++) {
    const x = r() * size, y = r() * size, rad = 15 + r() * 60; const gr = cg.createRadialGradient(x, y, 0, x, y, rad);
    gr.addColorStop(0, 'rgba(20,15,10,0.22)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); cg.fillStyle = gr; cg.fillRect(x - rad, y - rad, rad * 2, rad * 2);
  }
  for (let i = 0; i < 400; i++) { cg.fillStyle = `rgba(255,255,255,${r() * 0.08})`; cg.fillRect(r() * size, r() * size, 1 + r() * 3, 1); } // scratches
  // brighten into 0..1 range so material colour controls tone
  cg.globalCompositeOperation = 'screen'; cg.fillStyle = 'rgb(70,70,70)'; cg.fillRect(0, 0, size, size); cg.globalCompositeOperation = 'source-over';
  return { map: toTex(cc), normal: toTex(nc, false), rough: toTex(rc, false) };
}
let TEX = null;
function textures() {
  if (TEX) return TEX;
  const P = panelSet(7);
  TEX = {
    ...P,
    windows: toTex((() => {
      const c = mkCanvas(512, 512), g = c.getContext('2d'); const r = mulberry(99); g.fillStyle = '#000'; g.fillRect(0, 0, 512, 512);
      for (let i = 0; i < 150; i++) {
        const x = Math.floor(r() * 64) * 8, y = Math.floor(r() * 64) * 8, n = 1 + Math.floor(r() * 6);
        g.fillStyle = r() < 0.7 ? '#8feeff' : r() < 0.6 ? '#ffc27a' : '#ffffff';
        for (let k = 0; k < n; k++) g.fillRect(x + k * 6, y, 4, 2);
      }
      return c;
    })()),
    hazard: toTex((() => {
      const c = mkCanvas(128, 128), g = c.getContext('2d'); g.fillStyle = '#16181c'; g.fillRect(0, 0, 128, 128);
      g.fillStyle = '#f2a516'; for (let i = -4; i < 8; i++) { g.beginPath(); g.moveTo(i * 32, 0); g.lineTo(i * 32 + 16, 0); g.lineTo(i * 32 + 16 + 128, 128); g.lineTo(i * 32 + 128, 128); g.closePath(); g.fill(); }
      const r = mulberry(5); for (let i = 0; i < 300; i++) { g.fillStyle = `rgba(0,0,0,${r() * 0.4})`; g.fillRect(r() * 128, r() * 128, 2 + r() * 4, 1 + r() * 2); }
      return c;
    })()),
    livery: toTex((() => {
      const c = mkCanvas(256, 256), g = c.getContext('2d'); g.fillStyle = '#9a9a9a'; g.fillRect(0, 0, 256, 256);
      g.fillStyle = '#2a2a2a'; for (let i = 0; i < 6; i++) { g.beginPath(); g.moveTo(i * 48, 0); g.lineTo(i * 48 + 22, 0); g.lineTo(i * 48 - 40, 256); g.lineTo(i * 48 - 62, 256); g.closePath(); g.fill(); }
      const r = mulberry(8); for (let i = 0; i < 500; i++) { g.fillStyle = `rgba(0,0,0,${r() * 0.3})`; g.fillRect(r() * 256, r() * 256, 2, 2); }
      return c;
    })()),
    solar: toTex((() => {
      const c = mkCanvas(256, 256), g = c.getContext('2d'); g.fillStyle = '#9aa4b0'; g.fillRect(0, 0, 256, 256);
      for (let y = 0; y < 8; y++) for (let x = 0; x < 4; x++) {
        const gr = g.createLinearGradient(x * 64, y * 32, x * 64 + 64, y * 32 + 32); gr.addColorStop(0, '#2a62c8'); gr.addColorStop(0.5, '#173b8a'); gr.addColorStop(1, '#0e2660');
        g.fillStyle = gr; g.fillRect(x * 64 + 2, y * 32 + 2, 60, 28);
        g.strokeStyle = 'rgba(160,200,255,0.25)'; for (let k = 1; k < 4; k++) { g.beginPath(); g.moveTo(x * 64 + 2 + k * 15, y * 32 + 2); g.lineTo(x * 64 + 2 + k * 15, y * 32 + 30); g.stroke(); }
      }
      return c;
    })()),
    glow: toTex((() => {
      const c = mkCanvas(64, 64), g = c.getContext('2d'); const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
      gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.25, 'rgba(255,255,255,0.6)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, 64, 64); return c;
    })(), false, false),
    star: toTex((() => {
      const c = mkCanvas(64, 64), g = c.getContext('2d'); const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
      gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.15, 'rgba(255,255,255,0.5)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
      g.globalCompositeOperation = 'lighter'; g.fillStyle = 'rgba(255,255,255,0.7)'; g.fillRect(31, 2, 2, 60); g.fillRect(2, 31, 60, 2); return c;
    })(), false, false),
  };
  return TEX;
}

let MATS = null;
export function materials() {
  if (MATS) return MATS;
  const T = textures(); const hdr = (r, g, b) => new THREE.Color(r, g, b);
  const std = (o) => new THREE.MeshStandardMaterial({ map: T.map, normalMap: T.normal, roughnessMap: T.rough, metalnessMap: T.rough, envMapIntensity: 1.25, normalScale: new THREE.Vector2(0.9, 0.9), ...o });
  MATS = {
    hull: std({ color: 0x8e96a0, metalness: 0.8, roughness: 0.72, emissive: 0xffffff, emissiveMap: T.windows, emissiveIntensity: 1.5 }),
    dark: std({ color: 0x4a515b, metalness: 0.95, roughness: 0.62 }),
    orange: std({ color: 0xff7a26, metalness: 0.3, roughness: 0.65, emissive: 0x3a1000, emissiveIntensity: 0.5 }),
    hazard: new THREE.MeshStandardMaterial({ map: T.hazard, metalness: 0.3, roughness: 0.6 }),
    glass: new THREE.MeshStandardMaterial({ color: 0x0a1a24, metalness: 0.9, roughness: 0.08, emissive: 0x1a8fb0, emissiveIntensity: 1.1 }),
    glow: new THREE.MeshBasicMaterial({ color: hdr(0.5, 2.6, 3.6) }),
    glowSoft: new THREE.MeshBasicMaterial({ color: hdr(0.25, 1.1, 1.5) }),
    white: new THREE.MeshBasicMaterial({ color: hdr(2.2, 2.2, 2.4) }),
    amber: new THREE.MeshBasicMaterial({ color: hdr(3.2, 1.6, 0.4) }),
    red: new THREE.MeshBasicMaterial({ color: hdr(3.5, 0.35, 0.3) }),
    redSoft: new THREE.MeshBasicMaterial({ color: hdr(1.4, 0.12, 0.1) }),
    green: new THREE.MeshBasicMaterial({ color: hdr(0.5, 3.0, 1.0) }),
    pirate: std({ color: 0x5c4246, metalness: 0.8, roughness: 0.68, emissive: 0xff2030, emissiveMap: T.windows, emissiveIntensity: 1.3 }),
    pirateAccent: new THREE.MeshStandardMaterial({ color: 0xc8242c, map: T.livery, normalMap: T.normal, metalness: 0.35, roughness: 0.5, emissive: 0x5a0008, emissiveIntensity: 1.0 }),
    pirateBone: std({ color: 0xb8ad9a, metalness: 0.3, roughness: 0.75 }),
    pirateDark: std({ color: 0x24181a, metalness: 0.95, roughness: 0.55 }),
    solar: new THREE.MeshStandardMaterial({ map: T.solar, metalness: 0.8, roughness: 0.25, emissive: 0x0a2a6a, emissiveIntensity: 0.5, side: THREE.DoubleSide }),
  };
  return MATS;
}
export const glowTexture = () => textures().glow;
export const starTexture = () => textures().star;

// ================= Kit: collect parts, merge per material =================
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _p = new THREE.Vector3(), _s = new THREE.Vector3();
function scaleUV(geo, su, sv) { const uv = geo.attributes.uv; if (!uv) return; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * su, uv.getY(i) * sv); }
function boxGeo(w, h, d) {
  const g = new THREE.BoxGeometry(w, h, d); const uv = g.attributes.uv; const k = 1 / 4;
  const dims = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
  for (let f = 0; f < 6; f++) for (let v = 0; v < 4; v++) { const i = f * 4 + v; uv.setXY(i, uv.getX(i) * dims[f][0] * k + f * 0.37, uv.getY(i) * dims[f][1] * k + f * 0.21); }
  return g;
}
export class Kit {
  constructor() { this.parts = {}; this.engines = []; this.extras = []; this.lights = []; }
  add(mat, geo, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) {
    _e.set(rx, ry, rz); _q.setFromEuler(_e); _p.set(x, y, z); _s.set(sx, sy, sz); _m.compose(_p, _q, _s); geo.applyMatrix4(_m);
    if (geo.index) geo = geo.toNonIndexed();
    for (const k of Object.keys(geo.attributes)) if (!['position', 'normal', 'uv'].includes(k)) geo.deleteAttribute(k);
    if (!geo.attributes.uv) geo.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(geo.attributes.position.count * 2), 2));
    if (!geo.attributes.normal) geo.computeVertexNormals();
    if (typeof mat !== 'string') { (this.mo ||= {})[mat.uuid] = mat; mat = mat.uuid; }
    (this.parts[mat] ||= []).push(geo); return this;
  }
  box(mat, w, h, d, x, y, z, rx, ry, rz) { return this.add(mat, boxGeo(w, h, d), x, y, z, rx, ry, rz); }
  // bevelled armour plate (chamfered box)
  plate(mat, w, h, d, x, y, z, ry = 0, ch = 0.25) {
    const c = Math.min(w, d) * ch; const s = new THREE.Shape();
    s.moveTo(-w / 2 + c, -d / 2); s.lineTo(w / 2 - c, -d / 2); s.lineTo(w / 2, -d / 2 + c); s.lineTo(w / 2, d / 2 - c); s.lineTo(w / 2 - c, d / 2); s.lineTo(-w / 2 + c, d / 2); s.lineTo(-w / 2, d / 2 - c); s.lineTo(-w / 2, -d / 2 + c); s.closePath();
    const g = new THREE.ExtrudeGeometry(s, { depth: h, bevelEnabled: true, bevelThickness: h * 0.25, bevelSize: Math.min(h * 0.35, c * 0.5), bevelSegments: 1 });
    g.rotateX(-Math.PI / 2); g.translate(0, -h / 2, 0); scaleUV(g, 0.25, 0.25);
    return this.add(mat, g, x, y, z, 0, ry, 0);
  }
  cyl(mat, rt, rb, h, seg, x, y, z, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) {
    const g = new THREE.CylinderGeometry(rt, rb, h, seg); scaleUV(g, Math.PI * 2 * Math.max(rt, rb) / 4, h / 4);
    return this.add(mat, g, x, y, z, rx, ry, rz, sx, sy, sz);
  }
  zcyl(mat, rt, rb, len, seg, x, y, z, sx = 1, sy = 1) { return this.cyl(mat, rt, rb, len, seg, x, y, z, Math.PI / 2, 0, 0, sx, 1, sy); }
  xcyl(mat, r, len, seg, x, y, z) { return this.cyl(mat, r, r, len, seg, x, y, z, 0, 0, Math.PI / 2); }
  sphere(mat, r, x, y, z, sx = 1, sy = 1, sz = 1, ws = 12, hs = 8) { const g = new THREE.SphereGeometry(r, ws, hs); scaleUV(g, r * 1.5, r); return this.add(mat, g, x, y, z, 0, 0, 0, sx, sy, sz); }
  slab(mat, pts, h, y = 0) {
    const shape = new THREE.Shape(); pts.forEach(([x, z], i) => (i ? shape.lineTo(x, -z) : shape.moveTo(x, -z)));
    const g = new THREE.ExtrudeGeometry(shape, { depth: h, bevelEnabled: true, bevelThickness: h * 0.18, bevelSize: h * 0.18, bevelSegments: 1 });
    g.rotateX(-Math.PI / 2); g.translate(0, y - h / 2, 0); scaleUV(g, 0.25, 0.25); return this.add(mat, g);
  }
  engine(x, y, z, r, len = 0.6) {
    this.zcyl('dark', r * 1.18, r * 0.92, len, 14, x, y, z + len / 2);
    const ring = new THREE.TorusGeometry(r * 1.12, r * 0.12, 6, 16); this.add('orange', ring, x, y, z + len * 0.85);
    this.zcyl('hull', r * 1.25, r * 1.25, len * 0.18, 14, x, y, z + len * 0.4);
    this.zcyl('glow', r * 0.82, r * 0.82, 0.06, 14, x, y, z - 0.02);
    this.engines.push({ x, y, z: z - 0.05, r });
  }
  vent(x, y, z, w, d, n = 4, ry = 0) {
    this.box('dark', w, 0.08, d, x, y, z, 0, ry, 0);
    for (let i = 0; i < n; i++) { const off = (i - (n - 1) / 2) * d / n; this.box('hull', w * 0.9, 0.06, d / n * 0.4, x + Math.sin(ry) * off, y + 0.05, z + Math.cos(ry) * off, 0, ry, 0); }
  }
  pipe(x0, y, z0, x1, z1, r = 0.06) {
    const len = Math.hypot(x1 - x0, z1 - z0); const a = Math.atan2(x1 - x0, z1 - z0);
    const pg = new THREE.CylinderGeometry(r, r, len, 6); pg.rotateX(Math.PI / 2); pg.rotateY(a); this.add('dark', pg, (x0 + x1) / 2, y, (z0 + z1) / 2);
    for (const t of [0.15, 0.5, 0.85]) { const cg = new THREE.CylinderGeometry(r * 1.5, r * 1.5, r * 1.6, 6); cg.rotateX(Math.PI / 2); cg.rotateY(a); this.add('orange', cg, x0 + (x1 - x0) * t, y, z0 + (z1 - z0) * t); }
  }
  dish(x, y, z, r, tilt = 0.6, ry = 0) {
    this.cyl('dark', r * 0.08, r * 0.1, r * 0.8, 6, x, y + r * 0.4, z);
    const g = new THREE.SphereGeometry(r, 12, 6, 0, Math.PI * 2, 0, Math.PI * 0.35); g.scale(1, 0.5, 1); g.rotateX(Math.PI); g.rotateX(tilt); g.rotateY(ry);
    this.add('hull', g, x, y + r * 0.9, z); this.cyl('dark', r * 0.03, r * 0.03, r * 0.7, 4, x, y + r * 1.1, z, tilt, ry, 0);
  }
  antenna(x, y, z, h, light = true) { this.cyl('dark', 0.035, 0.05, h, 4, x, y + h / 2, z); this.box('dark', 0.25, 0.04, 0.04, x, y + h * 0.7, z); if (light) this.lights.push({ x, y: y + h + 0.05, z, color: 0xff3030, mode: 'blink', size: 0.9 }); }
  windows(x, y, z, len, n, axis = 'z') {
    for (let i = 0; i < n; i++) { const o = (i - (n - 1) / 2) * len / n; this.box('glowSoft', axis === 'z' ? 0.04 : len / n * 0.55, 0.07, axis === 'z' ? len / n * 0.55 : 0.04, x + (axis === 'x' ? o : 0), y, z + (axis === 'z' ? o : 0)); }
  }
  hazard(w, h, d, x, y, z, ry = 0) { return this.box('hazard', w, h, d, x, y, z, 0, ry, 0); }
  navLights(x, y, z0, z1) {
    this.lights.push({ x: -x, y, z: z0, color: 0xff2020, mode: 'blink', size: 1 }, { x, y, z: z0, color: 0x20ff60, mode: 'blink', size: 1 }, { x: 0, y: y + 0.1, z: z1, color: 0xffffff, mode: 'strobe', size: 1.2 });
  }
  // scatter assorted surface detail over a rectangle on a deck at height y
  dress(rng, x0, x1, z0, z1, y, n, s = 0.3) {
    for (let i = 0; i < n; i++) {
      const x = x0 + rng() * (x1 - x0), z = z0 + rng() * (z1 - z0), t = rng();
      if (t < 0.28) { const w = s * (0.6 + rng() * 1.4), d = s * (0.5 + rng() * 2), h = s * (0.2 + rng() * 0.7); this.box(rng() < 0.2 ? 'orange' : 'dark', w, h, d, x, y + h / 2, z); }
      else if (t < 0.45) this.vent(x, y + 0.02, z, s * (1 + rng()), s * (1 + rng() * 1.5), 3 + Math.floor(rng() * 3));
      else if (t < 0.58) this.cyl('dark', s * 0.35, s * 0.4, s * 0.5, 8, x, y + s * 0.25, z);
      else if (t < 0.66) this.plate('hull', s * (1.2 + rng()), s * 0.18, s * (1.5 + rng() * 2), x, y + s * 0.09, z);
      else if (t < 0.72) this.hazard(s * 1.6, s * 0.06, s * 0.35, x, y + 0.03, z);
      else if (t < 0.8) this.box('glowSoft', s * 0.15, s * 0.1, s * 0.6, x, y + 0.05, z);
      else if (t < 0.88) this.sphere('dark', s * 0.35, x, y, z, 1, 0.6, 1, 8, 5);
      else this.box('hull', s * 0.5, s * 0.5, s * 0.5, x, y + s * 0.25, z);
    }
  }
  build() {
    const M = materials(); const g = new THREE.Group();
    for (const [mat, geos] of Object.entries(this.parts)) { const merged = mergeGeometries(geos, false); g.add(new THREE.Mesh(merged, M[mat] || (this.mo && this.mo[mat]))); }
    for (const e of this.extras) g.add(e);
    if (this.lights.length) {
      const lg = new THREE.Group(); lg.name = 'navLights'; const T = textures();
      for (const l of this.lights) {
        const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: T.glow, color: l.color, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
        sp.position.set(l.x, l.y, l.z); sp.scale.setScalar(l.size); sp.userData = { mode: l.mode, phase: (l.x * 1.7 + l.z * 0.3) % 6 }; lg.add(sp);
      }
      g.add(lg);
    }
    return g;
  }
}
export function animateNavLights(group, t) {
  let L = group._navs; if (!L) { L = group._navs = []; group.traverse((o) => { if (o.name === 'navLights') L.push(o); }); }
  for (const lg of L) for (const s of lg.children) {
    const u = s.userData; let a;
    if (u.mode === 'strobe') a = ((t * 1.3 + u.phase) % 1.5) < 0.08 ? 1 : 0.05;
    else a = 0.25 + 0.75 * Math.max(0, Math.sin(t * 3.2 + u.phase));
    s.material.opacity = a;
  }
}
export function disposeObject(obj, keepMaterials = true) {
  obj.traverse((o) => {
    if (o.geometry && !o.geometry.userData.shared) o.geometry.dispose();
    if (!keepMaterials && o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => m.dispose());
    if (o.isSprite && o.material && o.material.userData.own) o.material.dispose();
  });
}

// ================= Turrets =================
export function makeTurret(kind = 'cannon', size = 1, palette = 'player') {
  const s = size; const base = new Kit(), bar = new Kit();
  const H = palette === 'player' ? 'dark' : 'pirateDark', A = palette === 'player' ? 'orange' : 'pirateAccent', P = palette === 'player' ? 'hull' : 'pirate';
  base.cyl(H, 0.42 * s, 0.5 * s, 0.14 * s, 14, 0, 0.07 * s, 0);
  base.add(A, new THREE.TorusGeometry(0.44 * s, 0.035 * s, 4, 16), 0, 0.15 * s, 0, Math.PI / 2);
  let muzzle;
  if (kind === 'laser') {
    base.plate(P, 0.5 * s, 0.3 * s, 0.6 * s, 0, 0.32 * s, 0, 0, 0.3);
    base.box(A, 0.52 * s, 0.06 * s, 0.2 * s, 0, 0.5 * s, -0.12 * s);
    base.zcyl('dark', 0.2 * s, 0.2 * s, 0.16 * s, 10, 0.28 * s, 0.34 * s, -0.05 * s);
    bar.zcyl('dark', 0.08 * s, 0.13 * s, 0.75 * s, 10, 0, 0.36 * s, 0.6 * s);
    for (const z of [0.4, 0.62, 0.84]) bar.zcyl('hull', 0.12 * s, 0.12 * s, 0.05 * s, 10, 0, 0.36 * s, z * s);
    bar.zcyl('glow', 0.065 * s, 0.065 * s, 0.06 * s, 10, 0, 0.36 * s, 0.99 * s);
    bar.add('glowSoft', new THREE.TorusGeometry(0.1 * s, 0.018 * s, 4, 12), 0, 0.36 * s, 0.97 * s);
    muzzle = new THREE.Vector3(0, 0.36 * s, 1.02 * s);
  } else if (kind === 'missile') {
    base.plate(P, 0.6 * s, 0.22 * s, 0.6 * s, 0, 0.26 * s, 0);
    bar.box(A, 0.8 * s, 0.42 * s, 0.75 * s, 0, 0.55 * s, 0.05 * s);
    bar.hazard(0.82 * s, 0.08 * s, 0.12 * s, 0, 0.55 * s, -0.33 * s);
    for (let i = 0; i < 3; i++) for (let j = 0; j < 2; j++) { bar.zcyl('dark', 0.09 * s, 0.09 * s, 0.1 * s, 8, (i - 1) * 0.24 * s, (0.46 + j * 0.2) * s, 0.43 * s); bar.zcyl('red', 0.05 * s, 0.05 * s, 0.02 * s, 6, (i - 1) * 0.24 * s, (0.46 + j * 0.2) * s, 0.49 * s); }
    muzzle = new THREE.Vector3(0, 0.55 * s, 0.5 * s);
  } else if (kind === 'pulse') {
    base.cyl(P, 0.36 * s, 0.44 * s, 0.25 * s, 14, 0, 0.27 * s, 0);
    bar.sphere('dark', 0.3 * s, 0, 0.5 * s, 0, 1, 0.8, 1, 14, 8);
    bar.add('glow', new THREE.TorusGeometry(0.38 * s, 0.05 * s, 6, 20), 0, 0.5 * s, 0, Math.PI / 2);
    bar.add('glowSoft', new THREE.TorusGeometry(0.46 * s, 0.025 * s, 4, 20), 0, 0.42 * s, 0, Math.PI / 2);
    for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2 + 0.78; bar.box('hull', 0.08 * s, 0.32 * s, 0.08 * s, Math.sin(a) * 0.36 * s, 0.55 * s, Math.cos(a) * 0.36 * s); }
    muzzle = new THREE.Vector3(0, 0.5 * s, 0);
  } else {
    base.plate(P, 0.62 * s, 0.32 * s, 0.68 * s, 0, 0.33 * s, -0.02 * s, 0, 0.3);
    base.box(A, 0.64 * s, 0.07 * s, 0.25 * s, 0, 0.52 * s, -0.15 * s);
    base.box('glass', 0.16 * s, 0.08 * s, 0.05 * s, 0.18 * s, 0.42 * s, 0.33 * s);
    for (const x of [-0.13, 0.13]) {
      bar.zcyl('dark', 0.055 * s, 0.075 * s, 0.85 * s, 8, x * s, 0.36 * s, 0.68 * s);
      bar.zcyl('hull', 0.085 * s, 0.085 * s, 0.14 * s, 8, x * s, 0.36 * s, 1.06 * s); // muzzle brake
      bar.zcyl('dark', 0.09 * s, 0.09 * s, 0.1 * s, 8, x * s, 0.36 * s, 0.36 * s);
    }
    muzzle = new THREE.Vector3(0, 0.36 * s, 1.15 * s);
  }
  const g = base.build(); const b = bar.build(); b.name = 'barrel'; g.add(b);
  g.userData.muzzle = muzzle; g.userData.kind = kind; g.userData.barrel = b; g.userData.size = s;
  return g;
}

// ================= Player ships =================
export function buildShip(tier) {
  const k = new Kit(); const rng = mulberry(1000 + tier * 17); let hard = []; let length = 4; const extraTurrets = [];
  if (tier === 1) {
    length = 4;
    k.slab('hull', [[0, 2.2], [0.55, 1.2], [0.75, -1.4], [-0.75, -1.4], [-0.55, 1.2]], 0.55, 0);
    k.slab('orange', [[0, 2.05], [0.34, 1.25], [-0.34, 1.25]], 0.1, 0.36);
    k.plate('dark', 0.9, 0.12, 1.4, 0, 0.36, -0.4);
    k.box('glass', 0.42, 0.22, 0.7, 0, 0.44, 0.5, -0.15);
    k.box('dark', 2.9, 0.1, 0.75, 0, -0.05, -0.55);
    k.hazard(0.5, 0.04, 0.12, 0, 0.44, -1.05);
    for (const sx of [-1, 1]) {
      k.plate('hull', 0.55, 0.5, 1.8, sx * 1.15, 0, -0.55);
      k.box('orange', 0.08, 0.32, 1.1, sx * 1.44, 0.02, -0.45);
      k.box('orange', 0.5, 0.06, 0.5, sx * 1.15, 0.28, -0.1);
      k.vent(sx * 1.15, 0.29, -0.8, 0.35, 0.5, 3);
      k.box('dark', 0.3, 0.05, 0.35, sx * 1.62, -0.05, -0.55);
      k.engine(sx * 1.15, 0, -1.45, 0.22, 0.4);
    }
    k.engine(0, 0.05, -1.5, 0.26, 0.4);
    k.dress(rng, -0.35, 0.35, -1.1, 0.0, 0.42, 6, 0.18);
    k.antenna(-0.3, 0.42, -0.9, 0.6); k.windows(0.36, 0.2, 0.3, 0.8, 4);
    k.navLights(1.75, 0, -0.55, -1.4);
    hard = [{ x: 0, y: 0.34, z: 1.15, size: 0.8 }];
  } else if (tier === 2) {
    length = 6;
    k.slab('hull', [[0, 3.0], [0.9, 2.0], [1.0, -2.6], [-1.0, -2.6], [-0.9, 2.0]], 0.85, 0);
    k.slab('dark', [[0, 2.6], [0.65, 1.8], [0.7, -2.3], [-0.7, -2.3], [-0.65, 1.8]], 0.3, 0.55);
    k.plate('orange', 1.5, 0.75, 1.9, 0, 0.95, -1.2);
    for (const z of [-0.6, -1.2, -1.8]) k.box('dark', 1.58, 0.1, 0.1, 0, 1.34, z);
    k.hazard(1.52, 0.06, 0.3, 0, 1.36, -0.25);
    k.box('glass', 0.7, 0.28, 0.8, 0, 0.75, 1.6, -0.12);
    k.plate('hull', 0.9, 0.3, 1.2, 0, 0.82, 0.4);
    k.dish(0.45, 1.0, 0.3, 0.35, 0.6, 0.8);
    for (const sx of [-1, 1]) {
      k.box('dark', 0.5, 0.4, 1.2, sx * 1.15, 0, 0.6);
      k.box('hull', 0.32, 0.32, 1.9, sx * 1.55, 0, 1.6, 0, sx * -0.12);
      k.pipe(sx * 1.35, 0.22, 0.6, sx * 1.62, 2.4, 0.05);
      k.plate('orange', 0.55, 0.45, 0.65, sx * 1.7, 0, 2.6);
      k.hazard(0.56, 0.05, 0.15, sx * 1.7, 0.25, 2.35);
      k.box('dark', 0.12, 0.18, 0.75, sx * 1.48, 0, 3.05, 0, sx * 0.4);
      k.box('dark', 0.12, 0.18, 0.75, sx * 1.95, 0, 3.0, 0, sx * -0.3);
      k.plate('hull', 0.75, 0.75, 2.3, sx * 1.35, 0, -1.6);
      k.box('orange', 0.08, 0.5, 1.4, sx * 1.74, 0, -1.5);
      k.vent(sx * 1.35, 0.4, -2.0, 0.5, 0.7, 4);
      k.windows(sx * 1.02, 0.25, -0.2, 1.6, 6);
      k.engine(sx * 1.35, 0, -2.8, 0.3, 0.5);
    }
    k.engine(0, 0.1, -2.8, 0.36, 0.5);
    k.dress(rng, -0.55, 0.55, -2.2, 0.1, 0.62, 10, 0.25);
    k.antenna(-0.4, 1.32, -1.6, 1.0); k.antenna(0.5, 1.32, -0.8, 0.6, false);
    k.navLights(2.05, 0.1, -1.6, -2.6);
    hard = [{ x: -1.7, y: 0.25, z: 2.55, size: 0.85 }, { x: 1.7, y: 0.25, z: 2.55, size: 0.85 }];
  } else if (tier === 3) {
    length = 9;
    k.slab('hull', [[0, 4.6], [0.8, 3.2], [1.5, 0.5], [1.6, -3.8], [-1.6, -3.8], [-1.5, 0.5], [-0.8, 3.2]], 1.0, 0);
    k.slab('dark', [[0, 4.1], [0.6, 3.0], [1.1, 0.4], [1.1, -3.5], [-1.1, -3.5], [-1.1, 0.4], [-0.6, 3.0]], 0.5, 0.65);
    k.slab('orange', [[0, 4.35], [0.42, 3.4], [-0.42, 3.4]], 0.12, 0.62);
    for (const sx of [-1, 1]) { k.box('orange', 0.12, 0.2, 2.6, sx * 1.42, 0.35, -1.5); k.windows(sx * 1.56, 0.1, -0.8, 3.6, 10); }
    // bridge tower
    k.plate('hull', 1.4, 0.7, 1.9, 0, 1.25, -1.0);
    k.plate('hull', 1.0, 0.6, 1.2, 0, 1.85, -1.2);
    k.box('glass', 0.85, 0.18, 0.2, 0, 1.85, -0.6);
    k.plate('orange', 1.05, 0.12, 1.25, 0, 2.22, -1.2);
    k.windows(0, 1.35, -0.04, 1.1, 5, 'x');
    k.dish(0.35, 2.28, -1.4, 0.32, 0.5, -0.6); k.antenna(-0.3, 2.28, -1.5, 1.3);
    for (const sx of [-1, 1]) {
      k.zcyl('orange', 0.5, 0.5, 2.0, 12, sx * 2.05, 0, -0.9);
      for (const z of [-0.2, -0.9, -1.6]) k.zcyl('dark', 0.53, 0.53, 0.12, 12, sx * 2.05, 0, z);
      k.hazard(0.3, 0.05, 1.6, sx * 2.05, 0.5, -0.9);
      k.box('dark', 0.5, 0.3, 0.6, sx * 1.7, 0, -0.9);
      k.plate('hull', 0.85, 0.85, 2.1, sx * 1.25, 0, -3.0);
      k.box('orange', 0.08, 0.5, 1.2, sx * 1.69, 0, -2.9);
      k.vent(sx * 1.25, 0.45, -3.2, 0.55, 0.9, 5);
      k.pipe(sx * 0.6, 0.95, 0.4, sx * 0.6, -2.6, 0.06);
      k.engine(sx * 1.25, 0.1, -4.05, 0.33, 0.5);
      k.engine(sx * 0.45, 0.1, -4.0, 0.3, 0.5);
    }
    k.dress(rng, -0.85, 0.85, 0.4, 2.7, 0.92, 16, 0.3);
    k.dress(rng, -0.85, 0.85, -3.4, -2.0, 0.92, 10, 0.3);
    k.navLights(2.6, 0.2, -0.9, -3.8);
    hard = [{ x: 0, y: 0.9, z: 2.3, size: 1.25 }, { x: -0.95, y: 0.9, z: 0.4, size: 1.1 }, { x: 0.95, y: 0.9, z: 0.4, size: 1.1 }];
  } else if (tier === 4) {
    length = 12;
    k.slab('hull', [[0, 6.2], [1.0, 4.6], [2.0, 1.0], [2.1, -5.2], [-2.1, -5.2], [-2.0, 1.0], [-1.0, 4.6]], 1.3, 0);
    k.slab('dark', [[0, 5.6], [0.8, 4.2], [1.5, 1.0], [1.5, -4.8], [-1.5, -4.8], [-1.5, 1.0], [-0.8, 4.2]], 0.6, 0.85);
    k.slab('orange', [[0, 5.95], [0.55, 4.8], [-0.55, 4.8]], 0.14, 0.8);
    for (const sx of [-1, 1]) { k.windows(sx * 2.06, 0.2, -2.0, 5, 14); k.box('orange', 0.14, 0.24, 3.2, sx * 1.85, 0.45, -2.6); }
    // tower
    k.plate('hull', 1.9, 0.8, 2.5, 0, 1.5, -1.6);
    k.plate('hull', 1.4, 0.7, 1.6, 0, 2.2, -1.8);
    k.plate('hull', 0.9, 0.6, 1.0, 0, 2.8, -1.9);
    k.box('glass', 1.15, 0.2, 0.2, 0, 2.25, -1.0);
    k.windows(0, 1.6, -0.34, 1.6, 7, 'x');
    k.plate('orange', 1.4, 0.12, 0.35, 0, 2.6, -1.2);
    k.dish(0.45, 3.1, -2.0, 0.45, 0.5, 0.7); k.antenna(-0.3, 3.1, -2.1, 1.6); k.antenna(0.15, 3.1, -2.3, 1.0, false);
    for (const sx of [-1, 1]) {
      // missile racks
      k.plate('dark', 0.95, 0.5, 1.5, sx * 0.85, 1.2, 1.6);
      for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) k.box('red', 0.16, 0.06, 0.16, sx * 0.85 + (i - 1) * 0.26, 1.48, 1.15 + j * 0.42);
      k.hazard(0.95, 0.05, 0.14, sx * 0.85, 1.47, 2.4);
      // outrigger nacelles on pylons
      k.box('dark', 1.7, 0.35, 1.1, sx * 2.6, 0, -2.0);
      k.pipe(sx * 2.0, 0.25, -1.7, sx * 3.2, -1.7, 0.07);
      k.zcyl('hull', 0.78, 0.78, 4.4, 14, sx * 3.5, 0, -2.4);
      k.zcyl('orange', 0.81, 0.81, 1.0, 14, sx * 3.5, 0, -1.6);
      for (const z of [-0.9, -2.5, -3.6]) k.zcyl('dark', 0.82, 0.82, 0.12, 14, sx * 3.5, 0, z);
      k.zcyl('dark', 0.5, 0.75, 0.7, 14, sx * 3.5, 0, 0.15);
      k.vent(sx * 3.5, 0.75, -3.0, 0.6, 1.0, 5);
      k.engine(sx * 3.5, 0, -4.65, 0.58, 0.6);
      // drone bays
      k.plate('hull', 0.95, 0.95, 2.3, sx * 2.2, 0.15, 1.0);
      k.box('glowSoft', 0.05, 0.5, 1.6, sx * 2.69, 0.15, 1.0);
      k.hazard(0.06, 0.12, 1.8, sx * 2.69, 0.55, 1.0);
      k.engine(sx * 1.0, 0.1, -5.35, 0.4, 0.5);
    }
    k.engine(0, 0.2, -5.35, 0.45, 0.5);
    k.dress(rng, -1.2, 1.2, 2.6, 4.2, 1.15, 18, 0.32);
    k.dress(rng, -1.2, 1.2, -4.6, -3.0, 1.15, 16, 0.35);
    k.navLights(4.3, 0.4, -2.0, -5.2);
    hard = [{ x: 0, y: 1.15, z: 3.4, size: 1.6 }, { x: -1.15, y: 1.15, z: -0.2, size: 1.45 }, { x: 1.15, y: 1.15, z: -0.2, size: 1.45 }, { x: 0, y: 1.15, z: -3.6, size: 1.45 }];
  } else {
    length = 18;
    k.slab('hull', [[0, 9], [1.4, 7.4], [4.2, 1.5], [4.4, -7.6], [-4.4, -7.6], [-4.2, 1.5], [-1.4, 7.4]], 1.5, 0);
    k.slab('dark', [[0, 8.2], [1.1, 6.8], [3.4, 1.4], [3.5, -7.0], [-3.5, -7.0], [-3.4, 1.4], [-1.1, 6.8]], 0.5, 1.0);
    k.slab('orange', [[0, 8.65], [0.8, 7.2], [-0.8, 7.2]], 0.16, 0.95);
    // flight deck with runway lights + hazard stripes
    k.box('dark', 1.7, 0.1, 9.5, 0, 1.3, 2.0);
    for (let i = 0; i < 10; i++) { k.box('glowSoft', 0.1, 0.04, 0.3, -0.7, 1.38, -2.4 + i * 1.0); k.box('glowSoft', 0.1, 0.04, 0.3, 0.7, 1.38, -2.4 + i * 1.0); }
    k.hazard(1.7, 0.04, 0.4, 0, 1.38, 6.6); k.hazard(1.7, 0.04, 0.4, 0, 1.38, -2.6);
    // armour belts along the sides
    for (const sx of [-1, 1]) for (let i = 0; i < 5; i++) k.plate(i % 2 ? 'hull' : 'dark', 0.5, 1.1, 2.6, sx * (3.9 + (i < 2 ? -0.6 + i * 0.3 : 0.3)), 0.2, 4.6 - i * 2.6, sx * 0.05);
    // command tower (offset starboard like a carrier island)
    k.plate('hull', 2.5, 1.0, 3.3, 2.0, 1.8, -3.0);
    k.plate('hull', 1.9, 0.9, 2.3, 2.0, 2.7, -3.2);
    k.plate('hull', 1.3, 0.8, 1.5, 2.0, 3.5, -3.3);
    k.cyl('dark', 0.6, 0.7, 0.6, 12, 2.0, 4.2, -3.3);
    k.box('glass', 1.7, 0.25, 0.2, 2.0, 2.75, -2.05); k.box('glass', 1.1, 0.2, 0.2, 2.0, 3.55, -2.55);
    k.windows(2.0, 1.95, -1.33, 2.2, 9, 'x'); k.windows(3.26, 2.0, -3.0, 2.8, 8);
    k.plate('orange', 1.9, 0.14, 0.45, 2.0, 3.2, -2.3); k.hazard(2.5, 0.06, 0.3, 2.0, 2.33, -1.4);
    k.dish(1.6, 4.5, -3.6, 0.55, 0.4, 1.2); k.dish(2.6, 3.9, -4.1, 0.4, 0.6, -0.8);
    k.antenna(2.3, 4.5, -3.2, 2.6); k.antenna(1.7, 4.5, -3.0, 1.8, false); k.antenna(2.0, 4.5, -3.6, 1.2, false);
    for (const sx of [-1, 1]) {
      // hangar bays with lit openings
      k.plate('hull', 1.7, 1.45, 5.2, sx * 4.5, 0.2, -1.5);
      k.box('orange', 0.1, 0.9, 3.6, sx * 5.37, 0.2, -1.5);
      k.box('dark', 0.05, 0.85, 2.0, sx * 5.4, 0.2, 1.3); k.box('glowSoft', 0.06, 0.55, 1.7, sx * 5.42, 0.2, 1.3);
      for (let i = 0; i < 4; i++) k.box('amber', 0.07, 0.06, 0.06, sx * 5.45, 0.55, 0.6 + i * 0.45);
      k.hazard(0.08, 0.15, 2.0, sx * 5.42, 0.73, 1.3);
      k.box('dark', 1.7, 0.25, 0.3, sx * 4.5, 0.98, -3.8);
      k.vent(sx * 4.5, 0.95, -0.8, 1.0, 1.6, 6);
      k.pipe(sx * 3.2, 1.3, 5.5, sx * 3.2, -6.5, 0.09);
      // engines
      for (let i = 0; i < 3; i++) k.engine(sx * (1.0 + i * 1.4), 0.2, -7.95, 0.55, 0.7);
      k.zcyl('hull', 0.95, 0.95, 3.0, 14, sx * 4.5, 0, -6.0);
      k.zcyl('orange', 0.98, 0.98, 0.4, 14, sx * 4.5, 0, -5.4);
      k.engine(sx * 4.5, 0, -7.6, 0.72, 0.7);
    }
    k.dress(rng, -3.0, -0.9, -6.5, 6.0, 1.25, 40, 0.42);
    k.dress(rng, 0.9, 3.2, 0.5, 6.0, 1.25, 22, 0.42);
    k.dress(rng, 0.9, 3.2, -6.8, -4.8, 1.25, 10, 0.42);
    k.navLights(5.5, 0.6, -1.5, -7.6);
    hard = [
      { x: 0, y: 1.3, z: 6.0, size: 2.1 }, { x: -2.3, y: 1.3, z: 3.0, size: 2.0 }, { x: 2.3, y: 1.3, z: 3.0, size: 2.0 },
      { x: -2.6, y: 1.3, z: -1.4, size: 2.0 }, { x: -1.6, y: 1.3, z: -5.4, size: 1.9 }, { x: 3.4, y: 1.3, z: -5.8, size: 1.9 },
    ];
    // point-defence turrets (decorative, track targets)
    for (const [x, z] of [[-3.2, 4.2], [3.2, 4.2], [-3.4, 0.2], [3.5, -0.6], [-3.6, -4.2], [0.9, -6.6], [-0.9, 7.6], [2.4, 6.0]]) extraTurrets.push({ x, y: 1.3, z, size: 0.9 });
  }
  const group = k.build();
  return { group, hardpoints: hard, engines: k.engines, length, pointDefense: extraTurrets };
}

// ================= Engine flames (outer cone + bright core + glow sprite) =================
const flameMatBase = new THREE.ShaderMaterial({
  uniforms: { uColor: { value: new THREE.Color(0.4, 2.2, 3.4) }, uPower: { value: 1 }, uTime: { value: 0 }, uCore: { value: 0 } },
  vertexShader: `varying vec2 vUv; uniform float uTime; void main(){ vUv=uv; vec3 p=position; float t=1.0-uv.y; p.xy*=1.0+0.08*sin(uTime*55.0+t*18.0)*t; gl_Position=projectionMatrix*modelViewMatrix*vec4(p,1.0);} `,
  fragmentShader: `uniform vec3 uColor; uniform float uPower; uniform float uTime; uniform float uCore; varying vec2 vUv;
    void main(){ float t=1.0-vUv.y; float a=pow(t, uCore>0.5?3.0:1.5)*(0.75+0.25*sin(uTime*40.0+vUv.x*20.0));
      vec3 c = uCore>0.5 ? mix(uColor, vec3(3.0), 0.6) : uColor; gl_FragColor=vec4(c*a*(0.5+uPower),a);} `,
  transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
});
export function makeFlames(engines, color) {
  const mat = flameMatBase.clone(); mat.uniforms.uColor.value = color ? color.clone() : new THREE.Color(0.4, 2.2, 3.4);
  const core = flameMatBase.clone(); core.uniforms.uColor.value = mat.uniforms.uColor.value; core.uniforms.uCore.value = 1;
  core.uniforms.uPower = mat.uniforms.uPower; core.uniforms.uTime = mat.uniforms.uTime;
  const group = new THREE.Group(); const flames = [];
  const sm = new THREE.SpriteMaterial({ map: glowTexture(), color: mat.uniforms.uColor.value.clone().multiplyScalar(0.5), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true });
  for (const e of engines) {
    const geo = new THREE.ConeGeometry(e.r * 0.85, 1, 12, 1, true); geo.translate(0, 0.5, 0); geo.rotateX(-Math.PI / 2);
    const m = new THREE.Mesh(geo, mat); m.position.set(e.x, e.y, e.z); group.add(m);
    const cg = new THREE.ConeGeometry(e.r * 0.42, 1, 10, 1, true); cg.translate(0, 0.5, 0); cg.rotateX(-Math.PI / 2);
    const c = new THREE.Mesh(cg, core); c.position.set(e.x, e.y, e.z); group.add(c);
    const sp = new THREE.Sprite(sm); sp.position.set(e.x, e.y, e.z - 0.1); sp.scale.setScalar(e.r * 4); group.add(sp);
    flames.push({ mesh: m, core: c, sprite: sp, r: e.r });
  }
  return { group, flames, mat, coreMat: core, spriteMat: sm };
}

// ================= Asteroids =================
export const rockUniforms = { uTime: { value: 0 } };
const GLSL_NOISE = `
float rh(vec3 p){ p=fract(p*0.3183099+.1); p*=17.0; return fract(p.x*p.y*p.z*(p.x+p.y+p.z)); }
float rn(vec3 x){ vec3 i=floor(x); vec3 f=fract(x); f=f*f*(3.0-2.0*f);
  return mix(mix(mix(rh(i),rh(i+vec3(1,0,0)),f.x),mix(rh(i+vec3(0,1,0)),rh(i+vec3(1,1,0)),f.x),f.y),
             mix(mix(rh(i+vec3(0,0,1)),rh(i+vec3(1,0,1)),f.x),mix(rh(i+vec3(0,1,1)),rh(i+vec3(1,1,1)),f.x),f.y),f.z); }
float rfbm(vec3 p){ return 0.5*rn(p)+0.25*rn(p*2.03)+0.125*rn(p*4.01); }`;
// One material for every asteroid. Per-instance attributes: aGlowCol (vec3 vein colour), aInst (x: damage 0..1, y: hit flash, z: seed)
export function makeRockMaterial(baseGlow = 0x000000, glowScale = 1) {
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, metalness: 0.08, flatShading: true });
  m.userData.uBaseGlow = { value: new THREE.Color(baseGlow).multiplyScalar(glowScale) };
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = rockUniforms.uTime; sh.uniforms.uBaseGlow = m.userData.uBaseGlow;
    sh.vertexShader = sh.vertexShader.replace('#include <common>', `#include <common>
      attribute float aGlow; attribute vec3 aGlowCol; attribute vec3 aInst; varying float vCrystal; varying vec3 vObj; varying vec3 vGlowCol; varying vec3 vInst; uniform vec3 uBaseGlow;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
      vCrystal = aGlow; vObj = position; vGlowCol = aGlowCol + uBaseGlow; vInst = aInst;`);
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
      uniform float uTime; varying float vCrystal; varying vec3 vObj; varying vec3 vGlowCol; varying vec3 vInst; ${GLSL_NOISE}`)
      .replace('#include <color_fragment>', `#include <color_fragment>
      vec3 rp = vObj + vInst.z*13.0;
      float rnz = rfbm(rp*2.6);
      float crater = rn(rp*4.5); float cr = smoothstep(0.66,0.74,crater) - 0.6*smoothstep(0.6,0.66,crater)*(1.0-smoothstep(0.66,0.7,crater));
      float strata = 0.5+0.5*sin(rp.y*16.0 + rnz*7.0);
      float speck = step(0.93, rh(floor(rp*40.0)));
      if (vCrystal < 0.5) diffuseColor.rgb *= (0.6 + 0.75*rnz) * (0.85 + 0.25*strata) * (1.0 - 0.45*cr) * (1.0 + 0.6*speck);
      diffuseColor.rgb *= 1.0 - vInst.x*0.55;`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
      roughnessFactor = clamp(0.62 + 0.38*rnz - 0.3*vCrystal, 0.08, 1.0);`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
      float v1 = abs(rn(rp*3.1+7.3)-0.5); float v2 = abs(rn(rp*6.7-3.1)-0.5);
      float vein = smoothstep(0.03,0.004,v1) + 0.55*smoothstep(0.02,0.003,v2);
      float g = max(vein*(0.6+0.4*rnz), vCrystal*1.15);
      float pulse = 0.78 + 0.22*sin(uTime*2.2 + rp.x*4.0 + rp.z*3.0);
      totalEmissiveRadiance += vGlowCol * g * pulse * (1.0 + vInst.x*0.8);
      totalEmissiveRadiance += vec3(1.6,0.6,0.15) * vInst.y * (0.4 + vein);`);
  };
  m.customProgramCacheKey = () => 'rock-v2';
  return m;
}
// Noise-displaced icosphere with craters; crystal clusters for rich rocks. Same seed => same silhouette at every LOD.
export function makeRockGeometry(seed, opts = {}) {
  const rng = mulberry(seed);
  const detail = opts.detail ?? 2;
  const g = new THREE.IcosahedronGeometry(1, detail);
  const pos = g.attributes.position; const v = new THREE.Vector3();
  const sx = opts.stretch ? 1.25 + rng() * 0.5 : 0.85 + rng() * 0.3, sy = 0.7 + rng() * 0.3, sz = 0.85 + rng() * 0.3;
  const o = rng() * 100, amp = opts.amp ?? 0.34;
  const craters = []; for (let i = 0; i < (opts.craters ?? 4); i++) craters.push({ d: new THREE.Vector3(rng() - 0.5, rng() - 0.5, rng() - 0.5).normalize(), r: 0.25 + rng() * 0.35, depth: 0.08 + rng() * 0.1 });
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i).normalize();
    let r = 1 + (fbm3(v.x * 1.5 + o, v.y * 1.5 + o, v.z * 1.5 + o, 4) - 0.5) * 2 * amp;
    r += (fbm3(v.x * 5 + o, v.y * 5, v.z * 5, 2) - 0.5) * 0.12;
    for (const c of craters) { const a = Math.acos(Math.min(1, v.dot(c.d))); if (a < c.r * 1.3) { const t = a / c.r; r -= t < 1 ? c.depth * (1 - t * t) : -c.depth * 0.4 * (1 - (t - 1) / 0.3); } }
    pos.setXYZ(i, v.x * r * sx, v.y * r * sy, v.z * r * sz);
  }
  const geos = [g];
  if (opts.crystals) {
    for (let c = 0; c < opts.crystals; c++) {
      const dir = new THREE.Vector3(rng() - 0.5, rng() * 0.8 + 0.2, rng() - 0.5).normalize();
      for (let j = 0; j < 4; j++) {
        const h = 0.35 + rng() * 0.7;
        const cg = new THREE.CylinderGeometry(0, 0.1 + rng() * 0.1, h, 6); cg.translate(0, h / 2, 0); // hexagonal crystal
        const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().add(new THREE.Vector3((rng() - 0.5) * 0.7, 0, (rng() - 0.5) * 0.7)).normalize());
        cg.applyQuaternion(q); cg.translate(dir.x * 0.72 * sx, dir.y * 0.66 * sy, dir.z * 0.72 * sz);
        const ng = cg.toNonIndexed(); ng.userData.crystal = true; geos.push(ng);
      }
    }
  }
  for (const gg of geos) { if (gg.attributes.uv) gg.deleteAttribute('uv'); if (gg.attributes.normal) gg.deleteAttribute('normal'); }
  for (const gg of geos) {
    const p = gg.attributes.position; const n = p.count; const col = new Float32Array(n * 3), glow = new Float32Array(n);
    for (let f = 0; f < n; f += 3) {
      const shade = gg.userData.crystal ? [0.16, 0.16, 0.2] : (() => { const b = 0.075 + rng() * 0.03; return [b * 1.05, b, b * 1.1]; })();
      for (let k = 0; k < 3; k++) { col.set(shade, (f + k) * 3); glow[f + k] = gg.userData.crystal ? 1 : 0; }
    }
    gg.setAttribute('color', new THREE.BufferAttribute(col, 3)); gg.setAttribute('aGlow', new THREE.BufferAttribute(glow, 1));
  }
  const merged = geos.length > 1 ? mergeGeometries(geos, false) : g;
  merged.computeVertexNormals(); merged.computeBoundingSphere(); merged.userData.shared = true;
  return merged;
}

// ================= Pirates =================
export function buildPirate(type) {
  const k = new Kit(); const rng = mulberry(type.length * 31 + 7);
  let hard = [], radius = 1.4; const turrets = [];
  if (type === 'drone') {
    k.add('pirateDark', new THREE.OctahedronGeometry(0.8, 0), 0, 0, 0, 0, 0, 0, 1, 0.6, 1.25);
    k.plate('pirateAccent', 2.1, 0.1, 0.45, 0, 0, -0.1);
    for (const sx of [-1, 1]) { k.box('pirateDark', 0.1, 0.4, 0.6, sx * 1.05, 0.05, -0.1); k.add('pirateBone', new THREE.ConeGeometry(0.08, 0.5, 4), sx * 0.5, 0.2, 0.55, Math.PI / 2.4); }
    k.sphere('red', 0.2, 0, 0.26, 0.5); k.add('redSoft', new THREE.TorusGeometry(0.28, 0.03, 4, 12), 0, 0.26, 0.5, 0.4);
    k.engine(0, 0, -0.95, 0.2, 0.3);
    hard = [{ x: 0, y: 0, z: 0.8 }]; radius = 1.0;
  } else if (type === 'interceptor') {
    k.slab('pirateDark', [[0, 2.0], [0.4, 0.4], [1.7, -1.3], [0.5, -0.9], [-0.5, -0.9], [-1.7, -1.3], [-0.4, 0.4]], 0.35, 0);
    k.slab('pirateAccent', [[0, 1.75], [0.28, 0.4], [1.2, -0.9], [-1.2, -0.9], [-0.28, 0.4]], 0.1, 0.24);
    k.box('red', 0.3, 0.12, 0.4, 0, 0.32, 0.6); k.box('glass', 0.3, 0.1, 0.3, 0, 0.3, 0.95);
    for (const sx of [-1, 1]) {
      k.box('pirateBone', 0.1, 0.55, 1.0, sx * 1.55, 0.18, -1.05); k.add('pirateBone', new THREE.ConeGeometry(0.07, 0.7, 4), sx * 1.55, 0.2, -0.3, Math.PI / 2);
      k.box('redSoft', 0.04, 0.04, 1.2, sx * 0.95, 0.27, -0.6, 0, sx * 0.6, 0);
      k.zcyl('pirateDark', 0.06, 0.06, 0.6, 6, sx * 0.4, 0, 1.1);
    }
    k.engine(-0.3, 0, -1.0, 0.2, 0.3); k.engine(0.3, 0, -1.0, 0.2, 0.3);
    k.lights.push({ x: -1.7, y: 0.1, z: -1.3, color: 0xff2020, mode: 'blink', size: 0.8 }, { x: 1.7, y: 0.1, z: -1.3, color: 0xff2020, mode: 'blink', size: 0.8 });
    hard = [{ x: -0.4, y: 0, z: 1.0 }, { x: 0.4, y: 0, z: 1.0 }]; radius = 1.5;
  } else if (type === 'gunship') {
    k.slab('pirateDark', [[0, 3.1], [1.4, 1.8], [1.9, -2.4], [-1.9, -2.4], [-1.4, 1.8]], 1.1, 0);
    k.slab('pirateAccent', [[0, 2.8], [0.9, 1.7], [1.2, -0.4], [-1.2, -0.4], [-0.9, 1.7]], 0.3, 0.75);
    for (const sx of [-1, 1]) {
      for (let i = 0; i < 3; i++) k.plate('pirateBone', 0.65, 0.95, 1.1, sx * 2.15, 0, 1.0 - i * 1.15, sx * 0.04);
      k.plate('pirate', 0.7, 0.3, 0.9, sx * 2.1, 0.55, 0.8);
      for (let i = 0; i < 3; i++) k.add('pirateBone', new THREE.ConeGeometry(0.1, 0.6, 4), sx * 2.5, 0, 1.0 - i * 1.15, 0, 0, -sx * Math.PI / 2);
      k.engine(sx * 1.0, 0, -2.5, 0.42, 0.5);
      k.vent(sx * 0.9, 0.95, -1.5, 0.6, 0.8, 4);
    }
    k.box('red', 1.2, 0.12, 0.2, 0, 0.98, 1.3); k.windows(0, 0.95, 1.36, 1.0, 4, 'x');
    k.dress(rng, -0.9, 0.9, -2.0, 0.0, 0.92, 10, 0.4);
    k.lights.push({ x: 0, y: 1.2, z: -2.2, color: 0xff2020, mode: 'strobe', size: 1.2 });
    hard = [{ x: 0, y: 0.9, z: 2.2 }, { x: -2.1, y: 0.5, z: 1.4 }, { x: 2.1, y: 0.5, z: 1.4 }]; radius = 2.8;
    turrets.push({ x: 0, y: 0.95, z: 0.4, size: 1.1 });
  } else if (type === 'sentinel') {
    k.sphere('pirateBone', 0.9, 0, 0, 0, 1, 0.8, 1, 14, 8);
    k.sphere('pirateDark', 0.95, 0, -0.1, 0, 1, 0.45, 1, 14, 6);
    for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2 + Math.PI / 4; k.plate('pirate', 0.3, 0.25, 1.4, Math.sin(a) * 1.0, 0, Math.cos(a) * 1.0, a); k.add('pirateBone', new THREE.ConeGeometry(0.1, 0.5, 4), Math.sin(a) * 1.85, 0, Math.cos(a) * 1.85, Math.PI / 2, 0, 0); }
    k.sphere('amber', 0.3, 0, 0.35, 0.6);
    k.add('amber', new THREE.TorusGeometry(1.25, 0.07, 6, 24), 0, 0, 0, Math.PI / 2);
    hard = [{ x: 0, y: 0.3, z: 0.9 }]; radius = 1.6;
  } else if (type === 'boss') {
    k.slab('pirateDark', [[0, 11.5], [3, 7], [6.5, 0], [7, -8], [-7, -8], [-6.5, 0], [-3, 7]], 2.2, 0);
    k.slab('pirateAccent', [[0, 10.5], [2.2, 6.6], [5, 0], [5.2, -7], [-5.2, -7], [-5, 0], [-2.2, 6.6]], 0.6, 1.4);
    k.slab('pirateBone', [[0, 11], [1.0, 8.6], [-1.0, 8.6]], 0.3, 1.5);
    // ram prow spikes
    for (const sx of [-1, 1]) k.add('pirateBone', new THREE.ConeGeometry(0.5, 4, 5), sx * 1.6, 0, 11.5, Math.PI / 2, 0, sx * 0.2);
    k.plate('pirate', 3.2, 1.6, 4.2, 0, 2.2, -3.0); k.plate('pirate', 2.2, 1.4, 2.6, 0, 3.6, -3.4); k.plate('pirateDark', 1.4, 1.0, 1.4, 0, 4.7, -3.6);
    k.box('red', 1.7, 0.25, 0.2, 0, 3.7, -2.1); k.windows(0, 2.3, -0.88, 2.6, 10, 'x');
    k.add('pirateBone', new THREE.ConeGeometry(0.25, 3, 5), 0.6, 6.5, -3.6); k.add('pirateBone', new THREE.ConeGeometry(0.2, 2.2, 5), -0.6, 6.1, -3.6);
    // reactor core
    k.sphere('red', 1.0, 0, 1.6, -0.5, 1, 0.6, 1, 16, 8);
    for (const sx of [-1, 1]) {
      for (let i = 0; i < 5; i++) k.plate('pirateBone', 1.3, 2.0, 2.0, sx * 7.4, 0, 3 - i * 2.05, sx * 0.03);
      for (let i = 0; i < 5; i++) k.add('pirateBone', new THREE.ConeGeometry(0.3, 1.6, 4), sx * 8.6, 0, 3 - i * 2.05, 0, 0, -sx * Math.PI / 2);
      for (let i = 0; i < 3; i++) k.engine(sx * (1.5 + i * 2), 0, -8.2, 0.8, 0.8);
      for (let i = 0; i < 4; i++) k.box('red', 0.1, 0.3, 0.6, sx * 8.1, 0.3, 2 - i * 2.2);
      k.vent(sx * 3.5, 1.45, -5.5, 1.6, 2.0, 6); k.hazard(0.4, 0.06, 6, sx * 5.6, 1.5, 0);
    }
    k.dress(rng, -4, 4, -7, 6, 1.6, 60, 0.6);
    const ring = new THREE.TorusGeometry(5.0, 0.35, 8, 48); ring.rotateX(Math.PI / 2);
    const ringMesh = new THREE.Mesh(ring, materials().red); ringMesh.position.y = 1.6; ringMesh.name = 'ring'; k.extras.push(ringMesh);
    for (let i = 0; i < 6; i++) { const h = { x: (i % 2 ? 1 : -1) * (2.5 + (i >> 1) * 1.2), y: 1.6, z: 5 - (i >> 1) * 5, size: 1.6 }; hard.push(h); turrets.push({ ...h, size: 1.8 }); }
    k.lights.push({ x: 0.6, y: 8.1, z: -3.6, color: 0xff2020, mode: 'strobe', size: 2.5 }, { x: -7.5, y: 1.2, z: -7, color: 0xff2020, mode: 'blink', size: 2 }, { x: 7.5, y: 1.2, z: -7, color: 0xff2020, mode: 'blink', size: 2 });
    radius = 9;
  } else if (type === 'sniper') { // long-range rail platform
    k.slab('pirateDark', [[0, 2.6], [0.35, 1.2], [0.9, -1.6], [0.35, -1.9], [-0.35, -1.9], [-0.9, -1.6], [-0.35, 1.2]], 0.32, 0);
    k.slab('pirateAccent', [[0, 2.3], [0.22, 1.1], [0.55, -1.3], [-0.55, -1.3], [-0.22, 1.1]], 0.08, 0.2);
    k.zcyl('pirateDark', 0.09, 0.12, 3.6, 8, 0, 0.18, 2.4); k.zcyl('pirate', 0.16, 0.16, 0.5, 8, 0, 0.18, 1.0); k.zcyl('red', 0.07, 0.07, 0.06, 8, 0, 0.18, 4.2);
    for (const z of [1.6, 2.3, 3.0, 3.7]) k.add('redSoft', new THREE.TorusGeometry(0.15, 0.025, 4, 10), 0, 0.18, z);
    k.box('glass', 0.22, 0.1, 0.3, 0, 0.3, 0.3); for (const sx of [-1, 1]) k.box('pirateBone', 0.06, 0.4, 0.9, sx * 0.85, 0.12, -1.3);
    k.engine(0, 0, -1.95, 0.22, 0.35); hard = [{ x: 0, y: 0.18, z: 4.2 }]; radius = 1.6;
  } else if (type === 'support') { // repair / shield tender
    k.sphere('pirateDark', 1.1, 0, 0, 0, 1, 0.55, 1.3, 14, 8); k.sphere('pirate', 0.7, 0, 0.35, -0.2, 1, 0.6, 1.1, 12, 6);
    k.add('green', new THREE.TorusGeometry(1.45, 0.06, 6, 28), 0, 0.1, 0, Math.PI / 2);
    for (const sx of [-1, 1]) { k.box('pirateBone', 0.12, 0.12, 1.2, sx * 1.1, 0, 0.7, 0, sx * 0.4, 0); k.sphere('green', 0.16, sx * 1.35, 0, 1.2); k.zcyl('pirateDark', 0.2, 0.25, 0.7, 8, sx * 0.9, 0, -0.9); }
    k.cyl('pirateAccent', 0.25, 0.3, 0.4, 8, 0, 0.75, -0.2); k.sphere('green', 0.18, 0, 1.0, -0.2);
    k.engine(-0.5, 0, -1.35, 0.2, 0.3); k.engine(0.5, 0, -1.35, 0.2, 0.3);
    k.lights.push({ x: 0, y: 1.1, z: -0.2, color: 0x30ff70, mode: 'pulse', size: 1.4 }); hard = [{ x: 0, y: 0.2, z: 1.2 }]; radius = 1.8;
  } else if (type === 'ew') { // electronic warfare
    k.add('pirateDark', new THREE.OctahedronGeometry(1.1, 0), 0, 0, 0, 0, 0, 0, 1.1, 0.5, 1.5);
    k.slab('pirateAccent', [[0, 1.9], [1.5, -0.6], [0.5, -1.4], [-0.5, -1.4], [-1.5, -0.6]], 0.12, 0.25);
    k.dish(0, 0.35, -0.2, 0.9, 0.9, 0); for (const sx of [-1, 1]) { k.antenna(sx * 1.2, 0.2, -0.6, 1.2, true); k.box('redSoft', 0.05, 0.05, 1.2, sx * 0.8, 0.32, 0.3, 0, sx * 0.5, 0); }
    k.add('red', new THREE.TorusGeometry(0.5, 0.04, 4, 16), 0, 0.2, 1.1, 0.3);
    k.engine(0, 0, -1.6, 0.25, 0.35); hard = [{ x: 0, y: 0.2, z: 1.4 }]; radius = 1.7;
  } else if (type === 'capital') { // fleet carrier / command ship
    k.slab('pirateDark', [[0, 8], [2.4, 5], [3.6, -1], [3.4, -7], [-3.4, -7], [-3.6, -1], [-2.4, 5]], 1.8, 0);
    k.slab('pirateAccent', [[0, 7.3], [1.7, 4.6], [2.6, -1], [2.5, -6.2], [-2.5, -6.2], [-2.6, -1], [-1.7, 4.6]], 0.45, 1.1);
    k.plate('pirate', 2.2, 1.4, 3.0, 0, 1.9, -2.6); k.plate('pirateDark', 1.4, 1.0, 1.6, 0, 3.0, -3.0); k.windows(0, 2.0, -1.1, 1.8, 8, 'x');
    for (const sx of [-1, 1]) { for (let i = 0; i < 4; i++) k.plate('pirateBone', 0.9, 1.6, 1.8, sx * 3.9, 0, 3 - i * 2.4, sx * 0.03); k.box('glowSoft', 0.1, 0.6, 2.6, sx * 3.75, 0.2, -1.8); k.hazard(0.3, 0.06, 2.6, sx * 3.3, 0.95, -1.8); for (let i = 0; i < 2; i++) k.engine(sx * (1 + i * 1.6), 0, -7.2, 0.6, 0.7); }
    k.antenna(0.5, 3.5, -3.2, 2.2); k.antenna(-0.5, 3.5, -2.8, 1.6); k.dress(rng, -2, 2, -5.5, 4, 1.2, 40, 0.5);
    for (let i = 0; i < 4; i++) { const h = { x: (i % 2 ? 1 : -1) * 2.0, y: 1.2, z: 4 - (i >> 1) * 6, size: 1.4 }; hard.push(h); turrets.push(h); }
    k.lights.push({ x: 0, y: 4.2, z: -3.0, color: 0xff2020, mode: 'strobe', size: 2.2 }); radius = 6;
  } else if (type === 'freighter') { // pirate supply hauler
    k.box('pirateDark', 1.4, 1.0, 6.0, 0, 0, -0.4); k.plate('pirate', 1.6, 0.9, 1.6, 0, 0.1, 3.0); k.box('glass', 1.0, 0.25, 0.2, 0, 0.35, 3.75);
    for (let i = 0; i < 3; i++) for (const sx of [-1, 1]) { k.box(i % 2 ? 'pirateAccent' : 'pirateBone', 1.0, 0.9, 1.5, sx * 1.25, 0.05, 1.3 - i * 1.7); k.hazard(1.02, 0.06, 0.2, sx * 1.25, 0.52, 1.3 - i * 1.7); }
    k.engine(-0.5, 0, -3.5, 0.35, 0.5); k.engine(0.5, 0, -3.5, 0.35, 0.5); k.lights.push({ x: 0, y: 0.7, z: -3.2, color: 0xffa020, mode: 'blink', size: 1.2 });
    hard = [{ x: 0, y: 0.5, z: 3.5 }]; radius = 3;
  } else if (type === 'commander') { // sector command cruiser
    k.slab('pirateDark', [[0, 4.6], [1.9, 2.4], [2.6, -3], [-2.6, -3], [-1.9, 2.4]], 1.2, 0);
    k.slab('pirateAccent', [[0, 4.2], [1.3, 2.3], [1.7, -0.6], [-1.7, -0.6], [-1.3, 2.3]], 0.3, 0.8);
    k.plate('pirate', 1.6, 1.2, 1.8, 0, 1.4, -1.4); k.plate('pirateDark', 1.0, 0.8, 1.0, 0, 2.4, -1.6); k.windows(0, 1.5, -0.45, 1.2, 5, 'x');
    for (let i = 0; i < 5; i++) { const a = -0.9 + i * 0.45; k.add('pirateBone', new THREE.ConeGeometry(0.12, 0.9, 4), Math.sin(a) * 0.55, 3.1 + Math.cos(a) * 0.2, -1.6); }
    for (const sx of [-1, 1]) { for (let i = 0; i < 3; i++) k.plate('pirateBone', 0.7, 1.1, 1.3, sx * 2.8, 0, 1.6 - i * 1.5, sx * 0.04); k.engine(sx * 1.2, 0, -3.1, 0.5, 0.6); k.box('red', 0.08, 0.25, 1.6, sx * 2.45, 0.4, -0.5); }
    k.lights.push({ x: 0, y: 3.3, z: -1.6, color: 0xff2020, mode: 'strobe', size: 1.6 });
    hard = [{ x: 0, y: 1, z: 4 }, { x: -2, y: 0.6, z: 1.8 }, { x: 2, y: 0.6, z: 1.8 }]; radius = 4.2;
    turrets.push({ x: -1.1, y: 1.0, z: 1.8, size: 1.2 }, { x: 1.1, y: 1.0, z: 1.8, size: 1.2 });
  }
  const group = k.build();
  for (const t of turrets) { const tu = makeTurret('cannon', t.size, 'pirate'); tu.position.set(t.x, t.y, t.z); tu.name = 'eturret'; group.add(tu); }
  return { group, hardpoints: hard, engines: k.engines, radius };
}

// ================= Station =================
export function buildStation(level, rockMat) {
  const root = new THREE.Group(); const anim = { spin: [], blink: [], drones: [], cranes: [], stacks: [], chase: [] };
  const k = new Kit(); const rng = mulberry(4242);
  const rock = new THREE.Mesh(makeRockGeometry(77, { detail: 4, amp: 0.3, craters: 7 }), rockMat);
  rock.scale.set(9, 6.5, 8); rock.position.set(-9.5, -6.5, 4.5); root.add(rock);
  // ---- L1 refinery ----
  k.cyl('hull', 3.2, 3.6, 4.2, 16, 0, 0, 0);
  for (const y of [-1.2, 0.6]) k.cyl('orange', 3.65, 3.65, 0.4, 16, 0, y, 0);
  k.windows(0, 1.4, 3.25, 2.2, 7, 'x'); k.windows(0, 1.4, -3.25, 2.2, 7, 'x');
  k.cyl('dark', 2.4, 3.0, 1.2, 16, 0, 2.6, 0);
  k.dress(rng, -1.8, 1.8, -1.8, 1.8, 3.2, 16, 0.5);
  k.plate('hull', 3.8, 2.4, 3.0, -3.6, -0.4, 1.2); k.plate('hull', 2.6, 2.0, 2.6, -4.2, -1.2, 4.2);
  k.box('orange', 0.12, 1.4, 2.2, -1.6, -0.4, 1.2); k.hazard(3.8, 0.1, 0.4, -3.6, 0.85, -0.1);
  k.vent(-3.6, 0.82, 1.6, 2.0, 1.4, 6);
  // smokestacks with glowing rims
  for (const [x, z, h] of [[-4.6, 0.6, 3.4], [-3.2, 2.2, 2.6]]) {
    k.cyl('dark', 0.5, 0.65, h, 12, x, 0.8 + h / 2, z); k.cyl('orange', 0.68, 0.68, 0.3, 12, x, 1.3, z);
    k.add('amber', new THREE.TorusGeometry(0.48, 0.07, 6, 14), x, 0.8 + h, z, Math.PI / 2); anim.stacks.push(new THREE.Vector3(x, 0.9 + h, z));
  }
  k.pipe(-2.0, 1.2, 0.0, -2.0, 3.6, 0.15); k.pipe(-2.6, 0.4, -1.4, 1.8, -2.6, 0.12);
  // docking arm + port
  k.zcyl('dark', 1.0, 1.0, 4.0, 12, 0, 0, 5.0); k.zcyl('hull', 1.5, 1.5, 1.0, 16, 0, 0, 7.2);
  k.add('orange', new THREE.TorusGeometry(1.5, 0.12, 6, 20), 0, 0, 7.72); k.zcyl('glow', 1.0, 1.0, 0.1, 16, 0, 0, 7.75);
  for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2; k.box('amber', 0.16, 0.16, 0.16, Math.cos(a) * 1.6, Math.sin(a) * 1.6, 7.8); }
  k.antenna(0.8, 2.6, -0.4, 4.2); k.dish(-1.2, 3.2, 1.0, 0.8, 0.6, 2.2);
  if (level >= 2) {
    for (const sx of [-1, 1]) {
      k.box('dark', 10, 0.3, 0.3, sx * 7.8, 1.0, -1.0); k.box('orange', 0.5, 0.5, 0.5, sx * 3.3, 1.0, -1.0);
      for (let i = 0; i < 3; i++) {
        const pg = new THREE.PlaneGeometry(2.6, 4.4); pg.rotateX(-Math.PI / 2 + 0.25); k.add('solar', pg, sx * (5.4 + i * 2.85), 1.0, -1.0);
        k.box('dark', 2.7, 0.06, 0.08, sx * (5.4 + i * 2.85), 1.55, -3.1); k.box('dark', 2.7, 0.06, 0.08, sx * (5.4 + i * 2.85), 0.45, 1.1);
      }
      k.lights.push({ x: sx * 12.9, y: 1.2, z: -1.0, color: sx < 0 ? 0xff3030 : 0x30ff60, mode: 'blink', size: 1.4 });
    }
    k.plate('hull', 2.6, 2.0, 2.4, 3.6, -0.3, -2.8); k.plate('orange', 2.7, 0.3, 2.5, 3.6, 0.8, -2.8); k.windows(4.92, -0.3, -2.8, 2.0, 5);
  }
  if (level >= 3) {
    for (const [x, z] of [[4.5, 3.8], [-1.0, -5.2]]) {
      k.plate('hull', 3.4, 2.4, 3.0, x, -0.2, z); k.box('orange', 3.5, 0.3, 0.4, x, 0.6, z + 1.3);
      k.cyl('dark', 0.35, 0.45, 2.6, 10, x - 0.8, 2.2, z - 0.6); k.cyl('dark', 0.35, 0.45, 2.0, 10, x + 0.7, 1.9, z - 0.6);
      k.add('amber', new THREE.TorusGeometry(0.33, 0.06, 6, 12), x - 0.8, 3.5, z - 0.6, Math.PI / 2); anim.stacks.push(new THREE.Vector3(x - 0.8, 3.6, z - 0.6));
      k.box('amber', 2.4, 0.4, 0.05, x, -0.2, z + 1.53); k.vent(x, 1.02, z + 0.3, 1.4, 0.8, 4); k.hazard(3.4, 0.08, 0.3, x, 1.0, z - 1.35);
    }
    const rk = new Kit();
    const tor = new THREE.TorusGeometry(10, 0.55, 10, 64); tor.rotateX(Math.PI / 2); rk.add('hull', tor);
    const tor2 = new THREE.TorusGeometry(10, 0.62, 4, 64); tor2.rotateX(Math.PI / 2); tor2.scale(1, 0.25, 1); rk.add('orange', tor2);
    for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2; rk.box('dark', 0.3, 0.3, 6.5, Math.sin(a) * 6.6, 0, Math.cos(a) * 6.6, 0, a, 0); rk.plate('hull', 1.4, 1.0, 1.4, Math.sin(a) * 10, 0, Math.cos(a) * 10, a); }
    const ring = rk.build(); ring.position.y = -1.2; root.add(ring); anim.spin.push({ obj: ring, speed: 0.15 });
    // chase lights around ring
    const cm = new THREE.SpriteMaterial({ map: glowTexture(), color: 0x60e8ff, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true });
    for (let i = 0; i < 24; i++) { const a = i / 24 * Math.PI * 2; const s = new THREE.Sprite(cm.clone()); s.material.userData.own = true; s.position.set(Math.sin(a) * 10, 0.7, Math.cos(a) * 10); s.scale.setScalar(1.1); ring.add(s); anim.chase.push({ obj: s, i }); }
  }
  if (level >= 4) {
    for (const [x, z, h] of [[-6.5, -4.5, 9], [7.5, -6.5, 8], [8.5, 6.5, 7]]) {
      for (const dx of [-0.5, 0.5]) for (const dz of [-0.5, 0.5]) k.box('dark', 0.15, h, 0.15, x + dx, h / 2 - 1.5, z + dz);
      for (let y = 0; y < h; y += 1.4) { k.box('orange', 1.1, 0.1, 1.1, x, y - 1.5, z); k.box('dark', 0.06, 1.4, 0.06, x + 0.5, y - 0.8, z, 0, 0, 0.75); }
      k.sphere('red', 0.18, x, h - 0.8, z);
      // rotating jib
      const ck = new Kit(); ck.box('orange', 0.5, 0.5, 6.5, 0, 0, 2.5); ck.box('dark', 0.6, 0.8, 1.6, 0, 0.1, -1.2); ck.hazard(0.52, 0.1, 1.2, 0, 0.3, 5.2);
      ck.box('dark', 0.05, 2.6, 0.05, 0, -1.3, 5.4); ck.box('amber', 0.6, 0.3, 0.6, 0, -2.6, 5.4);
      const jib = ck.build(); jib.position.set(x, h - 1.3, z); root.add(jib); anim.cranes.push({ obj: jib, base: rng() * 6, speed: 0.2 + rng() * 0.2 });
    }
    for (let i = 0; i < 4; i++) {
      const a = i / 4 * Math.PI * 2 + 0.4;
      k.cyl('hull', 1.3, 1.3, 3.2, 14, Math.sin(a) * 13.5, -1.0, Math.cos(a) * 13.5); k.cyl('orange', 1.35, 1.35, 0.4, 14, Math.sin(a) * 13.5, -0.4, Math.cos(a) * 13.5);
      k.sphere('hull', 1.3, Math.sin(a) * 13.5, 0.6, Math.cos(a) * 13.5, 1, 0.5, 1); k.box('dark', 0.4, 0.4, 3.5, Math.sin(a) * 11.6, -1.0, Math.cos(a) * 11.6, 0, a, 0);
      k.windows(Math.sin(a) * 14.85, -1.0, Math.cos(a) * 14.85, 0.8, 3, 'x');
    }
  }
  if (level >= 5) {
    k.sphere('hull', 3.4, 0, 3.6, 0, 1, 0.6, 1, 20, 10); k.cyl('glowSoft', 3.45, 3.45, 0.25, 20, 0, 3.6, 0);
    for (const [x, z, h] of [[2.5, -2.5, 8], [-2.0, 2.4, 6.5], [0, 0, 11]]) {
      k.cyl('hull', 0.7, 1.0, h, 12, x, h / 2, z); k.cyl('orange', 1.05, 1.05, 0.3, 12, x, h * 0.55, z); k.windows(x, h * 0.75, z + 0.85, 0.8, 3, 'x');
      k.cyl('dark', 0.05, 0.05, 2.5, 4, x, h + 1.25, z); k.lights.push({ x, y: h + 2.6, z, color: 0xff3030, mode: 'blink', size: 1.6 });
    }
    for (const sx of [-1, 1]) { k.plate('hull', 4, 1.6, 2.6, sx * 10, 0.2, 9); k.box('glowSoft', 3, 0.8, 0.05, sx * 10, 0.2, 10.33); k.hazard(4, 0.1, 0.3, sx * 10, 1.05, 10.1); }
  }
  if (level >= 6) {
    const tor = new THREE.TorusGeometry(19, 0.9, 10, 80); tor.rotateX(Math.PI / 2); k.add('hull', tor, 0, -2.2, 0);
    for (let i = 0; i < 8; i++) {
      const a = i / 8 * Math.PI * 2;
      k.box('dark', 0.5, 0.5, 4.5, Math.sin(a) * 16.2, -2.2, Math.cos(a) * 16.2, 0, a, 0);
      k.plate('hull', 2.6, 2.0, 2.6, Math.sin(a) * 19, -1.6, Math.cos(a) * 19, a);
      k.box('glow', 0.4, 0.3, 0.4, Math.sin(a) * 19, -0.4, Math.cos(a) * 19);
      k.windows(Math.sin(a) * 20.35, -1.6, Math.cos(a) * 20.35, 1.6, 4, 'x');
    }
  }
  const main = k.build(); root.add(main);
  // drone traffic: freighters looping between station and space (more drones as the station grows)
  const nDrones = [0, 2, 3, 4, 6, 10][level - 1];
  if (nDrones) {
    const dk = new Kit(); dk.plate('hull', 0.8, 0.3, 1.2, 0, 0, 0); dk.box('orange', 0.9, 0.1, 0.4, 0, 0.2, -0.2); dk.box('dark', 0.5, 0.35, 0.5, 0, -0.25, 0.1); dk.engine(0, 0, -0.6, 0.15, 0.2);
    dk.lights.push({ x: 0, y: 0.2, z: 0.5, color: 0x60e8ff, mode: 'blink', size: 0.7 });
    const dg = dk.build(); const fl = makeFlames(dk.engines); dg.add(fl.group);
    for (let i = 0; i < nDrones; i++) { const d = dg.clone(); root.add(d); anim.drones.push({ obj: d, r: 15 + rng() * 22, speed: (0.15 + rng() * 0.25) * (rng() < 0.5 ? 1 : -1), a: rng() * 6.28, y: -1 + rng() * 6, wob: rng() * 6 }); }
  }
  root.userData.anim = anim; root.userData.main = main;
  root.userData.dockPort = new THREE.Vector3(0, 0, 7.9);
  return root;
}
export function animateStation(root, t, dt) {
  const a = root.userData.anim; if (!a) return;
  for (const s of a.spin) s.obj.rotation.y += s.speed * dt;
  for (const c of a.cranes) c.obj.rotation.y = c.base + Math.sin(t * c.speed + c.base) * 1.2;
  for (const c of a.chase) c.obj.material.opacity = 0.15 + 0.85 * Math.max(0, Math.cos((t * 6 - c.i * 0.6) % (Math.PI * 2)));
  animateNavLights(root.userData.main, t);
  for (const d of a.drones) {
    d.a += d.speed * dt; const r = d.r + Math.sin(t * 0.5 + d.wob) * 4;
    d.obj.position.set(Math.sin(d.a) * r, d.y + Math.sin(t + d.wob), Math.cos(d.a) * r);
    d.obj.rotation.y = d.a + (d.speed > 0 ? Math.PI / 2 : -Math.PI / 2);
    animateNavLights(d.obj, t);
  }
}

// ================= v4: factions, installations, loot =================
const FMATS = {};
// faction-tinted copies of the pirate materials
export function factionMats(fid, rgb, hullHex) {
  if (FMATS[fid]) return FMATS[fid];
  const M = materials(); const c = new THREE.Color(rgb[0], rgb[1], rgb[2]); const base = c.clone().multiplyScalar(1 / Math.max(rgb[0], rgb[1], rgb[2]));
  const accent = M.pirateAccent.clone(); accent.color = base.clone().multiplyScalar(0.85); accent.emissive = base.clone().multiplyScalar(0.25);
  const hull = M.pirate.clone(); hull.color = new THREE.Color(hullHex); hull.emissive = base.clone();
  const red = M.red.clone(); red.color = c.clone();
  const redSoft = M.redSoft.clone(); redSoft.color = c.clone().multiplyScalar(0.4);
  FMATS[fid] = { [M.pirateAccent.uuid]: accent, [M.pirate.uuid]: hull, [M.red.uuid]: red, [M.redSoft.uuid]: redSoft, accent, hull, red, redSoft };
  return FMATS[fid];
}
// recolour a built pirate (in place) and bolt on a small faction-specific variant part
export function tintPirate(group, fid, rgb, hullHex, radius) {
  const F = factionMats(fid, rgb, hullHex);
  group.traverse((o) => { if (o.isMesh && F[o.material.uuid]) o.material = F[o.material.uuid]; });
  const k = new Kit(); const r = radius;
  if (fid === 'crimson') { for (const sx of [-1, 1]) k.add(F.hull, new THREE.ConeGeometry(0.12 * r, 0.9 * r, 4), sx * 0.45 * r, 0.25 * r, 0.2 * r, -0.5, 0, sx * 0.4); }
  else if (fid === 'void') { k.slab(F.accent, [[0, 0.5 * r], [0.12 * r, -0.6 * r], [-0.12 * r, -0.6 * r]], 0.06 * r, 0.35 * r); k.box(F.red, 0.05 * r, 0.5 * r, 0.6 * r, 0, 0.45 * r, -0.2 * r); }
  else if (fid === 'iron') { for (const sx of [-1, 1]) k.plate(F.hull, 0.25 * r, 0.35 * r, 0.9 * r, sx * 0.7 * r, 0.05 * r, 0); k.box(F.accent, 0.5 * r, 0.12 * r, 0.3 * r, 0, 0.32 * r, -0.3 * r); }
  else if (fid === 'eclipse') { const t = new THREE.TorusGeometry(0.75 * r, 0.035 * r, 4, 28); k.add(F.red, t, 0, 0.35 * r, 0, Math.PI / 2); }
  else if (fid === 'ashen') { for (const sx of [-1, 1]) { k.zcyl(F.accent, 0.1 * r, 0.14 * r, 0.6 * r, 8, sx * 0.55 * r, 0, -0.45 * r); k.zcyl(F.red, 0.08 * r, 0.08 * r, 0.04 * r, 8, sx * 0.55 * r, 0, -0.77 * r); } }
  const extra = k.build(); extra.name = 'variant'; group.add(extra);
}
// Pirate outpost parts. kind: core | gen | turret
export function buildInstallation(kind) {
  const k = new Kit(); const rng = mulberry(kind.length * 53 + 11); let radius = 2;
  if (kind === 'core') {
    const oct = []; for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2 + Math.PI / 8; oct.push([Math.cos(a) * 6.2, Math.sin(a) * 6.2]); }
    k.slab('pirateDark', oct, 0.9, -0.2);
    const oct2 = oct.map(([x, z]) => [x * 0.7, z * 0.7]); k.slab('pirate', oct2, 0.6, 0.45);
    k.cyl('pirateDark', 1.8, 2.4, 2.6, 10, 0, 1.9, 0); k.cyl('pirate', 1.2, 1.6, 1.6, 10, 0, 3.8, 0);
    k.sphere('red', 1.0, 0, 4.9, 0, 1, 0.8, 1, 14, 8);
    k.add('redSoft', new THREE.TorusGeometry(1.7, 0.12, 6, 28), 0, 3.4, 0, Math.PI / 2);
    for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2; k.box('pirateAccent', 0.7, 0.5, 3.2, Math.sin(a) * 3.6, 0.55, Math.cos(a) * 3.6, 0, a, 0); k.add('pirateBone', new THREE.ConeGeometry(0.25, 1.6, 4), Math.sin(a + 0.78) * 5.2, 0.9, Math.cos(a + 0.78) * 5.2); }
    k.dress(rng, -3.5, 3.5, -3.5, 3.5, 0.75, 26, 0.5); k.antenna(1.2, 4.4, 0.8, 2.6); k.antenna(-1.4, 4.0, -0.6, 2.0); k.dish(-3.6, 0.7, 2.6, 1.0, 0.7, 1.2);
    k.lights.push({ x: 0, y: 6.2, z: 0, color: 0xff2020, mode: 'strobe', size: 2.6 }); radius = 5.6;
  } else if (kind === 'gen') {
    k.cyl('pirateDark', 1.3, 1.6, 0.6, 8, 0, 0, 0); k.cyl('pirate', 0.45, 0.7, 2.6, 8, 0, 1.5, 0);
    for (let i = 0; i < 3; i++) { const a = i * Math.PI * 2 / 3; k.box('pirateBone', 0.2, 2.2, 0.4, Math.sin(a) * 0.9, 1.3, Math.cos(a) * 0.9, 0.2 * Math.cos(a), a, -0.2 * Math.sin(a)); }
    k.sphere('glow', 0.75, 0, 3.3, 0); k.add('glowSoft', new THREE.TorusGeometry(1.1, 0.06, 6, 24), 0, 3.3, 0, Math.PI / 2);
    radius = 2.2;
  } else if (kind === 'reactor') { // v7: fusion reactor (damage -> unstable discharges, destroyed -> core crippled)
    k.cyl('pirateDark', 2.0, 2.4, 0.7, 10, 0, 0.05, 0); k.cyl('pirate', 1.3, 1.6, 1.8, 10, 0, 1.2, 0);
    for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2 + 0.4; k.box('pirateBone', 0.25, 2.6, 0.9, Math.cos(a) * 1.7, 1.4, Math.sin(a) * 1.7, 0, -a, 0); k.vent(Math.cos(a) * 2.1, 0.45, Math.sin(a) * 2.1, 0.5, 0.8, 3, -a); }
    k.add('amber', new THREE.TorusGeometry(1.25, 0.14, 6, 24), 0, 2.2, 0, Math.PI / 2); k.add('amber', new THREE.TorusGeometry(1.0, 0.1, 6, 24), 0, 1.0, 0, Math.PI / 2);
    k.sphere('amber', 0.85, 0, 2.6, 0, 1, 1, 1, 14, 8); k.hazard(2.6, 0.05, 0.4, 0, 0.42, 1.9); k.pipe(-2.2, 0.5, 0.6, 2.2, -0.6, 0.12);
    k.lights.push({ x: 0, y: 3.7, z: 0, color: 0xffa020, mode: 'pulse', size: 2.6 }); radius = 2.4;
  } else if (kind === 'hangar') { // v7: fighter hangar (destroyed -> no more launches)
    k.slab('pirateDark', [[-2.8, -2.2], [2.8, -2.2], [2.8, 2.2], [-2.8, 2.2]], 0.5, -0.1);
    const arch = new THREE.CylinderGeometry(1.9, 1.9, 4.2, 12, 1, false, 0, Math.PI); arch.rotateZ(Math.PI / 2); arch.rotateY(Math.PI / 2); k.add('pirate', arch, 0, 0.2, -0.2, 0, 0, 0, 1.2, 0.8, 1);
    k.box('glowSoft', 3.0, 1.2, 0.06, 0, 0.75, 1.92); k.hazard(3.4, 0.06, 0.35, 0, 0.18, 2.4); k.hazard(0.35, 0.06, 2.0, -1.9, 0.18, 1.4); k.hazard(0.35, 0.06, 2.0, 1.9, 0.18, 1.4);
    k.box('pirateBone', 0.3, 1.6, 4.4, -2.5, 0.8, 0); k.box('pirateBone', 0.3, 1.6, 4.4, 2.5, 0.8, 0); k.antenna(2.2, 1.6, -1.6, 1.4);
    k.lights.push({ x: -1.6, y: 0.3, z: 2.6, color: 0xffb030, mode: 'blink', size: 1 }, { x: 1.6, y: 0.3, z: 2.6, color: 0xffb030, mode: 'blink', size: 1 }); radius = 2.8;
  } else {
    k.cyl('pirateDark', 1.2, 1.5, 0.9, 8, 0, 0.1, 0); k.hazard(2.2, 0.06, 0.4, 0, 0.58, 0.9); k.box('pirateAccent', 1.6, 0.25, 1.6, 0, 0.62, 0);
    radius = 1.9;
  }
  const g = k.build();
  if (kind === 'turret') { const tu = makeTurret('cannon', 1.7, 'pirate'); tu.position.y = 0.7; tu.name = 'eturret'; g.add(tu); }
  return { group: g, hardpoints: [{ x: 0, y: 1, z: 0 }], engines: [], radius };
}
// energy dome shown over an outpost core while its generators live
let DOME_GEO = null;
export function makeDome(rgb) {
  DOME_GEO ||= new THREE.SphereGeometry(1, 28, 14, 0, Math.PI * 2, 0, Math.PI / 2); DOME_GEO.userData.shared = true;
  const m = new THREE.ShaderMaterial({ uniforms: { uC: { value: new THREE.Color(rgb[0], rgb[1], rgb[2]).multiplyScalar(0.35) }, uT: { value: 0 }, uHit: { value: 0 } }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    vertexShader: 'varying vec3 vN; varying vec3 vV; varying vec3 vP; void main(){ vP=position; vN=normalize(normalMatrix*normal); vec4 mv=modelViewMatrix*vec4(position,1.0); vV=normalize(-mv.xyz); gl_Position=projectionMatrix*mv; }',
    fragmentShader: 'uniform vec3 uC; uniform float uT; uniform float uHit; varying vec3 vN; varying vec3 vV; varying vec3 vP; void main(){ float f=pow(1.0-abs(dot(vN,vV)),2.2); float hex=0.6+0.4*sin(vP.x*18.0+uT*2.0)*sin(vP.z*18.0)*sin(vP.y*18.0-uT); float band=0.5+0.5*sin(vP.y*30.0-uT*4.0); float a=(f*0.9+0.08*band)*hex*(1.0+uHit*2.0); gl_FragColor=vec4(uC*a,a); }' });
  const mesh = new THREE.Mesh(DOME_GEO, m); mesh.renderOrder = 7; mesh.name = 'dome'; return mesh;
}
// rarity glow ring for a turret
const RING_MATS = {};
export function rarityRing(turret, rar, rgb) {
  if (rar <= 0) return;
  const s = turret.userData.size || 1; const m = RING_MATS[rar] ||= new THREE.MeshBasicMaterial({ color: new THREE.Color(rgb[0], rgb[1], rgb[2]), transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false });
  const r = new THREE.Mesh(new THREE.TorusGeometry(0.56 * s, 0.035 * s * (1 + rar * 0.2), 4, 24), m); r.rotation.x = Math.PI / 2; r.position.y = 0.05 * s; r.name = 'rarityRing'; turret.add(r);
}
// loot pod: small capsule + rarity light beam (pooled by the game)
let POD_GEO = null, BEAM_GEO = null;
export function buildLootPod() {
  POD_GEO ||= (() => { const g = new THREE.OctahedronGeometry(0.55, 0); g.scale(1, 1.4, 1); g.userData.shared = true; return g; })();
  BEAM_GEO ||= (() => { const g = new THREE.CylinderGeometry(0.22, 0.5, 9, 10, 1, true); g.translate(0, 4.5, 0); g.userData.shared = true; return g; })();
  const g = new THREE.Group();
  const core = new THREE.Mesh(POD_GEO, new THREE.MeshBasicMaterial({ color: 0xffffff })); core.position.y = 0.8; g.add(core);
  const shell = new THREE.Mesh(POD_GEO, new THREE.MeshBasicMaterial({ color: 0xffffff, wireframe: true, transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending })); shell.scale.setScalar(1.45); shell.position.y = 0.8; g.add(shell);
  const beam = new THREE.Mesh(BEAM_GEO, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false })); g.add(beam);
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: 0xffffff, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true })); sp.material.userData.own = true; sp.scale.setScalar(4); sp.position.y = 0.8; g.add(sp);
  g.userData = { core, shell, beam, sp }; return g;
}
export function buildCacheCrate() {
  const k = new Kit(); k.box('dark', 1.6, 1.0, 1.1, 0, 0.5, 0); k.box('orange', 1.7, 0.18, 1.2, 0, 0.2, 0); k.box('orange', 1.7, 0.18, 1.2, 0, 0.85, 0); k.hazard(1.0, 0.04, 0.3, 0, 1.03, 0); k.box('green', 0.3, 0.06, 0.06, 0.55, 1.03, 0.4);
  const g = k.build(); const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: 0x5dff98, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true })); sp.material.userData.own = true; sp.scale.setScalar(5); sp.position.y = 0.8; g.add(sp); g.userData.sp = sp; return g;
}

// ================= v5: installations, flagships, boss components, civilians =================
// Pirate installation cores. kind: comm | yard | res | def | hq   (relay = friendly repair beacon)
export function buildInstallationV5(kind) {
  const k = new Kit(); const rng = mulberry(kind.charCodeAt(0) * 97 + kind.length * 13); let radius = 4;
  const ring = (r, n = 8) => { const pts = []; for (let i = 0; i < n; i++) { const a = i / n * Math.PI * 2 + Math.PI / n; pts.push([Math.cos(a) * r, Math.sin(a) * r]); } return pts; };
  if (kind === 'comm') {
    k.slab('pirateDark', ring(3.6, 6), 0.7, -0.2); k.slab('pirate', ring(2.4, 6), 0.4, 0.3);
    for (let i = 0; i < 4; i++) { const y = 1 + i * 1.6; k.cyl('pirateDark', 0.5 - i * 0.08, 0.6 - i * 0.08, 1.5, 6, 0, y, 0); for (let j = 0; j < 3; j++) { const a = j * 2.094 + i; k.box('pirateBone', 0.08, 1.6, 0.08, Math.cos(a) * 0.7, y, Math.sin(a) * 0.7); } }
    k.dish(-1.8, 0.3, 1.2, 1.3, 0.8, 0.6); k.dish(1.6, 0.3, -1.4, 1.0, 0.7, 2.6); k.dish(0, 5.6, 0, 0.9, 1.0, 1.2);
    k.antenna(0.3, 7.2, 0, 2.4); k.add('redSoft', new THREE.TorusGeometry(1.0, 0.06, 4, 20), 0, 4.6, 0, Math.PI / 2); k.sphere('red', 0.3, 0, 7.0, 0);
    k.lights.push({ x: 0, y: 9.7, z: 0, color: 0xff2020, mode: 'strobe', size: 2 }); radius = 4;
  } else if (kind === 'yard') {
    k.slab('pirateDark', [[-6, -4], [6, -4], [6, 4], [-6, 4]].map(([x, z]) => [x, z]), 0.5, -0.3);
    for (const sx of [-1, 1]) { for (let i = 0; i < 4; i++) { k.box('pirateBone', 0.35, 4.2, 0.35, sx * 5.2, 1.9, -3 + i * 2); } k.box('pirate', 0.4, 0.4, 8.4, sx * 5.2, 4.0, 0); k.hazard(0.5, 0.08, 8, sx * 5.2, 0.05, 0); }
    for (let i = 0; i < 4; i++) k.box('pirateDark', 10.8, 0.3, 0.3, 0, 4.0, -3 + i * 2);
    // half-built hull in the cradle
    k.slab('pirateAccent', [[0, 3.4], [1.5, 1.6], [2.0, -2.8], [-2.0, -2.8], [-1.5, 1.6]], 0.8, 1.0); k.box('pirateBone', 0.1, 1.4, 5, 0.9, 1.3, 0); k.box('pirateBone', 0.1, 1.4, 5, -0.9, 1.3, 0);
    k.box('pirateDark', 1.4, 0.4, 0.4, 0, 3.6, 0.6); k.cyl('pirateDark', 0.06, 0.06, 2.0, 4, 0, 2.6, 0.6); k.lights.push({ x: 0, y: 1.8, z: 0.6, color: 0xffb030, mode: 'blink', size: 1.6 });
    k.dress(rng, -4.5, 4.5, -3.5, 3.5, 0.0, 26, 0.45); radius = 6;
  } else if (kind === 'res') {
    k.sphere('pirateBone', 3.2, 0, 0.2, 0, 1.2, 0.55, 1, 9, 6); k.sphere('pirateDark', 2.6, 0.8, 0.8, -0.4, 1, 0.5, 1.1, 8, 5);
    k.cyl('pirate', 0.9, 1.1, 1.6, 8, 0, 2.2, 0); k.cyl('pirateDark', 0.25, 0.25, 3.4, 6, 0, 3.6, 0); k.cyl('orange', 0.12, 0.3, 1.2, 6, 0, 0.6, 0);
    for (let i = 0; i < 3; i++) { const a = i * 2.094; k.zcyl('pirateAccent', 0.55, 0.55, 1.6, 10, Math.cos(a) * 2.6, 1.3, Math.sin(a) * 2.6); k.box('pirateBone', 0.1, 1.6, 0.1, Math.cos(a) * 1.4, 2.6, Math.sin(a) * 1.4, 0.4 * Math.sin(a), 0, -0.4 * Math.cos(a)); }
    k.pipe(-2.6, 1.0, 0, 0, 0, 0.12); k.pipe(1.3, 1.0, 2.2, 0, 0, 0.12); k.add('amber', new THREE.TorusGeometry(0.9, 0.08, 4, 16), 0, 3.1, 0, Math.PI / 2);
    k.lights.push({ x: 0, y: 5.4, z: 0, color: 0xffa020, mode: 'blink', size: 1.6 }); radius = 4.6;
  } else if (kind === 'def') {
    k.slab('pirateDark', ring(4.6, 8), 1.0, 0); k.slab('pirate', ring(3.4, 8), 0.5, 0.75);
    for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2; k.plate('pirateBone', 1.2, 1.3, 0.6, Math.cos(a) * 4.4, 0.3, Math.sin(a) * 4.4, -a + Math.PI / 2); }
    k.cyl('pirateDark', 1.8, 2.1, 1.0, 10, 0, 1.4, 0); k.hazard(3.6, 0.06, 0.4, 0, 1.92, 2.0);
    k.lights.push({ x: 3.8, y: 1.2, z: 0, color: 0xff2020, mode: 'blink', size: 1.3 }, { x: -3.8, y: 1.2, z: 0, color: 0xff2020, mode: 'blink', size: 1.3 }); radius = 5;
  } else if (kind === 'hq') {
    k.slab('pirateDark', ring(9.4, 8), 1.2, -0.3); k.slab('pirate', ring(7.2, 8), 0.8, 0.6); k.slab('pirateDark', ring(4.6, 8), 1.6, 1.6);
    k.cyl('pirate', 2.6, 3.4, 3.6, 10, 0, 3.6, 0); k.cyl('pirateDark', 1.6, 2.2, 2.4, 10, 0, 6.4, 0); k.sphere('red', 1.3, 0, 8.0, 0, 1, 0.8, 1, 16, 8);
    k.add('redSoft', new THREE.TorusGeometry(3.0, 0.16, 6, 36), 0, 5.4, 0, Math.PI / 2); k.add('red', new THREE.TorusGeometry(5.6, 0.12, 6, 40), 0, 1.0, 0, Math.PI / 2);
    for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2 + 0.2; k.add('pirateBone', new THREE.ConeGeometry(0.4, 3.2, 4), Math.cos(a) * 8.6, 1.2, Math.sin(a) * 8.6); k.box('pirateAccent', 1.0, 0.7, 3.2, Math.cos(a) * 6.0, 1.1, Math.sin(a) * 6.0, 0, -a, 0); }
    k.dish(-4.2, 2.2, 3.2, 1.4, 0.7, 0.8); k.dish(4.4, 2.2, -2.8, 1.2, 0.7, 3.4); k.antenna(1.0, 8.6, 0.6, 3.2); k.antenna(-1.2, 8.2, -0.5, 2.4); k.dress(rng, -5, 5, -5, 5, 1.0, 50, 0.6);
    k.lights.push({ x: 0, y: 11.8, z: 0.6, color: 0xff2020, mode: 'strobe', size: 3 }); radius = 9;
  } else if (kind === 'relay') { // friendly repair beacon (player palette)
    k.slab('dark', ring(3.4, 8), 0.6, 0); k.slab('hull', ring(2.4, 8), 0.4, 0.5); k.cyl('hull', 0.9, 1.2, 2.4, 10, 0, 1.6, 0); k.cyl('dark', 0.4, 0.5, 1.6, 8, 0, 3.4, 0);
    k.add('green', new THREE.TorusGeometry(2.0, 0.09, 6, 30), 0, 1.6, 0, Math.PI / 2); k.add('glow', new THREE.TorusGeometry(1.1, 0.06, 6, 24), 0, 4.0, 0, Math.PI / 2); k.sphere('green', 0.35, 0, 4.4, 0);
    for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2; k.box('orange', 0.3, 0.2, 1.6, Math.cos(a) * 2.6, 0.45, Math.sin(a) * 2.6, 0, -a, 0); k.box('solar', 2.2, 0.05, 1.0, Math.cos(a) * 4.6, 1.2, Math.sin(a) * 4.6, 0.25, -a + Math.PI / 2, 0); }
    k.antenna(0.4, 4.6, 0, 1.6, false); k.lights.push({ x: 0, y: 4.8, z: 0, color: 0x30ff70, mode: 'pulse', size: 2.6 }); radius = 4;
  }
  const g = k.build();
  if (kind !== 'relay') { // v7: rotating radar mast + docking pad with landing lights
    const R = { comm: 3.2, yard: 5.4, res: 3.9, def: 4.2, hq: 7.8 }[kind] || 4; const rk = new Kit();
    rk.cyl('pirateDark', 0.12, 0.16, 1.4, 6, 0, 0.7, 0); rk.box('pirate', 2.6, 0.12, 0.3, 0, 1.45, 0); rk.box('pirateBone', 0.25, 0.7, 0.35, 1.2, 1.7, 0); rk.box('pirateBone', 0.25, 0.7, 0.35, -1.2, 1.7, 0); rk.dish(0, 1.45, 0.35, 0.6, 1.2, 0);
    rk.lights.push({ x: 0, y: 2.3, z: 0, color: 0xff3030, mode: 'blink', size: 1 });
    const radar = rk.build(); radar.name = 'spin'; radar.position.set(-R * 0.55, kind === 'hq' ? 2.8 : 1.0, R * 0.62); g.add(radar);
    const pk = new Kit(); pk.cyl('pirateDark', 2.1, 2.2, 0.3, 12, 0, 0, 0); pk.add('hazard', new THREE.RingGeometry(1.5, 1.8, 24), 0, 0.17, 0, -Math.PI / 2); pk.box('pirateBone', 0.4, 0.4, 2.4, 0, -0.05, -2.2);
    for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2; pk.lights.push({ x: Math.cos(a) * 1.95, y: 0.25, z: Math.sin(a) * 1.95, color: 0x40ff90, mode: 'blink', size: 0.7 }); }
    const pad = pk.build(); pad.name = 'pad'; pad.position.set(R * 0.95 + 1.6, 0.2, -R * 0.25); g.add(pad);
  }
  if (kind === 'def') { const tu = makeTurret('cannon', 3.4, 'pirate'); tu.position.y = 1.9; tu.name = 'eturret'; g.add(tu); }
  return { group: g, hardpoints: [{ x: 0, y: 2, z: 0 }], engines: [], radius };
}

// Faction flagships: five distinct silhouettes. Materials are faction-tinted copies of the pirate set.
export function buildFlagship(fk, F) {
  const k = new Kit(); const rng = mulberry(fk.charCodeAt(0) * 71 + 3); const turrets = []; const hard = []; let radius = 10;
  const D = 'pirateDark', H = F.hull, A = F.accent, R = F.red, B = 'pirateBone';
  if (fk === 'crimson') { // Dread Sovereign: armoured ram battleship
    k.slab(D, [[0, 12.5], [3.2, 7.5], [7, 0], [7.4, -8.5], [-7.4, -8.5], [-7, 0], [-3.2, 7.5]], 2.4, 0);
    k.slab(A, [[0, 11.4], [2.3, 7], [5.3, 0], [5.5, -7.4], [-5.5, -7.4], [-5.3, 0], [-2.3, 7]], 0.6, 1.5);
    for (const sx of [-1, 1]) { k.add(B, new THREE.ConeGeometry(0.6, 4.6, 5), sx * 1.7, 0, 12.6, Math.PI / 2, 0, sx * 0.2); for (let i = 0; i < 5; i++) k.plate(B, 1.4, 2.2, 2.1, sx * 7.8, 0, 3.2 - i * 2.15, sx * 0.03); for (let i = 0; i < 3; i++) k.engine(sx * (1.6 + i * 2.1), 0, -8.7, 0.85, 0.9); k.vent(sx * 3.6, 1.55, -5.8, 1.7, 2.1, 6); }
    k.plate(H, 3.4, 1.8, 4.4, 0, 2.4, -3.2); k.plate(H, 2.4, 1.6, 2.8, 0, 4.0, -3.6); k.plate(D, 1.5, 1.1, 1.5, 0, 5.2, -3.8); k.windows(0, 2.5, -0.98, 2.8, 10, 'x');
    k.sphere(R, 1.1, 0, 1.8, -0.4, 1, 0.6, 1, 16, 8); k.dress(rng, -4, 4, -7, 6, 1.7, 60, 0.6);
    for (let i = 0; i < 4; i++) { const h = { x: (i % 2 ? 1 : -1) * 2.6, y: 1.8, z: 6 - (i >> 1) * 5, size: 1.9 }; hard.push(h); turrets.push(h); }
    k.lights.push({ x: 0, y: 5.9, z: -3.8, color: 0xff2020, mode: 'strobe', size: 2.6 }); radius = 10;
  } else if (fk === 'void') { // Requiem: blade-thin stealth cruiser
    k.slab(D, [[0, 13], [1.6, 6], [6.5, -6], [5.6, -8], [1.2, -6], [-1.2, -6], [-5.6, -8], [-6.5, -6], [-1.6, 6]], 1.0, 0);
    k.slab(A, [[0, 12], [0.8, 5], [3.6, -5.5], [-3.6, -5.5], [-0.8, 5]], 0.25, 0.6);
    k.box(R, 0.18, 0.12, 16, 0, 0.78, 2.5); for (const sx of [-1, 1]) { k.slab(A, [[sx * 1.6, 2], [sx * 4.8, -4], [sx * 4.2, -5.5]], 0.15, 1.2); k.box(R, 0.06, 1.8, 3.5, sx * 3.2, 1.2, -3.6, 0, sx * 0.5, 0); k.engine(sx * 1.4, 0, -6.6, 0.55, 0.7); }
    k.plate(H, 1.6, 1.0, 3.2, 0, 1.0, -1.6); k.box('glass', 0.9, 0.2, 0.6, 0, 1.6, -0.2); k.dress(rng, -1.2, 1.2, -5, 8, 0.6, 26, 0.35);
    for (let i = 0; i < 3; i++) { const h = { x: 0, y: 1.0, z: 9 - i * 4, size: 1.4 }; hard.push(h); }
    turrets.push({ x: 0, y: 1.3, z: 5, size: 1.5 }); k.lights.push({ x: 0, y: 1.5, z: 12.5, color: 0xa040ff, mode: 'pulse', size: 2.2 }); radius = 9;
  } else if (fk === 'iron') { // Bastion of Iron: hexagonal flying fortress
    const hex = []; for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2 + Math.PI / 6; hex.push([Math.cos(a) * 10, Math.sin(a) * 11.5]); }
    k.slab(D, hex, 3.0, 0); k.slab(H, hex.map(([x, z]) => [x * 0.75, z * 0.75]), 1.0, 1.9); k.slab(A, hex.map(([x, z]) => [x * 0.45, z * 0.45]), 1.4, 3.0);
    for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2; k.plate(B, 3.4, 3.0, 1.4, Math.cos(a) * 9.4, 0.2, Math.sin(a) * 10.4, -a + Math.PI / 2); }
    k.box('pirateDark', 4.2, 1.6, 3.0, 0, 1.0, -9.4); k.hazard(4.0, 0.1, 0.4, 0, 1.85, -8.2); k.box('glowSoft', 3.6, 1.0, 0.1, 0, 1.0, -10.9);
    for (let i = 0; i < 4; i++) k.engine(-4.5 + i * 3, 0, -11.2, 0.9, 0.9); k.plate(H, 3, 2.2, 3, 0, 4.4, -2); k.windows(0, 4.6, -0.45, 2.4, 8, 'x'); k.dress(rng, -6, 6, -7, 7, 2.5, 70, 0.7);
    for (let i = 0; i < 6; i++) { const h = { x: (i % 2 ? 1 : -1) * 4.6, y: 2.6, z: 6 - (i >> 1) * 5, size: 2.0 }; hard.push(h); turrets.push(h); }
    k.lights.push({ x: 0, y: 6.0, z: -2, color: 0x4060ff, mode: 'strobe', size: 2.6 }); radius = 11;
  } else if (fk === 'eclipse') { // Penumbra: ring-ship with prism spikes
    k.sphere(D, 3.2, 0, 1.2, 0, 1, 0.7, 1.3, 18, 10); k.sphere(H, 2.2, 0, 2.2, 0.4, 1, 0.6, 1.2, 16, 8); k.sphere(R, 1.0, 0, 3.0, 1.4, 1, 0.7, 1, 14, 8);
    const t = new THREE.TorusGeometry(8, 0.8, 8, 48); k.add(A, t, 0, 1.2, 0, Math.PI / 2); const t2 = new THREE.TorusGeometry(8, 0.25, 6, 48); k.add(R, t2, 0, 1.9, 0, Math.PI / 2);
    for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2; k.box(D, 0.6, 0.5, 5.6, Math.cos(a) * 5.2, 1.2, Math.sin(a) * 5.2, 0, -a + Math.PI / 2, 0); k.add(B, new THREE.OctahedronGeometry(0.9, 0), Math.cos(a) * 8.8, 1.2, Math.sin(a) * 8.8, 0, 0, 0, 0.6, 1.8, 0.6); }
    k.engine(-1.4, 1.0, -4.0, 0.7, 0.8); k.engine(1.4, 1.0, -4.0, 0.7, 0.8);
    for (let i = 0; i < 3; i++) { const a = i / 3 * Math.PI * 2 + 0.5; const h = { x: Math.cos(a) * 3.4, y: 2.4, z: Math.sin(a) * 3.4, size: 1.5 }; hard.push(h); }
    turrets.push({ x: 0, y: 3.6, z: -1.2, size: 1.6 }); k.lights.push({ x: 0, y: 4.2, z: 1.4, color: 0xffd040, mode: 'pulse', size: 3 }); radius = 9.5;
  } else { // ashen Cinderwake: twin-hull raider carrier
    for (const sx of [-1, 1]) {
      k.slab(D, [[sx * 3.2, 11], [sx * 5.0, 6], [sx * 5.6, -8], [sx * 1.6, -8], [sx * 1.8, 6]].map(([x, z]) => [x, z]), 1.6, 0);
      k.slab(A, [[sx * 3.3, 9.6], [sx * 4.5, 5.6], [sx * 4.8, -6.5], [sx * 2.3, -6.5], [sx * 2.4, 5.6]], 0.4, 1.0);
      for (let i = 0; i < 3; i++) k.engine(sx * (2.4 + i * 1.2), 0, -8.4, 0.55, 0.9); k.add(B, new THREE.ConeGeometry(0.4, 3, 5), sx * 3.4, 0, 11.6, Math.PI / 2);
      k.box(R, 0.12, 0.2, 12, sx * 5.4, 0.5, 0); k.hazard(0.3, 0.08, 6, sx * 2.0, 0.85, 0);
    }
    k.box(D, 3.6, 0.8, 7, 0, 0.3, 0); k.plate(H, 2.4, 1.4, 3.4, 0, 1.2, -1.5); k.windows(0, 1.4, 0.2, 1.8, 6, 'x'); k.dress(rng, -1.4, 1.4, -4, 3, 0.75, 24, 0.4);
    for (let i = 0; i < 4; i++) { const h = { x: (i % 2 ? 1 : -1) * 3.8, y: 1.0, z: 7 - (i >> 1) * 6, size: 1.3 }; hard.push(h); }
    turrets.push({ x: -3.8, y: 1.0, z: 4, size: 1.4 }, { x: 3.8, y: 1.0, z: 4, size: 1.4 }); k.lights.push({ x: 0, y: 2.2, z: -1.5, color: 0xff8020, mode: 'strobe', size: 2.2 }); radius = 9;
  }
  const group = k.build();
  for (const t of turrets) { const tu = makeTurret('cannon', t.size, 'pirate'); tu.position.set(t.x, t.y, t.z); tu.name = 'eturret'; group.add(tu); }
  return { group, hardpoints: hard, engines: k.engines, radius };
}
// destructible boss components (separate hittable entities that ride on the flagship)
export function buildBossPart(kind) {
  const k = new Kit(); let radius = 1.8;
  if (kind === 'cannon') { k.cyl('pirateDark', 1.2, 1.5, 0.6, 10, 0, 0.3, 0); radius = 2; }
  else if (kind === 'missile') { k.cyl('pirateDark', 1.1, 1.3, 0.5, 8, 0, 0.25, 0); radius = 1.9; }
  else if (kind === 'engine') { k.zcyl('pirateDark', 1.2, 1.5, 3.0, 12, 0, 0.6, 0); k.zcyl('pirate', 1.6, 1.6, 0.5, 12, 0, 0.6, 0.3); k.zcyl('glow', 0.9, 0.9, 0.08, 12, 0, 0.6, -1.55); k.add('orange', new THREE.TorusGeometry(1.25, 0.12, 6, 18), 0, 0.6, -1.4); radius = 2; }
  else if (kind === 'prism') { k.cyl('pirateDark', 0.9, 1.1, 0.5, 8, 0, 0.25, 0); k.add('red', new THREE.OctahedronGeometry(0.9, 0), 0, 1.8, 0, 0, 0, 0, 0.8, 1.6, 0.8); radius = 1.6; }
  else if (kind === 'dish') { k.cyl('pirateDark', 0.9, 1.1, 0.5, 8, 0, 0.25, 0); k.dish(0, 0.4, 0, 1.3, 0.6, 0); radius = 1.6; }
  else if (kind === 'bay') { k.box('pirateDark', 3.0, 1.2, 2.0, 0, 0.6, 0); k.hazard(3.0, 0.08, 0.3, 0, 1.25, 0.9); k.box('glowSoft', 2.6, 0.7, 0.05, 0, 0.6, -1.02); radius = 2; }
  else if (kind === 'shroud') { k.sphere('pirateDark', 0.9, 0, 0.6, 0, 1, 0.7, 1, 12, 8); k.add('red', new THREE.TorusGeometry(1.2, 0.08, 6, 20), 0, 0.6, 0, Math.PI / 2); radius = 1.5; }
  else if (kind === 'core') { k.cyl('pirateDark', 1.0, 1.2, 0.4, 10, 0, 0.2, 0); k.sphere('red', 0.9, 0, 1.0, 0, 1, 1, 1, 14, 10); k.add('redSoft', new THREE.TorusGeometry(1.3, 0.07, 6, 22), 0, 1.0, 0, Math.PI / 2); radius = 1.5; }
  else { // shield pylon (phase generators)
    k.cyl('pirateDark', 1.0, 1.3, 0.5, 8, 0, 0, 0); k.cyl('pirate', 0.35, 0.55, 2.2, 8, 0, 1.3, 0); k.sphere('glow', 0.6, 0, 2.8, 0); k.add('glowSoft', new THREE.TorusGeometry(0.9, 0.05, 6, 20), 0, 2.8, 0, Math.PI / 2); radius = 1.8;
  }
  const g = k.build();
  if (kind === 'cannon') { const tu = makeTurret('cannon', 2.2, 'pirate'); tu.position.y = 0.6; tu.name = 'eturret'; g.add(tu); }
  if (kind === 'missile') { const tu = makeTurret('missile', 2.0, 'pirate'); tu.position.y = 0.5; tu.name = 'eturret'; g.add(tu); }
  return { group: g, hardpoints: [{ x: 0, y: 1, z: 0 }], engines: [], radius };
}
// civilian freighter (player palette) for escort missions and merchants
export function buildCivilian(kind = 'freighter') {
  const k = new Kit();
  if (kind === 'merchant') {
    k.box('hull', 2.2, 1.6, 7, 0, 0, 0); k.plate('dark', 2.8, 0.5, 7.4, 0, -0.6, 0); k.plate('hull', 1.8, 1.2, 2, 0, 1.1, 2.4); k.box('glass', 1.4, 0.3, 0.2, 0, 1.3, 3.4);
    for (const sx of [-1, 1]) { k.box('orange', 0.2, 1.0, 5, sx * 1.15, 0.2, -0.5); k.box('solar', 3.0, 0.05, 1.6, sx * 2.8, 0.6, -1.2); k.engine(sx * 0.7, 0, -3.6, 0.45, 0.6); }
    k.lights.push({ x: 0, y: 1.8, z: 2.4, color: 0x30ff70, mode: 'blink', size: 1.6 }, { x: 0, y: 0.9, z: -3.4, color: 0xffd040, mode: 'blink', size: 1.2 });
  } else {
    k.box('dark', 1.2, 0.9, 5.6, 0, 0, -0.3); k.plate('hull', 1.5, 0.9, 1.6, 0, 0.1, 2.8); k.box('glass', 0.9, 0.25, 0.2, 0, 0.35, 3.55);
    for (let i = 0; i < 3; i++) for (const sx of [-1, 1]) { k.box(i % 2 ? 'orange' : 'hull', 0.9, 0.8, 1.4, sx * 1.1, 0.05, 1.2 - i * 1.6); }
    k.engine(-0.45, 0, -3.2, 0.32, 0.5); k.engine(0.45, 0, -3.2, 0.32, 0.5); k.lights.push({ x: 0, y: 0.7, z: -3.0, color: 0x30ff70, mode: 'blink', size: 1.2 });
  }
  return { group: k.build(), engines: k.engines, radius: kind === 'merchant' ? 3.6 : 3 };
}
// recolour pirate materials in place without adding a variant part (flagships, installations, boss parts)
export function retint(group, fid, rgb, hullHex) { const F = factionMats(fid, rgb, hullHex); group.traverse((o) => { if (o.isMesh && F[o.material.uuid]) o.material = F[o.material.uuid]; }); return F; }

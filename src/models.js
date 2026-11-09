// Procedural models: ships, station, pirates, asteroids. Built from primitives and merged per material.
import * as THREE from 'three';
import { mergeGeometries } from '../vendor/addons/utils/BufferGeometryUtils.js';
import { mulberry, fbm3, noise3 } from './util.js';

// ---------- Textures ----------
function canvasTex(w, h, draw, srgb = true) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}
function hullDraw(seed, base) {
  return (g, w, h) => {
    const r = mulberry(seed);
    g.fillStyle = base; g.fillRect(0, 0, w, h);
    // big plates
    for (let i = 0; i < 70; i++) {
      const x = Math.floor(r() * 16) * 32, y = Math.floor(r() * 16) * 32;
      const pw = (1 + Math.floor(r() * 4)) * 32, ph = (1 + Math.floor(r() * 3)) * 32;
      const v = Math.floor(r() * 40) - 20;
      g.fillStyle = `rgba(${v > 0 ? 255 : 0},${v > 0 ? 255 : 0},${v > 0 ? 255 : 0},${Math.abs(v) / 160})`;
      g.fillRect(x, y, pw, ph);
      g.strokeStyle = 'rgba(0,0,0,0.55)'; g.lineWidth = 2; g.strokeRect(x + 1, y + 1, pw - 2, ph - 2);
      g.strokeStyle = 'rgba(255,255,255,0.10)'; g.lineWidth = 1; g.strokeRect(x + 3, y + 3, pw - 6, ph - 6);
    }
    // fine seams
    g.strokeStyle = 'rgba(0,0,0,0.35)'; g.lineWidth = 1;
    for (let i = 0; i <= 32; i++) { g.beginPath(); g.moveTo(i * 16, 0); g.lineTo(i * 16, h); g.stroke(); }
    // vents / greebles
    for (let i = 0; i < 40; i++) {
      const x = r() * w, y = r() * h, n = 3 + Math.floor(r() * 5);
      g.fillStyle = 'rgba(0,0,0,0.45)';
      for (let k = 0; k < n; k++) g.fillRect(x, y + k * 4, 14, 2);
    }
    for (let i = 0; i < 260; i++) { g.fillStyle = 'rgba(0,0,0,0.5)'; g.fillRect(r() * w, r() * h, 2, 2); }
    // grime
    for (let i = 0; i < 25; i++) {
      const x = r() * w, y = r() * h, rad = 20 + r() * 60;
      const gr = g.createRadialGradient(x, y, 0, x, y, rad);
      gr.addColorStop(0, 'rgba(0,0,0,0.18)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = gr; g.fillRect(x - rad, y - rad, rad * 2, rad * 2);
    }
  };
}
let TEX = null;
function textures() {
  if (TEX) return TEX;
  TEX = {
    hull: canvasTex(512, 512, hullDraw(7, '#9aa0a8')),
    windows: canvasTex(512, 512, (g, w, h) => {
      const r = mulberry(99); g.fillStyle = '#000'; g.fillRect(0, 0, w, h);
      for (let i = 0; i < 110; i++) {
        const x = Math.floor(r() * 64) * 8, y = Math.floor(r() * 64) * 8, n = 1 + Math.floor(r() * 5);
        g.fillStyle = r() < 0.75 ? '#7fe9ff' : '#ffb36b';
        for (let k = 0; k < n; k++) g.fillRect(x + k * 6, y, 4, 2);
      }
    }),
    solar: canvasTex(256, 256, (g, w, h) => {
      g.fillStyle = '#0b1a3a'; g.fillRect(0, 0, w, h);
      for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) {
        const gr = g.createLinearGradient(x * 32, y * 32, x * 32 + 32, y * 32 + 32);
        gr.addColorStop(0, '#1d4fa8'); gr.addColorStop(1, '#0e2a66');
        g.fillStyle = gr; g.fillRect(x * 32 + 2, y * 32 + 2, 28, 28);
      }
    }),
    glow: canvasTex(64, 64, (g, w, h) => {
      const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
      gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.25, 'rgba(255,255,255,0.6)');
      gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, w, h);
    }, false),
  };
  return TEX;
}

let MATS = null;
export function materials() {
  if (MATS) return MATS;
  const T = textures();
  const hdr = (r, g, b) => new THREE.Color(r, g, b);
  MATS = {
    hull: new THREE.MeshStandardMaterial({ color: 0x8c949e, map: T.hull, metalness: 0.55, roughness: 0.42, emissive: 0xffffff, emissiveMap: T.windows, emissiveIntensity: 1.6 }),
    dark: new THREE.MeshStandardMaterial({ color: 0x4a5059, map: T.hull, metalness: 0.65, roughness: 0.4 }),
    orange: new THREE.MeshStandardMaterial({ color: 0xff7a26, map: T.hull, metalness: 0.3, roughness: 0.45, emissive: 0x3a1000, emissiveIntensity: 0.6 }),
    glass: new THREE.MeshStandardMaterial({ color: 0x0a1a24, metalness: 0.9, roughness: 0.1, emissive: 0x1a8fb0, emissiveIntensity: 0.9 }),
    glow: new THREE.MeshBasicMaterial({ color: hdr(0.5, 2.6, 3.6) }),
    glowSoft: new THREE.MeshBasicMaterial({ color: hdr(0.25, 1.1, 1.5) }),
    amber: new THREE.MeshBasicMaterial({ color: hdr(3.2, 1.6, 0.4) }),
    red: new THREE.MeshBasicMaterial({ color: hdr(3.5, 0.35, 0.3) }),
    green: new THREE.MeshBasicMaterial({ color: hdr(0.5, 3.0, 1.0) }),
    pirate: new THREE.MeshStandardMaterial({ color: 0x6a4a4e, map: T.hull, metalness: 0.5, roughness: 0.45, emissive: 0xff2030, emissiveMap: T.windows, emissiveIntensity: 1.4 }),
    pirateAccent: new THREE.MeshStandardMaterial({ color: 0xd02a30, map: T.hull, metalness: 0.35, roughness: 0.45, emissive: 0x6a0008, emissiveIntensity: 1.0 }),
    pirateBone: new THREE.MeshStandardMaterial({ color: 0xb8ad9a, map: T.hull, metalness: 0.3, roughness: 0.6 }),
    solar: new THREE.MeshStandardMaterial({ color: 0xffffff, map: T.solar, metalness: 0.8, roughness: 0.25, emissive: 0x0a2a6a, emissiveIntensity: 0.6, side: THREE.DoubleSide }),
    rock: new THREE.MeshStandardMaterial({ color: 0x55525a, roughness: 0.95, metalness: 0.05, flatShading: true }),
  };
  return MATS;
}
export const glowTexture = () => textures().glow;

// ---------- Kit: collect parts and merge per material ----------
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _p = new THREE.Vector3(), _s = new THREE.Vector3();
function scaleUV(geo, su, sv) {
  const uv = geo.attributes.uv; if (!uv) return;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * su, uv.getY(i) * sv);
}
function boxGeo(w, h, d) {
  const g = new THREE.BoxGeometry(w, h, d);
  const uv = g.attributes.uv; const k = 1 / 4;
  // faces: px,nx (d,h) py,ny (w,d) pz,nz (w,h); 4 verts each
  const dims = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
  for (let f = 0; f < 6; f++) for (let v = 0; v < 4; v++) {
    const i = f * 4 + v; uv.setXY(i, uv.getX(i) * dims[f][0] * k + f * 0.37, uv.getY(i) * dims[f][1] * k + f * 0.21);
  }
  return g;
}
export class Kit {
  constructor() { this.parts = {}; this.engines = []; this.mounts = []; this.extras = []; }
  add(mat, geo, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) {
    _e.set(rx, ry, rz); _q.setFromEuler(_e); _p.set(x, y, z); _s.set(sx, sy, sz);
    _m.compose(_p, _q, _s); geo.applyMatrix4(_m);
    if (geo.index) geo = geo.toNonIndexed();
    for (const k of Object.keys(geo.attributes)) if (!['position', 'normal', 'uv'].includes(k)) geo.deleteAttribute(k);
    if (!geo.attributes.uv) geo.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(geo.attributes.position.count * 2), 2));
    (this.parts[mat] ||= []).push(geo);
    return this;
  }
  box(mat, w, h, d, x, y, z, rx, ry, rz) { return this.add(mat, boxGeo(w, h, d), x, y, z, rx, ry, rz); }
  cyl(mat, rt, rb, h, seg, x, y, z, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) {
    const g = new THREE.CylinderGeometry(rt, rb, h, seg); scaleUV(g, Math.PI * 2 * Math.max(rt, rb) / 4, h / 4);
    return this.add(mat, g, x, y, z, rx, ry, rz, sx, sy, sz);
  }
  // cylinder along Z axis
  zcyl(mat, rt, rb, len, seg, x, y, z, sx = 1, sy = 1) { return this.cyl(mat, rt, rb, len, seg, x, y, z, Math.PI / 2, 0, 0, sx, 1, sy); }
  sphere(mat, r, x, y, z, sx = 1, sy = 1, sz = 1, ws = 12, hs = 8) {
    const g = new THREE.SphereGeometry(r, ws, hs); scaleUV(g, r * 1.5, r);
    return this.add(mat, g, x, y, z, 0, 0, 0, sx, sy, sz);
  }
  // wedge/prism from a 2D outline on XZ plane (points [x,z]) with height h centered at y
  slab(mat, pts, h, y = 0) {
    const shape = new THREE.Shape(); pts.forEach(([x, z], i) => (i ? shape.lineTo(x, -z) : shape.moveTo(x, -z)));
    const g = new THREE.ExtrudeGeometry(shape, { depth: h, bevelEnabled: true, bevelThickness: h * 0.18, bevelSize: h * 0.18, bevelSegments: 1 });
    g.rotateX(-Math.PI / 2); g.translate(0, y - h / 2, 0);
    scaleUV(g, 0.25, 0.25);
    return this.add(mat, g);
  }
  engine(x, y, z, r, len = 0.6) {
    this.zcyl('dark', r * 1.15, r * 0.9, len, 10, x, y, z + len / 2);
    this.zcyl('glow', r * 0.8, r * 0.8, 0.06, 10, x, y, z - 0.02);
    this.engines.push({ x, y, z: z - 0.05, r });
  }
  greebles(rng, mat, x0, x1, z0, z1, y, n, s = 0.25) {
    for (let i = 0; i < n; i++) {
      const w = s * (0.4 + rng() * 1.2), d = s * (0.4 + rng() * 1.6), h = s * (0.2 + rng() * 0.8);
      this.box(rng() < 0.2 ? 'orange' : mat, w, h, d, x0 + rng() * (x1 - x0), y + h / 2, z0 + rng() * (z1 - z0));
    }
  }
  build() {
    const M = materials(); const g = new THREE.Group();
    for (const [mat, geos] of Object.entries(this.parts)) {
      const merged = mergeGeometries(geos, false);
      const mesh = new THREE.Mesh(merged, M[mat] || mat);
      g.add(mesh);
    }
    for (const e of this.extras) g.add(e);
    return g;
  }
}

// ---------- Turrets / mounts ----------
export function makeTurret(kind = 'cannon', size = 1, palette = 'player') {
  const k = new Kit(); const s = size;
  const hullM = palette === 'player' ? 'dark' : 'pirate', acc = palette === 'player' ? 'orange' : 'pirateAccent';
  if (kind === 'laser') {
    k.cyl(hullM, 0.32 * s, 0.4 * s, 0.25 * s, 8, 0, 0.12 * s, 0);
    k.box(acc, 0.3 * s, 0.24 * s, 0.5 * s, 0, 0.32 * s, 0.05 * s);
    k.zcyl('dark', 0.07 * s, 0.11 * s, 0.75 * s, 8, 0, 0.32 * s, 0.55 * s);
    k.zcyl('glow', 0.06 * s, 0.06 * s, 0.08 * s, 8, 0, 0.32 * s, 0.94 * s);
  } else if (kind === 'missile') {
    k.cyl(hullM, 0.38 * s, 0.45 * s, 0.22 * s, 8, 0, 0.1 * s, 0);
    k.box(acc, 0.75 * s, 0.38 * s, 0.7 * s, 0, 0.38 * s, 0);
    for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) k.zcyl('dark', 0.1 * s, 0.1 * s, 0.1 * s, 6, (i - 0.5) * 0.36 * s, (0.3 + j * 0.17) * s, 0.36 * s);
  } else if (kind === 'pulse') {
    k.cyl(hullM, 0.4 * s, 0.48 * s, 0.25 * s, 10, 0, 0.12 * s, 0);
    k.sphere('dark', 0.32 * s, 0, 0.42 * s, 0);
    const ring = new THREE.TorusGeometry(0.42 * s, 0.06 * s, 6, 18); ring.rotateX(Math.PI / 2);
    k.add('glow', ring, 0, 0.42 * s, 0);
  } else {
    k.cyl(hullM, 0.36 * s, 0.44 * s, 0.24 * s, 8, 0, 0.12 * s, 0);
    k.box(acc, 0.5 * s, 0.3 * s, 0.55 * s, 0, 0.36 * s, 0);
    k.zcyl('dark', 0.06 * s, 0.07 * s, 0.8 * s, 6, -0.12 * s, 0.38 * s, 0.6 * s);
    k.zcyl('dark', 0.06 * s, 0.07 * s, 0.8 * s, 6, 0.12 * s, 0.38 * s, 0.6 * s);
  }
  const g = k.build();
  g.userData.muzzle = new THREE.Vector3(0, 0.35 * s, (kind === 'laser' ? 0.98 : 0.95) * s);
  g.userData.kind = kind;
  return g;
}

// ---------- Player ships ----------
// Each returns { group, hardpoints:[{x,y,z,size}], engines:[], length }
export function buildShip(tier) {
  const k = new Kit(); const rng = mulberry(1000 + tier * 17); let hard = []; let length = 4;
  if (tier === 1) {
    length = 4;
    k.slab('hull', [[0, 2.2], [0.55, 1.2], [0.75, -1.4], [-0.75, -1.4], [-0.55, 1.2]], 0.55, 0);
    k.slab('orange', [[0, 2.0], [0.32, 1.25], [-0.32, 1.25]], 0.1, 0.36);
    k.box('glass', 0.42, 0.22, 0.7, 0, 0.42, 0.5, -0.15);
    k.box('dark', 2.8, 0.1, 0.7, 0, -0.05, -0.55);
    for (const sx of [-1, 1]) {
      k.box('hull', 0.5, 0.5, 1.7, sx * 1.15, 0, -0.55);
      k.box('orange', 0.08, 0.32, 1.1, sx * 1.42, 0.02, -0.45);
      k.box('orange', 0.5, 0.06, 0.5, sx * 1.15, 0.28, -0.1);
      k.engine(sx * 1.15, 0, -1.4, 0.22, 0.4);
    }
    k.engine(0, 0.05, -1.5, 0.26, 0.4);
    k.greebles(rng, 'dark', -0.4, 0.4, -1.2, 0.2, 0.3, 8, 0.2);
    k.cyl('dark', 0.02, 0.02, 0.7, 4, -0.25, 0.6, -0.6);
    hard = [{ x: 0, y: 0.32, z: 1.15, size: 0.8 }];
  } else if (tier === 2) {
    length = 6;
    k.slab('hull', [[0, 3.0], [0.9, 2.0], [1.0, -2.6], [-1.0, -2.6], [-0.9, 2.0]], 0.85, 0);
    k.box('orange', 1.5, 0.75, 1.9, 0, 0.75, -1.2);
    k.box('dark', 1.55, 0.12, 0.12, 0, 1.14, -0.6); k.box('dark', 1.55, 0.12, 0.12, 0, 1.14, -1.8);
    k.box('glass', 0.7, 0.28, 0.8, 0, 0.55, 1.6, -0.12);
    k.box('hull', 0.9, 0.3, 1.2, 0, 0.55, 0.4);
    for (const sx of [-1, 1]) {
      // mining arms
      k.box('dark', 0.5, 0.4, 1.2, sx * 1.15, 0, 0.6);
      k.box('hull', 0.32, 0.32, 1.9, sx * 1.55, 0, 1.6, 0, sx * -0.12);
      k.box('orange', 0.5, 0.42, 0.6, sx * 1.7, 0, 2.6);
      k.box('dark', 0.12, 0.18, 0.7, sx * 1.48, 0, 3.05, 0, sx * 0.4);
      k.box('dark', 0.12, 0.18, 0.7, sx * 1.95, 0, 3.0, 0, sx * -0.3);
      k.box('hull', 0.7, 0.7, 2.2, sx * 1.35, 0, -1.6);
      k.box('orange', 0.08, 0.5, 1.4, sx * 1.72, 0, -1.5);
      k.engine(sx * 1.35, 0, -2.75, 0.3, 0.5);
    }
    k.engine(0, 0.1, -2.75, 0.36, 0.5);
    k.greebles(rng, 'dark', -0.6, 0.6, -0.2, 1.2, 0.42, 10, 0.25);
    k.cyl('dark', 0.03, 0.03, 1.0, 4, 0.4, 1.4, -0.2);
    hard = [{ x: -1.7, y: 0.25, z: 2.55, size: 0.85 }, { x: 1.7, y: 0.25, z: 2.55, size: 0.85 }];
  } else if (tier === 3) {
    length = 9;
    k.slab('hull', [[0, 4.6], [0.8, 3.2], [1.5, 0.5], [1.6, -3.8], [-1.6, -3.8], [-1.5, 0.5], [-0.8, 3.2]], 1.0, 0);
    k.slab('dark', [[0, 4.1], [0.6, 3.0], [1.1, 0.4], [1.1, -3.5], [-1.1, -3.5], [-1.1, 0.4], [-0.6, 3.0]], 0.5, 0.65);
    k.slab('orange', [[0, 4.3], [0.42, 3.4], [-0.42, 3.4]], 0.12, 0.62);
    // bridge tower
    k.box('hull', 1.3, 0.7, 1.8, 0, 1.15, -1.0);
    k.box('hull', 0.9, 0.6, 1.1, 0, 1.75, -1.2);
    k.box('glass', 0.8, 0.18, 0.2, 0, 1.75, -0.62);
    k.box('orange', 0.95, 0.12, 1.15, 0, 2.1, -1.2);
    k.cyl('dark', 0.03, 0.03, 1.4, 4, 0.25, 2.6, -1.4); k.cyl('dark', 0.03, 0.03, 0.9, 4, -0.25, 2.4, -1.5);
    for (const sx of [-1, 1]) {
      k.zcyl('orange', 0.5, 0.5, 2.0, 10, sx * 2.05, 0, -0.9);
      k.zcyl('dark', 0.52, 0.52, 0.15, 10, sx * 2.05, 0, -0.3); k.zcyl('dark', 0.52, 0.52, 0.15, 10, sx * 2.05, 0, -1.5);
      k.box('dark', 0.5, 0.3, 0.5, sx * 1.7, 0, -0.9);
      k.box('hull', 0.8, 0.8, 2.0, sx * 1.25, 0, -3.0);
      k.box('orange', 0.08, 0.5, 1.2, sx * 1.67, 0, -2.9);
      k.engine(sx * 1.25, 0.1, -4.0, 0.33, 0.5);
      k.engine(sx * 0.45, 0.1, -3.95, 0.3, 0.5);
    }
    k.greebles(rng, 'dark', -0.9, 0.9, 0.3, 2.6, 0.9, 16, 0.3);
    k.greebles(rng, 'dark', -0.9, 0.9, -3.4, -2.0, 0.9, 10, 0.3);
    hard = [{ x: 0, y: 0.9, z: 2.3, size: 1.25 }, { x: -0.95, y: 0.9, z: 0.4, size: 1.1 }, { x: 0.95, y: 0.9, z: 0.4, size: 1.1 }];
  } else if (tier === 4) {
    length = 12;
    k.slab('hull', [[0, 6.2], [1.0, 4.6], [2.0, 1.0], [2.1, -5.2], [-2.1, -5.2], [-2.0, 1.0], [-1.0, 4.6]], 1.3, 0);
    k.slab('dark', [[0, 5.6], [0.8, 4.2], [1.5, 1.0], [1.5, -4.8], [-1.5, -4.8], [-1.5, 1.0], [-0.8, 4.2]], 0.6, 0.85);
    k.slab('orange', [[0, 5.9], [0.55, 4.8], [-0.55, 4.8]], 0.14, 0.8);
    // tower
    k.box('hull', 1.8, 0.8, 2.4, 0, 1.45, -1.6);
    k.box('hull', 1.3, 0.7, 1.5, 0, 2.15, -1.8);
    k.box('hull', 0.8, 0.6, 0.9, 0, 2.75, -1.9);
    k.box('glass', 1.1, 0.2, 0.2, 0, 2.2, -1.03);
    k.box('orange', 1.35, 0.12, 0.3, 0, 2.55, -1.2);
    k.cyl('dark', 0.04, 0.04, 1.8, 4, 0.3, 3.6, -2.0); k.cyl('dark', 0.04, 0.04, 1.2, 4, -0.3, 3.4, -2.1);
    // missile racks
    for (const sx of [-1, 1]) {
      k.box('dark', 0.9, 0.5, 1.4, sx * 0.85, 1.2, 1.6);
      for (let i = 0; i < 3; i++) for (let j = 0; j < 2; j++) k.box('red', 0.16, 0.06, 0.16, sx * 0.85 + (i - 1) * 0.26, 1.46, 1.3 + j * 0.5);
      // outrigger nacelles on pylons
      k.box('dark', 1.6, 0.35, 1.0, sx * 2.6, 0, -2.0);
      k.zcyl('hull', 0.75, 0.75, 4.2, 10, sx * 3.5, 0, -2.4);
      k.zcyl('orange', 0.78, 0.78, 1.0, 10, sx * 3.5, 0, -1.6);
      k.zcyl('dark', 0.5, 0.7, 0.7, 10, sx * 3.5, 0, 0.1);
      k.engine(sx * 3.5, 0, -4.5, 0.55, 0.6);
      // drone bays
      k.box('hull', 0.9, 0.9, 2.2, sx * 2.2, 0.15, 1.0);
      k.box('glowSoft', 0.05, 0.5, 1.6, sx * 2.66, 0.15, 1.0);
      k.engine(sx * 1.0, 0.1, -5.3, 0.4, 0.5);
    }
    k.engine(0, 0.2, -5.3, 0.45, 0.5);
    k.greebles(rng, 'dark', -1.2, 1.2, 2.6, 4.2, 1.1, 16, 0.3);
    k.greebles(rng, 'dark', -1.2, 1.2, -4.6, -3.0, 1.1, 14, 0.35);
    hard = [{ x: 0, y: 1.15, z: 3.4, size: 1.6 }, { x: -1.15, y: 1.15, z: -0.2, size: 1.45 }, { x: 1.15, y: 1.15, z: -0.2, size: 1.45 }, { x: 0, y: 1.15, z: -3.6, size: 1.45 }];
  } else {
    length = 18;
    k.slab('hull', [[0, 9], [1.4, 7.4], [4.2, 1.5], [4.4, -7.6], [-4.4, -7.6], [-4.2, 1.5], [-1.4, 7.4]], 1.5, 0);
    k.slab('dark', [[0, 8.2], [1.1, 6.8], [3.4, 1.4], [3.5, -7.0], [-3.5, -7.0], [-3.4, 1.4], [-1.1, 6.8]], 0.5, 1.0);
    k.slab('orange', [[0, 8.6], [0.8, 7.2], [-0.8, 7.2]], 0.16, 0.95);
    // flight deck stripe
    k.box('dark', 1.6, 0.1, 9, 0, 1.3, 2.0);
    for (let i = 0; i < 8; i++) k.box('glowSoft', 0.12, 0.04, 0.3, 0, 1.38, -2 + i * 1.1);
    // command tower
    k.box('hull', 2.4, 1.0, 3.2, 1.8, 1.8, -3.0);
    k.box('hull', 1.8, 0.9, 2.2, 1.8, 2.7, -3.2);
    k.box('hull', 1.2, 0.8, 1.4, 1.8, 3.5, -3.3);
    k.cyl('dark', 0.6, 0.7, 0.6, 10, 1.8, 4.2, -3.3);
    k.box('glass', 1.6, 0.25, 0.2, 1.8, 2.75, -2.1); k.box('glass', 1.0, 0.2, 0.2, 1.8, 3.55, -2.6);
    k.box('orange', 1.85, 0.14, 0.4, 1.8, 3.2, -2.3);
    k.cyl('dark', 0.05, 0.05, 2.5, 4, 2.1, 5.6, -3.4); k.cyl('dark', 0.05, 0.05, 1.8, 4, 1.4, 5.2, -3.5);
    k.sphere('red', 0.12, 2.1, 6.85, -3.4);
    for (const sx of [-1, 1]) {
      // hangars
      k.box('hull', 1.6, 1.4, 5.0, sx * 4.4, 0.2, -1.5);
      k.box('orange', 0.1, 0.9, 3.6, sx * 5.22, 0.2, -1.5);
      k.box('glowSoft', 0.05, 0.6, 1.6, sx * 5.25, 0.2, 1.1);
      k.box('dark', 1.6, 0.25, 0.3, sx * 4.4, 0.95, -3.8);
      // engines
      for (let i = 0; i < 3; i++) k.engine(sx * (1.0 + i * 1.4), 0.2, -7.9, 0.55, 0.7);
      k.zcyl('hull', 0.9, 0.9, 3.0, 12, sx * 4.4, 0, -6.0);
      k.engine(sx * 4.4, 0, -7.6, 0.7, 0.7);
    }
    k.greebles(rng, 'dark', -3.0, 3.0, -6.5, 6.0, 1.25, 50, 0.4);
    hard = [
      { x: 0, y: 1.3, z: 6.2, size: 1.4 }, { x: -2.2, y: 1.3, z: 3.0, size: 1.3 }, { x: 2.2, y: 1.3, z: 3.0, size: 1.3 },
      { x: -2.6, y: 1.3, z: -1.4, size: 2.0 }, { x: -1.6, y: 1.3, z: -5.4, size: 1.9 }, { x: 3.4, y: 1.3, z: -5.8, size: 1.9 },
    ];
  }
  const group = k.build();
  return { group, hardpoints: hard, engines: k.engines, length };
}

// ---------- Engine flames ----------
const flameMatBase = new THREE.ShaderMaterial({
  uniforms: { uColor: { value: new THREE.Color(0.4, 2.2, 3.4) }, uPower: { value: 1 }, uTime: { value: 0 } },
  vertexShader: `varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);} `,
  fragmentShader: `uniform vec3 uColor; uniform float uPower; uniform float uTime; varying vec2 vUv;
    void main(){ float t=1.0-vUv.y; float a=pow(t,1.6)*(0.75+0.25*sin(uTime*40.0+vUv.x*20.0)); gl_FragColor=vec4(uColor*a*(0.6+uPower),a);} `,
  transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
});
export function makeFlames(engines, color) {
  const mat = flameMatBase.clone();
  mat.uniforms.uColor.value = color ? color.clone() : new THREE.Color(0.4, 2.2, 3.4);
  const group = new THREE.Group(); const flames = [];
  const sm = new THREE.SpriteMaterial({ map: glowTexture(), color: mat.uniforms.uColor.value.clone().multiplyScalar(0.5), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true });
  for (const e of engines) {
    const geo = new THREE.ConeGeometry(e.r * 0.85, 1, 10, 1, true); geo.translate(0, 0.5, 0); geo.rotateX(-Math.PI / 2); // base at nozzle, tip toward -Z
    const m = new THREE.Mesh(geo, mat); m.position.set(e.x, e.y, e.z); group.add(m);
    const sp = new THREE.Sprite(sm); sp.position.set(e.x, e.y, e.z - 0.1); sp.scale.setScalar(e.r * 4); group.add(sp);
    flames.push({ mesh: m, sprite: sp, r: e.r });
  }
  return { group, flames, mat };
}

// ---------- Asteroids ----------
export const rockUniforms = { uTime: { value: 0 } };
export function makeRockMaterial(glowColor, intensity) {
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92, metalness: 0.08, flatShading: true });
  m.userData.glow = { value: new THREE.Color(glowColor).multiplyScalar(intensity) };
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uGlowColor = m.userData.glow; sh.uniforms.uTime = rockUniforms.uTime;
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute float aGlow; varying float vGlow; varying vec3 vWp;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvGlow = aGlow; vWp = position;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform vec3 uGlowColor; uniform float uTime; varying float vGlow; varying vec3 vWp;')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n totalEmissiveRadiance += uGlowColor * vGlow * vGlow * (0.75 + 0.25*sin(uTime*2.2 + vWp.x*3.0 + vWp.z*2.0));');
  };
  m.customProgramCacheKey = () => 'rock';
  return m;
}
export function makeRockGeometry(seed, opts = {}) {
  const rng = mulberry(seed);
  const detail = opts.detail ?? 1;
  let g = new THREE.IcosahedronGeometry(1, detail); // non-indexed
  const pos = g.attributes.position; const v = new THREE.Vector3();
  const sx = opts.stretch ? 1 + rng() * 0.7 : 0.85 + rng() * 0.3, sy = 0.7 + rng() * 0.3, sz = 0.85 + rng() * 0.3;
  const o = rng() * 100, amp = opts.amp ?? 0.38;
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i).normalize();
    const n = fbm3(v.x * 1.6 + o, v.y * 1.6 + o, v.z * 1.6 + o, 3);
    const r = 1 + (n - 0.5) * 2 * amp;
    pos.setXYZ(i, v.x * r * sx, v.y * r * sy, v.z * r * sz);
  }
  const geos = [g];
  // crystal clusters for rich rocks
  if (opts.crystals) {
    for (let c = 0; c < opts.crystals; c++) {
      const dir = new THREE.Vector3(rng() - 0.5, rng() * 0.8 + 0.2, rng() - 0.5).normalize();
      for (let j = 0; j < 3; j++) {
        const h = 0.4 + rng() * 0.6;
        const cg = new THREE.ConeGeometry(0.12 + rng() * 0.1, h, 5); cg.translate(0, h / 2, 0);
        const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().add(new THREE.Vector3((rng() - 0.5) * 0.6, 0, (rng() - 0.5) * 0.6)).normalize());
        cg.applyQuaternion(q); cg.translate(dir.x * 0.75 * sx, dir.y * 0.7 * sy, dir.z * 0.75 * sz);
        const ng = cg.toNonIndexed(); ng.deleteAttribute('uv'); ng.userData.crystal = true; geos.push(ng);
      }
    }
  }
  for (const gg of geos) { if (gg.attributes.uv) gg.deleteAttribute('uv'); if (gg.attributes.normal) gg.deleteAttribute('normal'); }
  // colours per face, glow per vertex (vertex-position based so seams stay continuous => thin glowing cracks)
  const vw = opts.veins ?? 0.035;
  for (const gg of geos) {
    const p = gg.attributes.position; const n = p.count;
    const col = new Float32Array(n * 3), glow = new Float32Array(n);
    for (let f = 0; f < n; f += 3) {
      let shade;
      if (gg.userData.crystal) shade = [0.14, 0.14, 0.16];
      else { const b = 0.05 + rng() * 0.035; shade = [b * 1.02, b, b * 1.1]; }
      for (let k = 0; k < 3; k++) {
        const i = f + k; col.set(shade, i * 3);
        if (gg.userData.crystal) { glow[i] = 1.15; continue; }
        const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
        const v1 = Math.abs(noise3(x * 3.4 + o, y * 3.4 + o * 0.5, z * 3.4) - 0.5);
        const v2 = Math.abs(noise3(x * 6.3 - o, y * 6.3, z * 6.3 + o) - 0.5);
        const g1 = v1 < vw ? 1 - v1 / vw : 0, g2 = v2 < vw * 0.6 ? (1 - v2 / (vw * 0.6)) * 0.6 : 0;
        glow[i] = Math.min(1.2, (g1 + g2) * 1.3);
      }
    }
    gg.setAttribute('color', new THREE.BufferAttribute(col, 3));
    gg.setAttribute('aGlow', new THREE.BufferAttribute(glow, 1));
  }
  const merged = geos.length > 1 ? mergeGeometries(geos, false) : g;
  merged.computeVertexNormals();
  merged.computeBoundingSphere();
  return merged;
}

// ---------- Pirates ----------
export function buildPirate(type) {
  const k = new Kit(); const rng = mulberry(type.length * 31);
  let hard = [], radius = 1.4;
  if (type === 'drone') {
    k.add('pirate', new THREE.OctahedronGeometry(0.8, 0), 0, 0, 0, 0, 0, 0, 1, 0.6, 1.2);
    k.box('pirateAccent', 2.0, 0.1, 0.4, 0, 0, -0.1);
    k.sphere('red', 0.22, 0, 0.25, 0.5);
    k.engine(0, 0, -0.9, 0.2, 0.3);
    hard = [{ x: 0, y: 0, z: 0.8 }]; radius = 1.0;
  } else if (type === 'interceptor') {
    k.slab('pirate', [[0, 1.9], [0.4, 0.4], [1.6, -1.2], [0.5, -0.9], [-0.5, -0.9], [-1.6, -1.2], [-0.4, 0.4]], 0.35, 0);
    k.slab('pirateAccent', [[0, 1.6], [0.25, 0.4], [-0.25, 0.4]], 0.1, 0.24);
    k.box('red', 0.3, 0.12, 0.4, 0, 0.3, 0.6);
    k.box('pirateBone', 0.1, 0.5, 0.9, 1.5, 0.15, -1.0); k.box('pirateBone', 0.1, 0.5, 0.9, -1.5, 0.15, -1.0);
    k.engine(-0.3, 0, -1.0, 0.2, 0.3); k.engine(0.3, 0, -1.0, 0.2, 0.3);
    hard = [{ x: -0.4, y: 0, z: 1.0 }, { x: 0.4, y: 0, z: 1.0 }]; radius = 1.5;
  } else if (type === 'gunship') {
    k.slab('pirate', [[0, 3.0], [1.4, 1.8], [1.9, -2.4], [-1.9, -2.4], [-1.4, 1.8]], 1.1, 0);
    k.slab('pirateAccent', [[0, 2.7], [0.9, 1.7], [1.2, -0.4], [-1.2, -0.4], [-0.9, 1.7]], 0.3, 0.75);
    for (const sx of [-1, 1]) {
      k.box('pirateBone', 0.6, 0.9, 3.4, sx * 2.1, 0, -0.3);
      k.box('pirate', 0.7, 0.3, 0.9, sx * 2.1, 0.55, 0.8);
      k.engine(sx * 1.0, 0, -2.5, 0.42, 0.5);
    }
    k.box('red', 1.2, 0.12, 0.2, 0, 0.95, 1.2);
    k.greebles(rng, 'pirate', -1, 1, -2, 0, 0.8, 10, 0.4);
    hard = [{ x: 0, y: 0.9, z: 2.2 }, { x: -2.1, y: 0.5, z: 1.4 }, { x: 2.1, y: 0.5, z: 1.4 }]; radius = 2.8;
  } else if (type === 'sentinel') {
    k.sphere('pirateBone', 0.9, 0, 0, 0, 1, 0.8, 1, 10, 6);
    for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2 + Math.PI / 4; k.box('pirate', 0.25, 0.25, 1.4, Math.sin(a) * 1.0, 0, Math.cos(a) * 1.0, 0, a, 0); }
    k.sphere('amber', 0.3, 0, 0.35, 0.6);
    const ring = new THREE.TorusGeometry(1.25, 0.08, 6, 20); ring.rotateX(Math.PI / 2); k.add('amber', ring);
    hard = [{ x: 0, y: 0.3, z: 0.9 }]; radius = 1.6;
  } else if (type === 'boss') {
    k.slab('pirate', [[0, 11], [3, 7], [6.5, 0], [7, -8], [-7, -8], [-6.5, 0], [-3, 7]], 2.2, 0);
    k.slab('pirateAccent', [[0, 10], [2.2, 6.6], [5, 0], [5.2, -7], [-5.2, -7], [-5, 0], [-2.2, 6.6]], 0.6, 1.4);
    k.slab('pirateBone', [[0, 10.5], [1.0, 8.6], [-1.0, 8.6]], 0.3, 1.5);
    k.box('pirate', 3.0, 1.6, 4.0, 0, 2.2, -3.0); k.box('pirate', 2.0, 1.4, 2.4, 0, 3.6, -3.4);
    k.box('red', 1.6, 0.25, 0.2, 0, 3.7, -2.15);
    for (const sx of [-1, 1]) {
      k.box('pirateBone', 1.2, 2.0, 10, sx * 7.4, 0, -1);
      for (let i = 0; i < 3; i++) k.engine(sx * (1.5 + i * 2), 0, -8.2, 0.8, 0.8);
      for (let i = 0; i < 4; i++) k.box('red', 0.1, 0.3, 0.6, sx * 8.05, 0.3, 2 - i * 2.2);
    }
    k.greebles(rng, 'pirate', -4, 4, -7, 6, 1.6, 50, 0.6);
    const ring = new THREE.TorusGeometry(5.0, 0.35, 8, 40); ring.rotateX(Math.PI / 2);
    const ringMesh = new THREE.Mesh(ring, materials().red); ringMesh.position.y = 1.6; ringMesh.name = 'ring';
    k.extras.push(ringMesh);
    hard = [];
    for (let i = 0; i < 6; i++) hard.push({ x: (i % 2 ? 1 : -1) * (2.5 + (i >> 1) * 1.2), y: 1.6, z: 5 - (i >> 1) * 5, size: 1.6 });
    radius = 9;
  }
  return { group: k.build(), hardpoints: hard, engines: k.engines, radius };
}

// ---------- Station ----------
export function buildStation(level, rockMat) {
  const root = new THREE.Group(); const anim = { spin: [], blink: [], drones: [] };
  const k = new Kit(); const rng = mulberry(4242);
  const M = materials();
  // asteroid base
  const rock = new THREE.Mesh(makeRockGeometry(77, { detail: 4, amp: 0.3, veins: 0.025 }), rockMat);
  rock.scale.set(9, 6.5, 8); rock.position.set(-9.5, -6.5, 4.5); root.add(rock);
  // L1 refinery
  k.cyl('hull', 3.2, 3.6, 4.2, 12, 0, 0, 0);
  k.cyl('orange', 3.65, 3.65, 0.6, 12, 0, -0.6, 0);
  k.cyl('dark', 2.4, 3.0, 1.2, 12, 0, 2.6, 0);
  k.box('hull', 3.8, 2.4, 3.0, -3.6, -0.4, 1.2);
  k.box('hull', 2.6, 2.0, 2.6, -4.2, -1.2, 4.2);
  k.box('orange', 0.12, 1.4, 2.2, -1.6, -0.4, 1.2);
  k.cyl('dark', 0.5, 0.6, 3.0, 8, -4.6, 1.8, 0.6); k.cyl('dark', 0.4, 0.5, 2.4, 8, -3.2, 1.5, 2.0);
  k.zcyl('dark', 1.0, 1.0, 4.0, 10, 0, 0, 5.0);
  k.zcyl('hull', 1.5, 1.5, 1.0, 12, 0, 0, 7.2);
  k.zcyl('glow', 1.0, 1.0, 0.1, 12, 0, 0, 7.75);
  k.cyl('dark', 0.06, 0.06, 4, 4, 0.8, 5.0, -0.4);
  k.greebles(rng, 'dark', -2, 2, -2, 2, 3.2, 14, 0.5);
  if (level >= 2) {
    for (const sx of [-1, 1]) {
      k.box('dark', 9, 0.3, 0.3, sx * 7.5, 1.0, -1.0);
      for (let i = 0; i < 3; i++) {
        const pg = new THREE.PlaneGeometry(2.6, 4.2); pg.rotateX(-Math.PI / 2 + 0.25);
        k.add('solar', pg, sx * (5.2 + i * 2.8), 1.0, -1.0);
      }
    }
    k.box('hull', 2.6, 2.0, 2.4, 3.6, -0.3, -2.8); k.box('orange', 2.7, 0.3, 2.5, 3.6, 0.8, -2.8);
  }
  if (level >= 3) {
    // factory modules
    for (const [x, z] of [[4.5, 3.8], [-1.0, -5.2]]) {
      k.box('hull', 3.4, 2.4, 3.0, x, -0.2, z);
      k.box('orange', 3.5, 0.3, 0.4, x, 0.6, z + 1.3);
      k.cyl('dark', 0.35, 0.45, 2.6, 8, x - 0.8, 2.2, z - 0.6); k.cyl('dark', 0.35, 0.45, 2.0, 8, x + 0.7, 1.9, z - 0.6);
      k.box('amber', 2.4, 0.4, 0.05, x, -0.2, z + 1.53);
    }
    // docking ring (spins)
    const rk = new Kit();
    const tor = new THREE.TorusGeometry(10, 0.55, 8, 48); tor.rotateX(Math.PI / 2); rk.add('hull', tor);
    const tor2 = new THREE.TorusGeometry(10, 0.62, 4, 48); tor2.rotateX(Math.PI / 2); tor2.scale(1, 0.25, 1); rk.add('orange', tor2);
    for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2; rk.box('dark', 0.3, 0.3, 6.5, Math.sin(a) * 6.6, 0, Math.cos(a) * 6.6, 0, a, 0); }
    for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2; rk.box('glow', 0.25, 0.25, 0.25, Math.sin(a) * 10, 0.55, Math.cos(a) * 10); }
    const ring = rk.build(); ring.position.y = -1.2; root.add(ring); anim.spin.push({ obj: ring, speed: 0.15 });
  }
  if (level >= 4) {
    // cranes
    for (const [x, z, h] of [[-6.5, -4.5, 9], [7.5, -6.5, 8], [8.5, 6.5, 7]]) {
      for (const dx of [-0.5, 0.5]) for (const dz of [-0.5, 0.5]) k.box('dark', 0.15, h, 0.15, x + dx, h / 2 - 1.5, z + dz);
      for (let y = 0; y < h; y += 1.4) k.box('orange', 1.1, 0.1, 1.1, x, y - 1.5, z);
      k.box('orange', 0.5, 0.5, 6, x, h - 1.3, z + 2.5); k.box('dark', 0.1, 2.5, 0.1, x, h - 2.8, z + 5.2);
      k.sphere('red', 0.18, x, h - 0.8, z);
    }
    // habitat cylinders
    for (let i = 0; i < 4; i++) {
      const a = i / 4 * Math.PI * 2 + 0.4;
      k.cyl('hull', 1.3, 1.3, 3.2, 12, Math.sin(a) * 13.5, -1.0, Math.cos(a) * 13.5);
      k.cyl('orange', 1.35, 1.35, 0.4, 12, Math.sin(a) * 13.5, -0.4, Math.cos(a) * 13.5);
      k.box('dark', 0.4, 0.4, 3.5, Math.sin(a) * 11.6, -1.0, Math.cos(a) * 11.6, 0, a, 0);
    }
  }
  if (level >= 5) {
    k.sphere('hull', 3.4, 0, 3.6, 0, 1, 0.6, 1, 16, 8);
    k.cyl('glowSoft', 3.45, 3.45, 0.25, 16, 0, 3.6, 0);
    for (const [x, z, h] of [[2.5, -2.5, 8], [-2.0, 2.4, 6.5], [0, 0, 11]]) {
      k.cyl('hull', 0.7, 1.0, h, 10, x, h / 2, z); k.cyl('orange', 1.05, 1.05, 0.3, 10, x, h * 0.55, z);
      k.cyl('dark', 0.05, 0.05, 2.5, 4, x, h + 1.25, z); k.sphere('red', 0.2, x, h + 2.5, z);
    }
    // drone bays
    for (const sx of [-1, 1]) {
      k.box('hull', 4, 1.6, 2.6, sx * 10, 0.2, 9); k.box('glowSoft', 3, 0.8, 0.05, sx * 10, 0.2, 10.33);
    }
  }
  if (level >= 6) {
    const tor = new THREE.TorusGeometry(19, 0.9, 8, 64); tor.rotateX(Math.PI / 2); k.add('hull', tor, 0, -2.2, 0);
    for (let i = 0; i < 8; i++) {
      const a = i / 8 * Math.PI * 2;
      k.box('dark', 0.5, 0.5, 4.5, Math.sin(a) * 16.2, -2.2, Math.cos(a) * 16.2, 0, a, 0);
      k.box('hull', 2.6, 2.0, 2.6, Math.sin(a) * 19, -1.6, Math.cos(a) * 19, 0, a, 0);
      k.box('glow', 0.4, 0.3, 0.4, Math.sin(a) * 19, -0.4, Math.cos(a) * 19);
    }
  }
  root.add(k.build());
  // blinking beacons
  const bm = new THREE.SpriteMaterial({ map: glowTexture(), color: 0xff4040, blending: THREE.AdditiveBlending, depthWrite: false });
  const beaconPts = [[0.8, 7.0, -0.4], [-4.6, 3.4, 0.6], [0, 0, 8.0]];
  if (level >= 5) beaconPts.push([0, 13.5, 0], [2.5, 10.5, -2.5]);
  for (const p of beaconPts) { const s = new THREE.Sprite(bm.clone()); s.position.set(...p); s.scale.setScalar(1.6); root.add(s); anim.blink.push({ obj: s, phase: rng() * 6 }); }
  // drones flying around (visual)
  if (level >= 5) {
    const dk = new Kit(); dk.box('hull', 0.8, 0.3, 1.2, 0, 0, 0); dk.box('orange', 0.9, 0.1, 0.4, 0, 0.2, -0.2); dk.engine(0, 0, -0.6, 0.15, 0.2);
    const dg = dk.build();
    const n = level >= 6 ? 10 : 6;
    for (let i = 0; i < n; i++) {
      const d = dg.clone(); root.add(d);
      anim.drones.push({ obj: d, r: 16 + rng() * 22, speed: (0.15 + rng() * 0.25) * (rng() < 0.5 ? 1 : -1), a: rng() * 6.28, y: -1 + rng() * 6, wob: rng() * 6 });
    }
  }
  root.userData.anim = anim;
  return root;
}
export function animateStation(root, t, dt) {
  const a = root.userData.anim; if (!a) return;
  for (const s of a.spin) s.obj.rotation.y += s.speed * dt;
  for (const b of a.blink) b.obj.material.opacity = 0.25 + 0.75 * Math.max(0, Math.sin(t * 3 + b.phase));
  for (const d of a.drones) {
    d.a += d.speed * dt;
    const r = d.r + Math.sin(t * 0.5 + d.wob) * 4;
    d.obj.position.set(Math.sin(d.a) * r, d.y + Math.sin(t + d.wob), Math.cos(d.a) * r);
    d.obj.rotation.y = d.a + (d.speed > 0 ? Math.PI / 2 : -Math.PI / 2);
  }
}

// Background (nebula skybox, wrapped star layers, dust), asteroid chunk streaming, mineral pickups
import * as THREE from 'three';
import { mulberry, hash2, rand, TAU } from './util.js';
import { MINERALS, sectorAt } from './data.js';
import { makeRockGeometry, makeRockMaterial, rockUniforms } from './models.js';

export function makeSky() {
  const geo = new THREE.SphereGeometry(900, 48, 24);
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false,
    uniforms: { uTint: { value: new THREE.Vector3(0.25, 0.35, 0.9) }, uTime: { value: 0 } },
    vertexShader: `varying vec3 vDir; void main(){ vDir=normalize(position); vec4 p=projectionMatrix*modelViewMatrix*vec4(position,1.0); gl_Position=p.xyww; }`,
    fragmentShader: `uniform vec3 uTint; uniform float uTime; varying vec3 vDir;
      float h(vec3 p){ p=fract(p*0.3183099+.1); p*=17.0; return fract(p.x*p.y*p.z*(p.x+p.y+p.z)); }
      float n(vec3 x){ vec3 i=floor(x); vec3 f=fract(x); f=f*f*(3.0-2.0*f);
        return mix(mix(mix(h(i),h(i+vec3(1,0,0)),f.x),mix(h(i+vec3(0,1,0)),h(i+vec3(1,1,0)),f.x),f.y),
                   mix(mix(h(i+vec3(0,0,1)),h(i+vec3(1,0,1)),f.x),mix(h(i+vec3(0,1,1)),h(i+vec3(1,1,1)),f.x),f.y),f.z); }
      float fbm(vec3 p){ float s=0.0,a=0.5; for(int i=0;i<5;i++){ s+=a*n(p); p*=2.02; a*=0.5;} return s; }
      void main(){
        vec3 d=normalize(vDir);
        float a=fbm(d*2.2+vec3(0.0,0.0,uTime*0.004));
        float b=fbm(d*4.5+vec3(5.2,1.3,2.0));
        float c=fbm(d*9.0+vec3(1.7,9.2,3.3));
        float neb=smoothstep(0.42,0.85,a)*0.9 + smoothstep(0.55,0.9,b)*0.35;
        vec3 deep=vec3(0.006,0.010,0.028);
        vec3 col1=uTint*0.55; vec3 col2=vec3(0.05,0.45,0.55);
        vec3 col=deep + mix(col2,col1,smoothstep(0.35,0.75,b))*neb*0.55;
        col += vec3(0.6,0.7,1.0)*pow(c,6.0)*0.25*neb;
        // dark dust lanes
        col *= 0.55+0.45*smoothstep(0.25,0.6,fbm(d*6.0+vec3(3.0)));
        float st=pow(max(0.0,n(d*420.0)-0.0),40.0)*2.5; col+=vec3(st);
        gl_FragColor=vec4(col,1.0);
      }`,
  });
  const m = new THREE.Mesh(geo, mat); m.renderOrder = -10; m.frustumCulled = false;
  return m;
}

export function makeStarLayer(count, L, y0, y1, size, bright, seed) {
  const r = mulberry(seed); const pos = new Float32Array(count * 3), col = new Float32Array(count * 3), sz = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    pos[i * 3] = r() * L; pos[i * 3 + 1] = y0 + r() * (y1 - y0); pos[i * 3 + 2] = r() * L;
    const t = r(); const c = t < 0.15 ? [1, 0.8, 0.6] : t < 0.4 ? [0.7, 0.85, 1] : [1, 1, 1];
    const b = bright * (0.4 + r() * 0.8); col.set([c[0] * b, c[1] * b, c[2] * b], i * 3); sz[i] = size * (0.5 + r());
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.BufferAttribute(col, 3)); g.setAttribute('size', new THREE.BufferAttribute(sz, 1));
  const mat = new THREE.ShaderMaterial({
    uniforms: { uCam: { value: new THREE.Vector2() }, uL: { value: L }, uScale: { value: 400 } },
    vertexShader: `attribute vec3 color; attribute float size; uniform vec2 uCam; uniform float uL; uniform float uScale; varying vec3 vC;
      void main(){ vec3 p=position; p.x=uCam.x+mod(p.x-uCam.x,uL)-uL*0.5; p.z=uCam.y+mod(p.z-uCam.y,uL)-uL*0.5;
        vec4 mv=modelViewMatrix*vec4(p,1.0); gl_PointSize=max(1.0,size*uScale/(-mv.z)); gl_Position=projectionMatrix*mv; vC=color; }`,
    fragmentShader: `varying vec3 vC; void main(){ vec2 c=gl_PointCoord-0.5; float a=smoothstep(0.5,0.0,length(c)); gl_FragColor=vec4(vC*a,a);} `,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  });
  const p = new THREE.Points(g, mat); p.frustumCulled = false; p.renderOrder = -5;
  return p;
}

// ---------------- Asteroids ----------------
export const CHUNK = 44;
const SIZE_CLASSES = [
  { r0: 1.1, r1: 1.7, w: 5 },
  { r0: 2.0, r1: 3.0, w: 4 },
  { r0: 3.4, r1: 4.6, w: 2 },
];
function weightedPick(rng, obj) {
  let tot = 0; for (const k in obj) tot += obj[k];
  let x = rng() * tot; for (const k in obj) { x -= obj[k]; if (x <= 0) return k; }
  return Object.keys(obj)[0];
}

export class AsteroidField {
  constructor(scene) {
    this.scene = scene;
    this.geos = []; this.richGeos = [];
    for (let i = 0; i < 10; i++) this.geos.push(makeRockGeometry(500 + i * 13, { detail: i % 3 === 0 ? 3 : 2, stretch: i % 4 === 1, amp: i % 3 === 2 ? 0.45 : 0.34 }));
    for (let i = 0; i < 4; i++) this.richGeos.push(makeRockGeometry(900 + i * 7, { detail: 3, crystals: 4 + i, veins: 0.05, amp: 0.3 }));
    this.mats = {}; this.richMats = {};
    for (const k in MINERALS) { this.mats[k] = makeRockMaterial(MINERALS[k].color, 1.9); this.richMats[k] = makeRockMaterial(MINERALS[k].color, 2.3); }
    this.stationMat = makeRockMaterial(0x38c8ff, 0.7);
    this.pool = []; this.chunks = new Map(); this.list = []; this.depleted = new Map(); this.loadR = 2;
    this.guardRequests = [];
  }
  mesh() { const m = this.pool.pop() || new THREE.Mesh(this.geos[0], this.mats.ferrite); m.visible = true; if (!m.parent) this.scene.add(m); return m; }
  release(a) { a.mesh.visible = false; this.pool.push(a.mesh); a.mesh = null; }
  makeAsteroid(o) {
    const m = this.mesh();
    m.geometry = o.rich ? this.richGeos[o.variant % this.richGeos.length] : this.geos[o.variant % this.geos.length];
    m.material = o.rich ? this.richMats[o.type] : this.mats[o.type];
    m.position.set(o.x, o.y, o.z); m.scale.setScalar(o.r); m.rotation.set(o.rx, o.ry, 0);
    o.mesh = m; o.hitT = 0; o.alive = true;
    this.list.push(o); return o;
  }
  genChunk(cx, cz, now) {
    const key = cx + ',' + cz; const rng = mulberry(hash2(cx, cz, 9001));
    const ch = { key, list: [] };
    const centerX = (cx + 0.5) * CHUNK, centerZ = (cz + 0.5) * CHUNK;
    const sec = sectorAt(Math.hypot(centerX, centerZ));
    let n = Math.max(1, Math.round(sec.density + (rng() - 0.5) * 4));
    const pts = [];
    for (let i = 0; i < n; i++) {
      const id = key + ':' + i;
      let x = 0, z = 0, ok = false;
      for (let tries = 0; tries < 6 && !ok; tries++) {
        x = cx * CHUNK + rng() * CHUNK; z = cz * CHUNK + rng() * CHUNK; ok = true;
        for (const p of pts) if (Math.hypot(p[0] - x, p[1] - z) < 9) ok = false;
      }
      const sci = weightedIdx(rng); const sc = SIZE_CLASSES[sci];
      const rich = sec.rich > 0 && rng() < sec.rich;
      const type = weightedPick(rng, sec.minerals);
      const r = rich ? 3.0 + rng() * 1.2 : sc.r0 + rng() * (sc.r1 - sc.r0);
      const variant = Math.floor(rng() * 100), rx = rng() * 6, ry = rng() * 6;
      const dist = Math.hypot(x, z);
      if (!ok || dist < 42) continue;
      pts.push([x, z]);
      const dep = this.depleted.get(id);
      if (dep && now < dep) continue;
      if (rich && sec.danger >= 1) this.guardRequests.push({ id: 'g' + id, x, z, danger: sec.danger, chunk: key, count: sec.danger >= 3 ? 2 : 1 });
      if (dep) this.depleted.delete(id);
      const hpMul = (1 + sec.danger * 0.9) * (rich ? 2.2 : 1);
      const a = this.makeAsteroid({ id, chunk: key, x, y: (rng() - 0.5) * 1.5, z, r, type, rich, variant, rx, ry, sector: sec.id,
        hp: 0, maxHp: Math.round(16 * r * r * hpMul), spin: (rng() - 0.5) * 0.4 });
      a.hp = a.maxHp;
      ch.list.push(a);
    }
    this.chunks.set(key, ch);
  }
  update(px, pz, now, dt) {
    const ccx = Math.floor(px / CHUNK), ccz = Math.floor(pz / CHUNK), R = this.loadR;
    for (let dx = -R; dx <= R; dx++) for (let dz = -R; dz <= R; dz++) {
      const key = (ccx + dx) + ',' + (ccz + dz);
      if (!this.chunks.has(key)) this.genChunk(ccx + dx, ccz + dz, now);
    }
    for (const [key, ch] of this.chunks) {
      const [x, z] = key.split(',').map(Number);
      if (Math.abs(x - ccx) > R + 1 || Math.abs(z - ccz) > R + 1) {
        for (const a of ch.list) if (a.alive) { a.alive = false; a.unloaded = true; this.release(a); }
        this.chunks.delete(key);
      }
    }
    // compact list + animate
    const L = this.list; let w = 0;
    for (let i = 0; i < L.length; i++) {
      const a = L[i];
      if (!a.alive) continue;
      if (!a.chunk && (Math.abs(a.x - px) > CHUNK * (R + 1.5) || Math.abs(a.z - pz) > CHUNK * (R + 1.5))) { a.alive = false; this.release(a); continue; }
      a.mesh.rotation.y += a.spin * dt; a.mesh.rotation.x += a.spin * 0.5 * dt;
      if (a.hitT > 0) { a.hitT -= dt; const s = a.r * (1 + Math.sin(a.hitT * 60) * 0.03 * (a.hitT * 6)); a.mesh.scale.setScalar(s); }
      L[w++] = a;
    }
    L.length = w;
  }
  destroy(a, now, respawnSec = 120) {
    a.alive = false; this.release(a);
    if (a.id) this.depleted.set(a.id, now + respawnSec);
    const ch = a.chunk && this.chunks.get(a.chunk);
    if (ch) { const i = ch.list.indexOf(a); if (i >= 0) ch.list.splice(i, 1); }
  }
  spawnFragment(x, z, r, type, sector) {
    return this.makeAsteroid({ id: null, chunk: null, x, y: rand(-0.5, 0.5), z, r, type, rich: false, variant: Math.floor(rand(0, 100)), rx: rand(0, 6), ry: rand(0, 6), sector,
      hp: Math.round(16 * r * r * (1 + (sector - 1) * 0.9)), maxHp: Math.round(16 * r * r * (1 + (sector - 1) * 0.9)), spin: rand(-0.6, 0.6) });
  }
  setTime(t) { rockUniforms.uTime.value = t; }
}
function weightedIdx(rng) { const t = rng() * 11; return t < 5 ? 0 : t < 9 ? 1 : 2; }

// ---------------- Mineral pickups ----------------
export class Minerals {
  constructor(scene, max = 500) {
    this.max = max; this.list = []; this.free = [];
    const geo = new THREE.OctahedronGeometry(0.42, 0); geo.scale(0.8, 1.3, 0.8);
    const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xffffff, emissiveIntensity: 0.0, metalness: 0.3, roughness: 0.2, flatShading: true });
    // make emissive follow instance colour
    mat.onBeforeCompile = (sh) => { sh.fragmentShader = sh.fragmentShader.replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n totalEmissiveRadiance += vColor.rgb * 1.6;'); };
    this.mesh = new THREE.InstancedMesh(geo, mat, max); this.mesh.frustumCulled = false; this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.dummy = new THREE.Object3D(); this.c = new THREE.Color();
    for (let i = max - 1; i >= 0; i--) { this.free.push(i); this.setHidden(i); this.mesh.setColorAt(i, this.c.setRGB(1, 1, 1)); }
    scene.add(this.mesh);
  }
  setHidden(i) { const d = this.dummy; d.position.set(0, -999, 0); d.scale.setScalar(0); d.updateMatrix(); this.mesh.setMatrixAt(i, d.matrix); }
  spawn(x, z, type, n, speed = 7) {
    const col = new THREE.Color(MINERALS[type].color);
    for (let k = 0; k < n; k++) {
      if (!this.free.length) { const o = this.list.shift(); this.free.push(o.idx); }
      const idx = this.free.pop(); const a = rand(0, TAU), sp = rand(0.3, 1) * speed;
      this.list.push({ idx, x, y: rand(-0.3, 0.6), z, vx: Math.cos(a) * sp, vz: Math.sin(a) * sp, type, life: 40, spin: rand(0, 6), pull: 0, delay: 0.25 + rand(0, 0.25) });
      this.mesh.setColorAt(idx, col);
    }
    this.mesh.instanceColor.needsUpdate = true;
  }
  update(dt, sx, sz, magnetR, collectR, canCollect, onCollect, t) {
    const d = this.dummy; const L = this.list;
    for (let i = L.length - 1; i >= 0; i--) {
      const o = L[i];
      o.life -= dt; o.delay -= dt; o.spin += dt * 2.5;
      const dx = sx - o.x, dz = sz - o.z, dist = Math.hypot(dx, dz);
      if (o.delay <= 0 && canCollect(o.type) && dist < magnetR) {
        o.pull = Math.min(o.pull + dt * 3, 1);
        const acc = 70 * o.pull + 20;
        o.vx += (dx / dist) * acc * dt; o.vz += (dz / dist) * acc * dt;
        const k = Math.exp(-3 * dt); o.vx *= k; o.vz *= k;
      } else { const k = Math.exp(-2 * dt); o.vx *= k; o.vz *= k; }
      o.x += o.vx * dt; o.z += o.vz * dt;
      if (o.delay <= 0 && dist < collectR && canCollect(o.type)) { onCollect(o); o.life = -1; }
      if (o.life <= 0) { this.setHidden(o.idx); this.free.push(o.idx); L[i] = L[L.length - 1]; L.pop(); continue; }
      d.position.set(o.x, o.y + Math.sin(t * 3 + o.spin) * 0.15, o.z); d.rotation.set(0.3, o.spin, 0.2);
      d.scale.setScalar(o.life < 3 ? o.life / 3 : 1); d.updateMatrix(); this.mesh.setMatrixAt(o.idx, d.matrix);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}

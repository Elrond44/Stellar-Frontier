// Background (nebula skybox, wrapped star layers, dust), asteroid chunk streaming, mineral pickups
import * as THREE from 'three';
import { mulberry, hash2, rand, TAU } from './util.js?v=7';
import { MINERALS, sectorAt } from './data.js?v=7';
import { makeRockGeometry, makeRockMaterial, rockUniforms } from './models.js?v=7';
import { mergeGeometries } from '../vendor/addons/utils/BufferGeometryUtils.js';

export function makeSky() {
  const geo = new THREE.SphereGeometry(900, 48, 24);
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { uTint: { value: new THREE.Vector3(0.25, 0.35, 0.9) }, uTime: { value: 0 }, uDetail: { value: 1 } },
    vertexShader: `varying vec3 vDir; void main(){ vDir=normalize(position); vec4 p=projectionMatrix*modelViewMatrix*vec4(position,1.0); gl_Position=p.xyww; }`,
    fragmentShader: `uniform vec3 uTint; uniform float uTime; uniform float uDetail; varying vec3 vDir;
      float h(vec3 p){ p=fract(p*0.3183099+.1); p*=17.0; return fract(p.x*p.y*p.z*(p.x+p.y+p.z)); }
      float n(vec3 x){ vec3 i=floor(x); vec3 f=fract(x); f=f*f*(3.0-2.0*f);
        return mix(mix(mix(h(i),h(i+vec3(1,0,0)),f.x),mix(h(i+vec3(0,1,0)),h(i+vec3(1,1,0)),f.x),f.y),
                   mix(mix(h(i+vec3(0,0,1)),h(i+vec3(1,0,1)),f.x),mix(h(i+vec3(0,1,1)),h(i+vec3(1,1,1)),f.x),f.y),f.z); }
      float fbm(vec3 p){ float s=0.0,a=0.5; for(int i=0;i<5;i++){ s+=a*n(p); p*=2.02; a*=0.5;} return s; }
      // shaded sphere seen as a disk in direction c with angular radius r
      vec4 body(vec3 d, vec3 c, float r, vec3 sunDir, vec3 colA, vec3 colB, float bands, vec3 atm){
        float cosA = dot(d,c); float ang = acos(clamp(cosA,-1.0,1.0));
        vec3 res = vec3(0.0); float a = 0.0;
        if (ang < r) {
          vec3 up = abs(c.y)<0.99?vec3(0,1,0):vec3(1,0,0); vec3 bx=normalize(cross(up,c)); vec3 by=cross(c,bx);
          vec2 q = vec2(dot(d,bx), dot(d,by)) / sin(r); float z = sqrt(max(0.0,1.0-dot(q,q)));
          vec3 nrm = normalize(bx*q.x+by*q.y-c*z);
          float lat = q.y; float t = fbm(vec3(q*3.0, 1.0)); 
          vec3 surf = bands>0.5 ? mix(colA,colB, 0.5+0.5*sin(lat*bands*3.0 + t*5.0)) * (0.7+0.5*t) : mix(colA,colB,smoothstep(0.35,0.7,fbm(vec3(q*6.0,3.0)))) * (1.0-0.35*smoothstep(0.62,0.66,n(vec3(q*9.0,7.0))));
          float lit = clamp(dot(nrm, sunDir)*1.2+0.1, 0.02, 1.0);
          res = (surf*lit*0.55 + atm*pow(1.0-z,3.0)*lit*0.6) * 0.8; a = 1.0;
        } else {
          float rim = exp(-(ang-r)/(r*0.05)); res = atm*rim*0.22; a = 0.0;
        }
        return vec4(res, a);
      }
      vec3 galaxy(vec3 d, vec3 c, float size, vec3 tint, float seed){
        float cd = dot(d,c); if (cd < cos(size*2.0)) return vec3(0.0);
        vec3 up = abs(c.y)<0.99?vec3(0,1,0):vec3(1,0,0); vec3 bx=normalize(cross(up,c)); vec3 by=cross(c,bx);
        vec2 q = vec2(dot(d,bx), dot(d,by))/size; float ca=cos(seed*1.7), sa=sin(seed*1.7); q = vec2(ca*q.x - sa*q.y, sa*q.x + ca*q.y); q.y *= 1.6 + 0.6*sin(seed);
        float r = length(q); float ang = atan(q.y, q.x);
        float arms = 0.5 + 0.5*cos(2.0*ang - 5.5*log(r+0.06) + seed);
        float core = exp(-r*r*28.0); float disk = exp(-r*3.2) * (0.35 + 0.65*pow(arms, 2.0));
        return tint*(core*0.9 + disk*0.22)*(0.7 + 0.3*n(d*160.0+seed));
      }
      void main(){
        vec3 d=normalize(vDir);
        float a=fbm(d*2.2+vec3(0.0,0.0,uTime*0.004));
        float b=fbm(d*4.5+vec3(5.2,1.3,2.0));
        float c=fbm(d*9.0+vec3(1.7,9.2,3.3));
        float e=fbm(d*1.3+vec3(9.0,2.0,4.0));
        float neb=smoothstep(0.42,0.85,a)*0.9 + smoothstep(0.55,0.9,b)*0.35;
        vec3 deep=vec3(0.005,0.008,0.024);
        vec3 col1=uTint*0.6; vec3 col2=vec3(0.04,0.42,0.55); vec3 col3=vec3(0.75,0.25,0.12);
        vec3 col=deep + mix(col2,col1,smoothstep(0.35,0.75,b))*neb*0.55;
        col += col3*smoothstep(0.6,0.85,e)*smoothstep(0.5,0.8,a)*0.25;
        col += vec3(0.6,0.7,1.0)*pow(c,6.0)*0.3*neb;
        // galactic band
        float band = exp(-pow(dot(d, normalize(vec3(0.3,0.6,-0.74))),2.0)*18.0);
        col += vec3(0.25,0.22,0.35)*band*(0.4+0.6*fbm(d*14.0))*0.35;
        col *= 0.55+0.45*smoothstep(0.25,0.6,fbm(d*6.0+vec3(3.0)));
        float st=pow(n(d*420.0),40.0)*2.5 + pow(n(d*900.0+3.0),60.0)*1.5*band; col+=vec3(st);
        vec3 sunDir = normalize(vec3(0.62,-0.42,-0.66));
        if (uDetail > 0.5) {
          vec4 gp = body(d, normalize(vec3(-0.42,-0.78,-0.46)), 0.24, sunDir, vec3(0.55,0.32,0.2), vec3(0.85,0.62,0.42), 1.0, vec3(0.9,0.55,0.3));
          col = mix(col, gp.rgb, gp.a) + (1.0-gp.a)*gp.rgb;
          vec4 mp = body(d, normalize(vec3(0.5,-0.74,-0.45)), 0.045, sunDir, vec3(0.35,0.36,0.4), vec3(0.6,0.6,0.62), 0.0, vec3(0.4,0.5,0.7));
          col = mix(col, mp.rgb, mp.a) + (1.0-mp.a)*mp.rgb;
        }
        // v7 far background: distant spiral galaxies and cosmic dust lanes
        if (uDetail > 0.5) {
          col += galaxy(d, normalize(vec3(0.25,-0.86,-0.45)), 0.055, vec3(0.9,0.75,1.0), 1.0);
          col += galaxy(d, normalize(vec3(-0.34,-0.78,-0.52)), 0.035, vec3(0.7,0.85,1.1), 2.0);
          col += galaxy(d, normalize(vec3(0.06,-0.96,-0.27)), 0.022, vec3(1.0,0.85,0.7), 3.0);
          col += galaxy(d, normalize(vec3(-0.12,-0.66,-0.74)), 0.028, vec3(0.85,0.8,1.0), 4.0);
          float lane = smoothstep(0.5, 0.75, fbm(d*7.0+vec3(2.0,5.0,1.0))) * smoothstep(0.3, 0.7, a);
          col *= 1.0 - lane*0.45;
        }
        // sun + halo (bloom adds lens glow)
        float sd = max(dot(d,sunDir),0.0);
        col += vec3(3.0,2.6,2.0)*smoothstep(0.9993,0.9997,sd) + vec3(1.0,0.75,0.45)*pow(sd,800.0)*1.2 + vec3(0.5,0.35,0.25)*pow(sd,40.0)*0.35;
        gl_FragColor=vec4(col,1.0);
      }`,
  });
  const m = new THREE.Mesh(geo, mat); m.renderOrder = -10; m.frustumCulled = false;
  return m;
}

// Speed-stretched space dust (line segments wrapped around the camera)
export function makeDust(count = 320, L = 120) {
  const r = mulberry(77); const pos = new Float32Array(count * 6), end = new Float32Array(count * 2), br = new Float32Array(count * 2);
  for (let i = 0; i < count; i++) {
    const x = r() * L, y = -7 + r() * 11, z = r() * L, b = 0.15 + r() * 0.5;
    pos.set([x, y, z, x, y, z], i * 6); end[i * 2] = 0; end[i * 2 + 1] = 1; br[i * 2] = b; br[i * 2 + 1] = b;
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('aEnd', new THREE.BufferAttribute(end, 1)); g.setAttribute('aB', new THREE.BufferAttribute(br, 1));
  const mat = new THREE.ShaderMaterial({
    uniforms: { uCam: { value: new THREE.Vector2() }, uL: { value: L }, uVel: { value: new THREE.Vector2() } },
    vertexShader: `attribute float aEnd; attribute float aB; uniform vec2 uCam; uniform float uL; uniform vec2 uVel; varying float vA;
      void main(){ vec3 p=position; p.x=uCam.x+mod(p.x-uCam.x,uL)-uL*0.5; p.z=uCam.y+mod(p.z-uCam.y,uL)-uL*0.5;
        float sp=length(uVel); p.xz -= uVel*0.09*aEnd; p.xz -= aEnd*vec2(0.08,0.08);
        vA = aB*(0.35+min(sp,25.0)/25.0)*(1.0-aEnd*0.85);
        gl_Position=projectionMatrix*modelViewMatrix*vec4(p,1.0); }`,
    fragmentShader: `varying float vA; void main(){ gl_FragColor=vec4(vec3(0.6,0.8,1.0)*vA, vA); }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  });
  const l = new THREE.LineSegments(g, mat); l.frustumCulled = false; l.renderOrder = -4; return l;
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

// ---------------- Asteroids (instanced, 2 LODs, frustum culled) ----------------
export const CHUNK = 44;
const SIZE_CLASSES = [{ r0: 1.1, r1: 1.7 }, { r0: 2.0, r1: 3.0 }, { r0: 3.4, r1: 4.6 }];
function weightedPick(rng, obj) { let tot = 0; for (const k in obj) tot += obj[k]; let x = rng() * tot; for (const k in obj) { x -= obj[k]; if (x <= 0) return k; } return Object.keys(obj)[0]; }
const NV = 6, NR = 3;
function makeInst(geo, mat, cap) {
  const m = new THREE.InstancedMesh(geo, mat, cap); m.frustumCulled = false; m.count = 0;
  m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  const gc = new THREE.InstancedBufferAttribute(new Float32Array(cap * 3), 3); gc.setUsage(THREE.DynamicDrawUsage);
  const ia = new THREE.InstancedBufferAttribute(new Float32Array(cap * 3), 3); ia.setUsage(THREE.DynamicDrawUsage);
  geo = geo.clone(); geo.userData.shared = true; geo.setAttribute('aGlowCol', gc); geo.setAttribute('aInst', ia); m.geometry = geo;
  m.userData = { cap, gc, ia, n: 0 }; return m;
}
export class AsteroidField {
  constructor(scene) {
    this.scene = scene; this.camera = null; this.hiDist = 60;
    this.mat = makeRockMaterial(0x000000, 1);
    this.stationMat = makeRockMaterial(0x38c8ff, 0.45);
    this.meshes = { hi: [], lo: [], rhi: [], rlo: [] };
    for (let i = 0; i < NV; i++) {
      const o = { detail: 3, stretch: i % 3 === 1, amp: i % 3 === 2 ? 0.42 : 0.32, craters: 3 + (i % 3) };
      this.meshes.hi.push(makeInst(makeRockGeometry(500 + i * 13, o), this.mat, 120));
      this.meshes.lo.push(makeInst(makeRockGeometry(500 + i * 13, { ...o, detail: 2 }), this.mat, 160));
    }
    for (let i = 0; i < NR; i++) {
      const o = { detail: 3, crystals: 4 + i, amp: 0.28, craters: 2 };
      this.meshes.rhi.push(makeInst(makeRockGeometry(900 + i * 7, o), this.mat, 48));
      this.meshes.rlo.push(makeInst(makeRockGeometry(900 + i * 7, { ...o, detail: 2 }), this.mat, 64));
    }
    for (const k in this.meshes) for (const m of this.meshes[k]) scene.add(m);
    this.glowCols = {}; for (const k in MINERALS) this.glowCols[k] = new THREE.Color(MINERALS[k].color);
    this.chunks = new Map(); this.list = []; this.depleted = new Map(); this.loadR = 2; this.guardRequests = [];
    this._m = new THREE.Matrix4(); this._q = new THREE.Quaternion(); this._e = new THREE.Euler(); this._p = new THREE.Vector3(); this._s = new THREE.Vector3();
    this.frustum = new THREE.Frustum(); this._pm = new THREE.Matrix4(); this._sph = new THREE.Sphere();
    this.visible = 0;
  }
  makeAsteroid(o) { o.hitT = 0; o.alive = true; o.vx = o.vx || 0; o.vz = o.vz || 0; o.rx = o.rx || 0; o.ry = o.ry || 0; o.seedF = ((o.variant * 0.6180339) % 1); this.list.push(o); return o; }
  genChunk(cx, cz, now) {
    const key = cx + ',' + cz; const rng = mulberry(hash2(cx, cz, 9001)); const ch = { key, list: [] };
    const centerX = (cx + 0.5) * CHUNK, centerZ = (cz + 0.5) * CHUNK; const sec = sectorAt(Math.hypot(centerX, centerZ));
    const n = Math.max(1, Math.round(sec.density + (rng() - 0.5) * 4)); const pts = [];
    for (let i = 0; i < n; i++) {
      const id = key + ':' + i; let x = 0, z = 0, ok = false;
      for (let tries = 0; tries < 6 && !ok; tries++) { x = cx * CHUNK + rng() * CHUNK; z = cz * CHUNK + rng() * CHUNK; ok = true; for (const p of pts) if (Math.hypot(p[0] - x, p[1] - z) < 9) ok = false; }
      const t = rng() * 11; const sc = SIZE_CLASSES[t < 5 ? 0 : t < 9 ? 1 : 2];
      const rich = sec.rich > 0 && rng() < sec.rich; const type = weightedPick(rng, sec.minerals);
      const r = rich ? 3.0 + rng() * 1.2 : sc.r0 + rng() * (sc.r1 - sc.r0);
      const variant = Math.floor(rng() * 100), rx = rng() * 6, ry = rng() * 6;
      if (!ok || Math.hypot(x, z) < 42) continue;
      pts.push([x, z]);
      const dep = this.depleted.get(id); if (dep && now < dep) continue; if (dep) this.depleted.delete(id);
      if (rich && sec.danger >= 1) this.guardRequests.push({ id: 'g' + id, x, z, danger: sec.danger, chunk: key, count: sec.danger >= 3 ? 2 : 1 });
      const hpMul = (1 + sec.danger * 0.9) * (rich ? 2.2 : 1);
      const a = this.makeAsteroid({ id, chunk: key, x, y: (rng() - 0.5) * 1.5, z, r, type, rich, variant, rx, ry, sector: sec.id, maxHp: Math.round(16 * r * r * hpMul), spin: (rng() - 0.5) * 0.4 });
      a.hp = a.maxHp; ch.list.push(a);
    }
    this.chunks.set(key, ch);
  }
  update(px, pz, now, dt) {
    const ccx = Math.floor(px / CHUNK), ccz = Math.floor(pz / CHUNK), R = this.loadR;
    for (let dx = -R; dx <= R; dx++) for (let dz = -R; dz <= R; dz++) { const key = (ccx + dx) + ',' + (ccz + dz); if (!this.chunks.has(key)) this.genChunk(ccx + dx, ccz + dz, now); }
    for (const [key, ch] of this.chunks) {
      const [x, z] = key.split(',').map(Number);
      if (Math.abs(x - ccx) > R + 1 || Math.abs(z - ccz) > R + 1) { for (const a of ch.list) a.alive = false; this.chunks.delete(key); }
    }
    const L = this.list; let w = 0;
    for (let i = 0; i < L.length; i++) {
      const a = L[i]; if (!a.alive) continue;
      if (!a.chunk && (Math.abs(a.x - px) > CHUNK * (R + 1.5) || Math.abs(a.z - pz) > CHUNK * (R + 1.5))) { a.alive = false; continue; }
      a.ry += a.spin * dt; a.rx += a.spin * 0.5 * dt; if (a.hitT > 0) a.hitT -= dt;
      if (a.vx || a.vz) { a.x += a.vx * dt; a.z += a.vz * dt; const k = Math.exp(-0.12 * dt); a.vx *= k; a.vz *= k; if (Math.abs(a.vx) + Math.abs(a.vz) < 0.03) a.vx = a.vz = 0; if (Math.abs(a.spin) > 0.5) a.spin *= Math.exp(-0.3 * dt); } // momentum (v6)
      L[w++] = a;
    }
    L.length = w;
    this.syncInstances(px, pz);
  }
  syncInstances(px, pz) {
    for (const k in this.meshes) for (const m of this.meshes[k]) m.userData.n = 0;
    const cam = this.camera; if (cam) { cam.updateMatrixWorld(); this._pm.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse); this.frustum.setFromProjectionMatrix(this._pm); }
    let vis = 0;
    for (const a of this.list) {
      this._sph.center.set(a.x, a.y, a.z); this._sph.radius = a.r * 1.5;
      if (cam && !this.frustum.intersectsSphere(this._sph)) continue;
      const near = Math.hypot(a.x - px, a.z - pz) < this.hiDist;
      const set = a.rich ? (near ? this.meshes.rhi : this.meshes.rlo)[a.variant % NR] : (near ? this.meshes.hi : this.meshes.lo)[a.variant % NV];
      const u = set.userData; if (u.n >= u.cap) continue; const i = u.n++;
      const pulse = a.hitT > 0 ? 1 + Math.sin(a.hitT * 60) * 0.035 * a.hitT * 6 : 1;
      this._e.set(a.rx, a.ry, 0); this._q.setFromEuler(this._e); this._p.set(a.x, a.y, a.z); this._s.setScalar(a.r * pulse);
      this._m.compose(this._p, this._q, this._s); set.setMatrixAt(i, this._m);
      const c = this.glowCols[a.type]; const gi = a.rich ? 1.6 : 1.7; u.gc.setXYZ(i, c.r * gi, c.g * gi, c.b * gi);
      u.ia.setXYZ(i, 1 - a.hp / a.maxHp, Math.max(0, a.hitT) * 5, a.seedF); vis++;
    }
    for (const k in this.meshes) for (const m of this.meshes[k]) { const u = m.userData; m.count = u.n; if (u.n) { m.instanceMatrix.needsUpdate = true; u.gc.needsUpdate = true; u.ia.needsUpdate = true; } }
    this.visible = vis;
  }
  destroy(a, now, respawnSec = 120) {
    a.alive = false; if (a.id) this.depleted.set(a.id, now + respawnSec);
    const ch = a.chunk && this.chunks.get(a.chunk); if (ch) { const i = ch.list.indexOf(a); if (i >= 0) ch.list.splice(i, 1); }
  }
  spawnFragment(x, z, r, type, sector) {
    // v7: live fragments are capped per quality preset (oldest crumble first)
    this.frags ||= []; this.maxFrag ||= 80; this.frags = this.frags.filter((f) => f.alive); while (this.frags.length >= this.maxFrag) { const o = this.frags.shift(); o.alive = false; }
    const hp = Math.round(16 * r * r * (1 + (sector - 1) * 0.9));
    const a = this.makeAsteroid({ id: null, chunk: null, x, y: rand(-0.5, 0.5), z, r, type, rich: false, variant: Math.floor(rand(0, 100)), rx: rand(0, 6), ry: rand(0, 6), sector, hp, maxHp: hp, spin: rand(-0.9, 0.9) });
    a.hitT = 0.15; this.frags.push(a); return a;
  }
  setTime(t) { rockUniforms.uTime.value = t; }
}

// ---------------- Mineral pickups ----------------
export class Minerals {
  constructor(scene, max = 500) {
    this.max = max; this.list = []; this.free = [];
    const geo = new THREE.CylinderGeometry(0.0, 0.36, 0.5, 6, 1); geo.translate(0, -0.25, 0); const top = new THREE.CylinderGeometry(0.22, 0.36, 0.16, 6, 1); top.translate(0, 0.08, 0); const gem = mergeGeometries([geo.toNonIndexed(), top.toNonIndexed()]); gem.computeVertexNormals();
    const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xffffff, emissiveIntensity: 0.0, metalness: 0.5, roughness: 0.12, flatShading: true });
    // make emissive follow instance colour
    mat.onBeforeCompile = (sh) => { sh.fragmentShader = sh.fragmentShader.replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n totalEmissiveRadiance += vColor.rgb * 1.9;'); };
    this.mesh = new THREE.InstancedMesh(gem, mat, max); this.mesh.frustumCulled = false; this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
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
  update(dt, sx, sz, magnetR, collectR, canCollect, onCollect, t, sparkle) {
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
      if (sparkle && Math.random() < (o.pull > 0 ? 0.5 : 0.04)) sparkle(o.x, o.y, o.z, o.type, o.pull > 0);
      if (o.delay <= 0 && dist < collectR && canCollect(o.type)) { onCollect(o); o.life = -1; }
      if (o.life <= 0) { this.setHidden(o.idx); this.free.push(o.idx); L[i] = L[L.length - 1]; L.pop(); continue; }
      d.position.set(o.x, o.y + Math.sin(t * 3 + o.spin) * 0.15, o.z); d.rotation.set(0.3, o.spin, 0.2);
      d.scale.setScalar(o.life < 3 ? o.life / 3 : 1); d.updateMatrix(); this.mesh.setMatrixAt(o.idx, d.matrix);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}

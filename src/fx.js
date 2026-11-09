// Pooled visual effects: GPU points particles, debris, shockwave rings, instanced bolts, floating text
import * as THREE from 'three';
import { rand, TAU } from './util.js?v=3';
import { glowTexture } from './models.js?v=3';

export class Particles {
  constructor(scene, max = 4000, opts = {}) {
    this.max = max; this.i = 0; const normal = !!opts.normal;
    const g = new THREE.BufferGeometry();
    this.pos = new Float32Array(max * 3); this.col = new Float32Array(max * 3); this.size = new Float32Array(max); this.alpha = new Float32Array(max);
    this.vel = new Float32Array(max * 3); this.life = new Float32Array(max); this.maxLife = new Float32Array(max);
    this.s0 = new Float32Array(max); this.s1 = new Float32Array(max); this.drag = new Float32Array(max); this.a0 = new Float32Array(max);
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('color', new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('size', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('alpha', new THREE.BufferAttribute(this.alpha, 1).setUsage(THREE.DynamicDrawUsage));
    this.mat = new THREE.ShaderMaterial({
      uniforms: { uScale: { value: 400 }, uMap: { value: glowTexture() } },
      vertexShader: `attribute float size; attribute float alpha; attribute vec3 color; varying vec3 vC; varying float vA; uniform float uScale;
        void main(){ vC=color; vA=alpha; vec4 mv=modelViewMatrix*vec4(position,1.0); gl_PointSize = size*uScale/(-mv.z); gl_Position=projectionMatrix*mv; }`,
      fragmentShader: `uniform sampler2D uMap; varying vec3 vC; varying float vA; void main(){ float a=texture2D(uMap,gl_PointCoord).a*vA; if(a<0.01) discard; ${normal ? 'gl_FragColor=vec4(vC,a*0.75);' : 'gl_FragColor=vec4(vC*a,a);'} } `,
      transparent: true, depthWrite: false, blending: normal ? THREE.NormalBlending : THREE.AdditiveBlending,
    });
    this.points = new THREE.Points(g, this.mat); this.points.frustumCulled = false; this.points.renderOrder = normal ? 4 : 5;
    scene.add(this.points); this.geo = g; this.active = 0; this.budget = 1;
  }
  emit(x, y, z, vx, vy, vz, life, s0, s1, r, gg, b, drag = 2, alpha = 1) {
    const i = this.i; this.i = (this.i + 1) % this.max;
    this.pos[i * 3] = x; this.pos[i * 3 + 1] = y; this.pos[i * 3 + 2] = z;
    this.vel[i * 3] = vx; this.vel[i * 3 + 1] = vy; this.vel[i * 3 + 2] = vz;
    this.col[i * 3] = r; this.col[i * 3 + 1] = gg; this.col[i * 3 + 2] = b;
    this.life[i] = life; this.maxLife[i] = life; this.s0[i] = s0; this.s1[i] = s1; this.drag[i] = drag; this.a0[i] = alpha;
  }
  burst(x, y, z, n, speed, life, s0, s1, c, drag = 2, spreadY = 0.4) {
    n = Math.ceil(n * this.budget);
    for (let k = 0; k < n; k++) {
      const a = rand(0, TAU), sp = speed * rand(0.3, 1), u = rand(-spreadY, spreadY);
      this.emit(x, y, z, Math.cos(a) * sp, u * sp, Math.sin(a) * sp, life * rand(0.6, 1.2), s0, s1, c[0], c[1], c[2], drag);
    }
  }
  explosion(x, y, z, scale = 1, tint = null) {
    const s = scale;
    this.emit(x, y + 0.5, z, 0, 0, 0, 0.18, 2.5 * s, 6 * s, 1.6, 1.1, 0.7, 0); // flash
    this.burst(x, y, z, 18 * s, 8 * s, 0.6, 1.6 * s, 0.4 * s, [1.5, 0.55, 0.14], 3); // fireball
    this.burst(x, y, z, 14 * s, 20 * s, 0.4, 0.5, 0.08, [2.2, 1.5, 0.6], 1.5); // sparks
    this.burst(x, y, z, 8 * s, 3 * s, 1.2, 1.4 * s, 2.6 * s, [0.18, 0.1, 0.09], 1.5); // embers/smoke glow
    if (tint) this.burst(x, y, z, 10 * s, 11 * s, 0.7, 0.9, 0.15, tint.map((v) => v * 0.6), 2);
  }
  update(dt) {
    const m = this.max; let act = 0;
    for (let i = 0; i < m; i++) {
      let l = this.life[i];
      if (l <= 0) { if (this.size[i] !== 0) { this.size[i] = 0; this.alpha[i] = 0; } continue; }
      act++;
      l -= dt; this.life[i] = l;
      const t = 1 - Math.max(l, 0) / this.maxLife[i];
      const d = Math.exp(-this.drag[i] * dt); const j = i * 3;
      this.vel[j] *= d; this.vel[j + 1] *= d; this.vel[j + 2] *= d;
      this.pos[j] += this.vel[j] * dt; this.pos[j + 1] += this.vel[j + 1] * dt; this.pos[j + 2] += this.vel[j + 2] * dt;
      this.size[i] = l > 0 ? this.s0[i] + (this.s1[i] - this.s0[i]) * t : 0;
      this.alpha[i] = this.a0[i] * (1 - t * t);
    }
    this.active = act;
    const a = this.geo.attributes; a.position.needsUpdate = a.color.needsUpdate = a.size.needsUpdate = a.alpha.needsUpdate = true;
  }
}

// Rock debris chunks (instanced)
export class Debris {
  constructor(scene, max = 240) {
    this.max = max; this.i = 0;
    const geo = new THREE.DodecahedronGeometry(0.35, 0);
    const mat = new THREE.MeshStandardMaterial({ color: 0x5b5860, roughness: 0.9, flatShading: true, emissive: 0x000000 });
    this.mesh = new THREE.InstancedMesh(geo, mat, max); this.mesh.frustumCulled = false;
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.d = Array.from({ length: max }, () => ({ life: 0, p: new THREE.Vector3(), v: new THREE.Vector3(), r: new THREE.Euler(), w: new THREE.Vector3(), s: 1 }));
    this.dummy = new THREE.Object3D();
    for (let i = 0; i < max; i++) { this.dummy.scale.setScalar(0); this.dummy.updateMatrix(); this.mesh.setMatrixAt(i, this.dummy.matrix); }
    scene.add(this.mesh);
  }
  spawn(x, y, z, n, speed, size) {
    for (let k = 0; k < n; k++) {
      const o = this.d[this.i]; this.i = (this.i + 1) % this.max;
      const a = rand(0, TAU), sp = speed * rand(0.3, 1);
      o.life = rand(0.8, 1.8); o.p.set(x, y, z); o.v.set(Math.cos(a) * sp, rand(-0.4, 0.6) * sp, Math.sin(a) * sp);
      o.r.set(rand(0, 6), rand(0, 6), rand(0, 6)); o.w.set(rand(-6, 6), rand(-6, 6), rand(-6, 6)); o.s = size * rand(0.4, 1.3);
    }
  }
  update(dt) {
    const dm = this.dummy;
    for (let i = 0; i < this.max; i++) {
      const o = this.d[i];
      if (o.life <= 0) { if (o.s) { o.s = 0; dm.scale.setScalar(0); dm.updateMatrix(); this.mesh.setMatrixAt(i, dm.matrix); } continue; }
      o.life -= dt; o.v.multiplyScalar(Math.exp(-1.2 * dt)); o.p.addScaledVector(o.v, dt);
      o.r.x += o.w.x * dt; o.r.y += o.w.y * dt; o.r.z += o.w.z * dt;
      dm.position.copy(o.p); dm.rotation.copy(o.r); dm.scale.setScalar(o.s * Math.min(1, o.life * 2));
      dm.updateMatrix(); this.mesh.setMatrixAt(i, dm.matrix);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}

export class Rings {
  constructor(scene, n = 16) {
    this.pool = [];
    const geo = new THREE.RingGeometry(0.85, 1, 48); geo.rotateX(-Math.PI / 2);
    for (let i = 0; i < n; i++) {
      const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
      m.visible = false; scene.add(m); this.pool.push({ m, life: 0, max: 1, r0: 0, r1: 1 });
    }
  }
  spawn(x, y, z, r1, color, life = 0.5) {
    const o = this.pool.find((p) => p.life <= 0) || this.pool[0];
    o.life = o.max = life; o.r1 = r1; o.m.position.set(x, y, z); o.m.visible = true;
    o.m.material.color.setRGB(color[0], color[1], color[2]);
  }
  update(dt) {
    for (const o of this.pool) {
      if (o.life <= 0) continue;
      o.life -= dt; const t = 1 - o.life / o.max;
      const r = Math.max(0.01, o.r1 * (0.15 + 0.85 * Math.sqrt(t)));
      o.m.scale.set(r, 1, r); o.m.material.opacity = 1 - t;
      if (o.life <= 0) o.m.visible = false;
    }
  }
}

// Instanced bolts (player + enemy shots, missiles drawn as bolts)
export class Bolts {
  constructor(scene, max = 500) {
    this.max = max;
    const geo = new THREE.BoxGeometry(0.22, 0.22, 1); 
    const mat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
    this.mesh = new THREE.InstancedMesh(geo, mat, max); this.mesh.frustumCulled = false;
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.setColorAt(0, new THREE.Color(1, 1, 1));
    scene.add(this.mesh);
    this.list = []; this.free = [];
    for (let i = max - 1; i >= 0; i--) this.free.push(i);
    this.dummy = new THREE.Object3D(); this.col = new THREE.Color();
    for (let i = 0; i < max; i++) this.hide(i);
  }
  hide(i) { const d = this.dummy; d.scale.set(0, 0, 0); d.position.set(0, -999, 0); d.updateMatrix(); this.mesh.setMatrixAt(i, d.matrix); }
  spawn(o) { // o: {x,z,vx,vz,dmg,owner,life,len,w,color:[r,g,b],...}
    if (!this.free.length) return null;
    o.idx = this.free.pop(); o.dead = false; o.y = o.y ?? 0.6;
    this.col.setRGB(o.color[0], o.color[1], o.color[2]); this.mesh.setColorAt(o.idx, this.col);
    this.mesh.instanceColor.needsUpdate = true;
    this.list.push(o); return o;
  }
  kill(o) { o.dead = true; }
  sync() {
    const d = this.dummy; const L = this.list;
    for (let k = L.length - 1; k >= 0; k--) {
      const o = L[k];
      if (o.dead) { this.hide(o.idx); this.free.push(o.idx); L[k] = L[L.length - 1]; L.pop(); continue; }
      d.position.set(o.x, o.y, o.z); d.rotation.set(0, Math.atan2(o.vx, o.vz), 0);
      d.scale.set(o.w || 1, o.w || 1, o.len || 1.6); d.updateMatrix(); this.mesh.setMatrixAt(o.idx, d.matrix);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}

// Floating DOM text pool
export class FloatText {
  constructor(container, camera, n = 28) {
    this.camera = camera; this.items = []; this.v = new THREE.Vector3();
    for (let i = 0; i < n; i++) {
      const el = document.createElement('div'); el.className = 'ftext'; el.style.display = 'none'; container.appendChild(el);
      this.items.push({ el, life: 0, pos: new THREE.Vector3() });
    }
    this.i = 0;
  }
  spawn(x, y, z, text, color = '#fff', big = false) {
    const it = this.items[this.i]; this.i = (this.i + 1) % this.items.length;
    it.life = it.max = big ? 1.4 : 1.0; it.pos.set(x, y, z); it.el.textContent = text; it.el.style.color = color;
    it.el.style.fontSize = big ? '20px' : '14px'; it.el.style.display = 'block';
  }
  update(dt, w, h) {
    for (const it of this.items) {
      if (it.life <= 0) continue;
      it.life -= dt;
      if (it.life <= 0) { it.el.style.display = 'none'; continue; }
      const t = 1 - it.life / it.max;
      this.v.copy(it.pos).project(this.camera);
      const x = (this.v.x * 0.5 + 0.5) * w, y = (-this.v.y * 0.5 + 0.5) * h - t * 40;
      it.el.style.transform = `translate(${x}px,${y}px) translate(-50%,-50%) scale(${1 + (1 - t) * 0.2})`;
      it.el.style.opacity = String(Math.min(1, (1 - t) * 2));
    }
  }
}

// Pooled point lights for explosion / muzzle flashes (disabled on Low quality)
export class Flashes {
  constructor(scene, n = 3) {
    this.pool = []; this.enabled = true;
    for (let i = 0; i < n; i++) { const l = new THREE.PointLight(0xffaa55, 0, 30, 1.6); l.position.set(0, -999, 0); scene.add(l); this.pool.push({ l, life: 0, max: 1, i0: 0 }); }
  }
  spawn(x, y, z, intensity = 40, color = 0xffaa55, life = 0.35, dist = 30) {
    if (!this.enabled) return;
    let o = this.pool[0]; for (const p of this.pool) if (p.life < o.life) o = p;
    o.life = o.max = life; o.i0 = intensity; o.l.color.setHex(color); o.l.distance = dist; o.l.position.set(x, y + 2, z); o.l.intensity = intensity;
  }
  update(dt) {
    for (const o of this.pool) {
      if (o.life <= 0) { if (o.l.intensity) o.l.intensity = 0; continue; }
      o.life -= dt; const t = Math.max(0, o.life / o.max); o.l.intensity = o.i0 * t * t;
    }
  }
}

// Rotating 3D previews (shipyard + station) rendered by one small, lazily created WebGL renderer.
// Its canvas is moved into whichever menu slot needs it and only renders while visible.
import * as THREE from 'three';
import { buildShip, buildStation, makeFlames, makeTurret, animateNavLights, animateStation, makeRockMaterial } from './models.js';

const KIT = ['laser', 'cannon', 'missile', 'cannon', 'missile', 'pulse'];
export class Preview {
  constructor() { this.r = null; this.cache = new Map(); this.obj = null; this.active = false; this.failed = false; this.t = 0; }
  init() {
    if (this.r || this.failed) return !this.failed;
    try { this.r = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'low-power' }); }
    catch (e) { this.failed = true; return false; }
    const r = this.r; r.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2)); r.outputColorSpace = THREE.SRGBColorSpace;
    r.toneMapping = THREE.ACESFilmicToneMapping; r.toneMappingExposure = 1.1; r.setClearColor(0x000000, 0);
    r.domElement.className = 'pvCanvas';
    this.scene = new THREE.Scene(); this.camera = new THREE.PerspectiveCamera(32, 2, 0.1, 500);
    this.scene.add(new THREE.HemisphereLight(0x9fc4ff, 0x2a1830, 0.7));
    const k = new THREE.DirectionalLight(0xffe6c8, 2.6); k.position.set(-30, 50, 30); this.scene.add(k);
    const rim = new THREE.DirectionalLight(0x5aa0ff, 1.6); rim.position.set(40, 10, -50); this.scene.add(rim);
    const es = new THREE.Scene();
    es.add(new THREE.Mesh(new THREE.SphereGeometry(10, 24, 12), new THREE.ShaderMaterial({ side: THREE.BackSide,
      vertexShader: 'varying vec3 vP; void main(){ vP=normalize(position); gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
      fragmentShader: 'varying vec3 vP; void main(){ float t=vP.y*0.5+0.5; vec3 c=mix(vec3(0.05,0.03,0.08),vec3(0.35,0.5,0.8),t); c+=vec3(1.4,0.9,0.6)*pow(max(0.0,dot(vP,normalize(vec3(-0.5,0.8,0.4)))),12.0); gl_FragColor=vec4(c,1.0);}' })));
    const pm = new THREE.PMREMGenerator(r); this.scene.environment = pm.fromScene(es, 0.02).texture; this.scene.environmentIntensity = 0.8; pm.dispose();
    this.rockMat = makeRockMaterial(0x38c8ff, 0.6);
    return true;
  }
  model(kind, arg) {
    const key = kind + arg; if (this.cache.has(key)) return this.cache.get(key);
    const g = new THREE.Group(); let anim = null;
    if (kind === 'ship') {
      const b = buildShip(arg); g.add(b.group);
      b.hardpoints.forEach((h, i) => { const t = makeTurret(KIT[i % KIT.length], (h.size || 1) * 1.05); t.position.set(h.x, h.y, h.z); t.rotation.y = (i % 2 ? 0.4 : -0.4); b.group.add(t); });
      for (const h of b.pointDefense || []) { const t = makeTurret('cannon', h.size); t.position.set(h.x, h.y, h.z); b.group.add(t); }
      const fl = makeFlames(b.engines); fl.mat.uniforms.uPower.value = 0.8; for (const f of fl.flames) { f.mesh.scale.set(1, 1, f.r * 3); f.core.scale.set(1, 1, f.r * 1.7); f.sprite.scale.setScalar(f.r * 3); }
      b.group.add(fl.group); g.userData.flames = fl; g.userData.nav = b.group;
    } else {
      const st = buildStation(arg, this.rockMat); g.add(st); anim = st; g.userData.nav = st.userData.main;
    }
    const box = new THREE.Box3().setFromObject(g); const sph = box.getBoundingSphere(new THREE.Sphere());
    g.userData.radius = sph.radius; g.userData.center = sph.center.clone(); g.userData.station = anim;
    this.cache.set(key, g); return g;
  }
  show(container, kind, arg) {
    if (!container || !this.init()) return false;
    if (this.obj) this.scene.remove(this.obj);
    this.obj = this.model(kind, arg); this.scene.add(this.obj); this.kind = kind;
    container.appendChild(this.r.domElement); this.container = container; this.active = true; this.fit(); this.render(0);
    return true;
  }
  fit() {
    const c = this.container; if (!c) return; const w = Math.max(50, c.clientWidth), h = Math.max(50, c.clientHeight);
    this.r.setSize(w, h, false); this.camera.aspect = w / h; this.camera.updateProjectionMatrix();
    const R = this.obj.userData.radius, ctr = this.obj.userData.center;
    const fov = THREE.MathUtils.degToRad(this.camera.fov); const fit = Math.max(1, 1 / Math.min(1, this.camera.aspect));
    const d = R / Math.sin(fov / 2) * (this.kind === 'ship' ? 0.66 : 0.8) * fit;
    this.camera.position.set(ctr.x, ctr.y + d * 0.55, ctr.z + d * 0.84); this.camera.lookAt(ctr.x, ctr.y, ctr.z);
  }
  hide() { this.active = false; if (this.r && this.r.domElement.parentNode) this.r.domElement.parentNode.removeChild(this.r.domElement); this.container = null; }
  render(dt) {
    if (!this.active || !this.obj) return;
    if (!this.r.domElement.isConnected) { this.active = false; return; }
    this.t += dt; const o = this.obj; o.rotation.y += dt * 0.45;
    if (o.userData.flames) o.userData.flames.mat.uniforms.uTime.value = this.t;
    if (o.userData.station) animateStation(o.userData.station, this.t, dt); else animateNavLights(o.userData.nav, this.t);
    this.r.render(this.scene, this.camera);
  }
}

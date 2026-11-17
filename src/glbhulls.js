// Blender test (branch blender-test): hand-built Blender hulls loaded as glTF and dropped into buildHull().
// Off by default. Turn on with ?hulls=glb (or localStorage 'sf-hulls' = 'glb'); ?hulls=proc turns it off again.
// Any load failure falls back to the procedural hull. Gameplay data (length, radius, keel hitbox chain, mass, slots)
// still comes from HULLS, so hitboxes are identical; the glb only replaces the visible meshes, engine-flame anchors
// and hardpoint positions. Materials are swapped by slot name for the game's own faction-tinted hull materials,
// so faction paint and the damage-state shader work unchanged.
import * as THREE from 'three';
import { GLTFLoader } from '../vendor/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from '../vendor/addons/libs/meshopt_decoder.module.js';

export const GLB_IDS = ['scout', 'interceptor', 'strike', 'bomber', 'corvette', 'gunship', 'engineer', 'explorer', 'frigate', 'destroyer', 'icarrier', 'cruiser', 'battlecruiser', 'fleetcarrier', 'dreadnought'];
// GO-LIVE SWITCH: set to true to make the Blender hulls the default for everyone (?hulls=proc still opts out).
export const GLB_DEFAULT = false;
export const GLB_UNIT = 1 / 5; // Blender metres -> game units (1 u = 5 m)
const P = new URLSearchParams(typeof location !== 'undefined' ? location.search : '');
const q = P.get('hulls');
try { if (q === 'glb' || q === 'proc') localStorage.setItem('sf-hulls', q); } catch (e) { /* private mode */ }
let stored = null; try { stored = localStorage.getItem('sf-hulls'); } catch (e) { /* */ }
export const GLB = { enabled: q ? q === 'glb' : stored ? stored === 'glb' : GLB_DEFAULT, cache: {}, failed: {}, stats: {}, loading: null };

export function preloadGlbHulls(ids = GLB_IDS, base = 'models/', timeoutMs = 15000) {
  if (GLB.loading) return GLB.loading;
  const loader = new GLTFLoader(); loader.setMeshoptDecoder(MeshoptDecoder);
  const one = (id) => new Promise((res) => {
    const t = setTimeout(() => { GLB.failed[id] = 'timeout'; res(); }, timeoutMs);
    loader.load(base + id + '.glb?v=bt3', (g) => { clearTimeout(t); try { GLB.cache[id] = prep(g.scene); } catch (e) { GLB.failed[id] = String(e); } res(); },
      undefined, (e) => { clearTimeout(t); GLB.failed[id] = String(e && e.message || e); console.warn('glb hull fallback', id, e); res(); });
  });
  GLB.loading = Promise.all(ids.map(one)).then(() => GLB);
  return GLB.loading;
}
function prep(scene) {
  scene.updateMatrixWorld(true); const engines = [], hard = [], bays = []; let tris = 0; const meshes = [];
  const v = new THREE.Vector3();
  scene.traverse((o) => {
    if (o.isMesh) { meshes.push(o); const gm = o.geometry; tris += (gm.index ? gm.index.count : gm.attributes.position.count) / 3; }
    else if (/^(engine|hard|bay)_/.test(o.name)) { o.getWorldPosition(v);
      const p = { x: v.x * GLB_UNIT, y: v.y * GLB_UNIT, z: v.z * GLB_UNIT, r: ((o.userData && o.userData.size) || 1) * GLB_UNIT }; (o.name[0] === 'e' ? engines : o.name[0] === 'b' ? bays : hard).push(p); }
  });
  // bake to plain float geometry in game units at identity transforms: the damage shader works in object space
  // (vDmgP = position), so quantized/scaled meshopt nodes would put its noise at the wrong scale
  const out = new THREE.Group(); const S = new THREE.Matrix4().makeScale(GLB_UNIT, GLB_UNIT, GLB_UNIT);
  for (const m of meshes) {
    const g = new THREE.BufferGeometry();
    for (const k of ['position', 'normal', 'uv', 'color']) { const a = m.geometry.attributes[k]; if (!a) continue; const n = k === 'color' ? 3 : a.itemSize; const f = new Float32Array(a.count * n);
      for (let i = 0; i < a.count; i++) for (let j = 0; j < n; j++) f[i * n + j] = a.getComponent(i, j); g.setAttribute(k, new THREE.BufferAttribute(f, n)); }
    if (m.geometry.index) g.setIndex(m.geometry.index.clone());
    g.applyMatrix4(new THREE.Matrix4().multiplyMatrices(S, m.matrixWorld)); g.computeBoundingSphere();
    const mm = new THREE.Mesh(g, m.material); mm.name = m.name; out.add(mm);
  }
  return { scene: out, engines, hard, bays, tris: Math.round(tris), meshes: meshes.length };
}
const SLOT = { H: 'H', P: 'P', D: 'D', A: 'A', C: 'W', W: 'Wn', G: 'G' };
// glb meshes carry baked AO / panel-tint vertex colours: they get a per-material clone with vertexColors on, a little
// less metalness and a lift in base colour, so the stacked decks and plate seams read under the game's single sun
// (the shared procedural materials can't turn vertexColors on: meshes without a colour attribute would go black)
const VC = new WeakMap();
let GLASS = null; // proper canopy glass for glb hulls (the scheme 'W' material is a warm lit-window tone on some paints)
function glass() {
  return GLASS ||= new THREE.MeshStandardMaterial({ name: 'glbGlass', color: 0x0d1828, metalness: 0.9, roughness: 0.07, emissive: new THREE.Color(0.05, 0.16, 0.34), emissiveIntensity: 0.55, envMapIntensity: 1.8 });
}
// hide a bolt-on turret's own meshes but keep the object (aim / muzzle origin); LOD toggles only direct children,
// so hidden grandchildren stay hidden when the hull comes back from the far LOD
export function hideTurret(t) { t.traverse((o) => { if (o !== t && (o.isMesh || o.isSprite)) o.visible = false; }); t.userData.glbHidden = true; }
// far LOD from the glb: one merged, vertex-coloured, non-indexed geometry per hull + paint (windows/glass dropped)
const LO = new Map();
function makeLo(id, c, M, key) {
  const k = id + ':' + key; if (LO.has(k)) return LO.get(k);
  const pos = [], nor = [], col = []; const cc = new THREE.Color();
  for (const m of c.scene.children) {
    const slot = m.material && m.material.name; if (slot === 'W' || slot === 'C') continue;
    const base = M[SLOT[slot] || 'H'] || M.H; cc.copy(base.color || new THREE.Color(1, 1, 1));
    if (base.isMeshBasicMaterial) { const mx = Math.max(cc.r, cc.g, cc.b, 1); cc.multiplyScalar(1 / mx); } else cc.multiplyScalar(1.1);
    const g = m.geometry.index ? m.geometry.toNonIndexed() : m.geometry; const P = g.attributes.position, N = g.attributes.normal, V = g.attributes.color;
    for (let i = 0; i < P.count; i++) { pos.push(P.getX(i), P.getY(i), P.getZ(i)); nor.push(N.getX(i), N.getY(i), N.getZ(i)); const a = V ? V.getX(i) : 1; col.push(cc.r * a, cc.g * a, cc.b * a); }
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.computeBoundingSphere(); g.userData.shared = true; LO.set(k, g); return g;
}
function vcMat(m) {
  if (!m || !m.isMeshStandardMaterial) return m; let c = VC.get(m); if (c) return c;
  c = m.clone(); c.vertexColors = true; c.metalness = Math.min(c.metalness, 0.62); c.color.multiplyScalar(1.3); c.envMapIntensity = (m.envMapIntensity || 1) * 1.15;
  c.name = (m.name || '') + '+vc'; VC.set(m, c); return c;
}
// replace the procedural meshes of a built hull group with the glb; returns {engines, hard} in game units or null
export function applyGlb(id, group, M, engR, schemeKey) {
  if (!GLB.enabled) return null; const c = GLB.cache[id]; if (!c) return null;
  for (let i = group.children.length - 1; i >= 0; i--) if (group.children[i].name !== 'navLights') group.remove(group.children[i]);
  const root = c.scene.clone(true); root.name = 'glb:' + id;
  root.traverse((o) => { if (!o.isMesh) return; const n = o.material && o.material.name; const key = SLOT[n] || 'H'; const base = M[key] || M.H; o.material = n === 'C' ? glass() : o.geometry.attributes.color ? vcMat(base) : base; o.castShadow = o.receiveShadow = false; });
  group.add(root);
  return { engines: c.engines.map((e) => ({ ...e, r: e.r || engR || 0.3 })), hard: [...c.hard].sort((a, b) => b.r - a.r).map((h) => ({ x: h.x, y: h.y, z: h.z, size: h.r * 1.4 })),
    bays: c.bays.map((b) => ({ x: b.x, y: b.y, z: b.z, size: b.r })), lo: makeLo(id, c, M, schemeKey || 'x') };
}

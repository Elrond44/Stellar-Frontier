// Blender test (branch blender-test): hand-built Blender hulls loaded as glTF and dropped into buildHull().
// Off by default. Turn on with ?hulls=glb (or localStorage 'sf-hulls' = 'glb'); ?hulls=proc turns it off again.
// Any load failure falls back to the procedural hull. Gameplay data (length, radius, keel hitbox chain, mass, slots)
// still comes from HULLS, so hitboxes are identical; the glb only replaces the visible meshes, engine-flame anchors
// and hardpoint positions. Materials are swapped by slot name for the game's own faction-tinted hull materials,
// so faction paint and the damage-state shader work unchanged.
import * as THREE from 'three';
import { GLTFLoader } from '../vendor/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from '../vendor/addons/libs/meshopt_decoder.module.js';

export const GLB_IDS = ['scout', 'frigate', 'dreadnought'];
export const GLB_UNIT = 1 / 5; // Blender metres -> game units (1 u = 5 m)
const P = new URLSearchParams(typeof location !== 'undefined' ? location.search : '');
const q = P.get('hulls');
try { if (q === 'glb' || q === 'proc') localStorage.setItem('sf-hulls', q); } catch (e) { /* private mode */ }
let stored = null; try { stored = localStorage.getItem('sf-hulls'); } catch (e) { /* */ }
export const GLB = { enabled: q ? q === 'glb' : stored === 'glb', cache: {}, failed: {}, stats: {}, loading: null };

export function preloadGlbHulls(ids = GLB_IDS, base = 'models/', timeoutMs = 15000) {
  if (GLB.loading) return GLB.loading;
  const loader = new GLTFLoader(); loader.setMeshoptDecoder(MeshoptDecoder);
  const one = (id) => new Promise((res) => {
    const t = setTimeout(() => { GLB.failed[id] = 'timeout'; res(); }, timeoutMs);
    loader.load(base + id + '.glb?v=bt1', (g) => { clearTimeout(t); try { GLB.cache[id] = prep(g.scene); } catch (e) { GLB.failed[id] = String(e); } res(); },
      undefined, (e) => { clearTimeout(t); GLB.failed[id] = String(e && e.message || e); console.warn('glb hull fallback', id, e); res(); });
  });
  GLB.loading = Promise.all(ids.map(one)).then(() => GLB);
  return GLB.loading;
}
function prep(scene) {
  scene.updateMatrixWorld(true); const engines = [], hard = []; let tris = 0; const meshes = [];
  const v = new THREE.Vector3();
  scene.traverse((o) => {
    if (o.isMesh) { meshes.push(o); const gm = o.geometry; tris += (gm.index ? gm.index.count : gm.attributes.position.count) / 3; }
    else if (/^engine_/.test(o.name) || /^hard_/.test(o.name)) { o.getWorldPosition(v); const s = (o.userData && o.userData.size) || o.scale.x;
      const p = { x: v.x * GLB_UNIT, y: v.y * GLB_UNIT, z: v.z * GLB_UNIT, r: ((o.userData && o.userData.size) || 1) * GLB_UNIT }; (o.name[0] === 'e' ? engines : hard).push(p); }
  });
  // bake to plain float geometry in game units at identity transforms: the damage shader works in object space
  // (vDmgP = position), so quantized/scaled meshopt nodes would put its noise at the wrong scale
  const out = new THREE.Group(); const S = new THREE.Matrix4().makeScale(GLB_UNIT, GLB_UNIT, GLB_UNIT);
  for (const m of meshes) {
    const g = new THREE.BufferGeometry();
    for (const k of ['position', 'normal', 'uv']) { const a = m.geometry.attributes[k]; if (!a) continue; const f = new Float32Array(a.count * a.itemSize);
      for (let i = 0; i < a.count; i++) for (let j = 0; j < a.itemSize; j++) f[i * a.itemSize + j] = a.getComponent(i, j); g.setAttribute(k, new THREE.BufferAttribute(f, a.itemSize)); }
    if (m.geometry.index) g.setIndex(m.geometry.index.clone());
    g.applyMatrix4(new THREE.Matrix4().multiplyMatrices(S, m.matrixWorld)); g.computeBoundingSphere();
    const mm = new THREE.Mesh(g, m.material); mm.name = m.name; out.add(mm);
  }
  return { scene: out, engines, hard, tris: Math.round(tris), meshes: meshes.length };
}
const SLOT = { H: 'H', P: 'P', D: 'D', A: 'A', C: 'W', W: 'Wn', G: 'G' };
// replace the procedural meshes of a built hull group with the glb; returns {engines, hard} in game units or null
export function applyGlb(id, group, M, engR) {
  if (!GLB.enabled) return null; const c = GLB.cache[id]; if (!c) return null;
  for (let i = group.children.length - 1; i >= 0; i--) group.remove(group.children[i]);
  const root = c.scene.clone(true); root.name = 'glb:' + id;
  root.traverse((o) => { if (!o.isMesh) return; const n = o.material && o.material.name; const key = SLOT[n] || 'H'; o.material = M[key] || M.H; o.castShadow = o.receiveShadow = false; });
  group.add(root);
  return { engines: c.engines.map((e) => ({ ...e, r: e.r || engR || 0.3 })), hard: [...c.hard].sort((a, b) => b.r - a.r).map((h) => ({ x: h.x, y: h.y, z: h.z, size: h.r * 1.4 })) };
}

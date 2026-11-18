// Blender test (branch blender-test): hand-built Blender hulls loaded as glTF and dropped into buildHull().
// Off by default. Turn on with ?hulls=glb (or localStorage 'sf-hulls' = 'glb'); ?hulls=proc turns it off again.
// Any load failure falls back to the procedural hull. Gameplay data (length, radius, keel hitbox chain, mass, slots)
// still comes from HULLS, so hitboxes are identical; the glb only replaces the visible meshes, engine-flame anchors
// and hardpoint positions. Materials are swapped by slot name for the game's own faction-tinted hull materials,
// so faction paint and the damage-state shader work unchanged.
import * as THREE from 'three';
import { GLTFLoader } from '../vendor/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from '../vendor/addons/libs/meshopt_decoder.module.js';
import { KTX2Loader } from '../vendor/addons/loaders/KTX2Loader.js';

export const GLB_IDS = ['scout', 'interceptor', 'strike', 'bomber', 'corvette', 'gunship', 'engineer', 'explorer', 'frigate', 'destroyer', 'icarrier', 'cruiser', 'battlecruiser', 'fleetcarrier', 'dreadnought'];
// GO-LIVE SWITCH: set to true to make the Blender hulls the default for everyone (?hulls=proc still opts out).
export const GLB_DEFAULT = true;
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
    loader.load(base + id + '.glb?v=bt4', (g) => { clearTimeout(t); try { GLB.cache[id] = prep(g.scene); } catch (e) { GLB.failed[id] = String(e); } res(); },
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
    for (const k of ['position', 'normal', 'uv', 'color', 'tangent']) { const a = m.geometry.attributes[k]; if (!a) continue; const n = k === 'color' ? 3 : a.itemSize; /* tangent: vec4 */ const f = new Float32Array(a.count * n);
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
export function applyGlb(id, group, M, engR, schemeKey, tex) {
  if (!GLB.enabled) return null; const c0 = GLB.cache[id]; const tc = tex && TEX.enabled ? TEX.cache[tex] && TEX.cache[tex][id] : null; const c = tc || c0; if (!c) return null;
  for (let i = group.children.length - 1; i >= 0; i--) if (group.children[i].name !== 'navLights') group.remove(group.children[i]);
  const root = c.scene.clone(true); root.name = (tc ? 'glbtex:' : 'glb:') + id;
  if (tc) { const tm = texMat(id, tc, M, tex); root.traverse((o) => { if (o.isMesh) { o.material = tm; o.castShadow = o.receiveShadow = false; } }); group.userData.tex = tex; }
  else root.traverse((o) => { if (!o.isMesh) return; const n = o.material && o.material.name; const key = SLOT[n] || 'H'; const base = M[key] || M.H; o.material = n === 'C' ? glass() : o.geometry.attributes.color ? vcMat(base) : base; o.castShadow = o.receiveShadow = false; });
  group.add(root);
  return { engines: c.engines.map((e) => ({ ...e, r: e.r || engR || 0.3 })), hard: [...c.hard].sort((a, b) => b.r - a.r).map((h) => ({ x: h.x, y: h.y, z: h.z, size: h.r * 1.4 })),
    bays: c.bays.map((b) => ({ x: b.x, y: b.y, z: b.z, size: b.r })), lo: c0 ? makeLo(id, c0, M, schemeKey || 'x') : null };
}

// ---------------------------------------------------------------- cinematic texture test (branch blender-tex)
// Baked Blender maps (high-poly normal / AO / albedo / ORM / emissive) on the same low-poly hull. Off by default:
// ?tex=1 (sticky in localStorage 'sf-tex', ?tex=0 off) and only together with ?hulls=glb.
// Gameplay uses the full set on High, the half-res set on Medium, today's untextured glb on Low; the shipyard preview and
// the Fleet Registry always ask for the full set. Textures are KTX2 (Basis ETC1S colour/ORM/emissive + UASTC normals,
// transcoded on the GPU's own compressed format) with a WebP fallback (?texfmt=webp).
export const TEX_IDS = ['scout', 'dreadnought'];
export const TEX_DEFAULT = false; // texture go-live switch (still needs GLB on)
const tq = P.get('tex');
try { if (tq === '1' || tq === '0') localStorage.setItem('sf-tex', tq); } catch (e) { /* */ }
let tst = null; try { tst = localStorage.getItem('sf-tex'); } catch (e) { /* */ }
export const TEX = { enabled: GLB.enabled && (tq ? tq === '1' : tst ? tst === '1' : TEX_DEFAULT), level: null, cache: { full: {}, half: {} }, failed: {}, loading: {}, fmt: P.get('texfmt') === 'webp' ? 'webp' : 'ktx', renderer: null, bytes: {} };
// Blender palette each texture set was painted in (H, P, A, D): the shader re-tints masked texels by target/ref
const PAL_REF = { scout: [0x9aa6b4, 0xe4eaf0, 0x2a66dc, 0x343b45], dreadnought: [0x4c525c, 0xa4aab3, 0xa3262c, 0x24282e] };
let KTX = null;
export function setTexRenderer(r) { TEX.renderer = r; }
export function preloadTex(level, ids = TEX_IDS, base = 'models/tex/') {
  if (!TEX.enabled || !level) return Promise.resolve(TEX);
  if (TEX.loading[level]) return TEX.loading[level];
  const loader = new GLTFLoader(); loader.setMeshoptDecoder(MeshoptDecoder);
  let fmt = TEX.fmt;
  if (fmt === 'ktx') {
    if (!TEX.renderer) fmt = 'webp';
    else { KTX ||= new KTX2Loader().setTranscoderPath(new URL('../vendor/addons/libs/basis/', import.meta.url).href).detectSupport(TEX.renderer); loader.setKTX2Loader(KTX); }
  }
  const tl = new THREE.TextureLoader(); const suf = level === 'half' ? '-half' : '';
  const get = (url) => fetch(url).then((r) => { if (!r.ok) throw new Error(url + ' ' + r.status); return r.arrayBuffer(); });
  const one = (id) => {
    const url = `${base}${id}${suf}.${fmt}.glb?v=tx1`;
    return Promise.all([get(url).then((buf) => { TEX.bytes[id + suf] = buf.byteLength; return new Promise((res, rej) => loader.parse(buf, base, res, rej)); }),
      new Promise((res, rej) => tl.load(`${base}${id}${suf}-mask.webp?v=tx1`, res, undefined, rej))])
      .then(([g, mask]) => {
        mask.flipY = false; mask.colorSpace = THREE.NoColorSpace; mask.anisotropy = 4;
        let src = null; g.scene.traverse((o) => { if (o.isMesh && !src) src = o.material; });
        const c = prep(g.scene); c.src = src; c.mask = mask;
        for (const t of [src.map, src.normalMap, src.emissiveMap, src.aoMap]) if (t) t.anisotropy = 4;
        TEX.cache[level][id] = c;
      })
      .catch((e) => { TEX.failed[id + suf] = String(e && e.message || e); console.warn('tex hull fallback', id, level, e); });
  };
  TEX.loading[level] = Promise.all(ids.map(one)).then(() => TEX);
  return TEX.loading[level];
}
// faction tint: mask RGBA = weights of the H, P, A, D paint slots; masked texels are multiplied by target/ref per
// channel, so panel tint, grime, seams and wear survive any paint scheme. Shared registry so the damage-shader patch
// (vfx.js) can chain it: material.clone() keeps userData.prePatchId but not onBeforeCompile.
const PRE = (globalThis.SF_PRE ||= {});
const TINT = `vec4 tMk = texture2D(tMask, vMapUv); float tSw = tMk.r + tMk.g + tMk.b + tMk.a;
if (tSw > 0.02) { vec3 tR = (tMk.r * tRef[0] + tMk.g * tRef[1] + tMk.b * tRef[2] + tMk.a * tRef[3]) / tSw; vec3 tT = (tMk.r * tTgt[0] + tMk.g * tTgt[1] + tMk.b * tTgt[2] + tMk.a * tTgt[3]) / tSw;
  diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * clamp(tT / max(tR, vec3(0.012)), 0.0, 6.0), clamp(tSw, 0.0, 1.0)); }`;
const TM = new Map();
export const TEX_LOOK = { emissive: 2.2, env: 1.35, tint: 1.12 };
function texMat(id, c, M, level) {
  const k = id + ':' + (M.sid || 'x') + ':' + level; if (TM.has(k)) return TM.get(k);
  const s = c.src; const v3 = (cc) => new THREE.Vector3(cc.r, cc.g, cc.b);
  const ref = (PAL_REF[id] || PAL_REF.scout).map((h) => new THREE.Color(h));
  const tgt = [M.H, M.P, M.A, M.D].map((m, i) => (m && m.color ? m.color.clone().multiplyScalar(TEX_LOOK.tint) : ref[i].clone()));
  const m = new THREE.MeshStandardMaterial({ name: 'glbTex', map: s.map, normalMap: s.normalMap, normalScale: s.normalScale ? s.normalScale.clone() : new THREE.Vector2(1, 1),
    aoMap: s.aoMap, aoMapIntensity: 1, roughnessMap: s.roughnessMap, metalnessMap: s.metalnessMap, roughness: 1, metalness: 1,
    emissiveMap: s.emissiveMap, emissive: 0xffffff, emissiveIntensity: TEX_LOOK.emissive, envMapIntensity: TEX_LOOK.env });
  const U = { tMask: { value: c.mask }, tRef: { value: ref.map(v3) }, tTgt: { value: tgt.map(v3) } };
  const pid = 'tint:' + k;
  PRE[pid] = (sh) => { Object.assign(sh.uniforms, U); sh.fragmentShader = 'uniform sampler2D tMask; uniform vec3 tRef[4]; uniform vec3 tTgt[4];\n' + sh.fragmentShader.replace('#include <map_fragment>', '#include <map_fragment>\n' + TINT); };
  m.userData.prePatchId = pid; m.onBeforeCompile = PRE[pid]; m.customProgramCacheKey = () => 'sftint1';
  TM.set(k, m); return m;
}
export function texLevelFor(q) { return !TEX.enabled ? null : q === 'high' ? 'full' : q === 'medium' ? 'half' : null; }

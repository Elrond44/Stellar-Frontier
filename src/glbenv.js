// v14: Blender environment assets (player station growth stages + asteroid set), loaded as glTF.
// Default on. ?env=proc (sticky, localStorage 'sf-env') or any load failure keeps the procedural station / rocks.
// The glbs only replace visible meshes: gameplay data (dock port, collision radii, station footprint, asteroid radii,
// HP, minerals) is unchanged. Station animation hooks are named nodes from the Blender builder (blender/src/station.py):
//   spin_ring (spins), crane_N (jib yaw), empties stack_* (smoke), chase_* (ring chase lights), dock_* (dock port),
//   navr_/navg_/navw_/navR_* (nav light sprites). Drones stay procedural (addStationDrones).
// Rocks (blender/src/asteroids.py) become plain non-indexed geometry with the attributes the rock shader expects
// (color + aGlow), so instancing, mineral glow colours, damage darkening and hit flashes all work unchanged.
import * as THREE from 'three';
import { GLTFLoader } from '../vendor/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from '../vendor/addons/libs/meshopt_decoder.module.js';
import { mergeGeometries } from '../vendor/addons/utils/BufferGeometryUtils.js';
import { materials, glowTexture, addStationDrones, buildStation, factionMats, makeTurret } from './models.js?v=14';
import { FACTIONS } from './galaxy.js?v=14';

export const ENV_DEFAULT = true;
export const ENV_VER = 'e2';
const Q = new URLSearchParams(typeof location !== 'undefined' ? location.search : '');
const q = Q.get('env');
try { if (q === 'glb' || q === 'proc') localStorage.setItem('sf-env', q); } catch (e) { /* private mode */ }
let stored = null; try { stored = localStorage.getItem('sf-env'); } catch (e) { /* */ }
export const ENV = { enabled: q ? q === 'glb' : stored ? stored === 'glb' : ENV_DEFAULT, stations: {}, rocks: null, inst: null, rigs: null, pickups: null, failed: {}, pending: {}, stats: {}, base: 'models/env/' };

let loader = null;
function load(name, timeoutMs) {
  loader ||= new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
  return new Promise((res) => {
    const t = setTimeout(() => { ENV.failed[name] = 'timeout'; res(null); }, timeoutMs);
    loader.load(ENV.base + name + '.glb?v=' + ENV_VER, (g) => { clearTimeout(t); res(g.scene); },
      undefined, (e) => { clearTimeout(t); ENV.failed[name] = String(e && e.message || e); console.warn('glb env fallback', name, e); res(null); });
  });
}
// station level n: resolves to the prepared template (or null on failure); calls are de-duplicated
export function loadStation(level, timeoutMs = 20000) {
  if (!ENV.enabled) return Promise.resolve(null);
  if (ENV.stations[level]) return Promise.resolve(ENV.stations[level]);
  if (ENV.failed['station_l' + level]) return Promise.resolve(null);
  return ENV.pending[level] ||= load('station_l' + level, timeoutMs).then((sc) => {
    delete ENV.pending[level];
    if (!sc) return null;
    try { return (ENV.stations[level] = prepStation(sc, level)); } catch (e) { ENV.failed['station_l' + level] = String(e); console.warn('glb station prep failed', e); return null; }
  });
}
export function loadRocks(timeoutMs = 20000) {
  if (!ENV.enabled) return Promise.resolve(null);
  if (ENV.rocks) return Promise.resolve(ENV.rocks);
  return ENV.pending.rocks ||= load('asteroids', timeoutMs).then((sc) => {
    if (!sc) return null;
    try { return (ENV.rocks = prepRocks(sc)); } catch (e) { ENV.failed.asteroids = String(e); console.warn('glb rocks prep failed', e); return null; }
  });
}
// startup: rocks + the saved station level (awaited, so the first frame already shows them), next level in background
export async function preloadEnv(level = 1) {
  if (!ENV.enabled) return ENV;
  const t0 = performance.now();
  await Promise.all([loadRocks(), loadStation(level), loadPickups()]);
  ENV.stats.loadMs = Math.round(performance.now() - t0);
  if (level < 6) loadStation(level + 1);
  loadInst(); loadRigs(); // v15: bases + mining rigs stream in (installations built before they arrive stay procedural)
  return ENV;
}

// ---------------- materials (game materials, swapped by Blender slot name) ----------------
let SM = null;
function stationMats() {
  if (SM) return SM;
  const M = materials();
  const vc = (m, o = {}) => { const c = m.clone(); c.vertexColors = true; Object.assign(c, o); c.name = 'env:' + (o.name || m.name || ''); return c; };
  SM = {
    H: vc(M.hull, { name: 'H', emissiveIntensity: 0.45 }),
    P: vc(M.hull, { name: 'P', color: new THREE.Color(0xb4bac2), emissiveIntensity: 0.0 }),
    D: vc(M.dark, { name: 'D' }),
    A: vc(M.orange, { name: 'A', color: new THREE.Color(0xe0a530), emissive: new THREE.Color(0x2a1600) }),
    C: M.glass.clone(), W: M.amber, G: M.glow, R: M.red, E: M.green,
    S: vc(M.solar, { name: 'S' }),
    V: new THREE.MeshStandardMaterial({ name: 'V', color: 0x3c8a34, roughness: 0.85, metalness: 0, emissive: 0x0b2a08, emissiveIntensity: 1, vertexColors: true }),
    N: new THREE.MeshStandardMaterial({ name: 'N', color: 0xe0a83a, roughness: 0.3, metalness: 1, vertexColors: true }),
  };
  SM.C.transparent = true; SM.C.opacity = 0.45; SM.C.depthWrite = false; SM.C.side = THREE.DoubleSide; SM.C.emissive = new THREE.Color(0x0e4a5a); SM.C.emissiveIntensity = 0.6;
  return SM;
}
const NAV = { navr: [0xff3030, 'blink', 1.3], navg: [0x30ff60, 'blink', 1.3], navw: [0xffffff, 'strobe', 1.1], navR: [0xff3030, 'blink', 0.8] };
const ROCK_TINT = { K: [0.08, 0.078, 0.088], X: [0.16, 0.16, 0.2], N: [0.55, 0.38, 0.1] };
const ROCK_GLOW = { K: 0, X: 1, N: 0.3 };

// bake a mesh into plain float geometry (positions in the target frame), optional rock attributes
function bake(mesh, toFrame, rock) {
  const src = mesh.geometry; const g = new THREE.BufferGeometry(); const n = src.attributes.position.count;
  for (const k of ['position', 'normal', 'uv', 'color']) {
    const a = src.attributes[k]; if (!a || (rock && (k === 'normal' || k === 'uv'))) continue; const w = k === 'color' ? 3 : a.itemSize; const f = new Float32Array(n * w);
    for (let i = 0; i < n; i++) for (let j = 0; j < w; j++) f[i * w + j] = a.getComponent(i, j);
    g.setAttribute(k, new THREE.BufferAttribute(f, w));
  }
  if (src.index) g.setIndex(src.index.clone());
  g.applyMatrix4(new THREE.Matrix4().multiplyMatrices(toFrame, mesh.matrixWorld));
  return g;
}
function rockGeo(meshes, toFrame) {
  const parts = [];
  for (const m of meshes) {
    const slot = (m.material && m.material.name) || 'K'; let g = bake(m, toFrame, true); if (g.index) g = g.toNonIndexed();
    const n = g.attributes.position.count; const col = new Float32Array(n * 3), glow = new Float32Array(n);
    const t = ROCK_TINT[slot] || ROCK_TINT.K, gl = ROCK_GLOW[slot] ?? 0, V = g.attributes.color;
    for (let i = 0; i < n; i++) { const ao = V ? V.getX(i) : 1; col[i * 3] = t[0] * ao; col[i * 3 + 1] = t[1] * ao; col[i * 3 + 2] = t[2] * ao; glow[i] = gl; }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3)); g.setAttribute('aGlow', new THREE.BufferAttribute(glow, 1)); parts.push(g);
  }
  const out = parts.length > 1 ? mergeGeometries(parts, false) : parts[0];
  out.computeBoundingSphere(); out.userData.shared = true; return out;
}
const meshesUnder = (o) => { const L = []; o.traverse((c) => { if (c.isMesh) L.push(c); }); return L; };
function partOf(o, parts) { for (let p = o; p; p = p.parent) if (parts.has(p)) return p; return null; }

function prepStation(scene, level) {
  scene.updateMatrixWorld(true);
  const M = stationMats(); const root = new THREE.Group(); root.name = 'glbStation';
  const mainNode = scene.getObjectByName('station_l' + level) || scene.children[0];
  const parts = new Map(); parts.set(mainNode, null);
  scene.traverse((o) => { if (o !== mainNode && /^(spin_ring|crane_\d+)$/.test(o.name)) parts.set(o, null); });
  const v = new THREE.Vector3(); const empties = []; let tris = 0;
  // one group per animated part, positioned at the node's world position (Blender builds them unrotated)
  for (const node of parts.keys()) { const g = new THREE.Group(); g.name = node === mainNode ? 'main' : node.name; node.getWorldPosition(g.position); parts.set(node, g); }
  const rockMeshes = [];
  scene.traverse((o) => {
    const owner = partOf(o.isMesh ? o.parent : o, parts) || mainNode; const g = parts.get(owner);
    if (o.isMesh) {
      const slot = (o.material && o.material.name || 'H').replace(/\.\d+$/, '');
      if (slot === 'K' || slot === 'X') { rockMeshes.push(o); return; }
      const to = new THREE.Matrix4().makeTranslation(-g.position.x, -g.position.y, -g.position.z);
      const geo = bake(o, to, false); geo.computeBoundingSphere(); geo.userData.shared = true;
      tris += (geo.index ? geo.index.count : geo.attributes.position.count) / 3;
      const mm = new THREE.Mesh(geo, M[slot] || M.H); mm.name = 'env-' + slot; g.add(mm);
    } else if (/^(stack|chase|dock|navr|navg|navw|navR)_/.test(o.name)) {
      o.getWorldPosition(v); empties.push({ kind: o.name.split('_')[0], p: v.clone(), part: g, size: (o.userData && o.userData.size) || 1 });
    }
  });
  const mainG = parts.get(mainNode); root.add(mainG);
  for (const [node, g] of parts) if (node !== mainNode) root.add(g);
  return { root, rockMeshes, empties, tris: Math.round(tris), level, mainG };
}

// a fresh station instance (shares geometry/materials with the cached template)
export function buildStationGlb(level, rockMat) {
  const T = ENV.enabled && ENV.stations[level]; if (!T) return null;
  const anim = { spin: [], blink: [], drones: [], cranes: [], stacks: [], chase: [] };
  const root = new THREE.Group(); root.name = 'station';
  const map = new Map();
  for (const g of T.root.children) { const c = g.clone(true); map.set(g, c); root.add(c); }
  const main = map.get(T.mainG);
  if (!T.rockGeo) T.rockGeo = rockGeo(T.rockMeshes, new THREE.Matrix4());
  const rock = new THREE.Mesh(T.rockGeo, rockMat); rock.name = 'env-rock'; main.add(rock);
  const lg = new THREE.Group(); lg.name = 'navLights'; const glow = glowTexture();
  const rng = mulberry32(4242);
  for (const e of T.empties) {
    const part = map.get(e.part) || main; const lp = e.p.clone().sub(e.part.position);
    if (e.kind === 'stack') anim.stacks.push(e.p.clone());
    else if (e.kind === 'dock') root.userData.dockPort = e.p.clone();
    else if (e.kind === 'chase') {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glow, color: 0xff3a30, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
      s.material.userData.own = true; s.position.copy(lp); s.scale.setScalar(1.1); part.add(s); anim.chase.push({ obj: s, i: anim.chase.length });
    } else if (NAV[e.kind]) {
      const [col, mode, size] = NAV[e.kind];
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: glow, color: col, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
      sp.material.userData.own = true; sp.position.copy(e.p); sp.scale.setScalar(size * Math.max(1, e.size)); sp.userData = { mode, phase: (e.p.x * 1.7 + e.p.z * 0.3) % 6 }; lg.add(sp);
    }
  }
  main.add(lg);
  for (const c of root.children) {
    if (c.name === 'spin_ring') anim.spin.push({ obj: c, speed: 0.15 });
    else if (/^crane_/.test(c.name)) anim.cranes.push({ obj: c, base: rng() * 6, speed: 0.2 + rng() * 0.2 });
  }
  addStationDrones(root, level, anim, rng);
  root.userData.anim = anim; root.userData.main = main; root.userData.glb = true;
  if (!root.userData.dockPort) root.userData.dockPort = new THREE.Vector3(0, 0, 7.9);
  return root;
}
function mulberry32(a) { return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
// glb when cached, else procedural (and start loading the glb so the caller can rebuild later)
export function buildStationAny(level, rockMat, onReady) {
  const g = buildStationGlb(level, rockMat); if (g) return g;
  if (ENV.enabled && !ENV.failed['station_l' + level]) loadStation(level).then((t) => { if (t && onReady) onReady(level); });
  return buildStation(level, rockMat);
}

// ---------------- asteroids ----------------
export const ROCK_BASE = ['lumpy_a', 'lumpy_b', 'porous', 'cavern', 'molten', 'veined', 'nugget'];
export const ROCK_RICH = ['crystal_a', 'crystal_b', 'crystal_c', 'crystal_d'];
// rock shapes per mineral (indices into ROCK_BASE): molten = ferrite / crimsonite, green veins = viridium, cavern = voidstone
export const ROCK_BY_TYPE = { ferrite: [0, 1, 4, 6, 4, 2], stellarite: [0, 1, 2, 0, 1], viridium: [5, 5, 2, 1], crimsonite: [4, 6, 0, 4], voidstone: [3, 3, 2, 0] };
function prepRocks(scene) {
  scene.updateMatrixWorld(true); const out = { hi: [], lo: [], rhi: [], rlo: [], tris: 0 };
  const byName = {}; scene.traverse((o) => { if (/_(hi|lo)$/.test(o.name) && !byName[o.name]) byName[o.name] = o; });
  const one = (name) => { const node = byName[name]; if (!node) throw new Error('missing rock ' + name); const inv = new THREE.Matrix4().copy(node.matrixWorld).invert();
    const g = rockGeo(meshesUnder(node), inv); out.tris += g.attributes.position.count / 3; return g; };
  for (const v of ROCK_BASE) { out.hi.push(one(v + '_hi')); out.lo.push(one(v + '_lo')); }
  for (const v of ROCK_RICH) { out.rhi.push(one(v + '_hi')); out.rlo.push(one(v + '_lo')); }
  out.tris = Math.round(out.tris); return out;
}

// =====================================================================================================================
// v15 (batch 2): pirate / faction installations, mining-rig asteroids, ore pickups (blender/src/pirate.py, rigs.py, gems.py)
// Installations keep every gameplay value (radius, hardpoints, HP, live turrets, shield dome, 'spin' hooks); the glb only
// replaces the visible meshes. Materials are the game's pirate set, faction-tinted, without texture maps (no UVs) and with
// baked AO vertex colours; the relay beacon and set-dressing rigs use the player palette.
const packLoader = (name, key, prep) => (timeoutMs = 20000) => {
  if (!ENV.enabled) return Promise.resolve(null);
  if (ENV[key]) return Promise.resolve(ENV[key]);
  if (ENV.failed[name]) return Promise.resolve(null);
  return ENV.pending[key] ||= load(name, timeoutMs).then((sc) => {
    if (!sc) return null;
    try { ENV[key] = prep(sc); ENV.stats[key + 'Ms'] = Math.round(performance.now()); return ENV[key]; } catch (e) { ENV.failed[name] = String(e); console.warn('glb ' + name + ' prep failed', e); return null; }
  });
};
// flat geometry (non-indexed, face normals) with slot vertex colours, positions relative to `toFrame`
function flatBake(mesh, toFrame) {
  let g = bake(mesh, toFrame, false); if (g.index) g = g.toNonIndexed();
  g.deleteAttribute('normal'); g.deleteAttribute('uv'); g.computeVertexNormals(); g.computeBoundingSphere(); g.userData.shared = true; return g;
}
const slotOf = (o) => ((o.material && o.material.name) || 'H').replace(/\.\d+$/, '');
// a pack scene -> { name: { parts: [{ name, pos, meshes: [{ geo, slot }] }], lights: [{ kind, p, size }], tris } }
function prepPack(scene, prefix) {
  scene.updateMatrixWorld(true); const out = {};
  for (const root of scene.children) {
    if (!root.name.startsWith(prefix)) continue;
    const parts = new Map(); parts.set(root, { name: 'main', pos: new THREE.Vector3(), meshes: [] });
    root.traverse((o) => { if (o !== root && /^spin_[a-z]+$/.test(o.name) && !o.isMesh) { const p = new THREE.Vector3(); o.getWorldPosition(p); p.sub(root.getWorldPosition(new THREE.Vector3())); parts.set(o, { name: 'spin', pos: p, meshes: [] }); } });
    const inv = new THREE.Matrix4().copy(root.matrixWorld).invert(); const lights = []; let tris = 0; const v = new THREE.Vector3();
    root.traverse((o) => {
      let owner = root; for (let q = o.parent; q; q = q.parent) if (parts.has(q)) { owner = q; break; } // nearest pivot (spin_*) or the root
      const part = parts.get(owner);
      if (o.isMesh) {
        const to = new THREE.Matrix4().makeTranslation(-part.pos.x, -part.pos.y, -part.pos.z).multiply(inv);
        const geo = flatBake(o, to); tris += geo.attributes.position.count / 3; part.meshes.push({ geo, slot: slotOf(o) });
      } else if (/^(navr|navg|navw|navR)_/.test(o.name)) { o.getWorldPosition(v); v.applyMatrix4(inv); lights.push({ kind: o.name.split('_')[0], p: v.clone(), size: (o.userData && o.userData.size) || 1 }); }
    });
    out[root.name.slice(prefix.length)] = { parts: [...parts.values()], lights, tris: Math.round(tris) };
  }
  return out;
}
export const loadInst = packLoader('installations', 'inst', (sc) => prepPack(sc, 'inst_'));
export const loadRigs = packLoader('rigs', 'rigs', (sc) => prepPack(sc, 'rig_'));

// ---------------- materials: faction-tinted pirate set (no maps), or the player palette ----------------
const IM = {};
function plain(m, o = {}) { const c = m.clone(); for (const k of ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'emissiveMap', 'aoMap']) if (k in c) c[k] = null; if (c.isMeshStandardMaterial) c.vertexColors = true; Object.assign(c, o); return c; }
export function instMats(fac) {
  const key = fac || '_'; if (IM[key]) return IM[key];
  const M = materials(); const F = FACTIONS[fac]; const FM = F ? factionMats(fac, F.rgb, F.hull) : null;
  const rock = new THREE.MeshStandardMaterial({ color: 0x55525a, roughness: 0.92, metalness: 0.05, vertexColors: true });
  const base = {
    H: plain(FM ? FM.hull : M.pirate, { emissive: new THREE.Color(0), emissiveIntensity: 0 }),
    D: plain(M.pirateDark, { color: new THREE.Color(0x3a3036) }),
    P: plain(M.pirateBone, { color: new THREE.Color(0x8c8478) }),
    A: plain(FM ? FM.accent : M.pirateAccent),
    R: FM ? FM.red : M.red, W: M.amber, G: M.glow, E: M.green, N: plain(M.orange, { color: new THREE.Color(0xe0a83a), metalness: 1, roughness: 0.3 }),
    C: M.glass, S: plain(M.solar), V: new THREE.MeshStandardMaterial({ color: 0x3c8a34, roughness: 0.85, emissive: 0x0b2a08, vertexColors: true }),
    K: rock, X: M.glow,
  };
  if (fac === 'friendly') { // player palette: gunmetal, light plate, gold trim
    base.H = plain(M.hull, { emissive: new THREE.Color(0), emissiveIntensity: 0, color: new THREE.Color(0x8a919b) }); base.D = plain(M.dark); base.P = plain(M.hull, { emissive: new THREE.Color(0), color: new THREE.Color(0xb4bac2) });
    base.A = plain(M.orange, { color: new THREE.Color(0xe0a530), emissive: new THREE.Color(0x2a1600) }); base.R = M.red;
  }
  for (const k in base) if (base[k].isMeshStandardMaterial && !base[k].name) base[k].name = 'inst:' + k + ':' + key;
  return (IM[key] = base);
}
const INST_LIGHT = { navr: [0xff3030, 1.3], navg: [0x30ff60, 1.3], navw: [0xffffff, 1.1], navR: [0xff3030, 0.8] };
function instance(T, mats, lightScale = 1) {
  const g = new THREE.Group(); const glow = glowTexture();
  for (const part of T.parts) {
    const pg = part.name === 'main' ? g : new THREE.Group(); if (pg !== g) { pg.name = part.name; pg.position.copy(part.pos); g.add(pg); }
    for (const m of part.meshes) { const mesh = new THREE.Mesh(m.geo, mats[m.slot] || mats.H); mesh.name = 'env-' + m.slot; pg.add(mesh); }
  }
  for (const L of T.lights) {
    const [col, size] = INST_LIGHT[L.kind] || INST_LIGHT.navw; const key = 'sp' + col;
    const mat = (SPRITE_MATS[key] ||= new THREE.SpriteMaterial({ map: glow, color: col, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
    const sp = new THREE.Sprite(mat); sp.position.copy(L.p); sp.scale.setScalar(size * Math.max(1, L.size) * lightScale); g.add(sp);
  }
  return g;
}
const SPRITE_MATS = {};
// gameplay values of the procedural builders (models.js buildInstallation / buildInstallationV5), unchanged
const INST_SPEC = { comm: [4, 2], yard: [6, 2], res: [4.6, 2], def: [5, 2], hq: [9, 2], relay: [4, 2], core: [5.6, 1], gen: [2.2, 1], reactor: [2.4, 1], hangar: [2.8, 1], turret: [1.9, 1] };
export function instReady(kind) { return !!(ENV.enabled && (kind === 'res' ? ENV.rigs && ENV.rigs.pit : ENV.inst && ENV.inst[kind])); }
// glb installation part (same return shape as the procedural builders), or null -> caller falls back
export function buildInstGlb(kind, fac) {
  if (!instReady(kind)) return null;
  const T = kind === 'res' ? ENV.rigs.pit : ENV.inst[kind]; const friendly = kind === 'relay';
  const g = instance(T, instMats(friendly ? 'friendly' : fac || null)); g.name = 'inst-glb'; g.userData.glb = true;
  if (kind === 'def') { const tu = makeTurret('cannon', 3.4, 'pirate'); tu.position.y = 1.9; tu.name = 'eturret'; g.add(tu); }
  if (kind === 'turret') { const tu = makeTurret('cannon', 1.7, 'pirate'); tu.position.y = 0.7; tu.name = 'eturret'; g.add(tu); }
  const [radius, hy] = INST_SPEC[kind] || [3, 1];
  return { group: g, hardpoints: [{ x: 0, y: hy, z: 0 }], engines: [], radius, glb: true };
}

// ---------------- depth set dressing: mining-rig asteroids far below the play plane ----------------
export const RIG_CELL = 560;
const RIG_KINDS = ['pit', 'drill', 'tunnel', 'colony'];
function hash2(i, j, s) { let h = (i * 374761393 + j * 668265263 + s * 2147483647) | 0; h = (h ^ (h >>> 13)) * 1274126177 | 0; return (h ^ (h >>> 16)) >>> 0; }
export function rigAt(ci, cj) {
  const r = mulberry32(hash2(ci, cj, 77)); if (r() > 0.42) return null;
  return { id: ci + ':' + cj, kind: RIG_KINDS[Math.floor(r() * RIG_KINDS.length)], x: (ci + 0.15 + r() * 0.7) * RIG_CELL, z: (cj + 0.15 + r() * 0.7) * RIG_CELL, y: -(62 + r() * 30), s: 5.5 + r() * 2.5, yaw: r() * 6.28, spin: (r() - 0.5) * 0.02, tilt: (r() - 0.5) * 0.3 };
}
export class DepthRigs {
  constructor(scene) { this.scene = scene; this.pool = []; this.max = 3; this.active = []; }
  setQuality(q) { this.max = q === 'low' ? 0 : q === 'medium' ? 2 : 3; }
  slot(kind) { let s = this.pool.find((x) => x.kind === kind && !x.used); if (!s && ENV.rigs && ENV.rigs[kind]) { const g = instance(ENV.rigs[kind], instMats('friendly'), 1.6); g.name = 'rig-' + kind; g.visible = false; this.scene.add(g); s = { kind, g, used: false, id: null }; this.pool.push(s); } return s; }
  update(cx, cz, t) {
    if (!ENV.rigs || !ENV.enabled) return;
    const ci = Math.floor(cx / RIG_CELL), cj = Math.floor(cz / RIG_CELL); const L = [];
    for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) { const R = rigAt(ci + i, cj + j); if (R) { R.d = Math.hypot(R.x - cx, R.z - cz); if (R.d < RIG_CELL * 1.1) L.push(R); } }
    L.sort((a, b) => a.d - b.d); const want = L.slice(0, this.max);
    for (const s of this.pool) s.used = false;
    for (const R of want) { const s = this.pool.find((x) => x.id === R.id) || null; if (s) s.used = true; }
    for (const R of want) {
      let s = this.pool.find((x) => x.id === R.id && x.used); if (!s) { s = this.slot(R.kind); if (!s) continue; s.used = true; s.id = R.id; }
      s.g.visible = true; s.g.position.set(R.x, R.y, R.z); s.g.scale.setScalar(R.s); s.g.rotation.set(R.tilt, R.yaw + t * R.spin, 0);
    }
    for (const s of this.pool) if (!s.used) { s.g.visible = false; s.id = null; }
    this.active = want;
  }
}

// ---------------- ore pickups: per-mineral gem chips ----------------
export const PICKUP_BY_TYPE = { ferrite: 'cube', stellarite: 'hex', viridium: 'emerald', crimsonite: 'hex', voidstone: 'amethyst' };
export const loadPickups = packLoader('pickups', 'pickups', (sc) => {
  sc.updateMatrixWorld(true); const out = {};
  for (const o of sc.children) {
    if (!o.name.startsWith('ore_')) continue; const parts = [];
    const inv = new THREE.Matrix4().copy(o.matrixWorld).invert();
    o.traverse((m) => { if (!m.isMesh) return; const g = flatBake(m, inv); const n = g.attributes.position.count; const slot = slotOf(m); const c = new Float32Array(n * 3); const v = slot === 'K' ? 0.16 : 1.0; const V = g.attributes.color;
      for (let i = 0; i < n; i++) { const ao = slot === 'K' && V ? V.getX(i) : 1; c[i * 3] = c[i * 3 + 1] = c[i * 3 + 2] = v * ao; } g.setAttribute('color', new THREE.BufferAttribute(c, 3)); parts.push(g); });
    const geo = parts.length > 1 ? mergeGeometries(parts, false) : parts[0]; geo.computeBoundingSphere(); geo.userData.shared = true; out[o.name.slice(4)] = geo;
  }
  return out;
});
// rich (crystal) rock shape per mineral: 0 hex (blue), 1 cubic (gold), 2 amethyst (purple), 3 emerald (green)
export const RICH_BY_TYPE = { stellarite: [0], ferrite: [1], viridium: [3], crimsonite: [0, 2], voidstone: [2] };

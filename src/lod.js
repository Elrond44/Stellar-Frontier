// v8 level-of-detail for true-scale hulls.
//   near : full model (hull + 'detail' greebles + turrets + lights)
//   mid  : the 'detail' group is hidden once the hull is small on screen
//   far  : the whole model is hidden and the hull is drawn as one instance of a merged, vertex-coloured
//          low-poly mesh (one InstancedMesh per hull + paint scheme => a whole wing of distant fighters is one draw call)
import * as THREE from 'three';

const FAR = 0.035, MID = 0.1; // hull length / camera distance
export class HullLOD {
  constructor(scene) {
    this.scene = scene; this.sets = new Map(); this.m = new THREE.Matrix4(); this.stats = { near: 0, mid: 0, far: 0, draws: 0 };
    this.mat = new THREE.MeshLambertMaterial({ vertexColors: true }); this.enabled = true;
  }
  set(key, geo) {
    let S = this.sets.get(key);
    if (!S) { const cap = 48; const mesh = new THREE.InstancedMesh(geo, this.mat, cap); mesh.frustumCulled = false; mesh.count = 0; mesh.name = 'lod:' + key; this.scene.add(mesh); S = { mesh, n: 0, cap, geo }; this.sets.set(key, S); }
    return S;
  }
  grow(S) { const cap = S.cap * 2; const mesh = new THREE.InstancedMesh(S.geo, this.mat, cap); mesh.frustumCulled = false; mesh.name = S.mesh.name; for (let i = 0; i < S.n; i++) { S.mesh.getMatrixAt(i, this.m); mesh.setMatrixAt(i, this.m); } this.scene.remove(S.mesh); S.mesh.dispose(); this.scene.add(mesh); S.mesh = mesh; S.cap = cap; }
  // items: { g: Object3D, lo: BufferGeometry|null, key: string, len: number, hidden?: bool (cloaked etc.) }
  update(camera, items) {
    for (const S of this.sets.values()) S.n = 0;
    const st = this.stats; st.near = st.mid = st.far = 0; const cp = camera.position;
    for (const it of items) {
      const g = it.g; if (!g) continue; const ud = g.userData;
      if (ud.lodDetail === undefined) ud.lodDetail = g.getObjectByName('detail') || null;
      const d = Math.max(1, cp.distanceTo(g.position)); const k = (it.len || 4) * (g.scale.x || 1) / d;
      const far = this.enabled && it.lo && k < FAR && !it.hidden; const mid = this.enabled && k < MID;
      if (far !== !!ud.lodFar) { ud.lodFar = far; for (const c of g.children) c.visible = !far; }
      if (ud.lodDetail) ud.lodDetail.visible = !mid;
      if (far) { st.far++; const S = this.set(it.key, it.lo); if (S.n >= S.cap) this.grow(S); this.m.compose(g.position, g.quaternion, g.scale); S.mesh.setMatrixAt(S.n++, this.m); }
      else if (mid) st.mid++; else st.near++;
    }
    let draws = 0; for (const S of this.sets.values()) { S.mesh.count = S.n; if (S.n) { S.mesh.instanceMatrix.needsUpdate = true; draws++; } }
    st.draws = draws;
  }
  release(g) { if (g && g.userData.lodFar) { g.userData.lodFar = false; for (const c of g.children) c.visible = true; } }
}

"""Stellar Frontier environment kit (v14): stations, asteroids, later planets.
Extends kit.Ship (bmesh builder) with round primitives, rocks and crystals, and a wider material slot set.
Conventions: Blender Z up, game +Z (the station's dock side) = Blender -Y. Station builders work in the game's station
local units (the game scales the station root x2). Rocks are unit radius (the game scales instances by asteroid radius).
Slots (glTF material names, swapped for game materials in src/glbenv.js):
  H gunmetal hull, P light plate, D dark metal, A gold industrial paint, C glass, W amber windows (emissive),
  G teal reactor/crystal glow (emissive), R red lights (emissive), S solar panel, V biosphere greenery, K rock,
  X rock glow (crystals/veins/cracks -> aGlow=1), N nugget metal, E green beacon (emissive)."""
import bpy, bmesh, math, random, os, sys, subprocess
from mathutils import Vector, Matrix, noise
sys.path.insert(0, os.path.dirname(__file__))
from kit import Ship, hexrgb, reset, export_glb

SLOTS = ['H', 'P', 'D', 'A', 'C', 'W', 'G', 'R', 'S', 'V', 'K', 'X', 'N', 'E']
H, P, D, A, C, W, G, R, S, V, K, X, N, E = range(len(SLOTS))
EMISSIVE = {W, G, R, X, E}
DEBUG = False
OUT = os.path.join(os.path.dirname(__file__), '..', 'out', 'env')
SHOTS = os.path.join(os.path.dirname(__file__), '..', 'shots', 'env')

def env_materials(glow=(0.4, 2.2, 3.4), xglow=(0.5, 1.9, 3.6)):
    spec = {  # base, metal, rough, emission, strength
        'H': (hexrgb(0x8a919b), 0.45, 0.42, None, 0), 'P': (hexrgb(0xa9afb7), 0.4, 0.4, None, 0),
        'D': (hexrgb(0x4a505a), 0.55, 0.5, None, 0), 'A': (hexrgb(0xd19a2a), 0.55, 0.42, None, 0),
        'C': ((0.03, 0.09, 0.14), 0.9, 0.05, (0.05, 0.25, 0.35), 1), 'W': ((1, 0.7, 0.35), 0, 0.5, (3.2, 1.6, 0.4), 1.2),
        'G': ((1, 1, 1), 0, 0.5, glow, 4), 'R': ((1, 0.2, 0.2), 0, 0.5, (3.5, 0.35, 0.3), 2.5),
        'S': (hexrgb(0x1d3f8f), 0.8, 0.22, (0.02, 0.08, 0.25), 1), 'V': (hexrgb(0x3f8f3a), 0.0, 0.8, (0.05, 0.25, 0.05), 1),
        'K': (hexrgb(0x55545c), 0.1, 0.8, None, 0), 'X': ((1, 1, 1), 0, 0.3, xglow, 0.55),
        'N': (hexrgb(0xe0a83a), 1.0, 0.3, (0.3, 0.18, 0.02), 1), 'E': ((0.4, 1, 0.5), 0, 0.5, (0.5, 3.0, 1.0), 3),
    }
    mats = []
    for k in SLOTS:
        base, met, rough, em, es = spec[k]
        m = bpy.data.materials.get(k) or bpy.data.materials.new(k)
        m.use_nodes = True; nt = m.node_tree; b = nt.nodes.get('Principled BSDF')
        b.inputs['Base Color'].default_value = (*base, 1); b.inputs['Metallic'].default_value = met; b.inputs['Roughness'].default_value = rough
        if k in ('H', 'P', 'D', 'A', 'K', 'S', 'N'):
            ca = nt.nodes.new('ShaderNodeVertexColor'); ca.layer_name = 'Col'
            mx_ = nt.nodes.new('ShaderNodeMix'); mx_.data_type = 'RGBA'; mx_.blend_type = 'MULTIPLY'; mx_.inputs['Factor'].default_value = 1.0
            mx_.inputs['A'].default_value = (*base, 1); nt.links.new(ca.outputs['Color'], mx_.inputs['B']); nt.links.new(mx_.outputs['Result'], b.inputs['Base Color'])
        if em:
            mx = max(em); b.inputs['Emission Color'].default_value = (em[0] / mx, em[1] / mx, em[2] / mx, 1); b.inputs['Emission Strength'].default_value = es * mx
        mats.append(m)
    return mats

def frame(d):
    d = Vector(d).normalized(); a = Vector((0, 0, 1)) if abs(d.z) < 0.9 else Vector((1, 0, 0))
    u = d.cross(a).normalized(); v = d.cross(u).normalized(); return d, u, v

class Env(Ship):
    """station/rock builder; L = characteristic size (AO ray length, weld tolerance)."""
    def __init__(self, name, size, seed=1):
        super().__init__(name, size, seed)
    def ring_pts(self, c, r, n, d, u, v, a0=0.0):
        return [tuple(Vector(c) + (u * math.cos(a0 + 2 * math.pi * i / n) + v * math.sin(a0 + 2 * math.pi * i / n)) * r) for i in range(n)]
    def tube(self, p0, p1, r0, mat, seg=10, r1=None, cap=True, a0=0.0):
        """cylinder/cone between two points."""
        p0, p1 = Vector(p0), Vector(p1); d, u, v = frame(p1 - p0); r1 = r0 if r1 is None else r1
        self._faces([self.ring_pts(p0, max(r0, 1e-4), seg, d, u, v, a0), self.ring_pts(p1, max(r1, 1e-4), seg, d, u, v, a0)], mat, cap, cap)
    def lathe(self, c, prof, mat, seg=16, axis=(0, 0, 1), cap0=True, cap1=True):
        """surface of revolution: prof = [(r, h)...] along axis from c."""
        d, u, v = frame(axis); c = Vector(c)
        self._faces([self.ring_pts(c + d * h, max(r, 1e-4), seg, d, u, v) for r, h in prof], mat, cap0, cap1)
    def beam(self, p0, p1, t, mat):
        p0, p1 = Vector(p0), Vector(p1); d, u, v = frame(p1 - p0)
        cs = [(u + v) * t / 2, (u - v) * t / 2, (-u - v) * t / 2, (-u + v) * t / 2]
        self._faces([[tuple(p0 + q) for q in cs], [tuple(p1 + q) for q in cs]], mat)
    def truss(self, p0, p1, w, t, mat, bays=None):
        """square lattice girder: 4 longerons + zigzag braces."""
        p0, p1 = Vector(p0), Vector(p1); d, u, v = frame(p1 - p0); L = (p1 - p0).length
        bays = bays or max(2, int(L / (w * 1.8))); cs = [(u + v) * w / 2, (u - v) * w / 2, (-u - v) * w / 2, (-u + v) * w / 2]
        for q in cs: self.beam(p0 + q, p1 + q, t, mat)
        for i in range(bays):
            a, b = p0 + d * L * i / bays, p0 + d * L * (i + 1) / bays
            for k in range(4):
                q0, q1 = cs[k], cs[(k + 1) % 4]
                self.beam(a + q0, b + q1, t * 0.7, mat) if (i + k) % 2 == 0 else self.beam(b + q0, a + q1, t * 0.7, mat)
        for k in range(4): self.beam(p1 + cs[k], p1 + cs[(k + 1) % 4], t * 0.7, mat)
    def torus(self, c, Rr, r, mat, segU=48, segV=8, M=None, z_scale=1.0):
        bm = self.bm; c = Vector(c); M = M or Matrix.Identity(4); rings = []
        for i in range(segU):
            a = 2 * math.pi * i / segU; ca, sa = math.cos(a), math.sin(a); rr = []
            for j in range(segV):
                b = 2 * math.pi * j / segV; rad = Rr + r * math.cos(b)
                rr.append(bm.verts.new(M @ Vector((c.x + ca * rad, c.y + sa * rad, c.z + r * math.sin(b) * z_scale))))
            rings.append(rr)
        for i in range(segU):
            a, b_ = rings[i], rings[(i + 1) % segU]
            for j in range(segV):
                k = (j + 1) % segV
                f = bm.faces.new((a[j], b_[j], b_[k], a[k])); f.material_index = mat
    def sphere(self, c, rad, mat, seg=16, rings=8, h0=-1.0, h1=1.0, M=None, cap=True):
        """(partial) UV sphere; rad scalar or (rx, ry, rz); h0..h1 = z range in [-1,1] (0..1 = upper dome)."""
        rx, ry, rz = (rad, rad, rad) if not isinstance(rad, (tuple, list)) else rad; c = Vector(c); RR = []
        for i in range(rings + 1):
            z = h0 + (h1 - h0) * i / rings; th = math.asin(max(-1, min(1, z))); rr = math.cos(th)
            RR.append([(c.x + math.cos(2 * math.pi * k / seg) * rr * rx + 0, c.y + math.sin(2 * math.pi * k / seg) * rr * ry, c.z + z * rz) for k in range(seg)])
        if M: RR = [[tuple(M @ Vector(p)) for p in r_] for r_ in RR]
        self._faces(RR, mat, cap and h0 > -0.999, cap and h1 < 0.999)
    def dish(self, c, r, depth, aim, mat=P, seg=18, feed=True):
        """parabolic dish opening toward aim, with feed horn."""
        d, u, v = frame(aim); c = Vector(c); prof = []
        for i in range(6):
            t = i / 5; prof.append(self.ring_pts(c + d * (depth * t * t), max(r * t, 0.02 * r), seg, d, u, v))
        self._faces(prof, mat, False, False)
        back = [self.ring_pts(c + d * (depth * t * t - r * 0.04), max(r * t, 0.02 * r), seg, d, u, v) for t in (1.0, 0.5, 0.05)]
        self._faces([prof[-1]] + back, D, False, True)
        if feed:
            for k in range(3):
                a = 2 * math.pi * k / 3; q = c + d * depth + (u * math.cos(a) + v * math.sin(a)) * r * 0.9
                self.beam(q, c + d * r * 0.9, r * 0.03, D)
            self.tube(c + d * r * 0.85, c + d * r * 1.0, r * 0.06, D, 8); self.empty('navw', tuple(c + d * r * 1.02), r * 0.3)
    def crystal(self, base, d, length, rad, mat=X, seg=6):
        """hex crystal: prism with a pointed tip, slight random twist."""
        base = Vector(base); d, u, v = frame(d); a0 = self.rng.uniform(0, 1)
        self._faces([self.ring_pts(base - d * rad * 0.6, rad * 0.8, seg, d, u, v, a0), self.ring_pts(base + d * length * 0.72, rad, seg, d, u, v, a0),
                     self.ring_pts(base + d * length, rad * 0.04, seg, d, u, v, a0)], mat, True, True)
    def cluster(self, base, d, n, size, mat=X, spread=0.55, fat=1.0):
        d0 = Vector(d).normalized(); rr = self.rng
        for i in range(n):
            dd = (d0 + Vector((rr.uniform(-1, 1), rr.uniform(-1, 1), rr.uniform(-1, 1))) * spread).normalized()
            L = size * rr.uniform(0.45, 1.0) * (1.3 if i == 0 else 1); self.crystal(Vector(base) + dd * size * 0.05, dd, L, L * rr.uniform(0.14, 0.22) * fat, mat)
    def rock(self, c, radii, seed, mat=K, sub=3, amp=0.3, craters=4, pits=0, glow=None, glow_dent=None, facets=9, pitsmall=0):
        """displaced icosphere; glow(dir)->material override per face (veins/cracks)."""
        bm = self.bm; rnd = random.Random(seed); o = Vector((rnd.uniform(0, 50), rnd.uniform(0, 50), rnd.uniform(0, 50)))
        before = set(bm.verts)
        bmesh.ops.create_icosphere(bm, subdivisions=sub, radius=1.0, matrix=Matrix.Identity(4), calc_uvs=False)
        vs = [v for v in bm.verts if v not in before]; cr = [(Vector((rnd.uniform(-1, 1), rnd.uniform(-1, 1), rnd.uniform(-1, 1))).normalized(), rnd.uniform(0.2, 0.48), rnd.uniform(0.07, 0.15)) for _ in range(craters)]
        pt = []
        def place(n_, r0, r1, d0, d1):
            for _ in range(n_ * 12):
                cd = Vector((rnd.uniform(-1, 1), rnd.uniform(-1, 1), rnd.uniform(-1, 1))).normalized(); rr_ = rnd.uniform(r0, r1)
                if all(math.acos(max(-1, min(1, cd.dot(q[0])))) > (rr_ + q[1]) * 0.86 for q in pt): pt.append((cd, rr_, rr_ * rnd.uniform(d0, d1)))
                if len(pt) >= n_ + base_n: break
        base_n = 0; place(pits, 0.13, 0.27, 0.9, 1.2)
        pl = [(Vector((rnd.uniform(-1, 1), rnd.uniform(-1, 1), rnd.uniform(-1, 1))).normalized(), rnd.uniform(0.78, 0.95)) for _ in range(facets)]
        base_n = len(pt); place(pitsmall, 0.07, 0.12, 0.9, 1.2)
        if DEBUG: print("PITS", len(pt))
        for vt in vs:
            n = vt.co.normalized()
            r = 1 + noise.fractal(n * 1.05 + o, 1.0, 2.0, 3) * amp * 0.8 + noise.noise(n * 3.5 + o) * 0.03 + (glow_dent(n) if glow_dent else 0)
            for pn, pd in pl:  # flat chipped facets (the concept rocks are blocky, not round)
                dn = n.dot(pn)
                if dn > 0.05: r = min(r, pd / dn + 0.015 * noise.noise(n * 9 + o))
            for cd, cr_, dep in cr:
                a = math.acos(max(-1, min(1, n.dot(cd)))); t = a / cr_
                if t < 1: r -= dep * (1 - t * t)
                elif t < 1.35: r += dep * 0.35 * math.sin((t - 1) / 0.35 * math.pi)
            pd_ = 0.0
            for cd, cr_, dep in pt:  # swiss-cheese pits: round bowls, non-overlapping
                a = math.acos(max(-1, min(1, n.dot(cd)))); t = a / cr_
                if t < 1: pd_ = max(pd_, dep * (1 - t * t) ** 0.75)
                elif t < 1.25: pd_ = max(pd_, -dep * 0.12 * math.sin((t - 1) / 0.25 * math.pi))
            r -= pd_
            vt.co = Vector(c) + Vector((n.x * r * radii[0], n.y * r * radii[1], n.z * r * radii[2]))
        fs = {f for vt in vs for f in vt.link_faces}
        for f in fs:
            f.material_index = mat
            if glow:
                ctr = sum((vt.co for vt in f.verts), Vector()) / len(f.verts); m = glow((ctr - Vector(c)).normalized(), f)
                if m is not None: f.material_index = m
        return vs, fs
    def bake_colors(self, bm, rays=12):
        """AO x top light x tint vertex colours (emissive slots stay 1, nuggets gold, rock dark)."""
        from mathutils.bvhtree import BVHTree
        bm.faces.ensure_lookup_table(); tree = BVHTree.FromBMesh(bm)
        col = bm.loops.layers.float_color.new('Col'); r = random.Random(5)
        d = max(0.6, self.L * 0.25); eps = self.L * 0.0008
        ga = math.pi * (3 - math.sqrt(5)); dirs = []
        for i in range(rays):
            zz = 1 - (i + 0.5) / rays; rad = math.sqrt(1 - zz * zz); th = i * ga
            dirs.append(Vector((math.cos(th) * rad, math.sin(th) * rad, zz)))
        cache = {}
        for f in bm.faces:
            n = f.normal.copy()
            if n.length < 1e-6: n = Vector((0, 0, 1))
            q = n.to_track_quat('Z', 'Y'); ctr = f.calc_center_median(); mi = f.material_index
            emiss = mi in EMISSIVE
            tint = 1.0 if emiss else r.uniform(0.82, 1.06)
            for lp in f.loops:
                key = (lp.vert.index, round(n.x, 2), round(n.y, 2), round(n.z, 2))
                if key not in cache:
                    o = lp.vert.co * 0.9 + ctr * 0.1 + n * eps; occ = 0.0
                    for dd in dirs:
                        hit = tree.ray_cast(o, q @ dd, d)
                        if hit[0] is not None: occ += 1 - hit[3] / d
                    cache[key] = occ / rays
                ao = 1 - 0.85 * cache[key]; g = 0.84 + 0.16 * (n.z * 0.5 + 0.5)
                v = 1.0 if emiss else max(0.15, min(1.0, ao * g * tint))
                lp[col] = (v, v, v, 1.0)

def optimize(name):
    gt = '/tmp/gt/node_modules/.bin/gltf-transform'; src = os.path.join(OUT, name + '.glb')
    if os.path.exists(gt): subprocess.run([gt, 'meshopt', src, os.path.join(OUT, name + '.mo.glb'), '--level', 'medium'], check=False, capture_output=True)

def export(name, objs, normals=True, uvs=True):
    for o in bpy.context.scene.objects: o.select_set(False)
    for o in objs:
        o.select_set(True)
        for ch in o.children_recursive: ch.select_set(True)
    bpy.ops.export_scene.gltf(filepath=os.path.join(OUT, name + '.glb'), export_format='GLB', export_yup=True, export_apply=True, use_selection=True,
                              export_extras=True, export_cameras=False, export_lights=False, export_vertex_color='ACTIVE',
                              export_normals=normals, export_texcoords=uvs)
    optimize(name)

def space_world(strength=1.0):
    """deep purple/teal nebula backdrop for showcase renders."""
    sc = bpy.context.scene; w = bpy.data.worlds.new('space'); sc.world = w; w.use_nodes = True; nt = w.node_tree
    bg = nt.nodes['Background']; tc = nt.nodes.new('ShaderNodeTexCoord'); nz = nt.nodes.new('ShaderNodeTexNoise'); nz.inputs['Scale'].default_value = 1.6
    nz.inputs['Detail'].default_value = 8; nt.links.new(tc.outputs['Generated'], nz.inputs['Vector'])
    cr = nt.nodes.new('ShaderNodeValToRGB'); e = cr.color_ramp.elements
    e[0].position = 0.4; e[0].color = (0.002, 0.002, 0.008, 1); e[1].position = 0.78; e[1].color = (0.05, 0.012, 0.09, 1)
    el = e.new(0.6); el.color = (0.004, 0.03, 0.045, 1)
    nt.links.new(nz.outputs['Fac'], cr.inputs['Fac']); nt.links.new(cr.outputs['Color'], bg.inputs['Color']); bg.inputs['Strength'].default_value = strength
    st = nt.nodes.new('ShaderNodeTexVoronoi'); st.inputs['Scale'].default_value = 300; nt.links.new(tc.outputs['Generated'], st.inputs['Vector'])
    m = nt.nodes.new('ShaderNodeMapRange'); m.inputs['From Min'].default_value = 0.0; m.inputs['From Max'].default_value = 0.035; m.inputs['To Min'].default_value = 3; m.inputs['To Max'].default_value = 0
    nt.links.new(st.outputs['Distance'], m.inputs['Value']); add = nt.nodes.new('ShaderNodeMix'); add.data_type = 'RGBA'; add.blend_type = 'ADD'; add.inputs['Factor'].default_value = 1
    nt.links.new(cr.outputs['Color'], add.inputs['A']); nt.links.new(m.outputs['Result'], add.inputs['B']); nt.links.new(add.outputs['Result'], bg.inputs['Color'])

def shoot(objs, path, view=(0.62, -0.55, 0.42), res=(1280, 720), samples=40, dist=1.0, lights=True, ctr=None, rad=None, key=(1.1, 0.25, 0.75)):
    sc = bpy.context.scene; sc.render.engine = 'CYCLES'; sc.cycles.device = 'CPU'; sc.cycles.samples = samples
    try: sc.cycles.use_denoising = True
    except Exception: pass
    sc.render.resolution_x, sc.render.resolution_y = res; sc.view_settings.view_transform = 'Khronos PBR Neutral'
    if not sc.world: space_world()
    bpy.context.view_layer.update()
    pts = []
    for o in objs:
        for ob in [o] + list(o.children_recursive):
            if ob.type == 'MESH': pts += [ob.matrix_world @ Vector(cc) for cc in ob.bound_box]
    if ctr is None: ctr = sum(pts, Vector()) / len(pts)
    if rad is None: rad = max((p - ctr).length for p in pts)
    L = rad * 2
    for o in [o for o in sc.objects if o.type in ('LIGHT', 'CAMERA')]: bpy.data.objects.remove(o)
    if lights:
        def light(kind, loc, energy, color, size):
            d = bpy.data.lights.new(kind, 'AREA'); d.energy = energy; d.color = color; d.size = size
            o = bpy.data.objects.new(kind, d); o.location = ctr + Vector(loc); sc.collection.objects.link(o)
            o.rotation_euler = (-Vector(loc)).to_track_quat('-Z', 'Y').to_euler()
        k = L * L
        light('key', (L * key[0], L * key[1], L * key[2]), 30 * k, (1, 0.88, 0.75), L * 0.35)  # raking side light: relief reads
        light('rim', (-L * 0.9, L * 0.8, L * 0.3), 14 * k, (0.55, 0.4, 1.0), L * 0.4)
        light('fill', (-L * 0.5, -L * 1.0, -L * 0.1), 1.5 * k, (0.4, 0.8, 1), L * 0.8)
    cam = bpy.data.cameras.new('cam'); cam.lens = 50; co = bpy.data.objects.new('cam', cam); sc.collection.objects.link(co); sc.camera = co
    d = Vector(view).normalized(); fov = 2 * math.atan(36 / 2 / cam.lens) * min(1, res[1] / res[0])
    pos = ctr + d * rad / math.sin(fov / 2) * dist
    co.location = pos; co.rotation_euler = (ctr - pos).to_track_quat('-Z', 'Y').to_euler(); cam.clip_end = L * 50; cam.clip_start = L * 0.002
    sc.render.filepath = path; bpy.ops.render.render(write_still=True)

def rock_detail(scale=1.0):
    """render-only rock surface (pores + grit bump, lighter ridges), added after the glb export. In game the rock shader
    adds its own noise/crater shading to the same slot, so none of this goes into the glb."""
    m = bpy.data.materials['K']; nt = m.node_tree; b = nt.nodes['Principled BSDF']
    tc = nt.nodes.new('ShaderNodeTexCoord'); vo = nt.nodes.new('ShaderNodeTexVoronoi'); vo.inputs['Scale'].default_value = 9 / scale
    nt.links.new(tc.outputs['Object'], vo.inputs['Vector'])
    nz = nt.nodes.new('ShaderNodeTexNoise'); nz.inputs['Scale'].default_value = 14 / scale; nz.inputs['Detail'].default_value = 10; nt.links.new(tc.outputs['Object'], nz.inputs['Vector'])
    pore = nt.nodes.new('ShaderNodeMapRange'); pore.inputs['From Min'].default_value = 0.0; pore.inputs['From Max'].default_value = 0.22
    pore.inputs['To Min'].default_value = 0.45; pore.inputs['To Max'].default_value = 1.0; nt.links.new(vo.outputs['Distance'], pore.inputs['Value'])
    add = nt.nodes.new('ShaderNodeMath'); add.operation = 'MULTIPLY_ADD'; add.inputs[1].default_value = 0.35
    nt.links.new(nz.outputs['Fac'], add.inputs[0]); nt.links.new(pore.outputs['Result'], add.inputs[2])
    bump = nt.nodes.new('ShaderNodeBump'); bump.inputs['Strength'].default_value = 0.8; bump.inputs['Distance'].default_value = 0.04 * scale
    nt.links.new(add.outputs['Value'], bump.inputs['Height']); nt.links.new(bump.outputs['Normal'], b.inputs['Normal'])
    mul = nt.nodes.new('ShaderNodeMix'); mul.data_type = 'RGBA'; mul.blend_type = 'MULTIPLY'; mul.inputs['Factor'].default_value = 1.0
    src = b.inputs['Base Color'].links[0].from_socket if b.inputs['Base Color'].links else None
    if src: nt.links.new(src, mul.inputs['A'])
    nt.links.new(pore.outputs['Result'], mul.inputs['B']); nt.links.new(mul.outputs['Result'], b.inputs['Base Color'])

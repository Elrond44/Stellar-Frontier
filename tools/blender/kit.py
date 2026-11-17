"""Stellar Frontier Blender kit: scripted, reproducible hull builders.
Conventions: metres; nose toward -Y, up +Z (glTF export turns this into nose +Z, up +Y = the game's hull axes).
Material slots are named after the game's hull material keys so the game can swap in its own faction-tinted,
damage-shader materials by name: H hull, P light plates, D dark metal, A faction accent paint, C canopy/glass,
W lit windows, G engine glow."""
import bpy, bmesh, math, random
from mathutils import Vector, Matrix

SLOTS = ['H', 'P', 'D', 'A', 'C', 'W', 'G']

def hexrgb(h):
    c = ((h >> 16) & 255) / 255, ((h >> 8) & 255) / 255, (h & 255) / 255
    return tuple(((v + 0.055) / 1.055) ** 2.4 if v > 0.04045 else v / 12.92 for v in c)  # sRGB -> linear

def make_materials(pal):
    """pal: dict hull/plate/dark/accent (hex), glow/win (linear rgb >1 ok)."""
    mats = []
    spec = {
        'H': (hexrgb(pal['hull']), 0.85, 0.5, None, 0),
        'P': (hexrgb(pal['plate']), 0.6, 0.42, None, 0),
        'D': (hexrgb(pal['dark']), 0.9, 0.55, None, 0),
        'A': (hexrgb(pal['accent']), 0.4, 0.4, None, 0),
        'C': ((0.03, 0.08, 0.16), 0.9, 0.06, (0.03, 0.09, 0.2), 1),
        'W': ((1, 0.8, 0.5), 0.0, 0.5, pal['win'], 1.1),
        'G': ((1, 1, 1), 0.0, 0.5, pal['glow'], 6),
    }
    for k in SLOTS:
        base, met, rough, em, es = spec[k]
        m = bpy.data.materials.get(k) or bpy.data.materials.new(k)
        m.use_nodes = True; b = m.node_tree.nodes.get('Principled BSDF')
        b.inputs['Base Color'].default_value = (*base, 1); b.inputs['Metallic'].default_value = met; b.inputs['Roughness'].default_value = rough
        if k in ('H', 'P', 'D', 'A'):
            ca = m.node_tree.nodes.new('ShaderNodeVertexColor'); ca.layer_name = 'Col'
            mx_ = m.node_tree.nodes.new('ShaderNodeMix'); mx_.data_type = 'RGBA'; mx_.blend_type = 'MULTIPLY'; mx_.inputs['Factor'].default_value = 1.0
            mx_.inputs['A'].default_value = (*base, 1); m.node_tree.links.new(ca.outputs['Color'], mx_.inputs['B']); m.node_tree.links.new(mx_.outputs['Result'], b.inputs['Base Color'])
        if em:
            mx = max(em); b.inputs['Emission Color'].default_value = (em[0] / mx, em[1] / mx, em[2] / mx, 1); b.inputs['Emission Strength'].default_value = es * mx
        mats.append(m)
    return mats

def ring(wb, wt, zb, zt, c, cx=0.0):
    c = min(c, wb / 2 - 1e-3, wt / 2 - 1e-3, (zt - zb) / 2 - 1e-3) if c > 0 else 0
    pts = [(-wb / 2 + c, zb), (wb / 2 - c, zb), (wb / 2, zb + c), (wt / 2, zt - c), (wt / 2 - c, zt), (-wt / 2 + c, zt), (-wt / 2, zt - c), (-wb / 2, zb + c)]
    return [(x + cx, z) for x, z in pts]

class Ship:
    def __init__(self, name, length, seed=1):
        self.name = name; self.L = length; self.bm = bmesh.new(); self.rng = random.Random(seed); self.empties = []
    def y(self, s):  # 0 = nose, 1 = tail
        return (s - 0.5) * self.L
    # -------- primitives (all merged into one bmesh, per-face material index) --------
    def _faces(self, verts_rings, mat, cap0=True, cap1=True, M=None):
        bm = self.bm; R = []
        for rr in verts_rings:
            R.append([bm.verts.new(M @ Vector(p) if M else Vector(p)) for p in rr])
        n = len(R[0])
        for a, b in zip(R, R[1:]):
            for i in range(n):
                j = (i + 1) % n
                try: f = bm.faces.new((a[i], a[j], b[j], b[i])); f.material_index = mat
                except ValueError: pass
        for rr, flip in ((R[0], True), (R[-1], False)) if True else ():
            if (flip and not cap0) or (not flip and not cap1): continue
            try: f = bm.faces.new(list(reversed(rr)) if flip else rr); f.material_index = mat
            except ValueError: pass
    def loft(self, secs, mat, M=None, cap0=True, cap1=True):
        """secs: list of (y, wb, wt, zb, zt, chamfer[, cx]) — a prism loft along Y."""
        rings = []
        for s in secs:
            y, wb, wt, zb, zt, c = s[:6]; cx = s[6] if len(s) > 6 else 0
            rings.append([(x, y, z) for x, z in ring(max(wb, 0.002), max(wt, 0.002), zb, max(zt, zb + 0.002), c, cx)])
        self._faces(rings, mat, cap0, cap1, M)
    def box(self, c, size, mat, ch=0.0, taper=1.0, M=None):
        x, y, z = c; w, l, h = size
        self.loft([(y - l / 2, w, w * taper, z - h / 2, z + h / 2, ch, x), (y + l / 2, w, w * taper, z - h / 2, z + h / 2, ch, x)], mat, M)
    def cyl(self, c, r, length, mat, axis='Y', seg=12, r2=None, cap=True):
        """cylinder/cone along an axis, centred at c."""
        r2 = r if r2 is None else r2; x, y, z = c; rings = []
        for t, rr in ((-length / 2, r), (length / 2, r2)):
            pts = []
            for i in range(seg):
                a = 2 * math.pi * i / seg; u, v = math.cos(a) * rr, math.sin(a) * rr
                pts.append((x + t, y + u, z + v) if axis == 'X' else (x + u, y + t, z + v) if axis == 'Y' else (x + u, y + v, z + t))
            rings.append(pts)
        if axis == 'X': rings = [list(reversed(r_)) for r_ in rings]
        self._faces(rings, mat, cap, cap)
    def nozzle(self, c, r, length, glow=True, seg=12):
        """engine bell: dark outer cone + glowing inner disc, opening toward +Y (the stern)."""
        x, y, z = c
        self.cyl((x, y, z), r * 1.0, length, 2, 'Y', seg, r * 1.15, True)  # D bell (wider at the stern)
        if glow: self.cyl((x, y + length / 2 + 0.002 * self.L, z), r * 0.92, 0.004 * self.L, 6, 'Y', seg)  # G
    def turret(self, c, s, barrels=2, mat_h=0, rot=0.0):
        """deck turret sized s (barbette diameter, m): barbette, angular housing, barrels toward the nose."""
        x, y, z = c; M = Matrix.Translation((x, y, z)) @ Matrix.Rotation(rot, 4, 'Z')
        rings = []
        seg = 10
        for t, rr in ((0, s * 0.5), (s * 0.18, s * 0.46)):
            rings.append([(math.cos(2 * math.pi * i / seg) * rr, math.sin(2 * math.pi * i / seg) * rr, t) for i in range(seg)])
        self._faces(rings, 2, True, True, M)  # D barbette
        self.loft([(-s * 0.55, s * 0.55, s * 0.4, s * 0.18, s * 0.42, s * 0.06), (s * 0.4, s * 0.8, s * 0.62, s * 0.18, s * 0.5, s * 0.08)], mat_h, M)  # housing
        for b in range(barrels):
            bx = (b - (barrels - 1) / 2) * s * 0.22
            rr = [[(bx + math.cos(2 * math.pi * i / 6) * s * 0.05, yy, s * 0.32 + math.sin(2 * math.pi * i / 6) * s * 0.05) for i in range(6)] for yy in (-s * 0.5, -s * 1.25)]
            self._faces(rr, 2, True, True, M)
        self.empty('hard', (x, y, z + s * 0.3), s)
    def windows(self, y0, y1, x, z, n, mat=5, side=1, h=None, w=None):
        """a row of lit windows on a hull side wall at |x|, facing +-X."""
        h = h or self.L * 0.004; w = w or (y1 - y0) / n * 0.55
        for i in range(n):
            yy = y0 + (i + 0.5) * (y1 - y0) / n
            self.box((x * side, yy, z), (self.L * 0.0012, w, h), mat)
    def greebles(self, y0, y1, x0, x1, z, n, scale, mats=(0, 1, 2)):
        r = self.rng
        for _ in range(n):
            w, l, h = r.uniform(0.3, 1) * scale, r.uniform(0.3, 1.4) * scale, r.uniform(0.15, 0.7) * scale
            self.box((r.uniform(x0, x1), r.uniform(y0, y1), z + h / 2), (w, l, h), r.choice(mats), ch=min(w, h) * 0.15)
    def slab(self, outline, t, mat, M=None, inset=0.0):
        """extrude a 2D outline [(u,v)...] (local XY plane) by thickness t along local Z, centred; the top face can be
        inset (scaled toward the centroid) for a chamfered plate. M maps local -> ship space (use mirror() for side -1)."""
        bm = self.bm; M = M or Matrix.Identity(4)
        cu = sum(p[0] for p in outline) / len(outline); cv = sum(p[1] for p in outline) / len(outline)
        lo = [bm.verts.new(M @ Vector((u, v, -t / 2))) for u, v in outline]
        k = 1 - inset
        hi = [bm.verts.new(M @ Vector((cu + (u - cu) * k, cv + (v - cv) * k, t / 2))) for u, v in outline]
        n = len(outline)
        for ring_, flip in ((lo, True), (hi, False)):
            try: f = bm.faces.new(list(reversed(ring_)) if flip else ring_); f.material_index = mat
            except ValueError: pass
        for i in range(n):
            j = (i + 1) % n
            try: f = bm.faces.new((lo[i], lo[j], hi[j], hi[i])); f.material_index = mat
            except ValueError: pass
    def quad(self, c, w, h, side, mat=5, axis='X', off=None):
        """a flat emissive quad (2 tris) on a wall: axis X -> faces +-X (w along Y, h along Z); axis Z -> faces +Z (w along Y, h along X)."""
        x, y, z = c; bm = self.bm
        if axis == 'X':
            pts = [(x, y - w / 2, z - h / 2), (x, y + w / 2, z - h / 2), (x, y + w / 2, z + h / 2), (x, y - w / 2, z + h / 2)]
            if side < 0: pts.reverse()
        elif axis == 'Y':  # faces -Y (the nose)
            pts = [(x - w / 2, y, z - h / 2), (x + w / 2, y, z - h / 2), (x + w / 2, y, z + h / 2), (x - w / 2, y, z + h / 2)]
        else:
            pts = [(x - h / 2, y - w / 2, z), (x + h / 2, y - w / 2, z), (x + h / 2, y + w / 2, z), (x - h / 2, y + w / 2, z)]
        f = bm.faces.new([bm.verts.new(p) for p in pts]); f.material_index = mat
    def strips(self, y0, y1, x, z, side, h, seg=(0.04, 0.12), gap=(0.01, 0.04), mat=5, fill=0.85):
        """broken light strips along a wall (the concept sheet's thin amber window lines); seg/gap as fractions of L."""
        r = self.rng; y = y0 + r.uniform(*gap) * self.L
        while y < y1:
            l = min(r.uniform(*seg) * self.L, y1 - y)
            xx = x(y + l / 2) if callable(x) else x
            if r.random() < fill and l > h and xx > 0: self.quad((xx * side, y + l / 2, z), l, h, side, mat)
            y += l + r.uniform(*gap) * self.L
    def skin(self, secs, y0, y1, n, gap, grow, matf, zclip=None):
        """segmented armour skin over a reference loft: n plates between y0..y1 separated by gaps (reads as deep panel
        lines in game); grow (m) pushes the plates out of the base hull; matf(i) picks each plate's material."""
        def at(y):
            for a, b in zip(secs, secs[1:]):
                if a[0] <= y <= b[0]:
                    t = (y - a[0]) / (b[0] - a[0]); return [a[k] + (b[k] - a[k]) * t for k in range(1, 6)]
            e = secs[0] if y < secs[0][0] else secs[-1]; return list(e[1:6])
        L = (y1 - y0) / n
        for i in range(n):
            ya, yb = y0 + i * L + gap / 2, y0 + (i + 1) * L - gap / 2
            rr = []
            for yy in (ya, ya + gap, yb - gap, yb):
                wb, wt, zb, zt, c = at(yy); g = grow * (0.4 if yy in (ya, yb) else 1)
                if zclip is not None: zb = max(zb, zclip)
                rr.append((yy, wb + 2 * g, wt + 2 * g, zb - g * 0.5, zt + g, c + g * 0.5))
            m = matf(i)
            if m is not None: self.loft(rr, m)
    def empty(self, kind, p, size=1.0):
        self.empties.append((kind, p, size))
    def bake_colors(self, bm, rays=12):
        """vertex colours = ambient occlusion x top-light gradient x per-panel tint. Multiplied into the hull colour in
        game (vertexColors) and in the Blender render, so recesses, plate seams and stacked decks read under the game's
        single sun light instead of turning into one flat dark mass."""
        from mathutils.bvhtree import BVHTree
        bm.faces.ensure_lookup_table(); tree = BVHTree.FromBMesh(bm)
        col = bm.loops.layers.float_color.new('Col'); r = random.Random(5)
        d = max(0.6, self.L * 0.045); eps = self.L * 0.0008
        ga = math.pi * (3 - math.sqrt(5)); dirs = []
        for i in range(rays):  # fibonacci hemisphere, cosine-ish
            zz = 1 - (i + 0.5) / rays; rad = math.sqrt(1 - zz * zz); th = i * ga
            dirs.append(Vector((math.cos(th) * rad, math.sin(th) * rad, zz)))
        cache = {}
        for f in bm.faces:
            n = f.normal.copy()
            if n.length < 1e-6: n = Vector((0, 0, 1))
            q = n.to_track_quat('Z', 'Y'); ctr = f.calc_center_median()
            emiss = f.material_index in (4, 5, 6)
            tint = 1.0 if emiss else r.uniform(0.86, 1.06)
            for lp in f.loops:
                key = (lp.vert.index, round(n.x, 2), round(n.y, 2), round(n.z, 2))
                if key not in cache:
                    o = lp.vert.co * 0.9 + ctr * 0.1 + n * eps; occ = 0.0
                    for dd in dirs:
                        hit = tree.ray_cast(o, q @ dd, d)
                        if hit[0] is not None: occ += 1 - hit[3] / d
                    cache[key] = occ / rays
                ao = 1 - 0.85 * cache[key]
                g = 0.84 + 0.16 * (n.z * 0.5 + 0.5)
                v = 1.0 if emiss else max(0.18, min(1.0, ao * g * tint))
                lp[col] = (v, v, v, 1.0)
    # -------- finish: UVs, normals, object, export --------
    def finish(self, mats, tile):
        bm = self.bm
        bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=self.L * 1e-5)
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
        self.bake_colors(bm)
        uv = bm.loops.layers.uv.new('UVMap')
        for f in bm.faces:  # box projection in metres / tile
            n = f.normal; ax = max(range(3), key=lambda i: abs(n[i]))
            for lp in f.loops:
                co = lp.vert.co
                u, v = (co.y, co.z) if ax == 0 else (co.x, co.z) if ax == 1 else (co.x, co.y)
                lp[uv].uv = (u / tile, v / tile)
        me = bpy.data.meshes.new(self.name); bm.to_mesh(me); bm.free()
        for m in mats: me.materials.append(m)
        if me.color_attributes.get('Col'): me.color_attributes.active_color = me.color_attributes['Col']; me.color_attributes.render_color_index = me.color_attributes.active_color_index
        for p in me.polygons: p.use_smooth = False
        ob = bpy.data.objects.new(self.name, me); bpy.context.scene.collection.objects.link(ob)
        ems = []
        for i, (kind, p, s) in enumerate(self.empties):
            e = bpy.data.objects.new(f'{kind}_{i}', None); e.location = p; e.empty_display_size = s; e['size'] = float(s); e.parent = ob; bpy.context.scene.collection.objects.link(e); ems.append(e)
        tris = sum(len(p.vertices) - 2 for p in me.polygons)
        return ob, tris

def reset():
    bpy.ops.wm.read_factory_settings(use_empty=True)

def export_glb(path, draco=True):
    bpy.ops.export_scene.gltf(filepath=path, export_format='GLB', export_yup=True, export_apply=True, export_draco_mesh_compression_enable=draco,
                              export_draco_mesh_compression_level=6, export_draco_position_quantization=14, export_draco_normal_quantization=10,
                              export_draco_texcoord_quantization=12, export_extras=True, export_cameras=False, export_lights=False,
                              export_vertex_color='ACTIVE')

CONCEPT_VIEW = [Vector((0.55, -0.72, 0.5)), 0.78]
def render(ob, path, length, view='3q', res=(1280, 720), samples=48):
    sc = bpy.context.scene; sc.render.engine = 'CYCLES'; sc.cycles.device = 'CPU'; sc.cycles.samples = samples
    try: sc.cycles.use_denoising = True
    except Exception: pass
    sc.render.resolution_x, sc.render.resolution_y = res; sc.render.film_transparent = False
    sc.view_settings.view_transform = 'AgX'
    w = bpy.data.worlds.new('w'); sc.world = w; w.use_nodes = True; bg = w.node_tree.nodes['Background']; bg.inputs[0].default_value = (0.004, 0.007, 0.016, 1); bg.inputs[1].default_value = 1
    L = length
    def light(kind, loc, energy, color, size):
        d = bpy.data.lights.new(kind + str(len(bpy.data.lights)), 'AREA'); d.energy = energy; d.color = color; d.size = size
        o = bpy.data.objects.new(d.name, d); o.location = loc; sc.collection.objects.link(o)
        o.rotation_euler = (Vector((0, 0, 0)) - Vector(loc)).to_track_quat('-Z', 'Y').to_euler(); return o
    k = L * L
    light('key', (L * 0.8, -L * 0.6, L * 0.9), 22 * k, (1, 0.95, 0.88), L * 0.6)
    light('rim', (-L * 0.9, L * 0.7, L * 0.4), 7 * k, (0.45, 0.6, 1.0), L * 0.5)
    light('fill', (-L * 0.4, -L * 1.0, -L * 0.2), 1.5 * k, (0.7, 0.75, 1), L * 0.8)
    cam = bpy.data.cameras.new('cam'); cam.lens = 50; co = bpy.data.objects.new('cam', cam); sc.collection.objects.link(co); sc.camera = co
    bb = [ob.matrix_world @ Vector(c) for c in ob.bound_box]; ctr = sum(bb, Vector()) / 8; rad = max((v - ctr).length for v in bb)
    d = {'3q': Vector((0.62, -0.55, 0.42)), 'side': Vector((1, 0.0, 0.12)), 'top': Vector((0, 0.001, 1)), 'front': Vector((0.35, -1, 0.3)), 'concept': CONCEPT_VIEW[0]}[view].normalized()
    fov = 2 * math.atan(36 / 2 / cam.lens) * res[1] / res[0]
    pos = ctr + d * rad / math.sin(fov / 2) * (CONCEPT_VIEW[1] if view == 'concept' else 0.6)
    co.location = pos; co.rotation_euler = (ctr - pos).to_track_quat('-Z', 'Y').to_euler()
    cam.clip_end = L * 20; cam.clip_start = L * 0.002
    sc.render.filepath = path; bpy.ops.render.render(write_still=True)

def detail_materials(scale):
    """render-only surface detail (panel lines, grime, roughness breakup) added AFTER the glb export; the game supplies
    its own panel textures for the same slots, so none of this goes into the glb."""
    for name in ('H', 'P', 'D', 'A'):
        m = bpy.data.materials[name]; nt = m.node_tree; b = nt.nodes['Principled BSDF']
        tc = nt.nodes.new('ShaderNodeTexCoord'); mp = nt.nodes.new('ShaderNodeMapping'); mp.inputs['Scale'].default_value = (1 / scale,) * 3
        nt.links.new(tc.outputs['Object'], mp.inputs['Vector'])
        br = nt.nodes.new('ShaderNodeTexBrick'); br.inputs['Scale'].default_value = 1.0; br.inputs['Mortar Size'].default_value = 0.012; br.offset = 0.5
        br.inputs['Brick Width'].default_value = 2.2; br.inputs['Row Height'].default_value = 0.7
        br.inputs['Color1'].default_value = (1, 1, 1, 1); br.inputs['Color2'].default_value = (0.82, 0.84, 0.88, 1); br.inputs['Mortar'].default_value = (0.5, 0.5, 0.54, 1)
        nt.links.new(mp.outputs['Vector'], br.inputs['Vector'])
        nz = nt.nodes.new('ShaderNodeTexNoise'); nz.inputs['Scale'].default_value = 3.0; nt.links.new(mp.outputs['Vector'], nz.inputs['Vector'])
        mix = nt.nodes.new('ShaderNodeMix'); mix.data_type = 'RGBA'; mix.blend_type = 'MULTIPLY'; mix.inputs['Factor'].default_value = 1.0
        mix.inputs['A'].default_value = b.inputs['Base Color'].default_value[:]; nt.links.new(br.outputs['Color'], mix.inputs['B'])
        if b.inputs['Base Color'].links: nt.links.new(b.inputs['Base Color'].links[0].from_socket, mix.inputs['A'])
        nt.links.new(mix.outputs['Result'], b.inputs['Base Color'])
        rm = nt.nodes.new('ShaderNodeMapRange'); rm.inputs['To Min'].default_value = b.inputs['Roughness'].default_value * 0.7; rm.inputs['To Max'].default_value = min(1, b.inputs['Roughness'].default_value * 1.3)
        nt.links.new(nz.outputs['Fac'], rm.inputs['Value']); nt.links.new(rm.outputs['Result'], b.inputs['Roughness'])
        bump = nt.nodes.new('ShaderNodeBump'); bump.inputs['Strength'].default_value = 0.35; bump.inputs['Distance'].default_value = scale * 0.004
        nt.links.new(br.outputs['Fac'], bump.inputs['Height']); nt.links.new(bump.outputs['Normal'], b.inputs['Normal'])

def run(build, name, pal, length, tile, detail, view=None, dist=None):
    if view: CONCEPT_VIEW[0] = Vector(view)
    if dist: CONCEPT_VIEW[1] = dist
    import sys, os
    out = os.path.join(os.path.dirname(__file__), '..', 'out')
    reset(); mats = make_materials(pal); s = build(); ob, tris = s.finish(mats, tile=tile)
    print('TRIS', name, tris)
    export_glb(os.path.join(out, name + '.glb'), draco=False)
    import subprocess  # meshopt + quantization (three r170 GLTFLoader + vendored MeshoptDecoder); ~3x smaller
    gt = '/tmp/gt/node_modules/.bin/gltf-transform'
    if os.path.exists(gt): subprocess.run([gt, 'meshopt', os.path.join(out, name + '.glb'), os.path.join(out, name + '.mo.glb'), '--level', 'medium'], check=False, capture_output=True)
    if '--render' in sys.argv:
        detail_materials(detail)
        for v in ('concept', 'side'): render(ob, os.path.join(out, '..', 'shots', f'blender-{name}-{v}.png'), length, view=v)
    return tris

# -------- placement helpers --------
def mirror(side):
    return Matrix.Diagonal((side, 1, 1, 1))
def T(x, y, z):
    return Matrix.Translation((x, y, z))
def R(deg, axis):
    return Matrix.Rotation(math.radians(deg), 4, axis)
FIN = Matrix(((0, 0, 1, 0), (1, 0, 0, 0), (0, 1, 0, 0), (0, 0, 0, 1)))  # slab local (u,v,w) -> ship (w,u,v): outline in (y, z), thickness along x
def wingM(side, root, dihedral=0.0, sweep=0.0):
    """slab outline in (outboard x, y); dihedral in degrees (tip up +)."""
    return mirror(side) @ T(*root) @ R(-dihedral, 'Y') @ R(sweep, 'Z')
def finM(side, root, cant=0.0):
    """slab outline in (y, z up); cant in degrees, tilting the fin outboard."""
    return mirror(side) @ T(*root) @ R(cant, 'Y') @ FIN

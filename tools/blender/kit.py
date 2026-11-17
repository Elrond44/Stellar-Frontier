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
        'C': ((0.02, 0.05, 0.09), 0.9, 0.06, tuple(v * 0.1 for v in pal['glow']), 1),
        'W': ((1, 0.8, 0.5), 0.0, 0.5, pal['win'], 1.1),
        'G': ((1, 1, 1), 0.0, 0.5, pal['glow'], 6),
    }
    for k in SLOTS:
        base, met, rough, em, es = spec[k]
        m = bpy.data.materials.get(k) or bpy.data.materials.new(k)
        m.use_nodes = True; b = m.node_tree.nodes.get('Principled BSDF')
        b.inputs['Base Color'].default_value = (*base, 1); b.inputs['Metallic'].default_value = met; b.inputs['Roughness'].default_value = rough
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
    def empty(self, kind, p, size=1.0):
        self.empties.append((kind, p, size))
    # -------- finish: UVs, normals, object, export --------
    def finish(self, mats, tile):
        bm = self.bm
        bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=self.L * 1e-5)
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
        uv = bm.loops.layers.uv.new('UVMap')
        for f in bm.faces:  # box projection in metres / tile
            n = f.normal; ax = max(range(3), key=lambda i: abs(n[i]))
            for lp in f.loops:
                co = lp.vert.co
                u, v = (co.y, co.z) if ax == 0 else (co.x, co.z) if ax == 1 else (co.x, co.y)
                lp[uv].uv = (u / tile, v / tile)
        me = bpy.data.meshes.new(self.name); bm.to_mesh(me); bm.free()
        for m in mats: me.materials.append(m)
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
                              export_draco_texcoord_quantization=12, export_extras=True, export_cameras=False, export_lights=False)

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
    light('key', (L * 0.8, -L * 0.6, L * 0.9), 15 * k, (1, 0.95, 0.88), L * 0.6)
    light('rim', (-L * 0.9, L * 0.7, L * 0.4), 7 * k, (0.45, 0.6, 1.0), L * 0.5)
    light('fill', (-L * 0.4, -L * 1.0, -L * 0.2), 1.5 * k, (0.7, 0.75, 1), L * 0.8)
    cam = bpy.data.cameras.new('cam'); cam.lens = 50; co = bpy.data.objects.new('cam', cam); sc.collection.objects.link(co); sc.camera = co
    bb = [ob.matrix_world @ Vector(c) for c in ob.bound_box]; ctr = sum(bb, Vector()) / 8; rad = max((v - ctr).length for v in bb)
    d = {'3q': Vector((0.62, -0.55, 0.42)), 'side': Vector((1, 0.0, 0.12)), 'top': Vector((0, 0.001, 1)), 'front': Vector((0.35, -1, 0.3))}[view].normalized()
    fov = 2 * math.atan(36 / 2 / cam.lens) * res[1] / res[0]
    pos = ctr + d * rad / math.sin(fov / 2) * 0.6
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
        nt.links.new(mix.outputs['Result'], b.inputs['Base Color'])
        rm = nt.nodes.new('ShaderNodeMapRange'); rm.inputs['To Min'].default_value = b.inputs['Roughness'].default_value * 0.7; rm.inputs['To Max'].default_value = min(1, b.inputs['Roughness'].default_value * 1.3)
        nt.links.new(nz.outputs['Fac'], rm.inputs['Value']); nt.links.new(rm.outputs['Result'], b.inputs['Roughness'])
        bump = nt.nodes.new('ShaderNodeBump'); bump.inputs['Strength'].default_value = 0.35; bump.inputs['Distance'].default_value = scale * 0.004
        nt.links.new(br.outputs['Fac'], bump.inputs['Height']); nt.links.new(bump.outputs['Normal'], b.inputs['Normal'])

def run(build, name, pal, length, tile, detail):
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
        for v in ('3q', 'side'): render(ob, os.path.join(out, '..', 'shots', f'blender-{name}-{v}.png'), length, view=v)
    return tris

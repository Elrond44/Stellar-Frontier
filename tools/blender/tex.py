"""Cinematic texture test (branch blender-tex): high-poly detail -> baked maps on the in-game low-poly hull.
usage: .venv/bin/python src/tex.py <ship> [--render]
 1. builds the normal low-poly hull (same builder as the untextured glb) and gives it a clean, non-overlapping UV unwrap
 2. builds a high-poly copy: every hull face is cut into armour panels, each panel inset (bevelled seam) and raised by a
    random amount, then greebles (boxes, vents, pipes, hatches, sensor domes), extra lit window rows, trim stripes and
    decals (hull number + faction emblem) are added on top
 3. Cycles bakes high -> low: tangent-space normal, AO, albedo (panel tint x grime), paint mask (which faction slot
    tints each texel), roughness/metal, emissive (windows / engines), curvature (pointiness) for edge wear
 4. numpy composes the final maps (albedo x AO, edge wear, ORM packing), writes PNGs, exports a textured glb, then
    gltf-transform makes KTX2 (Basis UASTC/ETC1S) full + half-res sets and meshopt-compresses them."""
import sys, os, math, random, importlib, subprocess, shutil
import bpy, bmesh
import numpy as np
from mathutils import Vector, Matrix
from mathutils.bvhtree import BVHTree
HERE = os.path.dirname(os.path.abspath(__file__)); sys.path.insert(0, HERE)
import kit
from kit import make_materials, hexrgb

ROOT = os.path.normpath(os.path.join(HERE, '..'))
GT = '/tmp/gt/node_modules/.bin/gltf-transform'
KTXBIN = '/tmp/ktx/KTX-Software-4.4.2-Linux-x86_64/bin'

CFG = {
    'dreadnought': dict(L=720.0, tile=60.0, size=2048, panel=9.0, greebles=2600, windows=0.45, win=(1.3, 0.8, 3.4),
                        view=(0.85, -0.48, 0.24), dist=0.5, number='SF-01', stripes=[(-215, -175), (-60, -35), (95, 135)],
                        decals=[('num', -300, 0.35, 15), ('num', 200, 0.35, 15), ('emb', -120, 0.5, 34), ('emb', 160, 0.5, 30)], emblem=0xb8262c,
                        ext=0.55),
    'scout': dict(L=20.0, tile=5.0, size=1024, panel=0.75, greebles=150, windows=0.0, win=(0.1, 0.06, 0.2),
                  view=None, dist=None, number='07', stripes=[(-5.6, -5.1), (6.8, 7.2)],
                  decals=[('num', 1.5, 0.45, 0.75), ('emb', -3.0, 0.75, 0.9)], emblem=0xd8dde4, ext=0.5),
}

# high-poly material slots: the 7 kit slots + stripe, decal (hull number), emblem
HS = ['H', 'P', 'D', 'A', 'C', 'W', 'G', 'S', 'K', 'E']
PAINT = {'H': 0, 'P': 1, 'A': 2, 'S': 2, 'D': 3}  # paint-mask channel (0..2 -> mask RGB, 3 -> mask2 R)

def slot_props(pal, emblem):
    win = pal['win']; glow = pal['glow']; nw = max(win); ng = max(glow)
    return {
        'H': dict(c=hexrgb(pal['hull']), r=0.5, m=0.85, e=None), 'P': dict(c=hexrgb(pal['plate']), r=0.42, m=0.6, e=None),
        'D': dict(c=hexrgb(pal['dark']), r=0.55, m=0.9, e=None), 'A': dict(c=hexrgb(pal['accent']), r=0.4, m=0.4, e=None),
        'C': dict(c=(0.02, 0.05, 0.1), r=0.06, m=0.9, e=(0.025, 0.07, 0.15)),
        'W': dict(c=(0.06, 0.06, 0.06), r=0.5, m=0.0, e=(win[0] / nw, win[1] / nw, win[2] / nw)),
        'G': dict(c=(0.2, 0.2, 0.2), r=0.5, m=0.0, e=(glow[0] / ng, glow[1] / ng, glow[2] / ng)),
        'S': dict(c=hexrgb(pal['accent']), r=0.4, m=0.4, e=None), 'K': dict(c=(0.8, 0.82, 0.85), r=0.45, m=0.2, e=None),
        'E': dict(c=hexrgb(emblem), r=0.42, m=0.3, e=None),
    }

# ---------------------------------------------------------------- high-poly detail
def frame(n, t):
    n = n.normalized(); t = (t - n * t.dot(n)); t = t.normalized() if t.length > 1e-6 else n.orthogonal().normalized(); b = n.cross(t)
    return Matrix(((t.x, b.x, n.x), (t.y, b.y, n.y), (t.z, b.z, n.z)))

def add_geo(bm, res, mat, tint_layer, tint):
    fs = set()
    for v in res['verts']: fs.update(v.link_faces)
    for f in fs:
        f.material_index = mat
        for lp in f.loops: lp[tint_layer] = (tint, tint, tint, 1)

def detail(me, cfg, rng, hmats):
    bm = bmesh.new(); bm.from_mesh(me)
    tl = bm.loops.layers.float_color.new('Tint')
    for f in bm.faces:
        for lp in f.loops: lp[tl] = (1, 1, 1, 1)
    PS = cfg['panel']; HULL = {0, 1, 2, 3}
    # 1. cut big faces into armour panels
    for _ in range(7):
        es = [e for e in bm.edges if e.link_faces and e.calc_length() > PS * 1.6 and all(f.material_index in HULL for f in e.link_faces)]
        if not es: break
        bmesh.ops.subdivide_edges(bm, edges=es, cuts=1, use_grid_fill=True)
    bm.faces.ensure_lookup_table()
    # 2. inset every panel (bevelled seam) and raise it a random amount
    t = PS * 0.035
    cand = []
    for f in bm.faces:
        if f.material_index not in HULL: continue
        a = f.calc_area(); per = f.calc_perimeter()
        if per > 0 and 2 * a / per > t * 2.2: cand.append(f)
    bmesh.ops.inset_individual(bm, faces=cand, thickness=t, depth=0.0, use_even_offset=True)
    panels = []
    for f in cand:
        if not f.is_valid: continue
        n = f.normal.copy(); h = t * (0.6 + rng.choice([0, 0, 0, 0.5, 1.1, -0.35]))
        for v in f.verts: v.co += n * h
        k = rng.uniform(0.84, 1.06)
        for lp in f.loops: lp[tl] = (k, k, k, 1)
        for e in f.edges:  # seam / rim faces darker
            for g in e.link_faces:
                if g is not f and g.material_index == f.material_index:
                    for lp in g.loops: lp[tl] = (0.62, 0.62, 0.62, 1)
        panels.append(f)
    # 3. greebles (built in their own small bmesh: bmesh create ops get slow on a big mesh)
    gb = bmesh.new(); gtl = gb.loops.layers.float_color.new('Tint')
    bm.faces.ensure_lookup_table()
    big = [f for f in panels if f.is_valid and f.calc_area() > (PS * 0.45) ** 2]
    rng.shuffle(big)
    for f in big[:cfg['greebles']]:
        n = f.normal.copy(); c = f.calc_center_median(); e0 = max(f.edges, key=lambda e: e.calc_length())
        tv = (e0.verts[1].co - e0.verts[0].co); F = frame(n, tv); tvec = F.col[0]; bvec = F.col[1]
        us = [(v.co - c).dot(tvec) for v in f.verts]; vs = [(v.co - c).dot(bvec) for v in f.verts]
        wu = min(max(us), -min(us)) * 1.6; wv = min(max(vs), -min(vs)) * 1.6
        if wu < PS * 0.12 or wv < PS * 0.12: continue
        M3 = F.to_4x4(); base = Matrix.Translation(c + n * t * 0.2)
        kind = rng.random(); mat = rng.choice([0, 1, 2, 2]) if f.material_index != 3 else 2
        if kind < 0.38:  # box / plate stack
            sx, sy, sz = wu * rng.uniform(0.25, 0.7), wv * rng.uniform(0.25, 0.7), PS * rng.uniform(0.04, 0.22)
            r = bmesh.ops.create_cube(gb, size=1.0, matrix=base @ M3 @ Matrix.Translation((0, 0, sz / 2)) @ Matrix.Diagonal((sx, sy, sz, 1)))
            add_geo(gb, r, mat, gtl, rng.uniform(0.7, 1.05))
            if rng.random() < 0.4:
                r = bmesh.ops.create_cube(gb, size=1.0, matrix=base @ M3 @ Matrix.Translation((rng.uniform(-0.2, 0.2) * sx, 0, sz + sz * 0.35)) @ Matrix.Diagonal((sx * 0.5, sy * 0.6, sz * 0.7, 1)))
                add_geo(gb, r, rng.choice([0, 1, 2]), gtl, rng.uniform(0.75, 1.05))
        elif kind < 0.58:  # vent: row of slats
            nsl = rng.randint(4, 8); L_ = wu * 0.7; W_ = wv * rng.uniform(0.25, 0.5); hh = PS * 0.035
            for i in range(nsl):
                x = -L_ / 2 + L_ * (i + 0.5) / nsl
                r = bmesh.ops.create_cube(gb, size=1.0, matrix=base @ M3 @ Matrix.Translation((x, 0, hh / 2)) @ Matrix.Diagonal((L_ / nsl * 0.45, W_, hh, 1)))
                add_geo(gb, r, 2, gtl, 0.55)
        elif kind < 0.74:  # pipes along the panel
            np_ = rng.randint(1, 3); rr = PS * rng.uniform(0.025, 0.05)
            for i in range(np_):
                off = (i - (np_ - 1) / 2) * rr * 2.6
                r = bmesh.ops.create_cone(gb, cap_ends=True, segments=8, radius1=rr, radius2=rr, depth=wu * 0.95,
                                          matrix=base @ M3 @ Matrix.Translation((0, off, rr)) @ Matrix.Rotation(math.pi / 2, 4, 'Y'))
                add_geo(gb, r, rng.choice([1, 2]), gtl, rng.uniform(0.8, 1.0))
        elif kind < 0.9:  # hatch: flat disc + rim
            rr = min(wu, wv) * rng.uniform(0.18, 0.3)
            r = bmesh.ops.create_cone(gb, cap_ends=True, segments=16, radius1=rr, radius2=rr * 0.92, depth=PS * 0.03, matrix=base @ M3 @ Matrix.Translation((0, 0, PS * 0.015)))
            add_geo(gb, r, 2, gtl, 0.6)
            r = bmesh.ops.create_cone(gb, cap_ends=True, segments=16, radius1=rr * 0.75, radius2=rr * 0.7, depth=PS * 0.05, matrix=base @ M3 @ Matrix.Translation((0, 0, PS * 0.025)))
            add_geo(gb, r, f.material_index if f.material_index in HULL else 0, gtl, 0.95)
        else:  # sensor dome / antenna
            rr = min(wu, wv) * rng.uniform(0.12, 0.22)
            r = bmesh.ops.create_uvsphere(gb, u_segments=10, v_segments=6, radius=rr, matrix=base @ M3 @ Matrix.Diagonal((1, 1, 0.6, 1)))
            add_geo(gb, r, 1, gtl, 1.0)
            r = bmesh.ops.create_cone(gb, cap_ends=True, segments=6, radius1=rr * 0.12, radius2=rr * 0.04, depth=rr * 3, matrix=base @ M3 @ Matrix.Translation((rr * 1.5, 0, rr * 1.5)))
            add_geo(gb, r, 2, gtl, 0.8)
    # 4. extra lit window rows on side walls
    if cfg['windows'] > 0:
        ww, wh, sp = cfg['win']
        for f in panels:
            if not f.is_valid or f.material_index not in (0, 1, 2): continue
            n = f.normal
            if abs(n.z) > 0.35 or rng.random() > cfg['windows']: continue
            hz = Vector((0, 0, 1)).cross(n); hz = hz.normalized() if hz.length > 1e-6 else Vector((0, 1, 0))
            up = n.cross(hz); c = f.calc_center_median()
            us = [(v.co - c).dot(hz) for v in f.verts]; vs = [(v.co - c).dot(up) for v in f.verts]
            span = min(max(us), -min(us)) * 1.8; hv = min(max(vs), -min(vs)) * 2
            if span < sp * 2 or hv < wh * 2.5: continue
            F = Matrix(((hz.x, up.x, n.x), (hz.y, up.y, n.y), (hz.z, up.z, n.z))).to_4x4()
            rows = 2 if hv > wh * 6 and rng.random() < 0.5 else 1
            for ri in range(rows):
                vz = (ri - (rows - 1) / 2) * wh * 2.4
                k = int(span / sp)
                for i in range(k):
                    if rng.random() < 0.15: continue  # a few dark windows
                    x = -span / 2 + sp * (i + 0.5)
                    r = bmesh.ops.create_cube(gb, size=1.0, matrix=Matrix.Translation(c + n * t * 0.3) @ F @ Matrix.Translation((x, vz, t * 0.4)) @ Matrix.Diagonal((ww, wh, t * 0.8, 1)))
                    add_geo(gb, r, 5, gtl, 1.0)
    # 5. trim stripes: hull/plate faces whose centre lies in a stripe band take the accent stripe slot
    for f in bm.faces:
        if f.material_index in (0, 1):
            y = f.calc_center_median().y
            if any(a <= y <= b for a, b in cfg['stripes']): f.material_index = 7
    bm.normal_update()
    me2 = bpy.data.meshes.new(me.name + '_hi')
    for k in HS: me2.materials.append(hmats[k])  # slots must exist before to_mesh or material indices get clamped to 0
    bm.to_mesh(me2); bm.free()
    meg = bpy.data.meshes.new(me.name + '_greebles')
    for k in HS: meg.materials.append(hmats[k])
    gb.to_mesh(meg); gb.free()
    for m_ in (me2, meg):
        for p in m_.polygons: p.use_smooth = False
    return me2, meg

def emblem_outline(s):
    # stylised winged chevron (faction crest), in a unit box, scaled by s
    pts = [(0, 0.55), (0.18, 0.2), (0.62, 0.42), (1.0, 0.36), (0.55, 0.05), (0.32, -0.12), (0.22, -0.55), (0, -0.32),
           (-0.22, -0.55), (-0.32, -0.12), (-0.55, 0.05), (-1.0, 0.36), (-0.62, 0.42), (-0.18, 0.2)]
    return [(x * s, y * s) for x, y in pts]

def decals(low, cfg, mats_by_slot):
    """hull number + emblem decals: thin flat geometry floating just above the hull, found by ray-casting the low mesh."""
    dg = bpy.context.evaluated_depsgraph_get(); bm = bmesh.new(); bm.from_mesh(low.data); tree = BVHTree.FromBMesh(bm); bm.free()
    L = cfg['L']; objs = []; eps = cfg['panel'] * 0.3  # float above panels + most greebles so the bake ray hits the decal first
    for kind, y, zf, size in cfg['decals']:
        # find the hull wall height range at this y: ray down from above for the top, then side rays
        top = tree.ray_cast(Vector((0, y, L)), Vector((0, 0, -1)), L * 2); bot = tree.ray_cast(Vector((0, y, -L)), Vector((0, 0, 1)), L * 2)
        if top[0] is None or bot[0] is None: continue
        z = bot[0].z + (top[0].z - bot[0].z) * zf
        for side in (1, -1):
            hit = tree.ray_cast(Vector((side * L, y, z)), Vector((-side, 0, 0)), L * 2)
            if hit[0] is None: continue
            p, n = hit[0], hit[1].normalized()
            if n.x * side < 0.3: continue
            up = Vector((0, 0, 1)); up = (up - n * up.dot(n)).normalized(); right = up.cross(n)
            M = Matrix(((right.x, up.x, n.x, 0), (right.y, up.y, n.y, 0), (right.z, up.z, n.z, 0), (0, 0, 0, 1)))
            M = Matrix.Translation(p + n * eps) @ M
            if kind == 'num':
                cu = bpy.data.curves.new('num', 'FONT'); cu.body = cfg['number']; cu.size = size; cu.align_x = 'CENTER'; cu.align_y = 'CENTER'
                ob = bpy.data.objects.new('num', cu); bpy.context.scene.collection.objects.link(ob); ob.matrix_world = M
                dg = bpy.context.evaluated_depsgraph_get(); me = bpy.data.meshes.new_from_object(ob.evaluated_get(dg)); bpy.data.objects.remove(ob)
                o = bpy.data.objects.new('decal_num', me); o.matrix_world = M; me.materials.append(mats_by_slot['K'])
            else:
                me = bpy.data.meshes.new('emb'); bmx = bmesh.new()
                vs = [bmx.verts.new((x, yy, 0)) for x, yy in emblem_outline(size / 2)]; bmx.faces.new(vs)
                # dark outline ring behind the crest
                vs2 = [bmx.verts.new((x * 1.18, yy * 1.18 - size * 0.02, -eps * 0.4)) for x, yy in emblem_outline(size / 2)]; f2 = bmx.faces.new(vs2); f2.material_index = 1
                bmesh.ops.triangulate(bmx, faces=bmx.faces[:]); bmx.to_mesh(me); bmx.free()
                o = bpy.data.objects.new('decal_emb', me); o.matrix_world = M; me.materials.append(mats_by_slot['E']); me.materials.append(mats_by_slot['D'])
            bpy.context.scene.collection.objects.link(o); objs.append(o)
    return objs

# ---------------------------------------------------------------- bake materials (high)
def build_hmat(name):
    m = bpy.data.materials.new('hi_' + name); m.use_nodes = True; return m

def set_mode(hmats, props, mode, L, PS):
    for k, m in hmats.items():
        nt = m.node_tree; nt.nodes.clear(); N = nt.nodes.new; lk = nt.links.new
        out = N('ShaderNodeOutputMaterial'); p = props[k]
        tc = N('ShaderNodeTexCoord')
        def noise(scale, detail=6.0, rough=0.6, w=0.0):
            nz = N('ShaderNodeTexNoise'); nz.noise_dimensions = '4D'; nz.inputs['W'].default_value = w; nz.inputs['Scale'].default_value = scale; nz.inputs['Detail'].default_value = detail; nz.inputs['Roughness'].default_value = rough
            lk(tc.outputs['Object'], nz.inputs['Vector']); return nz
        def rng_(sock, a, b, c, d):
            r = N('ShaderNodeMapRange'); r.clamp = True; r.inputs['From Min'].default_value = a; r.inputs['From Max'].default_value = b; r.inputs['To Min'].default_value = c; r.inputs['To Max'].default_value = d; lk(sock, r.inputs['Value']); return r.outputs['Result']
        def mul(a, b):
            mx = N('ShaderNodeMix'); mx.data_type = 'RGBA'; mx.blend_type = 'MULTIPLY'; mx.inputs['Factor'].default_value = 1.0
            for s_, i in ((a, 'A'), (b, 'B')):
                if isinstance(s_, tuple): mx.inputs[i].default_value = (*s_[:3], 1)
                else: lk(s_, mx.inputs[i])
            return mx.outputs['Result']
        def tint():
            at = N('ShaderNodeAttribute'); at.attribute_name = 'Tint'; at.attribute_type = 'GEOMETRY'; return at.outputs['Color']
        def albedo():
            col = (*p['c'],)
            if k in ('K', 'E'): return mul(col, (1, 1, 1))
            c1 = mul(col, tint())
            g = rng_(noise(1 / (PS * 7), 6, 0.62).outputs['Fac'], 0.52, 0.72, 1.0, 0.7)  # grime patches
            st = noise(1 / (PS * 2.5), 3, 0.5, 3.1); s2 = rng_(st.outputs['Fac'], 0.45, 0.75, 1.0, 0.86)  # fine streak/dirt
            c2 = mul(c1, None) if False else c1
            gg = N('ShaderNodeMath'); gg.operation = 'MULTIPLY'; lk(g, gg.inputs[0]); lk(s2, gg.inputs[1])
            cc = N('ShaderNodeCombineColor'); [lk(gg.outputs[0], cc.inputs[i]) for i in range(3)]
            return mul(c2, cc.outputs['Color'])
        def emit(sock_or_col):
            em = N('ShaderNodeEmission'); em.inputs['Strength'].default_value = 1.0
            if isinstance(sock_or_col, tuple): em.inputs['Color'].default_value = (*sock_or_col[:3], 1)
            else: lk(sock_or_col, em.inputs['Color'])
            lk(em.outputs[0], out.inputs['Surface'])
        if mode == 'albedo': emit(albedo())
        elif mode == 'mask':
            ch = PAINT.get(k); emit(tuple(1.0 if ch == i else 0.0 for i in range(3)))
        elif mode == 'mask2': emit((1.0 if PAINT.get(k) == 3 else 0.0, 0, 0))
        elif mode == 'orm':
            rr = rng_(noise(1 / (PS * 3), 4, 0.5, 7.0).outputs['Fac'], 0.3, 0.7, p['r'] * 0.8, min(1, p['r'] * 1.25))
            cc = N('ShaderNodeCombineColor'); cc.inputs['Red'].default_value = 0; lk(rr, cc.inputs['Green']); cc.inputs['Blue'].default_value = p['m']
            emit(cc.outputs['Color'])
        elif mode == 'emit': emit(p['e'] or (0, 0, 0))
        elif mode == 'curv':
            gm = N('ShaderNodeNewGeometry'); wn = noise(1 / (PS * 1.2), 8, 0.7, 11.0)
            cc = N('ShaderNodeCombineColor'); lk(gm.outputs['Pointiness'], cc.inputs['Red']); lk(wn.outputs['Fac'], cc.inputs['Green']); cc.inputs['Blue'].default_value = 0
            emit(cc.outputs['Color'])
        elif mode == 'beauty':
            b = N('ShaderNodeBsdfPrincipled'); lk(albedo(), b.inputs['Base Color']); b.inputs['Metallic'].default_value = p['m']; b.inputs['Roughness'].default_value = p['r']
            if p['e']: b.inputs['Emission Color'].default_value = (*p['e'], 1); b.inputs['Emission Strength'].default_value = 6.0 if k == 'G' else 3.0 if k == 'W' else 0.6
            lk(b.outputs[0], out.inputs['Surface'])

# ---------------------------------------------------------------- bake
def new_img(name, size):
    im = bpy.data.images.get(name)
    if im: bpy.data.images.remove(im)
    return bpy.data.images.new(name, size, size, alpha=False, float_buffer=True, is_data=True)

def bake(kind, img, low, highs, cfg, samples=4, margin=6):
    sc = bpy.context.scene; sc.cycles.samples = samples
    for m in low.data.materials:
        nt = m.node_tree; n = nt.nodes.get('BAKE') or nt.nodes.new('ShaderNodeTexImage'); n.name = 'BAKE'; n.image = img
        for x in nt.nodes: x.select = False
        n.select = True; nt.nodes.active = n
    bpy.ops.object.select_all(action='DESELECT')
    for h in highs: h.hide_render = False; h.select_set(True)
    low.select_set(True); bpy.context.view_layer.objects.active = low
    PS = cfg['panel']; b = sc.render.bake
    b.use_selected_to_active = True; b.cage_extrusion = PS * cfg['ext']; b.max_ray_distance = PS * cfg['ext'] * 2.2; b.margin = margin; b.margin_type = 'EXTEND'
    b.normal_space = 'TANGENT'; b.use_clear = True; b.target = 'IMAGE_TEXTURES'
    bpy.ops.object.bake(type=kind)
    return np.array(img.pixels[:], dtype=np.float32).reshape(img.size[1], img.size[0], 4)

def srgb(x):
    x = np.clip(x, 0, 1); return np.where(x <= 0.0031308, x * 12.92, 1.055 * np.power(x, 1 / 2.4) - 0.055)

def save_png(arr, path, alpha=None):
    from PIL import Image
    a = (np.clip(arr, 0, 1) * 255 + 0.5).astype(np.uint8)[::-1]  # blender pixels start bottom-left
    if alpha is not None: a = np.dstack([a, (np.clip(alpha, 0, 1) * 255 + 0.5).astype(np.uint8)[::-1]])
    Image.fromarray(a).save(path)

# ---------------------------------------------------------------- main
def main(ship):
    cfg = CFG[ship]; mod = importlib.import_module(ship); rng = random.Random(77)
    if cfg['view']: kit.CONCEPT_VIEW[0] = Vector(cfg['view'])
    if cfg['dist']: kit.CONCEPT_VIEW[1] = cfg['dist']
    kit.reset(); mats = make_materials(mod.PAL); s = mod.build(); low, tris = s.finish(mats, tile=cfg['tile'])
    L = cfg['L']; S = cfg['size']; PS = cfg['panel']
    sc = bpy.context.scene; sc.render.engine = 'CYCLES'; sc.cycles.device = 'CPU'
    if os.environ.get('BT_THREADS'): sc.render.threads_mode = 'FIXED'; sc.render.threads = int(os.environ['BT_THREADS'])
    w = bpy.data.worlds.new('w'); sc.world = w; w.light_settings.distance = PS * 3.5
    # high-poly copy BEFORE the low gets its new UVs (high needs no UVs)
    props = slot_props(mod.PAL, cfg['emblem']); hmats = {k: build_hmat(k) for k in HS}
    hme, gme = detail(low.data, cfg, rng, hmats)
    high = bpy.data.objects.new(ship + '_high', hme); sc.collection.objects.link(high)
    grb = bpy.data.objects.new(ship + '_greebles', gme); sc.collection.objects.link(grb)
    dec = decals(low, cfg, hmats) + [grb]
    hi_tris = sum(len(p.vertices) - 2 for p in hme.polygons) + sum(sum(len(p.vertices) - 2 for p in d.data.polygons) for d in dec)
    print('LOW TRIS', tris, 'HIGH TRIS', hi_tris, flush=True)
    # low: clean non-overlapping unwrap
    bpy.ops.object.select_all(action='DESELECT'); low.select_set(True); bpy.context.view_layer.objects.active = low
    me = low.data; uvb = me.uv_layers.new(name='Bake'); me.uv_layers.active = uvb
    bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.uv.smart_project(angle_limit=math.radians(55), island_margin=4.0 / S * 1.5, area_weight=0.0, scale_to_bounds=True)
    try: bpy.ops.uv.pack_islands(rotate=True, margin=4.0 / S)
    except Exception as e: print('pack skipped', e)
    bpy.ops.object.mode_set(mode='OBJECT')
    me.uv_layers.remove(me.uv_layers['UVMap']); me.uv_layers.active = me.uv_layers['Bake']; me.uv_layers['Bake'].active_render = True
    highs = [high] + dec
    od = os.path.join(ROOT, 'out', 'tex', ship); os.makedirs(od, exist_ok=True)
    import time; T0 = time.time()
    def lap(msg): print(f'[{time.time() - T0:6.1f}s] {msg}', flush=True)
    nrm = bake('NORMAL', new_img('nrm', S), low, highs, cfg, samples=4); lap('normal')
    set_mode(hmats, props, 'albedo', L, PS); alb = bake('EMIT', new_img('alb', S), low, highs, cfg, samples=4); lap('albedo')
    set_mode(hmats, props, 'mask', L, PS); msk = bake('EMIT', new_img('msk', S), low, highs, cfg, samples=1, margin=2); lap('mask')
    set_mode(hmats, props, 'mask2', L, PS); msk2 = bake('EMIT', new_img('msk2', S), low, highs, cfg, samples=1, margin=2); lap('mask2')
    set_mode(hmats, props, 'orm', L, PS); orm = bake('EMIT', new_img('orm', S), low, highs, cfg, samples=2); lap('orm')
    set_mode(hmats, props, 'emit', L, PS); emi = bake('EMIT', new_img('emi', S), low, highs, cfg, samples=4); lap('emit')
    set_mode(hmats, props, 'curv', L, PS); cur = bake('EMIT', new_img('cur', S), low, highs, cfg, samples=4); lap('curvature')
    set_mode(hmats, props, 'albedo', L, PS); ao = bake('AO', new_img('ao', S), low, highs, cfg, samples=int(os.environ.get('AO_SAMPLES', 24))); lap('ao')
    # ---- compose
    A = ao[..., 0]; A = np.clip(A, 0, 1)
    pnt = cur[..., 0]; wn = cur[..., 1]
    paint = np.clip(msk[..., 0] + msk[..., 1] + msk[..., 2] + msk2[..., 0], 0, 1)
    edge = np.clip((pnt - 0.53) * 14, 0, 1)
    wear = np.clip(edge * np.clip((wn - 0.38) * 3.5, 0, 1) * 1.2, 0, 1) * paint
    bare = np.array([0.42, 0.43, 0.45], np.float32)
    rgb = alb[..., :3] * (0.42 + 0.58 * A)[..., None]
    rgb = rgb * (1 - wear[..., None] * 0.75) + bare * wear[..., None] * 0.75
    rough = np.clip(orm[..., 1] * (1 - 0.35 * wear), 0.04, 1); metal = np.clip(orm[..., 2] + (0.95 - orm[..., 2]) * wear, 0, 1)
    ORM = np.dstack([A, rough, metal])
    save_png(srgb(rgb), os.path.join(od, 'albedo.png'))
    save_png(nrm[..., :3], os.path.join(od, 'normal.png'))
    save_png(ORM, os.path.join(od, 'orm.png'))
    save_png(srgb(emi[..., :3]), os.path.join(od, 'emissive.png'))
    save_png(np.dstack([msk[..., 0], msk[..., 1], msk[..., 2]]), os.path.join(od, 'mask.png'), alpha=msk2[..., 0])
    save_png(np.dstack([pnt, wear, A]), os.path.join(od, 'curv-wear-ao.png'))
    lap('composed')
    # ---- textured low material for export + the baked-result render
    def img(n, data):
        im = bpy.data.images.load(os.path.join(od, n)); im.colorspace_settings.name = 'sRGB' if data is False else 'Non-Color'; return im
    T = bpy.data.materials.new('TEX'); T.use_nodes = True; nt = T.node_tree; b = nt.nodes['Principled BSDF']; N = nt.nodes.new; lk = nt.links.new
    ta = N('ShaderNodeTexImage'); ta.image = img('albedo.png', False); lk(ta.outputs['Color'], b.inputs['Base Color'])
    tn = N('ShaderNodeTexImage'); tn.image = img('normal.png', True); nm = N('ShaderNodeNormalMap'); lk(tn.outputs['Color'], nm.inputs['Color']); lk(nm.outputs['Normal'], b.inputs['Normal'])
    to = N('ShaderNodeTexImage'); to.image = img('orm.png', True); sp = N('ShaderNodeSeparateColor'); lk(to.outputs['Color'], sp.inputs['Color'])
    lk(sp.outputs['Green'], b.inputs['Roughness']); lk(sp.outputs['Blue'], b.inputs['Metallic'])
    # glTF occlusion: the exporter picks it up from a 'glTF Material Output' group's Occlusion input
    g = bpy.data.node_groups.get('glTF Material Output') or bpy.data.node_groups.new('glTF Material Output', 'ShaderNodeTree')
    if 'Occlusion' not in [i.name for i in g.interface.items_tree]: g.interface.new_socket('Occlusion', in_out='INPUT', socket_type='NodeSocketFloat')
    gn = N('ShaderNodeGroup'); gn.node_tree = g; lk(sp.outputs['Red'], gn.inputs['Occlusion'])
    te = N('ShaderNodeTexImage'); te.image = img('emissive.png', False); lk(te.outputs['Color'], b.inputs['Emission Color']); b.inputs['Emission Strength'].default_value = 1.0
    me.materials.clear(); me.materials.append(T)
    for d in dec: d.hide_render = True; d.hide_set(True)
    high.hide_render = True; high.hide_set(True)
    # export: positions/normals/tangents/uv only (no vertex colours: AO is in the maps now)
    bpy.ops.object.select_all(action='DESELECT'); low.select_set(True)
    for c in low.children: c.select_set(True)
    raw = os.path.join(od, ship + '-raw.glb')
    bpy.ops.export_scene.gltf(filepath=raw, export_format='GLB', export_yup=True, export_apply=True, use_selection=True, export_extras=True, export_cameras=False, export_lights=False,
                              export_vertex_color='NONE', export_tangents=True, export_image_format='AUTO')
    lap('exported raw glb')
    post(ship, raw, S)
    if '--render' in sys.argv:
        shots = os.path.join(ROOT, 'shots', 'tex'); os.makedirs(shots, exist_ok=True)
        kit.render(low, os.path.join(shots, f'{ship}-baked-lowpoly.png'), L, view='concept', samples=48)
        low.hide_render = True; high.hide_render = False
        for d in dec: d.hide_render = False
        set_mode(hmats, props, 'beauty', L, PS)
        kit.render(high, os.path.join(shots, f'{ship}-cycles-beauty.png'), L, view='concept', samples=64)
        lap('renders')

def post(ship, raw, S):
    env = dict(os.environ, PATH=KTXBIN + ':' + os.environ['PATH'], LD_LIBRARY_PATH=os.path.join(KTXBIN, '..', 'lib'))
    od = os.path.dirname(raw); dst = os.path.join(ROOT, 'out', 'tex')
    def gt(*a): r = subprocess.run([GT, *a], env=env, capture_output=True, text=True); print('gt', a[0], r.returncode, r.stderr[-400:] if r.returncode else ''); return r.returncode == 0
    for tag, size in (('', S), ('-half', S // 2)):
        src = raw
        if tag:
            src = os.path.join(od, 'half.glb'); gt('resize', raw, src, '--width', str(size), '--height', str(size))
        k = os.path.join(od, 'k' + tag + '.glb')
        # UASTC for normal maps (no block artefacts on seams), ETC1S for colour/ORM/emissive (much smaller)
        ok = gt('uastc', src, os.path.join(od, 'u.glb'), '--slots', 'normalTexture', '--level', '2', '--rdo', '--rdo-lambda', '2.5', '--zstd', '18') and \
             gt('etc1s', os.path.join(od, 'u.glb'), k, '--quality', '170')
        w = os.path.join(od, 'w' + tag + '.glb'); gt('webp', src, w, '--quality', '88')
        for which, f in (('ktx', k if ok else None), ('webp', w)):
            if f and os.path.exists(f): gt('meshopt', f, os.path.join(dst, f'{ship}{tag}.{which}.glb'), '--level', 'medium')
    from PIL import Image
    m = Image.open(os.path.join(od, 'mask.png'))
    m.save(os.path.join(dst, f'{ship}-mask.webp'), quality=90, method=6); m.resize((S // 2, S // 2), Image.LANCZOS).save(os.path.join(dst, f'{ship}-half-mask.webp'), quality=90, method=6)
    for f in sorted(os.listdir(dst)):
        if f.startswith(ship): print('OUT', f, os.path.getsize(os.path.join(dst, f)) // 1024, 'KB')

if __name__ == '__main__':
    main(sys.argv[1])

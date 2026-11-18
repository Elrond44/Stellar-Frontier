"""v14 asteroid set: unit-radius rocks, hi + lo LOD, one glb (asteroids.glb). Objects are named <variant>_hi / <variant>_lo.
Slots: K rock (aGlow 0), X glow (crystals / veins / cracks / cavern light -> aGlow 1, tinted by the mineral in game),
N gold nuggets. The game's rock shader still adds noise detail, damage darkening and hit flashes on top.
Variants -> minerals (game side, src/glbenv.js): molten=ferrite, veined=viridium, cavern=voidstone, nugget=ferrite/crimsonite,
lumpy/porous for all; crystal_a/b/c are the 'rich' crystal-cluster rocks."""
import sys, os, math, random
import bpy, bmesh
sys.path.insert(0, os.path.dirname(__file__))
from mathutils import Vector, noise, Matrix
from env_kit import Env, env_materials, export, shoot, space_world, OUT, SHOTS, K, X, N

def crack(o, th, scale, o2=None, th2=0.0, scale2=1.0, patch=None):
    def f(n, face):
        if abs(noise.noise(n * scale + Vector(o))) < th: return X
        if o2 and abs(noise.noise(n * scale2 + Vector(o2))) < th2: return X
        if patch is not None and noise.noise(n * 3.3 + Vector(o)) > patch: return X
        return None
    return f
def dent(o, th, scale, depth):
    return lambda n: -depth * max(0.0, 1 - abs(noise.noise(n * scale + Vector(o))) / (th * 1.6))

def cavern(s, sub, seed):
    """rock with a tunnel through it (concept: the holed rock); the tunnel wall glows in patches (voidstone light)."""
    bm = s.bm; od = Vector((0.25, -0.9, 0.35)).normalized()
    vo, fo = s.rock((0, 0, 0), (1.15, 0.9, 0.85), seed, K, sub, 0.22, 3, pitsmall=8, facets=7)
    fo = list(fo); vset = list({v for f in fo for v in f.verts}); eset = list({e for f in fo for e in f.edges})
    dup = bmesh.ops.duplicate(bm, geom=vset + eset + fo); vm = dup['vert_map']; fm = dup['face_map']
    for v in vset:
        n = v.co.normalized(); ax = abs(n.dot(od)); w = 0.6 + 0.12 * ax + noise.noise(n * 2.5 + Vector((3, 3, 3))) * 0.06
        vm[v].co = v.co * w
    for f in fo:
        nf = fm[f]; c = (sum((v.co for v in nf.verts), Vector()) / len(nf.verts)).normalized()
        if noise.noise(c * 3.1 + Vector((4, 1, 7))) > 0.1: nf.material_index = X
    kill = lambda f: abs((sum((v.co for v in f.verts), Vector()) / len(f.verts)).normalized().dot(od)) > math.cos(0.68)
    ko = [f for f in fo if kill(f)]; ks = set(ko); ki = [fm[f] for f in ko]
    edges = []
    for f in ko:
        for e in f.edges:
            if sum(1 for lf in e.link_faces if lf in ks) == 1:
                other = [lf for lf in e.link_faces if lf not in ks][0]
                lp = [l for l in other.loops if l.edge == e][0]; edges.append((lp.vert, lp.link_loop_next.vert))
    inner = set(fm[f] for f in fo) - set(ki)
    bmesh.ops.delete(bm, geom=ko + ki, context='FACES_ONLY')
    for a_, b_ in edges:
        try: f = bm.faces.new((b_, a_, vm[a_], vm[b_])); f.material_index = K
        except ValueError: pass
    bmesh.ops.reverse_faces(bm, faces=list(inner))

def build(v, lod):
    sub = 5 if lod == 'hi' else 3; seed = sum(map(ord, v)) * 7
    s = Env(f'{v}_{lod}', 2.0, seed=seed); ps = 16 if lod == 'hi' else 0
    if v == 'lumpy_a': s.rock((0, 0, 0), (1.35, 0.88, 0.76), seed, K, sub, 0.26, 4, pits=7, pitsmall=ps)
    elif v == 'lumpy_b': s.rock((0, 0, 0), (1.35, 0.8, 0.7), seed, K, sub, 0.24, 5, pitsmall=ps, facets=11)
    elif v == 'porous': s.rock((0, 0, 0), (1.4, 0.9, 0.8), seed, K, sub + (1 if lod == 'hi' else 0), 0.16, 0, pits=40, pitsmall=ps, facets=7) if True else s.rock((0, 0, 0), (1.4, 0.9, 0.8), seed, K, sub, 0.16, 0, pits=26, pitsmall=ps, facets=7)
    elif v == 'molten': s.rock((0, 0, 0), (1.1, 0.9, 0.82), seed, K, sub + (1 if lod == 'hi' else 0), 0.26, 3, pitsmall=ps // 2,
                              glow=crack((3, 9, 1), 0.04 if lod == 'hi' else 0.1, 1.7, (8, 1, 4), 0.025 if lod == 'hi' else 0.06, 3.3), glow_dent=dent((3, 9, 1), 0.08, 1.7, 0.08))
    elif v == 'veined': s.rock((0, 0, 0), (1.2, 0.88, 0.78), seed, K, sub + (1 if lod == 'hi' else 0), 0.26, 4, pitsmall=ps // 2,
                              glow=crack((7, 2, 5), 0.03 if lod == 'hi' else 0.07, 2.2, patch=0.45), glow_dent=dent((7, 2, 5), 0.05, 2.2, 0.03))
    elif v == 'nugget':
        s.rock((0, 0, 0), (1.1, 0.9, 0.84), seed, K, sub, 0.26, 4, pitsmall=ps); rr = random.Random(seed)
        for i in range(12):
            d = Vector((rr.uniform(-1, 1), rr.uniform(-1, 1), rr.uniform(-0.3, 1))).normalized(); L = rr.uniform(0.16, 0.3)
            s.crystal(tuple(Vector((d.x * 0.92, d.y * 0.78, d.z * 0.72))), d, L, L * 0.55, N, seg=5)
    elif v == 'cavern': cavern(s, sub, seed)
    else:  # crystal_a/b/c/d (v15): rich rocks encrusted with sharp gems, one style per mineral family
        k = 'abcd'.index(v[-1]); style = ('hex', 'cube', 'amethyst', 'emerald')[k]
        s.rock((0, 0, 0), (1.05, 0.82, 0.72), seed, K, sub, 0.24, 3, pitsmall=ps // 2); rr = random.Random(seed)
        sites = 13 if lod == 'hi' else 8
        for c in range(sites):  # gems dominate the upper two thirds (concept: rock barely visible under the crystals)
            d = Vector((rr.uniform(-1, 1), rr.uniform(-1, 1) * 0.8, rr.uniform(-0.25, 1))).normalized()
            p0 = Vector((d.x * 0.9, d.y * 0.68, d.z * 0.6))
            size = {'hex': 0.75, 'cube': 0.75, 'amethyst': 0.6, 'emerald': 0.62}[style] * rr.uniform(0.75, 1.15)
            n = {'hex': 5, 'cube': 3, 'amethyst': 11, 'emerald': 4}[style] if lod == 'hi' else {'hex': 3, 'cube': 2, 'amethyst': 4, 'emerald': 2}[style]
            s.gem_cluster(p0, d, n, size, style, X, 0.5 if style != 'amethyst' else 0.35, 1.0)
    return s

VARIANTS = ['lumpy_a', 'lumpy_b', 'porous', 'cavern', 'molten', 'veined', 'nugget', 'crystal_a', 'crystal_b', 'crystal_c', 'crystal_d']

if __name__ == '__main__':
    from env_kit import reset
    reset(); mats = env_materials(xglow=(0.5, 1.9, 3.6)); objs = {}
    for v in VARIANTS:
        for lod in ('hi', 'lo'):
            s = build(v, lod); ob, tris = s.finish(mats, tile=1.0)
            if lod == 'hi':
                # keep glow seams (crack/vein borders) sharp: only rock away from them is collapsed
                me = ob.data; xi = [i for i, sl in enumerate(me.materials) if sl.name in ('X', 'N')]
                near = set()
                for p_ in me.polygons:
                    if p_.material_index in xi: near.update(p_.vertices)
                vg = ob.vertex_groups.new(name='dec'); vg.add([i for i in range(len(me.vertices)) if i not in near], 1.0, 'REPLACE')
                m = ob.modifiers.new('dec', 'DECIMATE'); m.vertex_group = 'dec'; m.vertex_group_factor = 1.0; m.ratio = 0.22 if v in ('porous', 'molten', 'veined') else 0.75 if v == 'cavern' else 0.5
            objs[ob.name] = ob
    export('asteroids', list(objs.values()), normals=False, uvs=False)  # the rock shader is flat shaded
    dg = bpy.context.evaluated_depsgraph_get()
    for n, ob in objs.items():
        e = ob.evaluated_get(dg); print('TRIS', n, sum(len(p.vertices) - 2 for p in e.data.polygons))
    if '--render' in sys.argv:
        space_world(1.0); from env_kit import rock_detail; rock_detail(1.0)
        # glow colour per showcase rock (in game it comes from the mineral)
        tint = {'crystal_a': (0.3, 1.4, 3.6), 'nugget': (3.4, 2.0, 0.3), 'molten': (3.6, 1.0, 0.12), 'veined': (0.6, 3.4, 1.0), 'cavern': (2.2, 0.9, 3.6), 'crystal_d': (0.3, 3.6, 0.9), 'crystal_b': (3.4, 2.4, 0.5), 'crystal_c': (2.4, 0.9, 3.6)}
        lo = [o for n, o in objs.items() if n.endswith('_lo')]
        for o in lo: o.hide_render = True
        hi = [objs[v + '_hi'] for v in VARIANTS]
        for i, v in enumerate(VARIANTS):
            ob = objs[v + '_hi']
            if v in tint:  # per-object glow copy of X
                m = bpy.data.materials['X'].copy(); b = m.node_tree.nodes['Principled BSDF']; c = tint[v]; mx = max(c)
                gem = v.startswith('crystal'); sat = lambda x: (x / mx) ** (2.2 if gem else 1)
                b.inputs['Emission Color'].default_value = (sat(c[0]), sat(c[1]), sat(c[2]), 1); b.inputs['Emission Strength'].default_value = (0.07 if gem else 0.32) * mx; k = 0.5 if v == 'crystal_d' else 0.85; b.inputs['Base Color'].default_value = (sat(c[0]) * k, sat(c[1]) * k, sat(c[2]) * k, 1); b.inputs['Roughness'].default_value = 0.06 if gem else 0.15
                if v == 'crystal_d': b.inputs['Emission Strength'].default_value = 0.035 * mx
                for j, sl in enumerate(ob.material_slots):
                    if sl.material and sl.material.name == 'X': ob.material_slots[j].link = 'OBJECT'; ob.material_slots[j].material = m
        # single shots
        for o in hi: o.hide_render = True
        for v in (sys.argv[sys.argv.index('--only') + 1].split(',') if '--only' in sys.argv else [] if '--sheets' in sys.argv else VARIANTS):
            ob = objs[v + '_hi']; ob.hide_render = False; ob.location = (0, 0, 0)
            shoot([ob], os.path.join(SHOTS, f'asteroid-{v}.png'), view=(0.3, -0.9, 0.4) if v == 'cavern' else (0.62, -0.55, 0.42), res=(800, 800), samples=32, dist=0.75)
            ob.hide_render = True
        # contact sheet: 5 x 2 grid
        for i, v in enumerate(VARIANTS):
            ob = objs[v + '_hi']; ob.hide_render = False; ob.location = ((i % 6 - 2.5) * 2.9, 0, (1 - i // 6) * 2.7 - 1.35); ob.rotation_euler = (0.3, 0.2, i * 0.7)
        shoot(hi, os.path.join(SHOTS, 'sheet-asteroids.png'), view=(0.0, -1, 0.12), res=(1600, 800), samples=40, dist=0.55, rad=8.0)

        # crystal colour sheet: the rich rocks tinted like the concept's blue / gold / green / purple crystals
        for o in hi: o.hide_render = True
        row = ['crystal_a', 'crystal_b', 'crystal_d', 'crystal_c']
        for i, v in enumerate(row):
            ob = objs[v + '_hi']; ob.hide_render = False; ob.location = ((i - 1.5) * 3.0, 0, 0); ob.rotation_euler = (0.25, 0.1, 0.4 + i * 0.5)
        shoot([objs[v + '_hi'] for v in row], os.path.join(SHOTS, 'sheet-crystals.png'), view=(0.0, -1, 0.3), res=(1600, 600), samples=40, dist=0.42, rad=6.2)

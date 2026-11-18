"""v15 ore pickups (pickups.glb): small rock chips crusted with sharp gems, one style per mineral family.
Objects ore_hex (stellarite / crimsonite), ore_cube (ferrite), ore_emerald (viridium), ore_amethyst (voidstone).
Units = game units (the old pickup gem was ~0.5 tall). Slots: K chip (dark in game), X gem (instance mineral colour + glow)."""
import sys, os, math, random
import bpy
sys.path.insert(0, os.path.dirname(__file__))
from mathutils import Vector
from env_kit import Env, env_materials, export, shoot, space_world, OUT, SHOTS, K, X

STYLES = ['hex', 'cube', 'emerald', 'amethyst']
def build(style):
    s = Env('ore_' + style, 0.6, seed=11 + STYLES.index(style) * 7); rr = random.Random(5 + STYLES.index(style))
    s.rock((0, 0, -0.08), (0.24, 0.2, 0.15), 40 + STYLES.index(style), K, 1, 0.3, 0, facets=5)
    n = {'hex': 5, 'cube': 3, 'emerald': 4, 'amethyst': 7}[style]
    size = {'hex': 0.5, 'cube': 0.34, 'emerald': 0.42, 'amethyst': 0.34}[style]
    for i in range(n):
        d = Vector((rr.uniform(-0.6, 0.6), rr.uniform(-0.6, 0.6), 1)).normalized() if i else Vector((0, 0, 1))
        L = size * (1.0 if i == 0 else rr.uniform(0.5, 0.8)); w = {'hex': 0.2, 'cube': 0.3, 'emerald': 0.3, 'amethyst': 0.3}[style]
        s.gem((d.x * 0.1, d.y * 0.1, 0.0), d, L, L * w, style, X)
    return s

if __name__ == '__main__':
    from env_kit import reset
    reset(); mats = env_materials(); objs = []
    for st in STYLES:
        ob, tris = build(st).finish(mats, 1.0); print('TRIS', ob.name, tris); objs.append(ob)
    export('pickups', objs, normals=False, uvs=False)
    if '--render' in sys.argv:
        space_world(1.0)
        tint = {'hex': (0.3, 1.4, 3.6), 'cube': (3.4, 2.3, 0.45), 'emerald': (0.25, 2.6, 0.8), 'amethyst': (2.2, 0.7, 3.6)}
        for i, (st, ob) in enumerate(zip(STYLES, objs)):
            ob.location = ((i - 1.5) * 0.9, 0, 0)
            m = bpy.data.materials['X'].copy(); b = m.node_tree.nodes['Principled BSDF']; c = tint[st]; mx = max(c); sat = lambda x: (x / mx) ** 2.2
            b.inputs['Emission Color'].default_value = (sat(c[0]), sat(c[1]), sat(c[2]), 1); b.inputs['Emission Strength'].default_value = 0.25 * mx
            k = 0.42 if st == 'emerald' else 0.7; b.inputs['Base Color'].default_value = (sat(c[0]) * k, sat(c[1]) * k, sat(c[2]) * k, 1)
            if st == 'emerald': b.inputs['Emission Strength'].default_value = 0.12 * mx; b.inputs['Roughness'].default_value = 0.06
            for j, sl in enumerate(ob.material_slots):
                if sl.material and sl.material.name == 'X': ob.material_slots[j].link = 'OBJECT'; ob.material_slots[j].material = m
        shoot(objs, os.path.join(SHOTS, 'sheet-pickups.png'), view=(0.0, -1, 0.45), res=(1400, 500), samples=32, dist=0.5)

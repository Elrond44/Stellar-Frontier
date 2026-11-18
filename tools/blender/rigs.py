"""v15 mining-rig asteroids (rigs.glb), from env-concepts-1 row 2 / env-concepts-3:
  rig_pit     open-pit mine: terraced bowl lit amber, crane jib, conveyor to a side processing deck  (game: Resource Facility core)
  rig_drill   crystal drill rig: blue crystal mass erupting from a crack, drill derrick, walkway decks + modules (set dressing)
  rig_tunnel  tunnel hangar: a hangar hall bored into the rock, landing deck out front (set dressing)
  rig_colony  dome colony: glass domes with greenery on a rock plateau, towers, solar boom (set dressing)
Units: rig_pit matches the Resource Facility footprint (radius ~4.6, game local); the others are built at the same scale and
the game scales them up as distant set dressing. Same slots as pirate.py (+ K rock, X glow)."""
import sys, os, math, random
import bpy
sys.path.insert(0, os.path.dirname(__file__))
from mathutils import Vector, Matrix, noise
from env_kit import env_materials, export, shoot, space_world, rock_detail, SHOTS, H, P, D, A, C, W, G, R, S, V, K, X, N, E
from pirate import Pi
from station import Rz
import pirate as _pi, station as _st
from kit import T

def flatten(vs, c, rim_z, rb, inner_z=None, inner_r=None):
    """carve the rock top: plateau at rim_z within rb, optional bowl floor at inner_z within inner_r."""
    for v in vs:
        dx, dy = v.co.x - c[0], v.co.y - c[1]; r = math.hypot(dx, dy)
        if v.co.z > rim_z and r < rb: v.co.z = rim_z - 0.05 * noise.noise(v.co * 2.0)
        if inner_z is not None and r < inner_r and v.co.z > inner_z: v.co.z = inner_z

def pit():
    s = Pi('rig_pit', 6.0, seed=31)
    vs, fs = s.rock((0, 0, 0), (4.6, 3.8, 2.2), 77, K, 4, 0.25, 4, pits=5, facets=8)
    flatten(vs, (0.3, 0.2), 1.1, 3.6, 0.3, 3.2)
    # terraced bowl: stepped rings down to a glowing floor (concept: amber-lit terraces)
    prof = []; rr = 3.2; z = 1.15
    for k in range(5):
        prof += [(rr, z), (rr - 0.32, z)]; z -= 0.42; prof += [(rr - 0.32, z)]; rr -= 0.55
    s.lathe((0.3, 0.2, 0), [(r_, z_) for r_, z_ in prof], K, 24, cap0=False, cap1=True)
    for k in range(5):
        r_ = 3.2 - k * 0.55 - 0.16; zz = 1.15 - k * 0.42 + 0.02
        for i in range(16 - k * 2):
            a = 2 * math.pi * i / (16 - k * 2) + k * 0.3
            if (i + k) % 3: s.box((0.3 + math.cos(a) * r_, 0.2 + math.sin(a) * r_, zz), (0.22, 0.22, 0.07), W)
            elif k < 4: s.box((0.3 + math.cos(a) * (r_ - 0.1), 0.2 + math.sin(a) * (r_ - 0.1), zz + 0.2), (0.3, 0.3, 0.35), s.rng.choice((D, H, A)), ch=0.03)
    s.lathe((0.3, 0.2, z + 0.06), [(rr + 0.25, 0), (rr + 0.25, 0.04)], W, 20)  # glowing ore floor
    for i in range(7):
        a = i * 0.9; s.rock((0.3 + math.cos(a) * 0.6, 0.2 + math.sin(a) * 0.5, z + 0.15), (0.28, 0.24, 0.18), 400 + i, N, 1, 0.3, 0, facets=0)
    # crane jib on the rim
    s.truss((-2.6, 1.8, 1.0), (-2.6, 1.8, 3.6), 0.4, 0.06, A, bays=4); s.box((-2.6, 1.8, 3.7), (0.7, 0.7, 0.3), D)
    s.truss((-2.6, 1.8, 3.9), (-0.4, 0.6, 3.9), 0.35, 0.05, A); s.tube((-0.6, 0.7, 3.8), (-0.6, 0.7, 1.4), 0.025, D, 4); s.box((-0.6, 0.7, 1.3), (0.35, 0.35, 0.25), D)
    s.empty('navr', (-2.6, 1.8, 4.0), 0.9)
    # conveyor out of the pit to a side processing deck hanging off the rock (game +z side = -Y)
    s.truss((0.6, -1.2, 0.5), (1.6, -4.2, 0.9), 0.35, 0.05, D); s.box((1.1, -2.7, 0.95), (0.25, 3.2, 0.06), A, M=None)
    s.box((1.4, -4.6, 0.6), (4.2, 2.0, 0.4), D, ch=0.08); s.box((1.4, -4.6, 0.83), (4.3, 2.1, 0.06), A)
    s.module(T(0.6, -4.7, 1.4), 1.4, 1.4, 1.2, red=1, greeb=2); s.module(T(2.4, -4.4, 1.3), 1.2, 1.6, 1.0, greeb=2)
    s.tank((3.6, -3.9, 0.8), 0.45, 1.4)
    for x in (-0.2, 1.4, 3.0): s.tube((x, -5.4, 0.4), (x, -5.4, -1.2), 0.12, D, 6); s.empty('navR', (x, -5.4, -1.3), 0.7)
    for i in range(6): s.box((-0.2 + i * 0.7, -5.62, 0.6), (0.3, 0.05, 0.12), W)
    s.module(T(-3.2, -1.4, 1.5), 1.2, 1.2, 1.0, red=0, greeb=1); s.module(T(2.9, 2.2, 1.45), 1.0, 1.4, 0.9, greeb=1)
    return s, []

def drill():
    s = Pi('rig_drill', 6.0, seed=32)
    vs, fs = s.rock((0, 0, 0), (4.4, 3.4, 2.4), 91, K, 4, 0.3, 4, pits=6, facets=8)
    flatten(vs, (2.2, 0.0), 1.2, 2.4)
    s.gem_cluster((-1.0, 0.3, 1.2), (0.1, 0.0, 1), 13, 2.3, 'hex', X, 0.5, 1.0)     # blue crystal mass from the crack
    s.gem_cluster((-1.6, -0.9, 0.6), (-0.4, -0.6, 0.6), 5, 1.5, 'hex', X, 0.5, 1.0)
    s.gem_cluster((-0.3, -1.4, 0.4), (0.2, -0.9, 0.4), 4, 1.1, 'hex', X, 0.5, 1.0)
    # drill derrick
    s.truss((1.6, 0.6, 1.2), (1.6, 0.6, 5.4), 0.7, 0.08, A, bays=6); s.box((1.6, 0.6, 5.5), (1.0, 1.0, 0.3), D); s.empty('navr', (1.6, 0.6, 5.8), 1.0)
    s.tube((1.6, 0.6, 5.4), (1.6, 0.6, 0.6), 0.12, P, 8); s.lathe((1.6, 0.6, 1.25), [(0.6, 0), (0.6, 0.4)], D, 10)
    s.truss((1.6, 0.6, 4.8), (-0.6, 0.4, 3.6), 0.35, 0.05, A)        # pipe arm to the crystals
    # walkway decks + modules hanging off the side (game +z = -Y)
    s.box((2.4, -2.6, 0.8), (3.6, 2.2, 0.4), D, ch=0.08); s.box((2.4, -2.6, 1.03), (3.7, 2.3, 0.06), A)
    s.module(T(1.6, -2.6, 1.6), 1.3, 1.6, 1.2, red=1, greeb=2); s.tower((3.3, -2.3, 1.05), 1.0, 2.6)
    s.box((-0.3, -2.9, 0.9), (3.0, 0.7, 0.12), P); s.box((-0.3, -3.2, 1.1), (3.0, 0.05, 0.3), A)
    for x in (1.0, 3.4): s.tube((x, -3.4, 0.6), (x, -3.4, -1.4), 0.12, D, 6); s.empty('navR', (x, -3.4, -1.5), 0.7)
    for i in range(5): s.box((1.0 + i * 0.6, -3.72, 0.8), (0.28, 0.05, 0.12), W)
    return s, []

def tunnel():
    s = Pi('rig_tunnel', 6.0, seed=33)
    vs, fs = s.rock((0, 0, 0), (4.6, 4.0, 2.8), 55, K, 4, 0.3, 4, pits=8, facets=8)
    od = Vector((0, -1, 0.05)).normalized()
    for v in vs:  # bore a socket into the -Y face
        n = v.co.normalized(); c_ = n.dot(od)
        if c_ > 0.55:
            k = (c_ - 0.55) / 0.45; v.co = v.co * (1 - 0.62 * min(1, k * 1.6))
    s.hangar_hall((0, -1.2, 0.0), 3.6, 4.4, 2.8)
    s.box((0, -4.4, -1.1), (3.4, 2.4, 0.3), P); s.box((0, -4.4, -0.93), (3.5, 2.5, 0.05), A)  # landing deck out front
    for sx in (-1, 1):
        s.module(T(sx * 2.6, -3.4, -0.6), 1.2, 1.6, 1.1, red=1, greeb=2)
        s.tube((sx * 1.4, -5.4, -1.2), (sx * 1.4, -5.4, -2.8), 0.12, D, 6); s.empty('navR', (sx * 1.4, -5.4, -2.9), 0.7)
        s.empty('navw', (sx * 1.6, -5.6, -0.9), 0.8)
    s.module(T(-1.4, 1.2, 2.6), 1.2, 1.2, 1.0, greeb=1); s.tower((1.6, 0.4, 2.0), 0.9, 2.2); s.tube((1.6, 0.4, 4.2), (1.6, 0.4, 5.6), 0.05, D, 4); s.empty('navr', (1.6, 0.4, 5.7), 0.9)
    return s, []

def colony():
    s = Pi('rig_colony', 6.0, seed=34)
    vs, fs = s.rock((0, 0, 0), (4.6, 3.6, 2.4), 63, K, 4, 0.28, 4, pits=6, facets=8)
    flatten(vs, (0, 0), 1.0, 3.6)
    s.box((0, 0, 1.0), (6.0, 4.6, 0.3), D, ch=0.08); s.box((0, 0, 1.17), (6.1, 4.7, 0.05), A)
    for (cx, cy, r) in ((-1.0, 0.3, 1.8), (1.9, -0.9, 1.1)):
        s.lathe((cx, cy, 1.15), [(r + 0.2, 0), (r + 0.2, 0.35), (r, 0.4)], H, 20)
        s.sphere((cx, cy, 1.45), (r * 0.85, r * 0.85, r * 0.5), V, 14, 4, 0.0, 1.0)
        for i in range(5): a = i * 1.3; s.sphere((cx + math.cos(a) * r * 0.4, cy + math.sin(a) * r * 0.4, 1.7), r * 0.18, V, 8, 4)
        s.sphere((cx, cy, 1.5), (r, r, r * 0.85), C, 22, 8, 0.0, 1.0)
        for k in range(6):
            a = k * math.pi / 6; s.torus((0, 0, 0), r * 1.005, 0.035, D, 20, 4, M=T(cx, cy, 1.5) @ Rz(a) @ Matrix.Rotation(math.pi / 2, 4, 'X') @ Matrix.Diagonal((1, 0.85, 1, 1)))
        s.empty('navw', (cx, cy, 1.55 + r * 0.9), 0.8)
    s.tower((2.3, 1.4, 1.2), 1.0, 3.0); s.tower((1.0, 1.7, 1.2), 0.8, 2.2); s.tower((-2.8, -1.6, 1.2), 0.9, 2.6)
    s.tube((2.3, 1.4, 4.4), (2.3, 1.4, 5.6), 0.05, D, 4); s.empty('navr', (2.3, 1.4, 5.7), 0.9)
    s.module(T(-0.2, -1.9, 1.7), 1.4, 1.0, 0.9, greeb=1)
    s.solar((2.8, -1.6), (6.4, -2.4), 1.1, 2, pw=1.6, pl=2.4, light='navg')
    for x in (-1.6, 1.6): s.tube((x, -2.4, 1.0), (x, -2.4, -0.8), 0.12, D, 6); s.empty('navR', (x, -2.4, -0.9), 0.7)
    return s, []

BUILDERS = {'pit': pit, 'drill': drill, 'tunnel': tunnel, 'colony': colony}
if __name__ == '__main__':
    from env_kit import reset
    only = sys.argv[sys.argv.index('--only') + 1].split(',') if '--only' in sys.argv else list(BUILDERS)
    reset(); MATS = env_materials(xglow=(0.3, 1.6, 3.6)); _st.MATS = _pi.MATS = MATS
    roots = {}
    for k in only:
        s, objs = BUILDERS[k](); ob, tris = s.finish(MATS, 1.0); print('TRIS', ob.name, tris); roots[k] = ob
    if '--noexport' not in sys.argv: export('rigs', list(roots.values()), normals=False, uvs=False)
    if '--render' in sys.argv:
        space_world(0.8); rock_detail(3.0); from kit import detail_materials; detail_materials(2.5)
        b = bpy.data.materials['X'].node_tree.nodes['Principled BSDF']; b.inputs['Emission Color'].default_value = (0.02, 0.25, 1, 1); b.inputs['Emission Strength'].default_value = 0.6
        b.inputs['Base Color'].default_value = (0.02, 0.2, 0.85, 1); b.inputs['Roughness'].default_value = 0.06
        for k, ob in roots.items():
            for o in roots.values(): o.hide_render = o is not ob
            shoot([ob], os.path.join(SHOTS, f'rig-{k}.png'), view=(0.5, -0.8, 0.5), res=(1000, 700), samples=28, dist=0.6, key=(0.4, -1.0, 0.9))

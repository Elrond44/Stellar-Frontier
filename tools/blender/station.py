"""v14 player station, 6 growth stages (station_l1..l6.glb). Units = the game's station-local units (game scales x2).
Blender axes: X = game x, -Y = game +z (the dock side), Z = game up. Concept language (env-concepts-1/3, stations row):
chunky segmented gunmetal modules, gold trim and gantries, amber window strips, red light strips on rings, blue solar
booms, teal reactor glow, spires with antennas, hanging spires underneath.
Nodes the game animates / reads (src/glbenv.js): spin_ring (L3+, spins about Z), crane_N (jibs, yaw about Z),
empties stack_* (smoke), chase_* (ring chase lights), dock_* (dock port), navr_*/navg_*/navw_*/navR_* (nav light sprites)."""
import sys, os, math, random
import bpy
sys.path.insert(0, os.path.dirname(__file__))
from mathutils import Vector, Matrix
from env_kit import Env, env_materials, export, shoot, space_world, rock_detail, OUT, SHOTS, H, P, D, A, C, W, G, R, S, V, K, X, N, E
from kit import T, R as Rot

def Rz(a): return Matrix.Rotation(a, 4, 'Z')

class St(Env):
    def lbox(self, M, c, size, mat, ch=0.0):
        self.box(c, size, mat, ch=ch, M=M)
    def module(self, M, w, l, h, win=True, band=True, red=0, greeb=6, mat=H):
        """chunky module centred at local origin (w along x, l along y, h along z)."""
        r = self.rng
        self.lbox(M, (0, 0, 0), (w, l, h), mat, ch=min(w, l, h) * 0.12)
        if band: self.lbox(M, (0, 0, h * 0.28), (w + 0.12, l + 0.12, h * 0.12), A)
        self.lbox(M, (0, 0, -h / 2 - 0.08), (w * 0.8, l * 0.8, 0.16), D)
        if win:
            for sx in (-1, 1):  # amber window strips on the long sides
                n = max(2, int(l / 0.7))
                for i in range(n):
                    if r.random() < 0.8: self.lbox(M, (sx * (w / 2 + 0.02), -l / 2 + (i + 0.5) * l / n, -h * 0.05), (0.05, l / n * 0.55, h * 0.14), W)
            for sy in (-1, 1):
                n = max(1, int(w / 0.8))
                for i in range(n):
                    if r.random() < 0.7: self.lbox(M, (-w / 2 + (i + 0.5) * w / n, sy * (l / 2 + 0.02), -h * 0.05), (w / n * 0.5, 0.05, h * 0.14), W)
        for k in range(red):
            sx = 1 if k % 2 == 0 else -1; self.lbox(M, (sx * (w / 2 + 0.03), 0, -h * 0.3), (0.05, l * 0.7, 0.1), R)
        for _ in range(greeb):
            gw, gl, gh = r.uniform(0.2, 0.6) * w * 0.4, r.uniform(0.2, 0.6) * l * 0.4, r.uniform(0.1, 0.4)
            self.lbox(M, (r.uniform(-w, w) * 0.32, r.uniform(-l, l) * 0.32, h / 2 + gh / 2), (gw, gl, gh), r.choice((H, D, P)), ch=0.03)
    def hub(self, c, rad, h, seg=8, win_rows=(0.35,), bands=(-0.3, 0.15)):
        cx, cy, cz = c
        self.lathe((cx, cy, cz - h / 2), [(rad * 0.92, 0), (rad, h * 0.1), (rad, h * 0.9), (rad * 0.9, h)], H, seg)
        for b in bands: self.lathe((cx, cy, cz + b * h), [(rad + 0.08, 0), (rad + 0.08, h * 0.08)], A, seg)
        for k in range(seg):  # windows per facet
            a = 2 * math.pi * (k + 0.5) / seg; ap = rad * math.cos(math.pi / seg)
            for wr in win_rows:
                M = T(cx + math.cos(a) * (ap + 0.02), cy + math.sin(a) * (ap + 0.02), cz + wr * h) @ Rz(a)
                fw = 2 * rad * math.sin(math.pi / seg) * 0.75; n = 3
                for i in range(n): self.lbox(M, (0, -fw / 2 + (i + 0.5) * fw / n, 0), (0.05, fw / n * 0.6, h * 0.09), W)
    def spire(self, c, h, r0, tiers=4, ant=2.5, light='navr', down=False):
        """stepped octagonal tower (concept: central spires); down=True hangs below."""
        cx, cy, cz = c; sgn = -1 if down else 1; z = cz; r = r0
        for t in range(tiers):
            th = h / tiers
            self.lathe((cx, cy, z if not down else z - th), [(r, 0), (r * 0.92, th)] if not down else [(r * 0.8, 0), (r, th)], H if t % 2 == 0 else D, 8)
            self.lathe((cx, cy, z + sgn * th * 0.5 - 0.06), [(r * 1.04, 0), (r * 1.04, 0.12)], A, 8)
            for k in range(4):
                a = math.pi / 4 + k * math.pi / 2; self.lbox(T(cx + math.cos(a) * r * 0.97, cy + math.sin(a) * r * 0.97, z + sgn * th * 0.72) @ Rz(a), (0, 0, 0), (0.05, r * 0.4, th * 0.12), W if not down else R)
            z += sgn * th; r *= 0.78
        self.tube((cx, cy, z), (cx, cy, z + sgn * ant), 0.06, D, 6)
        self.tube((cx + 0.3, cy, z), (cx + 0.3, cy, z + sgn * ant * 0.6), 0.04, D, 6)
        if light: self.empty(light, (cx, cy, z + sgn * (ant + 0.15)), 1.6)
    def solar(self, p0, p1, z, panels=3, pw=2.6, pl=4.4, tilt=0.25, light=None):
        """truss boom with blue panel pairs (concept: grid panels on gold-capped trusses)."""
        p0, p1 = Vector((p0[0], p0[1], z)), Vector((p1[0], p1[1], z)); d = (p1 - p0).normalized(); L = (p1 - p0).length
        self.truss(p0, p1, 0.45, 0.08, D)
        self.box(tuple(p0), (0.7, 0.7, 0.7), A, ch=0.1)
        side = Vector((-d.y, d.x, 0)); ang = math.atan2(d.y, d.x)
        for i in range(panels):
            c = p0 + d * (L * (i + 0.6) / (panels + 0.2))
            M = T(*c) @ Rz(ang) @ Matrix.Rotation(tilt, 4, 'X')
            self.lbox(M, (0, 0, 0), (pw, pl, 0.06), S)
            for gx in range(1, 3): self.lbox(M, (-pw / 2 + gx * pw / 3, 0, 0.035), (0.04, pl, 0.03), D)  # cell grid
            for gy in range(1, 4): self.lbox(M, (0, -pl / 2 + gy * pl / 4, 0.035), (pw, 0.04, 0.03), D)
            self.lbox(M, (0, 0, 0), (pw + 0.12, 0.1, 0.1), A)
        if light: self.empty(light, tuple(p1 + Vector((0, 0, 0.3))), 1.4)
    def seg_ring(self, z, Rr, n, w, h, pods=0, red=True, spokes=0, hubr=3.5, chase=0):
        """chunky polygonal ring of box segments (concept ring stations: wide deck, red light groove on the inner rim)."""
        r = self.rng
        for i in range(n):
            a = 2 * math.pi * i / n; seglen = 2 * Rr * math.sin(math.pi / n) + w * 0.12
            M = T(math.cos(a) * Rr, math.sin(a) * Rr, z) @ Rz(a)
            self.lbox(M, (0, 0, 0), (w, seglen, h), H if i % 2 else D, ch=h * 0.16)
            self.lbox(M, (w * 0.18, 0, h / 2 + 0.05), (w * 0.5, seglen * 0.86, 0.12), P if i % 2 else H)  # raised deck plates
            self.lbox(M, (-w / 2 + 0.06, 0, h / 2 + 0.02), (0.16, seglen * 0.98, 0.08), R if red else W)  # inner rim light groove
            self.lbox(M, (0, 0, -h * 0.18), (w + 0.1, seglen * 0.98, h * 0.12), A)  # gold trim band
            if red: self.lbox(M, (w / 2 + 0.04, 0, h * 0.12), (0.05, seglen * 0.7, h * 0.16), R)
            nwin = 5
            for k in range(nwin):
                if r.random() < 0.8: self.lbox(M, (-w / 2 - 0.02, -seglen / 2 + (k + 0.5) * seglen / nwin, h * 0.12), (0.05, seglen / nwin * 0.5, h * 0.16), W)
            for k in range(2):
                gw = r.uniform(0.2, 0.45) * w; self.lbox(M, (w * 0.25, r.uniform(-0.35, 0.35) * seglen, h / 2 + 0.11 + 0.15), (gw, gw * 1.4, 0.3), r.choice((H, D)), ch=0.04)
            self.lbox(M, (0, 0, -h / 2 - 0.15), (w * 0.6, seglen * 0.6, 0.3), D)
        for i in range(pods):
            a = 2 * math.pi * (i + 0.5) / pods
            M = T(math.cos(a) * (Rr + w * 0.15), math.sin(a) * (Rr + w * 0.15), z + h * 0.5) @ Rz(a)
            self.module(M @ T(0, 0, h * 0.45), w * 1.2, w * 1.9, h * 1.1, red=1 if red else 0, greeb=3)
            self.lbox(M, (0, 0, -h * 1.2), (w * 0.8, w * 1.2, h * 1.2), D, ch=0.1)  # hanging under-module
            self.lbox(M, (w * 0.42, 0, -h * 1.0), (0.05, w * 0.8, 0.12), R)
        for i in range(spokes):
            a = 2 * math.pi * i / spokes + math.pi / spokes
            self.truss((math.cos(a) * hubr, math.sin(a) * hubr, z), (math.cos(a) * (Rr - w / 2), math.sin(a) * (Rr - w / 2), z), 0.4, 0.07, D)
            self.tube((math.cos(a) * hubr, math.sin(a) * hubr, z), (math.cos(a) * (Rr - w / 2), math.sin(a) * (Rr - w / 2), z), 0.12, P, 6)
        for i in range(chase):
            a = 2 * math.pi * i / chase; self.empty('chase', (math.cos(a) * (Rr - w / 2 + 0.1), math.sin(a) * (Rr - w / 2 + 0.1), z + h / 2 + 0.35), 1.1)
    def turret_pad(self, c, r=2.0):
        cx, cy, cz = c
        self.lathe((cx, cy, cz - 0.4), [(r * 0.7, 0), (r, 0.25), (r, 0.6), (r * 0.9, 0.8)], D, 16)
        self.lathe((cx, cy, cz + 0.2), [(r + 0.04, 0), (r + 0.04, 0.12)], R, 16)
        self.lathe((cx, cy, cz - 0.6), [(r * 0.5, 0), (r * 0.3, -1.6)], H, 8, cap1=True)
        self.turret((cx, cy, cz + 0.4), r * 0.9, barrels=2, mat_h=H, rot=math.atan2(-cy, -cx) + math.pi / 2)
        for k in range(4):
            a = k * math.pi / 2 + math.pi / 4; self.empty('navR', (cx + math.cos(a) * r, cy + math.sin(a) * r, cz + 0.45), 0.9)
    def crane_tower(self, x, y, h):
        self.truss((x, y, -1.5), (x, y, h - 1.5), 1.0, 0.12, A, bays=int(h / 1.2))
        self.box((x, y, -1.6), (1.6, 1.6, 0.4), D, ch=0.1); self.box((x, y, h - 1.45), (1.3, 1.3, 0.3), D)
        self.empty('navr', (x, y, h - 0.8), 1.2)
    def container_yard(self, c, rows, cols, stack):
        cx, cy, cz = c; r = self.rng
        self.box((cx, cy, cz), (cols * 1.15 + 0.8, rows * 2.5 + 0.8, 0.4), D, ch=0.08)
        self.box((cx, cy, cz + 0.22), (cols * 1.15 + 0.9, rows * 2.5 + 0.9, 0.06), A)
        for i in range(cols):
            for j in range(rows):
                for k in range(r.randint(1, stack)):
                    self.box((cx + (i - (cols - 1) / 2) * 1.15, cy + (j - (rows - 1) / 2) * 2.5, cz + 0.6 + k * 0.85), (1.0, 2.2, 0.8), r.choice((A, A, P, H, D)), ch=0.05)
    def tank(self, c, r, h):
        cx, cy, cz = c
        self.lathe((cx, cy, cz), [(r * 0.6, 0), (r, r * 0.3), (r, h - r * 0.3), (r * 0.6, h)], P, 12)
        for b in (0.3, 0.7): self.lathe((cx, cy, cz + h * b), [(r + 0.05, 0), (r + 0.05, 0.12)], A, 12)
    def crystal_pile(self, c, n=9, size=1.1):
        cx, cy, cz = c; self.box((cx, cy, cz), (2.6, 2.6, 0.6), D, ch=0.1); self.box((cx, cy, cz + 0.33), (2.7, 2.7, 0.08), A)
        r = self.rng
        for i in range(n):
            d = Vector((r.uniform(-0.6, 0.6), r.uniform(-0.6, 0.6), 1)).normalized()
            self.crystal((cx + r.uniform(-0.9, 0.9), cy + r.uniform(-0.9, 0.9), cz + 0.3), d, size * r.uniform(0.6, 1.2), 0.18, G)

def jib(name, rng):
    s = St(name, 5.0, seed=rng.randint(0, 999))
    s.truss((0, 1.6, 0), (0, -6.0, 0), 0.55, 0.07, A, bays=7)  # boom toward local -Y (game +z)
    s.box((0, 1.9, -0.1), (0.9, 1.5, 0.9), D, ch=0.1); s.box((0, 0, 0.2), (0.8, 0.8, 0.7), H, ch=0.1); s.box((0.42, 0, 0.25), (0.04, 0.4, 0.15), W)
    s.tube((0, -5.6, -0.2), (0, -5.6, -2.6), 0.03, D, 4); s.box((0, -5.6, -2.75), (0.6, 0.6, 0.3), W)
    s.tube((0, 0, 0.3), (0, -5.8, 0.25), 0.03, D, 4)
    return s

def pivot(name, s, loc):
    """animated part: an empty pivot (stable node transform after meshopt quantization) with the mesh under it."""
    ob, _ = s.finish(MATS, 1.0); ob.name = name + '_mesh'
    pv = bpy.data.objects.new(name, None); bpy.context.scene.collection.objects.link(pv); pv.location = loc; ob.parent = pv
    return pv

ROCK = ((-9.5, -4.5, -6.5), (9.0, 8.0, 6.5))

def build(level):
    rng = random.Random(4242)
    s = St(f'station_l{level}', 5.0, seed=4242)
    # asteroid base (slot K -> the game's station rock shader, teal glow crystals X)
    s.rock(ROCK[0], ROCK[1], 77, K, 4, 0.28, 7, pits=6)
    for d in ((-0.4, -0.6, 0.65), (-0.9, 0.1, 0.4), (-0.5, 0.7, 0.5)):
        dv = Vector(d).normalized(); p = Vector(ROCK[0]) + Vector((dv.x * ROCK[1][0], dv.y * ROCK[1][1], dv.z * ROCK[1][2])) * 0.86
        s.cluster(tuple(p), dv, 6, 1.4, X, 0.45)
    # ---- L1 outpost refinery ----
    s.hub((0, 0, 0), 3.5, 4.2, 8, win_rows=(0.33, 0.12), bands=(-0.3, 0.14))
    s.lathe((0, 0, 2.1), [(2.9, 0), (2.5, 0.8), (1.6, 1.0)], D, 8)
    s.lathe((0, 0, -2.1), [(2.9, 0), (2.2, -1.2), (1.0, -1.8)], D, 8)  # under-dome
    s.greebles(-1.4, 1.4, -1.4, 1.4, 3.05, 10, 0.5, mats=(H, D, P))
    s.module(T(-3.6, -1.2, -0.4), 3.8, 3.0, 2.4, red=0); s.module(T(-4.2, -4.2, -1.2), 2.6, 2.6, 2.0)
    for (x, y, h) in ((-4.6, -0.6, 3.4), (-3.2, -2.2, 2.6)):
        s.lathe((x, y, 0.8), [(0.65, 0), (0.5, h)], D, 10); s.lathe((x, y, 1.2), [(0.7, 0), (0.7, 0.3)], A, 10)
        s.torus((x, y, 0.8 + h), 0.48, 0.07, W, 14, 6); s.empty('stack', (x, y, 0.9 + h), 1)
    s.tube((0, -3.0, 0), (0, -6.8, 0), 1.0, D, 12)  # dock arm
    for yy in (-4.0, -5.2): s.lathe((0, yy, 0), [(1.1, 0), (1.1, 0.25)], A, 12, axis=(0, -1, 0))
    s.tube((0, -6.7, 0), (0, -7.7, 0), 1.5, H, 16)
    s.torus((0, 0, 0), 1.5, 0.12, A, 20, 6, M=T(0, -7.72, 0) @ Matrix.Rotation(math.pi / 2, 4, 'X'))
    s.tube((0, -7.7, 0), (0, -7.78, 0), 1.0, G, 16)
    for i in range(6):
        a = i / 6 * 2 * math.pi; s.box((math.cos(a) * 1.65, -7.8, math.sin(a) * 1.65), (0.16, 0.16, 0.16), W)
    s.empty('dock', (0, -7.9, 0), 1.5)
    s.tube((0.8, 0.4, 2.6), (0.8, 0.4, 6.8), 0.05, D, 6); s.empty('navw', (0.8, 0.4, 6.9), 1.0)
    s.dish((-1.2, -1.0, 3.3), 0.9, 0.35, (0.4, -0.3, 1.0), P, 14)
    s.tube((-2.0, 0.0, 1.2), (-2.0, -3.6, 1.2), 0.15, P, 8); s.tube((-2.6, 1.4, 0.4), (1.8, 2.6, 0.4), 0.12, P, 8)
    s.empty('navr', (3.5, 0, 2.2), 1.0); s.empty('navg', (-3.5, 0, 2.2), 1.0)
    objs = []
    if level >= 2:  # ---- solar refinery ----
        s.solar((3.4, 1.0), (12.9, 1.0), 1.0, 3, light='navg'); s.solar((-3.4, 1.0), (-12.9, 1.0), 1.0, 3, light='navr')
        s.module(T(3.6, 2.8, -0.3), 2.6, 2.4, 2.0, red=1)
        s.lathe((3.6, 2.8, -1.4), [(0.9, 0), (1.2, -0.4), (1.2, -0.9), (0.9, -1.2)], D, 10)  # reactor: glowing core underneath
        s.sphere((3.6, 2.8, -2.2), 0.75, G, 12, 6); s.torus((3.6, 2.8, -2.2), 0.95, 0.09, A, 16, 6)
    if level >= 3:  # ---- factory station ----
        for (x, y) in ((4.5, -3.8), (-1.0, 5.2)):
            s.module(T(x, y, -0.2), 3.4, 3.0, 2.4, red=1)
            s.lathe((x - 0.8, y + 0.6, 1.0), [(0.45, 0), (0.35, 2.6)], D, 10); s.torus((x - 0.8, y + 0.6, 3.6), 0.33, 0.06, W, 12, 6); s.empty('stack', (x - 0.8, y + 0.6, 3.7), 1)
            s.lathe((x + 0.7, y + 0.6, 1.0), [(0.45, 0), (0.35, 2.0)], D, 10)
        rg = St('spin_ring', 5.0, seed=7)
        rg.seg_ring(0, 10, 16, 1.9, 1.1, pods=6, spokes=6, hubr=3.6, chase=24)
        objs.append(pivot('spin_ring', rg, (0, 0, -1.2)))
    if level >= 4:  # ---- orbital works: cranes, container yard, tanks, crystal pile, hab pods ----
        for i, (x, y, h) in enumerate(((-6.5, 4.5, 9), (7.5, 6.5, 8), (8.5, -6.5, 7))):
            s.crane_tower(x, y, h); objs.append(pivot(f'crane_{i}', jib(f'jib_{i}', rng), (x, y, h - 1.3)))
        s.container_yard((10.5, 1.0, -1.6), 2, 3, 3); s.tank((6.3, 9.6, -1.8), 0.9, 2.6); s.tank((8.2, 10.4, -1.8), 0.7, 2.0)
        s.box((7.2, 10.0, -1.9), (4.0, 2.6, 0.3), D, ch=0.06)
        s.crystal_pile((11.2, -3.6, -1.4))
        s.box((11.0, 5.8, -1.7), (3.0, 2.4, 0.5), D, ch=0.08); s.box((11.0, 5.8, -1.38), (3.1, 2.5, 0.08), A)
        for i in range(10):  # gold ore heap
            rr_ = rng.uniform(0.25, 0.55); s.rock((11.0 + rng.uniform(-1, 1), 5.8 + rng.uniform(-0.7, 0.7), -1.2 + rr_ * 0.3), (rr_, rr_, rr_ * 0.7), 300 + i, N, 1, 0.3, 0, facets=0)
        for i in range(4):
            a = i / 4 * 2 * math.pi + 0.4; px, py = math.sin(a) * 13.5, -math.cos(a) * 13.5
            s.lathe((px, py, -2.6), [(1.3, 0), (1.3, 3.2)], H, 12); s.lathe((px, py, -0.6), [(1.36, 0), (1.36, 0.4)], A, 12)
            s.sphere((px, py, 0.6), (1.3, 1.3, 0.65), H, 12, 4, 0.0, 1.0)
            s.truss((math.sin(a) * 3.5, -math.cos(a) * 3.5, -1.0), (math.sin(a) * 12.2, -math.cos(a) * 12.2, -1.0), 0.4, 0.06, D)
            for k in range(4):
                b = a + k * math.pi / 2; s.box((px + math.sin(b) * 1.32, py - math.cos(b) * 1.32, -1.0), (0.3, 0.3, 0.5), W)
    if level >= 5:  # ---- industrial hub: spires, biosphere dome, comms dish, turret pads, more solar ----
        s.spire((0, 0, 3.0), 9.0, 1.5, 5, 3.0)
        s.spire((2.5, 2.5, 0.0), 7.5, 1.0, 4, 2.0); s.spire((-2.0, -2.4, 0.0), 6.0, 0.9, 3, 2.0)
        dc = (-10.5, -4.0, 0.2)
        s.lathe((dc[0], dc[1], dc[2] - 0.8), [(3.6, 0), (3.9, 0.5), (3.9, 0.9), (3.5, 1.0)], H, 20)
        s.lathe((dc[0], dc[1], dc[2] + 0.25), [(3.95, 0), (3.95, 0.12)], A, 20)
        s.sphere((dc[0], dc[1], dc[2] + 0.1), (2.9, 2.9, 2.2), V, 16, 4, 0.0, 0.7)  # greenery mound
        for i in range(7):
            a = i * 0.9; rr = 1.0 + (i % 3) * 0.6; s.sphere((dc[0] + math.cos(a) * rr, dc[1] + math.sin(a) * rr, dc[2] + 1.2), 0.45, V, 8, 4)
        s.sphere((dc[0], dc[1], dc[2] + 0.2), (3.5, 3.5, 3.0), C, 24, 8, 0.0, 1.0)
        for k in range(8):  # dome ribs
            a = k * math.pi / 4; s.torus((0, 0, 0), 3.52, 0.05, D, 24, 4, M=T(*dc) @ T(0, 0, 0.2) @ Rz(a) @ Matrix.Rotation(math.pi / 2, 4, 'X') @ Matrix.Diagonal((1, 3.0 / 3.5, 1, 1)))
        s.empty('navw', (dc[0], dc[1], dc[2] + 3.4), 1.2)
        s.lathe((-4.5, 6.5, 0.0), [(0.9, 0), (0.6, 2.6)], D, 8); s.dish((-4.5, 6.5, 3.4), 2.4, 0.9, (0.5, 0.3, 0.8), P, 20)
        for sx in (-1, 1): s.turret_pad((sx * 10, -9, 0.2))
        s.solar((-2.0, 3.5), (-2.0, 15.0), 3.0, 3, light='navw'); s.solar((2.0, 3.5), (12.5, 13.0), 3.0, 2)
    if level >= 6:  # ---- frontier citadel: outer ring, beacon, hanging spire ----
        s.seg_ring(-2.2, 19, 28, 2.6, 1.5, pods=8, spokes=8, hubr=4.0)
        for i in range(8):
            a = 2 * math.pi * (i + 0.5) / 8; s.box((math.cos(a) * 19, math.sin(a) * 19, -0.2), (0.5, 0.5, 0.4), G)
        s.spire((0, 19.0, -1.2), 9.0, 0.9, 4, 3.0, light='navg')
        for zz, rr in ((5.2, 2.4), (6.6, 1.6)): s.torus((0, 19.0, zz), rr, 0.08, E, 32, 6)
        s.spire((0, 0, -2.6), 9.0, 2.2, 4, 2.5, light='navr', down=True)
        s.turret_pad((19, 0, -0.4)); s.turret_pad((-19, 0, -0.4))
        s.solar((-3.0, -3.0), (-14.0, -14.0), 2.4, 3); s.solar((3.0, -3.0), (14.0, -14.0), 2.4, 3)
    ob, tris = s.finish(MATS, 1.0)
    for o in objs: o.parent = ob
    return ob, objs

MATS = None
if __name__ == '__main__':
    from env_kit import reset
    levels = [int(a) for a in sys.argv[sys.argv.index('--levels') + 1].split(',')] if '--levels' in sys.argv else [1, 2, 3, 4, 5, 6]
    for lv in levels:
        reset(); MATS = env_materials(xglow=(0.3, 1.6, 3.6))
        ob, objs = build(lv)
        dg = bpy.context.evaluated_depsgraph_get(); tris = sum(sum(len(p.vertices) - 2 for p in o.data.polygons) for o in [ob] + [c for o2 in objs for c in o2.children if c.type == 'MESH'])
        print('TRIS', ob.name, tris)
        export(ob.name, [ob])
        if '--render' in sys.argv:
            space_world(0.7); rock_detail(4.0)
            from kit import detail_materials; detail_materials(2.5)
            for o in objs:
                if o.name.startswith('crane_'): o.rotation_euler = (0, 0, random.Random(o.name).uniform(-1.2, 1.2))
            shoot([ob], os.path.join(SHOTS, f'station-l{lv}.png'), view=(0.55, -0.75, 0.55), res=(1280, 800), samples=32, dist=0.4 if lv >= 3 else 0.5, key=(0.4, -1.0, 0.9))

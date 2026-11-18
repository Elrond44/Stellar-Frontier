"""v15 pirate / faction installations + the friendly repair beacon (installations.glb), from env-concepts-1/3 (stations row).
One root node per game installation part, named inst_<kind>; units = the game's installation-local units (the game scales
bases x2, BS). Blender X = game x, -Y = game +z, Z = game up.
  hq      Faction Stronghold      -> pirate citadel (stepped core, red spire fins, four armoured wings, corner towers, big turrets, hanging spikes)
  def     Orbital Defense Platf.  -> turret fortress drum (crenellated rim, red banners, twin cannons; the game's live turret sits on the centre deck)
  comm    Communication Array     -> comms dish relay (ring of modules, central tower, big dish on the spin pivot)
  yard    Hidden Shipyard         -> hangar block (arched hangar hall, landing ramp, side halls, gantry crane, cradle)
  reactor Fusion Reactor          -> reactor ring (blue core under four claw pylons)
  gen     Shield Generator        -> small ring outpost (spire + emitter)
  turret  Defense Turret base     -> armoured pad (the live turret sits on top)
  hangar  Fighter Hangar          -> small hangar block, door toward local -Y (game +z)
  relay   friendly repair beacon  -> green beacon spire (green rings on the spin pivot, solar boom) [player palette]
Slots (game side, src/glbenv.js): H faction hull, D dark metal, P bone/plate, A faction accent trim, R faction lights,
W amber windows, G reactor glow, E green beacon, C glass, S solar, K rock, X rock glow.
Pivots: spin_<kind> (rotates about Z in game). Empties navr/navg/navw/navR -> light sprites."""
import sys, os, math, random
import bpy
sys.path.insert(0, os.path.dirname(__file__))
from mathutils import Vector, Matrix
from env_kit import env_materials, export, shoot, space_world, rock_detail, OUT, SHOTS, H, P, D, A, C, W, G, R, S, V, K, X, N, E
from station import St, Rz
from kit import T

class Pi(St):
    def oct_ring(self, r, n=8, a0=None):
        a0 = math.pi / n if a0 is None else a0
        return [(math.cos(a0 + 2 * math.pi * i / n) * r, math.sin(a0 + 2 * math.pi * i / n) * r) for i in range(n)]
    def drum(self, c, r, h, mat=H, n=8, trim=True, win=True, red=0):
        """faceted drum (n sides) with a trim band, amber window rows and optional red strips."""
        cx, cy, cz = c
        self.lathe((cx, cy, cz - h / 2), [(r * 0.94, 0), (r, h * 0.12), (r, h * 0.88), (r * 0.94, h)], mat, n)
        if trim: self.lathe((cx, cy, cz + h * 0.22), [(r * 1.02, 0), (r * 1.02, h * 0.08)], A, n)
        ap = r * math.cos(math.pi / n); fw = 2 * r * math.sin(math.pi / n)
        for k in range(n):
            a = 2 * math.pi * (k + 0.5) / n; M = T(cx + math.cos(a) * (ap + 0.02), cy + math.sin(a) * (ap + 0.02), cz) @ Rz(a)
            if win:
                for i in range(3):
                    if self.rng.random() < 0.8: self.lbox(M, (0, -fw * 0.3 + i * fw * 0.3, -h * 0.05), (0.05, fw * 0.16, h * 0.1), W)
            if red and k % red == 0: self.lbox(M, (0.01, 0, -h * 0.28), (0.05, fw * 0.6, h * 0.07), R)
    def crenels(self, c, r, n, h, w, mat=D):
        cx, cy, cz = c
        for k in range(n):
            a = 2 * math.pi * (k + 0.5) / n; self.lbox(T(cx + math.cos(a) * r, cy + math.sin(a) * r, cz + h / 2) @ Rz(a), (0, 0, 0), (w * 0.6, w, h), mat, ch=0.04)
    def fin(self, base, h, w, mat=R, lean=(0, 0)):
        """tall pointed fin/spike (concept citadel: red blade spires)."""
        bx, by, bz = base; self.tube((bx, by, bz), (bx + lean[0], by + lean[1], bz + h), w, D, 4, w * 0.05, a0=math.pi / 4)
        self.tube((bx, by, bz + h * 0.05), (bx + lean[0] * 0.9, by + lean[1] * 0.9, bz + h * 0.9), w * 1.06, mat, 4, w * 0.05, a0=0.0)  # red blade edges
    def spikes_down(self, c, r, n, L, w=0.35, light=True):
        cx, cy, cz = c; rr = self.rng
        for k in range(n):
            a = 2 * math.pi * k / n + rr.uniform(-0.2, 0.2); ll = L * rr.uniform(0.55, 1.0)
            p = (cx + math.cos(a) * r, cy + math.sin(a) * r, cz)
            self.tube(p, (p[0] * 0.98, p[1] * 0.98, cz - ll), w, D if k % 2 else H, 6, w * 0.15)
            self.lathe((p[0], p[1], cz - ll * 0.35), [(w * 0.85, 0), (w * 0.85, 0.12)], R if light else A, 6)
            if light and k % 2 == 0: self.empty('navR', (p[0], p[1], cz - ll * 0.5), 0.8)
    def tower(self, c, w, h, crenel=True, win=True, mat=H):
        cx, cy, cz = c
        self.box((cx, cy, cz + h / 2), (w, w, h), mat, ch=w * 0.1)
        self.box((cx, cy, cz + h * 0.62), (w + 0.1, w + 0.1, h * 0.06), A)
        if win:
            for sx in (-1, 1):
                for i in range(3): self.box((cx + sx * (w / 2 + 0.02), cy - w * 0.3 + i * w * 0.3, cz + h * 0.4), (0.05, w * 0.15, h * 0.08), W)
            self.box((cx, cy - w / 2 - 0.02, cz + h * 0.8), (w * 0.5, 0.05, h * 0.05), R)
        if crenel:
            for i in range(4):
                a = math.pi / 4 + i * math.pi / 2; self.box((cx + math.cos(a) * w * 0.38, cy + math.sin(a) * w * 0.38, cz + h + 0.2), (w * 0.22, w * 0.22, 0.4), D)
    def cannon(self, c, s, rot):
        """decorative twin heavy cannon (concept: big grey turrets on the citadel wings)."""
        x, y, z = c; M = T(x, y, z) @ Rz(rot)
        self.lathe((x, y, z), [(s * 0.55, 0), (s * 0.5, s * 0.25)], D, 10)
        self.lbox(M, (0, 0, s * 0.45), (s * 0.95, s * 1.1, s * 0.45), H, ch=s * 0.08)
        self.lbox(M, (0, s * 0.35, s * 0.72), (s * 0.7, s * 0.4, s * 0.15), D, ch=0.03)
        for bx in (-s * 0.22, s * 0.22):
            p0 = M @ Vector((bx, -s * 0.4, s * 0.5)); p1 = M @ Vector((bx, -s * 1.7, s * 0.62))
            self.tube(tuple(p0), tuple(p1), s * 0.09, D, 8); self.tube(tuple(p1), tuple(p1 + (p1 - p0).normalized() * s * 0.12), s * 0.12, H, 8)
        self.lbox(M, (s * 0.48, 0, s * 0.45), (0.05, s * 0.5, s * 0.06), R)
    def wing(self, M, L, w, h):
        """armoured wing slab (concept citadel arms): hull block, slanted armour ramp, red strip, windows, greebles."""
        self.lbox(M, (0, L / 2, 0), (w, L, h), H, ch=h * 0.15)
        self.lbox(M, (0, L / 2, h / 2 + 0.25), (w * 0.7, L * 0.8, 0.5), D, ch=0.08)
        for sx in (-1, 1):
            self.lbox(M, (sx * (w / 2 + 0.03), L / 2, -h * 0.15), (0.05, L * 0.8, 0.12), R)
            for i in range(int(L / 0.8)):
                if self.rng.random() < 0.75: self.lbox(M, (sx * (w / 2 + 0.03), 0.5 + i * 0.8, h * 0.18), (0.05, 0.4, 0.14), W)
        self.lbox(M, (0, L - 0.2, -h / 2 - 0.5), (w * 0.7, 0.9, 1.0), D, ch=0.06)  # hanging under-block
        self.lbox(M, (0, L + 0.03, 0), (w * 0.6, 0.06, h * 0.12), R)
        self.lbox(M, (0, L * 0.42, h / 2 + 0.95), (w * 0.5, L * 0.5, 0.9), H, ch=0.1)  # stepped upper block
        for sx in (-1, 1):
            self.lbox(M, (sx * w * 0.26, L * 0.42, h / 2 + 1.0), (0.05, L * 0.35, 0.1), R)
            self.lbox(M, (sx * (w / 2 + 0.45), L * 0.55, -0.2), (0.8, L * 0.5, h * 0.7), D, ch=0.06)  # side pods
            for i in range(3): self.lbox(M, (sx * (w / 2 + 0.86), L * 0.35 + i * 0.6, -0.1), (0.05, 0.3, 0.12), W)
            self.lbox(M, (sx * (w / 2 + 0.45), L * 0.55, -h * 0.5 - 0.5), (0.5, 0.5, 1.0), H, ch=0.04)
        for _ in range(6):
            gw = self.rng.uniform(0.3, 0.7); self.lbox(M, (self.rng.uniform(-w, w) * 0.3, self.rng.uniform(0.6, L - 0.6), h / 2 + 0.5 + gw * 0.3), (gw, gw * 1.3, gw * 0.6), self.rng.choice((H, D, P)), ch=0.04)
    def ramp(self, M, L, w, h0, h1):
        """slanted gold-trimmed armour plate (concept: angled ramps up the citadel flanks)."""
        self.slab([(-w / 2, 0), (w / 2, 0), (w / 2, L), (-w / 2, L)], 0.25, P, M=M @ Matrix.Rotation(math.atan2(h1 - h0, L), 4, 'X'))
        for sx in (-1, 1): self.slab([(sx * w / 2 - 0.08, 0), (sx * w / 2 + 0.08, 0), (sx * w / 2 + 0.08, L), (sx * w / 2 - 0.08, L)], 0.32, A, M=M @ Matrix.Rotation(math.atan2(h1 - h0, L), 4, 'X'))
    def hangar_hall(self, c, w, l, h, door_glow=True):
        """octagonal tunnel hall (ribbed shell), open toward -Y with a lit interior and a landing ramp."""
        cx, cy, cz = c
        prof = [(math.cos(math.pi / 8 + i * math.pi / 4) * w / 2, math.sin(math.pi / 8 + i * math.pi / 4) * h / 2) for i in range(8)]
        prof = [p for p in prof if p[1] > -h * 0.3]  # upper 6 sides (floor is the deck)
        prof = sorted(prof, key=lambda p: -math.atan2(p[1], p[0]))  # right -> over the top -> left
        for i in range(len(prof) - 1):  # shell plates (closed slabs, so normals stay outward)
            p0 = Vector((prof[i][0], 0, prof[i][1])); p1 = Vector((prof[i + 1][0], 0, prof[i + 1][1])); u = (p1 - p0); L_ = u.length; u.normalize()
            nrm = Vector((-u.z, 0, u.x)) if (Vector((-u.z, 0, u.x)).dot((p0 + p1) / 2) > 0) else Vector((u.z, 0, -u.x))
            ctr = (p0 + p1) / 2 + nrm * 0.15
            M = Matrix(((u.x, 0, nrm.x, cx + ctr.x), (u.y, 1, nrm.y, cy + ctr.y), (u.z, 0, nrm.z, cz + ctr.z), (0, 0, 0, 1)))
            self.slab([(-L_ / 2, -l / 2), (L_ / 2, -l / 2), (L_ / 2, l / 2), (-L_ / 2, l / 2)], 0.3, H if i % 2 else D, M=M)
        for t in (0.02, 0.35, 0.68, 0.98):  # rib frames (the concept's heavy arch frames)
            y = cy - l / 2 + l * t
            for i in range(len(prof) - 1):
                p0 = Vector((cx + prof[i][0] * 1.04, y, cz + prof[i][1] * 1.04)); p1 = Vector((cx + prof[i + 1][0] * 1.04, y, cz + prof[i + 1][1] * 1.04))
                self.beam(p0, p1, 0.4 if t < 0.1 else 0.28, D if t > 0.1 else A)
        for sx in (-1, 1):
            self.box((cx + sx * w * 0.5, cy, cz - h * 0.3), (0.6, l, h * 0.32), H, ch=0.08)
            for i in range(int(l / 0.9)): self.box((cx + sx * (w * 0.5 + 0.31), cy - l / 2 + 0.6 + i * 0.9, cz - h * 0.25), (0.05, 0.45, 0.16), W)
        self.box((cx, cy + l / 2 - 0.1, cz), (w * 0.8, 0.2, h * 0.8), D)  # back wall
        self.box((cx, cy + l / 2 - 0.25, cz), (w * 0.55, 0.06, h * 0.45), W if door_glow else G)  # lit interior
        self.box((cx, cy, cz - h * 0.38), (w * 0.75, l - 0.4, 0.2), P)  # deck
        for i in range(4): self.box((cx, cy - l / 2 + 0.8 + i * (l - 1.2) / 3, cz - h * 0.27), (w * 0.08, 0.5, 0.04), W)
        # landing ramp out of the door, with hazard edges
        rM = T(cx, cy - l / 2, cz - h * 0.4) @ Matrix.Rotation(math.pi, 4, 'Z')
        self.ramp(rM, l * 0.45, w * 0.6, 0, -0.5)
        self.empty('navw', (cx - w * 0.3, cy - l / 2 - l * 0.4, cz - h * 0.45), 0.8); self.empty('navw', (cx + w * 0.3, cy - l / 2 - l * 0.4, cz - h * 0.45), 0.8)

def pivot(name, s, loc):
    ob, _ = s.finish(MATS, 1.0); ob.name = name + '_mesh'
    pv = bpy.data.objects.new(name, None); bpy.context.scene.collection.objects.link(pv); pv.location = loc; ob.parent = pv
    return pv

# ------------------------------------------------------------------ builders
def hq():
    s = Pi('inst_hq', 8.0, seed=901); objs = []
    s.drum((0, 0, 0.6), 4.6, 2.6, H, 8, red=2)                       # main deck drum
    s.lathe((0, 0, -0.7), [(4.4, 0), (3.2, -1.6), (1.8, -2.6)], D, 8)  # under-cone
    s.drum((0, 0, 2.6), 3.3, 1.6, D, 8, red=1)                       # second tier
    s.crenels((0, 0, 3.4), 3.25, 16, 0.5, 0.6)
    s.drum((0, 0, 4.0), 2.1, 1.6, H, 8)                              # keep
    s.crenels((0, 0, 4.8), 2.05, 12, 0.45, 0.5, H)
    s.lathe((0, 0, 4.8), [(1.5, 0), (1.2, 1.2), (0.6, 1.6)], D, 8)
    for (dx, dy, hh) in ((0, 0, 4.6), (0.9, 0.6, 3.2), (-0.9, 0.6, 3.2), (0.0, -1.0, 2.6)):
        s.fin((dx, dy, 5.4), hh, 0.32, R)                            # red blade spires
        s.lathe((dx, dy, 5.3), [(0.42, 0), (0.42, 0.3)], D, 4)
    s.empty('navR', (0, 0, 10.2), 1.6)
    for k in range(4):                                               # four armoured wings (cross)
        a = k * math.pi / 2 + math.pi / 4; M = T(math.cos(a) * 3.6, math.sin(a) * 3.6, 0.4) @ Rz(a - math.pi / 2)
        s.wing(M, 5.0, 3.0, 1.8)
        s.ramp(T(math.cos(a) * 3.2, math.sin(a) * 3.2, 1.3) @ Rz(a - math.pi / 2), 2.4, 1.6, 0, 1.6)
        s.cannon(tuple(M @ Vector((0, 4.0, 1.45))), 1.25, a + math.pi / 2)
        s.empty('navr', tuple(M @ Vector((1.6, 5.0, 0.4))), 1.0)
    for k in range(4):                                               # corner towers between the wings
        a = k * math.pi / 2; c = (math.cos(a) * 4.3, math.sin(a) * 4.3, 1.5)
        s.tower(c, 1.5, 2.6 + (k % 2) * 0.8)
        s.tube((c[0], c[1], c[2] + 3.6), (c[0], c[1], c[2] + 5.0), 0.05, D, 4)
    s.spikes_down((0, 0, -2.6), 1.2, 5, 4.0, 0.4)                    # hanging spike cluster
    s.spikes_down((0, 0, -0.9), 3.6, 8, 2.4, 0.3)
    for k in range(4):
        a = k * math.pi / 2 + math.pi / 4; s.spikes_down((math.cos(a) * 6.6, math.sin(a) * 6.6, -0.6), 0.6, 2, 2.0, 0.25, False)
    s.dish((-2.4, 2.6, 3.0), 1.1, 0.45, (-0.5, 0.4, 0.8), P, 14)
    # radar mast on the spin pivot
    rd = Pi('spin_hq_r', 2.0, seed=3); rd.box((0, 0, 0.1), (2.6, 0.25, 0.12), D); rd.dish((1.1, 0, 0.2), 0.5, 0.25, (0.3, -1, 0.3), P, 10, feed=False); rd.empty('navr', (-1.2, 0, 0.3), 0.8)
    s.tube((2.6, -2.2, 3.2), (2.6, -2.2, 4.6), 0.12, D, 6); objs.append(pivot('spin_hq', rd, (2.6, -2.2, 4.6)))
    return s, objs

def defense():
    s = Pi('inst_def', 5.0, seed=902); objs = []
    s.drum((0, 0, 0.3), 4.3, 2.4, H, 12, red=3)
    s.lathe((0, 0, 1.5), [(4.3, 0), (3.6, 0.35)], D, 12)              # deck rim; deck top at 1.85 (live turret sits at y 1.9)
    s.lathe((0, 0, 1.8), [(3.6, 0), (3.6, 0.05)], P, 12, cap1=True)
    s.crenels((0, 0, 1.5), 4.05, 12, 0.7, 0.9)
    s.torus((0, 0, 1.88), 1.6, 0.08, R, 32, 4)                      # turret ring
    s.greebles(-3.0, 3.0, -3.0, 3.0, 1.85, 14, 0.5, mats=(H, D, P))
    for k in range(3):                                               # decorative twin cannons on the rim
        a = k * 2 * math.pi / 3 + 0.5; s.lathe((math.cos(a) * 2.7, math.sin(a) * 2.7, 1.85), [(0.75, 0), (0.75, 0.3)], D, 8)
        s.cannon((math.cos(a) * 2.7, math.sin(a) * 2.7, 2.1), 0.85, a + math.pi / 2)
    for k in range(4):                                               # red banners on four faces (concept)
        a = k * math.pi / 2 + math.pi / 12; ap = 4.3 * math.cos(math.pi / 12) + 0.08; M = T(math.cos(a) * ap, math.sin(a) * ap, -0.6) @ Rz(a)
        s.lbox(M, (0, 0, 0), (0.12, 1.1, 2.2), R); s.lbox(M, (0.08, 0, 0.3), (0.06, 0.4, 0.4), W); s.lbox(M, (0, 0, 1.35), (0.2, 1.5, 0.15), A)
    s.lathe((0, 0, -0.9), [(4.1, 0), (3.0, -1.4), (1.6, -2.4), (0.8, -3.6)], D, 12)  # stepped underside
    s.spikes_down((0, 0, -1.6), 2.9, 8, 2.4, 0.3); s.spikes_down((0, 0, -3.4), 0.6, 3, 2.0, 0.3)
    return s, objs

def comm():
    s = Pi('inst_comm', 4.0, seed=903); objs = []
    s.lathe((0, 0, -0.3), [(3.0, 0), (3.0, 0.5)], D, 6)
    for k in range(6):                                               # ring of chunky modules
        a = k * math.pi / 3; M = T(math.cos(a) * 2.9, math.sin(a) * 2.9, 0.1) @ Rz(a)
        s.module(M, 1.5, 1.7, 1.2, red=1 if k % 2 else 0, greeb=2)
        s.lbox(M, (0, 0, -1.0), (0.8, 0.8, 0.9), D, ch=0.06)
    s.drum((0, 0, 0.6), 1.5, 2.0, H, 8)
    s.tower((0.6, 0.9, 1.6), 0.9, 3.2); s.tube((0.6, 0.9, 5.2), (0.6, 0.9, 7.2), 0.05, D, 4); s.empty('navr', (0.6, 0.9, 7.3), 1.0)
    s.tube((-0.6, 1.1, 1.6), (-0.6, 1.1, 5.6), 0.05, D, 4); s.tube((-0.2, 1.3, 1.6), (-0.2, 1.3, 4.6), 0.04, D, 4)
    s.spikes_down((0, 0, -0.4), 1.0, 4, 2.6, 0.3)
    # big dish on a pylon (spin pivot = the dish assembly)
    s.lathe((-0.6, -0.6, 1.6), [(0.6, 0), (0.45, 1.4)], D, 8)
    dk = Pi('spin_comm_r', 3.0, seed=5)
    dk.box((0, 0, 0.1), (0.8, 0.8, 0.5), H, ch=0.06); dk.tube((0, 0, 0.3), (0.6, 0, 1.4), 0.12, D, 6)
    dk.dish((0.7, 0, 1.6), 2.4, 0.9, (0.7, 0.0, 0.7), P, 22)
    for i in range(6):
        a = i * math.pi / 3; dk.beam((0.6, 0, 1.4), (0.7 + math.cos(a) * 1.4 * 0.7, math.sin(a) * 1.4, 1.6 + math.cos(a) * 1.4 * -0.7 + 0.2), 0.05, D)
    objs.append(pivot('spin_comm', dk, (-0.6, -0.6, 3.0)))
    return s, objs

def yard():
    s = Pi('inst_yard', 6.0, seed=904); objs = []
    s.box((0, 0, -1.0), (11.6, 7.6, 0.6), D, ch=0.1); s.box((0, 0, -0.66), (11.7, 7.7, 0.08), A)
    s.hangar_hall((0, 0.4, 1.2), 5.0, 6.6, 4.2)                      # main hall, door toward -Y (game +z)
    for sx in (-1, 1):
        M = T(sx * 4.4, 0.6, 0.0); s.module(M, 2.4, 6.0, 1.8, red=1, greeb=4)
        s.module(T(sx * 4.6, 0.8, 1.6), 1.6, 3.0, 1.4, red=0, greeb=2)
        s.tank((sx * 4.9, -2.8, -0.7), 0.6, 1.8)
        s.lbox(T(sx * 4.4, 0.6, -1.6), (0, 0, 0), (2.0, 5.0, 1.0), D, ch=0.06)
    # gantry crane straddling the hall (faction accent trusses)
    for sx in (-1, 1):
        s.truss((sx * 3.2, -2.6, -0.6), (sx * 3.2, -2.6, 4.6), 0.5, 0.07, A, bays=5)
        s.truss((sx * 3.2, 3.4, -0.6), (sx * 3.2, 3.4, 4.6), 0.5, 0.07, A, bays=5)
        s.truss((sx * 3.2, -2.6, 4.6), (sx * 3.2, 3.4, 4.6), 0.45, 0.06, A)
    s.truss((-3.2, 0.4, 4.7), (3.2, 0.4, 4.7), 0.5, 0.07, A); s.box((0.8, 0.4, 4.3), (0.9, 0.9, 0.6), D, ch=0.06)
    s.tube((0.8, 0.4, 4.0), (0.8, 0.4, 3.0), 0.03, D, 4); s.box((0.8, 0.4, 2.9), (0.4, 0.4, 0.2), W)
    for sx in (-1, 1):
        for sy in (-1, 1): s.empty('navr' if sx < 0 else 'navg', (sx * 3.2, 0.4 + sy * 3.0, 5.0), 1.0)
    s.spikes_down((0, 0.4, -1.3), 2.6, 6, 2.0, 0.3)
    s.dish((4.6, 3.0, 2.4), 0.8, 0.35, (0.3, 0.5, 0.8), P, 12)
    return s, objs

def reactor():
    s = Pi('inst_reactor', 2.4, seed=905); objs = []
    s.lathe((0, 0, -0.4), [(2.2, 0), (2.3, 0.3), (2.3, 0.7), (2.1, 0.9)], H, 12)
    s.lathe((0, 0, 0.5), [(1.3, 0), (1.3, 0.06)], D, 16)
    for k in range(8):
        a = k * math.pi / 4; M = T(math.cos(a) * 2.15, math.sin(a) * 2.15, 0.15) @ Rz(a)
        s.lbox(M, (0.05, 0, 0), (0.5, 0.8, 0.9), H if k % 2 else D, ch=0.05); s.lbox(M, (0.32, 0, 0.05), (0.05, 0.5, 0.12), W)
    s.torus((0, 0, 0.55), 1.15, 0.12, G, 32, 6)                      # glowing well rim
    s.sphere((0, 0, 0.9), 0.75, G, 14, 8)                            # blue core
    s.lathe((0, 0, -0.4), [(2.0, 0), (1.2, -1.0), (0.5, -1.8)], D, 12); s.sphere((0, 0, -2.0), 0.3, G, 8, 4)
    for k in range(4):                                               # claw pylons converging over the core
        a = k * math.pi / 2 + math.pi / 4; b = Vector((math.cos(a) * 1.9, math.sin(a) * 1.9, 0.6))
        m = Vector((math.cos(a) * 1.4, math.sin(a) * 1.4, 2.6)); t = Vector((math.cos(a) * 0.35, math.sin(a) * 0.35, 2.2))
        s.tube(tuple(b), tuple(m), 0.2, D, 6); s.tube(tuple(m), tuple(t), 0.14, H, 6); s.sphere(tuple(t), 0.12, G, 6, 3)
    s.tower((1.4, 1.6, 0.5), 0.8, 2.2); s.tube((1.4, 1.6, 3.1), (1.4, 1.6, 3.9), 0.04, D, 4); s.empty('navr', (1.4, 1.6, 4.0), 0.9)
    return s, objs

def gen():
    s = Pi('inst_gen', 2.0, seed=906); objs = []
    s.seg_ring(0.0, 1.6, 10, 0.55, 0.45, red=True)
    for k in range(3):
        a = k * 2 * math.pi / 3; s.beam((0, 0, 0), (math.cos(a) * 1.4, math.sin(a) * 1.4, 0), 0.16, D)
    s.spire((0, 0, -0.2), 2.6, 0.5, 3, 0.8, light=None)
    s.torus((0, 0, 2.4), 0.55, 0.07, G, 20, 6); s.sphere((0, 0, 2.75), 0.32, G, 10, 5)
    s.spire((0, 0, -0.3), 1.6, 0.45, 2, 0.6, light='navR', down=True)
    return s, objs

def turret_base():
    s = Pi('inst_turret', 1.5, seed=907); objs = []
    s.lathe((0, 0, -0.3), [(1.0, 0), (1.45, 0.3), (1.45, 0.6), (1.2, 0.75)], D, 8)
    s.lathe((0, 0, 0.12), [(1.48, 0), (1.48, 0.1)], R, 8)
    s.crenels((0, 0, 0.45), 1.3, 8, 0.25, 0.4, H)
    s.lathe((0, 0, -0.3), [(1.0, 0), (0.6, -0.8), (0.2, -1.4)], H, 8)
    for k in range(4): a = k * math.pi / 2 + math.pi / 4; s.empty('navR', (math.cos(a) * 1.4, math.sin(a) * 1.4, 0.3), 0.7)
    return s, objs

def hangar():
    s = Pi('inst_hangar', 3.0, seed=908); objs = []
    s.box((0, 0, -0.35), (5.4, 4.4, 0.4), D, ch=0.08)
    s.hangar_hall((0, 0.1, 0.9), 3.2, 3.8, 2.4)
    for sx in (-1, 1):
        s.module(T(sx * 2.25, 0.2, 0.3), 1.0, 3.4, 1.1, red=1, greeb=2)
        s.empty('navr' if sx < 0 else 'navg', (sx * 2.6, -2.0, 0.5), 0.8)
    s.lbox(T(0, 0.3, -0.9), (0, 0, 0), (3.0, 3.0, 0.9), D, ch=0.06)
    return s, objs

def relay():
    s = Pi('inst_relay', 4.0, seed=909); objs = []
    s.drum((0, 0, -0.4), 1.6, 1.6, H, 8)
    s.spire((0, 0, 0.4), 6.6, 1.15, 5, 2.0, light='navg')
    for (dx, dy, hh) in ((0.75, 0.4, 3.6), (-0.7, -0.3, 2.8)):
        s.lathe((dx, dy, 0.4), [(0.38, 0), (0.3, hh)], D, 8); s.tube((dx, dy, 0.4 + hh), (dx, dy, 1.4 + hh), 0.04, D, 4)
    s.spire((0, 0, -1.2), 3.2, 1.0, 3, 1.0, light='navg', down=True)
    s.sphere((0, 0, 3.0), 0.42, E, 12, 6)                            # beacon core
    for k in range(4): a = k * math.pi / 2; s.box((math.cos(a) * 1.1, math.sin(a) * 1.1, 3.0), (0.2, 0.2, 0.5), E)
    # deck boom with solar panels (concept: side platform + blue panels)
    s.box((2.2, -0.6, -0.2), (3.4, 1.6, 0.5), H, ch=0.08); s.box((2.2, -0.6, 0.08), (3.5, 1.7, 0.06), A)
    for i in range(5): s.box((0.8 + i * 0.7, -1.42, -0.2), (0.3, 0.05, 0.14), W)
    s.solar((3.8, -0.6), (6.2, -0.6), 0.0, 1, pw=1.6, pl=2.6, light='navw')
    s.empty('dock', (0, -2.4, 0), 1.0)
    rg = Pi('spin_relay_r', 3.0, seed=6)                             # green beacon rings (spin)
    for rr, ww in ((1.9, 0.07), (2.5, 0.05), (3.1, 0.035)): rg.torus((0, 0, 0), rr, ww, E, 48, 4)
    for k in range(3): a = k * 2 * math.pi / 3; rg.beam((math.cos(a) * 1.0, math.sin(a) * 1.0, 0), (math.cos(a) * 3.1, math.sin(a) * 3.1, 0), 0.04, D)
    objs.append(pivot('spin_relay', rg, (0, 0, 3.0)))
    return s, objs

BUILDERS = {'hq': hq, 'def': defense, 'comm': comm, 'yard': yard, 'reactor': reactor, 'gen': gen, 'turret': turret_base, 'hangar': hangar, 'relay': relay}
MATS = None
import station as _st
if __name__ == '__main__':
    from env_kit import reset
    only = sys.argv[sys.argv.index('--only') + 1].split(',') if '--only' in sys.argv else list(BUILDERS)
    reset(); MATS = env_materials(); _st.MATS = MATS
    roots = {}
    for k in only:
        s, objs = BUILDERS[k](); ob, tris = s.finish(MATS, 1.0)
        for o in objs: o.parent = ob
        sub = sum(sum(len(p.vertices) - 2 for p in c.data.polygons) for o in objs for c in o.children if c.type == 'MESH')
        print('TRIS', ob.name, tris + sub); roots[k] = ob
    if '--noexport' not in sys.argv: export('installations', list(roots.values()), normals=False, uvs=False)  # flat shaded in game
    if '--render' in sys.argv:
        space_world(0.8); from kit import detail_materials
        pal = {'H': 0x5a5c66, 'D': 0x2e3038, 'P': 0x80838c, 'A': 0xb07a28}
        for k_, hx in pal.items():
            from kit import hexrgb; m = bpy.data.materials[k_]; nt = m.node_tree
            for n_ in nt.nodes:
                if n_.type == 'MIX' and n_.data_type == 'RGBA': n_.inputs['A'].default_value = (*hexrgb(hx), 1)
        detail_materials(2.5)
        for k, ob in roots.items():
            for o in roots.values(): o.hide_render = True
            for o in [ob] + list(ob.children_recursive): o.hide_render = False
            for o2 in roots.values():
                if o2 is not ob:
                    for c in o2.children_recursive: c.hide_render = True
            shoot([ob], os.path.join(SHOTS, f'inst-{k}.png'), view=(0.55, -0.75, 0.5), res=(1000, 750), samples=28, dist=0.62, key=(0.4, -1.0, 0.9))

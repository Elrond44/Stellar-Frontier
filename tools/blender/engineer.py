# Engineer — 46 m support/repair. Concept: slim black-and-silver central fuselage with a dark glass nose, orange
# hazard/rust markings, four big squarish white engine-pods on outriggers (upper pair forward, lower pair aft and
# wider) with glowing intake faces, blue light strips, a repair-crane spine.
import sys, os
import bpy  # noqa: F401
sys.path.insert(0, os.path.dirname(__file__))
from kit import Ship
from parts import fuselage, blade, wing, stripe, H, P, D, A, C, W, G

PAL = dict(hull=0x2c3038, plate=0xd6d9dc, dark=0x1a1c20, accent=0xd8701c, glow=(3.4, 1.6, 0.4), win=(0.6, 1.9, 3.4))

def pod(s, x, y, z, w, h, l, side):
    """squarish engine pod: white chamfered box, orange band, dark lit intake face, nozzle at the back."""
    s.loft([(y - l / 2, w * 0.8, w * 0.8, z - h * 0.4, z + h * 0.4, w * 0.2, x), (y - l / 2 + l * 0.08, w, w, z - h / 2, z + h / 2, w * 0.24, x),
            (y + l / 2 - l * 0.1, w, w, z - h / 2, z + h / 2, w * 0.24, x), (y + l / 2, w * 0.86, w * 0.86, z - h * 0.43, z + h * 0.43, w * 0.2, x)], P)
    s.loft([(y - l * 0.1, w * 1.04, w * 1.04, z - h * 0.52, z + h * 0.52, w * 0.25, x), (y + l * 0.06, w * 1.04, w * 1.04, z - h * 0.52, z + h * 0.52, w * 0.25, x)], A)
    s.quad((x, y - l / 2 - 0.02, z), w * 0.6, h * 0.55, 1, D, axis='Y')
    s.quad((x, y - l / 2 - 0.05, z), w * 0.3, h * 0.25, 1, G, axis='Y')
    s.box((x, y + l * 0.2, z + h / 2 + 0.1), (w * 0.4, l * 0.4, 0.2), D, ch=0.05)
    s.nozzle((x, y + l / 2 + 0.6, z), min(w, h) * 0.34, 1.2, seg=10); s.empty('engine', (x, y + l / 2 + 1.2, z), min(w, h) * 0.34)

def build():
    L = 46.0; s = Ship('hull_engineer', L, seed=81)
    fus = [(-23, 0.4, 0.2, -0.6, 0.2, 0), (-19, 3.0, 2.0, -1.6, 1.2, 0.8), (-10, 5.6, 4.0, -2.4, 2.2, 1.4), (4, 6.4, 4.6, -2.6, 2.6, 1.6), (16, 6.0, 4.4, -2.4, 2.4, 1.5), (21, 5.0, 3.6, -2.0, 2.0, 1.2)]
    f = fuselage(s, fus, D)
    s.skin(fus, -16, 20, 7, 0.35, 0.16, lambda i: (P, A, P, P, A, P, P)[i], zclip=0.4)
    s.loft([(-21.5, 0.6, 0.3, -0.2, 0.4, 0.1), (-17, 2.8, 1.8, 0.0, 1.6, 0.6), (-12, 3.4, 2.2, 0.6, 2.2, 0.8), (-9, 2.6, 1.6, 1.4, 2.3, 0.5)], C)  # dark glass nose
    s.loft([(-6, 1.4, 1.0, 2.6, 3.4, 0.3), (14, 1.6, 1.1, 2.6, 3.6, 0.3)], D)  # crane spine
    for k in range(5): s.box((0, -4 + k * 4, 3.8), (2.2, 0.6, 0.6), H, ch=0.15)
    for side in (1, -1):
        # outriggers: upper pair forward, lower pair aft + wider
        s.box((side * 4.6, -2, 2.2), (6.0, 3.0, 1.0), H, ch=0.3)
        pod(s, side * 8.0, -2.0, 3.0, 4.0, 3.6, 13.0, side)
        s.box((side * 6.2, 12, -1.4), (9.0, 3.4, 1.2), H, ch=0.3)
        pod(s, side * 10.6, 12.0, -1.6, 4.6, 4.0, 15.0, side)
        s.strips(-14, 16, lambda y: f.z(y, -0.8) + 0.05, -0.8, side, 0.25, seg=(0.04, 0.1), gap=(0.02, 0.05), mat=G, fill=0.7)
        s.strips(-8, 16, lambda y: f.z(y, 0.6) + 0.05, 0.6, side, 0.3, seg=(0.02, 0.05), gap=(0.01, 0.03), mat=W, fill=0.7)
        s.cyl((side * 1.6, -21, -1.4), 0.12, 3.0, D, 'Y', 6)  # repair arms
        s.box((side * 1.6, -22.6, -1.4), (0.5, 0.4, 0.5), G)
    s.box((0, 21.5, 0), (4.4, 2.0, 3.6), D, ch=0.6)
    s.nozzle((0, 23, 0), 1.3, 1.4, seg=12); s.empty('engine', (0, 23.7, 0), 1.3)
    s.greebles(-4, 18, -2.0, 2.0, 2.6, 14, 0.7, mats=(0, 1, 3))
    s.turret((0, 8, 3.6), 1.8, 2); s.turret((0, -8, 2.6), 1.6, 1)
    return s

if __name__ == '__main__':
    from kit import run
    run(build, 'engineer', PAL, 46.0, 8.0, 5.0)

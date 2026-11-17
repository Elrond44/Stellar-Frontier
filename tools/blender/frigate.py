# Frigate — 100 m tactical warship (concept sheet: layered dark-grey slab hull, wedge prow, stepped superstructure,
# aft bridge tower, rows of amber windows, blue engines). Turrets sized ~4.5 m (fixes the v8 oversized turrets).
import math, sys, os
import bpy  # noqa: F401
sys.path.insert(0, os.path.dirname(__file__))
from kit import Ship

PAL = dict(hull=0x4d535d, plate=0x8e96a1, dark=0x2c3138, accent=0x3b4d6a, glow=(0.5, 1.8, 3.6), win=(3.2, 1.8, 0.6))
H, P, D, A, C, W, G = range(7)

def build():
    s = Ship('hull_frigate', 100.0, seed=21)
    hull = [(-50, 3, 1.5, -2.2, 0.8, 0.4), (-42, 11, 7, -4.2, 2.4, 1.2), (-22, 19, 13, -5.8, 3.8, 2), (10, 23, 16, -6.3, 4.4, 2.2), (38, 25, 17, -6, 4.4, 2.2), (50, 21, 15, -5, 3.8, 2)]
    s.loft(hull, H)
    # ventral armour + keel
    s.loft([(-40, 6, 9, -5.2, -3.6, 1), (30, 14, 20, -7.4, -5.5, 1.5), (48, 12, 18, -6.6, -4.8, 1.4)], D)
    s.loft([(-20, 1.6, 1.6, -9.5, -6, 0.3), (36, 1.6, 1.6, -10.5, -6.5, 0.3)], A)
    # side sponsons with lit window rows
    for side in (1, -1):
        cx = side * 12.2
        s.loft([(-26, 2, 3.6, -3.6, 1.8, 0.6, cx - side * 0.8), (-14, 4.8, 4.2, -4.2, 2.6, 0.8, cx), (36, 5.4, 4.6, -4.4, 2.8, 0.8, cx), (46, 4.6, 4, -3.8, 2.4, 0.7, cx)], P)
        s.windows(-14, 34, 12.2 + 2.75, -1.2, 22, side=side)
        s.windows(-12, 30, 12.2 + 2.75, 0.6, 16, side=side)
        s.windows(-36, 0, 9.5, 0.5, 14, side=side, h=0.35)
        # armour plates (accent) on the sponson top
        for i in range(4):
            y = -10 + i * 11
            s.box((cx, y, 2.9), (4.4, 9.4, 0.5), A if i % 2 else P, ch=0.2)
        # point-defence turrets on the sponsons
        s.turret((cx, -18, 2.5), 2.2, 1, rot=0)
        s.turret((cx, 40, 2.5), 2.2, 1, rot=math.pi)
        # aft engine pods
        s.loft([(34, 6, 5, -4, 1.6, 0.8, side * 9.5), (52, 6.4, 5.4, -4.2, 1.8, 0.9, side * 9.5)], D)
        for x in (5.5, 13.5):
            s.nozzle((side * x, 53.5, -1.2), 2.6, 3, seg=14); s.empty('engine', (side * x, 55.5, -1.2), 2.6)
        # hull-side window band near the prow
        s.windows(-32, -16, 8.5 if False else 7.8, -1.5, 8, side=side, h=0.35)
    # stepped superstructure
    s.loft([(-32, 8, 6, 3.8, 6.6, 1.0), (-22, 12, 10, 4.2, 8.2, 1.4), (26, 14, 11, 4.4, 8.4, 1.4), (34, 12, 9, 4.3, 7.8, 1.2)], H)
    s.loft([(-14, 6, 5, 8.0, 10.6, 0.8), (-6, 9.5, 8, 8.2, 11, 1.0), (22, 10, 8, 8.2, 11, 1.0), (28, 8, 6, 8.1, 10.4, 0.8)], P)
    s.windows(-12, 24, 5.6, 9.4, 14, side=1, h=0.35); s.windows(-12, 24, 5.6, 9.4, 14, side=-1, h=0.35)
    # bridge tower
    s.loft([(10, 6, 5, 10.8, 15.5, 0.8), (14, 7.5, 6, 10.8, 16.2, 1.0), (22, 7.5, 6, 10.8, 16.2, 1.0), (25, 6, 4.5, 10.8, 15.2, 0.8)], D)
    s.loft([(9.6, 5.2, 4.6, 13.6, 14.8, 0.2), (10.4, 6.6, 5.8, 13.6, 14.8, 0.2)], W)  # bridge windows (front)
    s.box((0, 18, 17.2), (3, 4, 2), H, ch=0.3); s.cyl((0, 19, 20.5), 0.15, 5, D, 'Z', 6); s.cyl((1.4, 17, 19.5), 0.1, 3.5, D, 'Z', 6)
    s.box((0, 20.5, 18.6), (5, 0.4, 0.5), G)
    # main turrets: forward pair (one superfiring), one aft
    s.turret((0, -37, 2.2), 4.6, 2)
    s.turret((0, -26, 8.4), 4.6, 2)
    s.turret((0, 40, 4.4), 4.6, 2, rot=math.pi)
    # deck greebles, vents, radiator strips
    s.greebles(-20, 28, -5.5, 5.5, 11.0, 26, 1.4)
    s.greebles(-30, 32, -9, 9, 4.5, 60, 1.6)
    s.greebles(34, 48, -8, 8, 4.0, 18, 1.4)
    for i in range(5): s.box((0, 30 + i * 3.2, 8.6), (8, 1.2, 0.5), D, ch=0.1)
    # engine block + glow ring
    s.box((0, 50.8, -0.8), (22, 3, 8.5), D, ch=1.0)
    for x in (-2.0, 2.0): s.nozzle((x, 53.2, 1.4), 1.6, 2.4, seg=12); s.empty('engine', (x, 54.6, 1.4), 1.6)
    # prow sensor + nav lights
    s.box((0, -49.5, -0.6), (1.6, 2, 0.8), G)
    for side in (1, -1): s.box((side * 12, 50.5, 3.6), (0.6, 0.6, 0.6), G)
    return s

if __name__ == '__main__':
    from kit import run
    run(build, 'frigate', PAL, 100.0, 12.0, 8.0)

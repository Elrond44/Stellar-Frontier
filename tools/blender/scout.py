# Scout — 20 m needle-nosed recon fighter (concept sheet: silver hull, blue accent wings, twin canted tail fins)
import math, sys, os
import bpy  # noqa: F401 (registers mathutils)
sys.path.insert(0, os.path.dirname(__file__))
from mathutils import Matrix
from kit import Ship, make_materials, reset, export_glb, render, detail_materials

PAL = dict(hull=0x8a95a4, plate=0xdfe6ee, dark=0x3c434d, accent=0x2c6be0, glow=(0.4, 1.9, 3.6), win=(0.5, 1.8, 3.2))
H, P, D, A, C, W, G = range(7)

def build():
    s = Ship('hull_scout', 20.0, seed=11)
    fus = [(-10, 0.15, 0.1, -0.05, 0.1, 0), (-8.5, 0.9, 0.6, -0.35, 0.35, 0.15), (-5.5, 2.0, 1.4, -0.75, 0.75, 0.35), (-2, 2.8, 2.0, -0.95, 1.0, 0.45),
           (2, 3.2, 2.4, -1.0, 1.05, 0.5), (6, 3.4, 2.6, -0.95, 0.95, 0.5), (9.2, 3.0, 2.4, -0.8, 0.8, 0.45), (10, 2.6, 2.0, -0.7, 0.7, 0.4)]
    s.loft(fus, H)
    hw = lambda y: next((a[1] + (b[1] - a[1]) * (y - a[0]) / (b[0] - a[0])) / 2 for a, b in zip(fus, fus[1:]) if a[0] <= y <= b[0])
    # dorsal spine plate + belly keel
    s.loft([(-5, 0.6, 0.3, 0.7, 0.85, 0.1), (0, 1.3, 0.9, 0.95, 1.18, 0.2), (8, 1.4, 1.0, 0.85, 1.12, 0.2), (9.6, 1.2, 0.9, 0.7, 0.95, 0.2)], P)
    s.loft([(-6, 0.5, 0.8, -0.9, -0.6, 0.1), (4, 1.4, 2.0, -1.25, -0.85, 0.2), (9.4, 1.2, 1.8, -1.1, -0.75, 0.2)], D)
    # canopy
    s.loft([(-6.6, 0.3, 0.1, 0.55, 0.62, 0), (-4.6, 1.3, 0.8, 0.6, 1.25, 0.25), (-2.2, 1.55, 1.0, 0.8, 1.45, 0.3), (-0.6, 1.3, 0.6, 0.9, 1.25, 0.2)], C)
    s.loft([(-0.8, 1.45, 0.9, 0.85, 1.3, 0.2), (0.4, 1.4, 0.9, 0.85, 1.25, 0.2)], D)  # canopy frame
    # blue accent flank stripes
    for side in (1, -1):
        s.loft([(y, 0.14, 0.14, -0.15, 0.4 if y > -6 else 0.2, 0, side * (hw(y) + 0.03)) for y in (-7.5, -4, 0, 4, 8.5)], A)
    # main swept wings (A top colour block on a plate-grey wing)
    for side in (1, -1):
        M = Matrix.Rotation(-side * math.pi / 2, 4, 'Z')
        cx = lambda y_world: -y_world * side
        s.loft([(1.3, 6.4, 6.0, -0.28, 0.18, 0.1, cx(2.6)), (3.8, 4.4, 4.0, -0.22, 0.14, 0.08, cx(4.4)), (6.2, 2.4, 2.1, -0.16, 0.1, 0.05, cx(6.4))], P, M)
        s.loft([(1.6, 3.2, 3.0, 0.15, 0.24, 0.04, cx(1.8)), (5.6, 1.4, 1.2, 0.08, 0.16, 0.03, cx(5.6))], A, M)
        # forward canards
        s.loft([(1.1, 2.4, 2.2, -0.12, 0.1, 0.05, cx(-4.0)), (2.9, 0.9, 0.8, -0.08, 0.06, 0.03, cx(-3.2))], A, M)
        # wingtip pods: blue nacelle + nose cone + small nozzle
        x = side * 6.35
        s.cyl((x, 5.6, 0), 0.42, 4.0, A, 'Y', 10)
        s.cyl((x, 2.9, 0), 0.05, 1.4, P, 'Y', 10, 0.42)
        s.nozzle((x, 8.0, 0), 0.34, 0.8, seg=10); s.empty('engine', (x, 8.5, 0), 0.34)
        s.box((x, 3.0, 0.45), (0.12, 0.5, 0.12), G)  # nav light
        # canted tail fins
        Mf = Matrix.Translation((side * 1.15, 0, 0.9)) @ Matrix.Rotation(side * math.radians(-24), 4, 'Y') @ Matrix.Rotation(math.pi / 2, 4, 'X')
        s.loft([(0, 0.22, 0.22, -9.6, -4.4, 0.05), (1.4, 0.18, 0.18, -9.4, -6.2, 0.05), (2.8, 0.12, 0.12, -9.3, -7.8, 0.04)], H, Mf)
        s.loft([(2.0, 0.2, 0.2, -9.3, -7.2, 0.03), (2.85, 0.15, 0.15, -9.25, -7.9, 0.03)], A, Mf)
        # intake under the wing root
        s.box((side * 1.55, -1.2, -0.45), (0.7, 2.6, 0.6), D, ch=0.12)
        s.box((side * 1.55, -2.52, -0.45), (0.5, 0.05, 0.4), G)
        # under-nose gun
        s.cyl((side * 0.55, -7.2, -0.42), 0.06, 2.4, D, 'Y', 6)
    # twin main engines + glow
    for x in (-0.75, 0.75):
        s.nozzle((x, 10.4, 0.05), 0.52, 1.0, seg=12); s.empty('engine', (x, 10.9, 0.05), 0.52)
    s.box((0, 9.9, 0.05), (2.7, 0.3, 1.25), D, ch=0.2)
    s.greebles(4, 8.5, -0.6, 0.6, 1.08, 10, 0.32)
    s.empty('hard', (0, -7.5, -0.4), 0.4)
    return s

if __name__ == '__main__':
    from kit import run
    run(build, 'scout', PAL, 20.0, 5.0, 2.5)

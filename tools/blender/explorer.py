# Explorer — 80 m long-range scout. Concept: sleek silver-and-dark hull with a long glowing blue glass canopy band,
# a huge silver arch/ring sweeping over and around the forward hull, gold-lit flanks, bronze-panelled swept rear
# wings with pods, sensor masts, warm amber engine light.
import math, sys, os
import bpy  # noqa: F401
sys.path.insert(0, os.path.dirname(__file__))
from kit import Ship
from parts import fuselage, blade, wing, stripe, arc, H, P, D, A, C, W, G

PAL = dict(hull=0x3a3f47, plate=0xc8cdd4, dark=0x1c1f24, accent=0xb08a4a, glow=(3.4, 2.0, 0.6), win=(3.4, 2.1, 0.7))

def build():
    L = 80.0; s = Ship('hull_explorer', L, seed=101)
    fus = [(-40, 0.6, 0.3, -1.0, 0.2, 0), (-34, 6.0, 4.0, -2.8, 2.0, 1.6), (-20, 10.0, 7.0, -3.8, 3.4, 2.4), (0, 11.4, 8.0, -4.0, 3.8, 2.6), (20, 10.4, 7.4, -3.6, 3.4, 2.4), (32, 8.4, 6.0, -3.0, 2.8, 2.0)]
    f = fuselage(s, fus, P)
    s.skin(fus, -32, 30, 8, 0.5, 0.25, lambda i: (H, P, H, P, A, P, H, P)[i], zclip=-0.6)
    # long glowing blue canopy band along the spine
    s.loft([(-33, 1.0, 0.4, 2.2, 2.6, 0.2), (-26, 4.4, 2.6, 2.8, 4.4, 1.0), (-8, 4.8, 2.8, 3.4, 5.0, 1.1), (6, 3.6, 2.0, 3.6, 4.6, 0.8), (10, 2.0, 1.0, 3.6, 4.0, 0.4)], C)
    s.loft([(-24, 0.3, 0.3, 4.5, 4.9, 0), (6, 0.3, 0.3, 4.6, 5.0, 0)], D)
    # the big arch: sweeps over the forward hull, tilted outward, mirrored as a pair of arcs meeting overhead
    # ring around the forward hull: roughly horizontal, tilted up at the back, open aft where it joins the hull
    arc(s, (0, -6, 6.0), 17.0, math.radians(75), math.radians(465), 32, 2.4, 1.8, P, plane='XY', tilt=math.radians(-55))
    arc(s, (0, -6, 6.0), 17.9, math.radians(80), math.radians(460), 32, 0.35, 0.3, G, plane='XY', tilt=math.radians(-55))
    for side in (1, -1):
        s.loft([(2, 1.2, 1.2, 2.0, 3.6, 0.3, side * 5.0), (8, 1.4, 1.4, 6.0, 9.0, 0.3, side * 9.0)], H)   # ring struts
        # swept bronze-panelled rear wings with tip pods
        wing(s, side, (5.0, 6, -1.0), [(0, 0), (12, 6), (15, 11), (14.4, 15), (0, 20)], 0.8, H, dihedral=-4, inset=0.06)
        wing(s, side, (5.0, 6, -0.5), [(2, 4), (11, 7.4), (12.5, 11), (2, 14)], 0.3, A, dihedral=-4, inset=0.05)
        s.cyl((side * 19.6, 20, -2.0), 1.4, 12, P, 'Y', 10); s.cyl((side * 19.6, 13.4, -2.0), 0.4, 1.6, H, 'Y', 10, 1.4)
        s.nozzle((side * 19.6, 26.6, -2.0), 1.2, 1.4, seg=10); s.empty('engine', (side * 19.6, 27.4, -2.0), 1.2)
        blade(s, side, (3.0, 8, 3.2), [(2, 0), (14, 0), (19, 4.6), (17.6, 5.0), (5, 0.8)], 0.4, P, cant=34)
        s.strips(-30, 28, lambda y: f.z(y, -1.0) + 0.06, -1.0, side, 0.5, seg=(0.02, 0.07), gap=(0.008, 0.025), mat=W, fill=0.85)
        s.strips(-26, 24, lambda y: f.z(y, 1.0) + 0.06, 1.0, side, 0.3, seg=(0.03, 0.08), gap=(0.02, 0.04), mat=W, fill=0.6)
    for x, y, hgt in ((0, 14, 10), (-2, 18, 6), (2, 20, 7)): s.cyl((x, y, 4 + hgt / 2), 0.3, hgt, D, 'Z', 6, 0.1)
    s.cyl((0, 14, 9.4), 1.6, 0.3, P, 'Z', 12)  # sensor dish
    s.box((0, 33, 0), (8, 3, 5), D, ch=0.8)
    for x in (-2.2, 2.2):
        s.nozzle((x, 35, 0), 1.6, 1.8, seg=12); s.empty('engine', (x, 36, 0), 1.6)
    s.turret((0, -16, 4.6), 2.4, 2); s.turret((0, 24, 3.8), 2.4, 2, rot=math.pi)
    s.greebles(10, 30, -2.5, 2.5, 3.6, 14, 1.0, mats=(0, 1, 2))
    return s

if __name__ == '__main__':
    from kit import run
    run(build, 'explorer', PAL, 80.0, 10.0, 6.0)

# Interceptor — 23 m dogfighter. Concept: long needle dart, red/black with silver top plating, raised spine with a
# dark canopy, very long swept dorsal blades canted outboard, short swept rear wings with drooping red tip blades,
# red ventral fin, twin small engines.
import sys, os
import bpy  # noqa: F401
sys.path.insert(0, os.path.dirname(__file__))
from kit import Ship
from parts import fuselage, blade, wing, stripe, H, P, D, A, C, W, G

PAL = dict(hull=0x3a3f48, plate=0xb9bec6, dark=0x1e2228, accent=0xc0262c, glow=(0.6, 1.6, 3.6), win=(3.2, 1.8, 0.6))

def build():
    L = 23.0; s = Ship('hull_interceptor', L, seed=21)
    fus = [(-11.5, 0.12, 0.06, -0.15, 0.02, 0), (-9.5, 0.9, 0.6, -0.45, 0.32, 0.25), (-6, 1.9, 1.4, -0.8, 0.75, 0.55), (-1, 3.1, 2.4, -1.0, 1.1, 0.8),
           (4, 3.4, 2.6, -1.0, 1.15, 0.85), (8.5, 3.1, 2.4, -0.9, 1.0, 0.75), (11, 2.6, 2.0, -0.75, 0.85, 0.6)]
    f = fuselage(s, fus, A); hwf = lambda y: f(y)[0] / 2
    # silver top armour + black belly + raised spine
    s.loft([(-8.5, 0.5, 0.3, 0.4, 0.55, 0.1), (-3, 2.2, 1.6, 0.9, 1.18, 0.3), (6, 2.6, 1.9, 1.0, 1.26, 0.35), (10.5, 1.6, 1.1, 0.7, 0.92, 0.25)], P)
    s.loft([(-9, 0.4, 0.8, -0.55, -0.3, 0.1), (3, 1.6, 2.4, -1.15, -0.75, 0.3), (10.8, 1.3, 1.9, -0.9, -0.6, 0.25)], D)
    s.loft([(-2, 0.4, 0.2, 1.1, 1.25, 0.08), (2, 0.9, 0.5, 1.15, 1.6, 0.2), (9, 0.9, 0.5, 1.1, 1.5, 0.2), (10.6, 0.6, 0.3, 0.9, 1.15, 0.1)], D)
    s.loft([(-6.6, 0.3, 0.1, 0.62, 0.75, 0), (-4.5, 1.1, 0.6, 0.8, 1.3, 0.3), (-1.8, 1.15, 0.6, 1.0, 1.45, 0.3), (0, 0.8, 0.4, 1.1, 1.3, 0.2)], C)
    for side in (1, -1):
        stripe(s, side, (-9, -5, 0, 5, 10.5), hwf, -0.2, 0.25, D, 0.08)   # black flank band
        stripe(s, side, (-7, -2, 4, 10), hwf, 0.35, 0.5, P, 0.06)         # silver pinstripe
        # very long dorsal blade: dark core, red leading blade
        blade(s, side, (0.5, -3.0, 1.0), [(1.5, 0), (6.0, 0), (11.0, 2.4), (10.2, 2.6), (3.6, 0.5)], 0.16, D, cant=32)
        blade(s, side, (0.5, -3.0, 1.0), [(6.2, 0.25), (10.8, 2.3), (10.2, 2.45), (5.5, 0.6)], 0.2, A, cant=32, inset=0.08)
        # short swept rear wing (red top, black underside plate) + drooping tip blade
        wing(s, side, (1.2, 3.0, -0.25), [(0, 0), (3.8, 3.4), (4.0, 5.2), (0, 6.6)], 0.24, A, dihedral=-6)
        wing(s, side, (1.2, 3.0, -0.42), [(0.2, 1.0), (3.6, 3.9), (3.7, 5.0), (0.2, 6.2)], 0.1, D, dihedral=-6, inset=0.05)
        wing(s, side, (1.2, 3.0, -0.08), [(0.5, 1.4), (3.2, 3.6), (3.3, 4.2), (0.5, 2.6)], 0.08, P, dihedral=-6, inset=0.05)
        blade(s, side, (5.0, 5.8, -0.6), [(-0.6, 0.3), (2.2, 0.1), (4.4, -2.0), (3.6, -2.1), (0.4, -0.6)], 0.16, A, cant=-35)
        # chin canards
        wing(s, side, (0.7, -7.0, -0.35), [(0, 0), (1.6, 1.4), (1.7, 2.0), (0, 2.4)], 0.1, D, dihedral=-8)
        s.cyl((side * 0.45, -8.6, -0.4), 0.05, 2.6, D, 'Y', 6)
        s.strips(-7, 8, lambda y: f.z(y, -0.45) + 0.04, -0.45, side, 0.09, seg=(0.03, 0.07), gap=(0.02, 0.05), mat=5)
    # red ventral fin
    blade(s, 1, (0, 6.0, -0.95), [(0, 0), (4.2, 0), (5.8, -1.9), (4.9, -2.0), (1.4, -0.5)], 0.14, A, cant=0)
    # aft engine block + twin engines
    s.box((0, 10.6, 0.05), (2.3, 1.6, 1.4), D, ch=0.3)
    for x in (-0.6, 0.6):
        s.nozzle((x, 11.7, 0.05), 0.46, 0.9, seg=12); s.empty('engine', (x, 12.2, 0.05), 0.46)
    s.greebles(4, 9.5, -0.5, 0.5, 1.5, 6, 0.3, mats=(0, 2))
    s.empty('hard', (0.45, -8.6, -0.4), 0.4); s.empty('hard', (-0.45, -8.6, -0.4), 0.4)
    return s

if __name__ == '__main__':
    from kit import run
    run(build, 'interceptor', PAL, 23.0, 5.0, 2.5)

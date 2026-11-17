# Bomber — 32 m base-assault bomber. Concept: broad red/black/silver arrowhead; a central armoured fuselage with a
# big cyan-lit canopy, very large swept triangular wings with red panels and pointed forward-reaching tips, two
# engine pods riding high on the rear quarters, bomb-bay plating underneath, orange running lights.
import sys, os
import bpy  # noqa: F401
sys.path.insert(0, os.path.dirname(__file__))
from kit import Ship
from parts import fuselage, blade, wing, stripe, H, P, D, A, C, W, G

PAL = dict(hull=0x2e2a30, plate=0xa6a3a8, dark=0x1b181c, accent=0xa81c24, glow=(3.4, 0.9, 0.4), win=(3.4, 1.4, 0.4))

def build():
    L = 32.0; s = Ship('hull_bomber', L, seed=91)
    fus = [(-16, 0.4, 0.2, -0.5, 0.0, 0), (-13, 2.6, 1.6, -1.2, 0.9, 0.7), (-7, 4.4, 3.0, -1.6, 1.6, 1.1), (2, 5.0, 3.4, -1.7, 1.9, 1.2), (10, 4.6, 3.2, -1.5, 1.7, 1.1), (14.5, 3.8, 2.6, -1.2, 1.3, 0.9)]
    f = fuselage(s, fus, H)
    s.skin(fus, -14, 14, 6, 0.3, 0.14, lambda i: (P, A, P, D, A, P)[i], zclip=0.3)
    s.loft([(-11.5, 0.4, 0.2, 0.8, 1.0, 0), (-9, 2.2, 1.4, 1.0, 2.1, 0.5), (-5.5, 2.6, 1.6, 1.4, 2.5, 0.6), (-3, 2.0, 1.0, 1.7, 2.3, 0.4)], C)
    s.loft([(-12, 2.6, 3.4, -2.0, -1.4, 0.3), (10, 3.6, 4.4, -2.4, -1.5, 0.4)], D)  # bomb-bay plating
    for k in range(4): s.box((0, -6 + k * 4, -2.45), (2.6, 2.6, 0.1), A)
    for side in (1, -1):
        # big triangular wing: silver base, red top panel, dark trailing plate; tip reaches forward
        # big forward-reaching dagger wing: root aft, tip far forward and outboard
        wing(s, side, (2.2, 0, -0.5), [(0, -2), (6.4, -10.5), (8.6, -13.5), (10.4, -11.5), (10.0, 0.5), (5.0, 6.0), (0, 7.0)], 1.0, H, dihedral=-8, inset=0.08)
        wing(s, side, (2.2, 0, -0.1), [(1.5, -2), (6.8, -9.5), (8.6, -11.6), (9.4, -10.4), (9.0, -0.5), (4.6, 4.0), (1.5, 4.6)], 0.25, A, dihedral=-8, inset=0.06)
        wing(s, side, (2.2, 0, -0.6), [(0.5, 4.5), (4.0, 4.3), (3.0, 7.0), (0.5, 8.0)], 0.3, D, dihedral=-8, inset=0.04)
        s.box((side * 10.6, -13.4, -1.8), (0.3, 0.8, 0.3), G)  # wingtip light
        # high engine pods on the rear quarters
        x, z = side * 3.6, 1.9
        s.cyl((x, 7.5, z), 1.15, 11, D, 'Y', 12)
        s.cyl((x, 4.2, z), 1.22, 3.0, A, 'Y', 12)
        s.cyl((x, 1.7, z), 0.95, 0.6, P, 'Y', 12, 1.22)
        s.cyl((x, 1.36, z), 0.72, 0.06, D, 'Y', 12)
        s.box((side * 2.6, 7.5, 1.1), (1.4, 7, 0.6), H, ch=0.15)
        s.nozzle((x, 13.6, z), 0.95, 1.2, seg=12); s.empty('engine', (x, 14.3, z), 0.95)
        blade(s, side, (2.2, 6, 1.4), [(2, 0), (8, 0), (10.2, 2.4), (9.2, 2.6), (4, 0.6)], 0.2, A, cant=30)
        s.strips(-10, 12, lambda y: f.z(y, -0.5) + 0.05, -0.5, side, 0.22, seg=(0.03, 0.08), gap=(0.02, 0.04), mat=W, fill=0.8)
        s.empty('hard', (side * 4.5, -4, -1.4), 0.8)
    s.box((0, 15, 0.1), (3.4, 1.6, 2.4), D, ch=0.5)
    s.nozzle((0, 16.2, 0.1), 0.9, 1.1, seg=12); s.empty('engine', (0, 16.8, 0.1), 0.9)
    s.greebles(-2, 12, -1.2, 1.2, 1.85, 10, 0.5, mats=(0, 1, 2))
    return s

if __name__ == '__main__':
    from kit import run
    run(build, 'bomber', PAL, 32.0, 6.0, 3.0)

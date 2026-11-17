# Strike Fighter — 25 m. Concept: yellow/black/silver; pointed central fuselage with a big glass canopy, two heavy
# engine nacelles carried high on the rear quarters (round intakes in front), forward-raked canard blades, rear wings
# with down-swept tips, yellow hazard striping on dark armour.
import sys, os
import bpy  # noqa: F401
sys.path.insert(0, os.path.dirname(__file__))
from kit import Ship
from parts import fuselage, blade, wing, stripe, H, P, D, A, C, W, G

PAL = dict(hull=0x2e333b, plate=0xb8bec7, dark=0x1b1e23, accent=0xe2b021, glow=(1.0, 1.6, 3.6), win=(3.2, 2.2, 0.8))

def build():
    L = 25.0; s = Ship('hull_strike', L, seed=31)
    fus = [(-12.5, 0.15, 0.08, -0.2, 0.05, 0), (-10.5, 1.1, 0.7, -0.6, 0.45, 0.3), (-6.5, 2.4, 1.7, -1.0, 0.95, 0.65), (-1.5, 3.2, 2.4, -1.15, 1.25, 0.85),
           (4, 3.4, 2.6, -1.15, 1.3, 0.9), (9, 3.0, 2.3, -1.0, 1.1, 0.8), (11.5, 2.5, 1.9, -0.85, 0.9, 0.65)]
    f = fuselage(s, fus, A); hwf = lambda y: f(y)[0] / 2
    # yellow upper hull plates (nose -> mid) and silver spine, black belly
    s.loft([(-11, 0.6, 0.4, 0.2, 0.42, 0.12), (-6.5, 2.2, 1.5, 0.7, 1.05, 0.4), (-1.5, 2.9, 2.0, 0.95, 1.33, 0.5), (2, 2.8, 1.9, 0.98, 1.35, 0.5)], A)
    s.loft([(-0.5, 1.6, 1.0, 1.2, 1.45, 0.3), (9, 2.0, 1.3, 1.05, 1.38, 0.3), (11.2, 1.5, 1.0, 0.8, 1.0, 0.25)], P)
    s.loft([(-10, 0.5, 0.9, -0.7, -0.4, 0.15), (4, 1.8, 2.8, -1.4, -0.95, 0.35), (11.3, 1.5, 2.2, -1.1, -0.75, 0.3)], D)
    # bubble canopy with frame
    s.loft([(-7.8, 0.3, 0.15, 0.85, 0.95, 0), (-6, 1.3, 0.8, 1.0, 1.55, 0.35), (-3.2, 1.55, 0.95, 1.2, 1.85, 0.4), (-1, 1.3, 0.7, 1.3, 1.6, 0.3), (0, 0.9, 0.4, 1.35, 1.45, 0.15)], C)
    s.box((0, -3.6, 1.86), (0.16, 3.6, 0.12), D); s.box((0, -2.2, 1.78), (1.5, 0.2, 0.2), D, ch=0.06)
    for side in (1, -1):
        stripe(s, side, (-10, -6, -2, 2), hwf, -0.35, 0.15, D, 0.08)
        stripe(s, side, (2, 6, 10.8), hwf, -0.1, 0.45, A, 0.08)
        # heavy engine nacelle on a short pylon, high on the rear quarter
        x, z = side * 2.75, 1.25
        s.cyl((x, 4.4, z), 0.78, 9.0, D, 'Y', 12)                       # black nacelle body
        s.cyl((x, 1.4, z), 0.84, 2.6, A, 'Y', 12)                        # yellow cowl
        s.cyl((x, -0.4, z), 0.68, 0.8, P, 'Y', 12, 0.84)                 # silver intake lip
        s.cyl((x, -0.78, z), 0.5, 0.06, D, 'Y', 12)                      # intake fan face
        s.box((x, 5.6, z + 0.74), (0.4, 4.5, 0.2), A, ch=0.06)           # yellow top stripe
        s.box((side * 1.9, 4.0, 1.0), (1.4, 5.0, 0.4), H, ch=0.12)       # pylon
        s.nozzle((x, 9.4, z), 0.68, 1.0, seg=12); s.empty('engine', (x, 9.9, z), 0.68)
        # forward canard blades raked up and forward
        wing(s, side, (1.2, -4.8, 0.3), [(0, 0), (2.6, -1.6), (4.6, -2.2), (4.2, -1.3), (0, 2.0)], 0.16, A, dihedral=14)
        wing(s, side, (1.2, -4.8, 0.42), [(0.6, 0.0), (3.6, -1.6), (3.9, -1.3), (0.6, 1.0)], 0.06, D, dihedral=14, inset=0.05)
        # rear wing below the nacelle with a down-swept yellow tip
        wing(s, side, (1.4, 4.0, -0.3), [(0, 0), (5.2, 2.8), (6.4, 5.0), (5.4, 5.6), (0, 6.4)], 0.24, H, dihedral=-3)
        wing(s, side, (1.4, 4.0, -0.15), [(2.5, 1.6), (5.2, 2.9), (6.0, 4.6), (2.5, 4.0)], 0.1, A, dihedral=-3, inset=0.05)
        blade(s, side, (6.4, 7.6, -0.6), [(-1.2, 0.3), (1.6, 0.1), (3.0, -1.8), (2.3, -1.9), (-0.2, -0.6)], 0.16, A, cant=-35)
        # wing cannon
        s.cyl((side * 2.4, -4.6, -0.4), 0.09, 3.6, D, 'Y', 6)
        s.strips(-8, 9, hwf(0) + 0.04, -0.55, side, 0.1, seg=(0.03, 0.07), gap=(0.02, 0.04), mat=5)
    # central small engine
    s.box((0, 11.0, 0.1), (2.0, 1.4, 1.3), D, ch=0.3)
    s.nozzle((0, 12.0, 0.1), 0.55, 0.9, seg=12); s.empty('engine', (0, 12.5, 0.1), 0.55)
    s.greebles(3, 10, -0.6, 0.6, 1.35, 8, 0.34, mats=(1, 2, 3))
    s.empty('hard', (2.4, -6.4, -0.4), 0.45); s.empty('hard', (-2.4, -6.4, -0.4), 0.45)
    return s

if __name__ == '__main__':
    from kit import run
    run(build, 'strike', PAL, 25.0, 5.0, 2.5)

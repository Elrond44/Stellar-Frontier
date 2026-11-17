# Gunship — 52 m heavy-firepower hull. Concept: red/black/silver; broad flat chisel nose, raised silver spine and
# armoured cockpit, thick red wing blocks on the aft quarters with down-swept blades, a forward dorsal blade, big gun
# barrels under the nose, amber light strip along the lower flanks.
import sys, os
import bpy  # noqa: F401
sys.path.insert(0, os.path.dirname(__file__))
from kit import Ship
from parts import fuselage, blade, wing, stripe, H, P, D, A, C, W, G

PAL = dict(hull=0x2f333a, plate=0xb3b8c0, dark=0x1b1d22, accent=0xb3242a, glow=(3.2, 1.4, 0.6), win=(3.4, 1.9, 0.6))

def build():
    L = 52.0; s = Ship('hull_gunship', L, seed=51)
    # flat chisel hull: wide and low
    fus = [(-26, 4.0, 2.4, -0.9, 0.0, 0.3), (-22, 8.0, 5.4, -2.0, 1.0, 0.9), (-12, 11.0, 7.4, -3.0, 2.0, 1.4), (2, 12.0, 8.0, -3.2, 2.4, 1.5),
           (16, 11.4, 7.6, -3.0, 2.2, 1.4), (24, 9.6, 6.4, -2.6, 1.9, 1.2), (26, 8.6, 5.8, -2.3, 1.7, 1.0)]
    f = fuselage(s, fus, D); hwf = lambda y: f(y)[0] / 2
    s.skin(fus, -25, 24, 8, 0.4, 0.2, lambda i: (A, A, P, A, P, A, P, A)[i], zclip=0.2)
    # raised silver spine + armoured cockpit
    s.loft([(-16, 1.4, 1.0, 2.0, 2.4, 0.3), (-8, 4.2, 3.0, 2.2, 4.0, 0.9), (14, 4.6, 3.2, 2.2, 4.2, 1.0), (22, 3.6, 2.4, 2.0, 3.4, 0.8)], P)
    s.loft([(-12, 0.6, 0.3, 3.4, 3.6, 0), (-9.5, 2.6, 1.4, 3.6, 4.6, 0.5), (-6, 2.8, 1.6, 3.9, 5.0, 0.6), (-3.8, 2.0, 1.0, 4.1, 4.7, 0.4)], C)
    s.skin([(-6, 4.6, 3.2, 3.8, 4.6, 0.6), (14, 4.6, 3.2, 3.8, 4.6, 0.6)], -6, 14, 4, 0.3, 0.12, lambda i: (A if i % 2 else D))
    for side in (1, -1):
        # thick red aft wing block + black trailing plate + down-swept blade
        wing(s, side, (5.0, 6, -0.4), [(0, 0), (5.8, 4.0), (7.0, 9.0), (6.2, 13), (0, 15)], 1.4, A, dihedral=-4, inset=0.1)
        wing(s, side, (5.0, 6, -1.4), [(0.2, 4), (6.4, 9.4), (5.8, 12.6), (0.2, 14.5)], 0.5, D, dihedral=-4, inset=0.05)
        wing(s, side, (5.0, 6, 0.5), [(1.0, 2.0), (5.2, 4.8), (5.8, 7.4), (1.0, 6.0)], 0.2, P, dihedral=-4, inset=0.05)
        blade(s, side, (11.6, 15, -0.9), [(-3, 0.4), (4.5, 0.1), (7, -4.4), (5.6, -4.6), (-0.4, -1.2)], 0.4, A, cant=-30)
        # forward dorsal blade
        blade(s, side, (2.0, -10, 2.2), [(0, 0), (9, 0), (15.5, 4.0), (14.2, 4.3), (3.6, 0.8)], 0.32, D, cant=46)
        blade(s, side, (2.0, -10, 2.2), [(9.6, 0.3), (15.2, 3.8), (14.5, 4.0), (8.8, 0.8)], 0.38, A, cant=46, inset=0.06)
        # heavy cannons under the nose
        s.box((side * 2.4, -17, -2.4), (1.6, 9, 1.4), D, ch=0.3)
        s.cyl((side * 2.4, -25, -2.4), 0.32, 8, D, 'Y', 8); s.cyl((side * 2.4, -29.1, -2.4), 0.42, 0.6, H, 'Y', 8)
        # amber light strip and windows
        s.strips(-20, 20, lambda y: f.z(y, -1.6) + 0.08, -1.6, side, 0.3, seg=(0.03, 0.08), gap=(0.01, 0.03), mat=5, fill=0.85)
        s.strips(-6, 12, 2.42, 3.0, side, 0.28, seg=(0.02, 0.05), gap=(0.01, 0.02), mat=5, fill=0.7)
        # side gun sponson
        s.loft([(-4, 1.6, 1.4, -2.2, 0.4, 0.5, side * 6.4), (6, 2.2, 1.8, -2.4, 0.6, 0.6, side * 6.6)], H)
    s.turret((0, -2, 4.2), 3.0, 2); s.turret((0, 9, 4.2), 3.0, 2, rot=3.14159)
    s.box((0, 25, 0), (8.4, 3, 4.4), D, ch=0.8)
    for x in (-2.6, 0, 2.6):
        s.nozzle((x, 26.9, 0.2), 1.2, 1.6, seg=12); s.empty('engine', (x, 27.7, 0.2), 1.2)
    s.greebles(14, 23, -1.6, 1.6, 4.0, 8, 0.8, mats=(0, 2))
    s.box((0, -26.05, -0.6), (3.0, 0.2, 0.3), W)
    s.empty('hard', (2.4, -29.4, -2.4), 1.0); s.empty('hard', (-2.4, -29.4, -2.4), 1.0)
    return s

if __name__ == '__main__':
    from kit import run
    run(build, 'gunship', PAL, 52.0, 8.0, 5.0)

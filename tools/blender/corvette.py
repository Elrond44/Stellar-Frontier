# Corvette — 50 m multi-role. Concept: sleek blue/silver/black hull, dark armoured lower body, raised blue glass
# bridge canopy forward of mid-ship, two long upper engine pods carried aft (silver nose caps, amber vents), long
# lower side pods, swept blade fins, blue light lines and amber running lights.
import sys, os
import bpy  # noqa: F401
sys.path.insert(0, os.path.dirname(__file__))
from kit import Ship
from parts import fuselage, blade, wing, stripe, H, P, D, A, C, W, G

PAL = dict(hull=0x36404e, plate=0xaeb8c6, dark=0x1c2129, accent=0x2f6fd0, glow=(0.6, 1.8, 3.8), win=(3.2, 1.9, 0.6))

def build():
    L = 50.0; s = Ship('hull_corvette', L, seed=41)
    fus = [(-25, 0.3, 0.15, -0.6, 0.1, 0), (-21, 3.0, 2.0, -1.8, 1.0, 0.8), (-13, 6.6, 4.6, -2.8, 2.2, 1.5), (-2, 8.4, 6.0, -3.1, 2.7, 1.8),
           (10, 8.8, 6.4, -3.0, 2.8, 1.8), (20, 8.0, 5.8, -2.8, 2.5, 1.6), (24, 7.0, 5.0, -2.5, 2.2, 1.4)]
    f = fuselage(s, fus, H); hwf = lambda y: f(y)[0] / 2
    # dark lower armour + silver/blue upper plates (segmented skin = deep panel lines)
    s.loft([(-22, 2.0, 3.0, -2.2, -1.2, 0.4), (-8, 6.0, 8.0, -3.8, -2.2, 1.0), (22, 6.4, 8.2, -3.6, -2.0, 1.0), (24.5, 5.4, 7.0, -3.0, -1.8, 0.8)], D)
    s.skin(fus, -21, 22, 9, 0.35, 0.18, lambda i: (A, P, P, A, P, H, P, A, P)[i], zclip=0.6)
    # raised bridge with blue glass canopy
    s.loft([(-13, 1.2, 0.8, 2.2, 2.6, 0.3), (-9, 4.0, 2.8, 2.4, 4.2, 0.9), (-1, 4.4, 3.0, 2.6, 4.6, 1.0), (3, 3.4, 2.2, 2.6, 4.0, 0.8)], P)
    s.loft([(-12.2, 0.8, 0.4, 2.9, 3.1, 0), (-10, 3.2, 2.0, 3.2, 4.5, 0.7), (-6.5, 3.4, 2.0, 3.6, 5.0, 0.8), (-4.2, 2.6, 1.4, 4.0, 4.8, 0.5)], C)
    s.greebles(-2, 8, -1.4, 1.4, 3.6, 8, 0.8, mats=(0, 2))
    for side in (1, -1):
        # upper engine pods: long silver-capped cylinders on the aft shoulders
        x, z = side * 3.4, 3.1
        s.cyl((x, 12.5, z), 1.35, 22, H, 'Y', 12)
        s.cyl((x, 0.6, z), 0.5, 2.4, P, 'Y', 12, 1.35)
        s.cyl((x, 8.0, z), 1.42, 5.0, A, 'Y', 12)
        s.box((x, 16, z + 1.3), (0.7, 6, 0.3), D)
        s.nozzle((x, 24.4, z), 1.15, 1.6, seg=12); s.empty('engine', (x, 25.2, z), 1.15)
        for k in range(4): s.box((x + side * 1.32, 14 + k * 1.6, z), (0.2, 0.6, 0.5), W)
        # long lower side pods
        xp = side * 5.6
        s.loft([(-12, 0.6, 0.4, -2.2, -1.6, 0.2, xp * 0.8), (-6, 2.4, 2.0, -2.9, -0.6, 0.7, xp), (18, 2.6, 2.2, -3.0, -0.4, 0.8, xp), (22.5, 2.0, 1.6, -2.6, -0.8, 0.6, xp)], H)
        s.loft([(-5, 0.14, 0.14, -1.9, -1.2, 0, xp + side * 1.25), (17, 0.14, 0.14, -1.9, -1.2, 0, xp + side * 1.35)], A)
        s.nozzle((xp, 23.4, -1.7), 0.8, 1.2, seg=10); s.empty('engine', (xp, 24, -1.7), 0.8)
        # blade fins: long swept dorsal blade + down-swept aft fins
        blade(s, side, (2.6, -4, 2.4), [(2, 0), (12, 0), (20, 4.2), (18.6, 4.5), (6, 0.8)], 0.3, P, cant=48)
        blade(s, side, (2.6, -4, 2.4), [(12.5, 0.3), (19.6, 4.0), (18.9, 4.2), (11.6, 0.8)], 0.36, A, cant=48, inset=0.06)
        blade(s, side, (5.8, 14, -2.6), [(-2, 0.3), (5, 0.1), (8, -3.6), (6.6, -3.8), (0, -1)], 0.3, D, cant=-38)
        wing(s, side, (4.4, 6, -0.6), [(0, 0), (4.8, 4.0), (5.2, 9.0), (0, 12)], 0.4, H, dihedral=-5)
        # windows + blue light lines
        s.strips(-18, 18, lambda y: f.z(y, 0.1) + 0.06, 0.1, side, 0.35, seg=(0.02, 0.06), gap=(0.01, 0.03), mat=5, fill=0.8)
        s.strips(-16, 16, lambda y: f.z(y, -0.6) + 0.06, -0.6, side, 0.18, seg=(0.05, 0.12), gap=(0.02, 0.05), mat=6, fill=0.7)
        s.quad((side * 1.0, -21.05, -0.9), 0.5, 0.25, side, W, axis='Y')
    # main engine block
    s.box((0, 23.5, 0), (6.6, 3, 4.6), D, ch=0.8)
    for x in (-1.6, 1.6):
        s.nozzle((x, 25.4, 0), 1.3, 1.6, seg=12); s.empty('engine', (x, 26.2, 0), 1.3)
    s.turret((0, -15, 2.4), 2.2, 2); s.turret((0, 9, 3.4), 2.4, 2, rot=3.14159)
    s.turret((4.6, 2, 0.9), 1.5, 1); s.turret((-4.6, 2, 0.9), 1.5, 1)
    return s

if __name__ == '__main__':
    from kit import run
    run(build, 'corvette', PAL, 50.0, 8.0, 5.0)

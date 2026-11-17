# Scout — 20 m recon fighter. Concept: slim rounded silver fuselage with blue panelling, long blue canopy, twin swept
# dorsal blades canted outboard, short forward canards, rear swept wings ending in down-angled blue tip blades,
# twin engines with blue glow.
import sys, os
import bpy  # noqa: F401
sys.path.insert(0, os.path.dirname(__file__))
from kit import Ship
from parts import fuselage, blade, wing, nacelle, stripe, H, P, D, A, C, W, G

PAL = dict(hull=0x9aa6b4, plate=0xe4eaf0, dark=0x343b45, accent=0x2a66dc, glow=(0.4, 1.9, 3.6), win=(0.5, 1.8, 3.2))

def build():
    s = Ship('hull_scout', 20.0, seed=11)
    fus = [(-10, 0.2, 0.1, -0.2, 0.05, 0), (-8.6, 1.2, 0.8, -0.55, 0.4, 0.3), (-5.5, 2.6, 1.8, -1.0, 0.95, 0.7), (-2, 3.2, 2.3, -1.15, 1.2, 0.85),
           (2, 3.4, 2.5, -1.2, 1.25, 0.9), (6.5, 3.2, 2.4, -1.1, 1.15, 0.85), (9.4, 2.7, 2.0, -0.9, 0.95, 0.7)]
    _f = fuselage(s, fus, H)
    hwf = lambda y: _f(y)[0] / 2
    # silver dorsal deck + dark belly keel
    s.loft([(-7.5, 0.5, 0.3, 0.5, 0.62, 0.1), (-3, 1.5, 1.1, 0.95, 1.16, 0.25), (6, 1.7, 1.2, 0.95, 1.18, 0.25), (9.2, 1.3, 1.0, 0.75, 0.95, 0.2)], P)
    s.loft([(-7, 0.4, 0.7, -0.75, -0.45, 0.1), (5, 1.4, 2.0, -1.15, -0.8, 0.25), (9.2, 1.2, 1.7, -0.95, -0.65, 0.2)], D)
    # long canopy
    s.loft([(-6.8, 0.2, 0.1, 0.62, 0.7, 0), (-5, 1.1, 0.7, 0.75, 1.3, 0.3), (-2.2, 1.35, 0.85, 0.95, 1.55, 0.35), (0.2, 1.1, 0.6, 1.05, 1.35, 0.25), (1.2, 0.8, 0.4, 1.1, 1.2, 0.15)], C)
    s.box((0, -1.6, 1.45), (1.3, 0.25, 0.25), D, ch=0.08)  # canopy frame bar
    # blue flank panels + white pinstripe
    for side in (1, -1):
        stripe(s, side, (-8, -4, 0, 4, 8.6), hwf, 0.05, 0.55, A, 0.1)
        stripe(s, side, (-6, -2, 3, 8.6), hwf, -0.45, -0.3, P, 0.06)
        # twin dorsal blades canted outboard, swept hard back
        blade(s, side, (0.6, -1.5, 1.05), [(1.2, 0), (4.6, 0), (7.4, 2.9), (6.6, 3.05), (2.8, 0.6)], 0.16, P, cant=52)
        blade(s, side, (0.6, -1.5, 1.05), [(5.0, 0.3), (7.3, 2.8), (6.7, 2.9), (4.5, 0.7)], 0.2, A, cant=52, inset=0.1)
        # forward canards (blue)
        wing(s, side, (0.9, -5.6, 0.05), [(0, 0), (2.2, 1.3), (2.4, 2.0), (0, 2.4)], 0.14, A, dihedral=6)
        # main swept wing: silver with a blue leading band
        wing(s, side, (1.3, 0.8, -0.2), [(0, 0), (4.6, 2.6), (4.9, 4.6), (0, 7.4)], 0.26, P, dihedral=-4)
        wing(s, side, (1.3, 0.8, -0.05), [(0.4, 0.3), (4.5, 2.6), (4.6, 3.3), (0.4, 1.5)], 0.1, A, dihedral=-4, inset=0.05)
        # down-angled blue tip blades
        blade(s, side, (6.0, 3.6, -0.45), [(-1.2, 0.3), (2.2, 0.1), (3.2, -1.7), (2.5, -1.75), (0.2, -0.6)], 0.16, A, cant=-30)
        # blue side cheek pods (intakes along the flanks)
        s.loft([(-4.5, 0.2, 0.2, -0.5, 0.0, 0.05, side * 1.55), (-3, 0.8, 0.7, -0.8, 0.3, 0.25, side * 1.75), (3.5, 0.9, 0.8, -0.85, 0.35, 0.3, side * 1.85), (6, 0.6, 0.5, -0.6, 0.2, 0.2, side * 1.7)], A)
        # wing-root intake + gun
        s.quad((side * 1.75, -3.02, -0.25), 0.55, 0.6, side, D, axis='Y')
        s.cyl((side * 0.5, -7.4, -0.38), 0.05, 2.2, D, 'Y', 6)
        s.box((side * 1.2, 7.9, 0.2), (0.5, 1.6, 0.4), D, ch=0.1)
    # twin main engines in a dark aft housing
    s.box((0, 8.9, 0.05), (2.6, 1.4, 1.35), D, ch=0.3)
    for x in (-0.68, 0.68):
        s.nozzle((x, 10.0, 0.05), 0.5, 0.9, seg=12); s.empty('engine', (x, 10.5, 0.05), 0.5)
    s.greebles(3.5, 8.2, -0.5, 0.5, 1.15, 8, 0.3, mats=(0, 2))
    s.strips(-6, 7, 1.62, 0.2, 1, 0.08, seg=(0.04, 0.09), gap=(0.02, 0.05), mat=6); s.strips(-6, 7, 1.62, 0.2, -1, 0.08, seg=(0.04, 0.09), gap=(0.02, 0.05), mat=6)
    s.empty('hard', (0, -7.5, -0.4), 0.4)
    return s

if __name__ == '__main__':
    from kit import run
    run(build, 'scout', PAL, 20.0, 5.0, 2.5)

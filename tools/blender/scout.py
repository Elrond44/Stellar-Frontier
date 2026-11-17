# Scout, layered variant (try-out): narrow core fuselage + raised canopy spine module + two long parallel side
# pontoons with pointed bows (the concept's stacked, multi-hull fighter look), blue-topped pontoons, canted blades,
# short swept wings with down-angled blue tips, twin engines.
import sys, os
import bpy  # noqa: F401
sys.path.insert(0, os.path.dirname(__file__))
from kit import Ship
from parts import fuselage, blade, wing, stripe, H, P, D, A, C, W, G

PAL = dict(hull=0x9aa6b4, plate=0xe4eaf0, dark=0x343b45, accent=0x2a66dc, glow=(0.4, 1.9, 3.6), win=(0.5, 1.9, 3.6))

def build(name='hull_scout', L=20.0, pal_acc=A, sc=1.0):
    s = Ship(name, L, seed=13); k = L / 20.0
    q = lambda v: v * k
    core = [(-10, 0.2, 0.1, -0.3, 0.1, 0), (-8, 1.2, 0.8, -0.7, 0.5, 0.4), (-4, 2.1, 1.5, -0.95, 0.9, 0.6), (3, 2.3, 1.7, -1.0, 1.0, 0.65), (8.5, 2.0, 1.5, -0.85, 0.85, 0.55), (9.6, 1.7, 1.2, -0.7, 0.7, 0.45)]
    core = [(q(a), q(b), q(c), q(d), q(e), q(f)) for a, b, c, d, e, f in core]
    f = fuselage(s, core, H)
    # raised spine module carrying the long canopy
    s.loft([(q(-7.5), q(0.4), q(0.2), q(0.6), q(0.8), q(0.1)), (q(-5), q(1.5), q(1.1), q(0.8), q(1.55), q(0.4)), (q(4), q(1.7), q(1.2), q(0.9), q(1.7), q(0.45)), (q(8.5), q(1.2), q(0.8), q(0.8), q(1.3), q(0.3))], P)
    s.loft([(q(-6.8), q(0.3), q(0.1), q(1.2), q(1.3), 0), (q(-4.6), q(1.1), q(0.6), q(1.4), q(2.0), q(0.3)), (q(-1.5), q(1.3), q(0.7), q(1.6), q(2.25), q(0.35)), (q(1.5), q(1.0), q(0.5), q(1.7), q(2.0), q(0.25)), (q(2.6), q(0.6), q(0.3), q(1.7), q(1.8), q(0.1))], C)
    s.box((0, q(4.5), q(1.9)), (q(1.2), q(5), q(0.25)), D, ch=q(0.08))
    for side in (1, -1):
        # long side pontoon: pointed bow forward, runs to the stern, blue top, silver flank, dark keel
        x = side * q(2.15)
        pont = [(q(-8.6), q(0.1), q(0.05), q(-0.4), q(-0.2), 0, x * 0.7), (q(-6.5), q(0.9), q(0.6), q(-0.75), q(0.35), q(0.3), x * 0.92), (q(-2), q(1.25), q(0.95), q(-0.9), q(0.6), q(0.4), x),
                (q(6), q(1.3), q(1.0), q(-0.9), q(0.6), q(0.4), x), (q(9.2), q(1.1), q(0.8), q(-0.75), q(0.5), q(0.35), x)]
        s.loft(pont, P)
        s.loft([(a, b * 0.86, c * 0.86, e - q(0.05), e + q(0.12), q(0.08), cx) for a, b, c, d, e, _, cx in pont[1:]], pal_acc)
        s.loft([(a, b * 0.7, c * 0.7, d - q(0.12), d + q(0.1), q(0.05), cx) for a, b, c, d, e, _, cx in pont[1:]], D)
        s.nozzle((x, q(9.6), q(-0.15)), q(0.42), q(0.7), seg=10); s.empty('engine', (x, q(10.0), q(-0.15)), q(0.42))
        s.strips(q(-5), q(8), abs(x) + q(0.66), q(-0.15), side, q(0.07), seg=(0.03, 0.07), gap=(0.02, 0.04), mat=G, fill=0.75)
        # canted dorsal blades rising from the pontoon tops
        blade(s, side, (abs(x) * 0.6, q(-1.0), q(0.6)), [(q(1.5), 0), (q(4.6), 0), (q(7.4), q(2.6)), (q(6.7), q(2.75)), (q(3.0), q(0.5))], q(0.15), P, cant=30)
        blade(s, side, (abs(x) * 0.6, q(-1.0), q(0.6)), [(q(5.0), q(0.3)), (q(7.2), q(2.5)), (q(6.7), q(2.6)), (q(4.6), q(0.7))], q(0.19), pal_acc, cant=30, inset=0.1)
        # short swept wing off the pontoon with a down-angled blue tip blade
        wing(s, side, (abs(x) + q(0.5), q(2.0), q(-0.3)), [(0, 0), (q(3.4), q(2.6)), (q(3.6), q(4.0)), (0, q(5.6))], q(0.22), H, dihedral=-4)
        wing(s, side, (abs(x) + q(0.5), q(2.0), q(-0.17)), [(q(0.3), q(0.4)), (q(3.2), q(2.6)), (q(3.3), q(3.2)), (q(0.3), q(1.6))], q(0.08), pal_acc, dihedral=-4, inset=0.05)
        blade(s, side, (abs(x) + q(3.8), q(4.4), q(-0.55)), [(q(-1.2), q(0.3)), (q(1.8), q(0.1)), (q(2.8), q(-1.6)), (q(2.2), q(-1.65)), (q(0.1), q(-0.55))], q(0.15), pal_acc, cant=-30)
        # forward canard
        wing(s, side, (abs(x) + q(0.4), q(-5.0), q(0.0)), [(0, 0), (q(1.5), q(1.0)), (q(1.6), q(1.6)), (0, q(1.9))], q(0.12), pal_acc, dihedral=8)
        s.cyl((side * q(0.5), q(-8.6), q(-0.5)), q(0.05), q(2.0), D, 'Y', 6)
    s.box((0, q(9.2), 0), (q(2.2), q(1.2), q(1.5)), D, ch=q(0.3))
    for x in (-0.55, 0.55):
        s.nozzle((q(x), q(10.1), 0), q(0.45), q(0.8), seg=12); s.empty('engine', (q(x), q(10.6), 0), q(0.45))
    s.greebles(q(3), q(8), q(-0.5), q(0.5), q(1.7), 6, q(0.28), mats=(0, 2))
    s.empty('hard', (0, q(-8.6), q(-0.5)), q(0.4))
    return s

if __name__ == '__main__':
    from kit import run
    name = sys.argv[1] if len(sys.argv) > 1 and not sys.argv[1].startswith('-') else 'scout'
    run(build, name, PAL, 20.0, 5.0, 2.5)

# Cruiser — 200 m command ship. Concept: heavy silver-grey layered hull with a long chisel prow and lower jaw, a
# forward raised bridge with a wide blue glass window, blue light strips and glowing blue intakes along the lower
# flanks, long lower side pods, stacked armour tiers aft, turrets.
import math, sys, os
import bpy  # noqa: F401
sys.path.insert(0, os.path.dirname(__file__))
from kit import Ship
from parts import warship, port, H, P, D, A, C, W, G

PAL = dict(hull=0x4a5260, plate=0xaab3c0, dark=0x252a33, accent=0x2b5db8, glow=(0.4, 1.9, 3.8), win=(0.5, 1.9, 3.6))

def build():
    L = 200.0; s = Ship('hull_cruiser', L, seed=121)
    f, top = warship(s, 46.0, 26.0, dict(prow=0.36, tiers=3, plates=11, accent={4, 8}, stripe=False, tower=(0.3, 18, 30, 10, 2), spires=2,
            shoulders=0.3, engines=[(-0.22, -0.15, 4.6), (0.22, -0.15, 4.6), (-0.62, -0.2, 3.6), (0.62, -0.2, 3.6)],
            turrets=[(0.18, 0, 6.5, 2, False), (0.45, 0, 7.0, 3, False), (0.58, 0, 7.0, 3, False), (0.86, 0, 6.0, 2, True), (0.5, 0.42, 3.0, 2, False), (0.5, -0.42, 3.0, 2, False), (0.7, 0.42, 3.0, 2, False), (0.7, -0.42, 3.0, 2, False)],
            greebles=30))
    # wide blue glass across the forward bridge
    s.box((0, -40.8, top + 6.5), (13, 1.4, 3.0), C)
    for side in (1, -1):
        # long lower side pod with blue glow strip and intakes
        cx = side * 26
        s.loft([(-50, 2, 2, -14, -8, 1, side * 22), (-38, 9, 8, -16, -4, 2, cx), (70, 10, 9, -16, -4, 2, cx), (82, 8, 7, -15, -5, 2, cx)], H)
        s.loft([(-36, 0.4, 0.4, -11, -9.6, 0, side * 30.6), (66, 0.4, 0.4, -11, -9.6, 0, side * 31.2)], G)
        for y in (-16, 30): port(s, side * 30.5, y, -6.5, 4.2, side, depth=2)
        s.strips(-60, 80, lambda y: f.z(y, 2) + 0.15, 2.0, side, 0.8, seg=(0.02, 0.06), gap=(0.02, 0.05), mat=G, fill=0.6)
    return s

if __name__ == '__main__':
    from kit import run
    run(build, 'cruiser', PAL, 200.0, 18.0, 12.0, view=(0.8, -0.52, 0.3))

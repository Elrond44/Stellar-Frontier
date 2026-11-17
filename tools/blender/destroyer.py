# Destroyer — 140 m anti-capital hull. Concept: long dark-gunmetal wedge with a stacked chisel prow, red accent
# pinstripes along the deck edges, red-trimmed stepped tower aft, heavy engine shoulders, thin amber window strips
# along the lower prow and flanks, heavy turrets fore and aft.
import sys, os
import bpy  # noqa: F401
sys.path.insert(0, os.path.dirname(__file__))
from kit import Ship
from parts import warship, H, P, D, A, C, W, G

PAL = dict(hull=0x3a404a, plate=0x9aa2ad, dark=0x1a1d22, accent=0xb3232b, glow=(3.4, 1.4, 0.6), win=(3.4, 1.9, 0.6))

def build():
    L = 140.0; s = Ship('hull_destroyer', L, seed=61)
    warship(s, 30.0, 17.0, dict(prow=0.36, tiers=3, plates=10, accent=set(), stripe=True, tower=(0.68, 15, 28, 12, 3), tower_accent=True, spires=3,
            shoulders=0.32, engines=[(-0.3, -0.15, 3.6), (0, -0.15, 3.6), (0.3, -0.15, 3.6), (-0.62, -0.2, 2.6), (0.62, -0.2, 2.6)],
            turrets=[(0.22, 0, 6.0, 3, False), (0.32, 0, 6.0, 3, False), (0.87, 0, 5.2, 2, True), (0.45, 0.42, 2.6, 2, False), (0.45, -0.42, 2.6, 2, False), (0.6, 0.42, 2.6, 2, False), (0.6, -0.42, 2.6, 2, False)],
            greebles=26))
    s.box((0, -69.6, -4.0), (5, 0.4, 1.0), W)  # prow running light
    return s

if __name__ == '__main__':
    from kit import run
    run(build, 'destroyer', PAL, 140.0, 14.0, 9.0, view=(0.82, -0.5, 0.3))

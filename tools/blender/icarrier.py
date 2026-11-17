# Intercept Carrier — 160 m drone carrier. Concept: low, flat dark-navy wedge with a stacked chisel prow, broad
# flight-deck shoulders either side of a raised central spine and bridge, a swept blade fin, amber light strips along
# the lower prow edges, lit hangar mouths (drone launch) in the shoulders' bows and flanks.
import math, sys, os
import bpy  # noqa: F401
sys.path.insert(0, os.path.dirname(__file__))
from kit import Ship
from parts import warship, blade, hangar, H, P, D, A, C, W, G

PAL = dict(hull=0x37415a, plate=0x8c98b0, dark=0x161a22, accent=0x3a4a6a, glow=(3.4, 2.0, 0.5), win=(3.4, 2.0, 0.6))

def build():
    L = 160.0; s = Ship('hull_icarrier', L, seed=111)
    f, top = warship(s, 34.0, 18.0, dict(prow=0.4, tiers=2, plates=10, accent={2, 7}, stripe=False, tower=(0.55, 12, 26, 9, 2), spires=2,
            shoulders=0.0, engines=[(-0.25, -0.15, 3.4), (0.25, -0.15, 3.4)],
            turrets=[(0.3, 0, 4.0, 2, False), (0.82, 0, 3.6, 2, True)], greebles=18))
    for side in (1, -1):
        # broad flight-deck shoulder hull alongside the core
        cx = side * 27
        sec = [(-56, 1.5, 1, -5, 0, 0.5, side * 18), (-36, 10, 7, -7, 2, 1.5, side * 23), (-6, 18, 14, -8, 5, 2, cx), (70, 20, 16, -8, 6, 2, cx), (78, 16, 13, -7, 5, 2, cx)]
        s.loft(sec, H)
        s.skin([q[:6] for q in sec], -34, 74, 6, 0.8, 0.3, lambda i: (P, H, P, A, P, H)[i], zclip=0.0)
        s.loft([(-4, 9, 7, 5.6, 9, 1.5, cx), (40, 10, 8, 5.6, 9.5, 1.5, cx), (60, 8, 6, 5.6, 8, 1.2, cx)], P)  # raised shoulder deck
        s.strips(0, 58, abs(cx) + 4.4, 7.4, side, 0.5, seg=(0.01, 0.03), gap=(0.004, 0.012), mat=W, fill=0.8)
        # hangar mouths: two in the bow face of the shoulder (drones launch forward) + two on the outer flank
        for dx in (-4.5, 4.5): hangar(s, cx + dx, -6.4, -3.0, 6.5, 4.0, 1, axis='Y')
        for y in (0, 30): hangar(s, side * 37.1, y, -2.5, 14, 4.5, side)
        s.strips(-4, 72, 37.25, -6.2, side, 0.6, seg=(0.02, 0.05), gap=(0.008, 0.02), mat=W, fill=0.85)
        s.nozzle((cx, 79.5, -2), 3.0, 3.0, seg=12); s.empty('engine', (cx, 81, -2), 3.0)
        blade(s, side, (6, -10, top), [(4, 0), (30, 0), (44, 9), (41, 9.6), (12, 1.4)], 0.8, P, cant=40)
    return s

if __name__ == '__main__':
    from kit import run
    run(build, 'icarrier', PAL, 160.0, 14.0, 9.0, view=(0.72, -0.6, 0.38))

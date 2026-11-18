# Battlecruiser — 380 m heavy-weapons capital. Concept: long dark-gunmetal layered hull, blocky stacked armour tiers,
# rows of heavy turrets, big round blue-glowing flank ports/turbines along deep lower sponsons, blue light strips,
# amber windows, a mid-aft command block, heavy engine shoulders.
import math, sys, os
import bpy  # noqa: F401
sys.path.insert(0, os.path.dirname(__file__))
from kit import Ship
from parts import warship, port, H, P, D, A, C, W, G

PAL = dict(hull=0x4e5562, plate=0xa8b0bb, dark=0x1f242b, accent=0x3b4656, glow=(0.45, 1.9, 3.8), win=(3.4, 1.9, 0.6))

def build():
    L = 380.0; s = Ship('hull_battlecruiser', L, seed=131)
    f, top = warship(s, 74.0, 40.0, dict(prow=0.3, tiers=3, plates=14, accent={5, 10}, stripe=False, tower=(0.62, 30, 56, 18, 3), spires=4,
            shoulders=0.28, engines=[(-0.25, -0.15, 7), (0, -0.15, 7), (0.25, -0.15, 7), (-0.62, -0.2, 6), (0.62, -0.2, 6)],
            turrets=[(0.12, 0, 9, 2, False), (0.2, 0, 11, 3, False), (0.3, 0, 12, 3, False), (0.42, 0, 12, 3, False), (0.8, 0, 11, 3, True), (0.9, 0, 9, 2, True),
                     (0.35, 0.42, 5, 2, False), (0.35, -0.42, 5, 2, False), (0.5, 0.42, 5, 2, False), (0.5, -0.42, 5, 2, False), (0.7, 0.42, 5, 2, False), (0.7, -0.42, 5, 2, False)],
            greebles=50, seat_turrets=True))
    # v12: chunky armoured dorsal humps beside the centreline guns (the concept's raised top modules)
    for side in (1, -1):
        for ya, yb, hh, m in ((-10, 40, 8, P), (80, 132, 9, P)):
            s.loft([(ya, 14, 8, top - 3, top + hh * 0.6, 1.5, side * 19), (ya + 6, 18, 11, top - 3, top + hh, 2, side * 20), (yb - 4, 18, 11, top - 3, top + hh, 2, side * 20), (yb, 14, 9, top - 3, top + hh * 0.7, 1.5, side * 19)], m)
            s.strips(ya + 8, yb - 6, 29.2, top + hh * 0.45, side, 0.9, seg=(0.008, 0.02), gap=(0.003, 0.01), mat=G, fill=0.8)
    for side in (1, -1):
        cx = side * 42
        sec = [(-120, 4, 4, -30, -18, 2, side * 36), (-100, 18, 16, -32, -6, 3, cx), (140, 20, 18, -32, -4, 3, cx), (160, 16, 14, -30, -6, 3, cx)]
        s.loft(sec, H)
        s.skin([q[:6] for q in sec], -98, 156, 8, 1.4, 0.7, lambda i: (P, H, D, P, H, D, P, H)[i], zclip=-14)
        # v12 reshape: the concept's big blue rings are the intakes of forward-facing turbine nacelles slung low on the
        # flanks (a short fore pod and a longer aft pod per side), not side-facing discs
        for yc, ln, r_, x_, z_ in ((-62, 46, 11, 57, -22), (46, 62, 13.5, 60, -19)):
            x = side * x_; y0 = yc - ln / 2
            s.cyl((x, yc, z_), r_, ln, D, 'Y', 12, r_ * 1.05)  # pod body
            s.cyl((x, y0 - 0.6, z_), r_ * 1.1, 3.0, H, 'Y', 12)  # armoured intake lip
            s.cyl((x, y0 - 2.4, z_), r_ * 0.84, 0.6, G, 'Y', 12)  # glowing blue intake face
            s.cyl((x, y0 - 3.0, z_), r_ * 0.42, 1.2, D, 'Y', 10); s.cyl((x, y0 - 3.8, z_), r_ * 0.16, 0.8, G, 'Y', 8)  # hub
            s.box((x, yc + 2, z_ + r_ * 0.75), (r_ * 1.3, ln * 0.8, r_ * 0.7), P, ch=1.5)  # dorsal armour shroud
            s.box((x - side * r_ * 0.9, yc, z_ + 3), (r_ * 0.8, ln * 0.6, 6), H, ch=1)  # pylon into the sponson
            s.strips(y0 + 6, y0 + ln - 4, abs(x) + r_ * 0.98, z_, side, 1.0, seg=(0.008, 0.02), gap=(0.003, 0.01), mat=G, fill=0.85)
            s.nozzle((x, y0 + ln + 2, z_), r_ * 0.7, 4, seg=12)
        for k, (ya, yb) in enumerate(((-96, -78), (-60, -32), (28, 72), (108, 150))):  # chunky sponson modules
            s.box((cx, (ya + yb) / 2, -2), (18, yb - ya, 8), P if k % 2 else H, ch=2)
            s.strips(ya + 2, yb - 2, abs(cx) + 9.2, -2, side, 1.0, seg=(0.008, 0.02), gap=(0.003, 0.008), mat=G, fill=0.8)
        s.strips(-96, 150, 52.1, -9, side, 1.2, seg=(0.01, 0.03), gap=(0.004, 0.012), mat=W, fill=0.8)
        s.strips(-96, 150, 52.1, -28, side, 0.9, seg=(0.02, 0.05), gap=(0.02, 0.05), mat=G, fill=0.7)
        s.nozzle((cx, 162, -18), 6.5, 7, seg=14); s.empty('engine', (cx, 166, -18), 6.5)
    return s

if __name__ == '__main__':
    from kit import run
    run(build, 'battlecruiser', PAL, 380.0, 40.0, 25.0, view=(0.85, -0.48, 0.26), dist=0.55)

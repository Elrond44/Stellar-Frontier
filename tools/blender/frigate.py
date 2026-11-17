# Frigate — 100 m tactical hull. Concept: dark blue-black gunmetal wedge with a stacked chisel prow, silver plate
# highlights, stepped bridge tower just aft of mid-ship with blue glass, chunky aft engine shoulders, amber and blue
# window strips along the flanks, compact turrets fore and aft.
import sys, os
import bpy  # noqa: F401
sys.path.insert(0, os.path.dirname(__file__))
from kit import Ship
from parts import warship, H, P, D, A, C, W, G

PAL = dict(hull=0x343b47, plate=0x8c96a4, dark=0x1b1f26, accent=0x3a5e9a, glow=(0.6, 1.8, 3.8), win=(3.2, 1.9, 0.6))

def build():
    L = 100.0; s = Ship('hull_frigate', L, seed=71)
    warship(s, 26.0, 14.0, dict(prow=0.34, tiers=2, plates=8, accent={2, 6}, stripe=False, tower=(0.6, 12, 22, 8, 2), spires=2,
            shoulders=0.36, engines=[(-0.22, -0.15, 2.8), (0.22, -0.15, 2.8), (-0.66, -0.2, 2.4), (0.66, -0.2, 2.4)],
            turrets=[(0.26, 0, 4.6, 2, False), (0.38, 0, 4.6, 2, False), (0.85, 0, 4.2, 2, True), (0.5, 0.42, 2.2, 2, False), (0.5, -0.42, 2.2, 2, False)],
            greebles=20))
    s.box((0, -49.7, -3.0), (4, 0.4, 0.8), W)
    return s

if __name__ == '__main__':
    from kit import run
    run(build, 'frigate', PAL, 100.0, 10.0, 7.0, view=(0.82, -0.5, 0.3))

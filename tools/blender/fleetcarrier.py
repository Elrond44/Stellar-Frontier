# Fleet Carrier — 420 m mobile base. Concept: long flat grey flight deck with amber deck lines on top, a stepped
# island superstructure with turrets and glowing sensor domes aft-centre, a layered lower hull with big round blue
# ports and amber window strips, a blunt bow with lit hangar mouths under the deck lip (fighters launch forward),
# side hangar openings, heavy engine block.
import math, sys, os
import bpy  # noqa: F401
sys.path.insert(0, os.path.dirname(__file__))
from kit import Ship
from parts import fuselage, port, hangar, H, P, D, A, C, W, G

PAL = dict(hull=0x58606b, plate=0xa8afb8, dark=0x22262c, accent=0x5a6170, glow=(0.5, 1.9, 3.6), win=(3.4, 2.0, 0.6))

def build():
    L = 420.0; s = Ship('hull_fleetcarrier', L, seed=141); r = s.rng
    # lower hull
    low = [(-205, 30, 40, -36, -12, 4), (-170, 70, 84, -44, -8, 6), (190, 84, 96, -46, -6, 7), (210, 76, 88, -40, -8, 6)]
    s.loft(low, D)
    mid = [(-210, 40, 36, -14, 6, 4), (-180, 90, 84, -16, 12, 6), (195, 100, 92, -16, 14, 7), (210, 92, 86, -14, 12, 6)]
    f = fuselage(s, mid, H)
    s.skin(mid, -205, 205, 16, 2.4, 1.2, lambda i: (P if i % 3 == 0 else H), zclip=-12)
    # flight deck: wide flat slab overhanging the bow, amber deck lines
    deck = [(-212, 60, 56, 14, 20, 3), (-196, 108, 104, 14, 21, 4), (200, 110, 106, 14, 21, 4), (208, 100, 96, 14, 20, 3)]
    s.loft(deck, P)
    s.skin(deck, -205, 205, 12, 2.0, 0.6, lambda i: (H if i % 2 else P), zclip=19)
    for x in (-34, 0, 34): s.loft([(-196, 1.0, 1.0, 22.6, 22.9, 0, x), (150, 1.0, 1.0, 22.6, 22.9, 0, x)], W)
    for side in (1, -1): s.loft([(-200, 0.8, 0.8, 22.6, 22.9, 0, side * 50), (200, 0.8, 0.8, 22.6, 22.9, 0, side * 50)], W)
    for k in range(9): s.box((0, -180 + k * 40, 22.75), (40, 1.0, 0.3), W)
    # island superstructure (aft-centre) with domes, spires and turrets
    z = 22
    for k, (w, l, h) in enumerate(((76, 150, 16), (56, 104, 16), (36, 62, 14), (20, 30, 10))):
        yc = 120 + k * 6
        s.loft([(yc - l / 2, w * 0.7, w * 0.55, z, z + h, 2), (yc - l / 2 + l * 0.15, w, w * 0.82, z, z + h, 3), (yc + l / 2, w, w * 0.82, z, z + h, 3)], H if k != 1 else P)
        for side in (1, -1): s.strips(yc - l / 2 + l * 0.2, yc + l / 2 - 2, w * 0.47, z + h * 0.5, side, 1.4, seg=(0.004, 0.012), gap=(0.002, 0.006), mat=W, fill=0.9)
        z += h
    s.box((0, 94, z - 5), (14, 2, 3), C)
    for x, y in ((-8, 110), (8, 110), (-40, 40), (40, 40)):
        s.cyl((x, y, z + 4), 5, 8, D, 'Z', 12); s.cyl((x, y, z + 8.6), 4.2, 1.4, G, 'Z', 12)
    for x, y, hgt in ((0, 124, 50), (-6, 132, 34), (7, 128, 40)): s.cyl((x, y, z + hgt / 2), 1.2, hgt, D, 'Z', 6, 0.4)
    for y in (50, 175): s.turret((0, y, 22), 12, 3, rot=0 if y < 100 else math.pi)
    for x in (-18, 18): s.turret((x, 100, 62), 7, 2)
    for y in (-150, -60, 20):
        for side in (1, -1): s.turret((side * 46, y, 21), 6, 2)
    # bow hangar mouths under the deck lip (launch forward) + side hangars
    for x in (-30, -10, 10, 30): hangar(s, x, -205.5, 2, 16, 9, 1, axis='Y')
    for side in (1, -1):
        for y in (-120, -40, 40): hangar(s, side * 50.3, y, 0, 40, 9, side)
        for y in (-140, 0, 140): port(s, side * 46, y, -26, 12, side, depth=5)
        s.strips(-190, 200, lambda y: f.z(y, 8) + 0.6, 8, side, 1.3, seg=(0.01, 0.03), gap=(0.004, 0.012), mat=W, fill=0.8)
        s.strips(-160, 190, lambda y: 46, -34, side, 1.0, seg=(0.01, 0.03), gap=(0.004, 0.012), mat=W, fill=0.7)
    # engines
    s.box((0, 208, -14), (80, 10, 40), D, ch=5)
    for x in (-27, 0, 27):
        for zz in (-26, -4):
            s.nozzle((x, 218, zz), 9, 10, seg=14); s.empty('engine', (x, 224, zz), 9)
    s.greebles(-190, 60, -40, 40, 22.8, 40, 5, mats=(0, 2))
    s.box((0, -212.5, 16), (30, 1, 1.2), W)
    return s

if __name__ == '__main__':
    from kit import run
    run(build, 'fleetcarrier', PAL, 420.0, 40.0, 25.0, view=(0.8, -0.5, 0.3), dist=0.55)

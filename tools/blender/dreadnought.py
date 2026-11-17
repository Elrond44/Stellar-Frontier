# Dreadnought — 720 m Titan-class capital ship (concept sheet: long layered slab hull, segmented armour blocks with red
# faction plates, turret batteries along the deck, aft command citadel with spires, amber window rows, hangar bays,
# ventral pylons, a wall of engines).
import math, sys, os
import bpy  # noqa: F401
sys.path.insert(0, os.path.dirname(__file__))
from kit import Ship

PAL = dict(hull=0x5a606a, plate=0xa2a8b0, dark=0x2c3036, accent=0xa3262c, glow=(0.6, 1.8, 3.8), win=(3.4, 1.9, 0.6))
H, P, D, A, C, W, G = range(7)

def build():
    s = Ship('hull_dreadnought', 720.0, seed=77); r = s.rng
    # main hull: long tapering slab
    s.loft([(-360, 16, 8, -14, 4, 3), (-320, 50, 36, -26, 12, 8), (-200, 104, 78, -40, 24, 12), (60, 140, 104, -48, 30, 15), (290, 150, 110, -46, 30, 15), (360, 130, 96, -38, 25, 13)], H)
    # lower hull / belly
    s.loft([(-300, 30, 46, -34, -22, 6), (-100, 80, 108, -56, -36, 10), (300, 90, 130, -58, -40, 12), (352, 80, 116, -50, -34, 10)], D)
    # prow ram plates
    for side in (1, -1):
        s.loft([(-352, 4, 4, -10, 4, 1, side * 6), (-250, 10, 10, -26, 14, 3, side * 34), (-180, 10, 10, -32, 18, 3, side * 50)], P)
    # segmented armour blocks along the deck (every third one carries the faction colour)
    segs = [(-300, -248), (-240, -184), (-176, -118), (-110, -50), (-42, 20), (28, 88), (96, 150), (230, 290), (298, 346)]
    for i, (y0, y1) in enumerate(segs):
        t = (y0 + 360) / 720; w = 60 + 70 * min(1, t * 1.6); zb = 4 + 26 * min(1, t * 1.8) - 2
        m = A if i in (2, 5, 7) else P
        s.loft([(y0, w, w * 0.8, zb, zb + 12, 3), (y0 + 6, w + 6, w * 0.84, zb, zb + 14, 4), (y1 - 6, w + 6, w * 0.84, zb, zb + 14, 4), (y1, w, w * 0.8, zb, zb + 12, 3)], m)
        # side armour skirts with window rows
        for side in (1, -1):
            hx = w / 2 + 6
            s.loft([(y0 + 4, 10, 8, zb - 18, zb + 4, 2, side * hx), (y1 - 4, 10, 8, zb - 18, zb + 4, 2, side * hx)], m if m == A else H)
            s.windows(y0 + 8, y1 - 8, hx + 5.2, zb - 8, 9, side=side, h=2.2)
            s.windows(y0 + 8, y1 - 8, hx + 5.2, zb - 2, 9, side=side, h=2.2)
        # turret battery on top of the block (~18 m barbettes, triple guns)
        if i not in (7,):
            for k, x in enumerate((-w * 0.28, w * 0.28) if w > 80 else (0,)):
                s.turret((x, (y0 + y1) / 2, zb + 14), 17 if w > 80 else 14, 3, rot=0 if i < 6 else math.pi)
        s.greebles(y0 + 6, y1 - 6, -w * 0.4, w * 0.4, zb + 14, 14, 6)
    # long lower sponsons (hangar decks) with lit galleries
    for side in (1, -1):
        cx = side * 74
        s.loft([(-230, 20, 20, -40, -4, 5, side * 52), (-120, 30, 26, -46, 0, 6, cx), (300, 34, 28, -48, 2, 6, cx), (346, 30, 24, -42, 0, 6, cx)], H)
        s.windows(-110, 300, 74 + 17.2, -30, 46, side=side, h=2.4)
        s.windows(-110, 300, 74 + 17.2, -20, 46, side=side, h=2.4)
        s.windows(-90, 280, 74 + 17.2, -10, 34, side=side, h=2.4)
        # hangar mouths on the sponson flank (dark recess + glow lip)
        for y in (-60, 60, 180):
            s.box((side * (74 + 17), y, -26), (1.5, 40, 16), D)
            s.box((side * (74 + 17.6), y, -34.5), (0.8, 40, 1.2), G)
        # point-defence along the sponson top
        for y in range(-100, 320, 60): s.turret((cx, y, 2), 8, 2)
        # ventral pylons / antennae
        for y in (-40, 80, 200):
            s.loft([(y - 10, 4, 4, -90, -52, 1, side * 40), (y + 10, 4, 4, -90, -52, 1, side * 40)], D)
            s.box((side * 40, y, -92), (8, 24, 4), D, ch=1)
    # command citadel (aft) + spires
    s.loft([(150, 70, 54, 40, 64, 6), (160, 84, 64, 40, 70, 8), (222, 84, 64, 40, 70, 8), (230, 64, 50, 40, 62, 6)], P)
    s.loft([(166, 50, 36, 70, 90, 5), (172, 58, 42, 70, 94, 6), (214, 58, 42, 70, 94, 6), (220, 44, 32, 70, 88, 5)], H)
    s.loft([(165.4, 52, 38, 82, 86, 1), (167, 56, 40, 82, 86, 1)], W)   # bridge window band
    s.windows(176, 214, 29.6, 84, 8, side=1, h=2.4); s.windows(176, 214, 29.6, 84, 8, side=-1, h=2.4)
    s.windows(162, 220, 42.5, 56, 12, side=1, h=2.6); s.windows(162, 220, 42.5, 56, 12, side=-1, h=2.6)
    s.loft([(180, 26, 18, 94, 112, 3), (204, 26, 18, 94, 112, 3)], D)
    for x, y, hgt in ((-14, 190, 60), (14, 196, 70), (0, 206, 92), (-24, 214, 44), (22, 176, 50), (-6, 172, 38)):
        s.cyl((x, y, 112 + hgt / 2), 2.2, hgt, D, 'Z', 6, 0.6)
        s.box((x, y, 112 + hgt * 0.6), (6, 6, 3), H, ch=0.6)
    s.box((0, 206, 205), (2, 2, 2), G)
    # forward secondary tower
    s.loft([(-120, 36, 26, 28, 44, 4), (-84, 40, 28, 28, 46, 4)], H)
    s.windows(-118, -86, 20.5, 38, 6, side=1, h=2); s.windows(-118, -86, 20.5, 38, 6, side=-1, h=2)
    s.cyl((0, -100, 62), 1.6, 34, D, 'Z', 6, 0.5)
    # aft engine wall: 3 x 3 big nozzles + 4 small
    s.loft([(330, 120, 100, -40, 24, 12), (366, 124, 104, -42, 26, 12)], D)
    for x in (-38, 0, 38):
        for z in (-20, 6):
            s.nozzle((x, 372, z), 14, 14, seg=16); s.empty('engine', (x, 380, z), 14)
    for x in (-74, 74):
        s.nozzle((x, 352, -22), 11, 12, seg=14); s.empty('engine', (x, 359, -22), 11)
    # deck greebles, radiators, vents
    s.greebles(-300, 330, -40, 40, 40, 60, 7, mats=(0, 2))
    for i in range(10): s.box((0, 236 + i * 6, 42), (60, 2.5, 3), D, ch=0.5)
    # prow lights
    s.box((0, -359, -4), (8, 4, 4), G)
    for side in (1, -1): s.box((side * 70, 352, 34), (5, 5, 5), G)
    return s

if __name__ == '__main__':
    from kit import run
    run(build, 'dreadnought', PAL, 720.0, 60.0, 40.0)

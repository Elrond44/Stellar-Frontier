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
    low = [(-200, 14, 22, -30, -12, 3), (-130, 70, 84, -44, -8, 6), (190, 84, 96, -46, -6, 7), (210, 76, 88, -40, -8, 6)]
    s.loft(low, D)
    mid = [(-210, 16, 12, -12, 6, 3), (-140, 90, 84, -16, 12, 6), (195, 100, 92, -16, 14, 7), (210, 92, 86, -14, 12, 6)]
    f = fuselage(s, mid, H)
    s.skin(mid, -205, 205, 16, 2.4, 1.2, lambda i: (P if i % 3 == 0 else H), zclip=-12)
    # flight deck: wide flat slab overhanging the bow, amber deck lines
    deck = [(-214, 22, 18, 14, 19, 2), (-150, 108, 104, 14, 21, 4), (200, 110, 106, 14, 21, 4), (208, 100, 96, 14, 20, 3)]
    s.loft(deck, P)
    s.skin(deck, -205, 205, 12, 2.0, 0.6, lambda i: (H if i % 2 else P), zclip=19)
    for x in (-28, 0, 28): s.loft([(-170, 1.0, 1.0, 22.6, 22.9, 0, x), (34, 1.0, 1.0, 22.6, 22.9, 0, x)], W)
    for side in (1, -1):  # raised deck-edge rails with amber edge lights, converging on the pointed bow
        s.loft([(-206, 2.4, 2.0, 20, 24, 0.4, side * 12), (-150, 2.4, 2.0, 20, 24, 0.4, side * 53), (40, 2.4, 2.0, 20, 24, 0.4, side * 54)], H)
        s.loft([(-204, 0.8, 0.8, 24, 24.6, 0, side * 13), (-150, 0.8, 0.8, 24, 24.6, 0, side * 53), (40, 0.8, 0.8, 24, 24.6, 0, side * 54)], W)
    for k in range(5): s.box((0, -150 + k * 40, 22.75), (40, 1.0, 0.3), W)
    # v12 reshape: the aft 40% is a massive layered superstructure, wider and ~3x taller than the deck, built from
    # chunky sloped armour modules (as on the concept), with side armour pods, a bridge tier and a turret tower on top
    def hoods(mods, zb, gapy=4.0):
        for m in mods:
            ya, yb, wb, wt, zt, mat = m[:6]; cx = m[6] if len(m) > 6 else 0; ya += gapy / 2; yb -= gapy / 2; c = min(4, (zt - zb) * 0.3)
            s.loft([(ya, wb - 6, wt - 6, zb, zt - 4, c, cx), (ya + 4, wb, wt, zb, zt, c, cx), (yb - 4, wb, wt, zb, zt, c, cx), (yb, wb - 6, wt - 6, zb, zt - 4, c, cx)], mat)
            s.box((cx, (ya + yb) / 2, zt + 0.4), (wt * 0.5, max(2, (yb - ya) * 0.45), 1.2), D, ch=0.3)
    hoods([(36, 84, 112, 86, 40, P), (84, 136, 118, 92, 44, H), (136, 184, 118, 92, 44, P), (184, 214, 108, 84, 40, H)], 20)
    for side in (1, -1):  # side armour pods bulging past the deck edge
        hoods([(44, 100, 26, 18, 38, H, side * 62), (100, 160, 28, 20, 42, P, side * 64), (160, 208, 26, 18, 38, H, side * 62)], -6)
        s.strips(44, 206, lambda y: 76.5, 16, side, 1.3, seg=(0.008, 0.022), gap=(0.004, 0.01), mat=W, fill=0.85)
        s.strips(40, 210, lambda y: 58.5, 30, side, 1.2, seg=(0.008, 0.02), gap=(0.003, 0.01), mat=W, fill=0.85)
    hoods([(66, 120, 80, 58, 64, P), (120, 176, 84, 60, 66, H), (176, 204, 74, 52, 62, P)], 44)
    hoods([(92, 136, 54, 36, 82, H), (136, 176, 56, 38, 84, P)], 66)
    for side in (1, -1):
        s.strips(70, 200, lambda y: 38.5, 54, side, 1.2, seg=(0.006, 0.016), gap=(0.003, 0.008), mat=W, fill=0.9)
        s.strips(96, 172, lambda y: 25.5, 74, side, 1.2, seg=(0.005, 0.012), gap=(0.002, 0.006), mat=W, fill=0.9)
    s.box((0, 93.5, 76), (22, 2, 3), C)
    # turret tower on top
    s.loft([(124, 18, 12, 84, 96, 2), (150, 20, 14, 84, 98, 2)], H)
    for x, y, hgt in ((0, 146, 36), (-5, 152, 24), (6, 140, 28)): s.cyl((x, y, 98 + hgt / 2), 1.2, hgt, D, 'Z', 6, 0.4)
    # two glowing blue sensor domes on pylons, mid-deck ahead of the superstructure
    for x, y in ((-14, -10), (12, 14)):
        s.cyl((x, y, 30), 2.4, 18, D, 'Z', 8); s.cyl((x, y, 40), 6, 4, H, 'Z', 12); s.cyl((x, y, 44), 5.2, 4, G, 'Z', 12, 3.4)
    for y in (50, ): s.turret((0, y, 40), 12, 3)
    s.turret((0, 190, 64), 12, 3, rot=math.pi); s.turret((0, 136, 98), 10, 2)
    for x in (-30, 30): s.turret((x, 100, 64), 7, 2)
    for y in (-150, -60, 20):
        for side in (1, -1): s.turret((side * 46, y, 21), 6, 2)
    # bow hangar mouths under the deck lip (launch forward) + side hangars
    for x in (-8, 8): hangar(s, x, -204, 2, 12, 8, 1, axis='Y')
    for side in (1, -1):
        for y in (-100, -30): hangar(s, side * 50.3, y, 0, 40, 9, side)
        for y, rr in ((-150, 11), (110, 15)): port(s, side * 46, y, -24, rr, side, depth=5)
        s.strips(-190, 200, lambda y: f.z(y, 8) + 0.6, 8, side, 1.3, seg=(0.01, 0.03), gap=(0.004, 0.012), mat=W, fill=0.8)
        s.strips(-160, 190, lambda y: 46, -34, side, 1.0, seg=(0.01, 0.03), gap=(0.004, 0.012), mat=W, fill=0.7)
    # engines
    s.box((0, 208, -14), (80, 10, 40), D, ch=5)
    for x in (-27, 0, 27):
        for zz in (-26, -4):
            s.nozzle((x, 218, zz), 9, 10, seg=14); s.empty('engine', (x, 224, zz), 9)
    s.greebles(-140, 30, -40, 40, 22.8, 30, 5, mats=(0, 2))
    s.box((0, -212.5, 16), (30, 1, 1.2), W)
    return s

if __name__ == '__main__':
    from kit import run
    run(build, 'fleetcarrier', PAL, 420.0, 40.0, 25.0, view=(0.8, -0.5, 0.3), dist=0.55)

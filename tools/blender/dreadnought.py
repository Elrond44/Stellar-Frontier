# Dreadnought — 720 m Titan. Concept: very long layered hull; a row of big angular silver armour plates hanging
# over each flank (chamfered, tilted outward like scales) with red faction plates fore-mid and mid-ship (emblem
# block), a dark lit middle band with many thin amber window strips, a darker lower band, hanging ventral fins and
# pylons, stepped deck tiers rising toward an aft-mid citadel with spires, heavy twin turrets on every tier, a long
# low stacked prow and an engine wall.
import math, sys, os
import bpy  # noqa: F401
sys.path.insert(0, os.path.dirname(__file__))
from kit import Ship
from parts import fuselage, blade, H, P, D, A, C, W, G
from kit import finM

PAL = dict(hull=0x4c525c, plate=0xa4aab3, dark=0x24282e, accent=0xa3262c, glow=(0.6, 1.8, 3.8), win=(3.4, 1.9, 0.6))

def build():
    L = 720.0; s = Ship('hull_dreadnought', L, seed=77); r = s.rng
    B = 120.0; Hh = 64.0; y0, y1 = -360.0, 360.0
    # lower hull (dark) and the lit middle band (main hull)
    low = [(-350, 14, 18, -30, -14, 3), (-250, 70, 80, -40, -10, 6), (300, 96, 104, -44, -8, 8), (355, 88, 96, -38, -8, 7)]
    s.loft(low, D)
    mid = [(-360, 12, 8, -14, 0, 2), (-300, 46, 36, -18, 10, 5), (-160, 100, 86, -16, 20, 8), (330, 112, 96, -14, 22, 9), (360, 104, 90, -12, 20, 8)]
    f = fuselage(s, mid, D)
    s.skin(mid, -345, 352, 22, 2.6, 1.2, lambda i: H if i % 3 else P, zclip=-16)
    # flank armour scales: big angular plates hanging over each side
    red = {4, 5, 10, 11}
    n = 15; ys0 = -300.0; seg = (330 - ys0) / n
    for side in (1, -1):
        for i in range(n):
            ya = ys0 + i * seg + 2; yb = ya + seg - 4; ym = (ya + yb) / 2
            hx = f.z(ym, 16) + 3; top = 26 if ym > -160 else 26 - (-160 - ym) * 0.09
            h = 30 if ym > -160 else 30 - (-160 - ym) * 0.1; l = yb - ya; c = min(10, l * 0.25)
            m = A if i in red else (P if i % 3 != 1 else H)
            out = [(0, 0), (l, 0), (l, -h + c), (l - c * 1.5, -h), (c * 0.6, -h), (0, -h + c * 0.5)]
            s.slab(out, 2.8, m, finM(side, (hx, ya, top), -32), inset=0.04)
            # lower scale row (smaller, dark/hull) over the window band
            if i % 2 == 0 and ym > -220:
                out2 = [(0, 0), (l * 1.6, 0), (l * 1.6 - 6, -14), (6, -14)]
                s.slab(out2, 2.0, H, finM(side, (f.z(ym, -10) + 3, ya, -8), -24), inset=0.05)
        # many thin amber window strips in the dark middle band + lower band
        for zz, fill in ((-2, 0.9), (6, 0.75), (-12, 0.6)):
            s.strips(-330, 340, lambda y, zz=zz: f.z(y, zz) + 0.6, zz, side, 1.6, seg=(0.008, 0.03), gap=(0.003, 0.012), mat=W, fill=fill)
        s.strips(-250, 340, lambda y: 40 if y < -200 else 49, -26, side, 1.5, seg=(0.01, 0.03), gap=(0.004, 0.015), mat=W, fill=0.7)
        s.strips(-200, 300, lambda y: f.z(y, 2) + 0.6, 2, side, 1.0, seg=(0.02, 0.05), gap=(0.03, 0.08), mat=G, fill=0.5)
    # deck tiers stepping up toward the citadel
    deck = [(-330, 24, 18, 18, 26, 4), (-200, 76, 64, 18, 30, 6), (330, 84, 70, 18, 32, 6), (352, 76, 64, 18, 30, 6)]
    s.loft(deck, H); s.skin(deck, -320, 345, 16, 2.4, 1.0, lambda i: A if i in (5, 6) else (P if i % 3 else H), zclip=24)
    t2 = [(-140, 20, 14, 30, 38, 3), (-90, 58, 46, 30, 44, 5), (300, 62, 50, 30, 46, 5), (322, 54, 44, 30, 42, 5)]
    s.loft(t2, H); s.skin(t2, -130, 315, 12, 2.2, 0.9, lambda i: A if i == 5 else (P if i % 2 == 0 else H), zclip=38)
    t3 = [(20, 16, 12, 44, 52, 3), (50, 44, 34, 44, 58, 4), (250, 46, 36, 44, 60, 4), (270, 40, 30, 44, 56, 4)]
    s.loft(t3, P); s.skin(t3, 26, 266, 6, 2.0, 0.8, lambda i: H if i % 2 else P, zclip=52)
    for side in (1, -1):
        s.strips(-80, 300, lambda y: 28 if y > -60 else 24, 38, side, 1.2, seg=(0.01, 0.025), gap=(0.004, 0.012), mat=W, fill=0.8)
        s.strips(40, 260, 21.5, 52, side, 1.2, seg=(0.008, 0.02), gap=(0.004, 0.01), mat=W, fill=0.85)
    # citadel + spires (aft-mid)
    z = 60
    for k, (w, l, h) in enumerate(((36, 70, 12), (26, 48, 10), (16, 26, 8))):
        yc = 170 + k * 6
        s.loft([(yc - l / 2, w * 0.7, w * 0.55, z, z + h, 2), (yc - l / 2 + l * 0.15, w, w * 0.8, z, z + h, 3), (yc + l / 2, w, w * 0.8, z, z + h, 3)], H if k != 1 else P)
        s.strips(yc - l / 2 + l * 0.2, yc + l / 2 - 2, w * 0.46, z + h * 0.5, 1, 1.4, seg=(0.006, 0.015), gap=(0.002, 0.006), mat=W, fill=0.9)
        s.strips(yc - l / 2 + l * 0.2, yc + l / 2 - 2, w * 0.46, z + h * 0.5, -1, 1.4, seg=(0.006, 0.015), gap=(0.002, 0.006), mat=W, fill=0.9)
        z += h
    s.box((0, 166, z - 4), (12, 2, 2.4), C)
    for x, y, hgt in ((-6, 184, 70), (6, 190, 84), (0, 198, 110), (-12, 200, 52), (12, 176, 58), (-4, 160, 40)):
        s.cyl((x, y, z + hgt / 2), 1.8, hgt, D, 'Z', 6, 0.5)
        s.box((x, y, z + hgt * 0.55), (5, 5, 2.4), H, ch=0.5)
    # forward spire cluster + secondary tower on tier 2
    s.loft([(-60, 26, 18, 44, 56, 3), (-30, 28, 20, 44, 58, 3)], P)
    s.strips(-56, -32, 13.5, 51, 1, 1.2, seg=(0.006, 0.015), gap=(0.002, 0.006), mat=W, fill=0.9); s.strips(-56, -32, 13.5, 51, -1, 1.2, seg=(0.006, 0.015), gap=(0.002, 0.006), mat=W, fill=0.9)
    for x, y, hgt in ((-4, -46, 40), (5, -40, 56)): s.cyl((x, y, 58 + hgt / 2), 1.4, hgt, D, 'Z', 6, 0.4)
    # heavy twin turrets on every tier, PD on the deck edges
    for y, zt, sz in ((-260, 30, 18), (-215, 31, 18), (-110, 44, 19), (-80, 44, 19), (60, 60, 18), (100, 60, 18), (240, 60, 17), (290, 46, 17)):
        s.turret((0, y, zt), sz, 2, rot=math.pi if y > 200 else 0)
    for y in range(-180, 320, 70):
        for side in (1, -1): s.turret((side * 34, y, 31), 8, 2, rot=0 if y < 150 else math.pi)
    # hanging ventral fins / pylons
    for i, y in enumerate((-150, -40, 60, 150, 230)):
        for side in (1, -1):
            dep = 44 if i % 2 else 30; xx = 22 + (i % 3) * 10
            s.slab([(0, 0), (22, 0), (16, -dep), (13, -dep - 12), (9, -dep)], 2.4, H, finM(side, (xx, y, -40), 4), inset=0.05)
            s.box((side * xx, y + 13, -40 - dep * 0.85), (1.2, 1.2, 4), W)
        s.box((0, y + 10, -48), (30, 26, 10), D, ch=3)
    # engine wall
    s.box((0, 354, -12), (96, 12, 52), D, ch=6)
    for x in (-36, 0, 36):
        for z in (-28, 2):
            s.nozzle((x, 366, z), 13, 14, seg=16); s.empty('engine', (x, 374, z), 13)
    for x in (-58, 58):
        s.nozzle((x, 362, -14), 10, 12, seg=14); s.empty('engine', (x, 369, -14), 10)
    s.greebles(-280, 330, -30, 30, 32, 50, 7, mats=(0, 1, 2))
    s.box((0, -359.6, -6), (8, 0.6, 2), W)
    return s

if __name__ == '__main__':
    from kit import run
    run(build, 'dreadnought', PAL, 720.0, 60.0, 40.0, view=(0.85, -0.48, 0.24), dist=0.5)

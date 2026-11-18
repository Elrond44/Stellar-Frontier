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
    low = [(-352, 8, 10, -28, -14, 2), (-200, 70, 80, -40, -10, 6), (300, 96, 104, -44, -8, 8), (355, 88, 96, -38, -8, 7)]
    s.loft(low, D)
    mid = [(-360, 6, 4, -12, 0, 1.5), (-270, 46, 36, -18, 10, 5), (-110, 100, 86, -16, 20, 8), (330, 112, 96, -14, 22, 9), (360, 104, 90, -12, 20, 8)]
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
    # v3 reshape (concept silhouette): the hull is a stack of layers that each start further aft and higher, every
    # layer built from separate chunky "hood" modules with steep sloped sides (silver, two red, emblem block), rising to
    # a tall stepped citadel aft-mid; a deep ventral keel of hanging modules below. Profile height ~0.3 L like the art.
    deck = [(-340, 10, 6, 17, 21, 2), (-240, 56, 46, 18, 30, 6), (-160, 80, 70, 18, 33, 6), (330, 88, 74, 18, 34, 6), (352, 78, 66, 18, 31, 6)]
    s.loft(deck, H); s.skin(deck, -326, 345, 18, 2.4, 1.0, lambda i: A if i in (4, 5) else (P if i % 3 else H), zclip=26)
    def hoods(mods, zb, gapy=5.0):
        # mods: (ya, yb, wb, wt, zt, mat[, wedge]) -> one module each, chamfered ends; wedge=True slopes the front down
        for m in mods:
            ya, yb, wb, wt, zt, mat = m[:6]; wedge = len(m) > 6 and m[6]; ya += gapy / 2; yb -= gapy / 2; c = min(5, (zt - zb) * 0.3)
            if wedge:
                l = yb - ya; s.loft([(ya, wb * 0.55, wt * 0.4, zb, zb + (zt - zb) * 0.3, c * 0.5), (ya + l * 0.45, wb, wt, zb, zt, c), (yb - 3, wb, wt, zb, zt, c), (yb, wb - 5, wt - 5, zb, zt - 3, c)], mat)
            else:
                s.loft([(ya, wb - 6, wt - 6, zb, zt - 4, c), (ya + 4, wb, wt, zb, zt, c), (yb - 4, wb, wt, zb, zt, c), (yb, wb - 6, wt - 6, zb, zt - 4, c)], mat)
            # roof seam + a recessed vent on every module so the top reads as plating, not one slab
            s.box((0, (ya + yb) / 2, zt + 0.5), (wt * 0.55, max(2, (yb - ya) * 0.5), 1.4), D, ch=0.4)
    # tier 2: long run of big sloped hoods from the prow shoulder to the stern
    hoods([(-262, -196, 64, 34, 54, P, True), (-196, -150, 70, 38, 58, A), (-150, -104, 72, 40, 59, A), (-104, -52, 74, 40, 60, P), (-52, 0, 76, 42, 61, H),
           (0, 56, 78, 44, 62, P), (56, 120, 80, 46, 62, A), (120, 180, 80, 46, 62, P), (180, 240, 80, 46, 62, H), (240, 296, 78, 44, 60, P), (296, 336, 70, 40, 56, H)], 33)
    # winged faction emblem on both flanks of the red emblem block (tier 2, mid-ship), as on the concept
    for side in (1, -1):
        s.slab([(0, 0), (7, -2), (12, -13), (17, -2), (24, 0), (17, -8), (12, -19), (7, -8)], 1.0, P, finM(side, (25.5, 76, 60), -30), inset=0.1)
    # tier 3: narrower, higher hoods mid-ship
    hoods([(-130, -70, 46, 22, 80, P, True), (-70, -14, 50, 26, 84, H), (-14, 44, 52, 28, 86, P), (44, 110, 54, 30, 88, P), (110, 170, 54, 30, 88, H), (170, 236, 54, 30, 88, P), (236, 300, 50, 26, 84, P)], 61)
    # tier 4: crown blocks under the citadel
    hoods([(10, 70, 32, 18, 100, H, True), (70, 140, 36, 22, 104, P), (140, 250, 38, 24, 106, H), (250, 290, 30, 16, 100, P)], 87)
    for side in (1, -1):  # lit window rows along each tier's base and flank
        s.strips(-250, 330, lambda y: 38 if y < -190 else 40, 40, side, 1.3, seg=(0.008, 0.025), gap=(0.004, 0.012), mat=W, fill=0.85)
        s.strips(-120, 296, lambda y: 25.5, 68, side, 1.2, seg=(0.008, 0.02), gap=(0.004, 0.01), mat=W, fill=0.85)
        s.strips(20, 286, lambda y: 17.5, 92, side, 1.1, seg=(0.006, 0.016), gap=(0.003, 0.008), mat=W, fill=0.9)
    # citadel (stepped bridge tower) + spires, aft-mid on the crown
    z = 106
    for k, (w, l, h) in enumerate(((30, 72, 14), (22, 50, 12), (14, 28, 10))):
        yc = 190 + k * 6
        s.loft([(yc - l / 2, w * 0.6, w * 0.45, z, z + h, 2), (yc - l / 2 + l * 0.2, w, w * 0.78, z, z + h, 3), (yc + l / 2, w, w * 0.78, z, z + h, 3)], H if k != 1 else P)
        s.strips(yc - l / 2 + l * 0.22, yc + l / 2 - 2, w * 0.44, z + h * 0.5, 1, 1.4, seg=(0.006, 0.015), gap=(0.002, 0.006), mat=W, fill=0.9)
        s.strips(yc - l / 2 + l * 0.22, yc + l / 2 - 2, w * 0.44, z + h * 0.5, -1, 1.4, seg=(0.006, 0.015), gap=(0.002, 0.006), mat=W, fill=0.9)
        z += h
    s.box((0, 172, z - 4), (11, 2, 2.4), C)
    for x, y, hgt in ((-5, 200, 56), (5, 206, 70), (0, 214, 92), (-10, 216, 40), (10, 194, 46), (-3, 180, 32)):
        s.cyl((x, y, z + hgt / 2), 1.7, hgt, D, 'Z', 6, 0.5)
        s.box((x, y, z + hgt * 0.55), (4.6, 4.6, 2.2), H, ch=0.5)
    # forward command tower on tier 3 + its spires
    s.loft([(-66, 22, 14, 84, 98, 3), (-48, 26, 18, 84, 100, 3), (-30, 24, 16, 84, 98, 3)], P)
    s.strips(-62, -34, 11.5, 92, 1, 1.2, seg=(0.006, 0.015), gap=(0.002, 0.006), mat=W, fill=0.9); s.strips(-62, -34, 11.5, 92, -1, 1.2, seg=(0.006, 0.015), gap=(0.002, 0.006), mat=W, fill=0.9)
    for x, y, hgt in ((-4, -50, 34), (5, -44, 48)): s.cyl((x, y, 100 + hgt / 2), 1.3, hgt, D, 'Z', 6, 0.4)
    # heavy twin turrets stepping up the tiers (fore pair on the prow deck), PD on the deck ledges
    for y, zt, sz in ((-300, 26, 16), (-262, 30, 17), (-176, 58, 18), (-128, 59, 18), (-100, 80, 18), (20, 86, 18), (90, 104, 17), (272, 88, 17)):
        s.turret((0, y, zt), sz, 2, rot=math.pi if y > 200 else 0)
    for y in range(-180, 320, 70):
        for side in (1, -1): s.turret((side * 38, y, 33), 8, 2, rot=0 if y < 150 else math.pi)
    # deep ventral keel: hanging modules (narrow at the bottom), dropped towers and fins
    for k, (ya, yb) in enumerate(((-230, -150), (-146, -60), (-56, 40), (44, 140), (144, 236), (240, 320))):
        dep = 30 if k in (2, 3) else 22
        s.loft([(ya, 30, 46, -40 - dep + 6, -40, 4), (ya + 8, 38, 60, -40 - dep, -40, 5), (yb - 8, 38, 60, -40 - dep, -40, 5), (yb, 30, 46, -40 - dep + 6, -40, 4)], D if k % 2 else H)
        s.strips(ya + 10, yb - 10, lambda y: 21, -40 - dep * 0.45, 1, 1.2, seg=(0.008, 0.02), gap=(0.004, 0.012), mat=W, fill=0.8)
        s.strips(ya + 10, yb - 10, lambda y: 21, -40 - dep * 0.45, -1, 1.2, seg=(0.008, 0.02), gap=(0.004, 0.012), mat=W, fill=0.8)
    for y, h in ((-104, 26), (90, 34), (190, 28)):
        s.box((0, y, -70 - h / 2), (12, 22, h), D, ch=2, taper=0.6); s.box((0, y + 8, -70 - h * 0.8), (1.2, 1.2, 3), W)
    for i, y in enumerate((-190, -10, 190, 280)):
        for side in (1, -1):
            dep = 34 if i % 2 else 24; xx = 30 + (i % 2) * 6
            s.slab([(0, 0), (20, 0), (15, -dep), (12, -dep - 10), (8, -dep)], 2.2, H, finM(side, (xx, y, -46), 6), inset=0.05)
            s.box((side * xx, y + 12, -46 - dep * 0.85), (1.2, 1.2, 4), W)
    # engine wall
    s.box((0, 354, -12), (96, 12, 52), D, ch=6)
    for x in (-36, 0, 36):
        for z in (-28, 2):
            s.nozzle((x, 366, z), 13, 14, seg=16); s.empty('engine', (x, 374, z), 13)
    for x in (-58, 58):
        s.nozzle((x, 362, -14), 10, 12, seg=14); s.empty('engine', (x, 369, -14), 10)
    s.greebles(-320, -270, -16, 16, 22, 10, 6, mats=(0, 1, 2)); s.greebles(-250, 330, -36, -30, 33, 14, 5, mats=(0, 2)); s.greebles(-250, 330, 30, 36, 33, 14, 5, mats=(0, 2))
    s.box((0, -359.6, -6), (8, 0.6, 2), W)
    return s

if __name__ == '__main__':
    from kit import run
    run(build, 'dreadnought', PAL, 720.0, 60.0, 40.0, view=(0.85, -0.48, 0.24), dist=0.5)

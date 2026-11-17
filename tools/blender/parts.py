"""shared fighter / warship parts in the concept sheet's design language."""
import math
from kit import wingM, finM, mirror, T, R
H, P, D, A, C, W, G = range(7)

def fuselage(s, secs, mat=H):
    s.loft(secs, mat)
    def hw(y):
        for a, b in zip(secs, secs[1:]):
            if a[0] <= y <= b[0]:
                t = (y - a[0]) / (b[0] - a[0]); return [a[k] + (b[k] - a[k]) * t for k in range(1, 6)]
        return list((secs[0] if y < secs[0][0] else secs[-1])[1:6])
    return hw

def blade(s, side, root, pts, t, mat, cant=0.0, inset=0.25):
    """swept fin, outline in (y, z) relative to root."""
    s.slab(pts, t, mat, finM(side, root, cant), inset)

def wing(s, side, root, pts, t, mat, dihedral=0.0, inset=0.2):
    """wing panel, outline in (outboard x, y) relative to root."""
    s.slab(pts, t, mat, wingM(side, root, dihedral), inset)

def nacelle(s, x, y0, y1, z, r, mat=H, nose=P, glow=True, seg=10, cowl=None):
    L = y1 - y0
    s.cyl((x, (y0 + y1) / 2 + L * 0.06, z), r, L * 0.88, mat, 'Y', seg)
    s.cyl((x, y0 + L * 0.06, z), r * 0.35, L * 0.12, nose, 'Y', seg, r)
    if cowl is not None: s.cyl((x, y0 + L * 0.3, z), r * 1.06, L * 0.18, cowl, 'Y', seg)
    s.nozzle((x, y1 + r * 0.4, z), r * 0.82, r * 0.9, glow, seg); s.empty('engine', (x, y1 + r * 0.9, z), r * 0.82)

def stripe(s, side, ys, hwf, z0, z1, mat=A, t=0.08):
    """paint stripe hugging the fuselage flank (hwf(y) -> half width)."""
    s.loft([(y, t, t, z0, z1, 0, side * (hwf(y) + t * 0.3)) for y in ys], mat)

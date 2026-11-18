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
    def hwz(y, z=None):
        wb, wt, zb, zt, c = hw(y)
        if z is None: return wb / 2
        if z <= zb + c: return max(0.0, wb / 2 - c + (z - zb)) if z >= zb else 0.0
        if z >= zt - c: return max(0.0, wt / 2 - (z - (zt - c))) if z <= zt else 0.0
        t = (z - (zb + c)) / max(1e-6, (zt - c) - (zb + c)); return wb / 2 + (wt - wb) / 2 * t
    hw.z = hwz
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

def warship(s, B, Hh, o):
    """layered capital-ship hull in the concept sheet's language (Frigate / Destroyer / Dreadnought share it).
    B beam, Hh hull height (m). o: options dict -
      prow: fraction of L the chisel prow takes; tiers: number of stacked decks (2-3); plates: plates per tier;
      accent: set of plate indices painted A; stripe: True for an A pinstripe along the deck edges;
      tower: (y frac, w, l, h, steps); turrets: list of (y frac, x frac, size, barrels, facing aft?);
      shoulders: aft engine shoulders (width frac); engines: [(x frac, z frac, r)]."""
    L = s.L; y0, y1 = -L / 2, L / 2; pf = o.get('prow', 0.32)
    yp = y0 + L * pf
    # lower hull (dark), main hull, upper tier(s): each tier starts further back -> stacked chisel prow
    lower = [(y0 + L * 0.005, B * 0.3, B * 0.34, -Hh * 0.5, -Hh * 0.26, B * 0.03), (y0 + L * 0.05, B * 0.5, B * 0.56, -Hh * 0.56, -Hh * 0.18, B * 0.04), (yp, B * 0.86, B * 0.98, -Hh * 0.62, -Hh * 0.1, B * 0.06),
             (y1 - L * 0.06, B * 0.9, B * 1.0, -Hh * 0.62, -Hh * 0.1, B * 0.06), (y1 - L * 0.01, B * 0.82, B * 0.92, -Hh * 0.55, -Hh * 0.12, B * 0.05)]
    s.loft(lower, D)
    main = [(y0, B * 0.3, B * 0.2, -Hh * 0.18, -Hh * 0.04, B * 0.02), (y0 + L * 0.04, B * 0.56, B * 0.42, -Hh * 0.22, Hh * 0.08, B * 0.05), (yp, B * 1.0, B * 0.82, -Hh * 0.2, Hh * 0.2, B * 0.06),
            (y1 - L * 0.05, B * 1.02, B * 0.84, -Hh * 0.2, Hh * 0.22, B * 0.06), (y1, B * 0.92, B * 0.76, -Hh * 0.18, Hh * 0.18, B * 0.05)]
    f = fuselage(s, main, H)
    acc = o.get('accent', set()); n = o.get('plates', 8); r = s.rng
    s.skin(main, y0 + L * 0.03, y1 - L * 0.02, n, L * 0.006, B * 0.012, lambda i: A if i in acc else (P if i % 3 == 1 else H), zclip=-Hh * 0.02)
    s.box((0, y0 + L * 0.006, -Hh * 0.22), (B * 0.24, L * 0.004, Hh * 0.035), W)  # lit slot between the upper prow and the lower jaw
    tiers = o.get('tiers', 2)
    top = Hh * 0.2; seats = []  # (y where the tier starts, ramp end y, z at start, full z) for seat_turrets
    for t in range(1, tiers):
        ys = y0 + L * (0.1 + 0.12 * t); w = B * (0.78 - 0.16 * t); hh = Hh * 0.22
        sec = [(ys, w * 0.3, w * 0.18, top - 0.02 * Hh, top + hh * 0.3, w * 0.05), (ys + L * 0.12, w, w * 0.8, top - 0.02 * Hh, top + hh, w * 0.07),
               (y1 - L * 0.08, w, w * 0.8, top - 0.02 * Hh, top + hh, w * 0.07), (y1 - L * 0.04, w * 0.9, w * 0.7, top - 0.02 * Hh, top + hh * 0.85, w * 0.06)]
        s.loft(sec, H)
        s.skin(sec, ys + L * 0.02, y1 - L * 0.05, max(3, n - 2 * t), L * 0.006, B * 0.01,
               lambda i, t=t: A if (i + t) in acc else (P if (i + t) % 2 else H), zclip=top + hh * 0.3)
        if o.get('stripe'):
            for side in (1, -1):
                s.loft([(ys + L * 0.1, B * 0.012, B * 0.012, top + hh * 0.55, top + hh * 0.75, 0, side * (w * 0.5 + B * 0.012)),
                        (y1 - L * 0.08, B * 0.012, B * 0.012, top + hh * 0.55, top + hh * 0.75, 0, side * (w * 0.5 + B * 0.012))], A)
        seats.append((ys, ys + L * 0.12, top + hh * 0.3, top + hh)); top += hh
    # deck-edge accent pinstripe on the main hull
    if o.get('stripe'):
        for side in (1, -1):
            s.loft([(y0 + L * 0.06, B * 0.012, B * 0.012, Hh * 0.05, Hh * 0.12, 0, side * (B * 0.2)), (yp, B * 0.012, B * 0.012, Hh * 0.17, Hh * 0.24, 0, side * (B * 0.5 + B * 0.012)),
                    (y1 - L * 0.06, B * 0.012, B * 0.012, Hh * 0.17, Hh * 0.24, 0, side * (B * 0.51 + B * 0.012))], A)
    # lit window strips on the flanks (thin amber lines) + a few blue
    for side in (1, -1):
        for zz, fill in ((-Hh * 0.05, 0.85), (-Hh * 0.33, 0.7)):
            s.strips(y0 + L * 0.06, y1 - L * 0.08, (lambda y, zz=zz: f.z(y, zz) + L * 0.0008) if zz > -Hh * 0.2 else (lambda y, zz=zz: (B * 0.5 if y > yp else B * 0.5 * max(0.2, (y - y0) / (yp - y0))) * 0.98 + L * 0.0008),
                     zz, side, Hh * 0.035, seg=(0.015, 0.06), gap=(0.006, 0.02), mat=W, fill=fill)
        s.strips(y0 + L * 0.3, y1 - L * 0.2, lambda y: f.z(y, Hh * 0.08) + L * 0.0008, Hh * 0.08, side, Hh * 0.02, seg=(0.02, 0.05), gap=(0.03, 0.08), mat=G, fill=0.6)
    # aft engine shoulders
    sw = o.get('shoulders', 0.0)
    if sw:
        for side in (1, -1):
            cx = side * B * (0.5 + sw * 0.3)
            sec = [(y1 - L * 0.32, B * sw * 0.5, B * sw * 0.4, -Hh * 0.45, Hh * 0.1, B * 0.03, cx), (y1 - L * 0.28, B * sw, B * sw * 0.8, -Hh * 0.55, Hh * 0.25, B * 0.05, cx),
                   (y1 - L * 0.02, B * sw, B * sw * 0.8, -Hh * 0.55, Hh * 0.25, B * 0.05, cx)]
            s.loft(sec, H)
            s.skin([q[:6] for q in sec], y1 - L * 0.3, y1 - L * 0.04, 3, L * 0.005, B * 0.008, lambda i: A if 'shoulder' in acc else (P if i == 1 else D))
            s.strips(y1 - L * 0.26, y1 - L * 0.05, abs(cx) + B * sw * 0.5 + L * 0.001, -Hh * 0.15, side, Hh * 0.04, seg=(0.02, 0.05), gap=(0.008, 0.02), mat=W, fill=0.8)
    # engines on the stern
    s.box((0, y1 - L * 0.015, -Hh * 0.15), (B * 0.85, L * 0.03, Hh * 0.7), D, ch=B * 0.04)
    for ex, ez, er in o.get('engines', []):
        s.nozzle((ex * B, y1 + er * 0.5, ez * Hh), er, er * 1.2, seg=14); s.empty('engine', (ex * B, y1 + er * 1.2, ez * Hh), er)
    # stepped command tower
    if o.get('tower'):
        ty, tw, tl, th, steps = o['tower']; yc = y0 + L * ty; z = top
        for k in range(steps):
            w = tw * (1 - 0.2 * k); l = tl * (1 - 0.22 * k); hh = th / steps
            s.loft([(yc - l / 2, w * 0.7, w * 0.55, z, z + hh, w * 0.08), (yc - l / 2 + l * 0.15, w, w * 0.8, z, z + hh, w * 0.1), (yc + l / 2, w, w * 0.8, z, z + hh, w * 0.1)],
                   A if (k == steps - 1 and o.get('tower_accent')) else (P if k % 2 else H))
            s.strips(yc - l / 2 + l * 0.2, yc + l / 2 - l * 0.05, w * 0.5 * 0.92 + L * 0.0008, z + hh * 0.5, 1, hh * 0.18, seg=(0.008, 0.02), gap=(0.003, 0.008), mat=W, fill=0.9)
            s.strips(yc - l / 2 + l * 0.2, yc + l / 2 - l * 0.05, w * 0.5 * 0.92 + L * 0.0008, z + hh * 0.5, -1, hh * 0.18, seg=(0.008, 0.02), gap=(0.003, 0.008), mat=W, fill=0.9)
            z += hh
        # bridge glass band across the front of the top step
        w = tw * (1 - 0.2 * (steps - 1)); l = tl * (1 - 0.22 * (steps - 1))
        s.box((0, yc - l / 2 + l * 0.06, z - th / steps * 0.45), (w * 0.62, l * 0.1, th / steps * 0.3), C)
        for k in range(o.get('spires', 2)):
            sx = (k - (o.get('spires', 2) - 1) / 2) * w * 0.3; sh = th * r.uniform(0.6, 1.3)
            s.cyl((sx, yc + l * r.uniform(-0.1, 0.3), z + sh / 2), B * 0.01, sh, D, 'Z', 6, B * 0.004)
        s.box((0, yc, z + th * 0.05), (w * 0.4, l * 0.35, th * 0.1), D, ch=w * 0.02)
    for (ty, tx, ts, tb, aft) in o.get('turrets', []):
        ty_ = y0 + L * ty; zt = top if abs(tx) < 0.25 else Hh * 0.2
        if o.get('seat_turrets') and abs(tx) < 0.25:  # v12: sit on the tier actually under the turret (no floating guns over the prow)
            zt = Hh * 0.2
            for a, b, za, zb in seats:
                if ty_ >= b: zt = max(zt, zb)
                elif ty_ > a: zt = max(zt, za + (zb - za) * (ty_ - a) / (b - a))
        s.turret((tx * B, ty_, zt), ts, tb, rot=math.pi if aft else 0.0)
    s.greebles(y0 + L * 0.35, y1 - L * 0.1, -B * 0.25, B * 0.25, top, o.get('greebles', 20), B * 0.05, mats=(0, 1, 2))
    return f, top

def arc(s, c, R, a0, a1, n, w, h, mat, plane='YZ', tilt=0.0):
    """a curved band (partial torus with a rectangular section w x h) around centre c; plane 'YZ' sweeps in the ship's
    vertical plane (an arch over the hull seen from the side), 'XZ' arches across the hull (a hoop)."""
    import math as m
    from mathutils import Vector, Matrix
    bm = s.bm; rings = []
    for i in range(n + 1):
        a = a0 + (a1 - a0) * i / n
        if plane == 'XZ': d = Vector((m.cos(a), 0, m.sin(a))); t = Vector((0, 1, 0))
        elif plane == 'XY': d = Vector((m.cos(a), m.sin(a), 0)); t = Vector((0, 0, 1))
        else: d = Vector((0, m.cos(a), m.sin(a))); t = Vector((1, 0, 0))
        if tilt:
            Rm = Matrix.Rotation(tilt, 3, 'X' if plane == 'XY' else 'Y' if plane == 'YZ' else 'X'); d = Rm @ d; t = Rm @ t
        p = Vector(c) + d * R
        pts = [p + d * (-h / 2) + t * (-w / 2), p + d * (h / 2) + t * (-w / 2), p + d * (h / 2) + t * (w / 2), p + d * (-h / 2) + t * (w / 2)]
        rings.append([tuple(q) for q in pts])
    s._faces(rings, mat, True, True)

def port(s, x, y, z, r, side, depth=None, mat=D, glow=G, seg=12):
    """round side port / turbine disk facing +-X with a glowing core (the battlecruiser's blue flank rings)."""
    d = depth or r * 0.5
    s.cyl((x + side * d / 2, y, z), r, d, mat, 'X', seg)
    s.cyl((x + side * (d + r * 0.02), y, z), r * 0.82, r * 0.04, glow, 'X', seg)
    s.cyl((x + side * (d + r * 0.05), y, z), r * 0.62, r * 0.08, mat, 'X', seg)
    s.cyl((x + side * (d + r * 0.08), y, z), r * 0.18, r * 0.1, glow, 'X', 8)
    s.cyl((x + side * d * 0.4, y, z), r * 1.12, d * 0.8, 0, 'X', seg)

def hangar(s, x, y, z, w, h, side, axis='X'):
    """lit hangar mouth: dark recess + glow lip, plus a 'bay' empty where fighters launch."""
    if axis == 'X':
        s.box((x, y, z), (0.4, w, h), D); s.quad((x + side * 0.22, y, z), w * 0.9, h * 0.75, side, D)
        s.quad((x + side * 0.24, y, z - h * 0.42), w * 0.92, h * 0.07, side, G)
        s.empty('bay', (x + side * 2.0, y, z), w)
    else:  # facing the nose (-Y)
        s.box((x, y, z), (w, 0.4, h), D); s.quad((x, y - 0.22, z), w * 0.9, h * 0.75, 1, D, axis='Y')
        s.quad((x, y - 0.24, z - h * 0.42), w * 0.92, h * 0.07, 1, G, axis='Y')
        s.empty('bay', (x, y - 2.0, z), w)

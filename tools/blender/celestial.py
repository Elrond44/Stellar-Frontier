"""v16 celestial texture bakes (environment batch 3).
Bakes equirect maps for the dark planet, the banded gas giant, the cratered moon and the star surface, a tileable
nebula cloud map, the black-hole accretion disc (polar) and the gas-giant ring strip, all from Blender shader nodes
(Cycles EMIT bake on a UV plane; the node tree turns UV into a direction on the unit sphere, so the maps are seamless).
Game mapping: u = atan(z, x) / 2pi + 0.5, v = asin(y) / pi + 0.5 (y up), PNG top row = v 1.
Outputs blender/out/sky/<name>.png (full) and the post step writes -half, normal maps, KTX2 + WebP into out/sky/web/.
Run: blender/.venv/bin/python src/celestial.py [--only dark,gas,...] [--size 2048] [--render]
"""
import bpy, os, sys, math, subprocess
import numpy as np
B = os.path.dirname(os.path.dirname(os.path.abspath(__file__))); OUT = os.path.join(B, 'out', 'sky'); WEB = os.path.join(OUT, 'web'); SHOTS = os.path.join(B, 'shots', 'sky')
for d in (OUT, WEB, SHOTS): os.makedirs(d, exist_ok=True)
TOKTX = '/tmp/ktx/KTX-Software-4.4.2-Linux-x86_64/bin/toktx'

def reset():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    sc = bpy.context.scene; sc.render.engine = 'CYCLES'; sc.cycles.device = 'CPU'; sc.cycles.samples = 2
    bpy.ops.mesh.primitive_plane_add(size=2); return bpy.context.active_object

class G:
    """tiny node-graph helper"""
    def __init__(self, mat):
        self.nt = mat.node_tree; self.n = self.nt.nodes; self.l = self.nt.links
        for x in list(self.n): self.n.remove(x)
        self.out = self.n.new('ShaderNodeOutputMaterial'); self.em = self.n.new('ShaderNodeEmission'); self.l.new(self.em.outputs[0], self.out.inputs['Surface'])
        tc = self.n.new('ShaderNodeTexCoord'); sp = self.n.new('ShaderNodeSeparateXYZ'); self.l.new(tc.outputs['UV'], sp.inputs[0])
        self.u, self.v = sp.outputs[0], sp.outputs[1]
    def link(self, a, b): self.l.new(a, b)
    def math(self, op, a, b=None, c=None):
        m = self.n.new('ShaderNodeMath'); m.operation = op
        for i, x in enumerate((a, b, c)):
            if x is None: continue
            if isinstance(x, (int, float)): m.inputs[i].default_value = x
            else: self.link(x, m.inputs[i])
        return m.outputs[0]
    def add(self, a, b): return self.math('ADD', a, b)
    def mul(self, a, b): return self.math('MULTIPLY', a, b)
    def sub(self, a, b): return self.math('SUBTRACT', a, b)
    def smooth(self, e0, e1, x):
        m = self.n.new('ShaderNodeMapRange'); m.interpolation_type = 'SMOOTHSTEP'; m.inputs['From Min'].default_value = e0; m.inputs['From Max'].default_value = e1; self.link(x, m.inputs['Value']); return m.outputs[0]
    def vec(self, x, y, z):
        c = self.n.new('ShaderNodeCombineXYZ')
        for i, s in enumerate((x, y, z)):
            if isinstance(s, (int, float)): c.inputs[i].default_value = s
            else: self.link(s, c.inputs[i])
        return c.outputs[0]
    def vscale(self, v, k):
        m = self.n.new('ShaderNodeVectorMath'); m.operation = 'SCALE'; self.link(v, m.inputs[0]); m.inputs['Scale'].default_value = k; return m.outputs[0]
    def vadd(self, a, b):
        m = self.n.new('ShaderNodeVectorMath'); m.operation = 'ADD'; self.link(a, m.inputs[0])
        if isinstance(b, tuple): m.inputs[1].default_value = b
        else: self.link(b, m.inputs[1])
        return m.outputs[0]
    def sphere_dir(self):
        th = self.mul(self.sub(self.u, 0.5), 2 * math.pi); ph = self.mul(self.sub(self.v, 0.5), math.pi)
        cp = self.math('COSINE', ph)
        return self.vec(self.mul(cp, self.math('COSINE', th)), self.mul(cp, self.math('SINE', th)), self.math('SINE', ph))
    def torus4(self, k, off=0.0):
        """seamless tiling: (cos 2pi u, sin 2pi u, cos 2pi v) and W = sin 2pi v, scaled by k"""
        a = self.mul(self.u, 2 * math.pi); b = self.mul(self.v, 2 * math.pi)
        v = self.vec(self.mul(self.math('COSINE', a), k), self.mul(self.math('SINE', a), k), self.add(self.mul(self.math('COSINE', b), k), off))
        return v, self.add(self.mul(self.math('SINE', b), k), off * 0.7)
    def noise(self, vec, scale, detail=8.0, rough=0.55, w=None, dist=0.0, lac=2.0):
        t = self.n.new('ShaderNodeTexNoise'); t.noise_dimensions = '4D' if w is not None else '3D'
        self.link(vec, t.inputs['Vector']); t.inputs['Scale'].default_value = scale; t.inputs['Detail'].default_value = detail; t.inputs['Roughness'].default_value = rough
        t.inputs['Distortion'].default_value = dist; t.inputs['Lacunarity'].default_value = lac
        if w is not None:
            if isinstance(w, (int, float)): t.inputs['W'].default_value = w
            else: self.link(w, t.inputs['W'])
        return t
    def voronoi(self, vec, scale, feature='F1', rand=1.0, w=None):
        t = self.n.new('ShaderNodeTexVoronoi'); t.feature = feature; t.voronoi_dimensions = '4D' if w is not None else '3D'
        self.link(vec, t.inputs['Vector']); t.inputs['Scale'].default_value = scale; t.inputs['Randomness'].default_value = rand
        if w is not None:
            if isinstance(w, (int, float)): t.inputs['W'].default_value = w
            else: self.link(w, t.inputs['W'])
        return t
    def ramp(self, x, stops):
        r = self.n.new('ShaderNodeValToRGB'); self.link(x, r.inputs['Fac']); E = r.color_ramp.elements
        while len(E) > len(stops): E.remove(E[-1])
        while len(E) < len(stops): E.new(0.5)
        for e, (p, c) in zip(E, stops): e.position = p; e.color = (*c, 1.0)
        return r.outputs['Color']
    def curve(self, x, pts):
        f = self.n.new('ShaderNodeFloatCurve'); self.link(x, f.inputs['Value']); f.inputs['Factor'].default_value = 1.0
        c = f.mapping.curves[0]
        while len(c.points) > 2: c.points.remove(c.points[-1])
        c.points[0].location = pts[0]; c.points[1].location = pts[-1]
        for p in pts[1:-1]: c.points.new(*p)
        f.mapping.clip_min_y = -1.0; f.mapping.use_clip = False; f.mapping.update(); return f.outputs[0]
    def rgb(self, r, g, b):
        c = self.n.new('ShaderNodeCombineColor')
        for i, s in enumerate((r, g, b)):
            if isinstance(s, (int, float)): c.inputs[i].default_value = s
            else: self.link(s, c.inputs[i])
        return c.outputs[0]
    def emit(self, col): self.link(col, self.em.inputs['Color'])

def bake(plane, mat, w, h, samples=2):
    img = bpy.data.images.new('bake', w, h, alpha=False, float_buffer=True, is_data=True)
    nt = mat.node_tree; n = nt.nodes.new('ShaderNodeTexImage'); n.image = img
    for x in nt.nodes: x.select = False
    n.select = True; nt.nodes.active = n
    sc = bpy.context.scene; sc.cycles.samples = samples; b = sc.render.bake; b.use_selected_to_active = False; b.margin = 0; b.use_clear = True; b.target = 'IMAGE_TEXTURES'
    bpy.ops.object.select_all(action='DESELECT'); plane.select_set(True); bpy.context.view_layer.objects.active = plane
    bpy.ops.object.bake(type='EMIT')
    a = np.array(img.pixels[:], dtype=np.float32).reshape(h, w, 4)[..., :3]; bpy.data.images.remove(img); nt.nodes.remove(n)
    return a[::-1].copy()  # top row first (v = 1)

def srgb(x):
    x = np.clip(x, 0, 1); return np.where(x <= 0.0031308, x * 12.92, 1.055 * np.power(x, 1 / 2.4) - 0.055)
def u8(x): return (np.clip(x, 0, 1) * 255 + 0.5).astype(np.uint8)

def normal_from_height(hgt, strength):
    """tangent-space normal map for an equirect height field (T = east, B = north), x gradient widened by 1/cos(lat)"""
    h, w = hgt.shape; lat = (0.5 - (np.arange(h) + 0.5) / h) * math.pi; c = np.maximum(np.cos(lat), 0.05)[:, None]
    dx = (np.roll(hgt, -1, 1) - np.roll(hgt, 1, 1)) * 0.5 * w / (2 * math.pi) / c
    up = np.vstack([hgt[:1], hgt[:-1]]); dn = np.vstack([hgt[1:], hgt[-1:]]); dy = (up - dn) * 0.5 * h / math.pi
    n = np.dstack([-dx * strength, -dy * strength, np.ones_like(hgt)]); n /= np.linalg.norm(n, axis=2, keepdims=True)
    return n * 0.5 + 0.5

# ---------------------------------------------------------------- bodies
def body_dark(g):
    d = g.sphere_dir()
    cont = g.noise(d, 1.6, 12, 0.6, dist=0.4).outputs['Fac']; rid = g.noise(d, 5.0, 8, 0.55).outputs['Fac']
    ridge = g.sub(1.0, g.math('ABSOLUTE', g.sub(g.mul(rid, 2.0), 1.0)))
    cr = g.voronoi(d, 7.0); crater = g.curve(cr.outputs['Distance'], [(0, -0.6), (0.18, -0.35), (0.26, 0.25), (0.34, 0.0), (1.0, 0.0)])
    hgt = g.add(g.add(g.mul(cont, 0.7), g.mul(ridge, 0.25)), g.mul(crater, 0.12))
    alb = g.ramp(cont, [(0.0, (0.012, 0.014, 0.022)), (0.42, (0.022, 0.024, 0.032)), (0.55, (0.05, 0.048, 0.05)), (0.7, (0.085, 0.075, 0.07)), (1.0, (0.13, 0.12, 0.115))])
    # glowing fissure / settlement network (orange on the night side): voronoi edges masked by noise + fine light clusters
    edge = g.voronoi(g.vadd(d, (0.3, 0.1, 0.0)), 8.0, 'DISTANCE_TO_EDGE').outputs['Distance']; lines = g.smooth(0.011, 0.0, edge)
    m1 = g.smooth(0.52, 0.66, g.noise(d, 2.6, 6, 0.5).outputs['Fac']); fine = g.smooth(0.008, 0.0, g.voronoi(d, 26.0, 'DISTANCE_TO_EDGE').outputs['Distance'])
    m2 = g.smooth(0.55, 0.7, g.noise(d, 4.0, 6, 0.5).outputs['Fac']); dots = g.smooth(0.62, 0.8, g.noise(d, 60.0, 4, 0.6).outputs['Fac'])
    emis = g.math('MINIMUM', g.add(g.mul(lines, m1), g.add(g.mul(g.mul(fine, m2), 0.7), g.mul(g.mul(dots, m2), 0.8))), 1.0)
    return alb, hgt, emis

def body_gas(g):
    d = g.sphere_dir()
    sep = g.n.new('ShaderNodeSeparateXYZ'); g.link(d, sep.inputs[0]); z = sep.outputs[2]
    turb = g.noise(g.vec(g.mul(sep.outputs[0], 1.5), g.mul(sep.outputs[1], 1.5), g.mul(z, 9.0)), 1.2, 10, 0.62, dist=1.2).outputs['Fac']
    lat = g.add(g.mul(z, 7.5), g.mul(turb, 1.6))
    band = g.math('FRACT', g.mul(g.add(lat, 4.0), 0.5))
    fine = g.noise(g.vec(g.mul(sep.outputs[0], 3.0), g.mul(sep.outputs[1], 3.0), g.mul(z, 40.0)), 1.0, 6, 0.6, dist=0.6).outputs['Fac']
    t = g.math('FRACT', g.add(band, g.mul(g.sub(fine, 0.5), 0.18)))
    col = g.ramp(t, [(0.0, (0.10, 0.06, 0.20)), (0.12, (0.30, 0.22, 0.50)), (0.24, (0.58, 0.50, 0.74)), (0.36, (0.80, 0.70, 0.58)), (0.47, (0.62, 0.42, 0.27)),
                     (0.56, (0.86, 0.78, 0.66)), (0.66, (0.42, 0.28, 0.22)), (0.76, (0.46, 0.34, 0.62)), (0.88, (0.70, 0.62, 0.80)), (1.0, (0.10, 0.06, 0.20))])
    # one great storm oval (southern hemisphere)
    so = g.vec(g.mul(g.sub(sep.outputs[0], 0.55), 1.0), g.mul(g.sub(sep.outputs[1], 0.62), 1.0), g.mul(g.add(z, 0.42), 2.2))
    ln = g.n.new('ShaderNodeVectorMath'); ln.operation = 'LENGTH'; g.link(so, ln.inputs[0]); st = g.smooth(0.22, 0.05, ln.outputs['Value'])
    mx = g.n.new('ShaderNodeMix'); mx.data_type = 'RGBA'; g.link(st, mx.inputs['Factor']); g.link(col, mx.inputs['A']); mx.inputs['B'].default_value = (0.72, 0.36, 0.22, 1)
    return mx.outputs['Result'], None, None

def body_moon(g):
    d = g.sphere_dir(); h = None
    for i, (s, amp) in enumerate([(3.0, 0.5), (7.0, 0.32), (16.0, 0.2), (38.0, 0.12), (80.0, 0.06)]):
        vo = g.voronoi(g.vadd(d, (i * 1.7, i * 0.9, i * 2.3)), s, rand=0.9)
        sc = g.n.new('ShaderNodeSeparateColor'); g.link(vo.outputs['Color'], sc.inputs[0]); keep = g.smooth(0.35 - i * 0.04, 0.5 - i * 0.04, sc.outputs[0])
        prof = g.curve(vo.outputs['Distance'], [(0, -1.0), (0.22, -0.75), (0.33, 0.35), (0.42, 0.05), (0.6, 0.0), (1.0, 0.0)])
        c = g.mul(g.mul(prof, keep), amp); h = c if h is None else g.add(h, c)
    rough = g.noise(d, 12.0, 10, 0.6).outputs['Fac']; h = g.add(h, g.mul(rough, 0.12))
    mare = g.smooth(0.52, 0.6, g.noise(d, 1.4, 6, 0.5, dist=0.3).outputs['Fac'])
    base = g.noise(d, 4.0, 8, 0.6).outputs['Fac']
    lum = g.add(g.add(0.26, g.mul(base, 0.14)), g.mul(mare, -0.11)); lum = g.add(lum, g.mul(h, 0.2))
    alb = g.rgb(g.mul(lum, 1.0), g.mul(lum, 0.985), g.mul(lum, 0.96))
    return alb, h, None

def body_star(g):
    d = g.sphere_dir()
    gran = g.voronoi(d, 46.0, 'F1', rand=1.0).outputs['Distance']
    cells = g.sub(1.0, g.smooth(0.0, 0.75, gran))
    plasma = g.noise(d, 3.0, 10, 0.62, dist=0.8).outputs['Fac']
    spots = g.smooth(0.7, 0.78, g.noise(d, 2.2, 6, 0.5).outputs['Fac'])
    return g.rgb(cells, plasma, spots), None, None

def plane_nebula(g):
    # channel layout of the game's nebula map: R large gas, G ridged filaments (sparse), B colour / fine field, A dark dust
    v, w = g.torus4(1.0); gas = g.noise(v, 1.6, 6, 0.5, w=w).outputs['Fac']
    v2, w2 = g.torus4(1.0, 3.0); f = g.smooth(0.3, 0.7, g.noise(v2, 2.2, 8, 0.58, w=w2).outputs['Fac']); fil = g.math('POWER', g.sub(1.0, g.math('ABSOLUTE', g.sub(g.mul(f, 2.0), 1.0))), 9.0)
    v3, w3 = g.torus4(1.0, 7.0); colf = g.noise(v3, 1.1, 5, 0.5, w=w3).outputs['Fac']
    v4, w4 = g.torus4(1.0, 11.0); dust = g.noise(v4, 1.8, 6, 0.5, w=w4).outputs['Fac']
    return g.rgb(g.smooth(0.22, 0.78, gas), fil, colf), dust

def plane_disc(g):
    """polar map: u = angle, v = radius (0 inner, 1 outer); log-spiral streaks"""
    a = g.mul(g.add(g.u, g.mul(g.v, 0.35)), 2 * math.pi)
    v = g.vec(g.mul(g.math('COSINE', a), 1.2), g.mul(g.math('SINE', a), 1.2), g.mul(g.v, 9.0))
    s1 = g.noise(v, 2.0, 10, 0.6, dist=0.4).outputs['Fac']
    v2 = g.vec(g.mul(g.math('COSINE', a), 3.0), g.mul(g.math('SINE', a), 3.0), g.mul(g.v, 26.0)); s2 = g.noise(v2, 2.5, 6, 0.55).outputs['Fac']
    return g.rgb(g.smooth(0.3, 0.75, s1), g.smooth(0.35, 0.8, s2), 0.0), None

def ring_strip(n=1024):
    """gas-giant ring bands (RGBA, linear colour): tan / cream / lavender with Cassini-like gaps"""
    rng = np.random.default_rng(7); r = np.linspace(0, 1, n)
    den = np.zeros(n)
    for f, a in [(9, 0.35), (23, 0.25), (61, 0.2), (140, 0.12), (310, 0.08)]: den += a * np.sin(r * f * 2 * math.pi + rng.uniform(0, 6.28)) ** 2
    den = 0.25 + den; den *= np.clip(r / 0.04, 0, 1) * np.clip((1 - r) / 0.08, 0, 1)
    for c, wdt in [(0.42, 0.025), (0.63, 0.012), (0.8, 0.008)]: den *= 1 - 0.92 * np.exp(-((r - c) / wdt) ** 2)
    den = np.clip(den, 0, 1)
    c0 = np.array([0.62, 0.50, 0.38]); c1 = np.array([0.86, 0.78, 0.66]); c2 = np.array([0.55, 0.47, 0.70])
    t = 0.5 + 0.5 * np.sin(r * 17.0); u = 0.5 + 0.5 * np.sin(r * 5.0 + 1.0)
    col = c0[None] * (1 - t[:, None]) + c1[None] * t[:, None]; col = col * (1 - 0.6 * u[:, None]) + c2[None] * 0.6 * u[:, None]
    rgba = np.concatenate([srgb(col), den[:, None]], axis=1)
    return np.repeat(rgba[None], 8, axis=0)

BODIES = {'dark': body_dark, 'gas': body_gas, 'moon': body_moon, 'star': body_star}
PLANES = {'nebula': plane_nebula, 'bhdisc': plane_disc}
SIZES = {'dark': (2048, 1024), 'gas': (2048, 1024), 'moon': (2048, 1024), 'star': (1024, 512), 'nebula': (1024, 1024), 'bhdisc': (1024, 256)}

def save(name, arr):
    from PIL import Image
    Image.fromarray(arr).save(os.path.join(OUT, name + '.png'))

def bake_one(k):
    plane = reset(); mat = bpy.data.materials.new(k); plane.data.materials.append(mat); g = G(mat); W, H = SIZES[k]
    if k in BODIES:
        alb, hgt, emis = BODIES[k](g)
        g.emit(alb); A = bake(plane, mat, W, H)
        if k == 'star': save('star', u8(A))  # data channels
        else:
            out = srgb(A)
            if emis is not None:
                g.emit(g.rgb(emis, emis, emis)); E = bake(plane, mat, W, H)[..., 0]; save(k, np.dstack([u8(out), u8(E)]))
            else: save(k, u8(out))
        if hgt is not None:
            g.emit(g.rgb(hgt, hgt, hgt)); Hm = bake(plane, mat, W // 2, H // 2)[..., 0]
            np.save(os.path.join(OUT, k + '-height.npy'), Hm)
            save(k + '-normal', u8(normal_from_height(Hm, {'dark': 0.035, 'moon': 0.06}[k])))
    else:
        rgb, extra = PLANES[k](g); g.emit(rgb); A = bake(plane, mat, W, H)
        if extra is not None:
            g.emit(g.rgb(extra, extra, extra)); E = bake(plane, mat, W, H)[..., 0]; X = np.dstack([A, E])
            if k == 'nebula':  # match the 10th / 90th percentiles of the game's procedural map, so the existing nebula shader keeps its density
                for c, (t10, t90) in enumerate([(0.392, 0.635), (0.09, 0.569), (0.318, 0.682), (0.396, 0.686)]):
                    m10, m90 = np.percentile(X[..., c], [10, 90]); X[..., c] = t10 + (X[..., c] - m10) * (t90 - t10) / max(m90 - m10, 1e-4)
            save(k, u8(X))
        else: save(k, u8(A))
    print('BAKED', k, W, H, flush=True)

# ---------------------------------------------------------------- web formats: full + half, KTX2 (ETC1S colour / UASTC normals) + WebP
def post(k):
    from PIL import Image
    names = [k] + ([k + '-normal'] if os.path.exists(os.path.join(OUT, k + '-normal.png')) else [])
    for n in names:
        im = Image.open(os.path.join(OUT, n + '.png')); half = im.resize((im.width // 2, im.height // 2), Image.LANCZOS)
        for suf, img in (('', im), ('-half', half)):
            p = os.path.join(WEB, n + suf); img.save(p + '.webp', quality=88, method=6); img.save(p + '.tmp.png')
            data = n.endswith('-normal') or k in ('star', 'nebula', 'bhdisc', 'ring')
            enc = ['--encode', 'uastc', '--uastc_quality', '2', '--zcmp', '18'] if data else ['--encode', 'etc1s', '--clevel', '2', '--qlevel', '160']  # data maps in UASTC (ETC1S blocks them)
            cs = ['--assign_oetf', 'linear', '--assign_primaries', 'none'] if data else ['--assign_oetf', 'srgb']
            r = subprocess.run([TOKTX, '--t2', '--genmipmap', '--lower_left_maps_to_s0t0', *enc, *cs, p + '.ktx2', p + '.tmp.png'], capture_output=True, text=True)
            if r.returncode: print('toktx', n, suf, r.stderr[-300:])
            os.remove(p + '.tmp.png')
    print('POST', k, flush=True)

if __name__ == '__main__':
    only = sys.argv[sys.argv.index('--only') + 1].split(',') if '--only' in sys.argv else list(BODIES) + list(PLANES) + ['ring']
    for k in only:
        if k == 'ring': save('ring', u8(ring_strip())); print('BAKED ring')
        else: bake_one(k)
        if '--nopost' not in sys.argv: post(k)

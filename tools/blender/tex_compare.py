# texture-test sheets -> shots/tex/tex-vs-<id>.png:
# concept crop | current untextured in game | textured in game (gameplay zoom) | textured close-up (shipyard) | Blender Cycles beauty
# plus shots/tex/closeup-<id>.png: shipyard untextured vs textured, side by side
import os, sys
from PIL import Image, ImageDraw, ImageFont
B = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'); T = f'{B}/shots/tex'
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from compare import fit, crop_content
GAME = {'scout': (0.5, 0.56, 0.42), 'dreadnought': (0.5, 0.47, 0.62)}  # centre x, centre y, crop width as a fraction of the screen width
def font(s):
    try: return ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf', s)
    except Exception: return ImageFont.load_default()
def game_crop(f, id_):
    im = Image.open(f).convert('RGB'); W, H = im.size; cx, cy, fw = GAME[id_]; w = int(W * fw); h = int(w * (1.55 if id_ == 'dreadnought' else 1.0))
    x0 = max(0, int(W * cx - w / 2)); y0 = max(0, min(H - h, int(H * cy - h / 2))); return im.crop((x0, y0, x0 + w, y0 + h))
def sheet(parts, out, H=380):
    ims = [fit(p, H) for _, p in parts]; W = sum(i.width for i in ims) + 10 * (len(ims) - 1)
    o = Image.new('RGB', (W, H + 34), (8, 12, 20)); d = ImageDraw.Draw(o); x = 0; f = font(15)
    for (lab, _), im in zip(parts, ims): o.paste(im, (x, 34)); d.text((x + 8, 8), lab, fill=(200, 225, 255), font=f); x += im.width + 10
    o.save(out); print('wrote', out)
def make(id_):
    c = Image.open(f'{B}/concept/{id_}.png').convert('RGB'); c = c.crop((0, 0, c.width, int(c.height * (1 if id_ == 'dreadnought' else 0.78))))
    parts = [('Concept', c), ('Untextured, in game', game_crop(f'{T}/ingame-{id_}-untex.png', id_)), ('Textured, in game (High)', game_crop(f'{T}/ingame-{id_}-tex-high.png', id_)),
             ('Textured close-up (shipyard)', crop_content(Image.open(f'{T}/shipyard-{id_}-tex.png').convert('RGB'))), ('Blender Cycles (high-poly)', crop_content(Image.open(f'{T}/{id_}-cycles-beauty.png').convert('RGB')))]
    if id_ == 'dreadnought':  # very wide concept: two rows (concept + Cycles on top, the three game views below)
        a = f'{T}/_r1.png'; b = f'{T}/_r2.png'; sheet([parts[0], parts[4]], a, H=300); sheet(parts[1:4], b, H=520)
        A, Bm = Image.open(a), Image.open(b); W = max(A.width, Bm.width); o = Image.new('RGB', (W, A.height + Bm.height + 8), (8, 12, 20))
        o.paste(A, ((W - A.width) // 2, 0)); o.paste(Bm, ((W - Bm.width) // 2, A.height + 8)); o.save(f'{T}/tex-vs-{id_}.png'); os.remove(a); os.remove(b)
    else: sheet(parts, f'{T}/tex-vs-{id_}.png', H=380)
    sheet([('Shipyard today (untextured)', crop_content(Image.open(f'{T}/shipyard-{id_}-untex.png').convert('RGB'))), ('Shipyard textured', crop_content(Image.open(f'{T}/shipyard-{id_}-tex.png').convert('RGB')))], f'{T}/closeup-{id_}.png', H=520)
    sheet([('Untextured (High)', game_crop(f'{T}/ingame-{id_}-untex.png', id_)), ('Textured High (full res)', game_crop(f'{T}/ingame-{id_}-tex-high.png', id_)), ('Textured Medium (half res)', game_crop(f'{T}/ingame-{id_}-tex-medium.png', id_)), ('Low (untextured)', game_crop(f'{T}/ingame-{id_}-tex-low.png', id_))], f'{T}/gameplay-{id_}.png', H=420)
if __name__ == '__main__':
    for a in sys.argv[1:]: make(a)

# v12 reshape sheets: concept panel on top; below, before (Blender) | after (Blender) | after (in game). Plus a side-view before/after.
import sys, os
from PIL import Image, ImageDraw, ImageFont
from compare import fit, crop_content
B = os.path.join(os.path.dirname(__file__), '..'); S = f'{B}/shots'; R = f'{S}/reshape'
try: FONT = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf', 22)
except Exception: FONT = None
def row(items, H):
    ims = [fit(im, H) for _, im in items]; W = sum(i.width for i in ims) + 14 * (len(ims) - 1)
    out = Image.new('RGB', (W, H + 36), (6, 9, 15)); d = ImageDraw.Draw(out); x = 0
    for (lab, _), im in zip(items, ims): out.paste(im, (x, 36)); d.text((x + 8, 7), lab, fill=(200, 225, 255), font=FONT); x += im.width + 14
    return out
def stack(rows, W=1800):
    rs = [r.resize((W, round(r.height * W / r.width)), Image.LANCZOS) for r in rows]; out = Image.new('RGB', (W, sum(r.height for r in rs) + 10 * (len(rs) - 1)), (6, 9, 15)); y = 0
    for r in rs: out.paste(r, (0, y)); y += r.height + 10
    return out
def make(id_):
    c = Image.open(f'{B}/concept/{id_}.png').convert('RGB'); c = c.crop((0, 0, c.width, int(c.height * (1 if id_ == 'dreadnought' else 0.8 if id_ in ('battlecruiser', 'fleetcarrier') else 0.78))))
    op = lambda f: crop_content(Image.open(f).convert('RGB'))
    top = row([('Concept sheet', c)], 420)
    mid = row([('Before (Blender v10)', op(f'{R}/before/blender-{id_}-concept.png')), ('After (Blender v12)', op(f'{S}/blender-{id_}-concept.png')), ('After, in game', op(f'{S}/ingame-{id_}.png'))], 420)
    stack([top, mid]).save(f'{R}/concept-vs-{id_}.png')
    sides = [('Side before', op(f'{R}/before/blender-{id_}-side.png')), ('Side after', op(f'{S}/blender-{id_}-side.png'))]
    if os.path.exists(f'{S}/ingame-{id_}-side.png'): sides.append(('Side after, in game', op(f'{S}/ingame-{id_}-side.png')))
    stack([row(sides, 300)]).save(f'{R}/side-{id_}.png'); print('wrote', f'shots/reshape/concept-vs-{id_}.png', f'shots/reshape/side-{id_}.png')
if __name__ == '__main__':
    for a in sys.argv[1:]: make(a)

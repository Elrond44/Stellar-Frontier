# concept-vs-model sheet: concept crop | Blender render | in-game render (if present) -> shots/concept-vs-<id>.png
import sys, os
from PIL import Image, ImageDraw, ImageFont
B = os.path.join(os.path.dirname(__file__), '..')
def fit(im, H): return im.resize((round(im.width * H / im.height), H), Image.LANCZOS)
def crop_content(im, pad=0.04):  # trim the dark background around a render
    g = im.convert('L').point(lambda v: 255 if v > 28 else 0); bb = g.getbbox() or (0, 0, im.width, im.height)
    w, h = bb[2] - bb[0], bb[3] - bb[1]; p = int(max(w, h) * pad)
    return im.crop((max(0, bb[0] - p), max(0, bb[1] - p), min(im.width, bb[2] + p), min(im.height, bb[3] + p)))
def make(id_, H=420):
    parts = [('Concept sheet', Image.open(f'{B}/concept/{id_}.png').convert('RGB'))]
    c = parts[0][1]; parts[0] = (parts[0][0], c.crop((0, 0, c.width, int(c.height * (0.78 if id_ != 'dreadnought' else 1)))))  # drop the label
    for lab, f in (('Blender model', f'{B}/shots/blender-{id_}-concept.png'), ('In game (?hulls=glb)', f'{B}/shots/ingame-{id_}.png')):
        if os.path.exists(f): parts.append((lab, crop_content(Image.open(f).convert('RGB'))))
    ims = [fit(p, H) for _, p in parts]; W = sum(i.width for i in ims) + 12 * (len(ims) - 1)
    out = Image.new('RGB', (W, H + 34), (6, 9, 15)); d = ImageDraw.Draw(out)
    try: font = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf', 20)
    except Exception: font = None
    x = 0
    for (lab, _), im in zip(parts, ims):
        out.paste(im, (x, 34)); d.text((x + 8, 6), lab, fill=(200, 225, 255), font=font); x += im.width + 12
    out.save(f'{B}/shots/concept-vs-{id_}.png'); print('wrote', f'shots/concept-vs-{id_}.png')
if __name__ == '__main__':
    for a in sys.argv[1:]: make(a)

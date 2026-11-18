"""concept-vs-<asset>.png: concept crop (left) | Blender render (right), labelled."""
import sys
from PIL import Image, ImageDraw, ImageFont
B = '/workspace/stellar-frontier/'
def comp(crop, render, out, title):
    a = Image.open(B + 'briefs/crops/' + crop).convert('RGB'); b = Image.open(B + 'blender/shots/env/' + render).convert('RGB')
    H = 520; a = a.resize((int(a.width * H / a.height), H)); b = b.resize((int(b.width * H / b.height), H))
    o = Image.new('RGB', (a.width + b.width + 12, H + 44), (10, 10, 18)); o.paste(a, (0, 44)); o.paste(b, (a.width + 12, 44))
    d = ImageDraw.Draw(o)
    try: f = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf', 22)
    except Exception: f = None
    d.text((10, 10), 'CONCEPT: ' + title, fill=(230, 210, 160), font=f); d.text((a.width + 22, 10), 'BLENDER (v14)', fill=(150, 220, 255), font=f)
    o.save(B + 'blender/shots/env/' + out)
if __name__ == '__main__':
    M = [('ast-lumpy.png', 'asteroid-lumpy_a.png', 'lumpy rock'), ('ast-porous3.png', 'asteroid-porous.png', 'porous rock'),
         ('ast-cavern.png', 'asteroid-cavern.png', 'holed / cavern rock'), ('ast-molten.png', 'asteroid-molten.png', 'molten rock'),
         ('ast-veined.png', 'asteroid-veined.png', 'green ore veins'), ('ast-nugget.png', 'asteroid-nugget.png', 'gold nuggets'),
         ('ast-crystal.png', 'asteroid-crystal_a.png', 'blue crystal rock')]
    M += [('st-hangar.png', 'station-l1.png', 'hangar / outpost module (L1 Outpost Refinery)'), ('st-reactor.png', 'station-l2.png', 'reactor module, blue core (L2 Solar Refinery)'),
          ('st-smallring.png', 'station-l3.png', 'small ring station (L3 Factory Station)'), ('st-industrial3.png', 'station-l4.png', 'rock base + gold cranes + crystals (L4 Orbital Works)'),
          ('st-dome.png', 'station-l5.png', 'dome biosphere (L5 Industrial Hub)'), ('st-industrial.png', 'station-l5.png', 'industrial hub (L5 Industrial Hub)'),
          ('st-ring.png', 'station-l6.png', 'ring station (L6 Frontier Citadel)'), ('st-ring3.png', 'station-l6.png', 'ring citadel, sheet 3 (L6)'),
          ('crystals3.png', 'sheet-crystals.png', 'crystal colours (rich rocks)')]
    only = sys.argv[1:]
    for c, r, t in M:
        n = 'concept-vs-' + r if not r.startswith('asteroid-') else r.replace('asteroid-', 'concept-vs-asteroid-')
        if c.startswith('st-industrial.') or c.startswith('st-ring3') : n = n.replace('.png', '-b.png')
        if not only or any(k in r for k in only):
            try: comp(c, r, n, t)
            except FileNotFoundError as e: print('skip', e)

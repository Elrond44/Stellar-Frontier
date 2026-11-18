"""v16: concept-vs-<body>.png = concept crop (left) | in-game close-up from tests/v16shots.js (right), labelled."""
from PIL import Image, ImageDraw, ImageFont
B = '/workspace/stellar-frontier/'
G = B + 'game/shots/sky/'
M = [('planet3.png', 'dark', 'dark planet, orange sun rim + city fissures'), ('gas3.png', 'gas', 'banded ringed gas giant + moon'),
     ('moon3.png', 'moon', 'grey cratered moon'), ('star3.png', 'star', 'fiery star, corona + flares'),
     ('bh3.png', 'bh', 'blue black hole, accretion disc + lensing'), ('neb3.png', 'neb', 'teal / purple nebula clouds')]
def comp(crop, k, title):
    a = Image.open(B + 'briefs/crops3/' + crop).convert('RGB'); b = Image.open(G + 'ingame-' + k + '.png').convert('RGB')
    H = 520; a = a.resize((int(a.width * H / a.height), H)); b = b.resize((int(b.width * H / b.height), H))
    o = Image.new('RGB', (max(a.width, 380) + b.width + 12, H + 44), (10, 10, 18)); o.paste(a, (0, 44)); o.paste(b, (max(a.width, 380) + 12, 44))
    d = ImageDraw.Draw(o)
    try: f = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf', 18)
    except Exception: f = None
    d.text((10, 12), 'CONCEPT: ' + title, fill=(230, 210, 160), font=f); d.text((max(a.width, 380) + 22, 12), 'IN-GAME (v16)', fill=(150, 220, 255), font=f)
    o.save(G + 'concept-vs-' + k + '.png')
if __name__ == '__main__':
    for c, k, t in M: comp(c, k, t)
    print('ok', len(M))

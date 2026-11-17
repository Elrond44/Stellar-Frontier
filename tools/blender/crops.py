# crop concept-sheet panels (coordinates in the 1536x1024 sheet) -> concept/<id>.png, upscaled 3x
from PIL import Image
import sys
F = 1536 / 819
BOX = {  # in 819-wide display coords: x0,y0,x1,y1
  'scout': (12, 68, 88, 132), 'interceptor': (88, 68, 170, 132), 'strike': (172, 68, 258, 132),
  'corvette': (268, 68, 348, 132), 'gunship': (346, 68, 428, 132), 'engineer': (428, 68, 512, 132),
  'frigate': (524, 68, 610, 132), 'destroyer': (612, 68, 700, 132), 'cruiser': (700, 68, 812, 132),
  'dreadnought': (15, 262, 815, 445), 'battlecruiser': (352, 166, 578, 252), 'fleetcarrier': (560, 160, 815, 252),
  'bomber': (8, 168, 118, 245), 'icarrier': (118, 168, 232, 245), 'explorer': (230, 168, 340, 245),
}
im = Image.open('../briefs/ship-concepts.png').convert('RGB')
for k, b in BOX.items():
    c = im.crop(tuple(round(v * F) for v in b)); c = c.resize((c.width * 3, c.height * 3), Image.LANCZOS) if k not in ('dreadnought', 'battlecruiser', 'fleetcarrier') else c.resize((c.width * 2, c.height * 2), Image.LANCZOS)
    c.save(f'concept/{k}.png')
print('ok')

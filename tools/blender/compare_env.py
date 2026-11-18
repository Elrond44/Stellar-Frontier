"""concept-vs-<asset>.png: concept crop (left) | Blender render (right), labelled."""
import sys
from PIL import Image, ImageDraw, ImageFont
B = '/workspace/stellar-frontier/'
def comp(crop, render, out, title, ver='v14'):
    a = Image.open(B + ('briefs/' + crop if crop.startswith('crops2/') else 'briefs/crops/' + crop)).convert('RGB'); b = Image.open(B + 'blender/shots/env/' + render).convert('RGB')
    H = 520; a = a.resize((int(a.width * H / a.height), H)); b = b.resize((int(b.width * H / b.height), H))
    o = Image.new('RGB', (a.width + b.width + 12, H + 44), (10, 10, 18)); o.paste(a, (0, 44)); o.paste(b, (a.width + 12, 44))
    d = ImageDraw.Draw(o)
    try: f = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf', 22)
    except Exception: f = None
    d.text((10, 10), 'CONCEPT: ' + title, fill=(230, 210, 160), font=f); d.text((a.width + 22, 10), 'BLENDER (' + ver + ')', fill=(150, 220, 255), font=f)
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
    V15 = [('crops2/citadel.png', 'inst-hq.png', 'pirate citadel -> Faction Stronghold', 'concept-vs-inst-hq.png'),
           ('crops2/fortress3.png', 'inst-hq.png', 'fortress, sheet 3 -> Faction Stronghold', 'concept-vs-inst-hq-b.png'),
           ('crops2/turretplat3.png', 'inst-def.png', 'turret platform -> Orbital Defense Platform', 'concept-vs-inst-def.png'),
           ('crops2/comms.png', 'inst-comm.png', 'comms dish relay -> Communication Array', 'concept-vs-inst-comm.png'),
           ('crops2/hangar.png', 'inst-yard.png', 'hangar block -> Hidden Shipyard', 'concept-vs-inst-yard.png'),
           ('crops2/hangar3.png', 'inst-hangar.png', 'hangar, sheet 3 -> Fighter Hangar', 'concept-vs-inst-hangar.png'),
           ('crops2/reactor.png', 'inst-reactor.png', 'reactor ring -> Fusion Reactor', 'concept-vs-inst-reactor.png'),
           ('crops2/smallring.png', 'inst-gen.png', 'ring outpost -> Shield Generator', 'concept-vs-inst-gen.png'),
           ('crops2/turretplat3.png', 'inst-turret.png', 'turret platform -> Defense Turret', 'concept-vs-inst-turret.png'),
           ('crops2/beacon.png', 'inst-relay.png', 'green beacon spire -> repair relay', 'concept-vs-inst-relay.png'),
           ('crops2/pit.png', 'rig-pit.png', 'open-pit mine + crane -> Resource Facility', 'concept-vs-rig-pit.png'),
           ('crops2/drill.png', 'rig-drill.png', 'crystal drill rig (set dressing)', 'concept-vs-rig-drill.png'),
           ('crops2/tunnel.png', 'rig-tunnel.png', 'tunnel hangar (set dressing)', 'concept-vs-rig-tunnel.png'),
           ('crops2/colony.png', 'rig-colony.png', 'dome colony (set dressing)', 'concept-vs-rig-colony.png'),
           ('crops2/gems3.png', 'sheet-pickups.png', 'gems -> ore pickups', 'concept-vs-pickups.png'),
           ('crops2/gems3.png', 'sheet-crystals.png', 'gems -> rich crystal rocks', 'concept-vs-sheet-crystals.png'),
           ('crops/st-industrial3.png', 'station-l4-low.png', 'rock base + cranes (L4, low view, v15 detail)', 'concept-vs-station-l4-low.png'),
           ('crops/st-ring.png', 'station-l6-low.png', 'ring station (L6, low view, v15 detail)', 'concept-vs-station-l6-low.png')]
    if '--v15' in sys.argv:
        for c, r, t, n in V15:
            c = c if c.startswith('crops2/') else c[6:]
            comp(c, r, n, t, 'v15')
        sys.exit(0)
    only = sys.argv[1:]
    for c, r, t in M:
        n = 'concept-vs-' + r if not r.startswith('asteroid-') else r.replace('asteroid-', 'concept-vs-asteroid-')
        if c.startswith('st-industrial.') or c.startswith('st-ring3') : n = n.replace('.png', '-b.png')
        if not only or any(k in r for k in only):
            try: comp(c, r, n, t, 'v15' if 'station' in r or 'crystals' in r else 'v14')
            except FileNotFoundError as e: print('skip', e)

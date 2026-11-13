#!/usr/bin/env python3
"""Route an Ergogen-exported birdboard.kicad_pcb: matrix, LED chain, USB link and 5V traces on F.Cu/B.Cu,
GND pour zones on both layers and stitching vias. Both halves are routed on their own.

  python3 tools/router/route_board.py birdboard.kicad_pcb birdboard_routed.kicad_pcb [preview.png]

Needs numpy, scipy and Pillow. Takes a couple of minutes. Rules: 0.25 mm signal, 0.5 mm 5V, 0.2 mm clearance,
0.6/0.3 mm vias, 0.5 mm copper to the board edge. It also drops stacked duplicate switches/diodes on the right
half that an older config produced, and gives each thumb key its own diode net (see README).
Zones are written unfilled: in KiCad press B (fill all zones) before running DRC or plotting.
"""
import os, sys, time, collections
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
src, out = sys.argv[1], sys.argv[2]
png = sys.argv[3] if len(sys.argv) > 3 else None
os.environ['BIRDBOARD_PCB'] = os.path.abspath(src)
import model as M
M.PCB = os.path.abspath(src)
import router as R, pour, write_pcb, drc


def route_half(left):
    r = R.Router()
    bd = r.bd
    nets = collections.defaultdict(list)
    for q in bd.pads:
        if q.net and not q.net.startswith('GND') and ((q.x < M.SEAM) == left):
            nets[q.net].append(q)
    multi = [n for n, v in nets.items() if len(v) > 1]
    sx = '' if left else '_r'
    cols = [c + sx for c in ['outer', 'pinky', 'ring', 'middle', 'index', 'inner']]
    rows = [c + sx for c in ['bottom', 'home', 'top', 'thumb']]
    power = ['5V' + sx]
    misc = [m + sx for m in ['link', 'led_data', 'led_1', 'led_2']]
    colrow = [n for n in multi if n not in cols + rows + power + misc]
    order = [n for n in power + misc + colrow + cols + rows if n in multi]
    fails = []
    for n in order:
        r.route_net(n, 0.5 if n.startswith('5V') else 0.25, half=left)
        if r.res[n]['failed']: fails.append((n, r.res[n]['failed']))
    print('left' if left else 'right', 'routed', len(order), 'nets; failed:', fails, flush=True)
    return r.res


t0 = time.time()
res = {}
res.update(route_half(True))
res.update(route_half(False))
bd, d, outp = pour.analyse(res)
gv = []
for g in ('GND', 'GND_r'):
    info = pour.gnd_connect(bd, d, outp, g)
    print(g, 'pads', info['padn'], 'unattached', info['unattached'], 'pour groups', info['groups'])
    gv += info['added'] + info['stitch']
write_pcb.build(M.PCB, out, res, gv)
if png:
    import render
    render.render(res, png, (86, 40, 385, 132), scale=6)
print('done in %.0f s' % (time.time() - t0))

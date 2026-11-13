"""Minimal .kicad_pcb reader: footprints, pads (absolute coords), nets."""
import re, math

def blocks(t, key, start=0, end=None):
    end = len(t) if end is None else end
    i = start; out = []
    pat = '(' + key + ' '
    while True:
        j = t.find(pat, i, end)
        if j < 0: break
        d = 0; k = j
        while True:
            c = t[k]
            if c == '(': d += 1
            elif c == ')':
                d -= 1
                if d == 0: break
            k += 1
        out.append((j, k + 1)); i = k + 1
    return out

def load(path):
    t = open(path).read()
    nets = {int(a): b for a, b in re.findall(r'\(net (\d+) "([^"]*)"\)\s*\n\s*\(', t[:t.find('(footprint')]) }
    # nets are declared as (net N "name") at top level
    head = t[:t.find('(footprint ')]
    nets = {int(a): b for a, b in re.findall(r'\(net (\d+) "([^"]*)"\)', head)}
    byname = {v: k for k, v in nets.items()}
    fps = []
    for s, e in blocks(t, 'footprint'):
        f = t[s:e]
        name = f.split('"')[1]
        layer = re.search(r'\(layer "([^"]*)"\)', f).group(1)
        m = re.search(r'\(at ([-\d.e]+) ([-\d.e]+)(?: ([-\d.e]+))?\)', f)
        fx, fy = float(m.group(1)), float(m.group(2))
        fr = float(m.group(3) or 0)
        ref = re.search(r'\(property "Reference" "([^"]*)"', f)
        ref = ref.group(1) if ref else '?'
        pads = []
        for ps, pe in blocks(f, 'pad'):
            p = f[ps:pe]
            hdr = re.match(r'\(pad "([^"]*)" (\w+) (\w+)', p)
            num, typ, shape = hdr.groups()
            pm = re.search(r'\(at ([-\d.e]+) ([-\d.e]+)(?: ([-\d.e]+))?\)', p)
            lx, ly = float(pm.group(1)), float(pm.group(2))
            pr = float(pm.group(3) or 0)
            sz = re.search(r'\(size ([-\d.e]+) ([-\d.e]+)\)', p)
            sw, sh = float(sz.group(1)), float(sz.group(2))
            dr = re.search(r'\(drill (?:oval )?([-\d.e]+)(?: ([-\d.e]+))?\)', p)
            drill = (float(dr.group(1)), float(dr.group(2) or dr.group(1))) if dr else None
            lay = re.search(r'\(layers ([^)]*)\)', p).group(1).replace('"', '').split()
            n = re.search(r'\(net (\d+) "([^"]*)"\)', p)
            net = int(n.group(1)) if n else 0
            a = math.radians(-fr)  # kicad: positive angle is CCW on screen (y down) -> use -fr
            ax = fx + lx * math.cos(a) - ly * math.sin(a)
            ay = fy + lx * math.sin(a) + ly * math.cos(a)
            pads.append(dict(ref=ref, fp=name, num=num, type=typ, shape=shape, x=ax, y=ay,
                             w=sw, h=sh, rot=pr, drill=drill, layers=lay, net=net,
                             fplayer=layer))
        fps.append(dict(ref=ref, name=name, layer=layer, x=fx, y=fy, rot=fr, pads=pads))
    return t, nets, byname, fps

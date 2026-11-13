"""Raster DRC + connectivity for routed results. 0.05 mm raster."""
import os, sys, math, pickle, collections
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import numpy as np
from PIL import Image, ImageDraw
import model as M

R = 0.05


class Drc:
    def __init__(self, bd, res, gnd_vias=()):
        self.bd = bd
        self.W = int((bd.W * M.G) / R) + 2
        self.H = int((bd.H * M.G) / R) + 2
        self.lab = [np.zeros((self.H, self.W), np.int32) for _ in range(2)]
        self.ele = [np.zeros((self.H, self.W), np.int32) for _ in range(2)]
        self.meta = [None]        # element id -> (net id or None, kind, desc)
        self.par = [0]
        self.violations = []
        self.shorts = []
        self.res = res
        self.pad_e = {}
        self.gnd_vias = list(gnd_vias)

    def px(self, x, y): return ((x - self.bd.X0) / R, (y - self.bd.Y0) / R)

    def find(self, a):
        while self.par[a] != a:
            self.par[a] = self.par[self.par[a]]; a = self.par[a]
        return a

    def add(self, layers, netid, kind, desc, draw):
        """draw(ImageDraw, offset) fills ink=1 on a temp bbox image; layers: list of 0/1."""
        eid = len(self.meta); self.meta.append((netid, kind, desc)); self.par.append(eid)
        # bbox from draw function
        poly = draw  # (kind, params)
        bx0, by0, bx1, by1 = poly['bbox']
        i0, i1 = max(int(by0) - 2, 0), min(int(by1) + 3, self.H)
        j0, j1 = max(int(bx0) - 2, 0), min(int(bx1) + 3, self.W)
        img = Image.new('L', (j1 - j0, i1 - i0), 0)
        d = ImageDraw.Draw(img)
        poly['fn'](d, j0, i0)
        m = np.array(img) > 0
        lid = netid if netid is not None else 10000000 + eid
        for L in layers:
            sub_l = self.lab[L][i0:i1, j0:j1]
            sub_e = self.ele[L][i0:i1, j0:j1]
            ex = m & (sub_l != 0)
            if ex.any():
                others = np.unique(sub_e[ex])
                for o in others:
                    on = self.meta[o][0]
                    if on == netid and netid is not None:
                        self.par[self.find(o)] = self.find(eid)
                    elif on != netid or netid is None:
                        self.shorts.append((kind, desc, self.meta[o][1], self.meta[o][2], L))
            sub_l[m] = lid
            sub_e[m] = eid
        return eid

    def pad(self, q, netid):
        pts = []
        if q.circle:
            cx, cy = self.px(q.x, q.y); r = q.w / 2 / R
            bb = (cx - r, cy - r, cx + r, cy + r)
            fn = lambda d, j0, i0: d.ellipse([cx - r - j0, cy - r - i0, cx + r - j0, cy + r - i0], fill=1)
        else:
            a = math.radians(-q.rot); c, s = math.cos(a), math.sin(a)
            for sx, sy in ((-1, -1), (1, -1), (1, 1), (-1, 1)):
                lx, ly = sx * q.w / 2, sy * q.h / 2
                pts.append(self.px(q.x + lx * c - ly * s, q.y + lx * s + ly * c))
            bb = (min(p[0] for p in pts), min(p[1] for p in pts), max(p[0] for p in pts), max(p[1] for p in pts))
            fn = lambda d, j0, i0: d.polygon([(p[0] - j0, p[1] - i0) for p in pts], fill=1)
        layers = [0 if l == 'F' else 1 for l in q.layers]
        return self.add(layers, netid, 'pad', f'{q.ref}.{q.num}', dict(bbox=bb, fn=fn))

    def seg(self, L, x1, y1, x2, y2, w, netid, desc):
        a, b = self.px(x1, y1), self.px(x2, y2); wr = w / R
        r = wr / 2
        bb = (min(a[0], b[0]) - r, min(a[1], b[1]) - r, max(a[0], b[0]) + r, max(a[1], b[1]) + r)
        def fn(d, j0, i0):
            d.line([(a[0] - j0, a[1] - i0), (b[0] - j0, b[1] - i0)], fill=1, width=max(1, int(round(wr))))
            for p in (a, b): d.ellipse([p[0] - r - j0, p[1] - r - i0, p[0] + r - j0, p[1] + r - i0], fill=1)
        return self.add([L], netid, 'track', desc, dict(bbox=bb, fn=fn))

    def via(self, x, y, netid, desc):
        cx, cy = self.px(x, y); r = M.VIA_D / 2 / R
        bb = (cx - r, cy - r, cx + r, cy + r)
        fn = lambda d, j0, i0: d.ellipse([cx - r - j0, cy - r - i0, cx + r - j0, cy + r - i0], fill=1)
        return self.add([0, 1], netid, 'via', desc, dict(bbox=bb, fn=fn))

    def hole(self, q):
        cx, cy = self.px(q.x, q.y); r = (q.drill[0] / 2 + 0.05) / R
        bb = (cx - r, cy - r, cx + r, cy + r)
        fn = lambda d, j0, i0: d.ellipse([cx - r - j0, cy - r - i0, cx + r - j0, cy + r - i0], fill=1)
        return self.add([0, 1], None, 'npth', f'{q.ref}', dict(bbox=bb, fn=fn))

    def build(self):
        bd = self.bd
        for q in bd.pads:
            if q.npth: self.hole(q); continue
            nid = bd.nid.get(q.net) if q.net else None
            self.pad_e[q.idx] = self.pad(q, nid)
        for net, o in self.res.items():
            nid = bd.nid[net]
            for (L, x1, y1, x2, y2) in o['segs']: self.seg(L, x1, y1, x2, y2, o['w'], nid, net)
            for (x, y) in o['vias']: self.via(x, y, nid, net)
        for net, x, y in self.gnd_vias: self.via(x, y, bd.nid[net], net)

    def clearance(self, thr=0.2, hard=0.15):
        """report spots where different-net copper is closer than thr (raster: use hard to avoid grid noise)."""
        rp = int(math.ceil(thr / R))
        out = collections.Counter(); pts = []
        for L in (0, 1):
            lab = self.lab[L]
            for dy in range(0, rp + 1):
                for dx in range(-rp, rp + 1):
                    if dy == 0 and dx <= 0: continue
                    dist = math.hypot(dx, dy) * R
                    if dist >= hard: continue
                    a = lab[:self.H - dy, max(0, -dx):self.W - max(0, dx)]
                    b = lab[dy:, max(0, dx):self.W - max(0, -dx)]
                    v = (a != 0) & (b != 0) & (a != b)
                    if v.any():
                        ii, jj = np.nonzero(v)
                        for i, j in zip(ii[:50], jj[:50]):
                            pts.append((L, round(self.bd.X0 + (max(0, -dx) + j) * R, 2), round(self.bd.Y0 + i * R, 2),
                                        round(dist, 2), int(a[i, j]), int(b[i, j])))
        return pts

    def components(self):
        comp = collections.defaultdict(set)
        for e in range(1, len(self.meta)):
            comp[self.find(e)].add(e)
        return comp

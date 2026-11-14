"""Board model for routing: pads, holes, edge, grid obstacle arrays."""
import os, sys, math, re, collections
import numpy as np
from scipy import ndimage
from PIL import Image, ImageDraw
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
import pcbparse as P

PCB = os.environ.get('BIRDBOARD_PCB', 'birdboard.kicad_pcb')   # set by route_board.py
G = 0.1
TW = 0.25          # signal trace width
CLR = 0.2          # copper clearance
VIA_D, VIA_DRILL = 0.6, 0.3
EDGE_CLR = 0.5
SAFE = 0.05
PAD_INFL = CLR + TW / 2 + SAFE        # centreline keep-out around a pad
TRK_INFL = TW + CLR + SAFE            # centreline keep-out around a track (signal)
VIA_INFL = VIA_D / 2 + CLR + TW / 2 + SAFE


def load():
    t, nets, byname, fps = P.load(PCB)
    return t, nets, fps


def rot_local(dx, dy, r):
    c, s = math.cos(math.radians(r)), math.sin(math.radians(r))
    return dx * c - dy * s, dx * s + dy * c


class Pad:
    __slots__ = ('ref', 'fp', 'num', 'net', 'x', 'y', 'w', 'h', 'rot', 'circle', 'layers', 'tht', 'drill',
                 'npth', 'idx', 'cluster')

    def dist(self, X, Y):
        """distance (>=0 outside, 0 inside) from points to the pad copper outline."""
        dx, dy = X - self.x, Y - self.y
        if self.circle:
            return np.maximum(np.hypot(dx, dy) - self.w / 2, 0)
        lx, ly = rot_local(dx, dy, self.rot)
        return np.hypot(np.maximum(np.abs(lx) - self.w / 2, 0), np.maximum(np.abs(ly) - self.h / 2, 0))


def build_pads(nets, fps):
    pads = []
    for f in fps:
        for p in f['pads']:
            lay = set()
            for l in p['layers']:
                if l == 'F.Cu': lay.add('F')
                elif l == 'B.Cu': lay.add('B')
                elif l == '*.Cu': lay |= {'F', 'B'}
            q = Pad()
            q.ref, q.fp, q.num = f['ref'], f['name'], p['num']
            q.net = nets[p['net']]
            q.x, q.y, q.w, q.h, q.rot = p['x'], p['y'], p['w'], p['h'], p['rot']
            q.circle = p['shape'] == 'circle'
            q.layers = lay
            q.tht = p['type'] == 'thru_hole'
            q.npth = p['type'] == 'np_thru_hole'
            q.drill = p['drill']
            if not lay and not q.npth:
                continue
            q.idx = len(pads)
            pads.append(q)
    return pads


SEAM = 235.775


def drop_duplicates(pads):
    """Footprints stacked on one spot (a name/asym filter that matched mirrored and source points both): keep the one
    whose column/row nets fit the side (right half nets end in _r), drop the others."""
    groups = collections.defaultdict(dict)
    for q in pads:
        if q.fp.endswith(('switch_gateron_ks27_ks33', 'diode_tht_sod123')) and q.num == '1' and not q.tht and q.net:
            groups[(q.fp, round(q.x, 2), round(q.y, 2), tuple(sorted(q.layers)))][q.ref] = q
    drop = set()
    for key, refs in groups.items():
        if len(refs) < 2: continue
        right = key[1] > SEAM
        for ref, q in refs.items():
            if q.net.endswith('_r') != right: drop.add(ref)
    return drop


def fix_thumb_nets(pads):
    """thumb keys shared one colrow net; give each switch/diode pair its own (what the new config produces)."""
    for q in pads:
        if q.net in ('k_r', 'mirror_k_r_r') and q.fp in ('ceoloide:switch_gateron_ks27_ks33', 'ceoloide:diode_tht_sod123'):
            n = re.sub(r'\D', '', q.ref)
            q.net = f'{q.net}_{n}'


def edge_polys(t):
    segs = []
    for m in re.finditer(r'\(gr_line \(start ([-\d.e]+) ([-\d.e]+)\) \(end ([-\d.e]+) ([-\d.e]+)\) \(layer Edge.Cuts\)', t):
        a = [float(v) for v in m.groups()]
        segs.append([(a[0], a[1]), (a[2], a[3])])
    for m in re.finditer(r'\(gr_arc \(start ([-\d.e]+) ([-\d.e]+)\) \(mid ([-\d.e]+) ([-\d.e]+)\) \(end ([-\d.e]+) ([-\d.e]+)\) \(layer Edge.Cuts\)', t):
        x1, y1, xm, ym, x2, y2 = [float(v) for v in m.groups()]
        ax, ay, bx, by, cx, cy = x1, y1, xm, ym, x2, y2
        d = 2 * (ax * (by - cy) + bx * (cy - ay) + cx * (ay - by))
        ux = ((ax**2 + ay**2) * (by - cy) + (bx**2 + by**2) * (cy - ay) + (cx**2 + cy**2) * (ay - by)) / d
        uy = ((ax**2 + ay**2) * (cx - bx) + (bx**2 + by**2) * (ax - cx) + (cx**2 + cy**2) * (bx - ax)) / d
        r = math.hypot(ax - ux, ay - uy)
        a0, am, a1 = math.atan2(ay - uy, ax - ux), math.atan2(by - uy, bx - ux), math.atan2(cy - uy, cx - ux)
        def norm(a, ref):
            while a < ref: a += 2 * math.pi
            return a
        am_, a1_ = norm(am, a0), norm(a1, a0)
        if am_ < a1_:  # ccw sweep a0->a1
            sweep = a1_ - a0
        else:
            sweep = -(norm(a0, a1) - a1) if False else (a1_ - 2 * math.pi - a0)
        n = max(4, int(abs(sweep) * r / 0.2))
        pts = [(ux + r * math.cos(a0 + sweep * k / n), uy + r * math.sin(a0 + sweep * k / n)) for k in range(n + 1)]
        segs.append(pts)
    return segs


class Board:
    def __init__(self):
        self.t, self.nets_by_id, fps = load()
        global SEAM
        mv = re.search(r'\(footprint "custom:vscore_line"[^\n]*\n\s*\(at ([-\d.e]+)', self.t)
        if mv: SEAM = float(mv.group(1))
        self.pads = build_pads(self.nets_by_id, fps)
        self.dropped = drop_duplicates(self.pads)
        self.pads = [q for q in self.pads if q.ref not in self.dropped]
        fix_thumb_nets(self.pads)
        segs = edge_polys(self.t)
        xs = [p[0] for s in segs for p in s]; ys = [p[1] for s in segs for p in s]
        self.X0, self.Y0 = min(xs) - 2, min(ys) - 2
        self.W = int((max(xs) + 2 - self.X0) / G) + 1
        self.H = int((max(ys) + 2 - self.Y0) / G) + 1
        img = Image.new('L', (self.W, self.H), 0)
        dr = ImageDraw.Draw(img)
        for s in segs:
            pts = [((x - self.X0) / G, (y - self.Y0) / G) for x, y in s]
            dr.line(pts, fill=255, width=3)
        edge = np.array(img) > 0
        lab, n = ndimage.label(~edge)
        outside = set(np.unique(np.concatenate([lab[0], lab[-1], lab[:, 0], lab[:, -1]]))) - {0}
        self.inside = ~edge & ~np.isin(lab, list(outside))
        self.edge_d = ndimage.distance_transform_edt(self.inside) * G
        names = sorted({q.net for q in self.pads if q.net})
        self.nid = {n: i + 1 for i, n in enumerate(names)}
        self.own = [np.zeros((self.H, self.W), np.int16) for _ in range(2)]   # 0 free, k net, -1 hard
        self.pmask = [np.zeros((self.H, self.W), np.int16) for _ in range(2)]  # pad copper (net id, -1 none-net)
        self.tmask = np.zeros((self.H, self.W), np.int16)   # inside a plated through-hole pad (net id)
        self.stamp_static()

    def cell(self, x, y):
        return int(round((y - self.Y0) / G)), int(round((x - self.X0) / G))

    def xy(self, i, j):
        return self.X0 + j * G, self.Y0 + i * G

    def win(self, x, y, r):
        i0 = max(int((y - r - self.Y0) / G) - 1, 0); i1 = min(int((y + r - self.Y0) / G) + 2, self.H)
        j0 = max(int((x - r - self.X0) / G) - 1, 0); j1 = min(int((x + r - self.X0) / G) + 2, self.W)
        return i0, i1, j0, j1

    def grid_xy(self, i0, i1, j0, j1):
        I, J = np.mgrid[i0:i1, j0:j1]
        return self.X0 + J * G, self.Y0 + I * G

    def mark(self, L, i0, i1, j0, j1, m, n):
        sub = self.own[L][i0:i1, j0:j1]
        cur = sub[m]
        sub[m] = np.where(cur == 0, n, np.where(cur == n, n, -1))

    def stamp_static(self):
        for L in (0, 1):
            self.own[L][~self.inside] = -1
            self.own[L][self.edge_d < EDGE_CLR + TW / 2 + SAFE] = -1
        for q in self.pads:
            n = self.nid.get(q.net, -1) if q.net else -1
            if q.npth:
                r = (q.drill[0] / 2) + 0.25 + TW / 2 + SAFE
                i0, i1, j0, j1 = self.win(q.x, q.y, r + 0.1)
                X, Y = self.grid_xy(i0, i1, j0, j1)
                m = np.hypot(X - q.x, Y - q.y) <= r
                for L in (0, 1): self.mark(L, i0, i1, j0, j1, m, -1)
                continue
            R = max(q.w, q.h) / 2 + PAD_INFL + 0.1
            i0, i1, j0, j1 = self.win(q.x, q.y, R)
            X, Y = self.grid_xy(i0, i1, j0, j1)
            d = q.dist(X, Y)
            mk = d <= PAD_INFL
            cu = d <= 0
            for Lname in q.layers:
                L = 0 if Lname == 'F' else 1
                self.mark(L, i0, i1, j0, j1, mk, n)
                if n > 0:
                    sub = self.pmask[L][i0:i1, j0:j1]; sub[cu] = n
            if q.tht and n > 0:
                sub = self.tmask[i0:i1, j0:j1]; sub[cu] = n
        self.seam_block = None

    def block_seam(self, xseam, half=0.8):
        j0 = int((xseam - half - self.X0) / G); j1 = int((xseam + half - self.X0) / G) + 1
        for L in (0, 1): self.own[L][:, j0:j1] = -1

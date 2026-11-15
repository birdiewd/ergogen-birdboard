import os, sys, math, heapq, time, collections
import numpy as np
from scipy import ndimage
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import model as M
from model import G, TW, CLR, SAFE, VIA_D, VIA_DRILL, PAD_INFL, VIA_INFL

DIRS = [(0, 1), (1, 1), (1, 0), (1, -1), (0, -1), (-1, -1), (-1, 0), (-1, 1)]
STEP = [1.0 if (a == 0 or b == 0) else 1.414 for a, b in DIRS]
TURN = [0, 3, 8, 20, 40]
VIA_COST = 14.0
INF = 1e18


def is_switch(q): return q.fp.endswith(('switch_gateron_ks27_ks33', 'switch_gateron_hotswap'))
def is_diode(q): return q.fp.endswith('diode_tht_sod123')


def overlap(a, b, bd):
    if not (a.layers & b.layers): return False
    if math.hypot(a.x - b.x, a.y - b.y) > (max(a.w, a.h) + max(b.w, b.h)) / 2 + 0.01: return False
    i0, i1, j0, j1 = bd.win(a.x, a.y, max(a.w, a.h) / 2 + 0.2)
    X, Y = bd.grid_xy(i0, i1, j0, j1)
    return bool(np.any((a.dist(X, Y) <= 0) & (b.dist(X, Y) <= 0)))


class Cluster:
    def __init__(self, pads, net):
        self.pads, self.net = pads, net
        self.layers = set().union(*[p.layers for p in pads])
        self.essential = any((not (is_switch(p) or is_diode(p))) or (is_diode(p) and p.tht) or (is_switch(p) and not p.tht)
                             for p in pads)
        c = sorted(pads, key=lambda p: (not p.tht, -max(p.w, p.h)))[0]
        self.cx, self.cy, self.cpad = c.x, c.y, c
        self.cells = None


def make_clusters(bd, net):
    pads = [q for q in bd.pads if q.net == net and q.layers]
    par = list(range(len(pads)))
    def f(x):
        while par[x] != x: par[x] = par[par[x]]; x = par[x]
        return x
    for a in range(len(pads)):
        for b in range(a + 1, len(pads)):
            if overlap(pads[a], pads[b], bd): par[f(a)] = f(b)
    groups = collections.defaultdict(list)
    for k, p in enumerate(pads): groups[f(k)].append(p)
    return [Cluster(v, net) for v in groups.values()]


def pad_cells(bd, p):
    """(layer, i, j) copper cells of a pad."""
    i0, i1, j0, j1 = bd.win(p.x, p.y, max(p.w, p.h) / 2 + 0.2)
    X, Y = bd.grid_xy(i0, i1, j0, j1)
    m = p.dist(X, Y) <= 0
    ii, jj = np.nonzero(m)
    out = []
    for Ln in p.layers:
        L = 0 if Ln == 'F' else 1
        out += [(L, int(i0 + a), int(j0 + b)) for a, b in zip(ii, jj)]
    return out


class Router:
    def __init__(self):
        self.bd = M.Board()
        self.bd.block_seam(M.SEAM)
        self.res = {}        # net -> dict(segs=[], vias=[], failed=[])
        self.log = []

    # ---- search ----
    def search(self, n, w, srcs, target, tlayers, win):
        bd = self.bd
        i0, i1, j0, j1 = win
        h, ww = i1 - i0, j1 - j0
        blk = []
        for L in (0, 1):
            o = bd.own[L][i0:i1, j0:j1]
            b = (o != 0) & (o != n)
            if w > TW + 1e-9:
                r = int(math.ceil((w - TW) / 2 / G))
                st = ndimage.generate_binary_structure(2, 1)
                b = ndimage.binary_dilation(b, structure=ndimage.iterate_structure(st, r))
            blk.append(b)
        free2 = ~blk[0] & ~blk[1]
        # via legality: both layers free in a radius, away from every pad copper, and from the board edge
        er = ndimage.binary_erosion(free2, structure=ndimage.iterate_structure(ndimage.generate_binary_structure(2, 1), 2),
                                    border_value=0)
        padany = (bd.pmask[0][i0:i1, j0:j1] != 0) | (bd.pmask[1][i0:i1, j0:j1] != 0)
        padown = bd.tmask[i0:i1, j0:j1] == n
        pad_near = ndimage.binary_dilation(padany & ~padown, structure=ndimage.iterate_structure(ndimage.generate_binary_structure(2, 1), 3))
        # via inside a through-hole pad of this net is fine and free
        viaok = er & ~pad_near & ~padany & (bd.edge_d[i0:i1, j0:j1] >= 0.9)
        viaok = viaok | (padown & free2)
        free_tht = padown
        b0, b1 = blk[0].ravel().tolist(), blk[1].ravel().tolist()
        B = (b0, b1)
        viaok = viaok.ravel().tolist()
        thtok = free_tht.ravel().tolist()
        ti, tj = target[0] - i0, target[1] - j0
        def hf(i, j):
            di, dj = abs(i - ti), abs(j - tj)
            return (di + dj) - 0.586 * min(di, dj)
        g = {}
        heap = []
        par = {}
        for (L, i, j) in srcs:
            i -= i0; j -= j0
            if not (0 <= i < h and 0 <= j < ww): continue
            s = ((L * h + i) * ww + j) * 9 + 8
            if s in g: continue
            g[s] = 0.0
            heap.append((hf(i, j) * 1.15, 0.0, s))
        heapq.heapify(heap)
        hw = h * ww
        wgt = 1.15
        goal = None
        pops = 0
        while heap:
            f, gc, s = heapq.heappop(heap)
            if gc > g.get(s, INF): continue
            pops += 1
            d = s % 9; idx = s // 9
            j = idx % ww; i = (idx // ww) % h; L = idx // hw
            if i == ti and j == tj and L in tlayers:
                goal = s; break
            bl = B[L]
            cell = i * ww + j
            for nd in range(8):
                di, dj = DIRS[nd]
                ni, nj = i + di, j + dj
                if ni < 0 or nj < 0 or ni >= h or nj >= ww: continue
                nc = ni * ww + nj
                if bl[nc]: continue
                if nd & 1:
                    if bl[i * ww + nj] or bl[ni * ww + j]: continue
                c = STEP[nd]
                if d != 8:
                    k = abs(d - nd); k = min(k, 8 - k)
                    c += TURN[k]
                if L == 0 and (nd == 0 or nd == 4): c += 0.15
                elif L == 1 and (nd == 2 or nd == 6): c += 0.15
                ng = gc + c
                ns = ((L * h + ni) * ww + nj) * 9 + nd
                if ng < g.get(ns, INF):
                    g[ns] = ng; par[ns] = s
                    heapq.heappush(heap, (ng + hf(ni, nj) * wgt, ng, ns))
            if viaok[cell] and not B[1 - L][cell]:
                ng = gc + (2.0 if thtok[cell] else VIA_COST)
                ns = (((1 - L) * h + i) * ww + j) * 9 + 8
                if ng < g.get(ns, INF):
                    g[ns] = ng; par[ns] = s
                    heapq.heappush(heap, (ng + hf(i, j) * wgt, ng, ns))
        if goal is None: return None, pops
        path = []
        s = goal
        while True:
            idx = s // 9
            j = idx % ww; i = (idx // ww) % h; L = idx // hw
            path.append((L, i + i0, j + j0))
            if s not in par: break
            s = par[s]
        path.reverse()
        return path, pops

    # ---- bookkeeping ----
    def stamp_path(self, n, w, path):
        bd = self.bd
        R = w / 2 + CLR + TW / 2 + SAFE
        rc = int(math.ceil(R / G)) + 2
        for L in (0, 1):
            cells = [(i, j) for (l, i, j) in path if l == L]
            if not cells: continue
            ii = [c[0] for c in cells]; jj = [c[1] for c in cells]
            i0, i1 = max(min(ii) - rc, 0), min(max(ii) + rc + 1, bd.H)
            j0, j1 = max(min(jj) - rc, 0), min(max(jj) + rc + 1, bd.W)
            m = np.zeros((i1 - i0, j1 - j0), bool)
            for i, j in cells: m[i - i0, j - j0] = True
            d = ndimage.distance_transform_edt(~m) * G
            bd.mark(L, i0, i1, j0, j1, d <= R, n)
        # vias
        for a, b in zip(path, path[1:]):
            if a[0] != b[0]:
                x, y = bd.xy(a[1], a[2])
                i0, i1, j0, j1 = bd.win(x, y, VIA_INFL + 0.2)
                X, Y = bd.grid_xy(i0, i1, j0, j1)
                m = np.hypot(X - x, Y - y) <= VIA_INFL
                for L in (0, 1): bd.mark(L, i0, i1, j0, j1, m, n)

    def to_geometry(self, path, n=None):
        bd = self.bd
        segs, vias = [], []
        if len(path) == 1: return segs, vias
        run_start = path[0]; prev = path[0]; pdir = None
        def emit(a, b):
            if a[:3] == b[:3]: return
            x1, y1 = bd.xy(a[1], a[2]); x2, y2 = bd.xy(b[1], b[2])
            segs.append((a[0], x1, y1, x2, y2))
        for cur in path[1:]:
            if cur[0] != prev[0]:
                emit(run_start, prev)
                if not (n is not None and bd.tmask[prev[1], prev[2]] == n):
                    vias.append(bd.xy(prev[1], prev[2]))
                run_start = cur; pdir = None
            else:
                d = (cur[1] - prev[1], cur[2] - prev[2])
                if pdir is not None and d != pdir:
                    emit(run_start, prev); run_start = prev
                pdir = d
            prev = cur
        emit(run_start, prev)
        return segs, vias

    # ---- net routing ----
    def route_net(self, net, w=TW, half=None):
        bd = self.bd
        n = bd.nid[net]
        cls = make_clusters(bd, net)
        if half is not None:
            cls = [c for c in cls if (c.cx < M.SEAM) == half]
        ess = [c for c in cls if c.essential]
        opt = [c for c in cls if not c.essential]
        out = self.res.setdefault(net, dict(segs=[], vias=[], failed=[], w=w))
        if len(ess) + len(opt) < 2: return True
        for c in cls:
            c.cells = [x for p in c.pads for x in pad_cells(bd, p)]
        todo = ess[:]
        if not todo: todo = opt[:]
        first = min(todo, key=lambda c: c.cx)
        done = [first]
        todo.remove(first)
        copper = list(first.cells)
        ok = True
        queue = todo + opt if todo is not opt else opt
        queue = [c for c in queue if c is not first]
        while queue:
            def dd(c): return min(math.hypot(c.cx - d.cx, c.cy - d.cy) for d in done)
            essq = [c for c in queue if c.essential]
            pool = essq if essq else queue
            c = min(pool, key=dd)
            queue.remove(c)
            # target: centre cell of centre pad on its layers
            tp = c.cpad
            tcell = bd.cell(tp.x, tp.y)
            tl = {0 if l == 'F' else 1 for l in tp.layers}
            xs = [bd.xy(i, j)[0] for (_, i, j) in copper[::7]] + [tp.x]
            ys = [bd.xy(i, j)[1] for (_, i, j) in copper[::7]] + [tp.y]
            found = None
            for margin in (6, 14, 40, 400):
                i0, j0 = bd.cell(min(xs) - margin, min(ys) - margin)
                i1, j1 = bd.cell(max(xs) + margin, max(ys) + margin)
                win = (max(i0, 0), min(i1 + 1, bd.H), max(j0, 0), min(j1 + 1, bd.W))
                # thin the sources: pads fully, tracks every 2nd cell
                path, pops = self.search(n, w, copper, tcell, tl, win)
                if path: found = path; break
            if not found:
                out['failed'].append((c.cx, c.cy, c.essential))
                ok = ok and not c.essential
                continue
            path = found
            bd_path = path
            self.stamp_path(n, w, bd_path)
            segs, vias = self.to_geometry(bd_path, n)
            # connect the last cell to the exact pad centre
            lc = bd_path[-1]
            lx, ly = bd.xy(lc[1], lc[2])
            if math.hypot(lx - tp.x, ly - tp.y) > 1e-3:
                segs.append((lc[0], lx, ly, tp.x, tp.y))
            out['segs'] += segs; out['vias'] += vias
            copper += [(l, i, j) for (l, i, j) in bd_path] + list(c.cells)
            done.append(c)
        return ok

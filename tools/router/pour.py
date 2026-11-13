import os, sys,pickle,math,collections;sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import numpy as np
from scipy import ndimage
import model as M, drc

def disk(rpx):
    y,x=np.ogrid[-rpx:rpx+1,-rpx:rpx+1]; return x*x+y*y<=rpx*rpx

def analyse(res, extra_vias=()):
    bd=M.Board(); bd.block_seam(M.SEAM)
    d=drc.Drc(bd,res,extra_vias); d.build()
    R=drc.R
    ed=np.kron(bd.edge_d,np.ones((2,2)))[:d.H,:d.W]
    ed=np.pad(ed,((0,d.H-ed.shape[0]),(0,d.W-ed.shape[1])))
    X=bd.X0+np.arange(d.W)*R
    out={}
    for gname,left in (('GND',True),('GND_r',False)):
        gid=bd.nid[gname]
        reg=np.zeros((d.H,d.W),bool)
        if left: reg[:,X<M.SEAM-0.7]=True
        else: reg[:,X>M.SEAM+0.7]=True
        fills=[];labs=[]
        for L in (0,1):
            lab=d.lab[L]
            other=(lab!=0)&(lab!=gid)
            dist=ndimage.distance_transform_edt(~other)*R
            allowed=(ed>=0.55)&reg&(dist>=0.25)
            allowed=ndimage.binary_opening(allowed,structure=disk(3))
            l,n=ndimage.label(allowed)
            fills.append(allowed);labs.append((l,n))
        out[gname]=(gid,fills,labs,left)
    return bd,d,out

def gnd_connect(bd,d,out,gname,pitch=22.0):
    gid,fills,labs,left=out[gname]
    R=drc.R
    # nodes: (L,comp)
    par={}
    def f(a):
        par.setdefault(a,a)
        while par[a]!=a: par[a]=par[par[a]]; a=par[a]
        return a
    def u(a,b): par[f(a)]=f(b)
    pads=[q for q in bd.pads if q.net==gname and not q.npth]
    padnodes=[]
    for q in pads:
        e=d.pad_e[q.idx]
        cx,cy=d.px(q.x,q.y)
        r=int(max(q.w,q.h)/2/R)+8
        i0,i1=max(int(cy)-r,0),min(int(cy)+r+1,d.H); j0,j1=max(int(cx)-r,0),min(int(cx)+r+1,d.W)
        nodes=[]
        for Ln in q.layers:
            L=0 if Ln=='F' else 1
            padm=(d.ele[L][i0:i1,j0:j1]==e)
            near=ndimage.binary_dilation(padm,structure=disk(7))
            comps=np.unique(labs[L][0][i0:i1,j0:j1][near&fills[L][i0:i1,j0:j1]])
            comps=[c for c in comps if c>0]
            # take the biggest touching component
            if comps:
                sizes=[(labs[L][0]==c).sum() if False else (labs[L][0][i0:i1,j0:j1]==c).sum() for c in comps]
                nodes.append((L,comps[int(np.argmax(sizes))]))
        padnodes.append((q,nodes))
        for a in nodes[1:]: u(nodes[0],a)   # THT pad joins its layers
    unattached=[q.ref+'.'+q.num for q,n in padnodes if not n]
    # existing vias of this net (track vias)
    nid=gid
    for net,o in d.res.items():
        pass
    # candidates
    both=fills[0]&fills[1]
    er=ndimage.binary_erosion(both,structure=disk(7))
    ii,jj=np.nonzero(er)
    edges=collections.defaultdict(list)
    step=int(0.5/R)
    sel=(ii%step==0)&(jj%step==0)
    for i,j in zip(ii[sel],jj[sel]):
        a=(0,int(labs[0][0][i,j]));b=(1,int(labs[1][0][i,j]))
        if a[1]>0 and b[1]>0: edges[(a,b)].append((i,j))
    adj=collections.defaultdict(list)
    for (a,b),cells in edges.items():
        adj[a].append((b,cells));adj[b].append((a,cells))
    added=[]
    def groupnodes():
        g=collections.defaultdict(set)
        for q,nodes in padnodes:
            for n in nodes: g[f(n)].add(q.ref+'.'+q.num)
        return g
    # BFS to join groups
    for _ in range(40):
        roots={f(n) for q,nodes in padnodes for n in nodes}
        if len(roots)<=1: break
        # group-level BFS from first root
        start=sorted(roots,key=str)[0]
        from collections import deque
        # build group adjacency using candidate edges
        node_group=lambda n:f(n)
        dq=deque([(start,[])]);seen={start};found=None
        # expand all nodes in start group
        members=collections.defaultdict(list)
        for n in list(par): members[f(n)].append(n)
        while dq and not found:
            g,path=dq.popleft()
            for n in members[g]:
                for (m,cells) in adj.get(n,[]):
                    gm=f(m)
                    if gm in seen: continue
                    seen.add(gm)
                    p2=path+[(n,m,cells)]
                    if gm in roots and gm!=start: found=p2;break
                    dq.append((gm,p2))
                if found: break
        if not found: print('cannot connect',gname,len(roots));break
        for n,m,cells in found:
            i,j=cells[len(cells)//2]
            x,y=bd.X0+j*R,bd.Y0+i*R
            added.append((gname,round(x,3),round(y,3)));u(n,m)
    # sparse stitching grid
    stitch=[]
    last=[]
    for (a,b),cells in sorted(edges.items(),key=lambda kv:-len(kv[1])):
        for (i,j) in cells[::max(1,len(cells)//4)]:
            x,y=bd.X0+j*R,bd.Y0+i*R
            if all(math.hypot(x-px,y-py)>pitch for px,py in [(v[1],v[2]) for v in added+stitch]):
                stitch.append((gname,round(x,3),round(y,3)))
    roots={f(n) for q,nodes in padnodes for n in nodes}
    return dict(unattached=unattached,groups=len(roots),added=added,stitch=stitch,padn=len(padnodes))


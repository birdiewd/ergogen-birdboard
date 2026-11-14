import os,sys,re,pickle,uuid,collections;sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
import pcbparse as P, model as M

def build(src,out,res,gv):
    t=open(src).read()
    bd=M.Board()          # uses M.PCB; gives dropped refs + final nets
    dropped=bd.dropped
    # 1. remove dropped footprints (reverse order)
    blocks=P.blocks(t,'footprint')
    def ref_of(b): 
        m=re.search(r'\(property "Reference" "([^"]*)"',t[b[0]:b[1]]); return m.group(1) if m else None
    for b in reversed(blocks):
        if ref_of(b) in dropped: t=t[:b[0]]+t[b[1]:].lstrip('\n') if False else t[:b[0]]+t[b[1]:]
    # 2. thumb net renames
    head=t[:t.find('(footprint ')]
    nets={int(a):b for a,b in re.findall(r'\(net (\d+) "([^"]*)"\)',head)}
    byname={v:k for k,v in nets.items()}
    nxt=max(nets)+1
    new_decl=[]
    def nid(name):
        nonlocal nxt
        if name not in byname:
            byname[name]=nxt; new_decl.append(f'(net {nxt} "{name}")'); nxt+=1
        return byname[name]
    blocks=P.blocks(t,'footprint')
    for b in reversed(blocks):
        txt=t[b[0]:b[1]]
        ref=ref_of(b)
        if not re.fullmatch(r'[SD]\d+',ref or ''): continue
        n=re.sub(r'\D','',ref)
        for old in ('k_r','mirror_k_r_r'):
            if old in byname and f'(net {byname[old]} "{old}")' in txt:
                new=f'{old}_{n}'
                txt=txt.replace(f'(net {byname[old]} "{old}")',f'(net {nid(new)} "{new}")')
        t=t[:b[0]]+txt+t[b[1]:]
    gv=[(n,float(x),float(y)) for n,x,y in gv]
    for n in res: nid(n)
    # insert new declarations after the last header net line
    last=list(re.finditer(r'\(net \d+ "[^"]*"\)',t[:t.find('(footprint ')]))[-1]
    t=t[:last.end()]+''.join('\n'+d for d in new_decl)+t[last.end():]
    # 3. tracks, vias, zones
    L=lambda l:'F.Cu' if l==0 else 'B.Cu'
    add=[]
    u=lambda:str(uuid.uuid4())
    for net,o in sorted(res.items()):
        n=byname[net]
        for (l,x1,y1,x2,y2) in o['segs']:
            add.append(f'  (segment (start {x1:.4f} {y1:.4f}) (end {x2:.4f} {y2:.4f}) (width {o["w"]}) (layer "{L(l)}") (net {n}) (uuid "{u()}"))')
        for (x,y) in o['vias']:
            add.append(f'  (via (at {x:.4f} {y:.4f}) (size {M.VIA_D}) (drill {M.VIA_DRILL}) (layers "F.Cu" "B.Cu") (net {n}) (uuid "{u()}"))')
    for net,x,y in gv:
        add.append(f'  (via (at {x:.4f} {y:.4f}) (size {M.VIA_D}) (drill {M.VIA_DRILL}) (layers "F.Cu" "B.Cu") (net {byname[net]}) (uuid "{u()}"))')
    xs=[bd.X0,bd.X0+bd.W*M.G];ys=[bd.Y0,bd.Y0+bd.H*M.G]
    seam=M.SEAM
    for net,(x0,x1) in (('GND',(xs[0],seam-0.7)),('GND_r',(seam+0.7,xs[1]))):
        for l in (0,1):
            pts=f'(xy {x0:.3f} {ys[0]:.3f}) (xy {x1:.3f} {ys[0]:.3f}) (xy {x1:.3f} {ys[1]:.3f}) (xy {x0:.3f} {ys[1]:.3f})'
            add.append(f'  (zone (net {byname[net]}) (net_name "{net}") (layer "{L(l)}") (uuid "{u()}") (hatch edge 0.5)\n'
                       f'    (connect_pads (clearance 0.2))\n    (min_thickness 0.25) (filled_areas_thickness no)\n'
                       f'    (fill yes (thermal_gap 0.3) (thermal_bridge_width 0.3))\n    (polygon (pts {pts})))')
    t=t.rstrip()
    assert t.endswith(')')
    t=t[:-1].rstrip()+'\n'+'\n'.join(add)+'\n)\n'
    open(out,'w').write(t)
    print('wrote',out,len(t),'new nets',new_decl)

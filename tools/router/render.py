import os, sys,pickle;sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import numpy as np, model as M
from PIL import Image, ImageDraw
def render(res,out,box,scale=8):
    b=M.Board()
    x0,y0,x1,y1=box
    W=int((x1-x0)*scale);H=int((y1-y0)*scale)
    img=Image.new('RGB',(W,H),(25,25,25));d=ImageDraw.Draw(img,'RGBA')
    P=lambda x,y:((x-x0)*scale,(y-y0)*scale)
    # board interior
    ins=b.inside[int((y0-b.Y0)/M.G):int((y1-b.Y0)/M.G),int((x0-b.X0)/M.G):int((x1-b.X0)/M.G)]
    m=Image.fromarray((ins*45).astype(np.uint8)).resize((W,H));img.paste(Image.merge('RGB',(m,m,m)),(0,0))
    d=ImageDraw.Draw(img,'RGBA')
    def pads(layer):
        for q in b.pads:
            if layer not in q.layers: continue
            col=(220,60,60,170) if layer=='F' else (60,110,230,170)
            if q.circle: 
                cx,cy=P(q.x,q.y);r=q.w/2*scale;d.ellipse([cx-r,cy-r,cx+r,cy+r],fill=col)
            else:
                import math
                a=math.radians(-q.rot);c,s=math.cos(a),math.sin(a)
                pts=[]
                for sx,sy in ((-1,-1),(1,-1),(1,1),(-1,1)):
                    lx,ly=sx*q.w/2,sy*q.h/2
                    pts.append(P(q.x+lx*c-ly*s,q.y+lx*s+ly*c))
                d.polygon(pts,fill=col)
    for layer,col in (('B',(70,120,255,210)),('F',(255,70,70,210))):
        pads(layer)
        for n,o in res.items():
            for (L,xa,ya,xb,yb) in o['segs']:
                if (L==0)==(layer=='F'):
                    d.line([P(xa,ya),P(xb,yb)],fill=col,width=max(2,int(o['w']*scale)))
    for n,o in res.items():
        for (x,y) in o['vias']:
            cx,cy=P(x,y);r=0.3*scale;d.ellipse([cx-r,cy-r,cx+r,cy+r],fill=(240,240,80,255))
    img.save(out)

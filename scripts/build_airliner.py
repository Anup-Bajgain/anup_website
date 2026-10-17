"""Build an original, display-oriented twin-engine airliner as a binary STL.
Coordinates: metres; +X nose, +Y starboard, +Z up. Not a manufacturing model.
Material ranges live in JSON because standard STL carries geometry only.
"""
import json, math, struct
from pathlib import Path
from collections import defaultdict

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'models' / 'airliner'
OUT.mkdir(parents=True, exist_ok=True)
parts = defaultdict(list)

def tri(a,b,c,mat='airframe'):
    u=[b[i]-a[i] for i in range(3)]; v=[c[i]-a[i] for i in range(3)]
    n=[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]]
    length=math.sqrt(sum(x*x for x in n))
    if length < 1e-10: return
    parts[mat].append((tuple(x/length for x in n),a,b,c))

def quad(a,b,c,d,mat='airframe'):
    tri(a,b,c,mat);tri(a,c,d,mat)

def loft(rings,mat='airframe',cap=True):
    for a,b in zip(rings,rings[1:]):
        for j in range(len(a)):
            k=(j+1)%len(a);quad(a[j],a[k],b[k],b[j],mat)
    if cap:
        for ring,reverse in [(rings[0],True),(rings[-1],False)]:
            center=tuple(sum(p[k] for p in ring)/len(ring) for k in range(3))
            for j in range(len(ring)):
                a,b=ring[j],ring[(j+1)%len(ring)]
                tri(center,b,a,mat) if reverse else tri(center,a,b,mat)

# Smooth forebody profiles: independent width, height and centreline give
# the cockpit a sloping brow and the radome a rounded, slightly lower tip.
# Interpolate squared radii so the surface closes roundly at the nose pole.
nose_sections=[
    (12.0,1.95,0.0,1.95),
    (14.0,1.92,-.015,1.92),
    (15.5,1.77,-.06,1.80),
    (16.5,1.53,-.16,1.54),
    (17.5,1.18,-.28,1.10),
    (18.3,.82,-.38,.65),
    (18.8,.40,-.43,.31),
    (18.95,0.0,-.44,0.0),
]

def monotone_profile(column, squared=False):
    xs=[s[0] for s in nose_sections]
    ys=[s[column]**2 if squared else s[column] for s in nose_sections]
    widths=[b-a for a,b in zip(xs,xs[1:])]
    slopes=[(b-a)/h for a,b,h in zip(ys,ys[1:],widths)]
    tangents=[0.0]
    for i in range(1,len(xs)-1):
        before,after=slopes[i-1],slopes[i]
        if before*after<=0:
            tangents.append(0.0)
        else:
            w1=2*widths[i]+widths[i-1];w2=widths[i]+2*widths[i-1]
            tangents.append((w1+w2)/(w1/before+w2/after))
    tangents.append(slopes[-1])
    def sample(x):
        i=next((i for i in range(len(xs)-1) if x<=xs[i+1]),len(xs)-2)
        t=max(0,min(1,(x-xs[i])/widths[i]));h=widths[i]
        value=(2*t**3-3*t*t+1)*ys[i]+(t**3-2*t*t+t)*h*tangents[i]+(-2*t**3+3*t*t)*ys[i+1]+(t**3-t*t)*h*tangents[i+1]
        return math.sqrt(max(0,value)) if squared else value
    return sample

nose_width=monotone_profile(1,True)
nose_center=monotone_profile(2)
nose_height=monotone_profile(3,True)
sections=[(-21,.06,.8),(-19,.45,.62),(-16,1.1,.32),(-12,1.7,.08),(-8,1.95,0),(12,1.95,0)]
rings=[]
for a,b in zip(sections,sections[1:]):
    for step in range(max(3,round((b[0]-a[0])*3))):
        count=max(3,round((b[0]-a[0])*3));t=step/count;s=(1-math.cos(t*math.pi))/2
        x=a[0]+(b[0]-a[0])*t;r=a[1]+(b[1]-a[1])*s;z=a[2]+(b[2]-a[2])*s
        rings.append([(x,r*math.cos(j*math.tau/64),z+r*math.sin(j*math.tau/64)) for j in range(64)])
for step in range(97):
    x=12+6.95*math.sin(step*math.pi/192)
    width=nose_width(x);height=nose_height(x);center=nose_center(x)
    rings.append([(x,width*math.cos(j*math.tau/64),center+height*math.sin(j*math.tau/64)) for j in range(64)])
loft(rings)

# Closed airfoil section: rounded leading edge, tapered trailing edge.
def foil(lead,chord,span,z,thickness,vertical=False,side=1,camber_ratio=.014,incidence=0):
    ring=[]
    for sign,indices in [(1,range(33)),(-1,range(31,0,-1))]:
        for i in indices:
            t=(1-math.cos(math.pi*i/32))/2
            h=5*thickness*chord*(.2969*math.sqrt(t)-.126*t-.3516*t*t+.2843*t**3-.1036*t**4)
            camber=camber_ratio*chord*math.sin(math.pi*t)+math.tan(math.radians(incidence))*chord*(.25-t)
            p=(lead-chord*t, side*span, z+camber+sign*h)
            if vertical:p=(lead-chord*t,sign*h,span)
            ring.append(p)
    return ring
tail_spec={'root_span':0.0,'tip_span':6.6,'root_lead':-13.8,'sweep':3.6,
           'root_chord':4.8,'tip_chord':1.5,'root_z':.58,'tip_z':1.18,
           'thickness':.09,'incidence':-1.2}
for side in [-1,1]:
    wing=[]
    for i in range(19):
        t=i/18; span=1.35+16.3*t
        wing.append(foil(4.1-11.2*t,7.4-5.9*t,span,-.65+1.2*t,.115-.035*t,side=side))
    wing += [foil(-7.6,1.25,18.05,1.45,.075,side=side),foil(-8.3,.7,18.35,2.7,.07,side=side)]
    loft(wing)
    # A continuous root intersects the aft fuselage. Both halves share a
    # symmetric section, shallow dihedral, and the same modest incidence.
    tail=[]
    for i in range(17):
        t=i/16
        tail.append(foil(tail_spec['root_lead']-tail_spec['sweep']*t,
                         tail_spec['root_chord']+(tail_spec['tip_chord']-tail_spec['root_chord'])*t,
                         tail_spec['tip_span']*t,
                         tail_spec['root_z']+(tail_spec['tip_z']-tail_spec['root_z'])*t,
                         tail_spec['thickness'],side=side,camber_ratio=0,
                         incidence=tail_spec['incidence']))
    loft(tail)
loft([foil(-12.7-6*t,6.3-3.8*t,.9+6.7*t,0,.095,vertical=True) for t in [i/16 for i in range(17)]])

# Hollow nacelles with intake lips, dark inner ducts and visible fan blades.
for side in [-1,1]:
    yc=side*6.2;zc=-2.45
    def circle(x,r):return [(x,yc+r*math.cos(j*math.tau/48),zc+r*math.sin(j*math.tau/48)) for j in range(48)]
    engine=[(4.6,.99),(4.45,1.12),(4.1,1.2),(3.2,1.24),(1,1.18),(-1,1.02),(-1.8,.75)]
    loft([circle(x,r) for x,r in engine],cap=False)
    loft([circle(4.6,.99),circle(4.42,.85),circle(3.8,.83)],'rim',False)
    loft([circle(3.8,.83),circle(2.8,.73)],'intake',False)
    loft([circle(2.8,.73),circle(2.79,.01)],'intake')
    for j in range(24):
        a=j*math.tau/24
        def fan(r,angle,x=2.91):return (x,yc+r*math.cos(angle),zc+r*math.sin(angle))
        quad(fan(.16,a),fan(.71,a+.17),fan(.71,a+.26),fan(.16,a+.1),'fan')
    loft([circle(2.93,.18),circle(3.28,.03)],'rim')
    loft([circle(-1.8,.75),circle(-2.25,.54)],'intake')
    # Engine pylon, between nacelle and wing.
    p=[(2,yc-.17,-1.6),(-1.8,yc-.17,-1.5),(-1.8,yc-.17,-.2),(1,yc-.17,-.3)]
    q=[(x,yc+.17,z) for x,_,z in p]
    for i in range(4):quad(p[i],q[i],q[(i+1)%4],p[(i+1)%4])
    quad(*p);quad(*q)

# Small cabin window patches follow the round fuselage surface.
for side in [-1,1]:
    for k in range(30):
        x=-9+k*.72;angle=.23
        points=[]
        for j in range(12):
            a=j*math.tau/12;xx=x+.14*math.cos(a);theta=angle+.105*math.sin(a)
            points.append((xx,side*1.962*math.cos(theta),1.962*math.sin(theta)))
        center=(x,side*1.962*math.cos(angle),1.962*math.sin(angle))
        for j in range(12):tri(center,points[j],points[(j+1)%12],'glass')
    # A330-inspired six-pane glazing follows the sloping cockpit brow.
    # Front panes are taller and face forward; the smaller side panes sweep aft.
    def cockpit(x,y):
        width=nose_width(x)
        assert y<width, 'Cockpit pane must remain on the forebody'
        z=nose_center(x)+nose_height(x)*math.sqrt(1-(y/width)**2)
        return (x,side*y,z+.018)
    panes=[
        [(17.45,.045),(17.0,.90),(16.15,1.0),(16.45,.045)],
        [(16.88,.97),(16.25,1.35),(15.5,1.43),(16.04,1.08)],
        [(16.12,1.40),(15.5,1.62),(14.95,1.65),(15.38,1.49)],
    ]
    for corners in panes:
        def pane(u,v):
            a,b,c,d=corners
            xy=[(1-v)*((1-u)*a[k]+u*b[k])+v*((1-u)*d[k]+u*c[k]) for k in range(2)]
            return cockpit(*xy)
        for i in range(12):
            for j in range(8):
                u=i/12;v=j/8
                quad(pane(u,v),pane(u+1/12,v),pane(u+1/12,v+1/8),pane(u,v+1/8),'glass')

manifest={'description':'Original generic twin-engine narrow-body airliner; display mesh, not an exact aircraft or printable solid.','units':'metres','surfaces':{'horizontal_tail':tail_spec},'groups':[]}
triangles=[]
for material,items in parts.items():
    manifest['groups'].append({'material':material,'start':len(triangles)*3,'count':len(items)*3})
    triangles.extend(items)
with (OUT/'airliner.stl').open('wb') as f:
    f.write(b'Anup Bajgain - original display airliner'.ljust(80,b' '));f.write(struct.pack('<I',len(triangles)))
    for n,a,b,c in triangles:f.write(struct.pack('<12fH',*(n+a+b+c),0))
(OUT/'materials.json').write_text(json.dumps(manifest,indent=2)+'\n')
print(f'Wrote {len(triangles):,} triangles, {(OUT/"airliner.stl").stat().st_size:,} bytes')

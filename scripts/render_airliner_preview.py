"""Render the exported STL to the static WebGL fallback image."""
from pathlib import Path
import json, struct
import numpy as np
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from mpl_toolkits.mplot3d.art3d import Poly3DCollection
root=Path(__file__).resolve().parents[1]/'models'/'airliner'
data=(root/'airliner.stl').read_bytes();count=struct.unpack_from('<I',data,80)[0]
assert len(data)==84+50*count
rows=np.frombuffer(data,dtype=np.dtype([('normal','<f4',(3,)),('vertices','<f4',(3,3)),('attr','<u2')]),offset=84)
vertices=rows['vertices'];assert np.isfinite(vertices).all()
assert (np.linalg.norm(np.cross(vertices[:,1]-vertices[:,0],vertices[:,2]-vertices[:,0]),axis=1)>0).all()
manifest=json.loads((root/'materials.json').read_text());assert sum(g['count'] for g in manifest['groups'])==count*3
fig=plt.figure(figsize=(10,9),dpi=130);fig.patch.set_alpha(0)
ax=fig.add_subplot(111,projection='3d');ax.set_facecolor('none');ax.set_axis_off()
colors={'airframe':np.array([.79,.85,.9]),'rim':np.array([.55,.65,.73]),'intake':np.array([.045,.08,.12]),'fan':np.array([.3,.4,.5]),'glass':np.array([.04,.13,.2])}
for g in manifest['groups']:
 a=g['start']//3;b=a+g['count']//3
 illum=.4+.6*np.abs(rows['normal'][a:b]@np.array([.3,-.4,.866]))
 ax.add_collection3d(Poly3DCollection(vertices[a:b],facecolors=np.clip(illum[:,None]*colors[g['material']],0,1),edgecolors='none',zsort='average'))
ax.set_xlim(-25,25);ax.set_ylim(-25,25);ax.set_zlim(-20,20);ax.set_box_aspect((50,50,40));ax.view_init(elev=28,azim=-54)
plt.subplots_adjust(0,0,1,1);plt.savefig(root/'preview.png',transparent=True,pad_inches=0);plt.close()
print(f'PASS: {count:,} valid triangles; materials match; fallback regenerated')

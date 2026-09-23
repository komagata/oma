"""blender --background --python scripts/build_face_blender.py
Authored topology following the approved portrait, with editable relative shape keys.
No generated service, external asset license or Blender runtime dependency.
"""
import bpy, math, json, pathlib
from mathutils import Vector
ROOT=pathlib.Path(__file__).resolve().parents[1]
bpy.ops.object.select_all(action='SELECT'); bpy.ops.object.delete(use_global=False)
image=bpy.data.images.load(str(ROOT/'assets/reference-face.png'))
pixels=list(image.pixels); iw,ih=image.size
vertices=[]; names={}; coords=[]; weights=[]; faces=[]; colors=[]
def point(name,x,y,z,weight=0):
 names[name]=len(vertices); vertices.append(((x-650)/500,(580-y)/500,z/500)); coords.append((x,y)); weights.append(weight)
def mid(name,x,y,z,w=0):point(name,x,y,z,w)
def pair(name,x,y,z,w=0):
 point('L'+name,x,y,z,w);point('R'+name,1300-x,y,z,w)
for name,x,y,z,w in [
 ('top',650,85,-30,0),('f1',650,150,80,0),('f2',650,355,150,0),
 ('bridge',650,531,170,0),('tip',650,690,290,0),('nosebase',650,754,230,0),
 ('phil',650,780,155,0),('cupid',650,832,160,0),('upper',650,850,170,0),
 ('lower',650,858,170,1),('lip',650,882,165,1),('crease',650,921,105,.85),
 ('chin',650,1035,75,.85),('bottom',650,1078,-20,.75)]:mid(name,x,y,z,w)
for data in [
 ('crown',497,120,-25),('fore',467,193,95),('temple',367,225,-85),
 ('edge',306,350,-130),('front',390,333,45),('foremid',466,356,125),
 ('brow',393,480,115),('browinner',575,465,175),('browlow',550,505,175),
 ('outer',384,554,100),('etop',464,536,140),('etopinner',520,540,155),
 ('inner',599,580,160),('ebottom',469,589,135),('ebottominner',531,589,150),
 ('side',335,656,-30),('cheek',415,696,150),('muzzle',590,726,175),
 ('nose',627,701,250),('nostril',626,744,190),('nosefoot',616,766,140),
 ('corner',502,844,145,.2),('peak',625,822,162),('upperseam',590,845,173,0),
 ('lowerseam',590,862,173,1),('lowerlip',555,883,158,.85),
 ('jaw',377,839,0,.25),('jowl',414,919,-20,.65),('chin',532,1016,60,.85),
 ('earTop',274,506,-120),('earIn',301,525,-70),('earOut',263,588,-140),
 ('earMid',298,686,-130,.03),('earBottom',315,732,-115,.1),('earBack',333,604,-75),
 ('templeLow',325,480,-80)]:pair(*data)
def tri(a,b,c,color=None):
 ids=[names[x] for x in [a,b,c]]
 # Force front-facing winding for portrait faces. Sides are authored separately.
 p,q,r=[Vector(vertices[i]) for i in ids]
 if (q-p).cross(r-p).z<0:ids.reverse()
 faces.append(ids)
 if color is None:
  x=sum(coords[i][0] for i in ids)/3;y=sum(coords[i][1] for i in ids)/3
  values=[]
  for dx,dy in [(0,0),(-2,0),(2,0),(0,2),(0,-2)]:
   ix=max(0,min(iw-1,int((1300-x if x>650 else x)+dx)));iy=max(0,min(ih-1,ih-1-int(y+dy)))
   values.append(pixels[(iy*iw+ix)*4+1])
  color=max(.055,sorted(values)[2])
 colors.append(color)
def patch(side,*nodes,color=None):
 ns=[n[1:] if n.startswith('@') else side+n for n in nodes]
 for i in range(1,len(ns)-1):tri(ns[0],ns[i],ns[i+1],color)
for s in ['L','R']:
 for ns in [
 ('@top','crown','@f1'),('crown','fore','@f1'),('crown','temple','fore'),
 ('temple','edge','front'),('temple','front','fore'),('fore','front','foremid'),
 ('fore','foremid','@f2'),('fore','@f2','@f1'),('foremid','front','brow'),
 ('foremid','brow','browinner'),('foremid','browinner','@f2'),('@f2','browinner','@bridge'),
 ('edge','templeLow','front'),('front','templeLow','brow'),
 ('templeLow','outer','brow'),('brow','browlow','browinner'),('browinner','browlow','@bridge'),
 ('brow','outer','etop'),('brow','etop','etopinner','browlow'),('browlow','etopinner','inner'),
 ('browlow','inner','@bridge'),('outer','ebottom','cheek'),('outer','side','cheek'),
 ('side','outer','templeLow'),('etop','ebottom','ebottominner','etopinner'),
 ('outer','ebottom','etop'),('etopinner','ebottominner','inner'),
 ('ebottom','cheek','muzzle','ebottominner'),('ebottominner','muzzle','inner'),
 ('inner','muzzle','nose','@bridge'),('@bridge','nose','@tip'),
 ('nose','nostril','@nosebase','@tip'),('nostril','nosefoot','@phil','@nosebase'),
 ('nose','muzzle','nosefoot','nostril'),('muzzle','corner','peak','nosefoot'),
 ('nosefoot','peak','@cupid','@phil'),('peak','upperseam','@upper','@cupid'),
 ('corner','upperseam','peak'),('corner','lowerlip','lowerseam'),
 ('lowerseam','lowerlip','@lip','@lower'),('lowerlip','@crease','@lip'),
 ('corner','jaw','jowl','lowerlip'),('side','jaw','cheek'),('cheek','jaw','corner'),
 ('cheek','corner','muzzle'),('lowerlip','jowl','chin','@crease'),
 ('@crease','chin','@chin'),('chin','@bottom','@chin'),('chin','jowl','@bottom'),
 ('earTop','earOut','earIn'),('earOut','earMid','earIn'),
 ('earIn','earMid','earBack'),('earMid','earBottom','earBack'),
 ('earIn','earBack','templeLow'),('earBack','earBottom','side'),
 ('earBack','side','templeLow')]:patch(s,*ns)
 # Eye material: a solid faceted surface, no iris/pupil, deliberately calmer highlights.
front_count=len(faces)
# Add a rear cranium: the front remains reference-matched under orthographic projection.
outline=['top','Rcrown','Rtemple','Redge','RtempleLow','Rside','Rjaw','Rjowl','Rchin','bottom','Lchin','Ljowl','Ljaw','Lside','LtempleLow','Ledge','Ltemple','Lcrown']
rear=[]
for name in outline:
 i=names[name];x,y,z=vertices[i]; n=len(vertices); rear.append(n)
 vertices.append((x*.92,y*.94,-.95));coords.append(coords[i]);weights.append(weights[i])
back=len(vertices);vertices.append((0,.05,-1.22));coords.append((650,580));weights.append(0)
for i,name in enumerate(outline):
 j=(i+1)%len(outline);a=names[name];b=names[outline[j]];c=rear[i];d=rear[j]
 faces.extend([[a,c,d],[a,d,b],[c,back,d]]);colors.extend([.09,.13,.075])
mesh=bpy.data.meshes.new('OMA topology');mesh.from_pydata(vertices,[],faces);mesh.update()
obj=bpy.data.objects.new('O.M.A. — faceted head',mesh);bpy.context.collection.objects.link(obj);bpy.context.view_layer.objects.active=obj;obj.select_set(True)
for i,g in enumerate(colors):
 mat=bpy.data.materials.new('Facet %03d'%i);mat.diffuse_color=(g*.075,g,g*.025,1);mat.use_nodes=True
 nodes=mat.node_tree.nodes;nodes.clear();out=nodes.new('ShaderNodeOutputMaterial');em=nodes.new('ShaderNodeEmission');em.inputs[0].default_value=mat.diffuse_color;em.inputs[1].default_value=.85;mat.node_tree.links.new(em.outputs[0],out.inputs[0])
 obj.data.materials.append(mat);obj.data.polygons[i].material_index=i
# Project the approved portrait onto the authored front topology. The texture
# is packed into the blend file and follows lip deformation as UV coordinates.
uv=mesh.uv_layers.new(name='Portrait UV')
for poly in mesh.polygons:
 for loop in poly.loop_indices:
  i=mesh.loops[loop].vertex_index;x,y=coords[i]
  uv.data[loop].uv=((1300-x if x>650 else x)/iw,1-y/ih)
portrait=bpy.data.materials.new('Approved portrait texture');portrait.use_nodes=True
nodes=portrait.node_tree.nodes;nodes.clear();out=nodes.new('ShaderNodeOutputMaterial');em=nodes.new('ShaderNodeEmission');tex=nodes.new('ShaderNodeTexImage');tex.image=image
portrait.node_tree.links.new(tex.outputs['Color'],em.inputs[0]);portrait.node_tree.links.new(em.outputs[0],out.inputs[0])
obj.data.materials.append(portrait)
for poly in mesh.polygons[:front_count]:poly.material_index=len(obj.data.materials)-1
image.pack()
obj.shape_key_add(name='Basis')
shapes={}
for key in ['jawOpen','lipRound','lipWide']:
 shape=obj.shape_key_add(name=key);deltas=[]
 for i,(x,y,z) in enumerate(vertices):
  v=Vector((x,y,z));w=weights[i]
  if key=='jawOpen':
   # Hinge at the jaw joint, not a straight translation of the entire lower face.
   angle=-.16*w;dy=y+.10;dz=z+.15
   v.y=-.10+dy*math.cos(angle)-dz*math.sin(angle)-.20*w
   v.z=-.15+dy*math.sin(angle)+dz*math.cos(angle)
  else:
   # Local lip falloff leaves eyes/nose/forehead and skull completely untouched.
   local=max(0,1-abs(y+.54)/.24)*max(0,1-abs(x)/.40) if z>.24 else 0
   if key=='lipRound':v.x*=1-.34*local;v.z+=.085*local
   else:v.x*=1+.20*local;v.y+=.035*local*(1 if y>-.55 else -1)
  delta=v-Vector((x,y,z));deltas.append([round(c,6) for c in delta]);shape.data[i].co=v
 shapes[key]=deltas
mouth=[names[n] for n in ['Lcorner','Lupperseam','upper','Rupperseam','Rcorner','Rlowerseam','lower','Llowerseam']]
# The dark interior is its own mesh and follows the same shape keys. No teeth or tongue.
cavity=bpy.data.meshes.new('Mouth cavity');cavity.from_pydata([vertices[i] for i in mouth],[],[list(reversed(range(len(mouth))))]);cavity.update()
cav=bpy.data.objects.new('Dark mouth interior — no teeth',cavity);bpy.context.collection.objects.link(cav)
mat=bpy.data.materials.new('Unlit dark green interior');mat.diffuse_color=(.001,.008,.001,1);cav.data.materials.append(mat)
cav.shape_key_add(name='Basis')
for key in shapes:
 k=cav.shape_key_add(name=key)
 for j,i in enumerate(mouth):k.data[j].co=Vector(vertices[i])+Vector(shapes[key][i])
# Preview camera and editable animation demonstrating all three channels.
bpy.ops.object.camera_add(location=(0,0,7));camera=bpy.context.object;camera.rotation_euler=(0,0,0);camera.data.type='ORTHO';camera.data.ortho_scale=2.8;bpy.context.scene.camera=camera
for ob in [obj,cav]:
 for name in shapes:
  k=ob.data.shape_keys.key_blocks[name]
  for frame,value in [(1,0),(12,.65 if name=='jawOpen' else 0),(24,0),(36,.7),(48,0),(60,.45),(72,0)]:
   k.value=value;k.keyframe_insert('value',frame=frame)
scene=bpy.context.scene;scene.frame_end=72;scene.render.fps=24;scene.frame_set(1)
scene.render.engine='CYCLES';scene.cycles.samples=8;scene.render.resolution_x=640;scene.render.resolution_y=720;scene.render.resolution_percentage=100
scene.render.film_transparent=True;scene.view_settings.view_transform='Standard'
(ROOT/'models').mkdir(exist_ok=True)
bpy.ops.wm.save_as_mainfile(filepath=str(ROOT/'models/oma-face.blend'))
export={'vertices':vertices,'uv':[[1300-x if x>650 else x,y] for x,y in coords],'frontCount':front_count,'jaw':weights,'triangles':[[*f,round(g*255)] for f,g in zip(faces,colors)],'mouth':mouth,'shapes':shapes,'source':'Authored in Blender from approved O.M.A. portrait. Full cranium, explicit lip loops, three relative shape keys. No teeth, tongue or pupils.'}
(ROOT/'assets/face.json').write_text(json.dumps(export,separators=(',',':'))+'\n')
(ROOT/'assets/FaceMesh.js').write_text('var mesh = '+json.dumps(export,separators=(',',':'))+';\n')
with (ROOT/'assets/face.obj').open('w') as out:
 out.write('# O.M.A. Blender-authored neutral mesh. Editable shapes in models/oma-face.blend\n')
 for v in vertices:out.write('v '+' '.join(map(str,v))+'\n')
 for f in faces:out.write('f '+' '.join(str(i+1) for i in f)+'\n')
print('Exported',len(vertices),'vertices,',len(faces),'triangles; shapes:',list(shapes))

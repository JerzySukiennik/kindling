"""Game avatar for Kindling: based on Avatar/Output/lowpoly/make_lowpoly.py, medium decimation, 1K linear textures, smooth shading, rig and clips kept."""
import bpy, sys, os, bmesh
from mathutils import Vector

ROOT = "/Users/jurek/Downloads/Claude/Projects/Avatar/Output/full-v1"
VARIANTS = {
    "game": dict(body=0.42, head=0.3, garment=0.45, eye=0.2, hair_vox=0.0065, hair_tris=3600, tex=1024, face_tex=1024, eye_tex=256, crocs_tris=1600),
    "lowpoly": dict(body=0.14, head=0.07, garment=0.12, eye=0.05, hair_vox=0.010, hair_tris=900, tex=256, eye_tex=64),
    "psx": dict(body=0.032, head=0.014, garment=0.07, eye=0.012, hair_vox=0.022, hair_tris=150, tex=64, face_tex=128, eye_tex=16, post=True),
    "ps1": dict(body=0.06, head=0.028, garment=0.09, eye=0.02, hair_vox=0.016, hair_tris=380, tex=128, eye_tex=32),
}
variant, out = sys.argv[-2], sys.argv[-1]
P = VARIANTS[variant]
bpy.ops.wm.read_factory_settings(use_empty=True)

def imp(path):
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=path)
    return [o for o in bpy.data.objects if o not in before]

new = imp(f"{ROOT}/character_v2/character_nude_v2.glb")
rig = next(o for o in new if o.type == "ARMATURE")
meshes = {o.name: o for o in new if o.type == "MESH"}
rig_actions = [a for a in bpy.data.actions if not os.environ.get('KEEP_ACTIONS') or a.name in os.environ['KEEP_ACTIONS'].split(',')]
if rig.animation_data: rig.animation_data.action = None
rig.data.pose_position = "REST"
bpy.context.view_layer.update()

def tris(o): return sum(len(p.vertices) - 2 for p in o.data.polygons)
def select_only(o):
    bpy.ops.object.select_all(action="DESELECT"); o.select_set(True); bpy.context.view_layer.objects.active = o
def decimate(o, ratio):
    if o.data.shape_keys: o.shape_key_clear()
    select_only(o)
    m = o.modifiers.new("dec", "DECIMATE"); m.ratio = ratio; m.use_collapse_triangulate = True
    while o.modifiers[0] != m: bpy.ops.object.modifier_move_up(modifier=m.name)
    bpy.ops.object.modifier_apply(modifier=m.name)

for n in list(meshes):
    if n.startswith(("Icosphere", "Lashes", "Hair.ScalpCap")): bpy.data.objects.remove(meshes.pop(n), do_unlink=True)

hair = meshes.pop("Hair.Strands.Medium")
head = next(o for n, o in meshes.items() if n.startswith("Head"))
def cut_body_under_clothes(o, regions=(0, 1, 2, 3, 5, 6)):
    attr = o.data.attributes.get("_REGION") or o.data.attributes.get("REGION")
    if attr is None:
        print("WARN no _REGION attribute on Body"); return
    vals = [int(round(d.value if hasattr(d, "value") else d.vector[0])) for d in attr.data]
    bm = bmesh.new(); bm.from_mesh(o.data); bm.verts.ensure_lookup_table()
    mask = set(regions); dead = []
    for f in bm.faces:
        if all((vals[v.index] in mask) if attr.domain == "POINT" else False for v in f.verts): dead.append(f)
    if attr.domain != "POINT":
        for f in bm.faces:
            loops = [vals[l.index] for l in f.loops]
            if all(v in mask for v in loops): dead.append(f)
    bmesh.ops.delete(bm, geom=list(set(dead)), context="FACES")
    bm.to_mesh(o.data); bm.free(); print("body faces cut:", len(dead))
cut_body_under_clothes(meshes["Body"])
decimate(meshes["Body"], P["body"] * 1.5); decimate(head, P["head"])
for n, o in meshes.items():
    if n.startswith("Eye."): decimate(o, P["eye"])
    elif n.startswith("Eyebrow"): decimate(o, 0.01)

# hair shell: voxel remesh of the strands, decimate, flat colour, parented to the Head bone
select_only(hair)
rm = hair.modifiers.new("rm", "REMESH"); rm.mode = "VOXEL"; rm.voxel_size = P["hair_vox"]
bpy.ops.object.modifier_apply(modifier=rm.name)
for vg in list(hair.vertex_groups): hair.vertex_groups.remove(vg)
for m in list(hair.modifiers): hair.modifiers.remove(m)
dm = hair.modifiers.new("dec", "DECIMATE"); dm.ratio = min(1.0, P["hair_tris"] / max(1, tris(hair)))
bpy.ops.object.modifier_apply(modifier=dm.name)
hair.name = "Hair.LowPoly"
vg = hair.vertex_groups.new(name="Head"); vg.add(list(range(len(hair.data.vertices))), 1.0, "REPLACE")
am = hair.modifiers.new("Armature", "ARMATURE"); am.object = rig; hair.parent = rig
hm = bpy.data.materials.new("HairFlat"); hm.use_nodes = True
b = next(n for n in hm.node_tree.nodes if n.type == "BSDF_PRINCIPLED"); b.inputs["Base Color"].default_value = (0.20, 0.13, 0.075, 1); b.inputs["Roughness"].default_value = 1.0
hair.data.materials.clear(); hair.data.materials.append(hm)
meshes["Hair.LowPoly"] = hair

# outfit: black RTFKT hoodie (hood down), sweatpants, crocs, rebound to the character rig
for gname, gpath in [("hoodie", "clothes_v2/rtfkt-ar-hoodie.glb"), ("pants", "clothes_v2/sweatpants-hm/sweatpants-hm.glb"), ("crocs", "clothes_v2/crocs-green.glb")]:
    objs = imp(f"{ROOT}/{gpath}")
    garm = next((o for o in objs if o.type == "ARMATURE"), None)
    if gname == "hoodie" and garm:
        act = next((x for x in bpy.data.actions if x.name.startswith("hood_state_down")), None)
        if act:
            if garm.animation_data is None: garm.animation_data_create()
            garm.animation_data.action = act; bpy.context.scene.frame_set(int(act.frame_range[0])); bpy.context.view_layer.update()
            for o in [o for o in objs if o.type == "MESH"]:
                if o.data.shape_keys: o.shape_key_clear()
                for m in list(o.modifiers):
                    if m.type == "ARMATURE":
                        select_only(o)
                        try: bpy.ops.object.modifier_apply(modifier=m.name)
                        except Exception as e: print("hood bake failed", o.name, e)
            garm.animation_data.action = None
    for o in [o for o in objs if o.type == "MESH"]:
        if o.name.startswith(("Collar",)): bpy.data.objects.remove(o, do_unlink=True); continue
        o.parent = None
        arms = [m for m in o.modifiers if m.type == "ARMATURE"]
        for m in arms: m.object = rig
        if not arms: am = o.modifiers.new("Armature", "ARMATURE"); am.object = rig
        o.parent = rig
        for vg in list(o.vertex_groups):
            if vg.name not in rig.data.bones: o.vertex_groups.remove(vg)
        if gname == "crocs":
            select_only(o)
            if o.data.shape_keys: o.shape_key_clear()
            for vg in list(o.vertex_groups): o.vertex_groups.remove(vg)
            for m in list(o.modifiers): o.modifiers.remove(m)
            rm = o.modifiers.new("rm", "REMESH"); rm.mode = "VOXEL"; rm.voxel_size = 0.0075
            bpy.ops.object.modifier_apply(modifier=rm.name)
            dm = o.modifiers.new("dec", "DECIMATE"); dm.ratio = min(1.0, P.get("crocs_tris", 420) / max(1, tris(o)))
            bpy.ops.object.modifier_apply(modifier=dm.name)
            gl = o.vertex_groups.new(name="LeftFoot"); gr = o.vertex_groups.new(name="RightFoot")
            for v in o.data.vertices:
                (gl if v.co.x > 0 else gr).add([v.index], 1.0, "REPLACE")
            am = o.modifiers.new("Armature", "ARMATURE"); am.object = rig
            cm = bpy.data.materials.new("CrocsFlat"); cm.use_nodes = True
            bb = next(n for n in cm.node_tree.nodes if n.type == "BSDF_PRINCIPLED"); bb.inputs["Base Color"].default_value = (0.08, 0.5, 0.14, 1); bb.inputs["Roughness"].default_value = 1.0
            o.data.materials.clear(); o.data.materials.append(cm)
        else:
            select_only(o); decimate(o, P["garment"] * (2.2 if gname == "hoodie" else 1.0))
            bm = bmesh.new(); bm.from_mesh(o.data); bm.normal_update()
            for v in bm.verts: v.co += v.normal * 0.006
            bm.to_mesh(o.data); bm.free()
        select_only(o)
        try: bpy.ops.object.vertex_group_normalize_all(group_select_mode="ALL", lock_active=False)
        except Exception: pass
        o.name = f"{gname}.{o.name}"; meshes[o.name] = o
    if garm: bpy.data.objects.remove(garm, do_unlink=True)
for o in list(bpy.data.objects):
    if o is not rig and o not in meshes.values():
        bpy.data.objects.remove(o, do_unlink=True)

# materials: base colour only, nearest filter, small textures, flat shading
done = {}
def simple_material(mat):
    if mat.name in done: return done[mat.name]
    img, col = None, (0.5, 0.5, 0.5, 1)
    if mat.use_nodes:
        for n in mat.node_tree.nodes:
            if n.type == "BSDF_PRINCIPLED": col = tuple(n.inputs["Base Color"].default_value)
        for n in mat.node_tree.nodes:
            if n.type == "TEX_IMAGE" and any(l.to_socket.name == "Base Color" for o in n.outputs for l in o.links if l.to_node.type == "BSDF_PRINCIPLED"): img = n.image
    nm = bpy.data.materials.new(mat.name + "_lp"); nm.use_nodes = True
    t = nm.node_tree; b = next(n for n in t.nodes if n.type == "BSDF_PRINCIPLED"); b.inputs["Roughness"].default_value = 1.0
    b.inputs["Base Color"].default_value = col
    if img:
        size = P["eye_tex"] if "eye" in img.name.lower() else P.get("face_tex", P["tex"]) if "jurek" in img.name.lower() else P["tex"]
        img.scale(size, size)
        if P.get("post"):
            import numpy as np
            ncol = 8 if "eye" in img.name.lower() else (40 if "jurek" in img.name.lower() else 24)
            arr = np.empty(len(img.pixels), dtype=np.float32); img.pixels.foreach_get(arr); arr = arr.reshape(size, size, 4)
            rgb = np.clip(arr[:, :, :3], 0, 1)
            rng = np.random.default_rng(7)
            bayer = (np.array([[0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]], dtype=np.float32) / 16.0 - 0.5)
            pat = np.tile(bayer, (size // 4 + 1, size // 4 + 1))[:size, :size, None]
            flat = rgb.reshape(-1, 3); cent = flat[rng.choice(len(flat), min(ncol, len(flat)), replace=False)].copy()
            for _ in range(12):
                d = ((flat[:, None, :] - cent[None]) ** 2).sum(2); lab = d.argmin(1)
                for k in range(len(cent)):
                    m = lab == k
                    if m.any(): cent[k] = flat[m].mean(0)
            noisy = rgb + pat * 0.11 + rng.normal(0, 0.018, rgb.shape).astype(np.float32)
            d = ((noisy.reshape(-1, 3)[:, None, :] - cent[None]) ** 2).sum(2); q = cent[d.argmin(1)].reshape(size, size, 3)
            q = np.round(q * 31.0) / 31.0
            arr[:, :, :3] = q; img.pixels.foreach_set(arr.reshape(-1)); img.update()
        tn = t.nodes.new("ShaderNodeTexImage"); tn.image = img; tn.interpolation = "Linear"; t.links.new(tn.outputs["Color"], b.inputs["Base Color"])
    done[mat.name] = nm; return nm
for o in meshes.values():
    mats = [simple_material(m) if m else m for m in o.data.materials]
    o.data.materials.clear()
    for m in mats: o.data.materials.append(m)
    for p in o.data.polygons: p.use_smooth = True
    for v in o.data.attributes:
        pass

total = sum(tris(o) for o in meshes.values())
print("LOWPOLY", variant, "TRIS", total, {n: tris(o) for n, o in meshes.items()})

rig.data.pose_position = "POSE"
for a in rig_actions:
    if rig.animation_data is None: rig.animation_data_create()
    ts = rig.animation_data.nla_tracks.new(); ts.name = a.name; ts.strips.new(a.name, 0, a)
rig.animation_data.action = None
bpy.ops.object.select_all(action="SELECT")
bpy.ops.export_scene.gltf(filepath=out, export_format="GLB", use_selection=False, export_animations=True, export_animation_mode="NLA_TRACKS", export_morph=False, export_skins=True, export_image_format="JPEG", export_jpeg_quality=88, export_apply=False)
print("EXPORTED", out, os.path.getsize(out))

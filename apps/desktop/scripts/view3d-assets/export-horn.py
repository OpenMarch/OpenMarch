# cspell:words mathutils bmesh depsgraph tris verts
# Bakes an instrument .blend into the 3D View's instrument frame as the
# quantized JSON that core/instruments/meshAsset.ts reads.
#
#   blender -b horn.blend --python export-horn.py -- out.json horn.config.json
#
# The config names the source and its license, maps each material to a part
# id, and gives the scale, the origin (the right-hand grip, in the file's
# units) and a decimate ratio per detail. File axes become instrument axes
# as (+X, +Y, +Z) = (file Y, file Z, file X) unless `axis` says otherwise:
# a horn modeled bell along +X with its valve caps up +Z.
# A .blend saved compressed (Blender 2.7x) must be gunzipped first.
import bpy, bmesh, json, sys, mathutils
args = sys.argv[sys.argv.index("--") + 1:]
out, cfg = args[0], json.load(open(args[1]))
PART = cfg["parts"]                      # material name -> part id
scale = cfg["scale"]
origin = mathutils.Vector(cfg["origin"])  # in the file's units
# file axes -> instrument axes: inst = (fileY, fileZ, fileX) by default
axis = cfg.get("axis", [1, 2, 0])
def to_inst(v):
    d = (v - origin) * scale
    return [d[axis[0]], d[axis[1]], d[axis[2]]]
def nrm_inst(n):
    return [n[axis[0]], n[axis[1]], n[axis[2]]]
result = {"source": cfg["source"], "lods": {}}
for lod, ratio in cfg["lods"].items():
    parts = {}
    # sorted by name, so the output depends only on the scene, not on load order
    for o in sorted(bpy.context.scene.objects, key=lambda o: o.name):
        if o.type != "MESH": continue
        bm = bmesh.new(); bm.from_mesh(o.data); bm.transform(o.matrix_world)
        bmesh.ops.triangulate(bm, faces=bm.faces[:])
        tris = len(bm.faces)
        # small parts keep every triangle: decimating them breaks them up
        if ratio < 1 and tris > cfg.get("minTriangles", 24):
            me = bpy.data.meshes.new("tmp"); bm.to_mesh(me); bm.free()
            tmp = bpy.data.objects.new("tmp", me); bpy.context.scene.collection.objects.link(tmp)
            tmp.data.materials.clear()
            for s in o.material_slots: tmp.data.materials.append(s.material)
            mod = tmp.modifiers.new("d", "DECIMATE"); mod.ratio = ratio; mod.use_collapse_triangulate = True
            ev = tmp.evaluated_get(bpy.context.evaluated_depsgraph_get())
            bm = bmesh.new(); bm.from_mesh(ev.to_mesh()); ev.to_mesh_clear()
            bpy.data.objects.remove(tmp); bpy.data.meshes.remove(me)
        mats = [s.material.name for s in o.material_slots]
        bmesh.ops.triangulate(bm, faces=bm.faces[:])
        me = bpy.data.meshes.new("x"); bm.to_mesh(me); bm.free()
        smooth = any(p.use_smooth for p in o.data.polygons)
        for p in me.polygons: p.use_smooth = smooth
        me.update()
        corner = [tuple(c.vector) for c in me.corner_normals]
        for poly in me.polygons:
            mat = mats[poly.material_index] if mats else "Gold"
            part = PART[mat]
            P = parts.setdefault(part, {"pos": [], "nrm": [], "idx": [], "map": {}})
            for li in poly.loop_indices:
                v = me.vertices[me.loops[li].vertex_index].co
                n = corner[li] if smooth else tuple(poly.normal)
                q = tuple(round(c * 1e4) for c in to_inst(v))
                qn = tuple(round(c * 127) for c in nrm_inst(n))
                key = (q, qn)
                if key not in P["map"]:
                    P["map"][key] = len(P["pos"]) // 3
                    P["pos"].extend(q); P["nrm"].extend(qn)
                P["idx"].append(P["map"][key])
        bpy.data.meshes.remove(me)
    out_parts = []
    for part, P in sorted(parts.items()):
        # drop triangles that collapsed to a line or point
        idx = P["idx"]; keep = []
        for i in range(0, len(idx), 3):
            a, b, c = idx[i:i+3]
            if a != b and b != c and a != c: keep += [a, b, c]
        out_parts.append({"part": part, "positions": P["pos"], "normals": P["nrm"], "indices": keep})
    result["lods"][lod] = out_parts
    print("LOD", lod, "tris", sum(len(p["indices"]) // 3 for p in out_parts), "verts", sum(len(p["positions"]) // 3 for p in out_parts))
json.dump(result, open(out, "w"), separators=(",", ":"))

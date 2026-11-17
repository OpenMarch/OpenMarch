# cspell:words denoising BSDF
# cspell:words mathutils optix denoiser
# Renders the review views of a prop GLB, on grass with a 1.75 m stand-in for
# scale. It imports the exported file, so it shows what would actually ship.
#
#   blender -b --factory-startup --python render-prop-sheet.py -- \
#       model.glb out-dir [--views front,top] [--size 1280x720] [--samples 96]
import argparse
import math
import os
import sys

import bpy
from mathutils import Vector

argv = sys.argv[sys.argv.index("--") + 1 :]
p = argparse.ArgumentParser()
p.add_argument("glb")
p.add_argument("out")
p.add_argument("--views", default="")
p.add_argument("--size", default="1280x720")
p.add_argument("--samples", type=int, default=96)
p.add_argument("--no-figure", action="store_true")
p.add_argument("--fit", type=float, default=1.2, help="smaller frames the model tighter")
args = p.parse_args(argv)
os.makedirs(args.out, exist_ok=True)

# name: (camera direction, height factor, lens mm). Cameras are framed from the
# model's bounds, so one script fits a glockenspiel and a mixer cart alike.
VIEWS = {
    "audience": ((0, -1, 0.0), 0.28, 40),
    "quarter-low": ((0.72, -0.72, 0.0), 0.34, 40),
    "quarter-high": ((-0.72, -0.72, 0.0), 0.34, 40),
    "player": ((0, 1, 0.0), 0.42, 40),
    "end": ((1, 0, 0.0), 0.2, 45),
    "top": ((0, 0.0001, 1.0), 1.0, 40),
}

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=args.glb)
scene = bpy.context.scene
scene.render.engine = "CYCLES"
prefs = bpy.context.preferences.addons["cycles"].preferences
prefs.compute_device_type = "OPTIX"
prefs.get_devices()
for d in prefs.devices:
    d.use = d.type == "OPTIX"
scene.cycles.device = "GPU"
scene.cycles.samples = args.samples
scene.cycles.use_denoising = True
w, h = (int(v) for v in args.size.split("x"))
scene.render.resolution_x = w
scene.render.resolution_y = h
scene.render.image_settings.file_format = "PNG"
scene.view_settings.view_transform = "AgX"
scene.view_settings.look = "AgX - Medium High Contrast"

world = bpy.data.worlds.new("sky")
world.use_nodes = True
world.node_tree.nodes["Background"].inputs["Color"].default_value = (0.55, 0.72, 1.0, 1)
world.node_tree.nodes["Background"].inputs["Strength"].default_value = 0.9
scene.world = world

sun = bpy.data.lights.new("sun", "SUN")
sun.energy = 3.4
sun.angle = math.radians(2.0)
sun_ob = bpy.data.objects.new("sun", sun)
sun_ob.rotation_euler = (math.radians(52), 0, math.radians(-35))
scene.collection.objects.link(sun_ob)


def material(name, color, roughness):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    b = m.node_tree.nodes["Principled BSDF"]
    b.inputs["Base Color"].default_value = (*color, 1)
    b.inputs["Roughness"].default_value = roughness
    return m


bpy.ops.mesh.primitive_plane_add(size=400)
bpy.context.object.data.materials.append(material("grass", (0.07, 0.19, 0.06), 0.95))

meshes = [o for o in scene.objects if o.type == "MESH" and o.name != "Plane"]
corners = [o.matrix_world @ Vector(c) for o in meshes for c in o.bound_box]
lo = Vector([min(c[i] for c in corners) for i in range(3)])
hi = Vector([max(c[i] for c in corners) for i in range(3)])
center = (lo + hi) / 2
size = hi - lo
radius = max(size.length / 2, 0.75)

if not args.no_figure:
    fx = hi.x + 0.45
    bpy.ops.mesh.primitive_cylinder_add(radius=0.2, depth=1.53, location=(fx, center.y, 0.765))
    body = bpy.context.object
    bpy.ops.mesh.primitive_uv_sphere_add(radius=0.11, location=(fx, center.y, 1.64))
    head = bpy.context.object
    grey = material("figure", (0.55, 0.55, 0.57), 0.7)
    body.data.materials.append(grey)
    head.data.materials.append(grey)

cam = bpy.data.cameras.new("cam")
cam.clip_end = 1000
cam_ob = bpy.data.objects.new("cam", cam)
scene.collection.objects.link(cam_ob)
scene.camera = cam_ob

names = [v for v in args.views.split(",") if v] or list(VIEWS)
for name in names:
    direction, lift, lens = VIEWS[name]
    cam.lens = lens
    target = Vector((center.x, center.y, center.z * 0.9))
    # far enough that the bounding sphere fits the 16:9 frame's height
    d = radius * args.fit / (9 / lens)
    if name == "top":
        loc = Vector((center.x, center.y + 0.001, d + hi.z))
    else:
        v = Vector(direction).normalized()
        loc = target + v * d + Vector((0, 0, d * lift))
    cam_ob.location = loc
    cam_ob.rotation_euler = (target - loc).to_track_quat("-Z", "Y").to_euler()
    scene.render.filepath = os.path.join(args.out, f"{name}.png")
    bpy.ops.render.render(write_still=True)
    print("RENDERED", name)

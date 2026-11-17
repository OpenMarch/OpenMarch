# cspell:words denoising BSDF optix mathutils
# Renders a small picture of every front ensemble model for the equipment catalog (the Front
# ensemble and podiums view): each detailed GLB from the audience side and a little above, on a
# transparent background, framed to its own size, as WebP.
#
#   blender -b --factory-startup --python scripts/view3d-assets/pit-thumbnails.py -- \
#       src/view3d/assets/pit [--size 240x180] [--samples 48]
#
# Run it from apps/desktop whenever the pit GLBs change (after pit-plan.mjs), then commit
# src/view3d/assets/pit/thumbs/. Renders with Cycles on an NVIDIA GPU (OptiX), as
# render-prop-sheet.py does.
import argparse
import json
import math
import os
import sys

import bpy
from mathutils import Vector

argv = sys.argv[sys.argv.index("--") + 1 :]
p = argparse.ArgumentParser()
p.add_argument("dir")
p.add_argument("--size", default="240x180")
p.add_argument("--samples", type=int, default=48)
p.add_argument("--only", default="", help="comma-separated model names")
args = p.parse_args(argv)
out_dir = os.path.join(args.dir, "thumbs")
os.makedirs(out_dir, exist_ok=True)
with open(os.path.join(args.dir, "manifest.json")) as f:
    names = sorted(json.load(f))
if args.only:
    names = [n for n in names if n in args.only.split(",")]

bpy.ops.wm.read_factory_settings(use_empty=True)
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
scene.render.film_transparent = True
scene.render.image_settings.file_format = "WEBP"
scene.render.image_settings.color_mode = "RGBA"
scene.render.image_settings.quality = 88
scene.view_settings.view_transform = "AgX"
scene.view_settings.look = "AgX - Medium High Contrast"

# A soft, even light so dark finishes (black synthetic bars, black podiums) still read
world = bpy.data.worlds.new("sky")
world.use_nodes = True
world.node_tree.nodes["Background"].inputs["Color"].default_value = (0.9, 0.92, 1.0, 1)
world.node_tree.nodes["Background"].inputs["Strength"].default_value = 1.1
scene.world = world
sun = bpy.data.lights.new("sun", "SUN")
sun.energy = 3.0
sun.angle = math.radians(8.0)
sun_ob = bpy.data.objects.new("sun", sun)
sun_ob.rotation_euler = (math.radians(40), 0, math.radians(-30))
scene.collection.objects.link(sun_ob)

cam = bpy.data.cameras.new("cam")
cam.lens = 50
cam.clip_end = 1000
cam_ob = bpy.data.objects.new("cam", cam)
scene.collection.objects.link(cam_ob)
scene.camera = cam_ob

# glTF's +Z (toward the audience) imports as Blender's -Y: look from the audience side, a little
# to the right and above, so a keyboard's bars and a drum's heads show
DIRECTION = Vector((0.45, -0.75, 0.62)).normalized()
SENSOR_HALF = 36 / 2  # Blender's default sensor width, fitted to the frame's width

for name in names:
    for ob in [o for o in scene.objects if o.type not in {"CAMERA", "LIGHT"}]:
        bpy.data.objects.remove(ob, do_unlink=True)
    bpy.ops.import_scene.gltf(filepath=os.path.join(args.dir, f"{name}.glb"))
    meshes = [o for o in scene.objects if o.type == "MESH"]
    corners = [o.matrix_world @ Vector(c) for o in meshes for c in o.bound_box]
    lo = Vector([min(c[i] for c in corners) for i in range(3)])
    hi = Vector([max(c[i] for c in corners) for i in range(3)])
    center = (lo + hi) / 2
    radius = max((hi - lo).length / 2, 0.2)
    # Far enough that the bounding sphere fits the frame's height (the narrower side)
    fov_half = math.atan(SENSOR_HALF * (h / w) / cam.lens)
    distance = radius / math.sin(fov_half) * 1.02
    loc = center + DIRECTION * distance
    cam_ob.location = loc
    cam_ob.rotation_euler = (center - loc).to_track_quat("-Z", "Y").to_euler()
    scene.render.filepath = os.path.join(out_dir, f"{name}.webp")
    bpy.ops.render.render(write_still=True)
    print("RENDERED", name)

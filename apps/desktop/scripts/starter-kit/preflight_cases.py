# SPDX-License-Identifier: GPL-3.0-or-later
# cspell:words bpy bmesh addon
"""Exports models the pre-flight should flag, with what it predicted.

    blender --background --factory-startup --python preflight_cases.py -- <kit dir> <out dir>

Each case is a small scene with one problem. The add-on's pre-flight must
predict exactly the case's expected "Can't import" and "Needs your choice"
codes; the scene is then exported (bypassing the export operator's refusal)
to <out dir>/<case>.glb, and <out dir>/predictions.json records the
predictions. The app's tests import each file and check that the importer
reports the same codes, so the pre-flight can't drift from the importer.
"""

import json
import math
import os
import sys
import uuid

import addon_utils
import bpy

# Fixed item ids, so the committed cases only change when their content does.
ID_NAMESPACE = uuid.UUID("5d1c9e2a-7b40-4f8e-a3c6-1e2f3a4b5c6d")

KIT, OUT = (os.path.abspath(a) for a in sys.argv[sys.argv.index("--") + 1 :][:2])


# Leave no __pycache__ in the kit's add-on folder.
sys.dont_write_bytecode = True


def load_addon():
    entry = bpy.context.preferences.filepaths.script_directories.new()
    entry.name = "openmarch-starter-kit"
    entry.directory = KIT
    bpy.utils.refresh_script_paths()
    addon_utils.modules_refresh()
    module = addon_utils.enable("openmarch_tools", default_set=True, handle_error=None)
    if module is None:
        raise SystemExit("could not enable openmarch_tools from " + KIT)
    return sys.modules[module.__name__ + ".core"]


def reset(kind):
    for collection in (bpy.data.objects, bpy.data.meshes, bpy.data.materials, bpy.data.armatures):
        for block in list(collection):
            collection.remove(block)
    scene = bpy.context.scene
    for key in list(scene.keys()):
        del scene[key]
    if kind:
        scene.openmarch_kind = kind
    return scene


def pole(length, axis="Z", radius=0.0127, segments=12):
    rotation = {"Z": (0, 0, 0), "Y": (math.pi / 2, 0, 0)}[axis]
    location = {"Z": (0, 0, length / 2), "Y": (0, length / 2, 0)}[axis]
    bpy.ops.mesh.primitive_cylinder_add(
        vertices=segments, radius=radius, depth=length, location=location, rotation=rotation
    )
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=False)


def grip(z, direction="POS_Z", name="GRIP_R"):
    bpy.ops.openmarch.add_point(point=name, location=(0, 0, z), direction=direction)


def case_no_kind():
    reset(None)
    bpy.ops.mesh.primitive_cube_add(size=1, location=(0, 0, 0.5))


def case_equipment_centimeters():
    reset("equipment")
    pole(182.88)
    grip(30)


def case_equipment_lying():
    reset("equipment")
    pole(1.8288, axis="Y")
    bpy.ops.openmarch.add_point(point="GRIP_R", location=(0, 0.3, 0), direction="POS_Y")


def case_equipment_no_grip():
    reset("equipment")
    pole(1.8288)
    # Misnamed, so ignored: the importer still finds no grip.
    bpy.ops.object.empty_add(location=(0, 0, 0.3))
    bpy.context.object.name = "OM_grip_R.001"


def case_equipment_dense():
    reset("equipment")
    pole(1.8288)
    grip(0.3)
    bpy.ops.mesh.primitive_uv_sphere_add(segments=36, ring_count=32, radius=0.05, location=(0, 0, 1.85))


def case_prop_rigged():
    reset("prop")
    bpy.ops.mesh.primitive_cube_add(size=1, location=(0, 0, 0.5))
    cube = bpy.context.object
    bpy.ops.object.armature_add(location=(0, 0, 0))
    armature = bpy.context.object
    cube.select_set(True)
    armature.select_set(True)
    bpy.context.view_layer.objects.active = armature
    bpy.ops.object.parent_set(type="ARMATURE_AUTO")


def case_floor_standing():
    reset("floorProp")
    bpy.ops.mesh.primitive_plane_add(size=2.4, location=(0, 0, 1.2), rotation=(math.pi / 2, 0, 0))
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=False)


CASES = {
    "no-kind": (case_no_kind, [], ["kind"]),
    "equipment-centimeters": (case_equipment_centimeters, [], ["unitConversion"]),
    "equipment-lying": (case_equipment_lying, [], ["rotateToYUp"]),
    "equipment-no-grip": (case_equipment_no_grip, [], ["missingGrip"]),
    "equipment-dense": (case_equipment_dense, [], ["simplify"]),
    "prop-rigged": (case_prop_rigged, ["rigNotAllowed"], []),
    "floor-standing": (case_floor_standing, [], ["rotateToYUp"]),
}


def main():
    core = load_addon()
    os.makedirs(OUT, exist_ok=True)
    predictions = {}
    for name, (build, cant, choice) in CASES.items():
        build()
        bpy.ops.object.select_all(action="DESELECT")
        rows = core.preflight(bpy.context)
        got_cant = sorted(r["code"] for r in rows if r["level"] == core.CANT)
        got_choice = sorted(r["code"] for r in rows if r["level"] == core.CHOICE)
        if got_cant != sorted(cant) or got_choice != sorted(choice):
            raise SystemExit(f"{name}: pre-flight said {got_cant} / {got_choice}, expected {cant} / {choice}")
        bpy.context.scene.openmarch_item_id = str(uuid.uuid5(ID_NAMESPACE, name))
        core.export_glb(bpy.context, os.path.join(OUT, name + ".glb"), core.LICENSE_PROPRIETARY)
        predictions[name] = {"kind": core.om_data(bpy.context.scene).get("kind"), "cant": got_cant, "choice": got_choice}
        print(f"case {name}: {got_cant} {got_choice}")
    with open(os.path.join(OUT, "predictions.json"), "w", encoding="utf-8", newline="\n") as f:
        json.dump(predictions, f, indent=4, sort_keys=True)
        f.write("\n")


main()

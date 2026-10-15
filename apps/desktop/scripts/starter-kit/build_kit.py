# SPDX-License-Identifier: GPL-3.0-or-later
# cspell:words bpy bmesh addon verts mathutils bsdf recalc uvsphere mainfile
"""Builds the OpenMarch Blender Starter kit's generated files, headless.

    blender --background --factory-startup --python build_kit.py -- <kit dir>

`pnpm --filter @openmarch/desktop run kit:build` runs it. It loads the
"OpenMarch Tools" add-on from <kit dir>/addons the way a person installs it,
then, for each model kind:

1. builds a minimal model at real size with the add-on's own operators and
   properties (kind, grips, artwork slots, stretch zones);
2. checks it with the add-on's pre-flight (a template must come out with no
   rows at all) and saves templates/<name>.blend, with no item
   id, so every model made from it gets its own;
3. exports examples/<name>.glb through "Export for OpenMarch", with a fixed
   item id and the CC0 license, which the app's round-trip tests import.

It also writes presets/operator/export_scene.gltf/OpenMarch.py from the
add-on's export settings, and checks that "All rights reserved" is the
pre-selected license.
"""

import os
import sys
import uuid

import addon_utils
import bmesh
import bpy
from mathutils import Matrix

KIT = os.path.abspath(sys.argv[sys.argv.index("--") + 1])
FT = 0.3048
IN = 0.0254

# Fixed item ids for the examples, so the committed exports are stable.
ID_NAMESPACE = uuid.UUID("a7f3e2c4-0b8d-4c5e-9f61-2d3b4a5c6e70")


# Leave no __pycache__ in the kit's add-on folder.
sys.dont_write_bytecode = True


def load_addon():
    """Adds the kit folder as a script directory and enables the add-on."""
    prefs = bpy.context.preferences
    entry = prefs.filepaths.script_directories.new()
    entry.name = "openmarch-starter-kit"
    entry.directory = KIT
    bpy.utils.refresh_script_paths()
    addon_utils.modules_refresh()
    module = addon_utils.enable("openmarch_tools", default_set=True, handle_error=None)
    if module is None:
        raise SystemExit("could not enable openmarch_tools from " + KIT)
    return module


def reset_scene():
    """An empty scene, keeping the add-on registered."""
    for collection in (bpy.data.objects, bpy.data.meshes, bpy.data.materials, bpy.data.images):
        for block in list(collection):
            collection.remove(block)
    scene = bpy.context.scene
    for key in list(scene.keys()):
        del scene[key]
    scene.unit_settings.system = "METRIC"
    scene.unit_settings.scale_length = 1.0
    scene.cursor.location = (0, 0, 0)
    return scene


def material(name, color, slot=None):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get("Principled BSDF")
    bsdf.inputs["Base Color"].default_value = (*color, 1.0)
    bsdf.inputs["Roughness"].default_value = 0.8
    mat.diffuse_color = (*color, 1.0)
    if slot:
        slot_id, width, height = slot
        mat.openmarch_slot = True
        mat.openmarch_slot_id = slot_id
        mat.openmarch_slot_size = (width, height)
    return mat


def new_object(name, bm, materials):
    mesh = bpy.data.meshes.new(name)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    bm.to_mesh(mesh)
    bm.free()
    for mat in materials:
        mesh.materials.append(mat)
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.scene.collection.objects.link(obj)
    return obj


def add_box(bm, uv, lo, hi, mats):
    """A closed box with its own UV square per face.

    `mats` maps a face ("front" -Y, "back" +Y, "top" +Z, "bottom", "left" -X,
    "right" +X) to a material index. Front and top UVs read as seen from the
    Front view and from above (front edge at the bottom); the back reads as
    seen from behind.
    """
    (x0, y0, z0), (x1, y1, z1) = lo, hi
    v = {}
    for ix, x in enumerate((x0, x1)):
        for iy, y in enumerate((y0, y1)):
            for iz, z in enumerate((z0, z1)):
                v[ix, iy, iz] = bm.verts.new((x, y, z))
    quads = {
        "front": [(0, 0, 0), (1, 0, 0), (1, 0, 1), (0, 0, 1)],
        "back": [(1, 1, 0), (0, 1, 0), (0, 1, 1), (1, 1, 1)],
        "top": [(0, 0, 1), (1, 0, 1), (1, 1, 1), (0, 1, 1)],
        "bottom": [(0, 1, 0), (1, 1, 0), (1, 0, 0), (0, 0, 0)],
        "left": [(0, 1, 0), (0, 0, 0), (0, 0, 1), (0, 1, 1)],
        "right": [(1, 0, 0), (1, 1, 0), (1, 1, 1), (1, 0, 1)],
    }
    square = [(0, 0), (1, 0), (1, 1), (0, 1)]
    for name, corners in quads.items():
        face = bm.faces.new([v[c] for c in corners])
        face.material_index = mats.get(name, 0)
        for loop, st in zip(face.loops, square):
            loop[uv].uv = st
    return v


def add_prism(bm, uv, x0, x1, profile, mat_index):
    """A prism along X from a YZ triangle `profile`."""
    left = [bm.verts.new((x0, y, z)) for y, z in profile]
    right = [bm.verts.new((x1, y, z)) for y, z in profile]
    faces = [left[::-1], right]
    for i in range(3):
        j = (i + 1) % 3
        faces.append([left[i], left[j], right[j], right[i]])
    for verts in faces:
        face = bm.faces.new(verts)
        face.material_index = mat_index
        for loop in face.loops:
            loop[uv].uv = (0.0, 0.0)


# -------------------------------------------------------------------- templates


def flag_pole():
    """Equipment: a 6 ft flag pole, grips marked, stretching above the grips."""
    scene = reset_scene()
    scene.openmarch_kind = "equipment"
    length = 6 * FT
    radius = 0.5 * IN
    bm = bmesh.new()
    bmesh.ops.create_cone(
        bm,
        cap_ends=True,
        segments=16,
        radius1=radius,
        radius2=radius,
        depth=length,
        matrix=Matrix.Translation((0, 0, length / 2)),
        calc_uvs=True,
    )
    pole_faces = set(bm.faces)
    bmesh.ops.create_uvsphere(
        bm,
        u_segments=12,
        v_segments=8,
        radius=1 * IN,
        matrix=Matrix.Translation((0, 0, length)),
        calc_uvs=True,
    )
    for face in bm.faces:
        face.material_index = 0 if face in pole_faces else 1
    new_object(
        "Pole",
        bm,
        [material("PoleMetal", (0.55, 0.56, 0.58)), material("Finial", (0.8, 0.65, 0.2))],
    )
    bpy.ops.openmarch.add_point(point="GRIP_R", location=(0, 0, 0.3), direction="POS_Z")
    bpy.ops.openmarch.add_point(point="GRIP_L", location=(0, 0, 0.9), direction="POS_Z")
    scene.openmarch_stretch_z = True
    scene.openmarch_stretch_z_range = (1.0, 1.7)
    return scene


def flat():
    """Prop: a 4 x 8 ft standing flat with front and back artwork, on two jacks."""
    scene = reset_scene()
    scene.openmarch_kind = "prop"
    width, height, thick = 4 * FT, 8 * FT, 1 * IN
    bm = bmesh.new()
    uv = bm.loops.layers.uv.new("UVMap")
    add_box(
        bm,
        uv,
        (-width / 2, -thick / 2, 0),
        (width / 2, thick / 2, height),
        {"front": 0, "back": 1, "top": 2, "bottom": 2, "left": 2, "right": 2},
    )
    jack = 1.5 * IN
    for x in (-width / 2 + 0.05, width / 2 - 0.05 - jack):
        add_prism(bm, uv, x, x + jack, [(thick / 2, 0), (0.6, 0), (thick / 2, 1.8)], 2)
    new_object(
        "Flat",
        bm,
        [
            material("Front", (0.92, 0.92, 0.9), ("front", width, height)),
            material("Back", (0.85, 0.85, 0.82), ("back", width, height)),
            material("Frame", (0.55, 0.42, 0.28)),
        ],
    )
    scene.openmarch_stretch_x = True
    scene.openmarch_stretch_x_range = (-0.4, 0.4)
    scene.openmarch_stretch_z = True
    scene.openmarch_stretch_z_range = (0.2, 2.2)
    return scene


def floor_panel():
    """Floor prop: a 4 x 8 ft panel lying on the floor, artwork on top."""
    scene = reset_scene()
    scene.openmarch_kind = "floorProp"
    width, depth, thick = 4 * FT, 8 * FT, 0.005
    bm = bmesh.new()
    uv = bm.loops.layers.uv.new("UVMap")
    add_box(
        bm,
        uv,
        (-width / 2, -depth / 2, 0),
        (width / 2, depth / 2, thick),
        {"top": 0, "front": 1, "back": 1, "bottom": 1, "left": 1, "right": 1},
    )
    new_object(
        "FloorPanel",
        bm,
        [
            material("Top", (0.9, 0.9, 0.9), ("top", width, depth)),
            material("Edge", (0.2, 0.2, 0.2)),
        ],
    )
    scene.openmarch_stretch_x = True
    scene.openmarch_stretch_x_range = (-0.5, 0.5)
    scene.openmarch_stretch_y = True
    scene.openmarch_stretch_y_range = (-1.1, 1.1)
    return scene


TEMPLATES = {
    "equipment-flag-pole": flag_pole,
    "prop-flat": flat,
    "floor-prop-panel": floor_panel,
}


def main():
    module = load_addon()
    core = sys.modules[module.__name__ + ".core"]

    prefs = bpy.context.preferences.addons["openmarch_tools"].preferences
    assert prefs.license == "LicenseRef-Proprietary", prefs.license

    os.makedirs(os.path.join(KIT, "templates"), exist_ok=True)
    os.makedirs(os.path.join(KIT, "examples"), exist_ok=True)
    for name, build in TEMPLATES.items():
        scene = build()
        rows = core.preflight(bpy.context)
        for row in rows:
            print(f"  {name}: {row['level']} {row['code']}: {row['text']}")
        if rows:
            raise SystemExit(f"{name}: pre-flight found {[r['code'] for r in rows]}")
        assert "itemId" not in core.om_data(scene)
        blend = os.path.join(KIT, "templates", name + ".blend")
        if os.path.exists(blend):
            os.remove(blend)  # else Blender keeps the old one as .blend1
        bpy.ops.wm.save_as_mainfile(filepath=blend, compress=True, copy=True)

        scene.openmarch_item_id = str(uuid.uuid5(ID_NAMESPACE, name))
        glb = os.path.join(KIT, "examples", name + ".glb")
        result = bpy.ops.openmarch.export(filepath=glb, license="CC0-1.0")
        if "FINISHED" not in result:
            raise SystemExit(f"{name}: export failed")
        print(f"built {name}: {blend}, {glb}")

    # Exported without a license, the preferences' "All rights reserved" goes in.
    reset_scene().openmarch_kind = "prop"
    probe = os.path.join(bpy.app.tempdir, "license-probe.glb")
    bpy.ops.mesh.primitive_cube_add(size=1)
    bpy.ops.openmarch.export(filepath=probe)
    assert core.om_data(bpy.context.scene)["license"] == "LicenseRef-Proprietary"

    preset_dir = os.path.join(KIT, "presets", "operator", "export_scene.gltf")
    os.makedirs(preset_dir, exist_ok=True)
    with open(os.path.join(preset_dir, "OpenMarch.py"), "w", encoding="utf-8", newline="\n") as f:
        f.write(core.preset_text())
    print("Blender", bpy.app.version_string)


main()

# SPDX-License-Identifier: GPL-3.0-or-later
#
# OpenMarch Tools: author Blender models that import cleanly into OpenMarch.
# Copyright (C) 2026 OpenMarch contributors
#
# This program is free software: you can redistribute it and/or modify it
# under the terms of the GNU General Public License as published by the Free
# Software Foundation, either version 3 of the License, or (at your option)
# any later version.
#
# This program is distributed in the hope that it will be useful, but WITHOUT
# ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or
# FITNESS FOR A PARTICULAR PURPOSE. See the GNU General Public License for
# more details.
#
# You should have received a copy of the GNU General Public License along with
# this program. If not, see <https://www.gnu.org/licenses/>.

# cspell:words bpy mathutils depsgraph idblock
"""What the add-on writes and checks, without any UI.

Everything OpenMarch reads lives in one custom property, ``openmarch``, which
Blender's glTF exporter writes as ``extras.openmarch`` when custom properties
are on:

- on the scene (glTF ``scenes[0].extras``): ``kind``, ``itemId``,
  ``kitVersion``, ``license`` and ``stretch`` (``{x, y, z}``, each ``[a, b]``
  in meters along the exported, Y-up axes);
- on a material: ``artworkSlot`` (``{id, widthM, heightM}``).

Grips and other attach points are empties named ``OM_<name>``. The app's
grip frame has +Z along the pole or bell; Blender's Y-up export turns an
empty's local -Y axis into that +Z, so ``add_point`` aims -Y along the item.
"""

import json
import math
import os
import re
import uuid

import bpy
from mathutils import Vector

KIT_VERSION = "1.0.0"
PROPERTY = "openmarch"

with open(os.path.join(os.path.dirname(__file__), "rules.json"), encoding="utf-8") as _file:
    RULES = json.load(_file)

# The kinds the add-on sets. Garments wait for the uniform section, which
# needs the om-pose bodies and rig (legal gate C1.2).
KINDS = (
    ("prop", "Prop", "Something on the field: a flat, a riser, a backdrop"),
    ("equipment", "Equipment", "Something a performer holds: a pole, a rifle, a sabre"),
    ("floorProp", "Floor prop", "A tarp or panel lying on the floor"),
    ("baseFloor", "Base floor", "The floor of the whole performance area"),
)
KIND_IDS = tuple(k[0] for k in KINDS)

LICENSE_PROPRIETARY = "LicenseRef-Proprietary"
LICENSES = (
    (LICENSE_PROPRIETARY, "All rights reserved", "Others may not reuse the model"),
    ("CC0-1.0", "CC0 1.0", "Public domain dedication: anyone may reuse it"),
    ("CC-BY-4.0", "CC BY 4.0", "Anyone may reuse it with credit"),
    ("OTHER", "Other", "Another SPDX license id"),
)

OM_NAME = re.compile(r"^OM_[A-Za-z0-9_]+$")
OM_LIKE = re.compile(r"^OM[_.\-\s]", re.IGNORECASE)
UUID_RE = re.compile(r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$", re.IGNORECASE)
LICENSE_ID = re.compile(r"^(LicenseRef-[A-Za-z0-9.-]+|[A-Za-z0-9][A-Za-z0-9.+-]*)$")

# Custom properties the glTF exporter never writes.
_EXPORTER_SKIPS = {PROPERTY, "cycles", "cycles_visibility", "cycles_curves", "glTF2ExportSettings"}

# Blender's glTF exporter, as "Export for OpenMarch" runs it. The kit's
# "OpenMarch" export preset is written from this table.
GLTF_SETTINGS = {
    "export_format": "GLB",
    "export_yup": True,
    "export_extras": True,
    "export_apply": True,
    "export_draco_mesh_compression_enable": False,
    "export_animations": False,
    "export_morph": False,
    "export_cameras": False,
    "export_lights": False,
    "use_active_scene": True,
}


# ------------------------------------------------------------ custom property


def _plain(value):
    """An ID property as plain Python data."""
    if hasattr(value, "to_dict"):
        return {k: _plain(v) for k, v in value.to_dict().items()}
    if hasattr(value, "to_list"):
        return [_plain(v) for v in value.to_list()]
    if isinstance(value, dict):
        return {k: _plain(v) for k, v in value.items()}
    if isinstance(value, (list, tuple)):
        return [_plain(v) for v in value]
    return value


def om_data(idblock):
    """The ``openmarch`` custom property as a plain dict (empty when unset)."""
    value = _plain(idblock.get(PROPERTY))
    return value if isinstance(value, dict) else {}


def set_om_data(idblock, data):
    if data:
        idblock[PROPERTY] = data
    elif PROPERTY in idblock:
        del idblock[PROPERTY]


def update_om(idblock, **changes):
    """Sets keys of the ``openmarch`` property; ``None`` removes one."""
    data = om_data(idblock)
    for key, value in changes.items():
        if value is None:
            data.pop(key, None)
        else:
            data[key] = value
    set_om_data(idblock, data)


# ------------------------------------------------------------- axes and zones


def meters(value):
    """A length as stored: rounded to the micrometer, which also drops the
    float32 noise of Blender's vector properties."""
    return round(float(value), 6)


def to_gltf(v):
    """A Blender (Z-up) vector in the exported Y-up axes."""
    return (v[0], v[2], -v[1])


def stretch_zone(scene, axis):
    """The stretch zone along a Blender axis (``"x"``, ``"y"``, ``"z"``)."""
    stretch = om_data(scene).get("stretch") or {}
    if axis == "x":
        zone = stretch.get("x")
    elif axis == "z":
        zone = stretch.get("y")
    else:
        g = stretch.get("z")
        zone = None if g is None else [-g[1], -g[0]]
    if isinstance(zone, list) and len(zone) == 2:
        return (float(zone[0]), float(zone[1]))
    return None


def set_stretch_zone(scene, axis, zone):
    """Sets (or with ``None`` clears) the zone along a Blender axis."""
    stretch = dict(om_data(scene).get("stretch") or {})
    if axis == "x":
        key, value = "x", zone
    elif axis == "z":
        key, value = "y", zone
    else:
        key, value = "z", None if zone is None else (-zone[1], -zone[0])
    if value is None:
        stretch.pop(key, None)
    else:
        stretch[key] = [meters(value[0]), meters(value[1])]
    update_om(scene, stretch=stretch or None)


def artwork_slot(material):
    slot = om_data(material).get("artworkSlot")
    return slot if isinstance(slot, dict) else None


def set_artwork_slot(material, slot_id=None, width=None, height=None, enabled=True):
    if not enabled:
        update_om(material, artworkSlot=None)
        return
    slot = artwork_slot(material) or {
        "id": slot_name(material.name),
        "widthM": 1.0,
        "heightM": 1.0,
    }
    if slot_id is not None:
        slot["id"] = slot_id
    if width is not None:
        slot["widthM"] = meters(width)
    if height is not None:
        slot["heightM"] = meters(height)
    update_om(material, artworkSlot=slot)


def slot_name(text):
    """A slot id from a material name: lowercase letters, digits and dashes."""
    return re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-") or "artwork"


# ---------------------------------------------------------------- measuring


class Measurement:
    def __init__(self):
        self.lo = [math.inf] * 3
        self.hi = [-math.inf] * 3
        self.triangles = 0
        self.rigged = []
        # material -> {"lo", "hi" (Blender world), "uv": every user has UVs}
        self.materials = {}

    @property
    def size(self):
        """Bounds in the exported axes, in meters; None with no geometry."""
        if self.lo[0] == math.inf:
            return None
        return tuple(h - l for l, h in zip(self.lo, self.hi))


GEOMETRY_TYPES = {"MESH", "CURVE", "SURFACE", "META", "FONT"}


def exported_objects(context):
    """Objects the exporter writes: everything in the active view layer."""
    return list(context.view_layer.objects)


def measure(context):
    """Bounds, triangles and material use, as the exporter will write them."""
    m = Measurement()
    depsgraph = context.evaluated_depsgraph_get()
    for obj in exported_objects(context):
        if obj.type == "ARMATURE" or any(mod.type == "ARMATURE" for mod in getattr(obj, "modifiers", [])):
            m.rigged.append(obj.name)
        if obj.type not in GEOMETRY_TYPES:
            continue
        evaluated = obj.evaluated_get(depsgraph)
        mesh = evaluated.to_mesh()
        try:
            if mesh is None or not mesh.polygons:
                continue
            mesh.calc_loop_triangles()
            m.triangles += len(mesh.loop_triangles)
            world = evaluated.matrix_world
            points = [world @ v.co for v in mesh.vertices]
            for p in points:
                g = to_gltf(p)
                for i in range(3):
                    m.lo[i] = min(m.lo[i], g[i])
                    m.hi[i] = max(m.hi[i], g[i])
            has_uv = len(mesh.uv_layers) > 0
            # The original object's slots: an evaluated copy's materials are copies too.
            slots = obj.material_slots
            for poly in mesh.polygons:
                if poly.material_index >= len(slots):
                    continue
                material = slots[poly.material_index].material
                if material is None:
                    continue
                entry = m.materials.setdefault(
                    material,
                    {"lo": [math.inf] * 3, "hi": [-math.inf] * 3, "uv": True},
                )
                entry["uv"] = entry["uv"] and has_uv
                for index in poly.vertices:
                    p = points[index]
                    for i in range(3):
                        entry["lo"][i] = min(entry["lo"][i], p[i])
                        entry["hi"][i] = max(entry["hi"][i], p[i])
        finally:
            evaluated.to_mesh_clear()
    return m


def scene_bounds(context):
    """World bounds in Blender axes, or None."""
    m = measure(context)
    if m.size is None:
        return None
    lo = to_blender(m.lo)
    hi = to_blender(m.hi)
    return (
        Vector((min(lo[0], hi[0]), min(lo[1], hi[1]), min(lo[2], hi[2]))),
        Vector((max(lo[0], hi[0]), max(lo[1], hi[1]), max(lo[2], hi[2]))),
    )


def to_blender(g):
    return (g[0], -g[2], g[1])


def material_size(context, material):
    """The width and height of the geometry using a material, in meters.

    A surface lying flat (thinnest along Z) is X wide by Y deep, as seen from
    above with the front at the bottom; an upright one is its horizontal
    extent wide by its Z extent tall.
    """
    entry = measure(context).materials.get(material)
    if not entry:
        return None
    sx, sy, sz = (h - l for l, h in zip(entry["lo"], entry["hi"]))
    if sz <= min(sx, sy):
        return sx, sy
    return max(sx, sy), sz


# --------------------------------------------------------------- attach points


def point_rotation(direction):
    """The quaternion that aims an empty's -Y axis along ``direction``."""
    return Vector((0.0, -1.0, 0.0)).rotation_difference(Vector(direction).normalized())


def longest_axis(context):
    bounds = scene_bounds(context)
    if bounds is None:
        return (0.0, 0.0, 1.0)
    size = bounds[1] - bounds[0]
    axis = max(range(3), key=lambda i: size[i])
    return tuple(1.0 if i == axis else 0.0 for i in range(3))


def add_point(context, name, location, direction):
    if not OM_NAME.match(name):
        raise ValueError(f"{name} must be OM_ followed by letters, digits or underscores")
    if name in bpy.data.objects:
        raise ValueError(f"{name} already exists")
    empty = bpy.data.objects.new(name, None)
    empty.empty_display_type = "ARROWS"
    empty.empty_display_size = 0.15
    empty.location = location
    empty.rotation_mode = "QUATERNION"
    empty.rotation_quaternion = point_rotation(direction)
    context.scene.collection.objects.link(empty)
    return empty


def point_direction(obj):
    """Where an empty's grip +Z points once exported, in Blender world axes."""
    return (obj.matrix_world.to_3x3() @ Vector((0.0, -1.0, 0.0))).normalized()


# ------------------------------------------------------------------- pre-flight

# The report groups, as the app's import review names them.
CANT = "cant"
CHOICE = "choice"
FIXED = "fixed"
NOTE = "note"
LEVELS = (CANT, CHOICE, FIXED, NOTE)
LEVEL_NAMES = {
    CANT: "Can't import",
    CHOICE: "Needs your choice",
    FIXED: "Fixed for you",
    NOTE: "Note",
}


def _row(level, code, text):
    return {"level": level, "code": code, "text": text}


def _fmt(meters):
    return f"{meters:.3g} m"


def preflight(context):
    """The import review's findings, predicted before exporting.

    Mirrors ``model-import/pipeline.ts``: rows at ``cant`` stop the import;
    ``choice`` rows make the app ask (pre-selected); ``fixed`` and ``note``
    rows don't stop anything.
    """
    rows = []
    scene = context.scene
    data = om_data(scene)
    kind = data.get("kind")
    if kind is None:
        rows.append(_row(CHOICE, "kind", "No kind set: OpenMarch will ask what this is."))
    elif kind not in KIND_IDS:
        rows.append(_row(NOTE, "unknownStampKind", f"Kind {kind!r} isn't one OpenMarch knows; it will ask."))
        kind = None

    item_id = data.get("itemId")
    if item_id is not None and not (isinstance(item_id, str) and UUID_RE.match(item_id)):
        rows.append(_row(NOTE, "invalidOpenMarchData", "The item id isn't a UUID; make a new one."))

    m = measure(context)
    size = m.size
    if m.triangles == 0 or size is None:
        rows.append(_row(CANT, "noGeometry", "Nothing to export: the scene has no geometry."))
    if m.rigged:
        rows.append(
            _row(CANT, "rigNotAllowed", "Armatures and skinned meshes are only for Garments: " + ", ".join(m.rigged))
        )

    om_names = set()
    for obj in exported_objects(context):
        if OM_NAME.match(obj.name):
            om_names.add(obj.name)
        elif OM_LIKE.match(obj.name):
            rows.append(
                _row(NOTE, "misnamed", f"{obj.name} is ignored: OM_ names use only letters, digits and _.")
            )
    if kind == "equipment" and "OM_grip_R" not in om_names:
        rows.append(_row(CHOICE, "missingGrip", "No OM_grip_R: OpenMarch will guess where it's held."))
    if "OM_grip_R" in om_names and size is not None:
        grip = point_direction(bpy.data.objects["OM_grip_R"])
        axis = Vector(longest_axis(context))
        if abs(grip.dot(axis)) < math.cos(math.radians(10)):
            rows.append(
                _row(NOTE, "gripDirection", "OM_grip_R doesn't point along the longest side; check its -Y axis.")
            )

    if kind and size is not None:
        rows.extend(_size_rows(kind, size, m.triangles))
        rows.extend(_texture_rows(kind, m))
        if not stretch_axes(scene):
            rows.append(_row(NOTE, "noStretchZones", "No stretch zones: it keeps its modeled size."))

    rows.extend(_stretch_rows(scene))
    rows.extend(_slot_rows(m))

    if not math.isclose(scene.unit_settings.scale_length, 1.0):
        rows.append(_row(NOTE, "unitScale", "Unit scale isn't 1: the export writes Blender units as meters."))
    if _foreign_properties(context):
        rows.append(_row(FIXED, "extrasStripped", "Other custom properties are exported and then dropped."))
    return rows


def stretch_axes(scene):
    stretch = om_data(scene).get("stretch") or {}
    return [a for a in ("x", "y", "z") if stretch.get(a)]


def _size_rows(kind, size, triangles):
    rows = []
    largest = max(size)
    plausible = RULES["plausibleSize"][kind]

    def fits(value):
        return plausible["minM"] <= value <= plausible["maxM"]

    if not fits(largest):
        units = [c["unit"] for c in RULES["unitConversions"] if fits(largest * c["factor"])]
        if units:
            rows.append(
                _row(
                    CHOICE,
                    "unitConversion",
                    f"{_fmt(largest)} is outside {plausible['minM']}-{plausible['maxM']} m: "
                    f"OpenMarch will offer to read it as {units[0]}.",
                )
            )
        else:
            rows.append(
                _row(
                    NOTE,
                    "sizeOutOfRange",
                    f"{_fmt(largest)} is outside {plausible['minM']}-{plausible['maxM']} m for this kind.",
                )
            )

    x, y, z = size
    flat_prop = kind == "prop" and min(size) < RULES["flatRatio"] * largest
    floor = kind in ("floorProp", "baseFloor")
    suspected = (z < y and z <= x) if floor else (z > x and z > y and z > y * RULES["zUpFactor"])
    if suspected and not flat_prop:
        rows.append(
            _row(
                CHOICE,
                "rotateToYUp",
                "It looks lying down (exported Z-up): stand it on Blender's Z axis, "
                "deepest along X rather than Y.",
            )
        )

    cap = RULES["triangleCaps"][kind]
    limit = cap * RULES["triangleRejectFactor"]
    if triangles > limit:
        rows.append(_row(CANT, "overTriangleCap", f"{triangles} triangles: over {limit}, the most for this kind."))
    elif triangles > cap:
        rows.append(_row(CHOICE, "simplify", f"{triangles} triangles: over {cap}, so OpenMarch will simplify."))
    return rows


def _texture_rows(kind, m):
    cap = RULES["textureCaps"][kind]
    big = []
    for material in m.materials:
        if not material.use_nodes or material.node_tree is None:
            continue
        for node in material.node_tree.nodes:
            image = getattr(node, "image", None)
            if node.type == "TEX_IMAGE" and image is not None and max(image.size) > cap:
                big.append(image.name)
    if not big:
        return []
    return [_row(FIXED, "texturesDownsized", f"Textures over {cap} px are downsized: " + ", ".join(sorted(set(big))))]


def _stretch_rows(scene):
    stretch = om_data(scene).get("stretch")
    if stretch is None:
        return []
    for axis in ("x", "y", "z"):
        zone = stretch.get(axis)
        if zone is not None and not (isinstance(zone, list) and len(zone) == 2 and zone[0] < zone[1]):
            return [_row(NOTE, "invalidOpenMarchData", "A stretch zone's start must be below its end; all are ignored.")]
    return []


def _slot_rows(m):
    rows = []
    seen = set()
    for material in bpy.data.materials:
        slot = artwork_slot(material)
        if slot is None:
            continue
        name = material.name
        sid = slot.get("id")
        if not isinstance(sid, str) or not sid or not _positive(slot.get("widthM")) or not _positive(slot.get("heightM")):
            rows.append(_row(NOTE, "invalidOpenMarchData", f"{name}: a slot needs an id, a width and a height."))
            continue
        if sid in seen:
            rows.append(_row(NOTE, "invalidOpenMarchData", f"{name}: slot id {sid} is used twice; one is ignored."))
            continue
        seen.add(sid)
        use = m.materials.get(material)
        if use is None:
            rows.append(_row(NOTE, "slotDropped", f"Slot {sid} is on {name}, which nothing uses."))
        elif not use["uv"]:
            rows.append(_row(NOTE, "slotWithoutUVs", f"Slot {sid}: its geometry has no UV map for the artwork."))
    return rows


def _positive(value):
    return isinstance(value, (int, float)) and math.isfinite(value) and value > 0


def _foreign_properties(context):
    blocks = [context.scene]
    for obj in exported_objects(context):
        blocks.append(obj)
        if obj.data is not None:
            blocks.append(obj.data)
    blocks.extend(_exported_materials(context))
    for block in blocks:
        for key in block.keys():
            if key not in _EXPORTER_SKIPS and not key.startswith("_"):
                return True
    return False


def _exported_materials(context):
    found = []
    for obj in exported_objects(context):
        for slot in getattr(obj, "material_slots", []):
            if slot.material is not None and slot.material not in found:
                found.append(slot.material)
    return found


# ------------------------------------------------------------------ exporting


def new_item_id():
    return str(uuid.uuid4())


def stamp(scene, license_id):
    """Writes the Starter kit stamp; keeps an existing item id."""
    data = om_data(scene)
    item_id = data.get("itemId")
    if not (isinstance(item_id, str) and UUID_RE.match(item_id)):
        data["itemId"] = new_item_id()
    data["kitVersion"] = KIT_VERSION
    data["license"] = license_id
    set_om_data(scene, data)


def export_glb(context, filepath, license_id, author=""):
    """Stamps the scene and exports it as OpenMarch reads it."""
    if not LICENSE_ID.match(license_id):
        raise ValueError(f"{license_id} isn't an SPDX license id")
    if context.object is not None and context.object.mode != "OBJECT":
        bpy.ops.object.mode_set(mode="OBJECT")
    stamp(context.scene, license_id)
    settings = dict(GLTF_SETTINGS)
    if author:
        settings["export_copyright"] = author
    result = bpy.ops.export_scene.gltf(filepath=filepath, **settings)
    if "FINISHED" not in result:
        raise RuntimeError("Blender's glTF exporter did not finish")


def preset_text():
    """Blender's operator preset for File > Export > glTF, as a Python file."""
    lines = [
        "# The OpenMarch glTF export preset (Starter kit "
        + KIT_VERSION
        + "). Written by the kit build from openmarch_tools/core.py.",
        "import bpy",
        "op = bpy.context.active_operator",
        "",
    ]
    for key, value in GLTF_SETTINGS.items():
        lines.append(f"op.{key} = {value!r}")
    return "\n".join(lines) + "\n"

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

# cspell:words bpy idname checkmark
"""The sidebar panel, operators and preferences.

Every property here has a getter and a setter over the ``openmarch`` custom
property (see ``core.py``), so Blender stores nothing else in the file and
the exporter writes nothing else.
"""

import bpy
from bpy.props import BoolProperty, EnumProperty, FloatVectorProperty, StringProperty
from bpy_extras.io_utils import ExportHelper

from . import core

AXES = ("x", "y", "z")

# The last pre-flight per scene, for the panel.
_last_check = {}


def _prefs(context):
    addon = context.preferences.addons.get(__package__)
    return addon.preferences if addon else None


def default_license(context):
    prefs = _prefs(context)
    if prefs is None:
        return core.LICENSE_PROPRIETARY
    if prefs.license == "OTHER":
        return prefs.license_other.strip() or core.LICENSE_PROPRIETARY
    return prefs.license


# ----------------------------------------------------------------- scene props

_KIND_ITEMS = [("NONE", "Not set", "OpenMarch will ask what this is", 0)] + [
    (kid, name, desc, i + 1) for i, (kid, name, desc) in enumerate(core.KINDS)
]


def _get_kind(scene):
    kind = core.om_data(scene).get("kind")
    for item in _KIND_ITEMS:
        if item[0] == kind:
            return item[3]
    return 0


def _set_kind(scene, value):
    kind = next(item[0] for item in _KIND_ITEMS if item[3] == value)
    core.update_om(scene, kind=None if kind == "NONE" else kind)


def _get_item_id(scene):
    value = core.om_data(scene).get("itemId")
    return value if isinstance(value, str) else ""


def _set_item_id(scene, value):
    value = value.strip().lower()
    core.update_om(scene, itemId=value or None)


def _zone_getters(axis):
    def get_on(scene):
        return core.stretch_zone(scene, axis) is not None

    def set_on(scene, value):
        if not value:
            core.set_stretch_zone(scene, axis, None)
            return
        if core.stretch_zone(scene, axis) is not None:
            return
        # The middle third of the model along that axis.
        bounds = core.scene_bounds(bpy.context)
        i = AXES.index(axis)
        lo, hi = (bounds[0][i], bounds[1][i]) if bounds else (0.0, 1.0)
        third = (hi - lo) / 3 or 1.0
        core.set_stretch_zone(scene, axis, (lo + third, hi - third if hi > lo else lo + 2 * third))

    def get_range(scene):
        zone = core.stretch_zone(scene, axis)
        return zone if zone else (0.0, 0.0)

    def set_range(scene, value):
        core.set_stretch_zone(scene, axis, (value[0], value[1]))

    return get_on, set_on, get_range, set_range


# -------------------------------------------------------------- material props


def _get_slot_on(material):
    return core.artwork_slot(material) is not None


def _set_slot_on(material, value):
    core.set_artwork_slot(material, enabled=value)


def _get_slot_id(material):
    slot = core.artwork_slot(material)
    return str(slot.get("id", "")) if slot else ""


def _set_slot_id(material, value):
    core.set_artwork_slot(material, slot_id=value.strip())


def _get_slot_size(material):
    slot = core.artwork_slot(material)
    if not slot:
        return (0.0, 0.0)
    return (float(slot.get("widthM", 0.0)), float(slot.get("heightM", 0.0)))


def _set_slot_size(material, value):
    core.set_artwork_slot(material, width=value[0], height=value[1])


def _register_props():
    bpy.types.Scene.openmarch_kind = EnumProperty(
        name="Kind",
        description="What the model is in OpenMarch",
        items=_KIND_ITEMS,
        get=_get_kind,
        set=_set_kind,
    )
    bpy.types.Scene.openmarch_item_id = StringProperty(
        name="Item id",
        description="Identifies the item across exports, so a re-import becomes a new version",
        get=_get_item_id,
        set=_set_item_id,
    )
    for axis in AXES:
        get_on, set_on, get_range, set_range = _zone_getters(axis)
        setattr(
            bpy.types.Scene,
            f"openmarch_stretch_{axis}",
            BoolProperty(
                name=f"Stretch along {axis.upper()}",
                description="The slab between start and end scales; the rest moves rigidly",
                get=get_on,
                set=set_on,
            ),
        )
        setattr(
            bpy.types.Scene,
            f"openmarch_stretch_{axis}_range",
            FloatVectorProperty(
                name=f"{axis.upper()} zone",
                description="Start and end of the zone, in world coordinates",
                size=2,
                unit="LENGTH",
                get=get_range,
                set=set_range,
            ),
        )
    bpy.types.Material.openmarch_slot = BoolProperty(
        name="Artwork slot",
        description="Artwork can be placed on this material; its UV map spans the printable area",
        get=_get_slot_on,
        set=_set_slot_on,
    )
    bpy.types.Material.openmarch_slot_id = StringProperty(
        name="Slot id",
        description="The slot's name in OpenMarch, such as front or top",
        get=_get_slot_id,
        set=_set_slot_id,
    )
    bpy.types.Material.openmarch_slot_size = FloatVectorProperty(
        name="Size",
        description="The printable area's real width and height",
        size=2,
        unit="LENGTH",
        min=0.0,
        get=_get_slot_size,
        set=_set_slot_size,
    )


def _unregister_props():
    names = ["openmarch_kind", "openmarch_item_id"]
    for axis in AXES:
        names += [f"openmarch_stretch_{axis}", f"openmarch_stretch_{axis}_range"]
    for name in names:
        delattr(bpy.types.Scene, name)
    for name in ("openmarch_slot", "openmarch_slot_id", "openmarch_slot_size"):
        delattr(bpy.types.Material, name)


# ------------------------------------------------------------------ preferences


class OPENMARCH_AddonPreferences(bpy.types.AddonPreferences):
    bl_idname = __package__

    license: EnumProperty(
        name="Export license",
        description="The license stamped into every export",
        items=core.LICENSES,
        default=core.LICENSE_PROPRIETARY,
    )
    license_other: StringProperty(
        name="SPDX id",
        description="An SPDX license id, such as CC-BY-SA-4.0",
    )
    author: StringProperty(
        name="Author",
        description="Written as the glTF copyright, which OpenMarch shows as the author",
    )

    def draw(self, context):
        layout = self.layout
        layout.prop(self, "license")
        if self.license == "OTHER":
            layout.prop(self, "license_other")
        layout.prop(self, "author")


# -------------------------------------------------------------------- operators

_DIRECTIONS = (
    ("AUTO", "Longest side", "Along the model's longest side"),
    ("POS_X", "+X", ""),
    ("NEG_X", "-X", ""),
    ("POS_Y", "+Y", ""),
    ("NEG_Y", "-Y", ""),
    ("POS_Z", "+Z", ""),
    ("NEG_Z", "-Z", ""),
)
_DIRECTION_VECTORS = {
    "POS_X": (1, 0, 0),
    "NEG_X": (-1, 0, 0),
    "POS_Y": (0, 1, 0),
    "NEG_Y": (0, -1, 0),
    "POS_Z": (0, 0, 1),
    "NEG_Z": (0, 0, -1),
}


class OPENMARCH_OT_add_point(bpy.types.Operator):
    """Add an OM_ empty: a grip or another attach point"""

    bl_idname = "openmarch.add_point"
    bl_label = "Add OpenMarch point"
    bl_options = {"REGISTER", "UNDO"}

    point: EnumProperty(
        name="Point",
        items=(
            ("GRIP_R", "Right grip", "OM_grip_R: where the right hand holds it"),
            ("GRIP_L", "Left grip", "OM_grip_L: where the left hand holds it"),
            ("OTHER", "Other", "Another attach point, OM_<name>"),
        ),
    )
    name: StringProperty(name="Name", description="After OM_: letters, digits and _", default="point")
    direction: EnumProperty(
        name="Points along",
        description="Where the point's +Z (the pole or bell) runs",
        items=_DIRECTIONS,
    )
    location: FloatVectorProperty(name="Location", subtype="TRANSLATION", unit="LENGTH")

    def invoke(self, context, event):
        self.location = context.scene.cursor.location
        return self.execute(context)

    def execute(self, context):
        name = {"GRIP_R": "OM_grip_R", "GRIP_L": "OM_grip_L"}.get(self.point, f"OM_{self.name}")
        direction = (
            core.longest_axis(context) if self.direction == "AUTO" else _DIRECTION_VECTORS[self.direction]
        )
        try:
            empty = core.add_point(context, name, self.location, direction)
        except ValueError as error:
            self.report({"ERROR"}, str(error))
            return {"CANCELLED"}
        for obj in context.selected_objects:
            obj.select_set(False)
        empty.select_set(True)
        context.view_layer.objects.active = empty
        return {"FINISHED"}


class OPENMARCH_OT_new_item_id(bpy.types.Operator):
    """Give this file a new item id, for a copy that should be its own Library item"""

    bl_idname = "openmarch.new_item_id"
    bl_label = "New item id"
    bl_options = {"REGISTER", "UNDO"}

    def execute(self, context):
        core.update_om(context.scene, itemId=core.new_item_id())
        return {"FINISHED"}


class OPENMARCH_OT_slot_from_geometry(bpy.types.Operator):
    """Set the slot's size from the geometry using this material"""

    bl_idname = "openmarch.slot_from_geometry"
    bl_label = "Size from geometry"
    bl_options = {"REGISTER", "UNDO"}

    @classmethod
    def poll(cls, context):
        obj = context.object
        return obj is not None and obj.active_material is not None

    def execute(self, context):
        material = context.object.active_material
        size = core.material_size(context, material)
        if size is None:
            self.report({"WARNING"}, f"Nothing in the scene uses {material.name}")
            return {"CANCELLED"}
        core.set_artwork_slot(material, width=size[0], height=size[1])
        return {"FINISHED"}


class OPENMARCH_OT_check(bpy.types.Operator):
    """Predict what OpenMarch's import review will say"""

    bl_idname = "openmarch.check"
    bl_label = "Check for OpenMarch"

    def execute(self, context):
        rows = core.preflight(context)
        _last_check[context.scene.name_full] = rows
        if any(r["level"] == core.CANT for r in rows):
            self.report({"ERROR"}, "OpenMarch can't import this yet; see the panel")
        elif any(r["level"] == core.CHOICE for r in rows):
            self.report({"WARNING"}, "OpenMarch will ask about something; see the panel")
        else:
            self.report({"INFO"}, "Ready for OpenMarch")
        return {"FINISHED"}


class OPENMARCH_OT_export(bpy.types.Operator, ExportHelper):
    """Check, stamp and export a GLB for OpenMarch"""

    bl_idname = "openmarch.export"
    bl_label = "Export for OpenMarch"
    bl_options = {"PRESET"}

    filename_ext = ".glb"
    filter_glob: StringProperty(default="*.glb", options={"HIDDEN"})

    license: EnumProperty(name="License", items=core.LICENSES, default=core.LICENSE_PROPRIETARY)
    license_other: StringProperty(name="SPDX id")
    author: StringProperty(name="Author")
    use_preferences: BoolProperty(
        name="From preferences",
        description="Use the license and author set in the add-on's preferences",
        default=True,
        options={"HIDDEN", "SKIP_SAVE"},
    )

    def invoke(self, context, event):
        self._fill_from_preferences(context)
        self.use_preferences = False
        return ExportHelper.invoke(self, context, event)

    def _fill_from_preferences(self, context):
        prefs = _prefs(context)
        if prefs is None:
            return
        self.license = prefs.license
        self.license_other = prefs.license_other
        self.author = prefs.author

    def draw(self, context):
        layout = self.layout
        layout.prop(self, "license")
        if self.license == "OTHER":
            layout.prop(self, "license_other")
        layout.prop(self, "author")

    def execute(self, context):
        if self.use_preferences and not self.properties.is_property_set("license"):
            self._fill_from_preferences(context)
        license_id = self.license_other.strip() if self.license == "OTHER" else self.license
        rows = core.preflight(context)
        _last_check[context.scene.name_full] = rows
        blocking = [r for r in rows if r["level"] == core.CANT]
        if blocking:
            self.report({"ERROR"}, "Not exported: " + blocking[0]["text"])
            return {"CANCELLED"}
        try:
            core.export_glb(context, self.filepath, license_id or core.LICENSE_PROPRIETARY, self.author.strip())
        except (ValueError, RuntimeError) as error:
            self.report({"ERROR"}, str(error))
            return {"CANCELLED"}
        if any(r["level"] == core.CHOICE for r in rows):
            self.report({"WARNING"}, "Exported; OpenMarch will ask about something (see the panel)")
        else:
            self.report({"INFO"}, f"Exported {self.filepath}")
        return {"FINISHED"}


# ------------------------------------------------------------------------ panel


class _Panel:
    bl_space_type = "VIEW_3D"
    bl_region_type = "UI"
    bl_category = "OpenMarch"


class OPENMARCH_PT_main(_Panel, bpy.types.Panel):
    bl_idname = "OPENMARCH_PT_main"
    bl_label = "OpenMarch Tools"

    def draw(self, context):
        layout = self.layout
        scene = context.scene
        layout.prop(scene, "openmarch_kind")
        row = layout.row(align=True)
        item_id = scene.openmarch_item_id
        row.label(text=f"Item id: {item_id[:8]}…" if item_id else "Item id: set on first export")
        row.operator(OPENMARCH_OT_new_item_id.bl_idname, text="", icon="FILE_REFRESH")
        layout.label(text=f"License: {default_license(context)} (preferences)")
        layout.label(text=f"Kit {core.KIT_VERSION}")


class OPENMARCH_PT_points(_Panel, bpy.types.Panel):
    bl_label = "Grips and points"
    bl_parent_id = "OPENMARCH_PT_main"

    def draw(self, context):
        layout = self.layout
        col = layout.column(align=True)
        for point, text in (("GRIP_R", "Add right grip"), ("GRIP_L", "Add left grip"), ("OTHER", "Add point")):
            op = col.operator(OPENMARCH_OT_add_point.bl_idname, text=text, icon="EMPTY_ARROWS")
            op.point = point
        names = sorted(o.name for o in context.view_layer.objects if core.OM_NAME.match(o.name))
        for name in names:
            layout.label(text=name, icon="EMPTY_DATA")
        layout.label(text="A point's -Y axis runs along the pole or bell.", icon="INFO")


class OPENMARCH_PT_slots(_Panel, bpy.types.Panel):
    bl_label = "Artwork slots"
    bl_parent_id = "OPENMARCH_PT_main"

    def draw(self, context):
        layout = self.layout
        obj = context.object
        material = obj.active_material if obj else None
        if material is None:
            layout.label(text="Select an object with a material.")
        else:
            layout.prop(material, "openmarch_slot", text=f"Slot on {material.name}")
            if material.openmarch_slot:
                layout.prop(material, "openmarch_slot_id")
                layout.prop(material, "openmarch_slot_size")
                layout.operator(OPENMARCH_OT_slot_from_geometry.bl_idname)
        for mat in bpy.data.materials:
            slot = core.artwork_slot(mat)
            if slot:
                layout.label(text=f"{slot.get('id')}: {mat.name}", icon="IMAGE_DATA")


class OPENMARCH_PT_stretch(_Panel, bpy.types.Panel):
    bl_label = "Stretch zones"
    bl_parent_id = "OPENMARCH_PT_main"
    bl_options = {"DEFAULT_CLOSED"}

    def draw(self, context):
        layout = self.layout
        scene = context.scene
        for axis in AXES:
            row = layout.row()
            row.prop(scene, f"openmarch_stretch_{axis}", text=axis.upper())
            sub = row.row(align=True)
            sub.enabled = getattr(scene, f"openmarch_stretch_{axis}")
            sub.prop(scene, f"openmarch_stretch_{axis}_range", text="")


class OPENMARCH_PT_export(_Panel, bpy.types.Panel):
    bl_label = "Check and export"
    bl_parent_id = "OPENMARCH_PT_main"

    def draw(self, context):
        layout = self.layout
        layout.operator(OPENMARCH_OT_check.bl_idname, icon="CHECKMARK")
        rows = _last_check.get(context.scene.name_full)
        if rows is not None:
            if not rows:
                layout.label(text="Ready for OpenMarch", icon="CHECKMARK")
            icons = {core.CANT: "ERROR", core.CHOICE: "QUESTION", core.FIXED: "MODIFIER", core.NOTE: "INFO"}
            for level in core.LEVELS:
                for r in (r for r in rows if r["level"] == level):
                    layout.label(text=f"{core.LEVEL_NAMES[level]}: {r['text']}", icon=icons[level])
        layout.operator(OPENMARCH_OT_export.bl_idname, icon="EXPORT")


def _menu_export(self, context):
    self.layout.operator(OPENMARCH_OT_export.bl_idname, text="OpenMarch (.glb)")


CLASSES = (
    OPENMARCH_AddonPreferences,
    OPENMARCH_OT_add_point,
    OPENMARCH_OT_new_item_id,
    OPENMARCH_OT_slot_from_geometry,
    OPENMARCH_OT_check,
    OPENMARCH_OT_export,
    OPENMARCH_PT_main,
    OPENMARCH_PT_points,
    OPENMARCH_PT_slots,
    OPENMARCH_PT_stretch,
    OPENMARCH_PT_export,
)


def register():
    for cls in CLASSES:
        bpy.utils.register_class(cls)
    _register_props()
    bpy.types.TOPBAR_MT_file_export.append(_menu_export)


def unregister():
    bpy.types.TOPBAR_MT_file_export.remove(_menu_export)
    _unregister_props()
    for cls in reversed(CLASSES):
        bpy.utils.unregister_class(cls)

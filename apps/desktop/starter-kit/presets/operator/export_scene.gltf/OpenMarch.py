# The OpenMarch glTF export preset (Starter kit 1.0.0). Written by the kit build from openmarch_tools/core.py.
import bpy
op = bpy.context.active_operator

op.export_format = 'GLB'
op.export_yup = True
op.export_extras = True
op.export_apply = True
op.export_draco_mesh_compression_enable = False
op.export_animations = False
op.export_morph = False
op.export_cameras = False
op.export_lights = False
op.use_active_scene = True

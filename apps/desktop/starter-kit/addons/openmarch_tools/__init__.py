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

# bl_info is for Blender's legacy add-on installer; Blender 4.2 and later
# read blender_manifest.toml when the add-on is installed as an extension.
bl_info = {
    "name": "OpenMarch Tools",
    "author": "OpenMarch contributors",
    "version": (1, 0, 0),
    "blender": (4, 2, 0),
    "location": "View3D > Sidebar > OpenMarch; File > Export > OpenMarch (.glb)",
    "description": "Mark grips, artwork slots and stretch zones, check, and export GLBs for OpenMarch",
    "doc_url": "https://openmarch.com",
    "category": "Import-Export",
}

from . import ui  # noqa: E402


def register():
    ui.register()


def unregister():
    ui.unregister()

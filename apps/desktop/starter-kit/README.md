# OpenMarch Blender Starter Kit

Make props and equipment in Blender that import into OpenMarch's Library
with nothing to fix. This kit works with Blender 4.2 LTS and later. Older
versions are untested.

## What's inside

| Folder or file                  | What it is                                                          |
| ------------------------------- | ------------------------------------------------------------------- |
| `openmarch_tools-<version>.zip` | The **OpenMarch Tools** add-on, ready to install                    |
| `templates/`                    | One `.blend` per kind: equipment, prop and floor prop, at real size |
| `examples/`                     | The templates exported for OpenMarch, to import and compare         |
| `artwork-templates/`            | The Artwork templates (SVG and PDF) the app also downloads          |
| `presets/`                      | An "OpenMarch" preset for File ‣ Export ‣ glTF 2.0                  |
| `addons/openmarch_tools/`       | The add-on's source, the same files as the zip                      |

## Install the add-on

1. In Blender, open **Edit ‣ Preferences ‣ Get Extensions**, open the menu
   at the top right and choose **Install from Disk…**. On older versions,
   use **Add-ons ‣ Install…**.
2. Pick `openmarch_tools-<version>.zip`, then enable **OpenMarch Tools**.
3. In the add-on's preferences, choose the **export license** and your
   **author** name. "All rights reserved" is selected until you change it.

The tools are in the 3D Viewport sidebar (**N**), on the **OpenMarch** tab.

## Make a model

1. **Start from a template.** Open the `.blend` for your kind and save a
   copy. Model in meters, at real size. Blender's Z is up; the front faces
   Blender's Front view (−Y).
2. **Set the kind.**
   - **Prop**: on the field, such as a flat or a riser.
   - **Equipment**: held by a performer, such as a pole, rifle or sabre.
   - **Floor prop**: lies on the floor, such as a tarp or panel.
   - **Base floor**: the floor of the whole performance area.

   Uniform pieces (Garments) aren't in this kit yet.

3. **Mark the grips** (Equipment). **Add right grip** and **Add left grip**
   place `OM_grip_R` and `OM_grip_L` at the 3D cursor. `OM_grip_R` is where
   the right hand holds the item. A grip's −Y axis runs along the pole or
   bell, toward its top. Other attach points are named `OM_<name>`, with
   only letters, digits and `_`.
4. **Declare artwork slots.** Select a material that should carry artwork,
   tick **Artwork slot**, give it an id (such as `front` or `top`) and its
   real width and height. **Size from geometry** fills those in. Its UV map
   must span the printable area: 0 to 1 across the width and the height.
   Slot sizes match the Artwork templates, so a 4 × 8 ft panel takes the
   4 × 8 ft template.
5. **Set stretch zones** (optional). A zone is a slab along one axis that
   OpenMarch stretches to fit other sizes; everything outside it moves
   without stretching. Without zones, the model keeps its modeled size.
6. **Check.** **Check for OpenMarch** predicts the import review:
   - **Can't import**: OpenMarch will refuse the file. Export is blocked.
   - **Needs your choice**: OpenMarch will ask, with an answer ready. Fix it
     here and the import is one click.
   - **Fixed for you** and **Note**: nothing to do.
7. **Export.** **Export for OpenMarch** writes a `.glb` with custom
   properties on, Y up, modifiers applied and no compression. It stamps the
   file with its item id, kind, kit version and license.

Then in OpenMarch, use the Library's **Import…** and pick the `.glb`.

## Versions of the same item

The first export gives the file an **item id**. Export again from the same
`.blend` and OpenMarch offers to add it as a new version of that item. To
start a different item from a copy, select **New item id**.

## Without the add-on

Copy `presets/` into your Blender user scripts folder, or add the kit's
folder under **Preferences ‣ File Paths ‣ Script Directories**. Then pick
**OpenMarch** in the glTF export's operator presets. The preset sets the
export options, but it doesn't stamp the license or kit version and runs no
checks.

## Licenses

- The add-on (`addons/` and `openmarch_tools-<version>.zip`) is
  GPL-3.0-or-later. See `addons/openmarch_tools/LICENSE`.
- The templates, examples, Artwork templates, preset and this guide are
  CC0 1.0: use them for anything, with no credit needed. See the `LICENSE`
  in each folder.
- Your models are yours. The license you pick when exporting is stamped into
  the file and shown in OpenMarch.

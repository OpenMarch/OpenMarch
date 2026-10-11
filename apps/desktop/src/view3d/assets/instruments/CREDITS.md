# Instrument mesh credits

Meshes in this folder are baked from third-party models by
`apps/desktop/scripts/view3d-assets/export-horn.py`. Each entry names the
source, its author and license, and what was changed.

## trumpet.json

- Source: "Trumpet" by Kagelok,
  <https://sketchfab.com/3d-models/trumpet-1dc9efd37bf14d1b9d1e3de0ca90435c>
- License: Creative Commons Attribution 4.0 International (CC BY 4.0),
  <https://creativecommons.org/licenses/by/4.0/>
- Changes: moved into the 3D View's instrument frame and scaled to 0.48 m;
  materials mapped to part ids (Gold to the lacquer finish, Silver to
  chrome, Black, White to the pearl buttons); decimated to about 10,800
  triangles (high) and 3,400 (low); positions quantized to 0.1 mm and
  normals to 1/127. Config: `scripts/view3d-assets/trumpet.config.json`.

## mellophone.json, baritone.json, euphonium.json, contra.json

- Source: the valve block (casings, caps, stems and pearl buttons) and the
  mouthpiece with its receiver from "Trumpet" by Kagelok, above, under the
  same CC BY 4.0 license.
- Changes: `scripts/view3d-assets/build-horns.py` scales those parts to each
  horn and adds new tubing, wraps, slides, braces and bells, swept to
  proportions read off side-view product photos (no image, mark or model
  name is used). Then baked like the trumpet: decimated to about 10,100
  triangles (high) and 2,630 (low). Configs:
  `scripts/view3d-assets/<horn>.config.json`.

# 3D View reference demo

`venue-demo.html` is the approved visual reference for the MVP venues. The
project owner reviewed it on 2026-10-04, and it was published as the 3D View
pitch page. Open it in a browser: it loads three.js from a CDN, so it needs a
network connection (the product doesn't).

What to take from it:

- proportions, row counts, rakes and heights of every kit;
- camera seats and their targets;
- lighting preset values (`SKY`, the gym and roof presets);
- techniques: instanced stands and crowd, `bowlOutline`, `ringBand` and
  `bandMesh` for the pro bowl, `clearCrowdAround`, and hiding roofs and
  ceilings from above.

What not to copy:

- **units:** the demo works in feet; the product works in meters (ADR 0002 D-2);
- **structure:** globals in one file, hand-written orbit controls, and the
  pitch text around the demo;
- **the hard-coded field:** the product paints the show's real
  `FieldProperties` (design.md §4).

This folder is excluded from Prettier and cspell. Don't wire it into the build.

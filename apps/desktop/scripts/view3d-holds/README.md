# Hold gallery

Renders one marcher per section in its hold, with its instrument, to PNGs in headless Chromium, with
no Electron, database or display. It uses the real body, `poseArms` and the instrument models, and
places the instrument by the hold exactly as the 3D View does. The hands are drawn orange so they
are easy to check against the instrument, and their palms yellow, so you can see which way each
hand is turned (the body's hands are fists with no fingers or thumb).

```bash
pnpm --filter @openmarch/core build          # once per checkout
node scripts/view3d-holds/shoot.mjs --out /mnt/data/om-capture/holds/my-run
```

Options: `--states up,carry,trail` (default `up`) and `--only Trumpet,Flute` (matches section names).

`--look` draws the instruments as the 3D View does (each part's colors and surface from
`surfaceOf`, the section's color on drum shells, under an environment map) instead of flat check
colors, and swaps the head close-up for a close-up of the instrument. `--shell <hex>` sets the
section color (default `6442ff`), and `--hand R` or `--hand L` frames that hand's grip in the close-up.

`--close <views.json>` shoots close-ups instead of the strips, one PNG per view
(`<out>/<state>/<section>-<view>.png`, 1100 × 825). The file maps a section's file name (`snare`,
`bass-drum`; `all` for every section) to named views:

```json
{
  "snare": {
    "top": {
      "at": [0, 1.08, 0.36],
      "dir": [0, 1, 0.001],
      "up": [0, 0, -1],
      "half": 0.2
    },
    "left": { "at": "handL", "dir": [0.9, 0.55, 0.6], "half": 0.13 }
  }
}
```

`at` is the point the camera looks at, in meters in the body's frame (+X the performer's left, +Y
up, +Z forward), or `handR`, `handL` or `hands` for a hand's grip in that hold. `dir` points from
it to the camera, `half` is half the picture's height, and `seeThrough` draws the instrument
see-through.

Each section gets six views side by side: front, right side, top, front-right, front-left, and the
front again with the instrument see-through, so a big bell can't hide the hands.

Output: `<out>/<state>/<nn>-<section>.png`, and a labelled contact sheet `<out>/<state>-sheet.png`.

It renders on the GPU (ANGLE over Vulkan), prints the WebGL renderer as `note: rendering: ...`, and
stops if that isn't the NVIDIA GPU. `GPU=0` forces SwiftShader, for debugging only.

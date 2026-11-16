# Hold gallery

Renders one marcher per section in its hold, with its instrument, to PNGs in headless Chromium, with
no Electron, database or display. It uses the real body, `poseArms` and the instrument models, and
places the instrument by the hold exactly as the 3D View does. The hands are drawn orange so they
are easy to check against the instrument.

```bash
pnpm --filter @openmarch/core build          # once per checkout
node scripts/view3d-holds/shoot.mjs --out /mnt/data/om-capture/holds/my-run
```

Options: `--states up,carry,trail` (default `up`) and `--only Trumpet,Flute` (matches section names).

`--look` draws the instruments as the 3D View does (each part's colors and surface from
`surfaceOf`, the section's color on drum shells, under an environment map) instead of flat check
colors, and swaps the head close-up for a close-up of the instrument. `--shell <hex>` sets the
section color (default `6442ff`), and `--hand R` or `--hand L` frames that hand's grip in the close-up.

Each section gets six views side by side: front, right side, top, front-right, front-left, and the
front again with the instrument see-through, so a big bell can't hide the hands.

Output: `<out>/<state>/<nn>-<section>.png`, and a labelled contact sheet `<out>/<state>-sheet.png`.

It renders on the GPU (ANGLE over Vulkan), prints the WebGL renderer as `note: rendering: ...`, and
stops if that isn't the NVIDIA GPU. `GPU=0` forces SwiftShader, for debugging only.

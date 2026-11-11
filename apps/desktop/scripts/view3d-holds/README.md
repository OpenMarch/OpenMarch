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

Each section gets six views side by side: front, right side, top, front-right, front-left, and the
front again with the instrument see-through, so a big bell can't hide the hands.

Output: `<out>/<state>/<nn>-<section>.png`, and a labelled contact sheet `<out>/<state>-sheet.png`.

It renders on the GPU (ANGLE over Vulkan), prints the WebGL renderer as `note: rendering: ...`, and
stops if that isn't the NVIDIA GPU. `GPU=0` forces SwiftShader, for debugging only.

# Venue gallery

Renders 3D View venue kits to PNGs in headless Chromium, with no Electron, database or display.
It composes the same framework-free pieces as `src/view3d/window/Scene.tsx`: the environment (sky,
lights, fog, environment map), the kit, the field surface and the crowd. Performers are a plain
block of 48 cylinders for scale, not the real figures.

```bash
pnpm --filter @openmarch/core build          # once per checkout; the page imports the built package
node scripts/view3d-gallery/shoot.mjs --kits hs,gym --out /mnt/data/om-capture/venues/my-run
```

Options: `--lighting all|day,night`, `--cameras all|pressBox,frontRow`, `--quality high|low`,
`--size 1280x720`, `--no-crowd` and `--poses poses.json` for extra views
(`[{ "name": "x", "position": [x, y, z], "target": [x, y, z], "fov": 45, "near": 0.5 }]`, world meters).
It draws on the machine's GPU (ANGLE over EGL, no display needed) when `nvidia-smi` works, and
with SwiftShader otherwise; `--gpu` forces the GPU, `--software` SwiftShader. The GPU is much
faster, and unaffected by CPU load. With it, `--bench 200` times 200 frames of each shot.

Output: `<out>/<kit>/<lighting>--<camera>.png`, a labelled contact sheet `<out>/<kit>/sheet.png` and
`<out>/report.json` (the GPU, cameras, presets, draw calls, triangles, shader programs, texture
memory and frame times per shot, console errors).

With SwiftShader (CPU), it shows looks, not frame rates. On the GPU,
frame times compare branches fairly only when runs alternate (main, branch, main, …) and you keep
each side's best: other load on the machine skews single runs. A desktop GPU still isn't a school
laptop; check those on the laptop.

## Front ensemble models

`shoot-pit.mjs` stands the models from `src/view3d/assets/pit` in front of the `hs` venue and
renders them in day and night lighting.

```bash
node scripts/view3d-gallery/shoot-pit.mjs /mnt/data/om-capture/venues/pit [--dir <glb dir>] [--bench] [--gpu]
```

`--bench` writes draw calls, triangles and frame time to `report.json`, comparing the detailed
and distant models, with and without shadows, loaded per part or merged to one mesh per model.
Frame times only mean anything with `--gpu`, on an otherwise idle machine.

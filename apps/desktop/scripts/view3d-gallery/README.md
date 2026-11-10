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
(`[{ "name": "x", "position": [x, y, z], "target": [x, y, z], "fov": 45 }]`, world meters).

Output: `<out>/<kit>/<lighting>--<camera>.png`, a labelled contact sheet `<out>/<kit>/sheet.png` and
`<out>/report.json` (cameras, presets, draw calls, triangles, shader programs, console errors).

Rendering is on the GPU (ANGLE/Vulkan) when the machine has an NVIDIA one, and SwiftShader (CPU)
otherwise or with `--software`. Under SwiftShader it shows looks, not frame rates.

## Front ensemble models

`shoot-pit.mjs` stands the models from `src/view3d/assets/pit` in front of the `hs` venue and
renders them in day and night lighting.

```bash
node scripts/view3d-gallery/shoot-pit.mjs /mnt/data/om-capture/venues/pit [--dir <glb dir>] [--bench] [--gpu]
```

`--bench` writes draw calls, triangles and frame time to `report.json`, comparing the detailed
and distant models, with and without shadows, loaded per part or merged to one mesh per model.
Frame times only mean anything with `--gpu`, on an otherwise idle machine.

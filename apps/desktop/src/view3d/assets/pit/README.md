# Front ensemble models

GLB models of pit instruments, field audio and podiums, with a detailed and a distant
(`-low`) version of each. `manifest.json` lists each model's triangles, parts, real size
and artwork slots.

They are generated, so change `scripts/view3d-assets/pit/` and rebuild instead of editing a file:

```bash
blender -b --factory-startup --python scripts/view3d-assets/pit/build.py -- --out <dir>
```

Copy the `.glb` files and `manifest.json` from `<dir>` here. Skip `bars-*.png`, which is
already inside the GLBs. Then regenerate the 2D drawings from the new GLBs and commit them too:

```bash
cd apps/desktop && node scripts/view3d-assets/pit-plan.mjs
blender -b --factory-startup --python scripts/view3d-assets/pit-thumbnails.py -- src/view3d/assets/pit
```

`plan.json` holds each model seen from straight above, which is how the 2D field draws it: its
silhouette at every zoom, and the edges seen from above (bars, drum heads, steps) once zoomed in
(`src/view3d/core/pit/pitPlan.ts`). A test fails when a model has no drawing. `thumbs/` holds
each model's picture in the equipment catalog (the Front ensemble and podiums view), rendered from
the audience side with Cycles on an NVIDIA GPU.

## Ids are permanent

A show stores only a model's id (`items.model = 'pit/<name>'`), never its bytes. So once an id has
shipped:

- Never rename or remove it. An older show would lose the model and draw a block.
- Never change its size or footprint. The item's Outline, playing spot and pit area were made from
  the old size and would no longer match.
- Give a new look or size a new id (`marimba-5.0-synthetic-black`, `podium-tower-7ft`) and leave
  the old one in place. Small fixes that keep the size (a wheel turned the right way, a better
  color) are fine under the same id.

Axes: meters, +Y up, origin on the ground at the middle of the footprint, +Z toward the
audience, +X the player's left. Each model has at most six parts (draw calls).

The 3D View draws an item whose `items.model` is `pit/<name>` as `<name>.glb`, and as
`<name>-low.glb` beyond about 30 m (`src/view3d/window/props/PitModels.tsx`). A podium's
`standTopM` is where a performer standing on it puts their feet, and `standAtM` where on the
footprint; every podium must have both (`pitModels.test.ts` checks).

## Podiums

The conductor podiums (`conductor-podium`, `conductor-podium-tall`) and the drum major
podiums are built in `podiums.py`:

| id                   | Stands at | What it is                                                          |
| -------------------- | --------- | ------------------------------------------------------------------- |
| `podium-stand-2ft`   | 0.61 m    | Aluminum stand, 24 in deck on splayed legs, no rail                 |
| `podium-tower-4ft`   | 1.22 m    | Step-stool tower, stairs up the back, a handrail each side          |
| `podium-tower-5ft`   | 1.52 m    | The same, 5 ft                                                      |
| `podium-tower-6ft`   | 1.83 m    | The same, 6 ft, railed on the field side too                        |
| `podium-rolling-6ft` | 1.83 m    | 6 × 4 ft deck on casters, a ladder at each end, rail front and back |
| `stepladder-6ft`     | 1.22 m    | Aluminum A-frame stepladder, steps toward the audience              |
| `scaffold-tower`     | 2.0 m     | One layer of frame scaffold on casters, plank deck, guardrail       |

Each aluminum podium also comes in black (`-black`). All of them are climbed from the audience
side, so the drum major faces the field with the ladder behind them; the rolling podium has its
ladders at the ends.

Each podium's manifest entry has two more fields. `standTopM` is the height, in meters, of the
surface the drum major stands on. `standAtM` is `[x, z]`: where on the footprint they stand, in
the model's axes. It's the middle (`[0, 0]`) for all of them except the stepladder, whose standing
step sits toward the audience.

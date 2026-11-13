# Front ensemble models

GLB models of pit instruments, field audio and podiums, with a detailed and a distant
(`-low`) version of each. `manifest.json` lists each model's triangles, parts, real size
and artwork slots.

They are generated, so change `scripts/view3d-assets/pit/` and rebuild instead of editing a file:

```bash
blender -b --factory-startup --python scripts/view3d-assets/pit/build.py -- --out <dir>
```

Copy the `.glb` files and `manifest.json` from `<dir>` here. Skip `bars-*.png`, which is
already inside the GLBs.

Axes: meters, +Y up, origin on the ground at the middle of the footprint, +Z toward the
audience, +X the player's left. Each model has at most six parts (draw calls).

The app doesn't load these yet.

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

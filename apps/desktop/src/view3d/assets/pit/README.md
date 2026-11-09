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

# Marcher renderer

The 3D View's instanced marcher renderer: baked clips, instanced skinning,
step-size blending and the uniform shader. It came from
[om-pose](https://github.com/OpenMarch/om-pose) and is owned here now
(performer-behavior.md section 8.4): the channel layering is OpenMarch's own
and changes too often to round-trip through om-pose. om-pose stays the
reference for single-clip behavior, and its `docs/openmarch-3d.md` is the
specification these files started from.

| File                    | om-pose path                   | Source commit                              |
| ----------------------- | ------------------------------ | ------------------------------------------ |
| `instanced-marchers.js` | `render/instanced-marchers.js` | `87cc16e816f0d4a074098b9cb27fdb9431c95dac` |
| `step-blend.js`         | `render/step-blend.js`         | `87cc16e816f0d4a074098b9cb27fdb9431c95dac` |
| `uniform-shader.js`     | `uniforms/uniform-shader.js`   | `87cc16e816f0d4a074098b9cb27fdb9431c95dac` |

The `.d.ts` files are hand-written for the `.js` files; keep them in step.

## Changes since the source commit

- Moved from `src/view3d/vendor/om-pose/` (2026-10-11), with header comments
  and spelling ignores only. No behavior change.
- `legTurnSetup` and `cloneRig` are exported for the per-channel bake.

## Channel layering

The window no longer skins from `instancedSkinning`'s per-vertex clip lerp.
These modules, written here, replace it (performer-behavior.md section 8.3):

| File              | What it does                                                                   |
| ----------------- | ------------------------------------------------------------------------------ |
| `bakeLayout.ts`   | Where each channel's rows go: Feet, then Horn/Equipment, then Body             |
| `channelBake.ts`  | Samples those rows, 24 bones a row (the skeleton's 23 and the prop bone)       |
| `channelState.ts` | Each performer's channel state, a float texture written when a segment changes |
| `composeMath.ts`  | Composes one performer's bones on the CPU: the reference and the fallback      |
| `composer.ts`     | The once-a-frame GPU compose pass, and the skinning that reads its texture     |

`bakeClips`, `instancedSkinning` and `writeMarcher` stay in
`instanced-marchers.js` as the single-clip reference: tests compare the
composed bones with them.

## Parity

When vendored, the shader patches were checked against three r186 with
om-pose's own pixel parity suite: the instanced renderer differed from plain
`SkinnedMesh` skinning on at most 0.003% of pixels for clips played without
a blend, the same as on r160. That suite lives in om-pose; the vendored copy
held only the three modules, so there was no suite here to move. Checks of these files here are the 3D View's own tests and the web
preview's pixel comparisons (`docs/3d/findings.md`).

om-pose is OpenMarch's own (private) repository, so these files and its
assets ship under the app's license.

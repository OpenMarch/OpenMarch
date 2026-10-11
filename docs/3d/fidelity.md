# 3D View Fidelity: Design Brief

<!-- cspell:words PMREM SwiftShader AgX SMAA MSAA N8AO Mikkelsen ambientCG Twinmotion Pyware EnVision Drillbook UDBapp Vectorworks wysiwyg Khronos vomitories shako maquette fresnel premultiplied Sobel KTX2 UASTC gfxbench Tsushima Madden FIFPlay pylons metalness texel texels Untextured tele Photoreal Looman frameloop sandboxed WEBGL webglcontextlost GLSL rects Ndot grayscale directable pmndrs desaturates TRAA desaturated retuned HDRI  -->

How 3D View grows from "blocks on a green plane" into a mature, game-like
presentation: detailed turf, believable lighting, and graphics settings that
scale from a school laptop to a gaming desktop. This brief is the output of a
research pass on 2026-10-05 (four parallel design reviews of the code in
`apps/desktop/src/view3d` plus web research). It is design only. Nothing here
is built, measured or verified on real hardware yet; §10 lists what is
unverified.

Read [design.md](design.md) for the module layout and
[ADR 0002](../adr/0002-3d-view.md) for decisions already made. Nothing here
reopens those. It adds to them.

> [!IMPORTANT]
> **The 2D field theme and the 3D venue surface are separate things.** The
> field theme (`FieldTheme` colors, set in the editor) is an editing aid for
> the 2D canvas. The 3D surface is the venue's own look: real turf, paint,
> branding, and in future surface presets and shaders. Nothing in this brief
> changes the field theme, and 3D surface work must not read or write it.
> See [§1a](#1a-the-2d-field-theme-is-not-the-3d-surface).

## 0. Scope after review (2026-10-05)

A review of the first draft changed the plan. Where a later section
disagrees with this one, this one wins.

- **Measure before building tiers.** No frame time here is measured, and the
  real-hardware check (V6) is still open. Build only the work that holds up
  whatever the numbers say (below), then run the pro dome with 300
  performers on the owner's machine, then design Medium, the ladder and the
  panel from real numbers.
- **First slice:** (1) detect a software renderer before the first frame and
  start on low, removing today's 6 s slideshow and rebuild hitch; (2) the
  day-one look: sky-baked environment lighting, blob shadows, fitted shadow
  frustum, AgX; (3) baked turf grain in the existing canvas.
- **Merge `3d/figures` first.** It changes `Performers.tsx` and
  `sceneStore.ts`, where blob shadows and performer detail go.
- **Persistence: the window's local storage, as ADR 0002 already says.** No
  `electron-store`, new IPC or ADR amendment for v1 (§4 is superseded).
- **A smaller panel.** v1 is the four presets plus at most "Show frame rate",
  "Pause drawing when nothing moves" and crowd density. Advanced rows come
  later if people ask.
- **Photo quality changes live settings only** (render scale, anti-aliasing,
  shadow map size). The field texture and grass blades need a rebuild, so a
  picture must not depend on them.
- **Night by default only once poles light the field** (P6.5). Until then
  `hs` stays on day.
- **Parked:** near-camera grass blades, N8AO and light cones.
- **The paint/grass split is its own package**, scoped to the turf style, with
  screenshot checks; the `theme` style is untouched (§1a).

## 1. Where we are, and why it reads as a tech demo

Paths are under `apps/desktop/src/view3d/`.

- **The field is one quad with one painted texture.** `buildFieldSurface`
  paints the whole plan into a canvas and puts it on a `PlaneGeometry` with a
  `MeshStandardMaterial` that has only `map` and one roughness value
  (`core/field/index.ts:112-120`). Grass is three near-identical flat greens
  (`core/field/turfPlan.ts:16-21`, `core/field/paint.ts:68-75`). The 5-yard
  mowing stripes are baked into the color, so they never change with the view
  angle, which is the dominant cue from a press-box seat. Paint shares the
  grass's roughness and normal, so lines read as a printed decal.
- **No image-based lighting.** One `HemisphereLight` and one `DirectionalLight`
  (`core/environment/rig.ts:54-55`), `scene.environment` never set. Metals at
  0.5-0.6 metalness reflect nothing; aluminum benches, glass and helmets look
  like plastic.
- **Nothing grounds the performers.** Shadows are `PCFShadowMap` on the high
  tier only (`window/Scene.tsx:192-193`). One 2048² map covers ±128 m
  (`rig.ts:56-65`), about 12.5 cm per texel, so a 0.6 m performer is five
  texels wide. Night and roof-closed presets set the sun to 0
  (`core/environment/lighting.ts:104,119`) and have no shadows at all.
  Performers receive no shadow (`window/performers/Performers.tsx:182-183`).
- **No atmosphere.** A two-color gradient dome (`core/environment/sky.ts`),
  linear fog from 549 m to 1524 m (`rig.ts:68`), invisible inside any venue.
  No sun disc, haze or aerial depth.
- **Quality is binary, reactive and forgotten.** `View3dQuality = "low" |
"high"`, default high, lives only in the window store
  (`window/sceneStore.ts:37,63-64`), no UI, no persistence. The fallback
  (`window/qualityFallback.ts`) waits for 3 s below 30 fps, then switches to
  low once, which **rebuilds** environment, kit and crowd
  (`Scene.tsx:209,223,261`). On SwiftShader that is 6 s of 1-11 fps, then a
  0.9-3.7 s hitch, on exactly the machine that can least afford it
  ([findings](findings.md)). High renders at up to 2× device pixel ratio, so
  a 4K laptop pays four times the pixels of 1080p before any measurement. The
  field texture is 8192² RGBA when the GPU allows it (`core/field/paint.ts:
16-19`), on every tier.
- **Surroundings are flat.** Untextured single-roughness materials
  (`core/environment/materials.ts:45-55`), a crowd of tinted boxes
  (`core/environment/crowd.ts:161-173`), kit lights that cast no shadows
  (`core/environment/lightPole.ts:53`).

## 1a. The 2D field theme is not the 3D surface

Today, by style (`core/field/index.ts`, `planField`):

| Surface style | Used by                 | Reads `FieldTheme`? | Reads the show's field image? |
| ------------- | ----------------------- | ------------------- | ----------------------------- |
| `turf`        | hs, bighs, college, pro | no                  | no                            |
| `tarp`        | gym                     | background only     | yes, as the floor art         |
| `theme`       | blank                   | yes, fully          | yes                           |

Rules for all fidelity and branding work:

1. **The field theme belongs to the 2D editor.** It exists so lines and
   labels read well while editing. It is not a venue's paint scheme, and it
   is never extended for 3D needs.
2. **Venue surfaces own their look.** Turf colors, mowing patterns, paint,
   end zones, logos and surface presets (§5) live in the 3D code and the
   venue params, never in `FieldTheme`.
3. **The blank kit is the one deliberate mirror.** Its `theme` style shows
   the 2D field in 3D, so it keeps painting with the theme and gets no
   branding, stripes or surface shader.
4. **The gym tarp keeps the show's image**, because a guard floor's art is
   the performance surface. Tarp material work (weave, roughness) must not
   change how that image looks.
5. Tests pin this: the theme and tarp styles plan no `centerLogo`, and turf
   plans no theme colors.

## 1b. Field branding

**Built now (OpenMarch branding).** On turf, the OpenMarch logo is
painted at midfield in white paint with a light turf-colored shadow, as large
as fits inside the middle hash rows (15 yards wide on a high school field,
narrower between NFL hashes), reading from the home side and over the 50
line. The default end zones are solid brand violet with a white border line
one yard in, and the white marcher mark followed by `OPENMARCH`, with a dark
violet drop shadow and outline (`DEFAULT_VENUE_PARAMS`). The mark only
appears when the end-zone text is OpenMarch. Fine and coarse grain is laid
over the whole turf, paint included. Shows that already saved venue settings
keep their stored end-zone values. Other end-zone styles (stripes, argyle,
fade, outline, pinstripe) exist behind `endZoneStyle` for the branding
setting below. Code: `core/field/brandMark.ts`, `turfPlan.ts`, `paint.ts`.

**Feature for later: show-defined center logo and end-zone artwork.** Venue
params grow a small branding block, still "small params" under ADR 0002 D-5:

- Center: none, the OpenMarch mark, or text (one or two lines) with fill and
  outline colors.
- End zones: text, fill color, text color, outline color; optionally
  different text per end zone.
- Edited from the 3D View venue controls, with a live preview on the field.
- Uploaded logo images are a separate decision: an image is not a small
  param, so it needs a storage choice (and likely an ADR note) first.
- Branding applies to turf only, and later to hardwood and tarp surfaces if
  they get their own branding slots. Never through `FieldTheme` (§1a).

## 2. Benchmark

Drill tools set a low visual bar. Pyware Real View sells animated uniformed
performers, four camera types (sky, ground follow, helmet first-person, blimp)
and a paid asset store, with no visible time-of-day or quality controls
([guide](https://pyware.com/guide/3d/11.0/en/topic/real-view)). EnVision and
Drill Studio claim uniforms, props and lighting effects; their venue quality
could not be verified. UDBapp and Drillbook Next offer performer-perspective
flips, in 2D. Nobody offers a believable venue with seat-accurate views,
which 3D View already has in block form. Competitors win on performer models.

Borrow presentation, not fidelity, from sports games: College Football 26's
afternoon-to-night progression and lit poles with glow; Madden's single
consistent broadcast "package"; EA FC's tele-broadcast camera as a high
sideline view with two sliders (height and zoom) rather than free orbit
([FIFPlay](https://www.fifplay.com/fc-26-camera/)). From visualizers:
Twinmotion's named ambience presets ("Golden hour", "Night sky") with a slider
behind them ([Epic](https://dev.epicgames.com/documentation/en-us/twinmotion/ambience-settings));
Vectorworks Vision's explicit "performance while working, quality while
presenting" split; Capture's quality setting that lowers live resolution.

## 3. Art direction

**Intent.** 3D View is a clean, well-lit architectural model of game night
where the drill is the sharpest thing in frame. It should look like a good
stadium rendering, not a football game. A director should recognize "our
field on a Friday" within a second and never lose a form to an effect.

**Target style: stylized-realistic maquette.** Real proportions and real
lighting logic, simplified slightly matte materials, a restrained palette where
only the field, the performers and the school colors are saturated. This
survives the low tier because its quality lives in proportion, palette, baked
occlusion and painted texture, none of which cost GPU time: low looks like the
same picture with softer shadows. Photoreal collapses without shadows and
post-processing; flat low-poly reads as a toy to boosters.

Principles:

1. **Drill beats realism.** No effect may reduce form legibility from the
   press box. Bloom, depth of field and fog are judged against that.
2. **The field is the hero.** It gets the highest texture budget and contrast;
   everything else is 20-30% less saturated and lower in contrast.
3. **Honest scale.** Every object is real size; every frame has at least two
   human-scale cues (goal posts, benches, yard signs, pylons).
4. **Quiet surroundings.** Stands, sky and crowd are backdrop: no motion above
   a slow idle, no pure white, no noise.
5. **Night is the signature look.** Pole-lit turf against a dark sky hides
   cheap geometry and matches when shows actually happen.
6. **One picture across tiers.** Tiers change sharpness and density, never
   composition, color, or which objects exist.
7. **It is OpenMarch.** Overlay, type and accent come from the app's tokens.

## 4. Fidelity settings

### Presets and the "Custom" model

Four presets: **Automatic** (default, resolves to a tier), **Low**, **Medium**,
**High**. `medium` is a new tier. No "Ultra" preset: near-camera grass blades
is a single opt-in toggle, and **Photo quality** (a one-shot mode for saving
pictures) covers "everything on". Editing any Advanced row keeps the preset
but records an override and the header reads "Custom (based on Medium)";
clicking a preset clears overrides. This is the Unreal scalability model
([Looman](https://tomlooman.com/unreal-engine-optimal-graphics-settings/)).

Low is the SwiftShader path and must still look acceptable: baked turf grain,
blob shadows, sky-baked environment lighting and baked venue occlusion are
all free per frame and belong on every tier.

### Setting inventory

Cost: ● low, ●● medium, ●●● high. Apply: **live** means no rebuild;
**rebuild:part** means that part is rebuilt and the setting is never changed
automatically.

| Setting (UI label)               | Low             | Medium                 | High             | Cost     | Apply                          |
| -------------------------------- | --------------- | ---------------------- | ---------------- | -------- | ------------------------------ |
| Render scale (Sharpness)         | 100% at 1× dpr  | min(dpr, 1.5)          | min(dpr, 2)      | ●●●      | live, `setPixelRatio`          |
| Anti-aliasing (Smooth edges)     | off             | SMAA                   | MSAA 4×          | ●●       | live (composer)                |
| Shadows                          | blob            | blob + 2048²           | blob + 4096²     | ●●●      | live (traverse `castShadow`)   |
| Ambient occlusion (Soft shading) | off             | off                    | N8AO, half res   | ●●●      | live                           |
| Post effects (Glow and vignette) | off             | on                     | on               | ●●       | live                           |
| Environment lighting             | sky-baked, 128² | sky-baked              | sky-baked        | ●        | live, once per lighting preset |
| Turf detail                      | baked grain     | baked + shader stripes | + detail normals | ●●       | live (material)                |
| Grass near camera                | off             | off                    | off, opt-in      | ●●●      | rebuild:field                  |
| Field texture (Line sharpness)   | 2048            | 4096                   | 8192 if allowed  | ● + VRAM | rebuild:field (70-116 ms)      |
| Anisotropy                       | 2               | 8                      | max              | ●        | live                           |
| Crowd density / detail           | 50%, boxes      | 100%, boxes            | 100%, shaped     | ●●       | rebuild:crowd (≤20 ms)         |
| Performer detail                 | low, no shadow  | full, shadow           | full, shadow     | ●        | rebuild:performers             |
| Frame rate limit                 | display         | display                | display          |          | live                           |
| Pause drawing when nothing moves | on              | on                     | on               |          | live (`frameloop="demand"`)    |
| Save power on battery            | on              | on                     | on               |          | live                           |

Tone mapping (AgX, see §6) and the sky are not settings. Crowd on/off stays a
show setting (`venueSettings.crowd`); density is fidelity.

### Architecture

- **Core, framework-free:** `core/fidelity/settings.ts` holds the zod schema
  (`{ version: 1, preset, overrides, learnedTier?, learnedRung? }`),
  `PRESETS: Record<Tier, Fidelity>`, `resolveFidelity({ stored, autoTier,
onBattery, photo })`, `isCustom()`, and `classifyChange(prev, next)` that
  splits a change into live keys and `rebuild` parts. `qualityFallback.ts`
  becomes `core/fidelity/autoPolicy.ts`; its constants, tests and log message
  survive.
- **Kits stop taking `quality`.** `KitBuildInput.quality` is replaced by
  `shadows: boolean` plus a `setShadows(on)` traverse, so a tier change never
  rebuilds a kit. `EnvironmentOptions.quality` becomes `shadowMapSize`.
  `FieldSurfaceInput` gains a `quality` input (today the Scene effect omits
  it, `Scene.tsx:227-241`).
- **Window:** a `useFidelityStore` holds `stored`, `autoTier`, `onBattery`,
  `photo` and derives `resolved`. Components select single fields so a render
  scale step reruns nothing but the dpr effect. Only rebuild-class keys sit in
  the build effects' dependency arrays. `Scene` exposes `data-tier` and
  `data-custom` for e2e.
- **Persistence is per machine, never in the show.** Fidelity describes the
  GPU; the same `.dots` opens on a school laptop and a gaming desktop. ADR
  0002 D-5 already classes view preferences as local. Store it in
  `electron-store` under `view3d.fidelity` through two sandboxed preload
  methods (`getFidelity`/`setFidelity`) backed by `view3d:settings-get/set`
  that main restricts to that key. Not `localStorage`: it dies with cache
  clears, and the editor's Settings page should later show the same section.
  **This needs a small amendment to ADR 0002** (D-3 preload surface, D-4
  channels plus `view3d:power`, a new D-9 "fidelity is an app setting, schema
  v1, never show data") before the persistence PR.
- **IPC:** the editor is uninvolved. Main relays `powerMonitor` as
  `view3d:power { onBattery }`. Photo mode is window-local.

### Automatic mode

Initial tier, decided before the first frame in `onCreated`:

1. Renderer string (`WEBGL_debug_renderer_info`) matches
   `/SwiftShader|llvmpipe|Microsoft Basic Render|Software/i`, or a probe
   context with `failIfMajorPerformanceCaveat: true` fails: **Low**, step-up
   disabled, rebuild-class settings at Low. The headless box lands safe at
   t = 0.
2. Else the `learnedTier` from the last session.
3. Else **Medium**, designed for the design.md §9 budget (Iris Xe or M1 at
   60 fps). Do not ship `detect-gpu` data at first: ANGLE strings vary, its
   benchmark data stopped updating in December 2025, and the ladder below
   corrects within seconds. Revisit only if Medium starts wrong often.

Runtime ladder over live settings only: `[High@1.0, High@0.75, Medium@1.0,
Medium@0.75, Low@1.0, Low@0.75, Low@0.5]`, where `@x` is render scale
relative to the tier's cap. Keep today's sampler (0.5 s windows, frames over
1 s count as pauses). Target is min(display refresh, 60).

- **Step down** one rung after 3 s below 30 fps (today's rule) or 1.5 s below
  15 fps. Log once per step.
- **Step up** one rung after 20 s above target − 5 fps, only to rungs below a
  **ceiling**: stepping down from rung _r_ sets ceiling _r_ for 120 s; a
  second step-down from the same rung in a session makes it permanent for the
  session. At most one change per 10 s. This bounds flicker to one
  oscillation per two minutes.
- The settled rung persists as `learnedRung`/`learnedTier` after 60 s stable.
- **Never automatic:** anything in `classifyChange().rebuild` (field texture,
  crowd, performer detail, grass). Those follow the tier chosen at open.
- **Battery:** ceiling Medium, frame cap 30; restored on AC.
- **Hidden, minimized, or paused with a still camera:** `frameloop` goes to
  `demand`; `invalidate()` on clock play, camera move, kit animation,
  selection, show invalidation. No frames, no samples, readout shows "—".
- **Context loss:** `preventDefault` on `webglcontextlost`, toast "Graphics
  restarted", recreate PMREM and composer targets on restore, step down one
  rung, persist `fieldTexture ≤ 4096` for this machine.

### UI

Since 2026-10-05 the window has a View settings panel ([ui.md](ui.md) UI-7)
whose Graphics section holds Quality (Automatic, Low, High, in the window's
local storage). This UI grows inside that section rather than as a separate
popover; the sketch below is otherwise unchanged:

```text
┌ Graphics ─────────────────────────────────────────── ✕ ┐
│ QUALITY   [ Automatic ] [ Low ] [ Medium ] [ High ]    │
│ Automatic picks a level for this computer and adjusts  │
│ it while you watch. Now: Medium                        │  ← "Custom (based on Medium)" when overridden
│ ────────────────────────────────────────────────────── │
│ ▸ Advanced                                             │  ← closed by default
│   Sharpness            [ 50% | 75% | 100% | HiDPI ]  ●●●
│   Smooth edges         [ Off | Standard | Best ]      ●●
│   Shadows              [ Simple | Sun | Sharp sun ]   ●●●
│   Soft shading         [ Off | On ]                   ●●●
│   Glow and vignette    [ Off | On ]                   ●●
│   Realistic lighting   [ Off | On ]                   ●
│   Turf detail          [ Flat | Detailed ]            ●●
│   Grass near camera    [ Off | On ]   rebuilds field  ●●●
│   Line sharpness       [ Standard | Sharp | Sharpest ] ● VRAM
│   Crowd                [ Sparse | Full ] [ Boxes | Shaped ] ●●
│   Frame rate limit     [ Display | 60 | 30 ]
│   ☑ Pause drawing when nothing moves
│   ☑ Save power on battery
│   ☐ Show frame rate                                    │
│ ────────────────────────────────────────────────────── │
│ [ Reset to recommended ]         Renderer: Intel Iris Xe │
└────────────────────────────────────────────────────────┘
```

Dots are the cost column with a tooltip; rows that rebuild say so. Reset sets
Automatic, clears overrides and learned values. "Show frame rate" adds
`60 fps · 16 ms` to the existing Readout through a ref, like the show time.
**Photo quality:** a "Save picture" button in the camera bar sets
`photo = true`, renders one frame at High plus grass, MSAA and full device
scale with the overlay hidden, `canvas.toBlob` to a save dialog via main,
offers 16:9 and 4:5 framing with an optional title strip, then restores.
Strings live under `view3d.graphics.*`.

## 5. The playing surface

Stay on `WebGLRenderer` and patch `MeshStandardMaterial` with
`onBeforeCompile` GLSL. Pin the replaced chunk names with a test and set
`customProgramCacheKey`. (WebGPU and TSL: see §6.)

Ranked, with the tier each belongs to:

1. **Bake grain and macro variation into the canvas** (all tiers; the
   SwiftShader path). In `paint.ts`, after the stripe rects and before paint
   items, composite a generated 256 px noise tile with `createPattern`
   (overlay, about 10% alpha) at two scales (about 0.5 m and 9 m), plus a soft
   gradient at stripe edges. Zero per-frame cost, perhaps 10-20 ms of build.
   Capped at canvas texel density, so it is mush at field level; that is what
   items 3 and 6 are for.
2. **Field shader: view-dependent stripes and grazing sheen** (medium and
   high; the largest realism gain at 30-100 m). New
   `core/field/surfaceShader.ts` exporting `applySurfaceShader(material,
opts)`. Move stripes out of the canvas and compute the band from world x
   (`FIVE_YARDS`). Albedo multiplier `1 + k · dot(lay, viewDirXZ)` with k
   about 0.12, flipped per band, so stripes brighten and darken as the camera
   orbits and invert from the opposite stand, as real mowing does
   ([BrightView](https://www.brightview.com/resources/article/secret-getting-lawn-stripes-your-athletic-field)).
   Tilt the normal about 8° along the lay so the sun responds. Add
   `sheen · pow(1 − NdotV, 4)` tinted with the sky color. A few ALU ops, no
   texture taps.
3. **Tiling detail normal and albedo, distance-faded** (high). One 1024²
   detail set per surface family, sampled in world space at about 1.5 m and
   11 m and blended by distance; a rotated second scale breaks repetition.
   Adopt hex-tiling ([Mikkelsen](https://jcgt.org/published/0011/03/05/paper.pdf),
   3 taps per map) only if repetition is still visible. Assets: CC0 from
   ambientCG or Poly Haven as grayscale detail albedo (tint stays
   art-directable), normal, and packed roughness/AO, shipped as PNG or
   lossless WebP, about 1.5-2.5 MB per set, under 6 MB total, about 5.6 MB
   VRAM per map with mips. Move to KTX2/UASTC only if VRAM measurements demand
   it; the Basis transcoder is already in `node_modules/three` (584 KB) and
   can be served locally. Whether a good CC0 synthetic-turf scan exists is
   unverified; a procedural Blender fallback is feasible.
4. **Sky environment map** (all tiers, see §6). Prerequisite for a wet field
   and for hardwood.
5. **Split paint from grass** (turf only; the `theme` style and the tarp's
   show image are untouched, §1a). The canvas becomes paint only: transparent
   background, premultiplied alpha as coverage; end zones, logos and the
   background image stay in it; grass moves to the shader. Blend
   `mix(grass, paint, a · (0.82 + 0.18 · detail))` so grass shows through at
   blade scale; scale the detail normal by `1 − 0.5a` and add `0.1a` to
   roughness so paint is flatter and chalkier; reduce the stripe effect under
   paint; darken 2-3 cm around paint edges with a blurred alpha. Keep 16×
   anisotropy, sample paint with about −0.5 mip bias and watch for shimmer.
   Later memory win: an R8 coverage mask at full resolution plus a 2048 px
   color layer takes roughly 160 MB (8192² RGBA with mips) to about 45 MB.
6. **Near-camera blades** (opt-in, last). An instanced tuft ring of about
   10 m following the camera, active below 3 m eye height, 30-60k triangles.
   Do not use shell texturing (8-16× full-field overdraw) or parallax (breaks
   at grazing angles, swims under paint). A contact-shadow blob under each
   performer grounds more for far less.

Surface options are presets of one parameter block (tint, stripe pattern,
lay strength, sheen, roughness, detail set, wear): natural grass with 5-yard,
10-yard, checkerboard or no stripes (cheap, item 2 only); synthetic turf
(weaker lay, per-panel lay direction, darker and more saturated, crumb in the
roughness; 15 ft rolls match the 5-yard bands, unverified); worn practice
field (low-frequency wear mask between the hashes and along the sidelines);
wet field (roughness about 0.35 through a puddle mask, needs item 4); gym
hardwood (plank grain, clear coat at roughness about 0.25, needs item 4); tarp
vinyl (fine weave normal, roughness 0.5, optional seams and wrinkles). Apply
the same grass, without paint, to the apron and lawn.

## 6. Lighting, atmosphere and post-processing

**Renderer: stay on WebGL for now.** Electron 40 ships Chromium 144 (believed,
unverified). WebGPU on Linux is on by default there only for Intel Gen12+;
NVIDIA on Wayland arrives in Chrome 147
([status](https://github.com/gpuweb/gpuweb/wiki/Implementation-Status)). The
pmndrs post stack is WebGL-only and the sky `ShaderMaterial` would need a TSL
port. Keep the core builders free of TSL; revisit after an Electron bump.

**Cascaded shadow maps: defer.** `three/addons/csm` patches every lit material
and re-renders casters per cascade, poor value at pro's 485k triangles. The
field is a bounded target; fit one frustum to it. r186 has removed
`PCFSoftShadowMap` (warns and falls back to PCF).

**Tone mapping: AgX.** ACES skews hue on saturated colors and desaturates
heavily, bad for team colors. Khronos Neutral is most color-faithful but
clips lamps harshly. AgX rolls off lamps and boards well; add about +12%
saturation in the grade. Fall back to Neutral if users want colors to match
the 2D editor exactly ([overview](https://discourse.threejs.org/t/tone-mapping-overview/75204)).

**Post stack: `postprocessing` with `@react-three/postprocessing`**, medium
and high only; low bypasses the composer entirely. It merges effects into one
pass. Composer MSAA 4× on high, SMAA on medium, none on low; skip TAA/TRAA,
which ghost on small moving figures. Risk: `postprocessing` peers
`three <0.187`, so it gates every three upgrade. N8AO at half resolution on
high only, a real cliff on integrated GPUs.

Ranked techniques:

1. **Environment lighting baked from the procedural sky** (all tiers, 128²
   cube on low). In `rig.ts`, `setLighting` renders the sky dome and the
   emissive lamp boxes through `PMREMGenerator.fromScene()` and exposes
   `environmentMap`; `Scene.tsx` assigns `scene.environment`. Cut hemisphere
   intensity to about 0.3. Zero bundled bytes, always matches the preset,
   about 5 ms per preset change and about 1 MB GPU memory. The largest single
   jump: benches, glass and helmets come alive. Day needs re-exposing.
2. **Blob contact shadows** (all tiers). An instanced quad with a
   radial-gradient canvas texture, multiply-blended, `depthWrite: false`,
   `renderOrder` just below the selection rings in `Performers.tsx`. At night,
   four faint elongated blobs pointing away from the poles, the classic
   stadium look. Cap opacity at 0.45 so yard lines stay readable.
3. **Fitted sun shadow** (medium and high). Fit the ortho frustum to the field
   plus the near stands, about ±65 m, for about 6 cm per texel at 2048²;
   `normalBias` about 0.03; snap the frustum to texels; 4096² on high (64 MB
   of depth). About twice the resolution at no cost.
4. **AgX plus an exposure retune.** One line in `Scene.tsx` plus the
   `lighting.ts` values; raise the sun-to-fill ratio to about 5:1 once the
   environment map carries the fill.
5. **Sky and haze.** `three/addons/objects/Sky.js` rendered once per preset
   into a cube on medium and high; on low, the gradient dome gains a sun disc
   and horizon band. Switch to `FogExp2` tuned so the far stands lift 10-15%
   and the field loses under 3% contrast at 120 m.
6. **Composer: bloom, AA, vignette, grade.** Mipmap-blur bloom with a
   luminance threshold above 1.0 so only lamps, boards and the ribbon bloom,
   never white uniforms or rings. Vignette 0.2. Tone mapping moves into the
   composer. About 1-2 ms on an integrated GPU at 1080p (unverified).
7. **Lamp glare sprites and faked light cones.** An additive billboard per
   lamp head in `lightPole.ts`, scaled by how directly it faces the camera
   (all tiers); additive fresnel-faded cones at about 4% opacity for night and
   gym Show (medium and high). Set `renderOrder` explicitly against the crowd.
8. **Baked venue occlusion** (all tiers, zero runtime). Vertex or instance
   color gradients in `stands.ts` and `bowl.ts` darkening risers, under-bench
   areas and the concourse, plus a painted skirt where stands meet the ground.
9. **N8AO** on high only.
10. **Tilt-shift, depth of field, LUTs, grain:** photo mode only. Never on by
    default; they hide dots.

**Looks.** These map onto the existing `LightingPreset` ids plus one new id,
`overcast`; golden hour replaces `dusk`; kits keep gating looks through
`lightingPresets`.

| Look                | Direction                                                                                                       | Kits               |
| ------------------- | --------------------------------------------------------------------------------------------------------------- | ------------------ |
| Clear afternoon     | Sun about 50° crossing the field diagonally, turbidity 3, env fill about 0.5, light haze, exposure 1.0          | outdoor, pro open  |
| Golden hour         | Sun 12°, warm `0xffb070`, long shadows across the yard lines, haze 0.35, lamps at 0.4. Hero screenshots         | outdoor            |
| Overcast            | No sun disc, sun 0.4, env 1.0 from a gray dome, blob shadows only. Flattest, most legible; SwiftShader default  | outdoor            |
| Friday night lights | Near-black sky with stars, pole spots, glare sprites, bloom, four-way blobs, cool haze near lamps, exposure 1.2 | hs, bighs, college |
| Indoor dome         | Roof closed, env from roof bars and LED ribbon, warm 4000 K, faint haze, bloom on the ribbon                    | pro                |
| Gym House / Show    | House: even, warm, low contrast. Show: dark, four spots, visible cones                                          | gym                |

**Materials**, in order of payoff, all through `paintCanvasTexture`
(`textures.ts:21`; paint a height canvas, derive the normal with a Sobel
filter once, tile at 256-512 px, no bundled assets; the helper marks every
texture sRGB at `textures.ts:35`, so normal and roughness maps need a linear
option): turf (§5), bench aluminum (streaked roughness 0.3-0.55, pays off
once the environment map is in), concrete (stain noise, expansion joints,
roughness map), track rubber (albedo speckle at roughness 0.9). Seats: no
change.

**Crowd.** Merged torso-and-head geometry of about 20 triangles with a vertex
mask so `instanceColor` tints only the shirt; palette darkened and desaturated
about 20% with a row-depth occlusion gradient so the stands sit below the
field in contrast; `MeshLambertMaterial` (34,664 instances in pro under six
spots); a vertex-shader bob from an instance hash, 2-3 cm at about 0.3 Hz with
about 2% of people shifting, off on low and under reduced motion; pro's upper
bowl replaced by a dotted canvas band on medium and low. Never crowd shadows
or emissive crowd elements.

## 7. Venue detail, performers and camera

Ranked by payoff per effort:

1. **Goal posts, pylons, sideline benches, yard signs** on all stadium kits.
   Cheapest, biggest scale win.
2. **Light poles that visibly light:** emissive heads, glare sprites, pools on
   the turf. Sells night in `hs` and `bighs`.
3. **High school:** chain-link fence around the track, lane lines and
   numbers, a scoreboard on legs, long-jump pit and discus cage in the D-zones.
   This makes it read as a high school field, not a stadium.
4. **Press box:** window band, roof rail, school name on the fascia.
5. **College:** ribbon board reusing the pro fascia texture, tunnel portals
   (vomitories), a student-section color block, upper-deck overhang shadow.
6. **Pro dome:** roof truss lines, speaker clusters, lit suite band.
7. **Gym:** bleacher rail and aisle steps, wall pads, folded hoops, banners in
   school color, a scorer's table.
8. **Surroundings:** a tree line and parking-lot plane beyond the fence.

Skip: individual seats, concourse interiors, animated crowds, cars,
real-school likenesses, team logos.

**Performers.** Whatever replaces the cylinders (now om-pose's marchers, ADR
0002 D-7 amended 2026-10-07; they superseded the `3d/figures` branch), facing direction must be visible, the uniform
two-tone from section color, and a contact-shadow blob under every figure on
every tier. **Camera:** keep the 1.1 s cubic fly-to; add damping to orbit and
zoom; give the press box and upper deck a longer lens (30-35° FOV) so forms
flatten less; never shake or auto-rotate during playback; a gentle idle drift
only in presentation mode. Fix the pro-bowl foreground crowd issue logged in
findings first; it is the most amateur-looking thing today. Venue and quality
changes cross-fade through a 200-300 ms dip rather than popping; automatic
fallback gets a quiet toast, not just a console line. Loading shows a branded
skeleton (field outline on `bg-1`) then reveals field, venue, crowd,
performers progressively; never an empty default-camera frame. The video board
shows the show title and current set (`videoBoard(title, sub)` already takes
these).

## 8. Roadmap

Three phases, each visible in a screenshot. Suggested package ids continue
the phase numbering in [phases/](phases/).

**Phase 6, "Grounded".** Before: cylinders floating on flat green among grey
blocks. After: figures with contact shadows on grainy turf with
view-dependent stripes, under lighting the metals react to, with goal posts,
benches, a fence and glowing poles.

- P6.1 Fidelity resolver and presets in core; kits take `shadows`, lose
  `quality`. Unit tests on every preset × override combination, garbage JSON,
  change classification.
- P6.2 Pre-emptive tier (renderer-string classifier) plus `electron-store`
  persistence and the ADR 0002 amendment. e2e under SwiftShader asserts
  `data-tier="low"` within 1 s.
- P6.3 Day-one look: environment map from the sky, blob shadows, fitted
  shadow frustum, AgX with retuned presets. No new dependencies; works on
  SwiftShader.
- P6.4 Turf day one: baked grain, stripe shader, `quality` on
  `FieldSurfaceInput`, same grass on apron and lawn.
- P6.5 Scale props: goal posts, pylons, benches, yard signs; pole glare
  sprites and turf pools.

**Phase 7, "Game night".** Before: three lighting chips. After: six named
looks, haze, a board with the show title, kit signature details, cross-fade
transitions, and a Graphics popover with tiers.

- P7.1 Graphics panel (presets, Advanced, Custom, reset) and the ladder
  controller replacing `qualityFallback`; fake-clock tests for step timing,
  ceiling, and at most one change per 120 s under oscillating fps.
- P7.2 Idle rendering (`frameloop="demand"`), frame cap, fps readout,
  battery relay.
- P7.3 Sky addon and `FogExp2`, the `overcast` look, golden hour.
- P7.4 `postprocessing` composer (bloom, SMAA/MSAA, vignette) and the
  `medium` tier wiring.
- P7.5 Paint/grass split and detail normals (high); turf and surface presets.
- P7.6 Kit signature details (§7 items 2-7), baked venue occlusion, crowd
  pass, cross-fades and the loading skeleton.

**Phase 8, "Show it off".** Before: a viewer. After: presentation mode, a
still exporter, saved seats, a performer's-eye view.

- P8.1 Photo quality and "Save picture" (16:9 and 4:5, title strip).
- P8.2 Presentation mode: fullscreen, look locked to High, title card,
  set-name lower third, idle drift.
- P8.3 Saved custom seats (judges' box, a booster's seat).
- P8.4 Performer's-eye view of the selected marcher.
- P8.5 N8AO, light cones, context-loss recovery, opt-in grass blades.

Five highest-leverage items overall: performer silhouettes with grounding;
turf and paint quality; the night look with working poles; the scale-prop set;
still export.

## 9. Decisions for the owner

Each with the recommended answer.

1. _Photoreal or stylized?_ Stylized-realistic maquette (§3).
2. _Default look for stadium kits?_ Friday night lights for all, once poles
   light the field (P6.5); `hs` stays on day until then.
3. _How many tiers?_ Low, Medium, High plus Automatic, with an Advanced
   disclosure. Presentation and export force High. No Ultra preset.
4. _Where do fidelity settings live?_ Decided in review: the window's local
   storage, per ADR 0002 as written. Looks stay with the show, as lighting
   does today.
5. _May the low tier have shadows?_ Yes: blob contact shadows on every tier.
6. _Tone mapping?_ AgX, with Neutral as the fallback if color matching the
   2D editor matters more than lamp roll-off.
7. _Take the `postprocessing` dependency, knowing it pins three `<0.187`?_
   Yes, in Phase 7, after the no-dependency Phase 6 ships.
8. _Ship GPU benchmark data (`detect-gpu`) for Automatic?_ No; start on
   Medium and let the ladder correct. Revisit with evidence.
9. _Custom school branding (midfield logo, end-zone art)?_ Decided:
   OpenMarch branding now (§1b); show-defined text and colors later through
   venue params, never the field theme or the field image.
10. _Video export now?_ No; stills in Phase 8, revisit after.

## 10. Unverified and risks

- All frame-time and bundle-size figures: nothing was prototyped or measured.
  The one real-hardware check (finding V6) is still open; every step here
  needs one and a findings.md entry.
- Electron 40's Chromium version and whether headless WebGL now needs
  `--enable-unsafe-swiftshader` (Chromium has deprecated automatic
  SwiftShader fallback).
- VRAM cost of the 8192² field texture on shared-memory integrated GPUs.
- Whether `navigator.getBattery()` works from a `file://` Electron page;
  relaying from main avoids the question.
- Existence of a good CC0 synthetic-turf scan; Poly Haven HDRI file sizes
  (not needed while the sky is baked procedurally).
- `onBeforeCompile` chunk names shift between three releases; pin with a
  test.
- Competitor claims in §2 come from marketing pages and store listings.

## Sources

- Pyware Real View guide: <https://pyware.com/guide/3d/11.0/en/topic/real-view>
- EA FC camera: <https://www.fifplay.com/fc-26-camera/>
- Twinmotion ambience: <https://dev.epicgames.com/documentation/en-us/twinmotion/ambience-settings>
- Unreal scalability and benchmark: <https://tomlooman.com/unreal-engine-optimal-graphics-settings/>
- Unity dynamic resolution: <https://docs.unity3d.com/Manual/DynamicResolution.html>
- detect-gpu README: <https://cdn.jsdelivr.net/npm/@pmndrs/detect-gpu@6.0.15/README.md>
- drei PerformanceMonitor: <https://drei.docs.pmnd.rs/performances/performance-monitor>
- r3f scaling performance: <https://r3f.docs.pmnd.rs/advanced/scaling-performance>
- Electron powerMonitor: <https://www.electronjs.org/docs/latest/api/power-monitor>
- Chromium SwiftShader: <https://chromium.googlesource.com/chromium/src/+/HEAD/docs/gpu/swiftshader.md>
- WebGPU implementation status: <https://github.com/gpuweb/gpuweb/wiki/Implementation-Status>
- Tone mapping overview: <https://discourse.threejs.org/t/tone-mapping-overview/75204>
- three CSM: <https://threejs.org/docs/pages/CSM.html>
- react-postprocessing: <https://github.com/pmndrs/react-postprocessing>
- Mowing stripes: <https://www.brightview.com/resources/article/secret-getting-lawn-stripes-your-athletic-field>
- Madden field rendering (GDC): <https://gdcvault.com/play/1012475/Football-at-60-fps-The>
- Hex tiling: <https://jcgt.org/published/0011/03/05/paper.pdf>
- Texture repetition: <https://iquilezles.org/articles/texturerepetition>
- Procedural grass (GDC, Ghost of Tsushima): <https://gdcvault.com/play/1027214/Advanced-Graphics-Summit-Procedural-Grass>
- Poly Haven pure sky HDRI: <https://polyhaven.com/a/kloofendal_48d_partly_cloudy_puresky>

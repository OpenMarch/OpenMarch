# 3D View Findings

Measurements and human verdicts. Append-only, grouped by heading.

Entry template:

```markdown
### YYYY-MM-DD · <owner> · P5.1

- Result: (against the budget)
- Machine and commit:
- Fixture and command:
```

## Performance

Budgets are in [design.md](design.md) §9.

### 2026-10-04 · 3d-worker (3d/p5-perf) · P5.1

- Result (against the budget):
  - **Draw calls: met.** At most 32 in any kit (budget 300), counted with `renderer.info.render.calls`, shadow pass included, with crowd and 300 performers. High / low: hs 32 / 21, bighs 28 / 28, college 23 / 23, pro 22 / 22, gym 22 / 19, blank 5 / 4. Bighs, college and pro open at night or roof closed, where the sun casts no shadows, so `low` saves no calls there.
  - **Triangles** (high / low): hs 77k / 39k, bighs 97k / 61k, college 215k / 123k, pro 485k / 277k, gym 65k / 33k, blank 49k / 25k. The crowd is most of it (12 triangles a person; pro seats 34,664 people, 17,315 in `low`). The 300 performers are 24k triangles, doubled while they cast shadows.
  - **Kit build: met.** Median of 5 in the real window, CPU only (first run in brackets): kit hs 1.6 (2.1) ms, bighs 3.0, college 3.0 (4.4), pro 21 (48), gym 24 (30), blank 0.2. Crowd: hs 1.9, bighs 3.2, college 9.7, pro 19, gym 1.1 ms. Field surface: 68–116 ms per kit, the biggest build cost. Environment: under 1 ms. Pro with crowd and field is about 150 ms on the first build (budget 400 ms).
  - **CPU per frame: well under budget.** While playing with 300 performers, all `useFrame` callbacks together took 0.13–0.42 ms a frame, and `renderer.render` took 0.4–1.4 ms of main-thread time. Allocation-free `positionAtInto` for 300 performers: 37 µs a frame, against 54 µs for `positionAt` (a Node benchmark over 20,000 frames). `scene.updateMatrixWorld` costs 1–13 µs a frame per kit (3–58 objects), so freezing matrices isn't worth doing.
  - **60 fps on an integrated GPU: not measured.** This machine has no GPU. Under SwiftShader at 1280 × 683 the window draws 1–11 fps: pro 1.4 fps high and 1.2 low, hs 4.8 and 7.7, blank 7.3 and 11.3, all while playing. These numbers are GPU-bound software rasterization, not representative. The fallback check stays open for V6 on real hardware.
  - **Fallback: works.** On SwiftShader the window logged `3D View: below 30 fps for 3 s; switched to low quality (no shadows, half crowd).` once, 6.1 s after opening (3 s of slow frames after load), and stayed `low`.
  - **Kit swap hitch:** the longest frame after a venue change was 0.9–3.7 s under SwiftShader, mostly first-use shader compilation and the field surface. Not representative either; re-check on real hardware.
- Machine and commit: AMD Ryzen 5 3600 <!-- cspell:ignore Ryzen --> (6 cores, 12 threads), 7 GB RAM, Debian 13, no GPU. Electron on SwiftShader (ANGLE) in Docker plus Xvfb (`~/om-capture` toolkit). Branch `3d/p5-perf` on `3d-async` `da4782c2`, with a temporary measurement hook (`window.__view3dDebug`) that was not committed.
- Fixture and command: a 300-marcher, 7-page show built from `src/test/mock-data/marchers-and-pages.sql` (pages and beats kept; marchers replaced by a 25 × 12 block that turns and shifts every page). The 3D window was 1280 × 720 and the editor 640 × 1080. For each kit at its default lighting with crowd on: `setQuality("high")`, then 3 s paused and 4 s playing, and the same at `low`. Build times came from calling the kit, crowd, field and environment builders five times inside the window. The scenario and run folders are listed in the P5.1 pull request.

### 2026-10-08 · trevor (3d/p7-instruments) · instruments PR 1

- Bake with holds (`bakeForBodies`, node, Apple Silicon laptop, CPU only): 40 clips
  × 1 hold 2.1 MB in 29 ms (texture 92 × 1420); × 2 holds 6.0 MB in 37 ms
  (184 × 2048); × 4 holds (none, brass, trombone, contra) 9.0 MB in 63 ms
  (276 × 2048). Rows wrap into 2048-row columns, so a fourth hold widens the
  texture rather than failing. The ceiling at the spec's scale (every clip of
  3 height classes, 915 rows): 48 MB alone, 94 MB × 2 holds, 187 MB × 4 holds
  (a 5704 × 2048 float texture). Rows scale as clips × holds; a show pays only
  for the clips it plans, so a long show with many step sizes and directions,
  three classes and three brass families can climb well past 9 MB. The 64 MB
  concern in `instruments.md` §8 is not settled by the typical figure.
- Horn geometry: trumpet, mellophone, baritone and euphonium 576 triangles
  each, trombone 456, bass trombone 488, contra 596 (the `brass.test.ts`
  budget check), so 150 brass add about 85 k triangles.
- Frame time on real hardware and the visual check of each hold against the
  reference photos: not done in this pass; no GPU or browser was reachable
  from the session. The owner checks the web preview's Horn state picker.

### 2026-10-08 · trevor (3d/p7-instruments) · instruments PR 1, detail pass

- Horns retraced from the reference photos at two detail levels
  (`brass.test.ts` pins 8,000–12,000 high and 1,500–3,500 low): trumpet
  9,484 / 1,934; mellophone, baritone and euphonium 10,436 / 2,126 each;
  trombone 8,256 / 1,632; bass trombone 8,544 / 1,704; contra 8,084 / 1,830.
  150 brass at high add about 1.5 M triangles in instanced draws.
- Draw calls: one body mesh per (body type, look) group plus one horn mesh per
  brass group, so a band with four brass sections over seven body types adds
  up to 28 draw calls at high and up to 4 at low (one group per look there).
- The horn material is a smooth metallic `MeshStandardMaterial` (metalness 1,
  roughness 0.25, vertex colors) under the same bake; the scene now has a
  PMREM environment map from the preset's sky at intensity 0.6, which every
  glossy surface sees.
- Bake cost unchanged from the first pass (holds only; the horn adds no rows).
- Frame time on real hardware and the look of each horn and hold in the
  renderer: left to the owner; no GPU or browser in the session. Wireframe
  side views were checked against the photos for silhouette only.

### 2026-10-09 · trevor (3d/p7-instruments) · woodwinds, battery and guard

- Triangles per model (`triangleCount`, high / low):

| Model           | High  | Low   |
| --------------- | ----- | ----- |
| piccolo         | 4,128 | 1,688 |
| flute           | 4,752 | 1,936 |
| clarinet        | 9,168 | 2,352 |
| bassClarinet    | 6,624 | 2,016 |
| sopranoSax      | 4,704 | 1,652 |
| altoSax         | 6,720 | 2,280 |
| tenorSax        | 7,344 | 2,404 |
| bariSax         | 8,976 | 2,672 |
| snare           | 6,152 | 1,660 |
| tenors          | 9,904 | 2,616 |
| cymbals         | 7,424 | 1,200 |
| bass 18 in      | 6,728 | 1,900 |
| bass 32 in      | 6,728 | 1,900 |
| flag6           | 4,736 | 288   |
| swingFlag       | 4,736 | 288   |
| doubleSwingFlag | 9,472 | 576   |
| rifle           | 4,480 | 1,308 |
| sabre           | 7,264 | 684   |

Every woodwind and battery model sits inside the 4,000–12,000 / 1,000–3,500
budgets. The flags are lighter at low (288 for one silk, 576 for the pair):
a flat silk needs few cells, and `guard.test.ts` pins their own budgets.

- Render check in the built Electron app, the demo show (piccolos, alto and
  tenor saxes, snares, tenors, cymbals, color guard, rifles; no bass drums,
  so the bass was checked by its tests only), horns up and carry, from the
  front row, the podium, the end zone and zoomed free views.
- Before tuning: the snare sticks crossed right in front of the body and ran
  past the drum's front rim; the tenor sticks crossed in an X over the middle
  drums; the piccolo's right hand floated in the air past the end of the
  short tube (it shared the flute's hold); the rifle's back swivel and the
  sling's end sat inside the stock. Cymbals, flags, rifles and saxes read
  right: plates vertical at the chest, poles vertical with the silk overhead,
  the rifle across the chest at port arms and vertical at the shoulder in
  carry, the sax on the right side with the bell by the hip.
- Changes: sticks now run through the fist a third of the way up and angle
  in and down, so the snare tips meet short of the front rim without crossing
  and each tenor stick reaches the head of one front drum; the piccolo has its
  own hold with the right hand 0.24 m along the tube; the flute's lip plate
  faces straight back at the lips (keys forward); the bass drum moves forward
  with its size (the back stays 0.2 m ahead of the hold's origin) and the
  bass hold raises the hands so one mallet length reaches the center of every
  head from 18 to 32 in; the sax and clarinet key rods follow the body's
  surface; the bari's neck runs out further so its body hangs as far in front
  of the chest as the alto's; the rifle's back swivel hangs from the stock's
  underside.
- After: the snare V and the tenor sticks sit over the heads, the piccolo's
  hands are on the tube, and nothing else changed for the worse. Not seen in
  the frames: the bass drum (not in the show) and the bari, clarinet and
  bass clarinet (not in the show).

### 2026-10-09 · trevor (3d/p7-instruments) · sax placement

- The shared sax hold mapped the bell side (instrument +X) to world
  (0.32, −0.25, −0.90), straight back into the body, with the keys facing
  the performer's left: the saxes sat center-left inside the torso.
  Lacquered vertices in the torso box (|x| < 0.17, y 0.85–1.35) behind
  z 0.11, before → after: alto up 341 → 0, carry 202 → 0; tenor up 148 → 0,
  carry 57 → 0; bari up 400 → 0, carry 347 → 0. Deepest z after: alto 0.140,
  tenor 0.227, bari 0.137 (chest front 0.12).
- The new hold runs the body 15 degrees out to the right hip with the keys
  forward and right, bell rim center at x −0.06 (alto), −0.12 (tenor),
  −0.07 (bari), opening tipped forward; mouthpiece at (0, 1.52, 0.13), and
  at eye level in carry. `saxPlacement.test.ts` pins all of it. One hold
  still covers alto, tenor and bari.
- Render check in the built Electron app with the second demo show (bass
  drums, bari saxes, clarinets, flutes), up and carry, front row and podium.
  Saxes: every one on the performer's right at the hip, bell in front of
  the tube, neck to the mouth, nothing through the body; the right hand
  sits beside the lower stack rather than on it. Bass drums: four visible
  at clearly different sizes, sideways on the chest and clear of it,
  mallets at the heads. Clarinets: down the center line from the mouth.
  Flutes: level at the lips, tube to the performer's right. Nothing passed
  through a body.

### 2026-10-09 · trevor (3d/p7-instruments) · P7.2 idle drawing, first slice

- Change: the canvas runs `frameloop="demand"`; `DrawWhenNeeded` draws while
  the show plays or the camera moves, and for a few seconds after input, a
  store change, a show edit, a resize or a visibility change. On battery
  (when "Save power on battery" is on) the frame rate caps at 30 and the
  pixel ratio drops to 1. Both behaviors have switches in View settings.
- Measured in the built Electron app on the owner's Mac (Apple Silicon),
  the Fall Show 2026 demo (lhb-daft-punk-pt2), high school venue, 5 s
  windows; WebGL draw calls counted by wrapping the draw functions, CPU from
  `app.getAppMetrics()` summed over every process:

  | Build  | Idle (paused, still camera) | Playing                  |
  | ------ | --------------------------- | ------------------------ |
  | Before | 15,088 draws/s, 5.6% CPU    | 9,464 draws/s, 18.6% CPU |
  | After  | 0 draws/s, 4.9% CPU         | 8,831 draws/s, 19.2% CPU |

- Reading: idle GPU work goes to zero, which is where a laptop spends most of
  a viewing session. The CPU sum barely moves because it is dominated by the
  editor window and main process, and it doesn't include GPU time; a battery
  drain figure needs a real-hardware energy reading (Activity Monitor's
  Energy Impact or `powermetrics`), still open. Playing is unchanged, as
  expected: the next slices are the frame-time work (instanced draw-call
  count, shadow cost) the brief lists.
- Checked for staleness: camera flies and a horn-state change after idle
  periods all drew (screenshots in the session scratchpad).

### 2026-10-09 · trevor (3d/p7-battery-impl) · P7.2 instrument draw cost and shadows

- Change: instruments draw from one shared set of instanced meshes per model
  (`hornSet.ts`) instead of one mesh per body row, with a high-detail mesh
  within 28 m of the camera and a low-detail mesh past 34 m (the gap keeps a
  marcher from flickering between the two). A still show rewrites the
  choice when the camera moves more than 0.5 m.
- Shadows: the sun's shadow camera is fixed on the field, so the shadow map
  now redraws only while the show plays and for 4 s after a kit, lighting,
  quality, show or clock change. A camera move alone skips it.
- Measured in the built Electron app, Fall Show 2026 demo, high school
  venue, High quality, playing:

  | Measure              | Before | After  |
  | -------------------- | ------ | ------ |
  | Draw calls per frame | 198    | 130    |
  | Triangles per frame  | 3.18 M | 1.12 M |
  | Instrument triangles | 2.66 M | 0.60 M |
  | Frame rate (rough)   | 38     | 49     |

- Shadow pass during an orbit: about 4 draw calls a frame saved (10 visible
  casters on this kit). Small here; larger on the pro kit, whose roof and
  bowl cast. Frame times drift with GPU clocking, so the counts are the
  reliable figures.
- Still open: body meshes are 86 draws (7 body types times looks), the next
  target, and a real energy reading on battery.

### 2026-10-09 · trevor (3d/p7-instruments) · bake only the rows marchers play

- Change: the clip bake took every planned clip times every hold in the show
  (11 holds on the Fall Show 2026 demo). It now bakes only the clip and hold
  pairs some marcher plays, plus attention per height class and hold.
- Measured in the built Electron app, console bake log, High quality, Fall
  Show 2026 (385 marchers):

  | Build             | Bake                                   |
  | ----------------- | -------------------------------------- |
  | Before prep steps | 350 clips × 11 holds, 208.0 MB, 1.75 s |
  | Prep steps added  | 438 clips × 11 holds, 295.4 MB, 2.41 s |
  | Rows played only  | 1,963 rows, 126.6 MB, 1.05 s           |

- Reading: the GPU bake texture is 39 percent smaller than before prep steps
  and bakes in 60 percent of the time, prep rows included. A copy of
  JackBrittAct1 bakes 1,639 rows, 123.6 MB, in 0.99 s.

### 2026-10-10 · trevor (3d/cue-layering-measure) · channel layering spike (performer-behavior §8.5)

<!-- cspell:ignore GLSL prebaked webgl texels rebakes rebake -->

- Change measured: a spike of performer-behavior.md §8.3, URL-gated, not
  for merge (`src/view3d/spike/layeringSpike.ts`). Each vertex composes
  Feet (today's attributes), Body (spine.003 and up) and Horn (shoulders
  to hands, and every instrument vertex) by a per-bone channel id. Body and
  Horn state (row, samples, counts, phase) comes from a float
  `DataTexture` read by `gl_InstanceID`. Body is re-anchored to the Feet
  waist, Horn to the Body chest. Variants: `layered` (anchors inverted in
  GLSL), `prebaked` (rows assumed baked anchor-relative, no inverse),
  `layered2` and `prebaked2` (§8.5's fallback: Feet plus Horn only). Body
  and Horn play the Feet row 0.25 and 0.5 counts ahead, so they read other
  texture rows. Check: with both offsets at 0, `layered` draws what `off`
  draws (20 of 1.99 M pixels differ by more than 8/255, all on blended
  step sizes, which the spike's Body and Horn rows don't blend).
- Method: the web preview (`?spikeLayer=…&spikeN=…`) in headless Chromium
  148, ANGLE Metal, 1920 × 1036 canvas at 1x, Fall Show 2026 demo,
  high school venue with its default crowd. `spikeN` takes the show's first
  300 performers, or repeats the 385 to reach 600. At 6 paused pages, 100
  frames rendered back to back and synced with `readPixels`, marchers
  shown and then hidden, 3 times; medians. CPU submit was 0.14–0.53 ms
  against 2.3–22.7 ms of wall time, so the wall time is GPU time.
  `EXT_disjoint_timer_query_webgl2` is exposed but unusable: back-to-back
  queries overlap on ANGLE Metal (a frame of 1.0 ms wall time read 28 ms).
  Two full rounds. Scripts: `view3d-web/spike/measure-layering.mjs` and
  `measure-bake.mjs`.
- Machine and commit: Apple M1 Pro (14-core GPU), macOS 26.6.2, on branch
  `3d/cue-layering-measure` (from `3d/cues-compile` `43f7dc3e`). **Intel
  Iris Xe was not measured: no such machine here.** A base M1 (8-core GPU)
  was not measured either.
- GPU ms per frame, whole frame (round 1 / round 2), and the change from `off`:

  | Tier, n   | off       | layered     | prebaked    | layered2    | prebaked2   |
  | --------- | --------- | ----------- | ----------- | ----------- | ----------- |
  | low, 300  | 2.59/2.29 | +2.57/+1.51 | +0.86/+0.96 | +0.10/+0.30 | −0.03/+0.27 |
  | low, 600  | 3.00/3.05 | +3.04/+2.80 | +3.84/+2.11 | +1.47/+1.21 | +1.40/+0.85 |
  | high, 300 | 4.69/4.43 | +7.41/+5.84 | +6.33/+5.56 | +2.64/+2.76 | +2.38/+1.91 |
  | high, 600 | 9.27/9.09 | +13.4/+13.5 | +13.5/+12.4 | +5.96/+6.61 | +4.18/+4.54 |

  The scene without marchers is 0.86–1.16 ms in every run. Vertices
  skinned per frame (`off`): low 300, 0.16 M body and 0.44 M instrument;
  high 300, 1.44 M and 0.44 M; high 600, 2.87 M and 0.76 M. Instrument
  vertices are all on Horn, so they pay the full composition; they are
  most of the cost at low.

- Bake, Fall Show 2026 (385 performers, high, 3 runs, CPU in the window):

  | Bake                                | Texture rows |  Width (of 4096) |    MB |        Time |
  | ----------------------------------- | -----------: | ---------------: | ----: | ----------: |
  | Today: 1,963 clip × hold rows       |       85,423 |            3,864 | 126.6 | 1.03–1.04 s |
  | Feet channel: 438 clips once        |       18,108 |              828 |  27.1 |  231–233 ms |
  | Horn channel: 10 holds, static rows |           20 | (fits the above) |  0.03 |  0.7–0.8 ms |

  Feet plus Horn is 18,128 rows, 9 columns of 92 texels, 828 wide. A
  4096 × 2048 texture holds 44 columns, 90,112 rows, so 71,984 rows (about
  2,400 counts of phrases at 30 samples a count) remain for Horn and Body
  rows. Body has no rows until cues exist. A Horn-only texture (8 arm bones
  plus 1 prop bone, 36 texels a row) would hold 231,424 rows; it isn't
  needed for this show.

- Result against §8.5:
  - **Layering adds at most 1 ms at 300, M1, full quality: fail.** +5.8
    to +7.4 ms (`layered`), +5.6 to +6.3 (`prebaked`). The fallback, Feet
    plus one upper-body channel, fails too: +2.6 to +2.8 (`layered2`), +1.9
    to +2.4 (`prebaked2`). On the low tier only the two-channel variants
    stay under 1 ms at 300.
  - **60 fps at 1080p with 300 in `pro` on an integrated GPU:
    inconclusive.** Measured on the high school kit, not `pro`, and on an
    M1 Pro, not an M1 or an Iris Xe. The layered frame at 300 is 10–12 ms
    of GPU here.
  - **Bake inside 4096 × 2048: pass.** 828 texels wide, against 3,864
    today. Horn needs no texture of its own.
  - **Full show bake under 1.5 s: pass** (0.23 s, against 1.04 s today).
  - **Cue edit rebakes the touched channel in under 100 ms: pass for Horn**
    (0.7 ms, static rows only; phrase rows don't exist yet).
    **Inconclusive for Feet:** its whole channel takes 0.23 s, and a
    rebake of only the touched rows wasn't built.
- Reading: composing per vertex costs too much because every skinned
  vertex fetches and multiplies the anchors, and instruments put 0.4–0.8 M
  vertices on Horn. Per-channel baking is a clear win and keeps its place.
  Step 6 shouldn't build per-vertex composition as specified. An
  unmeasured option: compose once per instance and bone per frame (a pass
  writing 23 matrices per performer into a float target), so skinning
  reads one matrix per influence. That needs its own spike before the
  owner picks it over the fallback.

### 2026-10-11 · trevor (3d/cue-compose-pass) · compose once per frame (performer-behavior §8.5)

<!-- cspell:ignore GLSL texel texels readPixels lerping -->

- Change measured: the option the layering spike above left open. Each
  performer's 23 bones plus one prop bone get their final skinning
  matrices once per frame, in an RGBA32F texture of 96 texels per
  performer (42 performers a row, 4032 wide). Bodies and instruments skin
  from it with one matrix (4 fetches) per influence, and an `aSlot`
  attribute maps each instance to its performer. The composition is the
  `layered` one: Feet with today's step-size blend and leg turn, Body
  (spine.003 and up) re-anchored to the Feet waist, Horn (shoulders to
  hands) re-anchored to the Body chest, inverses included, the leg turn
  applied per bone after composing. Two ways to fill the texture
  (`src/view3d/spike/composeSpike.ts`, URL-gated, not for merge):
  `compose-gpu`, a render-to-texture pass with one fragment per
  (performer, bone, matrix column) into a float target
  (`EXT_color_buffer_float` is exposed here); and `compose-cpu`, the same
  composition in JavaScript from the bake's array, then three's
  `texSubImage2D` upload every frame. Channel state (Feet, turn, Body,
  Horn) is in a per-performer float texture written only when a clip
  changes. Body and Horn play the Feet row 0.25 and 0.5 counts ahead, as
  before.
- Method: the same as the layering spike above (web preview, headless
  Chromium, ANGLE Metal, 1920 × 1036 canvas at 1x, Fall Show 2026 demo,
  6 paused pages, 100 frames back to back synced with `readPixels`,
  marchers shown and then hidden, 3 times, medians, two full rounds; timer
  queries not used). With the marchers hidden the composition is skipped
  too, so its cost is inside the marchers' share. `off` was measured again
  in the same runs. Scripts: `view3d-web/spike/measure-layering.mjs` with
  `SPIKE_LAYERS=off,compose-gpu,compose-cpu SPIKE_LOOP=100`, and
  `check-compose.mjs`.
- Machine and commit: Apple M1 Pro (14-core GPU), on branch
  `3d/cue-compose-pass` (from `3d/cue-layering-measure` `d01c7863`).
  **A base M1, Intel Iris Xe and the `pro` kit were not measured.**
- GPU ms per frame, whole frame (round 1 / round 2), and the change from
  `off`:

  | Tier, n   | off       | compose-gpu | compose-cpu |
  | --------- | --------- | ----------- | ----------- |
  | low, 300  | 2.08/2.16 | −0.21/−0.19 | −0.37/−0.38 |
  | low, 600  | 3.06/2.88 | −0.11/−0.34 | −0.64/−0.43 |
  | high, 300 | 4.52/4.71 | −0.94/−1.21 | −1.65/−0.84 |
  | high, 600 | 9.50/9.24 | −3.89/−3.36 | −4.85/−4.19 |

  The scene without marchers is 0.86–1.31 ms in every run. Both variants
  are cheaper than today's skinning, not dearer: today each influence
  reads two sample rows (8 fetches, 16 when blended) and sums by turn
  class per vertex; composed, it reads 4. At high, 600, that drops 3.6 M
  skinned vertices from 8.1–8.4 ms of marchers to 3.6–4.7.

- CPU, per frame, in the window's main thread: `compose-cpu` composes in
  0.76–0.81 ms at 300 and 1.48–1.53 ms at 600 (medians of the 6 pages,
  both rounds and both tiers), and the upload call returns in 0.02–0.03
  ms. It uploads 516 KB a frame at 300 and 968 KB at 600 (whole texture
  rows); the copy itself runs in the GPU process and isn't timed apart.
  `compose-gpu` costs 0.005–0.01 ms to submit its pass. CPU submit per
  frame: 0.97–1.11 ms (`compose-cpu`, 300), 1.76–1.92 (600), against 0.14–0.35
  for `off` and `compose-gpu`; the wall time stayed above it, so the
  frames were still GPU-bound.
- Correctness: with both offsets at 0, against `off` (`compare-shots.mjs`):
  6–7 of 1.99 M pixels differ by more than 8/255 at high 300, 11–24 at low
  300, 10–25 at high 600, the same order as the `layered` check (20),
  which was traced to blended step sizes whose Body and Horn rows aren't
  blended (not traced again here). With the default offsets, the GPU pass read back against the
  CPU composition, at 4 pages and 12 clock values each, differs by at most
  1.5e-5 in any matrix entry (entries up to 2.5).
- Result against §8.5:
  - **Layering adds at most 1 ms at 300, M1, full quality: pass on an M1
    Pro**, both variants: the frame is 0.8–1.7 ms cheaper than today, with
    three channels and the full re-anchoring. A base M1 wasn't measured.
  - **600 and the low tier: pass**, cheaper than today in every
    configuration.
  - **60 fps at 1080p with 300 in `pro` on an integrated GPU:
    inconclusive.** The high school kit, not `pro`, and an M1 Pro. The
    composed frame at high 300 is 2.9–3.9 ms of GPU here, against 4.5–4.7
    today.
  - **Per-frame CPU (no budget in §8.5):** `compose-cpu` puts 0.8 ms at 300
    and 1.5 ms at 600 on the main thread on the fastest target, plus a
    0.5–1 MB upload each frame while playing. `compose-gpu` puts nothing.
  - Bake budgets: unchanged from the entry above (this spike doesn't
    change the bake).
- Reading: composing once per frame removes the GPU objection to §8.3.
  The cost moves from every vertex to 96 texels per performer, and the
  skinning gets cheaper because it reads one matrix instead of lerping
  two rows. Prefer `compose-gpu` for step 6: same or close GPU numbers,
  no main-thread work, no per-frame upload (the battery concern in
  `10-runtime-layering.md`), and it scales with fragments, not
  JavaScript. `compose-cpu`'s whole frame was 0.1–1 ms shorter in 7 of
  8 runs (0.37 ms longer in one), but its CPU time doubles with performers and isn't measured on a slow CPU.
  Not covered: the pass's own GPU time apart from the frame, a base M1,
  Iris Xe, `pro`, the shadow pass (still unpatched), and a parity test of
  the composed pose against a mixer-layered one.

### 2026-10-11 · trevor (3d/cue-layering) · step 6, the layered renderer

<!-- cspell:ignore readPixels -->

- Change measured: performer-behavior.md section 8.3 built for the window
  (`src/view3d/render/`): the per-channel bake (Feet clips once, each hold
  once as a Horn row, transitions as baked rows, a prop bone on every row),
  the channel state texture, and the GPU compose pass that bodies and
  instruments skin from, one matrix per influence. Instruments ride the
  prop bone. Against `3d/cue-planner` (`b41f94a6`): the same code built
  before step 6.
- Method: the compose spike's (above), both builds as static sites
  (`view3d-web:build`), each with the spike's harness cut down and never
  committed (a performer-count override and the back-to-back frame loop;
  in the new build each frame runs the compose pass first). Fall Show 2026
  demo, headless Chromium, ANGLE Metal, 1920 × 1036 canvas at 1x, 6 paused
  pages, 100 frames synced with `readPixels`, marchers shown then hidden, 3
  times, medians, two rounds. Apple M1 Pro. **A base M1, Intel Iris Xe and
  the `pro` kit were not measured.**
- GPU ms per frame, whole frame (round 1 / round 2):

  | Tier, n   | before    | step 6    | change      | spike `compose-gpu` |
  | --------- | --------- | --------- | ----------- | ------------------- |
  | low, 300  | 2.24/2.15 | 1.89/1.86 | −0.36/−0.29 | −0.21/−0.19         |
  | low, 600  | 3.07/3.03 | 2.93/2.63 | −0.14/−0.40 | −0.11/−0.34         |
  | high, 300 | 4.57/4.61 | 3.61/3.63 | −0.97/−0.99 | −0.94/−1.21         |
  | high, 600 | 9.39/9.40 | 5.64/6.42 | −3.75/−2.98 | −3.89/−3.36         |

  The scene without marchers is 0.93–1.18 ms in every run; CPU submit
  0.13–0.32 ms, unchanged.

- Bake, whole show (385 performers, high): before, 1,951 rows of 427 clips
  × 11 holds, 126.6 MB, 1.01 s; step 6, 437 rows (17,587 Feet texture rows,
  20 Horn), 864 texels wide, 28.3 MB, 0.19 s. Low: 173 rows, 384 wide,
  12.6 MB, 0.08 s. A horns-down cue on the band adds 5 hold and 5
  transition rows (165 texture rows).
- Correctness: the default show drawn by both builds at the same paused
  page (page 2, Press box), compared with the spike's `compare-shots.mjs`
  method: 47 of 2,073,600 pixels differ by more than 8/255 at high and 47
  at low, single pixels on silhouette edges, no cluster over 5 pixels. The
  GPU pass read back against `composeMath.ts` at the same clock differs by
  at most 4.8e-7 in any matrix entry (entries up to 2.5). Forcing the CPU
  fallback draws 16 pixels apart from the GPU pass. Unit tests compare the
  composed hold row against om-pose's own bake of the clip in that hold
  (at most 2e-5, turned and not).
- Horns-down cue, checked in the web preview from a close front-row view:
  horns up on the cue's first count, bells about halfway down at its
  middle (the baked transition row's prop bone is 48 of 90 degrees round
  there), and the brass carry hold on its count, bell to the ground with
  the mouthpiece at the face. Battery and guard, which the cue doesn't fit,
  are unchanged.
- Result against §8.5: layering costs nothing at 300 on an M1 Pro (the
  frame is about 1 ms cheaper at high); the bake fits 4096 wide with room
  to spare and takes 0.19 s. The integrated-GPU budget is still
  unmeasured.

## Packaging

### 2026-10-11 · 3d-worker (3d/c1-sharp) · C1.5 sharp, macOS arm64

<!-- cspell:ignore DLOPEN dyld codesign -->

- Result: `sharp` 0.35.5 (libvips 8.18.7) runs in main in a packaged arm64
  `--dir` build and resizes a 2048² image to a 512² PNG. Three runs of the
  self-test: exit 0, output 512 × 512 PNG; `import("sharp")` 31–38 ms,
  2048² PNG encode 31–34 ms, resize 19.5–20 ms. `sharp` resolves inside
  `app.asar`; the native addon and libvips load from `app.asar.unpacked`.
  With `@img/sharp-libvips-darwin-arm64` moved out of the package, the
  self-test exits 1 with `ERR_DLOPEN_FAILED`, so the check does fail when
  the binaries are missing. A normal launch (no variable) still opens the
  editor.
- App size, arm64 `--dir` build, apparent bytes:

  | Item                           | Baseline (`0cddaefc`) | With sharp 0.35.5 | Delta      |
  | ------------------------------ | --------------------- | ----------------- | ---------- |
  | `OpenMarch.app` total          | 969,247,809           | 971,945,790       | +2,697,981 |
  | `app.asar`                     | 595,503,243           | 595,217,740       | −285,503   |
  | `app.asar.unpacked`            | 103,286,359           | 106,238,307       | +2,951,948 |
  | `…unpacked/node_modules/@img`  | 16,299,147            | 18,509,969        | +2,210,822 |
  | `…unpacked/node_modules/sharp` | in asar (0.34.5)      | 741,126           | +741,126   |
  | zip of `.app` (`ditto -c -k`)  | 294,595,573           | 295,475,580       | +880,007   |

  The baseline already ships sharp 0.34.5 and its darwin-arm64 libvips
  through `@openmarch/ui` → `astro`; the build now carries one copy,
  0.35.5. The 10.3 MB of `@esbuild/darwin-arm64` the spike saw did not
  appear in either build here.

- `files` filter: electron-builder 26.8.1's pnpm collector already leaves
  out `@img` packages for other platforms. With every platform's `@img`
  package installed (`supportedArchitectures` in `pnpm-workspace.yaml`,
  13 extra packages), a build without the filter still shipped only
  `sharp-darwin-arm64` and `sharp-libvips-darwin-arm64`. The filter is a
  second guard. The `.npmrc` `supportedArchitectures` lines have no effect
  under pnpm 10.11; only the `pnpm-workspace.yaml` form installed the
  other platforms. A `files` list under `mac`, `win` or `linux` replaces
  the top-level list instead of adding to it (it packed `src/`, `e2e/` and
  `.env.*` into the asar), so the filter sits in the top-level list and
  uses `${platform}`, the build host's platform.
- Signing: with no identity, electron-builder ad-hoc signs the unpacked
  `libvips-cpp.8.18.7.dylib` and `sharp-darwin-arm64-0.35.5.node` with the
  hardened runtime (`flags=0x10002(adhoc,runtime)`), so it does sign them.
  That ad-hoc hardened build won't launch (dyld: Electron Framework
  "different Team IDs"), so the runs above used a local
  `codesign --force --deep --sign -` re-sign without the hardened runtime.
  Developer ID signing, library validation and notarization are
  **not tested**.
- Not run: macOS x64, Windows and Linux packaged builds, and the Linux glib
  check (AppImage and snap). Nothing here can run them.
- Machine and commit: Apple M1 Pro, macOS 26.6.2, Electron 40.8.5,
  electron-builder 26.8.1, pnpm 10.11.0. Branch `3d/c1-sharp` on
  `0cddaefc`.
- Fixture and command: from `apps/desktop`, after
  `pnpm --filter "@openmarch/desktop^..." build`:

  ```sh
  pnpm run apply-styles && pnpm exec vite build
  CSC_IDENTITY_AUTO_DISCOVERY=false pnpm exec electron-builder --mac --dir \
    -c.mac.notarize=false --publish never
  codesign --force --deep --sign - release/0.1.7/mac-arm64/OpenMarch.app  # local only
  OPENMARCH_SHARP_SELF_TEST=/tmp/sharp.json \
    release/0.1.7/mac-arm64/OpenMarch.app/Contents/MacOS/OpenMarch; echo $?
  ```

  On Windows and Linux, run the packaged executable the same way with the
  variable set; a signed macOS build needs no re-sign.

## Verdicts

### 2026-10-09 · trevor (3d/architecture-props) · rifle, sabre and swing flag models

- Rebuilt against product photos: an Ultra Spin rifle, a Zaber <!-- cspell:ignore Zaber --> sabre, and
  swing flags held at the tab.
- Rifle: the stock was a round lathe with a barrel, a barrel band and a
  trigger guard standing proud of it. It is now a loft of rounded-rectangle
  sections (`RIFLE_STATIONS`): 0.12 m deep at the butt, 0.033 m at the wrist
  under the hand, a chrome bolt plate let into the top, no barrel or trigger
  guard, and the sling drawn nearly straight from under the butt (z −0.255)
  to under the fore-end (z 0.40). The hold's grip point and `leftGrip` are
  unchanged.
- Sabre: the blade went from 30 to 8 mm wide (a rapier point) to 25 to 19 mm
  with a white rubber tip cap, and curves 85 mm off straight instead of 50.
  The hilt is chrome, no longer the brass finish: a cup guard, a 24 mm flat
  D-bow, two side bars, and four finger grooves on the edge side of the grip.
- Swing flag: the silk covered the hand (it ran the pole's full 0.9 m). Now
  the pole is 1.02 m with a 0.32 m bare tab below the hand side, the silk is
  1.5 × 0.7 m with a sleeve around the pole, and its fly end droops 0.5 m and
  rolls in a deeper wave. The 6 ft flag's silk is unchanged.
- Triangles (high / low): swingFlag 4,864 / 328, doubleSwingFlag
  9,728 / 656, rifle 6,464 / 1,104, sabre 9,088 / 924, flag6 4,736 / 288
  (unchanged). All are inside the budgets in `guard.test.ts`.
- Checked in a three.js preview of each model (side, top, three-quarter and
  close views, high and low), not in the Electron app. Holds were not
  changed; the Guard equipment setting puts the swing flags and sabre in
  the guard's hands to check them there.

### 2026-10-09 · trevor (3d/p7-instruments) · rifle finish and hold

- Owner: the rifle read wrong in the app. It should be solid white and always
  held parallel to the ground.
- Cause of the color: one instrument material for every part, metalness 1 and
  roughness 0.25, so the white stock drew as a mirror of the sky and field.
  Wood, silk, black and drum-head parts now draw non-metallic at roughness
  0.65, chosen per vertex from `_part` in the shader; brass, chrome and
  shells are unchanged.
- The hold: port arms (diagonal) and right shoulder arms (vertical) are
  replaced by one level hold for every state, wrists at y 1.08 and z 0.22,
  the muzzle along +X.
- Checked in the web preview (Guard equipment set to Rifle, front-row camera,
  zoomed in on one guard member): the rifle is matte white, level at the
  waist, butt past the right hip, both hands on it.

### 2026-10-09 · trevor (3d/p7-instruments) · swing flag holds

- Owner: a swing flag is held in one hand; two are one in each hand at down
  45, kept ready for swing animations later.
- Before: both used the 6 ft flag's two-handed hold, the pole vertical in
  front of the body. Now `swingFlag` and `doubleSwingFlag` are hold
  families of their own, the same in every state. Wrists at
  (∓0.50, 1.08, 0.09), 45 degrees out and down from the shoulders. The pole
  runs on along the arm from a fist at its butt end (pole now −0.06 to 0.96
  in the instrument frame), and the silk trails back, its lowest corner
  0.09 m above the ground before the ripple. The silk no longer droops
  along the pole.
- The second flag is the first one's exact mirror image through the body's
  center plane, worked out from the hold; `guard.test.ts` checks every
  vertex, and that no silk vertex reaches the ground.
- Checked in the web preview with Guard equipment set to Swing flag and to
  Double swing, from the front row and the press box: one flag in the right
  hand with the left arm down, or a low V with a flag in each hand.

### 2026-10-09 · trevor (3d/p7-instruments) · modeled trumpet

- Owner supplied "Trumpet" by Kagelok (Sketchfab, CC BY 4.0) as the
  trumpet to use and the look for the other horns.
- Source: 58 objects, 28,332 triangles, materials Gold, Silver, Black and
  White, bell along +X and valve caps up +Z, 8.93 units long. The pinky hook
  sits on the leadpipe side (−Y), the player's right with the bell forward,
  so the file isn't mirrored.
- Baked (Blender 4.2.3, `export-horn.py`, `trumpet.config.json`): scale
  0.05375 to 0.48 m, origin chosen so the mouthpiece rim is at
  (0, 0.018, −0.168) like the procedural trumpet's. High: 10,836 triangles
  and 7,376 vertices; low: 3,423 and 2,483. The JSON is 406 KB. Re-running
  the exporter reproduces it byte for byte.
- Checked in the web preview from the front row: the trumpets draw the new
  mesh, bells forward at the lips, valves and silver slides visible from
  the side.

### 2026-10-09 · trevor (3d/p7-instruments) · modeled mellophone, baritone, euphonium, contra

- Owner: no more models to be found; build the rest to the reference photos.
- `build-horns.py` (Blender 4.2.3) reuses the trumpet's valve block (scaled
  1.25 mellophone, 1.45 baritone and euphonium, 1.7 contra) and mouthpiece
  (1.1, 1.35, 1.4, 1.8), and sweeps new tubing and lathes new bells. Lengths
  and heights are fractions of the horn's length measured off side-view
  photos, with the procedural horns' lengths and bell diameters.
- Sizes (length × width × height, m): mellophone 0.552 × 0.266 × 0.301,
  baritone 0.622 × 0.256 × 0.347, euphonium 0.662 × 0.287 × 0.377, contra
  0.974 × 0.512 × 0.562.
- Triangles (high / low): mellophone 10,103 / 2,633; baritone 10,104 /
  2,634; euphonium 10,105 / 2,631; contra 10,186 / 2,657. The five baked
  meshes are 1.95 MB of JSON, about 650 KB gzipped.
- Mouthpiece rims match the procedural horns' (−0.35 L mellophone, −0.36 L
  baritone and euphonium, the contra's point unchanged), so no hold moved;
  `brass.test.ts` pins them.
- First pass faults fixed before baking, from Blender side renders: the
  leadpipe sat inside the bell tube, the inner loop crossed the valves on a
  diagonal, the contra's wrap kinked where it met the bell, and the wrap's
  front bow climbed diagonally into the valves.
- Checked in the web preview: the trumpet and mellophone sections at the lips from the
  front row; a contra on the shoulder from the podium. A clean side-on view
  of the baritones in their holds wasn't captured.

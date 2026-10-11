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

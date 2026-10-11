# 3D View Technical Design

How the MVP fits together. ADR 0002 holds the decisions; this file holds the
detail workers need to build in parallel without colliding. The reference
demo, [ref/venue-demo.html](ref/venue-demo.html), shows the intended look. It
works in **feet** with globals in one file. The product works in **meters**
with the module layout below.

## 1. Module layout and ownership

Each file has one owning package, so parallel work doesn't conflict. Paths are
under `apps/desktop/` unless noted.

```text
packages/core/src/field/world.ts            P1.1  step/pixel <-> world meters, fieldFootprint()
src/view3d/core/types.ts                    P0.3  shared contracts (change only through the lead)
src/view3d/core/venueSettings.ts            P1.2  zod schema v1, defaults, defaultVenueForField()
src/db-functions/view3dVenue.ts             P1.2  read/write with history
src/hooks/queries/useVenueSettings.ts       P1.2  query + mutation hooks
electron/database/migrations/schema.ts      P1.2  view3d_venue table (+ generated migration)
electron/main/view3dWindow.ts               P1.3  window lifecycle; P1.4 adds the relays
electron/preload/view3d.ts                  P1.3  window.view3d API; P1.4 adds channels
src/view3d/window/View3dRoot.tsx            P1.3  entry for ?view=3d, providers, TitleBar
src/view3d/sync/protocol.ts                 P1.4  payload types, showTimeAt()
src/view3d/sync/useView3dPublisher.ts       P1.4  editor side: publishes clock/selection/invalidate
src/view3d/sync/view3dSyncStore.ts          P1.4  window side: Zustand store fed by IPC
src/view3d/core/field/*                     P2.1  field surface painter and mesh
src/view3d/core/environment/*               P2.2  sky, lighting rig, poles, boards, crowd, materials
src/view3d/core/kits/stands.ts, hs.ts, bighs.ts, college.ts, blank.ts    P2.3
src/view3d/core/kits/bowl.ts, pro.ts        P2.4
src/view3d/core/kits/gym.ts                 P2.5
src/view3d/core/kits/index.ts               P3.1  registry: Record<VenueKitId, KitBuilder>
src/view3d/window/Scene.tsx                 P3.1  assembles field + kit + environment
src/view3d/window/camera/*                  P3.2  rig, fly-to, orbit, pick-a-seat, HUD
src/view3d/window/overlay/*                 P3.3  overlay UI per ui.md
src/view3d/positions.ts                     P4.1  the only place positions are computed
src/view3d/window/performers/*              P4.2  instanced performer blocks
e2e/tests/view3d.spec.mts                   P4.3
```

Tests sit next to code in `__test__/` folders (`apps/desktop/AGENTS.md`).

## 2. Coordinates

- Meters. The origin is center front. +X points toward side 2, +Y points up,
  and +Z points toward the audience. The field is at `z <= 0`.
- `world.ts` exports:
  - `stepMeters(fp)`;
  - `pixelsToWorld(fp, {x, y}) -> {x, z}` and `worldToPixels(fp, {x, z})`;
  - `stepsToWorld(fp, {xSteps, ySteps})`;
  - `fieldFootprint(fp) -> FieldFootprint`, the bounding box of the
    checkpoints.

  The tests use the real templates from `FieldProperties.templates.ts`.

- A standard football field with end zones is `x ∈ [-54.86, 54.86]` and
  `z ∈ [-48.77, 0]`.

## 3. Venue settings

- The schema is in ADR 0002 D-5.
- `defaultVenueForField(fp)` maps templates to kits:
  - football → `hs`;
  - grid, indoor and SoundSport → `gym`;
  - anything else → `blank`.
- Default params: `homeColor #6442ff`, `awayColor #c23b3b`,
  `endZoneText ""`, `endZoneColor #1f2a5c`.
- Lighting must be one of the kit's `lightingPresets`. If it isn't, fall back
  to the kit's default.
- `useVenueSettings()` returns the stored row or the default. Its mutation
  writes with `transactionWithHistory` and invalidates
  `["view3d_venue"]`.

## 4. Field surface (P2.1)

`buildFieldSurface({ fieldProperties, theme, style, params, image }) -> { mesh, dispose }`.

- **What it draws** mirrors `OpenMarchCanvas.createFieldGrid`: checkpoint
  lines, half lines where the 2D canvas draws them, hashes, yard numbers from
  `yardNumberCoordinates`, and checkpoint `fieldLabel`s.
- **Styles:**
  - `turf` is used by the stadium kits. It has green turf with 5-yard mowing
    stripes, white lines, and end-zone paint and text from `params` when the
    field has end zones. It needs lines every 5 yards; NFL and NCAA one-yard
    ticks are optional.
  - `theme` is used by `blank`. It uses the `FieldTheme` colors, like the 2D
    canvas.
  - `tarp` is used by `gym`. It shows the field background image when one is
    set (respecting `imageFillOrFit`), otherwise a generated dark tarp with
    5-step tick marks.
- **Texture:** a canvas texture up to 4096 px on the long side (8192 if
  `renderer.capabilities.maxTextureSize` allows), with maximum anisotropy and
  sRGB color space. It's a plane at `y = 0.02` covering the footprint.
- **Fonts:** wait for `document.fonts.load('700 64px "DM Sans"')` before
  painting, and fall back to the system font.

## 5. Shared environment (P2.2)

- **Sky dome:** a gradient shader with fog, and `setSky(preset)`.
- **Lighting rig:** one hemisphere light and one shadow-casting directional
  sun, owned by the scene and driven by the preset. Kits add their own extra
  lights (poles, roof bars, gym spots) and switch them in `setLighting`.
  Preset values are in the reference demo's `SKY` table.
- **Builders:**
  - `lightPole(height, lookAt)` returns `{ object, setOn(on, k) }`.
  - `videoBoard(w, h, legHeight, title, sub)`.
  - `buildCrowd(seatRows, { density, palette, aisleEvery, quality })` returns
    `{ mesh, clearAround(point, radius) }`. Use one `InstancedMesh`. A person
    is a 0.43 × 0.8 × 0.3 m box with a little height jitter. Space people
    0.64 m apart, and add an aisle every 18 people.
- **Shared materials:** concrete, metal, seats and glass, so draw calls stay
  low.

## 6. Kits

Every kit is a `KitBuilder` (`types.ts`). Kits place geometry **relative to the
footprint**, not to absolute numbers, so a narrower or longer field still
works. Every kit also adds a ground plane. Dimensions below come from the
approved reference, converted to meters (1 ft = 0.3048 m).

### `hs`: high school (P2.3)

- **Ground and track:** grass ground and a 6-lane track. The track is a
  stadium shape: semicircles of radius 29.0–38.1 m on the field's long axis,
  with straights ±45.7 m from field center.
- **Home stand:** front edge 15.8 m in front of the front sideline. 28 rows,
  0.79 m treads, 0.30 m rises, a 1.2 m base, 79 m long.
- **Press box:** 27.4 m wide and 3.7 m tall, on a 2.4 m lift at the top of the
  home stand.
- **Visitor stand:** 14 rows, 61 m long, mirrored behind the back sideline.
- **Other:** a podium (1.8 × 2.4 × 1.8 m) 7.9 m in front of the front
  sideline at center. Four light poles 27 m tall.
- **Cameras:** `pressBox`, `frontRow` (offset 11 m toward side 1 to clear the
  podium), `podium`, `endZone`, `blimp`, `topDown`.
- **Lighting:** day, dusk, night. Default: day.

### `bighs`: big high school (P2.3)

- Same track as `hs`.
- **Home stand:** 44 rows, 0.82 m treads, 0.335 m rises, a 2.4 m base, 104 m
  long.
- **Press box:** three stories, 55 m wide and 11 m tall.
- **Visitor stand:** 30 rows, 91 m long.
- **Video board:** 29 × 16 m on 10 m legs, behind the side-2 end zone.
- **Other:** six 37 m light poles and a concrete plaza behind the side-1 end
  zone.
- **Cameras:** as `hs`. **Lighting:** as `hs`. Default: night.

### `college`: college bowl (P2.3)

- No track.
- **Home and visitor stands:** 50 rows each, 0.82 m treads, 0.32 m rises, a
  2.4 m base, 122 m long, 12 m off the sidelines.
- **End stands:** 34 rows, 67 m long.
- **Press box:** 55 m wide, 4.9 m tall, on a 1.8 m lift.
- **Other:** a video board above the side-2 end stand, and 43 m poles.
- **Cameras:** `pressBox`, `frontRow`, `endZone`, `blimp`, `topDown`.
- **Lighting:** day, dusk, night. Default: night.

### `pro`: pro dome, Lucas Oil-like (P2.4)

- **Bowl outline:** one continuous bowl whose rows follow a rounded rectangle
  around the field. Its inner half-extents are the footprint plus 7.6 m on each
  side, and its corner radius is 21.3 m. Each row offsets the outline outward.
  Build all treads as one mesh and all risers and soffits as another (see the
  demo's `bowlOutline`, `ringBand` and `bandMesh`).
- **Lower tier:** 32 rows, 0.85 m treads, 0.29 m rises, a 1.5 m base.
- **Suite ring:** glass between 11.3 and 14.9 m high, just behind the lower
  tier.
- **Upper tier:** starts at outline offset 25 m. 38 rows, 0.88 m treads,
  0.47 m rises, a 17.7 m base.
- **Upper fascia:** an LED ribbon whose texture repeats along the ring and
  shows `params.endZoneText`, or "OPENMARCH" when that's empty.
- **Clerestory:** translucent glass from the bowl rim up to the roof at 51 m.
- **Roof:** a fixed frame around a 128 × 73 m opening, plus two panels that
  slide over the ends. `roofClosed` animates them shut. Light bars and six
  spots sit on the opening's edges. Hide the roof and clerestory while the
  camera is above roof height.
- **Video boards:** two end-zone boards, 33.5 × 17.7 m, at 39 m.
- **Cameras:** `pressBox` (suite level, front side), `lowerBowl`, `upperDeck`,
  `endZone`, `sideline` (field level), `blimp`, `topDown`.
- **Lighting:** day, night, roofClosed. Default: roofClosed.

### `gym`: indoor gym (P2.5)

- **Performance area:** the footprint, with the field image or the generated
  tarp on top. Safety tape 1.5 m outside it.
- **Room:** a box sized to the footprint plus 9 m on each side, 11 m tall.
  The ceiling is dark with emissive light panels. Hide the panels while the
  camera is above the ceiling.
- **Floor:** maple, with basketball court lines (28.65 × 15.24 m) centered
  under the performance area.
- **Bleachers:** front side only. 12 rows, 0.73 m treads, 0.35 m rises, a
  0.43 m base. Front edge 3 m in front of the performance area.
- **Other:** folded bleachers and banners on the back wall.
- **Cameras:** `geJudge` (row 9, half to three-quarters up), `frontRow`,
  `corner`, `floor` (performer eye, back of the floor facing the audience),
  `topDown`.
- **Lighting:** house and show. Show dims the room and turns on four spots
  aimed at the floor. Default: house.

### `blank` (P2.3)

- The field surface in `theme` style on a neutral ground. No stands.
- **Cameras:** `frontRow` (ground level), `endZone`, `blimp`, `topDown`.
- **Lighting:** day, dusk, night.

### All kits

- **Kits never build the crowd.** They return `seatRows` and an optional
  `crowdDensity`, and the scene (P3.1) calls `buildCrowd` once. That way the
  crowd toggle and team colors don't rebuild the kit.

- Return `seatRows` for every stand, so the crowd and pick-a-seat work the
  same everywhere.
- `topDown` looks straight down, oriented like the 2D canvas: front at the
  bottom of the screen, side 1 on the left.
- Every camera seat must sit inside the kit's geometry, never inside a wall or
  a crowd box. The crowd's `clearAround` handles people.

## 7. Window and sync (P1.3, P1.4)

- `main.tsx` checks `new URLSearchParams(location.search).get("view") === "3d"`
  and dynamically imports `view3d/window/View3dRoot`. The window gets the same
  `QueryClient`, theme, Tolgee and `TitleBar` setup as the editor, but no
  editor contexts.
- The window's Drizzle instance uses `window.view3d.sqlRead` as its proxy, so
  the existing query options work unchanged. Writes go only through
  `requestVenueChange`, and playback only through `requestPlayback`.
- **Publisher (editor):** `useView3dPublisher()` is mounted once in the editor.
  It sends:
  - `clock` on play, pause, seek and page change, and every second while
    playing, computing `anchorShowMs` from `getLivePlaybackPosition()` when
    playing and from the selected page's end when paused;
  - `selection` on change;
  - `invalidate` from the same places `useHistory` and mutations invalidate.

  It answers `hello` and handles `venue-change-request`. It does nothing when
  no 3D View window is open (main tells it with `view3d:window-state`, a
  boolean push), except open the window with a show when the app setting
  `view3dAutoOpen` is on. `RegisteredActionsHandler` handles
  `playback-request` by running the same registered action as the editor's
  playback buttons.

- **Window store:** the anchor, the selection and a `showMs()` reader built on
  `showTimeAt`. Components read it in `useFrame`, not through React renders.

## 8. Positions and performers (P4)

- `positions.ts` exports `usePerformerTimelines()`, which loads every page's
  coordinate data in the window and combines it into one `MarcherTimeline` per
  marcher. It also exports `positionAt(timeline, ms) -> {x, z}` in world
  meters, built on `getCoordinatesAtTime` and `pixelsToWorld`.
- Performers (ADR 0002 D-7, amended 2026-10-07): om-pose's animated
  marchers, drawn by its instanced renderer (vendored in
  `src/view3d/vendor/om-pose/`) as one `InstancedMesh` per (body type,
  section uniform), skinned on the GPU from one texture of baked clips.
  - Looks (`core/marchers/looks.ts`): body type and skin tone by a hash of
    the marcher; height class 0.95/1.00/1.05 by the same hash at `high`,
    1.00 at `low`; a classic uniform per section in its 2D fill color, with
    the section's instrument and no shako for guard. Each mesh draws only the
    parts its look wears.
  - Motion (`core/marchers/planner.ts`, `countClock.ts`): per count, not per
    page. A count with travel steps along that count's vector (family, leg
    turn and size blend from om-pose's `step-blend.js`); a count without is
    mark time while the band moves and attention while it holds. Step-offs,
    loops, halts by parity, change clips (or a cut) between moves, and a
    landing correction that puts the body on its dot at every rest. The
    upper body always faces the front sideline.
  - `low` quality draws om-pose's block bodies with the same clips.
    Cylinders show only while the assets load.
  - Selected marchers get an accent ring at their feet, and every marcher a
    soft contact disc (there is no shadow pass for the instanced skinning).
  - Assets: `src/view3d/assets/om-pose/` (bodies, one clip pack per height
    class, manifest), packed by `scripts/view3d-assets/pack-om-pose.mjs`.

## 9. Budgets

- 60 fps at 1920 × 1080 on an integrated GPU (Intel Iris Xe or Apple M1) for
  `pro`, with crowd, shadows and 300 performers.
- Under 300 draw calls in any kit.
- Kit build under 200 ms, or under 400 ms for `pro` with crowd.
- `quality: "low"` turns off shadows, halves crowd density and renders at 1× pixel density. The window
  switches to it after 3 seconds below 30 fps, and logs that.
- No network requests from the window.

Record measurements in [findings.md](findings.md).

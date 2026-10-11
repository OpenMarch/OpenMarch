# 3D View Implementation Plan

Shared context for every worker. Read it once per session. It changes only to
record a decision, and the change is logged in the phase that made it.

## 1. Repo facts (verified 2026-10-04 on `main` at `e731f3a2`)

Paths are relative to `apps/desktop/` unless they start at the repo root.

- **Field model:** `packages/core/src/field/FieldProperties.ts`.
  - Coordinates are in steps from center front. Side 1 is negative X.
  - `pixelsPerStep = stepSizeInches * 0.5` and `PIXELS_PER_INCH = 0.5`.
  - `centerFrontPoint` is `(width / 2, height)` in canvas pixels, and canvas Y
    grows toward the front.
  - Checkpoints, `YardNumberCoordinates`, `useHashes`, side descriptions and
    image settings are on the same class.
  - The theme is `FieldTheme.ts`, with RGBA colors and `rgbaToString`.
- **Templates:** `src/global/classes/FieldProperties.templates.ts` merges
  `fieldTemplates/Football.ts` (HS, college and pro, with and without end
  zones) and `fieldTemplates/GridFields.ts` (indoor grids and SoundSport).
- **Field storage:** the `field_properties` table in
  `electron/database/migrations/schema.ts` is a single row with `json_data`
  plus an `image` blob.
  - CRUD is in `src/global/classes/FieldProperties.ts`, and the query hook is
    `src/hooks/queries/useFieldProperties.ts`.
  - Writes use `transactionWithHistory`.
  - Migrations are generated with `pnpm --dir apps/desktop run migrate`;
    there are ten so far, `0000` to `0009`.
- **2D grid drawing (the semantics to mirror):**
  `src/global/classes/canvasObjects/OpenMarchCanvas.ts`, `createFieldGrid`
  (around lines 1571–2013) and `refreshBackgroundImage`.
- **Positions:** `src/utilities/Keyframes.ts`. `getCoordinatesAtTime(ms, timeline)`
  interpolates linearly, or along a pathway. Timelines come from
  `src/hooks/queries/useCoordinateData.ts` (`coordinateDataQueryOptions`,
  `useManyCoordinateData`, `combineMarcherTimelines`).
  - A page's positions are reached at the **end** of that page.
  - The editor's playback loop, `src/hooks/useAnimation.ts`, only loads ±2
    pages.
- **Clock:** `src/components/timeline/audio/AudioPlayer.tsx`.
  `getLivePlaybackPosition()` is the editor's live show time, based on its
  `AudioContext`. Playing state is in `src/context/IsPlayingContext.tsx` and
  the selected page in `src/context/SelectedPageContext.tsx`.
- **Colors:** `src/hooks/queries/useMarchersWithVisuals.ts`. Priority is
  marcher-page appearance, then tag, then section, then theme default.
- **Electron:**
  - `electron/main/index.ts` has one module-level `win`. It is frameless, and
    the CSP is set in `onHeadersReceived` and in `index.html`.
  - IPC handlers are registered there and in `database.services.ts`.
  - The preload is `electron/preload/index.ts`
    (`contextBridge.exposeInMainWorld("electron", …)`). Push channels return
    an unsubscribe function, and channel names are hard-coded.
- **Database access:** the renderer uses the Drizzle `sqlite-proxy`
  (`src/global/database/db.ts`) over `sql:proxy` to a single `node:sqlite`
  connection in main. Query invalidation is renderer-local (`useHistory.ts`).
- **Renderer entry:** `src/main.tsx` renders `<App/>` unconditionally. The
  build is `vite.config.mts` (vite-plugin-electron), with no extra HTML
  inputs.
- **UI:**
  - Tokens are in `packages/ui/src/tailwind.css` (`bg-1`, `fg-1`, `stroke`,
    `accent`, `rounded-6`, DM Sans and DM Mono). Primitives are in
    `packages/ui/src/components/base`, and icons come from
    `@phosphor-icons/react`.
  - Toolbar pattern: `src/components/toolbar/ToolbarSection.tsx`. Floating
    overlay pattern: `src/components/canvas/CanvasZoomControls.tsx`.
  - Text goes through Tolgee (`<T keyName>`, `i18n/en.json`).
- **Existing 3D-ish code:** the CSS tilt (`stores/FullscreenStore.ts`,
  `timeline/PerspectiveSlider.tsx`). The `origin/3d-basic` branch holds an
  old R3F prototype; reuse its ideas, not its geometry.
- **Added in Phase 0:** `three` 0.186, `@react-three/fiber` 9.8,
  `@react-three/drei` 10.7, `@types/three`, and the shared contracts in
  `src/view3d/core/types.ts`.

## 2. Decisions

[ADR 0002](../adr/0002-3d-view.md) is the source. In short:

- **D-1** React Three Fiber scene. Framework-free builders in `src/view3d/core/`.
  Canvas-texture text, no drei `<Text>`.
- **D-2** Meters. Origin at center front. +X toward side 2, +Y up, +Z toward the
  audience. Conversions go in `@openmarch/core`'s `field/world.ts`.
- **D-3** One 3D View window, `?view=3d`, with its own read-only preload.
- **D-4** IPC: `view3d:open`, `clock`, `selection`, `invalidate`, `hello`,
  `venue-change-request` and `playback-request`. The editor is the only
  writer and the only owner of playback.
- **D-5** A `view3d_venue` single-row table with versioned JSON. No row means
  a default from the field template. Writes use history. The gym tarp is the
  field image.
- **D-6** Full-show timelines in the window, through `src/view3d/positions.ts`
  only.
- **D-7** Instanced cylinder performers (amended 2026-10-07: om-pose marchers).
- **D-8** Shared contracts land first.

## 3. Phases

```text
P0 decisions ─┬─ P1 foundations ──┬─ P3 window UI and cameras ─┐
              │                   │                            ├─ P5 MVP validation
              └─ P2 venue kits ───┘─ P4 performers, playback ──┘
```

- [Phase 0: Decisions and contracts](phases/00-decisions.md)
- [Phase 1: Foundations](phases/01-foundations.md): world math, venue storage,
  the window shell, the sync protocol.
- [Phase 2: Venue kits](phases/02-venues.md): the field surface, the shared
  environment, and five kits.
- [Phase 3: Window UI and cameras](phases/03-window-ui.md): scene assembly,
  camera rig, overlay.
- [Phase 4: Performers and playback](phases/04-performers.md): the positions
  adapter, performer blocks, e2e.
- [Phase 5: MVP validation](phases/05-validation.md): performance, the
  validation run, owner verdict.

**Suggested waves for parallel workers:**

1. P1.1, P1.2, P1.3, P2.2
2. P1.4, P2.1, P2.3, P2.4, P2.5
3. P3.1, P4.1
4. P3.2, P3.3, P4.2
5. P4.3, P5.1, then P5.2

## 4. Risks

- **Stale reads** from the window during an editor transaction. Accepted (ADR
  Consequences). Watch for flicker in V4.
- **GPU variance:** integrated GPUs and Linux software rendering. P5.1 sets a
  `low` quality tier (no shadows, half crowd). Headless capture uses SwiftShader
  or llvmpipe, which is slow but correct.
- **Bundle size:** load the 3D View root with a dynamic `import()` so the
  editor doesn't pay for three.js.
- **Field shapes:** kits are drawn for football-sized fields. Kits place
  stands relative to `FieldFootprint`, and P2.1 must handle non-football grids
  (no yard numbers, no end zones).
- **Timeline project overlap:** both projects touch the playback code. All 3D
  position reads go through `positions.ts`, and the editor-side clock publisher
  (P1.4) stays a thin hook.

## 5. Open questions

None blocking. New ones go here with an ID (`Q-1`, …) and a log entry in the
phase that raised them.

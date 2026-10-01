---
phase: 7
title: Parity with page workflows
status: in-progress
owner: timeline-worker
branch: none
pr: none
depends_on: [6]
updated: 2026-09-29
---

# Phase 7: Parity with page workflows

Follow the protocol in [../README.md](../README.md). Claim a work package before you start, and append to the progress log as you go.

## Goal

In timeline mode, every existing page workflow works. Pages survive as named time labels over beats but stop storing coordinates. "Marchers on page N" means `positionsAt(end beat of N)`. "Move a marcher on page N" means editing that marcher's slot destination in the transition ending at N (D-16).

## Read first

- Spec R-E1, §6.1 (U-1 to U-3), §11, Q-1, Q-2
- Phase 6 handoff notes (page semantics)
- `docs/conventions/database-transactions.md` (ripple procedures are multi-table writes)

## Work packages

Each field is on its own line so that concurrent claims merge cleanly. Edit only the Owner, Status and PR lines of packages you own.

### P7.1: Inventory page-coordinate code

- Owner: timeline-worker (no code branch)
- Status: done
- PR: none
- Parallel: no
- Depends on: —

Inventory every reader and writer of `marcher_pages`, `shape_pages` and the pathway and midset tables. Put the list as a checklist in this file's handoff notes. Later work packages come from it; add rows for anything missing below.

### P7.2: Selection, drag and alignment

- Owner: unassigned
- Status: open
- PR: none
- Parallel: yes
- Depends on: P7.1

Selection, drag and alignment tools write slot destinations.

### P7.3: Marcher add and delete

- Owner: unassigned
- Status: open
- PR: none
- Parallel: yes
- Depends on: P7.1

Marcher add and delete: the home position, plus a vacant or filled slot in each transition.

### P7.4: Page ripple procedures

- Owner: unassigned
- Status: open
- PR: none
- Parallel: yes
- Depends on: P7.1

Page insert, delete and resize as **ripple procedures** in app code, ordered so every intermediate state is valid (U-1 to U-3), with `test:history` for each. This settles Q-1 and Q-2 for pages.

### P7.5: Beat ripple procedures

- Owner: unassigned
- Status: open
- PR: none
- Parallel: yes
- Depends on: P7.4

Beat insert and delete ripple timeline rows (same rules as P7.4).

### P7.6: Copy and paste

- Owner: unassigned
- Status: open
- PR: none
- Parallel: yes
- Depends on: P7.1

Copy and paste of positions.

### P7.7: Coordinate sheets and PDF

- Owner: unassigned
- Status: open
- PR: none
- Parallel: yes
- Depends on: P7.1

Coordinate sheets and PDF export sample the resolver at page beats.

### P7.8: Video export and appearances

- Owner: unassigned
- Status: open
- PR: none
- Parallel: yes
- Depends on: P7.1

Video export and `exportAppearances` sample the resolver.

### P7.9: Keyframe export

- Owner: unassigned
- Status: open
- PR: none
- Parallel: yes
- Depends on: —

§11 keyframe export from the resolver (never read back as state).

### P7.10: Pathways, midpoints, step size and collisions in timeline mode

- Owner: unassigned
- Status: open
- PR: none
- Parallel: yes
- Depends on: P7.1

Path, midpoint and endpoint drawing, step-size warnings, the inspector's step size and collision detection still read page rows in timeline mode, so they can disagree with the drawn marchers. Derive them from the resolver at page end beats, or gate them off and say so. Decide what to do with the dormant pathway writers. See the P7.10 items in the handoff notes.

### P7.11: Shapes and shape pages in timeline mode

- Owner: unassigned
- Status: open
- PR: none
- Parallel: yes
- Depends on: P7.1

Shape create, edit, delete, copy to another page and the shape lock rules. Today they write shape pages, shape marcher rows and marcher pages. Map them to timeline shapes and the transition into the shape. Coordinate with P7.2, which owns the plain selection and drag writes.

### P7.12: Mobile and performer exports

- Owner: unassigned
- Status: open
- PR: none
- Parallel: yes
- Depends on: P7.1

The mobile app payload and the performer appearance export read every page row. Build them from the resolver at page end beats. If the payload moves to keyframes, reuse P7.9's generator, and log the format change as a decision for a person.

### P7.13: Undo, redo and query invalidation in timeline mode

- Owner: unassigned
- Status: open
- PR: none
- Parallel: yes
- Depends on: P7.1

After undo or redo the app jumps to a page and selects marchers based on page-row statements only, and several page-mode queries keep running in timeline mode. Make undo and redo navigate and select for timeline table changes, add the timeline query keys that the other packages introduce, and stop the page-mode fetches in timeline mode. Needs `test:history` cases.

### P7.14: Per-marcher-per-page appearance, rotation and notes

- Owner: project owner (decision)
- Status: done
- PR: none
- Parallel: no
- Depends on: P7.1

`marcher_pages` carries appearance overrides, rotation and notes with no timeline home, and the converter copies only x and y. First log a blocker asking a person to choose: drop them, keep them in the frozen page-era table, or add timeline fields (a schema and file format decision). Then P7.8 and P7.12 can finish their appearance work.

## Exit gate

Tick an item only after running its check, and paste the command and result into the log.

- [x] Every item in the P7.1 inventory is checked off (handoff notes, grouped by P7.2 to P7.14) (dropped: never implemented, owner decision 2026-09-30)
- [ ] Each feature's existing tests pass in timeline mode
- [ ] `test:history` passes for every ripple procedure
- [ ] Manual pass over editing, playback and export on a converted real show (human)

## Handoff notes

Kept current by the phase lead: where things stand, surprises, and what not to redo.

- This is the long pole. Split P7.1's inventory into more work packages if it's large.
- From the PR #14 review, the `marcher_pages` writers still reachable in timeline mode (only canvas drag is blocked), a head start for P7.1's inventory: keyboard nudges, snap/round, align, distribute and flip (`RegisteredActionsHandler.tsx` ~876 to 1213); the transform mutation in `useMarcherPages.ts` (~281); the alignment and line tools (`LineListeners.ts` ~262 → `setGlobalNewMarcherPages` → `AlignmentEditor.tsx`); the inspector x/y fields (`MarcherEditor.tsx`); `editablePath.tsx` and shape edits. Canvas drag (`DefaultListeners.ts` ~159, `updateMarcherPagesFunction`) reads `coordinate.page_id`, which is stale in timeline mode.

### P7.1 inventory of page-coordinate code

Written by P7.1 on 2026-09-30 against `timeline-try-2` at `e429b97c`. Paths are under `apps/desktop/` and line numbers are approximate. Tick an item when its owning package has either made it work in timeline mode or shown it needs no change. Legend: R reads page-era data, W writes it. "P5" means timeline mode already handles it. Re-run the searches in the P7.1 log entry before trusting this list after big merges.

Facts that change how to read the PR #14 note above:

- The inspector x/y fields are read-only: the inputs are `disabled` and `handleCoordsSubmit` (`src/components/inspector/MarcherEditor.tsx` ~464) does nothing. The inspector's writers are the distribute buttons (~171 to 246), which go through the same transform mutation as the keyboard actions.
- The `midsets` table has no reader or writer in app code (`src/hooks/queries/index.ts:5` has its hooks commented out). Only test mocks (`src/__mocks__/generators.ts`) mention it.
- The `pathways` table is written only by dormant code: `useEditablePath` (`src/components/canvas/hooks/editablePath.tsx`) installs create and update handlers, but nothing builds an editable path, because pathways are drawn as straight lines between page positions (`OpenMarchCanvas.ts` ~1422, "simple pathway method"). Writers reachable from the UI today: none. Readers are live (page-mode motion in `useCoordinateData.ts`).
- Collision detection does not run in either mode today: its trigger in `src/hooks/useAnimation.ts` ~140 to 146 is commented out ("TODO make collisions a query"), so the store stays empty.
- `marcher_pages` also holds per-marcher-per-page appearance columns, `rotation_degrees` and `notes`, which have no timeline home yet (see P7.14).
- There is no clipboard copy and paste of positions anywhere. P7.6 covers the nearest features (set marchers to previous or next page positions).
- Nothing in `packages/*`, the website or the CMS touches these tables.

#### P7.2 Selection, drag and alignment (writers of positions on the selected page)

- [ ] `src/components/canvas/listeners/DefaultListeners.ts` ~144 to 159 · W · canvas drag and rotate; reads the stale `coordinate.page_id` · P5 blocked it (`Canvas.tsx` ~238 to 244 snaps back) · re-enable by writing the slot destination of the transition ending at the selected page's end beat (D-16)
- [ ] `src/components/canvas/Canvas.tsx` ~238 to 244 · W gate · the drag callback is swapped for a refresh in timeline mode · replace with the timeline write path
- [ ] `src/global/classes/canvasObjects/OpenMarchCanvas.ts` ~125 (the drag callback type), ~1150 (`renderMarcherPositions` copies the last page render's `coordinate`, so `page_id` is stale) · W plumbing · P5 partial · give timeline-mode marchers a real page id, or drop `page_id` from the drag path
- [ ] `src/hooks/queries/useMarcherPages.ts` ~133 to 146 (`updateMarcherPagesMutationOptions`), ~222 to 312 (`useUpdateSelectedMarchers`, call at ~281, and the selected-page wrapper) · W · the one mutation behind nudges, align, distribute, flip, circle and the inspector · not handled · route to timeline slot edits; this is the main seam for the whole package
- [ ] `src/db-functions/marcherPage.ts` ~141 to 228 (`updateMarcherPagesInTransaction`, `updateMarcherPages`) · W `marcher_pages`, and W `pathways` through `updateEndPoint` (~170 to 196) · not handled · the timeline equivalent edits a destination, with no pathway fix-up
- [ ] `src/utilities/RegisteredActionsHandler.tsx` ~995 to 1070 (nudge up, down, left, right via `updateSelectedMarchersAsync` at ~1007, 1026, 1045, 1064) · W · not handled
- [ ] `src/utilities/RegisteredActionsHandler.tsx` ~1073 to 1097 (snap to nearest fraction, `updateMarcherPages` at ~1096) · W · not handled
- [ ] `src/utilities/RegisteredActionsHandler.tsx` ~1111 to 1141 (align and evenly distribute; `updateMarcherPages` at ~1115, 1122, 1131, 1140) · W · not handled
- [ ] `src/utilities/RegisteredActionsHandler.tsx` ~1143 to 1156 (flip horizontal and vertical; ~1147, 1154) · W · not handled
- [ ] `src/utilities/RegisteredActionsHandler.tsx` ~1271 to 1291 (create circle through `updateSelectedMarchers`) · W · not handled
- [ ] `src/utilities/RegisteredActionsHandler.tsx` ~541 to 554, ~604 to 620 (`getSelectedMarcherPages`) · R · selected-page coordinates feed the actions above · not handled · read from `positionsAt(end beat)`
- [ ] `src/utilities/RegisteredActionsHandler.tsx` ~1157 to 1170 with `src/db-functions/marcherPage.ts` ~230 to 365 (`swapMarchers`, `swapMarchersInTransaction`, `_swapSpms`) and `src/hooks/queries/useMarcherPages.ts` ~148 to 165 · W `marcher_pages` and `shape_page_marchers` · swap two marchers' positions on a page · not handled · in timeline terms, swap slot assignments or destinations
- [ ] `src/utilities/CoordinateActions.ts` (rounding ~58, vertical and horizontal align ~184 and ~217, distribute ~252, flip ~317) · pure helpers typed on `MarcherPage` and `ModifiedMarcherPageArgs` · not handled · loosen the input and output types so timeline code can reuse them
- [ ] `src/components/canvas/listeners/LineListeners.ts` ~150 to 262 (`setGlobalNewMarcherPages` at ~262) → `src/components/canvas/Canvas.tsx` ~360 → `src/stores/AlignmentEventStore.ts` ~12 to 67 → `src/components/inspector/AlignmentEditor.tsx` ~12 to 23 → the apply-quick-shape action at `RegisteredActionsHandler.tsx` ~1212 to 1223 · W (preview, then apply) · line and alignment tool · not handled · the apply step is the write
- [ ] `src/components/inspector/MarcherEditor.tsx` ~171 to 246 (horizontal and vertical distribute buttons) · W through the shared mutation · not handled
- [ ] `src/components/inspector/MarcherEditor.tsx` ~433 to 452 and `src/components/inspector/ShapeSelector.tsx` ~19 to 31 · R of the `isLocked` flag, which comes from shape membership · not handled · lock rules must come from timeline shapes
- [ ] `src/components/inspector/MarcherEditor.tsx` ~487 to 500 (the x/y display from `ReadableCoords.fromMarcherPage`) and `src/global/classes/ReadableCoords.ts` ~94 · R · not handled · display from the resolver
- [ ] `src/components/canvas/hooks/canvasListeners.selection.ts` ~29 to 30, ~263 · R · selection reads the page's marcher pages · not handled
- [ ] `src/components/canvas/Canvas.tsx` ~70 to 78, ~364 to 400, ~566 to 596 · R · page-mode static render, skipped once the resolver is ready · P5 (`drawFromResolver`, `useTimelineStaticRender`); the queries still run
- [ ] `src/hooks/useAnimation.ts` ~44 to 52, ~140 to 200 · R · page-mode playback from `useManyCoordinateData`; the timeline branch (~210 to 227) bypasses it · P5 · the page-mode queries still run in timeline mode (see P7.13)
- [ ] `src/timeline/timelineCanvas.ts` ~115 to 135 and `src/timeline/useTimelineStaticRender.ts` · R of the resolver at the page end beat · P5 done · keep as the model for "marchers on page N"

#### P7.3 Marcher add and delete (home position plus slot rows)

- [ ] `src/db-functions/marcher.ts` ~92 to 195 (`createMarchersInTransaction` inserts one `marcher_pages` row per marcher per page, starting at a free spot) · W · not handled for timeline rows (the P6 fixture loader calls it at `src/timeline/fixtures/loadTimelineFixture.ts` ~107) · add the home position and a vacant or filled slot in each transition
- [ ] `src/db-functions/marcher.ts` ~290 to 315 (`deleteMarchers`; cascades to `marcher_pages` and `shape_page_marchers`) · W · not handled · also remove timeline assignments and slot rows
- [ ] `src/db-functions/marcherHome.ts` ~7 to 30 (`updateMarcherHomesInTransaction`) · W of the marcher home · exists · confirm it is the right write for "move a marcher on page 0"
- [ ] `src/hooks/queries/useMarchers.ts` ~84 to 150 (create and delete mutations; invalidate `marcher_pages` keys at ~94, 125, 144, and coordinate data at ~101, 148) · invalidation · not handled · add timeline query keys
- [ ] `src/components/marcher/MarcherForm.tsx` ~178 and `src/components/marcher/MarcherList.tsx` ~74 · UI callers · not handled
- [ ] `src/components/launchpage/newShowCompletion.ts` ~249 to 262 (delete, then create marchers on import) · W · new-show import · not handled
- [ ] `src/components/launchpage/newShowCompletion.ts` ~276 to 318 (`applyPreviousDotsCoordinates` writes page 0 `marcher_pages`) · W · new show from previous dots · not handled · in timeline mode this is the home position
- [ ] `electron/main/services/previous-dots-import-service.ts` ~85 to 114 · R of the source file's last-page `marcher_pages` · import of a previous show · not handled · if the source is a converted show its page-era rows are frozen and stale; read home or the resolver instead
- [ ] `electron/database/repair.ts` ~235 to 241, ~303 (`removeOrphanMarcherPages`) · W cleanup · repair · likely no change until Phase 10, since the page-era tables stay; confirm it deletes nothing the converter relies on

#### P7.4 Page ripple procedures (insert, delete, resize pages)

- [ ] `src/db-functions/page.ts` ~196 to 250 (`_createMarcherPages` copies the previous page's rows to each new page), called at ~302 · W · page insert · not handled · pages stop owning coordinates; a new page means a new time label plus valid timeline rows
- [ ] `src/db-functions/page.ts` ~264 to 335 (`createPagesInTransaction`, `createPages`), ~694 to 1065 (`createLastPage`, `_fillAndGetBeatToStartOn`, `canCreateLastPage`, `createLastPageInTransaction`, `getNextBeatToStartPageOn`), ~1112 (`createTempoGroupAndPageFromWorkspaceSettings`) · W · page and last-page creation · not handled
- [ ] `src/db-functions/page.ts` ~299 to 302, ~522 to 600 (`deletePagesInTransaction`, deletes `marcher_pages` at ~545), ~629 (`deletePageYank`) · W · page delete and delete-with-shift · not handled · must not leave timeline rows outside valid ranges (U-1 to U-3)
- [ ] `src/db-functions/page.ts` ~340 to 425 (`updatePagesInTransaction`), ~178 (`updateLastPageCounts`), ~471 (`ensureSecondBeatHasPage`) · W · page resize and rename · not handled · resize is a ripple
- [ ] `src/hooks/queries/usePages.ts` ~56 to 62 (invalidates `marcher_pages` keys), ~176 to 260 (mutations) and `src/hooks/queries/sharedInvalidators.ts` ~15 to 37 (`invalidateByPage`) · invalidation · add timeline keys
- [ ] `src/components/timeline/PageTimeline.tsx` ~35 to 45; `src/components/timeline/PageTimeline.utils.ts` ~103; `src/components/inspector/PageEditor.tsx` ~16; `src/components/inspector/PageNotesSection.tsx` ~17 · UI callers of the page mutations · not handled (PageNotesSection edits notes only and likely needs no change)
- [ ] `src/db-functions/shapePages.ts` ~347 to 372 and the foreign key on `shape_pages.page_id` · W cascade · deleting a page deletes its shape pages · see P7.11

#### P7.5 Beat ripple procedures (insert, delete, change the timing of beats)

- [ ] `src/db-functions/beat.ts` ~178 (`shiftBeats`), ~259 (`flattenOrder`), ~345 (`createBeatsInTransaction`), ~440 (`updateBeatsInTransaction`), ~508 (`deleteBeatsInTransaction`) · W beats (they do not touch coordinates today) · not handled · timeline rows hold beat indexes, so each of these must ripple them
- [ ] `src/db-functions/measures.ts` ~152 to 270 (create, update, delete measures), ~284 (`createMeasuresAndBeatsInTransaction`), ~387 (`deleteMeasuresAndBeatsInTransaction`) · W beats and measures · music and measure tools · not handled
- [ ] `src/hooks/queries/useBeats.ts` ~69 to 150 and `src/hooks/queries/useMeasures.ts` ~59 to 215 · mutation wrappers and invalidation · add timeline keys
- [ ] `src/components/timeline/audio/BeatOrMeasureContextMenu.tsx` ~140, ~229, ~335 to 341, ~470 to 477 · UI callers: add, remove and change the timing of beats and measures · not handled

#### P7.6 Copy and paste of positions

- [ ] `src/utilities/RegisteredActionsHandler.tsx` ~857 to 986 (set all or selected marchers to the previous or next page's positions: four actions, `updateMarcherPages` at ~876, 913, 946, 981) · R neighbor page rows, W the current page · the only "copy position" features in the app · not handled · read `positionsAt` at the neighbor page end, write destinations
- [ ] `src/utilities/RegisteredActionsHandler.tsx` ~544 to 548 (previous and next page queries feeding those actions) · R · not handled
- [ ] No clipboard copy and paste exists. P7.6 decides whether to add one or to close with the two items above. Shape copy to another page belongs to P7.11.

#### P7.7 Coordinate sheets, drill charts and PDF

- [ ] `src/components/exporting/ExportCoordinatesModal.tsx` ~110 to 450 (coordinate sheet export; reads all marcher pages at ~122, builds rows at ~240 to 323, calls the PDF export at ~357) · R · not handled · sample the resolver at each page's end beat
- [ ] `src/components/exporting/MarcherCoordinateSheet.tsx` ~52 to 53, ~182 to 233, ~528, ~860 · R (per-marcher sheet preview and print) · not handled
- [ ] `src/components/exporting/CoordinateSheetTemplates.tsx` ~13 to 48, ~117 to 130, ~165 to 305 · R (templates take page rows) · not handled · change the row type to a plain position
- [ ] `electron/main/services/export-utility-process.ts` ~185 (reads `marcher_pages` straight from the file), ~20 to 131, ~250 · R · PDF layout in a separate process · not handled · the resolver lives in the renderer, so either pass sampled rows in or run the resolver in that process (decide in P7.7)
- [ ] `electron/main/index.ts` ~449 and `electron/preload/index.ts` ~238 to 261 (the PDF export and per-marcher document contracts) · IPC · changing the payload is an IPC contract change, so log it as a decision first
- [ ] `src/components/exporting/ExportCoordinatesModal.tsx` ~703 to 1000 (drill chart export; marcher pages at ~706, appearances at ~741, `generateDrillChartExportSVGs` at ~913) · R · not handled
- [ ] `src/components/exporting/utils/svg-generator.ts` ~80 to 430 (per-page SVGs read the current, previous and next page rows to draw positions and pathways) · R · not handled
- [ ] `src/utilities/SvgPreviewHandler.tsx` ~32 to 36, ~66, ~129 to 136 (launch page preview SVGs on close) · R · not handled
- [ ] `src/global/classes/MarcherPage.ts` ~41 to 90 and `src/global/classes/MarcherPageIndex.ts` · R helpers (lookup by marcher and page, nested maps) used by the exports above · not handled · replace or adapt with a position-by-page map built from the resolver
- [ ] `src/hooks/queries/useMarcherPages.ts` ~58 to 125 (`allMarcherPagesQueryOptions` and the by-page and by-marcher queries) and `src/db-functions/marcherPage.ts` ~411 to 470 · R · the page-era query layer all of the above use · stays until Phase 10; add a sibling query that samples the resolver

#### P7.8 Video export and appearances

- [ ] `src/components/exporting/ExportCoordinatesModal.tsx` ~1253 to 1950 (video export; `useManyCoordinateData` at ~1350, `coordinateDataQueryOptions` and `combineMarcherTimelines` at ~1521 to 1534, page rows for appearances at ~1262 to 1317) · R · not handled · sample the resolver per frame
- [ ] `src/components/exporting/video/videoRenderer.ts` ~19, ~46 and `src/components/exporting/video/videoFrameRenderer.ts` ~9 to 16, ~92, ~106 (take per-marcher page-mode timelines and call the keyframe interpolator) · R · not handled
- [x] `src/components/exporting/utils/exportAppearances.ts` ~31 to 70 (`buildMarcherAppearancesByPageId` reads each page's rows for per-marcher-page appearances) · R · not handled · depends on the P7.14 decision (dropped: never implemented, owner decision 2026-09-30)
- [x] `src/hooks/queries/useMarcherAppearances.ts` ~98 to 190 (`_combineMarcherAppearances` puts the page row's appearance first in the stack; the query fetches marcher pages by page) · R · canvas appearances as well as exports · not handled · depends on the P7.14 decision (dropped: never implemented, owner decision 2026-09-30)
- [ ] `src/components/singletons/StateInitializer.tsx` ~41 to 70 (prefetch of appearances and coordinate data for the selected, next and previous pages) · R · not handled · see P7.13
- [ ] `electron/main/services/video-export-service.ts` · no direct reads (it receives encoded chunks) · no change expected; confirm

#### P7.9 Keyframe export

- [ ] `src/utilities/Keyframes.ts` (`MarcherTimeline`, `getCoordinatesAtTime` ~32, `findSurroundingTimestamps` ~118) · R · the page-mode keyframe interpolator, used by `useAnimation.ts` ~174, `CollisionDetection.ts`, video export and `useCoordinateData.ts` · P5 bypasses it for playback · the spec §11 generator (keyframes from the resolver, chord error within tolerance) does not exist yet; build it here and let P7.8, P7.10 and P7.12 reuse it
- [ ] `src/hooks/queries/useCoordinateData.ts` ~15 to 31, ~41 to 152 (`getMarcherTimelines`, `coordinateDataQueryOptions`; reads marcher pages and pathways), ~154 to 212 (`combineMarcherTimelines`, `useManyCoordinateData`) · R · page-mode keyframes built from page rows and pathways · not handled · stays until Phase 10 and must never be fed back as state (D-2)

#### P7.10 (new) Pathways, midpoints, step size and collisions in timeline mode

- [ ] `src/global/classes/canvasObjects/OpenMarchCanvas.ts` ~1253 to 1303 (`renderPathVisual`), ~1307 to 1455 (`renderPathVisuals` reads the previous, current and next page rows), ~1457 to 1476 (hide), with `MarcherVisualGroup.ts`, `Pathway.ts`, `Midpoint.ts`, `Endpoint.ts` and `stepSizeWarning.ts` in `src/global/classes/` · R · P5 left these drawing from page data, so they can disagree with the drawn marchers
- [ ] `src/components/canvas/Canvas.tsx` ~70 to 78, ~258 to 295, ~402 to 450 and `src/components/canvas/hooks/canvasListeners.movement.ts` ~32 to 107 · R · path render effects fed by page queries · not handled
- [ ] `src/components/canvas/listeners/LineListeners.ts` ~75 to 262 · R and preview-only draw of temporary pathways from marchers to the line · not handled (the apply step is P7.2)
- [ ] `src/global/classes/StepSize.ts` ~143 to 240 and `src/components/inspector/MarcherEditor.tsx` ~502 to 562, ~658 to 715 · R · step sizes between the previous and current page rows · not handled · compute step size between page end beats from the resolver
- [ ] `src/global/classes/CollisionDetection.ts` ~26 to 70, ~149 to 153, ~215 to 300, `src/stores/CollisionStore.ts` ~11 to 45, `src/hooks/useAnimation.ts` ~38, ~140 to 164, `src/components/canvas/Canvas.tsx` ~604 to 640 (markers), `src/components/toolbar/Toolbar.tsx` ~19, `src/components/toolbar/tabs/CollisionsTab.tsx` ~13 · R · collisions from page-mode timelines and the page-row hash; currently not computed in either mode (see the facts above) · decide whether to revive on the resolver or leave dormant
- [ ] `src/hooks/queries/usePathways.ts` ~48 to 290 (reads at ~81 and ~90; creates and updates `pathways` and sets `marcher_pages.path_data_id` at ~147 to 154; deletes at ~200), `src/db-functions/pathways.ts` ~16 to 90 (`updateEndPoint`, `findPageIdsForPathway`), `src/components/canvas/hooks/editablePath.tsx` ~14 to 45, `src/global/classes/canvasObjects/EditablePath.ts` ~15 to 125 · W `pathways` and `marcher_pages` · dormant (no reachable UI) · decide: leave frozen until Phase 10, or gate off in timeline mode. C-8: curved paths are a spec decision for Phase 9, not here
- [ ] `midsets` table · no reader or writer · confirm there is no work and close (mocks only)

#### P7.11 (new) Shapes and shape pages in timeline mode

- [ ] `src/db-functions/shapePages.ts` ~159 to 245 (`createShapePages` writes `shape_pages`, `shape_page_marchers` and, through `_updateChildMarcherPages` at ~127 to 157, `marcher_pages`), ~247 to 322 (`updateShapePages`), ~325 to 372 (`deleteShapePages`) · W · not handled · map to timeline shapes plus the transition into the shape, with slot order from the shape's marcher order
- [ ] `src/db-functions/shapePages.ts` ~377 to 480 (`copyShapePageToPage`; reads `marcher_pages` at ~447) and `src/hooks/queries/useShapePages.ts` ~101 to 155 · R and W · copy a shape to another page · not handled
- [ ] `src/db-functions/shapePageMarchers.ts` (reads ~62 to 165; order shifts, swaps and flatten ~165 to 375; create with conflict handling ~385 to 480) · R and W `shape_page_marchers` · not handled
- [ ] `src/db-functions/shapes.ts` (`getShapes` ~74, create ~102 to 143, update ~145 to 192, delete ~194 to 235, `getShapesWithNoShapePages` ~237) · R and W `shapes` · not handled
- [ ] `src/global/classes/canvasObjects/MarcherShape.ts` ~35 to 100 (reads `shape_page_marchers`), ~250 to 275, ~285 to 335 (`_createMarcherShape` → `createShapePages`), ~336 to 380 (update args) and `StaticMarcherShape.ts` ~204 to 337 · R and W · canvas shape objects and edits (control point drag) · not handled
- [ ] `src/components/singletons/StateInitializer.tsx` ~37, ~104 (shape edit → `updateShapePagesMutationOptions`) · W · control point edits write shape pages and, through them, marcher pages · not handled
- [ ] `src/components/canvas/hooks/shapes.ts` ~19 to 40 and `src/components/canvas/hooks/canvasListeners.selection.ts` ~18 to 284 · R · shape rendering and selection by shape page · P5 left shapes drawn from page data
- [ ] `src/components/inspector/ShapeEditor.tsx` ~44 to 200, ~260 (copy to page, delete, edit) and `src/stores/SelectionStore.ts` · UI for shapes · not handled
- [ ] `src/utilities/RegisteredActionsHandler.tsx` ~1225 to 1244 (create a marcher shape from the alignment event) · W · not handled
- [ ] `src/hooks/queries/useShapePages.ts` ~29 to 100 (queries and keys) and `src/hooks/queries/utils.ts` ~41 (a `shape_page_marchers` change invalidates shape pages and marcher pages) · R and invalidation · not handled

#### P7.12 (new) Mobile and performer exports

- [ ] `src/components/mobile/utilities/dots-to-om.ts` ~165 to 205 (`buildCoordinates` converts every page row to steps), ~265 (reads all `marcher_pages`), ~372 · R · mobile app payload · not handled · build the same payload from the resolver at page end beats (or from the P7.9 keyframes if the mobile format changes; that format change is a decision)
- [x] `src/components/mobile/utilities/performer-appearance-export.ts` ~99 to 170, ~219 to 290 (appearance data per page, built from page rows) · R · not handled · depends on the P7.14 decision (dropped: never implemented, owner decision 2026-09-30)
- [ ] `src/components/mobile/utilities/upload-service.ts` ~2 · caller of the export · no change expected

#### P7.13 (new) Undo, redo and query invalidation in timeline mode

- [ ] `src/db-functions/history.ts` ~1160 to 1215 (after undo or redo, the page to jump to and the marchers to select come only from `marcher_pages` statements) · R · not handled · timeline table changes (already logged in `tablesWithHistory` at ~28 to 41) need the equivalent: select the affected marchers and jump to the affected page
- [ ] `src/hooks/queries/utils.ts` ~25 to 54 and `src/hooks/queries/useHistory.ts` ~50 to 80 (query keys per table; "greedily invalidate all coordinate data") · invalidation · timeline table names map to their own keys, but no page-parity query uses those keys yet; wire them in as the other packages add queries
- [ ] `src/hooks/queries/sharedInvalidators.ts` ~15 to 37 · invalidation after coordinate edits · add the timeline queries
- [ ] `src/hooks/useAnimation.ts` ~44 (`useManyCoordinateData` keeps fetching page rows in timeline mode) and `src/components/singletons/StateInitializer.tsx` ~41 to 70 (prefetches coordinate data) · R · wasted work and a stale-data risk in timeline mode · gate by mode
- [ ] Resolver rebuild on undo and redo of timeline tables (`notifyTimelineBatch` in `src/db-functions/history.ts`) · P4 and P5 · verify with a `test:history` case, not just by reading

#### P7.14 (new) Per-marcher-per-page appearance, rotation and notes (decision first)

- [ ] `electron/database/migrations/schema.ts` ~185 to 226 (`marcher_pages` columns: appearance columns, `rotation_degrees`, `notes`, path columns) · data with no timeline home · the converter copies only x and y · decision needed: drop, keep in the frozen page-era table, or add timeline fields. Record it as a blocker for a person before building anything
- [ ] `src/global/classes/MarcherPage.ts` ~1 to 40 and `src/hooks/queries/useMarcherAppearances.ts` ~98 to 190 · R · the per-page appearance override sits first in the appearance stack · see P7.8
- [ ] `src/components/mobile/utilities/dots-to-om.ts` ~184 to 200 (`rotation_degrees` exported per coordinate) · R · see P7.12

#### Checked: no timeline work needed

- [x] `src/__mocks__/generators.ts`, `src/__mocks__/globalMocks.ts`, `src/test/base.tsx`, `src/test/history.ts` · test support only
- [x] `src/global/Constants.ts` ~9 (a name prefix) and `src/components/field/customizer/ThemeTab.tsx` ~197 (a label) · names only
- [x] `src/settings/workspaceSettings.ts` ~24 · the timeline flag's doc comment
- [x] `src/components/timeline/PageTimeline.tsx` ~299, ~351 · only clears shape selection state

## Progress log

<!-- Append entries below, newest last, using the format in ../README.md. Never edit earlier entries. -->

### 2026-09-30 · timeline-worker (no code branch) · P7.1

- **Done:** inventory of page-coordinate code, written as a checklist in this file's handoff notes, grouped by owning package. It found 5 gaps that no existing package covered and adds P7.10 to P7.14: pathways, midpoints, step size and collisions; shapes; mobile and performer exports; undo and redo and query invalidation; per-marcher-per-page appearance, rotation and notes. Findings that correct earlier notes: the inspector x/y inputs are read-only (writers are the distribute buttons); no `midsets` reader or writer exists; pathway writers are dormant; collision detection is switched off in both modes; no position copy and paste exists, only set-to-previous or next page and shape copy.
- **Checks:** read-only searches, no code run. Searches (from `apps/desktop`, files only, then read by hand): `grep -rlE "marcher_pages|shape_pages|shape_page_marchers|pathways|midsets|schema\.shapes|marcherPages|MarcherPage|marcherPageKeys|ShapePage|shapePage|Midset|Pathway|midset|pathway" src electron ../../packages --include='*.ts' --include='*.tsx'` (74 non-test files); `grep -rlE "useCoordinateData|getMarcherTimelines|Keyframe|keyframe|videoExport|useMarcherPages|CoordinateActions|setGlobalNewMarcherPages|updateMarcherPages|ShapePageMarcher|getByMarcherAndPage" src electron` ; callers of the mutations: `grep -rnE "useUpdateSelectedMarchers|updateMarcherPagesMutationOptions|swapMarchersMutationOptions|updateMarcherPagesInTransaction|useCreatePathway|useUpdatePathway|copyShapePageToPage|createShapePages|updateShapePages|deleteShapePages" src`; beat, measure and page callers: `grep -rnE "(create|update|delete|shift|flatten)(Beats|Measures|MeasuresAndBeats|Pages|PageYank|LastPage)MutationOptions" src`; midset use: `grep -rnE "midsets|schema\.pathways" src electron`; copy and paste: `grep -rniE "clipboard|paste" src`; other packages: the same table-name search over `packages`, the website and the CMS found nothing. Test files, mocks and migrations were excluded.
- **Next:** the lead assigns P7.2 to P7.14. P7.14 starts with a blocker for a person. P7.4 and P7.5 are the riskiest (ripple procedures with `test:history`).
- **Blockers:** none for P7.1. P7.14 needs a person's decision on where per-page appearance, rotation and notes live.

### 2026-09-30 · lead session · P7.14 (decided)

- **Done:** the project owner decided that `marcher_pages`' per-page appearance overrides, `rotation_degrees` and `notes` are dropped in timeline mode: they were never implemented as features. The converter copies only x and y, and its loss report should list any non-empty values it finds so nothing disappears silently. 4 P7.14 checklist items ticked as dropped. P7.14 set to done; P7.8 and P7.12 no longer wait on it.
- **Checks:** none (decision only).
- **Next:** P7.2 onward after Phase 6 merges.
- **Blockers:** none.

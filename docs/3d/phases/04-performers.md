---
phase: 4
title: Performers and playback
status: done
owner: lead (3d-async)
branch: none
pr: none
depends_on: [1]
updated: 2026-10-04
---

# Phase 4: Performers and playback

Follow the protocol in [../README.md](../README.md). Claim a work package before you start, and append to the progress log as you go.

## Goal

Block performers that move with the editor's playback, and an end-to-end test of the whole loop.

## Read first

- [ADR 0002](../../adr/0002-3d-view.md) D-6 and D-7, [../design.md](../design.md) §8
- `src/utilities/Keyframes.ts`, `src/hooks/queries/useCoordinateData.ts`, `src/hooks/useAnimation.ts`
- `docs/conventions/multi-query-hooks.md`, `apps/desktop/e2e/` and its README if present

## Work packages

Each field is on its own line so that concurrent claims merge cleanly. Edit only the Owner, Status and PR lines of packages you own.

### P4.1: Positions adapter

- Owner: 3d-worker (3d/p4-positions)
- Status: done
- PR: https://github.com/AlexDumo/OpenMarch-timeline/pull/66
- Parallel: yes
- Depends on: P1.1, P1.4

`src/view3d/positions.ts`: full-show timelines in the window and `positionAt` in world meters (design §8). Tests compare `positionAt` with the 2D canvas's pixel positions for a fixture show at page ends and mid-transition, including a pathway.

### P4.2: Performer blocks

- Owner: 3d-worker (3d/p4-performers)
- Status: done
- PR: https://github.com/AlexDumo/OpenMarch-timeline/pull/68
- Parallel: yes
- Depends on: P4.1, P3.1

`src/view3d/window/performers/`: one instanced mesh, colors from `useMarchersWithVisuals`, selection rings, `useFrame` updates from the sync store's `showMs()`, and paused positions at the selected page.

### P4.3: End-to-end test

- Owner: 3d-worker (3d/p4-e2e)
- Status: done
- PR: https://github.com/AlexDumo/OpenMarch-timeline/pull/71
- Parallel: no
- Depends on: P4.2, P3.3

`e2e/tests/view3d.spec.mts`: open the window from the editor; play, pause and seek and assert the window's show time follows within 50 ms; change the venue from the window and assert it persists after reopening; assert no network requests from the window. Run only this spec.

## Exit gate

- [x] Positions tests pass.
- [x] Performers follow playback smoothly in a recording sent to the project owner.
- [x] `view3d.spec.mts` passes headlessly.
- [x] Type-check, lint, format and spellcheck pass on `3d-async`.

## Handoff notes

Nothing yet.

## Progress log

### 2026-10-04 · lead · P4.1 (review)

- **Done:** reviewed and squash-merged PR #66 (`862b744b`).
  - `usePerformerTimelines()` returns `{ timelines, isLoading, hasError }`. It stays empty until every page has loaded, and it uses the editor's query keys, so relayed invalidations refresh it.
  - `positionAt(timeline, ms, fieldProperties)` returns world meters. It clamps before the first page and after the last, and returns `null` only for an empty timeline.
  - Tests use the real `marchersAndPages` fixture, including a pathway, and compare against the editor's own 2D interpolation.
  - The worker's session refused `coord.sh`, so this entry records its owner, PR and status.
- **Checks:** on the PR branch, `vitest run src/view3d/__test__/positions.test.tsx` (6 passed) and desktop `tsc --noEmit` passed.
- **Next:** P4.2 gets field properties from `fieldPropertiesQueryOptions()`. It starts once P3.1 merges.
- **Blockers:** none.

### 2026-10-04 · 3d-worker (3d/p4-performers) · P4.2

- **Done:** first pass pushed to `3d/p4-performers` (`d714cec3`): `src/view3d/window/performers/performerData.ts` (pure slots, looks, matrices, rings), `Performers.tsx` (two instanced meshes, `useFrame` from `showMs()`), tests, and a one-line mount in `Scene.tsx`.
- **Checks:** `vitest run src/view3d/window/performers` (10 passed); desktop `tsc --noEmit` pass; `eslint src/view3d/window` clean.
- **Next:** build the app and capture playback, paused and selection frames against the 2D canvas.
- **Blockers:** none.
- **Resume from:** branch `3d/p4-performers`; build the desktop app and run a capture scenario based on `scratchpad/p31-capture/` with the 76-marcher fixture.

### 2026-10-04 · 3d-worker (3d/p4-performers) · P4.2

- **Done:** opened [#68](https://github.com/AlexDumo/OpenMarch-timeline/pull/68), one commit on `3d/p4-performers`.
  - `src/view3d/window/performers/performerData.ts` holds the pure parts: slots, appearance cascade, positions, matrices and the ring set.
  - `Performers.tsx` has one cylinder `InstancedMesh` and one accent-ring `InstancedMesh`, updated in `useFrame` from `showMs()`. A frame with an unchanged time and inputs does no work.
  - `Scene.tsx` mounts it in one line.
  - Colors come from `marcherAppearancesQueryOptions(selectedPageId)`, the same cascade the 2D canvas applies through `setAppearance`. In the window, `useMarchersWithVisuals` alone gives only the theme default; the PR explains this.
- **Checks:**
  - `vitest run src/view3d`: 14 files, 256 passed.
  - Desktop `tsc --noEmit`: pass.
  - `eslint src/view3d`: 0 errors.
  - Root `format:check`: pass.
  - cspell on the changed files: 0 issues.
  - Real-app capture (76-marcher fixture): an mp4 of playback in `hs`, top-down formation stills matching the 2D canvas on pages 2 and 4, and selection rings. The paths are in the PR.
  - Not run: `test:history`, e2e, root `lint:check`.
- **Next:** lead review. P4.3 can build on it.
- **Blockers:** none.
- **Resume from:** address review comments on #68 (branch `3d/p4-performers`).

### 2026-10-04 · lead · P4.2 (review)

- **Done:** reviewed and squash-merged PR #68.
  - The top-down stills of pages 2 and 4 match the 2D canvas, row for row against the hashes and numbers. In the recording, the window's clock was within 20 ms of the editor's, and selection rings follow drag-select and select-all during playback.
  - Accepted colors from `marcherAppearancesQueryOptions(selectedPageId)`, resolved like the 2D canvas, because `useMarchersWithVisuals` only returns theme defaults in the window. design.md §8 is updated.
  - For P5.1: `positionAt` allocates one small object per marcher per frame. Add an out-parameter variant if profiling shows it matters.
- **Checks:** on merged `3d-async`, desktop `tsc --noEmit` passed and `vitest run src/view3d` passed. The recording was sent to the project owner.
- **Next:** P4.3 (e2e) once P3.3 merges.
- **Blockers:** none.

### 2026-10-04 · lead · P4.3 (review)

- **Done:** squash-merged PR #71 (`e2e/tests/view3d.spec.mts`).
  - The spec covers seek and pause exactly, playing within 50 ms (the worst run was 13 ms), venue and lighting from the overlay with undo and redo, reopening the show, and no network requests.
  - It passes without WebGL (the sync and venue checks use DOM test ids). With SwiftShader it also checks `data-kit` and `data-lighting`.
  - The worker's session refused `coord.sh`, so this entry records its owner, PR and status.
  - **Finding outside 3D View:** the editor's on-screen `AudioClock` lags its real playback position by 100 ms or more under load. The spec compares against the clock messages instead. Worth a separate issue.
- **Checks:** I ran `~/om-capture/e2e e2e/tests/view3d.spec.mts` on the PR branch: 1 passed (18.1 s), recording in `~/om-capture/runs/20261004-125845-e2e/`. The worker ran it 3 of 3 without WebGL and 2 of 2 with SwiftShader.
- **Next:** P5.1, then the P5.2 validation run.
- **Blockers:** none.

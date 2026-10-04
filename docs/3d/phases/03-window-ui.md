---
phase: 3
title: Window scene, cameras and overlay
status: in-progress
owner: 3d-worker (3d/p3-scene)
branch: none
pr: none
depends_on: [1, 2]
updated: 2026-10-04
---

# Phase 3: Window scene, cameras and overlay

Follow the protocol in [../README.md](../README.md). Claim a work package before you start, and append to the progress log as you go.

## Goal

Turn the builders into the 3D View window: the scene from the show's venue settings, the camera rig, and the overlay UI in OpenMarch's style.

## Read first

- [../ui.md](../ui.md), all of it
- [../design.md](../design.md) §1, §6–7 and §9
- The reference demo's overlay and camera code

## Work packages

Each field is on its own line so that concurrent claims merge cleanly. Edit only the Owner, Status and PR lines of packages you own.

### P3.1: Scene assembly

- Owner: 3d-worker (3d/p3-scene)
- Status: done
- PR: https://github.com/AlexDumo/OpenMarch-timeline/pull/67
- Parallel: yes
- Depends on: P1.3, P1.4, P2.1, P2.2

`src/view3d/core/kits/index.ts` (the registry; kits not merged yet map to `blank`) and `src/view3d/window/Scene.tsx`: build the field surface, kit and environment from `useVenueSettings` and field properties; rebuild and dispose on change; apply lighting and crowd; call `onFrame`; renderer settings (ACES tone mapping, sRGB, shadows by quality). Replace P1.3's placeholder.

### P3.2: Camera rig

- Owner: 3d-worker (3d/p3-camera)
- Status: in-progress
- PR: none
- Parallel: yes
- Depends on: P3.1

`src/view3d/window/camera/`: named seats from the kit, fly-to, orbit, pan and zoom with limits, top-down orientation, pick-a-seat raycasting against `pickTargets` and snapping to seat rows, crowd clearing on arrival, keyboard shortcuts, and the eye-height readout data (ui.md UI-3).

### P3.3: Overlay UI

- Owner: 3d-worker (3d/p3-overlay)
- Status: in-review
- PR: https://github.com/AlexDumo/OpenMarch-timeline/pull/69
- Parallel: yes
- Depends on: P3.1

`src/view3d/window/overlay/`: venue picker, lighting, crowd, fullscreen with auto-hide, the camera bar and the readout, built from `packages/ui` primitives and Phosphor icons, with Tolgee strings (ui.md UI-2, UI-5, UI-6). Venue, lighting and crowd changes go through `requestVenueChange`. Coordinate with P3.2 through its exported hooks; don't reimplement camera logic.

## Exit gate

- [ ] Every kit loads in the window from the show's settings, and changing the venue from the overlay persists after reopening the show.
- [ ] Every named camera works; pick-a-seat works in every kit with stands.
- [ ] Light and dark themes both look right (screenshots).
- [ ] Type-check, lint, format and spellcheck pass on `3d-async`.

## Handoff notes

Nothing yet.

## Progress log

### 2026-10-04 · 3d-worker (3d/p3-scene) · P3.1

- **Done:** first pass pushed to `3d/p3-scene` (`70aa6292`): `src/view3d/core/kits/index.ts` (registry and field style per kit), `src/view3d/window/Scene.tsx`, `sceneStore.ts` (kit, crowd, focus, lighting, quality for P3.2 and P3.3) and `useFieldImage.ts`; `View3dRoot` renders `Scene` instead of the placeholder.
- **Checks:** desktop `tsc --noEmit` pass; `vitest run src/view3d` 240 passed.
- **Next:** real-app screenshots of every kit and a lighting change, then the PR.
- **Blockers:** none.
- **Resume from:** branch `3d/p3-scene`; build the app and run a capture scenario based on the P1.4 worker's `scratchpad/p14-capture/p14-sync.mjs`.

### 2026-10-04 · 3d-worker (3d/p3-scene) · P3.1

- **Done:** opened [#67](https://github.com/AlexDumo/OpenMarch-timeline/pull/67), one commit on `3d/p3-scene`. It adds:
  - `src/view3d/core/kits/index.ts`: `KIT_BUILDERS`, `KIT_FIELD_STYLE` and `DEFAULT_CROWD_DENSITY`;
  - `src/view3d/window/Scene.tsx`: builds the field, kit, environment and one crowd, each memoized on its own inputs. Lighting changes don't rebuild anything. `onFrame` gets a snap `dt` on a new kit and, under reduced motion, after each lighting change. The camera starts at `cameras[0]`, then the crowd clears within 4.9 m;
  - `sceneStore.ts`: `useView3dSceneStore` with kit, crowd, focus, lighting and quality, for P3.2 and P3.3;
  - `useFieldImage.ts`;
  - `View3dRoot` renders `Scene`; the debug readout stays.
- **Checks:**
  - Desktop `tsc --noEmit`: pass.
  - `vitest run src/view3d`: 246 passed.
  - `eslint src/view3d`: 0 errors.
  - Prettier and root `format:check`: pass.
  - cspell: 0 issues.
  - Real-app screenshots (headless, SwiftShader) of every kit, lighting changes, crowd off and undo: the run folder linked in the PR body.
  - Not run: `test:history`, e2e, root `lint:check`.
- **Next:** lead review. P3.2 and P3.3 build on `useView3dSceneStore`.
- **Blockers:** none.
- **Resume from:** address review comments on #67 (branch `3d/p3-scene`).

### 2026-10-04 · lead · P3.1 (review)

- **Done:** reviewed and squash-merged PR #67 (`ba2f882f`). Checked the real-window screenshots of every kit and lighting preset, crowd off, and undo; they look right.
  - Accepted: a new kit's first lighting snaps (no roof slide on load); `PCFShadowMap`, because three 0.186 removed `PCFSoftShadowMap`.
  - Lead fix (`d682b0c1`): the blank kit opens on `blimp`, and its `frontRow` stands on a 6 m riser. Its ground-level default looked like a flat strip.
- **Checks:** on merged `3d-async`, `vitest run src/view3d` (13 files, 246 passed) and desktop `tsc --noEmit` passed.
- **Next:** P3.2, P3.3 and P4.2 in parallel. The camera contract between P3.2 and P3.3 is fixed below. Press-box views in bighs, college and pro have nearby crowd filling the bottom third of the frame; P3.2 handles it by aiming slightly higher, not by clearing more seats.
- **Camera contract (lead):** P3.2 owns `src/view3d/window/camera/cameraStore.ts`, exporting `useCameraStore` (Zustand) with:
  - `activeCameraId: string | null` (null after manual orbit);
  - `selectCamera(id)`;
  - `pickMode: boolean` and `setPickMode(on)`;
  - `readout: { eyeHeightM: number; distanceToFocusM: number }`, updated at most 10 times a second.

  P3.3 imports only these.

- **Blockers:** none.

### 2026-10-04 · 3d-worker (3d/p3-camera) · P3.2

- **Done:** first pass pushed to `3d/p3-camera` (`c2c89af6`): `src/view3d/window/camera/` with `cameraStore.ts` (the lead's contract), `rigMath.ts`, `rigController.ts`, `seatSnap.ts` and `CameraRig.tsx`; `Scene.tsx` mounts the rig and no longer places the camera itself.
- **Checks:** desktop `tsc --noEmit` pass; `vitest run src/view3d/window` 36 passed.
- **Next:** real-app capture (fly-tos, orbit, pick-a-seat, press-box framing), then the PR.
- **Blockers:** none.
- **Resume from:** branch `3d/p3-camera`; build the app and run a capture scenario based on `scratchpad/p31-capture/`.

### 2026-10-04 · 3d-worker (3d/p3-overlay) · P3.3

- **Done:** first pass pushed to `3d/p3-overlay`: `src/view3d/window/overlay/` (venue picker, lighting, crowd, fullscreen with auto-hide, camera bar, readout), mounted in `View3dRoot` in place of the debug readout; `view3d.*` strings in `en.json`. P3.2 hasn't merged, so `src/view3d/window/camera/cameraStore.ts` is a minimal store with exactly the lead's camera contract (no camera logic), for the lead to reconcile.
- **Checks:** desktop `tsc --noEmit` pass; `vitest run src/view3d` 263 passed.
- **Next:** real-app screenshots (themes, widths, kits, fullscreen auto-hide, venue and lighting change, undo), then the PR.
- **Blockers:** none.
- **Resume from:** branch `3d/p3-overlay`; build the app and run a capture scenario based on `scratchpad/p31-capture/p31-scene.mjs`.

### 2026-10-04 · 3d-worker (3d/p3-overlay) · P3.3

- **Done:** opened [#69](https://github.com/AlexDumo/OpenMarch-timeline/pull/69) (`3d/p3-overlay`, rebased on `3d-async` with P4.2): `src/view3d/window/overlay/` (venue picker, Select when narrow, lighting, crowd, fullscreen with 3 s auto-hide, camera bar with Pick a seat, readout of page, count, show time, eye height and distance in ft or m), mounted in `View3dRoot` in place of the debug readout (test ids kept); `view3d.*` strings in `en.json`. `camera/cameraStore.ts` is a contract-only placeholder; take P3.2's file when merging.
- **Checks:**
  - Desktop `tsc --noEmit`: pass.
  - `vitest run src/view3d`: 273 passed.
  - `eslint src/view3d/window`: 0 problems.
  - Root `format:check`: pass.
  - cspell on the changed files: 0 issues.
  - Real-app capture: run folder linked in the PR. Every kit, both themes, wide and narrow, a venue and a lighting click, two Ctrl+Z presses in the editor reverting them, crowd by button and C, fullscreen auto-hide and Esc.
  - Not run: `test:history`, e2e, root `lint:check`.
- **Next:** lead review; reconcile `cameraStore.ts` with P3.2.
- **Blockers:** none.
- **Resume from:** address review comments on #69 (branch `3d/p3-overlay`).

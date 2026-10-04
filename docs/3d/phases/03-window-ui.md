---
phase: 3
title: Window scene, cameras and overlay
status: not-started
owner: none
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

- Owner: none
- Status: open
- PR: none
- Parallel: yes
- Depends on: P1.3, P1.4, P2.1, P2.2

`src/view3d/core/kits/index.ts` (the registry; kits not merged yet map to `blank`) and `src/view3d/window/Scene.tsx`: build the field surface, kit and environment from `useVenueSettings` and field properties; rebuild and dispose on change; apply lighting and crowd; call `onFrame`; renderer settings (ACES tone mapping, sRGB, shadows by quality). Replace P1.3's placeholder.

### P3.2: Camera rig

- Owner: none
- Status: open
- PR: none
- Parallel: yes
- Depends on: P3.1

`src/view3d/window/camera/`: named seats from the kit, fly-to, orbit, pan and zoom with limits, top-down orientation, pick-a-seat raycasting against `pickTargets` and snapping to seat rows, crowd clearing on arrival, keyboard shortcuts, and the eye-height readout data (ui.md UI-3).

### P3.3: Overlay UI

- Owner: none
- Status: open
- PR: none
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

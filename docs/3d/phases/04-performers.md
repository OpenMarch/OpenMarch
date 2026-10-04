---
phase: 4
title: Performers and playback
status: not-started
owner: none
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

- Owner: none
- Status: open
- PR: none
- Parallel: yes
- Depends on: P1.1, P1.4

`src/view3d/positions.ts`: full-show timelines in the window and `positionAt` in world meters (design §8). Tests compare `positionAt` with the 2D canvas's pixel positions for a fixture show at page ends and mid-transition, including a pathway.

### P4.2: Performer blocks

- Owner: none
- Status: open
- PR: none
- Parallel: yes
- Depends on: P4.1, P3.1

`src/view3d/window/performers/`: one instanced mesh, colors from `useMarchersWithVisuals`, selection rings, `useFrame` updates from the sync store's `showMs()`, and paused positions at the selected page.

### P4.3: End-to-end test

- Owner: none
- Status: open
- PR: none
- Parallel: no
- Depends on: P4.2, P3.3

`e2e/tests/view3d.spec.mts`: open the window from the editor; play, pause and seek and assert the window's show time follows within 50 ms; change the venue from the window and assert it persists after reopening; assert no network requests from the window. Run only this spec.

## Exit gate

- [ ] Positions tests pass.
- [ ] Performers follow playback smoothly in a recording sent to the project owner.
- [ ] `view3d.spec.mts` passes headlessly.
- [ ] Type-check, lint, format and spellcheck pass on `3d-async`.

## Handoff notes

Nothing yet.

## Progress log

---
phase: 8
title: Timeline authoring MVP
status: not-started
owner: unassigned
branch: none
pr: none
depends_on: [7]
updated: 2026-09-29
---

# Phase 8: Timeline authoring MVP

Follow the protocol in [../README.md](../README.md). Claim a work package before you start, and append to the progress log as you go.

## Goal

The new capabilities: tracks, spec shapes, transitions (arc and follow-the-leader), assignments with layers and steals, and an inspector that shows diagnostics. The timeline's design is [../ui.md](../ui.md), which adopts the timeline components on the `0.2` branch (commit `568056aa`).

## Read first

- [../ui.md](../ui.md) (the UI design and its mapping onto the spec)
- Spec §3, §8.9 (diagnostics MUST be shown), §12.8, Q-3, Q-4, Q-8, Q-13, Q-14
- `origin/0.2:apps/desktop/src/components/timeline/` (the reference components and stories)
- `apps/desktop/src/components/timeline/TimelineContainer.tsx`, `apps/desktop/src/components/inspector/`
- `packages/ui/src/components/base` (primitives), `@phosphor-icons/react` (icons)

## Work packages

Each field is on its own line so that concurrent claims merge cleanly. Edit only the Owner, Status and PR lines of packages you own.

### P8.0: Confirm ui.md

- Owner: human
- Status: open
- PR: none
- Parallel: no
- Depends on: —

Confirm `docs/timeline/ui.md` (set its status to accepted), and answer U-Q1 to U-Q4 or defer them explicitly. Design for the inspector section too.

### P8.1: Port the 0.2 timeline

- Owner: unassigned
- Status: open
- PR: none
- Parallel: yes
- Depends on: P8.0, P5.9

Bring the timeline components and stories from `origin/0.2` (`568056aa`, `apps/desktop/src/components/timeline/`) onto `timeline-try-2`, and render them in `TimelineContainer` behind the dev flag. Replace the page-boundary validation with page snapping (ui.md UI-2). Keep the stories and their tests passing.

### P8.8: View-model adapter

- Owner: unassigned
- Status: open
- PR: none
- Parallel: yes
- Depends on: P8.1

A pure adapter from the stored tables and the resolver to `TimelineViewModel`, following ui.md's mapping table: marcher and shape tracks, legs from resolver spans, activity spans from UI-1, and diagnostic badges. Unit tests on the golden-vector fixtures (G2, G3, G12 exercise steals).

### P8.9: Timeline commands

- Owner: unassigned
- Status: open
- PR: none
- Parallel: yes
- Depends on: P8.8

Wire the UI's commands to the write path: moving a clip moves its whole timeline (a shift procedure ordered so undo stays valid, U-1 to U-3), and Create Track creates a timeline, transition and assignments in one edit (ui.md). `test:history` for each procedure.

### P8.2: Shapes

- Owner: unassigned
- Status: open
- PR: none
- Parallel: yes
- Depends on: P8.0

Shapes: draw and edit `line`, `freehand`, `circle`, `box` and `block` in absolute field coordinates.

### P8.3: Transitions

- Owner: unassigned
- Status: open
- PR: none
- Parallel: yes
- Depends on: P8.0

Transitions: destination, style, bulge clamped to ±½, waypoints, `slot_count`, `order_mode`.

### P8.4: Assignments and layers

- Owner: unassigned
- Status: open
- PR: none
- Parallel: yes
- Depends on: P8.3

Assignments: casting (nearest-slot auto-assign via `computeOptimalCoordinateMapping` in core), steals as layers, and visible vacancies.

### P8.5: Inspector

- Owner: unassigned
- Status: open
- PR: none
- Parallel: yes
- Depends on: P8.0

Inspector: `explain()` for the selected marcher, diagnostics, and the FTL trail overlay, member order and order source.

### P8.6: Error messages

- Owner: unassigned
- Status: open
- PR: none
- Parallel: yes
- Depends on: —

Map every `E-*` abort to a user-facing message. Rejected edits leave nothing behind.

### P8.7: Scenario runs and verdicts

- Owner: human
- Status: open
- PR: none
- Parallel: no
- Depends on: P8.1–P8.5, P8.8, P8.9

QA-SC-01 to -15 runnable from the UI. Verdicts for SC-07, SC-14 and SC-15 recorded in `findings.md`.

## Exit gate

Tick an item only after running its check, and paste the command and result into the log.

- [ ] QA-SC-01 to -15 run from the UI
- [ ] SC-07, SC-14 and SC-15 verdicts recorded in `findings.md` by a person
- [ ] UI changes follow the desktop verification in `docs/conventions/verification.md`

## Handoff notes

Kept current by the phase lead: where things stand, surprises, and what not to redo.

- None yet.

## Progress log

<!-- Append entries below, newest last, using the format in ../README.md. Never edit earlier entries. -->

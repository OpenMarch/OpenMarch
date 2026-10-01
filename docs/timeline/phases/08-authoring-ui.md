---
phase: 8
title: Timeline authoring MVP
status: in-progress
owner: timeline-worker (timeline/p8-timeline-ui)
branch: timeline/p8-timeline-ui
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
- Status: done
- PR: none
- Parallel: no
- Depends on: —

Confirm `docs/timeline/ui.md` (set its status to accepted), and answer U-Q1 to U-Q4 or defer them explicitly. Design for the inspector section too.

### P8.1: Port the 0.2 timeline

- Owner: timeline-worker (timeline/p8-timeline-ui)
- Status: in-progress
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
- Porting the 0.2 timeline (P8.1): 0.2's `TimelineContainer` computes the beat with its own `getBeatIndexAtTime(beats, timeMs)`, in milliseconds, returning 0 with no beats. Replace it with `beatIndexAtTime(beats, timeMs / 1000)` from `src/timeline/timeMap.ts`, so there is one tempo map, and don't pass its -1 (no beats) to `setCurrentBeatIndex`. Don't bring back 0.2's `getBeatIndexAtTime` or `getNearestBeatIndex`.

## Progress log

<!-- Append entries below, newest last, using the format in ../README.md. Never edit earlier entries. -->

### 2026-09-30 · lead session · P8.0 (decided)

- **Done:** the project owner accepted `docs/timeline/ui.md` as written (UI-1: dashed spans mean stolen; UI-2: any beat, snap to pages as an aid). U-Q1 to U-Q4 are deferred to the packages that meet them (P8.1, P8.8, P8.9), decided from the spec where possible and recorded in `ui.md`. P8.0 set to done; P8.1 is unblocked (P5.9 is merged).
- **Checks:** none (decision only).
- **Next:** P8.1 (port the 0.2 timeline).
- **Blockers:** none.

### 2026-09-30 · timeline-worker (timeline/p8-timeline-ui) · P8.1

- **Done:** claimed P8.1. Branch `timeline/p8-timeline-ui` from `timeline-try-2`; wip commit 07cc58e8 copies the 0.2 timeline components, stories, fixtures and tests verbatim from `568056aa` (and adds `playhead` to cspell). Storybook isn't configured in this repo (no `.storybook`, no storybook packages).
- **Checks:** none yet (the verbatim copy doesn't typecheck: it imports the frame clock and storybook).
- **Next:** decouple `Timeline.tsx` from the frame clock (playback passed in as props, fed from the existing `IsPlayingContext` and `getLivePlaybackPosition` path), page snapping with an Alt override, drop the page-boundary validator rule, render behind `useTimelineMode()` in `TimelineContainer`.
- **Blockers:** none.
- **Resume from:** check out `timeline/p8-timeline-ui`; `pnpm install`; adapt `apps/desktop/src/components/timeline/Timeline*.ts(x)`; then `pnpm --dir apps/desktop exec tsc --noEmit`.

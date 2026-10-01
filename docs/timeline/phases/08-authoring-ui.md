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
- Status: in-review
- PR: https://github.com/AlexDumo/OpenMarch-timeline/pull/19
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
- After P8.1 (PR #19), the timeline is in `apps/desktop/src/components/timeline/`:
  - **Clock:** `Timeline` takes a `playback` prop and doesn't read the frame clock. `useTimelinePlayback` feeds it from the existing clock (`IsPlayingContext`, the selected page and `getLivePlaybackPosition`). While playing, the cursor is `beatIndexAtTime`; while paused, it's `pageEndBeat(selectedPage)`, and `pageLabel` names the selected page in the transport and playhead labels. Seeking to a beat line selects the page whose move contains or ends at that line (`pageForSeek`), so seeking to the paused cursor keeps the selection. A ruler page click selects that page directly (`TimelineModePanel`). Wiring the frame clock later means changing only that hook.
  - **Data (P8.8):** `TimelineModePanel` passes real beats, pages and measures and `NO_TIMELINES`. Replace that with the adapter's `TimelineInput[]` (`TODO(P8.8)`). View beat indexes are real beat indexes (spec beat positions), so the fixed beat 0 is a one-beat-wide empty column before page 1. Compress that column in the adapter (`TODO(P8.8)` in `createTimelineViewModel`).
  - **Commands (P8.9):** `commitTimelineRange` and `createTrack` are no-ops, and `selectedTarget` is null, so Create Track is hidden (`TODO(P8.9)`).
  - **Snapping:** `getPageSnapBeats`, `snapBoundary`, `snapRangeOffset` and `isPageSnapDisabled` in `TimelineGeometry.ts`. The snap distance is 24 px, and Alt turns snapping off.
  - **Gating:** `TimelineContainer` shows the timeline instead of the page timeline when the flag is on, except while beats are being edited. The audio player stays mounted and hidden.
  - **Still to do:** the waveform is empty until it's wired to the audio player.
  - **Still to do (follow-up):** with the flag on, the page timeline's pencil button (`focusTimeline`, which opens beat editing) isn't rendered. Beat editing is reachable only by its shortcut or menu. Add an entry point to the timeline's transport.
  - **Stories:** Storybook isn't configured; the stories run under Vitest (`TimelineStories.test.tsx`).

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

### 2026-09-30 · timeline-worker (timeline/p8-timeline-ui) · P8.1

- **Done:** code and tests on `timeline/p8-timeline-ui` (91067a37): playback passed into `Timeline` as props and fed by `useTimelinePlayback` from the existing clock; page snapping (24 px, Alt turns it off) for clip moves and selection flags; page-boundary validator rule removed; `TimelineContainer` renders the new timeline instead of the page timeline when `useTimelineMode()` is on (not while editing beats), with the audio player kept mounted and hidden. Stories compile without Storybook and run under Vitest.
- **Checks:** `tsc --noEmit`: pass. `test:focused src/components/timeline/__test__/`: 129 passed. eslint on `src/components/timeline`: 0 errors. The regular desktop suite is running.
- **Next:** read the suite result, rebase on `timeline-try-2`, open the PR.
- **Blockers:** none.
- **Resume from:** check out `timeline/p8-timeline-ui`; run `pnpm --dir apps/desktop run test` in the background; then rebase on `timeline/timeline-try-2` and open the PR with `gh pr create --repo AlexDumo/OpenMarch-timeline --base timeline-try-2`.

### 2026-09-30 · timeline-worker (timeline/p8-timeline-ui) · P8.1

- **Done:** PR https://github.com/AlexDumo/OpenMarch-timeline/pull/19 (one commit, 41d22557, rebased on `timeline-try-2` at 3ea5a9b4).
  - The 0.2 timeline (`568056aa`) is ported. `TimelineContainer` renders it instead of the page timeline when `useTimelineMode()` is on; page mode is unchanged.
  - **Clock decision:** the existing clock, through `useTimelinePlayback` (`beatIndexAtTime`, never -1). The frame clock stays unwired.
  - **UI-2:** page snapping within 24 px with an Alt override, and the page-boundary validator rule removed.
  - **Data:** empty tracks until P8.8; clip-move and Create Track are no-ops until P8.9.
  - **Stories:** Storybook isn't configured, so the stories typecheck without it and run under Vitest.
  - The handoff notes have the details.
- **Checks:**
  - `pnpm install` and `turbo run build --filter=@openmarch/desktop^...`: pass.
  - `tsc --noEmit`: pass.
  - `test:focused src/components/timeline/__test__/`: 129 passed (11 files; 2 were already skipped).
  - `pnpm --dir apps/desktop run test`: 105 files, 1,608 tests passed (run before the rebase, which touched no files in this PR).
  - eslint: 0 errors. prettier and cspell: pass.
  - Full `test:history`, e2e and `build:electron`: not run (policy). No history tests apply.
- **Exit gate:** nothing ticked. The UI verification item needs a manual app check by a person.
- **Next:** review and merge by the lead; then P8.8.
- **Blockers:** none.

### 2026-09-30 · timeline-worker (timeline/p8-timeline-ui) · P8.1 (review fixes)

- **Done:** commit 5a8b1b99 on PR #19 addresses the lead's review nits:
  1. Seeking uses `pageForSeek` (the page whose move contains or ends at the line), so seeking to the paused cursor keeps the selection. A ruler page click now selects that page directly; otherwise its seek to the page's first beat would select the page before it.
  2. While paused, `TimelinePlayback.pageLabel` names the selected page in the transport and playhead labels.
  3. A clip move recomputes its offset on release with that event's Alt state.
  4. `TODO(P8.8)` added for the beat-0 column; handoff notes updated, including the missing `focusTimeline` entry point (follow-up).
- **Tests added:**
  - `pageForSeek`.
  - The hook: seeking to `pageEndBeat(selected)` keeps the selection, a mid-page seek, and the paused label.
  - The variants: the release modifier and the label override.
  - Geometry: the label override.
  - The container: a ruler page click selects that page. A mutation that removes the panel fix makes this test fail.
- **Checks:**
  - `tsc --noEmit`: pass.
  - `test:focused src/components/timeline/__test__/`: 136 passed (11 files; 2 were already skipped).
  - eslint: 0 errors (13 warnings in untouched files).
  - prettier `--check` and cspell: pass.
  - Regular desktop suite, full `test:history`, e2e and `build:electron`: not re-run.
- **Next:** re-review and merge by the lead.
- **Blockers:** none.

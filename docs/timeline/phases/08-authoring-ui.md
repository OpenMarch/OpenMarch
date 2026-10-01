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
- Status: done
- PR: https://github.com/AlexDumo/OpenMarch-timeline/pull/19
- Parallel: yes
- Depends on: P8.0, P5.9

Bring the timeline components and stories from `origin/0.2` (`568056aa`, `apps/desktop/src/components/timeline/`) onto `timeline-try-2`, and render them in `TimelineContainer` behind the dev flag. Replace the page-boundary validation with page snapping (ui.md UI-2). Keep the stories and their tests passing.

### P8.8: View-model adapter

- Owner: timeline-worker (timeline/p8-adapter)
- Status: done
- PR: https://github.com/AlexDumo/OpenMarch-timeline/pull/21
- Parallel: yes
- Depends on: P8.1

A pure adapter from the stored tables and the resolver to `TimelineViewModel`, following ui.md's mapping table: marcher and shape tracks, legs from resolver spans, activity spans from UI-1, and diagnostic badges. Unit tests on the golden-vector fixtures (G2, G3, G12 exercise steals).

### P8.9: Timeline commands

- Owner: timeline-worker (timeline/p8-commands)
- Status: done
- PR: https://github.com/AlexDumo/OpenMarch-timeline/pull/24
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

- Owner: timeline-worker (timeline/p8-transitions)
- Status: in-progress
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

- Owner: timeline-worker (timeline/p8-inspector)
- Status: done
- PR: https://github.com/AlexDumo/OpenMarch-timeline/pull/25
- Parallel: yes
- Depends on: P8.0

Inspector: `explain()` for the selected marcher, diagnostics, and the FTL trail overlay, member order and order source.

### P8.6: Error messages

- Owner: timeline-worker (timeline/p8-inspector)
- Status: done
- PR: https://github.com/AlexDumo/OpenMarch-timeline/pull/25
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
  - **Follow-up (from P8.8):** a converted page show has only shapeless group moves, so with nothing selected the timeline shows no tracks (UI-3). Add an empty-state hint ("select marchers to see their tracks").
- Inspector and messages (P8.5, P8.6): the inspector's timeline section is `TimelineInspectorSection` in `apps/desktop/src/components/inspector/` (data from `src/timeline/timelineInspector.ts` and `useTimelineInspections.ts`); timeline error messages are in `apps/desktop/src/timeline/timelineErrorMessages.ts` (`toastTimelineError`). Follow-ups: a friendlier E-ARGS pre-check for deleting a shape that a transition still uses (today it's E-DB with a generic message); a wording pass on E-ARGS texts. No FTL trail overlay on the canvas yet.

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
  - **Clock decision:** the existing clock, through `useTimelinePlayback` (`beatIndexAtTime`, never -1). The frame clock stays not wired.
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

### 2026-09-30 · lead session · P8.1 (reviewed and merged)

- **Done:** fork PR #19 reviewed by a sub-agent (APPROVE WITH NITS: page mode renders exactly as before with the flag off; the port matches 0.2 at 568056aa apart from the listed, justified changes; UI-2 snapping works with Alt, including releasing it mid-drag; playback units and `beatIndexAtTime` are right). Three user-visible nits went back to the worker and were fixed in 5a8b1b99: clicking the paused cursor no longer advances a page (seek picks the page whose move contains or ends at the click; ruler clicks select the clicked page), the paused label shows the selected page, and a clip release recomputes snapping with the release event's Alt state. Merged. P8.1 set to done.
- **Checks:** at 41d22557: tsc (pass); `test:focused src/components/timeline/__test__/` (129 passed); `pnpm --dir apps/desktop run test` (109 files, 1,629 passed). At 5a8b1b99: tsc (pass); `test:focused src/components/timeline/__test__/ src/timeline/__test__/` (23 files, 277 passed).
- **Next:** P8.8 (view-model adapter) and P8.9 (timeline commands); P8.2 to P8.6 are open.
- **Blockers:** none.

### 2026-09-30 · timeline-worker (timeline/p8-adapter) · P8.8

- **Done:** claimed P8.8. Branch `timeline/p8-adapter` from `timeline-try-2`; wip commit 17349b84: the pure adapter `src/timeline/timelineViewModel.ts` (`buildTimelineTracks`, marcher and shape tracks, legs, UI-1 activity, diagnostics badges, `linkId` per spec timeline), the view beat axis that hides the zero-length beat 0 (`createTimelineBeatAxis`, applied at the `Timeline` boundary for pages, measures, tracks, cursor, seeks and commands), `resolverSpans` in `timelineStore.ts` (walks the public `explain`; core's API is unchanged), `useTimelineTracks` (rereads the rows under the write lock on each store version) wired into `TimelineModePanel`, and a linked-clip ring plus diagnostic badge on clips.
- **Checks:** `tsc --noEmit`: pass. `test:focused src/components/timeline/__test__/`: 136 passed. eslint: 0 errors.
- **Next:** unit tests (golden G2, G3, G12, shape track, diagnostics, converted show, validator), the hook test against a real DB, then U-Q1/U-Q4 in ui.md.
- **Blockers:** none.
- **Resume from:** check out `timeline/p8-adapter`; `pnpm install`; write `apps/desktop/src/timeline/__test__/timelineViewModel.test.ts` and `useTimelineTracks.test.tsx`; run `pnpm --dir apps/desktop run test:focused src/timeline/__test__/timelineViewModel.test.ts`.

### 2026-09-30 · timeline-worker (timeline/p8-adapter) · P8.8

- **Done:** tests on `timeline/p8-adapter` (caf5de2c, 36851fa5): adapter unit tests on the golden fixtures (G2, G3, G12 steals across timelines, G4 gap, G13 shape track and default set, G9 and G11 badges, a converted page show's linked clips, every golden fixture through `validateTimelineViewModel`), the beat axis, `resolverSpans` against R-2's worked example, the hook against a real DB (rebuilds after a committed edit and its undo), and the timeline's linked ring, badge and spec-beat commands. Decisions recorded in `ui.md`: UI-3 (U-Q1, default tracks), UI-4 (U-Q4, shape activity rule kept), UI-5 (beat 0 not drawn).
- **Checks:** `vitest run src/components/timeline/__test__/ src/timeline/__test__/`: 26 files, 305 passed. The regular desktop suite is running.
- **Next:** read the suite result, eslint/prettier/cspell, tidy the commits, open the PR.
- **Blockers:** none.
- **Resume from:** check out `timeline/p8-adapter`; `pnpm --dir apps/desktop run test` (in the background); then squash the wip commits and `gh pr create --repo AlexDumo/OpenMarch-timeline --base timeline-try-2`.

### 2026-09-30 · timeline-worker (timeline/p8-adapter) · P8.8

- **Done:** PR https://github.com/AlexDumo/OpenMarch-timeline/pull/21 (one commit, 9d200950, rebased on `timeline-try-2` at dd253109). The adapter, `resolverSpans`, `useTimelineTracks` wired into `TimelineModePanel`, the beat-0 view axis (UI-5), linked-clip ring and diagnostic badges. U-Q1 and U-Q4 decided in `ui.md` (UI-3, UI-4).
- **For P8.9:** `onTimelineRangeCommit` and `onCreateTrack` now arrive in spec beats; a clip move carries the clip's spec range shifted by the drag, and the track's `linkId` is the spec timeline id. Dragging previews only the dragged clip.
- **Checks:** build of desktop deps: pass. `tsc --noEmit`: pass (after rebase). `vitest run src/components/timeline/__test__/ src/timeline/__test__/`: 27 files, 316 passed (after rebase). `pnpm --dir apps/desktop run test`: 112 files, 1,664 passed (before the rebase, which touched no files of this PR). eslint 0 errors; prettier and cspell pass. Not run (policy): full `test:history`, e2e, `build:electron`.
- **Exit gate:** nothing ticked (the UI verification item needs a manual app check).
- **Next:** review and merge by the lead; then P8.9.
- **Blockers:** none.

### 2026-09-30 · timeline-worker (timeline/p8-adapter) · P8.8 (review fixes)

- **Done:** commit d301fb02 on PR #21 addresses the lead's review:
  1. `Resolver.spanInfos(marcherId)` is public in `@openmarch/core` (types and `createResolver`), with a dated amendment in ADR 0001 §4; the oracle is unchanged. `resolverSpans` uses it instead of walking `explain()`.
  2. `useTimelineTracks` tags each read with the store version taken under the write lock, and builds only when it matches the resolver's version; the previous tracks stay until then. A test fails if the guard is removed (checked by mutation).
  3. Spans and diagnostics are cached per version; a selection change makes no resolver calls (tested with spies).
  4. SC-11 smoke (default set plus 20 selected, seed 1): 276 tracks in about 15 ms (three runs: 15.2, 14.9, 15.1 ms); the bound is 250 ms. For comparison the old `explain()` walk took 25.8 ms here on a cold resolver, so the bound guards against large regressions only.
  5. Nits: transition-wide diagnostics show on the shape track, or once for a shapeless transition; a gap filled by another shape's move splits a shape's clip; UI-5 notes that Create Track from view 0 sends spec beat 1; the empty-state hint is a handoff follow-up.
- **Checks:** `pnpm --dir packages/core run build` and `run test`: 21 files, 456 passed. `tsc --noEmit`: pass. `test:focused src/timeline/__test__/ src/components/timeline/__test__/`: 27 files, 321 passed. `test:history src/timeline/__test__/useTimelineTracks.test.tsx`: 5 passed. eslint 0 errors; prettier and cspell pass. Not run (policy): full `test:history`, e2e, `build:electron`; the regular desktop suite wasn't re-run.
- **Next:** re-review and merge by the lead.
- **Blockers:** none.

### 2026-09-30 · lead session · P8.8 (reviewed and merged)

- **Done:** fork PR #21's first review asked for changes: mapping and the beat-0 view-axis shift were correct, but tracks were rebuilt from a span walk over the public `explain()` (which forces origin pulls and per-transition diagnostics) on every edit and selection change, and twice per edit. The worker exposed the resolver's existing `spanInfos(marcherId)` on the public `Resolver` (ADR 0001 §4 amended as an addition), builds once per resolver version, and caches spans so selection changes make no resolver calls. Measured on SC-11: 276 tracks in about 15 ms (the old walk took about 26 ms; the 250 ms smoke bound catches only gross regressions). Squash-merged. P8.8 set to done.
- **Checks:** at d301fb02, in the worker's own work tree (a lead scratch work tree that borrows another checkout's `node_modules` resolves `@openmarch/core` to that checkout's build, so core API changes must be tested in a full install): `pnpm --dir packages/core run build` and its tests (456 passed); `pnpm --dir apps/desktop exec tsc --noEmit` (pass); `pnpm --dir apps/desktop run test` (114 files, 1,690 passed).
- **Next:** P8.9 (timeline commands); P8.2 to P8.6.
- **Blockers:** none.

### 2026-10-01 · timeline-worker (timeline/p8-commands) · P8.9

- **Done:** claimed P8.9. Branch `timeline/p8-commands` from `timeline-try-2`; wip commit a20a0f9f adds `apps/desktop/src/db-functions/timelineCommands.ts`: `shiftTimelineInTransaction`/`shiftTimeline` (grow the timeline and transitions to the union, move assignments furthest-first, shrink; refuses beat < 0 and cross-timeline E-A3 before writing; delta 0 opens no edit) and `createTrackInTransaction`/`createTrack` (marcher: shapeless one-slot direct transition at the marcher's resolver position at the range start; shape: slots filled in id order, block capacity refused as E-T4). Decision (to record as UI-6 in ui.md): Create Track's assignments go one layer above the highest overlapping layer of the marchers in the range (0 if none), so the track steals the range (R-2, G2) rather than always failing E-A3 over a converted show's layer-0 page moves.
- **Checks:** `tsc --noEmit`: pass.
- **Next:** history tests (`src/db-functions/__test__/timelineCommands.test.ts`), then wire `TimelineModePanel`.
- **Blockers:** none.
- **Resume from:** check out `timeline/p8-commands`; `pnpm install`; `pnpm exec turbo run build --filter=@openmarch/desktop^... --force`; write `apps/desktop/src/db-functions/__test__/timelineCommands.test.ts` and run `pnpm --dir apps/desktop run test:history src/db-functions/__test__/timelineCommands.test.ts`.

### 2026-10-01 · timeline-worker (timeline/p8-commands) · P8.9

- **Done:** wip commits 81134b8d (history tests) and 64ff2aa8 (panel wiring) on `timeline/p8-commands`. `useTimelineCommands` (`src/components/timeline/useTimelineCommands.ts`) replaces the `TODO(P8.9)` no-ops in `TimelineModePanel`: a clip move shifts the clip's `linkId` timeline by the dragged beats (a zero shift is skipped), Create Track's target is a shape picked by selecting its track (taking the selected marchers) or else the one selected marcher, and refusals show `error.message` (which starts with the code) through `conToastError`.
- **Checks:** `tsc --noEmit`: pass. `test:history src/db-functions/__test__/timelineCommands.test.ts`: 11 passed; a mutation that moves assignments in the wrong order fails 4 of the shift tests. `vitest run src/components/timeline/__test__/TimelineCommands.test.tsx`: 8 passed. eslint and prettier on the changed files: clean. The regular desktop suite is running.
- **Next:** read the suite result; record UI-6 in `ui.md` and the handoff notes; cross-phase note for Phase 7 (structural moves still refused); tidy and open the PR.
- **Blockers:** none.
- **Resume from:** check out `timeline/p8-commands`; `pnpm install`; build the desktop's dependencies; `pnpm --dir apps/desktop run test` (in the background); then the docs and `gh pr create --repo AlexDumo/OpenMarch-timeline --base timeline-try-2`.

### 2026-10-01 · timeline-worker (timeline/p8-commands) · P8.9

- **Done:** PR https://github.com/AlexDumo/OpenMarch-timeline/pull/24 (one commit, 97a615ea, rebased on `timeline-try-2`).
  - `src/db-functions/timelineCommands.ts`: `shiftTimeline` moves a spec timeline and all its transitions and assignments by `delta` in one edit (grow the timeline and transitions to the union, move assignments furthest-first, shrink), valid at every intermediate state in both directions. It refuses beat < 0, a non-integer delta and a missing timeline (E-ARGS) and a cross-timeline same-layer overlap (E-A3) before writing; delta 0 opens no edit. `createTrack` makes a timeline, one direct transition and its assignments in one edit: for a marcher, shapeless with one slot at its resolver position at the range start; for a shape, the selected marchers in id order, with too few block cells refused (E-T4).
  - **Decision UI-6** (in `ui.md`): Create Track's assignments go one layer above the marchers' highest overlapping layer (0 if none), so the track steals the range (R-2, G2). At layer 0 it would always overlap a converted show's page moves and be refused (E-A3).
  - `TimelineModePanel` uses `useTimelineCommands`: clip moves call `shiftTimeline(linkId, change.start − track.start)` and skip zero. Create Track's target is a shape picked by selecting its track (with the selected marchers), or else the one selected marcher. Refusals show the coded message as a toast (`conToastError`).
- **For P8.6:** refusals are shown as `error.message`, which starts with the code; replace it with the friendly message when that mapping lands.
- **Follow-ups:**
  - Phase 7 has a cross-phase note: structural page moves are still refused, and Create Track over the page is a workaround.
  - Picking a shape target needs its track to be visible (UI-3 shows every shape track), and there's no on-canvas shape selection yet (P8.2).
- **Checks:**
  - `pnpm install` and the build of the desktop's dependencies: pass.
  - `tsc --noEmit`: pass.
  - `test:history src/db-functions/__test__/timelineCommands.test.ts`: 11 passed. A mutation that moves assignments in the wrong order fails 4 of them.
  - `vitest run src/components/timeline/__test__/TimelineCommands.test.tsx`: 8 passed.
  - `pnpm --dir apps/desktop run test`: 116 files, 1,709 tests passed.
  - eslint, prettier and cspell on the changed files: clean.
  - Not run (policy): full `test:history`, e2e, `build:electron`.
- **Exit gate:** nothing ticked. The UI verification item needs a manual app check by a person.
- **Next:** review and merge by the lead.
- **Blockers:** none.

### 2026-10-01 · timeline-worker (timeline/p8-commands) · P8.9 (review fixes)

- **Done:** merged `timeline-try-2` (aaaeff66). Commit f86164e6 on PR #24 addresses the lead's nits:
  1. **Create Track docs** (the `createTrackInTransaction` docstring, and UI-6 in `ui.md`): the marcher doesn't jump at the range start, but it holds still over the range. A stolen move in progress resumes afterwards with a catch-up (D-7), which shows as a change of speed. UI-6 lives only on this PR's branch, not yet on `timeline-try-2`, so `ui.md` is edited in the PR rather than through `coord.sh`.
  2. **The picked shape is dropped** when the selection becomes a marcher's track, a page or nothing, and when its track disappears; it doesn't come back if the track returns.
     - **Deviation from the review:** a range selection keeps the shape. Create Track is only offered on a range (`showCreateTrack` needs `selection.kind === "range"`), so the flow is to pick the shape's track and then select a range. Clearing the shape on a range would make shape tracks unreachable.
  3. **A shape with no selected marchers** is no target, so Create Track is hidden.
  - Tests: range keeps the shape; a page, nothing or a marcher's track drops it; a disappearing track drops it; Create Track is hidden with no marchers selected.
- **Checks:**
  - `tsc --noEmit`: pass.
  - `test:history src/db-functions/__test__/timelineCommands.test.ts`: 11 passed.
  - `test:focused src/components/timeline/__test__/`: 13 files, 153 passed (2 skipped).
  - eslint, prettier and cspell on the changed files: clean.
  - Not re-run: the regular desktop suite. Not run (policy): full `test:history`, e2e, `build:electron`.
- **Next:** re-review and merge by the lead.
- **Blockers:** none.

### 2026-10-01 · lead session · P8.9 (reviewed and merged)

- **Done:** fork PR #24 reviewed by a sub-agent (APPROVE WITH NITS: the shift's statement order keeps every intermediate state valid under the row triggers in both directions, with refusals decided before any write; Create Track reads the rows through the edit's transaction). UI-6 (Create Track's assignments steal one layer above the marchers' existing ones) accepted as consistent with D-6, R-2 and golden vector G2. The worker fixed the nits: UI-6 and the docstring now say a stolen move resumes afterwards with a catch-up; the picked shape clears when the selection becomes a marcher track, a page or nothing, or the track disappears (a range keeps it, since Create Track appears only on a range); Create Track is hidden with a shape picked and no marchers. Squash-merged as b8b63052. P8.9 set to done.
- **Checks:** at f86164e6 (with the base merged in), in the worker's work tree: tsc (pass); `test:history src/db-functions/__test__/timelineCommands.test.ts` (11 passed); `pnpm --dir apps/desktop run test` (118 files, 1,727 passed).
- **Next:** P8.2 to P8.6 (shapes, transitions, assignments, inspector, error messages).
- **Blockers:** none.

### 2026-10-01 · lead session · P8.5, P8.6 (reviewed and merged)

- **Done:** the worker couldn't claim or log through `coord.sh` (the auto-mode classifier refused its edit of the coordination checkout under `.git/`), so the lead records it here. Fork PR #25 reviewed by a sub-agent (APPROVE WITH NITS: flag off renders as before; explain() fields interpreted correctly; all five §8.9 diagnostics explained; every error code incl. combined and commit-time maps to a message; E-DB leaks no SQL). The worker fixed the nits: no "not in the timeline" flash before the first read; the "N more" count excludes unknown marchers; no lowercasing of translated words (whole-sentence keys); diagnostics reuse the store's per-version list. Squash-merged. P8.5 and P8.6 set to done.
- **Checks:** at ea037470, in the worker's work tree: tsc (pass); `test:focused src/timeline src/components/inspector` (22 files, 289 passed); `pnpm --dir apps/desktop run test` (126 files, 1,840 passed). An earlier run on this branch exited 1 from a flaky Tolgee timer after test teardown (recorded in findings.md); re-runs were clean. Not run (policy): full `test:history`, e2e, `build:electron`; the UI gate item needs a manual app check.
- **Next:** P8.2 to P8.4 (shapes, transitions, assignments editors); P8.7 (scenarios, human).
- **Blockers:** none.

### 2026-10-01 · timeline-worker (timeline/p8-transitions) · P8.3

- **Done:** claimed P8.3. Branch `timeline/p8-transitions` from `timeline-try-2`.
- **Checks:** none yet.
- **Next:** read the transition db-functions and the inspector section; build the transition editor in the inspector's timeline section.
- **Blockers:** none.
- **Resume from:** check out `timeline/p8-transitions`; `pnpm install`; build the desktop's dependencies.

### 2026-10-01 · timeline-worker (timeline/p8-transitions) · P8.3

- **Done:** wip commit 03d633b0 on `timeline/p8-transitions`: `TimelineTransitionEditor` in the inspector's timeline section (path style, bulge clamped to ±½, FTL waypoints, order mode, destination shape or individual points, slot count), planned by `src/timeline/timelineTransitionEditor.ts` (no-op changes skipped) and run as one undoable edit each through the new `updateTimelineTransition` and `setTimelineTransitionDestination` wrappers in `timelineTransitions.ts`. Switching to individual points copies the shape's slot samples, read through a one-transition resolver (no core API change). Strings are Tolgee keys under `inspector.timeline.edit`.
- **Checks:** `tsc --noEmit`: pass.
- **Next:** unit tests for the planner, component tests for each control, history tests on a real DB.
- **Blockers:** none.
- **Resume from:** check out `timeline/p8-transitions`; `pnpm install`; `pnpm exec turbo run build --filter=@openmarch/desktop^... --force`; write `apps/desktop/src/timeline/__test__/timelineTransitionEditor.test.ts`, `apps/desktop/src/components/inspector/__test__/TimelineTransitionEditor.test.tsx` and `apps/desktop/src/db-functions/__test__/timelineTransitionEdits.test.ts`.

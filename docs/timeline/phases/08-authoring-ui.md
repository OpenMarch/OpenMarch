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

- Owner: timeline-worker (timeline/p8-2-shapes)
- Status: done
- PR: https://github.com/AlexDumo/OpenMarch-timeline/pull/34
- Parallel: yes
- Depends on: P8.0

Shapes: draw and edit `line`, `freehand`, `circle`, `box` and `block` in absolute field coordinates.

### P8.3: Transitions

- Owner: timeline-worker (timeline/p8-transitions)
- Status: done
- PR: https://github.com/AlexDumo/OpenMarch-timeline/pull/27
- Parallel: yes
- Depends on: P8.0

Transitions: destination, style, bulge clamped to ±½, waypoints, `slot_count`, `order_mode`.

### P8.4: Assignments and layers

- Owner: timeline-worker (timeline/p8-assignments)
- Status: done
- PR: https://github.com/AlexDumo/OpenMarch-timeline/pull/31
- Parallel: yes
- Depends on: P8.3

Assignments: casting (nearest-slot auto-assign with core's Hungarian solve, `hungarianAlgorithm`, which `computeOptimalCoordinateMapping` wraps; lowest vacant slots for follow the leader), steals as layers, and visible vacancies.

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

### P8.10: Transitions span their timeline

- Owner: timeline-worker (timeline/p8-10-transitions-span-timeline)
- Status: done
- PR: https://github.com/AlexDumo/OpenMarch-timeline/pull/47
- Parallel: no
- Depends on: P8.9

Apply C-11 (implementation-plan.md): every transition starts and ends exactly when its timeline does. A timeline can own several transitions, but they all share its range; assignments still go in and out inside it. Range edits move the timeline and all its transitions together (one lockstep R-E1 procedure), creating a transition with another range is refused, the ripple's holding moves get their own timelines, deleting a timeline's last transition deletes the timeline, and a marcher track's clip is its timeline's range. The converter and the database check are P9.10.

### P8.11: UI-9 selection and playhead

- Owner: timeline-worker (timeline/p8-11-selection-playhead)
- Status: done
- PR: https://github.com/AlexDumo/OpenMarch-timeline/pull/51
- Parallel: yes (with P8.13 and P8.14)
- Depends on: P8.10

The selection state and what it draws (`ui.md` UI-9: Pages, Home, Playhead, Play, Selection, Tracks, What the selection holds, The end of the show). In timeline mode the selection is home, a range or nothing, held in one store that P8.12–P8.15 read. A page box selects its page's range (previous flag to its own flag) and seeks to its end; the initial box selects home and seeks to beat 0. The paused playhead rests on any whole beat, including the last flag, and seeking doesn't change the selection (replaces `pageForSeek`/`followSelectedPage` in `useTimelinePlayback.ts`). Play resumes from the playhead and loops the selected range. Marchers without a transition in the selected timeline are dimmed and can't be selected or hit (clicks, box select); selecting a timeline deselects them. A dragged range is selectable like a page box. The view model draws one track per stored timeline. Replace the timeline's `{kind: "page"}` selection (`TimelinePrimitives.tsx`, `TimelineViewModel.ts`). Page navigation (`nextPage`, `previousPage`, `firstPage`, `lastPage` in `RegisteredActionsHandler.tsx`, `pageForNavigation` and the transport) moves the playhead to that flag and selects that page's timeline (home for the first). Opening a show selects home (`StateInitializer.tsx`). Give `test/featureHarness.tsx` a way to set the selection in timeline mode. No database writes. Leaves the canvas's page-based reads to P8.12.

### P8.13: UI-9 page flags

- Owner: timeline-worker (timeline/p8-13-page-flags)
- Status: done
- PR: https://github.com/AlexDumo/OpenMarch-timeline/pull/48
- Parallel: yes (with P8.11 and P8.14)
- Depends on: P8.10

Page writes in timeline mode (UI-9 **+** and Deleting a flag). **+** shows after the paused playhead when it isn't on a flag and there is a beat there. Inside a page it inserts a row at the split page's old start and moves that page's `start_beat` to the playhead, so the split page keeps its flag, id and data and later pages renumber (no `is_subset`); in the last page it also rewrites `last_page_counts`. Past the last flag it appends a page ending at the playhead. Deleting a flag deletes only that page row. None of these write timeline rows: in timeline mode they skip `withTimelinePageRipple` (P7.4) and its holding moves. One undoable edit each; the new page becomes the selection once P8.11 lands. Page mode is unchanged.

### P8.14: UI-9 timeline membership

- Owner: timeline-worker (timeline/p8-14-timeline-membership)
- Status: done
- PR: https://github.com/AlexDumo/OpenMarch-timeline/pull/49
- Parallel: yes (with P8.11 and P8.13)
- Depends on: P8.10

The db-functions and context menu for who is in a timeline (UI-9: Adding marchers, New marchers, Removing marchers, Layers, One timeline per range, One transition per marcher). **Add selected marchers** on a timeline, page box or dragged range creates the timeline when none has that range, then gives each selected marcher not already in it a one-slot shapeless `direct` transition spanning it, destination at the marcher's position at the timeline's end, one layer above its highest layer there. Refuse (E-ARGS) a partial overlap with one of the marcher's timelines and a second timeline over an existing range. Remove from a timeline deletes the assignment and the marcher's one-slot transition, never the timeline (an exception to P8.10's rule); point the inspector's existing remove at it. Replace P7.3's join in timeline mode: a new marcher joins every stored timeline, in start order, with its own one-slot transition whose destination is its home, skipping a timeline that partly overlaps one it has joined. Marcher delete removes its transitions the same way and keeps timelines. One undoable edit each. The right-click menu doesn't change the selection.

### P8.15: UI-9 canvas edits

- Owner: timeline-worker (timeline/p8-15-canvas-edits)
- Status: done
- PR: https://github.com/AlexDumo/OpenMarch-timeline/pull/53
- Parallel: no
- Depends on: P8.11, P8.14

Canvas moves against the selection (UI-9: Editing, Editing off the end, More than one row, Home). With a timeline selected and the playhead on its end beat, a drag, nudge or alignment sets the ending of each moved marcher's transition in that timeline, found by timeline id (not by end beat, as `moveMarchersOnPage` in `db-functions/timelineMoves.ts` does today). Refuse with a hint while the playhead is off the end (TEMPORARY), when no timeline is selected away from beat 0, and for a marcher with more than one row in the timeline. At home (beat 0, no timeline) moves edit homes. Rework `canvasCoordinateWriter`/`withTimelinePositions` (`timeline/timelineCoordinateWrites.ts`) to take the selection instead of a page. Also (added 2026-10-02): wire P8.13's **+** (`useAddPageFlag` in `hooks/queries/usePageFlags.ts`) into the timeline just after the free paused playhead, selecting the new page through `useTimelineSelectionStore.selectRange`, plus a delete-flag entry on the page box's right-click menu (`deletePageFlagsMutationOptions`); and remove Create Track from timeline mode (`useTimelineCommands.ts` `createTrack`, superseded by **Add selected marchers**), since with per-page timelines it gives a marcher a second transition in a page timeline. Test nits from PR #52's review: assert one assignment per stored timeline in `useMarchersTimelineMode.test.ts`, and that the short-page loop in `timelineMembershipAdversarial.test.ts` runs at least once.

### P8.12: No selected page in timeline mode

- Owner: timeline-worker (timeline/p8-12-no-selected-page)
- Status: in-review
- PR: https://github.com/AlexDumo/OpenMarch-timeline/pull/54
- Parallel: yes (with P8.13–P8.15 once P8.11's selection store exists)
- Depends on: P8.11

Apply C-12's "no selected page": in timeline mode nothing reads `useSelectedPage` (about 36 files under `apps/desktop/src` today: the inspector, canvas listeners, toolbar, collisions, `useAnimation`, the clock and the timeline). Editing reads the selected timeline, rendering and playback read the playhead, and page data (notes, counts) reads the page containing or ending at the playhead. Port appearance-by-time from the `coordinates-v2` branch (`services/appearance/db-to-timeline.ts`, `get-appearance-at-time.ts`, `useAppearanceAnimation.ts`): per-page tag and section appearances become a step function keyed by flag timestamps and sampled at the playhead, without the per-marcher-page overrides dropped in P7.14. Page-relative tools (UI-9): set all or selected marchers to the previous page sets their ending in the selected timeline to their position at its start, and to the next page to their position at the next flag (`setMarchersToNeighborPage` and its four registered actions; refused with no timeline selected); previous and next page paths show positions at the selected timeline's start and the next flag, and nothing with no timeline selected; undo and redo (`timelineHistoryFocus.ts`) move the playhead and leave the selection alone. Add a dev-mode warning when `useSelectedPage` is read in timeline mode, and prove with timeline-mode feature tests that the listed features no longer read it. Page mode is unchanged; `SelectedPageContext` is removed with page mode in Phase 10.

### P8.16: Ranges not stored yet dim nobody

- Owner: timeline-worker (timeline/p8-16-range-dim)
- Status: done
- PR: https://github.com/AlexDumo/OpenMarch-timeline/pull/55
- Parallel: no
- Depends on: P8.11, P8.14, P8.15

UI-9 Selection (project owner, 2026-10-02): a selected range with no stored timeline (a new page's box after **+**, or a dragged range) dims nobody, so marchers stay selectable and **Add selected marchers** can create a timeline that isn't a page. Today `isMarcherDimmed` (`src/stores/TimelineSelectionStore.ts`) dims everyone for such a range and `useDeselectDimmedMarchers` clears the marcher selection, so drag-to-create is impossible. Change it so only a stored timeline dims non-members; canvas moves on such a range stay refused (P8.15's empty-timeline hint). Update the tests that assert such a range dims everyone (P8.11, P8.15 and their adversarial tests) and add tests for: drag a range with marchers selected keeps them selected; select marchers on such a range; right-click Add creates the timeline and then non-members dim; + then select and add without visiting home. Whole `test:focused` and `test:timeline` must pass.

### P8.17: UI-10 core loop: start flag, playhead window, dragging adds

- Owner: lead session (timeline/p8-17-core-loop)
- Status: in-review
- PR: https://github.com/AlexDumo/OpenMarch-timeline/pull/73
- Parallel: no
- Depends on: P8.11, P8.13, P8.14, P8.15, P8.16

UI-10 in `ui.md` (project owner, 2026-10-03), from the "Origin and Arrival" timeline UX research. The editing context is the window from the **start flag** S to the paused playhead P. A canvas drag, nudge or alignment at P sets where the moved marchers arrive at P, leaving S, and in the same undoable edit creates the window's timeline (one per range still holds) and adds any moved marcher that isn't in it (`moveMarchersInRangeInTransaction`, target `{kind: "range"}`). **Add selected marchers** leaves the menu; nothing is dimmed; arrivals may be off a flag (a timeline, not a page). S follows navigation to the page box holding P unless pinned by dragging the start handle or a range; Play plays on from P with no loop; Pause leaves S; **Stop** (button, Shift+Space) returns P to S. Tests: store rules (follow, pin, unpin, Stop fallback), `planCanvasEdit`, range moves (create, add, join, undo as one edit, partial-overlap refusal writes nothing), playback driver (no loop, Stop while playing and before audio), variants (start flag, no end handle, stored flag after Stop). Whole `test:focused` and `test:timeline` on the touched areas must pass, plus focused `test:history` on the db-function tests.

## Exit gate

Tick an item only after running its check, and paste the command and result into the log.

- [ ] QA-SC-01 to -15 run from the UI
- [ ] SC-07, SC-14 and SC-15 verdicts recorded in `findings.md` by a person
- [ ] UI changes follow the desktop verification in `docs/conventions/verification.md`

## Handoff notes

Kept current by the phase lead: where things stand, surprises, and what not to redo.

- **State on 2026-10-02:** P8.11, P8.13, P8.14 and P9.10 are merged, and PR #52 (`144a3bb0`) fixed the tests that broke when P8.14 met P9.10 (and made Create Track reuse a stored timeline). The base is green: whole `test:focused` and `test:timeline` pass. P8.15 now also wires P8.13's **+** and removes Create Track. P8.15 owns the canvas write paths; P8.12 owns every other selected-page read. Before merging parallel PRs, run the whole suite on the combined branch.
- **Paused for MVP testing (project owner, 2026-10-02).** P8.12 (PR #54) is on hold. TODO before it merges: (1) set to previous/next page must write by timeline id with P8.15's `moveMarchersInTimelineInTransaction` (today it edits an inner timeline that shares the outer's end beat); (2) timeline-mode transport buttons should use `canPlay`/`navigationTarget`; (3) hidden marchers should follow the time-sampled appearance; (4) notes during playback; (5) wider `NoSelectedPageModes` coverage. Its log has the `Resume from:` line. P8.12 isn't needed for the linear MVP.
- **Fresh work trees:** after `pnpm install`, also run `pnpm --filter @openmarch/metronome build`. If jest-dom matchers fail (around 23 `tsc` errors), the install hoisted vitest 3.2.3 at the root; that is the install, not your change.
- **UI-9 (pages are flags) is the current build, 2026-10-01.** Read `ui.md` UI-9 and `implementation-plan.md` C-12 first; UI-9 wins over older text in `ui.md`. Packages: P8.11 (selection, playhead), P8.13 (page flags), P8.14 (membership) can run in parallel after P8.10; P8.15 (canvas edits) follows P8.11 and P8.14; P8.12 (no selected page, appearance by time) follows P8.11. Converted shows need P9.10 before page boxes have timelines; build and test on timeline-mode fixtures with one timeline per page meanwhile. The linear MVP in `validation-plan.md` needs P8.11 and P8.13–P8.15 plus P9.10. Open owner questions are in `ui.md` U-Q5; _lead default_ items in UI-9 are settled enough to build. Page-based playback helpers (`pageForSeek`, and `followSelectedPage` if it lands) are replaced by P8.11, not extended.
- Porting the 0.2 timeline (P8.1): 0.2's `TimelineContainer` computes the beat with its own `getBeatIndexAtTime(beats, timeMs)`, in milliseconds, returning 0 with no beats. Replace it with `beatIndexAtTime(beats, timeMs / 1000)` from `src/timeline/timeMap.ts`, so there is one tempo map, and don't pass its -1 (no beats) to `setCurrentBeatIndex`. Don't bring back 0.2's `getBeatIndexAtTime` or `getNearestBeatIndex`.
- After P8.1 (PR #19), the timeline is in `apps/desktop/src/components/timeline/`:
  - **Clock (superseded by P8.11):** the paused playhead and selection live in `src/stores/TimelineSelectionStore.ts` (`useTimelineSelectionStore`: home, range or none in spec beats; `playheadBeat`; `selectHome`, `selectRange`, `seek`). `useTimelineSelectionHost` keeps its stored timelines current, and `useTimelinePlaybackDriver` runs play, loop, stop and pause. `useTimelinePageBridge` keeps the old selected page following the playhead until P8.12 deletes it.
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

### 2026-10-01 · timeline-worker (timeline/p8-transitions) · P8.3

- **Done:** wip commits 63a4472c (tests) and 93502c7d (`ui.md` notes) on `timeline/p8-transitions`. Planner unit tests, component tests for each control, a section test, the hook's edit targets against a real DB, and history tests for a style change, a bulge change, both destination switches and two slot-count changes (undo and redo round-trip the rows, and the resolver store follows each step).
- **Checks:** `tsc --noEmit`: pass. `test:focused src/components/inspector src/timeline/__test__/useTimelineInspections.test.tsx src/timeline/__test__/timelineTransitionEditor.test.ts src/timeline/__test__/timelineErrorMessages.test.ts`: 5 files, 95 passed. `test:history src/db-functions/__test__/timelineTransitionEdits.test.ts`: 9 passed. eslint: 0 errors. prettier and cspell: pass. The regular desktop suite is running.
- **Next:** read the suite result, squash, open the PR.
- **Blockers:** none.
- **Resume from:** check out `timeline/p8-transitions`; `pnpm install`; build the desktop's dependencies; `pnpm --dir apps/desktop run test` (in the background); then squash the wip commits and `gh pr create --repo AlexDumo/OpenMarch-timeline --base timeline-try-2`.

### 2026-10-01 · timeline-worker (timeline/p8-transitions) · P8.3

- **Done:** PR https://github.com/AlexDumo/OpenMarch-timeline/pull/27 (one commit, f24f0294, rebased on `timeline-try-2` after P7.4/P7.5).
  - `TimelineTransitionEditor` in the inspector's timeline section edits the transition of each selected marcher at the page (or the move ending there): path style (FTL disabled with the reason when there's no shape or the shape is a block), bulge clamped to ±½ with the minor-arc note, FTL waypoints (add, remove, reorder, x/y), order mode with a one-line note, destination shape or individual points (copying the shape's samples), and slot count (at least the highest assigned slot + 1; new shapeless slots start at the last point).
  - Each change is one undoable edit through the new `updateTimelineTransition` and `setTimelineTransitionDestination` wrappers. No-op changes are skipped, and refusals go through `toastTimelineError`.
  - Shape samples come from a one-transition resolver (`shapeSlotPoints`), so there's no core API change. Exporting core's `sampleDestinations` is an optional follow-up (ADR 0001 §4).
- **For the handoff notes:** the editor and its planner are `src/components/inspector/TimelineTransitionEditor.tsx` and `src/timeline/timelineTransitionEditor.ts`. `useTimelineInspections` returns `transitionEdits` and `shapeOptions`. Follow-ups:
  - Timeline clip and track selections don't drive the editor yet.
  - Waypoints can't be picked on the canvas yet.
  - The shape list doesn't filter out blocks that are too small (picking one is refused with E-T4).
- **Checks:**
  - Build of the desktop's dependencies: pass.
  - After the rebase: `tsc --noEmit` passes; `test:focused` on the inspector and timeline editor files passes (5 files, 95 tests); `test:history src/db-functions/__test__/timelineTransitionEdits.test.ts` passes (9 tests).
  - `pnpm --dir apps/desktop run test`: 129 files, 1,889 tests passed (before the rebase, which touched none of these files).
  - eslint: 0 errors. prettier and cspell: pass.
  - Not run (policy): full `test:history`, e2e, `build:electron`.
- **Exit gate:** nothing ticked. The UI verification item needs a manual app check.
- **Next:** review and merge by the lead.
- **Blockers:** none.

### 2026-10-01 · timeline-worker (timeline/p8-transitions) · P8.3 (review fixes)

- **Done:** commits dbca9b8d (code and tests) and a936ac98 (`ui.md`) on PR https://github.com/AlexDumo/OpenMarch-timeline/pull/27 fix the lead's five findings:
  1. At a page's end beat the editor now edits the move that ends there, not the next page's move starting there (spans are half-open). Tests cover back-to-back moves and a selection that mixes holding and moving marchers.
  2. After an edit, nothing is planned until the inspector shows the rebuilt target, so a quick second edit can't write over the first. The module comment is corrected. Tests: two quick waypoint removals, and controls re-enabled after a refusal.
  3. Number fields commit only changed text, so blurring a rounded value (0.1234 shown as 0.123) writes nothing. Tested.
  4. Slot counts are clamped to 10000 (I-N2) in the field and in the planner. Tested.
  5. The shape picker disables, with the reason, blocks for follow the leader (E-T3) and blocks smaller than the slot count (E-T4). Tested.
- **Note:** the session scratchpad is shared with another worker (P7.6). Its `pr.md` was briefly used as this PR's body; PR #27's body was rewritten at once, and my inserted section was removed from that file.
- **Checks:** `tsc --noEmit`: pass. `test:focused` (inspector and timeline editor files): 5 files, 105 passed. `test:history src/db-functions/__test__/timelineTransitionEdits.test.ts`: 9 passed. `pnpm --dir apps/desktop run test`: 130 files, 1,923 passed. eslint 0 errors; prettier and cspell pass. Not run (policy): full `test:history`, e2e, `build:electron`.
- **Next:** re-review and merge by the lead.
- **Blockers:** none.

### 2026-10-01 · lead · P8.3

- **Done:** reviewed PR #27. The review found five issues, all fixed in dbca9b8d and a936ac98:
  - the editor targeted the next page's move on back-to-back moves;
  - edits could be planned from stale rows;
  - blurring a field wrote its rounded value;
  - slot count had no cap;
  - the shape picker offered shapes the database refuses.
    Squash-merged at head a936ac98.
- **Checks (lead, on a936ac98):**
  - `tsc --noEmit`: pass.
  - Focused `test:history src/db-functions/__test__/`: 24 files, 592 tests passed.
  - `pnpm --dir apps/desktop run test`: 130 files and 1,923 tests passed, no errors.
  - Skipped by policy: the full `test:history` and e2e suites.
- **Next:**
  - P8.4 (assignments and layers) is unblocked.
  - Optional follow-ups: timeline clip/track selection driving the editor, picking waypoints on the canvas, exporting `sampleDestinations` from core (ADR 0001 §4).
  - The UI exit-gate item still needs a manual app check.
- **Blockers:** none.

### 2026-10-01 · timeline-worker (timeline/p7-copy-paste) · Cross-phase note from P7.6

- **Done:** found in the PR #28 review. Code that reads `useTimelineResolverStore.getState().resolver` to plan a write can start from stale positions while an earlier write is still in its transaction, because change batches reach the resolver only on commit. P7.6 adds `timelinePositionsSettled()` (`apps/desktop/src/timeline/timelineCoordinateWrites.ts`), which waits for `withTimelineWriteLock` and then `timelineResolverSettled()`. Await it before planning a write from resolver positions. Never call it inside a wrapped write: it would wait for itself.
- **Checks:** none for this note.
- **Blockers:** none.

### 2026-10-01 · timeline-worker (timeline/p8-assignments) · P8.4

- **Done:** claimed P8.4. Branch `timeline/p8-assignments` from `timeline-try-2` (at 33ac65e6, after P8.3).
- **Checks:** none yet.
- **Next:** an assignments editor under each transition in the inspector's timeline section: the slot list with vacancies, nearest-slot casting, layer and range per assignment, and which ones are stolen.
- **Blockers:** none.
- **Resume from:** check out `timeline/p8-assignments`; `pnpm install`; build the desktop's dependencies.

### 2026-10-01 · timeline-worker (timeline/p8-assignments) · P8.4

- **Done:** wip commit 46e97d8e on `timeline/p8-assignments` (rebased on `timeline-try-2` after PR #28): `src/timeline/timelineCasting.ts` (nearest-slot casting with core's `hungarianAlgorithm`, padded so leftover slots stay vacant) and `src/db-functions/timelineAssignmentEdits.ts` (cast marchers into a transition, recast by nearest slot, move to a slot or trade slots, change layer or beats, remove). Casting reads positions from a resolver over the edit's own transaction, so it can't plan from positions a committing edit is about to change. `stealLayer` in `timelineCommands.ts` is now exported.
- **Checks:** none yet.
- **Next:** the pure planner (`src/timeline/timelineAssignmentEditor.ts`), the inspector's assignments editor, history tests.
- **Blockers:** none.
- **Resume from:** check out `timeline/p8-assignments`; `pnpm install`; build the desktop's dependencies; write `apps/desktop/src/timeline/timelineAssignmentEditor.ts` and `apps/desktop/src/components/inspector/TimelineAssignmentsEditor.tsx`.

### 2026-10-01 · timeline-worker (timeline/p8-assignments) · P8.4

- **Done:** wip commits 5faed882, 3b3a4b27 and 36bbc97b on `timeline/p8-assignments`:
  - `TimelineAssignmentsEditor` under each transition editor in the inspector's timeline section: slots by drill number, vacant slots (with a warning line), per-member slot (take a vacant one or trade), layer, beats, remove, and where a higher layer steals it. **Cast selected marchers** and **Recast by nearest slot**, each disabled with its reason.
  - Planner `src/timeline/timelineAssignmentEditor.ts`; `useTimelineInspections` returns `assignmentEdits`.
  - Create Track into a shape now casts by nearest slot instead of id order.
  - Decision UI-7 (casting and layers) and the editor recorded in `ui.md` on the code branch.
- **Checks:** `tsc --noEmit`: pass. `test:history src/db-functions/__test__/timelineAssignmentEdits.test.ts`: 11 passed; `test:history src/db-functions/__test__/timelineCommands.test.ts`: 12 passed; `test:history src/timeline/__test__/useTimelineInspections.test.tsx`: 6 passed. `test:focused` on the inspector and the new planner/casting tests: 7 files, 130 passed. Mutations: zero casting cost fails 6 tests; id-order Create Track fails the new nearest-slot test. The regular desktop suite is running.
- **Next:** read the suite result; eslint, prettier, cspell; squash; open the PR.
- **Blockers:** none.
- **Resume from:** check out `timeline/p8-assignments`; `pnpm install`; build the desktop's dependencies; `pnpm --dir apps/desktop run test` (in the background); then squash and `gh pr create --repo AlexDumo/OpenMarch-timeline --base timeline-try-2`.

### 2026-10-01 · timeline-worker (timeline/p8-assignments) · P8.4

- **Done:** PR https://github.com/AlexDumo/OpenMarch-timeline/pull/31 (one commit, b8a3a5b1, on `timeline-try-2`).
  - **The editor:** `TimelineAssignmentsEditor` sits under each transition editor in the inspector. It shows:
    - the slots, with each member's drill number;
    - vacant slots, with a warning line (D-13);
    - for each member: its slot (take a vacant one or trade), layer, beats, a remove button, and where a higher layer steals it (R-2).
  - **Casting:** two actions, each disabled with its reason when it can't run:
    - **Cast selected marchers** fills vacant slots by nearest slot. Each marcher's layer is one above its other moves at those beats (per-marcher steal).
    - **Recast by nearest slot** re-picks every member's slot. A recast that wouldn't shorten the total distance is refused.
  - **Create Track** into a shape now casts by nearest slot instead of id order.
  - **Decision UI-7** is recorded in `ui.md` on the code branch.
- **For the handoff notes:**
  - Files: the editor is `src/components/inspector/TimelineAssignmentsEditor.tsx`; the planner is `src/timeline/timelineAssignmentEditor.ts`; casting is `src/timeline/timelineCasting.ts` (Hungarian solve, capped at 500 slots); the db-functions are `src/db-functions/timelineAssignmentEdits.ts`.
  - Casting reads positions from the rows inside its own transaction, so it doesn't need `timelinePositionsSettled()`.
  - Follow-ups: timeline track and clip selections don't drive the editor yet. Only the first 64 slots are listed.
- **Checks:**
  - `tsc --noEmit`: pass.
  - Focused `test:history`: `timelineAssignmentEdits.test.ts` 11 passed, `timelineCommands.test.ts` 12 passed, `useTimelineInspections.test.tsx` 6 passed.
  - `test:focused` on the inspector and the new planner and casting tests: 7 files, 130 passed.
  - `pnpm --dir apps/desktop run test`: 135 files, 1,980 passed. This ran on 36bbc97b, before a small picker and wording change; the focused tests were re-run after that change.
  - Mutation checks: zeroing the casting cost fails 6 tests; reverting Create Track to id order fails the new test.
  - eslint: 0 errors. prettier and cspell: pass.
  - Not run (policy): full `test:history`, e2e, `build:electron`.
- **Exit gate:** nothing ticked. The UI verification item needs a manual app check.
- **Next:** review and merge by the lead.
- **Blockers:** none.

### 2026-10-01 · timeline-worker (timeline/p8-assignments) · P8.4 (review fixes)

- **Done:** merged `timeline-try-2` (f34cc8e8, with #29). Commit ed095df0 on PR https://github.com/AlexDumo/OpenMarch-timeline/pull/31 fixes the lead's review:
  1. **Follow the leader** is never cast by nearest slot: new marchers take the lowest vacant slots, and recast is refused, with the reason shown, in the db-functions and the editor. Its founders' targets come from trail order (R-9, R-12).
  2. **Recast** starts each member from its row's first winning span, so a breakaway at the row's start doesn't skew the cast; rows that never win cost nothing.
  3. **Big transitions:** every member is listed, and only the vacant rows are capped (16). The vacancy line is a range summary ("0–9, 12, … (+N)"), and the slot is a typed number instead of a list of up to 10000 options.
  4. **Steals:** a cast names the moves it steals beats from, in a note after it commits. `stealLayer`'s refusal message fits each caller.
  5. **Create Track** falls back to id order past `MAX_CAST_SLOTS`.
  6. **Stale-plan guard:** after an edit, the editor waits for a target from a newer store version, so a rebuild from the same rows (scrubbing, playback) doesn't re-enable it.
  7. **Docs:** `ui.md` UI-7 and the recast help note that recasting a direct move can reorder a downstream follow-the-leader move under `inherit` (QA-SC-07). The P8.4 description here no longer names `computeOptimalCoordinateMapping`.
  8. **Tests added:** follow the leader (`inherit` and `slot`), recast after a breakaway at the start, refusals past 500 slots, a beats change that hits E-A3, members past slot 64, the vacancy summary, the steal note, and a version guard across an edit that changes ids.
- **Checks:**
  - `tsc --noEmit`: pass.
  - Focused `test:history`: `timelineAssignmentEdits.test.ts`, `timelineCommands.test.ts` and `useTimelineInspections.test.tsx`, 34 passed.
  - `test:focused` on the inspector and the planner and casting tests: 7 files, 140 passed.
  - Mutation checks: starting a recast at the row's own start fails the breakaway test; casting follow the leader by nearest slot fails both follow-the-leader tests.
  - eslint: 0 errors. prettier and cspell: pass.
  - The desktop suite is running.
  - Not run (policy): full `test:history`, e2e, `build:electron`.
- **Next:** read the suite result, update the PR body, report back.
- **Blockers:** none.
- **Resume from:** check out `timeline/p8-assignments`; `pnpm --dir apps/desktop run test` (in the background); update PR #31's body from `pr-P8.4.md`.

### 2026-10-01 · timeline-worker (timeline/p8-assignments) · P8.4 (review fixes ready)

- **Done:** PR https://github.com/AlexDumo/OpenMarch-timeline/pull/31's body is updated for the review fixes in ed095df0. The branch was merged with `timeline-try-2`, not force-pushed.
- **Checks:** `pnpm --dir apps/desktop run test` on ed095df0: 137 files, 2,011 passed (14 skipped, 15 todo). The other checks are in the previous entry.
- **Next:** re-review and merge by the lead.
- **Blockers:** none.

### 2026-10-01 · lead · P8.4

- **Done:** reviewed PR #31 and squash-merged it at head ed095df0.
  - The review raised eight items, all fixed with tests. The main ones:
    - follow the leader now casts into the lowest vacant slots, and recast is refused;
    - recast measures from each row's first winning span;
    - every member is listed past slot 64;
    - cast steal notes;
    - Create Track falls back past 500 marchers;
    - the stale-plan guard is keyed on the store version.
  - UI-7 is in `ui.md`.
- **Checks (lead, on ed095df0):**
  - `tsc --noEmit`: pass.
  - Focused `test:history src/db-functions/__test__/`: 26 files, 621 tests passed.
  - `pnpm --dir apps/desktop run test`: 137 files and 2,011 tests passed, with no errors.
  - Skipped by policy: the full `test:history` and e2e suites.
- **Next:**
  - P8.2 (shapes).
  - Follow-up: timeline clip and track selection doesn't drive the inspector editors yet.
  - The UI exit-gate item needs a manual app check.
- **Blockers:** none.

### 2026-10-01 · timeline-worker (timeline/p8-2-shapes) · P8.2

- **Done:** claimed P8.2. Branch `timeline/p8-2-shapes` from `timeline-try-2` (at dd7e3e2e, after P8.4).
- **Checks:** none yet.
- **Next:** read the shape rules in the spec and P7.11; split the work with P7.11; build the shape editor.
- **Blockers:** none.
- **Resume from:** check out `timeline/p8-2-shapes`; `pnpm install`; build the desktop's dependencies.

### 2026-10-01 · timeline-worker (timeline/p8-2-shapes) · P8.2

- **Done:** wip commit b4c09aa0 on `timeline/p8-2-shapes`: `TimelineShapesEditor` in the inspector's timeline section (new shape of any kind drawn through the selected marchers, or at the field's middle; pick a shape; name, kind, geometry per kind, delete), planned by `src/timeline/timelineShapeEditor.ts` and run as one undoable edit each through the new `createTimelineShape`, `updateTimelineShape` and `deleteTimelineShape` wrappers in `timelineShapes.ts`. Converting a shape in use to a block gives it a cell for every slot of the transitions using it (I-T4); a block for a follow-the-leader user (I-T3) and deleting a shape in use (I-D1) are disabled with the reason; fewer rows or columns than a user's slots go to the database, which refuses them (E-T3/E-T4).
- **Split with P7.11:** P8.2 is the spec-shape model's editor (create, geometry, kind, rename, delete of `timeline_shapes`, keeping the transitions that use a shape valid). P7.11 keeps the page-era shape tools: canvas shape objects and control-point drags (`MarcherShape`, `StaticMarcherShape`), the old `ShapeEditor`, shape pages and copy to page, the lock rules, and shape rendering on the canvas. Drawing a spec shape on the canvas (outline and handles) needs those canvas objects, so it is P7.11's, or a follow-up after it; P8.2 draws a shape through the selected marchers instead.
- **Checks:** `tsc --noEmit`: pass.
- **Next:** planner unit tests, component tests, history tests on a real DB.
- **Blockers:** none.
- **Resume from:** check out `timeline/p8-2-shapes`; `pnpm install`; build the desktop's dependencies; write `apps/desktop/src/timeline/__test__/timelineShapeEditor.test.ts`, `apps/desktop/src/components/inspector/__test__/TimelineShapesEditor.test.tsx` and `apps/desktop/src/db-functions/__test__/timelineShapeEdits.test.ts`.

### 2026-10-01 · timeline-worker (timeline/p8-2-shapes) · P8.2

- **Done:** wip commit 5a8a5ab4 on `timeline/p8-2-shapes`: planner unit tests (`src/timeline/__test__/timelineShapeEditor.test.ts`), component tests (`src/components/inspector/__test__/TimelineShapesEditor.test.tsx`), history tests on a real DB (`src/db-functions/__test__/timelineShapeEdits.test.ts`), a hook case in `useTimelineInspections.test.tsx`, and the editor's notes in `ui.md` ("Shapes (P8.2)", on the code branch, as P8.3 and P8.4 did).
- **Checks:** `tsc --noEmit`: pass. `test:focused` on the planner, inspector and error-message tests: 7 files, 160 passed. Focused `test:history` on every test file that uses `timelineShapes.ts` (`timelineShapeEdits`, `timelineMoves`, `timelineMarchers`, `timelineAssignmentEdits`, `timelineTransitionEdits`, `timelineCommands`, `useTimelineInspections`, `timelinePageCopy`): 8 files, 92 passed. Mutations: removing the version guard fails the stale-plan test; enabling the block kind for a follow-the-leader user fails the I-T3 test. eslint 0 errors; prettier and cspell pass. The regular desktop suite is running.
- **Next:** read the suite result; squash; open the PR.
- **Blockers:** none.
- **Resume from:** check out `timeline/p8-2-shapes`; `pnpm install`; build the desktop's dependencies; `pnpm --dir apps/desktop run test` (in the background); then squash the wip commits and `gh pr create --repo AlexDumo/OpenMarch-timeline --base timeline-try-2` with the body from `pr-P8.2.md`.

### 2026-10-01 · timeline-worker (timeline/p8-2-shapes) · P8.2

- **Done:** PR https://github.com/AlexDumo/OpenMarch-timeline/pull/34 (one commit, 715e6dce, rebased on `timeline-try-2` after P7.12 and P7.15).
  - `TimelineShapesEditor` sits in the inspector's timeline section and shows with or without a page.
    - **New shape:** a shape of any kind is drawn through the selected marchers where they stand at the page's end beat, or at the field's middle when nobody is selected.
    - **Edit:** pick a shape to change its name, its kind and its geometry for that kind.
    - **Delete:** only unused shapes.
  - Each change is one undoable edit through the new `createTimelineShape`, `updateTimelineShape` and `deleteTimelineShape`. The planner is `src/timeline/timelineShapeEditor.ts`.
  - **Keeping the transitions that use a shape valid:**
    - a kind change to a block gets a cell for every slot of the transitions using the shape (I-T4);
    - a block for a follow-the-leader user (I-T3) and deleting a shape in use (I-D1) are disabled, with the reason;
    - a smaller block grid is sent as typed, and the database refuses it (E-T3/E-T4) through `toastTimelineError`.
  - **After the P7.15 rebase:** shape targets match both the resolver version and the display version, and their guard version is the sum, as the other editors' is.
  - `ui.md` has "Shapes (P8.2)" on the code branch.
- **Split with P7.11:** see the first P8.2 entry. In short, P7.11 keeps the page-era canvas shape tools and on-canvas drawing; P8.2 is the `timeline_shapes` editor.
- **For the handoff notes:**
  - Files: the editor is `src/components/inspector/TimelineShapesEditor.tsx`; the planner is `src/timeline/timelineShapeEditor.ts`; the db-functions are in `src/db-functions/timelineShapes.ts`. `useTimelineInspections` returns `shapeEdits` (`{ version, targets }`).
  - Follow-ups:
    - drawing and dragging spec shapes on the canvas (with P7.11);
    - picking the shape to edit from a timeline shape track;
    - a friendlier message for the combined E-T3/E-T4 code when the change is to a shape, not a transition's destination.
- **Checks:**
  - `tsc --noEmit`: pass.
  - `test:focused` on the planner, inspector, error-message and transition-planner tests: 7 files, 160 passed.
  - Focused `test:history` on every test file that uses `timelineShapes.ts`: 8 files, 94 passed (after the rebase).
  - `pnpm --dir apps/desktop run test` on the rebased head: 149 files (142 passed, 7 skipped), 2,095 tests passed.
  - Mutation checks: removing the version guard fails the stale-plan test; enabling the block kind for a follow-the-leader user fails the I-T3 test.
  - eslint: 0 errors. prettier and cspell: pass.
  - Not run (policy): full `test:history`, e2e, `build:electron`.
- **Exit gate:** nothing ticked. The UI verification item needs a manual app check.
- **Next:** review and merge by the lead.
- **Blockers:** none.

### 2026-10-01 · timeline-worker (timeline/p8-2-shapes) · P8.2 (review fixes)

- **Done:** merged `timeline-try-2` (81c94cdd, with #33, P7.10). Commit ace16e71 on PR https://github.com/AlexDumo/OpenMarch-timeline/pull/34 fixes the lead's review:
  1. **Open paths:** a box, circle or block converted to freehand is now an open path, so its first and last slots no longer stack (freehand samples at `i/(n-1)`). A kind change on a shape in use says that its users' slots are re-spread. The "same ground" wording is fixed in `ui.md` and the help text. Test: for every source shape and target kind, at 2, 3, 5, 16, 17 and 40 slots, every slot point is distinct. Putting the closing point back fails 3 tests.
  2. **Delete in use:** `deleteTimelineShape` checks `dest_shape_id` inside the edit and refuses with an `E-ARGS` message that names the transitions. The foreign key stays the backstop, with its own test (E-DB through `deleteTimelineShapesInTransaction`).
  3. **Circle from a selection:** the radius is the first marcher's distance from the middle (the mean when that is 0), so the circle passes through marcher 1. Tested with marchers at unequal distances.
  4. **Double click:** an in-flight ref covers the whole edit. Test: a second click while the create is in flight, even after the version moves, creates nothing. Removing the ref fails it.
  5. **Unknown marchers:** selected marchers that aren't in the timeline are refused with a toast (E-ARGS) instead of drawing at the field's middle.
  6. **New tests:** circle and block through collinear marchers; freehand through coincident marchers; non-whole rows and columns (planner, and E-S1 on a real DB).
- **Checks:**
  - `tsc --noEmit`: pass.
  - `test:focused` (planner, inspector, error-message and transition-planner tests): 7 files, 169 passed.
  - Focused `test:history` on the shape test files (`timelineShapeEdits`, `timelineMoves`, `timelineMarchers`, `timelineAssignmentEdits`, `timelineTransitionEdits`, `timelineCommands`, `useTimelineInspections`, `timelinePageCopy`): 8 files, 96 passed.
  - eslint: 0 errors. prettier and cspell: pass.
  - The desktop suite is running.
- **Next:** read the suite result, update the PR body, report back.
- **Blockers:** none.
- **Resume from:** check out `timeline/p8-2-shapes`; `pnpm --dir apps/desktop run test` (in the background); update PR #34's body from `pr-P8.2.md`.

### 2026-10-01 · timeline-worker (timeline/p8-2-shapes) · P8.2 (review fixes ready)

- **Done:** PR https://github.com/AlexDumo/OpenMarch-timeline/pull/34's body is updated for the review fixes in ace16e71. The branch was merged with `timeline-try-2`, not force-pushed.
- **Checks:** `pnpm --dir apps/desktop run test` at ace16e71, run once and alone: 153 files (146 passed, 7 skipped), 2,150 tests passed. The other checks are in the previous entry. Not run (policy): full `test:history`, e2e, `build:electron`.
- **Next:** re-review and merge by the lead.
- **Blockers:** none.

### 2026-10-01 · lead · P8.2

- **Done:** reviewed PR #34 and squash-merged it at head ace16e71. The review found two significant issues and four smaller ones, all fixed:
  - Closed shapes converted to freehand stacked the first and last slot. They are now open paths, with a distinctness test over every conversion.
  - Deleting a shape in use gave a generic error. It now gives an E-ARGS refusal naming the transitions.
  - A circle drawn from the selection now passes through marcher 1.
  - A double-click guard is added.
  - Unknown selected marchers are now refused.
  - Tests are added for degenerate selections.
- **Checks (lead, on ace16e71, includes #33):**
  - `tsc --noEmit`: pass.
  - Focused `test:history src/db-functions/__test__/`: 28 files, 647 tests passed.
  - `pnpm --dir apps/desktop run test`: 146 files, 2,150 tests passed, no errors.
  - Skipped by policy: the full `test:history` and e2e suites.
- **Next:**
  - P7.11 (page-era shape tools; canvas drawing of spec shapes) is now unblocked.
  - The UI exit-gate item needs a manual app check.
- **Blockers:** none.

### 2026-10-01 · timeline-worker (timeline/p8-10-transitions-span-timeline) · P8.10

- **Done:** claimed P8.10 at the project owner's request. Recorded C-11 (transitions span their timeline; a timeline may own several, all sharing its range; assignments keep sub-ranges) in `implementation-plan.md`, a note in spec §2/§3, ui.md UI-8 and U-Q2, and filed P9.10 (converter and the database check) as a dependency of P9.4.
- **Checks:** none yet (docs only).
- **Next:** code on `timeline/p8-10-transitions-span-timeline`: lockstep timeline range edit, create guard, ripple holds, delete-last-transition, marcher clip range, fixtures.
- **Blockers:** none.

### 2026-10-01 · timeline-worker (timeline/p8-10-transitions-span-timeline) · P8.10

- **Done:** PR https://github.com/AlexDumo/OpenMarch-timeline/pull/47. Transitions take their timeline's range (others refused, E-ARGS); `setTimelineRangeInTransaction` moves a timeline with all its transitions and anchored assignments (R-E1), and timeline and transition range edits go through it; deleting a timeline's last transition deletes the timeline; the ripple's holding moves get their own timeline and emptied timelines are deleted; a marcher clip is its timeline's range (UI-8); fixtures group transitions by range. The converter keeps one show-wide timeline through `createLegacyPageTransitionsInTransaction` (TODO P9.10). ADR 0001 records C-11.
- **Checks:** `npx vitest run --silent=true` (apps/desktop): 2483 passed, 15 skipped, 15 todo, 0 failed, including the e2e fuzz and its v0.6 negative control. `tsc --noEmit`: pass. Pre-commit (cspell, eslint, prettier): pass. Not run, at the owner's request: `test:timeline`, focused `test:history`, `pnpm check:quick`, Playwright e2e. `test:timeline` is the most relevant of these (ripple on converted shows).
- **Next:** review and merge; then P9.10.
- **Blockers:** none.

### 2026-10-01 · lead session · C-12 (decided)

- **Done:** the project owner refined UI-9/C-12: page boxes select a page timeline that is stored only once marchers are added; one timeline per range and one transition per marcher per timeline; adding marchers is a right-click **Add selected marchers** (not double-click); **+** and flag delete write only the page row; no selected page in timeline mode, with appearance sampled by time as on `coordinates-v2`. Added P8.11 (UI-9) and P8.12 (no selected page). Non-linear parents for added marchers and layered validation are deferred.
- **Checks:** none (decision only).
- **Next:** P8.11 after P8.10 and P9.10.
- **Blockers:** none.

### 2026-10-02 · lead session · UI-9 ready to build

- **Done:** the project owner settled the rest of UI-9 (2026-10-01): a page is named by its end flag; **+** keeps the split page's id and renumbers later pages; home (page 0) selects no timeline and edits homes; play loops the selected timeline; one track per timeline; dimmed marchers can't be selected or touched; removing a marcher never deletes a timeline; new marchers join every stored timeline; editing off the timeline's end is refused for now (TEMPORARY). The lead filled the remaining implementation gaps as _lead default_ items in UI-9 (selection held as a range, playhead may rest on the last flag, **+** past the last flag appends, refusal for more than one row, new-marcher join order). Split P8.11 into P8.11 (selection and playhead), P8.13 (page flags), P8.14 (membership) and P8.15 (canvas edits). C-12 recorded in ADR 0001.
- **Checks:** none (decisions and docs only); prettier and cspell on the changed docs.
- **Next:** P8.11, P8.13 and P8.14 in parallel once P8.10 merges; P9.10 for converted shows.
- **Blockers:** none for the MVP path. Open owner questions: `ui.md` U-Q5.

### 2026-10-02 · lead session · page-relative tools (decided)

- **Done:** the project owner accepted the lead's proposals for features built on the selected page (UI-9 Page-relative tools, Deprecating page selection): page navigation moves the playhead to a flag and selects that page's timeline; set to previous/next page edits endings in the selected timeline; previous/next page paths follow the selected timeline; a show opens on home; undo moves only the playhead for now; a dev-mode warning guards `useSelectedPage` in timeline mode. Added to P8.11 (navigation, open, selection type, harness) and P8.12 (neighbor-page actions, paths, history focus, guard).
- **Checks:** none (decisions and docs only); prettier and cspell on the changed docs.
- **Next:** unchanged: P8.11, P8.13 and P8.14 after P8.10.
- **Blockers:** none.

### 2026-10-02 · lead session · P8.10 (done)

- **Done:** PR #47 was already merged (`e12c5e1e`); P8.10 set to done. P8.11, P8.13, P8.14 and P9.10 are unblocked and started with timeline-worker agents.
- **Checks:** none (status only).
- **Next:** review and test each PR as it reaches in-review; then P8.15 and P8.12.
- **Blockers:** none.

### 2026-10-02 · timeline-worker (timeline/p8-11-selection-playhead) · P8.11

- **Done:** the selection store is pushed (commit `ca9df07d` on `timeline/p8-11-selection-playhead`). **Module: `apps/desktop/src/stores/TimelineSelectionStore.ts`**, `useTimelineSelectionStore`: `selection` is `{kind: "home"} | {kind: "range", start, end} | {kind: "none"}` (spec beats, half-open); `playheadBeat` is the paused playhead (whole spec beat; show time 0 is written as 0); `selectHome()` seeks to 0, `selectRange(start, end)` seeks to `end`, `seek(beat)` moves only the playhead, `followTimelineShift` moves a selection with its clip. The stored timeline a range resolves to: `selectedStoredTimeline(state)` / `useSelectedStoredTimeline()` (`{id, start, end, marcherIds}` or null); `isMarcherDimmed(state, marcherId)`. `storedTimelines` is kept current by `useTimelineSelectionHost` (`src/timeline/useTimelineSelectionHost.ts`, mounted in `TimelineResolverHost`). P8.13–P8.15 and P8.12 read these; the API may still gain fields, but these names stay.
- **Checks:** `pnpm run test:focused src/stores/__test__/TimelineSelectionStore.test.ts` (apps/desktop): 8 passed. `pnpm tsc --noEmit`: pass. Pre-commit (cspell, eslint, prettier): pass.
- **Next:** wire the timeline (page boxes, home, dragged range, one track per timeline), playhead and play/loop, navigation, opening on home, dimming on the canvas, harness.
- **Blockers:** none.
- **Resume from:** `apps/desktop/src/components/timeline/TimelineViewModel.ts` (`TimelineSelection` to home/range in spec beats), then `TimelinePrimitives.tsx`, `TimelineVariants.tsx`, `TimelineModePanel.tsx`, `useTimelinePlayback.ts`. Run `pnpm install` first in a fresh work tree.

### 2026-10-02 · timeline-worker (timeline/p8-13-page-flags) · P8.13

- **Done:** `apps/desktop/src/db-functions/pageFlags.ts`: `planPageFlagInsertion` (pure: split inside a page, append past the last flag, nothing on a flag, at home or past the beats), `pageFlagGrid` (renderer pages to the plan's grid), `addPageFlag` and `deletePageFlags` (one undoable edit each, page rows and `last_page_counts` only, no `withTimelinePageRipple`, refused outside timeline mode). `hooks/queries/usePageFlags.ts` has mutation options. Tests in `db-functions/__test__/pageFlags.test.ts`. Pushed as a `wip:` commit on `timeline/p8-13-page-flags`.
- **Checks:** `pnpm run test:focused src/db-functions/__test__/pageFlags.test.ts`: 15 passed. `pnpm run test:history` on the same file: 15 passed. `pnpm tsc --noEmit`: pass.
- **Next:** desktop verification, tidy commits, PR.
- **Blockers:** none.
- **Resume from:** `timeline/p8-13-page-flags`; run `pnpm --filter "./packages/*" build` in a fresh work tree, then the focused test above; then finish (WORKER.md step 6).

### 2026-10-02 · timeline-worker (timeline/p8-13-page-flags) · P8.13

- **Done:** PR https://github.com/AlexDumo/OpenMarch-timeline/pull/48. `db-functions/pageFlags.ts`: `addPageFlag` (**+**: split keeps the split page's flag, id and data with a new row at its old start; splitting the last page keeps the last flag through `last_page_counts`; past the last flag it appends a page ending at the beat) and `deletePageFlags`, each one undoable edit that writes only page rows and `last_page_counts`, with no ripple, refused outside timeline mode. `planPageFlagInsertion`/`pageFlagGrid` decide where **+** shows; `hooks/queries/usePageFlags.ts` has mutation options and `useAddPageFlag`, whose `onAdded` returns the new page's range.
- **Interpretation for review:** deleting page N's flag deletes N's row and moves the next page's `start_beat` back to N's start, so only N's flag goes and the next page keeps its flag, id and data (the inverse of **+**). Deleting the row alone would remove page N−1's flag instead. Existing `deletePages` and its P7.4 ripple are unchanged.
- **Checks:** `pnpm run test:focused src/db-functions/__test__/pageFlags.test.ts`: 15 passed; `pnpm run test:history` on it: 15 passed; with `VITEST_TIMELINE_MODE=true`: 15 passed; `test:focused` on `timelineRipple.test.ts` and `page.test.ts`: 147 passed, 1 todo; `pnpm tsc --noEmit`: pass; eslint, prettier --check and cspell on the changed files: pass. Not run (worker policy): full `test:history`, full `test:timeline`, Playwright e2e, `pnpm check:quick`. No exit-gate items ticked.
- **Next (follow-ups after P8.11 merges):** wire `useAddPageFlag`'s `onAdded` to `useTimelineSelectionStore.getState().selectRange(startBeat, endBeat)`. Render the **+** button after the free paused playhead, in P8.11's `Timeline.tsx`/`TimelinePrimitives.tsx`; it never shows while the playhead sits on a selected page's flag. Give delete an entry point, such as a page-box context menu shared with P8.14, calling `deletePageFlagsMutationOptions`; `PageTimeline` in beat-edit mode still calls the ripple `deletePages`.
- **Blockers:** none.

### 2026-10-02 · timeline-worker (timeline/p8-11-selection-playhead) · P8.11

- **Done:** pushed `5119bd98`. The timeline selects home (initial box) and ranges (page boxes, a drag on empty space, resized ranges) through `useTimelineSelectionStore`; `TimelineSelection` is now `home | range | null` in spec beats (`Timeline` converts). One track per stored timeline (`buildTimelineClipTracks`). Playhead: `useTimelinePlayback` reads the store; seeks move only the playhead; navigation and play/pause in `src/timeline/timelineTransport.ts` (pure rules in `src/timeline/timelinePlayhead.ts`); the audio player starts at the playhead and restarts on each playhead write, which is how `useAnimation` loops a selected range. Dimming and deselection: `src/timeline/useTimelineDimming.ts`. Opening a show selects home (`StateInitializer`). TEMPORARY bridge until P8.12: `src/timeline/useTimelinePageBridge.ts` keeps the legacy selected page on the playhead's page (and moves the playhead to a page selected elsewhere). Harness: `selectTimeline`, `timelineSelection` in `src/test/featureHarness.tsx`.
- **Checks:** focused vitest on the changed timeline tests (`useTimelinePlayback`, `timelineSelection`, `TimelineVariants`, `TimelineGeometry`, `TimelineCommands`, `TimelineAdapterView`, `TimelineStories`, `useTimelineTracks`, `TimelineSelectionStore`): all pass. `pnpm tsc --noEmit`: pass. Pre-commit: pass.
- **Next:** a timeline-mode feature test through the harness (navigation actions), broader focused runs, then PR.
- **Blockers:** none.
- **Resume from:** add `src/utilities/__test__/` or `src/timeline/__test__/` harness test for the navigation actions under `pnpm run test:timeline <file>`; then run `pnpm run test:focused src/components/timeline src/timeline src/utilities src/components/canvas` and lint; open the PR.

### 2026-10-02 · Cross-phase note from P9 · P8.11, P8.14

- **Done:** P9.10 (PR https://github.com/AlexDumo/OpenMarch-timeline/pull/50) changes what the converter writes.
  - A converted show now has one unnamed timeline per page move, over exactly the page's range (page 1 from beat 1), with one shapeless transition spanning it. Each marcher has one layer-0 assignment in each timeline.
  - `timeline_commit_violations` now reports `E-T1` at commit for any transition whose range differs from its timeline's.
- **Next:**
  - **P8.11:** `clipsOfShape` in `src/timeline/timelineViewModel.ts` (marked `TODO(P9.10)`) only split gaps in the old show-wide timeline and is now dead. Drop it with the one-track-per-timeline rewrite. P9.10 didn't touch the file, to avoid a conflict.
  - **P8.14:** P7.3's join (`addMarchersToTimelineInTransaction`) still works per page timeline, so nothing blocks replacing it.
- **Blockers:** none.

### 2026-10-02 · timeline-worker (timeline/p8-11-selection-playhead) · P8.11

- **Done:** PR https://github.com/AlexDumo/OpenMarch-timeline/pull/51 (squashed `f76a24ea`). Selection store `apps/desktop/src/stores/TimelineSelectionStore.ts` (home / range / none, paused playhead, stored timelines; `useSelectedStoredTimeline`, `isMarcherDimmed`). The timeline selects home and ranges from page boxes, dragged ranges and resized ranges, in spec beats. It draws one track per stored timeline (`buildTimelineClipTracks`). The playhead can rest on any whole beat, including the end of the show, and seeking doesn't change the selection (`pageForSeek`, `pageAtBeat` and `pageForNavigation` are removed). Play resumes from the playhead and loops a selected range (`timelineTransport.ts`, `useAnimation`, `AudioPlayer`). Navigation moves the playhead to a flag and selects that page, or home for the first page. Dimmed marchers can't be selected or hit (`useTimelineDimming.ts`). Opening a show selects home. Harness: `selectTimeline`, `timelineSelection`.
- **Notes for P8.12, P8.13, P8.14 and P8.15:** `src/timeline/useTimelinePageBridge.ts` is a TEMPORARY bridge that keeps the legacy selected page on the playhead's page, and moves the playhead when something else selects a page. P8.12 should delete it with the selected page. The paused canvas already draws at the playhead (`useTimelineStaticRender`'s `beat`), but `canvasCoordinateWriter` still writes page-based (P8.15). P8.13 can make a new page the selection with `selectRange(start, end)`. Create Track is still offered for one selected marcher until P8.14. The `useTimelineCommands` `noteSelection` and shape picking are removed. Clip click selects nothing, because that is still open in U-Q5. The handoff notes' "Clock" bullet (paused cursor = selected page's end, `pageForSeek`) is now stale; the lead may want to update it.
- **Checks** (from `apps/desktop`):
  - `pnpm tsc --noEmit`: pass.
  - eslint on touched files: 0 errors.
  - `pnpm prettier --check apps/desktop/src` (repo root): pass.
  - `pnpm run test:focused` (the whole desktop vitest suite): 177 files and 2496 tests passed.
  - `pnpm run test:timeline` on `src/components/timeline src/timeline src/utilities src/components/canvas src/stores src/hooks src/components/inspector src/global/classes`: 1098 passed.
  - `pnpm run test:timeline src/timeline/__test__/TimelineSelectionModes.test.tsx`: 2 passed.
  - Not run, per policy: the full `test:history` suite and Playwright e2e. No history test covers these files.
  - Not run: a manual check in the app.
- **Next:** review and merge.
- **Blockers:** none.

### 2026-10-02 · timeline-worker (timeline/p8-11-selection-playhead) · P8.11 (review fixes)

- **Done:** PR #51 is now `8060a271`, still one squashed commit.
  - **Clip move:** a clip move of the selected timeline no longer clears the marcher selection; `followTimelineShift` moves the loaded stored timeline with the selection.
  - **Dimmed marchers can't be selected again:** `CanvasMarcher.makeSelectable` and the new `setInteractive` respect `timelineDimmed`, which fixes the line and lasso tools, and the lasso skips dimmed marchers.
  - **Loop no longer depends on the audio restart:** the loop, stop and pause rules moved to `src/timeline/useTimelinePlaybackDriver.ts` (mounted in `TimelineResolverHost`). A loop moves the live position at once (`restartLivePlaybackAt`).
  - **Last page box:** it ends at its flag (`TimelinePageMarker.endBeat`).
  - **Seeks:** non-finite seeks are ignored, and seeks clamp to `showEndBeat`.
  - **Harness:** `selectTimeline` fails fast in page mode.
  - **TODO tag:** the `clipsOfShape` TODO is re-tagged.
  - **Tests:** added for each fix (driver with fake animation frames, clip move, line and lasso tools, page boxes with the zero-length beat 0 and on `marchersAndPages`).
  - **Tester's files not adopted:** copying them from the tester's work tree was refused by the permission system (untrusted code integration). My own tests cover the same cases.
- **Checks:**
  - `pnpm tsc --noEmit`: pass.
  - eslint on touched files: 0 errors.
  - `pnpm run test:focused` (the whole suite): 178 files and 2509 tests passed.
  - `pnpm run test:timeline` on the timeline, canvas, stores, hooks, inspector and utilities paths: 1111 passed.
  - `TimelineSelectionModes.test.tsx`: 3 passed in each mode.
  - Pre-commit: pass.
  - Not run: the full `test:history` suite, Playwright e2e, and a manual run of the app.
- **Next:** re-review.
- **Blockers:** none.

### 2026-10-02 · timeline-worker (timeline/p8-11-selection-playhead) · P8.11 (re-review fixes)

- **Done:** PR #51 is now `571c46c4`, still one squashed commit.
  - **Shift-drag lasso:** the select tool's lasso (`DefaultListeners`) skips dimmed marchers and turns marchers back on through `setInteractive`, so dimmed ones stay off; tested. No other direct writes turn marchers back on: the remaining `selectable`/`evented` writes only turn things off.
  - **Comment fixed:** the `useAnimation` comment now names `useTimelinePlaybackDriver`.
  - **TODO re-tagged:** the `clipsOfShape` TODO now points at P8.12.
  - **Test renamed:** the harness test in `TimelineSelectionModes.test.tsx` now says what it checks. It no longer claims anything about stored timelines for page boxes, since P9.10 will add them.
  - **Known gap, documented in `setTimelineDimmed`:** clearing the dim while the line or lasso tool has every marcher off makes that marcher selectable mid-tool. Restoring the state from before the dim would leave it stuck off when the tool finishes while it's dimmed, which is worse.
- **Checks:**
  - `pnpm tsc --noEmit`: pass.
  - eslint on touched files: 0 errors.
  - `pnpm run test:focused` (the whole suite): 178 files and 2510 tests passed.
  - `pnpm run test:timeline` on the timeline, canvas, stores, hooks, inspector and utilities paths: 1112 passed.
  - Pre-commit: pass.
  - Not run: the full `test:history` suite, Playwright e2e, and a manual run of the app.
- **Next:** re-review.
- **Blockers:** none.

### 2026-10-02 · timeline-worker (timeline/p8-11-selection-playhead) · P8.11 (rebased onto P9.10, P8.13, P8.14)

- **Done:** PR #51 rebased onto `timeline-try-2` (`889cb433`). It is now one commit, `e2203924`.
  - **Conflict:** the `clipsOfShape` TODO; I kept `TODO(P8.12)`.
  - **Integration with P8.14:** the right-click menu works with the selection model. Page boxes carry their flag-ended range. Clips send their stored spec range. A right-click or ctrl+click neither seeks nor changes the selection: `TimelineRangeMenuAdversarial` passes. I updated `TimelineRangeMenu.test.tsx` because the dragged-range selection is in spec beats now. Its converted-show test had assumed P9.10's earlier single timeline across the whole show; it now checks per-page timelines from both a page box and a clip.
  - **Integration with P9.10:** in `TimelineSelectionModes`, a page box on a converted show now resolves to its stored timeline with every marcher in it. The `useTimelineTracks` expectations follow the [1, 9) seed. P8.13's `pageFlags.ts` and `usePageFlags.ts` don't conflict.
- **Checks:**
  - `pnpm tsc --noEmit`: pass.
  - `pnpm run test:history` on `useTimelineTracks`, `timelineSelection` and `TimelineRangeMenu`: 19 passed.
  - `pnpm run test:focused` (the whole suite): 2582 passed, 19 failed, all in `timelineMembership`, `timelineMembershipAdversarial`, `timelineMarchers`, `timelineRipple` and `timelineHistoryFocus` (db-functions this PR doesn't touch).
  - `pnpm run test:timeline` on the timeline, canvas, stores, hooks, inspector and utilities paths: 1141 passed, 1 failed (`useMarchersTimelineMode`).
  - **The same 19 and the same 1 fail on base `889cb433`** (a separate checkout of base, same commands). They are P8.14 tests that assume P9.10's earlier single timeline across the whole show; not this PR.
  - Not run: Playwright e2e and a manual run of the app.
- **Next:** review. Someone needs to fix the base failures above (P8.14 or P9.10 owner).
- **Blockers:** none for P8.11.

### 2026-10-02 · timeline-worker (timeline/p8-14-timeline-membership) · P8.14

- **Done:** PR https://github.com/AlexDumo/OpenMarch-timeline/pull/49 (commit `56a64681`, then `82cad6a7` after review). `src/db-functions/timelineMembership.ts`: `addMarchersToTimeline` (creates the timeline over a range when none has it; one-slot shapeless direct transition per marcher, destination at its position at the end, one layer above its highest layer there; refuses partial overlaps and ranges around one of the marcher's timelines), `removeMarchersFromTimeline` / `removeAssignmentFromTimeline` (delete the assignment and the own one-slot transition, never the timeline; the inspector's remove uses the latter). `createTimelinesInTransaction` refuses a second timeline over a range (`allowSharedRanges` for the scenario loader). New marchers join every stored timeline with their own transition to home (start order, skip partial overlaps), replacing P7.3's join; marcher delete removes own transitions and keeps timelines. Right-click **Add selected marchers** on page boxes, clips and dragged ranges (`TimelineRangeMenu.tsx`), with the target range passed in and no selection change.
- **Checks:** tsc pass; full `vitest run` (apps/desktop) 2,526 passed, 0 failed at `82cad6a7`; focused `test:history` on 9 files, 134 passed; eslint/prettier/cspell clean. Skipped by policy: full `test:history`, Playwright, `build:electron`, `test:timeline`.
- **Blockers:** none. The coordination edits for this package were applied by the lead with the project owner's OK: the worker's isolation blocked `coord.sh`.

### 2026-10-02 · lead session · P8.11, P8.13, P8.14, P9.10 merged

- **Done:** each PR had a reviewer and a tester sub-agent and a fix round where asked; the project owner ordered the merges. Merged #50 (P9.10, `76fd399c`), #48 (P8.13, `aff90ab1`), #49 (P8.14, `889cb433`) and #51 (P8.11, `fc149a70`, rebased onto the others). Lead decisions recorded in `ui.md` UI-9: deleting a flag is the inverse of **+**; adding over a range that contains one of the marcher's timelines is refused; ctrl+click is ignored on the timeline. Backlog additions: undoing a clip move dims everyone, ripple holds can give a marcher two transitions in one timeline, clearing dimming mid-tool, ctrl+click on every platform. Old dev-converted files aren't repaired on open (project owner).
- **Checks:** reviewers and testers re-ran each PR's focused checks; none ran on the combined result before merging. After merging, the base fails 19 unit tests and 1 `test:timeline` test (P8.14 tests vs P9.10 conversion), the same without #51.
- **Next:** the P8.14 worker's fix PR, then P8.15 and P8.12. Lesson: run the full unit suite on the combined branch before merging parallel PRs that meet in the same area.
- **Blockers:** none.

### 2026-10-02 · timeline-worker (timeline/p8-15-canvas-edits) · P8.15

- **Done:** pushed `wip` commit on `timeline/p8-15-canvas-edits`. Canvas moves edit the selection, not a page. `db-functions/timelineMoves.ts`: `moveMarchersInTimelineInTransaction` finds each marcher's row by timeline id and sets its slot destination (refuses E-ARGS: not in the timeline, more than one row, a row ending early, a higher layer winning at the end); `moveMarchersInTarget` is one undoable edit for `{kind: "home"}` or `{kind: "timeline", timelineId}`. `timeline/timelineCoordinateWrites.ts`: `planCanvasEdit` reads the selection store (stored timeline with the playhead on its end, or home/nothing at beat 0; otherwise `TimelineEditRefusedError` with a hint); `withTimelinePositions`/`timelineCoordinateRecords` take a beat; `transformMarchersInSelection` replaces `transformMarchersOnPage`; `canvasCoordinateWriter` plans when the drag ends. Wired in `Canvas.tsx` (shared with P8.12: only the writer effect and its mutation), `RegisteredActionsHandler.tsx` (`getSelectedMarcherPages` timeline branch, `updateCoordinates`) and `useMarcherPages.ts` (`useUpdateSelectedMarchers`, `moveMarchersInTargetMutationOptions`). `moveMarchersOnPage`, `copyPagePositions` and `TimelineMoveRequest` stay for "set to previous/next page", which P8.12 owns.
- **Checks:** `pnpm run test:focused` on `timelineMovesByTimeline.test.ts` (new), `timelineCoordinateWrites.test.ts`, `timelineToastPaths.test.ts`: 34 passed. `tsc` (apps/desktop): pass.
- **Next:** **+** button and delete-flag menu entry, remove Create Track from timeline mode, PR #52 test nits, then whole-suite checks.
- **Blockers:** none.
- **Resume from:** `apps/desktop/src/components/timeline/TimelineModePanel.tsx` (wire `useAddPageFlag`, `deletePageFlagsMutationOptions`; drop `onCreateTrack`/`selectedTarget`), `TimelineVariants.tsx` and `TimelineRangeMenu.tsx`. In a fresh work tree run `pnpm install`, then build each workspace package by name (`pnpm --filter @openmarch/core --filter @openmarch/metronome --filter @openmarch/musicxml-parser --filter @openmarch/ui --filter @openmarch/config build`).

### 2026-10-02 · timeline-worker (timeline/p8-12-no-selected-page) · P8.12

- **Done:** pushed `7473d3fe` (wip). `SelectedPageContext` now also gives `useCurrentPage()` (page mode: the selected page; timeline mode: `pageAtPlayhead`) and `usePageNavigation()` (`goToPage`: page mode selects; timeline mode moves the playhead to the flag and selects that page's timeline via the new `selectTimelinePage` in `timelineTransport.ts`). `useSelectedPage` warns once per component in development when read in timeline mode (`SELECTED_PAGE_IN_TIMELINE_MODE_WARNING`). Every reader under `src` moved off `useSelectedPage`. `useTimelinePageBridge` is deleted. The inspector's timeline section, the marcher editor's coordinates, the clock and the waveform read the playhead. Undo and redo in timeline mode move only the playhead. Previous and next paths run through the selected range and on to the next flag (`timelinePathRanges`, `pathsBetweenBeats`); nothing at home. Set to previous or next page edits the selected stored timeline's members and is refused with none selected (new `actions.batchEdit.noTimelineSelected`).
- **Shared files touched (P8.15):** `Canvas.tsx` and `canvasListeners.movement.ts` only swap where `selectedPage` comes from (`useCurrentPage`; the local name stays to avoid conflicts), and Canvas's path-render arguments. `canvasCoordinateWriter`, `updateCoordinates` and `useUpdateSelectedMarchersOnSelectedPage` still write by the page at the playhead. Neighbor-page writes go through `moveMarchersOnPage` at the selected timeline's end beat (`TODO(P8.15)`: by timeline id). `copyPagePositions` in `timelineCoordinateWrites.ts` is no longer used by the app; left for P8.15.
- **Proposed split:** this PR (P8.12a) is the reads, the bridge, the guard and the page-relative tools; appearance-by-time (P8.12b) follows as its own commit on this branch, or a second PR if this one is already large.
- **Checks so far:** `pnpm tsc --noEmit` pass; focused vitest on timeline, canvas, hooks, inspector and context tests pass; eslint on touched files 0 errors.
- **Blockers:** none.
- **Resume from:** on `timeline/p8-12-no-selected-page`: timeline-mode feature tests through `src/test/featureHarness.tsx` that spy `console.warn` for `SELECTED_PAGE_IN_TIMELINE_MODE_WARNING` while mounting the inspector, toolbar, timeline container, canvas listeners and action handler; then remove `buildTimelineTracks`/`clipsOfShape` (`TODO(P8.12)`, `timelineViewModel.ts`); then appearance-by-time from `coordinates-v2`.

### 2026-10-02 · timeline-worker (timeline/p8-15-canvas-edits) · P8.15

- **Done:** pushed `352b1b44`. **+** shows just after the free paused playhead (`TimelineModePanel` wires `useAddPageFlag`; `onAdded` → `selectRange` through `selectAddedPage`); page boxes carry their page id and the right-click menu has **Delete page flag** (`deletePageFlagsMutationOptions`). Create Track is gone from timeline mode (`useTimelineCommands` has no `createTrack`/`selectedTarget`; the db-level `createTrack` stays for its tests). PR #52 nits: `useMarchersTimelineMode.test.ts` asserts one assignment per stored timeline; `timelineMembershipAdversarial.test.ts` (a) asserts the inside-page loop ran. Shared test helper: `test/featureHarness.tsx` `selectPageAndMarchers` now also selects the page's box in timeline mode (it's the editing context) and waits for stored timelines. Nudges in `RegisteredActionsHandler` catch the already-toasted rejection. New `TimelineCanvasEditModes.test.tsx` (timeline mode) and `TimelinePageFlagControls.test.tsx`.
- **Checks:** focused runs of each touched test pass in both modes; `pnpm tsc --noEmit` pass; eslint 0 errors on touched files; prettier --check pass.
- **Next:** whole `test:focused`, then whole `test:timeline`, focused `test:history`, PR.
- **Blockers:** none.
- **Resume from:** `timeline/p8-15-canvas-edits`; run `pnpm run test:focused` then `pnpm run test:timeline` (apps/desktop, sequentially) and fix failures; then WORKER.md step 6.

### 2026-10-02 · timeline-worker (timeline/p8-15-canvas-edits) · P8.15

- **Done:** PR https://github.com/AlexDumo/OpenMarch-timeline/pull/53 (one commit, `92998165`). Canvas drag, nudges, alignment and the inspector's coordinate tools edit the UI-9 selection. `moveMarchersInTarget` covers homes, or the endings in a timeline found by id. `planCanvasEdit` refuses off the end (TEMPORARY), with no timeline away from beat 0, on an empty range, and (in the db function) for more than one row. **+** after the free paused playhead selects the new page. Page boxes have **Delete page flag**. Create Track is gone from timeline mode. PR #52 test nits done.
- **Shared files touched (minimal; P8.12 owns the rest):** `Canvas.tsx` (writer effect only), `RegisteredActionsHandler.tsx` (`getSelectedMarcherPages` timeline branch, `updateCoordinates`, nudge `.catch`), `useMarcherPages.ts`, `test/featureHarness.tsx` (`selectPageAndMarchers` selects the page's box in timeline mode). Left for P8.12: set to previous/next page (`moveMarchersOnPage`, `copyPagePositions`), `triggerAction`'s `selectedPage` guard, and the canvas init's `selectedPage`.
- **Checks:** `pnpm tsc --noEmit`: pass. Whole `pnpm run test:focused`: 2625 passed. Whole `pnpm run test:timeline`: 2579 passed. `pnpm run test:history` on 9 touched test files: 81 passed. eslint: 0 errors; prettier: pass. Not run (policy): the full `test:history` suite and Playwright. No exit-gate items ticked.
- **Next:** review and merge. Run the whole suite on the combined branch if P8.12 merges first.
- **Blockers:** none.

### 2026-10-02 · timeline-worker (timeline/p8-12-no-selected-page) · P8.12 (checkpoint)

- **Done:** pushed `4eeb237b`.
  - **Feature test:** `src/timeline/__test__/NoSelectedPageModes.test.tsx` mounts the inspector parts, toolbar, clock, page timeline, action handler, state initializer and the canvas and playback hooks. It drives navigation, set to previous page and undo, and checks that `useSelectedPage`'s warning never fires under `test:timeline`. A canary checks that the warning does fire.
  - **Dead code:** `buildTimelineTracks`, `clipsOfShape` and the per-marcher and per-shape track builders are removed. Their tests are ported to `buildTimelineClipTracks`.
  - **Appearance by time:** `src/services/appearance/` (`type.ts`, `db-to-timeline.ts`, `get-appearance-at-time.ts`) and `src/hooks/useAppearanceAnimation.ts`. Each page's tag and section stack (`_combineMarcherAppearances` with no `marcher_pages` overrides) is keyed by its flag time. It is sampled at the paused playhead or the live playback time and applied only when a marcher's stack changes. `Canvas.tsx` skips its per-page appearance query in timeline mode.
- **Split:** one PR, with commits kept per step (reads and tools, feature test, dead code, appearance), since appearance is about 300 lines.
- **Checks:** whole `test:focused` passed at `257a3943` (186 files, 2598 tests); `tsc` passes. Whole `test:focused` and `test:timeline` are now running at `4eeb237b`.
- **Blockers:** none.
- **Resume from:** read the scratchpad logs (`p812-focused2.log`, `p812-timeline.log`) or rerun both suites one after the other. Then run focused `test:history` on `timelinePageCopy`, `useHistory`, `useTimelinePlayback` and `NoSelectedPageModes`, squash the wip commits into one per step, and open the PR.

### 2026-10-02 · timeline-worker (timeline/p8-12-no-selected-page) · P8.12 (in review)

- **Done:** PR https://github.com/AlexDumo/OpenMarch-timeline/pull/54, one squashed commit `4feb856b`. It covers the reads, the bridge removal, the dev guard, the page-relative tools, appearance by time, the removed dead track builders and the timeline-mode feature test (see the two checkpoints above). After the full `test:timeline` run, the final commit also stubs `ResizeObserver` in `Canvas.test.tsx`: in timeline mode the canvas now starts from the page at the playhead, without a selected page.
- **Split:** kept as one PR; the appearance part is about 300 lines of the roughly 3,100 changed (about 1,300 of them deletions).
- **For P8.15:** see the first checkpoint for the shared files. `copyPagePositions` is unused by the app. The neighbor-page write is marked `TODO(P8.15)` (write by timeline id). Both PRs touch `Canvas.tsx`; run the whole suite on the combined branch before merging.
- **Notes:** between flags, appearance shows the last flag's page (as on `coordinates-v2`), while page data (notes, tag editor, `SelectedMarchersContext`'s hidden marchers) reads the page whose box holds the playhead. Hidden-marcher selection still uses the per-page appearance query.
- **Checks** (from `apps/desktop`):
  - `pnpm tsc --noEmit`: pass.
  - Whole `pnpm run test:focused` at `4eeb237b`: 187 files and 2604 tests passed.
  - Whole `pnpm run test:timeline` at `4eeb237b`: 187 files and 2558 tests passed, with 1 unhandled `ResizeObserver` error in `Canvas.test.tsx`. It is fixed in the final commit, and `Canvas.test.tsx` passes in both modes.
  - Focused `test:history` on 9 touched test files: 58 passed.
  - Pre-commit: pass.
  - Not run, per policy: the full `test:history` suite and Playwright e2e. Also not run: a manual check in the app.
- **Exit gate:** nothing ticked; this package covers none of the gate items.
- **Next:** review.
- **Blockers:** none.

### 2026-10-02 · timeline-worker (timeline/p8-15-canvas-edits) · P8.15 (review fixes)

- **Done:** PR #53 is now one commit, `18a3a10d` (force-pushed; the pre-commit hook ran).
  - **Swap:** when the selection refuses, swap now shows the same hint as the other tools (`RegisteredActionsHandler`).
  - **Delete page flag without Add:** the entry no longer depends on **Add selected marchers**; `onAdd` is optional in `TimelineRangeMenu` (`Timeline.tsx`).
  - **Lead decision, implemented:** deleting the flag of the selected page selects the merged box (the next page's box, which now runs from the deleted page's start to the next flag), as **+** selects the new page. Deleting the selected last page's flag selects the previous page's box (home for page 0), since that page becomes last. See `selectionAfterFlagDelete` in `TimelineModePanel.tsx`; it runs `selectRange` after `deletePageFlags` succeeds.
  - **Planning twice:** skipped, with a comment in `updateCoordinates`. The tools call `getSelectedMarcherPages` and the write synchronously in one action, or within the nudge mutation's own promise chain, so the selection can't change between the two plans.
  - **Tests (`timelineMovesByTimeline.test.ts`):**
    - every other slot of the shared converted transition keeps its destination;
    - new: the refusal for a row ending early;
    - new: an R-5/D-12 nested-timeline case (the nested move ends at the edited point, and the outer move resumes on the line from it to its unchanged destination).
  - **Tests (other files):** a swap refusal in `TimelineCanvasEditModes.test.tsx`; Delete without Add and `selectionAfterFlagDelete` cases in `TimelinePageFlagControls.test.tsx`.
- **Checks** (apps/desktop):
  - `pnpm tsc --noEmit`: pass.
  - eslint on touched files: 0 errors; the 3 warnings in `RegisteredActionsHandler.tsx` were already there.
  - `prettier --check src`: pass.
  - Whole `pnpm run test:focused`: 2631 passed.
  - Whole `pnpm run test:timeline`: 2585 passed. It ran after the focused suite, not alongside it.
  - `pnpm run test:history` on 6 touched test files: 55 passed.
  - Not run (policy): the full `test:history` suite and Playwright.
- **Next:** re-review and merge.
- **Blockers:** none.

### 2026-10-02 · lead session · P8.15 merged

- **Done:** PR #53 merged (`4429acfb`) after review, test and a fix round. The linear MVP's build packages (P8.11, P8.13, P8.14, P8.15, P9.10) are all merged. Lead decisions for UI-9: deleting the selected page's flag selects the merged page; deleting the selected last page's flag selects the previous page (home for page 0). P8.12 is paused for MVP testing (see handoff notes).
- **Checks:** reviewer and tester re-ran the PR's checks; whole `test:focused` and `test:timeline` passed on its final commit.
- **Next:** build and run `validation-plan.md` V1–V4 in the app.
- **Blockers:** none.

### 2026-10-02 · timeline-worker (timeline/p8-12-no-selected-page) · P8.12 (review fixes, paused)

- **Done:** pushed `ee2b4cb2` (wip) on PR #54. Paused by the project owner for MVP testing; status stays in-review.
  - **Item 2 (done):** `TimelineControls.tsx` gets its transport state from `useTransportAvailability`. In timeline mode, back and forward use `navigationTarget` from the playhead, and play uses `canPlay(selection, playhead, beats.length)`.
  - **Item 3 (done):** in timeline mode, `SelectedMarchersContext` takes hidden marchers from the appearance timeline at the playhead (`hiddenMarcherIdsAt` in `services/appearance/get-appearance-at-time.ts`). `useMarcherAppearanceTimelines` moved to `src/hooks/useMarcherAppearanceTimelines.ts`. The per-page appearance query runs in page mode only.
  - **Item 4 (done):** in timeline mode, while playing, `PageNotesSection` shows the notes of the page whose box holds the live position (`useLivePlaybackPage`, checked each frame and updated on change), which follows a loop. Paused, it shows the page at the playhead. Page mode is unchanged.
- **Not done:**
  - Item 5 (extend `NoSelectedPageModes.test.tsx`).
  - Item 1 (write by timeline id after #53, plus the tester's adversarial tests).
  - No new tests for items 2–4 yet.
- **Checks at `ee2b4cb2`:**
  - `pnpm tsc --noEmit`: pass.
  - `test:focused` on `src/context`, `src/components/timeline`, `src/components/inspector`, `src/services/appearance`, `NoSelectedPageModes` and `RegisteredActionsHandlerModes`: 295 passed.
  - `test:timeline` on the same paths, without `RegisteredActionsHandlerModes`: 288 passed.
  - Pre-commit: pass.
  - Not run: the whole suites and `test:history`.
- **Blockers:** none (item 1 waits on #53).
- **Resume from:** on `timeline/p8-12-no-selected-page` at `ee2b4cb2`, do these in order:
  1. **Tests for items 2–4:** `TimelineControls` disabled states in timeline mode; hidden marchers between flags follow the canvas's sampled appearance; the live-page notes while playing.
  2. **Item 5:** in `src/timeline/__test__/NoSelectedPageModes.test.tsx`, mount `SelectedMarchersContext` (already in the harness), `TagButtons`, `ShapeSelector` and `TimelineContainer` (needs the electron and `ResizeObserver` stubs; see `TimelineContainerMode.test.tsx`), and assert that set to previous page wrote (the positions at the timeline's end equal those at its start).
  3. **Item 1, after #53 merges:** rebase onto `timeline-try-2`. In `useMarcherPages.ts`, keep `useCurrentPage` and call #53's one-argument `useUpdateSelectedMarchers`. In `featureHarness.tsx`, keep `goToPage` and drop the unused `pageFlags` and `selectionOfPage` imports. Then switch `setMarchersToNeighborPage.ts`'s timeline write (`timelineEndPage`, `TODO(P8.15)`) to #53's `moveMarchersInTimelineInTransaction` or `moveMarchersInTarget`, and show its higher-layer refusal as a toast. Adopt the tester's `P812Adversarial.test.tsx` and `P812UndoAdversarial.test.tsx` from `/Users/openmarchdev/GitHub/OpenMarch/.claude/worktrees/agent-af5ffb1de086b0faa/apps/desktop/src/timeline/__test__/`, changing the mid-page undo assertion so the playhead stays put. If copying is refused, write equivalent tests.
  4. **Finish:** `tsc`; whole `test:focused`, then whole `test:timeline`; focused `test:history` on the touched files; push; log.

### 2026-10-02 · timeline-worker (timeline/p8-16-range-dim) · P8.16

- **Done:** pushed `6b414865` (wip) on `timeline/p8-16-range-dim`. `isMarcherDimmed` dims non-members only when the selected range resolves to a stored timeline, so `useDeselectDimmedMarchers` and the canvas dimming keep marchers selectable on a range with no stored timeline. Canvas moves there stay refused (`emptyTimeline`). Updated the store and selection tests, and added `RangeNotStoredModes.test.tsx` (drag keeps the selection, select on the range, Add then dims, + then add, refused moves write nothing).
- **Checks:** `tsc --noEmit`: pass. The new and changed test files pass under `test:timeline`, and fail on the old store.
- **Next:** the whole suites, then the PR.
- **Blockers:** none.
- **Resume from:** on `timeline/p8-16-range-dim`, run the whole `pnpm run test:focused`, then the whole `pnpm run test:timeline`, then focused `test:history` on the touched test files; open the PR.

### 2026-10-02 · timeline-worker (timeline/p8-16-range-dim) · P8.16 (in review)

- **Done:** PR https://github.com/AlexDumo/OpenMarch-timeline/pull/55, one commit `a445988e` on `timeline-try-2`.
  - `isMarcherDimmed` dims non-members only for a stored timeline. The canvas dimming, the hit and lasso skips and `useDeselectDimmedMarchers` all go through it.
  - A stored timeline with nobody in it still dims everyone.
  - Canvas moves on a range that isn't stored stay refused (`emptyTimeline`).
  - The Add disabled reason now mentions a range with no timeline yet.
  - Tests: the store and selection tests are updated, and `RangeNotStoredModes.test.tsx` is new.
- **Checks** (apps/desktop; the machine was heavily loaded, load average up to 125):
  - `tsc --noEmit`: pass. eslint, prettier and pre-commit: pass.
  - Whole `test:focused`: 2617 passed, 2 failed, plus 2 worker-start errors. The failures were load timeouts in `backup.test.ts` and `pageEraFreeze.test.ts`.
  - Whole `test:timeline`, run after the focused suite: 2582 passed, 2 failed, plus 1 worker-start error. The failures were timeouts in `convertOnOpen.test.ts` and `MarcherEditorModes.test.tsx`.
  - Every file that failed or didn't start passes when re-run alone (the PR lists them).
  - Focused `test:history` on the 3 touched test files: 23 passed.
  - Not run, per policy: the full `test:history` suite and Playwright. No manual V2 check either.
- **Exit gate:** nothing ticked; this package covers none of the gate items.
- **Next:** review.
- **Blockers:** none.

### 2026-10-03 · lead session · P8.16 and the pause loop merged

- **Done:** PR #55 (P8.16, `34a33b18`): a range with no stored timeline dims nobody, so drag-to-create and adding marchers right after **+** work. PR #56 (`c38c45ac`): fixes "Maximum update depth exceeded" on play, pause, play in timeline mode, found in MVP testing. The temporary page bridge read the stale play-start beat on pause and ping-ponged between two flags; it now ignores all of its own pending writes. Each PR had a reviewer and tester (combined for #55 under machine load).
- **Checks:** #55: whole suites had only load timeouts in untouched files, each passing alone; focused 34/34 in all modes. #56: reproduction test red without the fix, green with it; 27/27 focused in both modes.
- **Next:** continue MVP testing in the app; P8.12 stays paused (it deletes the bridge). Known: on every pause the bridge's selected page flickers to the previous page for one commit (fixed for good when P8.12 lands).
- **Blockers:** none.

### 2026-10-03 · lead session · UI-10 (decided)

- **Decided (project owner, 2026-10-03):** after the "Origin and Arrival" timeline UX research (https://claude.ai/code/artifact/20d65511-24e2-495c-985c-119afcb88299), UI-10 in `ui.md`. The editing context is the window from a start flag to the paused playhead; dragging marchers adds them to that window's timeline, with no Add step; arrivals off a flag create a timeline, not a page; Stop returns to the start flag and Pause freezes; the one-timeline-per-range rule (C-12) stays; timelines matching a page box get no clip. Lead defaults (marked in UI-10): the start flag follows navigation unless pinned, nothing is dimmed, Stop is Shift+Space.

### 2026-10-04 · lead session (timeline/p8-17-core-loop) · P8.17 (in review)

- **Done:** PR #73, one commit on `timeline-try-2`. Store window (`startBeat`, `startPinned`, `pageBoxes`, derived `selection`), range edits (`moveMarchersInRangeInTransaction`), start flag overlay, Stop, no loop, no dimming, clips off the page boxes. Tests rewritten for UI-10 and new range-move tests.
- **Evidence:** a recorded run on a converted 76-marcher show makes a mid-set arrival in 4 actions with no refusal; the UI-9 flow took 8 actions and two traps.
- **Checks:** `tsc` pass; changed test files pass under `test:focused` and `test:timeline`; focused `test:history` on `timelineMovesByTimeline.test.ts` 14 passed. Whole `test:focused` and `test:timeline` reported on the PR. Not run: full `test:history`, e2e (policy).
- **Blockers:** none.
- **Resume from:** review findings on PR #73, then merge.

# Timeline Validation: Linear Page-Creation MVP

- Status: active
- Owner: human (project owner signs off)
- Scope: validation only; not a replacement implementation phase

## Purpose

We are in a **Validation phase**: first prove that the timeline and page
creation interaction works in a small, understandable workflow. The overall
implementation may remain unchanged. This plan narrows what we validate now,
not what the model supports or what a release must eventually satisfy.

This plan doesn't change the [spec](spec.md), the [UI design](ui.md) or
implementation phase statuses; the workflow it checks is UI-9 in `ui.md`. Passing this MVP does not mark deferred checks as
passed, finish an implementation phase, or authorize removing the dev flag.
Existing safety and release gates, including Phase 9's packaged and real-show
checks, still apply before release.

## Validate now

- Timeline display, timeline selection, and page creation with **+** as one
  user workflow ([UI-9](ui.md), C-12).
- Page flags, page timelines, count ranges, and the timeline's response to a
  newly created page.
- Assigning marchers to a page timeline, setting their ending coordinates, and
  linear motion between flags.
- Undo, redo, and reopening only for this workflow.

**Ignore shapes.** Use individual marcher destinations, with no shape creation,
editing, assignment, or shape-dependent fixtures.

**Assume all pathways are linear.** Use straight-line motion only. Do not add
curves, arcs, waypoints, midsets, or follow-the-leader cases to this MVP.

The interaction under test is **timeline and page creation**, not timeline and
shape creation.

## Prerequisites

The checks need UI-9 built: P8.11 (selection and playhead), P8.13 (page
flags), P8.14 (timeline membership) and P8.15 (canvas edits) in
[phases/08-authoring-ui.md](phases/08-authoring-ui.md), plus P9.10 so a
converted fixture has one timeline per page. Until they are merged, don't
claim V1–V4; record nothing as `pass` against an earlier build.

## Small fixture

Use a disposable timeline-mode show, not a user's original file:

- Two marchers with distinct, known starting coordinates.
- An initial page and one timed page with a short, known count range.
- Distinct individual destinations that make straight-line movement visible.
- No shapes, layered overlaps, steals, or non-linear motion.

Record the starting page boundaries, coordinates, and count ranges in the
validation log. Reuse this fixture rather than building a broad fixture matrix.
Follow the UI's documented beat/view mapping; do not invent new page semantics
to make a check pass.

## MVP checks

Run these in order in the desktop app. Stop and record a failure before
expanding the scope.

### V1: Establish the baseline

- Click each page box in the ruler. Confirm it selects that page timeline, the
  playhead seeks to its end beat, and marchers not in it are dimmed.
- Seek to a beat off any flag. Confirm the canvas shows positions there and
  **+** appears just after the playhead; on a flag, it doesn't.
- Scrub or play through a move. Confirm straight-line interpolation between
  the known destinations, with no jumps or stale positions.

### V2: Create a page and set its positions

- Pause mid-move and click **+**. Confirm exactly one flag appears at the
  playhead, the ruler shows its two page boxes with the right count ranges,
  the new page (the box ending at the new flag) is selected with nobody
  dimmed (it has no stored timeline yet), and positions are unchanged at the new flag, between
  flags, and at the next flag. All without restarting or reopening the show.
- Select both marchers, right-click the new page box and choose **Add
  selected marchers**. Confirm both marchers are still selected, and motion
  is still unchanged (each marcher's destination starts at its
  position at the flag).
- Drag each marcher to a distinct point. Confirm linear motion to it, then
  the old move resuming linearly from it to its unchanged destination at the
  next flag.
- Create one more page. Confirm ordered, non-duplicated flags and correct
  ranges for both new pages; earlier pages and destinations remain unchanged.

### V3: Undo and redo

- Undo the second page creation, then the destination edits one at a time
  (each marcher returns to its straight path), then the assignment, then the
  first page creation.
- Confirm the flag disappears, and undoing the assignment removes the stored
  page timeline it created, with no orphaned selection or stale rendering.
- Redo. Confirm each edit returns exactly once and earlier pages remain
  unchanged.

### V4: Save and reopen

- Save the disposable show, close it, and reopen it.
- Repeat page box selection and flag/midpoint inspection for the created pages.
- Confirm flag order, ranges, assignments, destinations, and linear motion
  match the saved state without needing another edit to refresh the timeline.

## Evidence and async coordination

The validation log below is the source of truth for these checks. Implementation
package ownership and status remain in [phases/](phases/).

- Claim one check by appending an entry with its ID and your name before testing.
  Read existing entries first; do not duplicate another person's active check.
- Record the commit/build, fixture setup, exact steps, expected and actual
  results, and any screenshots or issue links.
- Use `claimed`, `pass`, `fail`, or `blocked`; unrecorded checks are not run.
  Append corrections or reruns rather than rewriting another worker's evidence.
- Fix an MVP blocker with the smallest coherent change and focused regression
  tests. Link its implementation package or PR from the log.
- Run checks required by [verification](../conventions/verification.md) for
  changed code. This plan does not waive code-level safety checks.
- Keep the [worker policy](WORKER.md#current-policy-temporary) on broad history
  and Playwright suites: use focused tests and report omitted suites explicitly.

Entry template:

```markdown
### <date> · <owner> · V1

- Status: claimed
- Build/commit:
- Fixture:
- Steps:
- Expected:
- Actual:
- Evidence/check commands:
- Next/blocker:
```

## MVP exit and later validation

The MVP is ready for project-owner review when V1–V4 have recorded passing
evidence on the same current build and no unresolved blocker in this workflow.
Only the project owner gives the manual acceptance verdict. No app checks have
been run merely by creating this plan.

After that verdict, the project owner chooses the next bounded validation slice:

1. Broader page/timeline editing and selection edge cases.
2. Shapes and their creation/editing interaction with timelines.
3. Non-linear motion, assignments, layers, steals, and diagnostics.
4. Conversion corpus, exports, performance, and remaining release gates.

Known gap, deferred (project owner, 2026-10-01): the fixture has no layers or
steals, but V2's **Add selected marchers** inside a move creates one (UI-9
Layers). Layered and stolen cases beyond that flow belong to slice 3.

These are deferred, not removed or presumed correct. Keep their existing
implementation packages and checks; do not expand the current MVP to cover them
without an explicit scope decision.

## Validation log

### 2026-10-01 · Claude Code session (lead) · V1

- Status: fail
- Build/commit: `e12c5e1e` (`timeline-try-2`), `build:electron` from that
  checkout; flag `OPENMARCH_CONVERT_ON_OPEN=1`.
- Fixture: blank file; in page mode, two marchers OT1 and OT2, page 0 and
  page 1 (16 counts, beats 1–16, 120 bpm); `defaultNewPageCounts` 8.
  Coordinates set with `sqlite3`: page 0 OT1 (400,300), OT2 (400,500);
  page 1 OT1 (560,300), OT2 (480,420). Converted on open (83 ms, backup
  written): homes (400,300) and (400,500); one timeline "Converted from
  pages" `[0,17)` holding one `direct` transition `[1,17)`, both marchers at
  layer 0 with those destinations.
- Steps: agent-driven Playwright run of the built app (not a manual pass):
  selected pages by ruler click, transport and the E/Q keys; read the
  canvas (`window.canvas`), inspector and playhead; played page 0 → 1,
  sampling positions and the playhead on every frame.
- Expected: V1 as written before the UI-9 rewrite.
- Actual:
  - Every selection path showed the same page and positions: page 0 at the
    homes, page 1 at the destinations.
  - Playback: 1,201 samples. Both marchers stayed exactly on their straight
    lines (0 px off) with equal progress. Progress was linear in time (8.0 s,
    max residual 0.0008) and monotone, with no frame jump above 0.0015.
  - Fail: after a ruler click, the transport and keys changed the page, but
    the ruler kept highlighting the old page.
  - Observed: the last page's paused playhead is drawn one beat before the
    end of the show (clamped to `beatCount − 1`; label m4.4).
- Evidence/check commands: scripts and screenshots in the session scratchpad;
  fix `followSelectedPage` (`useTimelinePlayback.ts`, used by
  `TimelineModePanel`), with tests in `useTimelinePlayback.test.tsx`
  (`tsc --noEmit` clean, 14 passed). Not re-run in the app.
- Next/blocker: superseded by the UI-9 flow (page selection is replaced by
  timeline selection). V1–V4 wait for UI-9 and P9.10 to be implemented; then
  re-run V1 on that build.

<!-- cspell:disable -->

# 09: Isolating a move (prototype)

Status: prototype, merged into `timeline-try-2` with P8.17 (UI-10). Nothing here
changes `spec.md` or `ui.md` yet; recording the decisions there is still to do.

## Why

The owner (2026-10-04): the timeline view doesn't show enough. Two needs:

1. Edit the destinations of marchers who were stolen out of a move. Their
   destinations belong to the move's plan, not to where they really end up, so in
   the normal view there is nothing to grab.
2. Work on one group's paths without everything else getting in the way.

Both come down to one thing: **pick a block, see its whole plan, keep everything
else out of the way.** A block is a stored timeline; its members are every marcher
with a row in it, including those another move steals partway.

The case for making this a visible state rather than a selection side effect:
06 §5.2's "the window decides" rule already changes what a canvas drag edits
depending on whether the window equals a move's range. That is a mode with no
indicator. Isolation makes it visible.

## What the prototype does

- **Enter:** double-click a page box or a clip on the strip. A range with no stored
  timeline shows an info toast instead.
- **Inside:**
  - the window is the timeline's range, and the playhead stays inside it;
  - Play loops the range;
  - marchers outside the timeline are dimmed and can't be selected or hit (UI-9's
    dimming, unused under UI-10, reused);
  - the page-pair paths are hidden, and the canvas draws the isolated move's scene
    (07 phase G0, read-only):
    - the members' real paths, solid, in the strip's color;
    - for members another move took out partway, the move's plan for the rest of
      the range as gray dashes, ending in a gray dot where the move would have
      ended them;
    - the move that took them, in its own color, over its whole span;
    - start rings and destination dots;
  - a bar over the field names the move and its member count, explains the gray
    dashes, and offers **Done (Esc)**.
- **Leave:** Esc (unless a text field or the line or lasso tool has it), **Done**, a
  click on a page box, home, or a dragged range. Leaving restores the start flag and
  playhead from before. The isolation also ends if the timeline is deleted (undo
  included), and follows it if its range moves.
- **Write path:** a range that starts inside a move and runs past its end is now an
  exit (06 §2 D) and is allowed. A range that runs into a later move partway is
  still refused, naming the join, until live links exist (WP-O3).

Code: `TimelineSelectionStore` (`isolation`, `isolate`, `exitIsolation`,
`isMarcherDimmed`), `timelineFocusScene.ts` (pure scene builder, throwaway plan
resolver), `TimelineFocusLayer.ts` (one fabric object), `useTimelineFocusRender.ts`,
`TimelineIsolationBar.tsx`, `playbackStep` (loop).

## Not done

- Ghost dots aren't draggable yet (07 G2). That is the next step for need 1, and it
  needs no new storage: a ghost end is the move's existing slot destination.
- Joiners' approach ghosts need stored ghost starts (WP-O3).
- Step-size warnings are hidden while isolated. They should show on performed and
  context paths (07 §2).
- No hover preview, notches or count ticks.

## Findings from the first capture (2026-10-04)

- Isolating a small move (the 4-count steal) reads well: 7 paths and everyone else faded.
- Isolating a page-wide move in a converted show isolates every marcher, so it draws
  76 paths and fades nobody. Isolation helps least where a page is one big move.
  Options: fade the members who hold still; or show only the selected members' paths
  when some are selected.
- While the loop is on the range's first beat, the playhead sits on the start flag, so
  UI-10 falls back to the page box ending there, and the strip briefly highlights the
  previous page.

## The plan dot is the marcher (owner, 2026-10-04)

A first version had separate gray handles for ghost ends, but only one could be dragged at a time and no marcher tool worked on them. The owner chose instead: **inside isolation, while paused, each member is drawn, selected and edited where the isolated move's plan puts it.**

- A stolen member stands at its planned spot, as if it still did the whole move. Where it really goes becomes the overlay: the stealing move's path in its color, with a dot where that path ends.
- Every marcher tool works unchanged on members: canvas drag, box and lasso, align and distribute, nudges, rounding, and the inspector's coordinates. They read positions through `editingPositionAt` and write through `planCanvasEdit`, which in isolation targets the isolated timeline's own endings (`{kind: "timeline", ghosts: true}`), stolen members included. One gesture is one undo step.
- **Edits always target the move's end** (owner, 2026-10-04): an edit made with the playhead mid-move first sends the playhead to the end (`snapIsolatedPlayheadToEnd`). Scrubbing inside isolation is for watching.
- Playback shows the real show, not the plan. The plan view applies only while paused, when the static render draws (`applyIsolationPlan`).
- An edit re-derives the ghost path, where the member leaves (R-4) and the stealing move's start. The member's real end doesn't move.

Code: `timelineIsolationPlan.ts` (plan store, `editingPositionAt`, `applyIsolationPlan`), `planCanvasEdit` and `snapIsolatedPlayheadToEnd` in `timelineCoordinateWrites.ts`, and `ghosts` on `moveMarchersInTimelineInTransaction`.

V-19 in [VALIDATION.md](VALIDATION.md) tracks the paused-plan versus playing-real split.

## Reviews (2026-10-04)

A code review and a designer-UX review ran on the first commit.

**Fixed after review:**

- **The playhead on the first beat edited the previous move.** After Stop, a seek to the start or the loop's wrap, P could equal S. UI-10's window then fell back to the previous page box, so a drag wrote the wrong move. Inside isolation P now stays in `(start, end]`.
- **Esc was swallowed by the registered Escape action.** It now listens in the capture phase. The first Esc deselects as usual; an Esc with nothing selected leaves.
- **The restore point was the double-clicked range.** The panel now records the window on the first mousedown of the click sequence.
- **S drifted when page boxes changed, and S and P stayed behind when the isolated clip moved with P mid-range.** Both now rebuild the isolated window.
- **Scene: a member with two rows lost its first path; a member another move held at the start had no ghost; context paths could repeat.** All three are fixed, and a catch-up ghost is drawn only where the plan doesn't catch up too.
- **`selectNothing` kept isolation, and the join refusal suggested a range that is also refused.** Both fixed.
- **UX:**
  - the bar names moves in pages and counts ("Page 2, counts 5–8");
  - with marchers selected, the others' paths drop to 25%;
  - members who hold still are a quiet ring with no path;
  - the bar no longer wraps.

**Open, for the owner:**

- **Ghost prominence (V-8).** The UX review says gray dashes on a gray grid are the faintest mark on the field, though ghosts are why the mode exists. It suggests the move's color, dashed, with hollow ends, as the drag target.
- **Mid-range edits.** With P scrubbed mid-move, a drag follows UI-10 and makes a sub-range move. The UX review suggests that inside isolation, edits always target the move's end and scrubbing is for viewing only.
- **Draggable ghost ends (need 1).** Selecting B10–B16 inside isolation selects their real dots, which belong to the move that stole them; ghosts need their own hit-testing and selection (07 G2).
- **Not done yet:**
  - the inspector doesn't name the isolated move;
  - nothing on a page box hints at double-click;
  - faded marchers turn pink, which can clash with a move's color (UI-9 dimming);
  - the selection box stays put while playing;
  - step-size warnings are hidden while isolated;
  - follow-the-leader `inherit` order falls back in the plan.

## Validation rows

V-14 to V-19 are in [VALIDATION.md](VALIDATION.md).

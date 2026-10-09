<!-- cspell:disable -->

# Dragging timeline edges: moving a page flag and resizing a move

Status: built on `timeline/timeline-edges` (2026-10-08). It combines two features the owner asked
for the same day, and then asked to ship as one:

- **Move a page flag** (was #110): [../move-page-flag/README.md](../move-page-flag/README.md),
  ui.md UI-16, V-60 to V-68.
- **Resize a move** (was #109): [../resize-move/README.md](../resize-move/README.md), edge cases
  E1–E22, V-120 to V-128.

Both drag the edge of a timeline. ui.md UI-15 holds the rules they share. This note records how
the two were reconciled, so the next edge gesture follows the same rules.

## Shared rules

| Rule                     | Decision                                                                                                                                                                                                                                                                                                                                                                                                                                                       | Where                                                      |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| What stretches           | What you drag, and anything with an edge on it, takes the new counts. What you don't touch keeps its counts. A flag move re-times the two page moves and any move with an edge on the flag. A breakaway the flag merely crosses stays on its counts, because it's anchored to the music. A resize re-times the dragged move. Sets keep their coordinates (D-5)                                                                                                 | V-61, V-62, V-128; E18                                     |
| Snapping                 | Page lines and the playhead pull an edge from 12 px, downbeats from 6 px, else it lands on a whole beat. Alt keeps only the whole beat. A dragged flag skips page lines: it can't land on another flag, so they only pulled it toward walls (review: at Fit zoom, counts beside a neighbor were unreachable). Downbeats are dense, so at 12 px they'd swallow single beats when zoomed out. The whole-move drag is a different gesture and keeps its own 24 px | `timelineEdgeSnap.ts` `snapEdgeBeat`; V-64 (V-125 merged)  |
| Beats an edge can't take | It never lands on one. With the pointer over it, the edge waits on the nearest allowed beat back toward where it started and says why. A move's clip shows a dashed red outline. Release commits where it waits. The resize first refused on release; that was dropped because the gesture then silently did nothing                                                                                                                                           | `stepOffForbidden`; V-63, V-127                            |
| Walls                    | An edge stops at whatever would collide with it or cut it short, and the readout names it                                                                                                                                                                                                                                                                                                                                                                      | flags: `pageFlagMoveLimits`; moves: `timelineResizeLimits` |
| Readouts                 | "Page 3: 8 → 11 counts" / "Move 3: 4 → 6 counts", then the reason                                                                                                                                                                                                                                                                                                                                                                                              | grips' readout; `clipResizeTagText`                        |
| Commit and cancel        | One undoable edit on release. Esc, a lost pointer, or a drag brought back writes nothing. Esc during a clip gesture never also leaves isolation (`clipGestureActive`). Flag grips are hidden in isolation                                                                                                                                                                                                                                                      | both gestures                                              |
| Where grabbed            | A flag by its page line through the page-box row (owner), nowhere below it. A move by handles inside its clip's ends. #106's ⋯ button keeps clear of the end handle                                                                                                                                                                                                                                                                                            | UI-16, V-65; V-120                                         |

## What stays separate, and why

- **The limits planners.**
  - Flags walk every beat between the neighbouring flags through the ripple's own planner
    (`planTimelineRipple`), because a flag move re-times rows in several timelines at once.
  - A resize touches one timeline, and its limits follow from that timeline's rows in closed form
    (`timelineResizeLimits`), checked against the R-E1 procedure's rejections by tests and a
    review.
  - Both produce the same shape of answer: walls with reasons, plus beats the edge can't land on.
    Merging the two planners is possible, but would walk the R-E1 procedure for every beat of a
    resize, for no change in behaviour.
- **The follow actions.**
  - `followPageFlagMove` moves everything sitting on the flag's beat: page boxes, the playhead,
    the start flag, and the edges of stored timelines.
  - `followTimelineRange` moves only what belongs to the resized move, when that move is the
    selection or is isolated. A resized move's old end can share its beat with an unrelated
    playhead, which must stay put.
  - The shared part is small. Each action documents its rule.

## Owner decisions and open questions (2026-10-08)

- **V-127 (Q1), decided: don't merge.** An edge can't make a move cover exactly another stored
  move's or page's counts; it waits a count short and says why.
- **V-121 (Q2), decided: stop.** Growing into another move on the same marchers stops at its edge
  and never takes over the overlap.
- **V-62, open.** The owner said "maybe": moves warping with the pages when a flag moves has many
  edge cases. Their idea is a multi-select that moves several things at once, where the moved moves
  keep their length. That's unlike a flag move, which changes the pages' lengths by nature. Not
  built; needs its own design pass.
- **V-65, decided: the page line in the page-box row is the grip,** its whole height, and nowhere
  below. The lower-half grip was hard to find; a grip down the whole line was tried and not wanted.
  The playhead and start flag on a flag are dragged from the measure row.
- **V-67, decided: keep the arrow keys,** one undo step per press (for keyboard users).

## Not built (both gestures)

- Keyboard resizing of a move's edges (Alt+arrows on a focused handle, like the grips).
- Live preview of moves attached to a dragged flag.
- Edge scrolling while dragging.
- A ripple mode that pushes later material.

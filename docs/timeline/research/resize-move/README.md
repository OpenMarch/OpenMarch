<!-- cspell:disable -->

# Resizing a move: drag its start and its end

Status: built (2026-10-08), now shipped with moving a page flag on `timeline/timeline-edges`; the rules the two share (snapping, beats an edge can't take, readouts) are in [../timeline-edges/README.md](../timeline-edges/README.md) and ui.md UI-15, and win over this note where they differ. The feel-based defaults
below are _lead defaults_, logged as V-120 to V-128 (V-121 and V-127 are also owner questions) in
[ownership/VALIDATION.md](../ownership/VALIDATION.md). Open owner questions are in §6.

Owner's words (2026-10-08): "I should be able to move the start and end of a timeline/track,
i.e. changing its length. I can move the starting point of the move, but it always keeps the
same length. This also may have a lot of edge case implications."

## 1. Why the length is fixed today

A clip is one stored timeline (UI-8). The whole-move drag keeps the length in three places:

1. `TimelineTrackClip` (`components/timeline/TimelinePrimitives.tsx`) computes only an offset
   (`snapRangeOffset`) and commits `start + offset, end + offset`.
2. `Timeline.tsx` `commitRange` turns any change back into a shift of the stored spec range.
3. `useTimelineCommands.commitTimelineRange` keeps only the delta and calls `shiftTimeline`.

The database layer can already change the two edges independently:
`setTimelineRangeInTransaction` (`db-functions/timelineTransitionsInTransaction.ts`) is the spec's
R-E1 procedure. It moves the timeline, every transition it owns (C-11) and every assignment
anchored at a moved edge, in an order that undo can replay. No app code calls it yet.

## 2. What a resize means for the drill

Destinations are absolute slot points (D-5), and progress runs to the transition's end (R-5).
So resizing **stretches**, it never trims:

- **End edge:** the marchers still arrive at the move's set, earlier or later. The path is
  re-timed over the new counts, so the step size changes. This is Pyware's Lengthen/Shorten
  Transition, and the drill convention "N counts to set X".
- **Start edge:** the marchers step off earlier or later, from wherever they are at the new start
  (R-4). Before a later start they do what the rows underneath say: a page's move shows through,
  or they hold.
- Counts a shrink gives up become holds, or let the rows underneath show through. Nothing is
  deleted: undo, or dragging the edge back, restores the move exactly.

DAW-style trimming, where marchers stop partway along their path, has no meaning in drill and
isn't offered. A "stop partway" is a split, which is a different command (backlog).

Prior art (subagent research, sources in the PR):

- Pyware's Count Track has draggable start and end anchors.
- Premiere and Resolve stop a selection trim at the neighbouring clip. Ableton overwrites the
  covered part instead.
- Every DAW snaps by default and has one modifier that turns snapping off.
- Edge hit zones are 4–8 px, and they shrink or vanish on very short clips.

## 3. Gesture

- **Handles.** Each clip has a start handle and an end handle inside its two ends, with
  `cursor: ew-resize`. Each handle is `min(6 px, ¼ of the clip's width)` wide. A clip narrower
  than 8 px has no handles; zoom in to resize it. The body keeps at least half the clip, so a
  1-count clip at the default zoom (16 px) keeps an 8 px body to grab or click
  (_lead default_, V-120). Compact mode uses the same rule over the 12 px hit row.
- **Snapping.** The dragged edge snaps with `snapBoundary`: to a page line within 12 px,
  otherwise to the nearest whole beat. Alt turns page snapping off, and the edge still lands on
  whole beats. The modifiers held at release decide the result. 12 px is half the clip move's
  24 px. The first in-app run used 24 px: at the default 16 px per beat, an edge one count from a
  flag snapped back onto it, so a 1-count change next to a flag needed Alt (_lead default_, V-125).
- **Drag tag.** While dragging, a tag over the clip reads `12 → 16 counts`, and adds why when
  the edge is held back ("stops at Move 4", "1 count minimum").
- **Commit.** Release commits once, as one undoable edit (`resizeTimeline`, one
  `transactionWithHistory` group). A press without a 4 px move is a click and selects as before.
  A drag released where it started, or cancelled with **Esc** (also added to the whole-move
  drag), commits nothing and doesn't select.
- **Selection follows.** If the clip's range was the selection, or the isolated move, the window
  follows the new range: start flag on the new start, playhead on the new end (a playhead inside
  an isolated move stays where it was, clamped into the move) (`followTimelineRange`, the
  generalisation of `followTimelineShift`). Undo restores the move but not the window, as for
  the whole-move drag today (undo moves only the playhead, P8.12).
- **Flags over the clip rows.** On the base branch the start flag's and the playhead's hit areas
  run the full timeline height and cover a selected clip's edges. This branch takes PR #106's
  UI-14 change verbatim (V-47 there): over the clip rows they are drawn but not grabbed.

## 4. Edge cases

M is the move being resized, from `[s, e)` to `[s′, e′)`. "Shared marchers" are marchers
with a row in M.

| #   | Case                                                                                                  | Behaviour (default)                                                                                                                                                                                                                                                    | Why                                                                                                                  |
| --- | ----------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| E1  | Shrink to zero                                                                                        | The edge stops 1 count from the other edge. The tag says "1 count minimum".                                                                                                                                                                                            | A move must have positive length (I-A6). Same minimum as the start flag                                              |
| E2  | Before beat 0 or past the show's last beat                                                            | The edge clamps to the show                                                                                                                                                                                                                                            | As the whole-move drag                                                                                               |
| E3  | Grow into another move on shared marchers at the **same or a higher layer** (another clip, typically) | The edge **stops at that move's edge**; the tag names it ("stops at Move 4"). Nothing is overwritten or truncated (_lead default_, V-121)                                                                                                                              | Same layer is E-A3 anyway. Higher layer: the other move would silently cut M short (owner question 3a in edit-moves) |
| E4  | Grow over moves at a **lower layer** (the page moves under a breakaway clip)                          | Allowed. M overrides them for its whole range, and their rows stay stored underneath (V-20). If the end lands partway into one, that move catches up from M's set (R-5, V-21). The tag adds "through Page 2" / "ends inside Page 3 (catch-up)" (_lead default_, V-122) | Same as a window crossing page flags; non-destructive; undo or a shrink restores the pages                           |
| E5  | Grow start under a move at a higher or same layer that ends at or before `s`                          | Blocked at that move's end, as E3                                                                                                                                                                                                                                      | Under a higher layer the extra counts would change nothing visible: a no-op disguised as an edit                     |
| E6  | Moves that already overlap M (exits stolen out of M, or the pages M overrides)                        | Not limits. An exit stays an exit. If M's end shrinks inside it, the exit simply starts from M's set instead of partway                                                                                                                                                | R-2 decides; nothing is stored differently                                                                           |
| E7  | Rows inside M that don't touch its edges (a marcher joining late or leaving early, from older data)   | The edges can't cross them: the start edge can't pass their start, and the end edge can't pass their end. The tag says "a marcher joins at count N"                                                                                                                    | R-E1 leaves unanchored rows where they are, and would reject stranding one (E-A1)                                    |
| E8  | The result is exactly another stored timeline's range (often a page box, since edges snap to flags)   | **Refused** for now: the tag says "Page 2 already covers these counts" and release commits nothing (_lead default_, **owner question Q1**)                                                                                                                             | C-12: one timeline per range. Merging would need M's marchers out of that page, which deletes their hidden page sets |
| E9  | The result is exactly a page box with no stored timeline                                              | Allowed. The move becomes that page's timeline, so its clip folds into the page box. The tag warns "becomes Page 2" (_lead default_, V-123)                                                                                                                            | C-12 says the page box stands for the timeline over its range                                                        |
| E10 | Which end anchors the coordinates                                                                     | The set stays at the end, and the path re-times (§2). Moving the start changes where the path starts, because the marchers start from wherever they are at `s′`                                                                                                        | D-5, R-4, R-5. No coordinates are written                                                                            |
| E11 | Moves with several groups (several transitions)                                                       | All of them resize together                                                                                                                                                                                                                                            | C-11: every transition spans its timeline                                                                            |
| E12 | Arcs and follow-the-leader paths                                                                      | Re-timed like straight paths. The bulge and waypoints are beat-free                                                                                                                                                                                                    | Path params hold no beats                                                                                            |
| E13 | Undo                                                                                                  | One step restores both edges and every anchored row                                                                                                                                                                                                                    | R-E1 is undo-safe (spec 6.1)                                                                                         |
| E14 | Esc during the drag, or dragging back to the start                                                    | Cancels with no edit and no selection change                                                                                                                                                                                                                           | UI-12's drag-back rule                                                                                               |
| E15 | Isolation (UI-14 Edit move, double-click)                                                             | Resizing the isolated move works. Isolation, the loop and the clamp follow the new range, and the playhead stays where it was if still inside                                                                                                                          | `followTimelineRange`                                                                                                |
| E16 | Start flag and playhead when M is selected                                                            | The start flag moves to `s′` (pinned unless it would follow there anyway). The playhead moves to `e′`, so canvas edits still edit M's set. If M isn't selected, neither moves (_lead default_, V-124)                                                                  | Same as a whole-move drag (UI-12)                                                                                    |
| E17 | Playing                                                                                               | Resize works while playing, like the whole-move drag. The window follows without restarting the audio                                                                                                                                                                  | `keepCursorWhilePlaying`                                                                                             |
| E18 | An edge landing on a page flag                                                                        | The edge then tracks that flag when a page is moved or retimed later (`timelineRipple`)                                                                                                                                                                                | Existing ripple rule. Session 1 (move a page flag) depends on it                                                     |
| E19 | Short clips (1–2 counts), zoomed out                                                                  | See §3. Below 8 px there are no handles. The click and the whole-move drag still work                                                                                                                                                                                  | The body must stay clickable                                                                                         |
| E20 | Page boxes                                                                                            | Not resized here. A page's range is its flags: moving a flag is session 1's feature                                                                                                                                                                                    | C-12                                                                                                                 |
| E21 | Several selected clips                                                                                | Not supported: one clip at a time (only one timeline can be selected)                                                                                                                                                                                                  | Selection holds one range                                                                                            |
| E22 | Keyboard resizing                                                                                     | Not in this change. With PR #106 a focused clip owns the arrow keys, so a later change puts Alt+arrow resizing on the handles                                                                                                                                          | Scope; see §5                                                                                                        |

The limits (E1–E3, E5, E7) are worked out in the database before the drag shows them
(`readTimelineResizeLimits`), and checked again inside the edit (`resizeTimelineInTransaction`),
so a stale limit can't write a bad range: it refuses with a toast instead.

## 5. Merging with PR #106 (edit-moves)

- `TimelineTrackClip` is the shared hotspot: #106 reindents it and returns a fragment with the
  ⋯ menu button as a sibling. Here, the resize logic lives in a new file
  (`TimelineClipResize.tsx`: the `useClipEdgeResize` hook and the handle spans). The clip gains
  one hook call, a preview-aware `left`/`width`, and two handle spans inside the button.
- #106's ⋯ button sits `right-2` on a selected clip (z-45), over the end handle's inner 4 px.
  When merging, move the ⋯ inward by the handle width (`right: handle + 2`), or the end handle
  of a selected clip is only 2 px wide.
- #106's clip `onKeyDown` swallows arrows. Keyboard resizing (E22) belongs on the handles.
- VALIDATION.md: #106 re-pads the whole table, so expect a textual conflict. The rows here are
  appended at V-120 to V-128 to avoid number clashes (#106 ends at V-55, and the tempo branches
  at V-107).

## 6. Owner questions

- **Q1 (E8):** when a resized move would cover exactly a page's counts (or another move's), should
  it refuse (built), or merge into that page's timeline? Merging takes the move's marchers out of
  the page's own move for them, which deletes those hidden page sets. Recommendation: refuse
  for now. Revisit with links (WP-O3/O4).
- **Q2 (E3, ties to edit-moves 3a):** growing into another move on the same marchers stops at
  its edge (built). Should it instead take over (steal) the overlap? Recommendation: stop. It
  never silently cuts a move short.

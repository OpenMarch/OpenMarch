<!-- cspell:disable -->

# Pathways: UX sheet (draft 3)

Status: draft 3, 2026-11-03. Draft 2 ([ux-sheet-2.md](ux-sheet-2.md)) was tested with four simulated
users ([proto-round-2.md](proto-round-2.md)); this draft applies its findings and the owner's calls
(register T-3, T-4, P-1): editing a turn moves the end shape, the pivot stays put, ↻ | ↺, Follow's
bend separate from its count, collisions along paths, paths as objects you open to edit (no
teaching output, M-1 withdrawn). Draft 1 is
[ux-sheet-1.md](ux-sheet-1.md). Every control the feature adds, with a budget. The model behind it
is [draft-model.md](draft-model.md); decisions are in the [register](README.md). Rules from the
taste doc apply: every feature is a named command (palette, shortcut, touch); mouse users can
find everything without shortcuts; desktop first, touch reaches the same actions.

## The budget

**One tool, no new panels, no nested menus.** Everything else is direct manipulation on things
already on screen (dots, the move's clip, the Move card), or a control that appears only when it
applies.

| Kind                                      | Added                                                                                                                                                                                                    | Where                                                                                                                                |
| ----------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ | --------- |
| Tools                                     | 1: **Path pen**                                                                                                                                                                                          | Toolbar, beside the Shape tool                                                                                                       |
| Always-visible controls                   | 1: **Steps per count** (`1 · 2 · ½ · 3 in 2 · Other`)                                                                                                                                                    | Move card                                                                                                                            |
| Options on an existing control            | 3: **Drawn**, **Follow** and **Turn**                                                                                                                                                                    | Move card's path choice (today Straight / Arc). It applies to the selected marchers and shows **Mixed** when they differ (finding 6) |
| Controls that appear only when they apply | 4: **Re-fit** (route no longer fits its ends), **Own routes · Rejoin** (some members broke off), **Point row** (a route point is selected: `Count [8] · Corner / Smooth`), **Turn row** (Turn chosen: `↻ | ↺ [270°] · Reset`)                                                                                                                   | Move card |
| Right-click / long-press items            | 4 on a route point: Pin to count…, Smooth / Corner, Delete point, Remove pin                                                                                                                             | Point menu                                                                                                                           |
| New field marks                           | points (square = corner, circle = smooth), pins (diamond + count), the leader handle labelled "Leader", the turn's pivot ✛ and angle arc                                                                 | Field                                                                                                                                |
| New clip marks                            | pin ticks (selection only), hatched lead-in for a rejoin, "32 steps" when the rate isn't 1, "Turn ↻ 270°", amber "Big steps"                                                                             | Timeline                                                                                                                             |
| Tooltips                                  | The ring on a formation member: "Follows the group path" or "Own path"                                                                                                                                   | Field                                                                                                                                |
| Chip text                                 | The pen's chip: "Drawing for 16 marchers · click for corners, drag for curves · Enter to finish"                                                                                                         | Above the field, while the pen is active                                                                                             |

Nothing the model computes (bounds, rejoin aim, lanes, fractions) has a setting.

## The gestures

### Draw a route (J-1, J-2, J-8)

1. Select marchers. Pick the **Path pen** (toolbar, or its shortcut; key to choose after checking
   conflicts). Choosing **Drawn** in the path choice picks the pen too, and the chip says why.
   The chip names who the pen draws for ("Drawing for 16 marchers"). Clicking marchers while
   drawing places points; it **never** changes who the pen draws for (finding 4).
2. Click to place corners, press-and-drag to place smooth points, as in Figma's pen. The chip says
   so: "click for corners · drag for curves" (finding 5). The route
   always starts at the selection and ends at its end spots; the designer only places the points
   in between.
3. **Enter** (or clicking the end spot, or the ✓ on touch) finishes. **Backspace** removes the
   last point while drawing; **Escape** cancels (O-19).
4. One marcher selected: its own route. Several: one **formation** route drawn as a band that
   slides along the path, keeping its orientation (G-1). A group that should wheel round a curve
   uses Turn.
5. A stroke that replaces marchers' own routes says so: "Replaced 2 own paths · Undo" (finding 4).

The Move card's path choice switches to **Drawn**. Choosing **Straight** again removes the route
(one undo step).

> **Superseded (owner, 2026-11-03):** paths are edited on the field with a floating editor beside
> the path, not on the Move card; **Remove path** removes one, and the Move card's Straight and Arc
> are refused on a move with a path (implementation plan, "Where a path is edited"; spec AP-R2).

### Edit a route

- Drag a point to move it. Double-click a point to switch corner ↔ smooth. Click on the line to
  add a point. Select a point and Delete to remove it.
- A selected point shows the **point row** on the Move card: `Point · Count [8] · Corner / Smooth`.
  Typing a count pins it; clearing the count unpins it (finding 8). No menu needed; the point
  menu keeps the same items for right-click users.
- Editing a formation's point moves everyone's lane. Editing one member (Alt-click its own
  lane, or editing while only that marcher is selected) gives it its own route (Q3); the Move
  card then shows **Own routes: 1 · Rejoin**.

### Open a path, and pin a count (J-3, J-4, P-1)

**Paths are objects.** Dragging a marcher's dot mid-move does what it does today (the edit window:
a new move to the playhead); it never edits a path.

- **Open a path:** double-click a path on the field (single click selects it, like a shape). An open
  path shows its points, and the marcher's position at the playhead as a marker on the path.
  Escape or clicking off closes it.
- **Pin a count (midset, quarter set):** with the path open and the playhead on the count, drag
  the marker. A point appears there, pinned to that count. Doing this on every count is per-count
  editing (O-9). On a straight move, opening its path and dragging the marker makes it Drawn.
- **Pin an existing point:** right-click the point → Pin to count… (typed, so midsets are exact),
  or with the playhead on a count, press the pin shortcut with the point selected.
- **Retime:** drag the pin's tick on the move's clip. Ticks show only for the selected marchers
  (a formation's pins once).
- **Stop** (mark time, F-4): drag the tick's right edge to widen it into a bar. Shown with the
  hold display (O-21).
- **Unpin:** Remove pin in the point menu; the point stays.
- **Which paths show** (O-20 and the start-flag paths, #337): the selected marchers' paths for the
  move at the playhead; Off / Selected / All; the next move's paths as today's start-flag option.
  A path must be visible to be opened. _(To settle in the step that builds it.)_

### Steps per count (J-9, F-3, finding 3)

One picker on the Move card, labelled **Steps per count**: `1 · 2 · ½ · 3 in 2 · Other…` (a typed
fraction). The words promise steps, not speed: "Double" read as "faster" to 3 of 4 users. The clip
shows the step count when it isn't 1 ("32 steps"), and the selection's step dots are drawn by
default. Pins stay on their counts when it changes.

**Step warnings** (Q5, finding 2) are amber, in plain words, on the worst leg only: "Big steps · 6
to 5", with the tooltip "Steps bigger than 8 to 5 at this rate. Lengthen the move, use 2 steps per
count, or shorten the path." Never red: it is advice, not an error.

### Follow the leader (J-5, J-6, J-22, J-23, S-10)

The path choice on the Move card gains **Follow**. There is no separate mode or dialog.

- **Into a new shape** (the usual case): place the end shape with the Shape tool as today, then
  choose Follow. The trail appears: through the marchers' current order, along any drawn
  connector, into the end shape in its snake order. The leader is marked; clicking the other
  end of the line makes that end lead.
- **Along the same shape** (snake a box, go round a circle): when the end shape is the shape
  they stand in, Follow shows the trail through it and a handle on the leader. **Drag the
  leader along the trail**; everyone ripples live, and the end spots update. A small readout
  "3 spots" can be typed into instead. **Dragging the leader sideways off the trail bends the
  exit** live, with everyone following (O-27): no separate pen step. The handle is labelled
  "Leader".
- **Bending and counting are separate** (round 2 finding 6). A sideways drag bends the exit and
  never changes the count; the spots readout and a drag _along_ the trail change the count and
  never change the exit's shape: the leader slides along the bent exit, which is kept.
- **Snake order** comes from the shape's existing order presets (rows, columns, or drawn through
  the spots, S-7). Corners at row ends are straight; rounding one is a point edit.
- **Turning on counts:** nothing to set. If a corner isn't reached on a whole count, the step
  warning shows on that leg, and the dot book lists each member's turn count.

### Turn (T-0 to T-2)

A group turns around a pivot: a rotating box, a gate turn, a full turn while travelling, or a turn
into a different shape (an even spiral). Model: [draft-model.md](draft-model.md) §3.6.

1. Place the end shape as usual (Shape tool). For the same box turned, rotate the end shape with
   its rotate handle; winding past a full turn keeps counting ("1 turn + 90°").
2. Select the group and choose **Turn** in the path choice. Winding a shape's handle a full turn or
   more chooses Turn by itself, with a notice and Undo, since Straight can't show it.
3. The app fills it in: the pivot from the shape's own pivot (or the group's centre), the angle from
   the two rotations (or the closest fit between different shapes). The paths preview at once.
4. Adjust on the field or on the **turn row**, `↻ | ↺ [270°] · Reset`. **You change the turn; the
   end shape follows** (T-4):
   - **Type or wind an angle**: the end shape turns to match, so the turn is exactly what you typed.
     Its spots are where the next move starts, as with any edit to an end shape.
   - **Drag the ✛ pivot**: it becomes the point that stays put, and the end shape moves so the group
     swings around it. A gate's middle stays where you dropped it.
   - **Alt-drag the pivot**: keeps the end spots and lets the pivot travel (two handles joined by a
     dashed line); it snaps to the one point that can stay put.
   - **↻ or ↺** picks the direction; whole extra turns never move a spot.
   - **Reset** goes back to the shapes' own values.
   - If the end is loose dots (no shape) or a shape holding other marchers too, the end can't move:
     a typed angle snaps to the nearest one the spots allow and says why ("To turn by a different
     amount, make the end a shape or move its spots"), and a pivot drag behaves like Alt.
5. Pin "180° by count 8": put the playhead on count 8 and drag the angle handle, the same gesture
   as pinning a point. A tick appears on the clip like any pin, and drags to retime.

One rotation readout: while Turn is chosen, the Shape panel's rotation for the end shape shows the
same unwrapped value as the turn row's total (round 2 finding 8 had "−90°" beside "↻ 630°"). An edit
elsewhere that changes a turn by a whole turn or more, or reverses it past 90°, says so: "Move 3
now turns ↺ 360° · Undo".

### Things that go wrong

- **Route no longer fits** (an end moved, Q2): the first or last leg is drawn dashed and the Move
  card shows **Re-fit**. Ignoring it is fine.
- **Taken over by another move** (J-11): the rejoin is a hatched lead-in on the clip; dragging
  its edge sets its length (E-2). Automatic otherwise.
- **Merging two formation moves**: refused with the reason (F-5).
- **Collisions** (round 2 finding 4): the app's collision check runs along paths and turns, not
  only at sets, and marks the count and the two marchers as it does today.

## Every action is a command

Draw path, Finish path, Cancel path, Add point, Delete point, Toggle smooth, Pin to count,
Remove pin, Make stop, Steps per count (1 / 2 / ½ / 3 in 2 / Other), Path: Straight / Arc / Drawn /
Follow / Turn, Re-fit route, Rejoin formation, Follow: reverse leader,
Follow: advance N spots, Turn: set angle, Turn: clockwise, Turn: counterclockwise, Turn: reset to shapes, Turn: move pivot to the shape's
centre. Each is in the command palette, each is one undo step.

## Touch

The pen works with a pencil as with a mouse; a finger draws the same way with the touch pill's
modifiers. Point menus open on long-press. The leader handle and pin ticks get the tablet
layout's larger hit areas (touch variant only).

## Small fixes from round 2

- Choosing Drawn with one member of a group selected opens the pen for that member's own route.
- Clicking one marcher inside a selection selects just it on release (a drag still moves all).
- The knob of a shape snaps visibly (a tick and a short pulse) when it lands on a snap point.
- The Big steps tooltip says what to do first: "Lengthen the move, use 2 steps per count, or
  shorten the path."
- Step sizes add the length, so "3 to 5" can't be misread as small: "Big steps · 3 to 5 (60 in)"
  (Rosa wasn't sure whether 3 to 5 was bigger or smaller than 6 to 5).

## What round 2 settled

H-7, H-8 and H-9 held (curves first try from the chip, "32 steps", amber read as advice). H-10
held for bending but finding 6 split bending from counting. H-11 held for finding Turn; adjusting
it failed (findings 1 to 3), which T-4 replaces. H-12: the spiral read as intended; crossings weren't
visible because the prototype had no collision check, so H-16 retests.

## Questions for round 3

| #    | Hypothesis                                                                                      | How we'd know it's wrong                                                 |
| ---- | ----------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| H-13 | Typing 270° gives a 270° turn they expect, and they notice the end shape turned                 | They're surprised the next move's start changed, or look for the old end |
| H-14 | Dragging the pivot to a gate's middle swings it about the middle, as they meant                 | They expected the end spots to stay, or lose the end shape off the field |
| H-15 | ↻ and ↺ are read as direction, not "add a turn"                                                 | They press ↻ to add 360°                                                 |
| H-16 | Collisions along a spiral or turn are flagged where they happen                                 | A crossing passes without a mark, or a gate turn flags falsely           |
| H-17 | Follow: bending keeps the count and changing the count keeps the bend                           | Either still undoes the other                                            |
| H-18 | "Steps change" reads as advice on a travelling spin, and they find the counts where it changes  | They read it as an error, or can't find where                            |
| H-19 | A marcher given only the per-count list (no field) walks a gate turn and a box-to-circle spiral | They can't place the next count from the list                            |

## What round 1 settled

H-2 (playhead + drag pins) and H-3 (clip ticks) held; H-1, H-4 and H-6 led to findings 3 to 7 above;
H-5 held while selected (paths with nothing selected follow O-20's Off / Selected / All switch).

## Round 2 hypotheses (for the record)

| #    | Hypothesis                                                                             | How we'd know it's wrong                                             |
| ---- | -------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| H-7  | With the chip, they draw curves and know who they draw for                             | Zigzags again, or a stroke lands on the wrong marchers               |
| H-8  | "Steps per count" and "32 steps" make double time visible                              | They still see "nothing change"                                      |
| H-9  | Amber "Big steps" reads as advice they can act on                                      | They read it as an error or ignore it                                |
| H-10 | Dragging the leader off the trail bends a snake's exit                                 | They look for a pen or a menu                                        |
| H-11 | They find Turn, and adjust pivot and angle on the field                                | They hunt for rotation in the shape panel, or can't make a full turn |
| H-12 | A box into a circle with Turn reads as intended, and crossings are rare or easy to see | They're surprised by the spiral, or crossings are common             |

## Round 1 hypotheses (for the record)

| #   | Hypothesis                                                                               | How we'd know it's wrong                                                     |
| --- | ---------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| H-1 | Designers find the Path pen and draw a flutter without help                              | They look for "path" in the Move card or right-click menu first and give up  |
| H-2 | "Playhead on a count, drag the dot" is understood as "be here on this count"             | They expect the drag to move the end spot, or are surprised a point appeared |
| H-3 | Pin ticks on the clip read as "this marcher's pinned counts" and dragging one retimes it | They try to drag the clip or think the ticks are beats                       |
| H-4 | Follow, then dragging the leader along, is understood without a dialog                   | They look for a "spots" field first, or don't see the leader handle          |
| H-5 | Formation vs own route is clear at a glance                                              | They can't tell which marchers broke off                                     |
| H-6 | The Time picker's words (Double, Triplet) match their vocabulary                         | They expect "2:1" or "8 to 5" style wording                                  |

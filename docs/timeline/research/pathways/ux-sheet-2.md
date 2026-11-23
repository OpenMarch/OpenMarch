<!-- cspell:disable -->

# Pathways: UX sheet (draft 2)

Status: draft 2, 2026-11-02. Draft 1 ([ux-sheet-1.md](ux-sheet-1.md)) was tested with four simulated
users ([proto-round-1.md](proto-round-1.md)); this draft applies findings 1 to 10 and adds turns
(register U-1, T-0 to T-2). Every control the feature adds, with a budget. The model behind it
is [draft-model.md](draft-model.md); decisions are in the [register](README.md). Rules from the
taste doc apply: every feature is a named command (palette, shortcut, touch); mouse users can
find everything without shortcuts; desktop first, touch reaches the same actions.

## The budget

**One tool, no new panels, no nested menus.** Everything else is direct manipulation on things
already on screen (dots, the move's clip, the Move card), or a control that appears only when it
applies.

| Kind                                      | Added                                                                                                                                                                                                                                                                     | Where                                                                                                                                |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| Tools                                     | 1: **Path pen**                                                                                                                                                                                                                                                           | Toolbar, beside the Shape tool                                                                                                       |
| Always-visible controls                   | 1: **Steps per count** (`1 · 2 · ½ · 3 in 2 · Other`)                                                                                                                                                                                                                     | Move card                                                                                                                            |
| Options on an existing control            | 3: **Drawn**, **Follow** and **Turn**                                                                                                                                                                                                                                     | Move card's path choice (today Straight / Arc). It applies to the selected marchers and shows **Mixed** when they differ (finding 6) |
| Controls that appear only when they apply | 5: **Turn with path** (formation, off by default), **Re-fit** (route no longer fits its ends), **Own routes · Rejoin** (some members broke off), **Point row** (a route point is selected: `Count [8] · Corner / Smooth`), **Turn row** (Turn chosen: `↻ [270°] · Reset`) | Move card                                                                                                                            |
| Right-click / long-press items            | 4 on a route point: Pin to count…, Smooth / Corner, Delete point, Remove pin                                                                                                                                                                                              | Point menu                                                                                                                           |
| New field marks                           | points (square = corner, circle = smooth), pins (diamond + count), the leader handle labelled "Leader", the turn's pivot ✛ and angle arc                                                                                                                                  | Field                                                                                                                                |
| New clip marks                            | pin ticks (selection only), hatched lead-in for a rejoin, "32 steps" when the rate isn't 1, "Turn ↻ 270°"                                                                                                                                                                 | Timeline                                                                                                                             |
| Chip text                                 | The pen's chip: "Drawing for 16 marchers · click for corners, drag for curves · Enter to finish"                                                                                                                                                                          | Above the field, while the pen is active                                                                                             |

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
   slides along the path. **Turn with path** appears on the Move card, **off** by default (U-1);
   when it is on and the end shape isn't turned to match, it says "End shape isn't turned to
   match".
5. A stroke that replaces marchers' own routes says so: "Replaced 2 own paths · Undo" (finding 4).

The Move card's path choice switches to **Drawn**. Choosing **Straight** again removes the route
(one undo step).

### Edit a route

- Drag a point to move it. Double-click a point to switch corner ↔ smooth. Click on the line to
  add a point. Select a point and Delete to remove it.
- A selected point shows the **point row** on the Move card: `Point · Count [8] · Corner / Smooth`.
  Typing a count pins it; clearing the count unpins it (finding 8). No menu needed; the point
  menu keeps the same items for right-click users.
- Editing a formation's point moves everyone's lane. Editing one member (Alt-click its own
  lane, or editing while only that marcher is selected) gives it its own route (Q3); the Move
  card then shows **Own routes: 1 · Rejoin**.

### Pin a count (J-3, J-4, F-6)

- **Main gesture:** put the playhead on the count, drag the marcher's dot. A point appears
  there, pinned to that count. Doing this on every count is per-count editing (O-9). Works the
  same on a straight move: the move becomes Drawn.
- **Pin an existing point:** right-click the point → Pin to count… (typed, so midsets are exact),
  or with the playhead on a count, press the pin shortcut with the point selected.
- **Retime:** drag the pin's tick on the move's clip. Ticks show only for the selected marchers
  (a formation's pins once).
- **Stop** (mark time, F-4): drag the tick's right edge to widen it into a bar. Shown with the
  hold display (O-21).
- **Unpin:** Remove pin in the point menu; the point stays.

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
  "3 spots" can be typed into instead. **Dragging the leader off the trail draws the exit live**,
  with everyone following (O-27, finding 7): no separate pen step. The handle is labelled
  "Leader".
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
4. Adjust on the field: drag the ✛ pivot (two handles when it travels; they move together, so the
   group stays rigid, and the pivot snaps to the point that stays put); wind the angle handle round
   the pivot to add whole turns or go the other way. Or type on the **turn row**: `↻ [270°] · Reset`
   (Reset goes back to the shapes' values). The end spots fix the turn up to whole turns, so a typed
   angle snaps to the nearest allowed one and says why: "To turn by a different amount, rotate the
   end shape."
5. Pin "180° by count 8": put the playhead on count 8 and drag the angle handle, the same gesture
   as pinning a point. A tick appears on the clip like any pin, and drags to retime.

The end spots never move when you adjust a turn; only the way there changes. An edit elsewhere that
changes a turn by a whole turn or more, or reverses it, says so: "Move 3 now turns ↺ 360° · Undo".

### Things that go wrong

- **Route no longer fits** (an end moved, Q2): the first or last leg is drawn dashed and the Move
  card shows **Re-fit**. Ignoring it is fine.
- **Taken over by another move** (J-11): the rejoin is a hatched lead-in on the clip; dragging
  its edge sets its length (E-2). Automatic otherwise.
- **Merging two formation moves**: refused with the reason (F-5).

## Every action is a command

Draw path, Finish path, Cancel path, Add point, Delete point, Toggle smooth, Pin to count,
Remove pin, Make stop, Steps per count (1 / 2 / ½ / 3 in 2 / Other), Path: Straight / Arc / Drawn /
Follow / Turn, Turn with path (toggle), Re-fit route, Rejoin formation, Follow: reverse leader,
Follow: advance N spots, Turn: set angle, Turn: reset to shapes, Turn: move pivot to the shape's
centre. Each is in the command palette, each is one undo step.

## Touch

The pen works with a pencil as with a mouse; a finger draws the same way with the touch pill's
modifiers. Point menus open on long-press. The leader handle and pin ticks get the tablet
layout's larger hit areas (touch variant only).

## What round 1 settled

H-2 (playhead + drag pins) and H-3 (clip ticks) held; H-1, H-4 and H-6 led to findings 3 to 7 above;
H-5 held while selected (paths with nothing selected follow O-20's Off / Selected / All switch).

## Questions for round 2

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

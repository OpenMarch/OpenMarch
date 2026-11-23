<!-- cspell:disable -->

# Pathways: UX sheet (draft 1)

Status: draft 1, 2026-11-02. Every control the feature adds, with a budget. The model behind it
is [draft-model.md](draft-model.md); decisions are in the [register](README.md). Rules from the
taste doc apply: every feature is a named command (palette, shortcut, touch); mouse users can
find everything without shortcuts; desktop first, touch reaches the same actions.

## The budget

**One tool, no new panels, no nested menus.** Everything else is direct manipulation on things
already on screen (dots, the move's clip, the Move card), or a control that appears only when it
applies.

| Kind                                      | Added                                                                                                                           | Where                                          |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------- |
| Tools                                     | 1: **Path pen**                                                                                                                 | Toolbar, beside the Shape tool                 |
| Always-visible controls                   | 1: **Time** (steps per beat)                                                                                                    | Move card                                      |
| Options on an existing control            | 2: **Drawn** and **Follow**                                                                                                     | Move card's path choice (today Straight / Arc) |
| Controls that appear only when they apply | 3: **Turn with path** (formation), **Re-fit** (route no longer fits its ends), **Own routes · Rejoin** (some members broke off) | Move card                                      |
| Right-click / long-press items            | 4 on a route point: Pin to count…, Smooth / Corner, Delete point, Remove pin                                                    | Point menu                                     |
| New field marks                           | points (square = corner, circle = smooth), pins (diamond + count), the leader marker in follow the leader                       | Field                                          |
| New clip marks                            | pin ticks (selection only), hatched lead-in for a rejoin                                                                        | Timeline                                       |

Nothing the model computes (bounds, rejoin aim, lanes, fractions) has a setting.

## The gestures

### Draw a route (J-1, J-2, J-8)

1. Select marchers. Pick the **Path pen** (toolbar, or its shortcut; key to choose after checking
   conflicts).
2. Click to place corners, press-and-drag to place smooth points, as in Figma's pen. The route
   always starts at the selection and ends at its end spots; the designer only places the points
   in between.
3. **Enter** (or clicking the end spot, or the ✓ on touch) finishes. **Backspace** removes the
   last point while drawing; **Escape** cancels (O-19).
4. One marcher selected: its own route. Several: one **formation** route drawn as a band;
   **Turn with path** appears on the Move card, on by default (O-12a).

The Move card's path choice switches to **Drawn**. Choosing **Straight** again removes the route
(one undo step).

### Edit a route

- Drag a point to move it. Double-click a point to switch corner ↔ smooth. Click on the line to
  add a point. Select a point and Delete to remove it.
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

### Time (J-9, F-3)

One picker on the Move card: **Normal · Double · Half · Triplet** (1, 2, ½, 3/2 steps per beat),
with "Other…" for a typed fraction. Pins stay on their counts when it changes. Step-size
warnings (Q5) use the chosen rate.

### Follow the leader (J-5, J-6, J-22, J-23, S-10)

The path choice on the Move card gains **Follow**. There is no separate mode or dialog.

- **Into a new shape** (the usual case): place the end shape with the Shape tool as today, then
  choose Follow. The trail appears: through the marchers' current order, along any drawn
  connector, into the end shape in its snake order. The leader is marked; clicking the other
  end of the line makes that end lead.
- **Along the same shape** (snake a box, go round a circle): when the end shape is the shape
  they stand in, Follow shows the trail through it and a handle on the leader. **Drag the
  leader along the trail**; everyone ripples live, and the end spots update. A small readout
  "3 spots" can be typed into instead. Past the end of the shape, the leader drags out along a
  drawn exit (the Path pen draws it).
- **Snake order** comes from the shape's existing order presets (rows, columns, or drawn through
  the spots, S-7). Corners at row ends are straight; rounding one is a point edit.
- **Turning on counts:** nothing to set. If a corner isn't reached on a whole count, the step
  warning shows on that leg, and the dot book lists each member's turn count.

### Things that go wrong

- **Route no longer fits** (an end moved, Q2): the first or last leg is drawn dashed and the Move
  card shows **Re-fit**. Ignoring it is fine.
- **Taken over by another move** (J-11): the rejoin is a hatched lead-in on the clip; dragging
  its edge sets its length (E-2). Automatic otherwise.
- **Merging two formation moves**: refused with the reason (F-5).

## Every action is a command

Draw path, Finish path, Cancel path, Add point, Delete point, Toggle smooth, Pin to count,
Remove pin, Make stop, Set time (Normal / Double / Half / Triplet / Other), Path: Straight / Arc /
Drawn / Follow, Turn with path (toggle), Re-fit route, Rejoin formation, Follow: reverse leader,
Follow: advance N spots. Each is in the command palette, each is one undo step.

## Touch

The pen works with a pencil as with a mouse; a finger draws the same way with the touch pill's
modifiers. Point menus open on long-press. The leader handle and pin ticks get the tablet
layout's larger hit areas (touch variant only).

## Questions the prototype must answer

| #   | Hypothesis                                                                               | How we'd know it's wrong                                                     |
| --- | ---------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| H-1 | Designers find the Path pen and draw a flutter without help                              | They look for "path" in the Move card or right-click menu first and give up  |
| H-2 | "Playhead on a count, drag the dot" is understood as "be here on this count"             | They expect the drag to move the end spot, or are surprised a point appeared |
| H-3 | Pin ticks on the clip read as "this marcher's pinned counts" and dragging one retimes it | They try to drag the clip or think the ticks are beats                       |
| H-4 | Follow, then dragging the leader along, is understood without a dialog                   | They look for a "spots" field first, or don't see the leader handle          |
| H-5 | Formation vs own route is clear at a glance                                              | They can't tell which marchers broke off                                     |
| H-6 | The Time picker's words (Double, Triplet) match their vocabulary                         | They expect "2:1" or "8 to 5" style wording                                  |

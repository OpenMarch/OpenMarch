# Placed boxes: a box stays a box after Place

Status: owner decisions, 2026-10-14 (grilling on the box v1 feedback). Builds on
[06-box-v1.md](06-box-v1.md) and [ADR 0006](../../../adr/0006-shape-recipes.md).

## Why

After a box is placed, the owner wants to:

1. edit its files and intervals after the fact;
2. move its marchers as a group;
3. see how the marchers got their positions.

Copying a box's setup to other marchers is out of scope for now.

Place already saves a recipe (ADR 0006) in the same undo step as the positions. This work reads
it back.

## Membership

- A member is either exactly on its spot or not in the box. Nothing in between is stored: there
  are no "moved by hand" offsets (this revises ADR 0006 decision 3).
- Moving one member, or some, takes them out of the box. They stay where they were dropped, and
  their spots stay as holes. A toast offers the fill choices case by case:
  **"OT3 left the box · Close up · Re-split · Undo"**.
  - **Close up** keeps the files and intervals. The front rank stays put and the back rank goes
    short. Who fills which spot is Nearest.
  - **Re-split** splits the remaining marchers again by the evenness rule, inside the edges the
    box had.
  - Ignoring the toast leaves the hole.
- Moving every member the same way moves the box, with no toast.

## Time

- A box is shown at the end of the move it was placed in, and at every later moment while all
  its members still stand on their spots (the form is held). This is worked out from the
  positions, not stored.
- If a later move takes some members away, the box isn't shown from there on.
- Editing a box on a later page goes through the same edit path as any coordinate edit: pages
  that were holding the form follow, and "Keep … as before" exists. That page gets its own copy
  of the box. Earlier pages keep the old one.
- The readout says "from page N" when the box was drawn on an earlier page.
- **Ungroup** (Shift+⌘G or Ctrl+Shift+G, the field's menu, the floating editor) keeps everyone
  where they are and ends the box, by the same rule: on the box's own page it ends there and on
  the pages holding it, and on a later page that page takes the change and the box ends there,
  earlier pages keeping it (ADR 0006, 2026-11-01).

## Seeing it

- The box's outline and label ("Box 5 × 4 · 2 steps") show on the field.
- A View setting, **Shapes: selected / always / off**, defaults to _selected_: the box shows when
  any member is selected.

## Selecting it (Figma-like)

- Clicking a member selects the whole box: outline, handles and readout.
- Double-clicking selects that one marcher. Inside a box, Shift-click toggles single marchers.
  Esc or a click on the empty field goes back out.
- Shift-clicking a box from outside adds or removes the whole box.
- A drag-select picks exactly the marchers it covers. If it covers every member, it acts as the
  box.
- Dragging a selected box's handles or inside it saves on release, as one undo step. Only drawing
  a new box keeps the preview and Place.
- The inspector shows the readout, − and +, and **Select box**.
- A press on a marcher that is already selected (the whole box, or one picked by a marquee)
  drags the selection, as in Figma.
- With a box selected, the nudge keys move the whole box the same distance, so it stays a box.
  (The plain nudge rounds each marcher on its own, which bends a box whose ranks sit on half
  steps; found while testing, 2026-10-14.)
- With the View tab's **Shapes** set to Off, boxes are neither drawn nor selected as boxes.

## Build order

1. Box v1 fixes (edges, evenness first).
2. Read recipes back, outline and label, membership on every move, the toast.
3. The Figma-like click model, with live handles.

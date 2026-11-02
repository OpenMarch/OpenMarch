# Shapes Agent Notes

Scoped guidance for `src/shapes`, the shape tool. `apps/desktop/AGENTS.md` still applies.

The behavior is specified in
[08-shape-system-ux.md](../../../../docs/timeline/research/shapes/08-shape-system-ux.md) (the UX
spec; fork issue #344 wins where they disagree), with the box in
[06-box-v1.md](../../../../docs/timeline/research/shapes/06-box-v1.md) and placed shapes in
[07-placed-boxes.md](../../../../docs/timeline/research/shapes/07-placed-boxes.md). Storage is
[ADR 0006](../../../../docs/adr/0006-shape-recipes.md): a placed shape is a recipe saved beside the
ordinary positions it writes.

## Map

- `tool/`: the shape host. `toolMachine.ts` is the session's state machine (draw, gestures,
  history, who goes where); `toolKind.ts` is the kind contract; `shapeTools.ts` lists the kinds
  that can be drawn; `shapeToolStore.ts` holds the open shape; `useShapeToolActions.ts` has
  `placeShape`; `shapeMoment.ts` ties an open shape to its edit window; `selectionGate.ts` is the
  one home of "Select marchers first"; `ShapesTab.tsx` and `FavoritesRing.tsx` are ways in.
- `box/`, `circle/`, `line/`: the drawable kinds (`boxTool`, `circleTool`, `lineTool`) and their
  geometry. The Line's frame follows from its points, so it checks its own recipes (`readable`)
  and declares its spacing menu as a kind choice (`ToolChoice`, shown by `editor/ChoiceMenu.tsx`).
  A closed Line is filled through `line/lineFill.ts`, its region the outline as drawn
  (`closedOutline`, curves in short pieces); a kind closed only sometimes declares
  `closed.when`, so host code reads a shape's fill through `closedOf` (`distribute/modes.ts`),
  never `kind.closed` directly.
  The Curve (`curveTool`) is a preset of the Line (`ToolKind.preset`): its points start smooth, it
  saves Line recipes, and pickers know it by `toolId`. A picker that arms or highlights a kind
  threads `toolId(kind)`, never `kind.shape.id`, which a preset shares with its kind; code that
  reads recipes or saved shapes back skips presets (`PLACED_KINDS`, `savedShapes.ts`).
  `group/`: marchers grouped where they stand (`groupTool`, #603), read back but never drawn.
  `box/edgePull.ts` lands edges and corners on yard lines and hashes; `box/modeMemory.ts`
  remembers each fill mode's numbers.
- `kinds/`: the older shape-model kinds (`ShapeKind` in `types.ts`) that generate spots. The box
  wraps `block`; the others are kept for later kinds.
- `frame/`: the frame every kind sits in (center, size, turn, flip, pivot), the shared gestures
  on it, scaling, and the coordinate-named edge guides (`edgeGuides.ts`). Pure.
- `distribute/`: how a closed shape is filled (Grid, Outline, Spread, Edge), owned by the host;
  a kind only describes its region.
- `editor/`: the floating editor (`ShapeEditorBar.tsx`) and its controls: numbers you type or
  drag (`ScrubNumber`, `scrub.ts`, `format.ts` for exact fractions), a Line's interval groups
  (one group's chips in `GroupChips`, two or more in `GroupMenu`, whose rows light their group
  on the field through `field/groupDrawing.ts`; the list syntax and groups-to-gaps layout are
  `spacing.ts`; a kind's `step` numbers, a Line's Offset, draw their step and light the pivot
  through `field/stepDrawing.ts` while engaged), the mode, layout and pivot
  menus, Recalculate, Reshuffle, Close up, and keeping the shape in view (`keepInView.ts`).
- `field/`: how the shape code reads the three.js field (`shapeField.ts`, registered by the
  field, never `window.canvas`), pointer routing and the field modes it installs.
- `placed/`: placed shapes read back from recipes, their membership (a marcher that moves away
  leaves the shape), selecting and editing them (`commitBox.ts`), grouping marchers
  (`groupMarchers.ts`) and ungrouping them (`ungroupShape.ts`), and their overlay.
- `library/`: saved shapes and stars. `command/`: the command bar's shape steps.
  `preview/`: a shape's small picture, drawn from its own geometry. `transform/`: turning and
  flipping a plain selection, with no recipe. `draw/`: conversions between fills.
- `assign.ts`, `leastTravel.ts`: who goes where. `leastTravel` is the one replaceable solver.

## The host and its kinds

- One host owns the session: drawing, gestures, history, who goes where, placing, the floating
  editor and the field styling. A kind owns only its parameters and geometry, and never sees a
  pointer event or the selection.
- A kind implements `ToolKind<P>` (`tool/toolKind.ts`): its params (declared once, with primary,
  drag direction and interval flags), handles, `dragHandle`, `move`, `frameOf` / `withFrame` /
  `fromFrame`, and optionally `closed` for the host's distributor and `choices` for menus of its
  own, and `groups` for mixed intervals (#526). Everything is pure.
- The host keeps which handle a click selected (`selects` on a `ToolHandle`, #557) and hands its
  key back to `handles`, so a kind shows more around it (a Line's tangent bar, handles with
  `bar`); `selectionAfter` in `frame/gestures.ts` is the rule both the open and placed shape
  follow. `clickHandle` is a click, `doubleClickHandle` a double-click's second click.
- A kind's `menu` (`ToolHandleMenu`, #569) is a handle's right-click menu (a Line's point or
  segment): the modes' `openMenu` opens it through `field/handleMenu.ts` on a right-click, a Mac's
  Ctrl-click or a long press, `editor/HandleMenu.tsx` shows it, and a pick is `pickMenu` on the
  open shape (one undo step) or `pickLive` on a placed one (one save). A `segmented` (Corner |
  Smooth) or `follow` (Follow line's marchers) section
  is picked with the menu kept open: the mode's pick returns the shape after it
  and `openHandleMenu` rebuilds the sections. An undo or
  redo clears the selection (a key names a point by index); a placed shape keeps it only through
  its own save (`reopenLive`).
- The spot count comes from the host. Spots and who goes where are separate steps.
- Every placement goes through `writePlacement` (`tool/shapePlacement.ts`): `placeShape` for an
  open shape, `commitBox` for an edit of a placed one. Members move through the canvas-drag path
  and the recipe is saved in the same edit, so it is one undo step.
- Adding a drawable kind is its module, an action in `src/shortcuts/definitions.ts`, and one line
  in `tool/shapeTools.ts`.

## Tests

- Host behavior: Vitest in `__test__/` folders, through the shape session with a fake kind
  (`__test__/fakeRowKind.ts`) so the host is tested without the box.
- User workflows: browser scenarios in `e2e/browser/tests/box-tool.spec.mts`, which read
  `window.fieldTest` (`shapeOverlay()`, `placedBoxes()` and the rest in
  `src/field/fieldTestApi.ts`) and saved positions, never three.js objects.
- Command bar: component tests in `command/__test__/` and `src/shortcuts/palette/__test__/`.

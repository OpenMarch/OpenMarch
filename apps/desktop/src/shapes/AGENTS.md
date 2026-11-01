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
- `box/`, `circle/`: the two drawable kinds (`boxTool`, `circleTool`) and their geometry.
  `box/edgePull.ts` lands edges and corners on yard lines and hashes; `box/modeMemory.ts`
  remembers each fill mode's numbers.
- `kinds/`: the older shape-model kinds (`ShapeKind` in `types.ts`) that generate spots. The box
  wraps `block`; the others are kept for later kinds.
- `frame/`: the frame every kind sits in (center, size, turn, flip, pivot), the shared gestures
  on it, scaling, and the coordinate-named edge guides (`edgeGuides.ts`). Pure.
- `distribute/`: how a closed shape is filled (Grid, Outline, Spread, Edge), owned by the host;
  a kind only describes its region.
- `editor/`: the floating editor (`ShapeEditorBar.tsx`) and its controls: numbers you type or
  drag (`ScrubNumber`, `scrub.ts`, `format.ts` for exact fractions), the mode, layout and pivot
  menus, Recalculate, Reshuffle, Close up, and keeping the shape in view (`keepInView.ts`).
- `field/`: how the shape code reads the three.js field (`shapeField.ts`, registered by the
  field, never `window.canvas`), pointer routing and the field modes it installs.
- `placed/`: placed shapes read back from recipes, their membership (a marcher that moves away
  leaves the shape), selecting and editing them (`commitBox.ts`), ungrouping them
  (`ungroupShape.ts`), and their overlay.
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
  `fromFrame`, and optionally `closed` for the host's distributor. Everything is pure.
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

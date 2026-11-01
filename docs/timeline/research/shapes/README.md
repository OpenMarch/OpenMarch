<!-- cspell:words Onshape -->

# Shape tools: research and proposal

Status: research, 2026-10-10. Nothing here is decided until the owner answers the questions at the end.

## The brief

- **Shape creation happens in place.** A shape tool positions the selected marchers at one point
  in time and nothing else. Motion stays in the timeline.
- **Needed now:** lines, circles, arcs, curves (splines), and boxes or blocks with variations and
  staggers.
- **Needed later:** kinds we don't know yet.
- **One consistent, extensible system** for where tools live, how they are activated and how
  their parameters are edited. Adding a kind must not add UI. Pyware classic is the example to
  avoid: it has about 31 palette tools, each with its own panel.

## Reports

| File                                           | What it covers                                                                                                                                                                |
| ---------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [01-codebase.md](01-codebase.md)               | What exists in timeline mode, the write path, actions layer, canvas tool modes, UI pieces, risks                                                                              |
| [02-prior-art.md](02-prior-art.md)             | Pyware classic and 3DX, EnVision, formation apps, Figma, Illustrator, Blender, Onshape. Four candidate architectures (C.1 to C.4) with a comparison table                     |
| [03-shape-model.md](03-shape-model.md)         | Taxonomy of formations, the `ShapeKind` contract (line, arc, block with stagger and spline declared in full), storage options, assignment algorithms, a suggested build order |
| [04-user-voice.md](04-user-voice.md)           | GitHub issues and discussions, today's shape bugs, and the owner's UX rules with references                                                                                   |
| [06-box-v1.md](06-box-v1.md)                   | The interaction rebuild: why, the build order, and the owner's box v1 spec                                                                                                    |
| [07-placed-boxes.md](07-placed-boxes.md)       | A box stays a box after Place: membership, time, selecting                                                                                                                    |
| [08-shape-system-ux.md](08-shape-system-ux.md) | The shape system UX spec: ways in, the floating editor, the inspector, field gestures, marcher styling                                                                        |
| [modifier-roles.md](modifier-roles.md)         | Modifier keys as roles (fine, constrain, from center), a Snap toggle and press choices: audit of every modifier read, the role module, an A/B lab test                        |

## What the research agrees on

1. **One Shape tool with many kinds, not one tool per shape.**
   - Users asked for this in #572 and #567.
   - Pyware's own next product (3DX) moved all draw tools into one shared Tool Inspector.
   - ArrangeUs, the formation app, applies presets to the selected people.
2. **Kinds are declared by data, and the UI is generated from them.** Each kind declares:
   - a parameter schema;
   - how it fits the current selection;
   - its handle roles;
   - `generate(params, n)`, which returns the slots;
   - validation.

   The panel and canvas handles are built from this declaration, the same pattern as Onshape
   FeatureScript and Figma plugin parameters. A new kind is one file, with no new chrome and no
   schema migration (see 03 §2).

3. **Spacing and Order are shared sections, not per-tool features.**
   - Spacing is "Fit" (spacing derived from length) or "Interval in steps" (length derived), with
     an anchor and stagger where it applies. Every drill tool uses this Positions/Interval
     vocabulary, and users asked for typed step spacing (#566, #697, #728, #162).
   - Order is Nearest (Hungarian on squared distance), Keep order, Drill number, Reverse.
     Assignment is fixed when the tool opens and kept while you drag. Reassign is explicit.
4. **Select first, then shape.**
   - Selecting fits a default shape through the current positions (`newShapeThrough` exists).
   - A live ghost preview shows the result.
   - Enter applies as one undoable edit, and Esc cancels. Cancel must restore the canvas listeners
     cleanly, which is today's #930 bug.
5. **In place maps onto the existing write seam.**
   - Apply calls `transformMarchersInSelection` (`timelineCoordinateWrites.ts`), which ends in
     `moveMarchersInTarget`.
   - That writes the move ending at the playhead.
   - It already handles the edit window, isolation, skip-if-unchanged, toasts and one undo step.
6. **Rotate, scale, mirror and distribute go in the same system** as identity-assignment kinds
   that use the selection's existing order. #257 asks for a chosen origin.

## Proposed architecture (for discussion)

This is prior-art C.1 as the backbone, C.4 handles as the main geometry input, and an optional C.2
pop-up.

- **Entry points.** These are the only new chrome:
  - one Shape tool, with a single key and toolbar button that replaces today's `ShapeSelector`;
  - per-kind command palette entries ("Shape: Arc") that open the same tool;
  - a kind picker in the tool header that recalls the last kind. Changing the kind keeps the
    marchers and the assignment.
- **Home for parameters.** One "Shape" section, docked in the inspector, generated from the kind's
  schema:
  - Kind
  - Kind parameters (with a "More" disclosure for the rest)
  - Spacing
  - Order
  - Apply and Cancel

  Typed values are in steps, using `UnitInput`, `DragInput` and `Slider`.

- **On the field.** Each shape gets handles by role (endpoints, rim, a count/spacing handle, a
  stagger corner), plus ghost slots and a min-spacing or off-field warning. There are no handles
  per marcher.
- **Optional pop-up:** a small card by the shape that shows only the fields marked `primary`, from
  the same schema. Figma reverted floating panels in UI3 because "they slowed people down", so this
  should be an A/B question, not a default (see the owner's simulated-user study practice).
- **Storage (03 §3, option c).**
  - Apply bakes individual positions through the existing seam, so the resolver and file rules
    don't change and older builds still play the show.
  - It also saves a re-editable **recipe**: kind, version, parameters, marcher ids in slot order,
    timeline and beat.
  - Re-selecting those marchers at that beat offers "Edit shape".
  - A hand nudge marks the recipe "modified" visibly. Today the shape link is silently lost.
  - Storing parametric spec shapes per kind (option b) is rejected. It would need a spec, schema
    and resolver change per kind, and it breaks UI-9's one-move-per-marcher rule (01 §14).
- **Extensibility check.** Adding "diamond" or "wedge" means one `ShapeKind` file and one palette
  entry. Nothing else changes.

## Owner decisions (2026-10-10)

1. **Storage:** bake positions plus a re-editable recipe (option c). Agreed.
2. **Parameter home:** undecided; the lead recommends starting inspector-only (see below) and testing a primary-field pop-up later.
3. **Playhead mid-move:** no special rule. The shape tool uses the same write path as a drag (`planCanvasEdit` → `transformMarchersInSelection`), so UI-10 applies: marchers leave the start flag and arrive at the playhead; off a flag that creates a move ending at the playhead, and a move the window runs into partway catches up after it.
4. **Transforms:** not built in v1. The contract must allow identity-order kinds with a chosen origin (#257) so they can be added later without redesign.
5. **Follow the leader:** later. Shapes are only for placing marchers in place.
6. **Snapping:** Alt turns snapping off, as in the rest of the timeline.
7. **Mixed intervals** (`5x3,10x2`) are in v1.
8. **Slides deck:** not needed; the brief above is enough.
9. **Clean slate:** existing shape code (legacy page shapes, the timeline shape editor and overlay, `ShapeSelector`, the line tool) can be thrown out. This is a complete redesign, built from scratch.

## Owner decisions (round 2, 2026-10-10)

10. **Shape shortcuts.** There won't be a global key for every shape (A is already the left nudge).
    If per-kind keys come, they work only while the shape picker is open, for example A for
    Arc inside the picker. That needs context in the keyboard shortcut system, like VS Code's
    `when` clauses that depend on which part of the app has focus. Deferred.
11. **Interval modes.** Both camps should be served: an interval that is locked, where the shape
    adjusts to keep it, and spacing that flexes as the shape is edited. Research is in
    [05-interval-modes.md](05-interval-modes.md).

## Suggested build order (after decisions)

1. Contract, `pathSampler` and `lattice` helpers, and line and arc kinds, with pure unit tests.
2. The Shape tool shell: actions entry, canvas mode, inspector section generated from the schema,
   preview, Apply through the write seam, and Esc/undo.
3. Circle, block (with stagger and rotation) and spline.
4. Recipe storage and "Edit shape".
5. Transforms, then an A/B of the pop-up.

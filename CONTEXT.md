# OpenMarch glossary

Terms the code, docs and issues use. Add a term when a design decision settles it.

## Shapes

- **Shape**: a way to place the selected marchers at one moment. Box, Circle and Line are shapes.
  _Avoid_: form, formation tool.
- **Kind**: one type of shape (Box, Circle, Line). A kind owns its parameters and geometry; the
  **shape host** owns drawing, gestures, history, who goes where and placing.
- **Recipe**: a placed shape's stored kind and parameters, kept beside the positions it wrote
  (ADR 0006).
- **Path**: a shape whose marchers stand along a line, open or closed. A code and docs word, not
  shown in the UI. Only a closed path can be filled.
- **Point**: a point a Line passes through. It has a **tension**: 0 is a **corner**, more makes
  the line pass smoothly through it. The two ends always hold a marcher, smooth or not; a smooth
  point between them doesn't, unless it says so. A **closed** Line joins its last point to its
  first and has no ends: only its corners hold marchers, and it has a gap for every marcher. A
  click selects a point; a selected smooth point shows its **tangent bar**, a short line through it
  along the curve whose ends set its tension. A double-click switches a point between corner and
  smooth. A right-click opens the point's menu.
- **Marcher on this point**: a point's own answer to whether it holds a marcher, from its menu:
  **As the line** (the corners switch decides), **Always a marcher**, or **Keep spacing even** (no
  marcher forced there; the intervals run straight through). Either way round the switch.
- **Stretch**: the part of a Line from an end or a point holding a marcher to the next, the points
  that hold none inside it. With corners holding marchers, each stretch holds a whole run of the
  line's gaps. A closed Line's stretches wrap round: the last runs from its last held point past
  the first point to its first held point; with none, one stretch goes all the way round.
  _Avoid_: segment (one point to the next), run (the marchers' gaps).
- **Curve**: a preset of the Line whose points start smooth. It saves a Line recipe and reads
  back as a Line.
- **Group**: a run of marchers at one interval in an interval list. `2*3` is a group of 2
  marchers at 3 steps.
- **The rest**: the one group in a list without a count. It takes every marcher the counted
  groups don't.
- **Seam**: the gap between two groups. It is the larger of their intervals.
- **Measured**: what an interval measures: the length of line between neighbors (**Along the
  path**, the default), the distance from marcher to marcher (**Straight across**, going on
  from a corner holding no marcher rather than cutting past it), side to side (↔),
  front to back (↕) or both at once (**Offset**, rise over run: `2 ↔ 1 ↕` is each marcher 2 steps
  to the right of the one before and 1 up the screen, toward the back, only on a one-segment line;
  either goes below 0 the other way. It reads from the marcher at the line's pivot end).
- **A Line's pivot**: a new Line's starts at its leftmost end or point, on an upright line the
  front end (lowest on the screen); a closed line's at its center. It's stored, so it stays where
  it was put, and only one moved by hand carries into another kind.
- **Fit / Keep interval / Interval on the path**: a path's spacing modes. Fit keeps the size
  drawn and works out the interval; Keep interval fixes the interval and the size follows; Interval
  on the path fixes both and anchors the run.
- **Interval lock**: the button beside a Line's interval. Unlocked is Fit: a typed interval only
  sizes the line, and dragging an end changes the interval, snapping to whole steps. Locked is Keep
  interval: a drag changes only what the interval doesn't pin. Interval on the path counts as
  locked.

## Modifier keys

From the modifier roles design, `docs/timeline/research/shapes/modifier-roles.md` (version A).
The code is `apps/desktop/src/input/modifierRoles.ts`.

- **$mod**: Cmd on a Mac, Ctrl elsewhere, resolved like the shortcuts registry
  (`shortcuts/bindings.ts`). Mac Ctrl (a right-click) and the Windows/Linux Meta key (the OS key)
  never carry a role.
- **Held role**: what a held key means during a drag, read live for the whole gesture: `fine`
  (Shift), `constrain` ($mod) and `fromCenter` (Alt). One role per key; holding two keys gives
  both roles, and no chord means anything of its own.
- **Press choice**: what a key means at the moment the pointer goes down, read once: `add`
  (Shift), `subtract` (Alt) and `reachInside` ($mod). A press uses its key only when the choice
  applies to what's under the pointer, and a key the press used isn't read as a held role until
  it's released.
  On empty field inside a multi-selection's box a plain press moves the selection, and an add or
  subtract press starts the marquee or lasso (owner, 2026-10-30).
- **Role toggles**: the touch pill's Fine, Equal (constrain) and From center, held or latched,
  OR'd into the held roles of every drag; the press rule never blocks them. Its Add is the `add`
  press choice. Named by role, never by key (`stores/TouchModifierStore.ts`).
- **Snap toggle**: an on-screen setting, not a held key; it has a shortcut. It turns off the
  half-step ladder and the pull of guides and marchers for shape and marcher drags on the field,
  and grid snapping for arrow nudges on marchers. Its label is "Snap"; its off state, "Snap off".
  It resets on restart and when a file opens. The timeline keeps its own held Alt = no snap.

<!-- cspell:words scrub scrubs scrubbing unstar rebindable -->

# The shape system: UX spec

Status: owner decisions, 2026-10-15 and 2026-10-16, from two rounds of clickable prototypes,
a grilling on 2026-10-16 about bringing it into the app ([Decisions, 2026-10-16](#decisions-2026-10-16)),
and a grilling on 2026-10-20 about the shape **host** ([Decisions, 2026-10-20](#decisions-2026-10-20)),
published as fork issue #344 with tickets #345 to #354. Where #344 and this spec disagree, #344
wins; this spec was brought in line with it on 2026-10-20 (#345), and brought up to date with
everything merged into `shapes/host` through #455 on 2026-10-27
([Decisions, 2026-10-24 to 2026-10-27](#decisions-2026-10-24-to-2026-10-27)). This spec covers
how every shape is reached, drawn, edited, transformed and shown. Each kind's own
geometry and parameters are specified separately, shape by shape, like
[06-box-v1.md](06-box-v1.md).

Builds on [06-box-v1.md](06-box-v1.md), [07-placed-boxes.md](07-placed-boxes.md) and
[ADR 0006](../../../adr/0006-shape-recipes.md). Where this spec and those disagree, this one wins
for the UI; their storage and membership rules stand.

## Prototypes

Both are single HTML files on the fork branch `proto/shape-ui-ideas`, in
`docs/timeline/research/shapes/prototypes/`. They are throwaway code, not a starting point.

- `shape-ui-ideas.html`: v1, 17 variants across four questions (focus, controls, palette,
  transforms). The owner picked from these.
- `shape-ui-v2.html`: v2, the picks combined into one system, then refined hands-on. **This is
  the reference for this spec.** Where the two differ, v2 wins.

## What a shape is

- **A shape is a tool for placing the selected marchers at one moment**: the playhead, which is
  the end of the move being edited. It doesn't shape the motion before that moment; motion
  stays in the timeline. (Follow the leader, which would use a shape's path for the motion, is
  out of scope.)
- Placing writes ordinary positions through the same path as a canvas drag, and saves a recipe
  beside them (ADR 0006), so a placed shape can be selected and edited again
  ([07-placed-boxes.md](07-placed-boxes.md)).
- **Every kind shares one frame**: a center, a size (width and depth), a rotation, a flip and a
  pivot. Moving, rotating, flipping and scaling work the same way on every kind. A kind decides
  only what its own parameters are and how its spots sit inside the frame
  ([The kind contract](#the-kind-contract)).
- **The host and kinds.** One shape host owns the session (drawing, gestures, history, who goes
  where, placing), every way in, the floating editor and the field styling. A kind owns only its
  parameters and its geometry.
- The frame is the record: every kind's recipe stores the center, size, rotation, flip and pivot.
  Scaling isn't stored as a factor; it becomes the new size and intervals. A shape's numbers are
  stored at the keyframe where it is placed.

## Lifecycle

A shape session moves through these states. The field styling for each is in
[Marcher styling](#marcher-styling).

| State                | How you get there                                         | What's on screen                                                                           |
| -------------------- | --------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| **Idle**             | Nothing open                                              | The normal field                                                                           |
| **Armed**            | A kind is picked and marchers are selected; nothing drawn | A hint ("Drag on the field to draw a box"), and the cursor badge for Sketch                |
| **Drawing**          | Pointer down on the field while armed                     | The new spots under the cursor; marchers stay put                                          |
| **Open**             | Pointer up after drawing, or a shape made another way     | The new spots, the walks, the outline, the handles and the floating editor                 |
| **Gesture**          | Dragging a handle, the center dot or a number             | As Open, with who goes where held still until release                                      |
| **Placed**           | Enter or Place                                            | Marchers on their spots. The shape stays selectable as a placed shape                      |
| **Placed, selected** | Clicking a member of a placed shape (07)                  | The outline, handles and floating editor again; every edit saves on release, with no Place |

- **Enter** or **Place** places an open shape as one undo step. **Esc** discards it, and is an
  undo step itself: Cmd/Ctrl+Z right after Esc brings the shape back. There is no Esc toast
  (2026-10-20; it replaces the toast with Undo of 2026-10-17).
- Esc closes the innermost thing first: a number being typed, then the command bar or the
  favorites ring, then the open shape.
- A press on the empty field outside an open shape draws a new one that replaces it (06).
- Changing the selection, or scrubbing the playhead, while a new shape is open **places** it as
  one undo step, silently: no toast (owner, 2026-10-20: no unnecessary toasts).
- With no marchers selected, the kinds are greyed out with the reason "Select marchers first".
  The rule lives in one place in the host.
- Picking another kind while a shape is open converts it and keeps its frame (center, size,
  turn, flip).
- The open shape is measured from the **start flag** ([Focus](#focus-the-start-flag)).
- Shapes behave the same in Basic and Expert mode (owner, 2026-10-20: Basic is only about the
  timeline).

## Getting a shape

There are several ways in, all opening the same shape session. They differ only in how the kind
and its first size are chosen. (Reworked 2026-10-20.)

### 1. The Shapes tab

- A **Shapes** tab in the top bar, next to Alignment (which is unchanged).
- Its ribbon, left to right:
  1. every registered kind, as a picture only, its name in the tooltip and the accessible label
     (only the box today). The picture is drawn from the shape's own spots and outline (#378),
     never a hand-drawn icon, and the ring, library and command bar show the same one;
  2. a divider, then the user's starred shapes;
  3. a **Library** button, which opens the library in the left sidebar.
- **Sketch** joins it when sketch exists.
- Picking a kind arms it. Then drag on the field to draw. If a shape is already open, picking
  another kind converts it and keeps its frame.
- Box keeps its existing **B** key.

### 2. The favorites ring

- **Hold R** to open a ring of shapes around the cursor; slide toward one and release to pick it.
  **Tap R** to latch it open until a click.
- No mouse trigger: the right button pans the field, and F is "Create page at playhead" (#340).
- 8 slots: starred shapes first, then basic kinds in the tab's order to fill empty slots.
- The key goes through the shortcut system, so it can be rebound.

### 3. The library (left sidebar)

- **Changed 2026-10-20:** the library is its own entry in the left sidebar, beside the show's
  other resources (Marchers, Props, Music, Assets), not a modal.
- Groups: **Basic** and **Saved**. Each row has a star, a picture, a name and a note ("Box · 2
  apart"). Saved rows can be deleted.
- One star puts a shape in both the ring and the Shapes tab. At most 8; starring a ninth asks the
  user to unstar one first. Stars are a per-user preference, so they follow the user across
  shows.
- **☆ Save** (in the floating editor) asks for a name and stars the shape. A saved
  shape keeps its kind and intervals, not its size or marcher count, so it fits any selection.
- Saved shapes live in the user's library across shows, with a copy in each show that uses one,
  following the Assets **This show** / **My Library** pattern.
- Custom shapes ("+ New custom shape") are out of scope (#356).

### 4. The command bar (/ and ⌘K)

- **/** and **⌘K** open the same bar. It extends the existing action registry and command palette
  rather than replacing them: commands can declare typed parameters, and entries can nest.
- **Shape › kind › parameters.** After picking a kind, the bar asks each of its declared
  parameters in turn, each starting with a sensible default already typed, so Enter accepts it.
- Plain actions keep the centered palette. Parameter steps dock at the top of the field without
  covering it, with a live preview on the field.
- Typing "box" lands on Shape › Box. A one-liner such as "box 4x3 2" fills answers ahead.
- **Backspace** in an empty answer goes back one step. **Esc** cancels the whole command and
  restores whatever shape was open before.
- Saved shapes are listed in the Shape branch by name.
- Only the Shape branch is built now. Moving the rest of the app onto the tree, and an outside
  API, need their own ADR (#357).

### 5. Sketch

- **Sketch** (in the Shapes tab) turns the next drag into a freehand stroke. On release the tool
  guesses the kind and opens it, with the other likely guesses one click away in the floating
  editor ("Looks like: Circle · Box · Diamond · Keep as drawn").
- **Keep as drawn** keeps the stroke as a curve.
- A party trick: it doesn't need a default key (K, the prototype's key, is "Keep on page").
- Strokes are recorded so recognition can be tuned later.

The command palette also lists each kind ("Shape: Arc"), which arms it.

## The floating editor

A small bar under the open shape holds the numbers people change most. It's the main place for
editing a shape. Owner choice, 2026-10-15.

### Layout

- It sits under the shape's outline, centered, and moves with the shape. It flips above the
  shape when there's no room below.
- **Kept in view (#441, owner 2026-10-27, picked in a lab A/B over holding the editor still):**
  after a discrete edit (a turn, a flip, − / +, a typed or dragged number, the mode, layout or
  leftover, Recalculate, Reshuffle, Close up) or the end of a drag on the field, the field glides
  just far enough to bring the shape's outline and the editor back inside it with 24 px to spare;
  nothing moves if they're in view. When they no longer fit, it zooms out just enough in the same
  glide, never in, down to the field's least zoom. Never during a drag; panning or zooming stops
  the glide; reduced motion jumps.
- **Changed 2026-10-26 (#429, #435):** one row with no ⋯, and a second row under it for how
  the shape is filled. For a box:
  `− 6 × 2 + │ ↔ 2 ↕ 2 steps 🔗 │ ↻ 0° ⌖▾ ⇋ ⇵ Recalculate │ ⌇ ☆ │ Place`, and under it
  `Grid ▾ │ Short back ▾`. The second row holds the **mode menu** first (owner, 2026-10-27: a
  menu like the layout menu, its button naming the mode; each row has one hand-drawn example of
  that mode, the same for every kind, beside the mode's name), then a divider and what that
  mode has: the box's **layout menu** in Grid, the **leftover menu** ("Leftover: Back",
  the odd spot's side and gap or spread) in Outline, **Reshuffle** and **Edge** in Spread
  ([How the shape is filled](#how-the-shape-is-filled)). Reshuffle's caret opens the spread's
  **seed**, to type one or copy it, for people who want a spread back exactly. A kind with none of
  these has no second row. **⌖▾** is the pivot: its icon is the 3 × 3 grid with the pivot lit
  (none for a pivot dragged on the field), and it opens the grid. Everything the inspector did
  for a shape is here, so the inspector shows nothing of an open or selected shape.
- In that row (#429): **↻** beside the degrees adds 90° to them; the degrees can still be dragged
  or typed. The flips are icon buttons. **Close up** shows only when a placed shape has empty spots
  (#392). Pathways and ☆ Save don't change the shape, so they come last, before Place. The spacing
  lock is always the chain icon. Every control is at least 24 px, and every tooltip is the app's
  own, with its key.
- **Recalculate** shows only its greyed icon while it would change nothing, and its tooltip says
  why. When it can act, its word springs open and it's tinted with the accent for 1.2 s, so the
  change is easy to spot (reduced motion: the word appears at once).
- On toggles (Pathways, the spacing lock) are the accent color on a light accent tint (#426). The
  editor, its menus and the drag readout by the pointer are solid, in both themes.
- Before 2026-10-26, for a box: `6 × 2 │ ↔ 2 ↕ 2 steps 🔗 │ ⋯ │ Place`, and for a path kind (line,
  arc and others): `Line │ 2 steps apart │ ⋯ │ Place`.
- What appears is the kind's **primary** parameters, declared by the kind
  ([The kind contract](#the-kind-contract)); the chip knows nothing else about the kind. Sizes
  read as across × deep ("8 × 4"), never as files and ranks.
- ~~**⋯** opens a second row with the less common actions: rotate 90° each way, flip, who goes
  where, and "More in inspector →".~~ Changed 2026-10-26 (#429): there's no ⋯; everything is on
  the one row above.
- A press on the editor's buttons and numbers doesn't take the keyboard focus, so Enter still
  places and Esc still cancels after using them. Tab still reaches the numbers.
- **Place** shows only while the shape is new. A placed shape that is selected saves each edit on
  release, so its editor has no Place.
- **It fades when you're not using it** (#426, #430, #432). With the pointer away from both the
  shape and the editor, the editor fades to 40% so the field under it shows. It waits 500 ms
  before fading and turns solid at once when the pointer is back. It stays solid with the pointer
  over the shape or the editor, with keyboard focus in it, or with one of its menus open, and it
  stays faded during a drag on the field. The same goes for a selected placed shape's editor. Touch
  screens and reduced transparency keep it solid; reduced motion drops the fade but keeps the wait.
- After a sketch, a row of guesses sits above the numbers.

### Numbers you can type or drag

Every number in the editor works the same way. Owner choice, 2026-10-16.

- **Click** a number to type over it. Enter applies it, Esc cancels, and clicking away applies it.
- **Exact intervals (#424).** A spacing can be typed as `2`, `2.5`, `2½`, `1⅔`, `1 2/3`, `1-2/3`
  or `5/3`, with or without "steps". It's kept exact (1⅔ is 5/3 of a step, read in the field's
  step grid; owner, 2026-10-25), and the same parser reads interval lists and the command bar.
  An interval list (#526, spec #522) is groups of marchers, count × interval: `2*3+4*2` is 2
  marchers at 3 steps, then 4 at 2 (`x` for `*` and `,` for `+` work too, so `2x2⅔, 4x2`). One
  group may go without a count: it's the rest, and where it's typed puts the counted groups at the
  start (`2.5+3*4`), the end (`3*4+2.5`) or both (`2*3+2+2*3`). Without a rest the last group grows
  to take extra marchers; with too few, groups drop from the end; the seam between two groups is
  the larger interval. The old interval × gaps form (`2⅔x3`) is gone. A Line spaced by groups
  shows a chip per group in the editor (`2 × 3 │ 4 × 2`), each count and interval typed or
  dragged, `+` to add a group and × to remove one, a grown group marked `+4`. Halves, thirds and quarters show as fractions (2½, 1⅔, 2¾); anything else shows
  to 2 decimals. Saved shapes and the command bar bring an interval back exactly. A box with a
  spacing off the half steps doesn't creep when its count or a side changes: the marcher held in
  place stays put.
- **Drag** a number to change it. Each number has a drag direction:

  | Number                    | Drag                                                                                                        | Step            |
  | ------------------------- | ----------------------------------------------------------------------------------------------------------- | --------------- |
  | Side-to-side spacing (↔)  | Right for more, left for less                                                                               | ½ step per 8 px |
  | Front-to-back spacing (↕) | Up for more, down for less                                                                                  | ½ step per 8 px |
  | Any other single value    | Up for more, down for less                                                                                  | ½ step per 8 px |
  | A box's size (6 × 2)      | Sideways for more or fewer across, up or down for more or fewer deep. It locks to the first direction moved | 1 per 16 px     |
  | Rotation (in the editor)  | Right turns clockwise                                                                                       | 1° per 2 px     |

- **Dragging a spacing catches the field's lines (#452, #453).** As the box grows from its pivot,
  when one of its corners or its center comes near a yard line, hash or sideline, the spacing
  settles where that point is exactly on the line, with the guide
  ([Snapping and guides](#snapping-and-guides)). It works at any turn, for a box in every mode; not
  for a circle. Typing and the − / + buttons never do this: typed stays exact, − / + stay on half
  steps. The spacing never goes under half a step.
- **Alt** while dragging a spacing gives hundredths of a step (#411), and a corner or the center
  still lands on a line it comes near (owner on #453). **Cmd** (Mac) or **Ctrl** snaps nothing. A
  dragged rotation snaps to 15° (#403), whole degrees with **Shift**, free
  with **Alt**.
- A number lights up while it's being dragged, and its cursor shows its drag direction.
- A drag that ends where it started changes nothing; it doesn't round the value.
- A size change keeps the spacing and grows from the pivot (back-left by default; changed
  2026-10-17). A box squashed to one rank and dragged back gets its old front-to-back spacing
  back.
- These pixel rates are first guesses, to be tuned by feel.

### The ratio lock (box)

- A link button at the end of the box's numbers locks its two spacings together. Off by default.
- While locked, changing one spacing changes the other by the same proportion, whether by
  dragging, typing or a handle.
- Both spacings stay on half steps, so the ratio is as near as half steps allow (4.5 makes 5, not
  5.14). Owner, 2026-10-16. Alt still gives exact values.
- A typed value, or one that landed on a field line, drives the other spacing at the exact ratio;
  at ratio 1 it's copied (#424, #427).

### How the shape is filled

A box (and a circle) is filled one of three ways, picked in the mode menu on the editor's second
row: **Grid** (rows and files), **Outline** (round the edge, the middle empty) and **Spread**
(evenly over the whole shape, with no rows).

- **Every mode switch keeps the shape drawn (#449, #451).** The center and turn stay exactly, and
  each side stays within half a step. Into Grid, the box keeps its file count when that fits,
  otherwise it takes the nearest count with near-square cells. Into Outline, the sides follow the
  frame's proportions when they fit. A circle keeps its radius.
- **Each mode remembers its numbers (#451).** Going back to a mode you left gives back exactly
  what it had (Grid's count and spacings, Outline's sides and gap, Spread's seed), so switching
  back and forth never walks the box. Reshaping it in between (a handle, a typed size, − / +, a
  spacing) makes the box as it is the new starting point.
- Exceptions: an outline too small to go round with spots at least half a step apart grows to fit;
  under 4 marchers an outline is a line; a box with no area (one rank or file) keeps its spacings.
- **Outline across and deep (#458/#459):** _placeholder: filled in by the #459 session._
- **Spread fills the frame you drew (#439, #440).** The frame (center, size, turn) is what the
  designer set. Reshuffle and a typed seed change only which even layout is used, never the frame.
  A handle moves its own side to the pointer and holds the opposite side. The spacing is whatever
  fits the marchers in the frame, never under half a step: a handle stops there, and a switch into
  Spread whose frame is too small for the count grows the frame from its center just enough (the
  one time the frame grows). Typing a spacing scales the frame about the pivot. Spreads placed
  before this keep their layout when a file is reopened.
- **Edge (#450, #454; owner's pick C).** A toggle in Spread, beside Reshuffle. Some marchers stand
  along the outline, about 1½ spacings apart and never closer than one, with a spot on every corner
  of a box; the rest spread over the whole frame around them, right up to the edge, so the two read
  as one spread. Reshuffle moves only the inside. Turning it on or off keeps the frame. With too few
  marchers for an inside, everyone stands on the edge, and the tooltip says so; otherwise it says
  how many stand on the edge and how many inside. Boxes, circles and closed Lines; it's hidden for
  other shapes.
- **A closed Line (#529)** is filled the same three ways. It closes by a click on its first point
  while clicking points, an end dropped on the other, or Closed in its Open or closed menu.
  **Outline** is the line itself, a marcher on every corner and a gap for every marcher (the last
  back to the first), with its spacing menu. **Grid** is the widest square grid that has room for
  everyone inside the drawn outline, any extra spots off its back rank; **Spread** (and Edge) fill
  the drawn outline. In Grid and Spread the drawn outline is the shape, so the spacing is whatever
  fits, and typing one grows the outline from its pivot. **Open** turns it back into a line
  through the spots its outline has.

## The kind contract

Built in #345. A kind has two parts: the **shape** part (its parameters and a count give its
spots) and the **tool** part (draw, handles, move, get and set the frame, settle). On top of
that, each kind declares:

- **Its parameters, once.** Each has a unit, a default (the command bar's first answer), a range,
  whether it is **primary** (shown in the chip), its **drag direction**, whether it is an
  **interval** (a spacing), and whether it **can blend over time**. The blend flag is recorded
  only; nothing reads it until transforms over time are built (#355). The chip, the inspector,
  the command bar's steps and a later API all come from this one list.
- **How it scales:** by **interval** (its spacings change in half steps) or by **footprint** (no
  regular spacing, such as a natural fill: its size changes in steps).

Guardrails for shapes with unassigned spots later (#358):

- **The count comes from the host.** Kinds receive the spot count and never read the selection.
- **Spots and who goes where stay separate steps.** Least travel stays behind its replaceable
  solver.
- **All placing goes through one host function**, for new shapes and edits of placed ones.
- **The "needs marchers selected" rule lives in one place.**

## Transforms

- **The Transform section** in the inspector is for a **plain selection** (not a shape): the
  pivot grid, rotation and flips, writing positions only, with no recipe. **Changed 2026-10-26
  (#435):** a shape, open or placed and selected, turns, flips and picks its pivot in the floating
  editor, so the section hides then. The inspector's ½-step scale (closer / wider) is gone: the
  editor's spacings cover it.
- **Scale by interval**, never by percentage: spacings change in half steps. A shape
  with uneven gaps (4, 4, 2) changes every gap by half a step. Footprint kinds scale their
  footprint in half steps. Resize handles snap the spacing to half steps (Alt for hundredths, still
  catching the field's lines; Cmd/Ctrl for no snapping, owner on #453), with a
  length readout while dragging a long shape. There are no percentage scale buttons anywhere.
- **Outline: both spacings are the designer's, held exactly** (#458; owner on #459). The back
  and front stand at the across spacing and the sides at the deep spacing, a marcher on every
  corner, as Grid's files and spacings work: setting 2 steps across and then 3 deep leaves both
  exactly so (half steps; typed exact, Alt fine, Cmd/Ctrl free), and the box's size follows,
  width = gaps across × across, depth = gaps down a side × deep. Setting one again changes
  nothing.
  - **Handles set the spacing, as Grid's do.** Dragging an edge sets that way's spacing, the
    counts on each side kept, so the edge follows the pointer (by half steps of the spacing; Alt
    hundredths, Cmd/Ctrl free) and the opposite edge stays put; a corner sets both. The edge lands
    on a yard line or hash within the pull's reach, Alt included. Marchers move between the sides
    only by Even out, a count or a mode change, never by a drag (owner on #459: a split-choosing
    drag kept stopping, "I kind of want it to do what I tell it to").
  - **Even out** (beside Recalculate, and in the command palette) takes the box as it is and
    picks the split and spacings that come as near one spacing all round as that frame allows.
    They may be off the half steps, shown as about so much ("≈"), until set. One undo step;
    greyed out when there's nothing more to even.
  - **A spacing off the half steps shows as about so much**: a small "≈" button before the
    number puts it on the nearest half step; the number itself types and drags as any other.
  - **Switching to Outline keeps the frame** (owner on #458): the split whose two spacings come
    nearest each other, each its length over its gaps, so a mode switch keeps the box drawn as
    #449 asks; they may show "≈" until set or evened out. Moving the box never changes them.
  - **A count changed** (− / +) keeps both spacings; the lengths follow.
  - **An odd count: the full sides are the reference.** The across and deep spacings are always
    the full sides', and the frame is full gaps times them. The leftover side adjusts: spreading
    evenly, its marchers share its whole length one gap fewer (wider apart); leaving a gap, they
    keep the full spacing. When the spread side's spacing differs from the full sides', a muted
    note follows the Leftover menu, "· ↔ 4 steps" (↕ for a side front to back, "≈3¾" off the
    half steps): small, not a control, and the menu's tooltip and description say why ("The back
    has one fewer marcher, so its marchers are 4 steps apart."), since the chip's number is the
    full sides' (owner on #459, style B2).
  - Outlines stored before keep their numbers until edited (an `exact` that some builds of #459
    wrote is read past).
- **The pivot.** A 3 × 3 grid (the floating editor's pivot menu for a shape, the inspector for a
  plain selection), the center by default. On the field, Cmd/Ctrl-drag
  from the center dot pulls the pivot out into its own yellow crosshair, which can then be
  dragged directly; double-click sends it back to the center. It snaps to marchers, the frame's 9
  points and half steps; Alt turns snapping off. Turning, flipping and scaling all go around it,
  and it stays where it is on the field: flipping twice puts the shape back (flipped around its
  right edge, the grid then lights the left edge). It is saved with the shape; new shapes start
  centered. A plain drag on the center dot still moves the shape. The crosshair is drawn over the
  handles, so a pivot on a corner marcher is grabbed before that corner's handle.
- A shape remembers its rotation, flip and pivot when selected again. The rotate knob turns with
  the shape.

## Focus: the start flag

The open shape's hollow rings, walk lines and least travel start where each marcher stands at
the **start flag**, not where they stood on this page, so the shape shows the move being written.

- Expert: the start flag's position.
- Basic: the hidden start flag at the start of the page holding the playhead.
- At home (playhead at 0): the marchers' home spots.

## On the field

### Handles and gestures

- **Corner and side handles** resize. What a resize means is the kind's choice, for example a
  box stretches its spacing (06). The inspector's "When I resize" rule can make a box keep its
  spacing and change how many across instead.
  - Shift on a corner keeps the proportions. Alt resizes from the center.
- **A rotate knob** sits above the shape's top edge on a short dashed stem.
  - It turns with the shape, so after a 90° turn it's on the side (owner, 2026-10-16).
- **Just outside a corner** also rotates, as in design apps: diagonally past the corner, within a
  short reach of it. Past an edge is still the body, which has a margin.
- Both rotations turn **around the pivot** chosen in the editor's pivot menu. While rotating, the pivot
  shows as a yellow dot with a dashed line to the cursor, and a tip shows the angle. It snaps
  to 15° (#403), whole degrees with Shift.
- **A center dot** (white, with an accent ring) moves the whole shape in half steps. While
  dragging, a tip reads the position in drill terms ("3.5 in from S2 45 · 8 in front of back
  hash"). It matters most on crowded shapes, where pressing the body tends to land on a marcher.
  Dragging the body still moves the shape too.
- With a shape open, the nudge keys move the whole shape (07). `[` and `]` don't step a box's
  count across any more: they hold for playback speed (#216). Dragging the size, and its − and +
  buttons, do it instead (owner, 2026-10-16).
- Turning snaps to 15°, as the field's rotate handle does (#403); whole degrees with Shift; Alt
  doesn't snap. A typed rotation is kept as typed. A turn that lands on a quarter
  turn puts the box back on the half-step grid, which can shift it by up to a quarter step.
- A box turned off the field's axes can't stand on the grid: moving it moves it in whole half
  steps instead.

### Snapping and guides

- Positions and spacings snap to half steps, and a corner, side or center near a yard line, hash
  or sideline lands on it (#425, #444, #446, #452). The lines are the field's reference
  checkpoints, seen or not (the front sideline and grid hashes pull too), plus half lines when the
  field has them. This works on custom fields too.
- **Drawing and stretching (#425, #427, #446, #448):** a moving corner that comes near a line lands
  on it, and the spacing becomes whatever that takes, kept exact (7 files from the 40 to the 50 is
  2⅔). The fixed side never moves. Away from lines the half-step ladder still decides.
- **Moving (#444, #445, #446, #448):** on each field axis, the nearest of the box's corners and its
  center pulls onto a line (centering a block on the 50 or a hash is common). On a tie a corner
  wins.
- **Turned boxes** work the same at any angle (#446): one rule for corners and the center, not
  only for boxes square to the field. A corner near both a yard line and a hash lands on the
  crossing.
- **Dragging a spacing (#452, #453):** see [Numbers you can type or drag](#numbers-you-can-type-or-drag).
- **Gentle:** the pull reaches only 6 px on screen, less when a half step is small on screen, so
  every half step stays reachable. The circle declares no snap points, so it moves on the half
  steps alone.
- **The guide** shows while a point is on a line, and clears on release. It's an orange line across
  the whole field, with its name at the field's edge as the coordinate sheet names it ("On 50",
  "S1: On 40", "On FH"). A side lying along the line is drawn thick; a corner or center on a line
  with no side along it gets an orange ring. The spots on the line are tinted orange. At a crossing
  both guides show. Orange was the owner's pick from the lab.
- Two modifiers, wherever these guides apply (drawing, stretching, moving, dragging a spacing;
  owner on #453):
  - **Alt: fine control.** No half-step ladder (hundredths, free positions), and the field's lines
    still catch, with the same pull radius on screen. So a turned box's corner slides smoothly
    onto a line instead of zigzagging between half steps.
  - **Cmd (Mac) / Ctrl: no snapping at all.** No ladder and no guides.
  - The pivot pulled out with Cmd/Ctrl keeps snapping while Cmd/Ctrl is still held; only Alt frees
    it. Ctrl+click on a Mac stays the context click (it pans and never reaches a shape).

### Who goes where

- The default is **Least travel**: the assignment with the least total squared walking distance,
  with no walks crossing. A line moving into another line keeps its order because that's the
  least travel, not because of the old order.
- It's decided from where the marchers start the move, not from the spots being replaced.
- It's held still during any gesture, so marchers don't swap spots under the cursor.
- **Changed 2026-10-16:** it's worked out again only after a fresh draw or a change in how many
  across or deep. Stretching, moving, turning and flipping keep each marcher on their own spot, so
  a turned or flipped form is the same form: a flip mirrors it, and whoever was on the left is on
  the right. Without this, turning a symmetric box would visibly do nothing.
- ~~**Drill order** is the other choice, in the inspector and the editor's ⋯ row.~~ **Changed
  2026-10-26 (#429):** drill order is gone; least travel is the only rule. **Recalculate** in the
  floating editor (Shift+R) works it out again on demand, from where the marchers start (the start
  flag), as one undo step, and is lit only when it would change something. A placed shape measures
  from the start flag too, so at home it stays greyed. Turns, flips and uneven stretches can change it;
  slides and even growth don't (the squared rule), and the owner kept that.
- The rule lives behind one replaceable function (`shapes/leastTravel.ts`, `LeastTravelSolver`),
  so it can change later without touching kinds or the tool.

## The inspector

**Changed 2026-10-26 (#435):** the inspector has no shape parts while a shape is open or a placed
one is selected: the mode, layout, leftover, Reshuffle, Close up and ☆ Save are in the floating
editor, and so are the shape's pivot, turn and flips. What stays is for a plain selection: the
**Box** button (B) with **Select box** when the selection is part of a placed shape, and the
Transform section (pivot grid, rotation, flips). The sections below are kept for history.

**Changed 2026-10-20:** the inspector shows the open shape and a **Transform** section for any
selection ([Transforms](#transforms)). The 2026-10-16 tab plan below is kept for history; scale
is back, by interval.

**Changed 2026-10-16:** the inspector gets two tabs, **Inspector** (what it shows today) and
**Shape**. The Shape tab switches on by itself when a shape opens or a placed shape is
selected, and back when it closes. The shape list isn't a tab: it's the **Shapes** window
([above](#3-the-library-left-sidebar)). The Shape tab is for exact work; most
people won't need it. Owner choice, 2026-10-15: handles for most people, the panel for those who
want it.

The Shape tab, top to bottom:

1. **Summary**: the shape and its size ("6 × 2 · 2 across, 2 deep").
2. **Position**, in drill terms: side to side ("3 out from S1 45") and front to back ("7 in front
   of back hash").
3. **Pivot and rotation, on one row.**
   - Pivot: a 3 × 3 grid of the frame's corners, edge midpoints and center. The center is the
     default.
   - Rotate: one number you type or drag (see the table above). There are no preset rotate
     buttons. It turns around the pivot.
4. **Flip**: side to side, and front to back. Around the pivot. Flips are on the field's axes,
   so "side to side" swaps side 1 and side 2 however the shape is turned (2026-10-16).
5. ~~**Scale**~~: left out for now; the handles and the numbers cover size (owner, 2026-10-16).
6. **When I resize** (box): **Stretch spacing** (default) or **Keep spacing**. Keep spacing makes
   the handles add or remove marchers across instead.
7. ~~**Who goes where**: **Least travel** or **Drill order**, with the longest walk and the total
   walking distance underneath.~~ Gone (#429): the floating editor's **Recalculate** works it out
   again.
8. **Place**, **Cancel** and **☆ Save**.

With nothing open, the tab says how many marchers are selected and how to start a shape.

## Marcher styling

### While a shape is open (owner principle, 2026-10-25, #417)

The field shows three things, and nothing that repeats them:

1. **Where the shape's marchers come from**: a faint ghost dot in each marcher's own color at the
   start flag, plus the walk lines when **Pathways** is on.
2. **Where they go**: the shape's spots.
3. **The rest of the page, as readable context**: everyone else faded (40%, labels too), with
   their own previous paths (start flag positions, N) kept if that view is on.

Anything that duplicates these is hidden while the shape is open: the shape's marchers' current
dots and labels, and their previous dots and paths. The stored settings don't change; placing or
dismissing the shape brings everything back. A shape waiting away from its moment, during
playback or in Visuals shows none of this.

### Calm when the pointer is away (#403, #413, #430, #431)

The open shape, and a selected placed shape too since #430, is calm while the pointer is away from
it and its editor: its handles, knob and center dot drop to 25% and its fill goes. Over the shape
or a handle, during a handle drag, or with keyboard focus in its editor, everything is back at full
strength. Their floating editors fade the same way ([Layout](#layout)).

### Earlier plan

The table below is the earlier per-stage plan; where it differs, the principles above win.

The marchers and marks at each stage. Owner choice for focus, 2026-10-15: fade everyone who isn't
selected.

| Stage                | Selected marchers                                                         | Everyone else                                                             | Marks                                                                                                                                                                                                             |
| -------------------- | ------------------------------------------------------------------------- | ------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Idle and armed**   | The normal selection style                                                | Normal                                                                    | None                                                                                                                                                                                                              |
| **Drawing**          | Stay where they are, drawn as hollow rings in the accent color, no labels | Faded to about 20%, no labels                                             | The new spots as solid accent dots with a white edge. The outline dashed. No walks yet (06)                                                                                                                       |
| **Open**             | Hollow rings at their start                                               | Faded to about 20%                                                        | The new spots, each labeled with the marcher that will stand there. A thin line from each marcher's start to its spot. The outline solid, with a faint fill on closed shapes. Handles, rotate knob and center dot |
| **Gesture**          | As Open                                                                   | As Open                                                                   | As Open, with spots and walks updating live but the assignment held                                                                                                                                               |
| **Placed**           | Normal, on their new spots                                                | Normal                                                                    | The placed shape's outline and label follow the View setting **Shapes: selected / always / off** (07)                                                                                                             |
| **Placed, selected** | As Open, but on their spots (nothing to walk)                             | Normal (proposed: selecting a placed shape is frequent, so nothing fades) | Outline, handles, knob, center dot and the floating editor                                                                                                                                                        |

- **Labels**: spot labels show for up to 24 marchers. Above that they're hidden, because they
  pile up. Crowded labels shrink rather than drop section letters, and field labels can be turned
  off (owner decision, 2026-10-11).
- **Setting**: Settings › Field offers **Fade the rest** (default) or **Fade only while drawing**,
  which keeps everyone at full strength except during the drag. Owner choice, 2026-10-16.
- **The replaced shape** (where the marchers stood before this edit, when that differs from their
  start) is hidden by default (owner decision, 2026-10-11).
- **Warnings** (from `validate.ts`) color the walk lines: orange for a step bigger than the step
  limit, red for walks that collide. Pointing at a warning shows only its walks. Off-field spots
  get a warning too.
- **Handles** are filled squares on the frame's corners and edge midpoints, the same style as the
  field's other handles (#208).

## Sizes and counts

Every kind must work, and be checked, from 1 marcher to a full band.

- **1 marcher**: the shape is a point at its center. **2 marchers**: its ends.
- **Odd counts**: a box puts the short rank at the back, centered (06). The editor's size says how
  many spots are empty ("· 1 short").
- **Dozens**: the box split prefers the fewest empty spots (06), so 13 is 7 × 2 with 1 short, 25
  is 5 × 5 and 64 is 8 × 8.
- **Hundreds**: Least travel is cubic in the number of marchers. Above `NEAREST_LIMIT` (500) it
  falls back to keeping order. In the prototype, 109 marchers update in under 10 ms.
- **Speed in the app (#455, 2026-10-27).** Panning with a shape open no longer redraws the editor
  or the shape, drags and spacing drags take about half the time they did, and Recalculate's check
  doesn't solve twice. A show with no shapes does no shape work while scrubbing the timeline. Still
  open: panning with a shape open is about 1.2× panning without one, a − / + click is about 100 ms
  under 4× CPU throttle (target 50 ms), and a coordinate write makes 38 calls to main's 36.
  Measured at 48 marchers with 4× CPU throttle.

## Keys

| Key                         | Does                                                   | Status                                                 |
| --------------------------- | ------------------------------------------------------ | ------------------------------------------------------ |
| **B**                       | Box                                                    | Existing                                               |
| **Enter** / **Esc**         | Place / discard (innermost first; Esc is undoable)     | Existing; Esc becomes an undo step (#347)              |
| `[` / `]`                   | ~~One fewer / one more across~~                        | Dropped: they hold for playback speed (#216)           |
| **/** and **⌘K**            | The command bar                                        | Built (#354)                                           |
| Hold or tap **R**           | Favorites ring                                         | Built (#351); F is taken (#340)                        |
| Nudge keys (WASD, arrows)   | Move the whole open or selected shape                  | 07                                                     |
| **Alt+R**                   | Turn the open or selected shape 90°                    | Built (#429)                                           |
| **Alt+F** / **Alt+Shift+F** | Flip the shape side to side / front to back            | Built (#429); flip the marchers with no shape          |
| **Shift+R**                 | Recalculate who goes where                             | Built (#429); in the palette while a shape is up       |
| **Alt** + drag              | Fine control: no half steps, still catching the lines  | Built (#453)                                           |
| **Cmd/Ctrl** + drag         | No snapping at all                                     | Built (#453)                                           |
| Kind letters                | Pick a kind, only inside the ring or the Shapes ribbon | Needs shortcut contexts; deferred (README decision 10) |

All of these go through the shortcut system and are rebindable.

## Out of scope here

- Each kind's geometry, parameters, handles and resize rules: specified shape by shape.
- Filled shapes, staggers and interval locks beyond the box's ratio lock.
- Follow the leader.
- Copying a placed shape to other marchers.
- The custom-shape editor and the custom-outline kind; Freeze as shape (#356).
- Transforms over time: a shape tied to its move, rotating or growing (#355).
- The app-wide command API (#357).
- Sketch-to-recognize.

## Later

- **Shapes with unassigned spots** (#358): a recipe is spots with marchers assigned to them, and
  an empty spot is planned but not built. The guardrails in
  [The kind contract](#the-kind-contract) keep this a host change: kinds already take the count
  from the host, and the "needs marchers selected" rule and placing each have one home.

## Decisions, 2026-10-16

From grilling how to bring this into the app. Built in two pull requests stacked on #181:

- **A**: the shape frame (center, size, turn, flip) under every kind, and the box on it: the
  knob, turning past a corner, the center dot with a drill-terms readout, flips. The floating
  editor replaces the box's readouts, for new and placed boxes alike. Fade the rest, with the View
  setting **While shaping: Fade the rest / Fade only while drawing**.
- **B**: the inspector's **Inspector** and **Shape** tabs, and the toolbar's **Shapes** tab
  (between Select and View). Opening a shape another way (B, the inspector, the command palette)
  doesn't switch the toolbar's tab.
- Later: **C**, the Shapes window, stars, saved and custom shapes; **D**, the favorites ring and
  typed steps; then sketch. A and B leave the seams for them: one catalog of shapes, which holds
  only Box for now, and the ribbon reads its shapes from it.

Further decisions:

- The ribbon shows kinds that aren't rebuilt yet, and Type, Sketch and All shapes…, as greyed
  icons with a "Not built yet" tooltip, Basic mode included.
- Basic mode gets the ribbon, the floating editor, the handles, the knob and the center dot, but
  not the Shape tab, so it always turns around the center.
- A selected placed shape's Shape tab is the same, minus Place and Cancel, plus a muted "from
  page N"; ☆ Save stays greyed until C.

## Decisions, 2026-10-17

From the first round of simulated users on A (`~/ux-sim/shapes/f1/SUMMARY.md`: typing numbers
scored best, surprises worst):

- **The numbers follow the field.** Across is side to side on the field however the box is
  turned: past 45° (up to 135°, and the same the other way round) the bar's size, spacings, − and
  - swap to the box's own deep. Exactly 45° keeps the box's own.
- **The rotation is a number in the ⋯ row**, typed or dragged like the inspector's (right turns
  clockwise, 1° per 2 px in 15° steps, Shift whole degrees, Alt free). The 90° turn buttons are gone.
  **Changed 2026-10-26 (#429):** there's no ⋯ row; the editor is one row, and **↻** beside the
  degrees adds 90° (Alt+R).
- **Resizing grows from the pivot**, and the default pivot is the **back-left corner**, so a
  box stays where it was drawn and grows right and toward the front. The knob and flips turn
  around the same point. Basic mode, with no pivot grid, always uses back-left.
- **Escape on an open, drawn shape** closes it and a toast offers **Undo**, which brings it back
  while the same marchers are still selected. The undo lives only in the toast.
- **After a turn or flip**, who goes where is kept, ~~so neither Least travel nor Drill order is
  lit, with "Kept from your turn or flip · pick one to redo". Picking one works it out again.~~
  until **Recalculate** (#429); the order picker and the "kept" note are gone.
- Tab and Shift+Tab move between the bar's numbers while typing. ~~The ⋯ row's flips have words
  ("Flip ↔", "Flip ↕").~~ The flips are icon buttons with the app's tooltips and keys (Alt+F,
  Alt+Shift+F, #429). On shapes too big to label every spot (over 24), the spot under the
  pointer shows who will stand there.

## Decisions, 2026-10-18

From the second round of simulated users (`~/ux-sim/shapes/f2/SUMMARY.md`: turning fell to 2.0
and flipping to 2.5, all from the back-left pivot):

- **The default pivot is the center again**, for turns, flips and resizes. Around the corner,
  turns swung the box off screen, the knob turned less than it was pulled (its angle was taken
  from the corner), and flips jumped the box a box-width sideways.
- **A flip keeps the angle when the mirrored box looks the same**: a box at 90° mirrored side to
  side still reads 90°, not 270°. A box at 30° really tilts the other way and reads 330°.
- The inspector's summary and the placed box's label follow the field like the bar, and their
  − and + make the box wider on the field.
- **What a new count does (A/B, decided):** the box keeps its spacing and grows or shrinks
  around its center. Keeping its size and refitting the spacing lost clearly with the simulated
  users (`~/ux-sim/shapes/f3/SUMMARY.md`: 1.0 against 2.75 on "the count did what I expected";
  everyone's typed spacing broke).
- **On a turned box, "one more across" really is one more across the field.** A box can only
  have as many ranks as its count allows (8 in 5 ranks is still 2 across), so + used to jump from
  4 to 8. The box's frame now turns a quarter back first, so its own across runs side to side:
  the same grid, the same look, but its angle reads a quarter less (owner, 2026-10-18).
- **The floating editor holds still while the pointer is on it**, and stays inside the field, so
  a button doesn't slide away between two clicks.

## Decisions, 2026-10-20

From grilling the shape host (Q1 to Q41), published as #344. The sections above were updated to
match. In short:

- One host for every kind; kinds declare their parameters (with primary, drag direction,
  interval and blend flags) and whether they scale by interval or footprint.
- Ways in: the Shapes tab next to Alignment, the favorites ring on R, the library in the left
  sidebar, and one command bar on / and ⌘K walking Shape › kind › parameters.
- The frame (center, size, rotation, flip, pivot) is the record. Scaling is by interval in half
  steps. The pivot is draggable on the field (answers open question 1 below).
- The open shape is measured from the start flag.
- Leaving an open shape places it silently; Esc discards and is undoable, with no toast.
  Replaced 2026-10-24 (#416, lab feedback): only Enter or Place places a shape. Away from its
  moment it hides behind a "Shape open at count N" chip with Go back; playing, Visuals and Preview
  hide it until they end; a new selection leaves it open. Enter and Esc act only on a shape you can
  see.
- Same in Basic and Expert.
- Shapes with unassigned spots come later (#358); the host keeps the guardrails for them now.

## Decisions, 2026-10-24 to 2026-10-27

From owner feedback and lab tests on the shape host. The sections above were updated to match:

- Intervals off the half steps are typed and kept exactly; 1⅔ is 5/3 of a step in the field's
  step grid (#423, #424).
- Corners, sides and the center land on the field's lines while drawing, stretching, moving and
  dragging a spacing, at any turn, with an orange guide named as on the coordinate sheet (#425 to
  #452). Alt is fine control that still catches the lines; Cmd/Ctrl snaps nothing (#453).
- The floating editor is one row with no ⋯, plus a second row for how the shape is filled; drill
  order is gone and Recalculate replaces it (#429). Everything the inspector did for a shape is in
  the editor (#435).
- The editor fades 500 ms after the pointer leaves, and placed shapes are calm like open ones (#426,
  #430, #432).
- After an edit, the field keeps the shape and its editor in view, chosen in a lab A/B over holding
  the editor still (#441).
- Spread fills the frame drawn; every mode switch keeps the frame and each mode remembers its
  numbers; Spread can have an edge (#439, #449, #450).
- Performance fixes from the audit, with no behavior change (#455).

## Open questions for the owner

Answered 2026-10-16 (see above): the ratio lock's rounding, the knob, where saved shapes live,
stars, the ⋯ row and scale buttons, and Basic mode. Still open:

1. ~~**Pivot on the field**~~: answered 2026-10-20: Cmd/Ctrl-drag from the center dot, snapping
   to marchers ([Transforms](#transforms)).
2. **Custom shapes:** marchers spread evenly along the outline (as built), so a corner gets a
   marcher only if the spacing lands on it. Should corners always get one?
3. **Flip on the field's axes** (as built in A): "side to side" swaps side 1 and side 2 however
   the shape is turned. Or should a turned shape flip along its own axes, as some design apps do?

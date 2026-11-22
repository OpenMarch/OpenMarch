# 0018: Exact paths: a marcher's walk saved as fixed shapes plus timing

- Status: proposed (decisions from the owner grill, 2026-11-22; awaiting the owner's OK on this
  record)
- Date: 2026-11-22
- Amends: timeline spec D-2 and §11 (sampled motion is never read back as state), for exact paths
  only

## Context

In OpenMarch a move's motion is built from other things: group paths, lanes, Adjust,
follow-the-leader trails, arcs and (soon) pins (ADRs 0016 and 0017). Every marcher's walk is
computed from those parts and stored nowhere (spec D-2). That works inside OpenMarch. It fails in
two places:

- **Other apps.** An app that reads a show file would need OpenMarch's whole path engine to play
  a curved move. The `.om` show file stores only each marcher's spot at each set, so other apps
  draw straight lines between them.
- **Import.** A path drawn in another app, or one of OpenMarch's own paths read back from a file,
  has nothing to land on. None of the editable parts can hold "this exact walk".

The playback format proposed in OpenMarch/schema#1 (`.ompb`) solves only the first problem: it
stores curves as many short straight pieces, for viewers only, and never reads them back.

What's missing is a way to store one marcher's walk as it is: a fixed drawing and its timing that
plays back identically everywhere. You change it by redrawing it, not by editing its parts.

Precedents:

- Blender's **Bake Action** turns constraints and drivers into plain keyframes.
- After Effects' **Convert Expression to Keyframes** does the same for an expression.
- Logic's **Bounce in Place** turns a MIDI region and its instrument into audio.

In each case the result plays exactly as before, can no longer be edited through the parts that
made it, and can be cut, moved and retimed.

## Decision

### 1. What an exact path is

An **exact path** is one marcher's walk during one move. It is authored data, stored as given.
It is not a cache of the resolver. It has two parts, kept apart as in After Effects, where a
layer's motion path (where it goes) is separate from its speed graph (when it gets there):

- **Shapes:** where the marcher walks.
- **Timing keys:** how far along the shapes the marcher is at each moment.

It has no group, lane, Adjust or order structure. The converter flattens those into each
marcher's own shapes.

### 2. Three shapes

A path starts at a point and continues through a list of shapes, each starting where the last
one ended:

- **Points:** straight lines through a list of points. A single straight leg is a list of one
  point.
- **Arc:** a circular arc to an end point, given by its bend (sagitta over chord, signed), at most
  a half turn.
- **Cubic:** a cubic Bézier curve to an end point, with two control points.

These three cover everything OpenMarch draws, exactly:

- corners are points;
- smooth (tension) paths convert to cubics with no error;
- arc legs and the go-around circle are arcs (a full circle is four quarter arcs).

Raw data, such as a path traced or recorded in another app, is points.

Two cases have no exact line, arc or cubic form:

- Adjust on a curved piece;
- a handoff on a curved piece.

These become points, within 1/100 of a step. Fitting cubics to them is parked (see
Consequences).

### 3. Timing is a list of keys in ticks

- **Each key** is a tick and a place on the path.
- **A place is one number: the piece number plus the share of that piece.**
  - Every straight leg is a piece (a points shape with n corners is n legs), and so is every arc
    and every cubic.
  - Pieces are counted from 0. `1` is the end of the first piece (its corner), `1.5` is halfway
    along the second, and the path's end is the number of pieces.
  - This is how Adjust already anchors its keys: a point plus a fraction (ADR 0017).
- **Why a place on a piece, not a distance along the whole path:** when an end spot moves, only
  the end piece changes length. A key tied to a piece stays where it was, so a marcher who reaches
  a corner on count 6 still does. A distance, or a share of the whole path, drifts off the corner,
  and every key after the change would need rewriting. It also keeps apps in step: a key on a
  corner lands exactly there in every app, even if two apps measure a curve slightly differently.
- **Between keys** the marcher moves at a steady speed.
- **Ticks** are counted from the move's start, at **480 per beat**. This is the MIDI PPQ that
  DAWs use and the one schema#1 uses: it divides evenly by 2, 3, 4, 5, 6, 8, 10, 12 and 16.
- **Keys are whole ticks.** A key that falls between ticks is rounded to the nearest one. Step 2
  measures the error this causes.
- **Holds:** two keys at the same place are a hold.
- **Speed changes:** more keys.
- **Speed and shares are measured along the real curve:**
  - straight lines and arcs are measured exactly;
  - a cubic is measured by its true length, not by its raw Bézier parameter (which runs slower at
    the peaks) and not by OpenMarch's 64-chord approximation.

  So an SVG curve played back at an even speed walks equal distances in equal times, and "halfway
  along a cubic" means half its length. After Effects' roving keyframes measure the same way.
- **Two keys never share a tick.** When retiming would round a key onto the same tick as the key
  before it, that key is dropped (never the first or the last; if the last collides, the one
  before it is dropped). The marcher then walks steadily across both places instead of jumping.

### 4. Its ends follow the spots, as current paths do

When the spot at the start or end of the move changes, for example because the set before was
redrawn, the path's first or last point follows:

- **Points:** the first or last point moves.
- **Cubic:** the end moves, and its nearest control point moves with it.
- **Arc:** the end moves, and the arc keeps its bend.
- **Timing:** the keys are unchanged. They name places on pieces, so the marcher still reaches
  every corner, and the end, on the same count. Only the moved end piece is walked faster or
  slower.

The middle of the path doesn't move. Moving the whole path with the marcher is parked (see
Consequences).

### 5. Which edits are allowed

**Allowed:**

- redraw;
- delete;
- split at the playhead;
- shift in time;
- retime (resize the move);
- the start and end following their spots (§4).

**Refused, each with a reason in the UI:**

| Edit | Reason |
| --- | --- |
| Dragging a point or handle | "Exact paths are fixed. Redraw the path to change it." |
| Corner or Smooth | Same reason. |
| Adjust | Same reason. |
| Group path or follow the leader | "An exact path belongs to one marcher." |
| Merge two moves | "Exact paths can't be merged yet." |

Mirror and paste come later.

### 6. One format, fully importable

- **One format:** there is no "export only" subset. Everything a file can say, OpenMarch can store
  and play back exactly.
- **Readers:** a reader that plays the shapes and keys as §2 and §3 say gets OpenMarch's motion.

### 7. Where it lives

- **The type:** the `schema` package (`OpenMarch/schema`) owns the type, because both OpenMarch
  and other apps read it. Until step 5 moves it there, `packages/core` keeps a temporary copy;
  step 5 replaces the copy with an import.
- **Units:** the type itself has no units.
  - Inside OpenMarch it holds field units, y down, like every other coordinate the resolver uses.
  - In a `schema` file it holds steps: x from the center of the field, y up from the front
    sideline, the same as `.om` coordinates today. The file's step size in inches (`inchesPerStep`)
    gives real distances. Flipping y reverses each arc's direction, so its bend changes sign.
- **The file:** exact paths go into the `.om` show file as an optional field in a new version,
  beside the spots they connect.
  - Readers that don't know the field ignore it and draw straight lines, as now.
  - Whether `.ompb` (schema#1, PR schema#2) is still needed once `.om` carries exact paths is
    parked until step 5.

### 8. The converter (step 2)

A pure function in `packages/core` turns resolved motion into exact paths. It builds on R-20
(`walkedPath`), which already gives each marcher's walk as lines, arcs, cubics and polylines with
a beat on every end. The converter adds:

- **Timing keys:** keys in ticks, separate from the shapes, where R-20 puts a beat on every end.
  - The resolver times cubics by the 64-chord table, and an exact path times them by true length.
    Where that difference would exceed the tolerance, the converter adds keys.
  - R-20's polylines carry a beat on every point. The converter keeps only the keys needed to stay
    within the tolerance.
- **Shape names:** R-20's lines and polylines become points.
- **New motion:** pins, handoffs, the entry rule and trail lanes, as the resolver gains them and
  R-20 follows.

It produces exact paths from the resolver and never reads them back. So it keeps to D-2 and §11
as they stand. What changes D-2 is step 3, when an exact path becomes something a designer can
store.

## Consequences

- **D-2 gets one exception.** Positions are still computed, not stored, except along an exact
  path. There the stored shapes and keys are the authored fact. The walk is still computed from
  them at play time, so D-3's caching and D-8's invalidation apply as before.
- **An exact path stops following the parts that made it.** A group path redrawn after a member
  was baked doesn't move that member. This is the point of baking: an After Effects layer whose
  expression was converted to keyframes stops following the expression's inputs.
- **Known limits, parked:**
  - Moving the whole path with the marcher. Today the middle stays put while the ends follow
    their spots.
  - Merge, mirror and paste.
  - Fitting cubics to points (fewer, smoother shapes for Adjust on curves and raw data). The
    format doesn't need to change for it: it would only change what the converter writes.
  - Facing and turns.
  - Whether `.ompb` stays.
- **Steps:**
  - Step 3 stores exact paths in OpenMarch: an exact-path kind on an own lane, a migration, the
    next free file version. v0.1.7 files still open, and older builds refuse the new files.
  - Step 4 adds the editor basics and "Bake path".
  - Step 5 moves the type into `schema` and adds it to `.om`.
  - Step 6 imports.
- **Two lengths for cubics.** OpenMarch's own routes keep R-14's 64-chord length table.
  Exact paths use true length. The converter bridges the two with extra keys, so neither changes.
  Step 2 measured the cost: lines, arc moves and follow the leader take two keys, and a cubic a
  median of 2 at a real move's size, but up to a few hundred on curves 160 steps across (spec
  Appendix M, "Measured"). Timing OpenMarch's own curves by true length too would remove those
  keys. It would move existing curved paths by well under 1/100 of a step, and it is a separate
  decision.

## Verification

- **Step 2:** convert every move of every marcher in the parity shows
  (`/mnt/ssd/pathways-beta6-tests/`) and in the v0.1.7 release fixtures
  (`apps/desktop/electron/database/__test__/v017-files/`).
  - Play each exact path at every tick of its move, as §2 and §3 say.
  - Compare it with `positionAt` at the same moment. The largest gap must be within **1/100 of a
    step** (0.1125 field units on the default field).
  - The test reports the worst gap per show and the cost of tick rounding on its own.
- **Unit tests** for each shape's length and point-at-place, the key rules (whole ticks,
  places never go backward, holds, two keys never on one tick) and the end-following rules in §4.
- **Steps 3 to 6** add their own checks, ending with export, import and identical playback in
  step 6.

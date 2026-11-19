<!-- cspell:disable -->

# Pathways: draft model (first full draft, for adversarial review)

Status: draft 1, 2026-11-02. **Superseded by [draft-model.md](draft-model.md) (draft 2)**; kept because [fable-review-1.md](fable-review-1.md) cites its sections. Written against fork main f2f3cce41, the spec (`docs/timeline/spec.md`
v0.8), ADR 0012 and ADR 0006. Decisions and open questions live in the [register](README.md); this
file is the concrete model they produce. Every rule here is meant to be exact. Where a rule is a
guess, it says so and names the register entry.

## 0. Summary

1. **One new spec table, `routes`.** A route is resolver data, like a shape: absolute field
   points, logged in the change log, undone by history triggers. Transitions point at it with a
   new `route_id` column.
2. **One new path style, `route`.** A `route` transition walks from where its marcher stands,
   through the route's inner points (moved by the transition's own offset), to its destination.
   Its timing is the route's pins; between pins the speed is constant (S-2).
3. **Follow the leader gains a stored trail.** An FTL transition may name a route as its trail
   instead of a shape. The trail carries its own **slots**; the members **advance k slots**
   (S-8). Today's R-9 is the special case "line up behind the leader, advance into the
   destination".
4. **A group route is a formation.** Several transitions share one route row; each adds its
   member's offset, either sliding (same offset everywhere) or turning (offset turns with the
   route). Editing one member copies the route for it alone (Q3).
5. **Timing is anchored to an absolute beat.** Pins are whole step numbers counted from an
   integer anchor beat at a rational steps-per-beat rate (Q6). Edge drags never rewrite them
   (Q1).
6. **Positions stay bounded.** Every new primitive keeps a point inside the convex hull of its
   origin and bounded authored points, so §8.11's theorem extends unchanged (argued in §6).

ADR 0012 C-8 ("no new path style") is amended by a new ADR; the spec gets a v0.9 with R-14 to
R-17 below. Shape recipes (ADR 0006) stay app data: the app writes routes from them, the
resolver never reads them.

## 1. What the app stores today, in one paragraph

A move is a timeline (a beat range). UI-9 gives each marcher in it its own one-slot shapeless
`direct` (or `arc`) transition spanning the move, with one `timeline_slot_destinations` row
(its end point) and one assignment. The resolver reads `marchers`, `timeline_shapes`,
`timeline_transitions`, `timeline_assignments` and `timeline_slot_destinations` and computes
every position (R-1 to R-13). Shape recipes (`timeline_shape_recipes`) remember how a group of
end points was laid out; the resolver never reads them. FTL exists only in the resolver: a
transition with a spec shape (`dest_shape_id`), whose trail is the line through its founders
plus `waypoints` plus the shape's path (R-9). No UI writes it.

## 2. Storage

### 2.1 New table `timeline_routes` (spec name `routes`)

```sql
CREATE TABLE timeline_routes (
  id           INTEGER PRIMARY KEY,               -- surrogate, undo restores it (C-2)
  timeline_id  INTEGER NOT NULL REFERENCES timelines(id) ON DELETE RESTRICT,  -- the move it belongs to (C-1)
  kind         TEXT NOT NULL CHECK (kind IN ('path','trail')),
  geometry     TEXT NOT NULL CHECK (json_valid(geometry)),
  timing       TEXT CHECK (timing IS NULL OR json_valid(timing))
) STRICT;
CREATE INDEX idx_route_timeline ON timeline_routes(timeline_id);
```

`kind = 'path'` is walked by `route` transitions; `kind = 'trail'` is followed by FTL transitions.
They share geometry so a drawn path can be turned into a trail and back without conversion.

**`geometry`, version 1**

```jsonc
{
  "v": 1,
  // The reference ends, absolute field units. For one marcher's route they are where it started
  // and ended when the route was last fitted; for a formation, the reference point's. Used for
  // headings, the "changed" flag (Q2) and re-fit; never walked directly (§3.1).
  "from": [x, y],
  "to": [x, y],
  // Inner points, absolute field units, in walking order. May be empty (a straight route with
  // pins only, e.g. a midset on a straight line).
  "points": [
    { "id": "p1", "at": [x, y], "smooth": false },
    { "id": "p2", "at": [x, y], "smooth": true }
  ],
  // FTL trails only (kind = 'trail'):
  "closed": false,                 // a closed outline (circle, box outline, J-22)
  "slots": [                       // places a member can end on, in trail order (S-8, S-10)
    { "point": "p1" },             // on a point
    { "at": 12.5 }                 // or at a distance (field units) from the trail's start
  ]
}
```

- Point ids are short strings, unique within the route and never reused. Pins and slots name
  points by id, so inserting or deleting another point never renumbers them.
- Every number is finite and every coordinate lies in `[−10⁶, 10⁶]` (I-S1 extended, enforced by
  the write functions and checked by a commit-time view, as for shapes).
- A trail's slot distances must increase strictly along the trail. On a closed trail they lie in
  `[0, L)`.

**`timing`, version 1** (NULL means: no pins, rate 1)

```jsonc
{
  "v": 1,
  "rate": [3, 2], // steps per beat as a fraction [p, q] (Q6); [1, 1] by default
  "anchor": 120, // integer beat where step 0 is; the move's start when first written
  "pins": [
    { "point": "p1", "step": 6 }, // be on p1 at step 6 (beat 120 + 6·2/3 = 124)
    { "point": "p3", "step": 10, "until": 12 }, // arrive at step 10, stand until step 12 (a stop, O-21)
  ],
}
```

- A pin's beat is `anchor + step · q / p`. Steps are whole numbers, so the stored values stay
  whole (Q6). The **anchor** is what keeps them whole under edge drags: see §5.1.
- Pins are in route order and their beats increase strictly; `until > step` makes a stop.
  Two pins can't name the same point (a stop is one pin with `until`).
- Every pin's beat lies strictly inside the transition's range. Pins never sit on the move's
  start or end: those are implicit.
- Trails (`kind = 'trail'`) have no pins in v1 (O-1, §4.4).

### 2.2 Changes to `timeline_transitions`

```sql
-- path_style gains 'route'
CHECK (path_style IN ('direct','arc','follow_the_leader','route'))
-- the new column
route_id  INTEGER REFERENCES timeline_routes(id) ON DELETE RESTRICT
-- a route transition has a path; an FTL transition has a shape or a trail; nothing else has a route
CHECK (path_style <> 'route' OR route_id IS NOT NULL)
CHECK (path_style IN ('route','follow_the_leader') OR route_id IS NULL)
CHECK (path_style <> 'follow_the_leader' OR dest_shape_id IS NOT NULL OR route_id IS NOT NULL)  -- I-T5, relaxed
CREATE INDEX idx_tr_route ON timeline_transitions(route_id);
```

A trigger (or the write wrapper's commit check) enforces that a `route` transition points at a
`path` route and an FTL transition at a `trail`, and that a route's transitions are all in its
own timeline.

Changing a CHECK means rebuilding the table (SQLite can't alter one in place). Drizzle generates
that rebuild; the migration test must show that the history and change-log triggers on
`timeline_transitions` are recreated with it (O-2).

**`path_params` by style**, additions to spec §5.2:

| path_style                       | path_params                                                                                                                                                                               |
| -------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `route`                          | `NULL`, or `{"offset": [dx, dy]}`: this member's offset from the formation's reference point at the route's start, field units. Missing means `[0, 0]` (the route is this marcher's own). |
| `follow_the_leader` with a trail | `{"advance": k}` (whole slots, k ≥ 1) or `{"advance_steps": s}` (S-11, steps at the rate's step size), plus `"start": "lineup"` or `"start": "slots"` (§4)                                |

The formation's turning behaviour (§3.3) is a property of the shared route, so it goes in the
route's geometry as `"formation": "turn" | "slide"` (default `turn`, owner 2026-11-02, O-12).

**Destinations.** A `route` transition keeps its one `slot_destinations` row: the route ends
there. An FTL transition with a trail has **no** `slot_destinations` rows: its destinations are
the trail's slots (`p_j = trail.slots[j]`), so `slot_count` equals the number of trail slots and
the commit check E-T6 skips it. The app still writes the end positions it shows from the
resolver, as it does for shapes.

### 2.3 Change log, history, invalidation

- `timeline_routes` gets change-log triggers (`tbl = 'routes'`, row image
  `{id, kind, geometry, timing}`) and history triggers (it joins `tablesWithHistory`).
- The `timeline_transitions` row image gains `route` (the `route_id`).
- §9.4 gains one row: **Route `R` geometry or timing** → recompute `routeGeometry[R]`
  (§7) and, for FTL, `ftlGeometry[T]` of every `T` with `route_id = R`; seed W-3 for each.
  It is the exact analogue of the shape row.
- Deleting a move deletes its routes after its transitions (child first, C-1).

### 2.4 What is not stored

- **Facing.** Stays in the Facing cue (O-22). The resolver supplies the exact direction of
  travel (§7.3).
- **Display state**: selection, which routes are drawn (O-20), the "changed" flag (derived, §3.4).
- **The link to a shape** (O-13): app data. A route generated from a recipe is listed in a small
  app table `timeline_route_sources (route_id PK → routes, recipe_id → recipes, mode)`, outside
  the change log, with history triggers. Editing the recipe rewrites the route in the same edit.
  The resolver never reads it.

## 3. Routes for one marcher or a formation (R-14, R-15)

### 3.1 The path a marcher walks

For a span `s` of a `route` transition `T` with route `R` and offset `o`:

```
A = origin(s)                                  (R-4: where the marcher actually is)
B = destinations[T][slot]                      (its stored end point)
P_i = place(R.points[i], o)                    (§3.3: the inner points moved by the offset)
path(s) = A → P_1 → … → P_n → B
```

The route's `from` and `to` are **not** on the walked path. The first leg always starts at the
marcher's real origin and the last always ends at its real destination, so an earlier edit or a
moved end never makes a marcher jump: it bends the first or last leg (Q2, O-7: the inner points
stay where they are on the field).

**Segments.** Between consecutive path points the segment is a straight line, unless one of its
ends is a smooth point, in which case it is a cubic Bézier:

- At a smooth point `P_i` the tangent is centripetal Catmull–Rom's
  (α = ½) through `P_{i−1}, P_i, P_{i+1}`, with `A` and `B` as the outer neighbours.
- At a corner point, or at `A` or `B`, the tangent of the adjoining Bézier points straight at
  the neighbour (the curve leaves the corner along its chord's direction scaled by ⅓).
- Converting to Béziers makes the SVG export exact (`C` commands, S-4) and keeps every curve in
  the convex hull of its control points (§6).
- (O-10) This choice is a strawman for review: Catmull–Rom gives no handles; designers may want
  them later (`"in"`/`"out"` handle offsets on a point would be an additive v2 field).

### 3.2 Timing: where the marcher is at beat b (R-15)

Let the path's length be `L` and each point's distance along it be `d(P_i)`. The **pins** of the
route become a list of `(distance, beat)` knots:

```
knots = [(0, s.T.start)]
     ++ for each pin: (d(P_pin), beat(step)), and if it has `until`, also (d(P_pin), beat(until))
     ++ [(L, T.end)]
```

For a **founding** span, the distance at beat `b` is the piecewise-linear interpolation of the
knots, and the position is `path.pointAtDistance(distance)`. Two knots at the same distance make a
stop (O-21). That is S-2: constant speed within each piece, an instant change at a pin. Every
pin is hit exactly at its beat; `A` and `B` are returned exactly at the ends (§8.10).

`T.start` is used, not `s.start`, for the same reason as D-7: a span clipped by a steal exits at
the transition's own progress.

**Joins and resumes** (R-16, the entry, Q4, O-4, O-5). A span that is not founding starts at
beat `b₀ = s.start`, at origin `X`, generally off the path. Let `(d_k, b_k)` be the first knot with
`b_k > b₀` that is a **pin** (not the end).

- **No later pin**: walk straight from `X` to `B`, linear in time to `T.end` (today's R-5 rebase,
  as Q4 decided for routes without inner pins).
- **Otherwise** pick the entry length `E`, a whole number of beats, the smallest `E ≥ 1` with
  `|X − R(b₀ + E)| ≤ E · σ` where `R(b)` is the founding position at `b` and `σ` is a normal step
  size (8 to 5, 22.5 in / 0.5625 yd) times the rate (E-2), searched up to `b_k − b₀`. If none
  fits, `E = b_k − b₀` and the entry aims at the pin itself (the marcher stretches to make it,
  and the step is warned, Q5). The marcher walks straight from `X` to `R(b₀ + E)` over
  `[b₀, b₀ + E]`, then follows the founding timing exactly.
- A typed entry count (E-2) replaces the search with that count, clamped to `b_k − b₀`.

This is the rule E-1 asks for: one rule for rejoins and joiners. Its cost is at most
`b_k − b₀` evaluations per non-founding span; it is cached with the span's origin (§9.1 tier 2).
Whether the first-fit search is the right aim (rather than "closest to a normal step") is O-5.

### 3.3 Formations: one route, many marchers (J-8, Q3, O-12)

A route shared by several transitions is a **formation route**. Its `from`, `to` and points
describe the **reference point** (the formation's pivot, by default its centre when drawn). Each
member's transition stores its **offset** `o` from the reference at the start.

`place(point, o)`:

- **`slide`**: `point.at + o`. The formation keeps facing the same way and translates along the
  path; every member walks a parallel copy.
- **`turn`** (default): `point.at + rot(θ(point) − θ₀) · o`, where `θ₀` is the heading of the
  reference path's first leg (`from → P_1`, or `from → to` with no points) and `θ(point)` is
  the heading at that point: the tangent at a smooth point, the bisector of the two legs at a
  corner. Members on the outside of a turn travel farther in the same time, like a wheel. At a
  corner each member's point is the mitre of its two offset legs; past 120° of turning the mitre
  is long and the inside member may loop back, which is flagged (O-12, open for review).

All members share the route's pins, so a formation keeps its shape count by count. A member's
destination `B` is still its own stored point: a group whose ends were laid out by a shape
(ADR 0006) ends exactly on that shape whether or not the transformed route would have put it
there.

Q3: editing one member (moving one of its points, O-8) writes a new `path` route for it alone:
its points are the placed points `place(p, o)`, its offset becomes `[0, 0]`, its timing is a copy.
Later edits of the formation route skip it, because it no longer points at it.

### 3.4 Changed routes and re-fit (Q2)

A route is **changed** for a member when `|A − place(from, o)| > ε` or `|B − place(to, o)| > ε`
(ε = 10⁻⁶). The flag is derived, never stored. **Re-fit** writes a new geometry: the similarity
transform (rotation, uniform scale, translation) that maps the old `from`/`to` onto the actual
ends, applied to every point. Pins are untouched. For a formation, re-fit uses the reference
ends recomputed from the members' actual ends (their mean minus mean offset).

## 4. Follow the leader on a trail (R-17)

### 4.1 The slot sequence

An FTL transition `T` whose `route_id` names a trail `R` has `n = R.slots.length` destination
slots `p_0 … p_{n−1}` at trail distances `σ_0 < … < σ_{n−1}`. Its founders are sorted into trail
order `q = 0 … m−1` exactly as R-9 steps 1–2 and R-12 do (tail first).

**`start: "lineup"`** (into a new place; today's R-9 generalised). The trail walked is

```
pre   = [origin(f_0), …, origin(f_{m−1})]       (the founders' line, tail first, as R-9)
trail = pre ++ R's path (from R.from through its points)
```

with combined slots `c_0 … c_{m+n−1}`: `c_q` = founder q's origin, then `c_{m+j}` = `p_j`.
Founder `q` starts at `c_q` and ends at `c_{q+k}`. **Today's R-9 is exactly `k = n`** (every
founder ends in the destination, the leader on the far end). `k < n` leaves the tail in the old
line; `k > n` is refused.

**`start: "slots"`** (along a shape, J-22, J-23, "advance k"). The members already stand on the
trail. A member whose assignment has `slot_index = j` started on slot `j − k` and ends on slot
`j` (on a closed trail, indexes wrap mod n and distances mod L). Its walked path is a straight
stub from its real origin to `p_{j−k}` (zero-length when it stands there, as it should) then the
trail from `σ_{j−k}` to `σ_j`. A non-zero stub means an earlier edit moved it off the trail; it is
flagged like a changed route.

### 4.2 Evaluation

As R-10: each member moves along its own stretch at its own constant speed, from its start
distance to its end distance over `[T.start, T.end]`. Start and end distances both increase with
`q`, so nobody overtakes (P-5). Spacing may change when slots are unevenly spaced, as today
(S-1, spec Q-7).

**By steps** (S-11, `advance_steps: s`): each member's end distance is its start distance plus
`s · step size`. A member whose end lands between slots ends there; on a shape that means it
leaves the shape (its end is a plain position written by the app). Whether one move may mix
"by slots" for those still in a box with "by steps" for those on a drawn exit is O-28.

**Joins and resumes**: the entry rule of §3.2 with the member's own trail stretch as the path and
no pins: the member heads for the point on its stretch it would occupy `E` beats later. That
replaces R-11's straight fallback and answers spec Q-3 (for review, O-4).

### 4.3 Where trails come from (app side)

| Designer's gesture                     | Trail the app writes                                                                                                                                                                                 |
| -------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Snake a box (S-7)                      | Points = the box's spots in snake order, corners; slots = those points; linked to the recipe                                                                                                         |
| Box snakes into a different box (S-10) | `lineup` start; trail = the connector (if drawn) then the destination box's spots in its snake order                                                                                                 |
| Around a circle or outline (J-22)      | `closed: true`; one smooth point per quarter for a circle is not exact, so a circle trail is stored as its recipe's exact arcs (O-10: either a `"arc"` segment type or keep spec shapes for circles) |
| Exit drawn out of a snake (O-27)       | Trail = snake ++ drawn exit; extra slots along the exit every `spacing` (the snake's last interval by default)                                                                                       |
| Ripple from route A onto route B (E-4) | `lineup` start; trail = connector ++ B                                                                                                                                                               |

### 4.4 Counts in follow the leader (O-1)

The owner's case (2026-11-02): marchers face their direction of travel, then face the front on
count 4, mid-move. That is **two Facing cues** (`facing.travel` from count 1, `facing.front` from
count 4): cues are timed, so everyone changes on count 4 wherever they are on the trail. Nothing
is added to the trail for it.

What stays open is **turning on a count**. In a block-letter trail each member reaches a corner
at its own time, `(d_corner − start_q) / v_q`. The draft adds no time pins to trails. It derives
each member's turning counts (for dot books, S-4) and warns, in a "military" mode, when one
isn't on a whole count (or on the rate's step grid). Whether trails should instead pin the
leader and snap the rest is the question for review.

## 5. Edits

### 5.1 Time edits (Q1)

- **Plain edge drag** of a move with routes: the anchor and every pin keep their beats, so pins
  keep their counts counted from the edge that didn't move. Shrinking the move past a pin (or
  past `until`) is refused with the pin named. No route row is written, only the transition
  range (and R-E1's anchored assignment rewrite).
- **Alt-drag (scale)**: every pin's beat is scaled about the fixed edge, then rounded to the
  nearest step on the rate's grid; if two pins round onto the same step the drag is refused at
  that length. The anchor is set to the new start.
- **Shifting the whole move** (flag drags, `shiftTimeline`): the anchor moves with it, by whole
  beats. Pins don't change.
- **Why an anchor** rather than steps counted from the move's start: with a triplet rate, a
  1-beat start-edge drag moves "the move's start" by 1.5 steps, so steps counted from the start
  could no longer be whole. Counted from a fixed anchor they stay whole. (Q6 as decided only
  holds with this anchor; flagged for the owner.)

### 5.2 Split, merge, the playhead (O-6)

- **Split a `route` move at beat c**: the first half's route is the path cut at the founding
  position `R(c)`: its points before the cut, its pins before c, and its destination becomes
  `R(c)` (split already writes the position at the cut). The second half gets a copy with the
  remaining points and pins; its origin is `R(c)` by R-4, so motion is unchanged at every beat.
  A split exactly at a pin puts that pin's point on the boundary and drops the pin (the boundary
  now pins it). A split inside a stop is refused.
- **Merge** two moves where either has a route: the merged route is first's points, then a
  **corner point at the join pinned at the join beat**, then second's points; direct halves
  contribute no points. Motion is unchanged. Arcs are first converted (O-25).
- **Split an FTL move**: still refused in v1 (`canPeelSlot`), as today.
- Every one of these is one edit and one undo step (history triggers on `timeline_routes`).

### 5.3 Space edits

| Edit                                                       | Result                                                                                                                                                                                                                                                                       |
| ---------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Draw a route for selected marchers (one gesture)           | One route row; one marcher: own route; several: a formation route (`turn`), each transition's offset = its start minus the reference start                                                                                                                                   |
| Drag a point / add / delete a point                        | Rewrites the route row. A formation route: every member follows                                                                                                                                                                                                              |
| Edit one member's point (O-8)                              | Detach (§3.3) then edit                                                                                                                                                                                                                                                      |
| Move a marcher's dot with the playhead mid-move (J-4, O-9) | Inserts a corner point there, pinned to the playhead's step (detaching it from a formation). Repeating on every count gives per-step editing; it's an ordinary route (O-9, owner 2026-11-02). **This replaces O-8's tentative "short move on top"**: see the open item in §9 |
| Move a move's end (destination)                            | The route's inner points stay (Q2); the last leg bends; the route shows as changed; Re-fit is one click                                                                                                                                                                      |
| Make it straight again                                     | Sets `path_style = 'direct'`, `route_id = NULL`, deletes the route if nothing else uses it                                                                                                                                                                                   |

## 6. Bounded positions (§8.11 extended)

The theorem needs each primitive to keep its points inside a bounded set built from its origin
and authored points. The new primitives:

- **Route path**: every point lies on a line or Bézier whose control points are `A`, `B`, and
  placed points `P_i`. Bézier curves lie in the convex hull of their control points. Catmull–Rom
  control points lie within `|P_i| + ⅓·(|P_{i−1}| + |P_{i+1}|)`-style bounds of their neighbours,
  so every control point is bounded by `c·max(|A|, |B|, β′)` with `c` a small constant
  (to be proved, ≤ 2), where `β′` bounds placed points (`β` plus the largest offset, and offsets
  are authored, so bounded). **Unlike arcs, the bound does not compound**: the route's shape
  doesn't depend on the origin except through `A` itself, which enters as an endpoint.
  Strictly, `A` can appear in the hull scaled by up to `c`, so chained routes need either
  `c = 1` (choose the end tangents so the first and last Béziers stay in the hull of
  `A, P_1, …` without scaling A) or the same `√(1+a)`-style induction as arcs. **This is the
  main proof for review (O-3).**
- **Entry leg**: a straight segment from `X` to a point on the path: convex.
- **FTL on a trail**: points on the trail (authored, bounded) and on straight stubs from origins:
  convex, as R-10.
- **Formation `turn`**: placed points are `point + rot(·)·o` with `|o|` authored: bounded.

## 7. Resolver and rendering

### 7.1 Caches (spec §9)

- `routeGeometry[R]`: the Bézier and line segments of the route's points for each distinct
  offset, their lengths (adaptive Gauss–Legendre to 10⁻⁹ relative) and a table for distance →
  segment and parameter (bisection then Newton). Per transition, because `A` and `B` differ per
  marcher: `pathOf[T]` adds the first and last legs. Cost: O(points) to build, O(log points) per
  evaluation. At 2,000 marchers × 20 points this is 40,000 segments, rebuilt only when a route or
  an origin changes.
- `knots[span]`: built with the span's origin (tier 2).
- `ftlGeometry[T]` for trails: the walked trail and slot distances, built like today's.

### 7.2 What the API adds (spec §10)

- `travelDirection(marcher, beat)`: the unit tangent of the path at that beat (exact, the
  Bézier's derivative), `null` during a stop or hold. The Facing cue's "Direction of travel" and
  the new "Against travel" (S-9) read it instead of the count-to-count chord.
- `routeOf(marcher, beat)`: the walked path for display (its segments and knots), so the field,
  the 3D View and exports draw the same thing the resolver walks.
- `stepPositions(marcher, transition)`: the exact position on every step of the rate's grid
  (S-4), for the mobile app and coordinate sheets.

### 7.3 Display

- **Field**: a selected route is drawn from `routeOf` (Béziers sampled only for drawing). Corner
  points are squares, smooth points circles, pins diamonds labelled with their count (`4`, `2⅔`
  for sub-beat pins). Speed between pins colours the leg when a step is too big (Q5). A
  formation is drawn once as a band (O-20); members' own routes follow the Off / Selected / All
  switch.
- **Start-flag paths** (#337) draw the route instead of the chord.
- **Timeline**: pins are ticks on the move's clip; an entry is a hatched lead-in (E-3).
- **3D View, video export**: unchanged; they ask the resolver.
- **SVG export / mobile**: `M`, `L` and `C` commands of the walked path, exact; pins listed by
  count (O-16).

## 8. Worked examples

**A flutter (J-1).** Marcher 7 runs a wiggle over a 16-count move: route with 9 smooth points,
no pins. It walks at one speed from start to end along the wiggle.

**A midset (J-3).** 16 counts, the marcher must pass the 40 yard line on count 8. One corner
point on the 40, pin `step 8` (rate 1, anchor = the move's start). Two pieces, each at its own
constant speed.

**Double time (J-9).** Same move at rate `[2, 1]`: steps are every half beat; a pin at step 9 is
at beat 4.5. Transition bounds stay whole beats.

**Block letter "L" (J-5).** 12 marchers in a line follow the leader: a trail with corner points
at the letter's corners, slots at 2-step spacing along it, `start: "lineup"`, `advance: 12`.
Each member turns at its own time; with even spacing and corners on whole steps from every
slot, everyone turns on a count (§4.4).

**Box snake (J-23).** A 4 × 4 box snakes forward 2 spots. Trail = the 16 spots in snake order
(rows, alternating), corners, `start: "slots"`, `advance: 2`, plus 2 slots on a drawn exit. The
last 2 spots become empty at the tail.

**Straight files into staggered files (S-10).** Box A (straight) snakes into box B (staggered):
`start: "lineup"`, trail = B's spots in snake order, `advance` = 16. A's snake order is the
founders' order (R-12 inherits it), so the line-up runs through A's spots in that order.

**Collision fix (J-2).** One marcher in a 64-marcher formation move: it detaches (its own route
copy), one point is dragged aside at the playhead's count, pinned there. Everyone else is
unchanged.

**A steal and rejoin (J-11).** A soloist's route has pins at counts 8 and 12. A higher layer
takes it over counts 4–6. At count 6 the entry looks for the smallest `E` that reaches the route
at a normal step before count 8; it walks straight there, then follows the route and hits count 8
and 12 on their points.

## 9. Open items this draft adds or sharpens

| Item                                                                                                                                                                                                                                                                      | Owner                    | Note     |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------ | -------- |
| **Mid-move dot drag**: O-8 (tentative) said it adds a short move on top; O-9 (decided) says per-count editing is pins on a route. The draft makes a mid-move drag insert a pinned point (one model, no new layers). Confirm, or keep a short move on top for some gesture | P                        | §5.3     |
| **Anchor** for pins (§5.1): needed for Q6's whole steps under start-edge drags at non-integer rates                                                                                                                                                                       | P to confirm, F to check |          |
| **I-T5 relaxed**: FTL may use a trail instead of a spec shape; FTL with a trail has no destination rows                                                                                                                                                                   | F                        | §2.2     |
| **Catmull–Rom end tangents and the bound** (§6)                                                                                                                                                                                                                           | F                        | O-3      |
| **Circles as trails**: exact arcs need an arc segment type, or circle trails keep using spec shapes                                                                                                                                                                       | F                        | O-10     |
| **Formation corners past 120°**                                                                                                                                                                                                                                           | F                        | O-12     |
| **Entry search cost and aim**                                                                                                                                                                                                                                             | F                        | O-4, O-5 |
| **Military mode for trails**: warn when a member's turn isn't on a count                                                                                                                                                                                                  | P                        | O-1      |

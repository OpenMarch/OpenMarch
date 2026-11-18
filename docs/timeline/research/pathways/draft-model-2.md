<!-- cspell:disable -->

# Pathways: draft model

Status: **draft 2**, 2026-11-02. Draft 1 ([draft-model-1.md](draft-model-1.md)) was reviewed in
[fable-review-1.md](fable-review-1.md); the owner settled the review's questions (register F-1 to
F-6). This draft applies the review's changes. Written against fork main f2f3cce41, the spec
(`docs/timeline/spec.md` v0.8), ADR 0012 and ADR 0006. Decisions and open questions live in the
[register](README.md); the controls are in the [UX sheet](ux-sheet.md).

Every rule here is meant to be exact. Where a rule is still a guess it names the register entry.

## 0. Summary

1. **One new spec table, `routes`.** A route is resolver data, like a shape: absolute field points
   and pins, in the change log and under undo. It has no owner column; transitions point at it
   with a new `route_id`, and the app deletes a route when nothing points at it.
2. **One new path style, `route`.** A `route` transition walks from where its marcher stands,
   through the route's inner points (placed by the transition's offset), to its destination. Pins
   are exact fractions of a beat from the move's start; between pins the speed is constant (S-2).
3. **Steps per beat is a transition column** (`rate_num`, `rate_den`), for every path style (F-3).
4. **Follow the leader can follow a stored trail** with its own spots. `lineup` (into a new place)
   is exactly today's R-9 with the trail in place of the shape's path; `slots` (along a shape:
   snakes, outlines) starts each member where it stands on the trail.
5. **A shared route is a formation.** Each member walks the route offset by its own offset, in
   lanes that turn with the path (round outside corners, trimmed inside ones), or slide.
6. **Positions stay bounded by a constant**, `max(|A|, 7/3·β′)` per route span; only arc pieces
   add to the spec's `√(1 + a)` bound (§6).

ADR 0012 C-8 ("no new path style") is amended by a new ADR, and the spec gets a v0.9 with R-14 to
R-18 below. Shape recipes (ADR 0006) stay app data: the app writes routes from them, the
resolver never reads them.

### Changes from draft 1

| Draft 1                                                              | Draft 2                                                                                                                  | Why                                                                             |
| -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------- |
| Inner tangents read the marcher's real origin and end                | Inner tangents read only authored points; the legs touching the real ends use the chord rule                             | Bound becomes a constant; upstream edits never bend the inner curve (review §1) |
| Pins as whole steps from an absolute anchor beat                     | Pins as exact fractions of a beat from the move's start (F-1)                                                            | The anchor didn't make counts whole; it only hid the fraction (review §5.1)     |
| Rate on the route                                                    | Rate on the transition (F-3)                                                                                             | Straight moves need it too; the entry rule needs the step size                  |
| Entry undefined for joins, in beats, blind to pace                   | Reference path for joins, entry in steps, on-schedule shortcut, pace-aware budget, horizon = next pin else the end (F-2) | Review §2                                                                       |
| `timeline_id` on routes                                              | No owner column; a commit check that every route is used and its transitions share one range                             | Split by marchers moves transitions between moves (review §3.2)                 |
| No arcs in routes                                                    | A point may carry `arc` (the piece into it is a minor arc)                                                               | Circles as trails, exact arc merges, SVG `A` (review §3.5)                      |
| Formation corners by mitre                                           | Offset lanes: round outside, trimmed inside                                                                              | The mitre is unbounded at a hairpin (review §7)                                 |
| `lineup` with any `k`; `slots` members walk back to their start spot | `lineup` is `k = n` only; `slots` members start where they stand on the trail                                            | Review §4.1, §4.2                                                               |
| Pins can't touch the move's ends                                     | Holds at the start and end (F-4)                                                                                         | Stand-then-go, arrive-then-stand, split inside a stop                           |
| "Exact" Bézier length                                                | A declared length algorithm; knots stored by segment so pins return their point bit for bit                              | Review §6                                                                       |

## 1. What the app stores today, in one paragraph

A move is a timeline (a beat range). UI-9 gives each marcher in it its own one-slot shapeless
`direct` (or `arc`) transition spanning the move, with one `timeline_slot_destinations` row (its
end point) and one assignment. The resolver reads `marchers`, `timeline_shapes`,
`timeline_transitions`, `timeline_assignments` and `timeline_slot_destinations` and computes
every position (R-1 to R-13). Shape recipes (`timeline_shape_recipes`) remember how a group of end
points was laid out; the resolver never reads them. Follow the leader exists only in the
resolver: a transition with a spec shape, whose trail is the line through its founders, its
`waypoints` and the shape's path (R-9). No UI writes it; the split by marchers (UI-25) refuses it
and the time split (UI-27) samples it.

## 2. Storage

### 2.1 New table `timeline_routes` (spec name `routes`)

```sql
CREATE TABLE timeline_routes (
  id        INTEGER PRIMARY KEY,                -- surrogate, undo restores it (C-2)
  kind      TEXT NOT NULL CHECK (kind IN ('path','trail')),
  geometry  TEXT NOT NULL CHECK (json_valid(geometry)),
  timing    TEXT CHECK (timing IS NULL OR json_valid(timing))
) STRICT;
```

No owner column, like `timeline_shapes`: the resolver never reads timelines (R-1). The app keeps
routes alive: an edit that leaves a route with no transition deletes it in the same edit, and a
commit check (`commit_violations`, §2.2) refuses a route nobody uses.

`kind = 'path'` is walked by `route` transitions; `kind = 'trail'` is followed by FTL transitions.

**`geometry`, version 1**

```jsonc
{
  "v": 1,
  // The reference ends, absolute field units: for one marcher's route, where it started and
  // ended when the route was last fitted; for a formation, the reference point's. They feed
  // tangents next to the ends (§3.1), formation headings (§3.4), the "changed" flag and
  // re-fit (§3.5). They are never walked.
  "from": [x, y],
  "to": [x, y],
  // Inner points, absolute field units, in walking order. May be empty.
  "points": [
    { "id": "p1", "at": [x, y], "smooth": false },
    { "id": "p2", "at": [x, y], "smooth": true },
    { "id": "p3", "at": [x, y], "arc": 0.2071 }     // the piece INTO p3 is a minor arc, |arc| ≤ ½
  ],
  // Paths walked by formations only (kind = 'path' shared by several transitions):
  "formation": "turn",          // or "slide"; default "turn" (O-12a)
  // Trails only (kind = 'trail'):
  "closed": false,              // a closed outline (J-22): the trail returns from the last point to the first
  "spots": [                    // the places a member can end on, in trail order (S-8, S-10)
    { "point": "p1" },          // on a point (exact: returns the point bit for bit)
    { "segment": 4, "t": 0.5 }  // or at a parameter on a piece (spots along a drawn exit)
  ],
  "markers": ["p4", "p7"]       // points the dot book names ("turn at the 35: count 9"), O-1
}
```

- Point ids are short strings, unique within the route, never reused. Pins, spots and markers
  name points by id, so editing other points never renumbers them.
- A point has at most one of `smooth: true` and `arc`. `arc` uses the bulge of spec R-8 (positive
  bows toward +90° from the chord) and the same bound `|arc| ≤ ½` (D-15). A quarter circle is
  `tan(π/8) ≈ 0.2071`; a full circle trail is four quarter arcs with `closed: true`.
- Every number is finite; every coordinate lies in `[−10⁶, 10⁶]` (I-S1 extended).
- A trail's spots are in strictly increasing trail position. **Spot** is the stored word and the
  UI word; the register's "slot" means the same thing.
- Corners in a trail are walked as corners. Rounding one is a point edit (S-6).

**`timing`, version 1** (NULL means no pins and no holds)

```jsonc
{
  "v": 1,
  // Beat offsets from the move's start, as exact fractions [numerator, denominator] (F-1).
  "hold_start": [2, 1], // stand at the start for 2 beats, then go (F-4)
  "pins": [
    { "point": "p1", "at": [8, 1] }, // be on p1 at beat start + 8
    { "point": "p3", "at": [32, 3], "until": [12, 1] }, // arrive at start + 10⅔, stand until start + 12 (a stop)
  ],
  "hold_end": [1, 1], // arrive 1 beat early and stand (F-4)
}
```

- Fractions are stored reduced, with `0 < denominator ≤ 48` and integer numerators (`STRICT`-safe
  inside JSON: checked by the write functions and a commit check). Any step on any rate in use
  (1, 2, ½, 3/2, and typed rates with small terms) is representable exactly.
- Pins are in route order; with the holds they form strictly increasing times
  `0 ≤ hold_start < pin₁ ≤ until₁ < pin₂ … < length − hold_end ≤ length`, where `length =
T.end − T.start`. A stop is one pin with `until`. Two pins can't name one point.
- Trails have no pins in v1 (§4.5).

### 2.2 Changes to `timeline_transitions`

```sql
path_style  TEXT NOT NULL DEFAULT 'direct'
            CHECK (path_style IN ('direct','arc','follow_the_leader','route')),
route_id    INTEGER REFERENCES timeline_routes(id) ON DELETE RESTRICT,
rate_num    INTEGER NOT NULL DEFAULT 1 CHECK (rate_num BETWEEN 1 AND 16),
rate_den    INTEGER NOT NULL DEFAULT 1 CHECK (rate_den BETWEEN 1 AND 16),

CHECK (path_style <> 'route' OR (route_id IS NOT NULL AND dest_shape_id IS NULL)),
CHECK (path_style IN ('route','follow_the_leader') OR route_id IS NULL),
CHECK (path_style <> 'follow_the_leader'
       OR (dest_shape_id IS NOT NULL) <> (route_id IS NOT NULL)),        -- I-T5: a shape or a trail, not both
CREATE INDEX idx_tr_route ON timeline_transitions(route_id);
```

- `rate_num / rate_den` is steps per beat, stored reduced (a write check). It is the move's: the
  app writes the same rate on every transition of a move (F-3). Default 1.
- **Kind triggers, both sides** (as `shape_dest_upd` does for shapes): on insert or update of a
  transition's `route_id` or `path_style`, a `route` transition must point at a `path` and an FTL
  transition at a `trail`; on update of a route's `kind`, no transition may be left mismatched.
- **Commit checks** added to `commit_violations`:
  - E-T6 (destination rows) skips exactly `path_style = 'follow_the_leader' AND route_id IS NOT
NULL`. A `route` transition keeps its one destination row.
  - Every route is used by at least one transition.
  - All transitions using one route have the same `start_beat` and `end_beat` (pins are offsets
    from that start).
  - Every pin and hold lies inside the range (a `json_each` over `timing`).
- Changing a CHECK rebuilds the table (Drizzle generates it). The migration test asserts that
  every trigger in `triggers.ts` for `timeline_transitions` and its history triggers exist after
  the rebuild, and that `rowid`s are preserved (history inverses use `WHERE rowid =`).
- The file version is bumped; older builds refuse the file (ADR 0012). O-17 is closed by that.

**`path_params` by style** (spec §5.2):

| path_style                           | path_params                                                                                                                                                                                |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `route`                              | `NULL`, or `{"offset": [dx, dy]}`: this member's offset from the formation's reference point at the start, field units, in the frame of the route's first heading. Missing means `[0, 0]`. |
| `follow_the_leader`, trail, `lineup` | `{"start": "lineup", "waypoints": [...]}` (waypoints as today, between the line-up and the trail)                                                                                          |
| `follow_the_leader`, trail, `slots`  | `{"start": "slots", "advance": k}`: `k` is used only to find a member's start spot when it is off the trail (§4.2); `order_mode` must be `'slot'` (write check)                            |
| `follow_the_leader`, shape           | as today (`waypoints`)                                                                                                                                                                     |

**Destinations.** A `route` transition keeps its one `slot_destinations` row: the route ends there.
An FTL transition with a trail has **no** destination rows: its destination for spot `j` is
`trail.spots[j]`, and `slot_count` is the number of spots. The Set-as-shown and
defined-coordinates code reads those ends from the resolver, as it does for shaped transitions.

### 2.3 Change log, history, invalidation

- `timeline_routes` gets change-log triggers (`tbl = 'routes'`, image `{id, kind, geometry,
timing}`) and history triggers (`tablesWithHistory`). The transition image gains `route`,
  `rate`. `resolver.ts`'s `coalesce` and `localInputsChanged` compare `geometry`, `timing`,
  `route` and `rate` as they compare `params`.
- Deletes are child first (C-1): an edit that drops a route first sets `route_id = NULL` (or
  deletes the transitions), then deletes the route; undo replays it reversed with foreign keys
  off. "Make it straight again" must order its statements that way, or `RESTRICT` refuses.
- **§9.4 gains:**

| Change                       | Local recompute                                                            | Dirty seeds                           |
| ---------------------------- | -------------------------------------------------------------------------- | ------------------------------------- |
| Route `R` geometry or timing | `routeGeometry[R]`; `ftlGeometry[T]` for every FTL `T` with `route_id = R` | W-3 for every `T` with `route_id = R` |
| `T.route_id`, `T.rate_*`     | `pathOf[T]`; `ftlGeometry[T]` if FTL                                       | W-3 for T                             |
| Field step size              | none                                                                       | drop every per-span cache (rare)      |

- **New walk rule W-5:** seeding W-3 for `T` also drops every per-span cache of every span in `T`
  (`knots`, the entry, the walked path). W-3 alone dirties `origin(next(s))`, never `s`'s own
  derived state, so without W-5 a resumed marcher would keep aiming at the old route.
- `TimelineSnapshot` gains `stepSize` (field units per normal step, from the field properties):
  the entry rule (§3.3) needs it.

### 2.4 What is not stored

- **Facing**: the Facing cue (O-22). The resolver supplies the direction of travel (§7.2).
- **Display state**: which routes are drawn (O-20), the "changed" flag (derived, §3.5).
- **The link to a shape** (O-13): app data. `timeline_route_sources (route_id INTEGER PRIMARY KEY
REFERENCES timeline_routes ON DELETE CASCADE, recipe_id REFERENCES timeline_shape_recipes ON
DELETE CASCADE, mode TEXT)`, outside the change log, with history triggers. Editing the recipe
  rewrites the route in the same edit. Editing the route's points by hand drops the link in the
  same edit (the route becomes hand-drawn); undo restores it.

## 3. Routes for one marcher or a formation

### 3.1 The walked path (R-14)

For a span `s` of a `route` transition `T` with route `R` and offset `o`:

```
A   = origin(s)                          the marcher's real start (R-4)
B   = destinations[T][slot]              its stored end
P_i = place(R.points[i], o)              inner points placed by the offset (§3.4)
F   = place(R.from, o),  G = place(R.to, o)   the placed reference ends (never walked)
path(s) = A → P_1 → … → P_n → B
```

**Pieces.** Between consecutive path points the piece is:

- an **arc** when the point it leads into has `arc: k`: `arcPoint(prev, next, k, ·)` (R-8),
  walked at constant speed along its length (closed form);
- a **cubic Bézier** when either end is a smooth inner point;
- a **line** otherwise.

**Tangents (Case B, review §1.3).** At a smooth inner point `P_i` the tangent is centripetal
Catmull–Rom's (α = ½) through its neighbours **among `F, P_1, …, P_n, G`**: `F` stands before `P_1`
and `G` after `P_n`. `A` and `B` never enter a tangent. At a corner, at an arc end, and at `A` and
`B`, a Bézier's control point is one third of the way along its own chord. So the inner curve
depends only on authored data: an earlier edit that moves `A` changes the first piece and nothing
else (Q2, O-7).

**Degenerate cases** (spec §8.10 analogue, each gets a QA-DG case):

- Consecutive points closer than `ε_geom` are one point (the later one is skipped).
- A zero chord on one side of a smooth point uses the chord rule on that side; zero on both sides
  makes it a corner.
- `A = P_1` or `P_n = B`: the zero-length piece is skipped.
- An arc piece whose chord is below `ε_geom` is a line (R-8 already does this).
- `F = P_1` when computing headings: use the first non-degenerate leg (§3.4).

### 3.2 Timing (R-15)

**Length.** Lines and arcs have exact lengths. A Bézier's length is **defined** by the algorithm,
not approximated: split it at `t = ½` by de Casteljau until the control polygon's length minus the
chord is below `10⁻⁹ ×` the chord (depth at most 24), and sum the chords. The same algorithm builds
the distance → parameter table. Two correct implementations then agree bit for bit; the spec
says "exact" only for lines and arcs.

**Knots.** The founding schedule of a span runs over `[T.start, T.end]` (the transition's range, as
D-7; for non-founding spans it is the reference schedule, §3.3). Knots are `(where, beat)` pairs,
with `where` stored as **(piece index, end of piece)**, never as a distance, so a knot on a point
returns that point bit for bit (P-7):

```
knots = [(A, T.start)]
     ++ (A, T.start + hold_start)                               if hold_start
     ++ for each pin: (P_pin, T.start + at), and (P_pin, T.start + until) if until
     ++ (B, T.end − hold_end)                                   if hold_end
     ++ [(B, T.end)]
```

Between two knots the position moves at constant speed along the path (S-2); two knots at one
place are a stop, `travelDirection = null` inside it. Every knot is hit exactly at its beat, and
the ends return `A` and `B` exactly.

### 3.3 The entry: joins and resumes (R-16)

One rule for every non-founding span of a `route` transition (E-1), and for trail members (§4.3).

1. **Reference path.** For marcher `m` in `T`: if its row has a founding span `f`, the reference
   is the founding path and schedule of §3.1–3.2 built from `A_ref = origin(f)`. Otherwise (a
   join, or a join then a resume) `A_ref = F`, the placed reference start: authored, so it needs
   no new cache node. `R(b)` is the reference position at beat `b`.
2. **On schedule.** At the span's start `b₀` the marcher is at `X`. If `|X − R(b₀)| < ε` (10⁻⁶) it
   follows `R` directly: no entry.
3. **Horizon.** `h` = the beat of the next pin after `b₀`, else `T.end − hold_end`, else `T.end`
   (F-2: with no pin left it still rejoins the drawn path, and reaches `B` on time).
4. **Entry length, in steps.** Steps are on the move's rate grid: step `i` is at
   `b₀ + i · rate_den / rate_num`. For `i = 1 … ⌊(h − b₀) · rate_num / rate_den⌋`, take the first
   `i` with
   `|X − R(b_i)| ≤ (b_i − b₀) · σ_eff(i)`, where
   `σ_eff(i) = max(stepSize · rate, |R(b_i) − R(b₀)| / (b_i − b₀))`: a normal step, or the route's
   own pace if it is faster (so a runner who was nudged slightly off its path rejoins it rather
   than being cut to the next pin). If none fits, aim at the horizon itself (`b_i = h`); the step
   is warned (Q5).
5. **Walk.** Straight from `X` to `R(b_i)` over `[b₀, b_i]`, then `R` exactly.
6. **Override.** A typed entry length (E-2, dragging the lead-in on the clip) replaces step 4,
   clamped to the horizon.

Properties: continuous in time (P-1); bounded (§6); at most `⌊(h − b₀) · rate⌋` evaluations of
`R`, cached per span. It is **not** continuous under authoring: a small change to the stealing move
can move the first fit from 3 steps to 4 (the same class of behaviour as quantising in a DAW).
The inspector shows the entry's length and aim so a change is explained. First fit, rather than
"closest to a normal step", is O-5's remaining product call; it is the cheaper and more
predictable of the two.

### 3.4 Formations (J-8, Q3, O-12a)

A route shared by several transitions is a **formation**. Its `from`, `to` and points describe the
reference point; each member's `path_params.offset` is `o`, in the frame of the first heading
`θ₀` (the direction of the first non-degenerate leg of `from → P_1 → … → to`).

`place` and the member's lane:

- **`slide`**: every point is `point + rot(θ₀)·o`. The formation translates; lanes are parallel
  copies.
- **`turn`** (default): each member walks an **offset lane** of the reference path, offset by `o`
  in the moving frame.
  - On straight legs, the lane is the leg shifted by `rot(θ_leg)·o`.
  - At a **corner** turning by `φ`, the member on the outside (its sideways offset on the outer
    side) gets a **round join**: an arc of radius `|o_⊥|` around the corner. The member on the
    inside is **trimmed** at the intersection of its two shifted legs. Both stay within `|o|` of
    the reference path.
  - On **smooth** pieces the lane is `R(t) + rot(θ(t))·o` with `θ(t)` from the derivative.
  - A pin on a corner maps to the round join's midpoint (outside) or the trim point (inside), so
    every member reaches it at the pin's beat.
  - Flags, never refusals: an inside trim that eats a whole leg (`|o_⊥|·tan(φ/2)` longer than the
    leg) is `D-FORMATION-INSIDE`; a lane whose `|o_⊥|` exceeds the radius of curvature has a cusp,
    `D-FORMATION-CUSP`.
- The member's walked path is its lane with the first and last pieces replaced by legs from `A`
  and to `B` (§3.1): a member whose ends were laid out by a shape (ADR 0006) still ends exactly
  on that shape.

All members share the route's pins, so a formation keeps its shape count by count; outer members
travel farther in the same time, as on a wheel.

**Detach** (Q3, O-8): editing one member's lane writes a new `path` route for it: its points are
its placed lane points, `offset` becomes `[0, 0]`, timing is copied. Later formation edits skip it.

### 3.5 Changed routes and re-fit (Q2)

A route is **changed** for a member when `|A − F| > ε` or `|B − G| > ε` (derived, never stored).
**Re-fit** writes new geometry:

- one marcher: the similarity transform (rotation, uniform scale, translation) mapping `from, to`
  onto `A, B`, applied to every point; if `|to − from| < ε` (a loop in place), translation by
  `A − from`;
- a formation: the rigid least-squares fit (Kabsch) of the members' placed ends onto their real
  ends gives the reference end and heading; the start likewise.

Pins are untouched.

## 4. Follow the leader on a trail (R-17)

### 4.1 `lineup`: into a new place

Exactly R-9 with the trail in place of the shape's path: founders sorted by R-12 into `q = 0 …
m−1`; the walked trail is the line through their origins (tail first), then `waypoints`, then the
trail route from its first point; `destOffset` is the line-up's length; the destinations are the
trail's spots; founder `q` targets spot `n − m + q`; non-members queue behind the tail (R-9 step
5); every founder ends in the destination. Members advance by the whole trail (`k = n`); a smaller
advance in `lineup` is not allowed, because members would end on each other's derived origins
(D-5). Vacancies stay at the entrance end (spec Q-5). More founders than spots is refused at write
(I-A4, O-29).

Joins and resumes in `lineup` keep R-11 in v1 (the queued spots have no stretch of trail to enter).

### 4.2 `slots`: along a trail they already stand on

Used for snakes (J-23), outlines (J-22), drawn exits (O-27) and "advance k" (S-8). `order_mode` is
`'slot'`: trail order **is** spot order.

- A member with `slot_index = j` ends on spot `j`.
- **Start distance**: among the trail positions within `ε_on = 10⁻⁶` of its origin, the one whose
  trail position is nearest to spot `j − k`'s. This is where it actually stands, so a time split
  or a nudge along the row never sends it backwards, and a closed or self-crossing trail is
  resolved by the nearest-to-expected rule.
- **Off the trail** (no position within `ε_on`): a straight stub from its origin to spot `j − k`,
  then the trail; diagnostic `D-FTL-OFFTRAIL`.
- Open trail: `j − k < 0` is refused at write (`E-ARGS`). Closed trail: start and end are unwrapped
  distances `d_start ≤ d_end`, evaluated as `trail(d mod L)`, so "ends increase with `q`" holds
  across the seam.
- Each member moves from its start distance to its end distance at its own constant speed over
  `[T.start, T.end]` (R-10). Starts and ends both increase with trail order, so nobody overtakes
  (P-5) whenever the starts came from one schedule; scattered upstream edits can break that and
  raise `D-FTL-ORDER`.

`advance` is the app's gesture ("advance 3 spots" sets each member's `slot_index`); the resolver
uses `k` only for the off-trail stub.

### 4.3 Joins and resumes in `slots`

The entry rule of §3.3 with the member's own hypothetical stretch (spot `j − k` to spot `j`, on the
founders' schedule) as the reference path and the horizon `T.end`. Once on the trail it keeps
trail order with the founders (same schedule, ordered ends), so P-5 holds for members; the straight
entry leg can cross other marchers, as R-11's chord can. `D-FTL-NONFOUNDING` stays, as info.

### 4.4 By steps, and mixing (S-11, O-28)

"By steps" is a **whole-move** mode: every member advances the same distance (`s` steps at the
move's rate), so ends may fall between spots. On a shape that means leaving it: those members' ends are not
spots, so the app writes the move as `route` transitions along the trail's geometry rather than as
follow the leader (open for review: whether that loses anything, O-28). One
move never mixes "by spots" for some members and "by steps" for others: adjacent members would
overtake as soon as `s` is shorter than `k` spots minus their gap (review §4.5). A box snaking out
into a curve uses spots all the way: spots continue along the exit at the box's spacing (S-8).

### 4.5 Counts in follow the leader (O-1)

- **Facing changes on a count** (owner's case: face travel, then front on count 4) are Facing
  cues; everyone changes on that count wherever they are on the trail (O-1a).
- **Turning on a count** is derived, not pinned. With even spot spacing and an advance of `k`
  spots over `D` beats, every member has the same speed; member `q` reaches a corner `D/k` beats
  after the one ahead; all turn on whole counts iff the leader's distance to the corner is a whole
  number of spots and `D/k` is whole. In `lineup` the line-up's spacing is whatever the previous
  move left, so the property also needs that spacing to equal the trail's.
- **Markers** on a trail name the points the dot book lists ("turn at the 35: step 9"). A
  "military" warning flags a member whose marker crossing isn't on the rate grid.
- No time pins on trails in v1: re-timing a trail means changing the advance or the move's length.

### 4.6 Where trails come from (app side)

| Gesture                                | Trail the app writes                                                                                                  |
| -------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| Snake a box (S-7)                      | `slots`; points = the box's spots in snake order, corners; one spot per point; linked to the recipe                   |
| Box snakes into a different box (S-10) | `lineup`; trail = drawn connector (if any) then the destination box's spots in its snake order                        |
| Around a circle (J-22)                 | `slots`, `closed`; four quarter `arc` points; spots at the circle's spots                                             |
| Exit drawn out of a snake (O-27)       | `slots`; trail = snake ++ drawn exit; extra spots along the exit every spacing (the snake's last interval by default) |
| Ripple from route A onto route B (E-4) | `lineup`; trail = connector ++ B                                                                                      |

## 5. Edits

### 5.1 Time edits (Q1)

| Edit                                                           | Pins and holds                                                            | Rows written                       |
| -------------------------------------------------------------- | ------------------------------------------------------------------------- | ---------------------------------- |
| End-edge drag                                                  | keep their offsets from the start, so they keep their counts              | none in `routes`                   |
| Start-edge drag by `Δ` beats                                   | offsets `−= Δ`, so they keep their counts (counted from the end)          | every route of the move, same edit |
| Shift the whole move (flag drags, clip drags, `shiftTimeline`) | unchanged                                                                 | none                               |
| Alt-drag (scale)                                               | `offset × new / old`, exact                                               | every route of the move            |
| Change the rate                                                | unchanged (pins stay on their counts, F-3); only the step display changes | transitions only                   |

Shrinking past a pin, a stop or a hold: `timelineResizeLimits` gains a stop kind `pin` (with the
point and its count), so the drag stops short instead of being refused after release.

A pin's display: its step on the rate grid ("step 8", "step 7½" after a start-edge drag at triplet
rate, F-1), with the count beside it. Scrubbing steps by beat, so the inspector offers "Go to pin"
for sub-beat pins.

### 5.2 Split and merge (O-6)

- **Time split of a `route` move at beat `c`** (UI-27): the first half's route is cut at the
  founding position `R(c)`: its points and pins before `c`; its destination becomes `R(c)` (split
  already writes the position at the cut). The second half gets the remaining points and pins with
  offsets `−= (c − start)`; its origin is `R(c)` by R-4, so motion is unchanged at every beat. A cut
  at a pin's point drops the pin (the boundary pins it). A cut **inside a stop or hold** becomes a
  trailing hold on the first half and a leading hold on the second. Pins at sub-beat times can't be
  cut on (the time split takes whole beats; said in the UI).
- **Time split of an FTL trail move**: exact with §4.2 (each member's start distance in the second
  half is where it stands). Shape FTL keeps today's sampling.
- **Split by marchers** (UI-25) of a formation: the leavers keep pointing at the same route; the
  formation now spans two moves with the same range (allowed: the commit check is on ranges, not
  moves). The field draws one band across both (O-20). Resizing either move then refuses with
  "shared with move N" until one is detached (one click: Detach). FTL keeps being refused.
- **Merge**: one marcher's direct + route or route + route: the merged route is first's points, a
  **corner pinned at the join beat**, then second's points; with Case B tangents the inner curves are
  unchanged, so motion is unchanged. An `arc` half becomes one `arc` point (exact). Two formation
  moves, or a formation and a detached member: refused, naming the formation (F-5).
- All of these are one edit and one undo step.

### 5.3 Space edits

| Edit                                        | Result                                                                                                                                                |
| ------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| Draw a route for selected marchers          | One route row; one marcher: own route; several: a formation (`turn`), each offset = its start minus the reference start, in the first heading's frame |
| Drag, add or delete a point                 | Rewrites the route row; a formation moves every lane                                                                                                  |
| Edit one member's lane                      | Detach (§3.4), then edit                                                                                                                              |
| Drag a dot with the playhead mid-move (F-6) | Inserts a corner point there, pinned at the playhead's beat (detaching it from a formation); a straight move becomes `route`                          |
| Move a move's end                           | Inner points stay (Q2); the last leg bends; changed flag; Re-fit                                                                                      |
| Make it straight                            | `route_id = NULL`, `path_style = 'direct'`, then delete the route if unused                                                                           |
| Edit a recipe-linked route by hand          | The link is dropped in the same edit                                                                                                                  |

## 6. Bounded positions (§8.11 amended)

Notation: `β` bounds authored points (spec); `β′ = β + max|o|` bounds every placed point (`P_i`,
`F`, `G`) and every destination. The proof is the review's §1.2; in short:

- **Route span (Case B).** Catmull–Rom control points of authored neighbours lie within
  `(2/3)·|chord|` of their point (review Lemma 1), so within `(7/3)β′`; the two control points next
  to `A` and `B` are convex combinations. A point on a Bézier is a convex combination of its control
  points. So every position satisfies `|Q| ≤ max(|A|, (7/3)β′)`: a constant, no chain-length term.
- **Arc piece**: Thales, `|Q|² ≤ |prev|² + β′²`. An arc piece leaving `A` counts toward `a` like an
  arc span; arc pieces between authored points are bounded by `β′`.
- **Formation lane (offset lanes)**: within `|o|` of the reference path, so within `(7/3)β′`.
- **Entry leg, FTL trail, stub**: segments and authored or origin points, convex.

**Theorem.** With `a` the number of arc spans and arc first pieces on the dependency path,
`|P|² ≤ max(β, (7/3)β′)² + a·β′²`. Checked by P-13 with the new constant, including chained
stolen route spans; the fuzzer's must-fail mutants gain "tangent from `A`" and "mitre instead of
offset lane".

## 7. Resolver API and rendering

### 7.1 Caches (spec §9)

- `routeGeometry[R, o]`: the inner pieces between `P_1 … P_n` for each distinct offset, their
  lengths and distance tables. **Depends on no origin**, so an upstream edit never rebuilds it.
- `pathOf[T][m]`: the first and last pieces (from `A`, to `B`) joined to the inner geometry, and
  the knots. Rebuilt when the origin changes (W-1) or `T` is seeded (W-5).
- `entry[span]`: the first-fit length and aim (§3.3).
- `ftlGeometry[T]` for trails: as today, plus each member's start distance (§4.2).

Cost at 2,000 marchers × 20 points: about 40,000 pieces with a 32-entry table each (about 10 MB),
milliseconds to build; per-frame evaluation is a span lookup, `O(log points)`, and a few Newton
steps.

### 7.2 What the API adds (spec §10)

- `travelDirection(marcher, beat)`: the unit tangent at that beat (the piece's derivative), `null`
  inside a stop or hold. The Facing cue's "Direction of travel" and "Against travel" (S-9) read it.
- `routeOf(marcher, beat)`: the walked path (pieces, knots, the entry) for display, so the field,
  the 3D View and exports draw what the resolver walks.
- `stepPositions(marcher, transition)`: the exact position on every step of the rate grid (S-4).
- `explain()` reports the span's knots and its entry (length, aim, horizon).

### 7.3 Display and output

- **Field**: a selected route is drawn from `routeOf`. Corner points are squares, smooth points
  circles, arc points circles with a tick, pins diamonds with their step. A leg whose step is too
  big at the move's rate is coloured (Q5). A formation is one band (O-20). A changed route draws
  its bent first or last leg dashed.
- **Timeline**: pin ticks on the clip for the selection; a stop or hold is a bar; an entry is a
  hatched lead-in (E-3).
- **SVG export / mobile app** (S-4): `M`, `L`, `C` and `A` commands of the walked path, exact for
  lines and arcs and lossless for Béziers (the same control points); per-step coordinates from
  `stepPositions`.
- **Dot book** (O-16, O-23): pins and markers listed by step on the rate grid ("step 8 of 24,
  triplet time"), never as a fraction of a count.
- **Issues** (ADR 0009, O-24): collision checks along routes sample the finer of the rate grid and 8
  samples per piece, and test segment pairs of the sampled polylines, not only points.

## 8. Worked examples

**A flutter (J-1).** Marcher 7 runs a wiggle over 16 counts: route with 9 smooth points, no pins.
One constant speed along the wiggle.

**A midset (J-3).** 16 counts; pass the 40 yard line on count 8: one corner point on the 40, pin
`at: [8, 1]`. Two pieces, each at its own constant speed.

**Double time (J-9).** Same move with `rate = 2/1`: the dot book lists 32 steps; a pin at `[9, 2]`
is step 9. Transition bounds stay whole beats.

**Mark time, then go (J-14, F-4).** `hold_start: [2, 1]` on a 16-count route: stands 2 counts, then
walks the route in 14.

**Block letter "L" (J-5).** 12 marchers in a line: a trail with corner points at the letter's
corners, spots every 2 steps, `lineup`. Each member turns at its own time; with the line-up spaced
at 2 steps, corners a whole number of spots from the entrance and `D/k` whole, everyone turns on a
count; markers on the corners put "turn at count n" in each dot book.

**Box snake (J-23).** A 4 × 4 box snakes forward 2 spots: `slots` trail through the 16 spots in
snake order plus 2 spots on a drawn exit, `advance: 2`; each member's `slot_index` is 2 ahead. Split
it at count 4: the second half starts each member where it stands mid-row.

**Straight files into staggered files (S-10).** Box A snakes into box B: `lineup`, trail = B's spots
in snake order. A's snake order is the founders' order (R-12 inherits it), so the line-up runs
through A's spots in that order.

**Collision fix (J-2).** One marcher in a 64-marcher formation: playhead on count 6, drag its dot
aside. It detaches with a pinned corner at beat 6; the other 63 are unchanged.

**A steal and rejoin (J-11).** A soloist's route has pins at counts 8 and 12; a higher layer takes it
over counts 4–6. At count 6 it is off its path; the first step `i` that reaches the path at a normal
step (or the route's pace) before count 8 is the entry; it then follows the path and hits counts 8
and 12. A steal that leaves it on schedule needs no entry. With no pins at all it still rejoins the
path, aiming before the end (F-2).

## 9. Open items

| Item                                                                                                                                                                         | Owner                 | Note                                             |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------- | ------------------------------------------------ |
| O-5: first fit vs "closest to a normal step" for the entry aim                                                                                                               | P (default first fit) | §3.3                                             |
| Resizing a move whose formation spans two moves refuses until detached                                                                                                       | P to confirm          | §5.2                                             |
| Denominator bound 48 for pin fractions                                                                                                                                       | F                     | covers rates with terms ≤ 16 against whole beats |
| `ε_on` for "on the trail"                                                                                                                                                    | F                     | test at the 10⁶ bound                            |
| Should `slots` trails allow rounding a row-end corner by default (S-6 says straight)                                                                                         | P                     | §4.6                                             |
| QA: goldens for a pinned route, a stolen pinned route, a formation at a corner, a snake with a time split; properties P-13 (new constant), P-5 on trails, "pins hit exactly" | build                 | review §10.9                                     |

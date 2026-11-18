<!-- cspell:disable -->

# Pathways: draft model

Status: **draft 5**, 2026-11-03 (§3.6 under revision after [Fable review 3](fable-review-3.md)). Applies the owner's answers to review 2's six questions (Q1 to Q6,
all as recommended) and to prototype round 2 ([proto-round-2.md](proto-round-2.md)): the user edits
a turn and the end shape moves to match (calls A and B), paths become objects you open to edit (P-1). Draft 4 is [draft-model-4.md](draft-model-4.md); draft 3 was reviewed in
[fable-review-2.md](fable-review-2.md) and revised in place into draft 4. Draft 1
([draft-model-1.md](draft-model-1.md)) was reviewed in [fable-review-1.md](fable-review-1.md); the
owner settled that review's questions (register F-1 to F-6) and draft 2
([draft-model-2.md](draft-model-2.md)) applied them. Draft 3 added **turns** (§3.6, register T-0 to
T-2) and made formations **slide** by default (U-1, [proto-round-1.md](proto-round-1.md)). Written against fork main f2f3cce41, the spec
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
5. **A shared route is a formation.** Each member walks the route offset by its own offset. By
   default the lanes slide (parallel copies); turning with the path is an option (U-1).
6. **Positions stay bounded by a constant**, `max(|A|, 7/3·β′)` per route span; only arc pieces
   add to the spec's `√(1 + a)` bound, and turn spans add at most `2β` each (§6).
7. **A turn is a route of kind `turn`**: a pivot (which may travel in a straight line) and an
   unwrapped angle. Each member's distance and direction from the pivot change evenly from its
   start to its end, so the same shape at both ends turns rigidly and a different end shape is
   reached by an even spiral (§3.6). The user edits the turn; the app moves the end shape to match.
8. **Paths are objects.** Dragging a marcher's dot never edits its path; you open the path (click or
   double-click it) and edit its points and pins (P-1).

ADR 0012 C-8 ("no new path style") is amended by a new ADR, and the spec gets a v0.9 with R-14 to
R-19 below. Shape recipes (ADR 0006) stay app data: the app writes routes from them, the
resolver never reads them.

### Changes from draft 4 (owner answers, prototype round 2)

| Draft 4                                                                            | Draft 5                                                                                                                                                                         | Why                                                                                       |
| ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| Formations slide or turn with the path (`heading`)                                 | Formations only slide; no mode stored. A group wheeling round a curve is a turn about the curve's centre (G-1)                                                                  | Owner, 2026-11-03: turning with the path is really an arc, not something a formation does |
| A typed angle snaps to the end spots' `θ + 360°·n`                                 | When the end is one recipe holding exactly the turn's members, typing or winding rotates the end shape about `pivot_to` so the turn is what was typed; otherwise the snap stays | Round 2 finding 1: 4 of 4 meant 270° when they typed 270° (call A)                        |
| Dragging the pivot moves both pivot ends; the end spots stay and the pivot travels | Dragging the pivot makes it the point that stays put and translates the end shape by `p − M(p)`; Alt keeps the end spots and lets the pivot travel                              | Round 2 finding 2: 4 of 4 expected the middle of a gate to stay put (call B)              |
| `turn_shapes` takes both pivot ends from the recipes                               | `pivot_from` is stored; `pivot_to = M(pivot_from)`                                                                                                                              | So a dragged pivot survives recipe edits                                                  |
| ↻ flips direction                                                                  | ↻ and ↺ pick the direction; whole turns go through the end recipe's unwrapped rotation                                                                                          | Round 2 finding 3                                                                         |
| Q1 to Q6 open                                                                      | All decided as recommended                                                                                                                                                      | Owner, 2026-11-03                                                                         |
| Dragging a dot mid-move adds a pinned point (F-6)                                  | Dragging a dot keeps today's meaning (the edit window, UI-10); a path is an object you open to edit, and pins are made there (P-1)                                              | Owner, 2026-11-03: two different gestures shouldn't share one drag                        |

### Changes from draft 3 (review 2)

| Draft 3                                                 | Draft 4                                                                                               | Why                                                                                                                            |
| ------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| The angle is free; the pivot's ends are independent     | The angle is the motion's rotation plus whole turns; `pivot_to` follows `pivot_from`                  | Building prototype round 2: a typed 90° between fixed end spots did nothing visible, and a moved pivot broke rigidity (§3.6.6) |
| Formation offsets in the first heading's frame          | Field axes; only `heading` mode rotates them                                                          | Dragging the first point turned every lane (review 2 §2)                                                                       |
| Same shape = same kind, assignment, lineage             | Same kind, assignment by spot index, same handedness; no lineage needed                               | A flipped end passed and tore the group in two; recipes have no lineage (§1)                                                   |
| Kabsch fit undefined at ties, mirrors and the 180° seam | Closed-form proper rotation, tie rule, mirror warning, seam hysteresis, frozen `turn_fit` with Re-fit | Review 2 §4                                                                                                                    |
| "Rigid turns keep constant speed"                       | S-2 is suspended inside turns whose pivot travels or whose distances change; per-step warnings        | Illustration D: 0.01 to 2.24 steps per count (§3)                                                                              |
| Three `atan2`s, bit-exact claim                         | One `atan2`, turns specified to 10⁻⁹                                                                  | Engines differ in the last bit (§5)                                                                                            |
| Recipe rotation "unwrapped"                             | The three wrapping sites named and changed                                                            | `flipFrame`, `snapRotation`, the rotate drag (§1)                                                                              |

### Changes from draft 2

| Draft 2                                                | Draft 3                                                                                                                                                 | Why                                                                                               |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| Formations turn with the path by default (O-12a)       | Formations slide by default; turning with the path (stored `heading`, renamed from `turn` so it can't be confused with turn routes) is the option (U-1) | Prototype round 1: turning wrecked every block, because members still end on unturned end spots   |
| No way to rotate or scale a group about a point        | Route kind `turn`: pivot, unwrapped angle, pins on the angle (§3.6)                                                                                     | Owner request T-0 to T-2: rotating box, gate turn, turn while travelling, turn into another shape |
| Recipe rotation wrapped to one turn (`normalizeAngle`) | Recipe rotation stored unwrapped; the app compares angles modulo a turn but saves what was wound (§3.6.6)                                               | T-0: 180° → 450° is a 270° turn                                                                   |

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
  kind      TEXT NOT NULL CHECK (kind IN ('path','trail','turn')),
  geometry  TEXT NOT NULL CHECK (json_valid(geometry)),
  timing    TEXT CHECK (timing IS NULL OR json_valid(timing))
) STRICT;
```

No owner column, like `timeline_shapes`: the resolver never reads timelines (R-1). The app keeps
routes alive: an edit that leaves a route with no transition deletes it in the same edit, and a
commit check (`commit_violations`, §2.2) refuses a route nobody uses.

`kind = 'path'` and `kind = 'turn'` are walked by `route` transitions; `kind = 'trail'` is followed by
FTL transitions. A `turn` route's geometry and timing are in §3.6.1.

**`geometry`, version 1**

```jsonc
{
  "v": 1,
  // The reference ends, absolute field units: for one marcher's route, where it started and
  // ended when the route was last fitted; for a formation, the reference point's. They feed
  // tangents next to the ends (§3.1), the "changed" flag and
  // re-fit (§3.5). They are never walked.
  "from": [x, y],
  "to": [x, y],
  // Inner points, absolute field units, in walking order. May be empty.
  "points": [
    { "id": "p1", "at": [x, y], "smooth": false },
    { "id": "p2", "at": [x, y], "smooth": true },
    { "id": "p3", "at": [x, y], "arc": 0.2071 }     // the piece INTO p3 is a minor arc, |arc| ≤ ½
  ],
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
  transition's `route_id` or `path_style`, a `route` transition must point at a `path` or a `turn`
  and an FTL transition at a `trail`; on update of a route's `kind`, no transition may be left mismatched.
- **Commit checks** added to `commit_violations`:
  - E-T6 (destination rows) skips exactly `path_style = 'follow_the_leader' AND route_id IS NOT
NULL`. A `route` transition keeps its one destination row.
  - Every route is used by at least one transition.
  - All transitions using one route have the same `start_beat` and `end_beat` (pins are offsets
    from that start).
  - Every pin and hold lies inside the range (a `json_each` over `timing`).
  - For `kind = 'turn'`: `|angle| ≤ 23040`; every pin's `turned` has `angle`'s sign, lies strictly
    inside `(0, |angle|)` in magnitude and grows strictly in pin order; `angle = 0` has no pins;
    `path_params` of its transitions is `NULL`.
- Changing a CHECK rebuilds the table (Drizzle generates it). The migration test asserts that
  every trigger in `triggers.ts` for `timeline_transitions` and its history triggers exist after
  the rebuild, and that `rowid`s are preserved (history inverses use `WHERE rowid =`).
- The file version is bumped; older builds refuse the file (ADR 0012). O-17 is closed by that.

**`path_params` by style** (spec §5.2):

| path_style                           | path_params                                                                                                                                                                      |
| ------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `route`, `path` route                | `NULL`, or `{"offset": [dx, dy]}`: this member's offset from the formation's reference point at the start, field units, in **field axes** (review 2 §2). Missing means `[0, 0]`. |
| `route`, `turn` route                | `NULL` (a write check): a member of a turn carries nothing of its own (§3.6)                                                                                                     |
| `follow_the_leader`, trail, `lineup` | `{"start": "lineup", "waypoints": [...]}` (waypoints as today, between the line-up and the trail)                                                                                |
| `follow_the_leader`, trail, `slots`  | `{"start": "slots", "advance": k}`: `k` is used only to find a member's start spot when it is off the trail (§4.2); `order_mode` must be `'slot'` (write check)                  |
| `follow_the_leader`, shape           | as today (`waypoints`)                                                                                                                                                           |

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

- **Facing**: unchanged. Marchers face front unless a Facing cue says otherwise (ADR 0004 D-7);
  routes store no facing and nothing defaults to the direction of travel (P-3).
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

### 3.4 Formations (J-8, Q3, U-1)

A route shared by several transitions is a **formation**. Its `from`, `to` and points describe the
**reference point**: when the route is drawn, the centroid of the selected members' starts.
Each member's `path_params.offset` is `o = A − from` at drawing time, in field axes.

`place` and the member's lane. Formations only **slide** (U-1, G-1): there is no "turn with the
path" mode.

- Every point is `point + o`. The formation translates; lanes are
  parallel copies. A translation has no heading, so editing the first point moves no lane but
  the edited part (draft 3 used the first heading's frame, which turned every lane when the first
  point moved: review 2 §2).
- The member's walked path is its lane with the first and last pieces replaced by legs from `A`
  and to `B` (§3.1): a member whose ends were laid out by a shape (ADR 0006) still ends exactly
  on that shape.

All members share the route's pins, so a formation keeps its shape count by count. Lanes are
translated copies of one path, so every member walks the same distance at the same speed. A group
that should wheel round a curve is a turn (§3.6), with the pivot at the curve's centre (G-1).

**Detach** (Q3, O-8): editing one member's lane writes a new `path` route for it: its points are
its placed lane points, `offset` becomes `[0, 0]`, timing is copied. Later formation edits skip it.

### 3.5 Changed routes and re-fit (Q2)

A route is **changed** for a member when `|A − F| > ε` or `|B − G| > ε` (derived, never stored).
**Re-fit** writes new geometry:

- one marcher: the similarity transform (rotation, uniform scale, translation) mapping `from, to`
  onto `A, B`, applied to every point; if `|to − from| < ε` (a loop in place), translation by
  `A − from`;
- a formation: translation only, `from += centroid(A) − centroid(placed starts)`, and `to`
  likewise with the ends.

Pins are untouched.

### 3.6 Turns (R-19; register T-0 to T-2)

> **Under revision.** [Fable review 3](fable-review-3.md) found errors in this section (findings 1
> to 9, 12 to 15). Owner answers 2026-11-03 (T-5): whole turns are stored on the turn route, not in
> the recipe's rotation (recipes stay wrapped), and ↻ ↺ keep the amount and turn the end shape when
> the end can move. The revision is its own ticket, re-checked by Fable, before any turn step.

A turn moves a group around a **pivot**. The resolver stores the pivot at both ends, one angle and
the timing. Every member's start and end come from where it stands and its destination, as for
every route, so a member of a turn carries nothing of its own. Illustrations the owner checked:
`/mnt/data/pathway-proto/turn-illustrations.html` (A same box 180° → 450°, B box into a circle,
C gate turn, D full turn while travelling, E backwards spin).

#### 3.6.1 Storage

`kind = 'turn'`, walked by `route` transitions (`path_params` is `NULL`).

```jsonc
// geometry, version 1
{
  "v": 1,
  "pivot_from": [x, y],   // the pivot at the move's start, absolute field units
  "pivot_to": [x, y],     // the pivot at the end; equal to pivot_from when it does not travel
  "angle": 270,           // degrees, unwrapped; positive turns field +x toward field +y, the
                          // convention of R-8 and of recipe frames (shapes/frame/frame.ts)
  "from": [x, y],         // optional, fitted turns only: the start and end centroids the fit
  "to": [x, y]            // used. Never walked; they feed the "changed" flag and Re-fit (§3.6.6)
}
```

- `pivot_from`, `pivot_to`, `from` and `to` are authored points: finite, within `[−10⁶, 10⁶]`
  (I-S1 as extended in §2.1), so they count toward `β`.

- `angle` is finite with `|angle| ≤ 23040` (64 turns). `angle = 0` is allowed: a pure change of
  distance from the pivot (a circle that grows, a block that opens about a point).
- Degrees, not radians, so typed values (90, 270, 450) are stored exactly. The resolver converts
  once: `Δ = angle × (π / 180)` in IEEE double.
- `timing` is the object of §2.1, except that a pin names how far the group has turned instead of a
  point: `{ "turned": 180, "at": [8, 1] }`, optionally with `until`. `turned` is in degrees from
  the start, has the sign of `angle`, satisfies `0 < |turned| < |angle|`, and grows strictly in
  magnitude in pin order. With `angle = 0` there are no pins in v1 (holds are allowed).

#### 3.6.2 Progress

One **progress** `u(b) ∈ [0, 1]` is shared by every member of the route, so the group stays one
shape on every count when the shape doesn't change. Its knots, in the order of §3.2:

```
(0, T.start)
(0, T.start + hold_start)                       if hold_start
(turned_i / angle, T.start + at_i)              for each pin
(turned_i / angle, T.start + until_i)           if the pin has until
(1, T.end − hold_end)                           if hold_end
(1, T.end)
```

`u` is linear in the beat between knots: constant _angular_ speed between pins, shared by the group.

**This suspends S-2 (constant speed between pins) inside turns, in exactly these cases:**

- **The pivot travels.** Each member's velocity is the pivot's plus its turning, so its speed swings
  even in a rigid turn. Illustration D (3 × 3 block at 2 steps, pivot travelling 18 steps, one full
  turn, 16 counts): a corner member goes from 0.01 to 2.24 steps per count within the move. A rigid
  group cannot walk a cycloid at constant speed, so "keeps its spacing" (T-2, D) and S-2 cannot both
  hold there.
- **Members' distances from the pivot change unevenly** (a spiral into a different shape): a member
  going from 1 to 10 steps out over a 170° share goes from 0.6 to 1.9 steps per count.

It is **not** suspended for a rigid or uniformly scaled turn about a fixed pivot: there arc length
is proportional to `u` for every member, so each walks at constant speed.

The alternative, constant speed along each member's own piece with knots at the shared `u` values,
keeps S-2 everywhere but makes the block shear while a pivot travels (the corner member about half
a beat ahead of the centre at its fastest), and needs the subdivision length rule of §3.2 because
the arc length has no closed form. Shared progress is chosen because the owner wants spacing kept
(T-2, D) and one rule beats a hybrid. Decided by the owner 2026-11-03 (review 2 Q1); the register's S-2 entry
records the exception. Step warnings inside turns are computed per step (§3.6.5), so the
acceleration shows on the clip.

#### 3.6.3 The walked path (R-19)

For a founding span `s` of a `route` transition `T` whose route `R` has kind `turn`:

```
A = origin(s)                          the marcher's real start (R-4)
B = destinations[T][slot]              its stored end
P(u) = pivot_from + u · (pivot_to − pivot_from)
a = A − P(0),  b = B − P(1),  r0 = |a|,  r1 = |b|
```

- **On the pivot.** If `r0 < ε_geom` or `r1 < ε_geom`, the member has no direction from the pivot at
  one end. It walks the straight line `A → B`, positioned by the same progress `u(b)`.
- **Otherwise:**

  ```
  e  = wrap(atan2(a × b, a · b) − Δ)   a × b = a.x·b.y − a.y·b.x; wrap into [−π, π):
                                        wrap(x) = x − 2π · floor((x + π) / 2π)
  dφ = Δ + e                           this member's sweep
  pos(u) = P(u) + (r(u) / r0) · rot(u · dφ) · a,   r(u) = r0 + u · (r1 − r0)
  ```

  This is the polar rule (direction from the pivot sweeps by `dφ`, distance changes linearly) with
  one `atan2` of the angle between `a` and `b`, which is better conditioned near the seam than a
  difference of two (review 2 §5).

- **Ends exact (P-7).** `pos(0)` returns `A` and `pos(1)` returns `B` as stored, not computed.
- **Why it is rigid for the same shape.** If every member's end is its start turned by `Δ` about the
  moving pivot, `B = P(1) + rot(Δ)·(A − P(0))`, then `r1 = r0`, `e = 0`, and
  `pos(u) = P(u) + rot(u·Δ)·a`: the same rigid motion for every member at every `u`. If the end is
  also **uniformly** scaled by `k` about the pivot, `r1 = k·r0` and every member is at scale
  `1 + u·(k − 1)` and rotation `u·Δ`: the same shape, growing evenly (linear in `u`, not
  geometric). A non-uniform stretch is not exact: a 4 × 4 box stretched 1.5× across bows its back
  row by about 0.05 steps at mid-move.
- **A different end shape.** `e` is the member's own share of the turn, less than half a turn. The
  group still sweeps about `Δ`; each member adds what it needs to land on its own end spot. On the
  counts in between the group is not a shape, by design (T-2).
- **Near-ties.** A member almost exactly opposite where the group turn would put it (`|e| > 170°`)
  could flip its winding under a tiny edit. Diagnostic `D-TURN-TIE` names it; the UI shows it as a
  warning on that marcher, with the distance that would flip it ("goes the other way round if its
  end moves 0.7 steps": `r1·(π − |e|)`). The threshold is §9's.
- **Determinism.** `sin`, `cos` and `atan2` are not correctly rounded and differ across engines in
  the last bit. Turn positions are therefore specified to `10⁻⁹` field units (goldens compare at
  that tolerance); ends stay bit-exact (P-7). The "two implementations agree bit for bit" claim
  of §3.2 covers lines, arcs and Béziers, not turns.

#### 3.6.4 Joins, resumes and steals

R-16 applies unchanged with this reference path. A member with a founding span uses
`A_ref = origin(f)`. A member that joins (no founding span) uses
`A_ref = P(0) + rot(−Δ)·(B − P(1))`, the start it would have had in the rigid turn: authored data
only, like `F` for path routes, so no new cache node.

#### 3.6.5 Facing, steps and collisions

- `travelDirection` is the derivative `d pos / du · du / db`, normalised; `null` inside a hold or a
  stop (`du / db = 0`) and for a member on the pivot whose straight line has zero length.
- Steps (Q5) come from `stepPositions` on the rate grid, per member and **per step**, not per piece,
  because speed varies inside a turn (§3.6.2). In a gate turn the outside members take the big
  steps; the warning shows on them.
- When `travelDirection` is `null` for a whole span (a member on the pivot with `A = B`), the Facing
  cue keeps the previous facing (its own fallback).
- A rigid turn never brings two members closer (distances are preserved). A spiral can; the issue
  checker (§7.3) samples turns like any route.

#### 3.6.6 Where the pivot and angle come from (app side)

The app fills them in when the user chooses Turn and keeps them in step afterwards.

**What the end spots fix (found building prototype round 2).** The end spots fix each member's
direction from the pivot at both ends, so they fix the turn **up to whole turns**. With an angle `Δ`
that differs from the motion's own rotation `θ` by anything other than `360°·n`, each member's share
`e` absorbs the difference (`|Δ − θ| < 180°` gives the same sweeps as `Δ = θ`), and members near the
±180° seam split between windings. And a pivot whose two ends don't correspond under the motion
breaks rigidity. So the app keeps two invariants on everything it writes:

- **I-1:** `angle = θ + 360°·n`, where `θ` is the start → end motion's rotation (the recipe
  difference or the fit below).
- **I-2:** `pivot_to = M(pivot_from)`, where `M` is the start → end motion (rotation `θ` plus the
  translation the recipes or the fit give). Every member's end is then its start carried by a
  rotation about the moving pivot, so a same-shape turn stays rigid wherever the pivot is.

The resolver still accepts any angle and any pivot pair (the formula is defined for all); the
invariants are the app's. Prototype round 2 showed the obvious way to keep them, snapping what the
user typed and letting the pivot travel, is wrong for drill writers: all four users meant 270° when
they typed 270°, and all four expected the pivot to stay put and the end to move
([proto-round-2.md](proto-round-2.md) findings 1 and 2). So **the user edits the turn and the app
moves the end shape to match** (owner, 2026-11-03, calls A and B):

- **The end can move** when the move's end is one shape recipe whose marchers are exactly the turn's
  members. Then editing the turn edits that recipe, in the same undo step. Its spots are also where
  the next move starts, as with any edit to an end shape.
- **Typing or winding an angle `Δ′`** rotates the end recipe about the end pivot `pivot_to` by
  `Δ′ − θ`: the recipe's `rotation += (Δ′ − θ)` in radians, and its anchor is carried by the same
  rotation about `pivot_to`. The new motion `M′ = R_{pivot_to}(Δ′ − θ) ∘ M` has rotation `θ′ = Δ′`,
  and `M′(pivot_from) = pivot_to`, so I-1 holds with `n = 0` and I-2 holds with the pivot unchanged.
  Turn into a different shape (a spiral) works the same way: the fit's `θ` changes by exactly
  `Δ′ − θ` because every `b_i` is rotated by it.
- **Dragging the pivot to a point `p`** makes `p` the point that stays put: `pivot_from = pivot_to
= p`, and the end recipe is **translated** by `t = p − M(p)`. `M′ = T_t ∘ M` has the same rotation
  and leaves `p` fixed, so both invariants hold. Illustration C's gate about its middle now swings
  about the middle and lands where it swung, instead of sliding.
- **Alt while dragging the pivot** keeps the end spots: `pivot_from = p`, `pivot_to = M(p)`, so the
  pivot travels in a straight line (draft 4's behaviour). The handle snaps to `M`'s fixed point (the
  one point it leaves where it is, when `θ ≢ 0`) within 10 px, where the pivot again stays put.
  Either end's handle can be Alt-dragged; the other follows through `M` or its inverse.
- **When the end can't move** (loose dots, or a recipe that also holds marchers outside the turn),
  the app falls back to keeping the end spots: a typed angle snaps to the nearest `θ + 360°·n` with
  "These end spots allow ↻ 0°, ↻ 360° or ↺ 360°: a turn can only add whole turns. To turn by a
  different amount, make the end a shape or move its spots", and a pivot drag behaves as Alt.
- **Whole turns never move the end spots.** Changing `n` (the ↻ ↺ choice, or typing `θ + 360°`)
  changes no spot. Under `turn_shapes` it adds `±2π` to the end recipe's unwrapped rotation (T-0:
  the recipe difference is the angle), otherwise it changes `angle` and the source becomes
  `turn_set`.

- **The same shape at both ends**: the start and end recipes have the same `kind`, the same
  marcher → spot assignment **compared by spot index** (`timeline_shape_recipe_marchers.slot`, not by
  position), and the same **handedness** (`flipX XOR flipY` equal at both ends). Recipes record no
  lineage (one recipe per move, ADR 0006), so nothing else is required: two boxes that match spot
  for spot are the same shape for this purpose. When Turn is chosen, `pivot_from` is the start recipe's pivot
  point (ADR 0006 amendment: centre, one of the 9 frame points, or its own point) in absolute field
  units; `pivot_to = M(pivot_from)`, which is the end recipe's pivot point when both use the same
  pivot setting. Afterwards `pivot_from` is kept as stored (the user may have dragged it) and only
  `pivot_to` is recomputed through `M`. And `angle = (end rotation − start rotation) × 180 / π`, rounded to 10⁻⁹ degrees.
  Recipes store rotation in radians, turning field +x toward field +y, the same direction as
  `angle`, so no sign change; the rounding makes a typed 450° minus 180° store as exactly 270.
- **A mirrored end shape** (same kind and assignment, handedness differs): a mirror is not a turn
  about any point; half the group would sweep one way and half the other. Turn is **refused** with
  "The end shape is mirrored. Use Straight or draw a route." (owner, 2026-11-03, review 2 Q2).
- **Spots reassigned**: if the kinds match but the assignment differs because the Shape tool
  reassigned by least travel (a box rotated 180° where everyone took the nearest spot), the recipe
  rotation would claim a turn nobody makes (every `e = −180°`, `dφ = 0`). This falls to the fit,
  which returns about 0°, with the notice "Spots were reassigned, so there's no turn to make".
- **Otherwise** (different shapes, or loose dots): the fit (`turn_fit`):
  1. Centroids `c_A`, `c_B`; `a_i = A_i − c_A`, `b_i = B_i − c_B`.
  2. `S = Σ a_i · b_i`, `C = Σ a_i × b_i`. If `√(S² + C²) < ε_geom · Σ|a_i||b_i|`, the angle is
     undefined (all starts at one point, or a symmetric assignment): `angle = 0` and `D-TURN-TIE`.
  3. `angle = atan2(C, S)` in degrees. This is the 2D least-squares **proper** rotation; written this
     way it can never return a reflection, so no SVD sign correction is needed.
  4. **Mirror check.** The best reflection scores `√(S_r² + C_r²)` with
     `S_r = Σ (a.x·b.x − a.y·b.y)`, `C_r = Σ (a.x·b.y + a.y·b.x)`. If that exceeds `√(S² + C²)`, the end
     looks mirrored relative to the start: `D-TURN-MIRROR`, shown on the turn row as "Members cross:
     the end looks mirrored. Straight may suit better." A warning, not a refusal, because between
     different symmetric shapes both scores can be close and neither is wrong.
  5. **Seam hysteresis.** The first fit takes `angle ∈ (−180°, 180°]`. A recompute (Re-fit) takes the
     representative `angle + 360°·n` nearest the previous angle, so a group turned about half a turn
     doesn't reverse on a nudge.
  6. `pivot_from = c_A`, `pivot_to = c_B`; `from = c_A`, `to = c_B` are stored for the changed flag.
- **Fitted turns are frozen.** A `turn_fit` turn is not recomputed when the starts move upstream
  (they are resolver output and move under unrelated edits). It is **changed** when
  `|centroid(A) − from| > ε` or `|centroid(B) − to| > ε`; the Move card then offers Re-fit (§3.5), which
  refits with hysteresis (owner, 2026-11-03, review 2 Q4).
- **Unwrapped recipe rotation.** The app stops wrapping the saved rotation. Three places in
  `apps/desktop/src/shapes/frame/` wrap it today, and each changes:
  - `snapRotation` snaps the **change** and returns `frame.rotation + snappedChange`;
  - the rotate handle's drag adds `wrap(θ_mouse − θ_previous)` on every pointer move, so turns
    accumulate across the ±180° seam;
  - `flipFrame` picks its branch (`−θ` or `π − θ`) by its existing nearest-angle rule, then adds
    `2π · round((θ − branch) / 2π)`, so a box at 450° flipped keeps its winding (450° or 630°, never
    90°).

  `normalizeAngle` and `rotationDegrees` stay for display and comparison only.
  The rotation field shows `1 turn + 90°` once `|rotation| ≥ 360°`, and accepts either form. No
  schema change: rotation already lives in `params` (ADR 0006).

- **Source.** `timeline_route_sources.mode` (§2.4) takes these values for turns:
  - `turn_shapes`: the angle and `pivot_to` follow the recipes (I-1, I-2), recomputed in the same
    edit when either recipe changes; `pivot_from` is stored;
  - `turn_fit`: fitted once, frozen, Re-fit on demand;
  - `turn_set`: the user Alt-dragged the pivot, or changed the angle or pivot while the end
    couldn't move; never recomputed.

  Those changes switch to `turn_set` in the same edit. Changes that move the end recipe keep
  `turn_shapes`, because the recipes then give the pivot and angle the user chose. Reset turn returns to `turn_shapes` when
  the shapes qualify, else refits (`turn_fit`). (The values for path routes and trails, `shape`,
  `snake` and `outline`, are §4.6's.)

- **Over 64 turns.** A recipe rotation difference beyond `±23040°` refuses Turn with a notice.
- **Backwards-spin guard (T-1).** A recompute that changes `angle` by 360° or more, or flips its sign
  with `max(|old|, |new|) ≥ 90°`, shows a notice with Undo: "Move 3 now turns ↺ 360°". A flip from
  +5° to −5° says nothing (review 2 §9.6; owner, 2026-11-03, Q6).
- **Pin wording.** A pin is the **group's** turned angle. In a spiral a member with a 60° share has
  swept 240° at a "180°" pin, so the inspector says "group turned 180° by count 8" (owner,
  2026-11-03, Q5).
- **Per-member winding.** Members carry nothing, so the only fix for a member sent the long way round
  is to move its end spot. A `path_params: {"wind": ±1}` adding `±2π` to its `e` would keep the split
  proof (it scales with `1 − u_c` like `e`). Not in v1 (owner, 2026-11-03, Q3); §3.6.8.

#### 3.6.7 Edits

| Edit                                              | Result                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| ------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Choose Turn for selected marchers in a move       | One `turn` route, `turn_shapes`; their transitions become `route` with `path_params = NULL`                                                                                                                                                                                                                                                                                                                                                                            |
| Drag the pivot to `p`                             | End can move: `pivot_from = pivot_to = p`, end recipe translated by `p − M(p)`; source stays `turn_shapes`. End can't move, or Alt held: `pivot_from = p`, `pivot_to = M(p)` (either handle; the other follows), snaps to the fixed point; `turn_set`                                                                                                                                                                                                                  |
| Wind the angle handle, or type an angle `Δ′`      | End can move: end recipe rotated by `Δ′ − θ` about `pivot_to`, `angle = Δ′`; source stays `turn_shapes`. End can't move: `angle = θ + 360°·n` for the nearest `n`, with the notice; `turn_set`. Either way pins keep their `turned` values if still inside, else the edit stops short at the first pin, as resize stops at pins (§5.1)                                                                                                                                 |
| ↻ or ↺                                            | The angle becomes the nearest `θ + 360°·n` in that direction (at least one degree of travel), through the end recipe's unwrapped rotation under `turn_shapes`, else `angle` (`turn_set`); no spot moves                                                                                                                                                                                                                                                                |
| Move a destination, or edit a shape at either end | Nothing per member is stored, so members follow at once; with `turn_shapes` the pivot and angle are recomputed                                                                                                                                                                                                                                                                                                                                                         |
| Choose Straight                                   | The transitions become `direct`; the route is deleted (child first, §2.3)                                                                                                                                                                                                                                                                                                                                                                                              |
| Time edits, rate change                           | As path routes (§5.1)                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| **Time split at beat `c`**                        | `u_c = u(c)`. First half (rewrites the route row in place, keeping its id): `pivot_to = P(u_c)`, `angle × u_c`, the pins before `c`. Second half (a new row): `pivot_from = P(u_c)`, `angle × (1 − u_c)`, the later pins with `turned −= angle × u_c` and offsets `−= (c − start)`. Both `turn_set`. A pin exactly at `c` is dropped on **both** sides (its `turned` would equal a half's whole angle; the boundary pins it). A cut inside a stop or hold follows §5.2 |
| Split by marchers                                 | The leavers keep pointing at the same turn route (members carry nothing); the resize refusal of §5.2 applies                                                                                                                                                                                                                                                                                                                                                           |
| Merge with a turn half                            | Refused in v1, naming the turn (§9)                                                                                                                                                                                                                                                                                                                                                                                                                                    |

**The time split is exact up to rounding.** Each member's second-half start is `pos(c)`, so its
new `φ0′ = φ0 + u_c·dφ` (mod 2π) and `r0′ = r(u_c)`. Its new share is
`wrap(φ1 − φ0′ − Δ(1 − u_c)) = wrap(e·(1 − u_c)) = e·(1 − u_c)`, since `e ∈ [−π, π)` and
`0 < 1 − u_c < 1`. So the second half sweeps `dφ·(1 − u_c)`, exactly the rest of the original sweep,
and `P` and `r` are linear in `u`, so they continue on the same lines. The first half is the same
argument with `u_c`. Unlike path routes (which cut at stored points), the cut writes products of
doubles, so motion is unchanged to within rounding (about 10⁻¹² field units), not bit for bit.

#### 3.6.8 Not in v1

- **A pivot that travels along a drawn path** instead of a straight line: `geometry` would gain a
  pivot path (inline points as in §2.1), and `P(u)` becomes the point at distance `u·L` along it.
  The formula is unchanged. It would also give a principled "turn with the path" (the angle tied to
  the end shape).
- **Tweening a shape's own settings** (an arc opening from 90° to 180° of curve, exact on every
  count). A turn into a different shape is a clear path rule, not a tween (T-2).
- **Reassign for the turn.** The Shape tool assigns end spots by least travel, which knows nothing of
  turning, so spirals may cross. Prototype round 2 measures how often (§9).

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

| Edit                                                         | Result                                                                                                                                                                                                                              |
| ------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Draw a route for selected marchers                           | One route row; one marcher: own route; several: a formation; `from` = centroid of their starts, each offset = its start minus `from`, field axes                                                                                    |
| Drag, add or delete a point                                  | Rewrites the route row; a formation moves every lane                                                                                                                                                                                |
| Edit one member's lane                                       | Detach (§3.4), then edit                                                                                                                                                                                                            |
| Drag a marcher's dot mid-move                                | Unchanged: edits the edit window (UI-10), making a new move to the playhead on a higher layer; the route's remainder is then a resume after that layer lets go, and §3.3 applies. Never edits the path (P-1, replaces F-6)          |
| With the path open, drag the marcher's playhead marker on it | Inserts a corner point there, pinned at the playhead's beat (detaching it from a formation); a straight move becomes `route` (P-1)                                                                                                  |
| Open the path of a turn member                               | Members carry nothing, so there is no path of its own: opening it offers "Leave the turn"; its transition becomes `direct` (or `route` with the dragged corner) and the turn keeps the others; its start and end spots don't change |
| Open an `arc` move and drag its marker                       | The arc is cut at the marker into two `arc` points whose bulges give the same circle (both sub-arcs are minor because the original was), the first pinned                                                                           |
| Move a move's end                                            | Inner points stay (Q2); the last leg bends; changed flag; Re-fit                                                                                                                                                                    |
| Make it straight                                             | `route_id = NULL`, `path_style = 'direct'`, then delete the route if unused                                                                                                                                                         |
| Edit a recipe-linked route by hand                           | The link is dropped in the same edit                                                                                                                                                                                                |

## 6. Bounded positions (§8.11 amended)

Notation: `β` bounds authored points (spec); `β′ = β + max|o|` bounds every placed point (`P_i`,
`F`, `G`) and every destination. The proof is the review's §1.2; in short:

- **Route span (Case B).** Catmull–Rom control points of authored neighbours lie within
  `(2/3)·|chord|` of their point (review Lemma 1), so within `(7/3)β′`; the two control points next
  to `A` and `B` are convex combinations. A point on a Bézier is a convex combination of its control
  points. So every position satisfies `|Q| ≤ max(|A|, (7/3)β′)`: a constant, no chain-length term.
- **Arc piece**: Thales, `|Q|² ≤ |prev|² + β′²`. An arc piece leaving `A` counts toward `a` like an
  arc span; arc pieces between authored points are bounded by `β′`.
- **Formation lane**: a lane is the reference path plus `o` (G-1: slide only), so
  `|lane| ≤ |reference| + |o| ≤ (7/3)β′`.
- **Entry leg, FTL trail, stub**: segments and authored or origin points, convex.
- **Turn span** (§3.6): `|pos(u) − P(u)| = r0 + u·(r1 − r0) ≤ max(r0, r1)`, and `P(u)` lies on the
  segment between two authored pivots, so `|P(u)| ≤ β`. With `r0 ≤ |A| + β` and
  `r1 ≤ |B| + β ≤ β′ + β`: `|pos| ≤ max(|A|, β′) + 2β`. The straight fallback on the pivot is a
  segment, convex.

**Theorem.** With `a` the number of arc spans and arc first pieces on the dependency path and `τ`
the number of turn spans on it, `|P| ≤ √(max(β, (7/3)β′)² + a·β′²) + 2β·τ`. (A turn adds a
constant; an arc adds in quadrature; `√((M + 2β)² + c) ≤ √(M² + c) + 2β` lets the two compose in
any order.) Without turns this is the draft 2 bound. Checked by P-13 with the new constant, including chained
stolen route spans; the fuzzer's must-fail mutant gains "tangent from `A`".

## 7. Resolver API and rendering

### 7.1 Caches (spec §9)

- `routeGeometry[R]`: the inner pieces between `P_1 … P_n`, their lengths and distance tables. A
  formation member adds its offset `o` at evaluation (a translated copy has the same pieces). **Depends on no origin**, so an upstream edit never rebuilds it.
- `pathOf[T][m]`: the first and last pieces (from `A`, to `B`) joined to the inner geometry, and
  the knots. Rebuilt when the origin changes (W-1) or `T` is seeded (W-5).
- `entry[span]`: the first-fit length and aim (§3.3).
- `ftlGeometry[T]` for trails: as today, plus each member's start distance (§4.2).
- For a turn, `pathOf[T][m]` holds `r0, r1, dφ` (or the straight fallback). They depend on the
  origin, the destination and the route, so they rebuild under W-1 and W-5 like path routes. The
  turn's **knot table** (beat → `u`) is per route, not per span: it lives in `routeGeometry[R]` and is
  dropped by the route's row and by a change to its transitions' range.

Cost at 2,000 marchers each on its own 20-point route (the worst case; a formation shares one): about 40,000 pieces with a 32-entry table each (about 10 MB),
milliseconds to build; per-frame evaluation is a span lookup, `O(log points)`, and a few Newton
steps.

### 7.2 What the API adds (spec §10)

- `travelDirection(marcher, beat)`: the unit tangent at that beat (the piece's derivative), `null`
  inside a stop or hold. Not used for facing in v1 (P-3: marchers face front by default; S-9's
  "Against travel" is deferred). The existing Facing cue option "Direction of travel" keeps its
  current reading.
- `routeOf(marcher, beat)`: the walked path (pieces, knots, the entry) for display, so the field,
  the 3D View and exports draw what the resolver walks.
- `stepPositions(marcher, transition)`: the exact position on every step of the rate grid (S-4).
- `explain()` reports the span's knots and its entry (length, aim, horizon); for a turn also the
  member's sweep `dφ`, its share `e`, and `D-TURN-TIE` if raised.

### 7.3 Display and output

- **Field**: a selected route is drawn from `routeOf`. Corner points are squares, smooth points
  circles, arc points circles with a tick, pins diamonds with their step. A leg whose step is too
  big at the move's rate is coloured (Q5). A formation is one band (O-20). A changed route draws
  its bent first or last leg dashed.
- **Timeline**: pin ticks on the clip for the selection; a stop or hold is a bar; an entry is a
  hatched lead-in (E-3). A turn's clip label always shows its angle ("Turn ↻ 270°").
- **Turns on the field**: the pivot as ✛ (two, joined by a dashed line, when it travels) and an arc
  with the angle so far and in total ("↻ 162° of 270°"). Members' paths are drawn from `routeOf`.
- **SVG export / mobile app** (S-4): `M`, `L`, `C` and `A` commands of the walked path, exact for
  lines and arcs and lossless for Béziers (the same control points); per-step coordinates from
  `stepPositions`. A rigid turn about a fixed pivot exports as `A` arcs of at most 180° each
  (exact). Other turns export as a **declared** curve, so every build draws the same thing: sample
  `pos` at every step of the rate grid and at least every 10° of the member's sweep, then join the
  samples with centripetal Catmull–Rom (α = ½) converted to cubic Béziers (the conversion of §3.1).
  It is an approximation of the turn and the export says so; per-step coordinates stay exact.
- **Dot book** (O-16, O-23): pins and markers listed by step on the rate grid ("step 8 of 24,
  triplet time"), never as a fraction of a count. The printed coordinate sheet is unchanged: one
  row per set.
- **Other apps and exports (owner, 2026-11-03, P-2).** What they need from pathways is two things,
  both already in the resolver API: each marcher's coordinates at any time (positions at a beat),
  and a drawable form of the path the marcher actually walks (`routeOf`, and the SVG above). No
  teaching output is designed here.
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

**Rotating box (T-0, illustration A).** A 4 × 4 box whose recipe goes from rotation 180° to 450°
over 16 counts, Turn chosen: `{pivot_from = pivot_to = the box's centre, angle: 270}`, `turn_shapes`.
The UI's ↻ or ↺ follows how the field is drawn on screen, not the sign. Every member keeps its
distance and sweeps 270°; the box is a box on every count. Straight between the same spots would
be a 90° walk.

**Gate turn (illustration C).** A line of 8 at 2-step intervals, recipe pivot `"w"` (its end), turned
−90°. The outside member is 14 steps out: about 22 steps of arc in 16 counts, about 6 to 5, warned;
the member on the pivot stands (both radii 0: straight line of zero length).

**Full turn while travelling (illustration D).** A 3 × 3 block moves 18 steps right and makes one full
turn: `pivot_from` and `pivot_to` 18 steps apart, `angle: -360`. Start and end look identical; the
centre member is on the pivot and walks straight.

**Box into a circle (illustration B).** 16 marchers from a box to a circle, Turn chosen: different
recipes, so the Kabsch fit gives the angle and the centroids the pivot. Each member spirals; where two
paths cross the issue checker flags it.

**A circle that grows (angle 0).** Same recipe, radius 6 → 10 steps, pivot at the centre: every
member walks straight out along its radius, at the same progress, so it is a circle on every count.

**Collision fix (J-2).** One marcher in a 64-marcher formation: open its path (double-click),
playhead on count 6, drag its playhead marker aside. It detaches with a corner pinned at beat 6; the
other 63 are unchanged (P-1).

**A steal and rejoin (J-11).** A soloist's route has pins at counts 8 and 12; a higher layer takes it
over counts 4–6. At count 6 it is off its path; the first step `i` that reaches the path at a normal
step (or the route's pace) before count 8 is the entry; it then follows the path and hits counts 8
and 12. A steal that leaves it on schedule needs no entry. With no pins at all it still rejoins the
path, aiming before the end (F-2).

## 9. Open items

| Item                                                                                                                                                                                                                                                     | Owner                                              | Note                                             |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------- | ------------------------------------------------ |
| O-5: first fit vs "closest to a normal step" for the entry aim                                                                                                                                                                                           | P (default first fit)                              | §3.3                                             |
| `D-TURN-TIE` threshold (170°)                                                                                                                                                                                                                            | F (review 2: fine)                                 | §3.6.3                                           |
| QA for turns: goldens at 10⁻⁹ with bit-exact ends; QA-DG for an end 0.01 steps from the pivot; a QA-REG chain of 1,000 stolen turns (bound grows by `2β` each); a migration test that a cascaded `timeline_route_sources` delete reaches the history log | build                                              | review 2 §5, §7, §8                              |
| Merging two turns: exact only for rigid turns about one fixed pivot (one turn with a pin at the join); v1 refuses all                                                                                                                                    | P                                                  | §3.6.7                                           |
| A pivot travelling along a drawn path                                                                                                                                                                                                                    | P, later                                           | §3.6.8                                           |
| How often spirals cross with least-travel assignment; whether "Reassign for the turn" is needed                                                                                                                                                          | prototype round 3 (round 2 had no collision check) | §3.6.8                                           |
| Resizing a move whose formation spans two moves refuses until detached                                                                                                                                                                                   | P to confirm                                       | §5.2                                             |
| Denominator bound 48 for pin fractions                                                                                                                                                                                                                   | F                                                  | covers rates with terms ≤ 16 against whole beats |
| `ε_on` for "on the trail"                                                                                                                                                                                                                                | F                                                  | test at the 10⁶ bound                            |
| Should `slots` trails allow rounding a row-end corner by default (S-6 says straight)                                                                                                                                                                     | P                                                  | §4.6                                             |
| QA: goldens for a pinned route, a stolen pinned route, a formation at a corner, a snake with a time split; properties P-13 (new constant), P-5 on trails, "pins hit exactly"                                                                             | build                                              | review §10.9                                     |

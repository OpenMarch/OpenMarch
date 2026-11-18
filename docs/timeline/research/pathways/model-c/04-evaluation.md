<!-- cspell:disable -->

# 04: Evaluation of the candidate data models

2026-11-05. Inputs: `BRIEF.md`, `01-current-model.md`, `02-scenarios.md` (S-01…S-48, F-01…F-36, OPEN
questions) and `03-precedents.md` (lessons 1–12). Repo: `/mnt/data/worktrees/t3/OpenMarch/t3-fc7b6ac6` at
`46cd0cbf6`, read only. Paths are relative to it. `db/` is `apps/desktop/src/db-functions/`, `core/` is
`packages/core/src/timeline/`, and `schema.ts`/`triggers.ts` are in `apps/desktop/electron/database/migrations/`.
I re-read every code or spec line cited here, unless the citation says "(01)", which means it comes from
01 and I didn't re-read it.

---

## 0. Verdict in one page

**Recommend model C, "lanes on slots".** A drawn path (route) is one stored object: its geometry,
pins, holds and spacing handoff. A new table, `timeline_lanes`, binds a route to a **slot** of any
transition in the move. The lane holds that slot's frozen offsets, its timing window and join mode,
and a pointer into a small tree of **Adjust** nodes. An Adjust is a displacement profile keyed by
**positions on the group path**, written as stable point ids plus a fraction, never as a point index
or a count. A marcher no longer leaves its transition to get a path. Assignments become
**range-exclusive** per slot and per marcher (UNIQUE → overlap triggers), except on follow-the-leader
transitions.

Why C:

1. **It writes the narrowest fact for every edit.** One lane row per member, one node per Adjust.
   Today every path is a breakout (`giveOwnTransition`, `db/timelineRoutes.ts:483–528`), so the
   shared transition is rewritten. Precedent lesson 12 (Illustrator "Expand") names this failure.
2. **Adjust survives reshape and retiming.** It is anchored by stable point ids (§5.2 already makes
   ids stable and never reused) and re-homed by fraction when an anchor dies, in the same
   transaction. Count-keyed deltas fail S-08 edits 2 and 4. Index-keyed deltas fail like AE masks
   and Houdini parent/child (lesson 3).
3. **The path follows the slot (D-4).** Slot swaps, re-entry on another lane and recasting need only
   assignment rows (lesson 7).
4. **Nothing reads another marcher.** F and G (`route.from`/`to`) and both offsets are stored, so
   R-14 item 9 and §9 invalidation still hold (F-28, S-42).
5. **D-16 and R-1 are untouched, and I-R2 isn't even rebuilt.** Routes stop living on
   `path_style='route'` transitions, so the I-R2 CHECK at `schema.ts:478` becomes vacuous. It is
   dropped when the migrations are folded before main.
6. **Migration is exact.** Each of today's one-slot route transitions becomes one lane row.
   v0.1.7 files have no routes, so they have no lanes.

The margin over the runner-up is **moderate, not decisive**. The runner-up is **B3**: today's
one-slot transitions plus per-member JSON (Adjust, offsets, window) carried through every breakout.
B3 stores almost every fact. It loses on four things: linked sub-groups (F-11), shape links on
`dest_shape_id` transitions (F-12), exact Remove path and Rejoin (members stay broken out), and the
transition and ghost-slot litter. §2.7 says when B3 would be the better pick.

**Every candidate needs these, wherever the path lives** (the "common layer" K, §1.2):
range-exclusive slots, an entry rule for joins and resumes onto a path, pins and holds on the route,
FTL trails, and app-data links (`timeline_route_sources`).

---

## 1. Ground rules

### 1.1 What "pass" means

- A **fact** (F-nn) is **S** (stored), **D** (derivable from stored facts with no new cross-marcher
  dependency), **X** (cannot be expressed) or **BO** (only by breaking marchers out into other
  transitions, losing a link, a shape or a structure).
- A **scenario** is **P** (setup and every edit expressible and surviving), **P\*** (passes with a
  documented choice on an OPEN question), **P†** (passes for recipe-made point sets but not for
  `dest_shape_id` transitions, see §1.3), **F#n** (first fails on edit n) or **X** (setup can't be
  expressed).
- I judge **storage plus a correct procedure**, not today's refusals. A group split refused today
  (`timelineSplitAtBeat.ts:265–267` (01)) counts as P if the stored facts allow an exact procedure.

### 1.2 The common layer K (independent of where a path lives; assumed in every column)

| K   | What                                                                                                                                                                           | Source                                                                                |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------- |
| K1  | Route `timing` JSON: pins (point id → exact beat offset from the move start), holds (stops, mark time)                                                                         | draft-model §3.2 (R-15), plan step 5/14                                               |
| K2  | Entry rule: a join or resume onto a path re-enters it at the first fit at a normal step, or at a typed length                                                                  | draft-model §3.3 (R-16), plan step 12. Today joins walk straight (`core/geom.ts:706`) |
| K3  | Range-exclusive slots: decision §5.1                                                                                                                                           | replaces `schema.ts:516–523`                                                          |
| K4  | Steps per beat (`rate_num`, `rate_den`)                                                                                                                                        | draft §2.2, step 16                                                                   |
| K5  | FTL on a stored trail (`transitions.route_id` on FTL)                                                                                                                          | draft §4, steps 4/9/10/11                                                             |
| K6  | App-data `timeline_route_sources`: recipe link (draft §2.4), Detach provenance, continuity and mirror links. Under history, outside the change log, never read by the resolver | draft §2.4 extended                                                                   |

### 1.3 Two findings that change the weights

1. **The shape tool writes points, not shapes.** `writePlacement` (`apps/desktop/src/shapes/tool/shapePlacement.ts:77–135`)
   moves members through the canvas drag path (`transformMarchersInSelection`, :93). It saves the
   recipe as app data keyed by **marcher** (`schema.ts:603–652`, `db/shapeRecipes.ts:5–17`:
   "Positions stay the source of truth"). A point drag on a shaped transition turns it into points
   first (`db/timelineMoves.ts:376–384`).
   - So F-12 ("end spot stays linked to the shape") mostly holds **through the recipe**. A
     broken-out member's own point is rewritten by recipe re-placement, and AP-R5 keeps its route.
   - Breakout loses the link only for real `dest_shape_id` transitions, which only `createTrack`
     with a shape target writes (`db/timelineCommands.ts:408–426`).
   - This is why A and B3 get **P†**, not F, on the shape-edit rows.
2. **The fact catalogue skips F-31, F-32, F-33 and F-35.** S-02 cites F-31, which has no
   definition. I evaluate F-01…F-30, F-24-x, F-34 and F-36, and treat the cited F-31 as undefined.

---

## 2. The candidates, as precise table sketches

Each sketch includes K. "Lane" means one member's copy of a group path.

### 2.1 A — today (one-slot transitions share a route)

- **Tables.** `timeline_routes(id, geometry)` plus K1 `timing`. `timeline_transitions.route_id`,
  `path_params` NULL or `{offset}` (`core/validate.ts:288–296`). I-R2 CHECK: a route transition has
  `slot_count = 1` and no shape (`schema.ts:478`).
- **Owner.** A route has no owner column. It is ref-counted by transitions (E-R3) and pinned to one
  move and range (E-R5, `triggers.ts:136–141`).
- **Lane.** A lane is a one-slot shapeless transition, reached by breakout (`giveOwnTransition`),
  which leaves a vacant slot and a copied end point behind.
- **Resolver.** R-14 own path or group schedule (`core/geom.ts:694–723`). `groupSchedule` is
  rebuilt every time a point is evaluated (01 crack 10).
- **Stored vs derived.** Stored: geometry, from/to, offset. Derived: W, the moments, legs.
- **Missing.** Nowhere to store an Adjust, a handoff end offset, a window, a join mode or a
  sub-group.

### 2.2 B — the shared transition carries the route; per-slot overrides

- `timeline_transitions.route_id` on **any** transition. Shape and `slot_count > 1` are allowed,
  which needs a table rebuild to lift the I-R2 CHECK (01 crack 11).
- `path_params = {"offsets": {"<slot>": [dx,dy]}, "end_offsets": {...}, "timing": {"<slot>": {...}}}`,
  keyed by slot index. As briefed, B **derives** offsets. A derivation from live centroids fails
  F-28 (S-42 edit 1), so I sketch them **stored** at draw time.
- `timeline_slot_routes(transition_id, slot_index, route_id NULL, PK(transition_id, slot_index))`.
  `route_id` NULL means the slot opts out and walks straight. Otherwise it points at an **own**
  route, which is a Detach copy.
- **Owner.** The transition owns its one group route.
- **Limits.**
  - Only **one group path per transition**. A second subset in the same transition needs a
    breakout.
  - An override is a whole route, so it has Detach semantics and **no Adjust**.
  - Per-slot JSON has no row ids, and slot compaction (`db/timelineMembership.ts:545–619`) has to
    rewrite its keys.
- **Resolver.** For slot k of T: an override if one exists, else T's route at `offsets[k]`.

### 2.3 B1 — B, plus per-slot destinations inside a shaped transition (D-16 relaxed)

- B, plus `timeline_slot_destinations` rows allowed on a shaped transition as per-slot overrides of
  the shape's point (spec Q-14).
- **What it adds.** An exiting member or a nudged spot can keep its slot in the shape.
- **What it doesn't add.** Anything about paths. Adding a slot still re-spaces every slot of a line
  or arc (R-13, `tᵢ = i/(n−1)`), so a cut-in joiner still needs its own transition.
- **Cost.** D-16 and I-T6, the commit check and E-T6.

### 2.4 B2 — the move owns the group path

- `timeline_routes.timeline_id NOT NULL` (owner), plus
  `timeline_route_members(route_id, marcher_id, offset, end_offset, adjust JSON, timing JSON, UNIQUE(route_id, marcher_id))`.
- **Resolver.** It finds a span's lane by (its row's transition's timeline, marcher). It therefore
  reads move membership, which goes against R-1 ("MUST NOT read `timelines`", spec line 628) and
  §3 ("Timelines … carry no motion").
- **Keying.** Membership is by **marcher**. A move has no slots, and slots belong to transitions
  (D-4). That is the precedent's anti-pattern for swaps and recast (lesson 7).
- **Variant.** B2-slot, keyed `(transition_id, slot_index)`, is just C plus an owner column (§2.6).

### 2.5 B3 — today's breakout, but the path and per-member overrides travel with it

- A's tables, plus `path_params` for a route transition
  `= {offset, end_offset?, adjust?: profile, timing?: {window, join, entry}}`, with the profile in
  C's format (§2.6).
- Every procedure that breaks out or peels a marcher copies `route_id` and `path_params` instead of
  refusing or dropping them: `giveOwnTransition`, split by marchers, Basic `writePlan`, the cuts.
- No node table, so a sub-group can only be faked by duplicating a profile, which is not linked.

### 2.6 C — lanes on slots (recommended)

#### Tables (the K tables as in §1.2)

```sql
-- existing; K1 adds timing
timeline_routes (
  id        INTEGER PRIMARY KEY,
  geometry  TEXT NOT NULL CHECK (json_valid(geometry)),   -- {v, from, to, points[{id, at, tension?}]} (§5.2)
  timing    TEXT CHECK (timing IS NULL OR json_valid(timing))
            -- {v, pins[{point, at}], holds{start?, end?, at[{point, for}]}, handoff?{from: Anchor, to: Anchor}}
) STRICT;

-- new: a slot walks a route
timeline_lanes (
  id            INTEGER PRIMARY KEY,
  transition_id INTEGER NOT NULL REFERENCES timeline_transitions(id) ON DELETE RESTRICT,
  slot_index    INTEGER NOT NULL CHECK (slot_index >= 0),
  route_id      INTEGER NOT NULL REFERENCES timeline_routes(id) ON DELETE RESTRICT,
  offset_x REAL, offset_y REAL,          -- o_s, start-side offset from F; both NULL = own path (walks alone)
  end_offset_x REAL, end_offset_y REAL,  -- o_e, end-side offset from G; NULL unless the route has a handoff
  adjust_id     INTEGER REFERENCES timeline_route_adjusts(id) ON DELETE RESTRICT,
  timing        TEXT CHECK (timing IS NULL OR json_valid(timing)),
                -- {v, window?: [ws, we], join?: 'cut_in'|'whole', entry?: beats}; ws, we in pin format
  UNIQUE (transition_id, slot_index),
  CHECK ((offset_x IS NULL) = (offset_y IS NULL)),
  CHECK ((end_offset_x IS NULL) = (end_offset_y IS NULL)),
  CHECK (offset_x IS NOT NULL OR (end_offset_x IS NULL AND adjust_id IS NULL))  -- own path: no group facts
) STRICT;
CREATE INDEX timeline_idx_lane_route  ON timeline_lanes(route_id);
CREATE INDEX timeline_idx_lane_adjust ON timeline_lanes(adjust_id);

-- new: Adjust nodes; a tree of depth <= 2 under each route
timeline_route_adjusts (
  id        INTEGER PRIMARY KEY,
  route_id  INTEGER NOT NULL REFERENCES timeline_routes(id) ON DELETE RESTRICT,
  parent_id INTEGER REFERENCES timeline_route_adjusts(id) ON DELETE RESTRICT,
  profile   TEXT NOT NULL CHECK (json_valid(profile))
            -- {v:1, keys:[{a: id|'from', b: id|'to', f: [0..1], d: [dx, dy]}, ...]}
) STRICT;
```

- **Anchor.** `(a, b, f)` names a place on the **reference walk W** (R-14 group schedule item 1):
  `x = D(a) + f·(D(b) − D(a))`.
  - `D('from') = 0` and `D('to') = L^W`.
  - For a point id, `D` is its distance on W, or that of the kept point that represents it (R-14's
    "represented" rule for points cleaning dropped).
  - The anchor needs `a` before `b` in route order, with `f ∈ [0, 1]`.
- **`timeline_transitions` is unchanged.**
  - `path_style='route'` is no longer written. Migration M0 rewrites existing ones to `direct`
    (§7).
  - `route_id` stays only for K5 trails on FTL transitions (E-R2 then reads "only FTL carries a
    route").
- `timeline_assignments` keeps every column. Its two UNIQUE indexes become triggers (§5.1).

#### Invariants (replacing I-R2, E-R2, E-R4 and E-R5 for path walkers)

| New             | Rule                                                                                                                                                                                                                  | Enforced by                                                                |
| --------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| I-L1            | `lane.slot_index < T.slot_count`                                                                                                                                                                                      | row triggers on lanes, and on `transitions.slot_count` (as `tr_slots_upd`) |
| I-L2            | No lane on a `follow_the_leader` transition                                                                                                                                                                           | triggers on both sides                                                     |
| I-L3            | At most one lane per (transition, slot): a slot walks one route for the whole move                                                                                                                                    | UNIQUE                                                                     |
| I-L4 (was E-R4) | An own lane (offset NULL) is the only lane of its route                                                                                                                                                               | commit view                                                                |
| I-L5 (was E-R5) | Every lane of a route is on a transition of one timeline. Same range follows from C-11 (`triggers.ts:96–98`)                                                                                                          | commit view                                                                |
| I-R3′           | Every route has at least one lane, or is an FTL trail                                                                                                                                                                 | commit view                                                                |
| I-J1            | A node's route equals its lanes' route and its parent's route. Depth ≤ 2 (a parent's `parent_id` is NULL), so there are no cycles                                                                                     | commit view                                                                |
| I-J2            | No orphan nodes: every node has a lane or a child                                                                                                                                                                     | commit view (lesson 10)                                                    |
| I-J3            | Profile keys are valid anchors; numbers are finite and in bounds; `d` lies within ±2·10⁶                                                                                                                              | app write path, E-P1                                                       |
| I-J4            | A route with a handoff: every lane has `o_e`. The handoff's `from ≤ to`, and `from = to` only at or before the first kept point or at or after the last one (a jump inside the rigid part would break continuity P-1) | commit view and app write path                                             |
| I-W1            | `T.start ≤ ws < we ≤ T.end`                                                                                                                                                                                           | app write path                                                             |

#### What owns what

- A **route** is the group path: geometry, pins, holds, handoff. It has no owner column (like
  shapes, D-19). Its lanes own it, and they all sit in one move (I-L5).
- A **lane** belongs to a **slot**. Its occupants come from assignment rows over count ranges (D-4).
- An **Adjust node** belongs to its route. Lanes and child nodes point at it.
- **Recipes, provenance and links** are app data (K6).

#### What the resolver computes (R-14′, a generalisation; nothing below is stored)

For a span `s` of row `r` in transition T, slot k: `A = origin(s)`, `B = dests[T][k]`,
`c = T.end − T.start`.

1. **No lane on (T, k):** dispatch on `T.path_style` exactly as today (R-7, R-8, R-10/11).
2. **Own lane (o_s NULL):** R-14 own path, verbatim, for a founding span. A join or resume uses K2's
   entry onto the own path.
3. **Group lane,** with route R:
   - **Per-route cache.** W, `D^W`, `L = L^W`, the kept points `W_1 … W_m`, the group clock
     `x(β)`, every anchor's x, and the handoff's `x_h0` and `x_h1`. These depend on the route only.
     The group clock maps a group beat β in [T.start, T.end] to a distance along W: piecewise
     linear through K1's knots, and `(β − T.start)/c · L` with no timing.
   - **Lane clock.** `β(b) = clamp(T.start + (b − ws)·c/(we − ws), T.start, T.end)`.
     - Default window: `[T.start, T.end]`.
     - `join = 'whole'` on a **join** span sets `ws = s.start`: the late-block "walk the whole
       path faster", lesson 6.
     - Before `ws` the member stays at A. After `we` it stays at B.
   - **Placing.** `P(x) = walk_x(W, x) + o(x) + δ(x)`, where:
     - `o(x) = o_s + w(x)·(o_e − o_s)` and `w(x) = clamp01((x − x_h0)/(x_h1 − x_h0))`. `w = 0` with
       no handoff, and a step at `x_h0` when `x_h0 = x_h1`, which I-J4 allows only inside a leg.
     - `δ(x)` is the sum, over the lane's node and its parent, of each profile.
     - A profile is linear in x between consecutive keys and **constant beyond its first and last
       key**, so it is always continuous.
   - **Legs.** As in R-14 item 5, with `W_1 + o` replaced by `P(D_1)` and `in^W_1 + o` by
     `in^W_1 + o(D_1) + δ(D_1)`. The last leg is symmetric, towards B.
   - **Evaluation.** `x = x(β(b))`. If `x < D_1`, use the first leg at `x/D_1`. If `x ≤ D_m`, use
     `P(x)`. Otherwise use the last leg.
   - **Join with `cut_in` (the default), and every resume.** K2's entry rule, aiming at the lane's
     own founding evaluation. Its reference start is the founding span's origin if the row has one,
     else `F + o_s` (draft §3.3).
   - **Bit-identity rule.** With no timing, no window, no adjust and no handoff, a lane MUST
     evaluate through today's `groupMemberWalk`/`groupPoint` in u-form (`core/geom.ts:568–723`).
     QA-RT-15/17 and the M0 migration then stay bit-identical.
4. **Inputs.** A lane reads `origin(s)`, its own destination, its own lane row, its node chain and
   its route. It reads nothing about other members (R-14 item 9). D-7 still applies: a steal leaves
   the lane at `P(x(β(c)))`.
5. **Consequences.**
   - Every lane with the same window and no Adjust passes `W_k + o` at the same beat, so the group
     holds its shape (R-hold).
   - An adjusted lane still passes **its** copy `W_k + o(D_k) + δ(D_k)` on the shared beat (S-08:
     "still passes every other group point on the shared count").
   - Lanes only translate: nothing rotates, which keeps G-1 and S-47.

#### Stored vs derived in C

- **Stored:** route geometry, from/to, timing (pins, holds, handoff), and per lane `o_s`, `o_e`,
  window, join mode, typed entry and node pointer. Also each node's profile and parent.
- **Derived, never stored:** placed points, W, the moments, the time map, anchor positions, legs,
  entries, the "changed" flag (draft §3.5), and group membership (lanes by `route_id`).
- **Never anywhere:** a centroid of the current members.

### 2.7 Variants considered and rejected

- **The brief's "path group object owned by the move, deltas in group count space".**
  - I keep the object: it is the route plus its timing. A separate group table would only be
    needed for live links (several groups sharing one geometry), and §5.7 rules those out.
  - I drop the owner column: I-L5 gives the same guarantee without making the timeline carry
    motion.
  - I drop count-space deltas, as §5.3 explains.
- **Person-keyed lanes** (`marcher → route` per move). This is B2 at heart. It fails S-20, S-27 and
  S-29, which need path follows slot (D-4).
- **A-link: a broken-out one-slot transition keeps `(dest_shape_id, slot k of n)`.** R-13's sample
  points depend on the transition's `n`, so the link would have to store n and break whenever the
  source compacts. Rejected.
- **B3 as the fallback.** Choose B3 if the owner prefers not to add a binding table. It then gives
  up F-11, F-12 on shaped transitions and an exact Remove path, and every breakout procedure still
  has to carry `path_params`. C's peel procedures have to carry lane rows in the same places
  (§8), so the procedure audit costs about the same.

---

## 3. Fact matrix (F × candidate)

Each cell is S / D / X / BO. The row's reason covers the cells that differ.

| Fact                                      | A   | B   | B1  | B2  | B3  | C   | Reason                                                                                                                                                             |
| ----------------------------------------- | --- | --- | --- | --- | --- | --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| F-01 geometry, stable ids                 | S   | S   | S   | S   | S   | S   | `routes.geometry`, ids per §5.2 in all                                                                                                                             |
| F-02 drawn ends                           | S   | S   | S   | S   | S   | S   | `from`/`to` in geometry                                                                                                                                            |
| F-03 ownership                            | D   | D   | D   | S   | D   | D   | ref-counted by walkers and pinned to one move by E-R5/I-L5. B2 stores `timeline_id`                                                                                |
| F-04 per-member offset                    | S   | S   | S   | S   | S   | S   | `path_params.offset`; B as per-slot JSON (rewritten by compaction); B2 member row; C `lane.o_s`                                                                    |
| F-05 group membership                     | D   | D   | D   | S   | D   | D   | walkers of the route; B: the transition's slots minus overrides                                                                                                    |
| F-06 several time maps per path           | X   | S   | S   | S   | S   | S   | per-member window/join. A's `path_params` allows only `{offset}` (`validate.ts:288–296`)                                                                           |
| F-07 pins                                 | S   | S   | S   | S   | S   | S   | K1 on the route, shared; Detach copies them                                                                                                                        |
| F-08 stops/holds                          | S   | S   | S   | S   | S   | S   | K1                                                                                                                                                                 |
| F-09 Adjust relative to group             | X   | X   | X   | S   | S   | S   | A: any lane edit is a new route (AP-R1/R9). B/B1: an override is a whole route. B2/B3/C: anchored delta profile                                                    |
| F-10 Detach plus provenance               | S   | S   | S   | S   | S   | S   | copy route + K6 provenance. Today A has no provenance (Rejoin recomputes `A − R.from`, `timelineGroupRoutes.ts:557–564` (01))                                      |
| F-11 override hierarchy                   | X   | X   | X   | X   | X   | S   | a linked sub-group needs a **shared** delta row. Only C has nodes. Per-member JSON can't link                                                                      |
| F-12 end spot stays with shape            | BO  | S   | S   | S   | BO  | S   | A/B3 freeze a point on breakout (`timelineRoutes.ts:506–527`). It matters only for `dest_shape_id`, see §1.3                                                       |
| F-13 spacing handoff                      | X   | S   | S   | S   | S   | S   | route `timing.handoff` + per-member `o_e`. A can't store `o_e`                                                                                                     |
| F-14 destination-derived offset, G frozen | X   | S   | S   | S   | S   | S   | `o_e = B_draw − G` stored per member, `G = route.to`                                                                                                               |
| F-15 per-member exit                      | S   | S   | S   | S   | S   | S   | the row ends at the exit beat, then a row in a one-slot transition to the solo spot (a join, R-5 rebase, D-7). As a **count** only: rows hold integer beats (I-N1) |
| F-16 late entry: beat, mode, length       | X   | S   | S   | S   | S   | S   | the beat is the row start in all. Mode and typed length need per-member timing, which A lacks                                                                      |
| F-17 excursion and re-entry, another lane | S   | S   | S   | X   | S   | S   | an excursion is a takeover move (absolute) or an Adjust (relative). Another lane needs K3; B2's person-keyed member row can't change lanes                         |
| F-18 path follows slot                    | S   | S   | S   | X   | S   | S   | A/B3 lane = one-slot transition = a slot; B/C keyed by `(T, slot)`; B2 keyed by marcher. A person-keyed **Adjust** is X in every column except B2 (§6)             |
| F-19 mid-move reassignment                | S   | S   | S   | X   | S   | S   | with K3: rows split at a beat. B2's lanes don't move with the slot                                                                                                 |
| F-20 entry rule after a takeover          | D   | D   | D   | D   | D   | D   | K2, computed per span                                                                                                                                              |
| F-21 source independence                  | S   | S   | S   | S   | S   | S   | offsets are stored vectors, so any arrangement can be written                                                                                                      |
| F-22 trail (FTL)                          | S   | S   | S   | S   | S   | S   | K5, orthogonal                                                                                                                                                     |
| F-23 steps per beat                       | S   | S   | S   | S   | S   | S   | K4                                                                                                                                                                 |
| F-24 stagger/ripple                       | X   | S   | S   | S   | S   | S   | per-member window `[ws, we]`; the rank rule is written by a tool (app)                                                                                             |
| F-24-x cross-flag continuity              | S   | S   | S   | S   | S   | S   | two halves plus a K6 continuity link. "One path with the flag as a pin" is X everywhere (one move per route)                                                       |
| F-25 mirror                               | S   | S   | S   | S   | S   | S   | as a copy. A live link is X everywhere (§6)                                                                                                                        |
| F-26 copy identity                        | S   | S   | S   | S   | S   | S   | paste writes new rows. B2 maps members by marcher, the others by slot                                                                                              |
| F-27 recipe link                          | S   | S   | S   | S   | S   | S   | K6 (draft §2.4)                                                                                                                                                    |
| F-28 frozen reference ends                | S   | S   | S   | S   | S   | S   | from/to + stored offsets. B as briefed ("derived offsets") is X                                                                                                    |
| F-29 stable ids, one edit one transaction | S   | S   | S   | S   | S   | S   | rows under history triggers. B's per-slot JSON has no row ids (S, but fragile)                                                                                     |
| F-30 absence = straight                   | S   | S   | S   | S   | S   | S   | no rows means today's motion                                                                                                                                       |
| F-34 several paths per move               | S   | BO  | BO  | S   | S   | S   | B/B1: one group route per transition, so a second group needs a split transition                                                                                   |
| F-36 vacancy on delete                    | S   | S   | S   | S   | S   | S   | C: the lane survives on the vacant slot (D-13). B2: the member row cascades and undo restores it                                                                   |

**Counts.**

| Candidate | X   | BO  |
| --------- | --- | --- |
| A         | 7   | 1   |
| B         | 2   | 1   |
| B1        | 2   | 1   |
| B2        | 4   | 0   |
| B3        | 1   | 1   |
| C         | 0   | 0   |

C's 0 X is for the facts as catalogued. The sub-options that every candidate fails are in §6.

---

## 4. Scenario matrix (S × candidate)

Assumes K. The last column explains C's result and the first failure in the others.

| S                           | A   | B   | B1  | B2           | B3           | C   | Notes                                                                                                                                                             |
| --------------------------- | --- | --- | --- | ------------ | ------------ | --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 01 nothing drawn            | P   | P   | P   | P            | P            | P   | no rows                                                                                                                                                           |
| 02 own path, obstacle       | P†  | P   | P   | P            | P†           | P   | C: a lane on B3's slot; the end stays in the block's transition; Remove path deletes one row (resolves S-02-a structurally)                                       |
| 03 run/flutter              | P   | P   | P   | P            | P            | P   | own route; K4                                                                                                                                                     |
| 04 midsets                  | P   | P   | P   | P            | P            | P   | K1 pins on the own route; #9 refused (whole beats)                                                                                                                |
| 05 pinned group path        | F#5 | F#5 | F#5 | P            | P            | P   | #5 Adjust B2; C: a node with keys around Q1–Q2 rides the pins (anchors are places, and pins map places to beats)                                                  |
| 06 block keeps shape        | P†  | P   | P   | P            | P†           | P   | C #5 Re-fit translates from/to/points; offsets kept. #7 deletes lanes, members untouched                                                                          |
| 07 into arc                 | P†  | P   | P   | P            | P†           | P   | #2 slot reorder: C moves lanes with slots; to keep lanes "start-derived per person" the procedure also swaps `o_s` (S-28-a)                                       |
| 08 Adjust one               | X   | X   | X   | P            | P            | P   | #1 anchors follow points; #2 the key between ids stays on its stretch; #3/#4 via the group clock; #5 updates the same node row                                    |
| 09 Adjust several           | X   | X   | X   | P            | P            | P   | independent nodes or one shared node (S-09-a); only C can link                                                                                                    |
| 10 heavy reshape            | X   | X   | X   | P\*          | P\*          | P\* | re-home by fraction in the same edit, badge (§5.3); S-10-a/b pick the policy, not the storage                                                                     |
| 11 Detach                   | F#4 | F#4 | F#4 | P            | P            | P   | #4 needs an adjusted member. C: copy route + copy node chain, so positions are identical; #3 Rejoin exact via K6                                                  |
| 12 Adjust vs Detach retimed | X   | X   | X   | P            | P            | P   | #4 split per §5.8 AP-R7′                                                                                                                                          |
| 13 subset in arc move       | P†  | P   | P   | P            | P†           | P   | B: the route on the arc transition, 12 overrides to "none"; C: 4 lanes, no breakout, no vacancy                                                                   |
| 14 nested                   | X   | X   | X   | F#2          | F#2          | P\* | #2 needs `SP` linked: C's shared node. S-14-a/b are procedures                                                                                                    |
| 15 two subsets              | P   | BO  | BO  | P            | P            | P   | B/B1: a second group route needs a second transition                                                                                                              |
| 16 exit early               | P\* | P\* | P\* | P\*          | P\*          | P\* | exit = row end (count, S-16-a) + a one-slot solo transition (S-16-b: takeover-free, same move)                                                                    |
| 17 cut in                   | F#5 | P   | P   | P            | P            | P   | A: the cut-in itself works via K2 (`A_ref = F + o`), but #5 needs a join mode. C: S gets a one-slot transition with a lane on R (I-L5 allows several transitions) |
| 18 late block, faster       | X   | P\* | P\* | P\*          | P\*          | P\* | `join = 'whole'`; pins scale with the lane clock (S-18-a default)                                                                                                 |
| 19 exit, re-enter own lane  | P\* | P\* | P\* | P            | P            | P   | absolute excursion = takeover move + K2 resume (all); relative = Adjust (B2, B3, C only). S-19-a                                                                  |
| 20 re-enter other lane      | F#2 | F#2 | F#2 | X            | P            | P   | K3 rows: m3 slot 3 `[0,6)`, slot 7 `[10,16)`; #2 an Adjust on lane 7 keyed after `x(10)` moves m3; #3 recast rewrites rows only                                   |
| 21 takeover, rejoin         | P   | P   | P   | P            | P            | P   | K2; S-21-a open                                                                                                                                                   |
| 22 handoff immediately      | X   | P\* | P\* | P\*          | P\*          | P\* | handoff at `('from', W_1)`; lanes use `o_e`; S-22-a: G frozen, so only C3 moves                                                                                   |
| 23 handoff at end           | F#3 | P\* | P\* | P\*          | P\*          | P\* | S-23-a: frozen `o_s` (today) is the default                                                                                                                       |
| 24 handoff at a point       | X   | F#5 | F#5 | P\*          | P\*          | P\* | #5 an Adjust on top of the morph; S-24-a morph shape                                                                                                              |
| 25 two sources              | P†  | P   | P   | P            | P†           | P   | arranged offsets are stored; S-25-a is a tool default                                                                                                             |
| 26 zipper trail             | P   | P   | P   | P            | P            | P   | K5, not a lane question                                                                                                                                           |
| 27 ranks swap               | F#2 | F#2 | F#2 | X            | P            | P   | #3 "F2 before 8" = lane F2's Adjust keyed before `x(8)`; S-27-a/b                                                                                                 |
| 28 swap end spots           | F#2 | F#2 | F#2 | P            | P            | P   | lanes follow the slot; "follow the person" = the procedure swaps `o_s` (S-28-a)                                                                                   |
| 29 recast whole show        | F#2 | F#2 | F#2 | P            | P            | P   | slot-keyed: rows only (recipes are keyed by marcher everywhere, `schema.ts:633`)                                                                                  |
| 30 least-travel reassign    | P   | P   | P   | P            | P            | P\* | S-30-a: Adjust stays with the lane; "with the person" is X (§6)                                                                                                   |
| 31 FTL block letter         | P   | P   | P   | P            | P            | P   | K5; #6 Adjust on a trail member is X everywhere (C: I-L2)                                                                                                         |
| 32 ripple                   | X   | P   | P   | P            | P            | P   | lane windows `[ws, we]`, both variants (S-32-a)                                                                                                                   |
| 33 across a page flag       | P\* | P\* | P\* | P\*          | P\*          | P\* | two routes + continuity link; the "one path, flag as pin" option is X everywhere                                                                                  |
| 34 mirror                   | P\* | P\* | P\* | P\*          | P\*          | P\* | copy: geometry `x→−x`, `o_s`/`o_e`/`d` with `dx→−dx`, anchors unchanged. Live link X                                                                              |
| 35 copy/paste               | X   | X   | X   | P            | P            | P\* | setup has an Adjust. S-35-a mapping by slot (C)                                                                                                                   |
| 36 re-fit                   | P   | P   | P   | P            | P            | P   | anchors are relative, so Re-fit keeps Adjusts                                                                                                                     |
| 37 holds, stops             | F#3 | F#3 | F#3 | P            | P            | P   | #3 Adjust shares the route's stop                                                                                                                                 |
| 38 Basic/Expert             | P\* | P\* | P\* | P\*          | P\*          | P\* | #1 takeover + K2; #2 exact split (§5.8) or left alone; #3 copy route for the split-off move                                                                       |
| 39 long undo                | X   | X   | X   | F (sub-path) | F (sub-path) | P   | every step is a transaction under history                                                                                                                         |
| 40 v0.1.7 and fork files    | P   | P   | P   | P            | P            | P   | (a) no rows in all; (b) C: M0 maps each route transition to one lane, exact (§5.9); B: must merge one-slot transitions into one                                   |
| 41 recipes as path          | P†  | P   | P   | P            | P†           | P   | (a)/(b) K5 + K6; (c) like S-07                                                                                                                                    |
| 42 centroid anchor          | P   | P   | P   | P            | P            | P   | stored F, G, offsets. B as briefed (derived) fails #1                                                                                                             |
| 43 route ownership          | P\* | P\* | P\* | P\*          | P\*          | P\* | one owner + copies (S-43-a); shared across moves X everywhere                                                                                                     |
| 44 split group path         | X   | X   | X   | P\*          | P\*          | P\* | setup has an Adjust. C: exact for corner routes with constant o and δ across the cut piece, else AP-R7's redraw tolerance; S-44-a                                 |
| 45 split by marchers        | P\* | P\* | P\* | P\*          | P\*          | P\* | copy semantics; merge re-unites routes with equal geometry and timing                                                                                             |
| 46 delete marcher           | P   | P   | P   | P            | P            | P   | C: the lane stays on the vacant slot; undo restores the row                                                                                                       |
| 47 slide then turn          | P   | P   | P   | P            | P            | P   | translation only                                                                                                                                                  |
| 48 dot drag mid-path        | P\* | P\* | P\* | P            | P            | P   | #2 a lane-marker drag: Adjust where it exists, else Detach (S-48-a)                                                                                               |

**Tally (P, P\* and P† all count as passes).**

| Candidate | Pass | Fail or X |
| --------- | ---- | --------- |
| A         | 27   | 21        |
| B         | 31   | 17        |
| B1        | 31   | 17        |
| B2        | 44   | 4         |
| B3        | 46   | 2         |
| C         | 48   | 0         |

- **B3's two misses** are S-14 and S-39 (linked sub-path). Its six P† rows depend on the shape tool
  writing points.
- **C's P\* rows** are owner choices that its storage can express either way.

---

## 5. Decisions

### 5.1 Relax `UNIQUE(transition, slot)` and `UNIQUE(transition, marcher)` (`schema.ts:516–523`) to beat ranges

**Decision: yes.** They become overlap triggers, with an exception for follow-the-leader.

- **Why.** Both are timeless, so no model can express "slot 7 is m7 until 6 and m3 from 10"
  (S-20, S-27, F-19) or one marcher in two slots of one transition (01 crack 1). This is
  independent of where paths live, so it is K3.
- **Replacements.**
  - **I-A4′:** rows sharing `(transition_id, slot_index)` don't overlap in `[start, end)`, at any
    layer. A slot holds one marcher at any beat.
  - **I-A5′:** one marcher's rows in one transition don't overlap, at any layer. I-A3 already
    covers the same layer; I-A5′ forbids two slots at once at different layers.
  - Both are `BEFORE INSERT/UPDATE` row triggers modelled on `asn_overlap_*` (`triggers.ts:201–211`
    (01)).
- **Cheap to apply.** The two constraints are `CREATE UNIQUE INDEX` statements
  (`migrations/0017_powerful_edwin_jarvis.sql:25–26`), so dropping them needs no table rebuild.
- **The FTL exception.** On `follow_the_leader` transitions the timeless rules stay, as triggers
  checked on `path_style` changes too. R-9 step 5 says "there are always enough points, because of
  I-A4" (spec line 743). The resolver keys trail targets by marcher and indexes
  `pts[n−m−1−k]` per row (`core/resolver.ts:612–619`), so a second row per marcher or more rows than
  slots would overwrite a target or index below 0.
- **Resolver.** R-2/R-3 don't change. A marcher's second row in T is a **join**, its first span,
  and lanes give joins K2's entry instead of `lerp` (`core/geom.ts:706`).
- **D-13** becomes time-ranged: a slot may be vacant over part of a move.
- **App audit.**
  - Every "one row per marcher per move" `.get()` (01 crack 9: `readMembers`, `drawRoute`,
    `ownPath`) must refuse or iterate. `severalMoves` (`db/timelineMoves.ts:579`) already refuses
    safely.
  - The casting helpers (`db/timelineAssignmentEdits.ts`) need range-aware vacancy.
  - Compaction (`db/timelineMembership.ts:545–619`) must move **every** row on the top slot.

### 5.2 Path keyed by slot or by person

**Slot.**

- A lane is `(transition_id, slot_index)`. The occupant is whoever the assignments put there at that
  beat (D-4). This is precedent lesson 7: Blender action slots, Houdini attribute binding, ZoneGraph
  lanes.
- **Consequences.**
  - Recast and least-travel reassignment touch rows only (S-29, S-30).
  - A lane, its Adjust and its timing go to whoever re-enters it (S-20 #2, S-27 #2).
  - "Adjust F2 before 8" is the lane's Adjust keyed to places before `x(8)` (S-27 #3).
- **Per-person needs.** Use Detach (an own route on that lane), or, for "lanes follow the person"
  after an end-spot swap, a procedure that swaps `o_s` between the two lanes (S-28-a).
- A truly person-keyed Adjust, one that follows a marcher to another lane, is **not expressible**
  (§6, owner question Q1).
- **Compaction keeps the binding.** When it renumbers a shapeless transition's slots, it moves each
  lane row with its slot, exactly as it moves the destination point
  (`db/timelineMembership.ts:545–619`). Shaped transitions are never compacted (:547).

### 5.3 How Adjust survives adding and removing points

**Anchors are stable point ids plus a fraction.** Counts and indexes are both rejected.

| Keying                                   | S-08 #2 add a point          | S-08 #3 resize                    | S-08 #4 pin to 8     | S-10 #1 delete anchor | S-10 #3 redraw |
| ---------------------------------------- | ---------------------------- | --------------------------------- | -------------------- | --------------------- | -------------- |
| Point index                              | wrong stretch                | ok                                | ok                   | wrong point           | wrong          |
| Count (beats)                            | bulge slides along the curve | stays on old count, off the curve | off the pinned point | ok                    | ok             |
| Fraction of the group clock (`u`)        | slides                       | ok                                | off                  | ok                    | ok             |
| **Path fraction between stable ids (C)** | **stays on its stretch**     | **ok**                            | **ok**               | **re-homed**          | **re-homed**   |

- **Why ids win.** Pins map places to beats, so a place-keyed delta inherits every retiming for
  free (S-08 #3/#4, S-12 #1–3). §5.2 already promises ids that are "never reused" so that "later
  steps name points by id" (spec lines 459–464).
- **Re-home procedure,** inside AP-R1′ (every point edit writes the whole list, spec AP-R1 step 2),
  so it's the same transaction and one undo step:
  1. For each key whose `a` or `b` is gone, compute its `x_old` on the old W.
  2. Let `a′` and `b′` be the nearest **surviving** neighbours (or `'from'`/`'to'`).
  3. Write `f′ = (x_old − D_old(a′))/(D_old(b′) − D_old(a′))`.
  4. Keys whose ids survive aren't touched. Their meaning is "the same fraction between the same
     two points".
  5. **Redraw** (AP-R8 "again", all ids new): `a′='from'`, `b′='to'`, `f′ = x_old/L_old`.
  6. Set `"rehomed": true` in the profile. The resolver ignores the flag; the UI badges it
     (lesson 4: never drop silently).
  7. The other policies from S-10-a (drop, convert to Detach) are writable with the same tables, so
     the choice is UI, not storage.
- **The delta is in field axes,** the same as offsets (spec §5.2) and consistent with slide-only
  (G-1). Path-local lateral/along deltas would rotate a bulge when the path turns, which is a
  "turn with the path" in disguise.
- **Interpolation is linear in x.** Smoothing can be an additive `interp` key later.

### 5.4 Handoff storage (influence over a range of the path)

- **Stored:** `routes.timing.handoff = {from: Anchor, to: Anchor}` (group level, lesson 5) and per
  lane `o_s` and `o_e`, both frozen at draw time or Re-fit (F-28).
- **Computed:** `o(x) = lerp(o_s, o_e, w(x))`, with `w` a linear influence over `[x_h0, x_h1]`.
- **Common settings.**
  - **Absent** = today: start spacing until the last point, then the last leg.
  - **"Immediately"** = `[from, W_1]`.
  - **"At a chosen point"** = an anchor range.
- **Continuity.** An instant handoff inside the rigid part would make the lane jump, so I-J4
  allows `x_h0 = x_h1` only inside a leg. This makes 02's note at S-24 a rule.
- **Anchored to places, not counts.** A designer who wants a count pins the point (K1). Handoffs
  then retime with pins exactly as Adjusts do. This is part of owner question Q2.
- **Only the member's own data.** `o_e = B_draw − G` is frozen. `G = route.to` is stored. Dragging
  C3's end changes only C3's last leg until Re-fit (S-22-a: "only C3's lane").
- **Start offsets are frozen** (today, S-06 #6). The live variant (`o_s = A − F`, S-23-a) would also
  read only own data. I recommend frozen; the choice is a default, not a storage change.

### 5.5 Late join: lag (cut in) vs own progress (whole path)

- **Both, per lane** (lesson 6). `cut_in` is the default for joins, and every resume uses it: K2's
  entry aims at the lane's founding evaluation, which is "where the group is".
- `whole` maps the lane clock onto `[s.start, we]`. It is R-5's rebased progress applied to the group
  clock, so pins scale proportionally (the S-18-a default). "Refuse" would be a write check, and
  "ignore pins" would need a flag.
- **Ripple** uses the same clock through a stored `window` (S-32), written by a tool. The rule
  "by rank, interval 2" stays app data, so deleting B2 leaves B-rank on 2.
- **Limit.** One join mode per lane. If two different occupants join the same lane at different
  times, they share it (§6).

### 5.6 Nesting depth and order

- **Structure.** Route (root) → sub-group node → per-lane node. Depth is at most 2 (I-J1, lesson 8).
- **Order doesn't matter.** Composition is a **sum** of field-axis displacements, which is
  commutative. Only non-additive operations (rotation, scale) would make order matter, and G-1
  excludes them.
- **Edits.**
  - **Reset a sub-group:** re-parent its children to the route (`parent_id = NULL`), then delete the
    node. Children keep their deltas, which are relative (S-14-a default).
  - **Detach a sub-group:** copy the route (point ids kept, so anchors still resolve) and move the
    node's subtree under the copy.
  - **Detach one lane:** copy the route and **copy** its chain, since the sub-group node is shared.
    Positions stay identical whatever the interpolation.
  - **Remove path on a parent with adjusted children** (S-14-b) is a Logic-style choice (lesson 10).
    Convert writes copies; revert deletes lanes, then nodes, then the route.
- Depth > 2 is a check, not a schema change.

### 5.7 Route ownership

- **One owner, always.** A route's lanes are in one move (I-L5). Every reuse is a **copy**: split by
  marchers, paste, mirror, cross-flag halves.
- **Links are app data** (K6). Provenance makes Rejoin exact. Continuity and mirror links let the
  editor offer "edit both", and stay out of the resolver.
- **Why not shared routes across moves (S-43-a).**
  - I-R5's single range is what lets every member share one group clock.
  - Shared routes would need refusing or co-resizing (draft §5.2), and refcount orphans (lesson 10).
  - Live mirrors would need a transform link that the resolver reads.
  - This is owner question Q3.

### 5.8 What happens to D-16, R-1, I-R2, E-R4/E-R5 and AP-R1…R10

**Rules.**

| Rule | Under C                                                                                                                                                                                                                                                         |
| ---- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D-16 | **Unchanged.** Destinations still come from a shape or from points. A path is a per-slot attribute beside them. B1's relaxation isn't needed: a solo exit or a cut-in joiner gets its own one-slot transition in the same move, and lanes may live there (I-L5) |
| R-1  | **Unchanged.** The resolver reads lanes and routes, never timelines. I-L5 is an app commit view                                                                                                                                                                 |
| I-R2 | **Retired.** No new `path_style='route'` rows, so the CHECK (`schema.ts:478`) is vacuous until the fold migration drops it. Replaced by I-L1…I-L5                                                                                                               |
| E-R4 | → I-L4: the own path is a lane with NULL offset, the only lane of its route. "Own vs group" is still inferred from NULL, as spec §5.2 intends ("never need a stored flag")                                                                                      |
| E-R5 | → I-L5: lanes of a route are in one timeline. The same range follows from C-11                                                                                                                                                                                  |

**Procedures.**

| Procedure                              | Under C                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| -------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| AP-R1′ draw or edit one marcher's path | Insert or update the lane on the marcher's **current** slot. **No breakout.** Point edits re-home Adjust anchors (§5.3)                                                                                                                                                                                                                                                                                                                   |
| AP-R2′ Remove path                     | Delete the lanes, then the nodes (children first), then the K6 rows, then the route. Members never left their transitions, so they are "back in the shape" (S-02-a, S-06 #7, S-13 #5)                                                                                                                                                                                                                                                     |
| AP-R3′ delete a move or transition     | The choke point `deleteTimelineTransitionRowsInTransaction` (`db/timelineTransitionsInTransaction.ts:674–722` (01)) deletes the lanes of the deleted transitions first, then orphaned nodes, then orphaned routes                                                                                                                                                                                                                         |
| AP-R4/R5                               | Unchanged. Range edits move K1 pins and lane windows by R-pin (counted from the edge not dragged)                                                                                                                                                                                                                                                                                                                                         |
| AP-R6                                  | Most refusals lift. What stays: lanes on FTL, and a split through mixed windows unless cohorts are copied                                                                                                                                                                                                                                                                                                                                 |
| AP-R7′ cut at b                        | Group: one route pair **per distinct lane window** (a cohort), cut at that cohort's `x(b)`. Pins at or before b go to the first half; later ones shift by `−(b − T.start)`. Adjust keys and the handoff are split by x, with a fresh-id corner at the cut. Exact for corner routes when o and δ are constant across the cut piece; otherwise it uses AP-R7 step 2's "curves next to C redrawn". A cut inside first or last legs is S-44-a |
| AP-R8′ draw a group path               | Insert the route and one lane per member on its current slot, `o_s = A − F`, F and G stored. "Again" updates geometry in place and re-homes Adjusts. **No `giveOwnTransition`.** Members may sit in several transitions of the move                                                                                                                                                                                                       |
| AP-R9′ Own path / Detach               | Copy the route with its timing (ids kept); re-point the lane; copy its node chain; write provenance (K6: source route, `o_s`, the node chain)                                                                                                                                                                                                                                                                                             |
| AP-R10′ Rejoin                         | Re-point the lane to R. Take `o_s` from provenance when it came from R (exact, S-11 #3), else `A − F` or an arranged offset. The copy goes if orphaned. Restoring the adjustment is S-11-a                                                                                                                                                                                                                                                |

### 5.9 v0.1.7 files and fork data

- **v0.1.7 files** are page-model, user_version 7. They are converted on open into direct
  transitions (`electron/database/fileVersion.ts:8–12`, `convertOnOpen.ts`). They have no routes,
  so they get no lanes or nodes; the new tables are created empty. **Nothing to migrate, at every
  step** (ADR 0016 line 74). The file version stays at 10 = "has paths"
  (`fileVersion.ts:19–22`), written with the first route as today.
- **Fork files** (owner: fork-internal data doesn't matter). M0 is exact anyway:
  1. For each T with `path_style='route'`, `INSERT lane(T, 0, route_id, offset from path_params or
NULL)`.
  2. `UPDATE T SET path_style='direct', route_id=NULL, path_params=NULL`.
  3. Positions are bit-identical by the §2.6 bit-identity rule.
  4. Broken-out one-slot transitions stay. An optional "tidy" may later merge them into one points
     transition, which is exact because they're shapeless.
- **Folding before main.** The pathways migrations fold into one, which never adds `'route'` to
  `path_style` and never adds the I-R2 CHECK, so main gets no table rebuild for it.

### 5.10 Caching and invalidation (no live centroids)

- **Per-route cache.** W, `D^W`, the kept points, the group clock, anchor positions and handoff
  positions. Recomputed on a route geometry or timing change. This also fixes the per-frame
  `groupSchedule` rebuild (`core/geom.ts:568`, called per point at :708–717), which W-5 permits.
- **Per-node cache.** The resolved profile in x. It depends on the route and the node, and is
  invalidated by either.
- **Seeds**, extending spec §9.4 (lines 1157–1167):

| Change                   | Seeds                                                                                                       |
| ------------------------ | ----------------------------------------------------------------------------------------------------------- |
| Route geometry or timing | W-3/W-5 for every T that has a lane on R (`routeWalkers` becomes route → lanes, `core/resolver.ts:282–297`) |
| A node                   | W-3 for the transitions of the lanes in its subtree                                                         |
| A lane row               | W-3 for its T                                                                                               |

W-3 per T is coarser than per slot: it over-invalidates the other occupants of a 16-slot
transition, but stays correct. Per-(T, slot) seeding is an optimisation.

- **No centroids.** No input is another marcher's position, start, end or offset. F, G, `o_s` and
  `o_e` are stored, and the `whole` window start is the member's own span start. So R-14 item 9 and
  §9's acyclicity hold.

### 5.11 Undo as one step

- Every procedure above is one `transactionWithHistory`. Lanes and nodes are resolver data, so they
  go in the change log with history triggers, as routes do. K6 rows get history triggers only.
- **Statement order** (C-1, I-D3 RESTRICT): lanes → child nodes → parent nodes → route, and the
  reverse on insert. Undo replays in reverse with foreign keys off, keeping rowids (C-2).
- Re-homing, provenance and cohort copies are written **inside** the same edit, so undo restores
  ids exactly (S-39).

---

## 6. What C still can't do, and the owner questions that change stored data

### 6.1 Can't do (plainly)

1. **A person-keyed Adjust**, one that follows a marcher to another lane (S-27-b and S-30-a in their
   "person" readings). Only Detach is personal.
2. **One path across a page flag** with the flag as a pin. It is two routes plus a link, and editing
   one half doesn't move the other unless the editor writes both (S-33-a).
3. **Live links** of any kind: a mirror (S-34-a), a route shared by two moves (S-43-a), or a
   split-off move still on the parent's path (S-45 #1 "shared").
4. **Turning with the path,** by decision G-1. Lanes and Adjusts only translate.
5. **Exits, joins and re-entries at a place on the path, or at sub-beats.** They are assignment
   boundaries, so they are integer beats (I-N1). Handoffs and Adjusts are places.
6. **A slot switching routes mid-move.** I-L3: one lane per slot for the whole move. Use another
   slot (K3 rows) or a takeover move.
7. **Different join modes for successive occupants of the same lane.**
8. **An Adjust on a follow-the-leader trail member** (I-L2). It has to leave the trail (S-31-b).
9. **An exact group split at the playhead** when o or δ varies across the cut piece, or on curves.
   That case is within AP-R7's redraw tolerance. A cut inside first or last legs is S-44-a.
10. **Exactness of Detach vs today's AP-R9 walk.** C's Detach stays a one-lane **group** walk, so
    positions are identical at once. Today's own-path walk would change leg speeds after later
    start edits. If the owner wants today's AP-R9 behaviour, Detach writes an own lane instead and
    positions differ within the S-11 "within rounding" note only when the ends were `F+o`/`G+o`.

### 6.2 Owner questions that change stored data

UI defaults (S-09-a, S-10, S-14-a/b/c, S-18, S-21-a, S-22-a, S-23-a, S-25-a, S-32-a, S-44-a,
S-48-a) are left out: C stores both answers.

| Q   | Question                                                                                                                      | Storage impact                                                                                            | Recommendation                                                                      |
| --- | ----------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| Q1  | (S-27-b, S-30-a) Must an Adjust ever follow the **person** to another lane?                                                   | yes: a `marcher_id` key on nodes and resolver lookup by occupant                                          | No; personal = Detach                                                               |
| Q2  | (S-16-a, S-24) Exits and handoffs: **count** or **place on the path**?                                                        | exits as places need a per-occupancy anchor (new column); handoffs as counts would switch to beat offsets | Exits = counts (rows); handoffs and Adjusts = places, pinned when a count is wanted |
| Q3  | (S-33-a, S-34-a, S-43-a) Any **live** link: a path over a page flag as one object, a live mirror, shared routes across moves? | yes: drop I-L5, add refcounts or a resolver-read transform link                                           | Copies + app-data links now; additive later                                         |
| Q4  | (S-31-b) Adjust on follow-the-leader members?                                                                                 | yes: lanes on FTL, and an R-9 rewrite                                                                     | No; Detach                                                                          |
| Q5  | (§6.1 #10) Detach: one-lane group walk (exact at once) or own-path walk (today's AP-R9)?                                      | which lane kind Detach writes; no schema change, but the stored data differ                               | One-lane group walk                                                                 |

---

## 7. Migration path, smallest first (each step is a lab build)

| Step | Change                                                                                                                                                                                                                                                 | Lab can try                                                                          | Shippable because                                          |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------ | ---------------------------------------------------------- |
| M0   | `timeline_lanes` table, change log and history; migrate route transitions to lanes (§5.9); resolver dispatch "lane first"; AP-R\* write lanes **still on one-slot transitions** (behaviour identical); invariants I-L1…I-L5; per-route schedule cache  | nothing new: parity build                                                            | bit-identity rule; oracle parity tests; v0.1.7 untouched   |
| M1   | Stop breaking out: AP-R1′/R8′/R10′ put lanes on current slots; Remove path deletes lanes only; compaction, split-by-marchers peel, `deleteTimelineTransitionRows` carry lanes; Basic's simple predicate checks lanes (`timeline/basicSimple.ts:67–68`) | draw on a recipe block, Remove → block intact; re-place the recipe; ghost slots gone | one table write per member; same resolver                  |
| M2   | Re-fit (plan step 3) on lanes                                                                                                                                                                                                                          | Re-fit button                                                                        | route-level only                                           |
| M3   | K1 pins/holds (plan step 5/14) in `routes.timing`; lane clock = group clock                                                                                                                                                                            | midsets on group paths                                                               | lanes inherit                                              |
| M4   | `timeline_route_adjusts`, per-lane nodes only; lane drag on an open path = Adjust; re-home in AP-R1′; Detach = copy + chain; K6 provenance; exact Rejoin                                                                                               | Adjust vs Detach (S-08, S-10, S-11)                                                  | additive table; no-adjust lanes still bit-identical        |
| M5   | Sub-group nodes (depth 2), linked multi-select Adjust                                                                                                                                                                                                  | S-09, S-14                                                                           | check only                                                 |
| M6   | Handoff: `timing.handoff` + `lane.o_e`                                                                                                                                                                                                                 | S-22–S-24                                                                            | absent = today                                             |
| M7   | K3: drop the two UNIQUE indexes, add I-A4′/I-A5′ triggers (FTL keeps timeless); K2 entry rule for joins and resumes on lanes (plan step 12); audit `.get()` sites                                                                                      | cut-in joins, re-entry on another lane, swaps (S-17, S-20, S-27)                     | the triggers only accept more; existing files satisfy them |
| M8   | Lane `timing`: `join='whole'`, windows; ripple tool                                                                                                                                                                                                    | S-18, S-32                                                                           | absent = today                                             |
| M9   | AP-R7′ group split by cohort; split-by-marchers and merge with lanes (plan step 17); paste and mirror copy lanes and nodes                                                                                                                             | S-44, S-45, S-34, S-35                                                               | refusals lift one by one                                   |

M7 can move earlier if swaps are wanted sooner. It depends only on M0.

---

## 8. Costs and risks of C (so they aren't hidden)

- **Procedures that must carry lane rows**, the same places B3 would carry `path_params`:
  - `giveOwnTransition`, kept for point drags that still break out;
  - `createOwnTransitionsInTransaction`, `removeAssignmentRowsInTransaction` (compaction);
  - `splitMarchersIntoNewMoveInTransaction` (peel, `db/timelineSplitMoves.ts:356–391` (01));
  - `writeFirstHalfTransition` (split, which today drops params, 01 crack 12);
  - `mergeMovesInTransaction`, `joinMovesAtInTransaction`;
  - casting (`db/timelineAssignmentEdits.ts`), copy/paste and mirror (01 §2).
    Any procedure not updated must **refuse** when it touches a slot with a lane. One check helper
    replaces the scattered `pathStyle === 'route'` tests.
- **Resolver.** Dispatch moves from per transition to per (T, slot). It needs a new per-route cache
  and the generalised schedule, and the oracle (`core/oracle.ts`) must implement the same R-14′.
  QA-RT golden vectors for windows, Adjust and handoff are needed.
- **The `keepThroughMovesAcross` abort** (01 crack 6) and the uncaught refusals stay bugs until M1
  audits them.
- **I-L3 is a product limit** (one route per slot per move). Lifting it later would need lane
  ranges, which is exactly what K3 avoids by moving people between slots.
- **Not measured.** Runtime cost of per-frame evaluation with node chains. The per-route cache
  should make it cheaper than today's per-point `groupSchedule` rebuild.

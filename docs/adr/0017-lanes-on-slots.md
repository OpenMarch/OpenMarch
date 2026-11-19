# 0017: A group path is one route; lanes bind slots to it

- Status: accepted (owner, 2026-11-05 and 2026-11-06)
- Date: 2026-11-06
- Number: was 0015 until 2026-11-18, when fork main's own 0015 (cue model) came in
- Amends: [0016](0016-moves-follow-drawn-paths.md) §1 ("a transition opts in with a new path
  style, `route`") and §3 ("One file version bump … Later steps don't bump it again")

## Context

ADR 0016 lets a transition walk a drawn path (a **route**). Step 15 (fork PR #683) lets several
marchers share one route as a **group path**. To do that, every member is broken out of its
transition (`giveOwnTransition`, `db/timelineRoutes.ts:483–528`). The result is N one-slot
`route` transitions that share a `route_id`, each with `path_params = {"offset": [dx, dy]}`. The
group is held together only by commit checks E-R4 and E-R5.

The pathways grill (2026-11-05, [`model-c/`](../timeline/research/pathways/model-c/README.md), reports 01 to 07) tested that model
and four alternatives against the owner's ten capabilities and 48 scenarios. Today's model cracks
in these places:

- **Breakout loses structure.** A member leaves its shaped or shared transition, so its end spot
  becomes a frozen point and the shape link is lost. Its old slot stays vacant, and Remove path
  can't put it "back in the shape".
- **No place for per-member facts.** `path_params` holds only `{offset}`. There is nowhere to
  store an Adjust, a spacing handoff, a late-join mode, a ripple window or a linked sub-group.
- **Occupancy is timeless.** `UNIQUE(transition_id, slot_index)` and
  `UNIQUE(transition_id, marcher_id)` (`schema.ts:516–523`) rule out "slot 7 is m7 until count
  6, then m3 from count 10". That also rules out swaps, re-entry on another spot, and a spot that
  a marcher doesn't own forever.
- **Joins never ride a path.** A non-founding span walks straight (`core/geom.ts:706`), so "enter
  a path after it starts" is impossible whatever the storage.

The owner answered the open questions on 2026-11-05 (binding):

1. Model C. A group path is one route, and lanes bind (transition, slot) to it. Marchers are no
   longer broken out to get a path.
2. There are two override kinds:
   - **Adjust** stays owned by the group path and follows its reshapes. It is keyed by a stable
     point id plus a fraction.
   - **Detach** makes a copy. A Detached member keeps walking in step with the group, passing
     each point on the same count, until its path is edited.
3. An Adjust belongs to the **spot** (slot), not the person. A personal tweak is refused while
   another marcher occupies that spot during the move.
4. Marchers leave and enter a path at a **count**. The destination-spacing handoff happens at a
   **place** on the path, and the designer chooses where.
5. A late join can do either: cut in where the group is, or walk the whole path faster.
6. Spot occupancy is by count range. The two UNIQUE rules become beat-range overlap rules.
   Follow-the-leader keeps its timeless rule.
7. Live links are copies for now and links later: a mirror, a path reused across moves, a path
   continuing across two separate moves. A page flag inside one move is only a mark in time.
8. Follow-the-leader members may be Adjusted between locked checkpoints. The tweak is zero at
   the checkpoints and the timing there is unchanged.
9. Fork-internal data doesn't matter, but v0.1.7 release files must open.
10. Precedents come from DAWs, Figma, After Effects and Blender only.

Later the same day the owner settled the draft's four open questions (binding; [open questions](../timeline/research/pathways/model-c/open-questions.md)):

11. **An emptied spot keeps its lane and Adjust** for whoever is cast there next. The path goes
    only when none of its lanes has an occupant left (Q1).
12. **On a recast, the lane's start offset follows the new person**, from where they stand. The
    path and the Adjust stay with the spot. Only the start-of-move occupant's offset is
    rewritten; later occupants of the spot are not moved (Q2, 07 N9).
13. **A follow-the-leader Adjust is keyed by slot**, so it stays with the marcher (Q3).
14. **Rejoin after Detach always drops the old Adjust.** The spot goes back on the plain group
    lane. There is no conditional keep and no toast; undo restores it (Q4).

## Decision

### 1. A path reaches a slot through a lane

- A new resolver table, `timeline_lanes`, binds one **slot** of one transition to one route:
  `(transition_id, slot_index) → route_id`.
- A route has no owner column. Its lanes all sit in one move (I-LN5).
- Marchers stay in their transitions:
  - drawing a path writes lanes and never rewrites transitions or assignments;
  - shaped transitions keep their shape;
  - Remove path deletes lanes, so the members are back in the shape.
- Transitions stop using the `route` path style. `route_id` on a transition remains only for a
  follow-the-leader trail.
- D-16 (shape or points) and R-1 (the resolver never reads timelines) are unchanged.

The lane stores:

| Column | Meaning |
| --- | --- |
| `offset_x`, `offset_y` | The start-side offset `o_s` from the route's `from` (F). Written from the spot's founding occupant at draw time. Both NULL means an **own** lane: one marcher's own path, walked alone (I-LN4). |
| `adjust` | This spot's own Adjust profile, as JSON. NULL means none. |
| `group_adjust_id` | The linked sub-group Adjust this spot shares with others. NULL means none. |

- A linked sub-group Adjust is a row in `timeline_route_adjusts(id, route_id, profile)`.
- Nesting depth is therefore fixed by the structure: route, then sub-group, then spot.
- There is no `parent_id`, so a cycle is impossible.

The end-side offset is **derived**, never stored: `o_e = destination(T, k) − G`, where G is the
route's `to`. It reads only the lane's own destination, so the lane never reads another marcher.

### 2. Adjust is a displacement profile at places on the group path

- A profile is a list of keys `{a, b, f, d}`:
  - `(a, b, f)` names a place on the reference walk, a fraction `f` between two stable point ids
    (or `'from'` / `'to'`);
  - `d` is a field-axis displacement.
- Between keys the profile is linear in distance along the path. Beyond its first and last key it
  is constant.
- Places, not counts. Pins map places to counts, so an Adjust follows every retime (resize, pin
  moves, steps per count) for free.
- When an anchor's point is deleted or redrawn, one helper re-homes the key by fraction in the
  same edit, so it is never dropped silently. Every writer of route geometry calls that helper.
- A commit check refuses any anchor that names a missing id.
- **Keys are at least one step apart** (`s_min`, one 8-to-5 step on the default field, 11.25
  field units). So are a handoff ramp's two ends. Closer keys would let a marcher cross a whole
  bulge within a fraction of a count, which is a teleport, not a move. The commit check enforces
  it where SQL can measure the distance exactly. The write path enforces the rest, and Big steps
  judges each adjusted stretch's speed (spec I-J4, I-H1 and Appendix J.6).
- Precedents:
  - an After Effects child layer stores its delta in its parent's space;
  - a Figma instance override survives main-component edits, and a key whose anchor is gone is
    re-homed rather than dropped (Figma's most-reported override failure is silent loss);
  - Blender gives shape-key data stable ids so that topology edits don't scramble it.

### 3. Detach is a copy that keeps the group's timing

- Detach copies the route: geometry, ids and timing.
- If the spot is in a linked sub-group, Detach copies that sub-group's profile too.
- Detach re-points the lane at the copy and keeps `o_s` and the spot's own profile.
- The inputs are identical, so the positions are bit-identical at once. The member passes every
  point on the group's counts until someone edits the copy.
- An app-data provenance row (never read by the resolver) records the source. Rejoin re-points
  the lane back and clears the spot's Adjust (own and linked), so the spot walks the plain group
  lane (owner, Q4). It is exact for a spot that had no Adjust and whose group path wasn't edited.
  Undo restores the Adjust.
- Precedents: Figma's Detach instance keeps the current properties, and Logic Pro's alias
  Convert keeps the alias's own playback settings.

### 4. The spot owns the path; occupancy is by count range

- I-A4 and I-A5 become overlap rules (I-A4′, I-A5′): one marcher per slot at any beat, and one
  slot per marcher at any beat. Follow-the-leader transitions keep the timeless rules, because
  R-9 step 5 depends on them.
- A lane, its route and its Adjust carry on through whoever occupies the slot at a beat. This is
  Blender's action slots: "any data-block can use any slot".
- **Personal edits are refused while the spot is shared.** These edits are reached by selecting a
  marcher:
  - own path;
  - Adjust;
  - Detach;
  - leave the path.

  Each is refused when the lane's slot holds rows of another marcher anywhere in the move. The
  refusal names that marcher and the counts.
- **Path edits are not personal.** Editing an open path's points, or drawing it again from the
  open path, changes the path for its spots, so it is allowed after swaps and moves every
  occupant of those spots (07 N3).
- **A recast rewrites the start offset only for the start-of-move occupant** (Q2). A later
  occupant of the spot keeps the offset it was riding: the recast writes that offset onto the
  later occupant's assignment row (`path_timing.offset`, §6), so a recast of one person never
  moves another (07 N9).

### 5. Counts for occupancy, places for handoff

- **Leaving and entering** a path are assignment-row boundaries, which are integer beats.
- **The handoff** is a ramp between two anchors, stored on the route in `timing.handoff`. Within
  the ramp a lane's offset blends from `o_s` to `o_e`. This is Blender's constraint Influence,
  and NLA blend-in and blend-out.
- Instant handoffs are allowed only at or before the first kept point ("immediately") or at or
  after the last one ("at the end"). Anywhere else a ramp is at least `s_min` long, because an
  instant handoff there would make the lane jump.

### 6. Per-occupancy timing lives on the assignment row

- `timeline_assignments.path_timing` is nullable JSON:
  - `join`: `cut_in` (the default) or `whole`;
  - `counts`: with `whole`, walk the path in this many counts from the row's start;
  - `entry`: with `cut_in`, a typed entry length;
  - `offset`: on a row with no founding span, the start offset this occupancy rides instead of
    the lane's. Only a recast writes it (§4, Q2).
- **`cut_in`** walks the group clock. A join or resume enters by first fit (the entry rule).
- **`whole`** maps the group clock onto the row's own window `[row.start, row.start + counts]`,
  clamped to the move. It is After Effects' Follow Path with its own progress, and Blender's NLA
  strip scale.
- These facts belong to one occupancy, not to the spot. Storing them on the row keeps each one
  with the occupancy it describes, so a second occupant of the same spot never inherits them.

### 7. Copies now, links later

- Every reuse writes a copy plus an app-data link that the resolver never reads: split by
  marchers, paste, mirror, and a path continued in the next move.
- A route's lanes stay in one move (I-LN5).

### 8. Follow-the-leader may be Adjusted between checkpoints

- A follow-the-leader transition whose trail is a route (the trail step) may carry **trail lanes**
  that hold only an Adjust profile.
- The checkpoints are the trail's points, plus the member's start and end:
  - the profile is forced to zero at every checkpoint;
  - the member reaches each checkpoint on its unchanged count;
  - between checkpoints it walks the adjusted curve at a steady speed, which changes with that
    curve's length.
- This reuses the lane's `adjust` column. Spec Appendix J.4 lists what makes it harder
  than a group-path Adjust. The main one: on a follow-the-leader trail the slot is not the end
  spot. The owner decided the Adjust is keyed by the slot, which here is the marcher (Q3).

### 9. Files

- **v0.1.7 files** have no routes, so they get no lanes, nodes or `path_timing`. They open and
  convert exactly as today, at every step.
- **The file version is bumped whenever a step adds a stored fact that an older build would play
  or edit wrong** instead of refusing (07 N7). "Edit wrong" counts: a build that doesn't know
  lanes would compact, split or recast a laned show and leave lanes on the wrong spot, silently.
  Version 10 was meant to prevent exactly that. The steps that bump are ([implementation plan](../timeline/research/pathways/implementation-plan.md)):
  - lanes (the storage step);
  - Adjust (step 3), pins (step 5), handoff, linked Adjust;
  - range occupancy, the entry rule and `path_timing` (step 12);
  - follow-the-leader trail lanes.
- **A number a lab build wrote is never reused with another meaning.** The step-15 lab build
  wrote 10 (`ROUTE_MODEL_USER_VERSION`) for the breakout model, so the lanes step takes 11 and
  each later bump the next. Main ships the last lab number.
- **Pathways lab files are dropped.** Fork main's legacy repair already refuses route-prototype
  files unchanged (fork main's [ADR 0011](0011-collapse-fork-migrations.md), "Collapse fork migrations", Consequences).

## Consequences

- **The one-slot transitions and the I-R2 CHECK are retired.** The folded migration on main never
  adds `'route'` to `path_style` and never adds the CHECK, so `timeline_transitions` is not
  rebuilt there.
- **Until that fold, the leftover `'route'` path style and its CHECK stay in migrations 0024 and 0027
  on purpose.** They are harmless, because no row uses them after 0025. Folding the migrations is
  deferred ([#1107](https://github.com/AlexDumo/OpenMarch-timeline/issues/1107)).
- **New migrations, none of which rebuild a table:**
  - `timeline_lanes` and `timeline_route_adjusts`;
  - `routes.timing`;
  - `assignments.path_timing` (`ALTER TABLE ADD COLUMN`);
  - dropping the two UNIQUE indexes and adding overlap triggers with plain indexes.
- **The resolver dispatches per (transition, slot)** instead of per transition. It gains a
  per-route cache (W, distances, the group clock, anchor places), which also removes today's
  per-point `groupSchedule` rebuild.
- **Positions:**
  - Every lane with no timing, Adjust, handoff or `path_timing` evaluates bit-identically to step
    15 for founding spans.
  - Joins and resumes change on purpose when the entry rule ships: they ride the path instead of
    walking straight.
- **Every procedure that peels, renumbers, copies or deletes slots must carry lanes and
  `path_timing`, or refuse.** These are compaction, casting, split, split by marchers, paste,
  mirror, Basic's breakout, the holds cuts and merge. One helper replaces the scattered
  `pathStyle === 'route'` tests.
- **Product limits** (spec Appendix J.11 lists all of them):
  - a slot walks one route per move;
  - Adjust is per spot, so a personal tweak on a shared spot is refused;
  - an Adjust has no visible effect on first and last legs, so keys there are refused;
  - no live links;
  - a group split at the playhead is refused in the cases listed in AP-R7. Where it is
    accepted it keeps every Adjust key and ramp end: the cut point is a fixed corner of both
    halves, and any bend between it and the next point becomes a corner too.
- **PR #683's work:**
  - kept: the geometry, oracle and editor UI;
  - replaced: the breakout procedures and the per-transition `route` dispatch (implementation plan, step 24).

## Alternatives considered

| Model | What it is | Why rejected |
| --- | --- | --- |
| **A** (today) | N one-slot transitions share a route, each with `{offset}` | Breakout drops shape links and leaves vacancies. There is no place for Adjust, handoff, join mode, windows or sub-groups. Remove path can't restore the shape (04 §2.1: 7 facts inexpressible, 21 of 48 scenarios fail) |
| **B** | The shared transition carries the route; per-slot override routes | One group path per transition, so a second subset needs a breakout. An override is a whole route, so it can only Detach, never Adjust. Per-slot JSON has no row ids, and compaction must rewrite its keys. The I-R2 CHECK rebuild is needed (17 fail) |
| **B1** | B plus per-slot destinations inside a shaped transition (D-16 relaxed) | Adds nothing about paths, and costs D-16, I-T6 and E-T6. A cut-in joiner still needs its own transition because R-13 re-spaces line and arc slots (17 fail) |
| **B2** | The move owns the group path; members keyed by marcher | The resolver would read timelines (breaks R-1). Keyed by person, so a path can't follow the spot through swaps or re-entry on another lane (S-20, S-27). The owner chose "Adjust belongs to the spot" (4 fail) |
| **B3** | Today's breakout, carrying route, offset, Adjust and timing JSON through every breakout | Can't link a sub-group (F-11), loses shape links on `dest_shape_id` transitions (F-12), Remove path and Rejoin aren't exact, and transitions and ghost slots pile up. It audits every procedure that C has to audit anyway (2 fail; runner-up) |

## What this amends

- **ADR 0016:**
  - §1: "A transition opts in with a new path style, `route`, and a reference to its route"
    becomes "a slot opts in through a lane". The `route` style is retired.
  - §3: "One file version bump … Later steps don't bump it again" is replaced by §9 above.
  - §4 still stands, and is sharpened: refused edits name the lane's other occupant.
- **Spec v0.9 → v0.10** ([`docs/timeline/spec.md`](../timeline/spec.md), summarised in Appendix J):
  - §2 glossary: Route, Lane, Adjust, Detach, Occupancy, Handoff, Anchor, Group clock, Checkpoint.
  - §3 concept model.
  - §4: D-19 amended; new D-20 to D-27.
  - §5: the lanes and route-adjusts tables, `routes.timing` and `assignments.path_timing`.
  - §6:
    - I-R2 retired and replaced by I-R2′ (only a follow-the-leader trail carries a route);
    - I-R3 becomes I-R3′, I-R4 becomes I-LN4 (E-R4), and I-R5 becomes I-LN5 (E-R5);
    - I-A4 and I-A5 become I-A4′ and I-A5′, with the follow-the-leader exception;
    - new I-LN1 to I-LN3, I-J1 to I-J5, I-H1, I-P1 and I-A7 (I-J4, I-J5 and I-H1 carry the
      one-step minimum spacing). Lane invariants are I-LN*, because I-L1 and I-L2 are the
      layer invariants of §6.2.
  - §8:
    - R-1 (inputs) and R-14 (generalised as R-14′: lanes, the group clock, the lane clock, the
      handoff, Adjust, entry, and total rules);
    - R-10 gains trail-lane Adjust;
    - new diagnostics, P-14b (bounded speed) and Big steps on adjusted lanes;
    - §8.11's bound.
  - §9: seeds and caches.
  - Appendix J: storage, JSON and commit views; AP-R1 to AP-R10 rewritten where they conflict
    with Appendix I, and new AP-R11 to AP-R21 and AP-H1 to AP-H3; new tests; the review
    findings and how each is resolved; product limits.

## Verification

- **Migration:**
  - A v0.1.7 file opens and converts unchanged, with the new tables empty and `path_timing` NULL.
  - A new file has exactly `schema.ts`'s tables.
  - On main, no migration rebuilds `timeline_transitions` or `timeline_assignments`.
  - A pathways-lab file from before the lanes step is refused unchanged.
- **Resolver:**
  - QA-RT-1 to QA-RT-20 pass unchanged for founding spans.
  - New QA-RT-L goldens for Adjust, handoff, `whole` and the entry rule, coded independently in
    `ref/`.
  - P-14: no jump at a handoff, an entry, an exit or an Adjust boundary, and (P-14b) a bounded
    speed on every show that passes the write checks.
- **Storage:** QA-DB-L rows for every new invariant, including the overlap triggers and the
  follow-the-leader exception.
- **Edits:** QA-AP-L rows for every procedure, including each refusal with its reason.
  - Every edit is one undo step that restores ids exactly.
- **File version:** a build from before each bump refuses a file written after it.

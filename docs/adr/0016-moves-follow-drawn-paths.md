# 0016: A move can follow a drawn path

- Status: proposed
- Date: 2026-11-03
- Number: was 0014 until 2026-11-18, when fork main's own 0014 (desktop updates) came in
- Amends: [0012](0012-timeline-motion-model.md) §7, C-8 ("No new path style is added")
- Amended by: [0017](0017-lanes-on-slots.md) (§1: a slot walks a route through a lane; §3: file
  version bumps)

## Context

ADR 0012 dropped page-era pathways and midsets, which the app never implemented, and
added no new path style. A move's marchers walk straight (or along a minor arc) from
where they are to their end spot.

Drill writers need more than that. The pathways research
([`docs/timeline/research/pathways/`](../timeline/research/pathways/README.md)) lists the
cases:

- runs and flutters, drawn with more points than counts;
- follow the leader, both in block letters with a turning count at each corner and in
  smooth curves;
- one marcher's path bent around a collision, with midsets and quarter sets;
- double and half time, as maybe-scope.

Each needs a marcher to walk a path that isn't a straight line. That path must be stored
somewhere the resolver reads, because positions come only from the resolver (ADR 0012 §1).

The research produced a full model (draft model 5, three independent reviews). The owner
chose to build it in small steps instead, each one a lab build judged on its own. Only the
decisions that every step depends on are made here. Everything else is settled in the step
that builds it.

## Decision

### 1. A move can follow a drawn path

A transition may walk a **route**: a list of points in absolute field coordinates, from
where the marcher starts to its end spot. A route is resolver data, like a shape. It is
stored in its own table, logged in the change log, kept in history, and covered by undo
and redo. A transition opts in with a new path style, `route`, and a reference to its
route. Straight, arc and follow-the-leader transitions are unchanged.

This replaces C-8's "No new path style is added". The rest of C-8 stands: there are no
page-era pathways or midsets to convert, and conversion still keeps curved page shapes as
page-end coordinates.

Shape recipes stay app data (ADR 0006). The app may write a route from a recipe, but the
resolver never reads recipes.

### 2. Positions still come only from the resolver

The resolver evaluates a route like any other path style. The following read resolved
positions and need no code of their own to follow a path:

- playback;
- the 3D View;
- start-flag paths;
- collision checks;
- coordinate sheets;
- exports.

Nothing outside the resolver turns a route into positions.

Facing is unchanged. Marchers face front unless a Facing cue says otherwise (ADR 0004
D-7). A route stores no facing, and the direction of travel never sets it.

### 3. Storage grows one step at a time

The feature is built on the integration branch `pathways/host`, one step per PR.

- **Only what it needs.** Each step adds the storage and spec rules it needs, and no more.
  Step 1 adds a routes table with corner points only. Later steps add what they need: smooth
  points, arcs, pins, follow the leader on a trail, groups, steps per count and turns.
- **Lab files may break.** Files saved by a lab build of one step may not open in the next.
  Fork-internal data is disposable.
- **v0.1.7 files always open.** At every step, files from the v0.1.7 release open unchanged.
- **One migration on main.** Before `pathways/host` merges to main, its step migrations are
  folded into one migration.
- **One file version bump.** Step 1 bumps the file version, so older fork builds refuse
  files that may contain routes. Later steps don't bump it again.
- **Rules grow with the steps.** The timeline spec's v0.9 grows with the steps
  ([spec.md](../timeline/spec.md) Appendix I). The research docs are a reference for each
  step's rules, not rules themselves.

### 4. Edits the steps don't support are refused

Any existing edit that can't keep a route exact is refused with a reason. No edit may leave
a broken file. Each step's spec text lists which edits it supports.

## Consequences

- Adding `route` to the path style CHECK rebuilds `timeline_transitions`. The migration
  test must show that its triggers, its history triggers and its rowids survive. History
  inverses use `WHERE rowid =`.
- The resolver gains one per-transition seam for the walked path. Straight and arc moves
  go through the same seam, so later path kinds plug in without touching every consumer.
- Files with routes open only in builds from step 1 on. Release notes must name the
  minimum version, as for converted shows.
- Every app procedure that writes transitions must keep a route or refuse. This covers
  split, merge, split by marchers, holds and copies. Until a step adds support, it refuses.
- Some design work happens later than it would with a full up-front spec. Some later step
  may want to reshape earlier storage. That costs a migration on the branch, not a broken
  user file.

## Verification

- **Migration:** a migration test opens a v0.1.7 file and a current fork file unchanged.
  `timeline_transitions` keeps every trigger, history trigger and rowid after the rebuild.
  A route delete, and its undo, reach the history log.
- **Resolver:** the existing golden, property, invalidation, degenerate and fuzz suites pass
  unchanged. Each step adds goldens and properties for its rules (spec Appendix I) and
  extends the independent oracle in `docs/timeline/ref/` to match.
- **File version:** a build from before step 1 refuses a file saved by step 1, with the
  existing message.
- **Edits:** each step's tests show every existing edit on a move with a route either works
  or is refused with a reason.

## Amendment: follow a drawn trail (plan step 4, 2026-11-09)

Built on the owner's standing brief; the choices below are recorded for the owner to confirm, and
the rules are in spec Appendix K.

- **A follow-the-leader move may have a trail route in place of a destination shape** (I-T5′).
  The route is only the drawn part, from the leader's start to the end spot the line is entered
  at. The end spots stay the move's placed destinations, where every other tool edits them, so
  choosing Follow never moves anyone's end spot (R-13′). The draft model's trail, which owned its
  spots, was not taken: the app stores no shapes for end spots.
- **Storage:** migration 0022 rebuilds `timeline_transitions` to change that one CHECK, as 0019
  did; `path_params.reverse` says the other end leads (R-12′). File version 13 is written with a
  file's first Follow, by §3's rule.
- **Refused until their steps:** splits, merge and Remove keyframe's join on a follow move, and
  Straight or Arc on it (Remove trail first).

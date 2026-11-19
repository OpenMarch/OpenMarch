<!-- cspell:disable -->

# Pathways data-model grill — shared brief (2026-11-05)

Code + docs: /mnt/data/worktrees/t3/OpenMarch/t3-fc7b6ac6 (branch pathways/host-656, fork AlexDumo/OpenMarch-timeline, PR #683, unmerged).
Read-only. Do NOT edit the repo, commit, or push. Write your report to /mnt/data/pathways-grill/<your-file>.md.

## Goal

Before more pathways code is written, find where the data structure cracks. "We should not handwave any logic or decisions." Report what the model can and can't express, with evidence (file:line, spec rule ids).

## Key docs

- docs/timeline/spec.md (concept model §2–4, decisions D-\*, R-14, Appendix I, AP-R1..R10)
- docs/adr/0016-moves-follow-drawn-paths.md, docs/adr/0006\* (shape recipes)
- docs/timeline/research/pathways/ (draft-model.md, implementation-plan.md, README.md register)
- packages/core/src/timeline (resolver), apps/desktop/src/db-functions/timeline\*.ts

## Today's model (A), as understood

Shape (where, no time), Timeline (container, R-1), Transition (how/when for N anonymous slots), Slot, Assignment (marcher→slot over a count range, with layer), Route (absolute geometry, no time/marchers). Drawing a path calls giveOwnTransition (timelineRoutes.ts ~L479): marcher leaves its shared/shaped transition for a one-slot shapeless transition with copied end spot. A group path = N one-slot transitions sharing one route, each with path_params {"offset":[dx,dy]}. Own path (AP-R9) copies the route; Rejoin AP-R10; AP-R8 subset makes a new group route. Everyday edits already break marchers out into one-slot transitions (timelinePointMoves.ts, Basic, cuts, deletes); slot compaction exists (timelineMembership compact, timelineMoveCuts, timelineHoldFromPrevious tidyShared).

## Candidate models

- A: today (break out to one-slot transitions sharing a route).
- B: the move's shared transition carries the route; per-slot route overrides in a new table (transition, slot → route); offsets derived.
- B1: per-slot destinations inside a shaped transition (relaxes D-16 shape-OR-points).
- B2: the timeline/move owns the group path (breaks R-1 "timeline is only a container").
- B3: carry the path as an override when a marcher breaks out.
- Others you find.

## Owner's capability list (non-exhaustive)

1. Nothing: every marcher walks straight.
2. Manually define one marcher's path.
3. Path for a group that shares the same parent/shape.
4. Override one or many marchers in a group that shares a path.
5. Follow a shape/path at non-constant speed = checkpoints (pins) at uneven distances.
6. Exit a path before it completes; 6.1 enter a path after it starts.
7. Exit and re-enter before the end; re-enter on a slot that wasn't originally the marcher's.
8. Nested: inside a group with an overridden path, a parent override for a subset.
9. Path for only a subset of a group.
10. Marchers arriving at a shape may come from completely separate shapes/blocks — native, not tacked on.

## Owner answers (2026-11-05)

- Overrides come in TWO kinds, both required: **Adjust** (a tweak that stays owned by the group path; reshaping the group path still moves the adjusted marcher, change kept — like a Figma instance override / AE child under a parent) and **Detach** (independent copy). Hard question: what does an adjustment mean when the group path is reshaped a lot (points added/removed)?
- Spacing while walking a shared path: "depends on the drill". The designer chooses WHEN the destination shape takes over: start-block spacing → end-shape spacing handoff at a chosen point (count/position), from immediately to at the very end.
- A block that joins late: both "cut in where the group is" and "walk the whole path faster" must be possible.
- "A marcher shouldn't necessarily own their spot forever." Slot swaps mid-move (a line goes forward, another rotates, they swap back in at other spots) and future slot-assignment work. Does a path follow the slot or the person? May be a larger data-structure change — find out.
- Earlier decisions: group path holds shape (all members pass each point on the same count; only first/last legs vary speed); groups only slide (no turning with path); pins keep counts; route points absolute; dragging a dot never edits a path; paths are objects.

## Also test

Follow-the-leader/trails, staggers/ripples, paths across page flags, mirroring (side 1/2), copy/paste, recasting/swaps, re-fit after start/end edits, pins/holds/step sizes, turns (parked), Basic/Expert, undo as one step, v0.1.7 files must open, shape recipes interaction, caching/invalidation if a lane anchor depends on other marchers (centroid), route ownership (one owner?), split at playhead (AP-R7).
Design precedents: DAWs, Figma/Illustrator, After Effects, Blender — never drill software.

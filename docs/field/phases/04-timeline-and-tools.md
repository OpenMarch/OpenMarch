# Phase 4: Timeline interactions, tools and exports

Port the remaining field behavior and the outputs that draw the field.

## Tickets

- **#202 Timeline interactions.** The kept-mark hover tooltip, Escape leaving
  isolation (except during an alignment event, overlay or clip gesture), the
  first press after a paused preview only clearing it, and dimmed marchers
  that still can't be selected, including while a tool is active.
- **#203 Line tool.** The line tool (L) as today, with its previews in the
  overlay.
- **#204 Box shape tool.** Rebuilt on the editor and overlay from box v1's
  design (fork PR #181): its state machine and geometry. #181 stays held and
  isn't merged on Fabric.
- **#207 Video export and field previews.** Video frames rendered through
  the new field off screen, at today's quality or better. Field previews
  (such as the launch page's) use the new field.

## Exit gate

- Each ticket's scenarios pass on the new field.
- Video export and previews no longer need Fabric.

## Handoff notes

Append notes the next tickets need: file locations, seams, surprises.

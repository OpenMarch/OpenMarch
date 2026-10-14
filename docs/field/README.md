# Field Renderer Migration: Start Here

This folder coordinates replacing the Fabric.js field with a three.js (React
Three Fiber) field behind a renderer-independent editor. The decision is
[ADR 0005](../adr/0005-three-field-renderer.md), and the spec is fork issue
#189. Read both before you start.

## Field freeze

**Fabric field drawing and field interaction are frozen until #209 (the
switch) merges.** That covers:

- `apps/desktop/src/components/canvas/` (Canvas, listeners, hooks);
- `apps/desktop/src/global/classes/canvasObjects/`;
- the Fabric parts of `apps/desktop/src/timeline/` (`useTimelineKeptMarks.ts`,
  `useTimelineShapeCanvas.ts`) and `MarcherRotationInput.tsx`.

Rules while the freeze holds:

- Fix only real breakage there. Each fix adds a parity scenario that pins the
  fixed behavior, so the new field must match it.
- Don't add field features or change field behavior on Fabric. Build them on
  the new field instead.
- Box v1 (fork PR #181) is held, and rebuilt on the new field in #204.
- The timeline panel, inspector, data layer, 3D View, export content and
  shortcuts aren't frozen.

## Files

| File                                             | Purpose                                                                                    |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------ |
| [implementation-plan.md](implementation-plan.md) | Ticket index and blocking order, architecture rules, interaction rules table, parity gate. |
| [phases/](phases/)                               | One file per phase: scope, tickets, exit gate and handoff notes.                           |

## Where status lives

Tickets are GitHub issues on the fork (`-R AlexDumo/OpenMarch-timeline`),
#190 to #209. The issue's state and its PR are the only status. The
orchestrator keeps a status table in a comment on #189. The files here hold
scope and rules, not status, so they don't drift.

To see a ticket's blockers:

```sh
gh api repos/AlexDumo/OpenMarch-timeline/issues/<n>/dependencies/blocked_by --jq '.[].number'
```

## Picking up a ticket

1. Check every blocker is closed (merged).
2. Read the ticket, #189 (body and comments), ADR 0005 and
   [implementation-plan.md](implementation-plan.md).
3. Work in your own worktree off fork `main`, with a branch named
   `field/<n>-<short-name>`.
4. Open a PR into fork `main` with `Closes #<n>`. Add any notes the next
   ticket needs to its phase file's handoff notes.

## Performance numbers

Headless WebGL on the agent machine is software GL. Treat any fps measured
there as a lower bound, and only benchmark production builds. Real-hardware
numbers come from the in-app benchmark in #208.

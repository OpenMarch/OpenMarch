# Field Renderer Migration: Start Here

This folder coordinates replacing the Fabric.js field with a three.js (React
Three Fiber) field behind a renderer-independent editor. The decision is
[ADR 0005](../adr/0005-three-field-renderer.md), and the spec is fork issue
#189. Read both before you start.

## Fabric is gone

#209 made the three.js field the only field and deleted Fabric: its
dependency, its code, its unit tests, the Fabric driver of the field test
API and the dev switch (`openmarch:dev:field`, `?field=three`, the `FIELD`
variable in the e2e setup). There's no rollback setting. Field work in
progress on Fabric ports by [porting-fabric-features.md](porting-fabric-features.md)
before it can land. To compare with Fabric, use the pinned pre-switch build
(fork branch `field-renderer-pre-209`; links in
[parity-checklist.md](parity-checklist.md)).

## Files

| File                                                     | Purpose                                                                                    |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| [implementation-plan.md](implementation-plan.md)         | Ticket index and blocking order, architecture rules, interaction rules table, parity gate. |
| [phases/](phases/)                                       | One file per phase: scope, tickets, exit gate and handoff notes.                           |
| [porting-fabric-features.md](porting-fabric-features.md) | Porting a Fabric feature to the new field, and the inventory of in-flight Fabric work.     |

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

All conversion work lands on the fork's `field-renderer` branch, not `main`.
`field-renderer` reaches `main` through one PR when the migration is done.

1. Check every blocker is closed (merged into `field-renderer`).
2. Read the ticket, #189 (body and comments), ADR 0005 and
   [implementation-plan.md](implementation-plan.md).
3. Work in your own worktree off fork `field-renderer`, with a branch named
   `field/<n>-<short-name>`.
4. Open a PR into fork `field-renderer` with `Closes #<n>`. GitHub only
   auto-closes issues on merges into `main`, so the ticket is closed by hand
   after the merge. Add any notes the next
   ticket needs to its phase file's handoff notes.

## Performance numbers

Headless WebGL on the agent machine is software GL. Treat any fps measured
there as a lower bound, and only benchmark production builds. Real-hardware
numbers come from the in-app benchmark in #208.

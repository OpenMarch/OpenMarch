# Phase 5: Parity gate and switch

## Tickets

- **#208 Parity gate run.** The full gate from
  [the plan](../implementation-plan.md#parity-gate): the scenario suite on
  both drivers, render comparisons across the corpus, export diffs, the
  in-app benchmark on a real low-end Chromebook and an integrated-GPU laptop,
  and the owner's hands-on checklist in a lab build. Needs the owner.
- **#209 Switch to the new field and delete Fabric.** The new field becomes
  the only field. Deletes Fabric, its speed workarounds and unit tests, the
  Fabric driver of the field test API and the dev switch. There's no rollback
  setting. Merging needs the owner's explicit OK.

## Exit gate

#209 merged. The field freeze ends: remove the freeze notes from
`apps/desktop/AGENTS.md`, `apps/desktop/src/components/canvas/README.md`
and [the README](../README.md).

## Handoff notes

Append notes the next tickets need: file locations, seams, surprises.

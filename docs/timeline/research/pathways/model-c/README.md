<!-- cspell:disable -->

# Pathways data model: the "lanes on slots" grill (2026-11-05)

These are the reports behind [ADR 0017](../../../../adr/0017-lanes-on-slots.md) and spec v0.10
([spec.md](../../../spec.md), Appendix J). They are copied as written, so they cite the drafts by their
working names and some paths outside the repo.

| File                                                 | What it is                                                                    |
| ---------------------------------------------------- | ----------------------------------------------------------------------------- |
| [BRIEF.md](BRIEF.md)                                 | The brief every report started from: the owner's ten capabilities and answers |
| [01-current-model.md](01-current-model.md)           | Today's model (step 15, PR #683) and where it cracks                          |
| [02-scenarios.md](02-scenarios.md)                   | 48 scenarios run against each candidate model                                 |
| [03-precedents.md](03-precedents.md)                 | Precedents from DAWs, Figma, After Effects and Blender                        |
| [04-evaluation.md](04-evaluation.md)                 | Models A, B, B1, B2, B3 and C scored against the capabilities and scenarios   |
| [05-model-c-for-review.md](05-model-c-for-review.md) | Model C written up for review                                                 |
| [06-adversarial-review.md](06-adversarial-review.md) | Independent adversarial review (MAJOR and minor findings)                     |
| [07-recheck.md](07-recheck.md)                       | Re-check of the revised drafts (findings N1 to N10)                           |
| [open-questions.md](open-questions.md)               | The owner's answers to Q1 to Q4 and what each writes                          |

**Names that changed when the drafts were applied:**

- The lane invariants I-L1 to I-L5 in these reports are I-LN1 to I-LN5 in the spec (I-L2′ is
  I-LN2), because I-L1 and I-L2 were already the layer invariants. `E-L1` and `E-L2` are `E-LN1`
  and `E-LN2`.
- "spec-changes" is now spec Appendix J and the main-body rules it replaced; "build-steps" is now
  the [implementation plan](../implementation-plan.md) (steps 24 to 27 and amended steps 3, 5, 12
  and 17). Draft 1's M0 to M9 map to plan steps as the plan says.
- The ADR renumbering the drafts predicted (0013 and 0014) is out of date: fork main also has
  0012 and 0013, so the pathways ADRs became 0014 and 0015 when fork main was merged in (B0).
  Fork main then took 0014 and 0015 itself (desktop updates, cue model), so on 2026-11-18 they
  became 0016 and 0017 (#1097).

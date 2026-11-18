<!-- cspell:disable -->

# 07: Re-check of revised model C against review 06

2026-11-05. Inputs: `draft/adr-0015-lanes-on-slots.md`, `draft/spec-changes.md` (SC), `draft/build-steps.md` (BS),
`draft/open-questions.md`, and my `06-adversarial-review.md`. Read-only. `ε_geom = 1e-9`
(`core/geom.ts:24`).

**Verdict.**

- **No new BLOCKER.**
- **Of the 11 MAJORs:** 8 are RESOLVED and 3 are PARTLY resolved.
- **New issues:** two MAJORs (N1, N2) and eight MINORs. N1 is that the group cut is still not
  exact when Adjust keys or ramp ends fall near the cut. N2 is that "no jumps" holds only at the
  ε_geom scale.

## 1. The 11 MAJORs

| #                                           | Status                   | Rules                                                                                                                                      | Notes                                                                                                                                                                                                                                                                                                                                                                            |
| ------------------------------------------- | ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1 Personal edits leak to other occupants    | **RESOLVED**             | D-22, `SHARED(T,k,m)`; AP-R1/R2b/R8/R9/R11/R12 refusals; QA-AP-L2                                                                          | The refusal keeps R-other. The fragile S-27 #3 workaround is dropped and listed as a limit (SC §10 #1). Small leak left: AP-R16's Q2 offset rewrite (N9).                                                                                                                                                                                                                        |
| 2 Lane timing stored per slot               | **RESOLVED**             | D-25, `assignments.path_timing` (SC §4.2), R-14′ items 3 and 8, T-7, QA-RT-L6                                                              | `ws = r.start_beat` is stored, not taken from the span. `we = min(ws+counts, T.end) > ws` by I-A1/I-A6, so the window can't invert. A `whole` resume aims at its own windowed reference; A_ref is its first span's origin, or `F+o_s` when a takeover hid the row start. I traced the S-18 takeover cases `[8,10)` and `[9,10)`: both now aim at Y's schedule. Carry burden: N8. |
| 3 Handoff jump, `0/0`, not commit-checkable | **PARTLY**               | R-14′ item 5, T-5, I-H1, P-14, QA-RT-L4                                                                                                    | The jump at `D_m` and the `0/0` are gone. The weight is defined by cases. I-H1 is now app write path and the old I-J4 is retired. A ramp may still be only ≥ ε_geom = 10⁻⁹ long, so a full `o_e − o_s` can happen over 10⁻⁹ of travel (N2). The widening direction is asymmetric (N4).                                                                                           |
| 4 Tied Adjust keys jump                     | **PARTLY**               | I-J4, T-3, T-4, AP-H1, QA-RT-L5                                                                                                            | Continuous in the math sense, and the author is right that my "later key from x on" would still jump. Keys ≥ ε_geom apart remain legal, and AP-H1 or point drags can squeeze anchored keys to near ε (N2). The tie clustering rule is unspecified (N5).                                                                                                                          |
| 5 Split at playhead                         | **PARTLY**               | AP-R7 group cut, refusals (a)–(h), QA-AP-L4                                                                                                | Today's two refusals are back. Joins, entries, `whole`, legs, handoff-with-δ and FTL are refused. The written procedure is not exact for the cases it accepts (N1).                                                                                                                                                                                                              |
| 6 Frozen `o_e`                              | **RESOLVED**             | D-24, `o_e = B − G` (item 5), QA-RT-L3                                                                                                     | It reads only the spot's own destination and the stored G, so no centroid and R-other holds. S-22 #1/#2/#3 pass. The end-offset columns are dropped. No new problem found (§3).                                                                                                                                                                                                  |
| 7 Compaction and zombie lanes               | **RESOLVED**             | AP-R15 (free slot = no row at any beat; lane moved or deleted before `slot_count`), AP-H3, I-R3′ commit view, D-VACANT per range, QA-AP-L5 | The statement order keeps I-L1 and I-A4′ after each statement. Unreachable routes are now a commit error. Keeping the lane on a vacant shaped spot is a stated owner choice (Q1).                                                                                                                                                                                                |
| 8 Recast on shaped end sets                 | **RESOLVED** (as a rule) | AP-R16, Q2 (`o_s = A_new − F`), QA-AP-L6                                                                                                   | First legs no longer cross. The Adjust stays with the spot by decision.                                                                                                                                                                                                                                                                                                          |
| 9 File version and stale baseline           | **RESOLVED**, one gap    | ADR §9, BS B0/M\*, QA-FV-L1, QA-MIG-L1                                                                                                     | Rebased on `0017_timeline_model` with the next migration 0019, and lab files are dropped. The bump criterion says "play wrong" but should be "play **or edit** wrong" (N7). B0 says "10 is fine on main", which contradicts ADR §9's "a number a lab build wrote is never reused with another meaning"; harmless only because `legacyForkRepair` refuses those files.            |
| 10 No total rules; JSON rewrites            | **RESOLVED**             | T-1…T-13, I-J3/I-P1 commit views (SC §5.2, SQL given), AP-H1 called by every geometry writer, `counts` relative to the row                 | Only pin offsets are still rewritten, on start-edge drags (AP-R4), and that is now checked at commit. Gap: N6.                                                                                                                                                                                                                                                                   |
| 11 Bit-identity scope                       | **RESOLVED**             | R-14′ item 9, QA-RT-L1                                                                                                                     | Scoped to founding spans with no new facts. The u-form path is mandated, so `X = p·L` vs `p/u_first` rounding doesn't matter.                                                                                                                                                                                                                                                    |

## 2. New issues from the revisions

### N1 MAJOR: the accepted group cut is not exact when a key or ramp end lies next to the cut

- **What the cut writes** (SC AP-R7 items 1 and 4):
  - `R1.to = C`, with R1 keeping only points with `D_k < x_b`;
  - R keeps only points with `D_k > x_b`, with `from = C`.
- **Where the legs go.** The stretch `(D_last<b, x_b]` becomes T1's **last leg** (straight, from
  `P(D_m1)` to the member's position at b). Likewise `[x_b, D_first>b)` becomes T2's **first leg**.
- **Original motion there.** It was `walk + o(x) + δ(x)`, with δ linear between keys and o linear
  between ramp ends.
- **The failure.** An Adjust key, or a ramp end, strictly inside that stretch kinks the original.
  The leg is straight.
  - The error is up to the key's `d` (1.5 steps in S-08), well past QA-AP-R3's tolerance.
  - Refusal (g) only catches `δ(x_b) ≠ 0` with a ramp begun. It doesn't catch a key at `x_k` with
    `D_m1 < x_k < x_b` and `δ(x_b) = 0`, nor a ramp end inside the stretch.
  - The exactness note ("pieces touching C are lines with corner ends") misses both cases.
- **Fix.** Add refusal (i): "no Adjust key and no ramp end in the open stretches between the cut
  and its neighbouring kept points". Or keep C as a kept corner of both halves, which needs `to`
  ≠ C, so that the stretches stay in the rigid part.

### N2 MAJOR: P-14 "no jumps" is only ε_geom-continuity

- **Current limits.** I-J4 and I-H1 allow keys and ramps 10⁻⁹ apart, and T-4/T-5 widen only below
  ε_geom.
- **How a jump still happens.**
  - Keys are anchored as fractions between points. Dragging two points close (S-10-style reshapes,
    or AP-H1 re-homing onto a short stretch) compresses a 1.5-step bulge or an `o_e − o_s` ramp
    into a few thousandths of a step.
  - That is a teleport within one frame.
  - It is legal, gets no diagnostic, and still satisfies P-14.
- **Fix.** Give a choreographic minimum (for example: key spacing, ramp length ≥ `|Δd|` /
  max-steps-per-count) or have the resolver widen to it. Extend "Big steps" to each lane's on-path
  speed including `o′(x)` and `δ′(x)`. Add a QA-P-14 variant that asserts bounded speed, not just
  continuity.

### MINOR

| #   | Issue                                                                                                                                                                                                                                                                                                                                                                                                            | Fix                                                                                |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| N3  | AP-R1 lists "m has more than one row in M" among its refusals. AP-R8 lists the same, and AP-R8 covers "draw again". It's unclear whether this also gates **editing a route's points**. If it does, S-20 #1 and S-27 #1 (reshape after a swap) are refused. "Again" is refused after any swap.                                                                                                                    | State that point edits are exempt; decide on "again".                              |
| N4  | **T-5 widening.** An interior h widens forward, `[D_j, D_{j+1}]`, but `h = D_m` widens backward, `[D_{m−1}, D_m]`. `h = D_m` could instead read as "at the end" (w ≡ 0, with the strict `>`): the last leg reads only `P(D_m)`, so there's no jump and no surprise morph. AP-H1 persists widened anchors permanently with no badge, since the "rehomed" flag is only on profiles.                                | Make the rule symmetric, or map `h = D_m` to "at the end". Badge widened handoffs. |
| N5  | **T-4 clustering.** "Keys less than ε apart" doesn't say pairwise or transitive. For a chain 0.6ε, 0.6ε apart, the two readings give different results, so the oracle and the resolver may diverge.                                                                                                                                                                                                              | Single-linkage scan in sorted order; keep the last stored key.                     |
| N6  | **T-8 gap.** It doesn't cover a lane on a follow-the-leader transition with a non-NULL offset or `group_adjust_id`. Dispatch has no branch for it.                                                                                                                                                                                                                                                               | Add it to T-8 (ignored, `D-LANE-IGNORED`).                                         |
| N7  | **Bump criterion.** M1 doesn't bump the version but puts lanes on multi-slot and shaped transitions. An M0 build opens M1 files, and its compaction, split and recast don't carry lanes, so lanes end up on the wrong spot silently.                                                                                                                                                                             | Bump when an older build would play **or edit** wrong; that covers M1.             |
| N8  | **`path_timing` carry.** Every row writer must copy it (AP-H2), but the insert helpers use explicit field lists that drop it today. That includes `reinsertWithSlots` (`db/timelineAssignmentEdits.ts:84–97`), `writeFirstHalfTransition` (`db/timelineSplitAtBeat.ts:588–597`), `createOwnTransitionsInTransaction` and the layer module. The spec's assignment change-log trigger names fields explicitly too. | List these and add a QA "column carried" row.                                      |
| N9  | **Q2 leak.** The AP-R16 rewrite of the founding occupant's offset also moves the spot's later K3 occupants, who ride that lane. A recast of one person moves another.                                                                                                                                                                                                                                            | Refuse when `SHARED`, or list it as a spot-level exception to D-22.                |
| N10 | **Split refusal reach.** Refusals (a)–(h) reach the holds cuts that go through split (`timelineMoveCuts`) and `keepThroughMovesAcross`. 01 crack 6 already makes that path abort the whole edit on a refusal, and the new refusals make it far more likely to fire.                                                                                                                                              | Make `splitRefusal` aware of laned spots so callers can skip them.                 |

## 3. Specific items you asked about

- **`o_e` from the spot's own end spot.** I found no new issue.
  - Invalidation is already W-3 per T on a destination change.
  - The straddling-cut freeze `o_s := o(x_b)` is consistent with a live `o_e` on the second half.
  - Re-fit is a translation, so it leaves handed-off lanes in place.
  - The bound is covered by §8.11's 7·√2·10⁶.
- **Window and late-join settings on the assignment row.** These are correct and fix MAJOR-2. The
  cost is carrying the column (N8).
- **Handoff widening.** It is continuous, and an instant handoff is never left inside `[D_1, D_m]`.
  Residual issues: the asymmetry and persistence (N4), and steep ramps (N2).
- **Dropping the earlier of overlapping keys.** It is continuous, and better than my proposal.
  Residual issues: clustering (N5) and steep slopes (N2).
- **The 13 fallback rules.** Each is total and finite. T-1 (missing id → `'from'`/`'to'`) can move
  a key far, but I-J3 makes that a commit error. The only gap is N6.
- **The 8 split refusals.** They are sound and close MAJOR-5's open cases. The accepted path still
  needs (i) (N1). The refusals widen the existing abort path (N10).

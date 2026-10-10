<!-- cspell:disable -->

# 07a: Validator 1, the shared timeline-mode core ("no automatic stays")

Adversarial validator, 2026-10-08. It prototyped three changes in a scratch copy of a4d42cd1 and ran
the existing focused tests and scratch tests on both base and sparse. The patch is kept at
`/tmp/dc-v1/sparse.patch` (outside the repo).

The three changes:

1. Ripple step 7 (`addHoldingMoves`) is off.
2. New marchers get a home and no stays.
3. The converter skips a slot whose point equals the marcher's previous derived position (its row,
   its glide point, or home).

**Verdict: the core holds.**

- Motion at write time is identical or better, the conversion corpus is bit-identical, and undo and
  redo are clean.
- It fixes S1 on every insert path. It also fixes the new-marcher snap-back and the snap-back after
  a window that ends partway into a page.
- **Two regressions must ship together with it:**
  - Set to next page is refused on an inherited page.
  - A ripple or yank delete on a converted show no longer keeps later copied pages.

## 1. Existing focused tests (RAN, normal and `VITEST_TIMELINE_MODE=true`)

- **Base: 291 of 291 pass.**
- **Sparse: 10 fail, in 4 files.** Every failure asserts the shape of stored rows; none asserts a
  position that changes. All are expected by design:

  | File                          | Tests | Note                                                                       |
  | ----------------------------- | ----- | -------------------------------------------------------------------------- |
  | timelineRipple                | 4     | The split test's page-end positions would still pass; it fails on `ranges` |
  | timelineMarchers              | 3     |                                                                            |
  | timelineMembershipAdversarial | 2     |                                                                            |
  | planPageConversion            | 1     | A slot equal to home is dropped                                            |

- **15 more files that use the changed writers:**
  - p910Adversarial: 3 failures, all row shape. Expected.
  - timelineHistoryFocus: 2 failures.
    - One is expected.
    - The other is a **minor real UX change**: undoing "add marcher" now goes to page 0 (home)
      instead of staying on the current page. Fix: when an edit only sets the homes of marchers it
      created, keep the current page.
- **History mode** (`VITEST_ENABLE_HISTORY=true`): nothing new.
- **Total churn:** about 6 files and 15 tests.

## 2. Owner scenario S1 (RAN)

Page 1 move to (50,50), add pages 2–4, then drag page 2 to X = (123,456).

| How pages were added                   | Base p2 / p3 / p4                          | Sparse p2 / p3 / p4              |
| -------------------------------------- | ------------------------------------------ | -------------------------------- |
| **+** flag                             | X / X / X                                  | X / X / X                        |
| `createLastPage` ×3                    | X / **50 / 50**                            | X / X / X                        |
| Split ×2                               | X / **50 / 50**                            | X / X / X                        |
| Page-mode copies, converted, then edit | X / **old / old** (4 transitions, 304 asg) | X / X / X (1 transition, 76 asg) |

## 3. Page-scoped writers on an inherited page

- **Set to next page on inherited page 3** (page 4 defined): base works. Sparse is **refused**:
  `E-ARGS: … has no move that ends at the end of page 3`.
  - It must move onto the range writer in the same change. `moveMarchersOnPage` is its only
    production caller.
- **Inspector coordinates, drags, nudges, align and distribute** go through `planCanvasEdit` and
  work on inherited pages.
- **A hole in the fix (RAN, both models):** `alignVertically`/`alignHorizontally` return every
  selected marcher, and distribute returns its unchanged endpoints
  (`src/utilities/CoordinateActions.ts:193-317`). All of them get written.
  - Result: an align on an inherited page **plants accidental stays**, and the owner's bug comes
    back.
  - **Writing nothing for marchers whose drop equals their resolved position (with a tolerance) is
    mandatory.**
- **Transition editor (REASONED):** `editableTransitionId` (`timelineTransitionEditor.ts:91`)
  returns null on a hold span. So on an inherited page there is no move to style (path style, shape
  destination, FTL) until you drag. Suggest an "Add move here" button.
- **Page boxes:** "range not stored yet" selection works.

## 4. Layers and steals (RAN)

| Case                                      | Base                                                                             | Sparse                                                                                  |
| ----------------------------------------- | -------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| Window [9,25) over inherited pages 2–3    | `passThrough` overrides both stays; assignment at L1; "Only change Page 3" toast | `passThrough` null; L0; page 2's flag silently shows mid-glide (86.5,253); **no toast** |
| Window [9,21), ending partway into a page | The stay is caught up; p3 snaps back to (50,50)                                  | Holds at X                                                                              |
| Window [9,25) over a defined p3           | –                                                                                | Steals only the real move. Correct, with fewer layers.                                  |

- **Default:** show the pass-through toast whenever the window contains a flag, not only when it
  overrides rows.
- **FTL / R-12 (REASONED):** an inherit FTL after a partly changed page falls back to slot order
  (`D-ORDER-FALLBACK`). Converted slots are in marcher-id order, so the trail order is unchanged.
  Only a new diagnostic appears.

## 5. Page delete (RAN)

| Delete                                                          | Base p3 / p4             | Sparse p3 / p4                   |
| --------------------------------------------------------------- | ------------------------ | -------------------------------- |
| Ripple `deletePages` (made in timeline mode)                    | 50 / 50 (already stale)  | **50 / 50** (was X)              |
| Yank                                                            | 50 / 50                  | **50** (was X)                   |
| Flag delete                                                     | 50 / 50                  | X / X (kept)                     |
| **Converted show:** p2 = X, p3/p4 copies of X; ripple delete p2 | X / X (page-mode parity) | **page 1's (134.6,320): breaks** |

- `isPageMove` matches a UI-10 drag over exactly a page.
- **Real files:** equal-to-previous slots are 38–61% of all slots (see §6), so this hits every
  converted show with copied pages.
- It is safe only if UI delete is re-routed to flag delete, or if a push-forward that keeps the look
  ships in the same change.

## 6. Converter equality (RAN)

- **Corpus:** 8 files (Part1_Demo, DaftPunk2, page-marchers-and-pages, main-made, main-shapes,
  perf-small, corps-synced, perf-heavy). All pass on both, and the equality JSON is identical.
- **Equal-to-previous slots:**
  - Part1_Demo: 61% (1266 of 2090).
  - DaftPunk2: 38% (2473 of 6545).
- **Generated show** with gap glides, pathways, midsets and missing rows: 125 → 109 assignments.
  The equality and loss reports are byte-identical.
- **Implementation note:** compute the skip after deciding `skipped`. Otherwise every unchanged page
  is reported as a "no-marchers" loss.

## 7. Undo/redo (RAN)

Full table-snapshot round trips passed with no commit violations for:

- `createLastPage`
- split
- `createMarchers`
- ripple, yank and flag delete

## Claims in 05 checked

**False:**

1. **"`addHoldingMoves` doesn't change motion when it writes" (§0.2).**
   - Setup: a layer-0 track [1,41) plus a stolen layer-1 move [9,17); then `createLastPage`.
   - Base writes a layer-1 hold over [17,25) (`busy` checks the same layer only), so the marcher
     **freezes** off the track. Sparse leaves motion unchanged.
   - This favours M2, but it means stored stays in existing files aren't always neutral. That
     matters for a prune.
2. **"In a split, the first half holds" (§2).** Reversed: the move shrinks to [s,b) and arrives
   early; the second half holds.
   - Side finding (both models): splitting a page truncates a track that ends at that page's flag.
     With a steal, the track's destination is lost.

**Holds:**

- no resolver change;
- the converter is bit-identical;
- new marchers no longer snap home;
- fewer layers;
- `moveMarchersOnPage` is the only production caller;
- `isPageMove` matches drags;
- flag delete keeps the look;
- undo works.

## Ranked risks

1. A ripple or yank delete on a converted show loses copied pages. Ship it with flag delete as the
   default, or with push-forward.
2. Accidental stays from align and distribute. "No write for unmoved marchers" is mandatory.
3. Set to next page is refused on inherited pages.
4. The pass-through toast disappears, so a flag's look changes silently.
5. The inspector can't style the move on an inherited page.
6. Undoing "add marcher" jumps to home.
7. A new `D-ORDER-FALLBACK` diagnostic.
8. Pre-existing: a split truncates tracks that end at its flag.

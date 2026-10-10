<!-- cspell:disable -->

# 07b: Validator 2, the page-mode options

Adversarial validator, 2026-10-08. It worked on a scratch copy at a4d42cd1 and prototyped **M1-lite**
(equality tracking, M3's page-mode bridge) in `updateMarcherPagesInTransaction`.

- **Prototype rules:** per marcher, it walks later rows while they equal the old value. It stops at
  a row in a shape, or at a row with its own pathway. Rows it follows get `path_data_id = NULL`, and
  the start of the next real pathway is moved.
- **Tests:** about 20 scratch tests, all run.
- **Not run:** M1 (the stored column), so its results here are reasoned from 04. Also not run: full
  suites, `test:history`, e2e.

## Scenarios

| #   | Scenario                                                                                 | Observed                                                                                                                                           | Verdict                                                  |
| --- | ---------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| 1a  | Owner's scenario (RAN)                                                                   | Tracking off: pages 3 and 4 keep page 1's spot. M1-lite: pages 3 and 4 follow page 2.                                                              | Holds for M1 and M1-lite; M2 leaves the bug              |
| 1a′ | A file the current app already damaged (RAN)                                             | A later edit of page 2 doesn't repair page 3, because page 3 no longer equals page 2's old value. M1 is the same (normalize marks page 3 defined). | **Existing shows need a manual fix** (Shift+P)           |
| 1b  | Back to opening set on page 4, after real moves on pages 2–3, then edit page 1 (RAN)     | Page 4 does **not** follow; the run ends at page 2.                                                                                                | Holds                                                    |
| 1c  | A marcher standing still for 41 pages, then edit page 1 (RAN)                            | All 41 pages move.                                                                                                                                 | Right by the rule, but invisible without a toast         |
| 1d  | **Merge leak** (RAN): p2=200, p4=400; edit p2 to 400 (arrive early); then edit p2 to 250 | M1-lite: p3, p4 and p5 all become 250, so **page 4's deliberate 400 is lost**. M1: page 4 stays defined.                                           | **Breaks M1-lite.** Mitigation: toast plus one-step undo |

## Precision (RAN)

- **Copies are bit-exact, and snapping rounds to 3 decimals** (`CoordinateActions.ts:52`). That is
  what makes 1d real.
- **A write that moves nothing is not bit-exact.**
  - The drag-end writer (`DefaultListeners.ts:139-159`) writes every selected marcher from
    `calcTransformMatrix() − 0.5`.
  - The click filter only applies within 300 ms (`OpenMarchCanvas.ts:98-100`).
  - In fabric, **29%** of marchers in an `ActiveSelection` came back not bit-equal without moving.
- **Effect:** an epsilon write on page 2 breaks the run from page 1, so the owner's bug quietly
  returns. This affects M1 ("≠ predecessor exactly") and M3's bridge too.
- **Fix:** compare with a tolerance of about 1e-6 px, and skip writes that don't move anything.
  The converter's "equal means no slot" rule should use the same tolerance.

## Pathways (RAN): the side bug is confirmed and worse

- A copied row shares the **same** `path_data_id`, so playback on the copied page teleports to
  page 1's spot and replays the curve.
- Editing page 2 rewrites both ends of the shared pathway, because the next page shares it
  (`marcherPage.ts:189-198`). Page 2's own curve is destroyed.
- `pathways` is **not in `tablesWithHistory`** (`historyTriggers.ts:15-36`), so undo can't restore
  it.
- **Fix for every option:**
  - Stop copying `path_data_id` in `_createMarcherPages` (a copy is a hold).
  - Clear it on rows that a propagation follows.
  - Add `pathways` to history.

## Shapes (RAN)

- A shape on page 3 stops the run.
- Shape edits go through the same writer, so under M1-lite they carry forward to later copies that
  aren't in a shape.
- 06 §3 says "shape writes don't track", which is a disagreement for the owner to settle.
- Locked rows are shape rows, so propagation never moves them.

## Undo, redo and cost (RAN)

200 marchers × 100 pages, all 200 edited on page 2, with 97 pages followed:

| Measure                        | Tracking off | M1-lite                    |
| ------------------------------ | ------------ | -------------------------- |
| `history_undo` rows            | 200          | **19,600** (~11 MB)        |
| Edit                           | 168 ms       | 2,242 ms (naive prototype) |
| Undo, including the focus pass | 68 ms        | **5,592 ms**               |
| Redo                           | 17 ms        | 1,177 ms                   |

- These are test-environment numbers; over IPC they are probably worse.
- **Undo focus (correcting 04):**
  - `rowIdFromSql` (`history.ts:934-936`) runs `parseInt("WHERE rowid=305")`, which gives NaN, so
    page-mode undo focus is **always undefined** today.
  - It still runs one `findFirst` per statement, which accounts for about 4.4 s of the 5.6 s.
  - The `Math.max(page id)` bug is latent until the parse is fixed.
  - Fix: parse the id correctly, and focus on the page with the lowest start beat.

## Query cache (READ)

- `updateMarcherPagesMutationOptions.onSuccess` invalidates only the pages it was given
  (`useMarcherPages.ts:149-153, 363-366`), and `DEFAULT_STALE_TIME = Infinity`.
- So pages the edit followed **stay stale in the renderer**.
- Fix: the write returns the followed page ids, or the mutation invalidates every `marcher_pages`
  key.

## Other writers

- **All coordinate edits** go through the single writer, except `usePathways.ts:157`.
- **Older releases:** M1-lite keeps no state, so an older app's edits just don't follow. Nothing
  drifts.
- **Shift+P under M1-lite:** "reset and follow" comes for free.
- **Wizard:** follows, which is what it wants.
- **Swap:** correct.
- **New marcher mid-show:** tracked in this fixture, but `calculateStartingData` is computed per
  page, so that isn't guaranteed.
- **Inserting and deleting pages:**
  - Deleting a copy keeps the run.
  - Deleting a defined page leaves later copies at their value, which is effectively "promote".
  - Inserting a page joins the run.

## Mental model

- M1-lite and M1 are the least surprising for the owner's scenario and for "back to opening set".
- **"Leave page mode alone" is not acceptable as the only answer.**
  - Page mode is what every user runs; timeline mode is behind a dev flag.
  - The owner's report is a page-mode report.
- An explicit "Copy to following pages" uses the same algorithm, but only helps users who know to
  use it.

## Recommendation

**M1-lite as the page-mode default**, hardened:

- (a) A tolerance of about 1e-6, and skip writes that don't move anything.
- (b) A toast: "Also moved on pages 3–7 · Only page 2".
- (c) Invalidate the followed pages.
- (d) Clear `path_data_id` on copies and followed rows, and add `pathways` to history.
- (e) Fix `rowIdFromSql` and focus on the lowest edited page.
- (f) Batch the propagation writes.

**Why not the alternatives:**

- M1's only gains are pins and immunity to the merge leak. It costs a migration, a history-trigger
  rebuild and normalize-on-open, all on a table that is frozen in Phase 9.
- **Fallback, if page-mode default behaviour must not change:** M2 plus an explicit "Copy to
  following pages". Do (c) and (d) either way.

## Claims found false or incomplete

- **04 §3, S7 and 06 §8** say undo focus jumps to `Math.max(page id)`. Today it is always
  undefined, because of the NaN parse.
- **01 and 04** call the copied `path_data_id` "stale". It is **shared**: edits corrupt the source
  page's curve, and undo can't restore it.
- **04 §2 and 06 §1** say "compared exactly". That isn't robust against fabric's drift on a
  selection.
- **06 §3** says undo needs "no history trigger changes". True, but history grows about 98× and
  undo is about 82× slower at 200 × 100.
- **04 §4** says M1-lite "matches M1 on S2". The merge leak was reproduced, so it doesn't.

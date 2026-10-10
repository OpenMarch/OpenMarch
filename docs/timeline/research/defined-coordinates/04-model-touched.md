<!-- cspell:disable -->

# 04: Model M1, a "touched" flag that carries edits forward

Model-design agent, 2026-10-08. The work was read-only, from code and docs; no tests were run.
Paths are relative to `apps/desktop/` unless they start with `docs/` or `packages/`.

## 0. Verdict

- **Page mode: M1 works.** It is the cheapest fix that changes no readers.
  - Storage stays dense, so playback, exports, 3D, mobile and the converter don't change. Only
    the writers do.
  - About 9–12 days.
  - No `.dots` version bump. The flag can be **repaired** after any drift, and the repair never
    moves a marcher.
- **The stored flag adds little information.** The model allows an invariant **I-M1:
  `defined = 0` ⇒ `(x,y)` equals the previous page's `(x,y)`** (today untouched rows are bit-exact
  copies, `src/db-functions/page.ts:220-229`). Beyond "differs from the previous page", the column
  adds only:
  - (a) a deliberate **pin**: a defined row equal to the row before it;
  - (b) a defined row that stays defined when an upstream edit makes it equal by coincidence.

  Compare **M1-lite** (no column, flag inferred from values) in §4.

- **Timeline mode: the M1 analogue is worse than storing nothing.** That analogue is a
  `generated` flag on automatic stays.
  - In timeline mode "inherited" already means "no row" (R-6,
    `packages/core/src/timeline/resolver.ts:495`).
  - A generated stay is a stored cache of a derived R-4 origin. That breaks D-2 ("positions are
    never stored").
  - Every upstream change would have to re-aim it, including indirect ones: shape geometry, R-E1
    range edits, flag moves, live links and layer steals.
  - **Recommendation for timeline mode: T-none.** Stop writing automatic stays, and keep stored
    stays only as explicit user **pins**.

## 1. Definition

### Page mode

- **Storage:** `marcher_pages` stays dense (`electron/database/migrations/schema.ts:185-233`).
  - Add `defined INTEGER NOT NULL DEFAULT 0 CHECK (defined IN (0,1))`.
  - Hand-edit the migration into a plain `ALTER TABLE … ADD COLUMN`, as 0017 was, to avoid a table
    rebuild.
  - `defined=1`: the position was authored on this page, or this is the first page.
  - `defined=0`: the position is inherited from the nearest earlier defined page. The row's `x,y`
    is a cache.
- **Invariants:**
  - **I-M1** as above (by start-beat order).
  - **I-M2:** the first page is always defined.
  - **I-M3:** a row with a `shape_page_marchers` entry is always defined. The shape is the
    definition (`src/db-functions/marcherPage.ts:381`).
- **Propagation.** For each written (m, N):
  1. Write the row and set `defined` (§2).
  2. Rewrite `x,y` (and set `path_data_id = NULL`) on m's later rows while `defined=0`, stopping
     at the first defined row.
  3. Return every page id it touched.
- **`normalizeInheritance(tx, marcherIds?)`:** any `defined=0` row whose value differs from the
  row before it becomes `defined=1`. It never moves a marcher.
  - It is one `LAG()` window over `marcher_pages JOIN pages JOIN beats`.
  - The same SQL serves as the migration for old files and as the repair for drift.

### Timeline mode (T-none)

- Nothing new is stored. A page is defined for a marcher when a winning span ends at its flag.
  Otherwise the marcher holds.
- Remove the automatic writers:
  - `timelineRipple.ts:526-646`;
  - `marcher.ts:200-232` and `timelineMarchers.ts:97-100`;
  - `timelineCoordinateWrites.ts:290-305`;
  - `planPageConversion.ts:425-435`.
- **Caveat:** "no row" means "hold" only when no lower-layer row covers the range. Under override
  storage (O) a lower group row shows through. So the only legitimate stored stay is a deliberate
  pin (Eos "block").

### Rejected alternative, T-flag

Add `generated` to `timeline_transitions`, and have the write path re-aim generated stays whose
origin changed, in beat order.

- It needs a resolver over the pending state inside the transaction. `timelineRipple.ts` already
  does that.
- A stay is a non-hold span, so it changes:
  - R-3 kinds;
  - R-12 `inherit` order keys;
  - FTL founding sets.
- Every new path that changes something upstream becomes a new drift bug.
- About 2–3 weeks.

## 2. What counts as "touched"

Rule: **after an edit, `defined := (value ≠ predecessor's value) OR pinned`**, compared exactly.
This is Eos's "a move instruction is any change from its previous value".

| Action                                                                                                 | Result                                                                                                                                                                                                    |
| ------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Drag, nudge, align, distribute, flip, swap (`RegisteredActionsHandler.tsx:714` → `marcherPage.ts:142`) | Defined if the value differs from the page before; rows that were addressed but not changed keep their state. Q2 asks "changed" vs "addressed": "addressed" makes invisible pins out of large selections. |
| Edit that leaves the marcher exactly on its inherited spot                                             | **Inherited again** (auto-untouch). Under a sticky rule it would be a surprise pin.                                                                                                                       |
| Align where a marcher was already in line                                                              | Stays inherited and follows later upstream edits while its peers are pinned. A known oddity that markers make visible.                                                                                    |
| Set to previous page (Shift+P, `setMarchersToNeighborPage.ts:105-127`)                                 | **Reset to inherited**: `defined=0`, copy the page before, propagate (Q3). Today it writes a frozen copy.                                                                                                 |
| Set to next page                                                                                       | Defined with N+1's value. A no-op if N+1 is inherited.                                                                                                                                                    |
| Shape create or edit (`shapePages.ts:156`); copy shape to next page (`shapePages.ts:413+`)             | Members defined, even when the value is equal (I-M3)                                                                                                                                                      |
| New-show wizard import of previous dots (`newShowCompletion.ts:323`)                                   | Page 1 defined; the change propagates to the inherited copies                                                                                                                                             |
| **Pin** (new)                                                                                          | `defined=1` without moving                                                                                                                                                                                |
| **Reset to inherited** (new; selection × page, or "from here on")                                      | `defined=0`, value := page before, propagate                                                                                                                                                              |
| **Only this page** (optional, Eos "Cue Only")                                                          | Write N, and pin N+1 at its old value if it was inherited. Defer.                                                                                                                                         |

## 3. Effect table (page-mode M1, with timeline T-none alongside)

| Dimension                                                       | Behavior and default                                                                                                                                                                                                                                                                                                                                                                              | Code                                                  |
| --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| Playback and paths                                              | No change; rows stay dense. Propagated rows clear the stale copied `path_data_id` (side bug, `Keyframes.ts:70-92`).                                                                                                                                                                                                                                                                               | `marcherPage.ts:142-205`                              |
| Page vs timeline mode                                           | Same rule in both: an edit carries forward to the next defined page. **Divergence on insert:** a page-mode insert holds, while the timeline **+** splits a move mid-way.                                                                                                                                                                                                                          | –                                                     |
| Append / insert / split                                         | New rows are copies with `defined=0`; timeline writes no rows. Inserting before a defined page leaves that page's value, so the move into it happens over its own counts only.                                                                                                                                                                                                                    | `page.ts:189-250`; remove `timelineRipple.ts:526-646` |
| Delete an inherited page                                        | Nothing to do.                                                                                                                                                                                                                                                                                                                                                                                    | –                                                     |
| Delete a defined page                                           | **Default (b):** normalize promotes the first following row to defined. Positions are kept and the move lands one page later; this matches the timeline flag delete (`pageFlags.ts:20-31`). **(a):** "Delete page and its move" resets the following inherited rows. The timeline ripple delete removes `isPageMove` rows (`timelineRipple.ts:290-332`), which is (a): a mode inconsistency (Q4). | `page.ts:524-604` calls normalize                     |
| Retime, beat insert or delete, reorder                          | Rows untouched; a reorder must call normalize.                                                                                                                                                                                                                                                                                                                                                    | –                                                     |
| Editing an earlier page                                         | Propagates per marcher through inherited rows and stops at the first defined row. **History bloat:** one UPDATE per page per marcher, about 20k `history_undo` statements for 200 marchers × 99 pages. Measure the replay; skip no-op updates.                                                                                                                                                    | `marcherPage.ts:142-205`                              |
| Partial edits                                                   | Per (marcher, page).                                                                                                                                                                                                                                                                                                                                                                              | –                                                     |
| Back to the exact inherited spot                                | Inherited again.                                                                                                                                                                                                                                                                                                                                                                                  | –                                                     |
| Undo / redo                                                     | One history group, and the `_ut` triggers snapshot `defined` too (`historyTriggers.ts:115-170`). Normalize after page-mode history actions to cover history recorded before the column existed. **Bug to fix:** the undo focus jumps to `Math.max(page id)` (`history.ts:1044`), which would be the last propagated page.                                                                         | `history.ts:548, 1030-1046`                           |
| Query cache                                                     | `invalidateByPage` clears only the requested pages (`useMarcherPages.ts:148-153`), so the write must return the propagated pages.                                                                                                                                                                                                                                                                 | `useMarcherPages.ts`                                  |
| Appearances                                                     | Per-row appearance columns aren't copied to new pages today (one-page overrides). The flag covers `x,y` only. The timeline's "last flag crossed" rule is about sampling.                                                                                                                                                                                                                          | –                                                     |
| 3D, exports (sheets, `exportPagePositions`, SVG, video, mobile) | Unchanged, because rows are dense. Sheets could print "Hold" for inherited rows.                                                                                                                                                                                                                                                                                                                  | –                                                     |
| `.dots` and migration                                           | ADD COLUMN default 0, then normalize: identical copies become inherited and differing rows defined. Deliberate identical stays can't be recovered. **No version bump.**                                                                                                                                                                                                                           | new migration; the open path                          |
| Older releases                                                  | They ignore the column. Their inserts default to 0, which is correct. Their edits leave inherited rows that break I-M1; normalize on open promotes them, so positions are kept and the flags err toward defined. Add a debug assertion of I-M1.                                                                                                                                                   | –                                                     |
| SVG shapes                                                      | I-M3, and propagation skips rows in a shape. A missed check would move shape members.                                                                                                                                                                                                                                                                                                             | `marcherPage.ts`, `shapePages.ts`                     |
| New marchers mid-show                                           | Today every page gets its own free spot (`marcher.ts:171-181`), so the new marcher jumps between pages. M1 defines page 1 and inherits after it. Timeline: no rows (hold at home).                                                                                                                                                                                                                | `marcher.ts:165-232`                                  |
| Converter                                                       | A slot only for rows that are defined **and** differ from the page before (also, defensively, any row that differs). A pin becomes a stored stay. R-12 `inherit` order and FTL founding sets change for later FTL moves. Re-run the P6.6 corpus.                                                                                                                                                  | `planPageConversion.ts:425-435`                       |
| Mental model and UI                                             | "A page shows where I put them, or where they last were." Show inherited vs defined for each marcher (outlined dot or badge, never colour alone). The inspector shows "Inherited from Page 2 · Pin here" or "Set on this page · Reset to inherited". A toast says "Also moved on pages 3–7".                                                                                                      | canvas, inspector                                     |

## 4. M1 vs M1-lite (no column)

- **What M1-lite derives:** "defined" means the row differs from the page before. An edit of N
  from v to w rewrites the following rows that equal v bit for bit.
- **Where it matches M1:** S1–S5, S7 and S8.
- **What it can't do:** express a pin (S6-ii). A defined row that an upstream edit makes equal by
  coincidence becomes inherited.
- **What it gains:** no schema change, no drift (older apps stay correct automatically) and no
  migration.
- **Not a guess:** it compares exact copies, so it isn't Blender's dropped "While Held" heuristic.
- **Recommendation:** if pins aren't wanted in page mode, M1-lite is the better page-mode fix
  (about 5–7 days).

## 5. Scenarios

Marchers A and B, pages 1–5. `*` = defined, `~` = inherited.

- **S1:**
  - Add pages 2–5 (all `~`), then edit p2 to (a2,b2).
  - p3–p5 are rewritten to `~` (a2,b2).
  - Timeline: no stays, so p3–p5 hold via R-6.
- **S2:** after S1, edit p4 to a4 (p5 follows), then re-edit p2 to a2′.
  - p3 follows; propagation stops at p4\*.
  - Edge case: if a2′ equals a4 exactly, p4 stays `*` under M1 and becomes `~` under M1-lite.
- **S3:** only A moves; B is untouched.
- **S4 (delete p2 after S1):**
  - (b): old p3 is promoted to `*` (a2,b2). Positions are unchanged and the move ends on the new
    page 2's flag.
  - (a): the following pages reset to (a1,b1).
  - Timeline flag delete gives (b), and ripple delete gives (a) (Q4).
- **S5 (insert X between 2 and 3):**
  - X is a `~` copy of p2.
  - After S2, p3\* keeps a4.
  - With the timeline **+**, X's flag shows A mid-move.
- **S6 (deliberate stay on p3, then edit p2):**
  - (i) If the stay came from Shift+P, p3 is `~` and follows.
  - (ii) If it came from Pin, p3\* keeps the old spot, so the marcher returns there.
- **S7 (undo):** one group restores the flags too. The focus must land on p2.
- **S8 (old v7 file):** normalize makes copies inherited.
  - If the old app already did S1, the file normalizes to p2* (a2), p3* (a1, differs) and p4~.
  - The stale page 3 stays until the user picks "Reset to inherited from page 3 on".

## 6. Cost

| Item                                                                                                                                                 | Days       |
| ---------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- |
| Migration (hand-edited ADD COLUMN)                                                                                                                   | 0.5        |
| `normalizeInheritance` on open, after deletes, after history actions, and as a debug assertion                                                       | 1          |
| Propagation in `updateMarcherPagesInTransaction`, pathway endpoints, I-M3 skip                                                                       | 1.5        |
| Shift+P as reset, Pin, Reset to inherited                                                                                                            | 1          |
| Structural writers (create page, delete, marchers, split, wizard)                                                                                    | 1          |
| Undo focus fix, cache invalidation                                                                                                                   | 0.5        |
| UI markers, inspector, toast                                                                                                                         | 2–3        |
| Sparse converter plus the P6.6 corpus                                                                                                                | 0.5–1      |
| Tests                                                                                                                                                | 2–3        |
| **Page-mode total**                                                                                                                                  | **≈10–12** |
| Timeline T-none: remove the four writers; P7.2 `moveMarchersOnPage` creates the row; cleanup only when a before/after resolver diff is bit-identical | 4–6        |

**Tests:**

- migration from a v7 fixture;
- S1–S7 unit tests;
- `test:history` round trips;
- old-app drift simulation;
- property fuzz against a reference model;
- converter equality;
- history size and replay at 200 × 100.

**Docs:**

- An ADR 0001 amendment or ADR 0002: the new page-era column, I-M1 to I-M3, no version bump.
- `ui.md` UI-9 changes: Set to previous page becomes inherit, new marchers get no rows, and Pin and
  Reset are added.
- VALIDATION rows for auto-untouch and the delete default.

## 7. Risks

1. **Action at a distance:** one drag rewrites many later pages, and history grows by about M×P
   rows per edit.
2. **Writes that bypass propagation drift silently.** Positions are never wrong, but the bug comes
   back for those rows. Normalize-on-open plus the debug assertion is the guard.
3. **The two modes give two answers** (insert and delete). The work is on a table that freezes at
   Phase 9.

## 8. Owner questions

1. Fix page mode now (M1 or M1-lite), or only timeline mode?
2. Is "defined" _"differs from the page before"_ or _"was edited here"_ (sticky)?
3. Should Set to previous page mean "follow" (recommended) or "freeze"?
4. Should deleting a page with a move keep later positions (recommended) or lose the move?
5. Are Pin and "only this page" needed in v1?
6. Where should defined vs inherited show, and should there be a toast after a propagating edit?
7. Inserting a page inside a move: should the timeline **+** hold like page mode, or keep motion
   unchanged?

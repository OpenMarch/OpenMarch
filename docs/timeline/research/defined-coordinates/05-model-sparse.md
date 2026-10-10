<!-- cspell:disable -->

# 05: Model M2, sparse keyframes (only edited pages store positions)

Model-design agent, 2026-10-08. [READ] means the code was read; [DERIVED] means it was reasoned from
spec rules; no scratch test was run. Paths are relative to `apps/desktop/` unless they start with
`docs/` or `packages/`.

## 0. Key findings

1. **The resolver already implements M2.**
   - A range with no winning row is a hold at the end of the previous span (R-2, R-4, R-6;
     `packages/core/src/timeline/resolver.ts:495`).
   - M2 changes no resolver code, no schema and no file version. It only stops the writes that
     store frozen copies.
2. **`addHoldingMoves` doesn't change motion when it writes** (`src/db-functions/timelineRipple.ts:526-646`).
   - Its destination is `positionAt(m, pageStart)`, the hold's origin is the same point, and `lerp`
     is exact at the endpoints.
   - Its only effects come later:
     - (a) upstream edits snap back;
     - (b) page-scoped writers get a row to edit;
     - (c) bookkeeping for `isPageMove` and page boxes.
3. **Why it exists:** 549451b2 / PR #26 (P7.4–P7.5).
   - It copied page mode's "new page = copy of previous".
   - The module comment says: "The holding transition is what 'move the marchers on the new page'
     edits (D-16, P7.2)" (`timelineRipple.ts:62-63`). The P7.2 writer refuses with "has no move
     that ends at the end of page N" (`src/db-functions/timelineMoves.ts:256-266`).
   - That dependency is mostly gone. Since UI-10 (P8.17), every drag, nudge, align and inspector
     edit goes through `planCanvasEdit` (`src/timeline/timelineCoordinateWrites.ts:110-145`) to
     `moveMarchersInRangeInTransaction`, which creates the window's timeline itself
     (`timelineMoves.ts:549-600`).
   - The only production caller left is set to previous/next page
     (`RegisteredActionsHandler.tsx:609` → `useMarcherPages.ts:166`). P8.12 (#54) moves it anyway.
4. **Stored stays cause other snap-backs** [DERIVED]:
   - **Cross-page windows that end partway into a page:** the stay is "caught up" (R-5 rebase,
     ownership 10 §4.2), so the marcher heads for the stale point.
   - **New marchers:** they get a stay to home in every timeline
     (`src/db-functions/timelineMarchers.ts:100-170`; 01 had the path as `src/timeline/`). Drag a
     new marcher on page 2 and page 3 snaps it home.
   - **Layers:** stays push every cross-page drag up a layer (`stealLayer`,
     `src/db-functions/timelineCommands.ts:251`) and cause E-A3 refusals on clip shifts.
   - **FTL order:** a stay is a non-hold span, so it becomes R-12's `inherit` order source for a
     later follow-the-leader move.
5. **There is a precedent in the format.** `tag_appearances` is already sparse ("a tag … on a page
   and onward", `start_page_id`, `electron/database/migrations/schema.ts:350-367`). Its FK cascades
   on page delete, with a TODO for exactly the delete problem below.

## 1. Definition

**Timeline mode:**

- Stored: homes (page 1 defines every marcher) plus authored rows. Nothing is written _on behalf of_
  a page.
- Derived: the position at every flag.
- Each page is one of these for each marcher:
  - **Defined:** a winning span ends at the flag.
  - **Inherited:** the marcher holds through it.
  - **Mid-move:** a longer span covers it.
  - **Pinned stay:** a stored zero-motion move. It blocks upstream edits like an Eos block.
    - Only explicit commands write it.
    - It is detected by `dest == origin` at render time; there is no new column.
- **Rule:** coordinates never stand in for intent, except once, in the converter.

**Page mode:** leave it alone (§5).

## 2. Effect table

| Dimension                                           | Behavior under M2 and proposed default                                                                                                                                                                                                                                                                    | Code                                                |
| --------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------- |
| Playback, paths                                     | Unchanged for any show whose stays were neutral.                                                                                                                                                                                                                                                          | none                                                |
| Page vs timeline mode                               | Timeline mode is sparse; page mode stays dense with copy-on-create. Accept the difference until Phase 9.                                                                                                                                                                                                  | –                                                   |
| Insert: **+** flag                                  | Already writes no rows (C-12). The new flag inherits, or shows the mid-move position.                                                                                                                                                                                                                     | `pageFlags.ts:139-200`                              |
| Insert: `createPages`, `createLastPage`, Split page | Edges still ripple; step 7 is removed. In a split, page N's move shrinks to `[b,e)` and the first half holds; motion is the same as today. The ripple tests change.                                                                                                                                       | `timelineRipple.ts:514-519, 526-646`                |
| Delete page: flag (UI-9)                            | Writes only the page row. The move then ends off a flag; later pages keep their look. **Make this the default for every "delete page" in timeline mode** (re-route `PageTimeline.tsx:254-263`).                                                                                                           | `pageFlags.ts:214-290`                              |
| Delete page with its moves (ripple, yank)           | `isPageMove` deletes the page's moves; it also matches a UI-10 drag over exactly the page. Inherited later pages fall back: **the snap-back moves here**. Make it an explicit command, with an Eos-style option that keeps the look: write a move ending at N+1's flag with the deleted destination (Q2). | `timelineRipple.ts:290-352, 440-443`                |
| Reorder, retime, beat insert/delete                 | Same edge rules, with fewer E-A3/E-T1 refusals.                                                                                                                                                                                                                                                           | `timelineRipple.ts:311-513`                         |
| Editing an earlier page                             | Carries forward per marcher to that marcher's next winning span: a defined page, a pin, a cross-page window or a steal. Later definitions keep their destination (D-5); only their path origin changes. **Leak risk.**                                                                                    | none                                                |
| Partial edits                                       | Only dragged marchers get rows.                                                                                                                                                                                                                                                                           | `timelineMoves.ts:575-600`                          |
| Drag back exactly onto the inherited spot           | No-op when the marcher has no row there. An existing row stays and shows as pinned, with **Clear (inherit)**.                                                                                                                                                                                             | `timelineMoves.ts:560-620`                          |
| Undo / redo                                         | Each edit is one `transactionWithHistory` step; no trigger changes.                                                                                                                                                                                                                                       | –                                                   |
| Appearances                                         | "Last flag crossed" is already sparse; per-marcher-page overrides were dropped (P7.14).                                                                                                                                                                                                                   | –                                                   |
| 3D, exports                                         | They sample the resolver at every flag (`timelinePagePositions.ts`, `dots-to-om.ts:325-355`), so output stays dense.                                                                                                                                                                                      | –                                                   |
| `.dots` and migration                               | No change, no version bump; a sparse file is valid v8. Existing converted dev files are **converted again by hand** (C-11 precedent); a dev-console prune is optional.                                                                                                                                    | –                                                   |
| Set to previous/next page                           | Today it **refuses on an inherited page** (`moveMarchersOnPage`). Proposed: "next" writes a definition; "previous" clears the marcher's own one-slot page move, or else pins (Q1). Add a separate **Pin here**. Ride along with P8.12.                                                                    | `timelineCoordinateWrites.ts:288-334`               |
| New marchers mid-show                               | Home only, with no stays. This removes the "new marcher snaps home" bug. Supersedes ui.md UI-9 "New marchers".                                                                                                                                                                                            | `timelineMarchers.ts:131-169`, `marcher.ts:224-229` |
| Add selected marchers                               | An explicit command; its stay is a deliberate pin.                                                                                                                                                                                                                                                        | `timelineMembership.ts:192-198`                     |
| Converter                                           | Skip marcher m on page i when its point equals page i-1's exactly (home for i=1). Positions at every flag stay bit-identical, so the P6.6 corpus is unchanged.                                                                                                                                            | `planPageConversion.ts:412-435`                     |
| Page boxes                                          | An inherited page has no stored timeline, so its box selects a "range not stored yet" (already supported). The inspector shows "Holding (defined at Page X)".                                                                                                                                             | `TimelineSelectionStore.ts:269`                     |
| UI                                                  | Phase 1: page-box badge "n moved / rest holding". Phase 2: dot tint, "Defined at Page X", and a propagation toast.                                                                                                                                                                                        | ui.md                                               |

**Where a page inherits from after its definition is deleted.** It is always the end of the
marcher's last winning span before the beat, so there is no stored copy to repair:

- **Flag delete:** nothing changes.
- **Ripple delete:** rows that ended at the previous boundary stretch to cover the deleted page.
  Inheritance then falls to that stretched move's destination, then to earlier moves, then home.
- **A pin after a deleted definition:** the pin becomes a real move back to the pinned point.

## 3. Scenarios (timeline mode)

- **S1:**
  - Adding pages writes no rows.
  - Dragging on page 2 creates T2, so p3 and p4 = X. Fixed.
- **S2:**
  - Edit p4 to Y, then re-edit p2 to X′.
  - p3 = X′, and p4 stays Y with its path now X′→Y.
- **S3:** only A gets a row; B holds at home.
- **S4 (delete page 2):**
  - **Flag delete:** look kept.
  - **Ripple delete:** T2 matches `isPageMove` and is deleted, so the new p2 and p3 = H. The
    snap-back moves to the delete. The look-preserving variant pushes the destination forward.
- **S5 (insert):**
  - The new page inherits, or sits mid-move under **+**.
  - A ripple split shrinks page 3's move.
- **S6:**
  - Pin A on p3, then edit p2 to X′.
  - A returns to Xa on p3; B follows X′.
  - Clear removes the pin.
- **S7:** one undo removes T2.
- **S8:**
  - **(a)** If pages 3–5 were copied _after_ page 2 was edited, they convert as inherited.
  - **(b) The owner's file:** pages 3–4 were copied from page 1 _before_ page 2 was edited.
    - Page 3 ≠ page 2, so it converts as a real move back to page 1's set. That is faithful to
      what the file plays, and the corpus requires it.
    - The converter can't tell a stale copy from "return to the opening set". At most the report
      can flag "Page 3 equals Page 1 exactly (possible stale copy)", and the user can Clear it.
    - `updated_at` is too weak to infer intent.

## 4. Cost: about 6–8 days of core work, plus 3–5 days of UI

| #   | Work                                                                                                                                                                                                                      | Days  |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----- |
| 1   | Remove ripple step 7 and `addHoldingMoves`; rewrite the hold tests as "new page inherits" plus an owner regression                                                                                                        | 1.5   |
| 2   | New marchers: home only                                                                                                                                                                                                   | 1     |
| 3   | Converter skips exact-equal points; P6.6 corpus; fixture row counts                                                                                                                                                       | 1.5   |
| 4   | Page delete in timeline mode defaults to flag delete; "delete page and its moves" becomes explicit, with an optional push-forward                                                                                         | 1–1.5 |
| 5   | Set to previous/next onto the range target, with Clear/Pin                                                                                                                                                                | 1     |
| 6   | Range writer: a marcher with no prior row whose drop equals its position writes nothing                                                                                                                                   | 0.5   |
| 7   | Optional dev-console `pruneAutomaticStays`. Remove a slot only when it is a shapeless `direct` with dest == origin, a founding span that isn't stolen, and a throwaway resolver shows identical positions and FTL entries | 1.5   |

**Docs:**

- ADR 0001 §2 C-12, amended: adding or deleting a page writes no timeline rows on any path; the
  converter writes only changed positions; a stored zero-motion move is a deliberate pin.
- Spec: no change.
- ui.md:
  - UI-9 sections: New marchers, Page-relative tools, Deleting a flag;
  - a new "Defined vs inherited" entry;
  - strike the backlog item at ui.md:769.
- phases/07: amend P7.4.

**Tests:**

- converter equality on sparse output;
- S1 across **+**, `createLastPage` and Split;
- S2 stopping at a definition, a pin and a window;
- the S4 variants;
- a window ending inside a page;
- a new marcher dragged on page 2;
- `test:history` round trips;
- a prune property test;
- old v8 files opening unchanged.

## 5. Page mode: (a) true sparse vs (b) leave it alone

**(a) Sparse `marcher_pages`. Rejected.**

- Nullable x/y needs a table rebuild plus new triggers. Missing rows already mean a glide, and old
  code throws on them.
- Every reader needs a forward fill, and every writer must upsert.
- It needs a version bump, but 8 is taken, and pre-guard releases open the file anyway.
- About 2–3 weeks, for a table that is frozen in Phase 9 and dropped in Phase 10.

**(b) Leave it alone (recommended).**

- The bug stays in page mode until Phase 9.
- Optional stopgap: an explicit "Copy to following pages" command (Pro Tools "Write to Next
  Breakpoint", EnVision "Step Through"). It copies the new position forward until the first page
  whose old value differs. About 1–1.5 days; undoable.

## 6. Risks

1. **Leaking edits, and lost intent on conversion.** Deliberate equal pages become inherited.
2. **Deletes move the snap-back.** Any delete that removes a definition makes later inherited pages
   fall back to an earlier one. `isPageMove` also matches ordinary drags.
3. **Hidden dependants of stored stays:**
   - `moveMarchersOnPage` refuses inherited pages;
   - page boxes;
   - a prune isn't neutral under steals or for FTL;
   - about 11 test files encode holds;
   - Phase 7 parity checks expected copy semantics.

## 7. Owner questions

1. Set to previous page: clear (recommended, plus a separate Pin here) or pin?
2. Delete page in timeline mode: flag-only by default? For "delete with its moves", should later
   pages keep their look or fall back?
3. Conversion: may exact-equal pages become inherited? Should the report flag possible stale copies?
4. Existing converted dev files: convert again by hand, or prune?
5. Page mode: leave it alone, or add the explicit "Copy to following pages" stopgap?
6. A drag back onto the inherited spot: keep the stored move as a pin, or remove it?
7. UI markers: in this change or as a follow-up?
8. Propagation stops per marcher at its next definition, with a per-edit "Keep only Page N" in the
   toast and no global Cue Only mode. OK?

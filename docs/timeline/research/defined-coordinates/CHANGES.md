<!-- cspell:disable -->

# Defined coordinates: change catalog (branch `timeline/defined-coordinates`, fork PR #112)

Status: updated 2026-10-09 to HEAD `2470207c` (first written at `e1cd9ea2`; since then wp12 Move them
too trigger, wp13 gap tests and window-move fix, wp14 toast polish, and the doc commit `5b2c5c6c`).
Compared with the fork's `timeline-try-2` tip `5888850a` (the merge base: the branch already merged it
in `97c8626b`). Source of truth for what the branch changes before it merges into the app. Every
entry is grounded in the code diff (`git diff 5888850a 2470207c`); where the docs say something else,
the entry says so under **Doc vs code** and describes what the code does.

**Keep later pages (wp15 + wp16, 2026-10-09):** B-38 … B-44 describe the kept spots (stored by
wp15 at `c56996f0`, with migration 0018) and their UI (wp16, branch `dc/wp16-keep-ui`). Their line
numbers are at the wp16 branch tip, not `2470207c`. They change two statements below: there is now a
schema addition (B-38), and a changed move that carried into later pages now shows a toast (B-44,
amending B-25).
wp19 (branch `dc/wp19-keep-fixes`, after the final two-user study) reworked B-39 … B-43: K acts
where the marchers hold, the words name the marchers, the menu and tooltips show K, kept and linked
chains differ at a glance, and never-moved marchers can be kept ahead of any move; B-44 is unchanged.
wp20 (branch `dc/wp20-kept-on-field`) adds B-45: the kept marchers are marked on the field with
the same broken chain, whatever is selected (owner, mock-up D, 2026-10-09).
**Pre-merge review (2026-10-09):** three independent reviews of PR #112 (canvas, UI, database)
found no blockers; their fixes are listed in [Pre-merge review fixes](#pre-merge-review-fixes)
(section 8) and noted under the B-entries they touch.

How to use this file:

- **Testers / QA:** section 5 is a runnable script per behavior; section 7 is what nobody has
  checked yet.
- **Docs writers:** section 2 has the exact strings and i18n keys; section 8 lists where the
  existing docs are stale.
- **Reviewers:** section 3 maps every changed file to the behaviors it carries.
- **Screenshots** sit under the matching B-entries (from `images/`). The story is in
  [HISTORY.md](HISTORY.md) and every on-screen element is explained in [GLOSSARY.md](GLOSSARY.md).

Line numbers are at `2470207c`. "TL" = timeline mode (the file's timeline flag on), "PM" = page
mode (what every released user runs).

## Contents

1. [Summary](#1-summary)
2. [Behavior catalog](#2-behavior-catalog) (B-01 … B-45)
3. [File map](#3-file-map)
4. [Test map](#4-test-map)
5. [QA checklist](#5-qa-checklist)
6. [Data and compatibility](#6-data-and-compatibility)
7. [Coverage gaps](#7-coverage-gaps)
8. [Merge notes and doc discrepancies](#8-merge-notes-and-doc-discrepancies)

---

## 1. Summary

### The rule (ui.md UI-18, ADR 0001 C-12 amendment of 2026-10-08)

A marcher has a coordinate on a page only where the designer moved it there. Everywhere else it
holds where it last was (spec R-6). An edit carries forward, per marcher, to that marcher's next page
with its own move, and stops there.

### Scope by mode

| Mode                           | How the rule is implemented                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| ------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Timeline mode** (dev flag)   | Already sparse (no move = hold). The branch stops every path that wrote rows on a page's behalf: page add/split/append holding moves, new-marcher stays, converter copies, set to previous/next stays, and no-op range writes. Delete page becomes the flag delete. Adds hold marks, an inspector line, Move them too, and new toast wording.                                                                                                                         |
| **Page mode** (released model) | Dense `marcher_pages` rows stay. An edit on page N also rewrites the following run of that marcher's rows that still equal the old position (within 1e-6), stopping at a different value, a page where the marcher is in a shape, or a row with its own pathway. Toast "Pages 3–4 followed (they were copies)" with **Only Page N**. Plus pre-existing fixes: new pages don't copy pathways, `pathways` is in undo history, undo focus works, followed pages refresh. |
| **Both**                       | Tag appearances on a deleted page move to the next page; hold marks on the page boxes for the selection; Move them too; selection box refits; Ctrl+A/Ctrl+S no longer nudge; one surprise toast at a time (fresh ids, runs of edits add up); toast button layout; a pending page selection expires after 2 s.                                                                                                                                                         |

### What did NOT change

- **No schema change** before keep later pages. The only edit in
  `electron/database/migrations/schema.ts` was a comment on `tag_appearances.start_page_id` (the
  cascade stays; code now moves rows before it fires). Since wp15, migration 0018 adds the
  `timeline_kept_assignments` table (B-38, ADR 0001 amendment 2026-10-09).
- **No file/user version change.** No migration before wp15 (0018, B-38). Existing files are read as
  they are.
- **The resolver (`@openmarch/core`) is untouched.** Positions at every flag of an unedited show are
  identical (real-app T7: max difference 0.0 across 8 files).
- **History format:** unchanged, except that `pathways` now has undo triggers (B-19).
- The `marcher_pages` rows stay frozen in timeline mode (P9.5).

### Owner decisions (all 2026-10-08 unless noted)

| #   | Decision                                                                                                                                                                                                                                        | Where recorded                        |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------- |
| 1   | Sparse model adopted; amend ADR 0001                                                                                                                                                                                                            | README Decisions; ADR 0001 amendment  |
| 2   | Page mode carries edits forward now, per marcher, with a tolerance, with Only Page N and the pre-existing fixes; no schema change                                                                                                               | README Decisions                      |
| 3   | Delete page in timeline mode keeps later pages' look (flag delete); "Delete page and its moves" is explicit                                                                                                                                     | README Decisions                      |
| 4   | Lock here / Keep later pages deferred (no stored kind)                                                                                                                                                                                          | README Decisions                      |
| 5   | Delete page and its moves keeps tracks (layer > 0) inside the box ("I think no" to deleting them)                                                                                                                                               | README; V-149                         |
| 6   | Page-mode shape edits carry forward ("I think so")                                                                                                                                                                                              | README; V-148                         |
| 7   | After the persona study (08): carry-forward is shown by hold marks, not toasts; toasts only for surprises, shorter                                                                                                                              | ui.md UI-18; V-146                    |
| 8   | 2026-10-09: hold-mark tooltips and **Move them too** built at the owner's request (PR #112 comment); renumbered UI-18 (UI-15/16 went to timeline edges, UI-17 to transport keys)                                                                | PR comment; ui.md UI-18; V-181, V-182 |
| 9   | 2026-10-09 (lead defaults after review): Move them too only when an edit splits a group (V-181); runs of edits add up behind one toast, two-button toasts put the buttons on their own row (V-184)                                              | ui.md UI-18; VALIDATION               |
| 10  | 2026-10-09: keep later pages (study 10): chains on the page boxes (none without a selection), the inspector's Keep here / Follow again, the page box menu entries, the after-edit Only Page N toast (the C rule); Alt-drag dropped, **K** added | 10; ui.md UI-18; V-185 … V-189        |
| 11  | 2026-10-09: store kept spots: a schema addition while user version 8 is unreleased, with an ADR 0001 amendment (supersedes decision 4's "no stored kind")                                                                                       | ADR 0001 amendment; B-38              |
| 12  | 2026-10-09: mark kept marchers on the field with the kept chip's broken chain, whatever is selected (mock-up D); no opacity, since dimming already means "outside isolation, not editable"                                                      | ui.md UI-18; B-45; V-191              |

---

## 2. Behavior catalog

Entry template: **Mode** · **Before** (`5888850a`) → **After** (`2470207c`) · **Strings** ·
**Edges** · **Code** · **Tests** · **Real-app** (scenarios in `~/om-capture/scenarios/`) · **V-row** ·
**Limits / open**.

Index:

| Group                        | IDs                     |
| ---------------------------- | ----------------------- |
| Timeline writes              | B-01 … B-07             |
| Delete                       | B-08 … B-13             |
| Page mode carry-forward      | B-14 … B-17             |
| Page mode pre-existing fixes | B-18 … B-21             |
| Move them too                | B-22, B-23              |
| Toasts                       | B-24 … B-26, B-36, B-37 |
| Hold marks and inspector     | B-27 … B-30             |
| Focus, selection, keys       | B-31 … B-35             |
| Keep later pages             | B-38 … B-45             |

### Timeline writes

#### B-01 Adding, splitting or appending a page writes no timeline rows

- **Mode:** TL.
- **Before:** the page ripple's step 7 (`addHoldingMoves`) gave every new page a holding transition
  (one slot per assignment ending at the page start, destination = position there, in a timeline
  over the page), so pages 3–4 added after page 2 froze page 2's _then_ position. Editing page 2
  later left pages 3–4 at the old spot (the owner's report).
- **After:** a new page writes only page rows. Marchers with no move over it hold (R-6), so a later
  edit to an earlier page carries through it until the marcher's next own move. Applies to every
  add path: UI-9 **+** flag, page-timeline **+** (Alt+T, add last page), Split, page-mode add
  `createPages` in TL, append.
- **Strings:** none.
- **Edges:** deleting an added page nobody moved on leaves timeline rows alone; a page added over a
  stored timeline writes nothing into it; a page added after a move stolen from a longer track
  leaves the marcher on the track.
- **Code:** `db-functions/timelineRipple.ts` module comment (lines ~50–60) and
  `rippleTimelineToPageGridInTransaction` (:459), `addHoldingMoves` deleted; doc of statement order
  now ends at step 6.
- **Tests:** `timelineNoAutoStays.test.ts` › "owner scenario S1 … pages added by ${how}" (each add
  path), "a page's own move stops the carry", "adding a page after a move stolen from a longer
  track…"; `timelineRipple.test.ts` › "splitting a page: … the marchers hold through the new page",
  "adding a last page writes no timeline rows", "adding a last page over a stored timeline writes
  nothing into it", "deleting an added page nobody moved on leaves the timeline rows alone";
  `p910Adversarial.test.ts` (C-11 structure with pages that get no timeline).
- **Real-app:** `dc-tl.mjs` T1 (page-timeline +), `dc-tl-flag.mjs` T1 (UI-9 + flag), `ux-f1.mjs`.
- **V-row:** V-140.
- **Limits:** files from earlier dev builds keep their holding rows (section 6).

#### B-02 New marchers get a home and no moves

- **Mode:** TL.
- **Before:** `joinNewMarchersToTimelinesInTransaction` gave each new marcher a home and its own
  one-slot transition holding the home in **every** stored timeline (skipping partial overlaps), so
  it was frozen at home on every page even after a later move.
- **After:** `giveNewMarchersHomesInTransaction` writes only the home (same free-spot search: four
  steps in from the top left, down two steps at a time, side by side two steps apart). The marcher
  stands at home until moved; a move then carries forward.
- **Strings:** none.
- **Edges:** nested/duplicate/partly overlapping timelines: still no rows; several new marchers
  side by side; the `TimelineMarcherAddResult` lost `joined` and `skippedTimelineIds`.
- **Code:** `db-functions/timelineMarchers.ts:giveNewMarchersHomesInTransaction` (:85);
  `db-functions/marcher.ts:createMarchers` (call site, ~:226).
- **Tests:** `timelineMarchers.test.ts` › "gives the new marcher a home and no moves…", "a new
  marcher moved on page 2 stays there on every later page", "places several new marchers side by
  side…", "joins no stored timeline, even empty or nested ones…";
  `timelineMembershipAdversarial.test.ts` › "new marchers: join no stored timeline, nested 4 deep…",
  "a new marcher stands at home at every beat in a converted show";
  `useMarchersTimelineMode.test.ts` › "a create with no settings loaded follows the file's flag";
  `timelineNoAutoStays.test.ts` › "a new marcher moved on page 2 stays there on pages 3 and 4".
- **Real-app:** `dc4-tl-marcher.mjs` (6: add a marcher mid-show, drag it on page 2, it holds on 3–4).
- **V-row:** none (ADR rule).
- **Limits:** undo focus for the add is B-31.

#### B-03 Range writes that move nobody write nothing

- **Mode:** TL.
- **Before:** a range (window/page box) write wrote a row for every marcher given, even one left
  where it was, so align/distribute on a held page planted zero-motion moves that froze those
  marchers; a write that moved nobody still opened an undo step and could create a timeline.
- **After:** compared with the resolver within `SAME_POSITION_TOLERANCE = 1e-6` (per axis, canvas
  units):
  - a marcher not yet in the range's timeline and already at the destination at `range.end` gets
    no row;
  - a marcher already in the timeline gets no destination write if unchanged (`skipUnchanged`,
    `changedPlans`; shape-backed slots are always written);
  - when nobody moves, no timeline is created and **no undo step** is recorded (`NothingWritten`
    rolls the transaction back and returns the empty result).
- **Strings:** none.
- **Edges:** applies to `{kind:"range"}` targets only (canvas drag, nudge, align, distribute,
  inspector X/Y when the selection is a page box or window). `{kind:"timeline"}` (an isolated
  move) and `{kind:"home"}` writes still write unchanged values (see Doc vs code).
- **Code:** `db-functions/timelineMoves.ts`: `SAME_POSITION_TOLERANCE` (:126),
  `moveMarchersInTimelineInTransaction` `skipUnchanged` (:426), `changedPlans` (:549),
  `moveMarchersInRangeInTransaction` (:745), `NothingWritten`/`wroteSomething` (:962–:974),
  `moveMarchersInTarget` (:981).
- **Tests:** `timelineSparseWrites.test.ts` › "align on an inherited page writes no row for a marcher
  it leaves still…", "distribute writes no row for the endpoints it keeps", "a write that moves
  nobody creates no timeline and no undo step", "a marcher already in the window's timeline moved to
  where it is writes nothing for it"; `timelineMovesByTimeline.test.ts` › "opens no edit when
  nothing moves"; `timelineSparseGaps.test.ts` › "a range write that leaves everyone where they are
  writes nothing and opens no undo step (contrast)", and two "documents current behavior" tests that
  pin the isolated-move and home caveat below.
- **Real-app:** `dc-tl.mjs` T2 (align/distribute on held page 3, then edit page 2: only movers get
  rows).
- **V-row:** V-140 (indirectly).
- **Doc vs code:** resolved in `5b2c5c6c`: ui.md UI-18 now says "a range write". Isolated-move
  (`{kind:"timeline"}`) and home writes to an unchanged position still write and open an undo step
  (pinned by `timelineSparseGaps.test.ts` as current behavior; open caveat).
- **Limits:** a row that _becomes_ zero-motion after an upstream edit is kept (07c §1 "auto-block").

#### B-04 A drag back onto the start of an own page move clears that move

- **Mode:** TL.
- **Before:** dragging a marcher away and back on page 3 left a zero-motion move: an invisible block,
  so page 3 no longer followed edits of page 2 (07c T2).
- **After:** on a range that is exactly a page box, a marcher's **own page move** (one-slot,
  shapeless transition in a timeline over exactly the box, assigned over the whole box, and the
  marcher's only row over any beat of the box) is deleted when the edit moves the marcher to where
  the box starts (and that differs from where it arrives now). Its timeline goes when left empty.
  The result's `cleared` lists them.
- **Strings:** none.
- **Edges (all tested):** the timeline is kept while other marchers are still in it; a zero-motion
  ending is **kept** in a window that isn't a page box, in a transition shared with other marchers,
  and where a track sits underneath (the marcher has more than one row over the box); an own
  zero-motion move left still by an edit (not moved back) isn't cleared.
- **Code:** `timelineMoves.ts`: `isPageBox`, `ownPageMoves` (:621), `clearOwnPageMoves` (:680), the
  `back` test inside `moveMarchersInRangeInTransaction` (~:780–:800).
- **Tests:** `timelineSparseWrites.test.ts` › "sparse timeline writes: a drag back clears the move"
  (6 tests).
- **Real-app:** `dc4-tl-marcher.mjs` (7: drag away and back on its own page box clears the move).
- **V-row:** V-143.
- **Limits:** only exact page boxes; Pyware users may expect a zero-motion "stay" to be a deliberate
  block (deferred "Lock here").

#### B-05 Set to previous / next page work on held pages

- **Mode:** TL (page mode's Shift+P/N write goes through B-14 instead).
- **Before:** both wrote through `moveMarchersOnPage`, which needs a move ending at the page's end
  beat: on a held page (no row) **Set to next page** was refused (E-ARGS toast), and set to previous
  wrote a frozen copy.
- **After:** planned with `copyPagePositions` (resolver at the neighbor page's end beat), written
  over the selected page's box with the range writer (`neighborPageTarget`; homes on the first
  page) through `moveMarchersAndOfferFollowUp`:
  - **Next** (Shift+N selected, Ctrl+Shift+N all) moves each marcher to its next-page position on
    the page; works on held pages.
  - **Previous** (Shift+P, Ctrl+Shift+P) sends every marcher with `clearOwn`: each marcher's own
    move over the box is deleted (so the page follows earlier pages again), even one that already
    goes nowhere. A marcher whose move there is shared with others, or longer than the page, is
    written to its previous-page position instead (a stay over the box).
  - Like any range write it can show the pass-through or Move them too toast (B-23).
- **Strings:** unchanged success/error messages (`MESSAGES` in `setMarchersToNeighborPage.ts:62`).
- **Edges:** previous on a page that already follows writes nothing; page 0 → next sets homes;
  previous from the last page / next from the second-to-last; no resolver yet → error, no write;
  shape-backed transition switches to individual destinations; follow-the-leader into a shape is
  refused (E-T5).
- **Code:** `utilities/setMarchersToNeighborPage.ts:setMarchersToNeighborPage` (:84, `clearOwn`
  :163); `timeline/timelineCoordinateWrites.ts:copyPagePositions` (:303, new `targets`),
  `neighborPageTarget` (:340); `hooks/queries/useMarcherPages.ts:moveMarchersToNeighborPageMutationOptions`
  (renamed from `moveMarchersOnPageMutationOptions`); `RegisteredActionsHandler.tsx` (~:611).
- **Tests:** `timelineSparseWrites.test.ts` › set to next/previous block (6 tests, :453–:565);
  `timelinePageCopy.test.ts` › "next on a page the marcher only holds through moves it there…" and
  the existing flag-on suite; `timelineToastPaths.test.ts`; `RegisteredActionsHandlerModes.test.tsx`
  › "set all marchers to the previous page copies every position".
- **Real-app:** `dc-tl-flag.mjs` T3 (Ctrl+Shift+N on a held page: base refused, branch works).
- **V-row:** V-145 (previous).
- **Limits:** set to previous inside a longer move writes a stay (tested), which is a block.

#### B-06 The converter writes only positions that change

- **Mode:** TL conversion (convert on open, dev convert).
- **Before:** one transition per timed page with a slot for every marcher with a row, so copied
  pages became stays (38–61% of slots in real files).
- **After:** a marcher whose point on page N is **bit-for-bit** equal to where it already stands
  (its previous slot's point, or its home) gets no slot; a page where nobody moves gets no
  timeline, and that is **not** reported as a loss. Gap glides (P6.7) are compared the same way.
- **Edges:** exact comparison (not tolerance) so every flag's positions are unchanged; a page
  "back to the opening set" after real moves still gets slots (its point differs from the previous
  slot); a page copied from the one before converts to no rows.
- **Code:** `timeline/convert/planPageConversion.ts:planPageConversion` (:313; `lastPoint` :413,
  `planMoves` :417).
- **Tests:** `planPageConversion.test.ts` › "a marcher whose point is exactly where it already
  stands gets no slot (C-12)"; `p910Adversarial.test.ts` › "many pages … held pages" (9 → 7
  timelines), others; `timelineNoAutoStays.test.ts` › "converting copied pages writes rows only where
  marchers move, and every position stays the same".
- **Real-app:** `dc-t7.mjs` (8-file corpus; positions at every flag and 0.2/0.5/0.8 seeks: max
  difference 0.0; rows 56→48, 32→16 on shows with copies).
- **V-row:** none.
- **Limits:** cannot tell a stale copy (left by the old app) from a deliberate "same spot": both
  convert to a hold; already-stale pages stay stale (README finding 7).

#### B-07 Page-delete ripple: merged boxes and next-row clamp

- **Mode:** TL (every page delete that goes through `withTimelinePageRipple`: Delete page and its
  moves, Yank, page-mode `deletePages` in TL, beat deletes that remove a page).
- **Before:** `isPageMove` matched only a transition over **exactly** the page's beats. After a
  flag delete merged two boxes, the merged page held two such moves, neither matched, and the
  delete was refused (E-A3, "E-A3 fix" in commits).
- **After:**
  - `isPageMove`: shapeless, all assignments layer 0 covering the transition, and lying **entirely
    inside the deleted page's box** (`start ≥ page.start` and `end ≤ page.end`). All such moves in a
    merged box go. (wp11 also matched a move that started before the box and ended at its flag;
    wp13 `566254e8` narrowed it, so window moves survive.)
  - **Clamp:** a row that would stretch (following the page before into the deleted box) past the
    marcher's next row at the same layer ends where that row starts instead (a track or a move
    crossing the deleted page's flag); the stretched move then arrives partway ("catches up").
- **Edges:** tracks (layer > 0) inside the box stay (owner decision 5); a move crossing the deleted
  page's **end** flag stays; a user's window move that starts **before** the box stays even when it
  ends at the deleted page's flag (V-149), and so does one the deleted page is inside (it then ends a
  page earlier); a window drawn over stored page moves sits at layer 1 and stays; Undo brings it
  back.
- **Code:** `db-functions/timelineRipple.ts:isPageMove` (:282), clamp in `planTimelineRipple`
  (:325, the `prev[1] = cur[0]` at :435).
- **Tests:** `pageDelete.test.ts` › "deleting a page with its moves after a flag delete" (6 tests);
  `pageDeleteGaps.test.ts` › window-move block (7 tests: "Delete page and its moves on page 2 keeps
  the user's window move over pages 1-2 (V-149)", "a window over pages 1-3 stays when page 3 is
  deleted with its moves", "a move inside the deleted page's box still goes with it, next to a kept
  window", "deleting a page inside the window…", "Delete page (the flag delete) keeps the window
  move…", "drawn over stored page moves, the window sits at layer 1 and stays", "Undo brings the
  window move back"); `timelineRipple.test.ts` › "tracks that aren't page moves".
- **Real-app:** `dc-tl-merge.mjs` (converted show: flag delete page 2, then delete the merged page
  with its moves, Ctrl+Z ×2).
- **V-row:** V-149.
- **Limits:** none known beyond V-149's open question (whether tracks should go).

### Delete

#### B-08 Timeline Delete page is the flag delete

- **Mode:** TL.
- **Before:** the timeline page box menu said **Delete page flag** (already a flag delete). The page
  timeline shown while editing beats (`PageTimeline`, focused component "timeline") ran **In Place**
  as `deletePages`, a ripple that deleted the page's moves, so later held pages snapped back.
- **After:** page box menu item renamed **Delete page** (same command). `PageTimeline` in TL: **In
  Place** runs `deletePageFlags` (later pages keep their look) and selects the next page (which took
  the box), else the previous page. Tooltip in TL: "Delete this page. Later pages keep their timing
  and look." (`timeline.page.contextMenu.deleteInPlaceTimelineTooltip`). Order in TL: In Place,
  With Its Moves, Yank. PM order unchanged (Yank, In Place).
- **Strings:** "Delete page" (hard-coded in `TimelineRangeMenu.tsx:294`, not i18n);
  `deleteInPlaceTimelineTooltip` (en.json).
- **Edges:** last page (no next page): the page before becomes last (`last_page_counts`), selection
  goes to the previous page; a deleted page's tag appearances move (B-13); no toast.
- **Code:** `components/timeline/TimelineRangeMenu.tsx` (~:285–:310);
  `components/timeline/PageTimeline.tsx:handleDeletePage` (:309), menu (:605–:618);
  `TimelineModePanel.tsx` `onDeletePageFlag` → `selectAfterDelete`.
- **Tests:** `TimelinePageFlagControls.test.tsx` › "Delete page on a page box (UI-9)" (3 tests),
  "the selection after deleting a flag (lead decision)"; `TimelineMoveMenu.test.tsx` › "keeps Delete
  page alone on a page box…"; `pageDelete.test.ts` › "Delete page (the flag delete) keeps every later
  page's look" (2 tests).
- **Real-app:** `dc-tl.mjs` T4 (page box menu, page timeline In Place), `dc-tl-flag.mjs` T4.
- **V-row:** V-142.
- **Limits:** the deleted page's move now ends between flags (the next page's box covers both).

#### B-09 Delete page and its moves (explicit command)

- **Mode:** TL.
- **Before:** not offered (the page timeline's In Place/Yank did this silently, without a report).
- **After:** page box right-click menu: **Delete page and its moves** (red, trash icon, after Delete
  page). Page timeline (beat editing) menu: **With Its Moves** (TL only), and **Yank** in TL now uses
  the with-moves variant with the same report. Runs the page-mode delete through the timeline
  ripple as one undo step (`deletePagesWithMoves` / `deletePageYankWithMoves`), so the page's page
  moves go (B-07) and marchers that only held on later pages fall back. Toast: B-10. Selection
  after (page box menu): if the deleted page was selected, the box now covering it (previous page's
  box running to the deleted flag; after home, the next page's box); otherwise unchanged
  (`selectionAfterDeleteWithMoves`). Page timeline: selects the previous page.
- **Strings:** "Delete page and its moves" (hard-coded, `TimelineRangeMenu.tsx:309`); "With Its
  Moves" `timeline.page.contextMenu.deleteWithMoves`; tooltip "Delete this page and its moves. Later
  pages that held its positions change." `…deleteWithMovesTooltip`.
- **Edges:** home is skipped (deleting only home writes nothing); page 1 right after home: the next
  page takes its box; tracks stay (B-07); in PM `deletePagesWithMoves` deletes like Delete page and
  reports no look (`changedPages` always empty outside TL).
- **Code:** `db-functions/pageDelete.ts:deletePagesWithMoves` (:241), `deletePageYankWithMoves`
  (:289), `deleteAndCompare` (:162); `db-functions/page.ts:deletePageYankInTransaction` (:646,
  extracted from `deletePageYank`); `hooks/queries/usePageFlags.ts` (:93, :109);
  `TimelineModePanel.tsx` (:371, `selectionAfterDeleteWithMoves` :507);
  `PageTimeline.tsx:handleDeletePageWithMoves` (:328), `handleDeletePageYank` (:339).
- **Tests:** `pageDelete.test.ts` › "Delete page and its moves" (8 tests incl. yank, page 1, undo,
  page mode, home); `TimelinePageFlagControls.test.tsx` › "Delete page and its moves on a page box"
  (2), "the selection after Delete page and its moves" (3).
- **Real-app:** `dc-tl.mjs` T4, `dc-tl-flag.mjs` T4, `wp8-f5.mjs`, `ux-f5.mjs`.
- **V-row:** V-142, V-149.
- **Limits:** not run with the deleted page itself selected in the real app (section 7).

#### B-10 The delete-with-moves toast, with Undo

![Delete page and its moves toast with Undo](images/08-delete-with-moves-toast-undo.png)

_TL, before the rebase onto #115._

- **Mode:** TL.
- **After:** `toast.success`, 10 s: "Deleted Page 2 · Page 1 is now 32 counts · old Pages 3–4
  changed", with **Undo** (runs the app's normal undo, `usePerformHistoryAction("undo")`). Since
  wp13 (`ece0dfbe`) the toast **closes on the next history change** (an edit, undo or redo), as
  Delete move's does, so its Undo can only ever undo the delete.
  - Parts: "Deleted Page N" / "Deleted Pages 2, 4"; one "… is now N counts" per page that grew;
    "Pages X–Y changed" for unrenamed pages and "old Pages X–Y changed" for renumbered ones, joined
    with " and "; or "No other page changed".
  - Page names are the **pre-delete** names (with the file's page number offset); runs of
    consecutive pages collapse to "3–5", others join with ", " (`pageRunsLabel`).
  - A page counts as changed when any marcher's resolved position at its own flag differs by more
    than 1e-6 from before (each page compared with its own flag before; home never).
  - No toast when nothing was deleted; no action when no undo callback is given.
- **Strings:** composed in English in `pageDeleteWithMovesMessage` (not i18n); action label
  `fileTab.undo` ("Undo").
- **Code:** `pageDelete.ts:changedFlagPageIds` (:129), `pageRunsLabel` (:318),
  `pageDeleteWithMovesMessage` (:349); `usePageFlags.ts:toastDeleteWithMoves` (:78,
  `subscribeHistoryChanges`).
- **Tests:** `pageDelete.test.ts` › "pageRunsLabel and the toast" (2), "owner S4: … the toast names
  every page whose flag changed", "a page no one moved on: … the toast says so", "a converted show
  with copied pages: reports exactly the flags that look different";
  `usePageFlags.deleteToast.test.ts` (2); `pageDeleteFollowUps.test.tsx` › "gap 8: the delete
  toast's Undo after a later edit" (3); `pageDeleteGaps.test.ts` › "after another edit, the app's
  undo takes back that edit, not the delete", "with no edit in between, Undo takes back exactly the
  delete; redo deletes again".
- **Real-app:** `dc-tl-flag.mjs` T4 (string + Undo), `wp8-f5.mjs`, `dc4-tl-delete.mjs`.
- **V-row:** V-142 (wording is a lead default from study 08).

#### B-11 The view stays on the merged page after a delete

- **Mode:** TL.
- **Before:** when the selected page was deleted, `StateInitializer` selected `pages[0]` (home),
  which moved the playhead to beat 0 and showed an "empty" field (study 08 bug 3).
- **After:** with no selected page in TL, it selects the page at the paused playhead
  (`pageAtPlayhead`), i.e. the page that took the deleted page's box; PM still selects the first page.
- **Code:** `components/singletons/StateInitializer.tsx` (~:76–:89).
- **Tests:** `StateInitializerDelete.test.tsx` (6: TL page at the playhead, not home; TL Delete
  page and its moves selects the page before; PM falls back to the first page; and three full-app
  runs deleting the **selected** page: TL Delete page, TL with its moves, PM In Place).
- **Real-app:** `dc4-tl-delete.mjs` and `dc4-pm-delete.mjs` (delete the **selected** page: lands on
  the merged page, not home; Undo restores); `wp8-f5.mjs`; screenshots `dc-summary3/4-*`.
- **V-row:** none.

#### B-12 Delete move names the pages that change

- **Mode:** TL (UI-14's Delete move, merged from #106).
- **Before:** "Deleted Move 2" + Undo (8 s).
- **After:** marchers that held after the move fall back, so the toast appends the pages whose own
  flag now looks different: "Deleted Move 2 · Pages 2–3, 5 changed" ("Page 4 changed" for one).
  Undo and the close-on-next-history-change rule are unchanged.
- **Strings:** English in `moveDeletedMessage` (not i18n); "Undo" hard-coded there.
- **Code:** `db-functions/timelineCommands.ts:deleteTimelineAndCompare` (:550, uses
  `pageDelete.ts:changedPagesAround` :218); `components/timeline/useTimelineCommands.ts:moveDeletedMessage`
  (:170), `toastMoveDeleted` (:185), call (:292).
- **Tests:** `timelineMoveThemToo.test.ts` › "the delete-move toast: appends the pages that changed,
  as runs", "deleting a move names the pages that changed: later pages that held from it fall back…".
- **Real-app:** `dc4-tl-delete.mjs` (5); screenshot `dc-summary3/5-tl-delete-move-toast.png`.
- **V-row:** V-183.
- **Pre-merge review (U8):** the toast text is translated (`timeline.moveDeleted.message`, `.withPage`, `.withPages`; same English).

#### B-13 Tag appearances move to the next page on any page delete

- **Mode:** both.
- **Before:** `tag_appearances.start_page_id` cascaded: a deleted page's appearances were lost, so
  later pages lost that tag look.
- **After:** before page rows go, each appearance on a deleted page moves to the next page that is
  not being deleted. Dropped when: that page already has one for the same tag (UNIQUE), or there is
  no later page. Of several deleted pages with the same tag, the latest (nearest the kept page) wins.
  Same transaction → one undo restores both. Tag queries are invalidated after every delete.
- **Paths:** PM `deletePages` and Yank (via `deletePagesInTransaction`), TL flag delete
  (`deletePageFlagsInTransaction`), TL Delete page and its moves / Yank.
- **Code:** `db-functions/tagAppearancePageDelete.ts:moveTagAppearancesOffPagesInTransaction` (:37);
  `page.ts:deletePagesInTransaction` (:547); `pageFlags.ts:deletePageFlagsInTransaction` (:251);
  `usePages.ts` (:219, :237), `usePageFlags.ts` (:64, :102, :117).
- **Tests:** `pageDelete.test.ts` › "tag appearances survive a page delete" (per path: "moves to the
  next page; one undo puts it back", "is dropped where the next page has its own…", "is dropped with
  the last page"; "several pages at once…", "several flags at once, in timeline mode", 2 history
  tests); `pageFlagsAdversarial.test.ts` › "a tag appearance on a deleted page moves to the next page,
  and undo restores it"; `pageDeleteFollowUps.test.tsx` › "${path.name}: page 3's tag appearances
  and the page map are fetched again" (per delete path) and a control without the invalidation.
- **Real-app:** none.
- **V-row:** none.

### Page mode carry-forward

#### B-14 Page-mode edits carry forward through equal copies

- **Mode:** PM.
- **Before:** a page-mode write changed only the given rows; pages copied from it kept the old
  position (the owner's bug in page mode).
- **After:** `updateMarcherPagesInTransaction` (default `carryForward: true`): an edit that moves a
  marcher on page N from `v` to `w` also rewrites that marcher's later rows, in page (start beat)
  order, while they still equal `v` within `COORDINATE_TOLERANCE = 1e-6` (per axis, pixels). The run
  stops at the first later row that:
  - is somewhere else (the marcher's own move: recorded as an `OwnMoveStop`, B-22), or
  - is a page where the marcher is in a shape (`shape_page_marchers`), or
  - has its own pathway (`path_data_id` not the previous row's); that row's pathway **start** moves
    to `w`.
- **Also:** followed rows lose their copied pathway (`path_data_id = null`); writes are batched
  (500 ids); per marcher, so other marchers are untouched.
- **Which edits carry:** every `updateMarcherPages` caller: canvas drag, nudge, align, distribute,
  inspector X/Y, **swap** (both marchers), **set to previous/next page in PM** (Shift+P/N write
  through `updateMarcherPages`), shape edits (B-17), the new-show "previous dots" import onto the
  first page (`newShowCompletion.ts:323`), and Move them too (B-22).
- **Edges:** owner scenario fixed; "back to the opening set" (page 4 = page 1 after real moves)
  doesn't follow an edit of page 1; a marcher standing still for 41 pages moves on all of them; a
  page inserted inside a run joins it; deleting a copy inside a run keeps the run; the last page
  carries nowhere.
- **Code:** `db-functions/marcherPage.ts`: `COORDINATE_TOLERANCE`/`sameCoordinate` (:147–:150),
  `updateMarcherPagesInTransaction` (:321), `updateMarcherPages` (:549), result type
  `MarcherPagesWriteResult`.
- **Tests:** `marcherPageCarryForward.test.ts` › "page mode carries an edit forward" (owner
  scenario, back to the opening set, 41 pages, merge leak, tolerance, shape stop, carryForward:false,
  swap, inserting/deleting pages, pathways, undo/redo, 200×100 timing);
  `setMarchersToNeighborPageCarry.test.tsx` (4: Shift+P, Ctrl+Shift+P, Ctrl+Shift+N, Shift+N);
  `newShowCompletion.test.ts` › "in page mode, imported first-page coordinates carry to every later
  page".
- **Real-app:** `dc-page.mjs` P1 (DB and field), P3 (undo/redo), P4 (playback mid page 3 holds);
  `dc-page-p56.mjs` P5–P6; `wp7-page.mjs`, `wp10-page.mjs`, `ux-f4.mjs`, `wp8-f4.mjs`.
- **V-row:** V-140, V-141.
- **Limits / open:**
  - **Merge leak** (known, tested): equality can't tell a copy from a page moved onto the same spot
    on purpose; such a page follows too. Way back: Only Page N, undo.
  - Undo cost: 200 × 100 edit 0.45–0.72 s, undo 2.3–4.0 s (logged, not asserted).

#### B-15 Page-mode no-op writes are skipped (no undo step)

- **Mode:** PM.
- **Before:** every write, even one equal to the stored value, was written and opened an undo step.
- **After:** `updateMarcherPages` drops writes that change only x/y within 1e-6
  (`withoutNoOpWrites`); if none are left, no transaction and no undo step. Inside a transaction, a
  skipped write cannot break a later carry; if every write was skipped there, the first is written
  anyway so the caller's undo group isn't empty.
- **Edges:** a write that also changes another field (notes, pathway) is never skipped; fabric's
  ~1e-14 drift on a selection drag is ignored.
- **Code:** `marcherPage.ts:withoutNoOpWrites` (:518), skip logic in
  `updateMarcherPagesInTransaction` (~:345–:350, fallback ~:470).
- **Tests:** `marcherPageCarryForward.test.ts` › "a write within the tolerance is skipped, and drift
  doesn't break a run"; `timelineCoordinateWrites.test.ts` › "align vertically, flag off" (now
  `toBeCloseTo`).
- **Real-app:** `dc-page-p56.mjs` P6 (full `marcher_pages` dump equals base).
- **V-row:** none.

#### B-16 Page-mode toast: "Pages 3–4 followed (they were copies)" with Only Page N

![Page-mode toast with the followed text, Only Page 2 and Move them too](images/09-page-mode-followed-and-move-them-too-toast.png)

_PM, the combined form (B-22), as of wp14. The plain form has only the first sentence and Only Page 2._

- **Mode:** PM.
- **After:** after a write that carried, one edit surprise toast (fresh id, B-37), 10 s:
  - "Pages {first}–{last} followed (they were copies)" (`marcherPages.carryForward.pages`) or "Page
    {page} followed (it was a copy)" (`…onePage`); first/last aggregated over all marchers.
  - Action **Only Page {page}** (`…only`) when one page was edited, **Only the edited pages**
    (`…onlyEdited`) otherwise. It runs `restoreCarriedRuns`: a **second** undoable edit that puts
    the followed rows back where they were (rows that changed since are left alone), restores the
    next page's pathway start, and refreshes those pages.
  - **Runs add up (B-36):** after several edits in a row on the same page(s) with the same marchers,
    Only Page N puts the followed pages back to before the **first** of them (`mergeCarriedRuns`).
  - **Split (B-22):** when the write also split the marchers at a later page, the same toast says
    both ("Pages 3–4 followed (they were copies). OT1 and OT8 have their own move on Page 3, so they
    kept their spot", `marcherPages.moveThemToo.withFollowed` = "{followed}. {kept}") with **Move them
    too** as the action and **Only Page N** as the second (sonner `cancel`) button.
  - Plain followed toast: `toast.message` (no icon); combined toast: `toast.info`.
  - Not shown when nothing carried.
- **Edges:** Ctrl+Z after Only Page 2 undoes only the restore (pages follow again); a second Ctrl+Z
  undoes the edit; Only Page 2 clicked after the edit was undone restores nothing and writes no step;
  after Only Page 2 a second edit of page 2 no longer carries into the restored pages, while an edit
  of page 3 still carries to page 4.
- **Code:** `utilities/carryForwardToast.ts:carryForwardMessage` (:56), `mergeCarriedRuns` (:119),
  `toastCarryForward` (:203), `withFollowedMessage` (:298); `marcherPage.ts:restoreCarriedRuns`
  (:626); wired in `useMarcherPages.ts` (:152, :217, :375).
- **Tests:** `marcherPageCarryForward.test.ts` › "Only Page N puts the followed pages back as its own
  undoable edit", "Only Page N leaves a page alone that changed since", "Only Page 2 (no carry) leaves
  a shared pathway's start alone", `carryForwardMessage` (3); `marcherPageCarryForwardGaps.test.ts` ›
  "gap 7: Only Page N, then more steps" (4) and history; `moveThemToo.test.ts` › "page mode: Only Page
  N after several edits" (5), "mergeCarriedRuns", "the toast's Only Page N puts the followed pages
  back, and leaves the kept marchers alone", "a fully held show: editing page 2 says only that later
  pages followed".
- **Real-app:** `dc-page.mjs` P2, `wp8-f4.mjs`, `ux-f4.mjs`, `dc4-pm-study-only.mjs`,
  `dc4-pm-silence-held.mjs`, `wp14-pm-only.mjs` (two nudges, Only Page 2 back to before the first).
- **V-row:** V-141, V-184.
- **Doc vs code:** resolved: README now says Only Page N "puts the followed pages back as a second
  undo step".
- **Limits:** study 09: users didn't know what Only Page 2 would do; with a partial follow the toast
  doesn't say "6 of 8 followed" (09 rec. 2, not built).

#### B-17 Page-mode shape edits carry forward, without a toast

- **Mode:** PM.
- **After:** shape edits write through `updateMarcherPagesInTransaction` (`shapePages.ts:156`), so
  they carry to later copies where the marcher isn't in a shape. No toast (the shape mutations don't
  call `toastCarryForward`). Shape mutations and new shapes invalidate every marcher-page, pathway
  and coordinate query (`invalidateAllMarcherPages`).
- **Code:** `db-functions/shapePages.ts` (:156, unchanged call, new default);
  `hooks/queries/useShapePages.ts` (:122, :165); `canvasObjects/MarcherShape.ts` (:276);
  `sharedInvalidators.ts:invalidateAllMarcherPages` (:73).
- **Tests:** `marcherPageCarryForward.test.ts` › "a shape edit carries forward to later pages that
  aren't in a shape (lead default)", "a page where the marcher is in a shape stops the run".
- **Real-app:** none.
- **V-row:** V-148.

### Page mode pre-existing fixes

#### B-18 A new page doesn't copy the previous page's pathway; a shared one is detached on edit

- **Mode:** PM.
- **Before:** `_createMarcherPages` copied `path_data_id`, `path_start_position`, `path_end_position`
  onto the new page, so the copy replayed the previous page's curve and editing either page bent the
  other's curve.
- **After:** the new page copies x, y, notes only (holds). Editing a row whose pathway equals the
  previous row's (a copy from older files) writes `path_data_id = null` on it instead of moving that
  pathway's end, so the previous page's curve is untouched.
- **Code:** `db-functions/page.ts:_createMarcherPages` (:193, comment :219);
  `marcherPage.ts:updateMarcherPagesInTransaction` (`sharesPreviousPathway`).
- **Tests:** `marcherPageCarryForward.test.ts` › "pathways" (5 tests).
- **Real-app:** none.
- **V-row:** none.

#### B-19 `pathways` is in undo history

- **Mode:** PM (table also exists in TL files).
- **Before:** pathway end moves weren't recorded; undo restored marcher pages but not curve ends.
- **After:** `schema.pathways` added to `tablesWithHistory`; undo triggers are created for it, also
  in existing files that lack them.
- **Code:** `db-functions/historyTriggers.ts` (:22).
- **Tests:** `marcherPageCarryForward.test.ts` › "undo puts back every carried row and both pathway
  ends in one step; redo reapplies", "a file without pathway history triggers gets them";
  `marcherPageCarryForwardGaps.test.ts` › "without them (an older file), undo puts the marcher back
  but leaves the curve's end where the edit put it", "opening the file creates them, and the next
  edit's curve end is undone and redone with it".
- **Real-app:** none.

#### B-20 Page-mode undo/redo goes to the earliest changed page and selects its marchers

- **Mode:** PM.
- **Before:** `rowIdFromSql` parsed `match[0]` ("WHERE rowid=5") → NaN, so no changed page was found
  and undo/redo never moved the page or selection; the intended rule picked the highest page id.
- **After:** `rowIdFromSql` reads the capture group; `earliestChangedPage` (one query per 500 rows)
  picks the page with the lowest start beat among changed `marcher_pages` rows and selects the
  marchers changed on it.
- **Code:** `db-functions/history.ts:rowIdFromSql` (:982), `earliestChangedPage` (:990),
  `performHistoryAction` (:1064).
- **Tests:** `marcherPageCarryForward.test.ts` › "rowIdFromSql reads the row id";
  `RegisteredActionsHandlerModes.test.tsx` › "undo restores a nudge, goes back to its page and
  selects the moved marchers"; `timelineHistoryFocus.test.ts` › "with the flag off, the page-mode
  rule applies…".
- **Real-app:** `dc-page.mjs` P3 (undo/redo restores pages 2–4).
- **V-row:** V-148 ("is the jump on undo welcome?").
- **Limits:** a user-visible change for all page-mode users (undo now jumps pages); study 09 listed
  "Undo jumps to another page" as a base complaint.

#### B-21 Followed pages and pathways refresh after a page-mode write

- **Mode:** PM.
- **Before:** only the written page's queries were invalidated, so followed pages showed stale
  positions until reloaded.
- **After:** `invalidateAfterMarcherPagesWrite`: written pages + followed pages + pages whose pathway
  end moved, plus every carried marcher's `byMarcher` query and all pathway queries. Used by update,
  swap, selected-marchers update, Only Page N, Move them too.
- **Code:** `hooks/queries/sharedInvalidators.ts:invalidateAfterMarcherPagesWrite` (:49);
  `useMarcherPages.ts` (:147, :212, :374).
- **Tests:** indirect (`PageHoldMarks.test.tsx` page strip after an edit).
- **Real-app:** `dc-page.mjs` P1 (field shows page 2's positions on pages 3–4).

### Move them too

#### B-22 Move them too, page mode

![Page 3 after shortening the page 2 move: OT1 and OT8 left at their old spots](images/01-split-group-ends-left-behind.png)

_The surprise from study 09 (annotated, before Move them too)._

![Mock-up of the Move them too toast](images/02-move-them-too-mockup.png)

_The proposal shown to the owner (mock-up). Page mode's built form is under B-16._

- **Mode:** PM.
- **Before:** not present (proposed by study 09, G4).
- **After (wp12 trigger):** only when the write **splits the marchers it moved at a later page**: at
  that page some of them followed (they were copies) and some stopped because they have their own
  move there (`OwnMoveStop`, not a shape page, not a page the same write also edits for that marcher).
  Stops on pages nobody followed into are dropped (`followedPositions.has(stopPageId)`), so a fully
  written show (every page differs) and a fully held show say nothing about kept marchers. The kept
  marchers are named, in drill order, inside the combined followed toast (B-16):
  - one page, one marcher: "{names} has its own move on Page {page}, so it kept its spot"
    (`marcherPages.moveThemToo.oneMarcher`);
  - one page, several: "{names} have their own move on Page {page}, so they kept their spot"
    (`…onePage`);
  - several pages: "{names} have their own later moves, so they kept their spots" (`…laterMoves`);
  - names: "OT1", "OT1 and OT8", "OT1, OT2 and OT3", past three "{first}, {second} and {count}
    others" (`…namesAndOthers`; the "and" lists are English-only).
  - Action **Move them too** (`…action`), with **Only Page N** beside it → `moveLaterMovesToo`: shifts
    each stop row by the offset (summed over a run of edits, B-36) from where the stop is **now**, as
    its own undo step; it carries forward to copies of the stop page; rows that are gone are skipped.
- **Edges:** no offer for an edit that moves nobody / only within tolerance, for Only Page N
  (`carryForward:false`), or for undo; a stop on a shape page isn't listed; a different split in
  between doesn't add up.
- **Code:** `marcherPage.ts` (`OwnMoveStop`, split filter :505, `moveLaterMovesToo` :589);
  `carryForwardToast.ts` (`toastCarryForward` :203, `moveKeptMarchersToo` :279);
  `utilities/moveThemToo.ts` (`moveThemTooMessage` :88, `marcherNamesList` :66).
- **Tests:** `moveThemToo.test.ts` › "the message" (3), "page mode: Move them too" (6), "page mode:
  Move them too after several edits" (5), "a fully written show (every page differs): an ordinary
  drag and a nudge on page 2 say nothing", "the same page, other marchers (all but OT4)…", "another
  page, the same marchers…".
- **Real-app:** `dc4-pm-study-move.mjs` (9/9), `dc4-pm-silence-written.mjs` (written show: no toast),
  `dc4-pm-silence-held.mjs`, `wp14-pm.mjs`; screenshots `dc-summary3/1-pm-*`, `~/ux-study/wp14/pm-*`.
- **V-row:** V-181, V-184.
- **Limits:** a split edit in a written show that also has some held pages still names everyone who
  stopped on a page others followed into; there is no "6 of 8 followed" count.

#### B-23 Move them too, timeline mode

![Timeline toast: OT1 and OT8 have their own move on Page 3, so they kept their spot · Move them too](images/03-move-them-too-toast.png)

_TL, as of wp11._

- **Mode:** TL.
- **After:** every canvas/coordinate edit and set to previous/next goes through
  `moveMarchersAndOfferFollowUp`: positions at the edit's end beat are read just before the write
  (`onStart`). **If the edit produced a pass-through toast, nothing more is offered** (the
  pass-through toast and its Keep as a stop win). Otherwise, after the resolver settles, `laterOwnMoves`
  keeps a moved marcher (offset > 1e-6) whose next own move starts at or after the edit end and ends
  on a page flag **only where the edit split the group at that flag**: at least one moved marcher
  follows into it (holds from the edit's end through the flag). Shape-backed transitions are dropped.
  Same strings and 10 s as B-22, one button (no Only Page N in TL). **Move them too** →
  `shiftSlotDestinations` with the run's summed offset (B-36): one undo step; later pages holding
  from it follow.
- **Edges:** fully held show → nothing; fully written/converted show (every marcher moves on every
  page) → nothing on drags and nudges; next move ending between flags or starting before the edit's
  end → not kept; within tolerance → nothing; homes (beat 0) and isolated moves handled
  (`editEndBeat`); errors finding them are logged, never thrown.
- **Code:** `timeline/timelineMoveThemToo.ts` (`laterOwnMoves` :107, `findLaterOwnMoves` :169,
  `toastLaterOwnMoves` :212, `moveMarchersAndOfferFollowUp` :275, pass-through early return :302);
  `timelineMoves.ts:shapeBackedTransitionIds` (:1054), `shiftSlotDestinations` (:1084).
- **Tests:** `timelineMoveThemToo.test.ts` › "timeline mode: Move them too" (incl. "with a window
  passing a flag that also splits them, only the pass-through toast shows (Keep as a stop stays
  reachable)", "a fully held show: shortening page 1 for everyone offers nothing", "a fully written
  show…: an ordinary drag and a nudge on page 2 offer nothing"), "Move them too after several edits"
  (6).
- **Real-app:** `dc4-tl-study.mjs`, `dc4-tl-window.mjs` (pass-through wins),
  `dc4-tl-silence-held.mjs`, `dc4-tl-silence-written.mjs`, `wp14-tl.mjs`; screenshots
  `dc-summary3/1-tl-*`, `3-tl-window-split-toast.png`, `~/ux-study/wp14/tl-*`.
- **V-row:** V-181, V-184.
- **Limits:** when a window both passes a flag and splits a group, the user gets Keep as a stop but
  no Move them too for that edit.
- **Pre-merge review (D1):** `shiftSlotDestinations` clears the kept marker of every slot it moves, in the same edit, as the other destination writes do (`timelineMoveThemToo.test.ts` › "shifting a kept spot clears its kept marker…").

### Toasts

#### B-24 Pass-through toast: "Page 3 is no longer a stop" · Keep Page 3 as a stop

![Pass-through toast: Page 3 is no longer a stop · Keep Page 3 as a stop](images/07-pass-through-toast.png)

_TL, before the rebase onto #115 (the field line above the canvas predates it)._

- **Mode:** TL.
- **Before:** shown only when the drag overrode or ran into stored moves, naming marchers ("OT1, OT2,
  OT3, OT4 and 4 others now move straight through Page 3."); action "Only change Page N" / "Only
  change from Page N's set" / "Only change from beat N"; no id, 10 s.
- **After:** the range write reports every page flag strictly inside the range (`flags`), and every
  added marcher passes them, stored moves or not. Toast (`toast.info`, a fresh edit surprise id
  `timeline-edit-N` (B-37), 10 s with an action, 6 s without; it suppresses Move them too for that
  edit, B-23):
  - "Page {page} is no longer a stop" / "Pages {first}–{last} are no longer stops" / "The sets
    inside this move are no longer stops" (flag with no named page) (`timeline.edit.passThrough.noLongerStop.*`);
  - no flag inside (crossed only moves): "Moves straight through {through}, then catches up to
    {caughtUp}'s set" / "Moves straight through {through}" / "Catches up to {caughtUp}'s set by its
    end" (`…throughAndCatchUp`, `…through`, `…catchUp`);
  - action "Keep Page {page} as a stop" / "Keep Pages {first}–{last} as stops" / "Keep them as stops"
    (`…keepStops.*`): `moveMarchersFromFlagInstead` from the last flag inside (unchanged
    semantics), and **the window follows** to `[flag, end)` when it was still on the drag's range
    and nothing is isolated; the result may toast again.
- **Edges:** a window inside one page passes no flag and says nothing; a marcher already in the
  window's timeline passes nothing; a window the user left keeps its selection; Keep works with no
  rows underneath.
- **Code:** `timeline/timelinePassThrough.ts` (`passedPages` :76, `passThroughMessage` :92,
  `keepStopsLabel` :141, `keepPassedFlagsAsStops` :171, `toastPassThrough` :196);
  `timelineMoves.ts` `TimelinePassThrough.flags`.
- **Tests:** `timelinePassThrough.test.ts` (5); `timelineSparseWrites.test.ts` › "the pass-through
  toast" (3); `timelineCarryForward.test.ts` › "a window passing a flag says only…", "Keep as a stop
  restores the passed flag, and the window follows…", "a window the user has left keeps its
  selection…"; `timelineMovesByTimeline.test.ts` › the "Keep Page N as a stop" tests (5, renamed in
  `65ac6298`); `timelineSparseGaps.test.ts` › "gap 7: Keep as a stop, then undo and redo".
- **Real-app:** `dc-tl-flag.mjs` T5 (+ "(e) Keep Page 3 as a stop": flag 3 shows page 3's set again),
  `wp8-f2.mjs`, `ux-f2.mjs`, `dc4-tl-window.mjs`.
- **V-row:** V-144.

#### B-25 Ordinary timeline edits show no toast

- **Mode:** TL (and PM for edits that carry nowhere).
- **Before:** none existed in the base either; the branch's first build (wp5) added "Also moves Pages
  3–4 · stops at Page 5", removed in wp8.
- **After:** no carry-forward toast. Since wp12, Move them too fires only on a split (B-22, B-23), so
  ordinary drags and nudges are silent in fully held and fully written shows. `editCarryForward` /
  `summarizeCarryForward` remain in `timelineCarryForward.ts` with **no production caller** (tests
  only).
- **Tests:** `timelineCarryForward.test.ts` › "an ordinary edit that carries forward shows no toast";
  the "fully held" / "fully written" tests in `timelineMoveThemToo.test.ts` and `moveThemToo.test.ts`.
- **Real-app:** `dc4-tl-silence-held.mjs`, `dc4-tl-silence-written.mjs`, `dc4-pm-silence-written.mjs`.
  Rounds 1–3 "no toast" checks (dc-page-p56 P6, wp8) were unreliable (a hidden reused toast node) and
  are superseded by dc4.
- **V-row:** V-146.
- **Amended by B-44 (wp16):** an edit that changes an existing own move and carries into later
  pages now shows "Pages 3–4 followed" · Only Page 2. A page's first move, and edits that carry
  nowhere, stay silent.

#### B-26 Toast button layout: one line; two buttons on their own row

- **Mode:** both (global `Toaster`).
- **After:**
  - One button: `content: min-w-0 flex-1`; `actionButton`: `shrink-0 self-center whitespace-nowrap
rounded-6 px-8 py-4 text-body text-accent hover:underline` + focus ring, beside the text.
  - Two buttons (wp14 `addf75ec`, any toast with sonner's `cancel`): the toast wraps
    (`[&:has([data-cancel])]:flex-wrap`); the text keeps the first row (beside the icon, or the full
    width without one) and the buttons go on their own row underneath, right-aligned;
    `cancelButton` is the quieter one (`ml-auto … text-text`), before the action.
  - Affects every toast with an action in the app; today only B-16's combined toast has two.
- **Code:** `components/ui/Toaster.tsx` (:19–:36).
- **Tests:** `Toaster.test.tsx` › "keeps an action's label on one line, with a focus ring", "with one
  button, keeps it beside the text on one row", "with two buttons, wraps them onto their own row
  under the text, right-aligned".
- **Real-app:** `wp14-pm.mjs` (layout measured: buttons on one row under the text, single-line, toast
  under 160 px), `wp14-tl.mjs` (one-button toast keeps its row); `~/ux-study/wp14/*.png`.
- **V-row:** V-184.

#### B-36 Runs of edits add up behind one surprise toast

- **Mode:** both.
- **Before:** each nudge replaced the toast, and its action covered only the last nudge (so two
  nudges then Move them too shifted by one nudge's offset).
- **After (wp14):** an edit **continues the open toast's run** when all hold:
  - it is the very next history change after the run's last edit (`editHistoryMark`, counted with
    `subscribeHistoryChanges`);
  - same mode (page vs timeline);
  - same scope: same page(s) (PM, rows the write edited, not the carried ones) or same window/target
    (TL: `range:start-end`, `home`, `timeline:id`) **and exactly the same marchers** (`editScope`);
  - the run's toast is still the current surprise toast.
    Then **Move them too** shifts by the summed offsets (`addShifts`, only when the same marchers stop at
    the same later moves) and **Only Page N** puts the followed pages back to before the first edit
    (`mergeCarriedRuns`). Anything else starts a new run from this edit: an undo/redo in between,
    another edit, Move them too or Only Page N clicked, another surprise toast, the toast closing, or
    nudging only some of the marchers. A late check from an older edit leaves the newer run alone.
- **Code:** `utilities/moveThemToo.ts` (`editHistoryMark` :183, `editScope` :215, `continueEditRun`
  :246, `addShifts` :286, `forgetEditRun` :311); `carryForwardToast.ts` (`pageEditScope` :154,
  `continuePageEditRun`); `timelineMoveThemToo.ts` (`toastLaterOwnMoves` :212, `windowKey`).
- **Tests:** `moveThemToo.test.ts` › "a run of edits behind one toast", "mergeCarriedRuns", "page
  mode: Only Page N after several edits" (5), "page mode: Move them too after several edits" (5);
  `timelineMoveThemToo.test.ts` › "timeline mode: Move them too after several edits" (6).
- **Real-app:** `wp14-pm.mjs` (two nudges, Move them too shifts by both), `wp14-pm-only.mjs`,
  `wp14-tl.mjs`.
- **V-row:** V-184.
- **Limits:** the run is module state (one per app window); a nudge on a different selection, even
  overlapping, starts over (by design).
- **Pre-merge review (U1, U5):** a run's `forget` matches by toast id, so the toast closing ends a continued run and the next nudge shows a new toast (`timelineKeepCommands.test.ts` › "after a run's toast closes, the next nudge shows a new toast"); an older edit whose check lands after a newer one's is `stale` and shows nothing (`moveThemToo.test.ts` run test; `timelineMoveThemToo.test.ts` › "an older edit's check finishing after a newer one's shows no toast").

#### B-37 Each surprise toast gets a fresh id; the previous one closes

- **Mode:** both.
- **Before (wp11):** pass-through, page-mode followed and Move them too toasts all used the fixed id
  `timeline-edit`. Sonner merges a toast into every earlier one with its id, even a closed one, so a
  one-button toast kept an earlier toast's second button, icon and close handlers (`839492b8`).
- **After:** `editSurpriseToastId()` dismisses the current surprise toast and returns
  `timeline-edit-N` (N counts up). Still one surprise toast on screen at a time.
- **Code:** `utilities/moveThemToo.ts:editSurpriseToastId` (:33); callers in `timelinePassThrough.ts`
  (:204), `carryForwardToast.ts` (:246), `timelineMoveThemToo.ts` (:241).
- **Tests:** `Toaster.test.tsx` › "an edit toast replaces the one before, and keeps none of its
  buttons or icon".
- **Real-app:** `wp14-pm-only.mjs` ("a followed toast right after a Move them too toast has no icon
  and one button").
- **V-row:** V-184 (indirectly).
- **Limits:** a toast transition video has not been reviewed (section 7).

### Hold marks and inspector

#### B-27 Hold marks on the timeline's page boxes

![Hold marks: diamonds under pages 1 and 2, bars along pages 3 and 4](images/04-hold-marks-page-boxes.png)

_TL, all eight selected, as of wp10._

- **Mode:** TL.
- **After:** with marchers selected, each page box after home shows, for the selection:
  - **moves** (every selected marcher with a state has its own move ending in the box,
    `(previous flag, flag]`): a 10×7 px diamond at the bottom right (`data-hold-mark="moves"`);
  - **holds** (every one holds): a 3 px bar along the bottom, subtitle color;
  - **mixed**: the same bar, dashed (4 px on, 3 px off).
  - Marchers partway through a move at the flag count as neither; nothing when none has a state.
    Nothing without a selection. Computed per selection, page list and resolver version (not per
    playback frame). Never takes the pointer.
- **Code:** `timeline/pageHoldMarks.ts` (`timelineMarcherPageStates` :70, `classifyPage` :141);
  `timeline/usePageHoldMarks.ts:useTimelineHoldMarks` (:39); `components/timeline/PageHoldMark.tsx`
  (`PageHoldMarkView` :35); `TimelinePrimitives.tsx` (`TimelinePageBox`), `TimelineModePanel.tsx`
  (:329), `Timeline.tsx`, `TimelineVariants.tsx`, `TimelineViewModel.ts`.
- **Tests:** `pageHoldMarks.test.ts` (pure: 15; resolver: "owner scenario: … until undo");
  `PageHoldMarks.test.tsx` › "the timeline's page boxes" (2).
- **Real-app:** `wp7-tl.mjs`, `wp10-tl.mjs`.
- **V-row:** V-146.
- **Limits:** first-time users didn't notice them unprompted (09); "show for the whole band with no
  selection" is an open owner question.
- **Pre-merge review (U7, lead default):** a page where the selection's move is a kept spot shows the hold bar, not the moves diamond (`timelineMarcherPageStates` takes the kept markers; `classifyPage` returns `{ kind: "holds", kept: true }` when every selected marcher is kept; kept with others names no page).

#### B-28 Hold marks on page mode's page strip

- **Mode:** PM (`PageTimeline`; disabled in TL's beat-editing view).
- **After:** same marks; a marcher holds on a page whose position equals the previous page's within
  1e-6 (since the page it last moved on); a page without a row is unknown and breaks the run. Reads
  every page's marcher rows (one query per page) only while something is selected.
- **Code:** `pageHoldMarks.ts:pageModeMarcherPageStates` (:107); `usePageHoldMarks.ts:usePageModeHoldMarks`
  (:77); `PageTimeline.tsx` (hold marks wiring ~:90–:110, box ~:440–:520).
- **Tests:** `pageHoldMarks.test.ts` › "one marcher's states, page mode" (4);
  `PageHoldMarks.test.tsx` › "page mode's page strip: owner scenario…".
- **Real-app:** `wp7-page.mjs`, `wp10-page.mjs`.
- **V-row:** V-146.
- **Limits:** page-mode "holds" means "equal to the previous page", so a deliberate move back onto the
  same spot reads as a hold (same blind spot as B-14); query fan-out on 100+ page shows not measured.

#### B-29 Hold-mark tooltips and accessible descriptions

![Hold-mark tooltip: Selected marchers hold from Page 2 · They stand where Page 2 left them](images/05-hold-mark-tooltip.png)

_As of wp10, on the stand-in tooltip; now #115's ShortcutTooltip._

- **Mode:** both.
- **Before:** native `title` only (wp7), invisible to headless capture.
- **After:** a Radix tooltip above the box (#115's `ShortcutTooltip` with `closeOnPress`: 500 ms hover
  delay, 300 ms skip delay,
  opens on keyboard focus; a press closes it and keeps it closed until the pointer leaves, so
  clicks, scrubs, drags and right-clicks are undisturbed; no tooltip without a mark). Label + hint:

  | Mark  | Label (key `timeline.holdMarks.*`)                                                                                                                  | Hint                                                                                                                      |
  | ----- | --------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
  | moves | "Selected marchers move on this page" (`moves`)                                                                                                     | "They have their own move here" (`movesHint`)                                                                             |
  | holds | "Selected marchers hold from Page {page}" (`holds`) · "…hold from the start" (`holdsFromStart`) · "…hold on this page" (`holdsHere`, mixed origins) | "They stand where Page {page} left them" · "They stand where they started" · "They stand where their last move left them" |
  | mixed | "Some selected marchers hold from Page {page}" (`mixed`) · "…from the start" (`mixedFromStart`) · "…on this page" (`mixedHere`)                     | "Some have their own move here" (`mixedHint`)                                                                             |

  The box gets `aria-describedby` pointing at an `sr-only` span "{label}. {hint}".

- **Code:** `components/timeline/ShortcutTooltip.tsx` (`ShortcutTooltip`'s `closeOnPress`,
  `TransportTooltipProvider`'s `disableHoverableContent`); `PageHoldMark.tsx` (`HoldMarkTooltip`
  :89, `useLabeledHoldMarks`); `pageHoldMarks.ts` (`pageHoldMarkLabel` :197, `pageHoldMarkHint`
  :243).
- **Tests:** `PageHoldMarks.test.tsx` › "the hold mark's tooltip on the timeline's page boxes" (6);
  `pageHoldMarks.test.ts` › "words each mark…", "gives each mark a hint line…".
- **Real-app:** `wp10-tl.mjs`, `wp10-page.mjs`, `dc4-tl-silence-held.mjs` and
  `dc4-pm-silence-held.mjs` (8); screenshots `dc-summary3/8-*`.
- **V-row:** V-182.
- **Limits:** built on a stand-in (`HintTooltip`) before #115 landed; since the rebase onto it, the
  marks use #115's shared `ShortcutTooltip` (section 8).
- **Pre-merge review (U7):** kept pages read "Selected marchers are kept here" (`timeline.holdMarks.kept`) · "They stay here when earlier pages change" (`keptHint`).

#### B-30 Inspector line: "Hold from Page 2 →" / "Moves on this page"

![Inspector: Hold from the start](images/06-inspector-hold-from-start.png)

_As of wp10. "Hold from Page 1 →" is visible in the B-10 frame._

- **Mode:** TL only (renders nothing in PM).
- **After:** in the marcher inspector, under Step Size (single selection) and in the multi-select
  panel: for the selected page (which follows the paused playhead):
  - "Moves on this page" (plain text) when a move of each marcher's own ends in the page's box;
  - "Hold from Page {page}" or "Hold from the start" with an arrow, an underlined button; title
    "Go to Page {page}" / "Go to the start"; click seeks the playhead to that page's flag;
  - nothing on the first page, partway through a move passing the flag, off a flag, with no
    selection, or when the selection disagrees.
- **Strings:** `inspector.marcher.timeline.movesOnThisPage`, `holdFrom`, `holdFromStart`,
  `goToPage`, `goToStart`.
- **Code:** `components/inspector/TimelineHoldLine.tsx` (`useSelectionHoldState` :27);
  `timeline/timelineHoldState.ts` (`marcherHoldState` :36, `sharedHoldState` :61);
  `MarcherEditor.tsx` (:784, :1039).
- **Tests:** `TimelineHoldLine.test.tsx` (6); `timelineHoldState.test.ts` (7);
  `pageHoldMarks.test.ts` › "agrees with the inspector's marcherHoldState on every page".
- **Real-app:** `dc-tl.mjs` T6, `wp8-f3.mjs`, `ux-f3.mjs`, `wp10-tl.mjs` ("Hold from the start").
- **V-row:** V-147.
- **Limits:** the inspector doesn't follow playback (base); no PM equivalent.

### Focus, selection, keys

#### B-31 Undoing "add marcher" keeps the current page

- **Mode:** TL.
- **Before:** a marcher insert/delete in a change batch belonged to the first page, so undo/redo of
  an add jumped to page 1 (home).
- **After:** a marcher row inserted or deleted by the action belongs to the current page (first page
  when none); home-only changes still belong to the first page.
- **Code:** `db-functions/timelineHistoryFocus.ts` (`addedOrRemovedMarchers` :93/:129, `changedPages`
  :170/:215, `timelineHistoryFocus` :264).
- **Tests:** `timelineHistoryFocus.test.ts` › "a marcher add: undo and redo stay on the current page
  and select the new marcher".
- **Real-app:** `dc4-tl-marcher.mjs` (6: undo of an add keeps the current page).

#### B-32 A page selection waiting for its page expires after 2 s

- **Mode:** both.
- **Before:** `setSelectedPageFromId` for a page not in the list was dropped with a warning (unless
  the list was empty); a page restored by undo and selected before the list updated was never
  selected.
- **After:** the request waits for the page to appear; it lapses after 2 s (`PENDING_SELECTION_MS`)
  unless the list hasn't loaded yet (then no deadline). A later choice wins over a waiting one. The
  setter reads the latest page list (stable callback).
- **Code:** `context/SelectedPageContext.tsx` (:30, :32–:95).
- **Tests:** `SelectedPageContext.test.tsx` › "selects a page that isn't in the list yet once it is
  (an undo's restored page)", "a later choice wins…", "a waiting choice lapses if its page doesn't
  appear soon".
- **Real-app:** `dc-tl-flag.mjs` (page selection after undo of a delete; one flaky failure once,
  section 7).

#### B-33 The selection box refits after a render moves selected marchers

- **Mode:** both.
- **Before:** after a render that moved selected marchers (undo, Only Page 2, another page), the
  fabric `ActiveSelection` box stayed where the dots had been (study 08 bug 1).
- **After:** `fitActiveSelectionToMarchers` (`addWithUpdate`) after the three marcher-refresh paths,
  except during a drag/transform.
- **Code:** `global/classes/canvasObjects/OpenMarchCanvas.ts` (:1211, :1265, :1279, :1319).
- **Tests:** `activeSelectionFit.test.ts` (3).
- **Real-app:** `dc-page.mjs` check "(d) after Only Page 2: selection box contains every selected
  dot".
- **Pre-merge review (C1):** a refused or snapped-back timeline drop refreshes the marchers from `object:modified`, while Fabric still holds the transform; the fit now runs again right after the transform ends (a microtask, or the next mouse up for a drag still going) (`activeSelectionFit.test.ts` › "refits after a refused or snapped-back drop…", "refits after a drag still going…").

#### B-34 Ctrl+A and Ctrl+S no longer nudge (Ctrl/Cmd + W/A/S/D)

- **Mode:** both.
- **Before:** only Meta+WASD was excluded, so on Linux/Windows Ctrl+A (select all) and Ctrl+S also
  ran the A/S nudges: a marcher moved, and "No marchers selected" could appear.
- **After:** `(e.metaKey || e.ctrlKey) && code.includes("Key")` skips the WASD switch. Identical to
  upstream #1044's hunk.
- **Code:** `utilities/RegisteredActionsHandler.tsx` (:1566).
- **Tests:** `RegisteredActionsHandlerModes.test.tsx` › "Ctrl+A and Ctrl+S don't nudge the selection;
  A alone does".
- **Real-app:** `~/ux-sim/wp9/` base vs branch replays (`ux-replay.mjs`, screenshots).
- **V-row:** none.

#### B-35 Timeline write API renames (internal, visible through errors)

- **Mode:** TL.
- **After:** `moveMarchersOnPageMutationOptions` → `moveMarchersToNeighborPageMutationOptions`;
  `TimelineMoveRequest` → `TimelineNeighborPageRequest` (`{target, moves, clearOwn}`);
  `TimelineWritePage` removed; `marcherList`, `NarrowingFlag`, `narrowingLabel` removed from
  `timelinePassThrough.ts`; `joinNewMarchersToTimelinesInTransaction` renamed. Refusal messages for
  set to previous/next now come from the range writer (E-T5, E-ARGS for positions) instead of
  `moveMarchersOnPage`'s "no move ending on page N".
- **Tests:** `timelineToastPaths.test.ts`.
- **Limits:** any other branch calling the old names breaks at compile time (merge note).

### Keep later pages

Owner decision 2026-10-09 after `10-keep-later-pages-study.md` (decisions 10 and 11). Timeline mode
only; page mode keeps its runtime comparison and its own Only Page N (B-16).

#### B-38 Kept spots are stored (wp15)

- **Mode:** TL.
- **Before:** a "kept" page could only be an ordinary move that goes nowhere; nothing told it apart.
- **After:** a kept spot is the marcher's own one-slot shapeless move over a page box, plus a row in
  `timeline_kept_assignments` keyed by that assignment's id (cascade delete; history triggers; no
  change-log triggers; the display version follows it). **Keep** (`keepMarchersOnPage`) gives each
  marcher that follows on the box (no row over any of its beats) such a move, ending where it stands
  there, and marks it; **Follow again** (`followAgainOnPage`) deletes a kept move and its marker.
  One undo step each; nobody to change writes nothing and adds no step. Marchers already kept, with
  their own move there, or partway through a longer move are skipped and reported. Moving a kept
  spot's ending (a canvas drag on its page, the inspector's destination) makes it an ordinary own
  move in the same edit; a drag back never clears it; Move them too never offers it; the page deletes
  that take a page's moves take it with its marker. A marcher that never moved (no rows) follows
  the start and can be kept the same way (wp19: no change needed, a regression test added); its
  later first move then walks back to the kept spot.
- **States:** `KeptState` per marcher per box: `follows`, `kept`, `own`, `midMove`
  (`keptStatesForSelection`).
- **Code:** migration `0018_clean_sentinels.sql`, `schema.ts`, `repair.ts`; `db-functions/timelineKeepHere.ts`,
  `timelineKeptMarkers.ts`, `timelineMoves.ts` (`keptAssignmentsMovedBy`); `timeline/timelineKept.ts`.
- **Tests:** `timelineKeepHere.test.ts` (owner flow, skips, edits of a kept spot, page edits, history
  round trips; wp19: keep a never-moved marcher, and its history round trip), `timelineKept.test.ts`, `0018_clean_sentinels.test.ts`.
- **V-row:** V-185 … V-189 (the UI on top). ADR 0001 amendment 2026-10-09.
- **Pre-merge review (D2, U2):** the not-a-page refusal reads "Keep works on a whole page, not Page 3, counts 1–4"; `KeepResult` gains `markers: { added, removed }` (assignment ids).

#### B-39 Keep states for the selection (renderer)

- **Mode:** TL.
- **After (wp16):** the UI reads, per page box, which selected marchers **follow** into it and which
  were **kept** there, from the resolver's spans and the stored markers (`useKeptAssignmentsStore`,
  read again after every resolver or display version). Before its first move a marcher follows the
  start, and counts as following too (`fromStart`), so it can be kept ahead of any move (wp19, lead
  decision after the final study; wp16 left it out). The quiet "Pages 3–4 follow" line and the chains
  leave those marchers out (lead: every later page follows them); the inspector, the menu and K
  offer to keep them. Each box also names the page(s)
  they follow (`from`), for the words. **K**'s target is `keepToggle` (B-43).
- **Code:** `timeline/timelineKeepLater.ts` (`pageKeepStates`, `followingPages`,
  `marcherNamesText`, `pageChainWords`, `keepToggle`); `timeline/useKeepLaterPages.ts`
  (`useKeptAssignmentsHost`, mounted in `TimelineResolverHost.tsx`; `usePageKeepStates`,
  `useKeepToggle`, `useMarcherNameOf`); `timeline/timelineKeepCommands.ts` (`keepOnPage`,
  `followAgainOn`, `toggleKeepOnPage`: refusals are toasts).
- **Tests:** `timelineKeepLater.test.ts` (23).
- **Pre-merge review (U2, U4):** the keep commands update `useKeptAssignmentsStore` as they return (`applyKeptChange`), so states never read "own" before the re-read; `pageKeepStates` indexes each marcher's moves once (binary search), and `sharedPageKeepStates` computes it once per resolver version, kept markers, selection and pages for the panel, the inspector and K (`sharedPageKeepStates.test.ts`; `timelineKeepLater.test.ts` › "pageKeepStates at scale").

#### B-40 Chains on the page boxes

![Linked chain on page 3 with its tooltip](images/10-keep-chain-linked-tooltip.png)

_Linked, as of wp19 (the inspector shows B-41's "Pages 3–4 follow these marchers")._

![Kept chip on page 3 with its tooltip](images/11-kept-chip-and-inspector.png)

_Kept, as of wp19 (the inspector shows B-41's "Kept on this page · Follow again")._

![Mixed chain with a 2 badge and its tooltip](images/12-keep-chain-mixed-badge.png)

_Mixed, as of wp19._

- **Mode:** TL.
- **After:** with marchers selected, each page box they follow into shows a chain as a quiet
  outline; a box where they were kept a broken chain on a filled accent chip; a box with some of
  each a chain outlined in the accent with a filled kept count (wp19: the final study found the
  wp16 purple-vs-grey look too close). Marchers that haven't moved yet get no chain (lead, wp19: on every box it was noise), but a kept
  one still shows the kept chip; a mixed chain counts only the marchers that follow a move plus the
  kept ones. Nothing without
  a selection (owner). A 20 px button, 22 px in from the flag before its box
  (centered in a box narrower than 70 px), so the selected page's flag, the start flag and the
  playhead never cover it (the study's complaint); it stays on the selected box. A sibling of the
  box: a press never selects, scrubs or drags it; a right-click opens the box's menu (B-42).
- **Strings** (`timeline.keep.chain.*`), label · hint:

  | State   | Words                                                                                                                                                                 | Click                           |
  | ------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------- |
  | follows | "Keep OT1 and OT8 on Page 3" · "They won't follow Page 2 any more" (one: "It won't …"; several source pages or the start: "They won't follow earlier pages any more") | keeps those marchers            |
  | kept    | "OT1 and OT8 kept on Page 3" · "Click to follow Page 2 again" ("…earlier pages again")                                                                                | lets them follow again          |
  | mixed   | "2 of the 8 selected are kept on Page 3 (OT1, OT8)" · "Click to keep the other 6 too" ("…the other one too")                                                          | keeps the rest (_lead default_) |

  Names (wp19): up to three ("OT1, OT2 and OT3"), then "OT1, OT2 and 4 others"
  (`timeline.keep.names.*`); counts as before where a name isn't known. The chain K would toggle
  adds " (K)" to its tooltip label and `aria-keyshortcuts="K"`, only where K changes exactly the
  chain's marchers.

- **Code:** `components/timeline/PageKeepChain.tsx` (`usePageKeepChains` :71, `chainOffset` :106,
  `PageKeepChainButton` :130); `TimelinePrimitives.tsx` (`TimelinePageBox` :1093);
  `TimelineModePanel.tsx` (:168); `Timeline.tsx`, `TimelineVariants.tsx`, `TimelineViewModel.ts`
  (`keepChains` prop).
- **Tests:** `PageKeepChain.test.tsx` › "the chains on the page boxes" (8);
  `timelineKeepLater.test.ts` › "pageChainWords", "marcherNamesText".
- **Real-app:** `~/ux-study/wp16/run` (study flow, 37 steps), `~/ux-study/wp16/mixed` (mixed chain);
  wp19: `~/ux-study/wp19/a` (linked outline vs kept chip, step 14 crop), `~/ux-study/wp19/b`
  (mixed chip and named tooltip, step 13 crop).
- **V-row:** V-185.
- **Pre-merge review (U3, U8):** Enter and Space press the chain (`data-timeline-own-keys="with-space"`), not Create shape or Play; its accessible name is translated (`timeline.keep.chain.ariaLabel`).

#### B-41 Inspector: Keep here, Follow again, and the pages that follow

![Inspector: Hold from the start → · Keep here](images/14-keep-here-from-start.png)

_A never-moved marcher on page 3, as of wp19. Kept and following lines are in the B-40 frames._

- **Mode:** TL.
- **After:** the hold line (B-30) gains buttons, each a real button styled as the line's link, with
  a tooltip (`ShortcutTooltip` with `closeOnPress`):
  - a page they follow into: "Hold from Page 2 → · **Keep here**" (tooltip "Keep OT1 and OT8 on
    Page 3, so editing Page 2 won't move them here"); "Hold from the start → · **Keep here**" for
    marchers that never moved (wp19);
  - the "Hold from Page 2 →" link's tooltip (wp19, was a plain title "Go to Page 2"): "Go to Page 2,
    where these marchers last moved";
  - kept: "Kept on this page · **Follow again**" ("Let OT1 and OT8 follow Page 2 again, so editing
    Page 2 moves them here too");
  - mixed: "Some of these marchers are kept on this page" or "Some of these marchers hold here", with
    the buttons on a row of their own; tooltips name the marchers and count the selection ("Keep OT1
    (1 of the 2 selected) on Page 3, …"; without names "1 of the 2 selected");
  - names as on the chains (B-40); "these marchers" where a name isn't known; the button **K** would
    run adds " (K)" to its tooltip;
  - "These marchers hold here · Keep here" where they all follow but from different pages (B-30
    showed nothing there).
  - A quiet line under it on any page later pages follow from: "Pages 3–4 follow these marchers",
    "Page 4 follows these marchers", "… some of these marchers".
  - A move that goes nowhere without the marker still reads "Moves on this page".
- **Strings:** `inspector.marcher.timeline.*` (wp19: the keep and follow hints take `{who}`;
  `theseMarchers`, `namesOfSelected`, `countOfSelected` added; the four `*SomeHint*` keys gone;
  `goToPage` reworded).
- **Code:** `components/inspector/TimelineHoldLine.tsx` (`KeepButton`, `useSelectionKeepState`,
  `FollowingPagesLine`, `TimelineHoldLineContent`, `nameOf` prop); `MarcherEditor.tsx` passes the
  selection's names.
- **Tests:** `TimelineHoldLine.test.tsx` › "keep later pages (UI-18)" (8) and the updated
  multi-selection and hold-link cases.
- **Real-app:** `~/ux-study/wp19/d` step 22 (link tooltip), `~/ux-study/wp19/c` step 6 (Keep here
  for a never-moved marcher).
- **V-row:** V-186.
- **Pre-merge review (U3):** Enter and Space press Keep here, Follow again and the hold link (`OWN_KEYS_WITH_SPACE`).

#### B-42 Page box menu: Keep selected marchers here / Let selected marchers follow again

![Page box menu with Keep selected marchers here (K) and Let selected marchers follow again](images/13-page-box-menu-keep-K.png)

_As of wp19, with a mixed selection._

- **Mode:** TL.
- **After:** above the deletes, both entries show with a selection, each enabled by the selection's
  state on that box (some follow / some kept); neither without a selection. They act on the
  marchers in that state, one undo step each. The entry **K** would run from the current page shows
  a quiet "K" on its right (the transport popover's Ctrl+M style) and `aria-keyshortcuts` (wp19,
  _lead default_: only that entry, so the key never promises another page).
- **Code:** `TimelineRangeMenu.tsx` (`TimelineKeepHereMenu` :152, entries); `PageKeepChain.tsx`
  (`keepHereMenu` :34); `Timeline.tsx` (`keepHere` prop).
- **Real-app:** `~/ux-study/wp19/b` step 15.
- **Tests:** `PageKeepChain.test.tsx` › "the page box menu's keep entries" (6);
  `timelineKeepCommands.test.ts` › "the menu keeps the selected marchers that follow, and lets them
  follow again".
- **V-row:** V-187.
- **Pre-merge review (U8):** the entries (and Delete page and its moves) are translated: `timeline.rangeMenu.keepHere`, `.followAgain`, `.deleteWithMoves`.

#### B-43 K: keep where the marchers hold, or on the next page

- **Mode:** TL (does nothing in PM).
- **After (wp19; wp16 always used the next page, and the final study's Priya pressed K on a held
  page 3 and got page 4):** a registered action on **K** (free in both modes), from the selected
  page (the page box the playhead is in): where some selected marchers hold on it (follow, or kept
  there) it toggles keep there, for those; where they all move on it (or are mid-move) it toggles
  keep on the next page box (home: the first box). Toggling keeps the ones that follow, or, when
  none does, lets the kept ones follow again; with some of each it keeps the rest. Never-moved
  marchers count as holding (B-39), so K before any move keeps the current page. Reads the markers
  from the file, so two quick presses toggle. No toast. Not while playing; never from a text field.
  The chain, menu entry and inspector button K would run say so (B-40..B-42).
- **Strings:** `actions.timeline.toggleKeepOnPage` "Keep the selected marchers where they hold on
  this page (on the next page if they move here), or let them follow again".
- **Code:** `RegisteredActionsHandler.tsx` (enum, object, case `toggleKeepOnPage`);
  `timelineKeepCommands.ts:toggleKeepOnPage`; `timelineKeepLater.ts:keepToggle`.
- **Tests:** `KeepOnPageKey.test.tsx` (renamed; both modes: K calls the toggle only in TL, never
  from a field; K has no other action; the description); `timelineKeepCommands.test.ts` › K on the
  page they move, K on a held page (the study's T2), K with a mix, K before any move, "K does
  nothing…"; `timelineKeepLater.test.ts` › "keepToggle (K)" (5).
- **Real-app:** `~/ux-study/wp19/a` steps 11–14 (K on held page 3 keeps page 3; Kept on this
  page), `~/ux-study/wp19/c` steps 7–13 (K keeps a never-moved OT1 on page 3; its later page 2 move
  walks back there).
- **V-row:** V-188. #115's `?` shortcuts list shows it under Timeline, with the action's
  description as its label (`transportShortcuts.test.ts`).
- **Pre-merge review (U6):** a held K (key repeat) toggles once. The `?` list has no mode filter, so K stays listed in page mode (where it does nothing).

#### B-44 Timeline Only Page N after an edit

![Timeline toast: Pages 3–4 followed · Only Page 2](images/15-timeline-followed-toast-only-page.png)

_As of wp19._

- **Mode:** TL.
- **Before:** silent (B-25).
- **After:** after a range edit ending on a page flag that changed an **existing** own move of some
  marchers in its window (`ownMovers`, read before the write) and carried them into the next page
  box (they follow there), one surprise toast: "Pages 3–4 followed" ("Page 3 followed"), action
  **Only Page 2**. The action, as its own undo step, keeps those marchers on the next page box at
  their spots from before the edit (`keepMarchersOnPage` with `at`; the kept move walks back from
  the edited spot, and the chain shows it kept), so the later pages look as before. Rules:
  - a page's first move stays silent (no owned marchers);
  - kept marchers don't follow, so they don't count;
  - the pass-through toast wins, then **Move them too**; Only Page N shows only when neither does;
  - nudges in a row share one toast (`continueEditRun`, V-184), and the action goes back to the
    spots before the first nudge.
- **Strings:** `timeline.keep.followed.onePage` "Page {page} followed", `.pages` "Pages
  {first}–{last} followed", `.only` "Only Page {page}".
- **Code:** `timeline/timelineOnlyThisPage.ts` (`ownMovers` :56, `followedAfterEdit` :107,
  `offerOnlyThisPage` :258); `timelineMoveThemToo.ts:moveMarchersAndOfferFollowUp` (:305, :318);
  `db-functions/timelineKeepHere.ts:keepMarchersOnPage` (`at`, :105).
- **Tests:** `timelineKeepCommands.test.ts` › "keep later pages: Only Page N after an edit" (5:
  first move silent; study flow with one undo; nudge run; kept page silent; Move them too wins);
  `timelineKeepHere.test.ts` › "keep at given spots (Only Page N)" (2) and its history round trip;
  `timelineMoveThemToo.test.ts` (two "offers nothing" cases now expect this toast; pass-through
  precedence unchanged).
- **Real-app:** `~/ux-study/wp16/run` steps 30–35.
- **V-row:** V-189.
- **Limits:** windows that don't end on a flag, isolated moves and home edits never offer it.
- **Pre-merge review (U1, U2, U5):** see B-36 and B-39; Only Page N's keep updates the kept markers at once too.

#### B-45 Kept marchers on the field

![Chain icons beside OT1 and OT8 on page 3, nothing selected](images/16-kept-icon-on-field.png)

_wp20, current build._

![Tooltip: Kept on Page 3 · won't follow Page 2](images/17-kept-icon-tooltip.png)

_wp20, current build. Mock-ups D (chosen) and E (opacity, rejected) are in GLOSSARY.md §5._

- **Mode:** TL (nothing in PM).
- **Before:** a kept marcher looked like any other on the field; only the page box chain, the
  inspector and the menu said so, and only with it selected.
- **After (wp20; owner chose mock-up D over opacity, 2026-10-09):** on the selected page (the page
  box the playhead is in, as the inspector uses), each marcher **kept** there (a stored kept spot is
  its only move over the box, `keptMarchersOnPage`) gets a small broken chain beside its dot,
  whatever is selected: Phosphor `LinkSimpleBreak` bold in the light accent (the kept chip's
  symbol) on a small white rounded square with a faint edge, so it reads over yard lines. It sits
  just right of the dot, a little below its center, clear of the drill number; 12 field units on
  screen, held between 10 and 16 screen pixels (_lead default_). One canvas object
  (`TimelineKeptLayer`) for all marks, above the marchers, not selectable, taking no events; it
  reads the dots where they are each frame, so drags and redraws carry the marks without a
  rebuild, and hidden marchers get none (dimmed ones dim with them). Updates on keep, follow
  again, undo/redo and page change (the kept-marker store and the resolver version); disappears
  when the kept move is edited into an ordinary move (marker cleared). Hidden while playing, while
  a scrub is down, and while a move is isolated (its members are drawn at the move's plan;
  _lead default_). Hover on the mark or on its dot: after 500 ms a tooltip "Kept on Page 3 · won't
  follow Page 2" ("… won't follow earlier pages" for a keep ahead of any move); a press or leaving
  the canvas hides it. The canvas has no hover of its own, so the hook hit-tests the marks on the
  canvas's mouse moves, only while marks show.
- **Strings:** `timeline.keep.field.kept` "Kept on Page {page} · won't follow Page {from}",
  `timeline.keep.field.keptEarlier` "Kept on Page {page} · won't follow earlier pages".
- **Code:** `timeline/timelineKeepLater.ts` (`keptMarchersOnPage` :151, `keptMarkText` :186);
  `global/classes/canvasObjects/TimelineKeptLayer.ts` (`keptMarkBox` :50, layer :75, `markAt`
  :152); `OpenMarchCanvas.ts` (`renderTimelineKeptMarks` :2611, `clearTimelineKeptMarks` :2632,
  kept above raised marchers :1128); `timeline/useTimelineKeptMarks.ts` (`useKeptMarks` :32,
  `useTimelineKeptMarks` :69); `components/canvas/TimelineKeptMarks.tsx` (own component, so a
  hover or scrub doesn't re-render the canvas; tooltip in a portal, as the canvas container sets a
  perspective); `Canvas.tsx` (mounted once the resolver draws).
- **Tests:** `timelineKeepLater.test.ts` › "keptMarchersOnPage" (7: only the kept marchers on that
  page whatever is selected; none on pages 2, 4 or home; none without a page, an unknown page or
  kept spots; an edited move whose marker was cleared; a keep ahead of any move has no page;
  several in id order; the tooltip words); `TimelineKeptLayer.test.ts` (11: placement, size per
  zoom, one layer above the marchers and none without marks, stays above raised marchers, follows
  a moved dot, hit test on mark and dot, hidden and missing marchers, a backing per mark);
  `useTimelineKeptMarks.test.tsx` (5: marks with nothing selected; pages around; keep, follow again
  and undo through the store; hidden while playing, scrubbing, isolating and in page mode; cleared
  on unmount).
- **Real-app:** `~/ux-study/wp20/b` (named copies in `~/ux-study/wp20/`): step 12 icons on OT1 and
  OT8 only, page 3, nothing selected; step 14 tooltip; step 17 page 2 and step 19 page 4 no icons;
  steps 23/25 zoomed out to 218% and 182%, still 16 px; step 27 undo the keep, icons gone.
- **V-row:** V-191.
- **Limits:** very low zooms not looked at in the app (at 10 px minimum the mark outgrows the dot
  below about 100%); tooltips use the light accent on a white square in dark field themes too.

---

- **Pre-merge review (C2):** the layer is never culled offscreen (`isOnScreen()` is always true) and `refreshMarchers` raises it back above the marchers.

## 3. File map

Non-doc files changed (`git diff --stat 5888850a e1cd9ea2 -- apps`), one line each.

| File (under `apps/desktop/`)                          | What changed                                                                                                                                    | B-IDs                                   |
| ----------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------- |
| `electron/database/migrations/schema.ts`              | Comment only on `tag_appearances.start_page_id`                                                                                                 | B-13                                    |
| `i18n/en.json`                                        | 57 new keys (inspector timeline, marcherPages incl. `moveThemToo.withFollowed`, passThrough, holdMarks, delete menu); other locales not updated | B-08–B-10, B-16, B-22, B-24, B-29, B-30 |
| `src/components/inspector/MarcherEditor.tsx`          | Renders `TimelineHoldLine` under Step Size (two places)                                                                                         | B-30                                    |
| `src/components/inspector/TimelineHoldLine.tsx` (new) | Inspector hold/move line, link seeks the playhead                                                                                               | B-30                                    |
| `src/components/singletons/StateInitializer.tsx`      | TL: no selected page → page at playhead, not home                                                                                               | B-11                                    |
| `src/components/timeline/ShortcutTooltip.tsx` (#115)  | `closeOnPress`, `side`, no label no tooltip; provider's `disableHoverableContent` (replaced the stand-in `HintTooltip`)                         | B-29                                    |
| `src/components/timeline/PageHoldMark.tsx` (new)      | Mark drawing, tooltip wrapper, labeled marks hook                                                                                               | B-27–B-29                               |
| `src/components/timeline/PageTimeline.tsx`            | TL delete menu (In Place = flag delete, With Its Moves, Yank with report); PM hold marks and tooltips                                           | B-08, B-09, B-28, B-29                  |
| `src/components/timeline/Timeline.tsx`                | `onDeletePageWithMoves`, `holdMarks` props                                                                                                      | B-09, B-27                              |
| `src/components/timeline/TimelineModePanel.tsx`       | Hold marks, delete with moves + Undo, `selectionAfterDeleteWithMoves`                                                                           | B-09, B-10, B-27                        |
| `src/components/timeline/TimelinePrimitives.tsx`      | Page boxes draw marks, tooltips, `aria-describedby`                                                                                             | B-27, B-29                              |
| `src/components/timeline/TimelineRangeMenu.tsx`       | "Delete page flag" → "Delete page"; new "Delete page and its moves"                                                                             | B-08, B-09                              |
| `src/components/timeline/TimelineVariants.tsx`        | Passes `holdMarks`                                                                                                                              | B-27                                    |
| `src/components/timeline/TimelineViewModel.ts`        | `holdMarks` prop type                                                                                                                           | B-27                                    |
| `src/components/timeline/useTimelineCommands.ts`      | Delete move toast names changed pages                                                                                                           | B-12                                    |
| `src/components/ui/Toaster.tsx`                       | One-line action button; two-button toasts wrap the buttons onto their own row (`cancelButton`)                                                  | B-26                                    |
| `src/context/SelectedPageContext.tsx`                 | Pending page selection with 2 s expiry; latest-pages ref                                                                                        | B-32                                    |
| `src/db-functions/history.ts`                         | `rowIdFromSql` fix; earliest changed page focus                                                                                                 | B-20                                    |
| `src/db-functions/historyTriggers.ts`                 | `pathways` in history                                                                                                                           | B-19                                    |
| `src/db-functions/marcher.ts`                         | Calls `giveNewMarchersHomesInTransaction`                                                                                                       | B-02                                    |
| `src/db-functions/marcherPage.ts`                     | Carry-forward, no-op skip, pathway detach, `restoreCarriedRuns`, `moveLaterMovesToo`, `OwnMoveStop` (kept only where the write split the group) | B-14–B-18, B-22                         |
| `src/db-functions/page.ts`                            | No pathway copy on new page; tag move on delete; `deletePageYankInTransaction` extracted                                                        | B-09, B-13, B-18                        |
| `src/db-functions/pageDelete.ts` (new)                | Delete with moves / yank with report; changed-flag comparison; toast text; `changedPagesAround`                                                 | B-09, B-10, B-12                        |
| `src/db-functions/pageFlags.ts`                       | Flag delete moves tag appearances                                                                                                               | B-13                                    |
| `src/db-functions/tagAppearancePageDelete.ts` (new)   | Moves/drops tag appearances off deleted pages                                                                                                   | B-13                                    |
| `src/db-functions/timelineCommands.ts`                | `deleteTimelineAndCompare`                                                                                                                      | B-12                                    |
| `src/db-functions/timelineHistoryFocus.ts`            | Added/removed marchers belong to the current page                                                                                               | B-31                                    |
| `src/db-functions/timelineMarchers.ts`                | New marchers: home only                                                                                                                         | B-02                                    |
| `src/db-functions/timelineMoves.ts`                   | No-op skip, drag back/clearOwn, flags in pass-through, `NothingWritten`, `onStart`, `shiftSlotDestinations`                                     | B-03–B-05, B-23, B-24                   |
| `src/db-functions/timelineRipple.ts`                  | `addHoldingMoves` removed; `isPageMove` = entirely inside the box (merged boxes; window moves survive); next-row clamp                          | B-01, B-07                              |
| `src/global/classes/canvasObjects/MarcherShape.ts`    | New shape invalidates all marcher pages                                                                                                         | B-17                                    |
| `src/global/classes/canvasObjects/OpenMarchCanvas.ts` | `fitActiveSelectionToMarchers`                                                                                                                  | B-33                                    |
| `src/hooks/queries/sharedInvalidators.ts`             | `invalidateAfterMarcherPagesWrite`, `invalidateAllMarcherPages`                                                                                 | B-17, B-21                              |
| `src/hooks/queries/useMarcherPages.ts`                | Carry toast + invalidation; TL writes through `moveMarchersAndOfferFollowUp`; neighbor-page mutation                                            | B-05, B-16, B-21–B-23                   |
| `src/hooks/queries/usePageFlags.ts`                   | Delete-with-moves mutations + toast + Undo (closes on next history change); tag invalidation                                                    | B-09, B-10, B-13                        |
| `src/hooks/queries/usePages.ts`                       | Tag invalidation after deletes                                                                                                                  | B-13                                    |
| `src/hooks/queries/useShapePages.ts`                  | Invalidate all marcher pages after shape edits                                                                                                  | B-17                                    |
| `src/timeline/convert/planPageConversion.ts`          | Skip unchanged points                                                                                                                           | B-06                                    |
| `src/timeline/pageHoldMarks.ts` (new)                 | Per-marcher states (both modes), page classification, words                                                                                     | B-27–B-29                               |
| `src/timeline/timelineCarryForward.ts` (new)          | Carry-forward spans; `editedMarcherEnds` used by Move them too; summary functions unused in production                                          | B-23, B-25                              |
| `src/timeline/timelineCoordinateWrites.ts`            | `copyPagePositions.targets`, `neighborPageTarget`; edits via `moveMarchersAndOfferFollowUp`                                                     | B-05, B-23                              |
| `src/timeline/timelineHoldState.ts` (new)             | Inspector state per marcher / selection                                                                                                         | B-30                                    |
| `src/timeline/timelineMoveThemToo.ts` (new)           | TL Move them too: split-only trigger, pass-through wins, runs add up                                                                            | B-23, B-36                              |
| `src/timeline/timelinePassThrough.ts`                 | New wording, flags, Keep as a stop, window follows, fresh toast id                                                                              | B-24, B-37                              |
| `src/timeline/usePageHoldMarks.ts` (new)              | Hooks for TL and PM marks                                                                                                                       | B-27, B-28                              |
| `src/utilities/RegisteredActionsHandler.tsx`          | Ctrl+WASD fix; neighbor-page mutation                                                                                                           | B-05, B-34                              |
| `src/utilities/carryForwardToast.ts` (new)            | PM followed toast; combined split toast (Move them too + Only Page N); runs add up (`mergeCarriedRuns`)                                         | B-16, B-22, B-36                        |
| `src/utilities/moveThemToo.ts` (new)                  | Shared message and names; fresh surprise toast ids; edit runs (`editHistoryMark`, `editScope`, `continueEditRun`, `addShifts`)                  | B-22, B-23, B-36, B-37                  |
| `src/utilities/setMarchersToNeighborPage.ts`          | TL writes over the page box; previous clears own moves                                                                                          | B-05                                    |

Test files are in section 4.

Keep later pages (wp15 storage, wp16 UI), under `apps/desktop/`:

| File                                                                                                            | What changed                                                                          | B-IDs      |
| --------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- | ---------- |
| `electron/database/migrations/0018_*`, `schema.ts`, `repair.ts`                                                 | `timeline_kept_assignments` (wp15)                                                    | B-38       |
| `src/db-functions/timelineKeepHere.ts` (new, wp15)                                                              | Keep / Follow again / states; wp16: `at` spots for Only Page N                        | B-38, B-44 |
| `src/db-functions/timelineKeptMarkers.ts` (new, wp15)                                                           | Marker reads and writes                                                               | B-38       |
| `src/timeline/timelineKept.ts` (new, wp15)                                                                      | `KeptState`, `keptStatesForSelection`                                                 | B-38       |
| `src/timeline/timelineKeepLater.ts` (new)                                                                       | Per-box follows/kept for the selection, following pages, chain words, K's toggle      | B-39–B-43  |
| `src/timeline/useKeepLaterPages.ts` (new)                                                                       | Kept-marker store and its host; `usePageKeepStates`                                   | B-39       |
| `src/timeline/timelineKeepCommands.ts` (new)                                                                    | Keep / follow again with error toasts; `toggleKeepOnNextPage`                         | B-39, B-43 |
| `src/timeline/timelineOnlyThisPage.ts` (new)                                                                    | Timeline Only Page N toast                                                            | B-44       |
| `src/timeline/timelineMoveThemToo.ts`                                                                           | Offers Only Page N when there is no pass-through or Move them too                     | B-44       |
| `src/timeline/TimelineResolverHost.tsx`                                                                         | Mounts the kept-marker host                                                           | B-39       |
| `src/components/timeline/PageKeepChain.tsx` (new)                                                               | Chain button, chains hook, menu adapter                                               | B-40, B-42 |
| `src/components/timeline/TimelinePrimitives.tsx`                                                                | Page boxes draw their chain beside them                                               | B-40       |
| `src/components/timeline/Timeline.tsx`, `TimelineVariants.tsx`, `TimelineViewModel.ts`, `TimelineModePanel.tsx` | `keepChains`, `keepHere` props and wiring                                             | B-40, B-42 |
| `src/components/timeline/TimelineRangeMenu.tsx`                                                                 | Keep entries in the page box menu                                                     | B-42       |
| `src/components/inspector/TimelineHoldLine.tsx`                                                                 | Keep here / Follow again, mixed wordings, following-pages line                        | B-41       |
| `src/utilities/RegisteredActionsHandler.tsx`                                                                    | K                                                                                     | B-43       |
| `i18n/en.json`                                                                                                  | `inspector.marcher.timeline.*` (18), `timeline.keep.*` (15), `actions.timeline.*` (1) | B-40–B-44  |
| `src/global/classes/canvasObjects/TimelineKeptLayer.ts` (new, wp20)                                             | One layer of kept marks beside the dots; placement, hit test                          | B-45       |
| `src/global/classes/canvasObjects/OpenMarchCanvas.ts` (wp20)                                                    | `renderTimelineKeptMarks`, `clearTimelineKeptMarks`, kept above marchers              | B-45       |
| `src/timeline/useTimelineKeptMarks.ts` (new, wp20)                                                              | Marks for the selected page, hide rules, hover tooltip                                | B-45       |
| `src/components/canvas/TimelineKeptMarks.tsx` (new, wp20), `Canvas.tsx`                                         | Mounts the marks; tooltip                                                             | B-45       |
| `src/timeline/timelineKeepLater.ts`, `i18n/en.json` (wp20)                                                      | `keptMarchersOnPage`, `keptMarkText`; `timeline.keep.field.*` (2)                     | B-45       |

---

## 4. Test map

### How to run

From `apps/desktop`, with Node 24 on `PATH` (`node` is not on the default `PATH` of this box:
`export PATH=$HOME/.nvm/versions/node/v24.21.0/bin:$PATH`). Use the desktop's own vitest binary:

```bash
cd apps/desktop
FILES="<test files from the table>"
./node_modules/.bin/vitest run --silent=true $FILES                                   # normal
VITEST_TIMELINE_MODE=true ./node_modules/.bin/vitest run --silent=true $FILES         # fixtures converted, flag on
VITEST_ENABLE_HISTORY=true ./node_modules/.bin/vitest run --silent=true $FILES        # undo/redo checks (testWithHistory)
VITEST_ENABLE_HISTORY=true VITEST_TIMELINE_MODE=true ./node_modules/.bin/vitest run --silent=true $FILES
npx tsc --noEmit -p .
```

The package scripts are the same: `pnpm --dir apps/desktop run test:focused|test:timeline|test:history|test:timeline-history <file>`.

**Env trap ("Invalid Chai property").** When the root `node_modules/vitest` links a different
vitest than `apps/desktop/node_modules/vitest` (seen on 2026-10-09: root **3.2.3**, desktop
**4.1.2**), `@testing-library/jest-dom/vitest` resolves `vitest` from the root and extends the wrong
`expect`, so every DOM matcher (`toBeInTheDocument`, `toHaveAttribute`, …) fails with "Invalid Chai
property: …". It hit `PageHoldMarks.test.tsx` and `TimelineHoldLine.test.tsx`. Workaround: make the
root link match the desktop version (`pnpm install` at the repo root, or point `node_modules/vitest`
at the `vitest@4.1.2…` entry in `node_modules/.pnpm`). Check with
`ls -l node_modules/vitest apps/desktop/node_modules/vitest`. Later the same day the root link was
4.1.2 again and the jsdom files passed.

**Concurrent runs collide.** Two vitest runs in the same worktree share `apps/desktop/*.tmp.dots`
temp databases; a second run makes the first fail with "Expected DB file … to exist" or "Failed
query: … history_stats". Run one suite at a time per worktree.

**Known load-only timeouts.** In a full or large parallel run, `timelineRender`,
`timelineSelection`, `useTimelinePlaybackDriver`, `TimelineContainerMode` and `useTimelinePlayback`
can time out; they pass when run alone. They are not touched by this branch.

### Runs on 2026-10-09 (this catalog's author)

At `e1cd9ea2` (first catalog):

| Run                                               | Result                                                             |
| ------------------------------------------------- | ------------------------------------------------------------------ |
| 31 changed test files, normal                     | 407 / 417 passed; the 10 failures are the env trap (2 jsdom files) |
| Same, `VITEST_TIMELINE_MODE=true`                 | 408 / 417 passed; 9 failures, same env trap                        |
| 13 DB/history files, `VITEST_ENABLE_HISTORY=true` | 217 / 217 passed                                                   |
| Same 13, history + timeline mode                  | 217 / 217 passed                                                   |

At `2470207c` (this update):

| Run                                               | Result                                                                                                                                                                                                                       |
| ------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 38 changed test files, normal                     | 486 / 508 passed. All 22 failures (in `p910Adversarial`, `timelinePageCopy`) were temp-database errors caused by another agent's full vitest run in the same worktree at the same time; the jsdom files passed (no env trap) |
| Timeline mode, history, timeline + history, `tsc` | not completed by the author: the worktree was busy with that concurrent full-suite run for the whole session; rerun when it is idle                                                                                          |
| eslint, full `test:history`, e2e                  | not run by the author                                                                                                                                                                                                        |

Final runs by the lead at `2470207c` (worktree idle; root `node_modules/vitest` pointed at the
desktop's 4.1.2 for the runs and restored after):

| Run                                                                                     | Result                                                                                                                                                          |
| --------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npx tsc --noEmit -p .` (apps/desktop)                                                  | 0 errors                                                                                                                                                        |
| Full desktop suite, normal                                                              | 244 files passed, 2 failed (21 tests in `p910Adversarial`, `timelinePageCopy`): temp-database collisions with the concurrent run; both files pass alone (29/29) |
| Full desktop suite, `VITEST_TIMELINE_MODE=true`                                         | 3225 passed, 4 failed (`timelineE2eFuzz` seeds 1–3, `newShowCompletion` retry): load timeouts; both files pass alone (25 passed, 10 skipped)                    |
| All 29 changed DB / timeline / utility / query test files, `VITEST_ENABLE_HISTORY=true` | 412 / 412 passed                                                                                                                                                |
| Same 29, history + timeline mode                                                        | 412 / 412 passed                                                                                                                                                |

The wp12–wp14 work packages report their own runs (in their merge commits and the lead's notes); this
file does not repeat them as its own evidence.

The 13 history files of the first run: timelineNoAutoStays, timelineSparseWrites, pageDelete,
marcherPageCarryForward, timelineCarryForward, timelineHistoryFocus, timelineRipple, moveThemToo,
timelineMoveThemToo, pageFlagsAdversarial, timelineMarchers, timelineMembershipAdversarial,
RegisteredActionsHandlerModes. New history tests since: `pageDeleteGaps`, `marcherPageCarryForwardGaps`,
`timelineSparseGaps` (each has a `testWithHistory` block).

### Files

| Test file (under `apps/desktop/src/`)                              | New/changed    | Covers                           | Notes                                                                                    |
| ------------------------------------------------------------------ | -------------- | -------------------------------- | ---------------------------------------------------------------------------------------- |
| `db-functions/__test__/timelineNoAutoStays.test.ts`                | new            | B-01, B-02, B-06                 | Owner scenario per add path; converted copies                                            |
| `timeline/__test__/timelineSparseWrites.test.ts`                   | new            | B-03, B-04, B-05, B-24           | No-op writes, drag back, set to previous/next, pass-through flags                        |
| `db-functions/__test__/pageDelete.test.ts`                         | new            | B-07, B-08, B-09, B-10, B-13     | Flag delete, with moves, merged boxes, tags, history                                     |
| `db-functions/__test__/marcherPageCarryForward.test.ts`            | new            | B-14–B-20                        | Includes 200×100 timing (logged); history tests                                          |
| `timeline/__test__/timelineCarryForward.test.ts`                   | new            | B-24, B-25 (+ dead summary code) | Keep as a stop; window follows                                                           |
| `timeline/__test__/timelineMoveThemToo.test.ts`                    | new            | B-12, B-23, B-36                 |                                                                                          |
| `utilities/__test__/moveThemToo.test.ts`                           | new            | B-16, B-22, B-36                 |                                                                                          |
| `timeline/__test__/pageHoldMarks.test.ts`                          | new            | B-27, B-28, B-29 (words)         | Pure + one resolver test                                                                 |
| `components/timeline/__test__/PageHoldMarks.test.tsx`              | new            | B-27, B-28, B-29                 | jsdom: hit by the env trap                                                               |
| `components/inspector/__test__/TimelineHoldLine.test.tsx`          | new            | B-30                             | jsdom: hit by the env trap                                                               |
| `timeline/__test__/timelineHoldState.test.ts`                      | new            | B-30                             |                                                                                          |
| `hooks/queries/__test__/usePageFlags.deleteToast.test.ts`          | new            | B-10                             |                                                                                          |
| `global/classes/canvasObjects/__test__/activeSelectionFit.test.ts` | new            | B-33                             |                                                                                          |
| `components/ui/__test__/Toaster.test.tsx`                          | new            | B-26, B-37                       |                                                                                          |
| `context/__test__/SelectedPageContext.test.tsx`                    | changed (+3)   | B-32                             |                                                                                          |
| `utilities/__test__/RegisteredActionsHandlerModes.test.tsx`        | changed (+2)   | B-20, B-34                       |                                                                                          |
| `components/timeline/__test__/TimelinePageFlagControls.test.tsx`   | changed        | B-08, B-09                       |                                                                                          |
| `components/timeline/__test__/TimelineMoveMenu.test.tsx`           | changed        | B-08 (label)                     |                                                                                          |
| `db-functions/__test__/timelineRipple.test.ts`                     | changed        | B-01, B-07                       | Expectations flipped from holding moves to no rows                                       |
| `db-functions/__test__/timelineMarchers.test.ts`                   | changed        | B-02                             | Join tests replaced                                                                      |
| `db-functions/__test__/timelineMembershipAdversarial.test.ts`      | changed        | B-02                             |                                                                                          |
| `db-functions/__test__/timelineHistoryFocus.test.ts`               | changed        | B-31                             |                                                                                          |
| `db-functions/__test__/pageFlagsAdversarial.test.ts`               | changed        | B-13                             |                                                                                          |
| `db-functions/__test__/timelineMovesByTimeline.test.ts`            | changed        | B-24                             | Keep Page N as a stop tests (renamed in `65ac6298`)                                      |
| `hooks/queries/__test__/useMarchersTimelineMode.test.ts`           | changed        | B-02                             |                                                                                          |
| `timeline/__test__/planPageConversion.test.ts`                     | changed        | B-06                             |                                                                                          |
| `timeline/__test__/p910Adversarial.test.ts`                        | changed        | B-01, B-06                       |                                                                                          |
| `timeline/__test__/timelinePageCopy.test.ts`                       | changed        | B-05                             |                                                                                          |
| `timeline/__test__/timelinePassThrough.test.ts`                    | changed        | B-24                             | Message tests rewritten                                                                  |
| `timeline/__test__/timelineCoordinateWrites.test.ts`               | changed        | B-15                             | `toBeCloseTo` for PM align                                                               |
| `timeline/__test__/timelineToastPaths.test.ts`                     | changed        | B-35                             | Rename only                                                                              |
| `db-functions/__test__/pageDeleteGaps.test.ts`                     | new (wp13)     | B-07, B-10                       | Window moves survive delete-with-moves; toast Undo vs a later edit; history              |
| `hooks/queries/__test__/pageDeleteFollowUps.test.tsx`              | new (wp13)     | B-10, B-13                       | Tag/page refetch per delete path; toast closes on next edit                              |
| `components/singletons/__test__/StateInitializerDelete.test.tsx`   | new (wp13)     | B-11                             | Selected page deleted, both modes; full-app runs                                         |
| `db-functions/__test__/marcherPageCarryForwardGaps.test.ts`        | new (wp13)     | B-16, B-19                       | Only Page N chains; pathway triggers in older files; history                             |
| `utilities/__test__/setMarchersToNeighborPageCarry.test.tsx`       | new (wp13)     | B-05, B-14                       | Shift+P/N and Ctrl+Shift+P/N carry in PM                                                 |
| `components/launchpage/__test__/newShowCompletion.test.ts`         | changed (wp13) | B-14                             | New-show import carries                                                                  |
| `db-functions/__test__/timelineSparseGaps.test.ts`                 | new (wp13)     | B-03, B-24, #111                 | Flag drags and move resizes on sparse rows; B-03 caveat pinned; Keep as a stop undo/redo |

---

Keep later pages (wp16):

| Test file (under `apps/desktop/src/`)                             | New/changed  | Covers           | Notes                                             |
| ----------------------------------------------------------------- | ------------ | ---------------- | ------------------------------------------------- |
| `timeline/__test__/timelineKeepLater.test.ts`                     | new          | B-39–B-43 (pure) | 14                                                |
| `components/timeline/__test__/PageKeepChain.test.tsx`             | new          | B-40, B-42       | 10, jsdom                                         |
| `components/inspector/__test__/TimelineHoldLine.test.tsx`         | changed (+6) | B-41             | multi-selection case updated by design            |
| `timeline/__test__/timelineKeepCommands.test.ts`                  | new          | B-42–B-44        | 8, real database                                  |
| `utilities/__test__/KeepOnNextPageKey.test.tsx`                   | new          | B-43             | run in both modes                                 |
| `db-functions/__test__/timelineKeepHere.test.ts`                  | changed (+3) | B-38, B-44       | `at` spots; one history round trip                |
| `timeline/__test__/timelineMoveThemToo.test.ts`                   | changed      | B-44             | two "offers nothing" cases now expect Only Page N |
| `timeline/__test__/timelineKeepLater.test.ts`                     | changed (+7) | B-45 (pure)      | wp20                                              |
| `global/classes/canvasObjects/__test__/TimelineKeptLayer.test.ts` | new          | B-45             | 11, real fabric canvas (wp20)                     |
| `timeline/__test__/useTimelineKeptMarks.test.tsx`                 | new          | B-45             | 5, jsdom (wp20)                                   |

## 5. QA checklist

### Setup

- **Builds:** branch at `e1cd9ea2`; base `timeline-try-2` at `5888850a` for comparisons. The real-app
  harness is Docker + Xvfb (`~/om-capture`, see the `validate` skill); fixtures in
  `~/om-capture/fixtures/`.
- **Page-mode show:** a new blank show, or `ux-starter-page.dots` / `page-marchers-and-pages.dots`.
- **Timeline-mode show:** `timeline-blank.dots`, `ux-starter-timeline.dots`, or a page show converted
  (`OPENMARCH_CONVERT_ON_OPEN=1`). In timeline mode the bottom panel is the timeline with page boxes
  and flags; the page strip reappears only while editing beats.
- **Undo/redo for every edit:** after each step that edits, press Ctrl+Z once and confirm the whole
  edit reverts in one step (positions, rows, page selection), then Ctrl+Shift+Z and confirm it
  reapplies. "U/R" below means this check.
- Keys: Shift+P / Shift+N set selected to previous/next page; Ctrl+Shift+P / Ctrl+Shift+N set all.

### Timeline writes

| ID   | Steps                                                                                                                                                                                                                                                          | Expected                                                                                                                                                                                            |
| ---- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| B-01 | TL blank show. Move everyone on page 1. Add pages 2, 3, 4 with the **+** after the playhead (also repeat with Alt+T and with Split). Drag everyone on page 2. Visit flags 3 and 4.                                                                             | Pages 3–4 show page 2's new set. Base: page 1's set. U/R on the drag. Adding pages writes no timeline rows (DB: `timeline_transitions` count unchanged by the adds).                                |
| B-02 | TL show with pages 1–4. Add a marcher. Visit every page. Then move it on page 2 and visit 3–4.                                                                                                                                                                 | It stands at its home on every page; after the move it stays at the new spot on 3–4. U/R of the add keeps the current page (B-31).                                                                  |
| B-03 | TL: pages 1–4, page 1 moved. Select 3 marchers on page 3 (held) and align so one doesn't move; distribute. Then drag everyone on page 2.                                                                                                                       | Only marchers that moved on page 3 have rows there; the unmoved ones follow page 2. A drag that moves nobody (drop in place) adds no undo step.                                                     |
| B-04 | TL: on page 3 drag a marcher away, then back to exactly where page 3 starts (snap to grid). Edit page 2.                                                                                                                                                       | Page 3 follows page 2 again (its move was cleared). U/R restores the move. Repeat in a cross-page window: the zero-motion move is kept.                                                             |
| B-05 | TL: pages 1–4, page 1 moved, 2–4 held. On page 3 press Ctrl+Shift+N. Then on page 3 press Shift+P with a marcher selected, and edit page 2.                                                                                                                    | Next works (base: refused toast) and page 3 shows page 4's set. Previous clears page 3's move so page 3 follows the page-2 edit. U/R each.                                                          |
| B-06 | Convert a page show with copied pages (e.g. `page-marchers-and-pages.dots`). Compare every flag with page mode, then edit an early page.                                                                                                                       | Same positions at every flag as page mode; held pages have no rows; an edit carries through held pages.                                                                                             |
| B-07 | TL converted show: Delete page on page 2 (flag delete); then on the merged page choose Delete page and its moves. Ctrl+Z twice. Then, on a held show, Ctrl+drag a window from inside page 1 to page 2's flag, drag marchers, and delete page 2 with its moves. | No error toast; later flags keep their look; two undos restore the original. The window move survives the delete (it starts before page 2's box) and ends a page earlier if the page was inside it. |

### Delete

| ID   | Steps                                                                                                                            | Expected                                                                                                                                                                                                                                                         |
| ---- | -------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| B-08 | TL: marchers 3–5 move on page 2, hold on 3–4. Right-click page 2's box.                                                          | Menu: **Delete page**, **Delete page and its moves** (both red). Delete page: flags 3–4 look the same; page 3 takes page 2's box. U/R. Also via beat editing's page strip **In Place** (tooltip "Delete this page. Later pages keep their timing and look.").    |
| B-09 | Same show: **Delete page and its moves** on page 2, first with page 2 selected, then with another page selected.                 | Page 2's move goes; held pages fall back; selection: the merged box if page 2 was selected, else unchanged. U/R. Beat-editing strip: **With Its Moves** and **Yank** give the same toast.                                                                        |
| B-10 | After B-09. Then delete again, make any other edit, and click the toast's Undo if still visible.                                 | Toast "Deleted Page 2 · Page 1 is now N counts · old Pages 3–4 changed" with **Undo**; Undo restores page, move and later look in one step. On a page nobody moved: "… · No other page changed". The toast closes as soon as another edit, undo or redo happens. |
| B-11 | TL: select page 2's box, delete it (Delete page, then separately Delete page and its moves). PM: select page 2, In Place.        | The view stays on the merged page (no jump to home / beat 0); Undo restores. Scripted in `dc4-tl-delete.mjs`, `dc4-pm-delete.mjs`.                                                                                                                               |
| B-12 | TL: make a move (window) that later held pages rely on; right-click its clip → Delete move.                                      | "Deleted Move N · Pages X–Y changed" + Undo; with no page affected just "Deleted Move N". Undo restores.                                                                                                                                                         |
| B-13 | Both modes: add a tag with an appearance starting on page 3; delete page 3 (PM: In Place and Yank; TL: Delete page, with moves). | The appearance now starts on the next page (later pages keep the tag look). If the next page already has one for that tag, the deleted one is dropped. Last page: dropped. U/R restores it.                                                                      |

### Page mode

| ID   | Steps                                                                                                                                                    | Expected                                                                                                                                                                                                                                                                                                  |
| ---- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| B-14 | PM blank show: add pages 2–4 (copies). Drag everyone on page 2. Visit 3 and 4; play through page 3. Then set page 4 to a new spot and edit page 2 again. | Pages 3–4 follow (playback holds on page 3). Second edit: page 3 follows, page 4 keeps its own spot. U/R restores all rows in one step. Also try: nudge, align, swap two marchers, Shift+P: each carries.                                                                                                 |
| B-15 | PM: click a marcher without moving it; nudge right then left back.                                                                                       | The click adds no undo step; nothing on later pages changes.                                                                                                                                                                                                                                              |
| B-16 | After B-14's first drag; then nudge page 2 twice (same selection) and click Only Page 2.                                                                 | Toast "Pages 3–4 followed (they were copies)" with **Only Page 2** (one button beside the text). Only Page 2 after two nudges puts 3–4 back to before the **first** nudge; Ctrl+Z makes them follow again; further Ctrl+Z undoes the nudges one at a time. Edits on two pages: **Only the edited pages**. |
| B-17 | PM: make a line shape on page 2 with copies on 3–4 (not in shapes); edit the shape.                                                                      | Pages 3–4 follow; no toast. U/R.                                                                                                                                                                                                                                                                          |
| B-18 | PM: give page 2 a curved pathway, add page 3. Play page 3; edit page 3; edit page 2.                                                                     | Page 3 holds (no replayed curve); editing page 3 doesn't bend page 2's curve.                                                                                                                                                                                                                             |
| B-19 | PM: edit page 2 when page 3 has its own pathway; Ctrl+Z.                                                                                                 | Page 3's curve start moves with the edit and comes back on undo.                                                                                                                                                                                                                                          |
| B-20 | PM: edit page 2 (with copies 3–4), go to page 5, Ctrl+Z; Ctrl+Shift+Z.                                                                                   | Undo jumps to page 2 and selects the changed marchers (base: stayed on page 5).                                                                                                                                                                                                                           |
| B-21 | PM: after B-14, without reloading, visit 3–4 and check the canvas and coordinate sheet panel.                                                            | Followed pages show new positions immediately.                                                                                                                                                                                                                                                            |

### Move them too

| ID   | Steps                                                                                                                                                                                                                                                 | Expected                                                                                                                                                                                                                                                                                                                                           |
| ---- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| B-22 | PM: 8 marchers in a line; page 2 everyone forward; page 3 only OT1 and OT8 step out; page 4 copy of 3. Shorten the page-2 move (select all, nudge back twice). Also: a fully written show (`page-marchers-and-pages.dots`), drag and nudge on page 2. | Study show: one toast "Pages 3–4 followed (they were copies). OT1 and OT8 have their own move on Page 3, so they kept their spot" with **Only Page 2** and **Move them too** on their own row under the text. Move them too: OT1/OT8 shift by both nudges on page 3, page 4 follows; Ctrl+Z reverts only the shift. Written show: no toast at all. |
| B-23 | Same study show in TL (`ux-starter-timeline.dots`): shorten page 2 with two nudges. Then a fully written converted show: drag and nudge on page 2. Then a window across a flag whose edit also splits the group.                                      | Study: "OT1 and OT8 have their own move on Page 3, so they kept their spot" + **Move them too** (one button); it shifts by both nudges; one Ctrl+Z reverts the shift only. Written show: no toast. Window: only "Page N is no longer a stop" with Keep as a stop (no Move them too).                                                               |

### Toasts

| ID   | Steps                                                                                                                                                                                                   | Expected                                                                                                                                                                                                                                    |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| B-24 | TL: pages 1–5, only page 1 moved. Ctrl+drag a window from inside page 3 to the end of page 4; drag all marchers.                                                                                        | One toast "Page 4 is no longer a stop" (two flags: "Pages 3–4 are no longer stops") with **Keep Page 4 as a stop**; click: flag shows its earlier set again and the window moves to the last part. U/R. A window inside one page: no toast. |
| B-25 | TL and PM: ordinary drags and arrow nudges on a fully held show (TL) and a fully written show (both modes).                                                                                             | TL held: no toast. Written (both modes): no toast. PM held: only "Pages … followed".                                                                                                                                                        |
| B-26 | A one-button toast (PM followed) and the two-button combined toast (B-22), at the default and a narrow window width.                                                                                    | One button: stays on one line beside the text. Two buttons: text on top, both buttons on one row underneath, right-aligned, labels on one line; keyboard focus shows a ring.                                                                |
| B-36 | PM study show: nudge page 2 twice with all selected, then Move them too. Repeat with: nudge, Ctrl+Z, nudge; nudge, nudge on a smaller selection; nudge, wait for the toast to close, nudge. Same in TL. | Two nudges in a row: the action covers both. Any undo in between, a different selection, another edit, or the toast closing: the action covers only the last nudge.                                                                         |
| B-37 | PM: trigger a combined two-button toast (B-22), then right after an edit that gives only "Pages … followed".                                                                                            | The second toast replaces the first and shows one button and no info icon (nothing left over from the earlier toast).                                                                                                                       |

### Hold marks and inspector

| ID   | Steps                                                                                                                   | Expected                                                                                                                                                                                                  |
| ---- | ----------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| B-27 | TL: page 1 moves everyone; marchers 3–5 move on page 2. Select 3–5; then 5+6; then nothing; then compact mode.          | 3–5: diamond on page 2, bars on 3–4. 5+6: dashed bar where one moves and one holds. Nothing selected: no marks. Marks never block clicks, scrubs or the playhead.                                         |
| B-28 | PM: pages 0–4 copies; select all on page 2 and drag.                                                                    | Page 2 diamond, pages 3–4 bars; before the drag, bars from the start.                                                                                                                                     |
| B-29 | Hover a marked box ~0.5 s; Tab to a box; press on a box; right-click; start a scrub on a box.                           | Tooltip with label + hint (table in B-29) on hover and focus; a press closes it and still selects; no tooltip on right-click or mid-scrub; none without a selection. Screen reader reads the description. |
| B-30 | TL: select a held marcher on page 4; click the line. Then page 2 (moves). Then a mixed selection. Then page 1; then PM. | "Hold from Page 2 →" (link; click seeks to page 2's flag); "Moves on this page"; nothing for mixed, page 1, and in PM. Never-moved marcher: "Hold from the start".                                        |

### Focus, selection, keys

| ID   | Steps                                                                        | Expected                                                                                  |
| ---- | ---------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| B-31 | TL: go to page 3, add a marcher, Ctrl+Z, Ctrl+Shift+Z.                       | Stays on page 3 both times; redo selects the new marcher.                                 |
| B-32 | TL: delete a page with moves while it is selected, then Undo from the toast. | The restored page becomes selected once it appears; nothing selects it later by surprise. |
| B-33 | PM: select all on page 2, drag; Only Page 2; Ctrl+Z; go to another page.     | The selection box always surrounds the dots (no empty box left behind).                   |
| B-34 | Linux/Windows: select a marcher, Ctrl+A, Ctrl+S; then A alone.               | Ctrl+A selects all, nothing moves, no "No marchers selected"; A alone nudges.             |
| B-35 | TL: a refused set to previous/next (e.g. follow-the-leader into a shape).    | A friendly refusal toast; nothing written.                                                |

### Keep later pages (TL)

Start from `ux-starter-timeline.dots`: press E (page 2), Ctrl+A, drag the band forward; Esc; select
OT1 and OT8.

| ID   | Steps                                                                                                                            | Expected                                                                                                                                                                                            |
| ---- | -------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| B-40 | Hover the chain on page 3; click it; select the whole band; hover page 3's chain; deselect.                                      | "Keep 2 marchers on Page 3 · They won't follow Page 2 any more"; after the click a filled broken chain; whole band: "2 of 8 kept" with a 2 badge; none. U/R.                                        |
| B-40 | Select page 3 (Q/E or the box), check the chain; press on the chain and drag sideways.                                           | The chain stays visible beside the start flag; the box isn't selected, scrubbed or dragged.                                                                                                         |
| B-41 | Page 3 with OT1/OT8 following: Keep here; then Follow again; page 2: read the quiet line.                                        | Tooltips as in B-41; "Kept on this page · Follow again" after keeping; "Pages 3–4 follow these marchers" on page 2 while they follow. U/R.                                                          |
| B-42 | Right-click page 3 and page 4 before and after keeping; with nothing selected.                                                   | Entries enabled by state; none without a selection.                                                                                                                                                 |
| B-43 | Page 2 selected: K; look at page 3; K again; type K in a text field.                                                             | Kept, then following again, no toast; typing does nothing to the show.                                                                                                                              |
| B-44 | Keep nothing; drag OT1 (with OT8) on page 2; press Only Page 2; go to page 3; Ctrl+Z.                                            | "Pages 3–4 followed · Only Page 2"; pages 3–4 back at the old spots, page 3 shows kept; one undo takes back only Only Page 2. A first move on a page: no toast.                                     |
| B-45 | Move all on page 2; keep OT1/OT8 on page 3 (K); click empty field; view pages 3, 2, 4; hover OT1's mark; zoom out; play; Ctrl+Z. | Page 3: small broken chains right of OT1 and OT8 only; pages 2 and 4: none; tooltip "Kept on Page 3 · won't follow Page 2"; still small zoomed out; gone while playing; gone after undo. PM: never. |

---

## 6. Data and compatibility

- **No schema, user-version or file-format change; no migration** before keep later pages. Since
  wp15, migration 0018 creates `timeline_kept_assignments` (user version stays 8, unreleased); files
  from earlier development builds get the empty table when they open. A build without 0018 shows a
  kept spot as an ordinary move that goes nowhere (B-38, ADR 0001 amendment 2026-10-09).
- **Page-mode files (user version 7, released):** read unchanged. Behavior changes start on the next
  edit (carry-forward). Pages already left stale by the old app stay stale; the fix is a manual
  Shift+P or re-edit (README finding 7). Rows that share a pathway with the previous page (copied by
  the old add-page) are detached the first time they are edited (B-18).
- **Undo triggers:** the first time a file is opened by this build, history triggers are created for
  `pathways` (B-19). An older build opening that file afterwards keeps them; its history code
  replays them generically. Not tested against an older build.
- **Timeline files made by earlier dev builds (user version 8, unreleased):** keep their holding
  moves, new-marcher stays and converter copies. Those rows are now read as **designer intent**
  (zero-motion moves = blocks), so the owner's bug persists in them. Per ADR 0001's amendment they
  are **converted again by hand**, as for C-11: open the page-mode original and convert with this
  build. `isPageMove` matches the old holding moves (over exactly a page box, layer 0), so Delete page
  and its moves removes them with the page.
- **Converter output:** fewer rows (no slot for unchanged positions; no timeline for a page nobody
  moves on; not a loss). Positions at every flag are bit-identical to before (exact comparison).
- **What older builds see** in a file edited by this build:
  - TL: sparse rows are valid for older dev builds (they already resolved "no move = hold"), but an
    older build's page add would write holding moves again.
  - PM: carried rows are ordinary rows; nothing to read differently.
  - Tag appearances moved to another page are ordinary rows.

---

## 7. Coverage gaps

What is still unchecked, and what the first catalog listed that is now closed (with the evidence).
This list should drive the next testing pass.

### Closed since the first catalog (wp12–wp14, real-app round 4)

| #   | Gap (first catalog)                                               | Closed by                                                                                                                                                                                    |
| --- | ----------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Move them too on ordinary edits; hiding Keep as a stop            | wp12 code change (split-only trigger; pass-through wins). Tests: "fully written / fully held" and "window … only the pass-through toast" cases. Real app: `dc4-*-silence-*`, `dc4-tl-window` |
| 2   | Move them too in the real app: screenshots only                   | `dc4-pm-study-move` (9/9), `dc4-pm-study-only` (7/7), `dc4-tl-study`, `wp14-pm`, `wp14-tl`, `wp14-pm-only`; V-181, V-184 rows                                                                |
| 3   | Delete with the deleted page selected; StateInitializer test      | `StateInitializerDelete.test.tsx` (6); `dc4-tl-delete`, `dc4-pm-delete`                                                                                                                      |
| 4   | Delete move's changed pages, real app                             | `dc4-tl-delete` (5); V-183                                                                                                                                                                   |
| 5   | Window move ending at a deleted page's flag was deleted           | wp13 code change (`566254e8`, `isPageMove` entirely inside the box) and `pageDeleteGaps.test.ts` (7)                                                                                         |
| 6   | PM carry from Shift+P/N and the new-show import                   | `setMarchersToNeighborPageCarry.test.tsx` (4), `newShowCompletion.test.ts` (1)                                                                                                               |
| 7   | Chained follow-ups (Only Page N / Move them too after more steps) | `marcherPageCarryForwardGaps.test.ts` "gap 7"; `timelineSparseGaps.test.ts` "gap 7: Keep as a stop…"; the run tests in `moveThemToo.test.ts` and `timelineMoveThemToo.test.ts`               |
| 8   | Delete toast Undo after another edit                              | wp13 code change (`ece0dfbe`, closes on next history change); `pageDeleteFollowUps.test.tsx`, `pageDeleteGaps.test.ts`                                                                       |
| 9   | Tag UI refresh after a delete                                     | `pageDeleteFollowUps.test.tsx` (per delete path + control)                                                                                                                                   |
| 10  | New marchers, undo focus for an add, drag back: real app          | `dc4-tl-marcher` (6, 7)                                                                                                                                                                      |
| 13  | #111 flag drags on sparse rows                                    | `timelineSparseGaps.test.ts` (6 flag-drag/resize tests)                                                                                                                                      |
| 14  | Pathway triggers in older files                                   | `marcherPageCarryForwardGaps.test.ts` (undo without triggers; triggers created on open). An actual older **build** opening the file is still untested                                        |
| —   | Rounds 1–3 "no toast" checks                                      | Unreliable (a hidden, reused toast node); superseded by round 4 (`~/om-capture/runs/*dc4-*`, 56/56 assertions pass per the lead; screenshots `runs/dc-summary3`)                             |

### Still open

1. **B-03 caveat:** isolated-move (`{kind:"timeline"}`) and home writes to an unchanged position
   still write and open an undo step. Pinned as current behavior by `timelineSparseGaps.test.ts`; not
   decided whether to change.
2. **i18n:** "Delete page", "Delete page and its moves", the delete-with-moves toast and the
   Delete move toast are hard-coded English; the name lists in Move them too use English "and"; the
   es/fr/ja/pt-BR files have none of the 57 new keys (they show the English defaults).
3. **Hold-mark performance at 100+ pages:** page mode loads every page's rows while something is
   selected (B-28); timeline marks recompute per resolver version. Not measured.
4. **Toast transitions:** replacing one surprise toast with the next (B-37) and the two-button
   wrap (B-26) were checked by DOM measurement and stills; no video review of the transition.
5. **The page boxes' `ShortcutTooltip`s inside other overlays** (fullscreen, compact, during playback) beyond the scripted
   cases.
6. **An older build** opening a file this build touched (pathway triggers, sparse timeline rows):
   reasoning only.
7. **Runs that add up (B-36)** across mode switches or after a file reload: not tested (the run is
   module state and should reset; not checked).
8. **Partial-follow wording:** no "6 of 8 followed" count (09 rec. 2, not built).
9. **Keep later pages (B-38 … B-45):** one two-user check ran on the wp16 build (Marcus, Priya;
   it led to wp19 and wp20), none on the wp19/wp20 build (V-185 … V-191); chains
   at 100+ pages and large selections not measured (one span pass per marcher per resolver
   version); the new strings exist only in `en.json`; chains in compact mode and on very narrow
   boxes checked by unit test only.

### Checks never run

- The full `test:history` and `test:timeline-history` suites (only the changed files, section 4).
- The Playwright e2e suite and the browser harness.
- Coordinate sheet and PDF export, and the "Hold" wording on coordinate sheets (deferred).
- Live playback value comparison in timeline mode (paused seeks only, T7).
- Convert on open through the app's dialog (each build's own converter was used).
- eslint and `tsc` at `2470207c` by the author of this file.

---

## 8. Merge notes and doc discrepancies

### Interplay with other work

- **#106 (edit moves, UI-14):** already merged into the base. This branch extends its Delete move
  toast (B-12, V-183) and keeps both page box menu sets. Under the sparse model, deleting a move makes
  later held pages fall back, hence the changed-pages text. Both delete toasts now close on the next
  history change.
- **#111 (timeline edges: drag a page flag, resize a move) and #113:** merged into the base via
  `97c8626b`; no code conflict left. Flag drags and move resizes on sparse rows are now tested
  (`timelineSparseGaps.test.ts`).
- **Transport keys (UI-17, #115):** merged into the base by the 2026-10-09 rebase. The stand-in
  `HintTooltip.tsx` is gone: the hold marks, keep chains and the inspector's hold line use #115's
  `ShortcutTooltip`, which gained `side`, `closeOnPress` (a press closes it until the pointer
  leaves) and "no label, no tooltip"; their provider is `TransportTooltipProvider` with
  `disableHoverableContent`. **K** is a registered action, so #115's `?` shortcuts list shows it
  under Timeline. Conflicts kept both sides: #115's Shift+click to extend on page boxes, with the
  hold marks and chains.
- **Upstream OpenMarch #1044** (merged upstream): contains the identical Ctrl/Cmd+WASD hunk (B-34).
  Merging main should apply cleanly or as a no-op; keep one copy.
- **Global `Toaster` (B-26):** the two-button layout applies to any toast with a `cancel` button
  anywhere in the app; other branches adding such toasts get it too.
- **Renamed exports (B-35):** any open branch calling `moveMarchersOnPageMutationOptions`,
  `joinNewMarchersToTimelinesInTransaction`, `marcherList`, `narrowingLabel` or the removed
  `EDIT_SURPRISE_TOAST_ID` must be updated (`editSurpriseToastId()` replaces the constant).
- **UI numbering:** this feature is **UI-18**. UI-15 and UI-16 belong to timeline edges (#111),
  UI-17 to transport keys. VALIDATION rows are V-140..V-149 and V-181..V-191
  (V-150..V-160 until the 2026-10-09 rebase onto #115, which took V-150..V-180; commit messages
  from before it use the old numbers).

### Pre-merge review fixes

Three independent reviews (canvas, UI, database) of PR #112 on 2026-10-09; no blockers. Fixed:

| Id  | Fix                                                                                                   | B-entry          |
| --- | ----------------------------------------------------------------------------------------------------- | ---------------- |
| D1  | Move them too (`shiftSlotDestinations`) clears the kept markers of the slots it moves                 | B-23             |
| D2  | The keep refusal names pages and counts, not beats                                                    | B-38             |
| D3  | The carry-forward timing test logs only with `OM_REPORT_TIMING=1`                                     | —                |
| U1  | A run's toast closing ends the run (forget by toast id); the next nudge shows a toast                 | B-36, B-44       |
| U2  | Keep / Follow again update the renderer's kept markers as they return: no "own" flicker               | B-39, B-44       |
| U3  | Enter and Space press the chain and the inspector's Keep here, Follow again and hold link             | B-40, B-41       |
| U4  | Keep states computed once per change, shared, with each marcher's moves indexed                       | B-39             |
| U5  | An older edit's late check (`stale`) shows no toast                                                   | B-36             |
| U6  | Held K (key repeat) toggles once; K stays in the `?` list in page mode (the list has no mode filter)  | B-43             |
| U7  | A kept page shows the hold bar, "Selected marchers are kept here" (lead default)                      | B-27, B-29       |
| U8  | Keep menu entries, Delete page and its moves, the chain's name and the Delete-move toast translated   | B-12, B-40, B-42 |
| C1  | The selection box refits after a refused or snapped-back drop                                         | B-33             |
| C2  | Kept marks never culled offscreen; raised above marchers after `refreshMarchers`                      | B-45             |
| C3  | "Page not found yet" logs at debug; `SelectedPageContext.test.tsx` restores its mocks after each test | —                |

Left as they are: `timelineRangeWords` fragments ("Page 2, counts 1–4") are English, shared by the
write path's refusals and the renderer's toasts; translating them needs a translate function in
`db-functions`, a separate change. Not addressed (not in the fix list): the reviewers' notes on
`pagesText`, the page box memo, and the test-only quadratic fallback.

### Doc vs code discrepancies

Resolved since the first catalog (lead's `5b2c5c6c`, wp12–wp14):

- README "Built" table now lists wp7–wp14 (wp12–wp14 rows added with this update); Recommendation 5 is marked historical; Only Page N wording
  fixed.
- ui.md UI-18 now covers Move them too (split-only), Delete move's changed pages, "Hold from the
  start" and the hold-mark tooltips; V-181 (Move them too), V-182 (tooltips), V-183 (Delete move)
  added; V-184 (runs add up, two-button layout) added with this update.
- ui.md UI-18 says "a range write … writes nothing", matching B-03.
- ADR 0001: "deletes its flag only by default; 'Delete page and its moves' and Yank still remove the
  page's own moves".
- Test names: "Start from Page N" → "Keep Page N as a stop" (`65ac6298`).
- "Ordinary edits silent" (V-146) now holds in code (B-25), verified by dc4.

Still open:

| Doc              | Says                                                           | Code at `2470207c`                                                                                       |
| ---------------- | -------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| ui.md UI-18      | Silent on runs of edits adding up and on the two-button layout | Built (B-26, B-36); recorded only in V-184 and here                                                      |
| VALIDATION V-149 | "removes only layer-0 page moves in the box"                   | Matches; additionally a window move starting before the box is kept even when it ends at the flag (wp13) |
| PR #112 body     | Rewritten with this update to match the branch                 | —                                                                                                        |

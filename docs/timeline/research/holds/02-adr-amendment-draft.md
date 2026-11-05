<!-- cspell:disable -->

# Draft: ADR 0012 amendment for holds

Not applied yet. This is the text proposed for `docs/adr/0012-timeline-motion-model.md` §2, after
the 2026-10-16 amendments. The owner reviewed it on 2026-10-27. An independent validator found it
"ready with edits" on 2026-10-28; its fixes and the owner's answers of 2026-10-28 are folded in
below. It lands in two parts, with the tickets named in each heading (fork issues #466–#479).

---

**Amendment (2026-10-28, project owner): keyframes are stored move ends; "Set", "Held" and "Not
set"; kept spots are removed.** _(Part 1: tickets #466, #467, #468, #469.)_

- **Words.** On a given count, a marcher is in one of three states. These are the UI's words;
  "Following" survives only as an internal name for Not set.
  - **Set:** a keyframe, where one of its own moves ends.
  - **Held:** a stored hold, defined in part 2.
  - **Not set:** nothing decided. The marcher shows the last set spot and moves with edits to it.

  The UI drops "linked", "follows" and the follow-link chain icons. The dashed Not-set bars show
  the same thing, and they light up during a drag.

- **A keyframe is the end of one of the marcher's own moves, where that move is in charge as it
  ends** (spec §6.2), whether or not the marcher moved. A span cut short by a higher layer is not
  one (§4, `SpanInfo.assignmentEnd`). This replaces the motion test of fork #332: a stored move that
  goes nowhere is designer intent (amendment 2026-10-08), so it shows a keyframe and can be removed.
- **Kept spots are removed,** reversing the 2026-10-09 amendment. `timeline_kept_assignments` is
  dropped, together with Keep, K, the kept chip and field icon, and Follow again.
  - **Set as shown** replaces them. It's in the page box menu and on the Not-set bar. It writes an
    ordinary one-slot move over the page box, ending at the spot the marcher shows there, so the
    page becomes Set.
  - Remove keyframe's next-page moves and the after-edit "only this page" write the same kind of
    ordinary move.
  - In the 2026-10-16 amendment's list of writers of a page's move, **Set as shown replaces "kept
    spots".**
- **Clear this page** is Set to previous page in timeline mode, renamed. It leaves the page with no
  move of the marcher's own, so the page is Not set. Re-linking a page is this command; there is no
  separate control.
  - For a marcher in a shared or longer move, the move is first **cut in time at the page's
    flags**. This may create a timeline over exactly the page box, which is allowed in the same way
    as a split by marcher (`allowSharedRanges`). The other members keep their stored layers, since
    layer derivation isn't built. The marcher is then removed from that page's part, and the slot
    is compacted.
  - The Expert drag back in a shared move does the same.
  - **Shape and follow-the-leader members are skipped.** The rest of the command still applies,
    and the skipped marchers are named through `TimelineEditRefusedError` (its `marcherIds`) and the
    usual refusal message. This is interim until fork #434.
- **Migration:** a new migration, numbered after the latest one on main when it lands (after the
  shape host's 0027/0028), drops the table.
  - Fork nightlies and the lab build already ship migration 0018. Files whose stored undo or redo
    history names the table get **both history stacks cleared** in the same migration, because
    replaying such a step would fail with "no such table". The release notes say so.
  - An older build opening a migrated file errors on its kept queries.

**Amendment (2026-10-28, project owner): Held holds are stored.** _(Part 2: tickets #472–#476.)_

A designer can mark a stretch where marchers stand still as **Held**. Editing any count inside it
then moves the whole hold, by editing the move that arrives at its start. An unmarked stretch is
**Not set**: an edit inside it starts a new move there. Both are holds to the resolver (spec R-6),
so the mark is app data:

- **A new table, `timeline_held_marks`,** created by a new migration numbered after main's latest
  when it lands:
  - `id INTEGER PRIMARY KEY`, the rowid, so undo restores the same row (C-2);
  - `marcher_id`, referencing `marchers` `ON DELETE CASCADE`;
  - `start_beat` and `end_beat`, with `start_beat >= 0`, `end_beat > start_beat`, and
    `UNIQUE (marcher_id, start_beat)`.
- **How it's wired:**
  - It isn't in `timeline_change_log`, and the resolver never reads it.
  - It is in `tablesWithHistory`, the repair copy list and `DISPLAY_TABLES`. `DISPLAY_TABLES` is
    what refreshes views after an edit that only writes marks. The query invalidation map gets an
    entry, as the kept table had.
- **Two kinds, which follow from the rows** (no stored anchor):
  - An **arrival hold** has a row of the marcher ending at its start. It follows that row when the
    row is retimed, and goes when the row goes.
  - A **borrowed hold** has nothing ending at its start. It holds wherever the marcher is there.
- **Invariants, checked at commit time** in `timeline_commit_violations`. They are plain SQL over
  `timeline_assignments`, so they need no layer derivation:
  - **H-1:** no row of the marcher overlaps the mark.
  - **H-3:** one marcher's marks don't overlap.

  The view's rows are `(code, transition_id, detail)`. Mark violations set `transition_id` to NULL
  and name the marcher and counts in `detail`. `TimelineCommitViolationError` and the error
  messages accept that.
  - Opening a file runs the upkeep trim once, so a file edited by a build without marks support
    can't fail every later edit.

- **Holds are always explicit.** Only Hold from previous page (this page only), bar-end and
  bar-start drags, hold over the window, and Make all selected Held write marks. Nothing infers a
  hold from a selection or from positions.
- **Upkeep, in `transactionWithHistory`:**
  - **When:** the step snapshots, before the edit's function runs, the ids of the rows ending at
    each mark's start. It runs **right after the function**, before the history group is read, so
    its writes belong to the same undo step. It never runs during undo or redo replay (C-6).
  - **In order:**
    1. Trim the parts of marks that rows now cover.
    2. Keep a mark that a row still ends at.
    3. Move a mark's start to the new end of a row that ended there before (a retime), then trim
       again.
    4. Delete a mark whose row ended there before and is gone (Remove keyframe, Delete move).
    5. Otherwise leave it as a borrowed hold.
    6. Merge marks that touch.
  - **Writers that delete and re-insert a row with a new end** pass an explicit old→new row map,
    which step 3 uses. Basic's set-ending is the known case.
  - **Basic's sweep** of following moves that go nowhere stops at a mark's start.
- **Page and beat edits** (`planTimelineRipple`, so previews match commits):
  - An arrival hold's start takes its row's planned new end.
  - Any other mark edge that sits on a page flag follows that flag. That covers a borrowed hold's
    start and any hold's end.
  - An edge in the middle of a page stays on its beat, as a row edge does.
  - A deleted flag leaves an edge on its count.
- **Removing the keyframe a hold grows out of** removes the hold, and writes no next-page move
  inside it. The pages become Not set.
- **Hold over the window** removes the selected marchers' moves inside the window, cuts a move that
  crosses its start flag there, and starts a move that crosses the playhead at the playhead, with
  the same destination.
- **The converter writes no marks.**
- **The rules per write path** are in `docs/timeline/research/holds/01-edit-rules.md`. The rules
  for arrival and borrowed holds are in `04-anchors.md`.

**Scope.** Holds rely on transitions only through two operations: cut a move in time at a count,
and remove a marcher from a move for a range of counts. How shapes and transitions provide them is
left to the shape and transition ownership model (fork #434, #436), a later amendment. Until then,
the interim rule above applies: shape and follow-the-leader members are skipped and named.

**Verification**, added to the ADR's Verification section:

- A test after every timeline command checks H-1 and H-3.
- Undo and redo round-trips cover mark-only edits and edits that run the upkeep step.
- Migration tests cover:
  - a file with kept rows and kept steps in its history, which opens, plays the same, and has
    both history stacks cleared;
  - an empty marks table on old files.
- App scenarios cover the repros of questions 14 and 15 (`docs/timeline/research/holds/` README,
  Repro), and the demo's scenarios for holds.

The research is `docs/timeline/research/holds/`. The interaction is a new UI-row in
`docs/timeline/ui.md`.

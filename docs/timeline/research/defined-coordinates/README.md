<!-- cspell:disable -->

# Defined coordinates: what it means for a page to "have coordinates"

Status: built (wp1–wp20); fork PR #112 open, rebased onto `timeline-try-2` with #115 on 2026-10-09.
Started 2026-10-08 (session 4 of 4), on branch `timeline/defined-coordinates` off `timeline-try-2`
(a4d42cd1). This changes what stored data means, so it needed an ADR 0001 amendment before anything
was built.

## Start here

- **[HISTORY.md](HISTORY.md):** what happened in this PR (fork PR #112), from the report to the
  rebase onto #115, with screenshots: the research, the decisions, the 20 work packages, the user
  studies, the bugs fixed along the way and the open items.
- **[GLOSSARY.md](GLOSSARY.md):** every on-screen element the PR adds (hold marks, inspector lines,
  keep chains, the chain icon on a kept marcher's dot, the K key, the toasts), with a screenshot
  each and exactly when it appears.
- **[CHANGES.md](CHANGES.md):** the code-grounded catalog (B-01 … B-45) with strings, files, tests,
  a QA script and coverage gaps.
- Screenshots are in [images/](images/); see the image index at the end of HISTORY.md for which
  build each one shows.

## The report

> If I make multiple pages after page 1, say 2 3 4, all of those pages have the same coords as
> page 1. Then I edit page 2 to be a new move. Then when I go to page 3, rather than being page 2
> (which is where they are now) they are still the page 1 coordinates.

## Notes in this folder

| File                                                               | What                                                                                                                  |
| ------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------- |
| [01-current-model.md](01-current-model.md)                         | Where page coordinates come from in page mode and timeline mode, with the writers of stale copies; both reproduced    |
| [03-prior-art.md](03-prior-art.md)                                 | Pyware, EnVision, Blender, After Effects, Pro Tools, Ableton, ETC Eos / grandMA tracking                              |
| [04-model-touched.md](04-model-touched.md)                         | M1: dense rows plus a stored `defined` flag that carries edits forward                                                |
| [05-model-sparse.md](05-model-sparse.md)                           | M2: only edited pages store positions; every other page holds                                                         |
| [06-model-tracking.md](06-model-tracking.md)                       | M3: M2 plus Eos-style pins, "keep later pages" and cue-only delete; equality tracking as the page-mode bridge         |
| [07a-validation-timeline-core.md](07a-validation-timeline-core.md) | Validator: the sparse timeline core prototyped and run against the focused tests and the conversion corpus            |
| [07b-validation-page-mode.md](07b-validation-page-mode.md)         | Validator: page-mode options prototyped (equality tracking), including precision, pathways and undo cost at 200 × 100 |
| [07c-validation-extras-ux.md](07c-validation-extras-ux.md)         | Validator: pins, keep-later-pages and cue-only delete broken with scenarios; personas; how it fits PR #106            |
| [08-ux-study-feedback-text.md](08-ux-study-feedback-text.md)       | Persona study of the first feedback text; led to hold marks and toasts only for surprises                             |
| [09-first-time-users.md](09-first-time-users.md)                   | Four simulated first-time users try move, hold and a mix; led to Move them too                                        |
| [10-keep-later-pages-study.md](10-keep-later-pages-study.md)       | Three prototypes for editing an earlier page without later pages following, four users; led to keep later pages       |
| [CHANGES.md](CHANGES.md)                                           | Change catalog of the built branch: every behavior change (B-01…B-45), files, tests, QA script, coverage gaps         |
| [HISTORY.md](HISTORY.md)                                           | What happened in this PR, in order, with screenshots                                                                  |
| [GLOSSARY.md](GLOSSARY.md)                                         | The UI glossary: every on-screen element, with a screenshot and when it appears                                       |

## What we found

1. **There are two bugs with one symptom.**
   - **Page mode** (what every user runs) stores a full copy of every marcher on every page. A new
     page is a one-time copy, and editing page 2 writes only page 2.
   - **Timeline mode is already sparse.** No move means a hold (spec R-6), so the **+** flag
     behaves exactly as the owner expects. The bug there comes from automatic "stay" moves that
     freeze a copy of the position: the converter, the page-add ripple (`addHoldingMoves`),
     new-marcher stays, and set to previous/next page.
2. **Prior art.** Drill tools copy sets and offer manual re-sync. Animation tools and DAWs store
   only keys. **Lighting consoles' tracking** (ETC Eos) is the closest model: an edit carries
   forward until the next cue that sets its own value. It comes with three escape hatches:
   - _cue only_: change this cue alone;
   - _block_: a stored value that upstream edits don't change;
   - a delete that keeps later cues' look.
3. **All three models agree on timeline mode:** stop writing automatic stays. The validator ran
   this:
   - Positions at every flag stay bit-identical across the 8-file conversion corpus. In real files,
     38–61% of slots were copies.
   - The owner's scenario is fixed on every way of adding pages.
   - Undo round trips pass.
   - About 15 tests that assert row shapes change.
4. **It must ship with its companions, or it regresses:**
   - **Set to next page** is refused on an inherited page.
   - **Align and distribute** write unmoved marchers, which plants stays and brings the bug back.
   - **Ripple delete** on a converted show makes later copied pages snap back.
   - The "Only change Page N" toast disappears for windows over inherited pages.
5. **The extras don't hold up as designed:**
   - **"Keep later pages" goes stale.** It brings the owner's complaint back the first time an
     earlier page is edited.
   - **Pins worked out from coordinates can't be told apart from a drag-back.** Eos stores its
     blocks.
   - **"Pin" is already the start flag's word.**
   - Defer them until intent can be stored. Adding a column is free while user version 8 is
     unreleased.
6. **Page mode: carrying edits forward through exact copies works, but needs hardening.**
   - **Tolerance:** fabric moves 29% of a selection by ε without anything moving.
   - **A merge leak:** an edit that makes a page equal to a later deliberate page lets the next
     edit overwrite that page.
   - **Undo cost:** history grows about 98×, and undo takes 5.6 s at 200 × 100, mostly in a broken
     focus loop.
   - **Pre-existing page-mode bugs to fix whatever is chosen:**
     - a copied page shares the previous page's curved pathway, and editing either one corrupts
       the other;
     - `pathways` isn't in undo history;
     - pages the edit followed don't refresh.
   - A stored flag (M1) costs a migration on a table that freezes in Phase 9, and buys only pins
     plus immunity to the merge leak.
7. **Existing shows aren't repaired by any model.** The converter can't tell a stale copy from "back
   to the opening set". A page the old app already left stale stays stale until the user fixes it
   (Shift+P).

## Recommendation (lead)

_Historical: this is the recommendation the owner decided on. Its feedback items (toasts after
every edit, a grey "Holding since" line) were replaced after the persona studies (08, 09); the current
behavior is listed in [CHANGES.md](CHANGES.md)._

**Meaning:** a marcher has a coordinate on a page only where the designer moved them there.
Everywhere else they stay where they last were. An edit carries forward to that marcher's next page
that has its own move, and stops there.

**Timeline mode (sparse, M2 core), built as one change:**

1. **No automatic stays.**
   - Remove `addHoldingMoves`.
   - New marchers get a home only.
   - The converter skips points equal to the previous position.
2. **Writes that don't move a marcher write nothing.** This covers align, distribute and inspector
   edits on unmoved marchers (compared against the resolved position, with a tolerance). A drag back
   to the start of a page box the marcher owns clears that move.
3. **Set to previous page** clears the marcher's own move on that page, so the page follows again.
   **Set to next page** writes a move on the range writer, so it works on inherited pages.
4. **Delete page in timeline mode** is the UI-9 flag delete, which keeps every later page's look.
   - "Delete page and its moves" stays as an explicit command whose toast names the pages that
     change.
   - Tag appearances move to the next page instead of cascading away.
5. **Feedback:**
   - The post-edit toast says "Also pages 3–7 · stops at Page 8", aggregated across marchers.
   - The pass-through toast shows whenever a window contains a flag.
   - The inspector says "Holding since Page X" or "Moves here", with a jump.
6. Undoing "add marcher" keeps the current page.

**Page mode:** carry an edit forward through the unbroken run of later pages that still equal the
old value. This is per marcher. It stops at a shape, at its own pathway, or at a different value, and
compares with a tolerance.

- A toast offers "Only Page N", which puts the followed pages back as a second undo step.
- Ship it with the pathway-sharing fix, `pathways` in history, cache invalidation of the followed
  pages, and the undo focus fix.
- No schema change.

**Defer, and keep the corner open:**

- A "Lock here" (Eos block) with a **stored** kind.
- "Keep later pages", which needs a stored kind or a live return link.
- Cue-only ripple delete.
- Live links (ownership 05).
- Dot tints beyond the selection.
- "Hold" on coordinate sheets.

**ADR:** amend ADR 0001 C-12 to say:

- no path writes timeline rows on behalf of a page;
- the converter writes only changed positions;
- a stored zero-motion move is designer intent;
- page-mode edits carry forward through equal copies.

Also add a ui.md decision (UI-18) and amend the P7.4 hold rule in phases/07.

**Cost:**

- Timeline: about 7–9 days, plus 3–4 for the feedback UI.
- Page mode: about 4–6 days, plus 1–2 for the pre-existing fixes.

## Owner questions

See the "Decisions" section once answered.

1. Adopt "coordinates exist only where you moved someone; otherwise they hold" as the model, and
   amend ADR 0001?
2. Page mode: carry edits forward through untouched copies now (recommended), or leave page mode
   alone until timeline mode is the default (an explicit "Copy to following pages" command as a
   stopgap), or a stored flag (M1)?
3. Should Delete page in timeline mode keep later pages' look by default (flag delete), with "delete
   its moves too" as an explicit command?
4. Defer Lock and "Keep later pages" (recommended), or add a stored kind now while v8 is
   unreleased?

## Decisions

Owner, 2026-10-08, all four as recommended:

1. **Sparse model adopted.** A marcher has a coordinate on a page only where the designer moved
   them; otherwise they hold. Amend ADR 0001.
2. **Page mode carries edits forward now** through untouched equal copies (per marcher, with a
   tolerance), with an "Only Page N" toast and the pre-existing fixes. No schema change.
3. **Delete page in timeline mode keeps later pages' look** (flag delete); "delete page and its
   moves" is explicit.
4. **Lock here and Keep later pages are deferred** (no stored kind in this change).

Owner, 2026-10-08, after the build (PR #112):

5. **Delete page and its moves keeps long moves (tracks) inside the page box** ("I think no" to deleting
   them). V-149.
6. **Page-mode shape edits carry forward** to later copies that aren't in a shape ("I think so"). V-148.

Owner, 2026-10-09: hold-mark tooltips and Move them too; keep later pages (chains, Keep here / Follow
again, the after-edit Only Page N toast, K, no Alt-drag) with **stored** kept spots, which reverses
decision 4 (ADR 0001 amendment 2026-10-09); and the chain icon on kept marchers' dots (mock-up D, no
opacity). See [CHANGES.md](CHANGES.md) §1 decisions 8–11 and [HISTORY.md](HISTORY.md) §4.8–4.9.

## Built (branch `timeline/defined-coordinates`)

| Branch (merged)             | What                                                                                                                                                                               |
| --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `dc/wp1-no-auto-stays`      | No holding moves on page add, split or append; new marchers get a home only; the converter skips unchanged positions; undoing a marcher add keeps the page                         |
| `dc/wp2-writers`            | Writes that move nobody write nothing; a drag back clears an own page move; set to previous/next page on held pages; **Start from Page N**                                         |
| `dc/wp3-delete`             | Timeline Delete page = flag delete; **Delete page and its moves** with a changed-pages toast; tag appearances move to the next page                                                |
| `dc/wp4-page-mode`          | Page-mode carry-forward with **Only Page N**; no copied pathways; pathways in undo; undo focus fix; cache invalidation                                                             |
| `dc/wp5-feedback`           | Carry-forward toast in timeline mode; inspector "Holding since Page X" / "Moves here"                                                                                              |
| `dc/wp6-followups`          | Delete with moves after a flag delete (E-A3 fix); English toast strings                                                                                                            |
| `dc/wp7-hold-marks`         | Hold marks on the page boxes for the selected marchers, both modes                                                                                                                 |
| `dc/wp8-text-and-bugs`      | Carry-forward toast removed; shorter pass-through, page-mode and delete toasts; delete Undo; inspector link; selection refit; page selection after undo                            |
| `dc/wp9-selectall`          | Ctrl+A and Ctrl+S no longer nudge (same fix as upstream #1044)                                                                                                                     |
| `dc/wp10-tooltips`          | Hold-mark tooltips (on a stand-in until the rebase onto #115; now #115's ShortcutTooltip); stronger marks; "Hold from the start"                                                   |
| `dc/wp11-move-them-too`     | Move them too, both modes; Delete move names the pages that changed                                                                                                                |
| `dc/wp12-mtt-trigger`       | Move them too only when an edit splits a group at a later page; a window's pass-through toast wins in timeline mode; page mode's one toast with Move them too and Only Page N      |
| `dc/wp13-gap-tests`         | Coverage-gap tests (7 files); window moves survive Delete page and its moves; the delete toast closes on the next history change                                                   |
| `dc/wp14-mtt-polish`        | Two-button toast layout; runs of edits add up for Move them too and Only Page N; a fresh id per surprise toast                                                                     |
| `dc/wp15-kept-storage`      | Kept spots stored in `timeline_kept_assignments` (migration 0018); keep / follow again API; ADR 0001 amendment 2026-10-09                                                          |
| `dc/wp16-keep-ui`           | Keep chains on the page boxes; inspector Keep here / Follow again and "Pages 3–4 follow these marchers"; page box menu entries; **K**; timeline "Pages 3–4 followed · Only Page 2" |
| `dc/wp17-passthrough-words` | The pass-through toast names pages and counts, not beats                                                                                                                           |
| `dc/wp18-refusal-words`     | Timeline refusal messages name pages and counts (`timelineRangeWords.ts`)                                                                                                          |
| `dc/wp19-keep-fixes`        | K acts where the marchers hold; keep words name the marchers; K shown in menu and tooltips; kept chip stands out; keep before a first move                                         |
| `dc/wp20-kept-on-field`     | A chain icon beside each kept marcher's dot on the current page, whatever is selected (owner chose mock-up D, no opacity)                                                          |

The full, code-grounded list of behavior changes, tests and the QA script is [CHANGES.md](CHANGES.md).
Lead defaults are logged as V-140..V-149 and V-181..V-191 (V-150..V-160 before #115 took those) in [VALIDATION.md](../ownership/VALIDATION.md).

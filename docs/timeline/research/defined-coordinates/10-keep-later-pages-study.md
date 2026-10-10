<!-- cspell:disable -->

# 10: Editing an earlier page without the held pages following: three prototypes, four users

2026-10-09. The owner asked: after page 2 is written and pages 3–4 hold it, how do I change page 2 for
some marchers while pages 3–4 keep what they're doing? They also asked that the link be obvious
before editing, and whether links should be worked out at runtime or stored.

## The prototypes

All three are timeline mode only, and none is for merge. Each adds the same inspector line:
"Pages 3–4 follow these marchers".

| Id  | Branch / worktree                                                 | Idea                                                                                                                                                                                                                                                                                         |
| --- | ----------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A   | `exp/keep-here` (`OpenMarch-exp-keep-here`, d5ae6d12)             | **Declare before you edit.** On the later page, "Hold from Page 2 → · **Keep here**" in the inspector, or **Keep selected marchers here** on the page box menu. It reads "Kept on this page · **Follow again**" afterwards.                                                                  |
| B   | `exp/alt-drag` (`OpenMarch-exp-alt-drag`, 864733fa)               | **Say it while you edit.** Alt+drag (or Ctrl+arrow nudge) on page 2 means "this page only"; the field line says so while Alt is held.                                                                                                                                                        |
| C   | `exp/link-chips` (`OpenMarch-exp-link-chips`, 7a55a1e7, 86d571e8) | **See the link and cut it.** A chain icon on each later page box that follows the selection, with a tooltip. Clicking it keeps them there and the icon breaks; clicking again makes them follow. After an edit of an existing move there is also a toast "Pages 3–4 followed · Only Page 2". |

Each prototype stores "kept" as an ordinary zero-motion move. C remembers which moves were kept for
the session only.

## Method

Four simulated users who already use OpenMarch but had never seen these features. Each tried all
three builds in a different order, on a timeline starter show of 8 marchers and 4 pages, through the
replay remote control. The task:

1. Move the band forward on page 2.
2. Check that pages 3–4 hold.
3. On page 2, step only OT1 and OT8 out, with pages 3–4 unchanged.
4. Say whether the link was visible beforehand.

A one-line hint was allowed after about 6 failed runs in a build. The brief is
`~/ux-sim/EXP-BRIEF.md`; logs and screenshots are in `~/ux-sim/<id>/<A|B|C>/`.

## Results

**Every user did the task in every build without the hint.**

| User   | Who                                             | Order | Ranking   |
| ------ | ----------------------------------------------- | ----- | --------- |
| lee    | Director, mouse-first                           | A B C | C > A > B |
| priya  | Freelance designer, keyboard-heavy              | B C A | C > B > A |
| marcus | First-season director, never uses modifier keys | C A B | A > C > B |
| rosa   | Guard designer, thinks in keyframes             | A C B | C > A > B |

C ranked first three times and second once. B ranked last three times. Only Priya, the keyboard
user, liked B.

### What they said

**C (chains): the clearest "is it attached?" signal.**

- All four could tell before editing that pages 3–4 were linked, and the tooltip said exactly what a
  click would do.
- Problems:
  - The chain is small, and it hides under the page flag when that page is selected (Lee, Rosa).
  - The kept icon looks too much like the linked one (Rosa, Marcus).
  - The tooltip says "the selected marchers" even when only some of them follow (Priya).
  - **Selection trap** (Marcus, Priya): clicking one marcher inside an existing selection keeps the
    whole group selected, so the chain unlinked all 8 when they meant 2.
  - The chains vanish without a selection; Rosa wants them faint but always there.

**A (Keep here): the most explicit and reversible state** ("Kept on this page · Follow again").

- Marcus ranked it first.
- Problems:
  - It lives on the later page, which three users called "backwards" or "the wrong page".
  - It has no tooltip.
  - Nothing appears on the timeline.
  - Priya found that pressing Keep here _after_ a plain drag silently keeps the already-moved
    spot.

**B (Alt-drag): fast for Priya; invisible or forgotten for the others.** Nobody would remember Alt
"in October with 60 kids waiting" (Marcus).

- Two users hit a surprise: the playhead sat mid-page, so the Alt-drag made a new partial move. Their
  marchers walked back into line before page 2 ended.
- Then the pass-through toast showed jargon: "Moves straight through the move over beats [9, 13)".
- Nothing stays visible to show what was done.

**Everyone's worry about the plain drag** (Lee, Priya): without the feature, editing page 2 still
changes page 3 silently. They want a warning or an offer to unlink. C's "Pages 3–4 followed · Only
Page 2" toast does that, but only when an existing move is changed.

### Side findings (not specific to these variants)

- Clicking inside a page box puts the playhead where you click (UI-12 scrub), not at the page end. A
  drag then edits a partial window, and two users were caught by this.
- The pass-through toast's clip wording ("the move over beats [9, 13)") is jargon. It should name
  pages and counts.
- A horizontal drag nudged Y by about 0.05 (snapping). Priya wanted nudge keys for exact steps.

## Recommendation (lead)

Build **C as the main way, with A's words and B's shortcut**, and store the "kept" state.

1. **Chains on the page boxes** for the selected marchers: linked, kept, or a count for a mix
   ("2 of 8 kept").
   - Bigger, and never hidden by the page flag.
   - The kept look in the accent color, with a broken link.
   - The tooltip names the count it will change ("Keep 2 marchers on Page 3"), which defuses the
     selection trap.
2. **The inspector line** on the later page: "Hold from Page 2 → · Keep here" and "Kept on this page
   · Follow again", with tooltips. On page 2: "Pages 3–4 follow these marchers".
3. **After an edit that carried into later pages:** "Pages 3–4 followed · Only Page 2", undoable. It
   shows only when the user edits an existing move, so a page's first move stays silent (the C rule).
4. **Alt+drag as a shortcut** for "this page only". It leaves the same visible broken chain behind.
   Only if the owner wants it; it ranked last.
5. **Store "kept".** A kept spot is the designer's decision, and it must survive reopening the file
   and be told apart from a move that happens to end where it started (07c §1). That needs a small
   schema addition while user version 8 is unreleased, plus an ADR 0001 amendment. Timeline mode
   only: page mode keeps its runtime equality and Only Page N.
6. **Separately:** word the pass-through toast in pages and counts, and consider making a click on a
   page box land on the page end.

## Owner questions

1. Adopt C with A's words (and B's Alt shortcut?) as the way to keep later pages?
2. Store the kept marker: a schema addition and ADR amendment while v8 is unreleased?
3. Show the chains faintly with nothing selected (Rosa)? The owner said earlier that hold marks show
   nothing without a selection.

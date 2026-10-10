<!-- cspell:disable -->

# 07c: Validator 3: M3's extras (pins, "Keep later pages", cue-only delete) and the designer's mental model

Adversarial validator, 2026-10-08. It worked on a repo copy at a4d42cd1 plus these notes. The
scratch test was `zzV3Extras.test.ts`, and all 9 cases ran.

- **Setup for every case:** timeline mode, one marcher with home (10,10), and **+** flags at 9, 17,
  25, 33 and 41 for pages 1–5.
- **Tags:** RAN means a scratch test produced the result; REASONED means it was worked out from
  code or the spec.

## 1. Pins derived from `dest == origin`, with no stored kind

| Case                                                           | Result                                                                                                       | Verdict                                                                   |
| -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------- |
| T1: pin page 3, then edit page 2 to (123,456) (RAN)            | p2 = (123,456); p3–p5 = (10,10). The pin becomes a move from 123 back to 10.                                 | Holds, but after the edit nothing marks it as a pin any more              |
| T2: drag page 3 to (50,50), then drag it back to (10,10) (RAN) | The stored row is **byte-identical** to T1's pin. After a page-2 edit, page 3 doesn't follow.                | **Breaks the mental model**: changing your mind leaves an invisible block |
| T8: pin a marcher who is mid-move under a move [13,29) (RAN)   | The pin lands on layer 1 and overrides the move, which then catches up from (10,10) to (200,200) in 4 beats. | Breaks: a speed spike                                                     |
| T5: pin plus a move ending inside the pinned page (RAN)        | The pin catches up from 200 to 10 over [21,25). "`dest == origin` at the row's start" is ill-defined.        | Ambiguous display                                                         |

- **The Eos analogy is wrong.** Eos draws a stored **block** (white) differently from an
  **auto-block** (underlined white), which is a value that happens to equal the tracked one
  (03-prior-art.md:227). A derived pin is an auto-block, not a block.
- **Pins are not neutral for follow-the-leader.** A pin is a non-hold span. It becomes `u(f)` for a
  later follow-the-leader move, so R-12 can fall back to slot order and raise `D-ORDER-FALLBACK`.
  A gap would pass the order through.
- **Pins and future links.** A link targets `H.start < j < H.end` (05 L-2), so an inherited page
  can't be linked to. A "return" for Keep later pages needs `j = H.end`, which 05 refuses in v1.
- **Recommendation: keep the invariant "a row the app writes moves the marcher".**
  - The range writer deletes a marcher's own one-slot page-box row when an edit leaves its
    destination equal to its origin, so a drag-back counts as Clear.
  - It writes nothing when a marcher that isn't defined yet is dropped on its inherited spot.
  - A row that becomes zero-motion after an upstream edit is a coincidental auto-block: keep it
    and show it as "defined".
  - When Pin ships, store a kind. User version 8 hasn't shipped, so a column is free now and a
    migration later.

## 2. "Keep later pages" (cue-only edit)

- **T4 (RAN): the kept page goes stale.**
  - Steps: edit page 2 with Keep later pages, which pins page 3 at (10,10). Then edit home to
    (20,20).
  - Result: **pages 3–5 = (10,10), page 1's old coordinates.**
  - This recreates the owner's complaint the first time an earlier page is edited. An absolute copy
    can't mean "where page 1 left it".
- **T3 (RAN): page 3 mid-move under a longer window.**
  - The page-2 drag lands on layer 1, and page 3 still changes.
  - M3 writes keep-pins only for marchers that were inheriting. The toast must not say "kept" for
    the others.
- **Window shape (REASONED from PR #106 `timelineMoveNames.ts:84-100`).**
  - When the marcher's next row starts mid-page, `[P, min(next flag, next row start))` isn't a page
    box, so it would be named "Move N" and drawn as a clip the designer never made.
  - If the page is then deleted, it leaves an orphan clip.
- **Other edges:**
  - Partial selection is per marcher: holds.
  - Page 3 already defined: nothing written; holds.
  - The keep-pin is **sticky**, so later plain edits still stop there. It is permanent, not "this
    edit only".
  - Undo: as a modifier it is one step; as a toast action it is two, like "Only change Page N".
- **Name clashes.**
  - UI-10's "Only change Page N" (`timelinePassThrough.ts:144-165`, `timelineMoves.ts:631-700`) is
    a different axis: it narrows when the motion _starts_. Under sparse, pages after P still
    inherit the result, but users will believe "only Page N" means later pages are untouched.
  - The two can share one post-edit toast:
    - "Passes through Page 3 · Start at Page 4 instead"
    - "Also pages 5–7, stops at Page 8 · Keep pages 5–7"
  - Rename UI-10's action ("Start from Page 4's set").
  - **"Pin" is taken.** UI-10 and UI-12 use Pin/Unpin for the start flag, so marcher pins need
    another word ("Lock", "Keep here").

## 3. Cue-only delete

| Case                                                        | Result                                                                                                                                                                              |
| ----------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| T6: delete defined page 2, which has a tag appearance (RAN) | Page 1 takes page 2's beats and page 2's move is deleted. **Every later page snaps back to (10,10).** **`tag_appearances` left: 0**: the cascade at schema.ts:358-361 is confirmed. |
| T6y: yank (RAN)                                             | Same snap-back.                                                                                                                                                                     |
| T7: delete defined page 3 while page 2 is defined (RAN)     | Page 2's move stretches to [9,25) (16 counts); page 3's (300,300) is lost. A cue-only delete would write (300,300) over the new page 3's box, which matches page-mode parity.       |
| T8b: delete page 3 when it holds a layer-1 pin (RAN)        | The pin isn't `isPageMove`, so it survives as an off-flag timeline. Under PR #106 it becomes a "Move N" clip.                                                                       |

- Tag appearances need cue-only treatment whatever model is chosen: move `start_page_id` to N+1, or
  drop it if N+1 already has one for that tag. About ½ day.
- **Cheapest v1:**
  - In timeline mode, Delete page = UI-9 flag delete (`pageFlags.ts:214-290`). It already keeps
    every later page's look, at zero cost.
  - "Delete with its moves" becomes an explicit command that names the changed pages.
  - Defer the cue-only ripple delete.

## 4. Fork PR #106 (UI-14: edit, rename and delete a move)

- **Deleting a move under sparse reverts later inherited pages.** That is the snap-back in a new
  place.
  - It is arguably the right meaning, but the toast should say "Pages 4–6 changed too".
  - Today stale stays already cut the move's effect off at the next page.
- **The clip menu is not the home for Pin, Clear or Keep later pages.**
  - The menu acts on a whole move, and page timelines have no clip (ui.md UI-14 "Not in scope").
  - Better homes:
    - the marcher context menu or inspector, which explains at the playhead (V-41): "Holding since
      Page 2 · Go to Page 2", "Moves here · Clear (follow Page 2)";
    - Keep later pages in the post-edit toast.
- **Gap:** under sparse there is no UI to clear a definition on a page box except undo.

## 5. Exports and 3D

- **Coordinate sheets and mobile** sample the resolver at each flag, so output stays dense.
  - If "Hold" is ever printed, derive it from zero motion, never from defined/inherited.
- **Video:** resolver-sampled. No change.
- **3D (3d-async): the claim "reads resolved positions" in 05 and 06 is false.**
  `view3d/positions.ts` builds from `useCoordinateData`/`marcher_pages`.
  - In timeline mode, 3D shows frozen page-era rows under any model. This is a separate gap that
    should be tracked.

## 6. Personas

**A. A high-school director who learned Pyware** (dense sets, copy-on-new-set; Pyware's own
behavior is unverified):

- **Owner's scenario:** fixed. Pleased once a toast says "Also pages 3–4".
- **Back to opening set:** absolute positions, so it matches Pyware. With the drag-back rule, if
  page 4 already equals the opening set, page 5 follows page 4 instead. Rare; document it.
- **Drum major still all show, then moved on page 1:** sparse moves him on all 80 pages. That is
  right and saves work, but a Pyware user expects only page 1 to change, so the toast must name the
  range.
- **Delete a page:**
  - Flag delete: fine.
  - Ripple delete under M2: snap-back.
  - Cue-only delete, or M1: fine.
- **Insert a page, then edit it:** later inherited pages move too. This is the biggest surprise for
  a Pyware user, who expects a copy to be independent. The toast is the mitigation.

**B. A power user writing 80-page shows:**

- Needs an aggregated toast: "Also moved 12 marchers on later pages (up to Page 73) · Keep later
  pages".
- Will use Keep later pages heavily and hit T4 staleness, plus invisible drag-back blocks.
- Needs "Defined at Page X" with a jump. Without visible states, M3's extras are actively harmful.

**C. A beginner:**

- Sparse matches intuition ("he stays until I move him").
- Surprises:
  - ripple delete;
  - an invisible block after a drag-back;
  - "Only change Page N" not meaning what it says.
- Won't find Pin or Keep later pages.

**What the UI must show, kept calm (UI-12):**

- Nothing new on an empty selection.
- For selected marchers:
  - a "moves here" mark on page boxes;
  - an inspector line "Holding since Page 2" or "Moves here", with a jump.
- One post-edit toast, with at most one action per topic.

## 7. Minimal v1, and what to defer

**Ship:**

1. **M2 core:**
   - remove `addHoldingMoves`;
   - no stays for new marchers;
   - the converter skips exact-equal pages;
   - Set to previous = Clear; Set to next = define;
   - the range writer writes nothing on an inherited spot, and a drag-back to the origin = Clear.
2. **Deleting pages:**
   - Timeline-mode Delete page = flag delete.
   - "Delete with its moves" is explicit, with a toast naming the changed pages.
   - Fix the `tag_appearances` cascade.
3. **One post-edit toast:**
   - "Also pages 3–7 · stops at Page 8", aggregated;
   - rename "Only change Page N";
   - PR #106's delete-move toast names the changed pages.
4. **Inspector line** "Holding since Page X / Moves here", with a jump.

**Defer:**

- Pin/Lock, with a stored kind added while v8 is unreleased.
- Keep later pages, until it can store a kind or a return link.
- Cue-only ripple delete.
- Live return links.
- Dot tints and key marks beyond the selection.
- Trace.
- "Hold" on coordinate sheets.

**Corners not to paint into:**

- Pins without a stored kind.
- Absolute keep-pins.
- Reusing the word "pin".

## Claims in 04/05/06 found false or incomplete

1. **06 §0/§5:** "a derived pin is like Eos's block". False; it is an auto-block.
2. **06 §3 and 05 §2:** "3D reads resolved positions". False for 3d-async.
3. **06 §3:** "Pin via the same range write" contradicts its own "drag back to the inherited spot →
   no row".
4. **06 §3:** "Keep later pages keeps the look". False when N+1 is mid-move (T3) and after any
   earlier edit (T4). Its window can also create a named clip.
5. **06 §3:** Pin on a marcher mid-move is undefined, and the range write is harmful there (T8).
6. **06 table:** "A deliberate stay survives an upstream edit". True for position only; the R-12
   order source changes.

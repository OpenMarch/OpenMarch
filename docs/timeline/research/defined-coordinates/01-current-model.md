<!-- cspell:disable -->

# 01: Where a page's coordinates come from today

Research on `timeline-try-2` (a4d42cd1), 2026-10-08, from two code-reading agents. [RAN] means a
scratch test confirmed the claim; [READ] means the code or docs were read but not run. Paths are
relative to `apps/desktop/` unless they start with `docs/` or `packages/`.

## The owner's report

> If I make multiple pages after page 1, say 2 3 4, all of those pages have the same coords as
> page 1. Then I edit page 2 to be a new move. Then when I go to page 3, rather than being page 2
> (which is where they are now) they are still the page 1 coordinates.

It happens in both modes, for different reasons.

## Page mode (the default; timeline flag off)

- **Storage is a dense snapshot per page.**
  - `marcher_pages` holds one row per (marcher, page): `electron/database/migrations/schema.ts:180-233`.
  - `x` and `y` are `NOT NULL`, with `UNIQUE(marcher_id, page_id)`.
  - Nothing records whether a row was authored or copied. Nothing enforces the M×P rule either;
    gaps only come from damaged files.
- **A new page gets a one-time copy of the previous page by beat** (`_createMarcherPages`,
  `src/db-functions/page.ts:189-250`).
  - It copies `x, y, notes, path_data_id, path_start_position, path_end_position`, but not
    rotation, appearance, midsets or shapes.
  - Split page (`src/components/inspector/PageEditorUtils.ts:26-63`) copies the page being split.
  - The new-show wizard makes chains of copies.
- **Editing page N writes only page N.** `updateMarcherPagesInTransaction`
  (`src/db-functions/marcherPage.ts:142-205`) is the single write path for drag, nudge, align,
  distribute, flip, swap and shapes. It updates rows only and throws on a missing row.
- **Moving edits to other pages is manual only:**
  - set all/selected marchers to the previous/next page (Shift(+Ctrl)+P/N,
    `src/utilities/setMarchersToNeighborPage.ts:105-127`);
  - copy a shape to the previous/next page (`src/db-functions/shapePages.ts:413+`).
- **Reproduced [RAN].** Scratch vitest, `marchers` fixture with 76 marchers:
  1. `createLastPage` three times.
  2. `updateMarcherPages` on page 2.
  3. Result: page 3 still equals page 1.
- **A missing row means a glide, not a hold.**
  - Playback keys each row at the end of its page and interpolates between rows
    (`src/utilities/Keyframes.ts:32+`, `src/hooks/queries/useCoordinateData.ts:81-150`).
  - Missing rows are glided over, and a missing neighbor outside the ±2-page window throws.
- **Likely side bug [READ].** A copied row keeps `path_data_id`, so a copied page probably replays
  the previous page's curved pathway instead of holding (`Keyframes.ts:70-92`).
- **Readers of `marcher_pages`:**
  - playback (`useAnimation.ts:42-52`) and the canvas (`OpenMarchCanvas.ts:1160-1181`, path
    visuals);
  - the inspector (`MarcherEditor`, `StepSize`, `ReadableCoords`);
  - appearances;
  - collisions (switched off);
  - every export: coordinate sheets, `exportPagePositions`, the SVG generator, video
    (`videoFrameRenderer.ts:288`), and the mobile `dots-to-om.ts`;
  - the timeline converter.
- **Page-era tables are temporary.** They freeze after Phase 9 and are dropped in Phase 10
  (ADR 0001 §1).

## Timeline mode (per-file `timelineMode`; convert-on-open only with `OPENMARCH_CONVERT_ON_OPEN=1`)

- **The model is already sparse.**
  - Pages are flags (C-12).
  - A beat range with no assignment is a hold at the end of the previous span (R-2, R-6;
    `packages/core/src/timeline/resolver.ts:495`).
  - So "page 3 shows page 2" already works when nothing is stored for page 3.
  - A page is _defined_ for a marcher when a winning span ends at its flag, and _inherited_ when
    the marcher holds through it.
- **The bug comes from stored "stays".** A stay is a shapeless `direct` transition whose
  destination is a frozen copy of where the marcher stood when the row was written. Storage
  can't tell a stay the designer meant from one that was filled in automatically. Writers:

  | Writer                                                                                                              | Where                                                                            | When                                                                                                    |
  | ------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
  | Converter: every page N ≥ 1 becomes a transition, even when its coordinates equal the previous page's               | `src/timeline/convert/planPageConversion.ts:425-435`                             | older files opened with convert-on-open, the dev console `convertPages`, all `test:timeline` fixtures   |
  | Page-add ripple `addHoldingMoves`: destination = `positionAt(m, pageStart)`; holds chain onto holds                 | `src/db-functions/timelineRipple.ts:526-646`                                     | `createPages`, `createLastPage` (the page-timeline + button while the beat view is focused), Split page |
  | New marchers get a stay to home in every stored timeline                                                            | `src/db-functions/marcher.ts:200-232`, `src/timeline/timelineMarchers.ts:97-100` | adding marchers                                                                                         |
  | Set to previous/next page copies resolved positions as fixed destinations                                           | `src/timeline/timelineCoordinateWrites.ts:290-305`                               | Shift(+Ctrl)+P/N                                                                                        |
  | Add selected marchers: destination = position at the end of the range (a drag overwrites it for marchers that move) | `src/db-functions/timelineMembership.ts:192-198`                                 | UI-9 add                                                                                                |
  - The ripple contradicts ADR 0001 C-12 ("adding or deleting a page writes only page rows").
    Only the UI-9 **+** flag and flag delete (`pageFlags.ts:20-31`) honor it.

- **Reproduced [RAN].** Scratch test: flags at 17, 25 and 33, then page 2 edited with a UI-10 drag
  over [9,17) to (123,456).

  | How pages 2–4 were added                     | Page 3 / page 4 after editing page 2                                                              |
  | -------------------------------------------- | ------------------------------------------------------------------------------------------------- |
  | **+** flags                                  | (123,456) / (123,456): correct                                                                    |
  | `createLastPage`, no page-1 move             | correct (no holds written)                                                                        |
  | `createLastPage` after a page-1 move (50,50) | holds [9,17), [17,25) and [25,33) all go to (50,50), so page 3 / page 4 show **(50,50): the bug** |
  | page-mode pages ×3, then convert             | four transitions all at page 1's coordinates; **page 3 = page 4 = page 1: the bug**               |

- **Live links and stored ghost starts don't exist in code.** They are only in ownership notes
  05 and 08. A link to "host at beat j" is the general form of "page 3 inherits page 2".
- **PR #54 (P8.12) doesn't change how positions are derived.**
  - Its "set to previous/next page" still writes fixed copies.
  - Upstream `coordinates-v2` throws when a page has no coordinate, so it has no idea of an
    inherited coordinate either.
- **Resolved positions in timeline mode feed:**
  - the static and playback canvas, focus and isolation layers;
  - paths and step sizes, and the inspector;
  - every export (via `timelinePagePositions.ts`), and the new-show wizard source;
  - the write planners.

## What follows

- **In timeline mode, "untouched" can simply mean "no row".**
  - An automatic stay moves exactly like a hold until something earlier changes; then it is
    wrong.
  - So the fix is mostly to stop writing automatic stays and clean up the ones already written.
    A new flag isn't needed for that.
- **In page mode every row is a frozen copy.** Any fix needs either a flag or sparse rows. That
  table is scheduled to freeze and be dropped.

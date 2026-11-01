# 0006: Shapes are stored as recipes beside the positions they place

- Status: accepted
- Date: 2026-10-10
- Accepted: 2026-10-29

## Context

The Shape tool (docs/timeline/research/shapes/README.md) places selected marchers on a shape at
one moment: the end of the move being edited, or their homes. It writes the positions through
the same path as a canvas drag (`moveMarchersInTarget`), so playback, the resolver, the file
format and older app versions see ordinary positions.

The owner wants shapes kept as re-editable records: "an equation that lays out how the marchers
are distributed, but we can have overrides". Reopening a placed arc should show the arc, with
its settings, and changing its radius should move its marchers again, keeping any marcher the
designer has since nudged by hand where it is relative to its spot.

The spec's own shapes (`timeline_shapes`, `dest_shape_id`) can't carry this. They have five
fixed kinds checked by the database, every new kind would be a spec, schema and resolver change,
and a group transition into a shape breaks UI-9's one-transition-per-marcher rule
(01-codebase.md §6). Shape kinds are meant to grow without schema changes (03-shape-model.md §3).

## Decision

1. **Positions stay the source of truth for motion.** Placing a shape writes positions exactly
   as today. Nothing the resolver reads changes.
2. **A recipe is stored beside them**, in two new app tables (not spec tables, no change-log
   triggers, with history triggers so undo and redo restore them with the positions):
   - `timeline_shape_recipes`: `id`, `timeline_id` (the move whose end it shapes, `NULL` for
     homes; deleted with the move), `kind` and `kind_version` (the shape kind's id and generator
     version), `params` (the kind's JSON parameters), `order_mode` and `reverse` (who goes where),
     `created_at`.
   - `timeline_shape_recipe_marchers`: a surrogate `id` (ADR 0001 C-2), `recipe_id` (deleted with
     the recipe), `marcher_id` (deleted with the marcher), `slot` (the marcher's spot in the
     recipe's slot order) and `x`, `y` (where the recipe put it when last placed). One row per
     marcher and recipe.
3. *(Revised 2026-10-14, see below.)* **Overrides are the difference between where a member
   stands and where its recipe put it.**
   They are not stored separately: a member nudged after placement simply stands somewhere else,
   and reopening the recipe shows it as moved by hand. Editing the recipe moves each member to
   its new spot plus its override, unless the designer resets the overrides.
4. *(Revised 2026-10-29, see below.)* **A marcher belongs to at most one recipe at a beat.**
   Placing marchers with a new shape removes them from the other recipes at the beat it's placed
   at; a recipe left with no members is deleted. Both happen in the same edit as the positions,
   so it is one undo step.
5. **Kinds own their parameters.** `params` is whatever the kind declares, read by kind id and
   version. An unknown kind or version (a file from a newer app) is shown as a plain group of
   positions: the recipe can't be reopened, but nothing is lost.

## Consequences

- New kinds and parameters never need a migration.
- A file opened in an older app keeps every position; the recipe tables are ignored there.
- Recipes can go stale when other edits move the move's end: they belong to the move by id, so
  resizing a move keeps them attached to it, and splitting or merging moves carries them to the
  move that holds those positions (Revision, 2026-10-29).
- Follow the leader can later use a recipe's path as its route (README decision 5).

## Verification

- Migration test: the tables exist after migrating an older file, with their foreign keys.
- History: placing a shape and undoing removes both the positions and the recipe; redo restores
  both, with the same ids.
- Deleting the move, or a marcher, deletes the recipe rows that hang off it.
- Unit tests for reopening: overrides computed from positions, edited recipes keep overrides.

## Revision, 2026-10-14: no overrides

The owner chose binary membership for placed boxes
(docs/timeline/research/shapes/07-placed-boxes.md). A member stands exactly on its spot or isn't
in the recipe. Moving some members takes them out, leaving their spots as holes (the box's params
store `spots`, the spot count with holes). Moving every member the same way moves the recipe.
Decision 3 is replaced: there are no overrides, and a reopened recipe always matches the field.

A recipe is shown at its move's end and at later moments while all its members stand on their
spots. Editing it at a later moment saves a copy on that later move.


## Amendment, 2026-10-20: the frame and pivot, and spots with marchers

The shape host (spec #344, owner grilling 2026-10-20) adds two points. Neither changes the schema.

1. **A recipe stores the shape's full frame**: its center, size, rotation, flip and pivot. They
   live in `params` beside the kind's own numbers. The center, size, rotation and flip are the
   kind's to store (a box keeps its center, spacings, rotation and flips; its size follows from
   them and the spot count). The **pivot** is the host's: `params.pivot` is one of the frame's 9
   points (`"nw"` … `"se"`), or a point of its own `{ x, y }` in the frame's terms (a multiple of
   the half size across and deep, or field units on an axis with no size), so it moves, turns
   and stretches with the shape. No `pivot` means the center, which every new shape starts at, so
   recipes saved before this amendment read as centered. Scaling is never stored as a factor: it
   becomes the new size and intervals. Reopening a recipe shows the shape turned, flipped and
   pivoted as it was left.
2. **A recipe is spots with marchers assigned to them.** The kind lays out the spots
   (`params.spots` counts them, holes included); `timeline_shape_recipe_marchers` says which
   marcher stands on which spot (`slot`). The two stay separate steps: a kind is given the spot
   count by the host and never reads the selection. A spot with no marcher is planned, not built:
   nobody is placed there, and it is kept only as a hole in a recipe whose members left
   (Revision, 2026-10-14). Shapes with spots that nobody stands on from the start come later
   (#358) and fit this model without a schema change.

Verification: the shape host's unit tests save a shape through `placementOf` and read it back
through `boxesAt` with its pivot (`shapePivot.test.ts`), and a browser scenario places a box with
a pivot of its own and finds it there when the box is selected again (`box-tool.spec.mts`).

## Amendment, 2026-10-20: saved shapes

Saved shapes (#353, spec #344) are named shapes a user keeps to use again. They need storage
beside recipes, following the Assets pattern of a user library ("My Library") with a copy in
each show that uses one ("This show"), so a show opens with its shapes on another computer.

1. **A saved shape is a kind, its intervals and how it's filled, under a name.** It stores the
   kind's id and version, each interval parameter's value in steps by the parameter's key, and,
   for a closed kind, its **distribution** (updated 2026-10-22, spec #385, #393): the recipe's
   `params.distribution` (amendment of 2026-10-22, below) without a Files layout's `files` or a
   spread's `seed` and `count`. It stores no size, count, center, rotation, flip, pivot or seed, so it fits any
   selection. Picking it opens its kind; drawing it, or turning an open shape into it, lays the
   spots out the saved distance apart in the saved mode, layout, stagger (when one is stored;
   nothing in the UI sets it since #408) and outline gap. The
   kind reads the saved distribution as it reads a recipe's, at the size it's drawn, and an even
   spread starts at seed 1. A mode the kind can't take or doesn't know leaves the kind's own
   fill. A shape placed from it is an ordinary recipe of its kind, with no reference to the saved
   shape, so it reopens without it.
   - It also keeps an optional **description** and the dates it was **created** and last
     **updated** (ISO 8601). Changing a saved shape sets its updated date. Library entries saved
     before these fields read without them.
   - Its preview is still generated from the kind's geometry, never stored (#378).
2. **The user's library is per-user app storage**, like shape stars: a JSON list in the
   renderer's localStorage (`openmarch:savedShapes`). The Assets Library's content-addressed
   store in the main process was not reused: a saved shape is a few numbers, not bytes, it has
   no versions or license, and the web editor has no Assets Library but does have shapes.
3. **The show's copy is the `saved_shapes` table** (migration 0028): `id` (the same id as in
   the user's library), `name`, `kind`, `kind_version`, `intervals` (JSON), `description`
   (NULL for none), `distribution` (JSON, NULL for an open kind) and `created_at` /
   `updated_at`. The copy takes the library entry's dates; an entry with none is dated when it's
   copied, and refreshing a copy keeps its created date. Migration 0028 hadn't reached `main`
   when these columns came, so it was regenerated with them rather than followed by another. Like
   `library_items` it has no history triggers: saving a shape isn't a drill edit, so undo
   doesn't change it. Saving writes the copy, and placing a shape picked from a saved one writes
   or refreshes it. The library lists the user's saved shapes, then copies the user's library
   doesn't have, which can be added to it. Deleting a saved shape deletes it from the user's
   library and the open show; other shows keep their copies.

Verification: `savedShapes.test.ts` saves a shape through the shape session and applies it to
other counts with the box and a fake kind, including a staggered box that keeps its layout
family and stagger, and a spread that keeps its mode but not its seed; the db-function
`savedShapes.test.ts` round-trips the description, distribution and dates through the show's
copy, and the library panel test through the user's library; the migration test checks 0028
adds only its table, with the new columns; a browser scenario in `box-tool.spec.mts` saves a box,
draws it on another selection at its spacing, and finds it listed from the show's copy after the
user's library is cleared, and another saves one with a description and finds it there.

## Amendment, 2026-10-22: how a closed shape is filled

Distribution modes (spec #385, owner grilling 2026-10-21/22) let a closed shape be filled in
Files, Outline or Even spread. The shape host owns the fill: a closed kind describes only its
region, and one shared distributor lays out the spots. This needs no schema change.

1. **The distribution is a host-owned object in `params`**, beside the kind's own numbers, as
   the frame and pivot are (amendment of 2026-10-20). Every closed kind stores it the same way:
   - `{ "mode": "files", "layout": { "family", "files", "byFile" }, "stagger": [p, q] }`: ranks
     and files at the kind's intervals. `family` names the layout (`"shortBack"`, today's box;
     the box's layout picker adds the others), `files` is the full rank's count and `byFile` turns
     the rows to run front to back. `stagger` is the signed offset of each rank as the fraction
     p/q of the across interval, so ⅓ round-trips exactly. It is stored and read, but since the
     stagger slider was removed (#408) nothing in the UI sets it, so new shapes store `[0, 1]`.
   - `{ "mode": "outline", "oddGap": { "side", "at", "style" } }`: spots around the edge at the
     intervals, one on every corner. An odd count leaves one spot between corners out: on `side`
     (`"back"`, `"front"`, `"left"` or `"right"`, the kind's own sides before any flip), `at`
     intervals from that side's start (left to right on the back and front, front to back on the
     sides), or its middle when `at` is null. `style` `"spread"` (the default, owner 2026-10-23)
     spreads that side's spots evenly between its corners; `"gap"` leaves the spot empty instead.
     A missing or broken `oddGap` reads as the back spread evenly, and an `at` the count no longer
     has reads as the middle of its side. A region with no corners (the circle) has no gap to leave and ignores
     `oddGap`.
   - `{ "mode": "spread", "seed", "generator", "count" }` (#391): a seeded scatter whose closest
     pair is the kind's interval. `seed` is a whole number from 1 (Reshuffle stores the next
     one), `generator` the algorithm (decision 4), and `count` the spot count the seed was laid
     out for. At another count the spots relax from that layout (new ones placed by best
     candidate, extra ones taken from the most crowded spots) instead of reshuffling, so adding
     or removing a marcher nudges the spread; reshuffling stores the count there is now. Without
     `count` the seed is laid out for whatever count there is.
2. **No `distribution` reads as Files, Short back, no stagger.** That is how every box recipe
   stored before this amendment reads, `pattern: "grid"` ones included, and it lays out exactly
   the spots they had, so the box's `kind_version` stays 1. `pattern`, `shortRank` and
   `shortRankAt` retire: a box no longer writes them. Recipes from before box v1 (short rank at
   the front or off center) still read by them. A distribution this version can't read (an
   unknown mode or broken fields) reads as the default too.
3. **The box's file count stays `params.files`**, as recipes have always stored it. Its Files
   layout's `files` is written beside it to match, and readers take the box's own when they
   differ. In Outline it is the spots across the back and front, which set the outline's
   proportions; the spots down each side follow from the count.
4. **An even spread is versioned by its `generator`**, apart from the kind's version, because its
   spots come from a seeded algorithm that may be improved later. A recipe whose generator this
   app doesn't have is shown as a plain group of positions, as decision 5 does for an unknown
   kind or version: it can't be reopened, but nothing is lost. A count or layout change is never
   stored as a generator change.
5. **The spots stay the kind's to generate**, through the distributor, in a fixed order, so the
   `slot` numbers of `timeline_shape_recipe_marchers` keep meaning the same spot.
6. **The circle tool's recipes are `circle`, version 2** (#389). Version 1 is the path circle of
   the old shapes panel (a radius and a spacing along the path); version 2's params are
   `center`, `interval` (the chord between neighbors), `rotation`, `flipX`, `flipY` and the
   distribution. Its radius follows the count, r = interval / (2 sin(π/n)), so it isn't stored.
   A circle is filled in Outline or Even spread; a distribution it can't be filled in reads as
   Outline. In Even spread its radius follows the spread instead, which fills the circle at the
   size its count and interval give.
7. **A spread keeps a box's proportions in files and ranks** (#391): a box in Spread keeps its
   `files`, and the spread fills a rectangle `files` by `ranks` cells, at the box's `across`
   interval (its one spacing in Spread). Switching back to Files gives the block it was, and a
   handle drag in Spread picks the file count nearest the dragged shape.
8. **Generator 1** (#391): Mitchell's best candidate from mulberry32, then a push-apart
   relaxation, then pairs closer than 95% of the median neighbor distance parted, scaled so the
   closest pair is exactly one interval. Each marcher keeps a seeded distance from the edge of
   0.15–0.85 of a spacing, so no rows form along straight edges. Up to 80 marchers, a layout is
   the most even of four tries of its seed. The layout reads the region only through its edge
   distance, area, perimeter and bounds, so it fills any closed region, and uses only + − × ÷ and
   `Math.sqrt` (which ECMAScript defines exactly; `Math.sin` and the like are approximated), so a
   seed gives the same spots in every engine. Any change to the spots a seed gives is a new
   generator.

Verification (#391): `spread.test.ts` checks the same spots for the same shape, count and seed;
the closest pair at the interval; neighbor distances within 10% of each other at 12–300 marchers
in boxes, a circle and an L; no row of 4 along a box edge; 300 marchers in under 300 ms; no
approximated `Math` function called; and a count change moving most marchers less than half an
interval. `spreadSession.test.ts` switches the box and the circle to Spread, reshuffles as one
undo step, reopens a placed spread exactly, and shows one from an unknown generator as plain
positions. A browser scenario in `box-tool.spec.mts` reshuffles with undo and redo, places the
spread and reshuffles the placed box.

9. **Box layouts (#387, 2026-10-23).** `family` is one of `"full"`, `"stagger"`, `"rounded"`,
   `"shortBack"` and `"notched"`; one this version doesn't know reads as `"shortBack"`. Each is a
   full block with a pattern of spots left out, every line centered. `files` is the count of a
   full line: across a full rank, or down a full file when `byFile`. With the family and the spot
   count it names one version. When the count changes, a recipe keeps its layout: it lays out as
   the family's version nearest its proportions, or, when the family can't make the count, as
   Short back as wide. Neither is written back, so the layout returns with the count. Only Full
   and Short back take `stagger` (a stored value; nothing in the UI sets it since #408); the
   other families center their lines and ignore it. The
   last-used family is the user's, kept in localStorage (`openmarch:shapeLastLayout`) like stars,
   not in the show.

Verification: `distributor.test.ts` checks the box's Files spots against the block generator for
every count from 1 to 120 and every file count, turned and flipped, as old and new recipes;
`distributionSession.test.ts` saves a staggered box through `placementOf` and reads it back
through `boxesAt`, reads an old `pattern: "grid"` recipe unchanged, and fills a fake closed kind;
a browser scenario in `box-tool.spec.mts` places a box and finds its distribution in the recipe.
`outlineMode.test.ts` (#390) round-trips an outline's gap through a recipe, checks it goes back to
its side's middle when its spot is gone, and reads a broken `oddGap` as the default; a browser
scenario places an outline on an odd count with its gap moved and finds it in the recipe.
`circleTool.test.ts` checks a circle's neighbors are one interval apart at every count from 2 to
120, and a browser scenario places a circle and finds `circle` version 2 in Outline in its recipe.
For layouts, `layoutCatalogue.test.ts` checks every version from 1 to 120 marchers against the
full-block-minus-pattern rule, `boxLayouts.test.ts` saves a Stagger box and reads it back, and a
browser scenario finds the picked layout in the recipe.

## Revision, 2026-10-29: membership at a beat, splits and merges

Accepted with the shape host (#363). The pre-main review (#462, #463) tightened decision 4 and
the consequence about splits. None of this changes the schema.

1. **A recipe lists only marchers whose positions are in its move.** A member placed by a
   selection over several moves is left out of a recipe whose move doesn't hold it.
2. **One recipe per marcher at a beat.** Saving a recipe takes its members out of the other
   recipes of every move **ending at** the beat it's placed at (a move split off a page's shares
   it, UI-25), not of a move that only passes over that beat: an Expert move on another layer
   keeps its shape. Decision 4 is replaced by this rule.
3. **Splits and merges carry recipes.** Splitting marchers off a move moves a recipe they make up
   the whole of to the new move, and drops them from any other recipe of the old move. Merging a
   move into another re-points its recipes to the target, and their members leave the target's
   other recipes.
4. **A later page gets its own copy on any edit there.** A recipe shown at a later moment
   (Revision, 2026-10-14) is saved as a copy on that later move by any edit made there that
   changes the box, a pivot change included (#492, #499); the earlier page keeps its recipe.
5. **Saved shapes match kind and version.** A saved shape whose kind version this app doesn't
   have is skipped, not migrated, and the library says how many need a newer OpenMarch.

Verification: the db-function `shapeRecipes.test.ts` covers rules 1 to 3, including the split
and merge cases (UI-25) with undo; `boxMembership.test.ts` and `box-tool.spec.mts` cover rule 4.

## Amendment, 2026-11-01: ungrouping

**Ungroup** (Shift+⌘G on a Mac, Ctrl+Shift+G elsewhere; the field's menu; the floating editor)
turns a placed shape back into plain marchers. Nobody moves. It follows the same rules as editing
the shape (Revision, 2026-10-14), and it changes no schema. Both cases store a recipe of kind
`ungrouped` (version 1, empty `params`) with the shape's members. It describes no shape: it claims
its members from its move's end, wherever they go next, until a recipe placed later takes them
(decision 4). Against older recipes it keeps whichever members a later shape hasn't taken. Being
an ordinary recipe, it is deleted with its move, carried by splits and merges, and undone with the
positions.

1. **On the shape's own page** (or an edit window reaching back over its move), the shape's recipe
   becomes the `ungrouped` mark in place. Later pages that held the form follow. It isn't
   deleted, because an earlier recipe over the same spots would then show again: a later page's
   own copy of a box (a pivot changed there) sits on the earlier page's spots.
2. **On a later page the shape is carried onto**, the change belongs to that page. Its members are
   set there, as an edit that moves nobody sets them, and the mark is saved on that page's move.
   Earlier pages keep their shape.
3. Where no edit can be made (past the last page in Basic, the timeline not ready), Ungroup is
   refused as an edit is. While isolating a move, a shape from another move is
   refused with a toast: the isolated move can't take the change, and the shape's own move
   shouldn't lose it.
4. An app without the kind skips the recipe (decision 5), so it shows the earlier shape on later
   pages as it did before the ungroup, and a shape ungrouped on its own page disappears there
   too. Positions are unaffected.

Verification: `placedBox.test.ts` (ungrouped marchers) and the browser scenario "Ungroup on the
next page ends the box there" in `box-tool.spec.mts`.

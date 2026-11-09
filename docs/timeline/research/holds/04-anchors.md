<!-- cspell:disable -->

> **Superseded by an owner decision on 2026-11-09.** Borrowed holds are removed: every hold grows
> out of whatever last put the marcher there, a move ending at the hold's start or the starting
> spot. A hold from Hold from previous page, or left by an edit, reaches back over the Not defined
> pages to it, and a drag inside any hold moves the whole hold, including where it arrives. See
> [ADR 0012](../../../adr/0012-timeline-motion-model.md). What follows is the 2026-10-26 reasoning,
> kept for the record. The "Anchors · Borrowed hold" scenario in the
> [demo](demo/holds-demo.html) is out of date.

# Hold anchors: arrival and borrowed holds (2026-10-26)

Status: **accepted with the review's fixes**. The owner agreed in principle on 2026-10-26, "if
independent reviewers agree". Three reviewers (model consistency, storage and code fit, simulated
designers) all found it **sound with fixes**; the fixes are below. It refines decisions 3, 17 and
R3 in the [README](README.md), the rules in [01-edit-rules.md](01-edit-rules.md), and the
[ADR draft](02-adr-amendment-draft.md). The first version (an `anchor` column that could stay
`count` after a drag) is superseded.

## The rule

**A hold that grows out of a diamond goes with that diamond. A hold without one borrows its spot.**

- **Arrival hold:** a move of the marcher ends at the hold's start.
  - It follows that move end when the move is retimed.
  - It is deleted when the move end goes (decision 17).
- **Borrowed hold:** nothing ends at its start. It holds wherever the marcher already is there,
  which it shows because it follows an earlier set. It's made by:
  - Hold from previous page where nothing arrives;
  - hold over the window;
  - dragging a bar's start to a count;
  - or a flag delete that leaves a hold mid-page.

Which kind a hold is **follows from the rows**: is there a row of the marcher ending at its start?
Nothing extra is stored. All three reviewers asked for this, because the first version let two
holds that look the same behave differently depending on edit history.

What follows from the rule:

- **A drag inside a borrowed hold** writes a move ending at the hold's start. The hold becomes an
  arrival hold, so deleting that move later removes the hold. It does not go back to borrowing.
  - The written move starts at the latest of: the marcher's last arrival, the end of any earlier
    hold, and the page flag before the hold's start. That way it never covers a neighbouring hold
    (consistency review M2).
- **Removing the set a borrowed hold borrows from** leaves the hold. It now borrows from the set
  before, and it stays solid. This is inherent to borrowing: the hold says "stand still here",
  not "stand at that spot". The hover text always names the current source.
- **A deleted page flag** at a hold's start leaves the hold at the same count (owner, 2026-10-26).
  If nothing ends there, it's now a borrowed hold starting mid-page.
- **Touching holds merge into one** (a hold ending exactly where another starts). Otherwise a drag
  in the first would carry into the second but not the other way round (consistency M2).
- **An Expert window that starts at or before a hold's start and ends inside it moves the hold**
  (decision 6): the written move runs from the start flag to the hold's start. The rule "a move
  created over a hold's start trims it" applies only to retimes that aren't edits, such as clip
  drags and resizes (consistency B1).
- **Hold from previous page** is an arrival hold whenever a move ends at the previous flag. That
  falls out of the rule; open question 2 of the first version is resolved.

## Keeping it true (storage review)

The shared upkeep step runs in `transactionWithHistory` before the drain, and never during undo
or redo replay. It snapshots, before the edit, the row ids ending at each hold's start. After the
edit, it checks each hold **in this order**:

1. **Trim** the parts that rows now cover (H-1).
2. **Keep** the hold if any row of the marcher ends at its start.
3. Else, if a row that ended there before still exists with a new end (a retime: clip drag,
   resize, merge refit, ripple, `updateAssignment`), **move** the hold's start to that end.
4. Else, if a row ended there before, **delete** the hold (decision 17).
5. Else it was, and stays, a borrowed hold.

Step 2 must come before step 3: Split at playhead keeps the original rows as the second half (their start changes, their end stays) and inserts a new first half, so a row still ends at a hold that grew out of the original end. Only writers that delete and re-insert a row with a different
end need an explicit old→new map. Basic's set-ending (`writePlan`) is the one known case.

**Page and beat edits (ripple).** Spelling out which edge a hold's start maps as:

- An arrival hold's start takes its row's **planned new end, by row id**. The edge map doesn't
  apply, because the ripple's stop-at-the-next-row clip applies only to rows.
- A borrowed hold's start, and any hold's end, **follow a page flag they sit on** (owner, 2026-10-28). An edge mid-page stays on its beat. A deleted flag leaves the edge on its count. This keeps "stays at the same count" true when a page is removed, a case
  where page ends and starts map differently.
- This lives in `planTimelineRipple`, so the flag-drag limits and previews (`pageFlagMoveLimits`,
  `pageFlagMoveBlock`) agree with the commit.

**Basic's `planMerge`** sweep, which deletes the moves going nowhere that follow a join, **stops
at a hold's start**, so it never deletes a hold the designer made.

## Display (simulated-designer review)

Four simulated personas answered about 15 of 24 tasks right with the first display (a bracket,
plus a dashed line back to the source). The misses had three causes:

- the dashed line sat on the same counts as the Following bar;
- a borrowed hold looked like an arrival hold after a drag (fixed by the rule above);
- two look-alike solid bars reacted to a drag in opposite ways.

So:

- **A borrowed hold gets its own look:** a lighter, hatched Held fill and a chip naming its source
  ("Held · Page 2's spot"). The line back to the source shows only on hover or selection, drawn
  above the row, never alongside a Following bar.
- **An arrival hold** grows out of its diamond, as before.
- **The drag says what it will do before you let go.** It's an in-place preview, not a toast, and
  the inspector shows the same line:
  - over an arrival hold, the bar lights back to its diamond: "moves Page 2's set";
  - over a borrowed hold, a ghost of the new move appears: "adds a move on Page 5".
- **Basic** draws both kinds as plain Held, with the source in the tooltip.
- **On the field,** a borrowed Held marcher stays solid (decision 8). Its route shows no square at
  the hold's start. Two personas read a solid dot as "has its own set here", so the hover text
  says "Held · standing at Page 2's spot".

These are simulated users. Real users still need to see it, which is a lab test with ticket E.

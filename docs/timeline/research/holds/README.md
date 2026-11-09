<!-- cspell:disable -->

# Holds: kinds, storage and display

Status: decisions taken (owner, 2026-10-24 and 2026-10-25); independently reviewed 2026-10-25
([03-review.md](03-review.md): changes made, and owner questions R1–R8); hold anchors
(arrival and borrowed holds) accepted with the review's fixes 2026-10-26 in [04-anchors.md](04-anchors.md),
and borrowed holds removed by the owner 2026-11-09 (see decisions 3 and 4 and ADR 0012);
nothing built. A
hands-on [demo](demo/holds-demo.html) (simplified: one layer, pages of 8 counts) lets you try the
rules and today's behaviour side by side. This replaces the
[keyframe model research](../keyframe-model/README.md), which is now an appendix. Code references
are to fork PR #332 (`timeline/set-following`, 9dc1fc171) unless noted. Paths are relative to
`apps/desktop/src/`.

## The goal

Make it obvious how marchers move over time. Moves already show motion. **Holds are the gap.**

The keyframe research began as an attempt to make the timeline behave like a movie editor. Its
lasting result is narrower: a precise definition of a hold, and the reasons holds are hard to see.
The full keyframe model (dragging, copying and rejoining keyframes, pulling one marcher out of a
group to rejoin it, merge-in-time) was **dropped**.

## Why holds are hard to see

1. **The timeline is organised by moves, and a hold is the absence of one.** A move is a shared
   clip with a start, an end and a group, so there is something to draw. A hold is one marcher not
   being in any move for a while. There is no row to draw it on.
2. **Every hold indicator today is a point or a count, never a stretch.**
   - The fade (#332) marks counts, and treats walking and holding the same.
   - The diamonds mark arrivals only.
   - The inspector's "Hold from Page N" line is for one marcher at one count.
   - The only stretch display, the page-box hold bars, was removed by #332 in favour of
     diamonds.
3. **Nothing shows where a hold ends,** that is, where the next move takes over.
4. **Some holds act without being visible.**
   - A move that goes nowhere still stops later pages from following earlier edits.
   - Under #332 it has no diamond, Remove keyframe can't reach it, and the keep chain calls it
     "own" (#317, finding 10 of the appendix).
5. **Some holds are made by accident.** After Split at playhead, Remove keyframe leaves "stand
   still, then double speed" (question 14 below).

## Definitions

For one marcher, a **hold** is any stretch where it stands still. Which move is in charge at a
count comes from the layers. The spec §6.2 rules are decided (a page's move is underneath, a
later start wins, and on the same start the shorter wins; ADR 0012 amendment 2026-10-16) but not
built: today each edit still chooses layers (`stealLayer`, `db-functions/timelineCommands.ts:285`).
A move hidden under another neither breaks a hold nor makes one. Nothing here depends on the
derivation being built: the hold invariants are checked against the stored rows (Storage).

A hold has two ends:

- **Arrival:** where the last move in charge ends, or beat 0 (the home). The keyframe diamonds
  show this today.
- **Departure:** where the next move takes over. Nothing shows this today.

There are **two kinds** of hold (decision 1 removes the third, kept spots):

| Kind          | Stored as                    | Edit an earlier page | Edit a page inside it                                |
| ------------- | ---------------------------- | -------------------- | ---------------------------------------------------- |
| **Following** | nothing: a plain gap         | follows              | starts a new set there                               |
| **Held**      | the gap plus a **hold mark** | follows              | **moves the whole hold**, including where it arrives |

"Keep this page as it was" stops being a kind of hold. It becomes an edited page: an ordinary move
whose end happens to be the old spot.

Every **stored move end** that is visible (its move is in charge when it ends) is a **keyframe**,
whether or not the marcher moved (decision 13). #384 already made the keyframe test check the
move's own end.

## Scope: shapes and transitions are not covered yet

This design assumes **today's move model**, where one transition bundles four things: when (its
range), where (a shape or points), how (the path style) and who (its slots). The owner's
direction (2026-10-26) is to separate them, and the ownership model is its own research
(fork issue #434):

- **shapes:** an equation that distributes marchers into spots, with no timing;
- **transitions:** isolated blocks of transition logic on a track;
- **keyframes:** each marcher's arrival, whether it was dragged or produced by a shape.

So **nothing here decides how shapes or transitions behave.** Holds touch them only through a
**two-operation contract** that every transition type, and the shapes it uses, will have to
define:

1. **Cut a block in time** at a count.
2. **Remove a marcher from a block** for a range of counts.

Holds never look inside a shape or a path style. Where a rule below mentions shapes or
follow-the-leader (decisions 4, 16, R4, R5), it is provisional until the ownership model lands.
Tickets built from this doc should say the same.

## Vocabulary (owner, 2026-10-28)

Working words since 2026-11-02 (owner): **Defined · Held · Not defined**, and **Define as shown**
for Set as shown. They live only in the `timeline.terms.*` block of `apps/desktop/i18n/en.json`,
read through `apps/desktop/src/timeline/holdTerms.ts`; the rest of this doc still says Set/Not set.

The UI uses three words for a marcher's state on a count:

- **Set:** a keyframe, where a move of its own ends.
- **Held:** a stored, deliberate hold.
- **Not set:** nothing decided. The marcher shows the last set spot, and moves with edits to it.

"Following" in these docs (and in the code) means **Not set**. The UI never says "Following",
"linked" or "follows", and the follow-link chain icons are not shipped. The dashed Not-set bars
show the same thing, and they light up during a drag. Two commands change names:

- the unlink action is **Set as shown**;
- Set to previous page, in timeline mode, is **Clear this page**.

## Decisions

Owner, 2026-10-24 and 2026-10-25. The diagrams are in [images/](images/); each one shows today,
the problem and the proposal. They are generated by `images/gen.py`.

### A. Kinds and storage

1. **Remove stored kept spots (#158).** "Only this page" before an edit writes the old spots on
   the following pages as ordinary moves. `timeline_kept_assignments` goes; migration 0018 is
   unreleased.
2. **A Held hold is a mark over the gap, not a move.** One page or many is the same thing.
   - There is no copied position, so editing the arrival moves the whole hold for free.
   - It can't override motion, because it only exists where no move is in charge.
   - Basic's "a move can't cross a flag" lock doesn't apply to it.
   - A hold stored as a move that goes nowhere was rejected. It copies the position (which goes
     stale), it takes part in layers (a hold nested in a longer move stops the marcher), it looks
     like motion, and a hold crossing a flag would be locked in Basic.

### B. Making and editing a Held hold

3. **Making one** (always explicit: a selection or an edit never creates a hold on its own):
   - **Hold from previous page** with marchers selected holds **this page**: it shows what the
     previous page shows. Every hold grows out of whatever last put the marcher there (owner,
     2026-11-09, reversing 2026-10-26): a move ending at the hold's start, or the starting spot.
     Where nothing arrives at the previous flag the hold **reaches back** over the Not defined
     pages to the latest of the marcher's last row end, the end of its own earlier hold (they
     merge), or the start of the show. If they have a move of their own over the page, it's taken
     out of that page first, as Set to previous page does (16).
   - **Drag a bar's end** to make a hold longer or shorter. A hold's start is fixed by the rule
     above, so it has no drag.
   - In Expert, **hold over the window** between the start flag and the playhead.
   - **Make all selected Held:** in the right-click menu and the inspector, offered when a
     selection is mixed inside a hold (R1).
4. **A drag on a count inside a Held hold moves the whole hold.** It edits the move that arrives
   at the hold's start, exactly as a drag at the arrival count would, so a shape that arrives
   there follows today's rules for shape edits. The whole bar lights while you drag.
   - **Every hold has something that arrives at its start** (owner, 2026-11-09): a drag inside
     it always moves that arrival, and the starting spot for a hold from the start of the show.
   - **A mixed selection** (some Held, some Following) edits each marcher by its own kind, with
     **no toast** (owner, 2026-10-25, R1). Before the drag, the inspector says "4 of 12 Held";
     during it, the Held marchers' bars light back to their arrival page. See
     [q4](images/q4.svg).
5. **Split hold here** on the bar's right-click, then drag. Not a modifier key: one gesture with
   two meanings would be invisible and easy to trigger by accident.
6. **Leaving early and joining late are per marcher.** Each marcher's hold runs from its own
   arrival to its own departure.
   - **Leaving early:** shorten that marcher's bar, then place it where it goes.
   - **In Expert, one step:** a window that starts inside the hold. **The window wins** (owner,
     2026-10-25, R2): the hold ends at the start flag, and the window becomes a new move. A
     window that starts at or before the hold's start and ends inside it moves the hold.
7. **Excursions are deferred.** An excursion is a short move inside a hold that returns to it,
   with the return pointed at the hold. Until then, a move inside a hold splits it.

Converted page-era shows get **no** hold marks. Page mode's repeated positions can't be told apart
from stale copies (defined-coordinates finding 7).

### C. What you see

8. **A Held marcher draws solid** on the field: its position is decided.
9. **A marcher partway through a move draws solid too.** Dashed means only "not set yet". Where a
   coordinate is actually set is shown two ways, see [q9](images/q9.svg):
   - squares on the selected marchers' route, the way After Effects draws a motion path;
   - #332's bold label on the exact count.
     This drops #332's flash of solid dots while scrubbing past their set counts.
10. **Hold bars come back, at exact counts,** for the selected marchers, from arrival to
    departure:
    - **Following:** light, dashed;
    - **Held:** solid.
      The departure end is the "when does it go again" signal.
11. **The keyframe diamonds stay.** Diamonds mark arrivals; bars run from a diamond to the next
    departure.
12. **No follow-link chain icons; the unlink action stays as Set as shown** (owner, 2026-10-28,
    superseding the 2026-10-25 "merge #297" answer). The dashed Not-set bars already say "this page
    shows an earlier spot", and they take over #297's lighting during a drag. **Set as shown**, in
    the page box menu and on the bar, writes an ordinary move at the spot the marcher shows, so the
    page becomes Set: #158's "only this page", with no arming step. Re-linking is Clear this page
    (16). See [q12](images/q12.svg), which shows the older chain idea.
13. **Every stored move end shows a diamond,** even when the marcher doesn't move. #332's "did it
    move" test (`timeline/timelineSetFollowing.ts:36`) goes. This removes the invisible pins
    ([q15](images/q15.svg)).

### D. Remove and related commands

14. **Remove keyframe joins the two moves when the next move starts on the removed count.** See
    [q14](images/q14.svg).
    - In practice that is right after Split at playhead. The marcher walks the original move at
      even speed instead of standing still and then going at double speed.
    - Basic's point remove already does this (`db-functions/timelinePointMoves.ts:514-540`).
    - **Only at counts that aren't page flags** (review, semantics M1). Basic splits moves at
      every new flag, so a join at a flag would join almost everywhere and make moves that cross
      flags. At a flag, Remove behaves as today: the page follows the page before.
    - **With the whole membership selected** (#470). For part of a group, those marchers are pulled
      out of both halves and joined (R4, #471).
    - Otherwise the behaviour is unchanged.
15. **Remove keyframe's moves on the next page stay ordinary moves,** as since 272f83526. With
    13 they always show a diamond, and with 1 nothing else marks them.
16. **Clear this page (Set to previous page in timeline mode, renamed 2026-10-28) never makes a
    hold.** It makes the page Not set again, and it is how a page is re-linked.
    - "Hold from previous page" is the separate command in 3. See [q16](images/q16.svg).
    - **Gap found 2026-10-25:** today it only deletes a marcher's _own one-slot_ page move
      (`db-functions/timelineMoves.ts` `ownPageMoves`). For marchers in a shared or longer move it
      writes a move that goes nowhere instead, and every converted show's page moves are shared.
      Under 13 that would show a diamond, so the command would look like it did nothing.
    - **Fix:** cut the shared or longer move in time at the page's flags, then remove the
      marcher from that page's part, compacting the slot as Basic's Set to previous page already
      does (review, storage M4 and semantics B1). Other pages keep their motion. The Expert drag
      back in a shared move gets the same fix (storage M6). Shapes and follow-the-leader are
      owner question R5.
    - **Shared curved moves (fork #584, 2026-11-01):** a cut restarts a curved path after the
      cut, which would change the motion of the others in the move. So where others share such a move,
      the marcher is first taken into a move of its own and only that is cut. A direct path is
      still cut for everyone, since no one's motion changes. Where split by marcher refuses (an
      inheriting follow-the-leader order), the marcher keeps its moves and is named.
    - **The cleared marcher's own arc (fork #591, 2026-11-01):** the part of an arc before the page
      stays an arc of the same circle at the same speed (a smaller bulge), so every count before
      the page is where it was. Rows whose spans start at different counts need different bulges,
      so they get transitions of their own.
17. **Removing the keyframe where a Held hold begins removes the hold too.** The pages become
    Following. The hold meant "stand at this spot", and the spot is gone. No next-page stay is
    written inside the hold (review, semantics M3). Undo restores both. See
    [q17](images/q17.svg).

### E. Basic

18. **Held holds can span page flags in Basic,** because they're marks, not moves.

## Storage (proposal for the ADR amendment)

A new side table, kept apart from the motion tables the way kept spots are. It is app data, not
resolver data.

```text
timeline_held_marks
  id          INTEGER PRIMARY KEY        -- rowid, so undo restores the same row (C-2)
  marcher_id  INTEGER NOT NULL REFERENCES marchers(id) ON DELETE CASCADE
  start_beat  INTEGER NOT NULL           -- the arrival: a row end of this marcher, or 0; >= 0
  end_beat    INTEGER NOT NULL           -- where the hold ends; > start_beat, <= the show's end
  UNIQUE (marcher_id, start_beat)
```

- **Not in `timeline_change_log`; the resolver never reads it.** The marcher holds there anyway,
  because no move is in charge (spec R-6). The table changes only edit routing and display.
- **It is in `tablesWithHistory`,** `DISPLAY_TABLES` and the query invalidation map, so a
  mark-only edit (a bar-end drag, Split hold, their undo) refreshes the views. Every edit that
  writes it is one undo step with the rows it belongs to.
- **Invariants,** kept by the write paths, which [01-edit-rules.md](01-edit-rules.md) lists:
  - **H-1:** no row of the marcher overlaps the mark;
  - (H-2, "starts at an arrival", was dropped 2026-10-26. A hold may start anywhere its growth
    allows; what it grows out of follows from the rows, and since 2026-11-09 the upkeep keeps
    every hold growing out of a move end or the starting spot. See ADR 0012.)
  - **H-3:** one marcher's marks don't overlap.
- **These are plain SQL over `timeline_assignments`,** with no derived spans needed: if any row
  covers a count, some row is in charge there (review, storage M1). So they are checked **at
  commit time**, beside `timeline_commit_violations`.
- **A shared upkeep step in `transactionWithHistory`,** before the drain, keeps them:
  - it trims marks that rows now cover;
  - it deletes marks whose arrival is gone;
  - paths that move an arrival pass an old→new map, so the mark follows instead of being
    dropped.
    It never runs during undo/redo replay (C-6).
- Removing `timeline_kept_assignments` (decision 1) is part of the same amendment.
- Draft amendment text: [02-adr-amendment-draft.md](02-adr-amendment-draft.md).

## Tickets (filed 2026-10-28)

Fork issues #466–#479. Every ticket carries the scope note.

| #    | Ticket                                                       | Blocked by   |
| ---- | ------------------------------------------------------------ | ------------ |
| #466 | Set as shown: protect a later page before an edit            | –            |
| #467 | Remove stored kept spots                                     | #466         |
| #468 | Every stored move end is a keyframe                          | –            |
| #469 | Clear this page really unsets (take a marcher out of a page) | #363 on main |
| #470 | Remove keyframe joins the halves after a split               | #363 on main |
| #471 | Joining after a split for part of a group                    | #469, #470   |
| #472 | First Held hold, end to end                                  | #363 on main |
| #473 | Holds stay correct across every edit                         | #472         |
| #474 | Holds grow out of what put the marcher there (reach back)    | #473         |
| #475 | Shaping a hold                                               | #473         |
| #476 | Expert hold tools                                            | #473         |
| #477 | Not-set bars and departure ticks                             | #466, #472   |
| #478 | Field look: solid when decided                               | #472         |
| #479 | Squares on the selected marchers' route                      | –            |

## Confidence and gaps

- **Reviewed:** [03-review.md](03-review.md).
- **Reproduced in the app (2026-10-27):** questions 14 and 15, see [Repro](#repro).
- **Read in code only:**
  - the layer rules and the dead-diamond fix (#384, with unit and resolver tests);
  - #332's look rule;
  - Remove keyframe deleting the moves that end on the count;
  - Basic's point remove joining moves;
  - Remove's next-page moves being ordinary since 272f83526;
  - #297's unlink storing a kept mark;
  - the Set to previous page gap.
- **Not prototyped:**
  - **The hold mark.** The resolver and undo follow known patterns. The cost is the upkeep:
    every path that writes moves has to keep H-1 to H-3 (about 30 paths, see 01).
  - **Route squares (9).** #337 draws the route only from the start flag to the playhead;
    drawing every set spot along a selected marcher's route is new.
- **Simulated users only:** #297's study scores.

## Repro

Both cases were reproduced in the real built app, headless, on fork `timeline/set-following` at
a4fc8e354 (#332 with #384), 2026-10-27. They were driven through the UI, with positions read
from the app's resolver (`window.openmarchResolver`) and the drawn state from `window.fieldTest`.
The scenarios are kept outside the repo (`~/om-capture/scenarios/holds-repro-14.mjs` and
`holds-repro-15.mjs`).

**Question 14: Remove keyframe after Split at playhead.** A page's own move has no clip, so it
can't be split at the playhead from the UI. The closest route was used instead:

1. Split 8 marchers off into a move covering Page 3.
2. Split at playhead at mid-page.
3. Remove keyframe at the split, for one marcher (T1).

T1's step length per count across Page 3:

|        | Counts 1–4 | Counts 5–8  |
| ------ | ---------- | ----------- |
| Before | 53.90 each | 53.90 each  |
| After  | 0, 0, 0, 0 | 107.80 each |

**Reproduced:** T1 stands still, then walks the whole way at exactly double speed. The inspector
shows the step size in red. ([still](images/repro-14-after-remove.png))

**Question 15: the invisible pin.**

1. T1 holds through Page 3.
2. Nudge Page 2. Page 3 follows: no diamond, drawn Following.
3. Plain Remove keyframe on Page 2. A move is written on Page 3 back to the old spot, and a
   diamond appears.
4. Nudge Page 2 onto exactly that spot. **Page 3's diamond disappears and T1 draws Following**,
   yet the inspector shows "Hold · Moves on this page" with **Remove keyframe greyed out**: the
   move that goes nowhere can't be removed. ([still](images/repro-15-invisible-pin.png))
5. Nudge Page 2 again. **Page 3 doesn't follow** (its spot is unchanged), and its diamond
   silently comes back.

**Reproduced,** exactly as the code reading predicted (decision 13 fixes it).

Other things seen:

- T1 draws Following partway through a move. That's #332's rule, which decision 9 changes.
- Split at playhead is only reachable on a move's clip, not on a page's own move.

## Prior art

DAWs, animation tools and lighting consoles only; see the appendix
[03-prior-art.md](../keyframe-model/03-prior-art.md). The ones that bear on holds:

- **Blender's Moving Hold key type and dope-sheet hold bars:** holds drawn as stretches.
- **After Effects' hold icon:** a hold is a visible kind of key.
- **Blender's Only Insert Needed and Clean Keyframes:** equal keys are data the user chose, and
  cleanup is always explicit, never inferred.
- **After Effects' roving keyframes:** separate where from when.

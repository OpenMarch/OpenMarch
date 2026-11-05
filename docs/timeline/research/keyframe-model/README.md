<!-- cspell:disable -->

# Keyframe model: what a keyframe is when the show is stored as moves

Status: **superseded by [../holds/README.md](../holds/README.md)** (owner, 2026-10-24/25), kept as
the appendix it builds on. The owner chose not to build a keyframe model: the lasting result is
the hold definition, the write-path inventory (01), the operations notes (02) and the prior art
(03). The dead diamond (finding 3) is fixed by fork PR #384. Started 2026-10-20 off fork `main`
(b87507f9c); code read at fork PR #332 (`timeline/set-following`, 9dc1fc171). Paths are relative
to `apps/desktop/src/` unless they start with `docs/` or `apps/`.

The owner wants the timeline to behave like a movie editor's keyframes. Their starting position,
not yet decided:

- **Q1.** Any point the designer defined is a keyframe, even at the same spot as the keyframe
  before it (a **hold keyframe**).
- **Q2.** **Remove keyframe** rejoins the motion on both sides, as a movie editor does: the
  marcher walks evenly from the previous keyframe to the next. That would apply inside a page
  (after Split at playhead, fork #327) and possibly at page flags too.

This folder is the audit that should come before deciding either one. It is not a design.

## Notes in this folder

| File                                   | What                                                                                                  |
| -------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| [01-write-paths.md](01-write-paths.md) | Every code path that writes timeline rows, and whether it makes stray keyframes under each definition |
| [02-operations.md](02-operations.md)   | Every keyframe operation (add, remove ×2, retime, split, merge, pass-through, copy/paste, undo)       |
| [03-prior-art.md](03-prior-art.md)     | Additions to `defined-coordinates/03-prior-art.md`: delete, roving keys, hold keys, cleanup           |

## The case

Page 2 runs over counts 9–17. A straight move from A to B is split at 13 (Split at playhead,
`db-functions/timelineSplitAtBeat.ts:29-55`), so there are two moves:

- X over [9, 13) to M, the sampled midpoint;
- Y over [13, 17) to B.

Then the keyframe at 13 is removed.

```
before            9 ───────── 13 ───────── 17
                  A ── X ───→ M ── Y ───→ B        even speed, one straight line

today (#332)      9 ───────── 13 ───────── 17
                  A  (holds)  A ═══ Y ══→ B        4 counts still, then 2× speed

Q2 (rejoin)       9 ────────────────────── 17
                  A ────────── Y ────────→ B        even speed again
```

Today's **Remove keyframe** deletes every row of the marcher that ends on the count
(`db-functions/timelineUnset.ts:76-101`). The next move's stored start doesn't change, so the
deleted move's counts become a hold.

## What we found

1. **The model already stores half of a movie editor's keyframe.** An assignment stores where the
   marcher arrives (the slot's destination) and when (`end_beat`). It does not store where the
   marcher starts: that origin is derived (spec R-4, `docs/timeline/spec.md:578-585`). It does
   store **when the marcher sets off** (`start_beat`), and a movie editor has no such datum.
   - A movie editor's motion always runs from one key to the next.
   - Here, when a move starts after a gap, its `start_beat` acts as a **hidden keyframe**: a
     timed point with no stored position. It is the end of a hold.
   - Today's Remove makes one of these hidden keyframes at 13. That is why it reads as "hold, then
     2× speed".
2. **#332's keyframe is derived from coordinates, which breaks the defined-coordinates rule.**
   `marcherSetBeats` (`timeline/timelineSetFollowing.ts:27-40`) counts the end of any non-hold span
   that moved more than 1e-6 and isn't kept. The rule in
   `docs/timeline/research/defined-coordinates/05-model-sparse.md:62` is "coordinates never stand
   in for intent". Three consequences:
   - A hold the designer stored deliberately is not a keyframe:
     - Keep (`db-functions/timelineKeepHere.ts:174-192`);
     - Add selected marchers on a holding marcher (`db-functions/timelineMembership.ts:394`);
     - a split of a stay.
   - A row Basic wrote on the designer's behalf is a keyframe if it happens to move (see 01, F1).
   - Only Page N's kept move does move, but it is hidden because it is kept
     (`timelineSetFollowing.ts:35`).
3. **#332 draws a keyframe that Remove can't remove.** A span ends wherever a higher layer cuts
   in (spec R-2), not only where its row ends. So `marcherSetBeats` also counts the count where a
   later move steals the marcher mid-motion.
   - A scratch run of `marcherSetBeats` on the spec's nested case gave Set beats [4, 12, 16]: row
     A [0,16) on layer 0 and row B [4,12) on layer 1 (spec G3 shape).
   - Count 4 is B's start. No row ends there, so Unset's query (`end_beat = beat`,
     `db-functions/timelineUnset.ts:76-82`) finds nothing. The diamond's **Remove keyframe** is
     enabled and silently does nothing (`timeline/timelineUnset.ts:309-321`, `NothingToUnset`).
   - The same derivation draws no keyframe at the start of a move that follows a gap. So hidden
     keyframes show up for steals but not for gaps.
4. **Basic already has Q2.** "Remove this count's position", the remove on a Basic point tick
   (`components/timeline/TimelineModePanel.tsx:132-135` →
   `db-functions/timelinePointMoves.ts:514-540`), merges the move ending on the count with the one
   starting there into `[first.start, second.end)`: a rejoin (`planMerge`, :255-295).
   - So Basic now has two removes with opposite meanings on the same count: the tick's remove
     rejoins, and #332's diamond holds.
   - `planMerge` also deletes the zero-motion moves that follow it (:269-286). That is a
     coordinate standing in for intent, and under Q1 it would delete hold keyframes.
5. **Some keyframes are written on the designer's behalf.** The full table is
   [01-write-paths.md](01-write-paths.md).
   - Since UI-18 there are no automatic stays, so the brief's "new marchers' stays to home" no
     longer exists: `db-functions/timelineMarchers.ts:115-146` writes only a home.
   - The remaining on-behalf writers are:
     - Basic's return move after a point placed in a hold (`timelinePointMoves.ts:365-380`), which
       makes the page flag a keyframe;
     - Basic's split of every simple move at a new flag (`timelinePointMoves.ts:613-669`);
     - Remove keyframe's own stays on the next page (`timelineUnset.ts:104-118`);
     - Expert Set to previous page, which writes a zero-motion slot inside a shared or longer move
       (`timelineMoves.ts:872-884`) but deletes an own page move. So one command makes a hold
       keyframe for some marchers and none for others.
6. **Groups make rejoin a membership change.** A transition spans its timeline (C-11), and an
   assignment can't start before its transition (I-A1). So rejoining one marcher of a shared
   move means one of two things:
   - moving the whole move's start, which changes everyone in it;
   - or peeling the marcher out into a move of their own, as Split by marcher already does for
     shapeless direct and arc moves (`db-functions/timelineSplitMoves.ts:185-345`). It refuses
     shapes and follow-the-leader (:236-258).
7. **Basic forbids the result of a rejoin at a flag.** A rejoin there makes one move cross the
   flag, which `timeline/basicSimple.ts:7-9` calls `crossesFlag` and Basic locks.
8. **Kept markers exist only to tell intent from coordinates.**
   - Under a definition where any stored row end is a keyframe (Q1), every zero-motion row is
     already intent, so the marker no longer has that job.
   - It still has UI jobs: the keep chain, **Follow again**, a drag back never clearing it, and
     **Move them too** skipping it.
   - Only Page N's kept move has motion, so "kept" and "hold" were never the same thing.
9. **Prior art backs Q2, and offers a third remove.** See [03-prior-art.md](03-prior-art.md).
   - In Blender and After Effects only keys are stored, so deleting a key re-interpolates its
     neighbours. That is Q2.
   - Pyware's "Delete Transition" turns the transition into a hold. That is today's behaviour.
   - After Effects' **roving keyframes** keep a waypoint's position but let its time follow, for
     even speed. That gives "smooth through", a third option Basic could use at flags.
   - Blender ships "Only Insert Needed" and "Clean Keyframes" because hold keys pile up in a
     key-only model. That is a warning for Q1.
10. **Under K1, an own move that stops moving becomes an invisible pin.** This came from a review
    of #332. Remove keyframe on Page 2 writes an ordinary, unkept stay on Page 3 that walks back to
    the old spot (commit 272f83526, `db-functions/timelineUnset.ts:111-117`, `markKept: false`).
    Suppose the designer later drags Page 2 back to that spot. The stay now goes nowhere:
    - It draws Following and gets no diamond, so Remove keyframe can't reach it
      (`timeline/timelineSetFollowing.ts:36`).
    - Its keep-chain state is "own", not "kept", because it isn't marked
      (`timeline/timelineKept.ts:48-59`). So **Follow again** isn't offered either.
    - It still blocks carry-forward. If Page 2 changes again, Page 3 walks back to the pinned spot.
      Nothing on Page 3 showed beforehand that it was pinned.
    - The same applies to **any** own move that becomes zero-motion, for example after a
      destination edit or Move them too. Under K1 the pin can't be seen or removed with the
      keyframe tools; only Delete move or a drag reaches it.
    - Under K2/K3 it is a hold keyframe: visible, and removable. This is Q1 seen from the other
      side. K1 doesn't just hide deliberate holds, it hides **accidental** ones that still act.
11. **Move them too now offers Remove keyframe's stays.** `laterOwnMoves` takes any later own move
    ending on a flag (`timeline/timelineMoveThemToo.ts:112-157`). Only shape-backed and kept
    transitions are filtered out (:207).
    - Kept spots were never offered. Remove keyframe's stays are unmarked since 272f83526, so an
      edit of Page 2 now offers to shift the very stay that Remove wrote to keep Page 3 where it
      was.
    - Whether that is right depends on what the stay means (owner question 13). If it is "the
      designer's keyframe on Page 3" (K2/K3), offering it is consistent with every other own
      move. If it is "keep Page 3 as it was", it should be marked kept, as Only Page N's moves are.

## Definitions

A keyframe definition has to say, in stored rows, what each of these is: a move start after a gap,
a move with no motion, a hidden lower layer, page 1 and homes, shared transitions, and path styles.
"Visible end" below means the marcher's winning span (spec R-2) ends at the row's own `end_beat`,
so the marcher actually arrives at the stored destination.

### K1: motion ends (today, #332)

A keyframe is the end of any non-hold span whose start and end positions differ, unless its row
is kept, plus beat 0.

| Case                   | K1                                                                                          |
| ---------------------- | ------------------------------------------------------------------------------------------- |
| Move start after a gap | Not a keyframe. The hold before it shows nothing.                                           |
| Move with no motion    | Not a keyframe (Keep, Add on a holding marcher, split of a stay, set-to-previous slot).     |
| Hidden lower layer     | Its end isn't one. A **cut** by a later start is one, though no row ends there (finding 3). |
| Page 1 / home          | Beat 0 is always one (`isSetAt`, `timelineSetFollowing.ts:53`).                             |
| Shared transitions     | Per marcher, from that marcher's spans.                                                     |
| Path styles            | Any; arcs and FTL spans count when their ends differ.                                       |

- **For:** it's built and cheap, and it matches what the field shows.
- **Against:**
  - Coordinates stand in for intent.
  - A drag of a hold one step and back flips a keyframe on and off.
  - An own move that stops moving becomes an invisible pin. It still blocks carry-forward, but
    has no diamond and no remove (finding 10).
  - It shows diamonds that Remove can't act on.
  - Kept moves that walk are hidden.

### K2: stored row ends (Q1)

A keyframe is the visible end of a stored assignment, whether or not it moves, plus beat 0. A
zero-motion row is a **hold keyframe**.

| Case                   | K2                                                                                                                              |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| Move start after a gap | Not a keyframe. It is the end of a hold, drawn as a bar (as the old hold marks did), not a diamond.                             |
| Move with no motion    | A hold keyframe.                                                                                                                |
| Hidden lower layer     | No keyframe where a higher row hides the end. A cut is not a keyframe.                                                          |
| Page 1 / home          | Beat 0, from `marchers.home_x/home_y`. Not removable.                                                                           |
| Shared transitions     | Each member's row end is that member's keyframe. All members share the count, because the transition spans its timeline (C-11). |
| Path styles            | Any. The keyframe is the arrival; the path style belongs to the segment before it.                                              |

- **For:** stored intent only, with no tolerance, and every diamond maps to a row.
- **Against:** it doesn't explain the case. After today's Remove, count 13 shows nothing, yet
  the motion visibly changes there.

### K3: row ends plus starts (the movie-editor reading)

This is K2 plus a **start keyframe** at a moving row's visible start whenever that start isn't
another keyframe: after a gap, or where the row steals the marcher from a longer one.

- A start keyframe has a time and no stored position. Its value is wherever the marcher is
  (R-4).
- It is drawn differently from a position keyframe. After Effects draws a hold keyframe as a
  half-filled icon.

| Case                   | K3                                                                                                                                                      |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Move start after a gap | A start keyframe.                                                                                                                                       |
| Move with no motion    | A hold keyframe at its end, and no start keyframe: moving a zero-motion row's start changes nothing.                                                    |
| Hidden lower layer     | As K2. A cut is the stealing row's start keyframe, so Remove has a row to act on (fixes finding 3).                                                     |
| Page 1 / home          | Beat 0. A first move that starts after 0 has a start keyframe.                                                                                          |
| Shared transitions     | As K2. One timeline start is a start keyframe for every member that departs there.                                                                      |
| Path styles            | As K2. FTL founders are rows whose span starts at the transition's start (R-3), so moving an FTL start keyframe changes who founds (owner question 10). |

- **For:**
  - Every row boundary that changes motion is visible and has an operation.
  - Both remove variants can be described in terms of keyframes.
  - Today's result in the case reads honestly: a hold until 13.
  - The converter's dropped "equal page" holds come back as start keyframes, which is what page
    mode stored.
- **Against:**
  - There are two glyphs.
  - Set vs Following stays K2: a start keyframe has no coordinate of its own, so the marcher is
    Following there.

### K4: stored points (rejected, listed for completeness)

Store keyframes and derive moves from them.

- ADR 0008 §1 says keyframe data is an export format only, never read back
  (`docs/adr/0008-timeline-motion-model.md:68-69`; spec D-2 and §11).
- It would replace the resolver's inputs, shapes and follow-the-leader, which have no
  point-only form.
- Not pursued.

## Removing a keyframe: the two variants

Under K3, removing the position keyframe at `b` for marcher `m`:

- **Rejoin (Q2):** delete the row `E` that ends at `b`, and start the next row `N` (the one that
  starts at `b`) at `E.start`. `N` keeps its destination, so the marcher walks from where it was at
  `E.start` to `N`'s end at even speed.
  - In the case this restores Y over [9,17). That is exact, because a direct split is a lerp
    identity (`timelineSplitAtBeat.ts:50-55`).
  - If `E` had a start keyframe, `N` takes it over.
  - If nothing starts at `b` (a hold follows), there are two readings, and this is owner
    question 3:
    - "the hold follows the previous keyframe": delete `E`, so the marcher stays at `E`'s origin
      until the next start;
    - "the next start keeps its value": stretch `E` to end at that start.
  - If nothing follows at all, delete `E`; later pages follow back. This is "Pages N–M follow
    back".
- **Hold instead (today):** delete `E` only. Count `b` becomes a start keyframe. After Effects
  calls this "Toggle Hold Keyframe" on the previous key; Pyware calls it "Delete Transition".

Removing a start keyframe at `d` has only one sensible meaning: start the row at the previous
keyframe. That rejoins the hold into the motion.

Remove's stays on the next page (finding 5) are needed only when the removal changes the value
that later held pages inherit. Rejoin never changes it while a later keyframe exists, so with
rejoin the stays are needed only in the "nothing follows" case.

## Shared moves

These are summarised here; the full per-operation table is in [02-operations.md](02-operations.md).

- **Today's remove on one member** deletes that marcher's assignment.
  - Expert leaves the slot vacant (D-13). Basic compacts it, moving the last slot's occupant and
    destination into the hole (`db-functions/timelineMembership.ts:530-588`).
  - On a shape the shape keeps the point.
  - **On follow-the-leader**, a deleted row frees a reserved point (spec R-9 step 5, Q-12), so
    **other members' targets move**. Removing one marcher's keyframe changes other marchers.
- **Rejoining one member** needs `N` to start earlier than its transition allows. The options:
  1. **Peel** the marcher into a new one-slot move over `[E.start, N.end)` with `N`'s destination,
     as Split by marcher does (`timelineSplitMoves.ts:314-327`). The group keeps its timing.
     - Shapes would have to be sampled to a point first, as `writeSlotMoves` already does to a
       whole transition (`timelineMoves.ts:369`), losing the shape link for everyone.
     - Follow-the-leader is refused.
  2. **Join:** only if `N`'s transition already starts at or before `E.start`, set `m`'s
     assignment start back. The span is then a join or resume and rebases (spec R-3, R-5). This
     is rare, because most rows span their transition.
  3. **Whole move:** move `N`'s timeline start for every member (a resize). That is right only
     when every member is selected.
- **Rejoining every member of a split** is a **merge in time**: the inverse of Split at playhead.
  It doesn't exist yet. Merge today is by marcher, and it re-times the source to fit
  (`timelineSplitMoves.ts:398-460`).
- **Partial selection** would split one group into a moved part and a staying part. One new move
  for the selection (like "Split N selected into new move") is easier to read than one move per
  marcher.

## Basic mode

Basic edits only page-shaped moves: every row of a marcher over a page box lies inside it, with
no overlaps, one slot, no shape, and a direct path (`timeline/basicSimple.ts:7-9`). Points inside
a page are allowed, as sub-range rows.

- **Q1 in Basic:**
  - A Basic page already behaves like a keyframe at its flag for anyone moved on it.
  - Two Basic writers create flag keyframes on the designer's behalf: the return move
    (`timelinePointMoves.ts:365-380`) and the split on **+** (:613-669).
  - Under K2 or K3, a point placed in a hold makes the flag a keyframe even though the designer
    only placed the point. Owner question 6.
- **Q2 in Basic:**
  - **Inside a page**, rejoin is already the Basic tick's remove (finding 4). #332's diamond
    should do the same there, or the two removes disagree.
  - **At a flag**, a rejoin makes a move across the flag, which Basic locks. The options:
    - (a) refuse, with **Switch to Expert**;
    - (b) **smooth through**: keep a keyframe at the flag but move it onto the straight line
      between its neighbours. Motion becomes even and the move stays page-shaped. This is the
      roving-keyframe idea from 03-prior-art;
    - (c) hold instead, as today.
  - (b) leaves the diamond in place, which may read as "Remove didn't work". Owner question 7.

## Kept markers under each definition

| Definition | Kept markers                                                                                                                                                                                                                                                  |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| K1         | Still needed. They are the only way a zero-motion row counts as intent, and K1 hides them.                                                                                                                                                                    |
| K2, K3     | **Redundant for meaning.** Every stored row end is intent, so a zero-motion row is a hold keyframe whether or not it is marked. **Still used by UI:** keep chains, **Follow again**, the drag-back rule, Move them too, and Basic's merge keeping a kept row. |

Under K2 or K3 the options are:

- retire the table (a migration, while version 8 is unreleased);
- repurpose it as "this hold keyframe was made by Keep", for the chain UI only;
- leave it as is.

Repurposing is the cheapest. Retiring it means deciding what **Follow again** means once every
hold is a keyframe: it would simply be **Remove keyframe** on a hold keyframe.

## Recommendation (lead, not a decision)

1. **Define the keyframe by stored rows, as K3.**
   - Position keyframes are the visible ends of stored rows, motion or not (Q1 yes).
   - Start keyframes are the visible starts of moving rows that don't sit on another keyframe.
   - Set vs Following keeps reading position keyframes only.
   - This drops the 1e-6 test and fixes the dead diamond at a cut.
2. **Make Remove keyframe rejoin (Q2 yes), everywhere Expert can.**
   - Keep today's behaviour as a second, named action ("Hold until here"), or drop it if nobody
     misses it in a sim round.
   - Removing a start keyframe always rejoins.
3. **Rejoining part of a group peels the selection into one new move**, the way Split by marcher
   does. Refuse shapes and follow-the-leader until shapes have a sampled form the owner accepts.
4. **Basic:**
   - Inside a page, rejoin (as the tick already does).
   - At a flag, choose between refusing with **Switch to Expert** and smoothing through. The
     lead leans to smoothing through, because it keeps Basic's promise that every page has its
     own move.
5. **Fix the on-behalf writers before shipping Q1:**
   - Basic's return move into a flag;
   - Basic `planMerge` deleting zero-motion rows;
   - Expert Set to previous page's shared-slot stay.
     Each needs a rule a designer could predict. Kept markers become a display hint, not intent.
6. **Write an ADR 0008 amendment before building.** It would define keyframes in terms of rows,
   in the same way the 2026-10-08 amendment defined "a stored zero-motion move is designer
   intent".

## Owner questions

1. **Q1:** is a stored row that goes nowhere (Keep, Add marchers, Set to previous page in a group,
   a split of a stay) a keyframe? If so, does the keyframe test stop comparing coordinates
   altogether?
2. **Start keyframes:** should the timeline show where a move sets off after a hold (K3), or only
   where marchers arrive (K2)? If shown, should it be a different glyph, and can it be dragged?
3. **Rejoin into a hold:** removing a keyframe that is followed by a hold and then a later move.
   Should the marcher stay at the earlier spot until the later move ("the hold follows the
   previous keyframe"), or arrive at the old spot exactly when the later move starts ("the later
   start keeps its value")?
4. **Q2 as the default:** should **Remove keyframe** rejoin, with today's behaviour renamed (e.g.
   "Hold until here")? Or should both stay side by side, or today's be dropped?
5. **Groups:** rejoining some members of a shared move. Should it peel them into one new move (the
   lead), peel each into its own move, refuse, or move the whole group's start?
6. **Basic's flag keyframes:** when a Basic point placed mid-page in a hold also makes the flag a
   keyframe (the return move), is that intent ("this page keeps its end") or a stray keyframe?
   The same question applies to Basic's split of every move when a page is added.
7. **Basic at a flag:** should Remove keyframe on a flag refuse with Switch to Expert, smooth
   through (the keyframe stays, moved onto the straight line), or hold as today?
8. **Kept markers:** under K2 or K3, retire them, keep them as a "made by Keep" display hint, or
   leave them as they are? Is **Follow again** then just Remove keyframe on a hold?
9. **Drag back:** UI-18 made a drag back onto the start clear the move. Under Q1 a hold keyframe is
   intent, so should a drag back leave a hold keyframe instead, or keep clearing it?
10. **Follow-the-leader and shapes:** removing one marcher's keyframe in an FTL move changes other
    members' targets. Is that refused, warned, or accepted? Can a member be peeled out of a shape
    (losing the shape link for everyone, as `writeSlotMoves` already does)?
11. **Page flags:** a flag drag moves every keyframe on the flag (roll edit, UI-16). In a movie
    editor, markers never move keys. Keep it this way?
12. **Merge in time:** should Split at playhead get an inverse ("Join moves at playhead") that
    rejoins every member? Under Q2 that would be Remove keyframe with everyone selected.
13. **Remove keyframe's stays:** are they the designer's keyframes on the next page (ordinary own
    moves, as since 272f83526: shown, removable, offered by Move them too), or a "keep this page as
    it was" (marked kept: never offered by Move them too, with Follow again)? Under K1 an unmarked
    stay that stops moving becomes an invisible pin (finding 10). Is that acceptable until K1 is
    replaced?

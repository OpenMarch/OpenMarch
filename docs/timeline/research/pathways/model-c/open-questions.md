<!-- cspell:disable -->

# Open questions that change stored data

Draft 2, 2026-11-05. The owner answered Q1–Q4 the same day. **No question that changes stored
data is open.** Below are the decisions, then what revision 2 adds to storage, so the owner can
see it without asking.

## Decided (owner, 2026-11-05)

| Q   | Question                                                                                                                              | Decision                                                                                                                                                                                            | What it writes                                                                                                                              |
| --- | ------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Q1  | A spot is emptied on a shaped move (S-46). Does it keep its path and Adjust?                                                          | **Decided: keep.** The spot keeps its lane and Adjust for whoever is cast there next. The path goes only when none of its lanes has an occupant left                                                | The lane row stays; AP-H3 deletes the route's lanes only when none is occupied (AP-R15, QA-AP-L13)                                          |
| Q2  | The start-of-move occupant of a spot changes (recast, least travel, swapping end spots). Does the start offset follow the new person? | **Decided: follow the new person**, from where they stand. The path and the Adjust stay with the spot. Only the start-of-move occupant's offset is rewritten; later occupants are not moved (07 N9) | AP-R16 rewrites `lanes.offset = A_new − F`. Each later occupant of the spot first gets the old offset in its own row's `path_timing.offset` |
| Q3  | Follow the leader: is an Adjust keyed by slot or by the end spot?                                                                     | **Decided: the slot**, so it stays with the marcher                                                                                                                                                 | `lanes.slot_index`; no stored target index                                                                                                  |
| Q4  | Rejoin after Detach of an adjusted member                                                                                             | **Decided, changed from the draft's recommendation: always drop the old Adjust.** The spot goes back on the plain group lane. There is no conditional keep and no toast; undo restores it           | AP-R10 sets `adjust` and `group_adjust_id` to NULL. K6 no longer records the old `group_adjust_id`                                          |

The owner had already decided these earlier, so they are not asked again: Adjust or Detach; the
spot or the person; count or place; late-join modes; occupancy by range; copies before links;
Adjust on follow-the-leader; Detach staying in step; file versions; precedents.

## New in revision 2 that changes stored data

None of these needs an owner answer. Each follows from a decision above or from a re-check
finding, and is listed so nothing new in the file goes unseen.

1. **`assignments.path_timing.offset`** (optional `[dx, dy]`, only on a row with no founding
   span). This is the mechanism for Q2's "later occupants are not moved". It is a new key in a
   column the same step already adds (step 12), so it needs no extra migration and no extra
   bump.
2. **`routes.timing.handoff.rehomed`** (optional, a UI badge only, step 25). AP-H1 sets it when
   it re-writes a squeezed handoff (07 N4).
3. **The one-step minimum spacing** (`s_min = 11.25` field units) is not a column. It does
   change what can be stored: commit view E-J5 refuses two keys, or a ramp's two ends, closer
   than one step on a straight corner-to-corner stretch, and the write path refuses the rest.
   It is a fixed constant rather than the field's step size, so changing the field's step size
   never makes a saved show fail its checks. **The owner may want to confirm the value.**
   Revision 2 picked one step (I-J4 gives the reasons). Two steps would refuse S-08's tight
   dodge.
4. **An exact group cut writes extra route points** (step 17): one new kept corner, with a new
   id, at each Adjust key or ramp end next to the cut. These are ordinary route points, and no
   new kind of fact.

## Chosen without asking, flagged for the owner

- **The cut point isn't stored as an inner corner of the first half.** The owner's wording was
  "keep the cut point as a fixed corner on both halves". The cut point is each half's end point
  (`to` and `from`), which is fixed. Storing it as an inner point too would need a new stored
  clock fact ("arrive at the last point on the last count"), because the first half's clock
  must end there and cleaning would merge it into `to`. Making every bend next to the cut a
  kept corner gives the same result: no key or ramp is straightened. If the owner wants the
  literal form, that is a new stored fact (spec-changes AP-R7, "Why C isn't also stored as an
  inner point").

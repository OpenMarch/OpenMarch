<!-- cspell:disable -->

# 10: Windows that span existing pages

Status: research. Decided (owner, 2026-10-04): §4.1 straight through is the default, with
"Only change Page 2's ending" in the toast; §4.2 is allowed with the catch-up (not refused).
Start-flag pin behavior (§4.3, Q3) is moved to the `ui.md` backlog for a longer conversation.

## 1. What fails today

A UI-10 drag runs `moveMarchersInRangeInTransaction` (`apps/desktop/src/db-functions/timelineMoves.ts:524`),
which adds the moved marchers through `addMarchersToTimelineInTransaction`
(`timelineMembership.ts:240-251`). For each moved marcher m and each move H it is already in,
two refusals can fire:

| Window W = [S, P) against H                               | Refusal                                                                                                                   | 06 case |
| --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- | ------- |
| W wholly contains H (S ≤ hs, he ≤ P, W ≠ H)               | "T3 is in a timeline over beats [16, 32), inside [0, 48); adding it would replace that move"                              | F / H′  |
| W runs into H partway (S ≤ hs < P < he)                   | "T3 is in a timeline over beats [32, 48), which only partly overlaps [0, 40): joining a move partway isn't supported yet" | G       |
| W starts inside H and runs past its end (hs < S < he ≤ P) | allowed: an exit                                                                                                          | D       |

A window only crosses a page flag when S is **pinned**. Unpinned, S follows navigation to the
flag before P (ui.md UI-10, "The start flag follows navigation"). A pin comes from dragging a
range on empty strip space or dragging the start handle, and it **survives navigation** until P
moves to or before it. So a cross-page window is usually deliberate, but it can also be a
stale pin the user forgot.

## 2. What the user might mean

Example: pages 1 [0,16), 2 [16,32), 3 [32,48). S pinned at 0, P at 32, four guard members
dragged to X.

| #   | Intent                                                                                                                                                                                 | How likely                                                                                                                                        | Evidence                                                                                                                                                                                                                                                                                                                             |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| I1  | **Move straight through.** These marchers go from where they are at S to X at P, ignoring their sets on the flags in between (a long feature move, a slow guard drift, a 32-count arc) | High when the window was set on purpose, which is required to cross a flag                                                                        | Pyware's Count Track docs give exactly this case: "most performers might transition counts 0-16, while the guard transitions 0-40" ([count track](https://www.pyware.com/guide/3d/10.0/en/topic/count-track)). Pyware sub-sets (2A) are the same idea ([page tab editor](https://pyware.com/guide/3d/11.0/en/topic/page-tab-editor)) |
| I2  | **Change the set at P only.** They meant to edit Page 2's ending; S is a stale pin from earlier work                                                                                   | Medium. The pin survives navigation, so a user who pinned S, then played or scrubbed forward and paused, has a long window without asking for one | UI-10 lead default (pin persistence) isn't validated. Keyframe tools (After Effects, Blender) never delete keys between two keys when you set one, so "only the end changes" is the familiar keyframe rule                                                                                                                           |
| I3  | **Hold, then move.** Stay put through Page 1, then move on Page 2                                                                                                                      | Low as the meaning of a plain drag; it is a different gesture (pin S at 16)                                                                       | Not reachable from this gesture without extra input; ignore                                                                                                                                                                                                                                                                          |

**I1 is the default to build; I2 must be one click away and visible.** The gesture's inputs (a
pinned S, a drag at P) say I1. Nothing in the gesture distinguishes I2, so the app should do I1,
show clearly what it did, and offer I2 as the alternative in the same feedback. This follows
06's pattern of acting and then offering the other choice ("Join here instead"). It also follows
the general rule of using undo or an alternative instead of a confirmation dialog: a modal on
every drag across a flag would break the drag-adds flow UI-10 was written to protect.

## 3. Options considered

| Option                        | What it does to m                                                                                            | Pros                                                                                                                                         | Cons                                                                                                                                       |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| **A. Override (recommended)** | M = [S,P) one layer up (`stealLayer`). M wins every beat of W (R-2); the inner page rows stay stored, hidden | Matches I1 and the decided storage O. Non-destructive: deleting M's clip brings the page sets back. **No schema change.** One edit, one undo | m's positions on the inner flags change, which breaks 06's rule 1 ("never move a dot the user didn't drag"). This needs to be visible (§4) |
| B. Clamp to the last flag     | Treat W as [last flag before P, P). Same as 06 H′: edit that page's destination                              | Nothing moves except X. Safe for I2                                                                                                          | Silently ignores a pinned S that the user set on purpose. The guard's 0–40 move becomes impossible from the canvas                         |
| C. Ask on drop                | Popover: "Move straight through Page 2" / "Keep Page 2"                                                      | Never wrong                                                                                                                                  | Interrupts every cross-flag drag. Brings back the step count that UI-10 removed                                                            |
| D. Bake through the flags     | Write m's straight-line position onto each inner page's destination                                          | Every page still has a set for everyone, as in Pyware                                                                                        | No longer one move: editing X later leaves the inner points behind. Against the owner's "one block of logic" goal                          |
| E. Trim / delete inner rows   | Remove m from the inner pages                                                                                | Simple data                                                                                                                                  | Destructive, and storage O was chosen to avoid this                                                                                        |

## 4. Recommended behavior

### 4.1 W ends on a flag (or between flags with no move running past P)

Use **A**. Lift the "inside" refusal (`timelineMembership.ts:246-250`) for the drag path. Then:

1. M = [S,P) is created (or reused, one per range) with m at `stealLayer`, ending at X.
2. Every inner move for m is overridden for all of W. Its row stays stored, and the resolver
   doesn't read it while M sits above it. The move after P starts from X (R-4), so nothing
   later changes.
3. **Feedback**:
   - **Strip.** M is a clip drawn across the flags it crosses (it is off the page boxes when S
     is pinned off a flag; when S and P both sit on flags, it needs a clip anyway because the
     page box only stands for the exact-range timeline). Each overridden page box gets a
     "−n" notch at its start and "+n" at its end, as in 06 §5.1. The tooltip reads "T3–T6 move
     straight through Page 2 (counts 1–16)".
   - **Canvas.** The overridden sets for m on the inner flags are drawn as gray ghost dots on M's
     path while the clip is selected (07 G0, throwaway resolver without M's rows). This shows
     what was replaced.
   - **Toast** (info, `timeline.edit.passThrough`): "T3–T6 now move straight from count 1 to
     Page 3, through Page 2. **[Only change Page 2's ending]**". The action undoes the edit and
     re-runs it as option B (clamp), as one undoable edit.
4. **Deleting M's clip** restores the page sets (storage O). The clip menu gets "Delete move
   (bring back Page 2's sets)" wording.

The standalone **Add selected marchers** path (if any caller is left after UI-10) keeps the
refusal, because there the add itself would move dots with no drag to justify it.

### 4.2 W ends partway into a move (P inside a page, or inside a clip that runs past P)

This is 06 case G: m must **enter** that move at P. The live-link answer is WP-O3/WP-O4, which
isn't built. Until then there are two stopgaps (06 Q6). **Decided: allow with catch-up.**

- **Allow with catch-up** (recommended). M overrides up to P. The later move for m resumes
  at P and rebases (R-5, D-12): it heads from X to its own destination in the time left.
  `D-REBASE` already flags this. Show the step-size warning and name it in the toast: "T3–T6
  catch up to Page 3's set by count 16." This uses only existing rules, needs no schema change,
  and WP-O4 later replaces the catch-up with a linked entry.
- **Refuse, with a one-click fix.** Keep the refusal but make the toast's action "End at
  Page 3's flag (count 1)", which moves P to the flag and retries.

The current refusal text ("End the range at beat N") asks the user to fix it by hand. Either
stopgap is better than that.

### 4.3 Stale-pin guard rails (for I2)

- While S is pinned and W crosses a flag, the window overlay on the strip shows the crossed
  flags with a small "passes through" tick, so a long window is visible **before** the drag.
- First-run hint, shown the first few times per session: "Your start flag is pinned at count 1
  of Page 1. Click a page to edit just that page."
- Consider unpinning S on Play/Stop after it has been crossed by navigation (V-22).

## 5. Feasibility of 4.1 (read, not run)

- `stealLayer` (`timelineCommands.ts:251-279`) puts M one layer above the highest overlapping
  row. R-2 then makes M the winner over all of W. QA golden G3 shows the same layering with
  nested rows.
- After the add, `moveMarchersInTimelineInTransaction` checks the winner at P
  (`timelineMoves.ts:430-473`). M is the top row there, so the "another move decides where it
  is" refusal doesn't fire.
- The inner rows still satisfy I-A3 (different layers) and I-A1 (inside their transitions).
- Not yet checked by running: history/undo of the add plus move, and the strip's packing of a
  clip that crosses flags. A spike would cover these with a vitest case (W = [0, 32) over two
  pages, then delete M and check that the page sets return) and a `/validate` capture.

## 6. Questions for the owner

1. **Default = straight through (A), with "Only change Page 2's ending" in the toast?** Or do
   you expect B (only the last page changes) more often in practice?
2. **P inside a later page, before links exist:** allow with catch-up, or refuse with a one-click
   "End at the flag"? (Same as 06 Q6.)
3. **Pin persistence:** should a pinned S survive navigation across several pages? This is the
   main source of accidental I2 windows.

## 7. Work package sketch

- **WP-X1 + WP-X2: built** on `timeline/cross-page-windows` (2026-10-04). The drag path adds with
  `passThrough` (`addMarchersToTimelineInTransaction`), so both refusals are lifted there and
  kept for the add on its own. `TimelineMoveResult.passThrough` reports the overridden and
  caught-up moves. `toastPassThrough` (`timeline/timelinePassThrough.ts`) shows the info toast;
  its **Only change Page N** runs `moveMarchersFromFlagInstead`, a separate undoable edit that
  takes the marchers out of the long move (deleting it when empty) and moves them over
  `[last flag, P)`. It is decided from the rows as they are, not by undoing: each marcher
  keeps where it is at P now (so later nudges survive), and the long move is deleted only if the
  drag created it and it is now empty. Marchers the drag added without passing through anything
  stay in the long move. When P is partway into a page the label reads **Only change from Page
  N's set**. Not built yet: the −n/+n notches on overridden page boxes, the step-size warning
  in the catch-up toast, and the deletion wording in the clip menu.
- **WP-X3**: ghosts of overridden sets (shares 07 G0) and the crossed-flag ticks on the window.

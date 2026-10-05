<!-- cspell:disable -->

# 06: Authoring UX for exits, entries and returns (strip and canvas)

Status: research, not decided. This builds on the README's "Confirmed (2026-10-04, second round)" decisions and on UI-10. Link semantics are left to `05-link-semantics.md`, ghost visuals to `07-ghost-rendering.md`, and storage to `08-storage.md`. Where this doc names rows, it assumes the lead's recommendation: layers stay, plus two additions, a per-slot **ghost start** (`slot_origins`) and a **linked destination** (`slot_destinations.source = 'linked'`, pointing at a host transition and slot). 08 may rename them.

**Where the code is.** The UI-10 gesture code exists only in the P8.17 worktree, `/home/alex/GitHub/OpenMarch-p817` (branch `timeline/p8-17-core-loop`, PR #73). The main checkout's `timelineMoves.ts` has no `moveMarchersInRangeInTransaction`. All file:line citations below are for that worktree, under `apps/desktop/src/`.

## 0. What the gesture is today

- **The window.** It is S to P, derived in `stores/TimelineSelectionStore.ts:157-168` (`editWindow`). Pinning is at :270-297. Nothing is dimmed (:219-224).
- **A canvas drag.** `planCanvasEdit` (`timeline/timelineCoordinateWrites.ts:101-121`) turns a drag into `{kind:"range"}`. Then `moveMarchersInTarget` (`db-functions/timelineMoves.ts:562-602`) and `moveMarchersInRangeInTransaction` (:509-554) run. That second function adds the missing marchers (`addMarchersToTimelineInTransaction`) and sets their endings, all in one `transactionWithHistory`.
- **Refusals that block the scenarios:**
  - `timelineMembership.ts:236-240`: partial overlap (images/0).
  - `timelineMembership.ts:241-244`: the range contains another move ("would replace that move").
  - `timelineMoves.ts:446-449`: more than one row.
  - `timelineMoves.ts:451-454`: the row ends before the timeline ends.
  - `timelineMoves.ts:455-459`: "has another move … that decides where it is".
- **Layering.** New rows go one layer above the highest overlapping row (`stealLayer`, `db-functions/timelineCommands.ts:251-279`).
- **Strip.**
  - Page-box timelines get no clip (`components/timeline/TimelineModePanel.tsx:121-125`, `timelinesOffPages` at :240-251).
  - Clips are packed first-fit, and clips that only touch share a row (`components/timeline/TimelineGeometry.ts:67-99`). So yellow followed by pink lands in one lane, as in Scenario 3, with no extra work.
  - Inactive spans are dashed (`components/timeline/TimelinePrimitives.tsx:539-573`).
  - A clip click selects it (:474-477). A clip drag commits a whole-range shift (:478-517). There is no edge resize yet.
  - The right-click menu now only has **Delete page flag** (`components/timeline/TimelineRangeMenu.tsx:139-168`).

## 1. Terms

- **W = [S, P):** the edit window.
- **m:** one moved marcher.
- **X:** where m is dropped at P.
- **Host H = [hs, he):** a move whose row decides where m is on some beat in W. It can be a page-box timeline or a clip.
- **k:** the exit beat. **j:** the enter beat. **r:** the rejoin beat of an automatic return.
- **M:** the move the drag makes over W, using UI-9's one-slot transition per marcher, in W's timeline (one timeline per range still holds).
- **R:** the automatic return.

Two rules apply to every gesture:

1. **A gesture never moves a dot the user didn't drag.** Making a link or a ghost start must leave every drawn position where it was, except the dropped marchers at P. This rule picks every default below.
2. **The window decides; m's moves are compared with it independently.** Each relation of W to each host H gives one of the outcomes in §2. A window that spans several hosts is the sum of those outcomes. Refusals happen only for the cases in §5.4.

## 2. Gesture → result table

Each row covers one moved marcher m and one host H. A move with no relation to W is untouched.

| #   | W relative to H                                                                        | What the drag creates for m                                                                                                                        | Ghost start / link                                                                                               | Change it afterwards                                                                                        |
| --- | -------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| A   | W = H                                                                                  | Nothing new. Sets H's destination for m to X (today's edit)                                                                                        | none                                                                                                             | —                                                                                                           |
| B   | Strictly inside (hs < S, P < he)                                                       | **Exit** H at k = S. M = [S,P) ends at X (placed). An **automatic return** R = [P,r) ends on a live link to H's path at r. After r, m is back in H | m still founds H, so no ghost start is needed. R's destination is linked to (H, slot) at r                       | Drag R's end (§4.2). **Remove return** gives exit-and-hold. **Join H here** gives r = P (§3)                |
| C   | Starts inside, ends at H's end (hs < S, P = he)                                        | **Exit** H at S. M = [S,he) ends at X. H's remainder for m becomes a ghost                                                                         | none                                                                                                             | Drag the leave notch to move k. **Return to H…** is not offered, because nothing of H is left               |
| D   | Starts inside, ends after H (hs < S < he < P)                                          | **Exit** H at S. M = [S,P) ends at X. Whatever follows H for m is handled by its own row (E, F, G or a hold)                                       | —                                                                                                                | As C                                                                                                        |
| E   | Starts at H's start, ends inside (S = hs, P < he)                                      | As B with k = hs: M [hs,P) to X, then R [P,r) linked to H at r. m becomes a **joiner** of H at r                                                   | Ghost start for (H, m) = m's old origin at hs (the owner's founder→joiner seed). H's planned path doesn't change | **Join H here instead** removes R and links M's end to H at P (§3.2)                                        |
| F   | W wholly contains H and H ends strictly inside W (S ≤ hs, he < P, W ≠ H)               | **Keep H.** m **enters** M at he: m's M row is [he,P) and ends at X. H's destination is linked to M's path at he                                   | M's ghost start for m is **solved** so that M's path passes through H's existing end at he (§3.3). Nothing moves | **Snap landing to M's path** re-seeds the ghost and moves H's end. Dragging the ghost start re-aims it live |
| G   | H starts inside W and ends after it (S < hs < P < he): the next move m is crossed into | m **enters** H at P. H's row for m starts at P. M's end is linked to H's path at P                                                                 | H's ghost start for m is **solved** so that H's path passes through X at P. Nothing else moves                   | As F: **Snap landing to H's path**, or drag H's ghost start                                                 |
| H′  | H lies inside W and ends at P (S < hs, he = P)                                         | Not a new move: the drag edits **H's destination** for m, because H is the move that brings m to P. An info toast names it                         | —                                                                                                                | Today this is the refusal at `timelineMoves.ts:455-459`. It is removed                                      |
| —   | Holding (no host) over part of W                                                       | M covers those beats as a founder from where m stands                                                                                              | —                                                                                                                | —                                                                                                           |

**Several hosts at once (Scenario 1's crossing yellow).** H1 = green [1,17), H2 = blue [17,33), W = [9,25). Green gets D (exit at 9). Blue gets G (enter at 25, solved ghost). The result is one yellow clip [9,25), a −4 notch on green at count 8, and a +4 notch on blue at count 8 of blue. No rebase or catch-up happens anywhere.

**Two defaults the owner's rules didn't fix.**

1. **G and F solve the ghost start instead of seeding it.** In G, m used to found blue, so the owner's rule would seed blue's ghost start at m's old origin. That would pull yellow's end off X. The drop was made in this very gesture, so rule 1 keeps it. The solve for a direct path is `o = (X − p·d)/(1 − p)`. Open question Q2.
2. **E defaults to the automatic return, as the owner's rule says** ("ends strictly inside → exit + return"). Arriving late is one click away (§3.2). Q1 asks whether E should default to arriving late instead.

## 3. Creating a JOIN (Scenario 2)

Both orders below end with the **same rows**: a feeder Y = [hs,j) whose end is linked to green at j, m's green row starting at j, and a stored ghost start. That removes the order dependence noted in the ui.md backlog ("moving marchers between timelines … where order matters"). The ghost value depends on the path taken: seeded in 3.1, solved in 3.2 and 3.3.

### 3.1 "Already in green, now make them arrive late". This is the zero-change path and the one we recommend.

1. Select the 4 marchers, which are founders of green. Put P on the merge beat j inside green; S follows to green's start.
2. Right-click the window (the selection overlay or green's page box) and choose **Join Green at count j−hs**. The command only appears when every selected marcher founds the move that holds P.
3. The result is one edit with no visible change:
   - Ghost starts are stored at their current origins. This is the owner's seed.
   - Y = [hs,j) is created, one transition per marcher, with destinations linked to green at j.
   - Their green rows now start at j.
   - A +4 join notch appears at j, and the Y clip appears above green.
4. Move where they come from: click page N−1's box (window ending at hs) and drag them to the yellow spots. That edits the previous move's ending. Y now runs from the yellow spots to green at j, live. Green's ghost starts don't move, because they are stored.

### 3.2 The same thing through a drag (case E)

- Pin S = hs, put P = j, and drag them to X. That gives E's default: a detour and a return at r.
- Then right-click the yellow clip, or its leave notch, and choose **Join Green here instead**. That deletes R, links Y's end to green at j, and re-solves the ghost start through X so nothing moves. The rows are then the same as in 3.1.

### 3.3 "Coming from elsewhere, now merge into green" (Y already exists, m isn't in green)

1. Make the feeder first, as today: P = j, drag the joiners to their landing spots. This creates Y = [hs,j). The same gesture also works in the other order (3.1).
2. Click green's page box (W = green, P = he) and drag the joiners to their green destinations.
   - Green wholly contains Y, which ends inside it: case F. Y is kept. The joiners enter green at j. Their ghost starts are solved through Y's landing spots, so the landings don't move.
   - Y's end is now linked. Today this step is refused at `timelineMembership.ts:241-244`.
3. Optional: drag the gray ghost starts. This gives the right half of the mockup, and Y's ends follow green's path live. **Align ghosts to group** (notch menu) sets each ghost to its destination minus the founders' mean displacement. That gives the left half.

**Ghost starts follow the group.** When the user drags every founder of a host at hs (window ending at hs) by one transform (a translation, or a rotate or scale from the alignment tools), the host's ghost starts get the same transform in the same edit. A drag of only some founders leaves the ghosts alone, unless they are selected too. **Select Green's members** (page box or clip menu) selects the founders and ghost starts together.

## 4. The automatic return (Scenario 3)

### 4.1 Default rejoin beat

**r = min(P + (P − S), he).** The return takes as long as the exit, as the mockup draws it (yellow ≈ pink). Other options were considered:

- A fixed number of counts ignores the exit's pace.
- Halfway to `he` depends on how much of the host is left, not on the detour.
- `he` itself makes the return as long as the rest of the host.

The return always lasts at least 1 beat, and r never goes past he. If r = he, R lands on H's destination for m. That is still a live link, so editing green's end moves the landing.

The return is a straight `direct` move. It lives in its own timeline [P, r), which is off a flag, so it is a clip. All the gesture's marchers share it.

### 4.2 Editing it

- **Drag the rejoin beat.**
  - The right edge of the pink clip is a handle. Dragging it is a range edit of R's end only. P stays, and the edge snaps to page lines and counts (UI-2), with Alt to turn snapping off.
  - It is clamped to (P, he]. The badge reads "rejoin count 12".
  - The link beat is always R's end. We recommend 05 derive it rather than store it, so no second row has to stay glued.
- **Move the exit/return seam.** The M|R seam is one handle. It moves M's end and R's start together (when m reaches X).
- **Remove the return.** Select the pink clip, then press Delete or choose **Remove return (hold there)**.
  - This becomes exit-and-hold: R is deleted and m's H row is trimmed to [hs,S), so H never resumes (no implicit rebase).
  - m holds at X until its next move, which then starts from X.
  - A toast says so: "T3–T6 now hold at their spots until beat 33. Page 2's move starts from there."
- **Return later or earlier for only some marchers.** Choose **Split selected off** on the clip. It moves the selected marchers' R rows into a new timeline [P, r′). Per-clip editing stays the default (Q4).
- **Reshape the path.**
  - R is an ordinary transition. The inspector's path style and bulge apply (`TimelineTransitionEditor`).
  - 07 may add an arc midpoint handle on the canvas.
  - A drag of the dots at r while the pink window is selected is not an edit, because the landing is a link. The hint reads: "T3 lands on Page 1's path at count 12. Drag the pink clip's end to change when."
- **Bring back the return.** On an exit with no return (C/D trimmed, or after Remove), the menu offers **Return to Green…**. It is enabled only when he > P, and it creates R with the default r.

## 5. Strip and canvas

### 5.1 Strip

- **Clips.** Only off-flag timelines get clips (UI-10). In Scenario 1 the yellow clip [9,25) is drawn across flag 1, over green's and blue's page boxes. In Scenario 3 yellow and pink share a lane because touching clips pack together.
- **Return glyph.** A return clip shows a small ↩ at its left edge and the label "Return to Green". Its color comes from the usual palette (`timeline/timelineViewModel.ts:114-115`).
- **Handoff notches.** A notch sits **on the host at the handoff beat**: on the host's clip, or on the bottom edge of its page box when the host has no clip.
  - **−n** (leave): n marchers exit here. It is drawn in the mover's color, like the mockup's yellow arrowheads.
  - **+n** (join): n marchers enter here. A small link glyph sits on the feeder clip's linked end.
  - A return shows −n at S and +n at r.
  - Labels use the host's counts ("−4 · count 8"). The tooltip adds beats and drill numbers: "T3, T4, T5, T6 leave Page 1's move at count 8 (beat 9) for the yellow move."
  - Notches stack when they share a beat. A host whose clip is narrower than its notches shows one "±n" pill.
- **Membership inside a clip.** In case F, m's row starts later than the clip, so that part is dashed (UI-1). This is unchanged.
- **Hover.** Hovering a notch highlights those marchers on the canvas and shows the host's ghost dots (07). Hovering a clip or page box highlights its notches.
- **Click.**
  - A notch selects its marchers and leaves the window alone.
  - A clip sets the window to its range, as now.
  - A page box unpins S (UI-10).
- **Dragging a notch.**
  - A leave notch moves k, which is M's start edge.
  - A join notch moves j, which is the feeder's end edge.
  - Notches are clamped strictly inside the host.
- **Context menus.** All are added to `TimelineRangeMenu`.
  - **Mover clip:**
    - Select its marchers
    - Join ‹host› here instead / Return to ‹host›…
    - Remove return (hold there)
    - Split selected off
    - Delete move (restores m's host rows and removes R)
  - **Return clip:**
    - Rejoin at count…
    - Remove return (hold there)
    - Split selected off
  - **Notch:**
    - Select these marchers
    - Move to count…
    - Snap landing to ‹host›'s path
    - Align ghosts to group / Reset ghost starts (join notches)
  - **Window or page box with founders selected:** Join ‹host› at count n.

### 5.2 Canvas: which dot a drag edits

**Select marchers, not dots. The window decides which dot is m's handle.**

- **W = H, and m is exited or joins late.**
  - m's handle at P is its **ghost** destination in H. Dragging it edits H's slot destination: the owner's "as if all marchers still go there".
  - The real dot belongs to another move. It is drawn at 60%, has no selection ring and can't be dragged. The hint reads: "T3 is in the yellow move at count 16. Drag its gray ghost to change Page 1's ending."
  - This replaces today's refusal at `timelineMoves.ts:455-459`.
  - Ghost starts at hs are handles in this window too. They write `slot_origins`.
- **W ≠ H.** The real dot is the handle, which gives UI-10's drag-adds and the §2 table. Ghosts are reference only.
- **Box and lasso select** pick up marchers through either dot. Pressing a ghost doesn't select its real dot separately.
- **Hints after a gesture.** An info toast, keyed under `timeline.edit.*`, names what was made, for example: "T3–T6 leave Page 1's move at count 8 and return by count 12. Drag the pink clip's end to change when." It is shown for the first few times per session; after that the new notches flash.

### 5.3 Messages

Refusals follow `timelineErrorMessages.ts`: a Tolgee key with an English default, E-ARGS worded by the write path, drill numbers, and the move named the way UI-10 asks ("Page 1's move", or "the move over beats [9, 25)" for clips).

### 5.4 Refusals that remain

- **Entering a follow-the-leader host partway** (R-11):
  > "T3 can't join Page 2's move partway, because that move follows the leader. Join it on its first count, or change its path style."
- **Solving a ghost start that runs away.** This happens when p > 0.9, or when the solved ghost is off the field. There is no refusal: the code falls back to the seed, moves the landing, and shows an info toast:
  > "T3's landing was put on Page 2's path, because a spot that close to the move's end can't be kept. Drag its gray start to aim it."
- **Arc hosts.** These use a numeric solve. If it fails, the same fallback applies.
- **More than one row** (converted shows, `timelineMoves.ts:446-449`): this stays.
- **Layer limit** (E-A3, `timelineCommands.ts:273-277`): this stays.
- **A link that would loop** (05's acyclicity check):
  > "That would make T3's move depend on itself. Move the join to another count."
- **Not refused any more:**
  - Partial overlap (images/0).
  - "Inside the range": case F keeps the inner move.
  - "Another move decides where it is": cases H′ and A use ghost handles.
  - "Ends before the timeline's end": joiners' rows now legitimately start late or end early.

## 6. Undo: one gesture, one `transactionWithHistory`

All reads and refusals come before the first write (today's pattern, `timelineMembership.ts:248-270`). Inserts go parent first and deletes child first (C-1). Linked destinations and ghost starts are checked at commit time (as with E-T1), because a link is written before its partner rows are final.

| Gesture                              | Rows, in order                                                                                                                                                                                                                                                                                               |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **B, E**                             | 1. Timeline M [S,P) if new. 2. M's transitions and slot destinations (placed X). 3. M's assignments [S,P) at `stealLayer`. 4. E only: `slot_origins` (H, slot) = old origin. 5. Timeline R [P,r) if new. 6. R's transitions and destinations (linked to H, slot). 7. R's assignments [P,r) at the same layer |
| **C, D**                             | Steps 1–3 only                                                                                                                                                                                                                                                                                               |
| **G** (crossing into N)              | Steps 1–3 for M, with M's destination written as linked to (N, slot). Then `slot_origins` (N, slot) = solved ghost. N's row for m stays, stolen up to P (or trimmed to start at P, per 08)                                                                                                                   |
| **F**                                | M's timeline, transitions and destinations (X). m's M assignment [he,P). `slot_origins` (M, slot) solved. H's slot destination set to linked (M, slot)                                                                                                                                                       |
| **H′, A, ghost-end drag**            | Update one slot destination per marcher (today's `writeSlotMoves`, `timelineMoves.ts:256-312`)                                                                                                                                                                                                               |
| **Join at count n** (§3.1)           | `slot_origins` seeds. Timeline Y [hs,j) if new. Y's transitions with linked destinations. Y's assignments [hs,j) one layer up (or trim green's rows to [j,he) under 08)                                                                                                                                      |
| **Join here instead**                | Delete R's assignments, then its destinations and transitions (and its timeline if R made it). Upsert `slot_origins` (solved). Set M's destination to linked                                                                                                                                                 |
| **Drag rejoin beat or notch**        | R-E1 range edit of one timeline edge: shrink before grow. No link row, because the beat is derived                                                                                                                                                                                                           |
| **Remove return**                    | Delete R's rows child first. Then shrink m's H assignment to [hs,S). Shrinking is always valid                                                                                                                                                                                                               |
| **Founders' start drag with ghosts** | Previous move's destinations, then `slot_origins` updates                                                                                                                                                                                                                                                    |
| **Ghost-start drag**                 | Upsert `slot_origins`                                                                                                                                                                                                                                                                                        |

New tables join `tablesWithHistory` and the query-key map, and need `test:history` coverage (01 §6.2).

## 7. Phased delivery

The work packages are named WP-O1 to WP-O6 here. The lead maps them to P8.x or a new phase.

1. **WP-O1: lift the refusal, exits only.** No schema change.
   - Remove `partlyOverlaps` and the inside refusal (`timelineMembership.ts:236-244`) for cases C, D and H′.
   - Overruns into a following move G use the old steal-and-rebase as a stopgap, with a warning diagnostic, or are refused with "Joining the next move partway comes later". The owner picks.
   - Strip: the crossing clip and −n notches on page boxes and clips.
   - Tests: Scenario 1 range moves, undo as one edit, H′ instead of the refusal.
2. **WP-O2: ghost handles for exited marchers** (with 07's rendering).
   - Ghost destinations in W = H are drag handles, using the throwaway-resolver nominal path (README).
   - The real dot is non-draggable, with the hint.
   - This delivers the owner's requirement 3.
3. **WP-O3: links and ghost starts (the model).** Needs the spec amendment (D-5, D-12), the ADR, the migration, the resolver's "on path" entry, `slot_origins`, linked destinations and the solve. No new UI beyond what tests need.
4. **WP-O4: enter gestures.**
   - G (overrun enters the next move) replaces WP-O1's stopgap.
   - F (keep the inner move and enter after it).
   - **Join at count n**, **Snap landing**, ghost-start drag, and +n notches.
5. **WP-O5: the automatic return.**
   - B and E defaults, the return clip and glyph, rejoin-edge drag, **Remove return**, **Join here instead**, **Return to…**, **Split selected off**.
   - Until WP-O5 lands, B keeps today's implicit resume. That is the R-5 rebase, already allowed because the window is inside the host.
6. **WP-O6: polish.**
   - Notch drags (seam moves) and ghosts following founders' start edits.
   - Align ghosts to group, arc solve, first-run hints, and badges on page boxes.

WP-O1 and WP-O2 can ship before the owner signs off on the spec amendment. WP-O4 and WP-O5 depend on WP-O3.

## 8. Open questions for the owner

1. **Case E** (the window starts at the group's start and ends inside it): keep the return by default, as decided, or default to "arrive late" (a join at P)? Both reach the same data in one click.
2. **Overrun and merge-into ghosts:** when the drop or landing was placed by the user, should the host's ghost start be **solved** so nothing moves (recommended), or **seeded** from the old position so the landing snaps onto the host's path?
3. **Rejoin default:** is "as long as the exit, at most to the host's end" right?
4. **Rejoin per clip or per marcher** by default? We recommend per clip, with **Split selected off**.
5. **Exit-and-hold:** after **Remove return**, the marcher holds until its next move, which then starts from where it stands. Is that right?
6. **WP-O1 stopgap for overruns:** rebase with a warning, or refuse until WP-O4?
7. **Ghost starts on a partial founder drag:** leave them, as proposed, or move them by the mean of the dragged founders?

## Critical files for implementation

Paths are in the P8.17 worktree (`/home/alex/GitHub/OpenMarch-p817`).

- `apps/desktop/src/db-functions/timelineMembership.ts`
- `apps/desktop/src/db-functions/timelineMoves.ts`
- `apps/desktop/src/timeline/timelineCoordinateWrites.ts`
- `apps/desktop/src/components/timeline/TimelinePrimitives.tsx` (with `TimelineRangeMenu.tsx`, `TimelineModePanel.tsx`)
- `apps/desktop/src/timeline/timelineErrorMessages.ts`

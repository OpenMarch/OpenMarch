<!-- cspell:disable -->

# M3: tracking with pins (modeled on ETC Eos)

Read-only research on `/home/alex/GitHub/OpenMarch-defined-coords` (a4d42cd1), 2026-10-08. Paths are
relative to `apps/desktop/` unless they start with `docs/` or `packages/`.

## 0. Summary

- **M3 = M2 + three pieces of designer intent, almost all expressible with today's rows.**
  Timeline mode: no row = inherited hold (R-6, already true at `packages/core/src/timeline/resolver.ts:495`).
  A stored row ending at a flag = _defined_. A defined row whose destination equals where the
  marcher would be by inheritance = a **pin** (Eos block). A pin is an ordinary one-slot shapeless
  `direct` row — the same shape today's automatic stays have. What changes is **who writes it**:
  only the designer (Pin, This page only, Set to previous/next, cue-only delete), never the app.
- **No schema change and no resolver change for v1.** Pin vs move is derived (destination equals
  origin at the flag, like Eos showing a value equal to the tracked one as a block). File stays at
  user version 8 (no release reads 8 yet; `fileVersion.ts:23-25`).
- **Page mode bridge: track by exact equality, no schema change** (not M1's flag). An edit on page N
  also rewrites the unbroken run of later rows that are bit-equal to page N's _old_ value, per
  marcher, stopping at a shape membership. "This page only" is an undo-style toast action. Same
  rule as the converter uses, so page mode and timeline mode agree before and after the Phase 9 flip.
- **Why automatic holds existed** (§2): page-mode parity plus P7.2's editor, which could only edit a
  transition ending at the page end. UI-10's "dragging adds" removed that need, so the holds are now
  pure liability.
- **Pins should be absolute in v1; the live link belongs to "This page only"'s return, later.**
  An absolute pin is exactly the Eos block. A link "back to where page 1 left it" is the ownership
  "exit + linked return" pattern with a hold as host; it needs 05's j = H.end case and a backward
  link rule, so defer it until `timeline_links` lands.

## 1. Definition

### Timeline mode (the model)

|                                       | Stored                                                                         | Derived                                                                                               |
| ------------------------------------- | ------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------- |
| Defined at flag F for marcher m       | a winning assignment row of m whose span ends at F (any transition, any layer) | —                                                                                                     |
| Inherited at F                        | nothing                                                                        | position = R-6 hold at the end of m's previous span (or home)                                         |
| Pinned at F                           | a defined row (normally one-slot shapeless direct over F's page box)           | "pin" = destination == m's inherited position at the row's start, exactly; drawn as a pin, not a move |
| Pin that upstream edits made non-zero | the same row                                                                   | drawn as a move with a "pinned" note only if we add the deferred `intent` column (§4)                 |

Rules: (T1) the app never writes a row the designer didn't ask for (removes the five writers in
`01-current-model.md`); (T2) an edit at F writes rows only for moved marchers, so later inherited flags
follow up to m's next defined flag (Eos "until a move instruction"); (T3) a pin is a stop like any
definition; (T4) the first page/home always defines everyone (homes, `marchers.home_x/y`).

### Page mode (bridge, until Phase 9)

Storage unchanged (dense `marcher_pages`, `schema.ts:180-233`). Derived "inherited" = row bit-equal
(x, y) to the previous page's row. Pins are not representable; "This page only" is.

## 2. Why `addHoldingMoves` exists, and why M3 drops it

- Added in 549451b2 (P7.4/P7.5, PR #26, 2026-10-01). Doc comment `src/db-functions/timelineRipple.ts:49-56`:
  "page mode copies the previous page's coordinates onto it, so marchers hold through it … The
  holding transition is what 'move the marchers on the new page' edits (D-16, P7.2)."
- P7.2's `moveMarchersOnPage` refused any marcher "with no move ending at the page's end beat"
  (`docs/timeline/phases/07-page-parity.md:439`; structural moves deferred to P8.9, line 517). So a
  new page without holds was _uneditable_ in timeline mode; the holds made it editable.
- That reason is gone: UI-10 "Dragging adds" creates the window's timeline and transitions on drag
  (`docs/timeline/ui.md:294-305`; `moveMarchersInRangeInTransaction`, `src/db-functions/timelineMoves.ts:560-628`).
  The UI-9 **+** flag already writes no timeline rows (`src/db-functions/pageFlags.ts:20-31`), as C-12 says.
- Motion is identical with or without the holds until something upstream changes, so deleting
  `addHoldingMoves` (`timelineRipple.ts:526-646`, call at :517-520) changes no positions today.
- Same story for new marchers' stays to home (`src/db-functions/marcher.ts:200-232`,
  `src/db-functions/timelineMarchers.ts:100-172`): written so UI-9 could edit them (membership);
  UI-10 has no membership step.

## 3. Effect table

| Dimension                                               | M3 behavior (proposed default)                                                                                                                                                                                                                                                                                 | Cost / risk                                                                                             | Code that changes                                                                                                                                                       |
| ------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Playback / paths                                        | Unchanged: no row = hold (R-6). Pins replay as moves when non-zero. Fewer rows = cheaper resolve.                                                                                                                                                                                                              | none                                                                                                    | none (`resolver.ts:495`)                                                                                                                                                |
| Page vs timeline mode                                   | Timeline: sparse + pins. Page: dense + equality tracking (bridge). Same visible semantics except pins.                                                                                                                                                                                                         | Page-mode default changes for all users                                                                 | `src/db-functions/marcherPage.ts:142-205` (opt-in `track`), canvas writers `src/components/canvas/Canvas.tsx:266`, `src/utilities/RegisteredActionsHandler.tsx:714,763` |
| Insert page: append / middle / split                    | No rows: new page inherits. **+** already does this; createPages/createLastPage/split stop writing holds.                                                                                                                                                                                                      | Tests assume holds                                                                                      | delete `addHoldingMoves` `timelineRipple.ts:517-646`; tests `src/db-functions/__test__/timelineRipple.test.ts`                                                          |
| Delete page flag only (UI-9)                            | Already look-preserving: motion unchanged, page 2's move becomes an off-flag clip.                                                                                                                                                                                                                             | none                                                                                                    | none (`pageFlags.ts`)                                                                                                                                                   |
| Delete page with beats (ripple)                         | **Cue-only by default**: before dropping page N's page moves, for each marcher whose page N+1 was inherited, write N's old destination as a definition over N+1 (join N+1's page timeline). Later flags keep their look. Option "Delete and let later pages follow" = today's behavior.                        | 1.5–2 d; must stay U-3 ordered; N+1 then shows a move a1→a2                                             | `timelineRipple.ts:330-350` (removed set) + new step after 7                                                                                                            |
| Delete a defined page between inherited ones            | as above: N+1 gets the definition, N+2.. inherit from it                                                                                                                                                                                                                                                       | as above                                                                                                | as above                                                                                                                                                                |
| Remove one marcher's move (not a page)                  | **Track** (later inherited pages revert), toast "Pages 3–4 changed too · Keep their look" (writes the definition on N+1)                                                                                                                                                                                       | owner question Q3                                                                                       | `removeAssignmentRowsInTransaction`, `src/db-functions/timelineMembership.ts:393+`                                                                                      |
| Reorder / retime pages, beat insert/delete              | Unchanged ripple of existing rows (row edges follow flags/beats). Inherited pages have no rows to move.                                                                                                                                                                                                        | none new                                                                                                | `timelineRipple.ts` (minus holds)                                                                                                                                       |
| Edit earlier page (ripple)                              | Stops at m's next defined flag (move or pin). Toast: "Moved on pages 2–4; page 5 is defined" + "This page only".                                                                                                                                                                                               | Edits leak far forward unseen (risk 1)                                                                  | toast in `src/timeline/timelineCoordinateWrites.ts:364+` result handling                                                                                                |
| "This page only"                                        | Same edit also writes a pin on the next window `[P, min(next flag, m's next row start))` at m's _old_ position, only for moved marchers that were inheriting there. Offered as a toast action (applies as its own edit) and a modifier (Alt+drag/nudge) in the same edit.                                      | Name clashes with UI-10's **Only change Page N** (`timelineMoves.ts:637`); rename to "Keep later pages" | new option on `moveMarchersInRangeInTransaction` `timelineMoves.ts:560`                                                                                                 |
| Pin / Hold here, Unpin                                  | Context menu on selected marchers at P: Pin writes a zero-motion row over the page box ending at P (via the same range write, destination = current position). Unpin deletes m's rows ending at P in that window. Pin on an already defined marcher = no-op.                                                   | over-pinning recreates the bug (risk 2)                                                                 | `timelineMoves.ts:560` (reuse), `timelineMembership.ts:393`                                                                                                             |
| Partial edits                                           | Per marcher by construction (S3).                                                                                                                                                                                                                                                                              | none                                                                                                    | none                                                                                                                                                                    |
| Moved back to exactly inherited position                | Not defined → no row written (stays inherited, Eos records no move for a tracked value). Already defined → row kept, now shown as pin.                                                                                                                                                                         | exact compare only                                                                                      | `moveMarchersInTimelineInTransaction` `timelineMoves.ts:403+`                                                                                                           |
| Undo / redo                                             | Every variant is one `transactionWithHistory` edit (tracked page-mode rows, pins, cue-only delete). No new tables, so no history trigger changes. Toast actions are their own edits.                                                                                                                           | none                                                                                                    | —                                                                                                                                                                       |
| Appearances                                             | Already tracking: `tag_appearances`/section appearances apply "on a page and onward" (`schema.ts:350-367`) = Eos model; timeline shows last flag crossed (owner, 2026-10-06). Same latent bug on page delete: `start_page_id` cascades (TODO at `schema.ts:360`); cue-only delete should move them to N+1 too. | small follow-up                                                                                         | `schema.ts:358-361` FK + page delete                                                                                                                                    |
| 3D view                                                 | Reads resolved positions; no change. Can draw pins later.                                                                                                                                                                                                                                                      | none                                                                                                    | none                                                                                                                                                                    |
| Exports (PDF sheets, page positions, video, dots-to-om) | Timeline mode samples the resolver at flags (`src/timeline/timelinePagePositions.ts:56`); page mode reads dense rows. No change.                                                                                                                                                                               | none                                                                                                    | none                                                                                                                                                                    |
| .dots format / migration                                | No schema change in either mode. v8 stays (unreleased). Dev v8 files with automatic stays: re-convert by hand (precedent: ADR 0001 C-11 "converted again by hand") or a dev console "remove automatic holds" that deletes zero-motion page-box rows. Intent can't be recovered.                                | dev files only                                                                                          | `src/timeline/convert/planPageConversion.ts:425-435`                                                                                                                    |
| Older releases / legacy readers                         | Page mode tracked rows are plain rows; old releases read and edit them (without tracking). Timeline tables invisible to old releases (ADR §6).                                                                                                                                                                 | none new                                                                                                | —                                                                                                                                                                       |
| Copy tools                                              | Set to previous page (timeline) = **Unpin** for that page (inherit) if m's row lies inside the window, else pin at previous position. Set to next = absolute pin-like copy (as today). Page mode: these are edits, so they track by equality too.                                                              | changes set-to-previous semantics slightly                                                              | `timelineCoordinateWrites.ts:305-332`, `src/utilities/setMarchersToNeighborPage.ts:105-127`                                                                             |
| Shapes / curved SVG shapes                              | Page mode: equality tracking **stops at a page where m is in a shape** (shape_page_marchers), so shapes never diverge from their marchers; shape writes (`shapePages.ts:156`) don't track. Timeline shape-backed rows are definitions.                                                                         | page shapes need the extra stop                                                                         | `marcherPage.ts:142` track option                                                                                                                                       |
| New marchers mid-show                                   | Home only, no rows: holds at home everywhere (inherited). Page mode keeps creating rows (identical, so they track).                                                                                                                                                                                            | none                                                                                                    | drop join `marcher.ts:225-229`, `timelineMarchers.ts:100-172`                                                                                                           |
| Converter (page→timeline)                               | A marcher whose page N row equals its page N-1 row gets no slot; pages with no movers already skip ("no-marchers"). Deliberate stays become inherited; loss report counts them and offers "Pin these stays".                                                                                                   | changes `test:timeline` fixtures                                                                        | `planPageConversion.ts:410-435`                                                                                                                                         |
| Mental model / UI                                       | Three states, only for selected marchers (UI-12 calm): defined (solid dot, key mark on the flag), inherited (hollow/dimmed, hold bar), pinned (pin glyph). Inspector: "Defined on page 2" with jump (Eos About).                                                                                               | 3–5 d; most visible cost                                                                                | canvas `src/timeline/useTimelineStaticRender.ts`, strip `useTimelineTracks.ts`, `src/timeline/timelineInspector.ts`                                                     |

## 4. Scenario walkthroughs (pages 1–5, marchers A, B; positions at each flag)

Start for all: page 1 A=a1, B=b1 (defined).

**S1 owner's scenario.** Add pages 2–4: no rows; 2,3,4 show a1/b1 (inherited, hollow). Edit page 2 to
a2/b2: rows on page 2 only. Page 3, 4 = a2/b2 (inherited). Toast "Moved on pages 2–4". _Page mode:_
rows 3,4 equal old a1 → rewritten to a2; same view. _Today:_ page 3 = a1 (bug).

**S2.** Edit page 4 to a4/b4: defined on 4; 5 inherits a4. Re-edit page 2 to a2': page 3 follows
(a2', inherited); page 4 stays a4 (defined; A now moves a2'→a4 on page 4); toast "page 4 is defined".
_Page mode:_ row 3 equals old a2 → a2'; row 4 = a4 ≠ a2 → stop. Same.

**S3 only A on page 2.** A defined on 2; B inherited on 2–5. Page 3: A=a2, B=b1. Key mark on page 2
for A only.

**S4 delete page 2 after S1.** Flag delete: motion unchanged; old page 3 (now 2) shows a2; page-2
move is an off-flag clip. Delete with beats: cue-only → page 3 gets a definition a1→a2 over its beats;
page 4 inherits a2. M2 would snap pages 3–4 back to a1. _Page mode:_ dense, page 3 keeps a2.

**S5 insert between 2 and 3 after S1.** New page inherits a2; nothing else changes (no holds).
_Page mode:_ copy of page 2 (a2) → part of the equal run; a later page-2 edit tracks through it.

**S6 deliberate stay on 3, then edit 2.** Designer selects A,B at page 3, **Pin** → zero-motion rows
on 3 (pin glyph). Edit page 2 to a2: page 3 pinned → A moves a2→a1 on page 3; page 4 inherits a1;
toast "Stopped at page 3 (pinned)". Without pinning first: edit page 2 with "Keep later pages" → same
rows. _M2:_ no way to express it; page 3 follows. _Page mode bridge:_ page 3 equals old value, so it
tracks; designer must use the toast action (pins don't exist in page mode).

**S7 undo the page-2 edit.** One step: page-2 rows (and any pins written with it, or tracked page-mode
rows) go; pages 2–4 show a1. Redo restores all.

**S8 old v7 file, dense identical pages** (p1 a1, p2 a2, p3 a2, p4 a2, p5 a5). Page mode: opens as is;
tracking applies to the next edit (editing p2 rewrites p3, p4; stops at p5). Convert: rows on p2 (a2)
and p5 (a5); p3, p4 inherited; positions at every flag equal `marcher_pages` (P6.6 corpus still holds).
Report: "2 stays now follow earlier pages · Pin them".

## 5. Pin as absolute vs live link; joins and rebase

- **Absolute pin = Eos block.** Upstream edit can't move it; the marcher moves on the pinned page.
  Today's resolver gives this already: the pin's span founds its transition, origin by R-4,
  destination fixed (R-7). Pass-through windows (UI-10) override it one layer up and it comes back
  when they're deleted; a window ending inside the pin's page makes the pin catch up (R-5 rebase)
  but still land on its spot. README conflict 3's "Hold here instead" (exit-and-hold) is the same
  gesture — share the command.
- **"Keep later pages" as a link.** The pin it writes means "go back to where you were". If page 1
  is edited later, an absolute pin keeps the stale old spot; a link to the defining move's
  destination D(H, i) would follow page 1 and make page 2 a true detour — the ownership "exit then
  linked return" (README §Confirmed) with a hold as host. Obstacles: 05 L-2 refuses `j = H.end`
  (`05-link-semantics.md:83,182`, open Q4), and this link points _back_ (H.end < T.end), outside
  05's increasing-end chain proof; it needs its own acyclicity rule (forbid D(H) chains that reach T).
- **Recommendation:** absolute in v1 (no schema). When `timeline_links` (08 §2.2) lands, add an
  optional "return" link flavour for "Keep later pages", decided with 05 Q4. Pins never need links.
- **Deferred `intent` column** (`timeline_transitions.kind = 'pin'` or similar): only buys a label
  "pinned" after upstream edits turn a pin into a visible move, and a way to tell pins from leftover
  automatic stays. Additive, cheap later.

## 6. Compared with M2 and M1

|                                        | M1 (touched flag)                                                                                      | M2 (sparse)                   | M3 (this)                                               |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------ | ----------------------------- | ------------------------------------------------------- |
| Owner's bug fixed                      | page mode yes; timeline needs M2 anyway                                                                | timeline yes; page mode no    | both (page mode by equality)                            |
| Deliberate stay survives upstream edit | only via "touched" on an unmoved page (needs a command)                                                | no                            | yes (Pin)                                               |
| Delete keeps later look                | dense: yes                                                                                             | no (snap back on beat delete) | yes (cue-only)                                          |
| Schema                                 | column on a table frozen Phase 9, dropped Phase 10; history triggers recreated; converter must read it | none                          | none (v1)                                               |
| UI                                     | touched marker                                                                                         | defined/inherited markers     | + pin glyph, Pin/Unpin, Keep later pages, delete option |
| Days                                   | ~4–6                                                                                                   | ~3–5 core + 3–5 UI            | ~15–21 total                                            |

Extra intent buys: S6 and S4 work, and lighting-proven "cue only" escape hatches. Costs: two more
commands, a modifier, a toast flow and a third visual state. **Deferrable:** live-link returns,
`intent` column, Trace ("edit where defined"), propagation preview highlighting, page-mode pins,
cue-only for appearances. **Not deferrable if M3 is chosen:** removing automatic writers (M2), the
inherited/defined markers (otherwise tracking is invisible), and Pin.

Why not M1's flag as the page-mode bridge: the flag lives on `marcher_pages`, frozen in Phase 9 and
dropped in Phase 10 (ADR 0001 §1), so it is a migration plus history-trigger rebuild for one release
of life; older releases copying or editing rows would leave stale flags; and the only intent it adds
over equality ("deliberately stayed") is exactly what pins carry in timeline mode. Equality needs no
migration and matches the converter's rule. "Page mode stays as is" is the fallback if the owner
won't change page-mode behavior for current users.

## 7. Implementation sketch (days)

1. M2 core: delete `addHoldingMoves`; stop new-marcher stays; converter sparse; update ripple,
   membership and converter tests and `test:timeline` fixtures; dev cleanup command. **3–4 d**
2. Pin / Unpin commands (menu, shortcut), set-to-previous = Unpin. **2 d**
3. "Keep later pages": modifier + toast action, rename vs UI-10's "Only change Page N". **2 d**
4. Cue-only page delete in the ripple (+ "let later pages follow" option). **2 d**
5. Canvas/strip/inspector states, "Defined on page X" jump, propagation toast. **4–5 d**
6. Page-mode equality tracking (opt-in `track` on canvas writers, shape stop) + toast. **2–3 d**
7. Docs: ADR 0001 amendment (C-12: no page add/marcher add writes timeline rows; converter sparse);
   new `ui.md` decision (next free number after UI-14 edit moves) for tracking/pins/keep later
   pages/delete; phases/07 note superseding P7.4's hold rule; no spec change for v1 (R-6 covers it;
   a link return later amends D-5/D-12 with the ownership work). **1 d**

Total ≈ **16–19 days**; steps 1 and 6 alone fix the owner's report in both modes (~6 d).

**Tests needed:** resolution equality before/after removing holds on every ripple fixture; converter:
equal rows → no slot, positions equal `marcher_pages` at every flag (P6.6 corpus); property: an edit
at flag F changes positions only at flags in [F, next definition); pin: upstream edit leaves pinned
flag unchanged; Keep later pages writes pins only for inheriting moved marchers; cue-only delete
keeps every later flag's positions (property); page-mode run stops at first unequal row and at shape
membership; `test:history` one-step undo/redo for each; old v7 corpus opens and edits in page mode.

## 8. Top 3 risks

1. **Leaking edits.** Tracking can change page 12 while the designer looks at page 2, worst in page
   mode, where every old copy now counts as inherited. Mitigation: always-on toast with the range
   and the stop, "Keep later pages" one click away, key marks on the strip.
2. **Pins vs inherited confusion and over-pinning.** A pin turns into a visible move after an
   upstream edit; with no `intent` column it is then drawn as a move. Too many pins bring the bug
   back (the Eos block trade-off). Leftover automatic stays in dev files look like pins.
3. **Changing page-mode behavior for released users,** plus edge cases there (page shapes, pathways'
   copied `path_data_id`, `marcherPage.ts:172-195` endpoint updates on each tracked row).

## 9. Questions for the owner

1. Page mode: track by equality by default (toast "Only page 2"), offer it as an opt-in toast
   ("Also update pages 3–4"), or leave page mode as is until Phase 9?
2. "Keep later pages": modifier key, toast action, or both? And name (avoid "Only change Page N").
3. Removing one marcher's move: later inherited pages revert (track) or keep their look?
4. Delete page with beats: cue-only by default (later pages keep their look)?
5. Pin storage: absolute only for v1; is a "return to where page 1 left it" live link wanted later
   (ties to ownership 05 Q4, j = H.end)?
6. Converted old files: all identical runs become inherited; offer "Pin these stays" in the report?
7. Dev timeline files with automatic stays: re-convert by hand, or a cleanup command?
8. Should a pin be a stored kind (for a "pinned" label after it becomes a move), or derived only?

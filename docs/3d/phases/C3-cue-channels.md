---
phase: C3
title: Customization, Carry, Silk and Uniform cues
status: not-started
owner: none
branch: none
pr: none
depends_on: [C2]
updated: 2026-10-11
---

# C3: Customization, Carry, Silk and Uniform cues

Follow the protocol in [../README.md](../README.md). Claim a work package before you start, and append to the progress log as you go.

> Draft for the owner's approval (2026-10-11). This phase builds on ADR 0004's cue work, which has no phase file yet; C3.1 to C3.3 track its build steps (`docs/3d/performer-behavior.md` section 10, on the cue branches).

## Goal

Three new cue channels (Carry, Silk, Uniform) in storage and compile, their Visuals mode tabs, the Items tab for Placement, Outline geometry and artwork slots, and the optional export listing of changes.

## Read first

- [../props-spec.md](../props-spec.md): the design spec, sections on cue channels, silks, uniforms and Visuals mode surfaces. Ticket numbers on each package are the ones it cites.
- [ADR 0010](../../adr/0010-3d-view.md) D-10 and D-11; [ADR 0004](../../adr/0004-performer-cues.md) amendment of 2026-10-11
- ADR 0004 and `docs/3d/performer-behavior.md` sections 2, 3, 6, 7 and 10 (cue branches)
- `CONTEXT.md`: **Visuals mode**, **Item**, **Silk**, **Cut**, **Uniform**

## Work packages

Each field is on its own line so that concurrent claims merge cleanly. Edit only the Owner, Status and PR lines of packages you own.

### C3.1: ADR 0004 step 2 merged (cue storage)

- Owner: human
- Status: open
- PR: none
- Parallel: yes
- Depends on: —

**Goal:** a tracker. The lead marks it done when ADR 0004's storage (migration, schema, db-functions, query hooks, history, repair) is in `main`. The items migration (C2.1) is numbered after this one.

**Tickets:** 07.

**Done when:** the `cues` tables exist on `main`.

**Checks:** the lead records the merge in the progress log.

### C3.2: ADR 0004 step 3 merged (catalog and compile)

- Owner: human
- Status: open
- PR: none
- Parallel: yes
- Depends on: —

**Goal:** a tracker for `compileCues` and `traceCue` in `@openmarch/core`.

**Tickets:** 07.

**Done when:** the compile module and its tests are in `main`.

**Checks:** the lead records the merge in the progress log.

### C3.3: ADR 0004 step 8 merged (Visuals mode)

- Owner: Trevor (3d/visuals-mode)
- Status: claimed
- PR: none
- Parallel: yes
- Depends on: —

**Goal:** a tracker for Visuals mode (tabs, Who list, lanes, result row, why readout).

**Tickets:** 22.

**Done when:** Visuals mode is in `main`.

**Checks:** the lead records the merge in the progress log.

### C3.4: Carry, Silk and Uniform in cue storage

- Owner: none
- Status: open
- PR: none
- Parallel: no
- Depends on: C1.1, C1.11, C3.1

**Goal:** the three channels can be stored.

**Scope:** widen `cues.channel` (in ADR 0004's migration if it hasn't shipped, else a new migration after it); drop the dormant `equipment_state` appearance column; reject phrases on the three channels; `transition_length` ignored on them (hard cuts); cue values `library:<uuid>@<version hash>` naming an embedded Library item at its Version, plus `none` on Carry; the show's copy of a Library item can't be deleted while a cue uses it, and delete offers "Replace with…" listing the uses; save-prune counts cue references; Items never targets.

**Tickets:** 06, 07, 09, 24, 26.4, 26.10, 26.12, 26.20.

**Done when:** a Silk cue naming an embedded Artwork survives save, and deleting that Artwork is refused with "Replace with…" and the list of cues that use it.

**Checks:** schema and history tests; type-check, lint, format, spellcheck.

### C3.5: Compile Carry, Silk and Uniform

- Owner: none
- Status: open
- PR: none
- Parallel: no
- Depends on: C3.2, C3.4

**Goal:** per-marcher segments for the three channels.

**Scope:** defaults (Carry: the section's usual equipment with `carryForSection` as the fallback; Uniform: Band default or Guard default by `isGuard`; Silk: a built-in plain silk in the section's 2D color); latest wins, specificity, ripples; hard cuts at the beat's start; amended rule 7 (Carry decides what is held; a Horn/Equipment state that doesn't match what Carry gives is ignored for that performer, with a quiet note); Silk applies to flag carriers only, others skipped silently, and a flag of another Cut gets the Artwork fitted per the sizing contract with a note when the aspect differs; `traceCue` covers the three channels. Where the defaults are computed (in `compileCues`, which widens its input, or in the 3D View) is open in `DRAFT-NOTES.md`; settle it before claiming.

**Tickets:** 07, 08, 09, 10, 26.2, 26.11, 26.12, 26.13.

**Done when:** a show with no Carry, Silk or Uniform cues compiles to today's carry for every section.

**Checks:** core unit tests for each rule; type-check, lint, format, spellcheck.

### C3.6: Carry, Silk and Uniform tabs

- Owner: none
- Status: open
- PR: none
- Parallel: yes
- Depends on: C3.3, C3.5

**Goal:** designers set what performers carry, their silks and their uniforms over time.

**Scope:** three Visuals mode tabs with the Who list, lane, result row and why readout; pickers with Import… (C1.10) that pre-fill kind and slot; the silk picker writes a Silk cue (the whole show while there are no changes, else from the current count on), with the scope always on the button and switchable; the uniform editor in the inspector on the Uniform tab (built in C5.1); the Library side panel in Visuals mode; a silk swap previewed on the field as a cut at its count.

**Tickets:** 07, 10, 11, 22, 26.1, 26.16.

**Done when:** "the guard changes to the red silks on count N" is one cue, made in the Silk tab.

**Checks:** component tests; a focused e2e adding a Silk cue; screenshots; type-check, lint, format, spellcheck.

### C3.7: Items tab

- Owner: none
- Status: open
- PR: none
- Parallel: yes
- Depends on: C3.3, C2.3, C2.4

**Goal:** item Placement, Outline geometry and artwork slots edited in Visuals mode.

**Scope:** the Items tab: held, placed with Crew, Off field; making an item from a performer's implicit flag, which writes a Carry `none` cue for that performer at the item's first count, linked to the item so undo and delete remove both; resizes at a count with a transition; Floor prop "rolls out" and its leading edge; artwork slot assignments with fill or fit and pan; item ripple groups edited like a cue ripple with the same orders; hand-conflict notes on the lane.

**Tickets:** 07, 21, 22, 24, 26.14.

**Done when:** a flag taken from a performer becomes an item with one undoable step, and a prop can be pulled on, resized, handed to a performer and taken off field without leaving Visuals mode.

**Checks:** component tests; a focused e2e; screenshots; type-check, lint, format, spellcheck.

### C3.8: Changes listed in page-grained exports

- Owner: none
- Status: open
- PR: none
- Parallel: yes
- Depends on: C3.5, C2.3

**Goal:** coordinate sheets and mobile exports can list each change under its page with its count.

**Scope:** an export option, off unless chosen, listing **Carry, Silk, Uniform and Placement** changes only: "from count 9: red silk; holding Flag · F1"; never rounded to the page. Behavior cues (Feet, Horn/Equipment, Facing, Body) are never printed (ADR 0004 section 11, as amended).

**Tickets:** 21, 26.5.

**Done when:** a coordinate sheet with the option on lists Carry, Silk, Uniform and Placement changes with their counts, and no behavior cues.

**Checks:** export unit tests; type-check, lint, format, spellcheck.

## Exit gate

- [ ] A show with no new cues compiles and looks exactly as before.
- [ ] Carry, Silk, Uniform and Items tabs edit, undo and reach the 3D window through invalidation.
- [ ] Type-check, lint, format and spellcheck pass on `main`.

## Handoff notes

Nothing yet.

## Progress log

- 2026-10-12, lead: `3d-async` merged into `main` (PR #129, `dc38f1a1`) and
  was deleted, so the C3.1 to C3.3 trackers now track `main`: each is done
  when its ADR 0004 step is merged into `main`.

### 2026-10-16 · Trevor (3d/visuals-mode) · C3.3

- **Claimed:** ADR 0004 step 8, built as a stack of PRs off `main`, each
  merging `main` in as it moves:
  1. V1, this branch: the Editor / Visuals workspace switch (top right of
     the toolbar; not in Basic), one tab per behavior channel with its cue
     count (Horn/Equipment names itself by the focused who), and the Who
     list in the inspector (band, sections, tags, the selection). Focusing
     a who dims everyone else on the field through `FieldDimming`, ahead of
     a timeline isolation; dimmed marchers stay selectable.
  2. V2: the cue band under the timeline's clip rows: the editable lane,
     the read-only rows and the result row, with add, move and length
     gestures and count snapping.
  3. V3: the inspector's selected-cue settings and the why readout
     (`traceCue`).
  4. V4: copy and paste, clash and take-over flags on the lanes, the ramp
     drag, the facing wheel and picking a field point.
- **Not yet:** hand-picked groups in the Who list ("Marchers in this
  move"), and hover highlighting on the field (the field has no hover
  highlight yet). The workspace view isn't saved; every session opens in
  the Editor.
- **V2 built (same branch):** the cue band under the timeline's clip rows
  (`TimelineBand` context, so the timeline needs no Visuals props): the
  title ("Editing: Facing for Trumpet", folds to itself), grey rows for
  broader targets above and narrower or overlapping ones below (a click
  goes to that who), the editable lane and the result row, which reads a
  compile of the show's cues (colored own, broader, exception or default,
  hatched where the focused marchers differ). A state draws as its ramp,
  then its value holding to the next cue; the hold is paint, so a click
  there adds a cue. Gestures: click adds a state (the channel's first state
  that fits everyone focused and isn't their default), drag adds a phrase
  (its first phrase that fits; Feet and Facing have none, so a state),
  drag moves, a phrase's end stretches, Delete removes. Everything lands on
  counts; the page and downbeat pull (spec section 7.3) comes with V4. A
  marcher's carry is their section's usual equipment, ignoring the 3D
  View's guard equipment toggle, which section 7.5 retires.
- **V3 built (same branch):** the picked cue's panel in the inspector
  (value from the channel's library values of its kind, marked where it
  doesn't fit everyone focused; transition or length; the value's own
  settings; ripple on or off, its span and order; notes; Delete), each
  change one undoable edit. Under it, the why readout at the playhead's
  count: each value the focused who has, how many have it, the cue that set
  it or where the default comes from, and the cues it beat, from
  `traceCue`; a cue on the focused who's lane is a link that picks it.
  `VisualsProvider` compiles once for the band and the inspector. Counts
  read from 1 in the inspector, as on the timeline.
- **V4 built (same branch):** every lane drag lands on the count under the
  pointer, pulled to page lines and downbeats as the playhead is
  (`snapSeekBeat`; Alt turns it off). A state's ramp start drags to set its
  transition. Shift-click picks several cues; Cmd/Ctrl+C copies them
  (spacing in counts, values, settings, transitions, ripples, notes) and
  Cmd/Ctrl+V, or the band's Paste, puts them at the playhead on the
  focused who, same channel only, as one undoable edit. Compile's flags
  that reach the focused marchers ring their cues in red on the lane and
  the grey rows, with what's wrong in the tooltip, and the band counts
  them. A Facing angle cue gets a top-down wheel (audience down, side 2
  right; Shift for 45° steps); a toward-a-point cue picks its point with
  the next click on the field, through `requestFieldPoint` and the field
  editor's `takePress`, which now gets the press (field coordinates, the
  dots' space). Step 8 is complete; step 9 (retiring the 3D window's horn
  and guard toggles) is next.
- **Review fixes (same branch):** a Ctrl or Cmd press on the band is the
  timeline's again (section 7.2: it draws a range, never a cue); the result
  row rings the counts a flagged cue sets; a phrase draws as long as
  compile plays it (its value's length range); the facing wheel's arrows
  no longer also nudge marchers; the focus stays current with the
  inspector hidden (fullscreen). Not fixed: compile runs the whole show
  (about 250 ms at 2,000 marchers × 500 counts) on every cue edit, as the
  3D View does; compile's channel-only `recompile` saves little there,
  since take-overs and flags are always redone.

### 2026-10-17 · Trevor (3d/visuals-workspace) · C3.3 workspace

- **Owner decision:** "All of these needs to be behind a ui like lighting.
  Where it is a deeper editing experience separate from the normal 2d
  editing of the timeline." Recorded in performer-behavior.md section 7.1;
  it replaces "below Alex's clip rows".
- **Built:** Visuals mode's own timeline (`VisualsTimeline`, through
  `TimelineNavigationPanel`): the drill timeline (`Timeline`) with a
  `readOnly` flag and a `band` prop. Read-only drops the clips and every
  drill edit (window, start pin, **+**, page flag grips, move menus, range
  menu, double-click isolation, clip moves and resizes) and draws no
  Ctrl+drag range; page boxes still select, to go to their page, and the
  ruler and the surface scrub. The cue band is its lanes, drawn under the
  waveform where clip rows go, always open (the fold is gone) with taller
  rows; the timeline scrolls when they're tall. `TimelineBand` is now a
  prop's type, not a context: the Editor's timeline never gets a band and
  is as on `timeline/main`.
- **The field only selects in Visuals:** `FieldEditor.setReadOnly`, on
  while Visuals shows. Clicks, the marquee and the lasso select; a drag
  from a marcher does nothing, the selection box has no handles, and the
  line tool and typed rotations are refused (any in progress end unsaved).
  The field point pick (`takeFieldPress`) runs first, as before.
- **Shortcuts:** `isActionOffInWorkspace` turns the drill edits off in
  Visuals mode (movement, alignment, batch edit, cursor and shape actions,
  and K), from a key, the palette or a button; selection, playback, page
  navigation, view and undo stay. Entering Visuals ends any alignment
  event.
- **Reads as its own mode:** `<main>` gets an accent gradient tint (theme
  tokens) and `data-workspace`. The switch stays top right; Basic has no
  Visuals mode, as before.
- **Tests:** `TimelineReadOnly.test.tsx`, `workspaceActions.test.ts`,
  read-only cases in `fieldEditor.test.ts`; `visuals-mode.spec.mts` checks
  Visuals' timeline has no clips, + or window, page boxes go to their page,
  a drag and the arrows move no one while click and marquee select, and
  the Editor has its clips and drags back.
- **Merged with the review fixes:** the band still lets Ctrl/Cmd presses
  through (they are never a cue), but Visuals' read-only timeline draws no
  range, so such a drag scrubs; the review's scenario now checks that.
- **Merged with step 9:** the editor's band data and the 3D window share
  one `sectionCueCarry`, now in `view3d/core/marchers/hornChannel.ts`.

### 2026-10-17 · Trevor (3d/visuals-toggles) · ADR 0004 step 9

Retired the 3D window's toggles (performer-behavior.md section 7.5). None
was ever saved; all three are kept only as preview overrides, in a new
**Preview only** section of the settings panel (hint: not saved, cues
decide in the show), each starting on **Follow cues**
(`window/performers/previewOverrides.ts`, `sceneStore.ts` now holds null
for "follow").

- **Horn state:** followed, the Horn/Equipment channel starts horns up and
  plays the compiled cues; before, the toggle replaced the starting hold
  and the cues still applied over it. Set to up, carry or trail it holds
  every carrier in that hold for the whole show, ignoring the cues, to
  check the poses.
- **Guard equipment:** followed, each guard section carries its own piece.
  The compile now always fits cues by each section's usual equipment, as
  the editor's Visuals mode does (`sectionCueCarry`); before, picking a
  piece changed which Horn/Equipment cues fit the guard. Picking a piece
  now changes only what's drawn in their hands. "By section" became
  Follow cues.
- **Step-off foot:** followed, the show's saved performer default
  (`useShowPerformerDefaults`), with Feet cues that set a foot keeping
  theirs. Picking a foot replaces the show's default for the cues that
  don't set one; the hint names the show's saved foot.

Tests: `performers/__test__/previewOverrides.test.ts`. No e2e covered
these controls. Open: the Carry, Silk and Uniform channels aren't read by
the window yet, so with Follow cues a guard section's piece is still its
section's usual one, not a Carry cue's (C3.5 and on).

### 2026-10-17 · Trevor (3d/visuals-workspace) · kept clear of the open PRs

Reworked so the branch merges cleanly with every open PR on the fork,
including Alex's shape modes (#288, #181), tempo (#280, #182) and split
move (#266), the C2 props stack and #290's graphics settings:

- **Field:** read-only and the field point pick moved out of
  `FieldEditor` into `field/editor/visualsFieldEditor.ts`, a subclass built
  on the editor's ports and public methods (its drop refuses and its live
  preview draws nothing while read-only). `fieldEditor.ts`,
  `selectionFrame.ts` and `takeFieldPress.ts` are as on main. Left over:
  the selection box and its handles still draw in Visuals mode, inert;
  hide them once #288's modes land (`ownsSelectionBox`).
- **Timeline:** `TimelineNavigationPanel` has its own file; the drill
  panel only exports `PlayingTimeline`. `Timeline` adds the read-only
  overrides after its common props instead of splitting them.
- **3D window:** the preview rows stay in the Graphics section, headed
  "Preview only" by the first of them, until #290 moves the quality rows
  out.

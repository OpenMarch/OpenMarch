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
- [ADR 0002](../../adr/0002-3d-view.md) D-10 and D-11; [ADR 0004 amendment draft](../../adr/0004-amendment-draft.md)
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

- Owner: human
- Status: open
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

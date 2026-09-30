---
phase: 7
title: Parity with page workflows
status: not-started
owner: unassigned
branch: none
pr: none
depends_on: [6]
updated: 2026-09-29
---

# Phase 7: Parity with page workflows

Follow the protocol in [../README.md](../README.md). Claim a work package before you start, and append to the progress log as you go.

## Goal

In timeline mode, every existing page workflow works. Pages survive as named time labels over beats but stop storing coordinates. "Marchers on page N" means `positionsAt(end beat of N)`. "Move a marcher on page N" means editing that marcher's slot destination in the transition ending at N (D-16).

## Read first

- Spec R-E1, §6.1 (U-1 to U-3), §11, Q-1, Q-2
- Phase 6 handoff notes (page semantics)
- `docs/conventions/database-transactions.md` (ripple procedures are multi-table writes)

## Work packages

Each field is on its own line so that concurrent claims merge cleanly. Edit only the Owner, Status and PR lines of packages you own.

### P7.1: Inventory page-coordinate code

- Owner: unassigned
- Status: open
- PR: none
- Parallel: no
- Depends on: —

Inventory every reader and writer of `marcher_pages`, `shape_pages` and the pathway and midset tables. Put the list as a checklist in this file's handoff notes. Later work packages come from it; add rows for anything missing below.

### P7.2: Selection, drag and alignment

- Owner: unassigned
- Status: open
- PR: none
- Parallel: yes
- Depends on: P7.1

Selection, drag and alignment tools write slot destinations.

### P7.3: Marcher add and delete

- Owner: unassigned
- Status: open
- PR: none
- Parallel: yes
- Depends on: P7.1

Marcher add and delete: the home position, plus a vacant or filled slot in each transition.

### P7.4: Page ripple procedures

- Owner: unassigned
- Status: open
- PR: none
- Parallel: yes
- Depends on: P7.1

Page insert, delete and resize as **ripple procedures** in app code, ordered so every intermediate state is valid (U-1 to U-3), with `test:history` for each. This settles Q-1 and Q-2 for pages.

### P7.5: Beat ripple procedures

- Owner: unassigned
- Status: open
- PR: none
- Parallel: yes
- Depends on: P7.4

Beat insert and delete ripple timeline rows (same rules as P7.4).

### P7.6: Copy and paste

- Owner: unassigned
- Status: open
- PR: none
- Parallel: yes
- Depends on: P7.1

Copy and paste of positions.

### P7.7: Coordinate sheets and PDF

- Owner: unassigned
- Status: open
- PR: none
- Parallel: yes
- Depends on: P7.1

Coordinate sheets and PDF export sample the resolver at page beats.

### P7.8: Video export and appearances

- Owner: unassigned
- Status: open
- PR: none
- Parallel: yes
- Depends on: P7.1

Video export and `exportAppearances` sample the resolver.

### P7.9: Keyframe export

- Owner: unassigned
- Status: open
- PR: none
- Parallel: yes
- Depends on: —

§11 keyframe export from the resolver (never read back as state).

## Exit gate

Tick an item only after running its check, and paste the command and result into the log.

- [ ] Every item in the P7.1 inventory is checked off
- [ ] Each feature's existing tests pass in timeline mode
- [ ] `test:history` passes for every ripple procedure
- [ ] Manual pass over editing, playback and export on a converted real show (human)

## Handoff notes

Kept current by the phase lead: where things stand, surprises, and what not to redo.

- This is the long pole. Split P7.1's inventory into more work packages if it's large.

## Progress log

<!-- Append entries below, newest last, using the format in ../README.md. Never edit earlier entries. -->

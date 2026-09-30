---
phase: 6
title: Page→timeline converter
status: not-started
owner: unassigned
branch: none
pr: none
depends_on: [5]
updated: 2026-09-29
---

# Phase 6: Page→timeline converter

Follow the protocol in [../README.md](../README.md). Claim a work package before you start, and append to the progress log as you go.

## Goal

A converter that turns a page show into timeline data with positions **exactly equal** to `marcher_pages` at every page boundary, and a per-page report of anything it can't carry over (C-8). Run on demand behind the dev flag; not yet on open.

## Read first

- [implementation-plan.md](../implementation-plan.md) C-7, C-8
- `apps/desktop/src/hooks/queries/useCoordinateData.ts` (`getMarcherTimelines`: which page's coordinates are reached when), pathway and midset tables in `schema.ts`
- Spec D-16, R-13 (individual destinations)

## Work packages

Each field is on its own line so that concurrent claims merge cleanly. Edit only the Owner, Status and PR lines of packages you own.

### P6.1: Confirm page semantics

- Owner: unassigned
- Status: open
- PR: none
- Parallel: no
- Depends on: —

Confirm the page semantics in code: which beat range each page's move covers, and where page 0 sits. Log the answer with file references before writing the converter.

### P6.2: Converter

- Owner: unassigned
- Status: open
- PR: none
- Parallel: no
- Depends on: P6.1

Pure converter (desktop-side, reading via Drizzle): homes from page 0; one timeline; per page N ≥ 1 one shapeless `direct` transition over page N's beats, one slot per marcher, `slot_destinations` from `marcher_pages(N)`, and one layer-0 assignment per marcher.

### P6.3: Loss report

- Owner: unassigned
- Status: open
- PR: none
- Parallel: yes
- Depends on: P6.2

Loss report per page: pathways, midsets and curved SVG shapes, which are kept only at page ends (C-8).

### P6.4: Dev command

- Owner: unassigned
- Status: open
- PR: none
- Parallel: yes
- Depends on: P6.2

Dev command that runs the converter as one `transactionWithHistory` edit, so it can be undone.

### P6.5: Converter tests

- Owner: unassigned
- Status: open
- PR: none
- Parallel: yes
- Depends on: P6.4

Tests on fixture shows (including the e2e fixtures): resolver positions equal `marcher_pages` bit for bit at every page boundary; in between they match the old keyframes when tempo is uniform and there are no pathways; undo removes everything.

## Exit gate

Tick an item only after running its check, and paste the command and result into the log.

- [ ] P6.5 passes
- [ ] The converter has been run on at least three real shows, with loss reports logged

## Handoff notes

Kept current by the phase lead: where things stand, surprises, and what not to redo.

- None yet.

## Progress log

<!-- Append entries below, newest last, using the format in ../README.md. Never edit earlier entries. -->

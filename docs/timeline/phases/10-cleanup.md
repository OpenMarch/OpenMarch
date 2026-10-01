---
phase: 10
title: Cleanup of page-era tables
status: not-started
owner: unassigned
branch: none
pr: none
depends_on: [9]
updated: 2026-09-29
---

# Phase 10: Cleanup of page-era tables

Follow the protocol in [../README.md](../README.md). Claim a work package before you start, and append to the progress log as you go.

## Goal

Remove page-era storage after one release on the new model.

## Read first

- `apps/desktop/electron/database/migrations/README.md` (rebuild migrations need hand-checking)

## Work packages

Each field is on its own line so that concurrent claims merge cleanly. Edit only the Owner, Status and PR lines of packages you own.

### P10.1: Drop page-era tables

- Owner: unassigned
- Status: open
- PR: none
- Parallel: no
- Depends on: —

Drop `marcher_pages`, the pathway and midset tables, and the old shape tables in a migration. Inspect the rebuild SQL.

### P10.2: Rename tables (optional)

- Owner: unassigned
- Status: open
- PR: none
- Parallel: yes
- Depends on: P10.1

Optional: rename `timeline_shapes` to `shapes`, and remove other `timeline_` prefixes that no longer disambiguate anything.

### P10.3: Delete dead code

- Owner: unassigned
- Status: open
- PR: none
- Parallel: yes
- Depends on: P10.1

Delete dead page-coordinate code paths found by the P7.1 inventory.

## Exit gate

Tick an item only after running its check, and paste the command and result into the log.

- [ ] The migration test passes, and an older `.dots` file opens (human)
- [ ] The full desktop suite passes

## Handoff notes

Kept current by the phase lead: where things stand, surprises, and what not to redo.

- None yet.

## Progress log

<!-- Append entries below, newest last, using the format in ../README.md. Never edit earlier entries. -->

### 2026-10-01 · timeline-worker (timeline/p7-coordinate-sheets) · Cross-phase note from P7.7

- **Unowned dead code for cleanup:** `apps/desktop/electron/main/services/export-utility-process.ts` is unreachable. Nothing imports or forks it, and it is not a Vite or electron-builder entry. It still reads `marcher_pages` straight from the file. Delete it with the page-era tables. `src/components/exporting/CoordinateSheetTemplates.tsx` has no importers either.

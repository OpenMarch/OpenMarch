---
phase: 9
title: Flip: convert on open
status: not-started
owner: unassigned
branch: none
pr: none
depends_on: [8]
updated: 2026-09-29
---

# Phase 9: Flip: convert on open

Follow the protocol in [../README.md](../README.md). Claim a work package before you start, and append to the progress log as you go.

## Goal

Make timelines the only motion model: convert every show on open, safely, and remove the dev flag.

## Read first

- [implementation-plan.md](../implementation-plan.md) C-8 (must be decided first), §5 risks
- `apps/desktop/electron/database/migrations/DrizzleMigrationService.ts`, `database.services.ts`

## Work packages

Each field is on its own line so that concurrent claims merge cleanly. Edit only the Owner, Status and PR lines of packages you own.

### P9.1: C-8 decided

- Owner: human
- Status: open
- PR: none
- Parallel: no
- Depends on: —

Confirm C-8 is decided and implemented. If not, this phase is blocked.

### P9.2: Backup before converting

- Owner: unassigned
- Status: open
- PR: none
- Parallel: yes
- Depends on: P9.1

Back up the file before converting (next to the original, with a clear name).

### P9.3: Convert on open

- Owner: unassigned
- Status: open
- PR: none
- Parallel: no
- Depends on: P9.2

A post-migration step in the main process runs the converter in one transaction, and bumps the file-format version so older app versions refuse the file cleanly.

### P9.4: Remove the dev flag

- Owner: unassigned
- Status: open
- PR: none
- Parallel: no
- Depends on: P9.3

Remove the dev flag. Timeline mode is the only mode.

### P9.5: Freeze page-era writes

- Owner: unassigned
- Status: open
- PR: none
- Parallel: yes
- Depends on: P9.3

Freeze writes to `marcher_pages`, `shape_pages` and the pathway and midset tables; leave them read-only for one release.

### P9.6: Real-file corpus

- Owner: unassigned
- Status: open
- PR: none
- Parallel: no
- Depends on: P9.4

Open a corpus of real older `.dots` files: positions at page boundaries match, and loss reports are logged.

### P9.7: User docs and release notes

- Owner: unassigned
- Status: open
- PR: none
- Parallel: yes
- Depends on: P9.4

User-facing docs in `apps/website` and release notes.

## Exit gate

Tick an item only after running its check, and paste the command and result into the log.

- [ ] P9.6 passes on the corpus
- [ ] Manual QA of playback, editing and export (human)
- [ ] The full desktop suite, e2e and Electron build pass

## Handoff notes

Kept current by the phase lead: where things stand, surprises, and what not to redo.

- None yet.

## Progress log

<!-- Append entries below, newest last, using the format in ../README.md. Never edit earlier entries. -->

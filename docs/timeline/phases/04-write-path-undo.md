---
phase: 4
title: Write wrapper, db-functions, undo, e2e fuzz
status: not-started
owner: unassigned
branch: none
pr: none
depends_on: [2, 3]
updated: 2026-09-29
---

# Phase 4: Write wrapper, db-functions, undo, e2e fuzz

Follow the protocol in [../README.md](../README.md). Claim a work package before you start, and append to the progress log as you go.

## Goal

Make every committed edit, undo and redo emit exactly one change-log batch after commit, reject incomplete edits atomically, and prove, with the app's real undo, that the timeline tables round-trip. Page mode must not change.

## Read first

- Spec §6 (write wrapper), §6.1 (U-1 to U-4), R-E1, §10.2, §12.2 (QA-UNDO)
- [implementation-plan.md](../implementation-plan.md) C-1, C-2, C-6
- `apps/desktop/src/db-functions/history.ts` (`transactionWithHistory`, `executeHistoryAction`, `performHistoryAction`), `apps/desktop/src/test/history.ts`
- `ref/history.mjs` (`rangeEdit`), `ref/undo_tests.py`, `ref/e2e.mjs` (`load`, `toBatch`)
- `docs/conventions/database-interactions.md`, `docs/conventions/database-transactions.md`, `docs/conventions/testing.md`

## Work packages

Each field is on its own line so that concurrent claims merge cleanly. Edit only the Owner, Status and PR lines of packages you own.

### P4.1: Wrapper drain in transactionWithHistory

- Owner: unassigned
- Status: open
- PR: none
- Parallel: no
- Depends on: —

`transactionWithHistory`: after `func`, check `commit_violations` (throw `E-T6`), then read and delete `timeline_change_log`. After the commit resolves, hand the batch to registered listeners. Discard it on any error.

### P4.2: Wrapper drain in undo and redo

- Owner: unassigned
- Status: open
- PR: none
- Parallel: no
- Depends on: P4.1

`executeHistoryAction`: the same check and drain inside its replay transaction, so undo and redo emit batches (C-6).

### P4.3: Listener API and drain on open

- Owner: unassigned
- Status: open
- PR: none
- Parallel: no
- Depends on: P4.1

Listener API (subscribe/unsubscribe), and on file open: clear the log and signal a cold build. A debug assertion that the log is empty after each drain.

### P4.4: db-functions

- Owner: unassigned
- Status: open
- PR: none
- Parallel: yes
- Depends on: P4.1

db-functions (`{action}InTransaction` plus public wrappers) for timelines, shapes, transitions, assignments and destinations. Shape↔individual switches happen in one edit. Every write runs the core validators (P1.4) first.

### P4.5: R-E1 range procedure

- Owner: unassigned
- Status: open
- PR: none
- Parallel: yes
- Depends on: P4.4

`setTransitionRangeInTransaction`: the R-E1 procedure (union → anchored rows → target).

### P4.6: Child-first deletes

- Owner: unassigned
- Status: open
- PR: none
- Parallel: yes
- Depends on: P4.4

Child-first deletes for timelines and transitions (C-1).

### P4.7: Write-path storage tests

- Owner: unassigned
- Status: open
- PR: none
- Parallel: yes
- Depends on: P4.5

Tests through the real write path: QA-DB-11, -12, -13, -24, -25, -26 (26b informational) and -29.

### P4.8: Undo round-trip tests

- Owner: unassigned
- Status: open
- PR: none
- Parallel: yes
- Depends on: P4.6

`test:history` round trips on the app's real undo: QA-UNDO-2a to -2g and -3 to -8, a child-first-delete test proving C-1, and a `slot_destinations` delete/undo test proving C-2.

### P4.9: End-to-end fuzz with real undo

- Owner: unassigned
- Status: open
- PR: none
- Parallel: yes
- Depends on: P4.8

QA-INV-09 and QA-UNDO-9: port `e2e.mjs` to drive the real wrapper and `performHistoryAction`, comparing a DB snapshot and the resolver with a fresh oracle after every edit, undo and redo.

## Exit gate

Tick an item only after running its check, and paste the command and result into the log.

- [ ] P4.7 and P4.8 pass: `pnpm --dir apps/desktop run test:history <file> --silent`
- [ ] P4.9 passes with its CI seed count, and a longer local run is logged
- [ ] The full existing desktop suite passes, with no change in page mode
- [ ] `pnpm --dir apps/desktop exec tsc --noEmit` passes

## Handoff notes

Kept current by the phase lead: where things stand, surprises, and what not to redo.

- Undo replays with foreign keys OFF and BEFORE triggers ON, and records deletes with a BEFORE DELETE trigger. That's why C-1 exists; don't "simplify" back to CASCADE.

## Progress log

<!-- Append entries below, newest last, using the format in ../README.md. Never edit earlier entries. -->

### 2026-09-29 · timeline-worker agent (timeline/p3-storage) · Cross-phase note from P3

- **Done:** Phase 3 decided C-5 (revised 2026-09-30 after the C-5 rework): marcher homes are `home_x`/`home_y` columns on `marchers` (`REAL NOT NULL DEFAULT 0`, numeric and `abs(…) <= 1e6`), so every marcher always has a home and the write path has nothing extra to create when it creates a marcher. Home edits are ordinary `marchers` updates; the existing `marchers` history triggers cover them for undo/redo, and `timeline_log_marchers_upd` logs them (it fires only `OF home_x, home_y`) (PR #1037).
- **Checks:** n/a
- **Next:** the drain-on-open should also cover `repair.ts`, which writes to `timeline_change_log` through the triggers, and repair must copy the timeline tables in dependency order (timelines, shapes, transitions, then destinations and assignments), or `timeline_asn_bounds_ins` rejects the copy.
- **Blockers:** none.

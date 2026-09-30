---
phase: 3
title: Storage schema and triggers (desktop)
status: not-started
owner: unassigned
branch: none
pr: none
depends_on: [0]
updated: 2026-09-29
---

# Phase 3: Storage schema and triggers (desktop)

Follow the protocol in [../README.md](../README.md). Claim a work package before you start, and append to the progress log as you go.

## Goal

Add the timeline tables, invariant triggers, `commit_violations` view and change log to the desktop database, adjusted for C-1 to C-5. Schema only: no write-path or UI changes.

## Read first

- Spec §5.1, §6, §6.1, §10.2, §12.2
- [implementation-plan.md](../implementation-plan.md) C-1 to C-5
- `apps/desktop/electron/database/migrations/` (`schema.ts`, `triggers.ts`, `README.md`, `__test__/0012_pink_king_cobra.test.ts`)
- `apps/desktop/src/db-functions/history.ts` (`tablesWithHistory`), `apps/desktop/src/hooks/queries/utils.ts`
- `ref/schema.sql`, `ref/db_tests.py`
- `docs/conventions/database-interactions.md`, `docs/conventions/testing.md`

## Work packages

Each field is on its own line so that concurrent claims merge cleanly. Edit only the Owner, Status and PR lines of packages you own.

### P3.1: Decide where marcher homes live (C-5)

- Owner: unassigned
- Status: open
- PR: none
- Parallel: yes
- Depends on: —

Decide C-5: add `home_x`/`home_y` to `marchers`, run `pnpm run migrate`, and check that the SQL is `ADD COLUMN` and not a rebuild. If it rebuilds, switch to `timeline_marcher_homes`. Log the outcome, and update `implementation-plan.md` C-5.

### P3.2: Tables in schema.ts

- Owner: unassigned
- Status: open
- PR: none
- Parallel: no
- Depends on: —

`schema.ts`: `timelines`, `timeline_shapes`, `timeline_transitions`, `timeline_assignments`, `timeline_slot_destinations` (with a surrogate `id`, C-2) and `timeline_change_log`, with every §5.1 CHECK, `typeof` CHECKs (C-3), and RESTRICT on the foreign keys named in C-1.

### P3.3: Generate and inspect the migration

- Owner: unassigned
- Status: open
- PR: none
- Parallel: no
- Depends on: P3.1, P3.2

Run `pnpm run migrate` and **inspect** the generated SQL for bad column copies. Commit the migration and snapshot.

### P3.4: Triggers, view and change log

- Owner: unassigned
- Status: open
- PR: none
- Parallel: no
- Depends on: P3.3

`triggers.ts`: the invariant triggers (`asn_bounds_*`, `asn_overlap_*`, `tr_in_timeline_*`, `tl_contains_upd`, `tr_slots_upd`, `sd_ins`, `sd_upd`, `tr_shape_set`, `tr_slots_dest_upd`, `tr_range_check`, `tr_dest_*`, `shape_dest_upd`), renamed per C-4; the `commit_violations` view; and the change-log triggers (logging marchers' home columns only). No row-rewriting triggers (U-1).

### P3.5: History registration

- Owner: unassigned
- Status: open
- PR: none
- Parallel: yes
- Depends on: P3.3

Add the data tables (not the change log) to `tablesWithHistory` and the query-key map. Make sure the `marchers` history triggers are recreated if its columns changed.

### P3.6: Storage tests

- Owner: unassigned
- Status: open
- PR: none
- Parallel: yes
- Depends on: P3.4

`describeDbTests`: QA-DB-01 to -10, -13b, -14 to -23, -27, -28 and -30 to -41, adapted to the prefixes, RESTRICT (QA-DB-18 now expects a rejection) and `typeof` (QA-DB-27). QA-DB-11 to -13, -24 to -26 and -29 move to Phase 4.

### P3.7: Migration test

- Owner: unassigned
- Status: open
- PR: none
- Parallel: yes
- Depends on: P3.3

A migration test modelled on `0012_pink_king_cobra.test.ts`.

### P3.8: Open an older .dots file

- Owner: human
- Status: open
- PR: none
- Parallel: no
- Depends on: P3.4

Manual: launch the desktop app and open an older `.dots` file with no errors.

## Exit gate

Tick an item only after running its check, and paste the command and result into the log.

- [ ] P3.6 and P3.7 pass: `pnpm --dir apps/desktop run test:focused <file>`
- [ ] `pnpm --dir apps/desktop exec tsc --noEmit` passes
- [ ] Existing history tests still pass: `pnpm --dir apps/desktop run test:history`
- [ ] P3.8 done by a person

## Handoff notes

Kept current by the phase lead: where things stand, surprises, and what not to redo.

- Can run in parallel with Phases 1 and 2. `PRAGMA foreign_keys = ON` is already set on the main connection and in tests.

## Progress log

<!-- Append entries below, newest last, using the format in ../README.md. Never edit earlier entries. -->

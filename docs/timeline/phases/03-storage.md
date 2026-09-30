---
phase: 3
title: Storage schema and triggers (desktop)
status: in-progress
owner: timeline-worker agent (timeline/p3-storage)
branch: timeline/p3-storage
pr: https://github.com/OpenMarch/OpenMarch/pull/1037
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

- Owner: timeline-worker agent (timeline/p3-storage)
- Status: in-progress
- PR: https://github.com/OpenMarch/OpenMarch/pull/1037
- Parallel: yes
- Depends on: —

Decide C-5: add `home_x`/`home_y` to `marchers`, run `pnpm run migrate`, and check that the SQL is `ADD COLUMN` and not a rebuild. If it rebuilds, switch to `timeline_marcher_homes`. Log the outcome, and update `implementation-plan.md` C-5.

### P3.2: Tables in schema.ts

- Owner: timeline-worker agent (timeline/p3-storage)
- Status: in-progress
- PR: https://github.com/OpenMarch/OpenMarch/pull/1037
- Parallel: no
- Depends on: —

`schema.ts`: `timelines`, `timeline_shapes`, `timeline_transitions`, `timeline_assignments`, `timeline_slot_destinations` (with a surrogate `id`, C-2) and `timeline_change_log`, with every §5.1 CHECK, `typeof` CHECKs (C-3), and RESTRICT on the foreign keys named in C-1.

### P3.3: Generate and inspect the migration

- Owner: timeline-worker agent (timeline/p3-storage)
- Status: in-progress
- PR: https://github.com/OpenMarch/OpenMarch/pull/1037
- Parallel: no
- Depends on: P3.1, P3.2

Run `pnpm run migrate` and **inspect** the generated SQL for bad column copies. Commit the migration and snapshot.

### P3.4: Triggers, view and change log

- Owner: timeline-worker agent (timeline/p3-storage)
- Status: in-progress
- PR: https://github.com/OpenMarch/OpenMarch/pull/1037
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

### P3.9: File-format version guard (ADR 0001 §6)

- Owner: unassigned
- Status: open
- PR: none
- Parallel: yes
- Depends on: —

On open, read `user_version` **before** touching the file; refuse a version higher than this build supports, with a message to update; stop setting `PRAGMA user_version = 7` unconditionally (`apps/desktop/electron/main/index.ts:779` and `:1401`); keep migrating files at 7, and accept 8 once Phase 9 exists. It must ship in the same release as the timeline tables or earlier, so the more releases carry it before Phase 9, the fewer can damage a converted file. Tests: open files at 7, 8 and 9 (refused), and confirm the version is no longer rewritten.

## Exit gate

Tick an item only after running its check, and paste the command and result into the log.

- [ ] P3.6 and P3.7 pass: `pnpm --dir apps/desktop run test:focused <file>`
- [ ] `pnpm --dir apps/desktop exec tsc --noEmit` passes
- [ ] Existing history tests still pass: `pnpm --dir apps/desktop run test:history`
- [ ] P3.8 done by a person
- [ ] P3.9 merged, with its open-at-7/8/9 tests passing

## Handoff notes

Kept current by the phase lead: where things stand, surprises, and what not to redo.

- Can run in parallel with Phases 1 and 2. `PRAGMA foreign_keys = ON` is already set on the main connection and in tests.
- P3.1 to P3.4 are in review (PR #1037). C-5 went to the side table `timeline_marcher_homes`, so `marchers` is unchanged and P3.5 doesn't need to recreate its history triggers; P3.5 registers `timeline_marcher_homes` with the other data tables.
- `pnpm run migrate`'s `create-blank-db` step fails under tsx (`import.meta.env` is undefined in `Constants.ts`). `drizzle-kit generate` works; regenerate `_blank.dots` by running the same steps from a throwaway Vitest file, which defines the env. Build the workspace deps first (`pnpm exec turbo run build --filter=@openmarch/desktop^...`), or Vitest can't resolve `@openmarch/core` and `@openmarch/metronome`.
- Test harness quirks: raw `db.all(sql.raw(…))` through the proxy returns rows as arrays, and SQLite errors arrive as `Failed query: …` with the real message in `error.cause`. See `expectError` in `migrations/__test__/timelineTriggers.test.ts`.
- `repair.ts` copies tables in `sqlite_master` order, and `timeline_assignments` was created before `timeline_transitions`, so repairing a file with timeline data would trip `timeline_asn_bounds_ins`. That's harmless until something writes these tables, but it needs a dependency-ordered copy by then.

## Progress log

<!-- Append entries below, newest last, using the format in ../README.md. Never edit earlier entries. -->

### 2026-09-29 · timeline-worker agent (timeline/p3-storage) · P3.1, P3.2, P3.3

- **Done:** P3.1 decided C-5: marcher homes live in a 1:1 `timeline_marcher_homes` table. With `home_x`/`home_y` plus the bound CHECKs on `marchers`, `drizzle-kit generate` emits a full `__new_marchers` rebuild whose `INSERT … SELECT` copies `home_x`/`home_y` from the old table, where they don't exist. Without the CHECKs it emits two `ALTER TABLE … ADD` statements, but then I-N2's bound is lost. `implementation-plan.md` C-5 updated. P3.2: the seven tables are in `schema.ts` (commit b379e7ad on `timeline/p3-storage`). P3.3: migration `0017_daffy_korath.sql` inspected: only `CREATE TABLE`/`CREATE INDEX` for the new tables, no column copies, no change to existing tables. `_blank.dots` regenerated; its schema diff against the old one is the new objects plus whitespace in `__drizzle_migrations` and `timing_objects`.
- **Checks:** `pnpm --dir apps/desktop exec tsc --noEmit`: pass. `sqlite3 _blank.dots "pragma foreign_key_check; pragma integrity_check"`: ok.
- **Next:** P3.4 triggers, view and change-log triggers in `triggers.ts`, with a few `describeDbTests` showing they fire.
- **Blockers:** none. Note for whoever runs `pnpm run migrate` next: its second step (`tsx scripts/create-blank-db.ts`) fails with `Cannot read properties of undefined (reading 'VITE_API_URL')`, because `Constants.ts` reads `import.meta.env`, which tsx doesn't define. `drizzle-kit generate` still succeeds. I regenerated `_blank.dots` by running the same steps from a throwaway Vitest file, which defines the env.
- **Resume from:** P3.4. Edit `apps/desktop/electron/database/migrations/triggers.ts` (add the `timeline_*` triggers and the `timeline_commit_violations` view; teach `dropAllTriggers` to drop the view), then regenerate `_blank.dots` so tests see them (see the note above), then add tests under `apps/desktop/electron/database/migrations/__test__/`.

### 2026-09-29 · timeline-worker agent (timeline/p3-storage) · P3.4

- **Done:** `triggers.ts` has the 16 invariant triggers (`timeline_asn_bounds_*`, `timeline_asn_overlap_*`, `timeline_tr_in_timeline_*`, `timeline_tl_contains_upd`, `timeline_tr_slots_upd`, `timeline_sd_*`, `timeline_tr_shape_set`, `timeline_tr_slots_dest_upd`, `timeline_tr_range_check`, `timeline_tr_dest_*`, `timeline_shape_dest_upd`), the `timeline_commit_violations` view, and 15 change-log triggers (`timeline_log_<table>_ins/upd/del` on homes, shapes, transitions, assignments and destinations; homes log under `marchers`). `dropAllTriggers` now also drops the view. `_blank.dots` regenerated. Smoke tests in `apps/desktop/electron/database/migrations/__test__/timelineTriggers.test.ts` (15 tests: each trigger group fires, RESTRICT, `typeof`, the view, change-log images, and a U-1 guard that every `timeline_*` trigger body only RAISEs or inserts into the log). Commit 8486ee0e.
- **Checks:** `pnpm --dir apps/desktop run test:focused electron/database/migrations/__test__/timelineTriggers.test.ts`: 15 passed. `pnpm --dir apps/desktop exec tsc --noEmit`: pass. `eslint` on the changed files: clean. `test:history`: running.
- **Next:** finish `test:history`, open the PR against `timeline-try-2`.
- **Blockers:** none.
- **Resume from:** check out `timeline/p3-storage`, run `pnpm install`, build the workspace deps (`pnpm exec turbo run build --filter=@openmarch/desktop^...`), run `pnpm --dir apps/desktop run test:history`, then open the PR (WORKER.md step 6).

### 2026-09-29 · timeline-worker agent (timeline/p3-storage) · P3.1, P3.2, P3.3, P3.4

- **Done:** opened https://github.com/OpenMarch/OpenMarch/pull/1037 against `timeline-try-2` (commits b379e7ad, 8486ee0e). P3.1 to P3.4 set to `in-review`. Handoff notes updated.
- **Checks:** `pnpm --dir apps/desktop exec tsc --noEmit`: pass. `pnpm --dir apps/desktop run test:focused electron/database/migrations/__test__/timelineTriggers.test.ts`: 15 passed. `pnpm --dir apps/desktop run test:history`: pass (79 files, 1251 tests passed; 7 files and 3 tests skipped, 15 todo). Exit-gate items for `tsc` and `test:history` are not ticked, because they only become true on the base branch when the PR merges.
- **Next:** review and merge #1037. Then P3.5, P3.6, P3.7 and P3.9 (open). P3.8 (human): open an older `.dots` file in the app after the merge.
- **Blockers:** none.


### 2026-09-30 · lead session · P3.1 to P3.4 (review check)

- **Done:** independently re-checked PR #1037 at its head (8486ee0e); CI doesn't run on PRs into `timeline-try-2`.
- **Checks:** `0017_daffy_korath.sql` creates exactly 7 tables and contains no `INSERT INTO`, `DROP TABLE`, `ALTER TABLE` or `__new_` rebuild, so it can't damage existing data. `pnpm exec tsc --noEmit` in `apps/desktop` (pass). `pnpm run test:focused electron/database/migrations/__test__/timelineTriggers.test.ts` (15 of 15 pass). Commits carry no attribution lines. Not re-run by the lead: the full `test:history` suite (the worker reports 1,251 passing) and eslint.
- **Next:** a person reviews and merges #1037, then does P3.8 (open an older `.dots` file). The `repair.ts` table-order problem (see handoff notes) must be fixed before any write path lands; Phase 4 has a cross-phase note.
- **Blockers:** none.

### 2026-09-30 · timeline-worker agent (timeline/p3-storage) · P3.1 to P3.4 (rework (C-5 homes on marchers))

- **Done:** started the rework the project owner asked for: marcher homes move to `home_x`/`home_y` columns on `marchers` (ADR 0001's primary choice), `timeline_marcher_homes` goes, and migration 0017 is regenerated with drizzle's `__new_marchers` rebuild hand-edited into two `ALTER TABLE … ADD COLUMN` statements with CHECKs. P3.1 to P3.4 set back to `in-progress` for the rework.
- **Checks:** none yet.
- **Next:** `schema.ts`, regenerate 0017, hand-edit it, confirm repeated generation is a no-op.
- **Blockers:** none.
- **Resume from:** on a local branch from `origin/timeline/p3-storage` (push with `git push origin HEAD:timeline/p3-storage`), edit `apps/desktop/electron/database/migrations/schema.ts`, delete `0017_daffy_korath.sql`, `meta/0017_snapshot.json` and its `_journal.json` entry, then run `pnpm --dir apps/desktop run migrate`.

### 2026-09-30 · timeline-worker agent (timeline/p3-storage) · P3.1 to P3.4 (rework (C-5 homes on marchers))

- **Done:** `schema.ts`: `timeline_marcher_homes` removed; `marchers` gains `home_x`/`home_y` (`real NOT NULL DEFAULT 0`) with named `typeof` and `abs(…) <= 1e6` CHECKs. The old 0017 (SQL, snapshot, journal entry) deleted and regenerated as `0017_powerful_edwin_jarvis.sql`; drizzle's `__new_marchers` rebuild hand-edited into two `ALTER TABLE marchers ADD COLUMN … CONSTRAINT … CHECK(…)` statements using the snapshot's constraint names. `triggers.ts`: home change-log triggers are now `timeline_log_marchers_ins/upd/del` on `marchers` (update fires only `OF home_x, home_y`). `_blank.dots` regenerated. Tests updated, new migration test `migrations/__test__/0017_powerful_edwin_jarvis.test.ts`. `Marcher` is inferred from `marchers`, so 5 fixtures/constructors and the two mock `.sql`/`.mjs` data sets gained `home_x: 0, home_y: 0`. Pushed as wip commit c474b862.
- **Checks:** `drizzle-kit generate` after the hand edit: "No schema changes, nothing to migrate". `pnpm --dir apps/desktop exec tsc --noEmit`: pass. `pnpm --dir apps/desktop run test:focused electron/database/migrations/__test__/`: 3 files, 51 tests passed. `test:history`: running.
- **Next:** finish `test:history`, squash the commits, update C-5 and the handoff notes, update PR #1037.
- **Blockers:** none.
- **Resume from:** check out `origin/timeline/p3-storage` locally, `pnpm install`, `pnpm exec turbo run build --filter=@openmarch/desktop^...`, run `pnpm --dir apps/desktop run test:history`; then docs (implementation-plan C-5, Phase 3/4 notes) via coord.sh and the PR body.

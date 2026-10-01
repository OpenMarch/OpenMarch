---
phase: 4
title: Write wrapper, db-functions, undo, e2e fuzz
status: in-progress
owner: timeline-worker agent (timeline/p4-write-wrapper)
branch: timeline/p4-write-wrapper
pr: https://github.com/AlexDumo/OpenMarch-timeline/pull/9
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

- Owner: timeline-worker agent (timeline/p4-write-wrapper)
- Status: done
- PR: https://github.com/AlexDumo/OpenMarch-timeline/pull/9
- Parallel: no
- Depends on: —

`transactionWithHistory`: after `func`, check `commit_violations` (throw `E-T6`), then read and delete `timeline_change_log`. After the commit resolves, hand the batch to registered listeners. Discard it on any error.

### P4.2: Wrapper drain in undo and redo

- Owner: timeline-worker agent (timeline/p4-write-wrapper)
- Status: done
- PR: https://github.com/AlexDumo/OpenMarch-timeline/pull/9
- Parallel: no
- Depends on: P4.1

`executeHistoryAction`: the same check and drain inside its replay transaction, so undo and redo emit batches (C-6).

### P4.3: Listener API and drain on open

- Owner: timeline-worker agent (timeline/p4-write-wrapper)
- Status: done
- PR: https://github.com/AlexDumo/OpenMarch-timeline/pull/9
- Parallel: no
- Depends on: P4.1

Listener API (subscribe/unsubscribe), and on file open: clear the log and signal a cold build. A debug assertion that the log is empty after each drain.

### P4.4: db-functions

- Owner: timeline-worker agent (timeline/p4-db-functions)
- Status: done
- PR: https://github.com/AlexDumo/OpenMarch-timeline/pull/10
- Parallel: yes
- Depends on: P4.1

db-functions (`{action}InTransaction` functions (no public wrappers by default, per `docs/conventions/database-interactions.md`)) for timelines, shapes, transitions, assignments and destinations. Shape↔individual switches happen in one edit. Every write runs the core validators (P1.4) first.

### P4.5: R-E1 range procedure

- Owner: timeline-worker agent (timeline/p4-range-edit)
- Status: done
- PR: https://github.com/AlexDumo/OpenMarch-timeline/pull/12
- Parallel: yes
- Depends on: P4.4

`setTransitionRangeInTransaction`: the R-E1 procedure (union → anchored rows → target).

### P4.6: Child-first deletes

- Owner: timeline-worker agent (timeline/p4-db-functions)
- Status: done
- PR: https://github.com/AlexDumo/OpenMarch-timeline/pull/10
- Parallel: yes
- Depends on: P4.4

Child-first deletes for timelines and transitions (C-1).

### P4.7: Write-path storage tests

- Owner: timeline-worker agent (timeline/p4-range-edit)
- Status: done
- PR: https://github.com/AlexDumo/OpenMarch-timeline/pull/12
- Parallel: yes
- Depends on: P4.5

Tests through the real write path: QA-DB-11, -12, -13, -24, -25, -26 (26b informational) and -29.

### P4.8: Undo round-trip tests

- Owner: timeline-worker agent (timeline/p4-undo)
- Status: done
- PR: https://github.com/AlexDumo/OpenMarch-timeline/pull/13
- Parallel: yes
- Depends on: P4.6

`test:history` round trips on the app's real undo: QA-UNDO-2a to -2g and -3 to -8, a child-first-delete test proving C-1, and a `slot_destinations` delete/undo test proving C-2.

### P4.9: End-to-end fuzz with real undo

- Owner: timeline-worker agent (timeline/p4-e2e-fuzz)
- Status: done
- PR: https://github.com/AlexDumo/OpenMarch-timeline/pull/15
- Parallel: yes
- Depends on: P4.8

QA-INV-09 and QA-UNDO-9: port `e2e.mjs` to drive the real wrapper and `performHistoryAction`, comparing a DB snapshot and the resolver with a fresh oracle after every edit, undo and redo.

## Exit gate

Tick an item only after running its check, and paste the command and result into the log.

- [x] P4.7 and P4.8 pass: `pnpm --dir apps/desktop run test:history <file> --silent`
- [x] P4.9 passes with its CI seed count, and a longer local run is logged
- [ ] The full existing desktop suite passes, with no change in page mode
- [x] `pnpm --dir apps/desktop exec tsc --noEmit` passes

## Handoff notes

Kept current by the phase lead: where things stand, surprises, and what not to redo.

- Undo replays with foreign keys OFF and BEFORE triggers ON, and records deletes with a BEFORE DELETE trigger. That's why C-1 exists; don't "simplify" back to CASCADE.
- The wrapper (P4.1-P4.3, PR #9) lives in `transactionWithHistory` and `executeHistoryAction`; the listener API and E-T6 check are in `src/db-functions/timelineChanges.ts`. Every committed edit must leave each shapeless transition with all its destinations, so tests that seed timeline rows must insert a shapeless transition and its destinations in one edit. Undo and redo now share the write lock with `transactionWithHistory`.
- RESOLVED in P4.8 (PR #13): undo edge cases that predated P4.2 (from the PR #9 review): (1) `executeHistoryAction` calls `incrementGroup(db, "redo")` before and outside the replay transaction, so a rejected undo leaves `cur_redo_group` bumped and, at the group limit, can prune the oldest redo group, which breaks §6.1's "a rejected undo leaves both stacks unchanged" in that edge case. Move the increment after a successful commit, or document it. (2) The history-row DELETE and group refresh run after the replay commits, outside it; if they fail, the replay was applied and delivered but the group remains, so a retry would replay it again.
- Optional: a `WHEN OLD.home_x IS NOT NEW.home_x OR OLD.home_y IS NOT NEW.home_y` guard on `timeline_log_marchers_upd` would stop undo/redo of a marcher rename from logging a no-op home change. Safe under U-2 (a logging trigger never rejects); harmless without it.
- From the PR #10 review, for P4.7 (tests) and the write path: add tests for E-T3/E-T4 (a block shape used for FTL, or with too few slots, on create, switch and shape update), E-A2 (shrinking `slot_count` below an occupied slot), an E-T6 row-trigger rejection, and a duplicate-id update. `updateTimelineTransitionsInTransaction` plans every edit from rows read before writing, so a call with the same id twice uses stale data: refuse duplicate ids or document it.
- Error codes: combined trigger messages map to combined codes (`E-A1/E-A2`, `E-T3/E-T4`), because the database doesn't say which half failed. Commit-time E-T6 arrives as `TimelineCommitViolationError` (history.ts), row-trigger E-T6 as `TimelineWriteError`; P8.6 must handle both. CHECK failures (I-N2, I-T5) and a RESTRICT-blocked shape delete come out as `E-DB` (original error kept as `cause`); a pre-check refusing "shape in use" with `E-ARGS` would be friendlier.
- R-E1 no-op: `setTimelineTransitionRangeInTransaction` writes nothing when the target equals the current range, and `transactionWithHistory` then fails its "no changes" assertion with a plain Error. Callers (P8.9: dragging a clip back where it started) must skip a no-op edit. An emptied row (I-A6) surfaces as `E-DB`, since the spec gives that CHECK no code.
- Follow-up (pre-existing, from the PR #13 review): if switching the history triggers back to undo mode in `executeHistoryAction`'s finally block throws after a successful commit, the drained batch is never delivered and the response reports failure.
- `executeHistoryAction` switches only the replayed group's tables to redo mode, so a future trigger that writes another tracked table during a replay would log onto the wrong stack (the P4.9 v0.6 control breaks undo this way). No current trigger does this: the validation triggers only RAISE, the change-log triggers write `timeline_change_log`, and FKs are off during the replay.
- Fuzz follow-up (from the PR #15 re-review): an invalid op that throws counts as "applied" whatever the reason; giving each invalid op its expected error code(s) and asserting the rejection reason would make coverage stricter. The E-T5 path in "shape to individual" has no coverage counter.

## Progress log

<!-- Append entries below, newest last, using the format in ../README.md. Never edit earlier entries. -->

### 2026-09-29 · timeline-worker agent (timeline/p3-storage) · Cross-phase note from P3

- **Done:** Phase 3 decided C-5 (revised 2026-09-30 after the C-5 rework): marcher homes are `home_x`/`home_y` columns on `marchers` (`REAL NOT NULL DEFAULT 0`, numeric and `abs(…) <= 1e6`), so every marcher always has a home and the write path has nothing extra to create when it creates a marcher. Home edits are ordinary `marchers` updates; the existing `marchers` history triggers cover them for undo/redo, and `timeline_log_marchers_upd` logs them (it fires only `OF home_x, home_y`) (PR #1037).
- **Checks:** n/a
- **Next:** the drain-on-open should also cover `repair.ts`, which writes to `timeline_change_log` through the triggers, and repair must copy the timeline tables in dependency order (timelines, shapes, transitions, then destinations and assignments), or `timeline_asn_bounds_ins` rejects the copy.
- **Blockers:** none.

### 2026-09-30 · timeline-worker agent (timeline/p4-write-wrapper) · P4.1, P4.2, P4.3

- **Done:** checkpoint `1655f448` on `timeline/p4-write-wrapper`: `apps/desktop/src/db-functions/timelineChanges.ts` (listener API, E-T6 check, drain), the drain in `transactionWithHistory` and in `executeHistoryAction` (now queued on the write lock), `resetTimelineChangeLog` on file open in `App.tsx`, and the `repair.ts` copy order (parents first, `timeline_change_log` excluded and cleared) with a repair test.
- **Checks:** `pnpm --dir apps/desktop exec tsc --noEmit` pass; `pnpm --dir apps/desktop run test:focused electron/database/__test__/repair.test.ts -t "timeline|orders dependent"` pass (and fails with E-A1 without the order fix).
- **Next:** fix `timelineHistory.test.ts` seeds that commit a shapeless transition without destinations (now E-T6), then add the listener tests.
- **Blockers:** none.
- **Resume from:** `git checkout timeline/p4-write-wrapper`; update `apps/desktop/src/db-functions/__test__/timelineHistory.test.ts` so every committed edit satisfies I-T6, then write `apps/desktop/src/db-functions/__test__/timelineChanges.test.ts`; run `pnpm --dir apps/desktop run test:history <file>`.

### 2026-09-30 · timeline-worker agent (timeline/p4-write-wrapper) · P4.1, P4.2, P4.3

- **Done:** PR https://github.com/AlexDumo/OpenMarch-timeline/pull/9 (commit `1358335b`). P4.1 adds the E-T6 commit check and change-log drain in `transactionWithHistory`, delivered after commit. P4.2 does the same inside the undo/redo replay transaction, and undo/redo now queue on the write lock. P4.3 adds `subscribeTimelineChanges` (`batch` and `reset`) and `resetTimelineChangeLog` on file open (`App.tsx`), and asserts in dev and test that the log is empty after each drain. Repair now copies marchers and the timeline tables parents first, skips `timeline_change_log` and clears it (the P3 cross-phase note). `timelineHistory.test.ts` seeds now insert a shapeless transition's destinations in the same edit.
- **Checks:** `pnpm --dir apps/desktop exec tsc --noEmit` pass. `pnpm --dir apps/desktop run test:history src/db-functions/__test__/timelineChanges.test.ts src/db-functions/__test__/timelineHistory.test.ts src/db-functions/__test__/history.test.ts --silent`: 70/70 pass. `pnpm --dir apps/desktop run test:focused electron/database/__test__/repair.test.ts electron/database/migrations/__test__/`: 128/128 pass. `pnpm --dir apps/desktop run test:focused src/db-functions/`: 462 pass, 1 todo. eslint, prettier and cspell on the changed files: clean. Not run, per the current policy: the full `test:history`, the full desktop suite, and e2e. No exit-gate item ticked: none is covered by P4.1-P4.3 alone.
- **Next:** review and merge PR #9. P4.4+ build on `transactionWithHistory` as is.
- **Blockers:** none. Finding: undoing or redoing a marcher rename delivers a no-op `marchers` change (before equals after), because the history inverse rewrites every column and so fires `timeline_log_marchers_upd`. It's harmless after coalescing, and a test pins it. A cross-phase note in the Phase 3 file suggests an optional `WHEN` guard.

### 2026-09-30 · lead session · P4.1 to P4.3 (reviewed and merged)

- **Done:** fork PR #9 reviewed by a sub-agent (APPROVE WITH NITS; no regressions for non-timeline tables: the drain is after the group asserts and before commit, delivery happens once after commit and never on rollback, the change-log triggers can't be caught by the history trigger-mode switching, undo/redo sharing the write lock has no deadlock path, and the repair copy order is safe for files without timeline data). Before merging, the lead made `TimelineCommitViolationError` safe for an empty list. Merged as 54750956. The two undo edge cases that predate this PR, and an optional trigger guard, are in the handoff notes. P4.1 to P4.3 set to done.
- **Checks:** at the PR head: `pnpm --dir apps/desktop exec tsc --noEmit` (pass); `pnpm --dir apps/desktop run test` (the regular suite: 87 files, 1,387 passed, 7 skipped; the pre-existing jest-dom failures didn't occur in this run); `pnpm --dir apps/desktop run test:history src/db-functions/__test__/ electron/database/__test__/repair.test.ts` (15 files, 503 passed). After the fix: tsc (pass) and `test:history .../timelineChanges.test.ts` (11 passed). The full `test:history` suite and e2e were skipped per policy.
- **Next:** P4.4 and P4.6 are in progress; P4.5 (R-E1), P4.7 to P4.9 follow.
- **Blockers:** none.

### 2026-09-30 · timeline-worker agent (timeline/p4-db-functions) · P4.4, P4.6

- **Done:** PR 10 on `timeline/p4-db-functions`: `{create,update,delete}...InTransaction` for timelines, shapes, transitions, assignments, slot destinations, marcher homes; one-edit shape/individual switch; child-first deletes of timelines and transitions (C-1); typed `TimelineWriteError`. `history.ts` untouched.
- **Checks:** `tsc --noEmit` pass; `test:history timelineWrites.test.ts` 18 passed; `test:focused timelineWrites.test.ts` 18 passed; prettier, eslint and cspell clean. Full `test:history` and e2e skipped per policy.
- **Next:** review; P4.5 builds on `updateTimelineTransitionsInTransaction`'s plain range path.
- **Blockers:** none. Note: the combined trigger message "E-A1/E-A2" maps to code `E-A1`.

### 2026-09-30 · lead session · P4.4, P4.6 (reviewed and merged)

- **Done:** fork PR #10's branch predated PR #9, so the lead merged the base into it (conflict in `db-functions/index.ts`: kept both export sets). A sub-agent reviewed it (APPROVE WITH NITS: every multi-statement function's order keeps each intermediate state valid, so edits and their undo can't be rejected; no function can leave a shapeless transition incomplete at commit; partial updates are validated against the resulting values). Before merging, the lead fixed the one spec mismatch: combined trigger messages now map to combined codes instead of the first half (a block with too few slots reported E-T3 where QA-DB-15/-21 expect E-T4), and the code must start the innermost SQLite message. Merged. P4.4 and P4.6 set to done; P4.4's description corrected (no public wrappers). Remaining nits are in the handoff notes.
- **Checks:** on the PR merged with the base: `pnpm --dir apps/desktop exec tsc --noEmit` (pass); `test:history` on `timelineWrites.test.ts`, `timelineChanges.test.ts` and `timelineHistory.test.ts` (3 files, 38 passed). After the fix: tsc (pass), `test:history .../timelineWrites.test.ts` (18 passed). Full `test:history` and e2e skipped per policy.
- **Next:** P4.5 (R-E1 range procedure); then P4.7 to P4.9.
- **Blockers:** none.

### 2026-09-30 · timeline-worker agent (timeline/p4-range-edit) · P4.5, P4.7

- **Done:** checkpoint `78e3bd9c` on `timeline/p4-range-edit`: `setTimelineTransitionRangeInTransaction` (R-E1: union, anchored rows, target) in `apps/desktop/src/db-functions/timelineTransitions.ts`; the plain range update now points to it; `refuseDuplicateIds` (E-ARGS) in `timelineErrors.ts`, applied to the transition and shape update functions (the PR #10 follow-up).
- **Checks:** `pnpm --dir apps/desktop exec tsc --noEmit` pass.
- **Next:** the P4.7 tests and the PR #10 follow-up tests in `apps/desktop/src/db-functions/__test__/timelineRangeEdit.test.ts`.
- **Blockers:** none.
- **Resume from:** `git checkout timeline/p4-range-edit`; `pnpm install` and `pnpm exec turbo run build --filter=@openmarch/desktop^... --force` in a fresh tree; write `apps/desktop/src/db-functions/__test__/timelineRangeEdit.test.ts` (QA-DB-11/-12/-13/-24/-25/-29, QA-UNDO-2a-g, E-T3/E-T4, E-A2, E-T6 row trigger, duplicate ids); run `pnpm --dir apps/desktop run test:history <that file>`.

### 2026-09-30 · timeline-worker agent (timeline/p4-range-edit) · P4.5, P4.7

- **Done:** PR https://github.com/AlexDumo/OpenMarch-timeline/pull/12 (commit `fc72068d`).
  - `setTimelineTransitionRangeInTransaction` implements R-E1 in three steps: the union, then one UPDATE per anchored row, then the target. The plain range update behaves as before and points to the procedure.
  - `refuseDuplicateIds` makes the transition and shape updates refuse a repeated id with `E-ARGS`.
  - New `timelineRangeEdit.test.ts` covers QA-DB-11, -12, -13, -24, -25 and -29, plus QA-UNDO-2a to -2g on the real `performUndo`/`performRedo`. It also covers these PR #10 follow-ups: `E-T3/E-T4` on create, switch and update, `E-A2`, a row-trigger `E-T6`, and duplicate ids.
  - QA-DB-26 stays in `timelineChanges.test.ts`, and QA-DB-13b in `timelineWrites.test.ts`.
  - The PR #10 handoff bullets on tests and duplicate ids are addressed.
- **Checks:**
  - `pnpm --dir apps/desktop exec tsc --noEmit`: pass.
  - `pnpm --dir apps/desktop run test:history src/db-functions/__test__/timelineRangeEdit.test.ts src/db-functions/__test__/timelineWrites.test.ts src/db-functions/__test__/timelineChanges.test.ts src/db-functions/__test__/timelineHistory.test.ts --silent`: 4 files, 60 passed.
  - `test:focused` on the new file and `timelineWrites.test.ts`: 40 passed.
  - eslint, prettier and cspell on the changed files: clean.
  - Skipped per policy: the full `test:history` suite, the full desktop suite and e2e.
- **Exit gate:** nothing ticked. The P4.7 half of the first item passes (the command above), but that item also needs P4.8.
- **Next:** review and merge PR #12. P4.8 can build on the new test file's seed and round-trip helpers.
- **Blockers:** none.
- **Notes:**
  - An emptied row (QA-DB-13) fails the I-A6 CHECK, which surfaces as `E-DB`, the same as other CHECK failures.
  - A range edit to the current range writes nothing, so `transactionWithHistory` would reject it as an edit with no changes. Callers should skip it.

### 2026-09-30 · lead session · P4.5, P4.7 (reviewed and merged)

- **Done:** fork PR #12 reviewed by a sub-agent (APPROVE WITH NITS: R-E1 matches spec §6 and `rangeEdit` statement for statement; every intermediate state is valid in both directions, so undo replays; the plain range path still refuses stranding; QA-UNDO-2a to 2g round-trip on the real undo with exact comparisons). Before merging, the lead added a QA-UNDO-2 round trip to a disjoint target ([8, 24) to [30, 40)). Merged as 99419e1c. P4.5 and P4.7 set to done. The no-op behavior is in the handoff notes.
- **Checks (PR):** tsc (pass); `test:history` on the four timeline db-function files (60 passed); after the added test, `timelineRangeEdit.test.ts` (23 passed).
- **Checks (merged base):** on `timeline-try-2` at 99419e1c: `pnpm exec turbo run build --filter=@openmarch/desktop^...` (pass); `pnpm --dir apps/desktop exec tsc --noEmit` (pass); `test:history` on `timelineRangeEdit`, `timelineWrites`, `timelineChanges`, `timelineHistory` and `src/timeline/__test__/` (6 files, 92 passed).
- **Next:** P4.8 (the remaining QA-UNDO cases and the two undo edge cases in the handoff notes) and P4.9 (end-to-end fuzz with the real undo).
- **Blockers:** none.

### 2026-09-30 · timeline-worker agent (timeline/p4-undo) · P4.8

- **Done:** checkpoint `13ec4932` on `timeline/p4-undo`. `executeHistoryAction` now runs the redo-group increment (and its pruning), the replay, the removal of the replayed group and the group refresh in one transaction, so a rejected or failed undo/redo changes nothing (handoff edge cases 1 and 2). The history response's error message now includes the error's causes. New `apps/desktop/src/db-functions/__test__/timelineUndo.test.ts`: QA-UNDO-1/1b, -3, -4, -6, -8, rejected undo/redo (including at the group limit) and a failure after the replay.
- **Checks:** `test:history src/db-functions/__test__/timelineUndo.test.ts`: 16 passed (7 fail against the old `history.ts`).
- **Next:** tsc, eslint, the db-function history tests, repair test; then the PR.
- **Blockers:** none.
- **Resume from:** `git checkout timeline/p4-undo`; run `pnpm --dir apps/desktop exec tsc --noEmit` and `pnpm --dir apps/desktop run test:history src/db-functions/__test__/`, then open the PR.

### 2026-09-30 · timeline-worker agent (timeline/p4-undo) · P4.8

- **Done:** PR https://github.com/AlexDumo/OpenMarch-timeline/pull/13 (commit `13ec4932`).
  - Both undo edge cases in the handoff notes are fixed. `executeHistoryAction` now runs the redo-group increment and its pruning, the replay, the DELETE of the replayed group and the group refresh in one transaction. A rejected or failed undo/redo leaves the data and all three history tables unchanged, and delivers no batch.
  - Trigger-mode switching (DDL) and the FK pragma stay outside the transaction, as before.
  - The history response's error message now includes the `cause` chain, where the SQLite reason lives.
  - New `timelineUndo.test.ts` covers QA-UNDO-1/1b (negative controls), -3, -4, -6 and -8, rejected undo and redo (including at the group limit), and a failure after the replay.
  - QA-UNDO-2, -5 and -7, C-1 and C-2 are already covered in `timelineRangeEdit`, `timelineChanges` and `timelineHistory`, and aren't repeated.
- **Checks:**
  - `pnpm --dir apps/desktop exec tsc --noEmit`: pass.
  - `pnpm --dir apps/desktop run test:history src/db-functions/__test__/`: 17 files, 519 passed, 1 todo.
  - `test:history .../timelineUndo.test.ts`: 16 passed.
  - `test:focused electron/database/__test__/repair.test.ts`: 41 passed.
  - eslint, prettier and cspell: clean.
  - Skipped per policy: the full `test:history` suite, the full desktop suite and e2e.
- **Exit gate:** nothing ticked. The P4.8 half of the first item passes on the PR branch, but that item only becomes true on the base when the PR merges.
- **Next:** review and merge PR #13, then P4.9.
- **Blockers:** none.
- **Notes:**
  - `timeline_assignments.marcher_id` still cascades. With the BEFORE DELETE history trigger, a marcher's inverse is logged before its assignments', which is the reverse of U-4's order. Undo is still exact, because the replay runs with FKs off and no assignment trigger reads `marchers`. QA-UNDO-3 pins this order.
  - `timeline_assignments` is unique on (transition_id, marcher_id).
  - SQLite fires the newest trigger first, so the QA-UNDO-1 control recreates the history triggers after adding the v0.6 trigger.
  - Redo on an empty stack resets `cur_redo_group`; it changes nothing else.

### 2026-09-30 · lead session · P4.8 (reviewed and merged)

- **Done:** fork PR #13 reviewed by a sub-agent (APPROVE WITH NITS, no regressions for ordinary undo/redo: the success path is identical; the history triggers read `cur_redo_group` when they fire, so incrementing inside the replay transaction can't misnumber redo rows; `PRAGMA foreign_keys` is still set outside the transaction; `refreshCurrentGroups` is safe inside it; no trigger reads `marchers`, so the marcher-before-assignments order still undoes exactly). Merged. Both undo edge cases are resolved: a rejected or failed undo/redo now leaves data and every history table unchanged, including at the group limit. The C-1 exception for marchers is recorded in `implementation-plan.md`. P4.8 set to done.
- **Checks:** at the PR head: tsc (pass); `test:history src/db-functions/__test__/ electron/database/__test__/repair.test.ts` (18 files, 560 passed); `pnpm --dir apps/desktop run test` (90 files passed, 1 failed: `Canvas.test.tsx` "renders" timed out on the loading spinner while another test run was going; re-run alone twice, it passed both times, so it's load-dependent, not caused by this PR, which doesn't touch the canvas).
- **Next:** P4.9 (end-to-end fuzz with the real undo).
- **Blockers:** none.

### 2026-09-30 · lead session · P4.9 (checkpoint after a usage-limit stop)

- **Done:** the worker stopped on the account usage limit after drafting `apps/desktop/src/db-functions/__test__/timelineE2eFuzz.test.ts` (1,466 lines), uncommitted. The lead committed it as-is as 0a884294 (`wip:`, untested; only a cspell ignore line added) and pushed it to `timeline/p4-e2e-fuzz` on the fork.
- **Checks:** pre-commit hook (cspell, eslint, prettier) passed. Not run yet.
- **Next:** the resumed worker runs and finishes the draft.
- **Blockers:** none.
- **Resume from:** check out `timeline/timeline/p4-e2e-fuzz` (0a884294), run `pnpm --dir apps/desktop run test:history src/db-functions/__test__/timelineE2eFuzz.test.ts` in the background, and fix what fails.

### 2026-09-30 · timeline-worker agent (timeline/p4-e2e-fuzz) · P4.9 (resumed)

- **Done:** resumed from 0a884294 on `timeline/p4-e2e-fuzz`; status set to in-progress.
- **Checks:** none yet.
- **Next:** build the workspace packages, run the draft fuzz test and fix what fails.
- **Blockers:** none.
- **Resume from:** check out `timeline/timeline/p4-e2e-fuzz`, `pnpm install`, `pnpm exec turbo run build --filter=@openmarch/desktop^... --force`, then run `pnpm --dir apps/desktop run test:history src/db-functions/__test__/timelineE2eFuzz.test.ts` in the background and fix what fails.

### 2026-09-30 · timeline-worker agent (timeline/p4-e2e-fuzz) · P4.9 (checkpoint)

- **Done:** checkpoint `b5cc1d21` on `timeline/p4-e2e-fuzz`. The draft passes at its default size (3 seeds × 40 steps: 62 commits, 33 rejected edits, 16 undo and 5 redo steps, pruning reached). The v0.6 negative control breaks undo on seed 1. The usual break is the stack count: `executeHistoryAction` switches only the replayed group's tables to redo mode, so the assignment rows the v0.6 trigger rewrites during the replay are logged on the undo stack, and the redo stack is cleared. The control now accepts that kind. `E-DB` rejections are counted with the database's reason.
- **Checks:** `pnpm --dir apps/desktop exec tsc --noEmit` pass; `test:history src/db-functions/__test__/timelineE2eFuzz.test.ts` pass (6 passed, 11 skipped: the remaining control seeds after the first break).
- **Next:** the large run (`TIMELINE_E2E_SEEDS=600 TIMELINE_E2E_STEPS=80`) in the background, then squash and open the PR.
- **Blockers:** none.
- **Resume from:** check out `timeline/timeline/p4-e2e-fuzz` (b5cc1d21), then in `apps/desktop` run `TIMELINE_E2E_SEEDS=600 TIMELINE_E2E_STEPS=80 TIMELINE_E2E_REPORT=<file> pnpm run test:history src/db-functions/__test__/timelineE2eFuzz.test.ts` in the background; then squash the wip commits into one and open the PR.

### 2026-09-30 · timeline-worker agent (timeline/p4-e2e-fuzz) · P4.9

- **Done:** PR https://github.com/AlexDumo/OpenMarch-timeline/pull/15 (commit `9c93267a`, the wip commits squashed and rebased onto `timeline-try-2`). The PR adds `apps/desktop/src/db-functions/__test__/timelineE2eFuzz.test.ts`, a test only.
- **Large run:** `TIMELINE_E2E_SEEDS=600 TIMELINE_E2E_STEPS=80` passed at the pre-rebase head: 603 tests passed and 11 control seeds were skipped, in 315 s.
  - 48,000 steps and 24,419 committed edits: 7,138 changed individual destinations, 1,906 were R-E1 range edits, 1,232 were shape/individual switches and 4,706 committed at the group limit.
  - 13,318 rejected edits, 4,336 of them with a deliberately invalid change.
  - 10,829 undo and 1,821 redo steps.
  - 37,069 verifications and about 12.5 million positions compared, with no failure.
  - The v0.6 control broke undo on seed 1, step 15.
- **Checks:**
  - `pnpm --dir apps/desktop exec tsc --noEmit`: pass.
  - `pnpm --dir apps/desktop run test:history src/db-functions/__test__/timelineE2eFuzz.test.ts`: 6 passed, 11 skipped (the control seeds after the first break), also after the rebase.
  - eslint, prettier and cspell on the file: clean.
  - Skipped per policy: the full `test:history` suite, the full desktop suite and e2e.
- **Exit gate:** nothing ticked. The P4.9 item passes on the PR branch, but it becomes true on the base only when the PR merges.
- **Next:** review and merge PR #15.
- **Blockers:** none.
- **Notes:** `executeHistoryAction` switches only the replayed group's tables to redo mode. A trigger that writes to another table during a replay therefore logs on the undo stack and clears the redo stack. Under the v0.6 trigger, that's how undo breaks. The current schema has no such trigger, so the app isn't affected, but a future cross-table writing trigger would hit the same problem.

### 2026-09-30 · timeline-worker agent (timeline/p4-e2e-fuzz) · P4.9 (review fixes, checkpoint)

- **Done:** follow-up commit `c8d8567e` on PR #15 for the lead's review:
  - Batch count: a commit that changes logged data must deliver exactly one batch. One that changes none may deliver one only when every row's net change is a no-op. Writing a value that's already there fires the log triggers, and batches aren't coalesced, so an edit can log a change and its reverse.
  - The comparison uses the columns the change-log triggers image. Timelines and a marcher's other columns aren't logged.
  - `E-DB` rejections must be an expected reason. FOREIGN KEY is accepted only from the shape-in-use invalid change.
  - Every generator and invalid change is named, counted and required in the coverage test. The coverage test skips when not every seed ran.
  - Invalid changes count only when applied, and take turns from a random start per seed. The default is now 5 seeds × 80 steps, with every kind exercised at least twice.
  - The v0.6 control accepts only failures from an undo or redo.
  - Handoff note added on the trigger-mode switch.
- **Checks:** tsc pass; `test:history src/db-functions/__test__/timelineE2eFuzz.test.ts`: 8 passed, 11 skipped; eslint, prettier and cspell clean.
- **Next:** a medium run (100 × 80) is running; record its counts on the PR.
- **Blockers:** none.
- **Resume from:** check out `timeline/timeline/p4-e2e-fuzz` (c8d8567e), then in `apps/desktop` run `TIMELINE_E2E_SEEDS=100 TIMELINE_E2E_STEPS=80 TIMELINE_E2E_REPORT=<file> pnpm run test:history src/db-functions/__test__/timelineE2eFuzz.test.ts` in the background, and add its counts to PR #15 and this log.

### 2026-09-30 · timeline-worker agent (timeline/p4-e2e-fuzz) · P4.9 (review fixes done)

- **Done:** PR https://github.com/AlexDumo/OpenMarch-timeline/pull/15 is updated with the review fixes (`c8d8567e`) and the medium run's counts; it's back in review.
- **Medium run:** `TIMELINE_E2E_SEEDS=100 TIMELINE_E2E_STEPS=80` passed: 103 tests passed and 11 control seeds were skipped, in 55 s.
  - 8,000 steps and 3,407 committed edits; 96 commits delivered only no-op changes.
  - 2,856 rejected edits, 1,135 of them with an applied invalid change.
  - 1,786 undo and 360 redo steps.
  - 5,553 verifications and 1,874,570 positions compared, with no failure.
  - Every generator committed at least 53 times, and every invalid change was applied 71 to 88 times.
  - The 79 FOREIGN KEY rejections equal the 79 shape-in-use invalid changes.
- **Checks:**
  - tsc: pass.
  - `test:history src/db-functions/__test__/timelineE2eFuzz.test.ts` (default size, now 5 × 80): 8 passed, 11 skipped.
  - With `-t "seed 2:|every kind"`: the coverage test skips, 2 passed.
  - eslint, prettier and cspell: clean.
  - Skipped per policy: the full `test:history` suite, the full desktop suite and e2e.
- **Next:** re-review and merge PR #15.
- **Blockers:** none.

### 2026-09-30 · lead session · P4.9 (reviewed and merged); Phase 4 code complete

- **Done:** fork PR #15's first review asked for changes (unexpected E-DB reasons passed silently; a missing batch could pass; coverage counted invalid ops that never ran). The worker fixed them; the batch rule now keys on the columns the change-log triggers record (exactly one batch when they change; otherwise at most one, and only if every row's net change is a no-op), which the re-review checked against `triggers.ts` and approved. The lead fixed one re-review nit before merging (runs smaller than the default skip the coverage check instead of failing it). Merged as e429b97c. P4.9 set to done. Every Phase 4 package is done.
- **Checks:** at the PR head: tsc (pass); default fuzz (8 passed, 11 skipped); with `TIMELINE_E2E_SEEDS=1` (3 passed, coverage skipped). The worker's medium run (100 seeds × 80 steps): 3,407 commits, 2,856 rejections (1,135 with an applied invalid change), 1,786 undo steps and 360 redo steps, 1,874,570 positions compared, no failures; the v0.6 negative control broke undo on seed 1. On the merged base: tsc (pass); `test:history` on timelineRangeEdit, timelineWrites, timelineUndo, timelineE2eFuzz, timelineChanges and timelineHistory (6 files, 85 passed, 11 skipped). Exit-gate items for P4.7/P4.8, P4.9 and tsc ticked. Not ticked: "the full existing desktop suite passes", because the full `test:history` suite is skipped under the current policy (the regular suite has passed on every Phase 4 PR).
- **Next:** Phase 4 stays in-progress only for that gate item.
- **Blockers:** the full `test:history` run waits on the policy.

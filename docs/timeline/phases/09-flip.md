---
phase: 9
title: Flip: convert on open
status: in-progress
owner: timeline-worker
branch: timeline/p9-2-backup
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
- Status: done
- PR: none
- Parallel: no
- Depends on: —

Confirm C-8 is decided and implemented. If not, this phase is blocked.

### P9.2: Backup before converting

- Owner: timeline-worker (timeline/p9-2-backup)
- Status: done
- PR: https://github.com/AlexDumo/OpenMarch-timeline/pull/40
- Parallel: yes
- Depends on: P9.1

Back up the file before converting (next to the original, with a clear name).

### P9.3: Convert on open

- Owner: timeline-worker (timeline/p9-3-convert-on-open)
- Status: done
- PR: https://github.com/AlexDumo/OpenMarch-timeline/pull/42
- Parallel: no
- Depends on: P9.2

A post-migration step in the main process runs the converter in one transaction, and sets `user_version = 8` in that transaction (ADR 0001 §6). Releases with the P3.9 guard refuse newer files; older releases can't, so warn when a converted file comes back at 7 and offer the backup instead of converting again.

### P9.4: Remove the dev flag

- Owner: unassigned
- Status: blocked
- PR: none
- Parallel: no
- Depends on: P9.3, P9.8, P9.9, P9.10

Remove the dev flag. Timeline mode is the only mode. Prerequisites (from the P9.8 review): a packaged smoke run (`build:electron`, then open a page-era show with `OPENMARCH_CONVERT_ON_OPEN=1` and confirm the worker loads from `app.asar`), and a manual app pass by the owner on a copy of a real show.

### P9.5: Freeze page-era writes

- Owner: timeline-worker (timeline/p9-5-freeze-page-writes)
- Status: done
- PR: https://github.com/AlexDumo/OpenMarch-timeline/pull/45
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

### P9.8: Convert off the main process

- Owner: timeline-worker (timeline/p9-8-convert-worker)
- Status: done
- PR: https://github.com/AlexDumo/OpenMarch-timeline/pull/44
- Parallel: yes
- Depends on: P9.3

Before P9.4 turns convert-on-open on for everyone, move the backup (P9.2) and the conversion (P9.3) off the Electron main process, into a worker thread or `utilityProcess`, so large shows don't freeze the app (about 1–2 s for a 50 MB backup and about 4 s to convert 400 marchers by 100 pages, all synchronous today; Windows marks a window "Not Responding" after about 5 s). Keep one transaction and exact rollback, keep the "Preparing your file" modal responsive with progress if cheap, and also consider the bulk-insert path from Phase 6's handoff notes (chunked multi-row inserts) to cut conversion time. `export-utility-process.ts` is dead code (P7.7), not a working pattern.

### P9.9: Quit during conversion

- Owner: timeline-worker (timeline/p9-9-quit-during-conversion)
- Status: in-review
- PR: https://github.com/AlexDumo/OpenMarch-timeline/pull/46
- Parallel: yes
- Depends on: P9.8

From the P9.4 packaged smoke run: on macOS a Quit sent while the "Preparing your file" window is up is cancelled (`User canceled (-128)`), so the conversion runs to completion and the app keeps running until a second Quit. Make a quit during conversion stop the worker (rollback, file stays at 7, reopens next launch, per P9.8) and then quit. Likely cause: the `modal: true, closable: false` preparing window in `convertOnOpenDialogs.ts`. Also quiet the expected `sql:proxy` "a file is being opened" handler errors (log once at debug level, not as errors). Verify with automated tests only; the packaged re-run needs the owner's go-ahead.

### P9.10: Convert to range-aligned timelines, then enforce C-11

- Owner: timeline-worker (timeline/p9-10-range-aligned-convert)
- Status: done
- PR: https://github.com/AlexDumo/OpenMarch-timeline/pull/50
- Parallel: no
- Depends on: P8.10

TODO from the owner (C-11). The converter still writes one show-wide timeline holding a differently ranged transition per page, so converted shows (and every test built through `applyTimelineModeToFile`) break the rule that a transition spans its timeline.

- Plan one timeline per page move in `timeline/convert/planPageConversion.ts` and write it in `convertPagesInTransaction.ts`; drop the converter's guard bypass (`TODO(P9.10)`).
- Check `addMarchersToTimelineInTransaction`, the page ripple and P7.3's page moves against the new shape, and remove the legacy branches marked `TODO(P9.10)` (refusals for multi-range timelines, shape-clip gap splitting).
- Add an `E-T1` row to `timeline_commit_violations` (`triggers.ts`) for a transition whose range differs from its timeline's. It must be commit-time: shift, ripple and R-E1 pass through unequal intermediate states (D-17).
- Re-run conversion equality (P6.6) and the convert-on-open tests.

## Exit gate

Tick an item only after running its check, and paste the command and result into the log.

- [ ] P9.6 passes on the corpus
- [ ] Manual QA of playback, editing and export (human)
- [ ] The full desktop suite, e2e and Electron build pass

## Handoff notes

Kept current by the phase lead: where things stand, surprises, and what not to redo.

- **P9.2 backup API (for P9.3).** `apps/desktop/electron/database/backup.ts` exports `backupBeforeConversion(filePath): BackupResult` (synchronous, main process only; PR 40).
  - Call it before converting, with the file's path, while no migration or conversion transaction is open on it. Convert only when `result.ok` is true. On `ok: false`, show `result.message` (English, safe to show) and stop; `result.code` is one of `source-missing`, `directory-not-writable`, `disk-full`, `file-busy`, `name-too-long`, `source-unreadable`, `verification-failed`, `unknown`. It never throws for those.
  - On success it returns `{ ok: true, backupPath, userVersion }`. The backup is next to the original, named `<name> (before timeline conversion).dots`, then `... conversion 2).dots`, `3`, and so on. Show `backupPath` in the "converted, backup saved" message and use it for the "file came back at 7, restore the backup" offer.
  - It is a `VACUUM INTO` snapshot from a read-only connection (5 s busy timeout), verified (integrity check, `user_version`, schema) before it gets its final name, so it is consistent even if another connection has the file open or commits meanwhile. It never writes to the original's main file; on a WAL file SQLite may touch the `-wal`/`-shm` side files. If P9.3 needs the version check first, run `decideFileVersion` before calling this, so a too-new file isn't backed up.
  - **Performance:** it runs on the calling thread and takes roughly 1 to 2 s for a 50 MB file. P9.3 must either show a blocking "preparing your file" state or run it off the main thread. `export-utility-process.ts` is dead code (P7.7), not a pattern to reuse.
  - `nextBackupPath` and `BACKUP_NAME_SUFFIX` are exported too; the second argument of `backupBeforeConversion` is for tests only. Nothing calls the backup yet. It needs no IPC or ADR change; if P9.3 wants the renderer to trigger or show it, that goes through the usual IPC rules.
- **P9.4 prerequisite (from the P9.8 review).** Before removing the flag, run a packaged smoke test: `pnpm --dir apps/desktop run build:electron`, then open a page-era show with `OPENMARCH_CONVERT_ON_OPEN=1`. Confirm that the worker loads from `app.asar` (`dist-electron/worker/convertOnOpenWorker.js`), that the "Preparing your file…" window shows progress, and that quitting mid-conversion leaves the file at version 7 and reopens it on the next launch. P9.8 checked the asar loading only with a small test app.
- **P9.4 packaged quit re-run (from P9.9).** Judge the quit by the process exiting and the file staying at version 7, not by the AppleScript command's exit code.
  - AppleScript `quit` returns `User canceled (-128)` even when the quit works. The first quit is always cancelled, by the main window's `close` handler or, during a conversion, by the held `before-quit`. The app then quits by itself.
  - Check that the process is gone (for example with `ps`) within a few seconds.
  - Check that `user_version` is 7 with no timeline rows.
  - Check that the main-process log has a `before-quit:` line.
  - If the worker can't be stopped within 15 s, the log says `didn't stop within 15000 ms; exiting`, and the process ends through `app.exit()`.

## Progress log

<!-- Append entries below, newest last, using the format in ../README.md. Never edit earlier entries. -->

### 2026-09-29 · Cross-phase note from P0 · P9.3

- **Done:** ADR 0001 (proposed, PR https://github.com/OpenMarch/OpenMarch/pull/1035) section 6 found that P9.3's "older app versions refuse the file cleanly" doesn't hold for any current release: `apps/desktop/electron/main/index.ts` sets `PRAGMA user_version = 7` on every open before migrating, and `DrizzleMigrationService` only checks for 7.
- **Checks:** read the open path in `main/index.ts` and `DrizzleMigrationService.ts`; no code run.
- **Next:** if the ADR is accepted as drafted, a release before Phase 9 must read `user_version`, refuse versions above the supported one, and stop overwriting it; P9.3 then sets 8 on conversion and warns when a converted file comes back at 7. Which phase ships the check is for the phase leads to agree.
- **Blockers:** none yet; depends on P0.4.

### 2026-10-01 · lead · P9.1

- **Done:** the project owner decided C-8 on 2026-10-01: pathways and midsets were never implemented and are dropped. The lead recorded the outcome in ADR 0001 and `implementation-plan.md`.
  - SVG page shapes become individual destinations. Page-mode motion between pages is straight, so only the editable curve object is lost.
  - P6.6 (conversion equality corpus) verifies the result on real shows.
- **Checks:** none (a decision record).
- **Next:** P9.2. The phase still formally depends on Phase 8, where P8.7's human verdicts are open.
- **Blockers:** none for P9.2.

### 2026-10-01 · timeline-worker · P9.2

- **Done:** added `electron/database/backup.ts` (`backupBeforeConversion`) and `electron/database/__test__/backup.test.ts`. Handoff notes record the API for P9.3. PR https://github.com/AlexDumo/OpenMarch-timeline/pull/40.
- **Checks:** from `apps/desktop`: `pnpm run test:focused electron/database/__test__/backup.test.ts` 9 passed; `pnpm run test:focused electron/database/__test__/fileVersion` 36 passed; `pnpm tsc --noEmit` clean apart from existing `Timeline.stories.tsx` errors; prettier, cspell and the pre-commit hook passed. Skipped per the current policy: full `test:history` and e2e.
- **Next:** review and merge; then P9.3.
- **Blockers:** none. The phase formally depends on Phase 8, where P8.7's human verdicts are open.

### 2026-10-01 · timeline-worker · P9.2

- **Done:** addressed the PR 40 review in commit f905edda: dangling-symlink loop fixed (`lstat`, bounded retries), verification checks only the copy and the snapshot is retaken on a concurrent commit, `file-busy` and `name-too-long` codes, error-code classification (file system and SQLite), 255-byte name truncation, short temp names, orphan sweep, safer publish, WAL docs, and the performance note for P9.3.
- **Checks:** from `apps/desktop` after `pnpm install`: `pnpm tsc --noEmit` clean; eslint clean on the two files; `pnpm run test:focused electron/database/__test__/backup.test.ts` 21 passed; `pnpm run test:focused electron/database` 194 passed. Skipped per the current policy: full `test:history` and e2e.
- **Next:** re-review and merge; then P9.3.
- **Blockers:** none.

### 2026-10-01 · lead · P9.2

- **Done:** reviewed PR #40 and squash-merged it at head f905edda.
  - The review found two high-severity issues, both fixed:
    - an endless loop when a dangling symlink sits on the backup name;
    - a false verification failure when another connection committed during the backup.
  - It also found medium issues, fixed:
    - BUSY handling;
    - error classification by error code instead of by message text, which had read a folder named "Full Band" as `disk-full`;
    - long names;
    - publishing the backup;
    - sweeping orphaned temp files;
    - WAL documentation.
- **Checks (lead, on f905edda):**
  - `tsc --noEmit`: pass.
  - `test:focused electron/database`: 11 files, 194 tests passed.
  - `pnpm --dir apps/desktop run test`: 162 files and 2,295 tests passed on the second run. The first run had one failure in `timelineHistory.test.ts` ("trigger 'timelines_it' already exists"). That file passed 3 times alone and in the rerun, so it's recorded in `findings.md`.
  - Skipped by policy: full `test:history` and e2e.
- **Next:** P9.3 (convert on open) can start. See the handoff note on blocking the UI or moving off the main thread.
- **Blockers:** none.

### 2026-10-01 · timeline-worker (timeline/p9-3-convert-on-open) · P9.3

- **Done:** checkpoint ef821e98 on `timeline/p9-3-convert-on-open`. `apps/desktop/electron/database/convertOnOpen.ts` (gate, check, backup then one-transaction conversion with the flag and `user_version = 8`, older-release warning decision) and `electron/database/__test__/convertOnOpen.test.ts` (node environment, real files). To let the main process load the converter, `fromDatabasePages` moved to `src/global/classes/Page.fromDatabase.ts` and the page/beat row mappers plus `FIRST_PAGE_ID` to `src/db-functions/rowMappers.ts`; the old modules re-export them, so no caller changes.
- **Checks:** `vitest run electron/database/__test__/convertOnOpen.test.ts`: 11 passed.
- **Next:** wire `runConvertOnOpen` into `setActiveDb` with the main-process dialogs and the "preparing your file" window.
- **Blockers:** none.
- **Resume from:** check out `timeline/p9-3-convert-on-open` (ef821e98); add `electron/main/convertOnOpenFlow.ts` and call it from `setActiveDb` in `electron/main/index.ts` after migrations.

### 2026-10-01 · timeline-worker (timeline/p9-3-convert-on-open) · P9.3

- **Done:** PR https://github.com/AlexDumo/OpenMarch-timeline/pull/42 (commit 49947660, squashed and rebased on `timeline-try-2`).
  - `apps/desktop/electron/database/convertOnOpen.ts`:
    - The gate, the check and the result types.
    - The conversion: back up with `backupBeforeConversion`; only when that succeeds, ONE transaction:
      - converts;
      - turns `timelineMode` on;
      - clears the undo and redo stacks;
      - runs the commit check and drains the change log;
      - sets `user_version = 8`.
  - `apps/desktop/electron/main/convertOnOpenFlow.ts`: the native dialogs and the "Preparing your file…" window. `setActiveDb` in `electron/main/index.ts` calls it after migrations, for existing files only.
  - To let the main process load the converter, `fromDatabasePages` moved to `src/global/classes/Page.fromDatabase.ts`, and the page/beat row mappers and `FIRST_PAGE_ID` to `src/db-functions/rowMappers.ts`. The old modules re-export them.
- **Decisions (lead to confirm in review):**
  - **Gate:** the env var `OPENMARCH_CONVERT_ON_OPEN=1` (or `true`). It's off by default; P9.4 removes it.
  - **Backup or conversion failure:** the app opens nothing and shows a native error dialog. The open flow has no read-only mode. `setActiveDb` returns the main-only status 499 (`OPEN_STOPPED_STATUS`), and `load-file-response` isn't sent for it. No IPC channel or payload type changed, so there's no ADR item.
  - **Version 7 with timeline rows:** the app warns and offers "Open Without Converting" (it writes nothing and warns again on the next open), "Show Backup" (reveals the newest backup and opens nothing) or "Cancel".
  - **Undo history:** the conversion clears it, because page-era undo entries would edit frozen tables.
  - **Blocking state:** a modal window (sandbox, no scripts) over the main window. At startup, with no main window yet, the work runs before the window appears.
- **Performance** (scratch test, not committed): the conversion took 1.2 s for 250 marchers × 50 pages and 3.9 s for 400 × 100. That is linear, about 0.1 ms per assignment. The backup took 22 ms and 55 ms on those files; P9.2 measured 1 to 2 s at 50 MB. Handoff follow-up (2), the bulk insert path, would cut the conversion time.
- **Checks:** all from `apps/desktop`:
  - `vitest run electron/database/__test__/convertOnOpen.test.ts`: 11 passed. It runs in the node environment. It covers:
    - with the gate on: backup, version 8, flag on, rows;
    - with the gate off: no change;
    - an injected backup failure and a real `directory-not-writable` one: the file is unchanged;
    - rollback: no partial rows, version 7, the backup kept;
    - a version 8 reopen: no conversion;
    - the version-7-with-rows warning, for both choices.
  - `test:focused` on `electron/database`, the Page, Beat, page, beat and converter tests, `conversionEquality`, `timelineDevApi` and `timelineFixtureLoad`: 21 files, 499 passed.
  - `test:history` on page, beat, Page, `pageConversion` and `planPageConversion`: 5 files, 245 passed (before the rebase).
  - `tsc --noEmit`: clean.
  - `vite build`: passed, and the main bundle has no fabric.
  - eslint, prettier and cspell: clean.
  - Skipped per the policy: the full `test:history` suite and e2e. `build:electron` wasn't run either.
- **Not done:**
  - A manual run of the app with the gate on (dialogs and the preparing window).
  - New files are still created at 7 and converted on their next open. With the gate on, a show from the new-show wizard is converted, with a backup, when it first opens. Proposed for P9.4.
  - The dialogs are English-only.
- **Next:** review and merge by the lead. Then P9.4 and P9.5.
- **Blockers:** none.

### 2026-10-01 · timeline-worker (timeline/p9-3-convert-on-open) · P9.3

- **Done:** PR #42 review fixes, checkpoint 2cd23567 on `timeline/p9-3-convert-on-open` (after a normal merge of `timeline-try-2`, e0a985c7).
  - 499 handled by every open caller and the renderer.
  - Opens serialized; `BEGIN IMMEDIATE` recheck; "already converted" opens quietly; renderer SQL suspended during a conversion.
  - New files created converted when the gate is on; the paint wait for the modal.
  - Converter and flow loaded with dynamic `import()` only with the gate on.
  - The dev-flag case separated from the older-release case; `findLatestBackup` scans the folder.
  - Rollback tested per step; new tests in `electron/main/__test__/openShow.test.ts`, `openShowImports.test.ts`, `src/hooks/__test__/useLoadFileErrorHandler.test.tsx`, plus `newShowCompletion.test.ts`.
- **Checks so far:**
  - `vitest run electron/database/__test__/convertOnOpen.test.ts`: 34 passed.
  - `electron/main/__test__/openShow.test.ts`: 10 passed.
  - `openShowImports.test.ts`: 2 passed.
  - `newShowCompletion.test.ts`: 15 passed.
  - `useLoadFileErrorHandler.test.tsx`: 5 passed.
  - `tsc --noEmit`: clean.
  - eslint, prettier and cspell: clean.
- **Next:** `vite build` and the main-bundle check, `test:focused electron`, focused `test:history` on the converter tests, the desktop suite, then update the PR body.
- **Blockers:** none.
- **Resume from:** check out `timeline/p9-3-convert-on-open` (2cd23567). From `apps/desktop`, run `pnpm exec vite build` and check `dist-electron/main` for a separate chunk holding the converter. Then run the remaining checks listed above.

### 2026-10-01 · timeline-worker (timeline/p9-3-convert-on-open) · P9.3

- **Done:** PR https://github.com/AlexDumo/OpenMarch-timeline/pull/42 review fixes are pushed as follow-up commits, with no force-push: 2cd23567 (items 1 to 8), ca30a803 (`backup.test.ts` robustness), and normal merges of `timeline-try-2` (e0a985c7, d382ca09; d382ca09 brings in #43). The PR body is updated.
- **Decisions to confirm:**
  - **Stop status:** `database:repair` returns `null` when a main-process dialog already explained why the file didn't open; its channel and the other payload types are unchanged.
  - **Renderer SQL during a conversion:** `sql:proxy` and `unsafeSql:proxy` refuse queries from just before the backup until the reloaded page navigates, with a 15 s fallback.
  - **Dev-flag files:** a version-7 file with timeline rows and no conversion backup is treated as a dev-flag file and opens without a warning.
  - **New-show wizard:** in timeline mode it also writes the imported first-page coordinates as homes.
- **Checks:**
  - On ca30a803, after `pnpm install` and the package build:
    - `pnpm --dir apps/desktop run test`: 167 files passed, 8 skipped; 2,359 tests passed.
    - `tsc --noEmit`: clean.
    - `vite build`: passed. The converter is in a lazily loaded chunk, and `index.js` requires no react, zustand or sonner. No bundle has a leftover `import.meta`.
    - `backup.test.ts`: 21 passed.
  - On 2cd23567:
    - `test:focused` on `electron` plus the touched renderer and converter tests: 22 files, 305 passed.
    - Focused `test:history` on the converter and wizard tests: 4 files, 34 passed.
    - eslint, prettier and cspell: clean.
  - Skipped per the policy: the full `test:history` suite and e2e. `build:electron` wasn't run either.
- **Next:** re-review and merge by the lead.
- **Blockers:** none.

### 2026-10-01 · timeline-worker (timeline/p9-3-convert-on-open) · P9.3

- **Done:** second-review fixes for PR https://github.com/AlexDumo/OpenMarch-timeline/pull/42 in commit 08f73fc0 (follow-up commit, no force-push).
  1. **Renderer-SQL suspension:**
     - Each suspension now has a token, and only its own open's token lifts it.
     - With the gate on, the suspension covers the whole open of an existing file.
     - `resumeSqlProxyAfterReload` lives in `electron/main/openShow.ts` and is tested, including A's resume arriving during B's preparing wait.
     - The conversion connection has a 5 s `busy_timeout`.
  2. **Conversion marker:** `timelineConvertedAt` in the workspace settings, plus the zod field so the renderer keeps it. See C-9 in `implementation-plan.md` and the ADR text below.
  3. **Preparing window:** it moved to `electron/main/preparingWindow.ts` and is destroyed when showing it fails. It is tested with a fake window.
  4. **Import chain:**
     - `src/timeline/timelineRows.ts` now imports the schema module instead of the renderer db.
     - `electron/main/__test__/mainBundle.test.ts` bundles `index.ts` with Vite. It fails if the startup chunks hold a renderer module; checked by reverting the fix.
  5. **Backup on `already-converted`:** an open that finds the file already converted deletes the backup it just wrote.
  6. **Fresh vs converted:** a converted show with only page 0 drops its empty timeline, so it matches a new gate-on file. An equivalence test covers it.
  7. **Connection leak:** `openShowDatabase` closes its connection when an open throws.
  8. **Repeated opens:** `openOnce` returns the pending open's result for the same path. The preload `repairDatabase` is typed as `Promise<string | null>`.
- **ADR 0001 §6 addition (for the lead to apply; `coord.sh` doesn't stage `docs/adr`):**
  > - **Conversion marker (P9.3, C-9).** The conversion transaction, and the creation of a new file while convert on open is on, write `timelineConvertedAt` (an ISO time) into the workspace settings JSON. A version-7 file with the marker was converted and then saved by a release without the version guard: the app warns and offers the backup instead of converting again, even when no backup is found. A version-7 file with timeline rows but neither the marker nor a conversion backup was made with the dev flag and opens without a warning. An older release that saves the workspace settings drops unknown keys, so the backup next to the file is kept as a second signal.
- **Checks:**
  - Test files, one vitest process each:
    - `convertOnOpen`: 37 passed.
    - `openShow` with `openShowImports`: 18 passed.
    - `preparingWindow`: 4 passed.
    - `mainBundle`: 1 passed.
  - `tsc --noEmit`: clean.
  - eslint, prettier and cspell: clean.
- **Next:**
  - Rerun `vite build` and check the main bundle.
  - Run `test:focused electron` and the desktop suite (alone).
  - Update the PR body.
- **Blockers:** none.
- **Resume from:** check out `timeline/p9-3-convert-on-open` (08f73fc0). From `apps/desktop`, run `pnpm exec vite build`, then `pnpm run test:focused electron`, then `pnpm run test`.

### 2026-10-01 · timeline-worker (timeline/p9-3-convert-on-open) · P9.3

- **Done:** second-review fixes are complete on 08f73fc0, and the PR https://github.com/AlexDumo/OpenMarch-timeline/pull/42 body is updated. The previous entry lists the changes. The ADR 0001 §6 text in that entry still needs applying by the lead.
- **Checks (08f73fc0):**
  - `tsc --noEmit`: clean.
  - `vite build`: passed.
    - The startup chunks require no react, zustand or sonner, and contain no renderer db code.
    - The convert-on-open chunk loads only through the dynamic `import()`.
    - No bundle contains `import.meta`.
  - `test:focused electron` plus `useLoadFileErrorHandler` and `newShowCompletion`: 21 files, 300 passed.
  - `pnpm run test`, run alone: 169 files passed, 8 skipped; 2,373 tests passed.
  - Skipped per the policy: the full `test:history` suite and e2e. `build:electron` wasn't run either.
- **Next:** re-review and merge by the lead; then apply the ADR §6 text.
- **Blockers:** none.

### 2026-10-01 · lead · P9.3

- **Done:** squash-merged PR #42 at head 08f73fc0, after two review rounds.
  - **First round:**
    - 499 handling in every caller;
    - a serialized open lock with a `BEGIN IMMEDIATE` recheck;
    - new shows created already converted;
    - paint-before-block;
    - the conversion code loaded only after the gate check;
    - a rollback test for each transaction step.
  - **Second round:**
    - an owner token on the SQL suspension;
    - the `timelineConvertedAt` marker (C-9);
    - the preparing window always destroyed;
    - `timelineRows.ts` moved off the renderer db module, with a main-bundle test;
    - the misleading backup removed;
    - fresh and converted files made equivalent;
    - the connection leak fixed;
    - duplicate opens deduplicated.
  - The lead applied the ADR 0001 §6 marker text (ccb8c772).
- **Checks (lead, on 08f73fc0):**
  - `tsc --noEmit`: pass.
  - `vite build`: pass. Only the dynamically loaded `convertOnOpenFlow` chunk requires react, zustand and sonner.
  - `test:focused electron`: 19 files, 280 tests passed.
  - Focused `test:history`: 30 files, 652 tests passed.
  - `pnpm --dir apps/desktop run test`: 169 files, 2,373 tests passed.
  - Skipped by policy: full `test:history` and e2e.
- **Still open:** a manual app run with `OPENMARCH_CONVERT_ON_OPEN=1` (dialogs and the preparing window). This is human.
- **Next:** P9.8 (convert off the main process) and P9.5 (freeze page-era writes).
- **Blockers:** none.

### 2026-10-01 · timeline-worker (timeline/p9-8-convert-worker) · P9.8

- **Done:** checkpoint 8da15a6c (`wip:`) on `timeline/p9-8-convert-worker`.
  - **Choice: `node:worker_threads`, not `utilityProcess`.** A worker runs under vitest (a `utilityProcess` exists only inside Electron), so the P9.3 tests run through the real worker path. It shares the process, so it starts fast and needs no second process. Checked first: a thread that exits, throws or is terminated inside a `BEGIN IMMEDIATE` transaction has its `DatabaseSync` closed by Node, the journal rolls the transaction back, and a new connection can write at once. Electron 40 loads a worker script and its `node_modules` from inside `app.asar`, with `node:sqlite` (checked with a packed test app).
  - `electron/database/convertOnOpenWorker.ts` (the worker entry, its own connection, 5 s busy timeout), `convertOnOpenProtocol.ts` (messages, plain-data test hooks), `electron/main/convertWorkerHost.ts` (starts it, resolves only after the thread exits, terminates workers on `before-quit`). `openShow.ts` closes its connection before the worker starts and reopens it after; the open lock and the SQL suspension are unchanged. Vite builds the worker as a third entry to `dist-electron/worker/`.
  - Progress: the worker posts "backing up", then pages done out of total; the preparing window shows them (`executeJavaScript` on the main-process-owned window) and the taskbar bar. No IPC channel to the renderer, so no C-n note.
  - Bulk path: assignments go in as chunked multi-row inserts (500 rows), destinations chunked; the converter writes page by page for progress. 400 × 100: conversion 3,791 ms before, 1,430 ms after (in-thread timing).
  - Renderer-free worker bundle: split `historyTriggers.ts` out of `history.ts`, `timelineTransitionsInTransaction.ts` and `timelineShapesInTransaction.ts` out of their modules (the old modules re-export them and keep the undoable wrappers), `convertPagesInTransaction.ts` out of `writePageConversion.ts`, `assert` and `mainProcessLog` out of `utils.ts`, and `sqlProxy.ts` out of `database.services.ts`. The worker bundle now loads no react, zustand, sonner, electron or renderer db module.
  - **P9.3 bug found and fixed:** `createTriggers` ran the history triggers through `window.electron.unsafeSqlProxy` unless `VITEST` was set, so in the real main process the conversion's `create-undo-triggers` step would have thrown and every conversion would have rolled back. It now runs them on its own connection whenever there is no `window`.
- **Checks:** `tsc --noEmit` clean. Tests not run yet.
- **Next:** tests (P9.3 tests through the worker, crash and failure rollback, a timer keeps firing during a large conversion, terminate on quit, worker bundle), then the focused suites.
- **Blockers:** none.
- **Resume from:** check out `timeline/p9-8-convert-worker` (8da15a6c), run `pnpm install` and the package build, then write the worker tests in `electron/database/__test__/` and `electron/main/__test__/`.

### 2026-10-01 · timeline-worker (timeline/p9-8-convert-worker) · P9.8

- **Done:** PR https://github.com/AlexDumo/OpenMarch-timeline/pull/44 (one commit, b82a8cb0). The previous entry has the design.
  - The worker: `electron/database/convertOnOpenWorker.ts`, `convertOnOpenProtocol.ts` and `electron/main/convertWorkerHost.ts`. A crash after the backup becomes `conversion-failed` and keeps the backup; a crash before it becomes `backup-failed` (`unknown`). On quit, workers are terminated and rolled back, and no dialog is shown.
  - The progress window: `showPreparingProgress` in `preparingWindow.ts` (status line, bar and taskbar).
  - The bulk insert: `insertTimelineAssignmentsBulkInTransaction`, plus chunked destinations.
  - **Build:** Vite loads the checked-in `vite.config.mjs` (tsc's output of the `.mts`) before `vite.config.mts`, so both now build the worker. `mainBundle.test.ts` checks both. Recorded in `findings.md`.
  - **Timing (400 × 100):** the conversion takes 1,430 ms instead of 3,791 ms; recorded in `findings.md`.
- **Decisions (lead to confirm):**
  - `worker_threads` over `utilityProcess` (reasons in the previous entry).
  - The open's own connection is closed before the worker starts and reopened after, rather than kept open idle.
  - Progress reaches the preparing window through `executeJavaScript`, from the main process. No IPC contract changed, so there is no C-n note.
  - Without `deps.convertWorker`, `openShowDatabase` still converts on its own thread. The app always passes the worker; tests of the dialog flow don't.
- **Checks:**
  - `tsc --noEmit`: clean.
  - eslint, prettier, cspell and the pre-commit hook: clean.
  - `convertOnOpen.test.ts`: 74 passed (every P9.3 test in-thread and through the worker).
  - `convertWorkerHost.test.ts`: 14 passed (bundle, crash per step, timer responsiveness, quit).
  - `openShow` with `openShowImports`: 21 passed.
  - `preparingWindow`: 6 passed. `mainBundle`: 3 passed. `timelineWrites`: 19 passed. `historyTriggers`: 1 passed.
  - `test:focused electron src/db-functions src/timeline src/components/inspector src/global src/utilities src/hooks`: 116 files passed, 6 skipped; 1,885 tests passed.
  - Focused `test:history` on 12 history and converter files: 11 passed, 1 skipped; 159 tests passed.
  - `vite build`: passed, with `dist-electron/worker/convertOnOpenWorker.js` built. That file converted a show in a one-off test.
  - Skipped per the policy: the full `test:history` suite and e2e. `build:electron` wasn't run.
- **Not done:** a manual app run with `OPENMARCH_CONVERT_ON_OPEN=1` to see the window's progress and the quit path (human).
- **Next:** review and merge by the lead; then P9.4 (both of its dependencies would then be done).
- **Blockers:** none.

### 2026-10-01 · lead · P9.5 (recorded for the worker)

- **Done:** the P9.5 worker opened PR #45, but couldn't write to the coordination checkout from its sandbox. With the project owner's approval, the lead recorded its status here.
- **What the PR does:**
  - adds 18 `page_era_frozen_*` triggers that refuse writes to `marcher_pages`, `midsets`, `pathways`, `shapes`, `shape_pages` and `shape_page_marchers` while the timeline flag is on; cascaded deletes are still allowed;
  - adds app-level `E-ARGS` refusals;
  - stops the marcher, page and new-show writers from writing `marcher_pages` in timeline mode.
- **Checks (worker):**
  - `pnpm run test`: 171 files, 2,402 tests passed.
  - Electron `convertOnOpen`, `repair` and `pageEraFreeze` tests: 99 passed.
  - Focused `test:history`: 262 passed.
  - `test:timeline`: one failure, fixed afterwards; the full timeline run wasn't repeated.
- **Next:** lead review. The C-10 note and the ADR 0001 line go in after review confirms the design.
- **Blockers:** none.

### 2026-10-01 · timeline-worker (timeline/p9-8-convert-worker) · P9.8

- **Done:** PR https://github.com/AlexDumo/OpenMarch-timeline/pull/44 review fixes in follow-up commits: a merge of `timeline-try-2` (90dc5be4), then 4cdc7cfb. No force-push.
  1. **Reopen and close:** the open reconnects to its own `filePath` (`connectToPath`, 5 s busy timeout). `closeCurrentFile` and the external `discardNewShowDraft` entry points wait on `withOpenLock`.
  2. **Classification:** the host picks the marker time. A worker that ends without a result, or reports a failure, while the file has version 8 and that marker is reported as `converted`.
  3. **Audio:** the `audio:*` handlers are refused while the SQL is suspended, and their connections wait 5 s for a lock.
  4. **Progress:** throttled to 10 updates a second; a new phase and the final page always show.
  5. **Quit:** a new conversion resets the quit flag. A conversion stopped by quitting stores its file as `databasePath`, and the quit's `closeCurrentFile` keeps it.
  6. **Timer test:** thresholds are relative to the conversion's length.
  7. **Build config:** removed the generated `vite.config.mjs` and `vite.config.d.mts`; `tsconfig.node.json` now emits under `node_modules/.tmp`, and the names are gitignored. `mainBundle.test.ts` asserts that nothing shadows `vite.config.mts`.
  - Added the P9.4 packaged-smoke-run prerequisite to the handoff notes.
- **Checks:**
  - `tsc --noEmit`: clean.
  - eslint, prettier, cspell and the pre-commit hook: clean.
  - `pnpm --dir apps/desktop run build` (includes `vite build`): passed, with the worker built.
  - The 8 worker and open test files: 132 passed.
  - `test:focused electron`: 20 files passed, 1 skipped; 345 tests passed.
  - `pnpm run test`: 171 files passed, 9 skipped; 2,440 tests passed.
  - Skipped per the policy: the full `test:history` suite and e2e. `build:electron` wasn't run (now a P9.4 prerequisite).
- **Next:** re-review and merge by the lead.
- **Blockers:** none.

### 2026-10-01 · lead · P9.5

- **Done:** reviewed PR #45 and squash-merged it at head c5fbf966.
  - **Review result:** the trigger design was confirmed correct. It covers:
    - the flag check;
    - the orphan exception, which is backed by foreign keys;
    - the order of undo and redo;
    - ordering with P9.3;
    - the stale-trigger refresh;
    - `_blank.dots`.
  - **Fixes made after review:**
    - The inspector read `marcher_pages` before checking timeline mode, so new marchers and pages showed "error loading coordinates". It now reads the timeline first.
    - An undo or redo the freeze refuses is now dropped from its stack, with a notice.
    - Repair always restores the freeze.
    - Release-note text was added to the PR.
  - **Recorded (owner-approved):** C-10 in `implementation-plan.md` and the ADR 0001 §1 line (983ef06f).
- **Checks (lead, on c5fbf966):**
  - `tsc --noEmit`: pass.
  - `test:focused electron`: 20 files, 303 tests passed.
  - Focused `test:history src/db-functions/__test__/`: 30 files, 661 tests passed.
  - `pnpm --dir apps/desktop run test`: 172 files, 2,411 tests passed.
  - `test:timeline`: 172 files, 2,365 tests passed, 0 failed.
  - Skipped by policy: full `test:history` and e2e.
- **For P9.7 (release notes):** name the minimum version. Older releases that open a converted file get generic errors when dragging, creating, or deleting a page.
- **Next:** P9.8 (PR #44) checks are in progress.
- **Blockers:** none.

### 2026-10-01 · lead · P9.8, combined base check

- **Done:** reviewed PR #44 and squash-merged it at head 4cdc7cfb.
  - The review found no data-safety bugs.
  - **Fixes made in review:**
    - the open reconnects to its own path, not to `DB_PATH`;
    - Close File and the audio handlers wait for an open in progress;
    - the outcome is read back from the file (version plus marker);
    - progress is throttled;
    - quit handling;
    - the timer test is more robust;
    - the generated `vite.config.mjs` and `.d.mts` that shadowed `vite.config.mts` are removed.
  - The PR also fixed a P9.3 bug: history-trigger creation went through the renderer proxy in the main process, so every real-app conversion would have rolled back.
- **Combined check (lead, `timeline-try-2` at fe4b032e, with #44 and #45):**
  - `pnpm install`: pass.
  - `tsc --noEmit`: pass.
  - `pnpm --dir apps/desktop run build`: pass.
  - `test:focused electron`: 21 files, 368 tests passed.
  - Focused `test:history src/db-functions/__test__/`: 31 files, 663 tests passed.
  - `pnpm --dir apps/desktop run test`: 174 files, 2,478 tests passed.
  - `test:timeline`: 174 files, 2,432 tests passed, 0 failed.
  - Skipped by policy: full `test:history` and e2e. `build:electron` not run.
- **Next:** P9.4 prerequisites need a person:
  - a packaged smoke run (`build:electron`, then open a page-era show with `OPENMARCH_CONVERT_ON_OPEN=1`);
  - the owner's manual pass on a copy of a real show.
- **Blockers:** P9.4 waits on those.

### 2026-10-01 · lead · P9.4 packaged smoke run

- **Done:** a worker ran the packaged smoke run on `timeline-try-2` at a4616dd0 (P9.3, P9.5 and P9.8), with the owner's approval.
  - Setup: show B on a scratch copy only, with an isolated `--user-data-dir` and automatic updates off. The original's sha256 was the same before and after. All copies have since been deleted.
  - **Build:** `pnpm install`, the turbo package build, and `pnpm --dir apps/desktop run build:electron` all passed. `dist-electron/worker/convertOnOpenWorker.js` sits inside `app.asar` and is not unpacked.
  - **Convert at startup** (with `OPENMARCH_CONVERT_ON_OPEN=1`): converted in 195 ms.
    - File: `user_version` 8, `integrity_check` ok, `timelineMode` true, `timelineConvertedAt` set.
    - Timeline rows written: 22 transitions, 2,090 assignments and 2,090 destinations.
    - Page-era tables unchanged. Homes were seeded and undo history cleared.
  - **Backup:** at version 7, and it matches the original's user data.
  - **Reopen:** opening the converted file again doesn't convert again.
  - **Preparing window:** appears when the file is opened in a running app. At startup there's no window, by design.
- **Failed: quitting during a conversion (macOS).**
  - What happened: a Quit sent while the preparing window was up was cancelled (`User canceled (-128)`). The conversion finished, the file ended at version 8, and the app kept running until a second Quit.
  - Impact: the data is safe, but the quit is lost.
  - Likely cause: the `modal: true, closable: false` preparing window (`convertOnOpenDialogs.ts`).
- **Noise:** about 10 `sql:proxy` "a file is being opened" errors per open in a running app, plus "Error getting SVG on close" on quit.
- **Next:** P9.9, a fix for quitting during conversion, with automated tests only. After that, re-run the quit check and the owner's manual pass.
- **Blockers:** P9.4 is blocked until quitting during conversion works.

### 2026-10-01 · timeline-worker (timeline/p9-9-quit-during-conversion) · P9.9

- **Done:** checkpoint 0077e289 (`wip:`) on `timeline/p9-9-quit-during-conversion`.
  - **Cause (Electron 40 source):** `NativeWindowMac::Close()` on a window with `closable: false` calls `WindowCloseCancelled`, which clears `Browser::is_quitting_`, so the quit is cancelled. The `before-quit` handler also held the quit only while a worker ran, so a Quit during the overlay's paint wait (before the worker starts) went straight to closing windows.
  - **Choice (per the lead's note):** the native preparing window is gone. "Preparing your file…" is an overlay in the main window's page, injected with `executeJavaScript` (no IPC channel, no database query); the rest of the page is made `inert`. `preparingWindow.ts` became `preparingOverlay.ts`.
  - `convertWorkerHost.ts`: `beginPreparing()` marks the whole preparing step; `before-quit` logs, and while a conversion is in progress holds the quit, stops the worker (or keeps it from starting), waits for the open to end, runs `beforeQuitting`, then quits again. The quit flag is now sticky (a quit that reaches a conversion can't be cancelled; the handler finishes it).
  - `index.ts`: closing the main window during a conversion quits through the same path; `window:close` skips `closeCurrentFile` then; an open queued behind a stopped one doesn't start; the SVG preview on close is skipped when no file is open or the SQL is suspended (that is where the 5 s "Timeout waiting for SVG response" came from).
  - `sql:proxy` and `unsafeSql:proxy` return a refusal marker while suspended (`sqlProxyRefusal.ts`), logged once per suspension at debug level; the preload turns it back into a rejection.
- **Checks:** `tsc --noEmit` clean; `preparingOverlay.test.ts` 8 passed.
- **Next:** quit tests (mocked `app` and `BrowserWindow`), the existing worker-host quit test, `sql:proxy` refusal tests, then the focused suites.
- **Blockers:** none.
- **Resume from:** check out `timeline/p9-9-quit-during-conversion` (0077e289), `pnpm install`, then write `electron/main/__test__/quitDuringConversion.test.ts` and update `convertWorkerHost.test.ts`'s quit test.

### 2026-10-01 · timeline-worker (timeline/p9-9-quit-during-conversion) · P9.9

- **Done:** PR https://github.com/AlexDumo/OpenMarch-timeline/pull/46 (one commit, c5cb013f). The previous entry and the PR have the design.
  - "Preparing your file…" is an overlay in the main window's page, not a native window, so nothing can refuse the quit's close.
  - `before-quit` logs a line. During a conversion it holds the quit, stops the worker or keeps it from starting, waits for the open to end, closes the file (keeping `databasePath`), and quits again. One Quit is enough.
  - Closing the main window during a conversion quits the same way.
  - The SVG timeout came from the conversion flow: the main window's close waited for the open, then asked a reloading, suspended page for a preview. That request is now skipped when no file is open or the SQL is suspended.
  - The `sql:proxy` and `unsafeSql:proxy` refusals are logged once per open at debug level, with no handler errors.
- **Decisions (lead to confirm):**
  - The overlay instead of a closable native window.
  - The quit flag is now sticky: a conversion after a quit is refused, and a new conversion no longer resets the flag (a P9.8 review point).
  - The refusal marker in the reply of the two existing SQL channels (between main and preload). The renderer-facing API is unchanged, so I didn't add a C-n note.
- **Checks:**
  - `tsc --noEmit`: clean.
  - eslint: 0 errors.
  - prettier, cspell and the pre-commit hook: clean.
  - `electron/main` with `convertOnOpen` and `database.services`: 11 files, 168 tests passed.
  - `test:focused electron`: 22 files passed, 1 skipped; 379 tests passed.
  - `pnpm --dir apps/desktop run build`: passed.
  - Skipped per the policy: the full `test:history` suite (no history files touched) and e2e. `build:electron` wasn't run.
- **Not done:** the packaged re-run of the quit check (needs the owner's go-ahead; no app was launched).
- **Next:** review and merge by the lead, then the packaged quit re-run and the owner's manual pass for P9.4.
- **Blockers:** none.

### 2026-10-01 · timeline-worker (timeline/p9-9-quit-during-conversion) · P9.9

- **Done:** review fixes for PR #46 in follow-up commit 5b27e166 (no force-push). `timeline-try-2` had moved only in `docs/timeline`, so I didn't merge it.
  1. **Time limit.** A held quit ends the process with `app.exit(0)` after 15 s, and logs it. Further Quits meanwhile are held.
  2. **The overlay is modal.**
     - A capturing key listener keeps every key from the page; keys with Cmd, Ctrl or Alt keep their default, so menu shortcuts like Quit still work.
     - Reload and Force Reload are blocked while a file converts, in the View menu and through `before-input-event` (`reloadGuard.ts`).
     - The overlay's top strip drags the window. On Windows and Linux it has its own Minimize and Close, through the preload's existing calls; Close takes the quit path.
  3. **No dialogs once quitting.** `converted()` and the failure dialogs are skipped once a quit has been requested.
  4. **Quits before the conversion starts.**
     - The main window's `close` handler calls `markQuitRequested()`, so a conversion that hasn't started is refused.
     - The open flow's message boxes get an `AbortSignal` that fires when a quit starts, so the older-release warning closes as Cancel and the failure dialogs close.
  5. **Tests.**
     - `closeCurrentFile`'s body is now `closeShowFile.ts`, tested with the real open lock.
     - The fake app models `window-all-closed` and `app.exit()`.
     - The reset helper also resets `preparing`, the waiters and the listeners.
     - New tests: the time limit (worker hook `nativeBlockRows`), the dialog quit timings, the gap between the worker's exit and the end of the preparing step, Windows and Linux, thumbnails, keys and the reload guard.
  6. Added the P9.4 packaged quit re-run note to the handoff notes.
- **Checks:**
  - `tsc --noEmit`: clean.
  - eslint: 0 errors.
  - cspell, prettier and the pre-commit hook: clean.
  - `electron/main` with `convertOnOpen` and `database.services`: 12 files, 184 tests passed.
  - `test:focused electron`: 23 files passed, 1 skipped; 395 tests passed.
  - `pnpm --dir apps/desktop run build`: passed.
  - Skipped per the policy: the full `test:history` suite and e2e. `build:electron` wasn't run.
- **Next:** re-review and merge by the lead.
- **Blockers:** none.

### 2026-10-02 · timeline-worker (timeline/p9-10-range-aligned-convert) · P9.10

- **Done:** wip commit 6413e917 on `timeline/p9-10-range-aligned-convert`. The converter writes one timeline per page move over exactly the page's range (page 1 from beat 1), each with the one transition spanning it, through the checked `createTimelineTransitionsInTransaction`; page 0 gets no timeline. `createLegacyPageTransitionsInTransaction` and the multi-range refusal in `setTimelineRangeInTransaction` are gone. `timeline_commit_violations` has an `E-T1` row; `_blank.dots` regenerated with `pnpm migrate`.
- **Checks:** `tsc --noEmit` clean; focused vitest (planner, pageConversion, conversionEquality, conversionCorpus, timelineRangeEdit, `electron/database`): 345 passed, 2 skipped.
- **Next:** run the wider focused timeline suites, check ripple, P7.3 and P7.2 moves against the new shape, then open the PR.
- **Blockers:** none.
- **Resume from:** `git checkout timeline/p9-10-range-aligned-convert`; run `npx vitest run --silent=true src/db-functions/__test__/timeline* src/timeline` in `apps/desktop` and fix fallout.

### 2026-10-02 · timeline-worker (timeline/p9-10-range-aligned-convert) · P9.10

- **Done:** PR https://github.com/AlexDumo/OpenMarch-timeline/pull/50, commit 6c15a201 plus 02c0061d. The second commit only undoes stale `docs/timeline` copies that the squash picked up, so the PR's diff is desktop-only. Squash on merge.
  - **Converter.** It writes one timeline per page move, over exactly the page's range, each with the one transition spanning it. The writes go through the checked `createTimelineTransitionsInTransaction`, and `PageConversionResult.timelineIds` maps page to timeline.
  - **Page 1 starts at beat 1**, page 0's flag (`pageEndBeat(page 0)`), the same show time as beat 0 (UI-5). Page 0 gets no timeline, so a show with only page 0 converts to homes and no timeline rows.
  - **Names.** The timelines are unnamed; `CONVERTED_TIMELINE_NAME` is gone.
  - **E-T1 at commit.** `timeline_commit_violations` has an `E-T1` row for a transition whose range differs from its timeline's. It is rebuilt on every open with the view map, so it needs no migration. `_blank.dots` was regenerated.
  - **Legacy code removed:** `createLegacyPageTransitionsInTransaction`, and the multi-range refusal in `setTimelineRangeInTransaction`.
  - **Checked, no change needed:** the ripple, P7.3's join and P7.2's moves against the new shape. The ripple tests now assert that timeline ranges equal transition ranges.
  - **Tests.** Raw-SQL test seeds that put differently ranged transitions in one timeline now use one timeline per transition. New E-T1 tests are in storage QA, `timelineRangeEdit` and `timelineTriggers`.
- **Checks:**
  - `tsc --noEmit`: clean.
  - eslint: 0 errors.
  - prettier and cspell: clean.
  - `pnpm migrate`: no new migration.
  - Full desktop vitest: 174 files passed, 9 skipped; 2484 tests passed.
  - `test:timeline`: 174 files passed, 9 skipped; 2438 tests passed.
  - Focused `test:history` on 8 changed files: 115 passed.
  - `pnpm --dir apps/desktop run build`: passed.
  - Skipped per the policy: the full `test:history` suite and e2e. `build:electron` and an app launch weren't run.
- **Not done:** `clipsOfShape` in `src/timeline/timelineViewModel.ts` still carries `TODO(P9.10)`. P8.11 is rewriting that file, so I left it; see the cross-phase note in the phase 8 file.
- **For the lead:**
  - Implementation-plan C-11 and ADR 0001 still say the E-T1 check "waits for P9.10". They can be updated when this merges.
  - Files converted by an earlier dev build (one show-wide timeline) now fail every edit at commit with E-T1. Re-convert them with `convertPages({ replace: true })`, or from the backup.
- **Next:** review and merge by the lead.
- **Blockers:** none.

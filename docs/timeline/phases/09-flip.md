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
- Status: in-review
- PR: https://github.com/AlexDumo/OpenMarch-timeline/pull/40
- Parallel: yes
- Depends on: P9.1

Back up the file before converting (next to the original, with a clear name).

### P9.3: Convert on open

- Owner: unassigned
- Status: open
- PR: none
- Parallel: no
- Depends on: P9.2

A post-migration step in the main process runs the converter in one transaction, and sets `user_version = 8` in that transaction (ADR 0001 §6). Releases with the P3.9 guard refuse newer files; older releases can't, so warn when a converted file comes back at 7 and offer the backup instead of converting again.

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

- **P9.2 backup API (for P9.3).** `apps/desktop/electron/database/backup.ts` exports `backupBeforeConversion(filePath): BackupResult` (synchronous, main process only; PR 40).
  - Call it before converting, with the file's path, while no migration or conversion transaction is open on it. Convert only when `result.ok` is true. On `ok: false`, show `result.message` (English, safe to show) and stop; `result.code` is one of `source-missing`, `directory-not-writable`, `disk-full`, `file-busy`, `name-too-long`, `source-unreadable`, `verification-failed`, `unknown`. It never throws for those.
  - On success it returns `{ ok: true, backupPath, userVersion }`. The backup is next to the original, named `<name> (before timeline conversion).dots`, then `... conversion 2).dots`, `3`, and so on. Show `backupPath` in the "converted, backup saved" message and use it for the "file came back at 7, restore the backup" offer.
  - It is a `VACUUM INTO` snapshot from a read-only connection (5 s busy timeout), verified (integrity check, `user_version`, schema) before it gets its final name, so it is consistent even if another connection has the file open or commits meanwhile. It never writes to the original's main file; on a WAL file SQLite may touch the `-wal`/`-shm` side files. If P9.3 needs the version check first, run `decideFileVersion` before calling this, so a too-new file isn't backed up.
  - **Performance:** it runs on the calling thread and takes roughly 1 to 2 s for a 50 MB file. P9.3 must either show a blocking "preparing your file" state or run it off the main thread. `export-utility-process.ts` is dead code (P7.7), not a pattern to reuse.
  - `nextBackupPath` and `BACKUP_NAME_SUFFIX` are exported too; the second argument of `backupBeforeConversion` is for tests only. Nothing calls the backup yet. It needs no IPC or ADR change; if P9.3 wants the renderer to trigger or show it, that goes through the usual IPC rules.

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

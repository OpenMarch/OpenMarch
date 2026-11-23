# 0018: Edit a private working copy and publish shows atomically

- Status: proposed
- Date: 2026-11-18

## Context

A show is one SQLite file (`.dots`) in rollback-journal mode. The Electron main process edits it
in place: every commit writes the show and a `-journal` beside it.

- **Many people keep shows in OneDrive, Dropbox or iCloud folders**, often without choosing to
  (OneDrive Known Folder Move, iCloud Desktop & Documents). Sync apps hold, lock, make read-only
  and restore files in those folders, including the `-journal`. In a Windows sync simulator on
  2026-11-18, the current build failed most saves ("disk I/O error"), refused to reopen the show
  (403) while the sync app held its journal, and in one run silently reverted 23 of 34
  acknowledged edits when the simulator put back a stale hot journal. Testers reported the
  "leftover journal" error that recovery (#1086) now handles after the fact.
- **A sync app that copies the file while the app writes it can upload a torn file.** A benchmark
  that copied the file during 60 s of edits got 24% bad copies with in-place edits, none with a
  snapshot renamed into place.
- **WAL on the user's file** adds `-wal` and `-shm` files that must travel with the show and leaves
  the `.dots` stale between checkpoints. Rejected.
- The prototype (`persistence/working-copy-wal`, October 2026) built the design below on the
  page-era schema. It passed kill-mid-save and sync-reader tests, and a stress run on 2026-11-18
  found no lost or torn shows, but also: recovery was only offered at startup, temp files were
  built beside the show and left behind after crashes and on Windows, every save hashed the show,
  and a blocked save waited 30 s to 5 min before retrying. It couldn't be merged (808 commits
  behind, version 7 only), so it is ported, with those fixes.

## Decision

Behind the `workingCopySaves` setting, on by default from 0.2.0-beta.7 (it was
off while it was tested); turning it off goes back to editing in place.
`OPENMARCH_WORKING_COPY=1` or `=0` forces it on or off. With it off, shows are edited in place as
before. Recovery of existing working copies works whatever the setting.

1. **Open.** Check that the show exists, is readable and writable, and that its folder accepts a
   new file, without writing to the show. Copy it into `userData/working-copies/<uuid>/show.dots`
   with SQLite's backup API on a connection to the show. That connection plays back a hot journal
   first, after the usual backup of the show and its journal; when it can't, the open is refused
   with the leftover-journal status and "Recover and open" works as before. Migrations and other
   open-time writes run on the working copy only; the migration backup is still taken from the
   show. A page-era (version 7) file is converted in place by the existing convert-on-open flow
   the first time, then opens through a working copy from the next open.
2. **Edit.** Every connection opens the working copy, in `journal_mode=WAL` with
   `synchronous=NORMAL`, `wal_autocheckpoint=1000` and `journal_size_limit` of 32 MB. Nothing holds
   the show open while editing. `database:getPath`, titles, recent files and exports report the
   show's path, never the working copy's.
3. **Publish.** A worker thread with its own connection runs `VACUUM INTO` a snapshot in
   `userData/working-copies/<uuid>/`, flushes it and hashes it, so edits continue meanwhile. Only
   the finished snapshot goes beside the show: it is copied to `.~<name>.<hex>.tmp`, flushed,
   given the show's permission bits (and Finder tags on macOS), and renamed over the show; then
   the folder is flushed. No `-journal` ever appears in the show's folder.
4. **When.** About 15 s after the last edit, at most 30 s while edits keep coming, when the window
   loses focus, before exports and repair, before switching shows, on close and quit, and on
   File ▸ Save Now (no default key: Ctrl/Cmd+S already swaps marchers). Commits from any connection are noticed through `PRAGMA data_version`, checked
   after each database IPC handler.
   - 15 s rather than the prototype's 1.5 s: every publish re-uploads the whole file, audio
     included, so a sync app should see one upload per burst of editing, not one per edit. A
     crash loses nothing (the working copy has every commit); only a power cut can lose the
     seconds since the last publish, and switching to another app publishes at once.
   - The 30 s maximum stays, so the file in the folder is never more than about 30 s behind
     during continuous editing.
5. **Conflicts.** Before each rename the show's size, modification time, inode and device are
   compared with what was last loaded or published, and checked again just before the rename
   and before each retry of a blocked rename. Only when they differ is the show hashed (SHA-256, on the worker) and compared with the last
   known hash: a touched or re-downloaded file with the same bytes is not a conflict. The hash
   taken at open is computed on the worker, not the main thread. Changed content, or a missing
   file, is never overwritten: publishing pauses and the person chooses "Keep my version", "Use
   the version on disk" or "Save mine as a copy…". "Keep my version" covers the show as it was
   when the person chose: if it changes again before the publish goes through, they're asked
   again. What a publish records as the show is the temp file's identity, read before the rename
   (a rename keeps it), and it is written to the manifest as pending before the rename, so a
   failure or crash right after the rename isn't later mistaken for someone else's change.
6. **Failures.** A rename that fails with `EPERM`, `EBUSY` or `EACCES` on Windows is retried with
   backoff (10 ms up to 100 ms) for 5 s. Then, as for any other failed publish, the temp file is
   deleted (retrying while a sync app holds it), the working copy stays authoritative, the title
   bar says the show isn't in its folder yet, and the publish is retried after 2, 4, 8, 15 and
   then every 30 s, and on the next blur or close. While the person answers a working-copy
   question or picks a file for Save As, these automatic publishes wait, and the one that came
   due runs after the question closes; what the person chooses (Try Again, Keep my version, Save
   As) runs at once. A read-only show isn't published over; the person is offered Save As.
7. **Temp files.** Temp files beside a show that match its name are deleted when it opens (with
   the setting on or off), after each publish, when it closes and, after Save As, beside the old
   file, whatever their age: only OpenMarch makes them. A delete that fails because a
   sync app holds the file is retried for 2 s, then in the background for a minute (sync apps
   can hold a new file for 20 s or more); quitting waits up to 10 s for those deletes. What
   is still held then is left for the next open. Snapshots a
   crash left in `userData/save-scratch` are deleted at startup.
8. **Close and quit.** Closing, quitting, switching shows and restarting for an update publish
   first, while the window is still visible. If that can't happen, a dialog offers to
   retry, overwrite or save elsewhere (as fits the problem), close and recover later, or cancel.
   Quitting closes every connection, and the working folder is deleted once its changes are
   published.
9. **Recovery.** A manifest beside each working copy records the show's path, its last known
   identity and whether there are unpublished changes; it is flushed to disk when written. At
   startup, working copies without unpublished changes are deleted; one whose manifest can't be
   read is kept, never deleted. Opening a show that has one, from any path (startup, Recent
   Files, the file dialog, a double-click), first asks whether to recover it; the launch page lists
   the rest. Recovering reopens the working copy (replaying its WAL) and publishes it with the
   usual conflict check.
10. **Turning the setting off** first publishes the open show, and offers recovery for any working
    copy left with unpublished changes.
11. **Telemetry.** When analytics aren't opted out, each publish reports to Sentry its duration,
    size, rename attempts, deferrals and conflicts, and each open the recoveries offered and taken
    and the temp files found. No paths, names or show contents.
12. **Fixes regardless of the setting.** Close File, switching shows and quitting close the SQL
    connection. Save As Copy builds its snapshot in the app's user data and renames a finished
    file over the target, instead of deleting the target first; a copy over the open show does
    nothing. Leftover-journal recovery no longer lets a failed clean-up of its staged copy hide
    the step that failed.

## Consequences

- **The show file is always complete.** Sync apps, backups, email and USB copies never see a torn
  file or a journal, and a sync app restoring a stale journal can't revert edits.
- **Edits get faster.** A WAL commit with `synchronous=NORMAL` costs about 0.1 ms instead of
  several ms; with the show on a spinning disk, single edits went from 134 ms to 6.5 ms (p50).
- **Publishing costs about 5 ms per MB, off the editing thread.** On a 91 MB show, 390–510 ms with
  no long tasks or dropped frames.
- **The show in its folder trails the app** by up to about 15 s (30 s while editing continuously).
  A crash is recovered from the working copy; a power cut can lose those seconds.
- **Two copies of a show are on disk while it's open**, the second in the app's user data.
- **The first open of a show that has never been edited by this version publishes once**, because
  migrations and the renderer's undo triggers change it. Later opens without edits leave the
  file byte-identical.
- **Renaming replaces the file**, so on macOS its creation date and file ID change, and on Windows
  its ACLs, alternate data streams and hidden or system attributes aren't carried over.
- **New surface area:** recovery and conflict UI, the retry policy, quit waiting on a publish that
  can fail, and cleanup of working copies.
- **The file format doesn't change.** A `.dots` file is still a single-file SQLite database in
  rollback-journal mode, readable by older releases.

## Verification

- Unit tests next to the code: `electron/database/__test__/atomicFile.test.ts`,
  `electron/database/workingCopy/__test__/`, and `electron/main/__test__/` for recovery on open
  and leftover-journal recovery while files are held.
- Stress drivers (`om-capture/stress-wc/drive/`, outside the repo): bursts, kill during a publish,
  quit right after editing, recover on reopen; no lost acknowledged edit and no torn file.
- Windows sync simulator (`windows-vm/capture/syncsim/`, outside the repo): no temp files left in
  the show's folder, and the quit prompt while a publish is blocked.
- Before turning the setting on by default, test on real machines: Windows with OneDrive (Files
  On-Demand) and Defender, macOS with iCloud Drive (tags, aliases, recents), Dropbox and Google
  Drive, an exFAT USB stick, a network share, and power loss during a publish.

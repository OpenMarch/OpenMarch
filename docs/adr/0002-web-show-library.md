# 0002: The web editor keeps a library of shows in browser storage

- Status: accepted
- Date: 2026-10-25

## Context

The web editor (editor.openmarch.com, `apps/desktop/web`) kept one show at a
time: a copy in the browser's origin private file system (OPFS), replaced
whenever another show was opened, with "save" meaning "download". A college
class uses it on students' own iPads (Safari, often added to the Home
Screen) with no accounts and no cloud. Students must not lose work, keep
several shows, and need a way back from mistakes.

## Decision

The worker keeps a **library** of shows in OPFS, one per release channel:

```
openmarch-<channel>/
  library/
    index.<n>.json        the index: which shows, names, times, versions
    shows/<id>/
      show.<n>.dots       the show (a SQLite file)
      meta.<n>.json       its name, so a lost index can be rebuilt
      v-<version id>.dots its versions (whole copies)
```

**Index format.** `index.<n>.json` holds `{ "format": 1, "shows": [...],
"openId": ..., "deleted": [...], "pending": [...] }` (`apps/desktop/src/utilities/webLibrary.ts`, which also
holds every rule as a pure function). A build reads only formats it knows.
**Never delete what you can't read:** if any index generation has a `format`
greater than this build knows (a newer build wrote it, then the person went
back to an older one), the library opens read only. Nothing is listed,
written, migrated or removed, and the tab works in memory only and says so.
A future format must stay readable this way: keep `format` a top-level
number.

**Crash safety.** Every write of the index, a show or its name goes to a new
generation (`<n>` + 1). Older generations are removed only after the new
file is completely written. Reading takes the newest generation that is
whole, so a write cut short by a crash, a killed tab or a full disk leaves
the previous one in place. For the index, whole means JSON that parses. For a
show or a version, it means a SQLite header whose page size (bytes 16–17,
1 meaning 65536) times page count (bytes 28–31, when the count is valid for
the file's last change, bytes 92–95 = 24–27) equals the file's length, or a
whole number of pages where the count isn't kept. A file cut short keeps its
header, so the header alone isn't enough. A version file is listed in the index only after it is written.

**Adding a show** (a new show, an opened file, a duplicate, the legacy
migration) lists its id under `pending` in the index first, then writes the
folder (the show and its name), then writes the index listing the show and
no longer pending. If a step fails, the folder is removed and the id is no
longer pending, so a failed attempt leaves no extra show. A crash before the
last index write leaves a folder the index lists as pending, which the next
start removes as an add that never finished. That loses nothing: what was
being added still exists elsewhere (the file the person opened, the show
being duplicated, the legacy file, kept until the add succeeds, or the show
in memory, which the page hands across the reload when adding fails). A
folder the pending list doesn't explain is kept, as below.

**Nothing undescribed is deleted.** On start the library reconciles the
index with the folders:

- A show folder the index doesn't list (a crash between writing a show and
  its index) is added back under its recorded name, or "Recovered show".
- If no index generation can be read at all (damage, or a kill during the
  first index write), the index is rebuilt the same way from every folder:
  the newest whole `show.<n>.dots`, its `meta`, and its `v-*.dots` files.
- A folder the index lists under `deleted` finishes its delete (see below).
  A `deleted` mark file left by the first build of this feature is honoured
  the same way.
- A folder without a whole show is left alone.
- Versions whose files are gone are forgotten, and whole version files the
  index lost are listed again; version files cut short are removed.

**Deleting** works on a full disk, when people delete to make room. The
index is written first without the show and with its id under `deleted`:
that write is the delete. Then the folder is removed. A crash before the
index write leaves the show as it was. A crash after it leaves a folder the
next start removes, rather than adding it back. Nothing new is written
beside the show. If even the index can't be written, the show's own files
make room: its versions first, then the show itself. A crash in that window
leaves the show listed without its files, to delete again.

When storage is full (a `QuotaExceededError`, or a message saying so), the
oldest versions' files are deleted before the index is written (an index
that lists a missing version is tolerated), and the save is tried again.
Other write errors, such as a handle still open or writing not allowed,
keep the versions: freeing space can't fix them.

**Backed up** is recorded for a show added from a file the person picked
(that file is their copy). A new show or a duplicate isn't. A show that a
memory-only tab, or a tab whose storage failed, hands across a reload
carries its own state.

**Versions.** 20 per show: at most one per two minutes of editing, one on
opening if the show changed since its newest version, and one before a
restore. Restoring keeps the replaced state as a version. The restored state
is already a version, so reopening it after the restore doesn't take an
"opened" copy (one slot per restore, not two).

**Opening, closing, replacing.** The open show lives in memory in the
worker and is copied to the library within half a second of each change.
From the change until it is stored, the worker reports "saving" to the page
(before it answers the call that made the change), so leaving the page
warns.
Before the open show is closed or replaced (open another show or a file,
start a new one, restore a version of it), the worker stores its latest
changes, then makes the library changes, and closes the show only once both
have succeeded. If either fails, the show stays open and the page reports
the error. The page asks first whenever the latest changes aren't safely
stored, and the person may go on anyway ("force").

**Legacy migration.** Earlier builds kept one show at the channel folder's
top level as `<sequence>-<name>`. When there is no index, the newest whole
one becomes the library's first show and stays open. The old files are
removed only after the library has stored it.

**Locks.** One tab per channel holds a Web Lock on the library. Other tabs
keep their show in memory only.

**Worker IPC** (`apps/desktop/web/protocol.ts`), in addition to the existing
`web:openShow` (now also takes `force`), `web:closeShow` (`force`),
`web:exportShow`, `web:flush` (now answers whether the changes are stored),
`web:readPreviousDots` and `web:insertAudio`:

| Channel | Does |
| --- | --- |
| `web:library` | The library as the page sees it (shows, open show, a show that failed to open) |
| `web:openStored` | Makes a stored show the one to open; the page reloads |
| `web:renameShow`, `web:duplicateShow`, `web:deleteShow` | Library edits |
| `web:exportStored` | A stored show's bytes, for a backup |
| `web:recordBackup` | Records that a show was backed up |
| `web:restoreVersion` | Restores a version (keeping the replaced state); true if it was open |

Events: `web:library` (the library changed) and `web:saveStatus` (saving,
saved, or an error, with "full" told apart).

## Consequences

- Work is on one device, in one browser, until it is backed up. Clearing
  site data loses shows that weren't backed up. A Home Screen app on iOS has
  storage apart from Safari's. The UI says so (title bar status, start page,
  welcome, Home Screen how-to), and Back up (share sheet or download) is one
  tap.
- Versions are whole copies, so they cost space: up to 20 times a show's
  size.
- A newer build can change the index format. An older build then refuses to
  touch the library rather than risk it.
- Unit tests fake crashes and full disks with an in-memory folder
  (`apps/desktop/web/worker/dir.ts`, `MemoryDir`).

## Verification

- `apps/desktop/web/worker/__test__/library.test.ts`: interrupted writes,
  a damaged index rebuilt from folders, an unlisted folder kept, a delete
  cut short, a newer format left untouched, full disk, migration.
- `apps/desktop/src/utilities/__test__/webLibrary.test.ts`: the pure rules.
- `apps/desktop/web/renderer/__test__/leave.test.ts`: when to ask before
  closing or replacing a show.
- Browser flows against `pnpm run web:preview` (open, edit, back up, reload,
  close, a second file, rename, duplicate, versions, restore, a failed
  restore that keeps the show open, delete, migration, a second tab).

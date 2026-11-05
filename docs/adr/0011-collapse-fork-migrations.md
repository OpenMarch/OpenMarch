# 0011: Collapse the fork's migrations into one, and repair fork files on open

- Status: accepted
- Date: 2026-11-05

## Context

Upstream's migrations end at `0016_unique_ultimo`, the schema of v0.1.7, the last public release.
The fork added sixteen migrations after it (0017 to 0032) while its features were built. Some of
them create tables for features that are now parked for the merge with upstream (P8 of the
convergence, `docs/convergence/inventory.md`): the Asset Library (0021), performer cues (0022),
Item Placement (0025), Artwork slots (0026) and saved shapes (0028). One created a table a later
one dropped (kept spots, 0018 and 0029). The fork's `schema.ts` already leaves the parked tables
out. Reviewing sixteen migrations, five of them for tables that would ship empty and unused,
is not a reasonable ask of upstream.

Two kinds of file matter:

- **v0.1.7 files** (page era, `user_version` 7, migrations up to 0016). These are what people
  have. They must keep opening and converting (ADR 0001 §6) with nothing lost.
- **Files saved by fork builds** (nightlies, lab builds, local builds). Their
  `__drizzle_migrations` table records some of the fork's 0017 to 0032 under the fork's dates.
  October files may have only 0017 to 0020; newer ones all of them; lab builds made from branches
  recorded some under other dates. Most of them are page-era files a fork build opened, which
  took 0017 to 0019 and nothing after. The owner chose to repair them on open, not to drop them.

Drizzle runs only the migrations dated after a file's newest recorded one. Convert on open runs a
page-era file's migrations in two stages around the converter, which reads the page-era tables:
the ones before the first timeline-only migration, then the converter, then the rest, which drop
those tables (`FIRST_TIMELINE_MIGRATION_TAG`).

## Decision

1. **Upstream's 0000 to 0016 stay byte-identical**: their SQL, snapshots and journal entries.

2. **`0017_timeline_model` holds the fork's whole schema on top of 0016.** It was generated with
   drizzle-kit from `schema.ts` (with `pageEraSchema.ts` alongside, so it doesn't drop the
   page-era tables) on the 0016 snapshot: the timeline tables and marcher homes (ADR 0001), Held
   marks, shape recipes (ADR 0006), the 3D View's venue and cameras, props (`items`,
   `item_geometry`, ADR 0002) and tempo mode (ADR 0007). Columns of existing tables
   (`marchers`, `beats`, `measures`) are added with `ALTER TABLE … ADD COLUMN`, not drizzle-kit's
   table rebuild, so a page-era file keeps every row that names a marcher. They are the very
   statements fork builds ran, so a repaired fork file ends with the same table text as a new file.

3. **`0018_drop_page_era` stays its own migration.** It drops the page-era tables and is the first
   timeline-only migration, so a page-era file still runs 0017 before its conversion and 0018
   after it, as before. That is why the collapse makes two migrations, not one.

4. **What is dropped.** The parked tables (`library_blobs`, `library_items`, `cues`,
   `cue_marchers`, `page_performer_settings`, `phrase_assets`, `item_placements`,
   `item_placement_marchers`, `item_artwork_slots`, `saved_shapes`) and the kept-spots table are in
   no migration. `items` loses `library_item_id`, `library_version_hash` and the
   `items_library_check` constraint: they pinned a prop to an Asset Library model, nothing outside
   the parked Library wrote them, and the Library they named is gone. The `performerDefaults`
   workspace setting, which only the parked cues set, goes too (zod drops the stored key on the
   next save).

5. **Repair on open** (`electron/database/legacyFork/legacyForkRepair.ts`). A file needs it when it
   records any date in `FORK_MIGRATION_DATES` (the fork's 0017 to 0032 and every date its other
   branches gave a migration, from every fork branch's journal), or has the `timelines` table
   without a row for `0017_timeline_model` (a lab date that list missed). Files from upstream branches (for
   example the `lighting` branch's own 0017 onwards) are not fork files and are left alone. The
   repair:
   1. replays all the fork's migrations from a frozen copy (`legacyForkMigrations.ts`, never
      edited, checked against the hashes fork builds recorded), each made safe to run again
      (`IF NOT EXISTS`, `IF EXISTS`, skipping an `ADD COLUMN` the table already has), so a file
      gets what it missed whichever of them it took and under whichever date. The old page-era drop
      (0020) is skipped and left to 0018;
   2. puts a parked floor-model file's field image back first (`parkedFloor.ts`), then drops the
      parked tables and rebuilds `items` without its Library columns;
   3. empties the undo and redo history, whose entries may name what step 2 removed;
   4. replaces the fork's rows in `__drizzle_migrations` with the row of `0017_timeline_model`
      (0018 then runs as usual: right away for a timeline file, in the conversion for a page-era
      one);
   5. checks the result before committing: every table and index 0017 makes has 0017's exact text,
      every column it adds has its exact definition, no parked table is left, every other table
      kept each of its rows with the values it had (a checksum per table over its columns from
      before), and no row lost its parent. Anything that doesn't match fails the repair, so a
      table 0017 makes must be exactly 0017's: an extra column on one of them gets the file
      refused. What a lab build added elsewhere is kept: a table 0017 doesn't make, an extra index, or a column on a table upstream made (for example `beats.tempo_pin`).

   It runs in one transaction with foreign keys off, so a failed repair leaves the file exactly as
   it was and the open reports it. The desktop app backs the file up first (`hasPendingMigrations`
   is true for such a file). A page-era file repairs inside its conversion's transaction, after the
   conversion's backup. The web editor runs the same code on its in-memory copy.

6. **What identifies the collapsed migration, and what must never change.** A file records
   `0017_timeline_model` when `__drizzle_migrations` has a row with its hash (pinned in the code as
   `COLLAPSED_MIGRATION_HASH`, the sha256 of its SQL), with this build's hash for it, or with its
   journal date. Matching on the hash keeps a new date for 0017 (a regenerated journal, a rebase)
   from making every file this build created look like a fork file. Still, neither may change:
   - its SQL, byte for byte: a test checks it against `COLLAPSED_MIGRATION_HASH`;
   - its journal `when` (1793856518601), and 0018's: drizzle runs only migrations dated after a
     file's newest one, so a later date would make every existing file run 0017 again, and a date
     after 0018's would keep 0018 from ever running on a file that has 0017.

7. The fork's old `0017_melted_sage` special case (`forgetFork3dVenueMigration`) is replaced by the
   repair, which handles that date like the others.

## Consequences

- Upstream reviews one schema migration and one six-line drop.
- A fork file opens in this build with its timelines, moves, shapes and recipes, Held marks,
  props (with color and Outline changes), 3D venue and cameras, tempo data and everything upstream
  has. It loses its parked features' data (cues, Library items and blobs, Item Placement, Artwork
  slots, saved shapes), a prop's Library pin, and its undo history. The backup keeps the original.
- A lab-build file that changed a table 0017 makes in a way 0017 doesn't (for example the
  `timeline_routes` prototype, which rebuilt `timeline_transitions`) is refused, unchanged.
- The repair and its frozen SQL (about 50 KB of source) stay in the app for as long as fork-built
  files may be opened. Whether to keep them in what goes to upstream, which never wrote such
  files, is the owner's call.
- The fork's ADRs and docs that name migrations 0017 to 0032 describe history; this record maps
  them to `0017_timeline_model`.
- The next migration is 0019. drizzle-kit dates it after 0017 and 0018, as it must be.

## Verification

- `electron/database/migrations/__test__/0017_timeline_model.test.ts`: 0017 on a 0016 file keeps
  every marcher and every row that names one, adds the columns in place, creates exactly the
  fork's tables, and the kept tables keep their constraints; 0018 drops only the page-era tables.
- `electron/database/migrations/__test__/newFileSchema.test.ts`: a new file has exactly the tables
  and columns of `schema.ts`, and `_blank.dots` is such a file.
- `electron/database/__test__/migrationRollback.test.ts`: a new file rolled back to 0016 reopens as
  a new file with its rows.
- `electron/database/legacyFork/__test__/legacyForkRepair.test.ts`: fork files after 0019, 0020,
  0024, 0028 and 0032 (built by running the frozen SQL on a 0016 file, with rows in every table)
  keep every row and end with a new file's schema; page-era fork files after 0017, 0018 and 0019
  convert; a failed conversion and a refused repair leave the file as it was; 3d-async, lab-dated
  and upstream-branch files.
- `electron/database/legacyFork/__test__/realForkFiles.test.ts` (run with `OM_FORK_FIXTURES`): real
  fork-saved files open through the app's path, every kept row value for value.
- The same repair test file: a file this build created isn't repaired, and keeps its undo history,
  when 0017's journal date changes.
- `web/worker/__test__/legacyForkRepair.test.ts`: the repair under the web editor's sqlite-wasm ends
  exactly as on the desktop, and rolls back the same way.
- `electron/database/__test__/v017Files.test.ts`: the v0.1.7 files convert as before, and a field
  image survives the conversion.

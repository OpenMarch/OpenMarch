# OpenMarch v0.1.7 show files

Show files written by the last public release, OpenMarch v0.1.7 (tag `v0.1.7`, d10b69c06;
migrations 0000 to 0016, `user_version` 7, page era). `../v017Files.test.ts` opens them through
this build's open path and checks they convert to what v0.1.7 shows.

| File                   | What it is                                                                                                                                                                                                                                                                                                                                                             |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `small.dots`           | 6 marchers (Trumpet, Snare), page 0 and 5 pages (8, 8, 4, 12, 16 counts), one subset page, page notes, two 4/4 tempo groups (120 and 144 bpm), held marchers on one page, undo and redo history, a 0.5 s audio file.                                                                                                                                                   |
| `realistic.dots`       | 76 marchers in 12 sections, page 0 and 21 pages (4 to 16 counts, some ending mid-measure), three subset pages, page notes, tempo groups in 4/4, 3/4, mixed-meter 7/8 (2+2+3, uneven beats) and a 120 to 160 accelerando, a line shape, a curved shape, a swap, a tag with an appearance, a section appearance, held marchers, undo and redo history, a 1 s audio file. |
| `<name>.v017.json`     | What v0.1.7 shows for the file, computed by v0.1.7's code: pages as `fromDatabasePages` builds them (names, counts, timing), beats, measures, marchers, every `marcher_pages` row, and positions at every count from `getCoordinatesAtTime` (all marchers in `small`, every fifth in `realistic`).                                                                     |
| `generateV017Files.ts` | The script that wrote them. It runs in a v0.1.7 checkout, not here.                                                                                                                                                                                                                                                                                                    |
| `generate.sh`          | Regenerates every file in this folder.                                                                                                                                                                                                                                                                                                                                 |

## How they were made

`generate.sh` adds a worktree of tag `v0.1.7` (or takes one as its argument), installs it, builds
its packages, copies `generateV017Files.ts` into it as a vitest test and runs it with v0.1.7's own
vitest setup. The script makes each file the way the v0.1.7 app does:

- a new file as v0.1.7's main process creates one (`user_version = 7`, its migrations,
  `DrizzleMigrationService.initializeDatabase`), then the undo triggers its renderer creates on open;
- every edit through v0.1.7's renderer database functions (tempo groups, pages, marchers,
  positions, shapes, swap, tags, appearances, workspace settings, one edit then undo), whose SQL
  goes through v0.1.7's main-process SQL handler (`handleSqlProxy`) to the file;
- the audio row through v0.1.7's main-process `insertAudioFile`.

Positions come from fixed formulas, so a rerun writes the same shows; only the `created_at` and
`updated_at` times v0.1.7 writes differ.

## Not covered

- Pathways and midsets: v0.1.7's schema has them, but its UI can't make either (no editable
  pathways are created anywhere, and midsets are commented out of playback), so a v0.1.7 user
  can't have them. Files from older releases might.
- A field image or a non-default field (the files keep v0.1.7's default high school field).
- Marcher rotation, per-page appearances in `marcher_pages`, and marcher notes.
- Files a v0.1.7 user opened from an even older release (their migration path to 0016).

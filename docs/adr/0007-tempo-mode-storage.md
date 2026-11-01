# 0007: Tempo mode stores pins, holds, meters, measure numbers and the music offset in the show

- Status: proposed
- Date: 2026-10-30

## Context

Tempo mode (`apps/desktop/src/tempo/`, research in docs/tempo/daw-research.md) edits the counts
against the music in the timeline itself, the way a DAW's tempo track does. The owner's decisions
(2026-10-20 and 2026-10-21) need facts the show could not hold before:

- **Pins.** A count dragged onto a hit in the music is pinned automatically. Later edits and Fit
  re-space counts between pins and never move a pin.
- **Holds.** A fermata is one held count of its own length, not a fake slow tempo. Fit and the
  uneven-measure checks skip it, and it may be any length.
- **Meters with groupings.** A measure is written as in a score (`7/8`) and counted in groups
  (`2+2+3`), one count per group. Counts per measure alone can't tell 7/8 from 3/4.
- **Measure numbers.** A measure can be renumbered (rehearsal C = m. 101), and the measures after
  it count on from there.
- **The music offset.** Lining the first hit up with count 1 moves the music, and that has to undo
  with the counts it lined up.

The prototype first kept these in workspace settings, which are outside undo. When the owner asked
why pins didn't undo, they moved into the database.

## Decision

1. **Beat and measure facts are new columns on the existing tables.** They are written through
   `transactionWithHistory`, and the existing history triggers on `beats` and `measures` cover them:
   - `beats.tempo_pin` and `beats.tempo_hold`, integers `0`/`1`, default `0`, not null.
   - `measures.number_override` (integer, null = count on from the measure before),
     `measures.meter` (text such as `"7/8"`, null = counts per measure over 4) and
     `measures.grouping` (text in eighth notes such as `"2+2+3"`, null = the meter's even
     counting, see `tempo/meters.ts`).
2. **The music offset moves into the show's history.** A new one-row table `tempo_settings`
   (`id` checked to be `0`, `audio_offset_seconds` real, null = use the workspace setting) has
   history triggers (`historyTriggers.ts`), so undo and redo restore it with the counts. Every reader
   of the offset (playback, onsets, exports, settings) goes through `tempo/audioOffset.ts`. The
   workspace setting stays as the fallback for shows that never set it here.
3. **Durations stay the source of truth for timing.** `beats.duration` is still what playback, the
   resolver, exports and older readers use. Pins, holds, meters and groupings only steer how tempo
   mode edits durations. A reader that ignores them still plays the show at the right times.
4. **One migration** (`0029`) adds all of it. The rollback in `migrationRollback.ts` drops the
   table and the columns, and drops the triggers on those tables so the migration service can
   recreate them.
5. **Amendment (2026-11-01): where tempo changes start is stored; their shape is not.** The tempo
   lane edits tempo the way Logic's tempo track does, with points and curves
   (docs/tempo/logic-analysis.md). A point is a flag, `beats.tempo_change` (integer `0`/`1`,
   default `0`, not null, migration `0030`). Between two points, the lane reads the shape back
   from the durations: steady, a ramp (straight or curved) or uneven (`tempo/tempoShape.ts`).
   Editing a shape writes the durations of its counts.
   - We didn't store tempo as BPM or as a tempo graph. Durations would still be needed by every
     reader, so either would be a second source of truth to keep in step. Pins (a count at a time
     in the music) and holds (a length, not a tempo) are natural in seconds, and Fit measures
     seconds.
   - A show with no flags yet gets points read from its durations. The first tempo edit stores
     them, so opening a show writes nothing.
   - Durations changed outside tempo mode leave the flags where they are, and the shape between
     them is read again. Nothing has to be kept in step.

## Consequences

- Older app versions see ordinary beats and measures. Timing is unchanged, but they don't show
  renumbered measures or meters, and they ignore the offset in `tempo_settings`, so they play the
  music at the workspace setting's offset.
- Readers that list beat or measure columns explicitly have to tolerate files from before the
  migration. The converter's `readShowTiming` selects explicit columns for this reason, and the
  migration tests' `LATER_COLUMNS` cover the new ones.
- `measures.meter` and the existing counts per measure can disagree in a hand-edited file. Tempo
  mode treats `meter` as written and derives counts from the grouping.
- `tempo_settings` is an app table, not a spec table: no change-log triggers.
- Cues (ADR 0004) and the 3D view read beat times, not these columns, so they need no change.

## Verification

- The migration rollback test (`electron/database/__test__/migrationRollback.ts`) runs 0029 back.
- Tempo unit tests (`src/tempo/__test__`) cover the math, Fit, meters and groupings, and the
  writes. `tempoUndo.test.ts` covers undo and redo of pins, a hold with its length, a meter with
  its measures and count lengths, and the music offset (alone, and with the counts a Fit lined
  up). `tempoWrites.test.ts` covers the tempo-change flags.
- Open an older `.dots` file and a page-era demo in the desktop app after the migration
  (apps/desktop/AGENTS.md).
- Owner hands-on in the lab build: Fit, a hold, a 7/8 meter, renumbering and undoing a lead-in move.

# 0007: Tempo mode stores pins, holds, tempo changes, time signatures, measure numbers and the music offset in the show

- Status: proposed
- Date: 2026-10-30, revised 2026-11-02

## Context

Tempo mode (`apps/desktop/src/tempo/`) lines the counts up with the music in the timeline itself,
the way a DAW's tempo track does (research in docs/tempo/). Lining up is done by hand: dragging
counts onto the music, tap tempo, and Logic-style tempo points and ramps. Automatic beat detection
was tried and removed (fork issue #611). Tempo mode needs facts the show could not hold before:

- **Pins.** A count dragged onto a hit in the music is pinned automatically. Later tempo edits
  re-space the counts between pins and never move a pin.
- **Holds.** A fermata is one held count of its own length, not a fake slow tempo. The tempo lane
  and the uneven-measure checks skip it, and it may be any length.
- **Tempo changes.** The tempo lane shows points where the tempo changes, with steady stretches,
  ramps and curves between them, as in Logic.
- **Time signatures with groupings.** A time signature is written as in a score (`7/8`) and
  counted in groups (`2+2+3`), one count per group. Counts per measure alone can't tell 7/8 from
  3/4. It is written where it starts and carries on until the next one, so it can be set on any
  measure and set back exactly (owner, 2026-11-02).
- **Measure numbers.** A measure can be renumbered (rehearsal C = m. 101), and the measures after
  it count on from there.
- **The music offset.** Dragging the first hit onto count 1 moves the music, and that has to undo
  with the counts it lined up.

The prototype first kept these in workspace settings, which are outside undo. When the owner asked
why pins didn't undo, they moved into the database.

## Decision

1. **Durations stay the only source of truth for timing.** `beats.duration` is still what
   playback, the resolver, exports and older readers use. Everything below only steers how tempo
   mode edits durations. A reader that ignores it still plays the show at the right times.
2. **Beat facts are flags on `beats`**, integers `0`/`1`, default `0`, not null:
   - `tempo_pin`: the count is locked to its time in the music.
   - `tempo_hold`: the count is a hold (fermata) of its own length.
   - `tempo_change`: a tempo point starts here. Between two points, the lane reads the shape back
     from the durations: steady, a ramp (straight or curved) or uneven (`tempo/tempoShape.ts`).
     Editing a shape writes the durations of its counts.
   - We didn't store tempo as BPM or as a tempo graph. Durations would still be needed by every
     reader, so either would be a second source of truth to keep in step. Pins (a count at a time
     in the music) and holds (a length, not a tempo) are natural in seconds.
   - A show with no tempo points gets them read from its durations. The first tempo edit stores
     them, so opening a show writes nothing. Durations changed outside tempo mode leave the points
     where they are, and the shape between them is read again.
3. **Measure facts are columns on `measures`:**
   - `meter` (text such as `"7/8"`) and `grouping` (text in eighth notes such as `"2+2+3"`, null =
     the time signature's usual counting, see `tempo/meters.ts`). They are set only on a measure
     where a time signature is written. A measure with `meter` null carries on the time signature
     before it (`readMeters`). Setting a measure to the same time signature as the one before it
     clears it, which is what makes any change exactly reversible.
   - A show with no `meter` anywhere (every show from before tempo mode) reads the old way: each
     measure is its counts over 4, and a time signature is written wherever the measure length
     changes. The first time signature edit writes those in. Opening a show writes nothing.
   - `number_override` (integer, null = count on from the measure before).
4. **The music offset moves into the show's history.** A one-row table `tempo_settings` (`id`
   checked to be `0`, `audio_offset_seconds` real, null = use the workspace setting) has history
   triggers (`historyTriggers.ts`). Every reader of the offset (playback, exports, settings) goes
   through `tempo/audioOffset.ts`. The workspace setting stays as the fallback for shows that never
   set it here.
5. **Every tempo edit is one undo step.** Columns and the table are written through
   `transactionWithHistory`; the existing history triggers on `beats` and `measures` cover the new
   columns.
6. **Two migrations.** `0029` adds `tempo_settings`, `tempo_pin`, `tempo_hold`, `number_override`,
   `meter` and `grouping`; `0030` adds `tempo_change`. The rollbacks in `migrationRollback.ts` drop
   them, and drop the triggers on those tables so the migration service can recreate them.

## Consequences

- Shows from released versions (v0.1.7) open with every new column at its default and no
  `tempo_settings` row: no pins, holds or stored points, time signatures read from measure lengths,
  the offset from the workspace setting. Their timing is unchanged, and opening one writes nothing.
- Older app versions opening a show saved by this one see ordinary beats and measures. Timing is
  unchanged, but they don't show renumbered measures or time signatures, and they ignore the offset
  in `tempo_settings`, so they play the music at the workspace setting's offset.
- Code outside tempo mode that creates measures (the Music modal's tempo groups, MusicXML import,
  adding counts past the end) writes no `meter`. In a show that has written time signatures, a
  measure it adds carries on the one before; if its length differs, it shows as short or long
  against it. Those writers should write `meter` where the length changes.
- Readers that list beat or measure columns explicitly have to tolerate files from before the
  migrations. The converter's `readShowTiming` selects explicit columns for this reason, and the
  migration tests' `LATER_COLUMNS` cover the new ones.
- `tempo_settings` is an app table, not a spec table: no change-log triggers.
- Cues (ADR 0004) and the 3D view read beat times, not these columns, so they need no change.
- Migrations are numbered after the fork's 0028. If another branch merges a migration first, these
  are regenerated with the next numbers before merging.

## Verification

- The migration rollback test (`electron/database/__test__/migrationRollback.ts`) runs 0030 and
  0029 back.
- Tempo unit tests (`src/tempo/__test__`) cover the math, tempo shapes, time signatures and
  groupings (every common time signature set and set back on several measures, singly and nested),
  and the writes.
- `tempoUndo.test.ts` covers undo and redo of:
  - pins, and a hold with its length;
  - a time signature with its measures and count lengths;
  - one 2/4 bar moving the measures after it, and 4/4 putting them back exactly;
  - the music offset, alone and with the counts it lined up.
- `tempoWrites.test.ts` covers the tempo-change flags.
- Open a v0.1.7 `.dots` file and a page-era demo in the desktop app after the migrations
  (apps/desktop/AGENTS.md).
- Owner hands-on in the lab build: a hold, a ramp, a 7/8 time signature set and set back,
  renumbering, and undoing a lead-in move.

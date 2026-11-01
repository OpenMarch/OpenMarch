---
# The lab reads this file when this branch's test build is published.
# Keep `id` stable: feedback is filed under it.
id: tempo-mode
title: Line the counts up with your music in tempo mode
summary: A Tempo button opens tempo lanes in the timeline. Fit lines the counts up with the music, and you can pin counts, hold a fermata, set meters like 7/8 and renumber measures.
status: open
questions:
  - "Did Fit to the music line the counts up with your music? Where did it go wrong, if anywhere?"
  - "When the counts were off, could you fix them by dragging a count onto its hit in the music? Did the counts around it move the way you expected?"
  - "Did you try a hold (fermata), a gradual change, a new meter or renumbering a measure? Which were easy to find, and which weren't?"
  - "When you added or removed a count, was it clear which of the three choices to pick?"
  - "Was it clear what Play would do: play from the playhead, or loop the measures you'd selected?"
  - "Editing the tempo line: could you grab what you meant to? Did moving a tempo change and making a gradual change (straight or curved) work the way you expected?"
  - "Did Undo always put back what you expected, including the music moving when Fit lined up the first hit?"
---

Tempo mode edits the counts against the music inside the timeline, the way a
tempo track works in a music app. Open a demo show (they have music) or add
your own music to a show.

**What to try**

- Click **Tempo** at the right of the timeline bar (or press Shift+T). New
  lanes open: rehearsal marks, measures, tempo and the music's waveform.
  Press **?** for the shortcuts, and **Done** or Esc to leave.
- Click **Fit to the music**. If the music starts after count 1, Fit moves
  the music so its first hit lands on count 1. Undo puts it back.
- Drag a count's handle onto a hit in the music. The count is pinned there,
  and later edits keep it in place.
- Right-click a count for more: make it a hold (a fermata), change tempo
  gradually, add or remove a count, or Fit from there.
- Click a measure's meter chip to set a meter, such as 7/8 counted 2+2+3.
- Right-click a measure number to renumber it, or a rehearsal mark to edit
  it.
- Drag along the measure row to select some measures. Fit then works on just
  those, and Play loops them until you clear the selection (click empty space
  or press Esc).
- Edit the tempo line the way a tempo track works in a music app. Only the
  line itself drags (the pointer turns to up/down over it). Double-click the
  tempo lane to add a tempo change, then drag its dot sideways to move it.
  Drag the round handle at the end of a stretch to make a gradual change, and
  further to curve it. Double-click a dot to remove that change.
- Tempo mode has one playhead and one Play: Space plays from the playhead, or
  loops the selected measures, and stops where it is. Turn on **Click** to
  hear the counts against the music.

**Good to know**

- This is a prototype. Older versions of OpenMarch play these shows at the
  same times, but don't show the meters or renumbered measures.
- Fit can lose the beat at a sudden change, a fermata or an odd meter. It
  stops there and tells you; right-click that count and Fit from there.

---
# The lab reads this file when this branch's test build is published.
# Keep `id` stable: feedback is filed under it.
id: tempo-mode
title: Line the counts up with your music in tempo mode
summary: A Tempo button opens tempo lanes in the timeline. Drag counts onto the music to line them up, edit the tempo line, pin counts, hold a fermata, set meters like 7/8 and renumber measures.
status: open
questions:
  - "Could you line the counts up by dragging a count onto its spot in the music, with the metronome on? Did the counts around it move the way you expected?"
  - "Did Tap tempo give you the tempo you expected? Was Use (putting it on the selected counts) where you looked for it?"
  - "Did you try a hold (fermata), a gradual change, a new meter or renumbering a measure? Which were easy to find, and which weren't?"
  - "When you added or removed a count, was it clear which of the three choices to pick?"
  - "Was it clear what Play would do: play from the playhead, or loop the measures you'd selected?"
  - "Editing the tempo line: could you grab what you meant to? Did moving a tempo change and making a gradual change (straight or curved) work the way you expected?"
  - "Could you make a rit. that goes straight back to the old tempo (a tempo)? Which way did you use: the end square or the A tempo menu item?"
  - "Did Undo always put back what you expected, including the music moving when you dropped a spot on count 1?"
---

Tempo mode edits the counts against the music inside the timeline, the way a
tempo track works in a music app. Open a demo show (they have music) or add
your own music to a show.

**What to try**

- Click **Tempo** at the right of the timeline bar (or press Shift+T). New
  lanes open: rehearsal marks, measures, tempo and the music's waveform.
  Press **?** for the shortcuts, and **Done** or Esc to leave.
- Turn on **Metronome** and play. Drag a count's handle (the triangle at the
  top of the music) onto the hit you hear for it. The count is pinned there,
  and later edits keep it in place. Drag the first hit onto count 1 to move
  the music instead; Undo puts it back.
- Click **Tap tempo** (or press T) and tap along on each beat to see how fast
  the music is. Select some measures first, and **Use** puts that tempo on
  them.
- Right-click a count for more: make it a hold (a fermata), change tempo
  gradually, or add or remove a count.
- Click a measure's meter chip to set a meter, such as 7/8 counted 2+2+3.
- Right-click a measure number to renumber it, or a rehearsal mark to edit
  it.
- Drag along the measure row to select some measures. Right-click them to
  set their tempo, and Play loops them until you clear the selection (click
  empty space or press Esc).
- Edit the tempo line the way a tempo track works in a music app. Only the
  line itself drags (the pointer turns to up/down over it). Double-click the
  tempo lane to add a tempo change, then drag its dot sideways to move it.
  Drag the small square at the end of a stretch to set the tempo it ends on,
  then the round handle in the middle to curve it. Double-click a dot to
  remove that change.
- Try a rit. then a tempo: drag a stretch's end square down so it slows and
  then jumps back, or make a long gradual change, right-click a count inside
  it and choose **A tempo**.
- Tempo mode has one playhead and one Play: Space plays from the playhead, or
  loops the selected measures, and stops where it is.

**Good to know**

- This is a prototype. Older versions of OpenMarch play these shows at the
  same times, but don't show the meters or renumbered measures.
- Nothing listens to the music for you yet: lining up is by ear and eye.
  Finding the beat automatically will come back later as its own test.

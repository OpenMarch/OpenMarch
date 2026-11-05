---
# The lab reads this file when this branch's test build is published.
# Keep `id` stable: feedback is filed under it.
id: tempo-mode
title: "Edit your music: add it and line the counts up with it"
summary: An Edit music button opens music lanes in the timeline. Add or switch the music file there, set the tempo by typing it or dragging the tempo line, add gradual changes and holds, set time signatures like 7/8, renumber measures and add rehearsal marks, before or after your pages.
status: open
questions:
  - "Could you get the counts to sit on the music, with the metronome on? What did you use: typing a tempo, dragging the line, Tap tempo or the music offset?"
  - "Did Tap tempo give you the tempo you expected? Was Use where you looked for it?"
  - "Did you try a hold (fermata), a gradual change, a time signature or renumbering a measure? Which were easy to find, and which weren't?"
  - "Editing the tempo line: could you grab what you meant to? Did moving a tempo change and making a gradual change (straight or curved) work the way you expected?"
  - "When you added or removed counts or a measure, did the result match what you expected?"
  - "Could you set the tempo before writing any pages, or past your last page?"
  - "If you tried Import > MusicXML score: did the counts, measures and marks match your score?"
  - "The Music sidebar is gone: did you find where to add, switch or delete the music? Where did you look first?"
  - "Did Undo always put back what you expected?"
---

Edit music holds the show's music inside the timeline: the music file, and
the counts lined up against it, the way a tempo track works in a music app.
Open a demo show (they have music), or add your own music there.

**What to try**

- Click **Edit music** at the right of the timeline bar (or press Shift+T).
  New lanes open: rehearsal marks, measures, tempo and the music's waveform.
- The music file's name is in the header, after "Editing music": click it
  to switch to another audio file, import one or delete it. With no music
  yet, click **Add music…** there.
  Press **?** for how it works, and **Done** or Esc to leave.
- Turn on **Metronome** and play, to hear whether the counts sit on the music.
  Zoom with the − and + buttons, Ctrl/⌘+scroll or Fit.
- Click a tempo number (♩120) to type a tempo. Type "120-90" for a gradual
  change.
- Drag the tempo line up or down. Double-click the tempo lane to add a tempo
  change, then drag its dot sideways to move it. Drag the small square at the
  end of a stretch to set the tempo it ends on, and the round handle in the
  middle to curve it. Double-click a dot to remove that change.
- Click **Tap tempo** (or press T) and tap along on each beat. Select some
  counts first (drag along the measures or the music), and **Use** puts that
  tempo on them.
- To line count 1 up with the music, choose **Music offset…** in the music
  file's menu and type how many seconds after count 1 the music starts
  (negative skips into the music). The clock shows the time as you drag the
  playhead.
- Right-click a count for more: make it a hold (a fermata) and set its length,
  change tempo gradually, or add or remove counts.
- Right-click a measure to set its time signature (such as 7/8 counted
  2+2+3), renumber it, add a rehearsal mark, or add or remove a measure.
  Double-click a measure number to renumber it, or a mark to rename it, and
  drag a mark to move it.
- Tempo editing works past your last page too, so you can set the tempo
  before writing any pages. A show with no measures shows 4/4 from count 1.
- Choose **Import > MusicXML score…** to take the tempos, time signatures,
  measures and rehearsal marks from a score. It says what it replaces first; your
  pages and drill stay on their counts, and Undo puts it all back.
- The Music sidebar is gone: the music file is in Edit music now.

**Good to know**

- This is a prototype. Older versions of OpenMarch play these shows at the
  same times, but don't show the time signatures or renumbered measures.
- Nothing listens to the music for you yet: lining up is by ear and eye.

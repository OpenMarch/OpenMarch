<!-- cspell:disable -->

# Pathways: prototype round 3 findings

2026-11-03. Prototype `/mnt/data/pathway-proto/proto.html` (round 3; 24 selftests pass), testing
[UX sheet](ux-sheet.md) draft 3 hypotheses H-13 to H-19. Four simulated designers (Rosa, Marcus,
Priya, Dana; brief `/mnt/data/ux-sim-pathways/BRIEF-r3.md`, about 35 runs each) and one simulated
marcher (Jordan, 16, trumpet; brief `/mnt/data/ux-sim-pathways/marcher-r3/BRIEF.md`) reading three
teaching sheets. Notes and screenshots under `/mnt/data/ux-sim-pathways/<name>/r3/`.

## Results

| Task                               | Rosa          | Marcus        | Priya               | Dana          |
| ---------------------------------- | ------------- | ------------- | ------------------- | ------------- |
| T1 Gate 90° then 270°              | done          | done          | done                | done          |
| T2 Gate on the middle              | done          | partly        | done                | done          |
| T3 Which way (↺)                   | done, 2nd try | done, 2nd try | done, 2nd try       | done, 2nd try |
| T4 Open into a circle; collisions? | partly        | done          | partly              | partly        |
| T5 Spin downfield; step changes    | partly        | partly        | partly              | done          |
| T6 Snake with a bend, 4 → 6 spots  | partly        | partly        | partly              | partly        |
| T7 Who follows                     | done          | done          | done                | done, 2nd try |
| T8 Hand it to a student            | partly        | partly        | done, half readable | partly        |

## What held

- **H-13 (typing an angle turns the end shape): held, 4 of 4.** Typing 270 on the gate gave the
  line they meant, first time. "Click Turn, type 270, done" (Marcus). The end shape's label
  following the angle tied them together (Priya).
- **H-14 (the pivot stays put): held, 4 of 4** with a plain drag. Three dropped it on the 50 between
  T4 and T5; Dana: "it just did it, and I said 'oh!' out loud". Marcus's drag snapped onto T5 when he
  wanted between T4 and T5.
- **H-17 count half:** changing 4 → 6 spots kept the lead-out (4 of 4).
- **H-18:** the amber Big steps / Steps change labels and their tooltips were the most trusted text
  (4 of 4): "exactly the warnings I give my kids" (Rosa).
- **Who follows (round 2 finding 5): fixed.** Blue and orange rings with "Own path" / "Follows the
  group path" answered T7 for all four.
- **Collision display**, once seen: the chip, red ticks and the list with counts and inches
  ("better than what I use now", Marcus).
- **Teach header line:** "Gate turn ↻ 90° around the pivot · steady: 6 to 5" is what all five would
  give a student.

## Findings, most serious first

1. **↺ changed the amount (4 of 4).** All read ↻ and ↺ as direction with the same amount: ↻ 270 →
   ↺ 270. The prototype kept the end spots, so ↺ gave ↺ 90 (and ↺ 351.4° from ↻ 8.6°, with Big
   steps). All four had to retype. The toast then stayed up with the stale number (Rosa, Dana).
   Priya also asked to type −270.
2. **Follow can't bend (4 of 4); the pen on a Follow leader broke the move (3 of 4).** A sideways
   drag only re-aims a straight lead-out. The pen then switched the leader to Drawn: "Mixed", 18
   and then 66 collisions (Rosa). "Half of what I write" (Marcus). Nobody asked for a new control;
   they reached for the pen.
3. **The teaching table isn't teachable (5 of 5, incl. the marcher).** The table of quarter steps
   "from centre" was ignored or rejected. Jordan marched "the shape, not the numbers". Wanted: a
   small picture with 4–5 counts on it, yard-line and hash wording, the pivot named by person ("pivot
   on T8"), facing, and one plain step line ("start small, get bigger", "basically mark time 25–28").
   **And the header described the group, not the marcher**: on the travelling spin, "Turn ↻ 360°
   while travelling" didn't match T1's own path, a hill with a stall, so Jordan distrusted both.
   On the spiral Jordan couldn't tell whose clockwise ↻ meant.
4. **Silence about collisions (3 of 4).** Where nobody collided (box → circle) there was no sign the
   check ran: "I couldn't tell 'no collisions' from 'not checked'". All three looked for it in T4.
5. **Turn moved the end shape, then Straight kept it (Marcus).** After typing an angle on the circle,
   switching back to Straight left the end turned; the inner four marched through the middle (88
   collisions). Call A is right while Turn is chosen, but leaving Turn should offer to put the end
   back.
6. **Steps change named the wrong marcher (4 of 4).** Its tooltip listed T7's counts (the worst
   member) even with T1 selected, cut off with "…". Nobody could get one marcher's counts.
7. **Alt-drag on the pivot was unreadable (3 of 4).** Two crosses joined by a dashed line, no labels;
   Priya understood only later in the travel scene. Marcus reports playback still turning on T5
   after the Alt drag (not yet verified).
8. Smaller:
   - no tooltip or cursor on ✛ (3 of 4);
   - Turn's first values look arbitrary: 90°, 0° and 8.6° (the fit) on three scenes (Priya, Dana);
   - Paths "Selected" hides everything once nothing is selected (Marcus, Priya);
   - choosing Drawn dropped Marcus into the pen, so his deselect click became a corner;
   - the Follow "Leader" tag and an empty ring at the other end didn't say which end leads (Rosa).

## Proposals

1. **↻ and ↺ keep the amount; the end shape turns to match** (as typing does, call A). ↻ 270 →
   ↺ 270. Typing −270 means ↺ 270. With loose-dot ends, keep today's behaviour and its toast. Clear
   the toast when the value changes. _(Owner call.)_
2. **The Path pen draws a Follow move's lead-out.** With Follow chosen, the pen draws the leader's
   exit trail; everyone follows it, and the count slides along it as before. The sideways drag on the
   leader stays as a quick straight aim. _(Owner call.)_
3. **Teach becomes a card, not a table.** _(Owner call.)_
   - The marcher's own how-line: the turn only when the marcher really turns ("Gate turn ↻ 90°, pivot
     on T8"); otherwise their own path ("Curve to the front, nearly stop on 25–27, then on to the
     right").
   - A small picture of their path with 4–5 checkpoints (start, turns, stops, end).
   - Yard-line and hash wording ("2 outside the 45, 4 behind front hash"), the pivot by name, facing,
     and ↻ as "clockwise as the audience sees it".
   - One plain step line ("steady 6 to 5"; "start small, get bigger"; "mark time 25–27").
   - The full count list stays one tap away.
4. **"No collisions" is shown.** The chip reads "No collisions · checked every step" when the check
   runs clean.
5. **Leaving Turn offers the end back**: "End shape stays turned 81° · Restore".
6. **Steps change for the selected marcher**, with the full list of counts in the tooltip.
7. **The travelling pivot's crosses are labelled** "start" and "end", with a tooltip; verify Marcus's
   report that playback ignores the Alt drag.
8. Small: ✛ tooltip and grab cursor; the pivot snaps to the midpoint between two neighbours as well
   as to marchers; Paths "Selected" shows the last selection's paths faintly when nothing is
   selected; Turn's first value shows as "↻ 9° (to match the end)" when it comes from a fit; the
   leader end is labelled "Leader" and the other end "Last".

Proposals 4 to 8 follow from the findings without new design questions.

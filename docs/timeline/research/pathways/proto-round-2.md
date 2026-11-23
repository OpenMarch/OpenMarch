<!-- cspell:disable -->

# Pathways prototype, round 2: simulated users

Date: 2026-11-03. Prototype: `/mnt/data/pathway-proto/proto.html` (UX sheet draft 2, turns, whole-turn
snapping and the linked pivot of draft 4 §3.6.6). Same four simulated users as round 1, eight tasks
(run, together, double time, snake, rotating box, gate, open into a circle, spin downfield).
Screenshots: `/mnt/data/ux-sim-pathways/<name>/r2/`. Simulated users report behaviour, not preference.

## Results

| Task                            | Rosa                         | Marcus                  | Priya                          | Dana                          |
| ------------------------------- | ---------------------------- | ----------------------- | ------------------------------ | ----------------------------- |
| T1 run                          | done                         | done                    | done                           | done                          |
| T2 together + one member        | done (who follows: partly)   | done (partly)           | partly                         | done (partly)                 |
| T3 double time                  | done                         | done                    | done                           | done                          |
| T4 snake to one side            | done after tries             | partly                  | mostly                         | partly                        |
| T5 rotating box ¾ turn, then +1 | done after 3 tries           | done via a refusal      | done after a detour            | done the hard way             |
| T6 gate, then middle pivot      | end: done; middle: confusing | same                    | same                           | same                          |
| T7 box opens into a circle      | partly                       | done                    | done                           | done                          |
| T8 spin downfield               | done; wouldn't write it      | done; wouldn't write it | done; "a short feature moment" | done; "not for middle school" |

## Round 1 fixes: held

- **Pen banner** (H-7): 4 of 4 read it and drew curves first time; "Drawing for N marchers" reassured.
- **Steps per count + "32 steps"** (H-8): 4 of 4 did double time and knew it worked.
- **Amber "Big steps"** (H-9): read as step size, not an error. But "3 to 5" read backwards by two (a
  bigger turn shows a smaller number), and it still doesn't say what to do (Dana).
- **Turn found it** (H-11): 4 of 4 chose Turn; the gate about the end marcher was instant for all.
- **Spiral into a circle** (H-12): liked ("made me grin"); crossings visible to the eye, see finding 4.

## Findings, most serious first

1. **Typed angles were refused (4 of 4).** Typing 270 snapped to 360 (or 90 to 8.6°) with the
   whole-turns message. All understood it on a second read and all resented it: "when I type 270 I
   mean 270". Three asked for the same fix: **typing an angle should turn the end shape to match**.
   (Draft 4 §3.6.6 found the math; the UI must act on it, not explain it.)
2. **Moving the pivot to the middle of the gate (4 of 4)**: everyone expected a gate pivoting on its
   middle, i.e. the middle stays put and the **end spots move**. The linked pivot instead kept the end
   spots and made the pivot travel; the line slid and the end marchers hooked backwards
   (`marcus/r2/t6run/10-wait.png`). Drill writers mean "the point that stays put" by pivot.
3. **The ↻ button** read as "add a turn" or as the current direction; it flips to the other way
   (90 → −270). Priya never got ↻ 360 from it.
4. **No collision warning (4 of 4)**: T4 onto T3, T6 through T7's spot, T13/T14 at the top of the
   circle. "The one thing I actually need it to catch." (Prototype gap; the app has collision
   detection, ADR 0009 / #226, which must run along routes and turns.)
5. **Who follows the group path (3 of 4)**: with nothing selected only an unexplained orange ring;
   no paths shown. Needs O-20's Off / Selected / All switch and a tooltip ("Own path").
6. **Follow: dragging the leader also changed the spot count; retyping the count cut the bend off
   (3 of 4).** Bending and counting must be separate: the exit keeps its shape and the count slides
   along it.
7. **Spin downfield (T8)**: works and reads, but 4 of 4 wouldn't write it as is (cusps, stalls,
   6 to 5). It stays an option; nothing to change.
8. Smaller: Drawn with one marcher of a group selected didn't open the pen (Marcus, Dana); clicking
   one marcher inside a selection kept all 16 (Rosa; select-on-release fixes it); two readouts for
   one rotation ("End shape · −90°" vs "Turn ↻ 630°"); the yellow knob in the circle task dropped
   where released without snapping visibly (Dana).

## Proposals

1. **Typing (or winding) an angle turns the end shape** when the end is a shape: the end recipe's
   rotation becomes start + typed angle, the end spots move with it, and the turn is exactly what was
   typed. For loose dots with no end shape, keep the snap and its message. (Model: §3.6.6, a typed
   angle writes the recipe; `turn_shapes` stays.)
2. **The pivot is the point that stays put.** Dragging it, with an end shape, moves the end shape so
   the pivot stays where it was dropped (the angle is kept). Holding Alt keeps the end spots and lets
   the pivot travel (today's linked pivot). Without an end shape, the pivot travels.
3. Replace the ↻ toggle with a two-button **↻ | ↺** choice beside the number.
4. Collision checks along paths and turns, on by default in the timeline, as already planned.
5. O-20's path switch and an "Own path" tooltip on the ring.
6. Follow: the leader's sideways drag bends the exit; the spots box and dragging along the trail
   change the count; the exit shape is kept.
7. Small fixes in finding 8; a step tooltip that says what to do.

<!-- cspell:disable -->

# Pathways prototype, round 1: simulated users

Date: 2026-11-02. Prototype: `/mnt/data/pathway-proto/proto.html` (throwaway, built from the
[UX sheet](ux-sheet.md) draft 1). Four simulated users, each in character, with the same five tasks
(run, midset, formation plus one member, snake, double time). They never saw the sheet or the code.
Screenshots: `/mnt/data/ux-sim-pathways/<name>/rN/`. Simulated users report behaviour, not
preference; weigh them as a cheap first pass before real testers.

| User   | Profile                                             |
| ------ | --------------------------------------------------- |
| Rosa   | High school director, mouse, no Figma               |
| Marcus | Professional drill writer, 15 years, keyboard-heavy |
| Priya  | Visual designer, Figma and After Effects daily      |
| Dana   | Middle school director, low computer confidence     |

## Results by task

| Task                             | Rosa                                | Marcus                 | Priya                  | Dana                               |
| -------------------------------- | ----------------------------------- | ---------------------- | ---------------------- | ---------------------------------- |
| T1 run (curvy path, one marcher) | partly (zigzag; curves by accident) | done, but angular      | done                   | partly (curves after double-click) |
| T2 midset, then retime           | done                                | done                   | done                   | done                               |
| T3 formation + one member        | partly                              | done after a detour    | done after fiddling    | done after a wrong turn            |
| T4 snake out to one side         | partly (couldn't bend the exit)     | partly (same)          | partly                 | mostly                             |
| T5 double time                   | done                                | partly (saw no change) | partly (saw no change) | partly (saw no change)             |

## Hypotheses

| #   | Hypothesis                                                           | Result                                                                                                                                                                           |
| --- | -------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| H-1 | They find the Path pen and draw a flutter                            | **Found by all 4.** Curves (press-drag) found only by the Figma user; the rest got zigzags                                                                                       |
| H-2 | "Playhead on a count, drag the dot" reads as "be here on this count" | **Held for the one who tried it** (Marcus: "better than the software I've used for 15 years"). The other three pinned through the right-click menu                               |
| H-3 | Pin ticks on the clip read as pinned counts and retime by drag       | **Held, 4 of 4.** The strongest part of the prototype                                                                                                                            |
| H-4 | Follow, then dragging the leader, works without a dialog             | **Mostly held.** All four got a working follow the leader. All who tried expected dragging the leader sideways to bend the exit; it didn't. The leader end wasn't obvious to two |
| H-5 | Formation vs own route is clear at a glance                          | **Held while selected** (orange ring and lane). With nothing selected no paths show                                                                                              |
| H-6 | "Double, Triplet" match their vocabulary                             | **Failed.** 3 of 4 read Double as "faster" and saw nothing change; it means steps per count                                                                                      |

## Findings, most serious first

1. **"Turn with path" on by default wrecked every formation (4 of 4).** The block spun and crushed
   (dana `r16/08-wait.png`); all four switched it off and were happy. Cause, in the model, not the
   prototype: offsets turn with the path, but members still end on their own end spots, laid out
   unturned, so the last legs twist back. "Turn" only looks right when the end shape is turned to
   match the path's end heading. **Proposal: Slide by default; Turn is the option** (reverses
   O-12a; owner call).
2. **Red step labels scared three of four.** "6.1 to 5" in red read as an error; only Rosa worked out
   it was step size. Nobody knew what to do. **Proposal:** plain words and a calmer colour: "Big
   steps · 6 to 5" in amber, on the worst leg only, with the tooltip "Steps bigger than 8 to 5 at
   this time. Lengthen the move, use double time, or shorten the path."
3. **Double time "did nothing" (3 of 4).** The words promise speed. **Proposal:** call the control
   **Steps per count** with `1 · 2 · ½ · 3 in 2`, and show the step count on the clip ("32 steps").
   The step dots on the path already change; make them visible by default on the selection.
4. **The pen drew for the wrong marchers (Rosa, Dana, Marcus).** Clicking one marcher inside a
   16-marcher selection kept all 16, and the next stroke replaced everyone's path, including earlier
   own paths, with no notice. A pen stroke starting on another marcher switched who it drew for.
   **Proposal:** the pen chip names who it draws for ("Drawing for 16 marchers"); clicks on
   marchers while drawing add points and never change the target; replacing own paths shows "Replaced
   2 own paths · Undo".
5. **Curves were undiscoverable (3 of 4).** **Proposal:** the pen chip says "Click for corners ·
   drag for curves". No new control.
6. **Path choices overwrote each other (Marcus).** Arc on the move wiped T4's own path; Drawn on T4
   wiped the group's Arc. The clip label ("Drawn") hid that the move was mixed. **Proposal:** the
   path choice applies to the selection, and shows **Mixed** when the selection differs.
7. **The snake's exit couldn't be bent (all who tried).** Everyone dragged the leader sideways.
   **Proposal:** dragging the leader along the trail advances; dragging it **off** the trail draws the
   exit live, with everyone following (the owner's O-27 idea, now with evidence). Mark the leader
   with the word "Leader" on the handle.
8. **Pinning was hidden in a right-click (Dana, Rosa).** **Proposal:** selecting a route point shows
   it on the Move card: **Point · Count [8] · Corner / Smooth**. A contextual row, no menu.
   Marcus asked for the same numeric field.
9. **Choosing Drawn silently switched tools (Dana, Marcus).** Keep it, but the chip should say why:
   "Draw the path: click for corners, drag for curves, Enter to finish".
10. **No paths with nothing selected (Priya).** Already decided (O-20: Off / Selected / All switch).
    The prototype didn't have it.

Prototype artefacts, not findings: the playhead stopping where playback stopped (the app returns
to where Play was pressed, UI-24); the stale "Pinned to count 8" toast after retiming.

## What clicked (keep)

- Pin, tag on the field, tick on the clip, drag the tick to retime (4 of 4).
- Figma-style pen for the one who knew it; double-click corner ↔ smooth.
- Slide formations with the band drawn as one hull.
- Orange ring and "Own routes: 1 · Rejoin".
- Follow with a "spots" box: "it behaves like follow the leader".

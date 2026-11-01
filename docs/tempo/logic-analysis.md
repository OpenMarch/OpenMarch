<!-- cspell:disable -- product names from the research -->

# Tempo mode against Logic Pro: what we're missing and what to build

Written 2026-10-31, after the owner's hands-on feedback on the first tempo mode prototype (fork PR
#550). Facts about Logic come from [logic-tempo-research.md](logic-tempo-research.md), which cites
Apple's guide for each one; the wider DAW survey is [daw-research.md](daw-research.md).

## Decided (2026-11-01)

- **Storage:** not B as first written below. The show stores only where tempo changes start
  (`beats.tempo_change`, ADR 0007 amendment). The shape between two changes is read back from the
  count lengths (`tempo/tempoShape.ts`). Count lengths in seconds stay the only tempo data: no BPM
  storage and no stored tempo graph.
- **Built on fork PR #550:** A (grab only the line, cursors, a tag while dragging), points
  (double-click to add or remove, drag up/down or sideways, one axis per drag), curve handles
  (straight or curved ramps, double-click for a jump), and Fit placing points.
- **Next, after the owner's lab check:** D, the seconds view, starting with a throwaway prototype.

## Measures are optional (owner, 2026-11-01)

- A show doesn't need measures at all: someone can turn them off and work in counts only.
- A show with measures can have stretches with none (a voiceover, a break), and measures carry
  on after. Numbering continues across the gap.
- No separate "pause" kind: a fermata stays one held count inside a measure.
- Storage idea: `beats.include_in_measure` is already in the file format and read by nothing.
  `0` on a stretch of counts = no measures there. Open: how counts in a measureless stretch are
  named in the UI (absolute count, "ct 37"?), and what the measure row and meter chips show there.

## The owner's feedback

1. The cursor should change to up/down over the tempo line, and only the line should drag. Today a
   press anywhere in the tempo lane drags tempo, which causes accidental edits.
2. Logic does this better: drag the line to move the tempo; points you can drag, with linear or
   curved changes between them.
3. Is the music shown in constant time or normalised to the tempo (what we do now)? Maybe tempo
   editing should offer pixels = seconds, or have it as a setting.
4. It feels limited and half-built.

## What we have today

| Part                | Today                                                                                                                                                                                                                                                                        |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **What's stored**   | One length per count (`beats.duration`), plus pins and holds (ADR 0007). No tempo points.                                                                                                                                                                                    |
| **What's drawn**    | `tempoSegments` (`tempoMath.ts`) guesses runs from the lengths: counts within 1.2 BPM are one steady run, a steady step is a ramp, anything else is "uneven". The guess changes as you edit, so what you grabbed can be split or merged after the edit.                      |
| **Hit zones**       | Any press in the 76 px tempo lane grabs the run under the pointer, whatever its height (`TempoBand.tsx`, `onPointerDown`). No cursor change, no hover state.                                                                                                                 |
| **Drag**            | Vertical only: scales that run's lengths by one factor. Shift = 0.1 BPM steps.                                                                                                                                                                                               |
| **Points / curves** | None to grab. A ramp exists only if you double-click and type "120-90", and it's linear.                                                                                                                                                                                     |
| **Scale**           | Auto-fitted to the show's range plus padding; can't be set; a drag past it clamps visually.                                                                                                                                                                                  |
| **Axis**            | Counts are evenly spaced (`pixelsPerBeat`, used by 21 files across the timeline). The waveform stretches and slides under the counts as you edit.                                                                                                                            |
| **Strength**        | The music side is ahead of Logic's tempo track: Fit, dragging a count onto a hit, pins and holds. That's Logic's Beat Mapping and Smart Tempo Editor folded into one lane, and it's what lining up drill needs. The weak part is the tempo lane as a thing you edit by hand. |

## How Logic's tempo track works

- **The data is sparse points.** A tempo point is a position and a BPM. Between two points the tempo
  is a step (held until the next point) or a curve. A curve is written out as hidden step events at
  the track's Snap value (1/16 = four per quarter); the user only ever handles the two points and
  the curve node.
- **Drawn as a step line with a filled area under it.** A vertical riser at each change. Two dots per
  change: the filled point at the new value and a small hollow **curve node** at the old value, at
  the other end of the riser. The BPM is printed beside each point when the lane is tall enough.
- **Only three things drag**: a point, the line to the right of a point, and the curve node. A
  single click on empty lane space with the normal tool doesn't create anything. Double-click empty
  space adds a point; double-click a point deletes it. Single-click creation needs the Pencil tool,
  a deliberate switch.
- **Each drag locks to one axis**: value or time, never both. Apple calls this out as the rule "to
  prevent unintentional changes".
- **Dragging the line** changes the tempo of that step, leaving later points at their BPM. (Later
  music still moves in time, since the bars before it got faster or slower.)
- **Dragging a point sideways** moves where the change happens. Option-drag copies.
- **Curves on the Mac**: select both points, then drag the corner node to bend the step; the node
  then reshapes it continuously from linear to convex or concave. On iPad the node is always shown
  and works without selecting first. Double-click the node to go back to a step.
- **Help tags** show the BPM (and position, for a new point) during every drag.
- **The scale**: drag or type its min/max. Older Logic and the iPad grow the range when you drag
  past it instead of clamping.
- **Time base**: Logic's Tracks area spaces bars evenly; a recording that ignores tempo widens and
  narrows on screen as the tempo under it changes. Pro Tools and Cubase let you switch the whole
  edit window between even bars and even seconds (Logic 9 could too). REAPER is spaced by time.
- **Beat Mapping is a separate track**, and Apple says not to hand-edit the tempo track after beat
  mapping, because the mapped beats become one tempo point each. Logic never solved "hand-edit a
  tempo that was fitted to audio"; it keeps them apart.

Unconfirmed from the sources: the cursor over a segment (Apple's figures only show a pointing hand
over the curve node), and what Shift does in current builds (finer values or horizontal only).

## Where we fall short, by the owner's points

**1. Accidental edits.** Logic only drags from three small targets and locks each drag to one axis.
We take the whole lane. This is the cheapest fix and needs no data change.

**2. Points and curves.** This is the real gap, and it isn't a UI gap: we don't store points. Every
"segment" is a guess from the count lengths, so there is nothing stable to put a point on, and a
curve has nowhere to live except as a pattern in the lengths. Adding draggable points on top of
the guess would make them jump around after each edit, which is the "half-built" feeling.

**3. Time base.** We match Logic (even counts). But our case is the reverse of Logic's: the music is
fixed and the counts move to fit it. With even counts, every tempo edit makes the waveform swim,
so the thing you're aligning to moves while you look at it. With even seconds, the waveform stays
put and the count lines move onto it, which is what's really happening.

## Recommendations

### A. Hit zones and cursors (now, no data change)

| Target                                              | Hover                       | Press and drag                                                                                            |
| --------------------------------------------------- | --------------------------- | --------------------------------------------------------------------------------------------------------- |
| **The line** (within ±4 px of a horizontal run)     | `ns-resize`; run highlights | Drags that run's tempo up or down (as now). Help tag with the BPM.                                        |
| **A point** (the change between two runs)           | Point highlights            | Up/down = that run's tempo; sideways = moves the change to another count. Axis locks after 4 px.          |
| **A curve node** (hollow dot at the end of a riser) | `pointer`; node grows       | Bends the step into a ramp; see C.                                                                        |
| **Empty lane space**                                | Plain arrow                 | Click clears the selection; drag selects counts (like the measures row). **Never edits tempo.**           |
| **Double-click**                                    |                             | Empty space adds a tempo change at that count; on a point removes it; on the line types a tempo (as now). |

Plus: BPM labels at each change, a help tag while dragging, and the scale growing when a drag passes
it.

### B. Store tempo points (needs an owner decision and an ADR 0007 amendment)

Store the tempo as Logic does: a short list of **tempo changes**, each a count, a BPM and the shape
to the next one (step, or curve with a curvature). The count lengths are written from it, one length
per count, the way Logic writes a curve out as steps at its Snap value. Our "Snap" is one count.

- Durations stay in `beats.duration`, so playback, exports and older apps are untouched (ADR 0007
  point 3 still holds). The points become what tempo mode edits.
- **Fit and pins** write a fitted result. Two ways to reconcile that with points:
  1. **Fit writes points, thinned.** Fit's per-count result is simplified to the fewest changes
     within a tolerance (Logic's "Apply Smoothing … while maintaining the length"). A steady passage
     becomes one point; a rit. becomes a curve; real wobble stays as more points. Pins stay
     constraints on time, as now.
  2. **Two layers**: the written tempo (points) and the fitted counts, drawn as a thin line that
     wanders around it. Truer to the audio, but two things to explain.
  - Recommend 1. It keeps one thing on screen, and a show built from a score really is a few tempo
    markings plus rit./accel. and fermatas.

### C. Curves

- A curve node at the end of every riser, shown on hover (the iPad way; no select-two-points step).
- Drag it toward the straight line for a **linear** change, past it for a **curved** one (ease in
  or ease out). A small detent at straight, so linear is easy to hit.
- Double-click the node to go back to a step.
- The "120-90" typed form stays as the precise way in.

### D. Seconds view (pixels = seconds)

- **Recommend even seconds as tempo mode's view**, and even counts outside it. The music becomes a
  fixed picture; count lines and page flags slide over it as you edit. A linear-in-counts ramp
  draws slightly bowed, which is honest.
- Pro Tools and Cubase switch the whole edit window, not one lane, and we'd have to as well: the
  ruler, page row, playhead and drill rows all sit above the tempo lanes on the same axis.
  Everything that maps counts to pixels (21 files use `pixelsPerBeat`) would go through one
  count↔x function that tempo mode swaps.
- A setting for "always seconds" can come later, once the view exists.
- This is the largest piece. A cheaper first step is a **prototype** of the tempo lanes alone in
  seconds, to feel it before committing the whole timeline.

## Suggested order

1. **A** (hit zones, cursors, labels, help tag): small, no data change, fixes the accidental edits.
2. **Seconds-view prototype** of the tempo lanes (throwaway) to decide **D**.
3. **B + C** together, after an ADR 0007 amendment: points, curves, Fit thinning to points.
4. **D** in the whole timeline, if the prototype holds up.

## Questions for the owner

1. "Drag the whole tempo line to move the whole tempo": that run only (Logic), or every count after
   it too?
2. Store tempo points (B)? It changes what tempo mode edits and needs an ADR 0007 amendment.
3. Fit writes thinned points (B1), or show written tempo and fitted counts as two lines (B2)?
4. Even seconds as tempo mode's view (D), with the throwaway prototype first?

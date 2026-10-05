<!-- cspell:disable -->

# Ownership transfers: research handoff

Status: research, not decided. Nothing here changes `spec.md`, `ui.md` or the
implementation plan yet. Started 2026-10-04 in a lead session and moved to a
remote machine mid-conversation; this file is the conversation state.

## How it started

Adding marchers over a dragged range [9, 21) was refused with
"F1 is in a timeline over beats [1, 17), which only partly overlaps [9, 21)"
([image](images/0-partial-overlap-error.png)). The refusal is the UI-9 Layers
rule in `apps/desktop/src/db-functions/timelineMembership.ts`
(`partlyOverlaps`), not the database or resolver. Pages aren't the issue:
they're only flags on top of timelines, though users treat them as timelines.

## What the project owner wants

1. A group moves forward 16 steps in unison over 16 counts.
2. On count 8 the outer marchers change to a sideways move (they leave the
   group move; the new move may run past the group move's end).
3. The 16-count move stays one block of logic: editing its destination
   behaves as if ALL marchers still go there, even though some leave on
   count 8, and the split keeps working. No need to define two moves.
4. When a transition is selected or in focus, show its context: the previous
   dots and the pathways of all its marchers, with "ghost" dots and paths
   for the parts some marchers never perform.
5. Marchers can also JOIN a larger timeline mid-way.

Mockups:

- [Scenario 1, steal-out](images/1-steal-out.png): the outer 4 leave green
  (yellow) and green's remainder for them is drawn gray. Yellow crosses
  green's end on the timeline strip.
- [Scenario 2, join-in](images/2-join-in.png): joiners merge into green
  mid-way; green has gray ghost START dots for them. The left half shows
  computed, in-line ghost starts; the right half shows arbitrary ones.
- [Scenario 3 "fixed", exit and rejoin](images/3-exit-and-rejoin.png):
  marchers leave green (yellow), then return to green (pink) on a path the
  user defines, "to avoid a snap back". The ghost pathway is green's own
  path, so it's easily defined.

## Research done (this folder)

| File                                                             | What                                                                                                                  |
| ---------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| [01-current-model.md](01-current-model.md)                       | Today's spec and code against the scenarios, with file:line citations and the constraints a redesign must respect     |
| [02-prior-art.md](02-prior-art.md)                               | Pyware, Blender NLA, Unity/Unreal layers, Maya Time Editor ghosts, Golaem, Final Cut connected clips, Figma overrides |
| [03-hypothesis-A-layers.md](03-hypothesis-A-layers.md)           | Keep layers and steals; exit / detour / entry relationships inferred from the dragged window; notches on clips        |
| [04-hypothesis-B-restructure.md](04-hypothesis-B-restructure.md) | Per-marcher ownership segments (no layers), stored ghost origins, linked destinations; cost comparison                |

Note: agents 01 and 03 read the main checkout while it was on
`timeline/p8-17-core-loop` (P8.17 in progress), not `timeline-try-2`.

### Findings everyone agreed on

- **Steal-out already resolves correctly** once the UI-9 partial-overlap
  refusal is lifted: green L0 [0,16) plus yellow L1 [8,24) gives green to 8,
  then yellow from green's beat-8 position (R-4). Editing green's
  destination moves the split. No new data.
- **Join-in is the real gap.** Joins rebase (D-12): they head straight to
  the destination in the time left. Destinations are absolute (D-5), so
  editing green's start doesn't keep the merge. There is no ghost start.
- **Ghost paths** for marchers who start with the group are computable
  today: run a throwaway resolver without the stealing rows and sample
  `positionAt` (the pattern `sampleShape` in `timelineMoves.ts` uses).
  Nothing ghost-like is drawn on the canvas yet.
- **Gaps found:** a stolen marcher's group destination has nothing to grab
  on the canvas (ghost dots must be handles); dragging a group's end is
  refused for stolen marchers ("on a higher layer"); a steal that runs past
  green's end also steals the next move, which then rebases (catches up).
- **Prior art:** no drill tool keeps a group move editable while members
  leave or join (Pyware stores fixed positions per count). The closest
  models are Unity's masked override layers, Figma instance overrides, Final
  Cut connected clips (link to "host at frame k", never to a coordinate) and
  Maya's selected-clip-only ghosts.
- **Cost:** adding ghost origins, linked destinations and ghost rendering
  to today's model is about 1.5–2.5 weeks. Replacing layers with segments
  is about 4–6 weeks and isn't needed for either scenario by itself.

### Lead recommendation given before the owner's answers

1. Peel-off: keep the group row whole and let the peel-off override it one
   layer up (not A's trim-the-host approach, whose seams must be kept glued
   by every range edit). Lift UI-9's partial-overlap refusal.
2. Join: the joiner's move ends at a live link "host at beat j", and ghost
   starts are computed by default and draggable. Needs a spec amendment
   (D-5, D-12), resolver change and ADR.
3. Ghosts Maya-style: only for the selected move, gray, with dots per
   count; ghost dots are handles.
4. Defer the segments restructure.

## Owner's answers (2026-10-04)

1. **Peel-off running past green into the next move (blue).** The owner
   didn't see why the current-model agent called the catch-up a problem,
   and added: when we know WHEN a marcher rejoins a slot on a timeline,
   its destination should already be decided by that timeline at that
   point in time. "More like a dynamic link than a static separate
   pathway." So overrunning green = exit green, then join blue at a known
   beat, with the arrival point linked to blue's path. The rebase
   (head straight to blue's destination and speed up) is what to replace.
2. **Live link vs one-off Re-snap.** The owner didn't follow the question;
   it was asked badly. Their answer to 1 implies a live link. Confirm.
   - Live: the feeding move's destination is stored as "host at beat j"
     and recomputed whenever the host changes.
   - One-off: store coordinates, and a command re-aims them on request.
3. **Ghost starts: computed by default.** "The designer would make a
   transition as if all the marchers were in that location all along."
   Interpretation to confirm: a group move is authored as a full formation
   (origin and destination for every member). A joiner's ghost start is
   simply that member's origin in the host's authored formation, not
   something derived from the joiner's own path.
4. **Detour (rejoin green) vs exit-and-hold when yellow ends inside
   green.** The owner was unsure of the pros and cons; explain them. Their
   Scenario 3 mockup answers much of it: the return is an explicit move
   (pink) whose end is linked to green's path, which avoids the snap back
   that today's implicit resume (R-5/D-12 rebase) causes.

### Confirmed (2026-10-04, second round)

- **Live link: yes.** A move that enters a host at beat j stores its
  destination as "host's planned path for that slot at j", recomputed
  whenever the host changes. Not a one-off Re-snap.
- **Ghost starts: stored, and they follow the group.** A joiner's ghost
  start is its origin in the host's authored formation, stored per slot.
  The default is wherever the marcher stood when it changed from founder
  to joiner (the designer authored the move "as if all the marchers were
  there all along"). The user can drag it. Gestures that edit the group's
  start move the ghosts along with the founders.
- **A window ending strictly inside the host defaults to exit plus an
  automatic return.** The edit creates the exit and a default straight
  return move (pink in Scenario 3) whose end is live-linked to the host's
  path at a rejoin beat the user can drag. This replaces the implicit
  resume (R-5/D-12 rebase) as the default.

## Emerging model (lead's synthesis, not yet agreed)

The scenarios reduce to two primitives, both with links to a host path:

- **Exit at beat k:** the next move's origin is the host's position at k.
  This is R-4 today and needs nothing new.
- **Enter at beat j:** the feeding move's destination is a live link to
  the host's planned path at j. The host's ghost origin for that member
  comes from the host's authored formation.

Everything else is a combination:

- Steal-out = exit.
- Join-in = enter.
- Detour / Scenario 3 = exit then enter, replacing implicit resume.
- Overrun into the next page = exit green, then enter blue.

Open consequence: if implicit resume is replaced by explicit exit plus
enter, layers carry little meaning. That moves toward hypothesis B's
per-marcher segments. Decide whether to keep layers as the storage and
treat exit/enter as UI concepts, or to restructure.

## Round 2 plans (2026-10-04)

| File                                                 | What                                                                                           |
| ---------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| [05-link-semantics.md](05-link-semantics.md)         | Intent path, live links, rails vs rebase, acyclicity proof, failure policy (freeze), spec list |
| [06-authoring-ux.md](06-authoring-ux.md)             | Gesture → result table, join gestures, automatic return, notches, menus, undo rows, WP-O1..O6  |
| [07-ghost-rendering.md](07-ghost-rendering.md)       | What a focused move draws, tokens, ghost handles, data source, canvas integration, G0..G3      |
| [08-storage.md](08-storage.md)                       | Layers vs trims vs segments; recommends O (override storage) plus two additive tables          |
| [09-isolation.md](09-isolation.md)                   | Isolating one move: double-click entry, ghosts, the plan dot as the marcher (prototype, built) |
| [10-cross-page-windows.md](10-cross-page-windows.md) | Windows spanning existing pages: user intent, override vs clamp, the refusals to lift          |
| [VALIDATION.md](VALIDATION.md)                       | Feel-based decisions to check by hand once built; add a row for every unproven default         |

### Where the four agree

- **The link beat is never stored:** `j = feeder.end_beat` (05 §2.1, 06 §4.2, 08 §2.2). The
  rejoin-beat drag is just a range edit of the feeder's end.
- **Ghost starts are absolute rows;** "follow the group" is a write-path rule (05 GF-1, 08 §2.1,
  06 §3), using the gesture's own transform, never a fit.
- **Rails:** a span that follows an effective linked feeder evaluates the host's intent path.
  For `direct` this equals today's rebase exactly (05 §1.4, 08 §2.3), so only arcs change.
- **Layers can stay.** 08 recommends **O**: host rows stay whole, movers sit one layer up, a
  linked return makes the host's resume ride the rails. This corrects the "Open consequence"
  below: implicit resume is only bad when unlinked. No seams against the host, no table rebuild,
  legacy data unchanged, 3–4 weeks for storage + resolver + write path.
- **Two app-side steps ship first with no schema change:** lift the partial-overlap refusal for
  exits, and render read-only ghosts with a throwaway resolver (06 WP-O1/O2, 07 G0, 08 WP-0).

### Decided (owner, 2026-10-04)

- **Layers stay as the storage** (08's option O): group rows stay whole, movers sit above them,
  and deleting a mover lets the group show through again. Segments are not pursued.
- **Designers never see layers.** The app always picks the layer; no layer numbers appear
  anywhere in the UI, including the inspector. The designer works only with exits, joins,
  returns, strip notches and ghosts. This revises `ui.md` U-Q3 (layers in the inspector and as
  dashed spans) when the ui.md update is written.

### Conflicts to settle

1. **Acyclicity.** 08 says it "comes free"; 05 found a real cycle the DB accepts under layers (a
   link into a slot whose founder starts after the feeder starts) and adds **L-ACYCLIC**. Take 05.
2. **Link storage and the fallback value.** 05 assumes a `source` column on `slot_destinations`
   with a stored x,y used as seed and fallback, and "freeze" = flip to placed. 08 recommends a
   separate `timeline_links` table with no x,y, and "unlink" = delete link + insert destination.
   Take 08's table, but 05's resolver fallback needs a value: either add fallback x,y to
   `timeline_links`, or make every breaking edit freeze (05 §4 already requires that) and let
   the resolver fall back to a hold with `D-LINK-BROKEN`.
3. **Deleting a return move. Decided (owner, provisional): back to the group (08's O default).**
   Deleting pink lets green take the marcher back through the unlinked resume, so it still ends
   at green's destination and the next move's path is unchanged. Exit-and-hold stays available
   as an explicit "Hold here instead". Conditions: the catch-up must be drawn (rebase spans are
   drawn solid plus their intent as a ghost, with the step-size warning), never hidden. 06 §4.2
   "Remove return (hold there)" changes accordingly. Tracked in [VALIDATION.md](VALIDATION.md) V-1.
4. **Ghost start when the landing was placed by the user** (overrun into blue, merge into green).
   **Decided (owner, provisional): seed** where the marcher stood, as the confirmed rule says, so
   the landing snaps onto the host's path. 06's "solve" (keep the drop) is the alternative if
   manual validation shows the jump feels broken. Tracked in [VALIDATION.md](VALIDATION.md) V-2.
5. **Which dot a canvas drag edits at the host's end.** 06: when the window is the host, an exited
   marcher's real dot is inert (60%) and only its ghost drags. 07: the real marcher wins the
   click, a repeat click cycles to the ghost, and mixed real + ghost drags are allowed when
   P = F.end. Lead leaning: 06's rule (window decides) plus 07's mixed drag.
6. **Core API names.** 05: `intentAt`, `intentInfo`, `linksInto`, `SpanInfo.mode`. 07:
   `intentAt`, `slotEnds`, `links`, `SpanInfo.entry`. Merge on 05's names (it owns semantics);
   07 needs outgoing links per transition too.
7. **New risks only 05 raised:** the §8.11 bounded-range proof no longer follows for arcs onto
   linked (derived) targets, and P-12 causality must be amended (a host edit can now move a
   feeder's positions before the host starts).

### Consolidated owner questions

From all four plans, grouped; the plans' own lists have the full wording.

- **Model:** Freeze-and-notify rather
  than refuse when a host with incoming links is deleted or shortened (05 Q5)? No links into
  follow-the-leader hosts in v1 (05 Q6, 08 Q5)? "Meet the group at its destination" (j = host
  end) wanted (05 Q4)? A link whose two ends hold different marchers: warn or refuse (08 Q4)?
- **Defaults:** A window starting with the group: return or join late by
  default (06 Q1)? Rejoin default = exit length capped at host end (06 Q3)? Return per clip with
  "Split selected off" (06 Q4)? Overrun stopgap before links land: old catch-up with a warning,
  or refuse (06 Q6)?
- **Ghosts following the group:** only when all founders move uniformly, including edits made
  from the previous move's context (05 Q1–Q2, 06 Q7)? Feeders stay put when a host clip moves
  alone, freezing if they fall outside (05 Q3)?
- **Canvas:** conflict 5; hover preview with paths or dots only (07 Q1); stable move colors
  instead of start-order (07 Q2); exit beat draggable on the canvas (07 Q4); ghosts while
  playing off by default, toggle location (07 Q6).
- **Files:** keep user version 8 if this lands before P9.4, or bump to 9 (08 Q3)?

## Next steps

1. Answer the owner's open points: confirm a live link (2) and the
   ghost-start interpretation (3); explain detour vs exit-and-hold pros and
   cons (4).
2. Launch more plan agents (the owner asked to do this after the move to
   the remote machine). Candidates:
   - a design pass on the two-primitive model (exit/enter with links),
     covering resolver semantics, acyclicity of links and what happens when
     a host is shortened past a link beat or deleted;
   - the UX of creating exits, entries and returns on the strip and canvas;
   - the ghost rendering and handle spec;
   - layers vs segments as storage for this model.
     Launched 2026-10-04 with the confirmed decisions above; outputs land as
     `05-link-semantics.md`, `06-authoring-ux.md`, `07-ghost-rendering.md`
     and `08-storage.md`.
3. Then record decisions in `ui.md` (UI-9/UI-10 revision) and a spec
   amendment, per `docs/conventions/architecture-decisions.md`.
